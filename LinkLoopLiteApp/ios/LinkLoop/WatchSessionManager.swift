import Foundation
import WatchConnectivity

/// iPhone-side WCSession delegate that responds to Watch requests
/// and pushes auth tokens + thresholds via applicationContext.
///
/// AsyncStorage (RNCAsyncStorage) stores small values in:
///   <AppSandbox>/Documents/RCTAsyncLocalStorage_V1/manifest.json
/// We read the auth token from there so the Watch can authenticate
/// against the LinkLoop API without the user re-entering credentials.
/// We also write to App Group for the Watch app to read directly.
class WatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    /// Timer that periodically pushes fresh glucose to the Watch
    private var glucosePushTimer: Timer?

    /// Track last complication transfer to rate-limit (Apple allows ~50/day)
    private var lastComplicationTransferDate: Date = .distantPast

    /// Track last glucose value sent via complication transfer to avoid duplicate pushes
    private var lastComplicationGlucoseValue: Int?

    /// App Group for sharing data with Watch
    private let sharedDefaults = UserDefaults(suiteName: "group.com.vibecmd.linkloop.watch")

    private override init() {
        super.init()
    }

    // MARK: - Activation

    func activate() {
        guard WCSession.isSupported() else {
            print("[WatchSession] WCSession not supported on this device")
            return
        }
        let session = WCSession.default
        session.delegate = self
        session.activate()
        print("[WatchSession] WCSession activating…")
    }

    // MARK: - Push context to Watch

    /// Send the current auth token + thresholds to the Watch via applicationContext.
    /// applicationContext is persisted and delivered even if the Watch app isn't running.
    func pushContextToWatch() {
        guard WCSession.default.activationState == .activated else {
            print("[WatchSession] Session not activated, skipping context push")
            return
        }
        guard WCSession.default.isWatchAppInstalled else {
            print("[WatchSession] Watch app not installed, skipping context push")
            return
        }

        var context: [String: Any] = [:]

        // Read auth token from AsyncStorage manifest
        if let token = readAsyncStorageValue(forKey: "authToken") {
            context["authToken"] = token
            // Also write to App Group for direct Watch access
            sharedDefaults?.set(token, forKey: "complication_authToken")
        }

        // Read thresholds from cached user profile
        if let cachedUserJSON = readAsyncStorageValue(forKey: "cachedUser"),
            let data = cachedUserJSON.data(using: .utf8),
            let user = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        {
            if let low = user["lowThreshold"] as? Int {
                context["lowThreshold"] = low
            }
            if let high = user["highThreshold"] as? Int {
                context["highThreshold"] = high
            }
            // Push role + linkedOwnerId so Watch knows if this is a warrior or member
            if let role = user["role"] as? String {
                context["role"] = role
            }
            if let linkedOwnerId = user["linkedOwnerId"] as? String {
                context["linkedOwnerId"] = linkedOwnerId
            }
            // Also check nested settings for thresholds
            if let settings = user["settings"] as? [String: Any] {
                if context["lowThreshold"] == nil, let low = settings["lowThreshold"] as? Int {
                    context["lowThreshold"] = low
                }
                if context["highThreshold"] == nil, let high = settings["highThreshold"] as? Int {
                    context["highThreshold"] = high
                }
            }
        }

        guard !context.isEmpty else {
            print("[WatchSession] No context data to push")
            return
        }

        // Add a timestamp so updateApplicationContext always sees a "new" dictionary
        // (it's a no-op if the dictionary is identical to the last push)
        context["pushTimestamp"] = Date().timeIntervalSince1970

        do {
            try WCSession.default.updateApplicationContext(context)
            print("[WatchSession] Pushed context to Watch: \(context.keys.joined(separator: ", "))")
        } catch {
            print("[WatchSession] Failed to push context: \(error)")
        }
    }

    // MARK: - Live Glucose Push to Watch

    /// Start a repeating timer that pushes fresh glucose data to the Watch every ~60 seconds.
    /// Called when the app becomes active. The Watch receives it instantly via sendMessage
    /// (if reachable) or via complicationUserInfo (guaranteed delivery for complications).
    func startGlucosePushTimer() {
        stopGlucosePushTimer()
        // Push immediately, then every 30 seconds while the app is in the foreground
        pushGlucoseToWatch()
        glucosePushTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.pushGlucoseToWatch()
        }
        print("[WatchSession] Glucose push timer started (30s interval)")
    }

    /// Stop the timer when the app goes to the background.
    func stopGlucosePushTimer() {
        glucosePushTimer?.invalidate()
        glucosePushTimer = nil
    }

    /// Push the latest glucose reading to the Watch so it can update complications in real time.
    /// Fetches directly from the LinkLoop server (same API the Watch uses), then sends via:
    ///   1. sendMessage — instant delivery if Watch is reachable
    ///   2. transferCurrentComplicationUserInfo — guaranteed delivery, wakes widget extension
    /// - Parameter completion: Called when the push finishes (or fails). Used by BGTask handler.
    func pushGlucoseToWatch(completion: (() -> Void)? = nil) {
        guard WCSession.default.activationState == .activated,
              WCSession.default.isWatchAppInstalled else {
            completion?()
            return
        }

        guard let token = readAsyncStorageValue(forKey: "authToken") else {
            print("[WatchSession] No auth token for glucose push")
            completion?()
            return
        }

        // Determine the correct endpoint based on user role
        var endpoint = "/glucose/latest"
        if let cachedUserJSON = readAsyncStorageValue(forKey: "cachedUser"),
           let data = cachedUserJSON.data(using: .utf8),
           let user = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            let role = user["role"] as? String ?? "warrior"
            if role == "member", let ownerId = user["linkedOwnerId"] as? String {
                endpoint = "/glucose/member-view/\(ownerId)?hours=1"
            }
        }

        let urlString = "https://linkloop-9l3x.onrender.com/api\(endpoint)"
        guard let url = URL(string: urlString) else {
            completion?()
            return
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10

        URLSession.shared.dataTask(with: request) { [weak self] responseData, response, error in
            guard let responseData = responseData, error == nil,
                  let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                print("[WatchSession] Glucose fetch failed: \(error?.localizedDescription ?? "HTTP error")")
                completion?()
                return
            }

            do {
                let json = try JSONSerialization.jsonObject(with: responseData)
                var value: Int?
                var trend: String = "stable"
                var timestamp: String = ""

                if let reading = json as? [String: Any] {
                    // /glucose/latest returns a single reading object
                    value = reading["value"] as? Int
                    trend = reading["trend"] as? String ?? "stable"
                    timestamp = reading["readAt"] as? String ?? reading["createdAt"] as? String ?? ""
                } else if let envelope = json as? [String: Any],
                          let latest = envelope["latest"] as? [String: Any] {
                    // /glucose/member-view returns { latest: {...}, stats: {...}, ... }
                    value = latest["value"] as? Int
                    trend = latest["trend"] as? String ?? "stable"
                    timestamp = latest["readAt"] as? String ?? latest["createdAt"] as? String ?? ""
                }

                guard let glucoseValue = value else {
                    print("[WatchSession] No glucose value in response")
                    completion?()
                    return
                }

                self?.deliverGlucoseToWatch(value: glucoseValue, trend: trend, timestamp: timestamp)
                completion?()
            } catch {
                print("[WatchSession] JSON parse error: \(error)")
                completion?()
            }
        }.resume()
    }

    func deliverGlucoseToWatch(value: Int, trend: String, timestamp: String) {
        let payload: [String: Any] = [
            "glucoseValue": value,
            "glucoseTrend": trend,
            "glucoseTimestamp": timestamp,
            "pushTime": Date().timeIntervalSince1970
        ]

        // Channel 1: Real-time message (instant if Watch is reachable)
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(payload, replyHandler: nil) { error in
                print("[WatchSession] sendMessage glucose error: \(error.localizedDescription)")
            }
            print("[WatchSession] Sent glucose via sendMessage: \(value) \(trend)")
        }

        // Channel 2: Complication user info (guaranteed, wakes widget extension)
        // Rate-limit: only transfer if value changed OR 5+ minutes since last transfer
        // Apple allows ~50/day — at every 5 min that's 288/day, so we also skip if
        // the value hasn't changed significantly to conserve quota
        let timeSinceLastTransfer = Date().timeIntervalSince(lastComplicationTransferDate)
        let valueChanged = (lastComplicationGlucoseValue ?? -1) != value
        let shouldTransfer = valueChanged || timeSinceLastTransfer >= 300  // 5 minutes

        if shouldTransfer && WCSession.default.remainingComplicationUserInfoTransfers > 0 {
            WCSession.default.transferCurrentComplicationUserInfo(payload)
            lastComplicationTransferDate = Date()
            lastComplicationGlucoseValue = value
            print("[WatchSession] Transferred complication info: \(value) \(trend) (remaining: \(WCSession.default.remainingComplicationUserInfoTransfers))")
        } else {
            print("[WatchSession] SKIPPED complication transfer - shouldTransfer: \(shouldTransfer), remaining: \(WCSession.default.remainingComplicationUserInfoTransfers), valueChanged: \(valueChanged), timeSinceLast: \(timeSinceLastTransfer)s")
        }
    }

    // MARK: - Read from AsyncStorage (manifest.json)

    /// Reads a value from React Native AsyncStorage's manifest.json file.
    /// RNCAsyncStorage stores small key-value pairs as [[key, value], ...] in manifest.json.
    /// Larger values are stored in individual files named by their key.
    func readAsyncStorageValue(forKey key: String) -> String? {
        let documentsPath = NSSearchPathForDirectoriesInDomains(
            .documentDirectory, .userDomainMask, true
        ).first!
        let storagePath = (documentsPath as NSString).appendingPathComponent(
            "RCTAsyncLocalStorage_V1")
        let manifestPath = (storagePath as NSString).appendingPathComponent("manifest.json")

        guard FileManager.default.fileExists(atPath: manifestPath),
            let data = FileManager.default.contents(atPath: manifestPath),
            let manifest = try? JSONSerialization.jsonObject(with: data) as? [[Any]]
        else {
            print("[WatchSession] Could not read manifest.json")
            return nil
        }

        // manifest.json is an array of [key, value] pairs
        // If value is null/NSNull, the actual value is stored in a separate file
        for entry in manifest {
            guard let entryKey = entry.first as? String, entryKey == key else { continue }
            if entry.count > 1, let value = entry[1] as? String {
                return value
            }
            // Value stored in separate file (for large values)
            let filePath = (storagePath as NSString).appendingPathComponent(key)
            if let fileData = FileManager.default.contents(atPath: filePath) {
                return String(data: fileData, encoding: .utf8)
            }
        }

        print("[WatchSession] Key '\(key)' not found in AsyncStorage")
        return nil
    }

    // MARK: - WCSessionDelegate (required on iOS)

    func session(
        _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        print(
            "[WatchSession] Activation complete: \(activationState.rawValue), error: \(String(describing: error))"
        )
        if activationState == .activated {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                self.pushContextToWatch()
            }
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {
        print("[WatchSession] Session became inactive")
    }

    func sessionDidDeactivate(_ session: WCSession) {
        print("[WatchSession] Session deactivated, reactivating…")
        WCSession.default.activate()
    }

    // MARK: - Watch → iPhone Messages

    /// Handle sendMessage from Watch (real-time, requires iPhone app in foreground/background)
    func session(
        _ session: WCSession, didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        print("[WatchSession] Received message: \(message.keys.joined(separator: ", "))")

        if let request = message["request"] as? String, request == "authToken" {
            if let token = readAsyncStorageValue(forKey: "authToken") {
                replyHandler(["authToken": token])
                print("[WatchSession] Replied with auth token")
            } else {
                replyHandler(["error": "no_token"])
                print("[WatchSession] No auth token available")
            }
            return
        }

        // Default reply
        replyHandler(["status": "received"])
    }

    /// Handle sendMessage without reply handler
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        print("[WatchSession] Received message (no reply): \(message.keys.joined(separator: ", "))")
    }

    /// Handle applicationContext updates from Watch (unlikely but handle gracefully)
    func session(
        _ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        print(
            "[WatchSession] Received application context from Watch: \(applicationContext.keys.joined(separator: ", "))"
        )
    }

    /// Handle userInfo transfers from Watch
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        print("[WatchSession] Received user info: \(userInfo.keys.joined(separator: ", "))")
    }

    // MARK: - Watch App State Changes

    func sessionWatchStateDidChange(_ session: WCSession) {
        print(
            "[WatchSession] Watch state changed - installed: \(session.isWatchAppInstalled), paired: \(session.isPaired)"
        )
        if session.isWatchAppInstalled {
            pushContextToWatch()
        }
    }
}
