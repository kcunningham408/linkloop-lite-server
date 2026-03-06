import SwiftUI

struct PairCodeView: View {
    @EnvironmentObject var glucoseManager: GlucoseManager
    @State private var code: String = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String? = nil
    @FocusState private var isFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Image(systemName: "applewatch.and.arrow.forward")
                    .font(.system(size: 36))
                    .foregroundColor(.blue)

                Text("Pair Watch")
                    .font(.system(size: 16, weight: .bold))

                Text("Open LinkLoop on iPhone,\ngo to Settings → Watch\nand enter the code below")
                    .font(.system(size: 11))
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)

                // Code entry
                TextField("000000", text: $code)
                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                    .multilineTextAlignment(.center)
                    .focused($isFocused)
                    .onChange(of: code) { newValue in
                        // Only allow digits, max 6
                        let filtered = String(newValue.filter { $0.isNumber }.prefix(6))
                        if filtered != newValue {
                            code = filtered
                        }
                    }

                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                }

                Button(action: {
                    Task { await submitCode() }
                }) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Text("Connect")
                            .font(.system(size: 14, weight: .semibold))
                    }
                }
                .disabled(code.count != 6 || isSubmitting)
                .buttonStyle(.borderedProminent)
                .tint(.blue)
            }
            .padding(.horizontal, 8)
        }
        .onAppear {
            isFocused = true
        }
    }

    private func submitCode() async {
        isSubmitting = true
        errorMessage = nil

        let baseURL = "https://linkloop-9l3x.onrender.com/api"
        guard let url = URL(string: "\(baseURL)/auth/watch-claim") else {
            errorMessage = "Invalid URL"
            isSubmitting = false
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15

        let body = ["code": code]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                errorMessage = "No response"
                isSubmitting = false
                return
            }

            if httpResponse.statusCode == 401 {
                errorMessage = "Invalid or expired code.\nGet a new code from iPhone."
                isSubmitting = false
                return
            }

            if httpResponse.statusCode != 200 {
                errorMessage = "Error (\(httpResponse.statusCode))"
                isSubmitting = false
                return
            }

            // Parse the response
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let token = json["token"] as? String
            {

                // Save the token and user info
                await MainActor.run {
                    glucoseManager.setAuthToken(token)
                }

                // Apply role + thresholds from response
                if let user = json["user"] as? [String: Any] {
                    let role = user["role"] as? String ?? "warrior"
                    let linkedOwnerId = user["linkedOwnerId"] as? String
                    let low = user["lowThreshold"] as? Int ?? 70
                    let high = user["highThreshold"] as? Int ?? 180

                    await MainActor.run {
                        glucoseManager.setRole(role, linkedOwnerId: linkedOwnerId)
                        glucoseManager.lowThreshold = low
                        glucoseManager.highThreshold = high
                    }
                }
            } else {
                errorMessage = "Bad response from server"
            }
        } catch {
            errorMessage = "Connection failed.\nCheck your internet."
        }

        isSubmitting = false
    }
}
