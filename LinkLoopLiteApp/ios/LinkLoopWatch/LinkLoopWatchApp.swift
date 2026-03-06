import SwiftUI
import WidgetKit

@main
struct LinkLoopWatchApp: App {
    @StateObject private var glucoseManager = GlucoseManager()
    @StateObject private var connectivityManager = ConnectivityManager()
    @StateObject private var healthKitRelay = HealthKitRelayManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(glucoseManager)
                .environmentObject(connectivityManager)
                .environmentObject(healthKitRelay)
                .onAppear {
                    connectivityManager.onTokenReceived = { token in
                        glucoseManager.setAuthToken(token)
                        // Also give the HealthKit relay the token
                        healthKitRelay.setAuthToken(token)
                    }
                    connectivityManager.onThresholdsReceived = { low, high in
                        glucoseManager.lowThreshold = low
                        glucoseManager.highThreshold = high
                    }
                    connectivityManager.onRoleReceived = { role, linkedOwnerId in
                        glucoseManager.setRole(role, linkedOwnerId: linkedOwnerId)
                        // Start HealthKit relay only for warriors
                        if role == "warrior" {
                            startHealthKitRelayIfReady()
                        }
                    }
                    connectivityManager.activate()

                    // Safety net: re-check context after a short delay
                    // in case activationDidComplete fired before callbacks were wired
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                        if !glucoseManager.isConnected {
                            connectivityManager.recheckContext()
                        }
                    }

                    // If already connected (saved token), start relay for warriors
                    if glucoseManager.isConnected && glucoseManager.userRole == "warrior" {
                        healthKitRelay.setAuthToken(
                            UserDefaults.standard.string(forKey: "linkloop_auth_token") ?? ""
                        )
                        startHealthKitRelayIfReady()
                    }
                }
        }
    }

    private func startHealthKitRelayIfReady() {
        Task {
            let authorized = await healthKitRelay.requestAuthorization()
            if authorized {
                healthKitRelay.startRelay()
            }
        }
    }
}
