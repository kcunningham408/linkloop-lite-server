import Combine
import Foundation
import HealthKit
import WidgetKit

/// HealthKit-first glucose manager for watchOS.
/// Warriors: HKObserverQuery watches for new blood glucose samples written by Dexcom.
///           Apple wakes the app via background delivery whenever new data arrives.
/// Members:  API polling (timer-based) to view the warrior's glucose from the server.
/// WCSession pushes from iPhone are accepted as a supplementary channel but ignored
/// when HealthKit data is fresh.
@MainActor
class GlucoseManager: ObservableObject {
    // MARK: - Published State
    @Published var currentGlucose: Int? = nil
    @Published var currentTrend: String = "stable"
    @Published var lastReadingDate: Date? = nil
    @Published var stats: GlucoseStats? = nil
    @Published var recentReadings: [GlucoseReading] = []
    @Published var isLoading = false
    @Published var isConnected = false
    @Published var errorMessage: String? = nil
    @Published var activeAlertCount: Int = 0
    @Published var dataSource: String = "none" // "healthkit", "api", "push"

    // MARK: - Configuration
    private let baseURL = "https://linkloop-9l3x.onrender.com/api"
    private let healthStore = HKHealthStore()
    private let glucoseType = HKQuantityType.quantityType(forIdentifier: .bloodGlucose)!
    private let mgdLUnit = HKUnit(from: "mg/dL")

    private var authToken: String? {
        didSet {
            if let token = authToken {
                UserDefaults.standard.set(token, forKey: "linkloop_auth_token")
                isConnected = true
                sharedDefaults?.set(token, forKey: "complication_authToken")
            }
        }
    }

    var lowThreshold: Int = 70
    var highThreshold: Int = 180
    var userRole: String = "warrior"
    var linkedOwnerId: String? = nil

    private var observerQuery: HKObserverQuery?
    private var refreshTimer: Timer?
    private let sharedDefaults = UserDefaults(suiteName: "group.com.vibecmd.linkloop.watch")
    
    /// Throttle widget reloads to preserve the daily budget (~40-70/day).
    /// The widget extension now reads HealthKit directly, so reloads are
    /// just a nudge to pick up changes sooner — not the only path.
    private var lastWidgetReloadTime: Date = .distantPast
    private var lastWidgetReloadGlucose: Int = -1
    private let widgetReloadMinInterval: TimeInterval = 240 // 4 minutes
    
    /// File URL for sharing glucose data with widget extension
    private var glucoseDataFileURL: URL? {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.vibecmd.linkloop.watch") else {
            return nil
        }
        return containerURL.appendingPathComponent("glucose_data.json")
    }

    /// Reference to relay manager for uploading HealthKit data to server
    weak var healthKitRelay: HealthKitRelayManager?

    // MARK: - Init
    init() {
        if let savedToken = UserDefaults.standard.string(forKey: "linkloop_auth_token") {
            self.authToken = savedToken
            self.isConnected = true
            sharedDefaults?.set(savedToken, forKey: "complication_authToken")
        }
        if let savedRole = UserDefaults.standard.string(forKey: "linkloop_user_role") {
            self.userRole = savedRole
        }
        self.linkedOwnerId = UserDefaults.standard.string(forKey: "linkloop_linked_owner_id")
    }

    // MARK: - Auth
    func setAuthToken(_ token: String) {
        self.authToken = token
        sharedDefaults?.set(token, forKey: "complication_authToken")
        if userRole == "warrior" {
            Task { await startHealthKitObserver() }
        } else {
            startAPIRefresh()
        }
    }

    func setRole(_ role: String, linkedOwnerId: String?) {
        self.userRole = role
        self.linkedOwnerId = linkedOwnerId
        UserDefaults.standard.set(role, forKey: "linkloop_user_role")
        if let ownerId = linkedOwnerId {
            UserDefaults.standard.set(ownerId, forKey: "linkloop_linked_owner_id")
        }
        sharedDefaults?.set(role, forKey: "complication_role")
        if let ownerId = linkedOwnerId {
            sharedDefaults?.set(ownerId, forKey: "complication_linkedOwnerId")
        }
        if role == "warrior" {
            stopAPIRefresh()
            Task { await startHealthKitObserver() }
        } else {
            stopHealthKitObserver()
            startAPIRefresh()
        }
    }

    // MARK: - HealthKit Authorization
    func requestHealthKitAuthorization() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        do {
            try await healthStore.requestAuthorization(toShare: [], read: [glucoseType])
            return true
        } catch {
            print("[GlucoseManager] HealthKit auth failed: \(error)")
            return false
        }
    }

    // MARK: - HealthKit Observer (Primary for Warriors)

    /// Start observing HealthKit for blood glucose samples. Apple wakes the app
    /// via background delivery whenever Dexcom writes a new reading.
    func startHealthKitObserver() async {
        guard userRole == "warrior" else { return }

        let authorized = await requestHealthKitAuthorization()
        guard authorized else {
            print("[GlucoseManager] HealthKit not authorized, falling back to API")
            startAPIRefresh()
            return
        }

        stopHealthKitObserver()

        // Enable background delivery — Apple wakes us when new BG samples arrive
        do {
            try await healthStore.enableBackgroundDelivery(for: glucoseType, frequency: .immediate)
            print("[GlucoseManager] Background delivery enabled for blood glucose")
        } catch {
            print("[GlucoseManager] Failed to enable background delivery: \(error)")
        }

        // Observer query — fires whenever new BG samples are added to HealthKit
        let query = HKObserverQuery(sampleType: glucoseType, predicate: nil) {
            [weak self] _, completionHandler, error in
            guard error == nil else {
                print("[GlucoseManager] Observer error: \(error!)")
                completionHandler()
                return
            }
            // CRITICAL: Call completionHandler immediately so HealthKit reschedules
            // the observer. If deferred until after async work, the system assumes
            // we're still processing and stops delivering future updates.
            completionHandler()
            Task { @MainActor [weak self] in
                await self?.fetchHealthKitSamples()
            }
        }

        healthStore.execute(query)
        observerQuery = query
        print("[GlucoseManager] HealthKit observer started")

        // Fetch current data immediately
        await fetchHealthKitSamples()
    }

    func stopHealthKitObserver() {
        if let query = observerQuery {
            healthStore.stop(query)
            observerQuery = nil
        }
    }

    // MARK: - Fetch HealthKit Samples

    private func fetchHealthKitSamples() async {
        let predicate = HKQuery.predicateForSamples(
            withStart: Date().addingTimeInterval(-3 * 3600),
            end: Date(),
            options: .strictEndDate
        )
        let sortDescriptor = NSSortDescriptor(
            key: HKSampleSortIdentifierStartDate, ascending: false)

        do {
            let samples = try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<[HKQuantitySample], Error>) in
                let query = HKSampleQuery(
                    sampleType: self.glucoseType,
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
                self.healthStore.execute(query)
            }

            guard !samples.isEmpty else {
                print("[GlucoseManager] No HealthKit samples, trying API fallback")
                await fetchLatestFromAPI()
                return
            }

            processHealthKitSamples(samples)
        } catch {
            print("[GlucoseManager] HealthKit query failed: \(error), trying API fallback")
            await fetchLatestFromAPI()
        }
    }

    // MARK: - Process HealthKit Samples

    private func processHealthKitSamples(_ samples: [HKQuantitySample]) {
        guard let latest = samples.first else { return }

        let value = Int(round(latest.quantity.doubleValue(for: mgdLUnit)))
        let timestamp = latest.startDate
        let trend = inferTrend(from: samples)

        currentGlucose = value
        currentTrend = trend
        lastReadingDate = timestamp
        dataSource = "healthkit"
        isConnected = true
        errorMessage = nil

        // Build recent readings for graph (chronological order)
        recentReadings = samples.reversed().map { sample in
            GlucoseReading(
                id: sample.uuid.uuidString,
                value: Int(round(sample.quantity.doubleValue(for: mgdLUnit))),
                trend: nil,
                source: sample.sourceRevision.source.name,
                timestamp: ISO8601DateFormatter().string(from: sample.startDate),
                createdAt: nil
            )
        }

        // Compute basic stats from samples
        let values = samples.map { Int(round($0.quantity.doubleValue(for: mgdLUnit))) }
        let avg = Double(values.reduce(0, +)) / Double(max(values.count, 1))
        let inRange = values.filter { $0 >= lowThreshold && $0 <= highThreshold }.count
        let pct = values.isEmpty ? 0.0 : Double(inRange) / Double(values.count) * 100.0
        stats = GlucoseStats(
            average: avg,
            min: values.min(),
            max: values.max(),
            count: values.count,
            timeInRange: pct,
            timeLow: nil,
            timeHigh: nil
        )

        persistForComplication()

        // Trigger server upload via relay manager
        Task { await healthKitRelay?.fetchAndUpload() }

        print("[GlucoseManager] HealthKit: \(value) mg/dL \(trend) (\(samples.count) samples)")
    }

    // MARK: - Infer Trend from Recent Samples

    private func inferTrend(from samples: [HKQuantitySample]) -> String {
        guard samples.count >= 2 else { return "stable" }

        let latest = samples[0]
        let previous = samples[1]

        let latestValue = latest.quantity.doubleValue(for: mgdLUnit)
        let previousValue = previous.quantity.doubleValue(for: mgdLUnit)
        let timeDelta = latest.startDate.timeIntervalSince(previous.startDate) / 60.0

        guard timeDelta > 0 && timeDelta < 15 else { return "stable" }

        let ratePerMinute = (latestValue - previousValue) / timeDelta

        if ratePerMinute > 3.0 { return "risingFast" }
        if ratePerMinute > 1.0 { return "rising" }
        if ratePerMinute > 0.5 { return "risingSlightly" }
        if ratePerMinute < -3.0 { return "fallingFast" }
        if ratePerMinute < -1.0 { return "falling" }
        if ratePerMinute < -0.5 { return "fallingSlightly" }
        return "stable"
    }

    // MARK: - Apply Pushed Glucose (from iPhone WCSession)

    /// Accept glucose pushed from iPhone, but only if HealthKit data isn't fresh.
    func applyPushedGlucose(value: Int, trend: String, timestamp: String) {
        if let lastHK = lastReadingDate, dataSource == "healthkit",
           Date().timeIntervalSince(lastHK) < 600 {
            return // HealthKit data is fresh, ignore push
        }

        currentGlucose = value
        currentTrend = trend
        dataSource = "push"

        if !timestamp.isEmpty {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: timestamp) {
                lastReadingDate = date
            } else {
                formatter.formatOptions = [.withInternetDateTime]
                lastReadingDate = formatter.date(from: timestamp)
            }
        } else {
            lastReadingDate = Date()
        }

        isConnected = true
        persistForComplication()
    }

    // MARK: - Persist for Complication

    private func persistForComplication() {
        guard let defaults = sharedDefaults else { return }
        if let glucose = currentGlucose {
            defaults.set(glucose, forKey: "complication_glucose")
        }
        defaults.set(currentTrend, forKey: "complication_trend")
        defaults.set(lowThreshold, forKey: "complication_low")
        defaults.set(highThreshold, forKey: "complication_high")
        if let date = lastReadingDate {
            defaults.set(date.timeIntervalSince1970, forKey: "complication_timestamp")
        }
        
        // Debug logging
        let minutesAgo = lastReadingDate.map { Int(Date().timeIntervalSince($0) / 60) } ?? nil
        print("[GlucoseManager] persistForComplication: glucose=\(currentGlucose ?? -1), trend=\(currentTrend), minutesAgo=\(minutesAgo ?? -1)")
        
        // Write to file in App Group container (more reliable than UserDefaults alone)
        writeGlucoseDataToFile()
        
        // Force sync to disk
        defaults.synchronize()
        
        // Reload widget timelines (budgeted to avoid exhausting daily quota)
        reloadWidgetTimelinesIfNeeded()
    }

    /// Write glucose data to a JSON file in the App Group container
    /// This is more reliable than UserDefaults for cross-process communication
    private func writeGlucoseDataToFile() {
        guard let fileURL = glucoseDataFileURL else {
            print("[GlucoseManager] Could not get App Group container URL")
            return
        }
        
        let glucoseData: [String: Any] = [
            "glucose": currentGlucose as Any,
            "trend": currentTrend,
            "timestamp": lastReadingDate?.timeIntervalSince1970 ?? 0,
            "lowThreshold": lowThreshold,
            "highThreshold": highThreshold,
            "dataSource": dataSource,
            "updatedAt": Date().timeIntervalSince1970
        ]
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: glucoseData, options: [])
            try jsonData.write(to: fileURL, options: .atomic)
            print("[GlucoseManager] Wrote glucose data to file: \(fileURL.path)")
        } catch {
            print("[GlucoseManager] Failed to write glucose data file: \(error)")
        }
    }
    
    /// Send Darwin notification to signal widget to refresh
    private func sendWidgetNotification() {
        let notificationName = "com.vibecmd.linkloop.glucoseChanged" as CFString
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(notificationName),
            nil,
            nil,
            true
        )
    }

    /// Reload widget timelines only when the glucose value actually changed
    /// OR enough time has passed. This preserves the ~40-70/day reload budget.
    /// The widget now reads HealthKit directly on its 5-minute schedule,
    /// so these reloads are supplementary.
    private func reloadWidgetTimelinesIfNeeded() {
        let now = Date()
        let glucose = currentGlucose ?? -1
        let timeSinceLastReload = now.timeIntervalSince(lastWidgetReloadTime)
        let valueChanged = glucose != lastWidgetReloadGlucose

        // Only reload if value changed OR 4+ minutes since last reload
        guard valueChanged || timeSinceLastReload >= widgetReloadMinInterval else {
            print("[GlucoseManager] Skipping widget reload (budget): value=\(glucose), last=\(lastWidgetReloadGlucose), \(Int(timeSinceLastReload))s ago")
            return
        }

        lastWidgetReloadTime = now
        lastWidgetReloadGlucose = glucose

        // Single call is sufficient — no need for per-kind + reloadAll
        WidgetCenter.shared.reloadAllTimelines()
        sendWidgetNotification()
        print("[GlucoseManager] Widget reload triggered: \(glucose) mg/dL (valueChanged=\(valueChanged))")
    }
    }

    // MARK: - API Refresh (Members + Warrior Fallback)

    /// Restart the appropriate data source. Safe to call repeatedly — it
    /// tears down the previous observer/timer first to avoid duplicates.
    func ensureActiveDataSource() {
        if userRole == "warrior" {
            Task { await startHealthKitObserver() }
        } else {
            startAPIRefresh()
        }
    }

    func stopAllDataSources() {
        stopAPIRefresh()
        stopHealthKitObserver()
    }

    func startAPIRefresh() {
        stopAPIRefresh()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) {
            [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.refreshFromAPI()
            }
        }
        Task { await refreshFromAPI() }
    }

    func stopAPIRefresh() {
        refreshTimer?.invalidate()
        refreshTimer = nil
    }

    func refreshFromAPI() async {
        guard authToken != nil else {
            errorMessage = "Not signed in"
            isConnected = false
            return
        }
        isLoading = true
        errorMessage = nil

        if userRole == "member", let ownerId = linkedOwnerId {
            await fetchMemberView(ownerId: ownerId)
        } else {
            await fetchLatestFromAPI()
        }
        await fetchStats()
        await fetchAlerts()
        isLoading = false
    }

    /// Full refresh — HealthKit for warriors, API for members
    func refreshAll() async {
        if userRole == "warrior" {
            await fetchHealthKitSamples()
            await fetchAlerts()
        } else {
            await refreshFromAPI()
        }
    }

    // MARK: - API Calls

    private func fetchLatestFromAPI() async {
        guard let data = await apiRequest("/glucose/latest") else { return }
        do {
            let reading = try JSONDecoder().decode(GlucoseReading.self, from: data)
            // Only update if no fresher HealthKit data
            if dataSource != "healthkit" || lastReadingDate == nil ||
               (reading.date != nil && (lastReadingDate == nil || reading.date! > lastReadingDate!)) {
                currentGlucose = reading.value
                currentTrend = reading.trend ?? "stable"
                lastReadingDate = reading.date
                dataSource = "api"
                persistForComplication()
            }
        } catch {
            print("[GlucoseManager] Failed to decode latest: \(error)")
        }
    }

    func fetchStats() async {
        if userRole == "member" { return }
        if dataSource == "healthkit" && stats != nil { return }

        guard let data = await apiRequest("/glucose/stats?hours=3") else { return }
        do {
            let response = try JSONDecoder().decode(GlucoseStatsResponse.self, from: data)
            stats = response.stats
            if let readings = response.readings {
                recentReadings = readings
            }
        } catch {
            do {
                let statsOnly = try JSONDecoder().decode(GlucoseStats.self, from: data)
                stats = statsOnly
            } catch {
                print("[GlucoseManager] Failed to decode stats: \(error)")
            }
        }
    }

    func fetchReadings(hours: Int = 3) async {
        guard let data = await apiRequest("/glucose?hours=\(hours)") else { return }
        do {
            let readings = try JSONDecoder().decode([GlucoseReading].self, from: data)
            recentReadings = readings
        } catch {
            print("[GlucoseManager] Failed to decode readings: \(error)")
        }
    }

    func fetchAlerts() async {
        if userRole == "member" { return }
        guard let data = await apiRequest("/alerts/active") else { return }
        do {
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let count = json["activeCount"] as? Int {
                activeAlertCount = count
            }
        } catch {
            print("[GlucoseManager] Failed to decode alerts: \(error)")
        }
    }

    // MARK: - Member View (Care Circle)
    func fetchMemberView(ownerId: String) async {
        guard let data = await apiRequest("/glucose/member-view/\(ownerId)?hours=3") else { return }
        do {
            let response = try JSONDecoder().decode(MemberViewResponse.self, from: data)
            if let latest = response.latest {
                currentGlucose = latest.value
                currentTrend = latest.trend ?? "stable"
                lastReadingDate = latest.date
                dataSource = "api"
            }
            if let memberStats = response.stats { stats = memberStats }
            if let readings = response.readings { recentReadings = readings }
            persistForComplication()
        } catch {
            print("[GlucoseManager] Failed to decode member-view: \(error)")
        }
    }

    // MARK: - Helpers
    func glucoseColor(for value: Int) -> GlucoseRange {
        if value < lowThreshold { return .low }
        if value > highThreshold { return .high }
        return .inRange
    }

    var currentRange: GlucoseRange {
        guard let glucose = currentGlucose else { return .inRange }
        return glucoseColor(for: glucose)
    }

    var minutesSinceReading: Int {
        guard let date = lastReadingDate else { return 0 }
        return Int(Date().timeIntervalSince(date) / 60)
    }

    var trendArrow: String {
        switch currentTrend.lowercased() {
        case "rising", "risingfast", "rising_fast":
            return "↑"
        case "risingslightly", "rising_slightly":
            return "↗"
        case "falling", "fallingfast", "falling_fast":
            return "↓"
        case "fallingslightly", "falling_slightly":
            return "↘"
        case "stable", "flat":
            return "→"
        default:
            return "→"
        }
    }

    // MARK: - Network
    private func apiRequest(_ endpoint: String) async -> Data? {
        guard let token = authToken,
              let url = URL(string: "\(baseURL)\(endpoint)")
        else { return nil }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 401 {
                    isConnected = false
                    errorMessage = "Session expired"
                    return nil
                }
                if httpResponse.statusCode >= 400 { return nil }
            }
            return data
        } catch {
            errorMessage = "Connection error"
            return nil
        }
    }
}

// MARK: - Glucose Range
enum GlucoseRange {
    case low, inRange, high

    var label: String {
        switch self {
        case .low: return "LOW"
        case .inRange: return "In Range"
        case .high: return "HIGH"
        }
    }
}
