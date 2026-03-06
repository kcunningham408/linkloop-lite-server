import SwiftUI
import WidgetKit

// MARK: - Shared Defaults
// App Group suite shared between the Watch app and this Widget Extension.
// The Watch app writes glucose data here; the widget reads it for complications.
let sharedDefaults = UserDefaults(suiteName: "group.com.vibecmd.linkloop.watch") ?? .standard

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

    func getSnapshot(in context: Context, completion: @escaping (GlucoseComplicationEntry) -> Void)
    {
        completion(currentEntry())
    }

    func getTimeline(
        in context: Context, completion: @escaping (Timeline<GlucoseComplicationEntry>) -> Void
    ) {
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
