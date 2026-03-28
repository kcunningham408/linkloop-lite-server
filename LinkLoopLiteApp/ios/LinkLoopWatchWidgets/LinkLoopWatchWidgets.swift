import SwiftUI
import WidgetKit
import HealthKit

// MARK: - Shared Constants
let kGlucoseDataChangedNotification = "com.vibecmd.linkloop.glucoseChanged"

// MARK: - Shared Defaults
let sharedDefaults = UserDefaults(suiteName: "group.com.vibecmd.linkloop.watch") ?? .standard

/// File URL for reading glucose data from App Group container
var glucoseDataFileURL: URL? {
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.vibecmd.linkloop.watch") else {
        return nil
    }
    return containerURL.appendingPathComponent("glucose_data.json")
}

// MARK: - Timeline Entry

struct GlucoseComplicationEntry: TimelineEntry {
    let date: Date
    let glucose: Int?
    let trend: String
    let readingDate: Date?
    let lowThreshold: Int
    let highThreshold: Int
}

// MARK: - Timeline Provider

struct GlucoseTimelineProvider: TimelineProvider {
    
    private let healthStore = HKHealthStore()
    private let glucoseType = HKQuantityType.quantityType(forIdentifier: .bloodGlucose)!
    private let mgdLUnit = HKUnit(from: "mg/dL")

    func placeholder(in context: Context) -> GlucoseComplicationEntry {
        GlucoseComplicationEntry(
            date: Date(),
            glucose: 120,
            trend: "stable",
            readingDate: Date(),
            lowThreshold: 70,
            highThreshold: 180
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (GlucoseComplicationEntry) -> Void)
    {
        // Try HealthKit first, then cached data
        fetchFromHealthKit { hkEntry in
            completion(hkEntry ?? self.cachedEntry())
        }
    }

    func getTimeline(
        in context: Context, completion: @escaping (Timeline<GlucoseComplicationEntry>) -> Void
    ) {
        // Read directly from HealthKit — no relay through watch app needed.
        // Falls back to App Group cache for members or if HealthKit is unavailable.
        fetchFromHealthKit { hkEntry in
            let base = hkEntry ?? self.cachedEntry()
            let now = Date()

            // Generate entries every 1 minute for 5 minutes so the
            // "X min ago" counter stays visually fresh.
            var entries: [GlucoseComplicationEntry] = []
            for i in 0..<6 {
                let entryDate = Calendar.current.date(byAdding: .minute, value: i, to: now) ?? now
                entries.append(GlucoseComplicationEntry(
                    date: entryDate,
                    glucose: base.glucose,
                    trend: base.trend,
                    readingDate: base.readingDate,
                    lowThreshold: base.lowThreshold,
                    highThreshold: base.highThreshold
                ))
            }

            // Request a fresh timeline 5 minutes from now.
            // CGM data arrives every ~5 minutes, so this keeps pace.
            let refreshDate = Calendar.current.date(byAdding: .minute, value: 5, to: now) ?? now
            let timeline = Timeline(entries: entries, policy: .after(refreshDate))
            completion(timeline)
        }
    }

    // MARK: - HealthKit Direct Read

    /// Fetch the latest glucose sample(s) directly from HealthKit.
    /// Returns nil if HealthKit is unavailable or has no data (e.g. member role).
    private func fetchFromHealthKit(completion: @escaping (GlucoseComplicationEntry?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("[Widget] HealthKit not available on this device")
            completion(nil)
            return
        }

        // If authorization hasn't been determined yet (user never opened watch app),
        // we can't prompt from a widget — fall back to cached data.
        let status = healthStore.authorizationStatus(for: glucoseType)
        if status == .sharingDenied {
            print("[Widget] HealthKit authorization denied, using cache")
            completion(nil)
            return
        }

        let predicate = HKQuery.predicateForSamples(
            withStart: Date().addingTimeInterval(-3600), // last hour
            end: Date(),
            options: .strictEndDate
        )
        let sortDescriptor = NSSortDescriptor(
            key: HKSampleSortIdentifierStartDate, ascending: false)

        let query = HKSampleQuery(
            sampleType: glucoseType,
            predicate: predicate,
            limit: 5,
            sortDescriptors: [sortDescriptor]
        ) { _, results, error in
            if let error = error {
                print("[Widget] HealthKit query error: \(error.localizedDescription)")
                completion(nil)
                return
            }
            guard let samples = results as? [HKQuantitySample], !samples.isEmpty else {
                print("[Widget] No HealthKit samples found, using cache")
                completion(nil)
                return
            }

            let latest = samples[0]
            let value = Int(round(latest.quantity.doubleValue(for: self.mgdLUnit)))
            let trend = self.inferTrend(from: samples)

            // Read thresholds from App Group (set by watch app / phone)
            let low = sharedDefaults.object(forKey: "complication_low") as? Int ?? 70
            let high = sharedDefaults.object(forKey: "complication_high") as? Int ?? 180

            let entry = GlucoseComplicationEntry(
                date: Date(),
                glucose: value,
                trend: trend,
                readingDate: latest.startDate,
                lowThreshold: low,
                highThreshold: high
            )
            print("[Widget] HealthKit direct read: \(value) mg/dL \(trend), \(Int(Date().timeIntervalSince(latest.startDate)/60))m ago")
            completion(entry)
        }

        healthStore.execute(query)
    }

    /// Infer trend direction from the last few HealthKit samples.
    private func inferTrend(from samples: [HKQuantitySample]) -> String {
        guard samples.count >= 2 else { return "stable" }

        let latestValue = samples[0].quantity.doubleValue(for: mgdLUnit)
        let previousValue = samples[1].quantity.doubleValue(for: mgdLUnit)
        let timeDelta = samples[0].startDate.timeIntervalSince(samples[1].startDate) / 60.0

        guard timeDelta > 0 && timeDelta < 15 else { return "stable" }

        let rate = (latestValue - previousValue) / timeDelta
        if rate > 3.0 { return "risingFast" }
        if rate > 1.0 { return "rising" }
        if rate > 0.5 { return "risingSlightly" }
        if rate < -3.0 { return "fallingFast" }
        if rate < -1.0 { return "falling" }
        if rate < -0.5 { return "fallingSlightly" }
        return "stable"
    }

    // MARK: - Cached Data Fallback (App Group)

    /// Read cached data from App Group — used for member role (API-based)
    /// or when HealthKit isn't available.
    private func cachedEntry() -> GlucoseComplicationEntry {
        var glucose: Int?
        var trend: String = "stable"
        var readingDate: Date?
        var low: Int = 70
        var high: Int = 180
        
        // First: Try reading from JSON file (more reliable)
        if let fileURL = glucoseDataFileURL,
           let data = try? Data(contentsOf: fileURL),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            
            glucose = json["glucose"] as? Int
            trend = json["trend"] as? String ?? "stable"
            low = json["lowThreshold"] as? Int ?? 70
            high = json["highThreshold"] as? Int ?? 180
            
            if let ts = json["timestamp"] as? TimeInterval, ts > 0 {
                readingDate = Date(timeIntervalSince1970: ts)
            }
            
            print("[Widget] Cache from JSON file: glucose=\(glucose ?? -1), trend=\(trend)")
        }
        
        // Second: Fall back to UserDefaults if file didn't have data
        if glucose == nil {
            glucose = sharedDefaults.object(forKey: "complication_glucose") as? Int
            trend = sharedDefaults.string(forKey: "complication_trend") ?? "stable"
            low = sharedDefaults.object(forKey: "complication_low") as? Int ?? 70
            high = sharedDefaults.object(forKey: "complication_high") as? Int ?? 180
            
            let ts = sharedDefaults.double(forKey: "complication_timestamp")
            if ts > 0 {
                readingDate = Date(timeIntervalSince1970: ts)
            }
            print("[Widget] Cache from UserDefaults: glucose=\(glucose ?? -1), trend=\(trend)")
        }

        return GlucoseComplicationEntry(
            date: Date(),
            glucose: glucose,
            trend: trend,
            readingDate: readingDate,
            lowThreshold: low,
            highThreshold: high
        )
    }

}

// MARK: - Helpers

private func glucoseColor(_ value: Int, low: Int, high: Int) -> Color {
    if value < low { return .red }
    if value > high { return .orange }
    return .green
}

private func trendArrow(_ trend: String) -> String {
    switch trend.lowercased() {
    case "rising", "risingfast", "rising_fast": return "↑"
    case "risingslightly", "rising_slightly": return "↗"
    case "falling", "fallingfast", "falling_fast": return "↓"
    case "fallingslightly", "falling_slightly": return "↘"
    case "stable", "flat": return "→"
    default: return ""
    }
}

private func minutesAgo(_ date: Date?) -> Int {
    guard let date = date else { return 0 }
    return Int(Date().timeIntervalSince(date) / 60)
}

// MARK: - Circular Complication
// Shows JUST the glucose number — big, bold, color-coded.
// Like a battery percentage: the number IS the complication.

struct GlucoseCircularComplication: View {
    let entry: GlucoseComplicationEntry

    var body: some View {
        if let glucose = entry.glucose {
            let color = glucoseColor(glucose, low: entry.lowThreshold, high: entry.highThreshold)
            let arrow = trendArrow(entry.trend)
            VStack(spacing: -1) {
                Text("\(glucose)")
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundColor(color)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                if !arrow.isEmpty {
                    Text(arrow)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(color)
                }
            }
        } else {
            Text("--")
                .font(.system(size: 22, weight: .heavy, design: .rounded))
                .foregroundColor(.gray)
        }
    }
}

// MARK: - Corner Complication
// Shows the glucose number for corner slots (e.g. top-left, bottom-right of watch face)

struct GlucoseCornerComplication: View {
    let entry: GlucoseComplicationEntry

    var body: some View {
        if let glucose = entry.glucose {
            let color = glucoseColor(glucose, low: entry.lowThreshold, high: entry.highThreshold)
            let arrow = trendArrow(entry.trend)
            Text("\(glucose)\(arrow)")
                .font(.system(size: 20, weight: .heavy, design: .rounded))
                .foregroundColor(color)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
        } else {
            Text("--")
                .font(.system(size: 20, weight: .heavy, design: .rounded))
                .foregroundColor(.gray)
        }
    }
}

// MARK: - Rectangular Complication
// Shows glucose number prominently with trend arrow and time since last reading.

struct GlucoseRectangularComplication: View {
    let entry: GlucoseComplicationEntry

    var body: some View {
        if let glucose = entry.glucose {
            let color = glucoseColor(glucose, low: entry.lowThreshold, high: entry.highThreshold)
            let arrow = trendArrow(entry.trend)
            let mins = minutesAgo(entry.readingDate)
            HStack(spacing: 4) {
                // Big glucose number — the main attraction
                Text("\(glucose)")
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    .foregroundColor(color)
                    .minimumScaleFactor(0.6)

                VStack(alignment: .leading, spacing: 1) {
                    if !arrow.isEmpty {
                        Text(arrow)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(color)
                    }
                    Text(mins < 1 ? "now" : "\(mins)m")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundColor(mins > 10 ? .orange : .gray)
                }

                Spacer()

                // Range badge
                let range =
                    glucose < entry.lowThreshold
                    ? "LOW" : (glucose > entry.highThreshold ? "HIGH" : "")
                if !range.isEmpty {
                    Text(range)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(color)
                }
            }
        } else {
            HStack {
                Text("--")
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    .foregroundColor(.gray)
                Spacer()
                Text("No data")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.gray)
            }
        }
    }
}

// MARK: - Inline Complication
// Single line of text: "120→ mg/dL · 2m"

struct GlucoseInlineComplication: View {
    let entry: GlucoseComplicationEntry

    var body: some View {
        if let glucose = entry.glucose {
            let arrow = trendArrow(entry.trend)
            let mins = minutesAgo(entry.readingDate)
            let timeStr = mins < 1 ? "now" : "\(mins)m"
            Text("\(glucose)\(arrow) mg/dL · \(timeStr)")
        } else {
            Text("-- mg/dL")
        }
    }
}

// MARK: - Widget Definitions

struct GlucoseCircularWidget: Widget {
    let kind = "GlucoseCircular"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GlucoseTimelineProvider()) { entry in
            GlucoseCircularComplication(entry: entry)
                .containerBackground(.black, for: .widget)
        }
        .configurationDisplayName("Glucose")
        .description("Live glucose number on your watch face")
        .supportedFamilies([.accessoryCircular, .accessoryCorner])
    }
}

struct GlucoseRectangularWidget: Widget {
    let kind = "GlucoseRectangular"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GlucoseTimelineProvider()) { entry in
            GlucoseRectangularComplication(entry: entry)
                .containerBackground(.black, for: .widget)
        }
        .configurationDisplayName("Glucose Detail")
        .description("Glucose number with trend and time")
        .supportedFamilies([.accessoryRectangular])
    }
}

struct GlucoseInlineWidget: Widget {
    let kind = "GlucoseInline"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GlucoseTimelineProvider()) { entry in
            GlucoseInlineComplication(entry: entry)
                .containerBackground(.black, for: .widget)
        }
        .configurationDisplayName("Glucose Inline")
        .description("Glucose number in a single line")
        .supportedFamilies([.accessoryInline])
    }
}

// MARK: - Widget Bundle Entry Point

@main
struct LinkLoopWidgetBundle: WidgetBundle {
    var body: some Widget {
        GlucoseCircularWidget()
        GlucoseRectangularWidget()
        GlucoseInlineWidget()
    }
}
