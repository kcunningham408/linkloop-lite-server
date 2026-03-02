# LinkLoop — Full Project Report

---

## What Is LinkLoop?

LinkLoop is a mobile app built for people living with Type 1 Diabetes and the people who care about them. It connects a T1D warrior's continuous glucose monitor (CGM) to a private Care Circle of family members, caregivers, and friends — giving everyone real-time visibility into glucose levels, trends, and alerts without needing to be in the same room.

The app pulls live CGM data from Dexcom G6 and G7 sensors, displays it in a clean and modern interface, and uses AI-powered insights to help users understand patterns in their glucose data. It is designed around two roles: the T1D Warrior who wears the sensor, and the Loop Members who follow along and receive alerts when something needs attention.

LinkLoop is not a medical device and does not replace professional medical advice. It is a communication and awareness tool that helps families stay connected through the daily reality of managing Type 1 Diabetes.

---

## Core Features

### Real-Time CGM Integration
LinkLoop connects directly to Dexcom CGM sensors through three supported methods: Dexcom Share (real-time follower data), Dexcom OAuth API (direct account authorization), and Nightscout (a universal CGM bridge that supports virtually any sensor). Glucose readings sync automatically every five minutes via a server-side cron job. The app also refreshes data on the home screen every five minutes and whenever the app returns to the foreground, so the number on screen is always current.

### Care Circle
The Care Circle is the heart of LinkLoop. A T1D Warrior creates a circle, then invites family members or caregivers by sharing a unique invite code. Loop Members who join the circle can see the warrior's live glucose reading, trend arrow, daily chart, and stats — all from their own phone. The warrior appears as a hero card in each member's view, and the full roster shows every member in the circle with their role.

### Smart Alerts
Each user in a Care Circle has their own configurable alert thresholds for low and high glucose levels, along with a customizable high alert delay. When a glucose reading crosses a threshold, LinkLoop sends a push notification to every member of the circle. Alerts are checked per-member, so each person's preferences are respected independently. Push notifications are also sent when someone joins or leaves the circle.

### AI-Powered Insights
LinkLoop uses AI to analyze glucose data and generate plain-language summaries of patterns, time-in-range statistics, and actionable suggestions. Insights are kept short and focused — paragraph-length, not essay-length — so they are easy to read at a glance. Users can refresh insights on demand to get updated analysis based on the latest data.

### Glucose Dashboard
The home screen displays a large glucose ring that shows the current reading with a color-coded glow: green for in-range, yellow for elevated, red for high or low. Below the ring, an interactive SVG chart plots the full day's glucose readings with a smooth curve. Key stats like time-in-range, average glucose, and high/low counts are displayed as animated arc graphics.

### Live Status Indicators
Each member in the Care Circle roster has a pulsing status dot that reflects how recently their data was updated. A green dot means data arrived within the last five minutes. Yellow means five to fifteen minutes. Red means data is more than fifteen minutes old. This gives the circle immediate visual feedback on connectivity and sensor status without needing to open each person's profile.

### Group Chat
The Care Circle includes a built-in group chat so members can communicate directly within the app. Messages are tied to the circle, keeping all diabetes-related conversation in one place.

### Mood and Notes
Warriors can log their mood and add daily notes alongside their glucose data. This adds a human layer to the numbers, helping caregivers understand the full picture beyond just the graph.

### Profile and Settings
Users can configure their display name, notification preferences (push toggle, quiet hours, alert sounds), glucose thresholds, and CGM data source. The profile screen also includes account deletion, a health disclaimer, and links to the privacy policy, terms of service, and support page.

### Glucose Snapshot Sharing
A long-press on the home screen generates a shareable glucose snapshot that can be sent to anyone outside the app — useful for quick updates to someone not in the Care Circle.

### Haptic Feedback
Pull-to-refresh on every screen provides subtle haptic feedback, giving the app a responsive and polished feel throughout.

---

## Technical Stack

- React Native with Expo SDK 54
- Node.js and Express server
- MongoDB for data storage
- Groq AI for glucose insight generation
- Expo Push Notifications
- Dexcom Share API, Dexcom OAuth API, and Nightscout API for CGM data
- Hosted server on Render
- iOS builds through EAS Build, Android builds locally

---

## Design Language

LinkLoop uses a glassmorphism design system built on a deep dark background (#0A0A0F) with frosted-glass card surfaces using blur effects and semi-transparent rgba layers. The tab bar floats above the content as a frosted-glass pill. Typography follows a structured scale, and interactive elements use depth, glow effects, and smooth animations. The overall aesthetic is modern, calm, and medical-grade without feeling clinical.

---

## Development Journey

LinkLoop started as a monorepo combining the mobile app and server, with a T1D blue theme, SMS invite support, and AI-powered insights from day one. The project evolved rapidly through dozens of iterations:

### Foundation (v1.0)
The first version established the core architecture: user authentication, Dexcom OAuth integration, glucose reading storage, Care Circle creation and invites, and AI insight generation. Early work focused on getting real CGM data flowing reliably, fixing OAuth scopes, date format issues, and ensuring readings synced correctly across time zones. A custom app icon and splash screen were designed with the blue gradient infinity symbol that became the LinkLoop brand.

### Role System and Member Views (v1.1)
The app introduced the T1D Warrior and Loop Member role system. Warriors manage their own data and circle. Loop Members see the warrior's data through a dedicated member view. The login screen was redesigned with three modes: Sign In, Sign Up, and Join a Loop. The landing screen was rebuilt with clear calls to action. Dexcom auto-sync was added as a server-side cron job running every five minutes, and the app gained auto-refresh on a timer and on foreground resume.

### Full Revamp (v1.2)
Version 1.2 was a comprehensive rebuild. Performance was improved with local user caching and a Render wake-up ping to handle cold starts. The Care Circle invite system was fixed to allow multiple pending invites. Real user experience issues were addressed by removing placeholder data and fixing edge cases throughout the app.

### Nightscout and Alerts (v1.3)
Nightscout integration was added as a universal CGM bridge, opening LinkLoop to sensors beyond Dexcom. The alert system was enhanced to auto-trigger checks after every glucose sync. Care Circle cleanup was added to account deletion. Circle member removal was fixed. The app was submitted to TestFlight as build 4.

### Major Feature Release (v1.4.0)
Version 1.4.0 was the largest single update, introducing seventeen new features. This release also included a critical fix for Dexcom Share sync after sensor changes — a bug where the sync would break when a warrior replaced their CGM sensor was identified and resolved by clearing stale session data and re-authenticating automatically.

### Visual Overhaul
The entire app received a visual overhaul introducing the glassmorphism design system. Every screen was rebuilt with GlassCard components, frosted-glass blur effects, and the dark #0A0A0F background. The home screen gained the GlucoseRing hero visualization and interactive SVG GlucoseChart. The floating frosted-glass tab bar replaced the standard navigation bar. StatArc components were added for animated glucose statistics.

### Ten UI Infrastructure Upgrades
A series of ten focused upgrades refined the experience: a unified theme system, structured type scale, Ionicons icon set, animated screen headers, card depth system with shadows, glow effects for glucose states, profile hero section, entrance animations, chat UI polish, and haptic feedback across the app.

### Care Circle Redesign
The Care Circle screen was fully redesigned with glassmorphism. The member view was rebuilt to show the warrior as a prominent hero card in the roster. Warrior management controls were hidden from regular members for a cleaner experience.

### Seven UX Upgrades (Latest)
The most recent update delivered seven UX improvements in a single commit: a dedicated Circle tab in the Loop Member navigation, glassmorphism treatment on the Insights and Profile screens, pull-to-refresh haptics on all nine screens, long-press glucose snapshot sharing on the home screen, live pulsing status dots for Care Circle members, and server-side push notifications for circle join and leave events.

---

## Current Status

### iOS — Live on TestFlight
LinkLoop is currently live on Apple TestFlight. The app has been submitted, reviewed, and approved for beta testing. Version 1.4.0 (build 4) is the current TestFlight release. Beta testers can install and use the full app through TestFlight, and feedback from real users with real Dexcom sensors is being collected.

### Android — Google Play Store In Progress
Android builds are being produced locally using EAS Build. The APK and AAB files have been generated successfully. The next step is completing the Google Play Store listing and submitting the app for review. The goal is to have LinkLoop available on both platforms so that Care Circle members on Android and iOS can all stay connected.

---

## What Makes LinkLoop Different

Most CGM apps are built for the person wearing the sensor. LinkLoop is built for everyone around them too. The Care Circle model means a parent can glance at their phone and see their child's glucose level in real time. A spouse can get an alert if their partner goes low overnight. A friend can understand what a T1D warrior deals with every day — not through explanation, but through shared visibility.

The app treats diabetes management as a team effort. The warrior is at the center, but the loop around them matters just as much. That is what LinkLoop is about: keeping the people who care in the loop, automatically, without the warrior having to send a text or make a call every time something changes.

---

## About the Developer

LinkLoop was designed and built as a solo project driven by a personal connection to Type 1 Diabetes. Every feature was shaped by real conversations with T1D warriors and their families, and every update was tested against real Dexcom sensor data. The app represents a commitment to making diabetes management a little less isolating and a lot more connected.

---

LinkLoop — Keeping your circle in the loop.
