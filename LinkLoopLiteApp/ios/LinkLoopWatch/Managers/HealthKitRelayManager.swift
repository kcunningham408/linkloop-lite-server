import Foundation
import HealthKit

/// Uploads blood glucose samples from HealthKit to the LinkLoop server.
/// Triggered by GlucoseManager's HealthKit observer — no longer uses its own timer.
/// Designed for Watch-only scenarios where the warrior's iPhone is not nearby.
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
        guard HKHealthStore.isHealthDataAvailable() else { return false }

        guard let glucoseType = HKQuantityType.quantityType(forIdentifier: .bloodGlucose) else {
            return false
        }

        do {
            try await healthStore.requestAuthorization(toShare: [], read: [glucoseType])
            isAuthorized = true
            return true
        } catch {
            print("[HealthKitRelay] HealthKit authorization failed: \(error)")
            return false
        }
    }

    // MARK: - Fetch & Upload (called by GlucoseManager when HealthKit observer fires)

    func fetchAndUpload() async {
        guard authToken != nil else { return }
        guard let glucoseType = HKQuantityType.quantityType(forIdentifier: .bloodGlucose) else {
            return
        }

        let startDate = lastUploadedSampleDate.addingTimeInterval(-60)
        let predicate = HKQuery.predicateForSamples(
            withStart: startDate,
            end: Date(),
            options: .strictEndDate
        )
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        do {
            let samples = try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<[HKQuantitySample], Error>) in
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
                    continuation.resume(returning: (results as? [HKQuantitySample]) ?? [])
                }
                healthStore.execute(query)
            }

            let newSamples = samples.filter { $0.startDate > lastUploadedSampleDate }
            guard !newSamples.isEmpty else { return }

            print("[HealthKitRelay] Found \(newSamples.count) new sample(s) to upload")

            var latestDate = lastUploadedSampleDate

            for sample in newSamples {
                let mgdL = sample.quantity.doubleValue(for: HKUnit(from: "mg/dL"))
                let value = Int(round(mgdL))
                let timestamp = sample.startDate

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

                let success = await uploadReading(
                    value: value, source: source, timestamp: timestamp)

                if success {
                    relayedCount += 1
                    if timestamp > latestDate {
                        latestDate = timestamp
                    }
                }
            }

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
            "trend": "stable",
            "notes": "Watch HealthKit relay",
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            return false
        }

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 201 || httpResponse.statusCode == 200 {
                    print("[HealthKitRelay] Uploaded \(value) mg/dL (\(source))")
                    return true
                } else if httpResponse.statusCode == 409 {
                    return true // Duplicate, that's fine
                } else if httpResponse.statusCode == 401 {
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
