# Screenshot checklist — LinkLoop Lite

This file lists the screenshot sizes and tips for capturing App Store screenshots for the most common device sizes.

Required device screenshot sizes (minimum):
- 6.7" iPhone (1290 x 2796 px) — e.g., iPhone 14 Pro Max
- 5.5" iPhone (1242 x 2208 px) — e.g., iPhone 8 Plus (legacy)

Optional (recommended):
- 5.8" iPhone (1125 x 2436 px)
- iPad Pro (6th gen) 12.9" (2048 x 2732 px)

Tips:
- Use the in-app flows with test/demo account to capture real UI states (Home, CGM chart, Care Circle invite, Insights screen, Profile)
- Prefer landscape or portrait consistently depending on your app's orientation (this app is portrait-only)
- Avoid device bezels or overlays in the screenshot; use the simulator or device screenshot tools.

How to capture quickly (Simulator):
1. Open the iOS Simulator for the desired device (Xcode → Open Developer Tools → Simulator) or use `npx react-native run-ios --device "iPhone 14 Pro Max"`.
2. Log in with the demo account.
3. Use Simulator menu: File → New Screenshot (or Cmd+S).

Image naming suggestions:
- screenshot-6.7-1.png, screenshot-6.7-2.png
- screenshot-5.5-1.png, screenshot-5.5-2.png

Place final screenshots in a folder `screenshots/` at the repo root for safekeeping and reference when uploading to App Store Connect.
