import SwiftUI
import WidgetKit

// MARK: - Shared Defaults
// On watchOS, the Watch app and its embedded extensions share the same
// UserDefaults.standard container, so no App Groups needed.
let sharedDefaults = UserDefaults.standard

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

    func getSnapshot(in context: Context, completion: @escaping (GlucoseComplicationEntry) -> Void) {
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<GlucoseComplicationEntry>) -> Void) {
        let entry = currentEntry()
        let next = Calendar.current.date(byAdding: .minute, value: 5, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(next))
        completion(timeline)
    }

    private func currentEntry() -> GlucoseComplicationEntry {
        let defaults = sharedDefaults
        let glucose = defaults.object(forKey: "complication_glucose") as? Int
        let trend = defaults.string(forKey: "complication_trend") ?? "stable"
        let low = defaults.object(forKey: "complication_low") as? Int ?? 70
        let high = defaults.object(forKey: "complication_high") as? Int ?? 180

        var readingDate: Date? = nil
        let ts = defaults.double(forKey: "complication_timestamp")
        if ts > 0 {
            readingDate = Date(timeIntervalSince1970: ts)
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
    default: return "→"
    }
}

private func minutesAgo(_ date: Date?) -> Int {
    guard let date = date else { return 0 }
    return Int(Date().timeIntervalSince(date) / 60)
}

// MARK: - Circular Complication

struct GlucoseCircularComplication: View {
    let entry: GlucoseComplicationEntry

    private var progress: CGFloat {
        guard let glucose = entry.glucose else { return 0.5 }
        let clamped = min(max(Double(glucose), 40), 400)
        return CGFloat((clamped - 40) / 360)
    }

    var body: some View {
        if let glucose = entry.glucose {
            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.2), lineWidth: 4)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        glucoseColor(glucose, low: entry.lowThreshold, high: entry.highThreshold),
                        style: StrokeStyle(lineWidth: 4, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                VStack(spacing: -2) {
                    Text("\(glucose)")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundColor(glucoseColor(glucose, low: entry.lowThreshold, high: entry.highThreshold))
                        .minimumScaleFactor(0.6)
                    Text(trendArrow(entry.trend))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(glucoseColor(glucose, low: entry.lowThreshold, high: entry.highThreshold))
                }
            }
        } else {
            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.2), lineWidth: 4)
                Image(systemName: "drop.circle")
                    .font(.system(size: 18))
                    .foregroundColor(.gray)
            }
        }
    }
}

// MARK: - Rectangular Complication

struct GlucoseRectangularComplication: View {
    let entry: GlucoseComplicationEntry

    var body: some View {
        if let glucose = entry.glucose {
            HStack(spacing: 6) {
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 2) {
                        Text("\(glucose)")
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundColor(glucoseColor(glucose, low: entry.lowThreshold, high: entry.highThreshold))
                        Text(trendArrow(entry.trend))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(glucoseColor(glucose, low: entry.lowThreshold, high: entry.highThreshold))
                    }
                    HStack(spacing: 3) {
                        Image(systemName: "drop.fill")
                            .font(.system(size: 8))
                            .foregroundColor(.blue)
                        let mins = minutesAgo(entry.readingDate)
                        Text(mins < 1 ? "Just now" : "\(mins)m ago")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(mins > 10 ? .orange : .gray)
                    }
                }
                Spacer()
                let range = glucose < entry.lowThreshold ? "LOW" : (glucose > entry.highThreshold ? "HIGH" : "OK")
                Text(range)
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundColor(glucoseColor(glucose, low: entry.lowThreshold, high: entry.highThreshold))
            }
        } else {
            HStack {
                Image(systemName: "drop.circle")
                    .font(.system(size: 16))
                    .foregroundColor(.blue.opacity(0.5))
                Text("No glucose data")
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
            }
        }
    }
}

// MARK: - Inline Complication

struct GlucoseInlineComplication: View {
    let entry: GlucoseComplicationEntry

    var body: some View {
        if let glucose = entry.glucose {
            let mins = minutesAgo(entry.readingDate)
            let timeStr = mins < 1 ? "now" : "\(mins)m"
            Text("\(glucose) \(trendArrow(entry.trend)) mg/dL · \(timeStr)")
                .font(.system(size: 12, weight: .semibold))
        } else {
            Text("LinkLoop — mg/dL")
                .font(.system(size: 12))
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
        .description("Current blood glucose reading")
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
        .description("Glucose reading with trend and time")
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
        .description("Glucose value in a single line")
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
