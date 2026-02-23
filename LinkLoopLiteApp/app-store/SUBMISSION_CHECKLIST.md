# App Store Version Release Settings
# ================================================================

## Release Option (pick one in App Store Connect):
# ✅ "Automatically release this version" — recommended
# This means as soon as Apple approves it, it goes live.
# Typical review time: 24-48 hours.

## If you want to control the exact launch moment:
# Select "Manually release this version" instead.
# After approval, you'll click "Release" when you're ready.


# ================================================================
# SUBMISSION CHECKLIST — Do these in App Store Connect
# ================================================================

# 1. App Information
#    - Primary Language: English (U.S.)
#    - Category: Health & Fitness
#    - Secondary Category: Medical
#    - Content Rights: "This app does not contain, show, or access third-party content"
#    - Age Rating: Click "Edit" → answer all questions "No" → result will be 4+

# 2. Pricing and Availability
#    - Price: Free
#    - Availability: All territories

# 3. App Privacy
#    - Follow APP_PRIVACY.md answers

# 4. iOS App → 1.0 Prepare for Submission
#    - Screenshots: Upload at least 3 (see SCREENSHOTS_GUIDE.md)
#    - Promotional Text: Copy from APP_STORE_LISTING.md
#    - Description: Copy from APP_STORE_LISTING.md
#    - Keywords: Copy from APP_STORE_LISTING.md
#    - Support URL: https://linkloop-9l3x.onrender.com/support.html
#    - Marketing URL: https://vibecmd.net/linkloop/
#    - Version: 1.0.0
#    - Copyright: © 2026 VibeCMD LLC
#    - Build: Select the production build (after running eas build)
#    - App Review Information: Copy from APP_REVIEW_INFO.md
#    - Sign-In Required: YES → enter demo credentials
#    - Release: Automatically release this version

# 5. BEFORE hitting "Submit for Review":
#    - Build must be uploaded (eas build + eas submit)
#    - All fields filled (no red warnings)
#    - Screenshots uploaded
#    - App Privacy completed
#    - Export compliance: "No" (uses HTTPS only, not custom encryption)
