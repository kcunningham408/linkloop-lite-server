import SwiftUI

struct GlucoseView: View {
    @EnvironmentObject var glucoseManager: GlucoseManager

    var body: some View {
        VStack(spacing: 4) {
            if glucoseManager.isConnected {
                if let glucose = glucoseManager.currentGlucose {
                    // Glucose Ring
                    ZStack {
                        // Background ring
                        Circle()
                            .stroke(Color.gray.opacity(0.2), lineWidth: 8)
                            .frame(width: 120, height: 120)

                        // Colored ring
                        Circle()
                            .trim(from: 0, to: ringProgress(glucose))
                            .stroke(
                                glucoseColor(glucose),
                                style: StrokeStyle(lineWidth: 8, lineCap: .round)
                            )
                            .frame(width: 120, height: 120)
                            .rotationEffect(.degrees(-90))

                        // Glucose value + trend
                        VStack(spacing: 0) {
                            HStack(spacing: 2) {
                                Text("\(glucose)")
                                    .font(.system(size: 42, weight: .bold, design: .rounded))
                                    .foregroundColor(glucoseColor(glucose))

                                Text(glucoseManager.trendArrow)
                                    .font(.system(size: 24, weight: .bold))
                                    .foregroundColor(glucoseColor(glucose))
                            }

                            Text("mg/dL")
                                .font(.system(size: 11))
                                .foregroundColor(.gray)
                        }
                    }

                    // Range label
                    Text(glucoseManager.currentRange.label)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(glucoseColor(glucose))

                    // Time since reading
                    let mins = glucoseManager.minutesSinceReading
                    Text(mins < 1 ? "Just now" : "\(mins)m ago")
                        .font(.system(size: 11))
                        .foregroundColor(mins > 10 ? .orange : .gray)

                } else if glucoseManager.isLoading {
                    ProgressView()
                        .padding()
                    Text("Loading...")
                        .font(.caption)
                        .foregroundColor(.gray)
                } else {
                    Image(systemName: "drop.circle")
                        .font(.system(size: 40))
                        .foregroundColor(.blue.opacity(0.5))
                    Text("No readings")
                        .font(.caption)
                        .foregroundColor(.gray)
                }

                // Alert badge
                if glucoseManager.activeAlertCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 10))
                        Text(
                            "\(glucoseManager.activeAlertCount) alert\(glucoseManager.activeAlertCount == 1 ? "" : "s")"
                        )
                        .font(.system(size: 11))
                    }
                    .foregroundColor(.orange)
                }
            } else {
                // Not connected — show pairing screen
                PairCodeView()
            }
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Helpers
    private func glucoseColor(_ value: Int) -> Color {
        switch glucoseManager.glucoseColor(for: value) {
        case .low: return .red
        case .inRange: return .green
        case .high: return .orange
        }
    }

    private func ringProgress(_ value: Int) -> CGFloat {
        // Map glucose 40-400 to ring progress 0-1
        let clamped = min(max(Double(value), 40), 400)
        return CGFloat((clamped - 40) / 360)
    }
}
