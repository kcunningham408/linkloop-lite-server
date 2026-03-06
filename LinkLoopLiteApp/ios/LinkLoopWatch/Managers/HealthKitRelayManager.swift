import Foundation
import HealthKit

/// Reads blood glucose samples from HealthKit (written by Dexcom G7 or other CGMs)
/// and relays them to the LinkLoop server. Designed for Watch-only scenarios where
/// the warrior's iPhone is not nearby (e.g. kid at playground with cellular Watch).
@MainActor
class HealthKitRelayManager: ObservableObject {
    @Published var isAuthorized = false
    @Published var isRelaying = false
    @Published var lastRelayedDate: Date? = nil
    @Published var relayedCount: Int = 0

    private let healthStore = HKHealthStore()
    private let baseURL = "https://linkloop-9l3x.onrender.com/api"

    private var authToken: String? {
        didSet {
            if let token = authToken {
                UserDefaults.standard.set(token, forKey: "linkloop_healthkit_token")
            }
        }
    }

    private var relayTimer: Timer?
    private let relayInterval: TimeInterval = 300 // 5 minutes

    // Track last uploaded sample date to avoid duplicates
    private var lastUploadedSampleDate: Date {
        get {
            UserDefaults.standard.object(forKey: "linkloop_last_hk_upload") as? Date ?? .distantPast
        }
        set {
            UserDefaults.standard.set(newValue, forKey: "linkloop_last_hk_upload")
        }
    }

    // MARK: - Init

    init() {
        if let savedToken = UserDefaults.standard.string(forKey: "linkloop_healthkit_token") {
            self.authToken = savedToken
        }
    }

    // MARK: - Auth Token

    func setAuthToken(_ token: String) {
        self.authToken = token
    }

    // MARK: - HealthKit Authorization

    func requestAuthorization() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("[HealthKitRelay] HealthKit not available on this device")
            return false
        }

        guard let glucoseType = HKQuantityType.quantityType(forIdentifier: .bloodGlucose) else {
            print("[HealthKitRelay] Blood glucose type not available")
            return false
        }

        let typesToRead: Set<HKSampleType> = [glucoseType]

        do {
            try await healthStore.requestAuthorization(toShare: [], read: typesToRead)
            isAuthorized = true
            print("[HealthKitRelay] HealthKit authorization granted")
            return true
        } catch {
            print("[HealthKitRelay] HealthKit authorization failed: \(error)")
            return false
        }
    }

    // MARK: - Start / Stop Relay

    func startRelay() {
        guard authToken != nil else {
            print("[HealthKitRelay] No auth token, cannot start relay")
            return
        }

        guard isAuthorized else {
            print("[HealthKitRelay] Not authorized, requesting...")
            Task {
                let granted = await requestAuthorization()
                if granted {
                    startRelayTimer()
                }
            }
            return
        }

        startRelayTimer()
    }

    func stopRelay() {
        relayTimer?.invalidate()
        relayTimer = nil
        isRelaying = false
        print("[HealthKitRelay] Relay stopped")
    }

    private func startRelayTimer() {
        stopRelay()
        isRelaying = true
        print("[HealthKitRelay] Relay started (every \(Int(relayInterval))s)")

        // Fetch immediately on start
        Task { await fetchAndUpload() }

        // Then fetch on interval
        relayTimer = Timer.scheduledTimer(withTimeInterval: relayInterval, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.fetchAndUpload()
            }
        }
    }

    // MARK: - Fetch & Upload

    private func fetchAndUpload() async {
        guard let glucoseType = HKQuantityType.quantityType(forIdentifier: .bloodGlucose) else { return }

        // Query samples newer than our last upload (with a small overlap for safety)
        let startDate = lastUploadedSampleDate.addingTimeInterval(-60) // 1 min overlap
        let predicate = HKQuery.predicateForSamples(
            withStart: startDate,
            end: Date(),
            options: .strictEndDate
        )
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        do {
            let samples = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKQuantitySample], Error>) in
                let query = HKSampleQuery(
                    sampleType: glucoseType,
                    predicate: predicate,
                    limit: 50,
                    sortDescriptors: [sortDescriptor]
                ) { _, results, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                        return
                    }
                    let samples = (results as? [HKQuantitySample]) ?? []
                    continuation.resume(returning: samples)
                }
                healthStore.execute(query)
            }

            guard !samples.isEmpty else {
                print("[HealthKitRelay] No new samples to upload")
                return
            }

            // Filter out samples we've already uploaded (strictly newer than last upload)
            let newSamples = samples.filter { $0.startDate > lastUploadedSampleDate }

            guard !newSamples.isEmpty else {
                print("[HealthKitRelay] All samples already uploaded")
                return
            }

            print("[HealthKitRelay] Found \(newSamples.count) new glucose sample(s)")

            var latestDate = lastUploadedSampleDate

            for sample in newSamples {
                // Blood glucose in mg/dL
                let mgdL = sample.quantity.doubleValue(for: HKUnit(from: "mg/dL"))
                let value = Int(round(mgdL))
                let timestamp = sample.startDate

                // Determine source (Dexcom vs other CGM)
                let sourceName = sample.sourceRevision.source.name.lowercased()
                let source: String
                if sourceName.contains("dexcom") {
                    source = "dexcom"
                } else if sourceName.contains("libre") {
                    source = "libre"
                } else if sourceName.contains("medtronic") {
                    source = "medtronic"
                } else {
                    source = "healthkit"
                }

                let success = await uploadReading(value: value, source: source, timestamp: timestamp)

                if success {
                    relayedCount += 1
                    if timestamp > latestDate {
                        latestDate = timestamp
                    }
                }
            }

            // Update watermark
            if latestDate > lastUploadedSampleDate {
                lastUploadedSampleDate = latestDate
                lastRelayedDate = latestDate
            }
        } catch {
            print("[HealthKitRelay] Query failed: \(error)")
        }
    }

    // MARK: - Upload Single Reading

    private func uploadReading(value: Int, source: String, timestamp: Date) async -> Bool {
        guard let token = authToken,
              let url = URL(string: "\(baseURL)/glucose")
        else { return false }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15

        let body: [String: Any] = [
            "value": value,
            "source": source,
            "trend": "stable",  // HealthKit doesn't provide trend, server/app can infer later
            "notes": "Watch HealthKit relay"
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            print("[HealthKitRelay] Failed to encode body: \(error)")
            return false
        }

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 201 || httpResponse.statusCode == 200 {
                    print("[HealthKitRelay] Uploaded \(value) mg/dL (\(source))")
                    return true
                } else if httpResponse.statusCode == 409 {
                    // Duplicate — already exists, that's fine
                    print("[HealthKitRelay] Duplicate skipped: \(value) mg/dL")
                    return true
                } else if httpResponse.statusCode == 401 {
                    print("[HealthKitRelay] Auth expired")
                    return false
                } else {
                    print("[HealthKitRelay] Upload failed with status \(httpResponse.statusCode)")
                    return false
                }
            }
            return false
        } catch {
            print("[HealthKitRelay] Network error: \(error)")
            return false
        }
    }
}
