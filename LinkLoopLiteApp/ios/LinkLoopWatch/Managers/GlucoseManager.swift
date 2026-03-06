import Combine
import Foundation
import WidgetKit

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

    // MARK: - Configuration
    private let baseURL = "https://linkloop-9l3x.onrender.com/api"
    private var authToken: String? {
        didSet {
            if let token = authToken {
                UserDefaults.standard.set(token, forKey: "linkloop_auth_token")
                isConnected = true
            }
        }
    }

    // Thresholds (matching LinkLoop defaults)
    var lowThreshold: Int = 70
    var highThreshold: Int = 180

    // Role-based routing for Care Circle members
    var userRole: String = "warrior"
    var linkedOwnerId: String? = nil

    private var refreshTimer: Timer?

    // MARK: - Init
    init() {
        // Try to load saved token
        if let savedToken = UserDefaults.standard.string(forKey: "linkloop_auth_token") {
            self.authToken = savedToken
            self.isConnected = true
        }
        // Load saved role info
        if let savedRole = UserDefaults.standard.string(forKey: "linkloop_user_role") {
            self.userRole = savedRole
        }
        self.linkedOwnerId = UserDefaults.standard.string(forKey: "linkloop_linked_owner_id")
    }

    // MARK: - Auth
    func setAuthToken(_ token: String) {
        self.authToken = token
        Task { await refreshAll() }
    }

    func setRole(_ role: String, linkedOwnerId: String?) {
        self.userRole = role
        self.linkedOwnerId = linkedOwnerId
    }

    /// Persist latest glucose data to shared UserDefaults so the Widget Extension
    /// (complication) TimelineProvider can read it, then tell WidgetKit to refresh.
    private func persistForComplication() {
        let defaults = UserDefaults.standard
        if let glucose = currentGlucose {
            defaults.set(glucose, forKey: "complication_glucose")
        }
        defaults.set(currentTrend, forKey: "complication_trend")
        defaults.set(lowThreshold, forKey: "complication_low")
        defaults.set(highThreshold, forKey: "complication_high")
        if let date = lastReadingDate {
            defaults.set(date.timeIntervalSince1970, forKey: "complication_timestamp")
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: - Auto Refresh
    func startAutoRefresh() {
        stopAutoRefresh()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.refreshAll()
            }
        }
        Task { await refreshAll() }
    }

    func stopAutoRefresh() {
        refreshTimer?.invalidate()
        refreshTimer = nil
    }

    // MARK: - API Calls
    func refreshAll() async {
        guard authToken != nil else {
            errorMessage = "Not signed in"
            isConnected = false
            return
        }

        isLoading = true
        errorMessage = nil

        async let latestTask: () = fetchLatest()
        async let statsTask: () = fetchStats()
        async let alertsTask: () = fetchAlerts()

        _ = await (latestTask, statsTask, alertsTask)
        isLoading = false
    }

    func fetchLatest() async {
        // Members use the member-view endpoint to see the warrior's glucose
        if userRole == "member", let ownerId = linkedOwnerId {
            await fetchMemberView(ownerId: ownerId)
            return
        }

        guard let data = await apiRequest("/glucose/latest") else { return }

        do {
            let reading = try JSONDecoder().decode(GlucoseReading.self, from: data)
            currentGlucose = reading.value
            currentTrend = reading.trend ?? "stable"
            lastReadingDate = reading.date
            persistForComplication()
        } catch {
            print("Failed to decode latest: \(error)")
        }
    }

    func fetchStats() async {
        // Members get stats from member-view (already fetched in fetchLatest)
        if userRole == "member" { return }

        guard let data = await apiRequest("/glucose/stats?hours=3") else { return }

        do {
            let response = try JSONDecoder().decode(GlucoseStatsResponse.self, from: data)
            stats = response.stats
            if let readings = response.readings {
                recentReadings = readings
            }
        } catch {
            // Try parsing just the stats directly
            do {
                let statsOnly = try JSONDecoder().decode(GlucoseStats.self, from: data)
                stats = statsOnly
            } catch {
                print("Failed to decode stats: \(error)")
            }
        }
    }

    func fetchReadings(hours: Int = 3) async {
        guard let data = await apiRequest("/glucose?hours=\(hours)") else { return }

        do {
            let readings = try JSONDecoder().decode([GlucoseReading].self, from: data)
            recentReadings = readings
        } catch {
            print("Failed to decode readings: \(error)")
        }
    }

    func fetchAlerts() async {
        // Members don't have their own alerts
        if userRole == "member" { return }

        guard let data = await apiRequest("/alerts/active") else { return }

        do {
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                let count = json["activeCount"] as? Int
            {
                activeAlertCount = count
            }
        } catch {
            print("Failed to decode alerts: \(error)")
        }
    }

    // MARK: - Member View (Care Circle)
    func fetchMemberView(ownerId: String) async {
        guard let data = await apiRequest("/glucose/member-view/\(ownerId)?hours=3") else { return }

        do {
            let response = try JSONDecoder().decode(MemberViewResponse.self, from: data)

            // Apply latest reading
            if let latest = response.latest {
                currentGlucose = latest.value
                currentTrend = latest.trend ?? "stable"
                lastReadingDate = latest.date
            }

            // Apply stats
            if let memberStats = response.stats {
                stats = memberStats
            }

            // Apply readings
            if let readings = response.readings {
                recentReadings = readings
            }

            persistForComplication()
        } catch {
            print("Failed to decode member-view: \(error)")
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
                if httpResponse.statusCode >= 400 {
                    return nil
                }
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
