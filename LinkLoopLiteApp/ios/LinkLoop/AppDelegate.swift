import Expo
import React
import ReactAppDependencyProvider
import BackgroundTasks
import UserNotifications

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  /// BGTask identifier for background glucose refresh
  private static let bgGlucoseTaskId = "com.vibecmd.linkloop.glucoseRefresh"

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    // Activate WatchConnectivity after RN starts (deferred to avoid blocking launch)
    DispatchQueue.main.async {
      WatchSessionManager.shared.activate()
    }

    // Register background glucose refresh task
    BGTaskScheduler.shared.register(
      forTaskWithIdentifier: Self.bgGlucoseTaskId,
      using: nil
    ) { task in
      self.handleBackgroundGlucoseRefresh(task: task as! BGAppRefreshTask)
    }
    
    // Register for push notifications
    registerForPushNotifications()

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
  
  // MARK: - Push Notifications
  
  private func registerForPushNotifications() {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
      if granted {
        DispatchQueue.main.async {
          UIApplication.shared.registerForRemoteNotifications()
          print("[AppDelegate] Registered for remote notifications")
        }
      } else if let error = error {
        print("[AppDelegate] Push authorization error: \(error.localizedDescription)")
      }
    }
  }
  
  public override func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    // Convert APNs token to string
    let tokenParts = deviceToken.map { String(format: "%02.2hhx", $0) }
    let token = tokenParts.joined()
    print("[AppDelegate] APNs device token: \(token)")
    
    // Send token to server
    sendPushTokenToServer(token: token)
  }
  
  public override func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    print("[AppDelegate] Failed to register for remote notifications: \(error.localizedDescription)")
  }
  
  private func sendPushTokenToServer(token: String) {
    guard let url = URL(string: "https://linkloop-9l3x.onrender.com/api/push/register-watch") else { return }
    
    // Read auth token from AsyncStorage
    guard let tokenData = WatchSessionManager.shared.readAsyncStorageValue(forKey: "authToken") else {
      print("[AppDelegate] No auth token for push registration")
      return
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(tokenData)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body: [String: Any] = [
      "watchPushToken": token,
      "hasPairedWatch": true
    ]
    
    do {
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    } catch {
      print("[AppDelegate] Failed to serialize push token body: \(error)")
      return
    }
    
    URLSession.shared.dataTask(with: request) { data, response, error in
      if let error = error {
        print("[AppDelegate] Push token registration failed: \(error.localizedDescription)")
      } else if let httpResponse = response as? HTTPURLResponse {
        print("[AppDelegate] Push token registration completed: \(httpResponse.statusCode)")
      }
    }.resume()
  }
  
  // Handle silent push notifications (content-available: 1)
  public override func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
    print("[AppDelegate] Received remote notification: \(userInfo)")
    
    // Check if this is a glucose update notification
    if let glucoseValue = userInfo["glucoseValue"] as? Int {
      let trend = userInfo["glucoseTrend"] as? String ?? "stable"
      let timestamp = userInfo["glucoseTimestamp"] as? String ?? ""
      
      print("[AppDelegate] Glucose update from push: \(glucoseValue) \(trend)")
      
      // Forward to Watch
      WatchSessionManager.shared.deliverGlucoseToWatch(
        value: glucoseValue,
        trend: trend,
        timestamp: timestamp
      )
      
      completionHandler(.newData)
    } else {
      completionHandler(.noData)
    }
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }

  // Push Watch context every time app comes to foreground
  public override func applicationDidBecomeActive(_ application: UIApplication) {
    super.applicationDidBecomeActive(application)
    WatchSessionManager.shared.pushContextToWatch()
    WatchSessionManager.shared.startGlucosePushTimer()
  }

  public override func applicationWillResignActive(_ application: UIApplication) {
    super.applicationWillResignActive(application)
    // Do one final glucose push before stopping the foreground timer
    WatchSessionManager.shared.pushGlucoseToWatch()
    WatchSessionManager.shared.stopGlucosePushTimer()
  }

  public override func applicationDidEnterBackground(_ application: UIApplication) {
    super.applicationDidEnterBackground(application)
    scheduleBackgroundGlucoseRefresh()
  }

  // MARK: - Background Glucose Refresh

    /// Schedule a background app-refresh task so we can push glucose to the Watch
    /// even when the iPhone app isn't in the foreground.
    private func scheduleBackgroundGlucoseRefresh() {
      let request = BGAppRefreshTaskRequest(identifier: Self.bgGlucoseTaskId)
      // Request earliest: 1 minute (Apple may delay longer based on device conditions)
      request.earliestBeginDate = Date(timeIntervalSinceNow: 60)
      do {
        try BGTaskScheduler.shared.submit(request)
        print("[AppDelegate] Scheduled background glucose refresh")
      } catch {
        print("[AppDelegate] Could not schedule bg glucose refresh: \(error)")
      }
    }

  /// Called by the system when it's time for a background glucose push.
  private func handleBackgroundGlucoseRefresh(task: BGAppRefreshTask) {
    // Schedule the next refresh before doing work
    scheduleBackgroundGlucoseRefresh()

    // Set an expiration handler
    task.expirationHandler = {
      print("[AppDelegate] Background glucose refresh expired")
      task.setTaskCompleted(success: false)
    }

    // Push glucose to Watch and mark task complete when the network call finishes
    WatchSessionManager.shared.pushGlucoseToWatch {
      task.setTaskCompleted(success: true)
      print("[AppDelegate] Background glucose refresh completed")
    }
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
