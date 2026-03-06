import Foundation
import WatchConnectivity

/// iPhone-side WCSession delegate that responds to Watch requests
/// and pushes auth tokens + thresholds via applicationContext.
///
/// AsyncStorage (RNCAsyncStorage) stores small values in:
///   <AppSandbox>/Documents/RCTAsyncLocalStorage_V1/manifest.json
/// We read the auth token from there so the Watch can authenticate
/// against the LinkLoop API without the user re-entering credentials.
class WatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

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

    // MARK: - Read from AsyncStorage (manifest.json)

    /// Reads a value from React Native AsyncStorage's manifest.json file.
    /// RNCAsyncStorage stores small key-value pairs as [[key, value], ...] in manifest.json.
    /// Larger values are stored in individual files named by their key.
    private func readAsyncStorageValue(forKey key: String) -> String? {
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
