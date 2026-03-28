import Foundation
import WatchConnectivity

/// Darwin notification name for cross-process widget refresh
let kGlucoseDataChangedNotification = "com.vibecmd.linkloop.glucoseChanged"

class ConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    @Published var isPhoneReachable = false
    var onTokenReceived: ((String) -> Void)?
    var onThresholdsReceived: ((Int, Int) -> Void)?
    var onRoleReceived: ((String, String?) -> Void)?  // (role, linkedOwnerId?)
    var onGlucoseReceived: ((Int, String, String) -> Void)?  // (value, trend, timestamp)

    private var retryCount = 0
    private let maxRetries = 5
    private var persistentRetryWorkItem: DispatchWorkItem?

    private let sharedDefaults = UserDefaults(suiteName: "group.com.vibecmd.linkloop.watch")

    func activate() {
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
    }

    /// Check if we already have a persisted token
    func hasPersistedToken() -> Bool {
        let standardToken = UserDefaults.standard.string(forKey: "linkloop_auth_token")
        let appGroupToken = sharedDefaults?.string(forKey: "complication_authToken")
        return (standardToken ?? appGroupToken) != nil
    }

    /// Call this from views to re-check for an existing context (safety net)
    func recheckContext() {
        guard WCSession.default.activationState == .activated else { return }
        let context = WCSession.default.receivedApplicationContext
        if let token = context["authToken"] as? String, !token.isEmpty {
            DispatchQueue.main.async {
                self.onTokenReceived?(token)
            }
            applyThresholds(from: context)
            applyRole(from: context)
        }
    }

    func requestToken() {
        guard WCSession.default.activationState == .activated else { return }

        // First: check if there's already a received applicationContext with a token
        let context = WCSession.default.receivedApplicationContext
        if let token = context["authToken"] as? String, !token.isEmpty {
            persistToken(token)
            DispatchQueue.main.async {
                self.onTokenReceived?(token)
            }
            applyThresholds(from: context)
            applyRole(from: context)
            return
        }

        // Second: check if token is already persisted from a previous session
        if let savedToken = UserDefaults.standard.string(forKey: "linkloop_auth_token"), !savedToken.isEmpty {
            DispatchQueue.main.async {
                self.retryCount = 0
                self.onTokenReceived?(savedToken)
            }
            return
        }

        // Third: try real-time message if phone is reachable
        guard WCSession.default.isReachable else {
            // Phone not reachable — schedule persistent retry with longer intervals
            schedulePersistentRetry()
            return
        }

        WCSession.default.sendMessage(
            ["request": "authToken"],
            replyHandler: { reply in
                if let token = reply["authToken"] as? String {
                    DispatchQueue.main.async {
                        self.retryCount = 0
                        self.persistToken(token)
                        self.onTokenReceived?(token)
                    }
                }
            },
            errorHandler: { error in
                print("[Watch] Token request failed: \(error.localizedDescription)")
                self.schedulePersistentRetry()
            })
    }

    private func persistToken(_ token: String) {
        UserDefaults.standard.set(token, forKey: "linkloop_auth_token")
        sharedDefaults?.set(token, forKey: "complication_authToken")
    }

    private func schedulePersistentRetry() {
        guard retryCount < maxRetries else {
            // After initial burst, use longer retry intervals (every 30 seconds)
            scheduleLongerRetry()
            return
        }
        retryCount += 1
        let delay = Double(retryCount) * 2.0  // 2s, 4s, 6s, 8s, 10s
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.requestToken()
        }
    }

    private func scheduleLongerRetry() {
        // Cancel any existing persistent retry
        persistentRetryWorkItem?.cancel()

        let workItem = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            // Check if we have a token now
            if WCSession.default.receivedApplicationContext["authToken"] != nil ||
               UserDefaults.standard.string(forKey: "linkloop_auth_token") != nil {
                self.requestToken()
            } else {
                // Schedule next retry
                self.scheduleLongerRetry()
            }
        }
        persistentRetryWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 30.0, execute: workItem)
    }

    func cancelPersistentRetry() {
        persistentRetryWorkItem?.cancel()
        persistentRetryWorkItem = nil
    }

    private func applyThresholds(from context: [String: Any]) {
        if let low = context["lowThreshold"] as? Int,
            let high = context["highThreshold"] as? Int
        {
            UserDefaults.standard.set(low, forKey: "linkloop_low_threshold")
            UserDefaults.standard.set(high, forKey: "linkloop_high_threshold")
            // Also write to App Group so the Widget Extension (complication) can read them
            if let defaults = UserDefaults(suiteName: "group.com.vibecmd.linkloop.watch") {
                defaults.set(low, forKey: "complication_low")
                defaults.set(high, forKey: "complication_high")
            }
            DispatchQueue.main.async {
                self.onThresholdsReceived?(low, high)
            }
        }
    }

    private func applyRole(from context: [String: Any]) {
        let role = context["role"] as? String ?? "warrior"
        let linkedOwnerId = context["linkedOwnerId"] as? String
        UserDefaults.standard.set(role, forKey: "linkloop_user_role")
        if let ownerId = linkedOwnerId {
            UserDefaults.standard.set(ownerId, forKey: "linkloop_linked_owner_id")
        }
        // Persist to App Group so the Widget Extension can determine the correct API endpoint
        if let defaults = UserDefaults(suiteName: "group.com.vibecmd.linkloop.watch") {
            defaults.set(role, forKey: "complication_role")
            if let ownerId = linkedOwnerId {
                defaults.set(ownerId, forKey: "complication_linkedOwnerId")
            }
        }
        DispatchQueue.main.async {
            self.onRoleReceived?(role, linkedOwnerId)
        }
    }

    /// Extract and apply glucose data pushed from the iPhone.
    /// Writes to App Group UserDefaults and reloads complications.
    private func applyGlucose(from payload: [String: Any]) {
        guard let value = payload["glucoseValue"] as? Int else { return }
        let trend = payload["glucoseTrend"] as? String ?? "stable"
        let timestamp = payload["glucoseTimestamp"] as? String ?? ""

        // Write to App Group shared defaults so the Widget Extension (complication) can read it
        if let defaults = UserDefaults(suiteName: "group.com.vibecmd.linkloop.watch") {
            defaults.set(value, forKey: "complication_glucose")
            defaults.set(trend, forKey: "complication_trend")

            // Parse ISO timestamp to epoch for the complication
            var readingDate: Date? = nil
            if !timestamp.isEmpty {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let date = formatter.date(from: timestamp) {
                    defaults.set(date.timeIntervalSince1970, forKey: "complication_timestamp")
                    readingDate = date
                } else {
                    // Try without fractional seconds
                    formatter.formatOptions = [.withInternetDateTime]
                    if let date = formatter.date(from: timestamp) {
                        defaults.set(date.timeIntervalSince1970, forKey: "complication_timestamp")
                        readingDate = date
                    }
                }
            } else {
                // No timestamp from server — use current time
                defaults.set(Date().timeIntervalSince1970, forKey: "complication_timestamp")
                readingDate = Date()
            }
            
            // Log what's being persisted for debugging
            print("[Watch] Persisting for complication: glucose=\(value), trend=\(trend), timestamp=\(timestamp), readingDate=\(readingDate?.description ?? "nil")")
            print("[Watch] SharedDefaults keys now: glucose=\(defaults.object(forKey: "complication_glucose") ?? "nil"), trend=\(defaults.string(forKey: "complication_trend") ?? "nil")")
        }

        // Notify GlucoseManager - it will handle widget reload via persistForComplication()
        DispatchQueue.main.async {
            self.onGlucoseReceived?(value, trend, timestamp)
        }

        print("[Watch] Received glucose push: \(value) \(trend)")
        
        // Send Darwin notification to wake widget extension
        let notificationName = kGlucoseDataChangedNotification as CFString
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(notificationName),
            nil,
            nil,
            true
        )
    }

    // MARK: - WCSessionDelegate
    func session(
        _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        DispatchQueue.main.async {
            self.isPhoneReachable = session.isReachable
        }
        if activationState == .activated {
            requestToken()
            // Delayed re-check in case callbacks weren't wired yet at first attempt
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
                guard let self = self else { return }
                // If still no token delivered, try again
                let context = WCSession.default.receivedApplicationContext
                if let token = context["authToken"] as? String, !token.isEmpty {
                    self.onTokenReceived?(token)
                    self.applyThresholds(from: context)
                    self.applyRole(from: context)
                }
            }
        }
    }

    func session(
        _ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        // Cancel any pending retries since we got context
        cancelPersistentRetry()
        retryCount = 0

        if let token = applicationContext["authToken"] as? String {
            persistToken(token)
            DispatchQueue.main.async {
                self.onTokenReceived?(token)
            }
        }
        applyThresholds(from: applicationContext)
        applyRole(from: applicationContext)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let token = message["authToken"] as? String {
            DispatchQueue.main.async {
                self.onTokenReceived?(token)
            }
        }
        // Handle glucose pushes from iPhone
        if message["glucoseValue"] != nil {
            applyGlucose(from: message)
        }
    }

    /// Handle transferCurrentComplicationUserInfo from iPhone (guaranteed delivery for complications)
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        print("[Watch] Received userInfo: \(userInfo.keys.joined(separator: ", "))")
        if userInfo["glucoseValue"] != nil {
            applyGlucose(from: userInfo)
        } else {
            print("[Watch] userInfo had no glucoseValue - keys: \(userInfo)")
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.isPhoneReachable = session.isReachable
        }
        if session.isReachable {
            requestToken()
        }
    }
}
