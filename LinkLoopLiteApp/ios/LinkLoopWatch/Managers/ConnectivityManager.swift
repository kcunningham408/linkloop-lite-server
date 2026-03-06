import Foundation
import WatchConnectivity

class ConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    @Published var isPhoneReachable = false
    var onTokenReceived: ((String) -> Void)?
    var onThresholdsReceived: ((Int, Int) -> Void)?
    var onRoleReceived: ((String, String?) -> Void)?  // (role, linkedOwnerId?)

    private var retryCount = 0
    private let maxRetries = 5

    func activate() {
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
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
            DispatchQueue.main.async {
                self.onTokenReceived?(token)
            }
            applyThresholds(from: context)
            applyRole(from: context)
            return
        }

        // Second: try real-time message if phone is reachable
        guard WCSession.default.isReachable else {
            // Phone not reachable — schedule a retry
            scheduleRetry()
            return
        }

        WCSession.default.sendMessage(
            ["request": "authToken"],
            replyHandler: { reply in
                if let token = reply["authToken"] as? String {
                    DispatchQueue.main.async {
                        self.retryCount = 0
                        self.onTokenReceived?(token)
                    }
                }
            },
            errorHandler: { error in
                print("[Watch] Token request failed: \(error.localizedDescription)")
                self.scheduleRetry()
            })
    }

    private func scheduleRetry() {
        guard retryCount < maxRetries else { return }
        retryCount += 1
        let delay = Double(retryCount) * 2.0  // 2s, 4s, 6s, 8s, 10s
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.requestToken()
        }
    }

    private func applyThresholds(from context: [String: Any]) {
        if let low = context["lowThreshold"] as? Int,
            let high = context["highThreshold"] as? Int
        {
            UserDefaults.standard.set(low, forKey: "linkloop_low_threshold")
            UserDefaults.standard.set(high, forKey: "linkloop_high_threshold")
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
        DispatchQueue.main.async {
            self.onRoleReceived?(role, linkedOwnerId)
        }
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
        if let token = applicationContext["authToken"] as? String {
            DispatchQueue.main.async {
                self.retryCount = 0
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
