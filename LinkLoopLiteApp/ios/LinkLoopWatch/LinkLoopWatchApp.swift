import SwiftUI
import WatchKit
import WidgetKit

@main
struct LinkLoopWatchApp: App {
    @StateObject private var glucoseManager = GlucoseManager()
    @StateObject private var connectivityManager = ConnectivityManager()
    @StateObject private var healthKitRelay = HealthKitRelayManager()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(glucoseManager)
                .environmentObject(connectivityManager)
                .environmentObject(healthKitRelay)
                .onAppear {
                    // Wire relay reference so GlucoseManager can trigger uploads
                    glucoseManager.healthKitRelay = healthKitRelay

                    connectivityManager.onTokenReceived = { token in
                        glucoseManager.setAuthToken(token)
                        healthKitRelay.setAuthToken(token)
                    }
                    connectivityManager.onThresholdsReceived = { low, high in
                        glucoseManager.lowThreshold = low
                        glucoseManager.highThreshold = high
                    }
                    connectivityManager.onRoleReceived = { role, linkedOwnerId in
                        glucoseManager.setRole(role, linkedOwnerId: linkedOwnerId)
                        if role == "warrior" {
                            startHealthKitRelay()
                        }
                    }
                    connectivityManager.onGlucoseReceived = { value, trend, timestamp in
                        // Supplementary channel — GlucoseManager ignores if HealthKit is fresh
                        glucoseManager.applyPushedGlucose(value: value, trend: trend, timestamp: timestamp)
                    }
                    connectivityManager.activate()

                    // Safety net: re-check context after a short delay
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                        if !glucoseManager.isConnected {
                            connectivityManager.recheckContext()
                        }
                    }

                    // If already connected (saved token), start appropriate data source
                    if glucoseManager.isConnected {
                        if glucoseManager.userRole == "warrior" {
                            healthKitRelay.setAuthToken(
                                UserDefaults.standard.string(forKey: "linkloop_auth_token") ?? ""
                            )
                            startHealthKitRelay()
                        }
                        glucoseManager.ensureActiveDataSource()
                    }
                }
                .onChange(of: scenePhase) { newPhase in
                    if newPhase == .active {
                        if glucoseManager.isConnected {
                            // Restart the observer/timer — it may have been
                            // invalidated or stalled while the app was suspended.
                            glucoseManager.ensureActiveDataSource()
                        }
                        connectivityManager.recheckContext()
                    }
                }
        }
    }

    private func startHealthKitRelay() {
        Task {
            let authorized = await healthKitRelay.requestAuthorization()
            if authorized {
                healthKitRelay.isRelaying = true
            }
        }
    }
}
