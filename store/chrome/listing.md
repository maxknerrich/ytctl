# Chrome Web Store listing

Copy for the fields the Developer Dashboard asks for. The API only uploads
packages, so the listing and privacy tabs are filled in by hand once.

## Store listing

- **Name:** ytctl
- **Summary:** Playback-speed hotkeys, profiles, and creator-specific rules for YouTube.
- **Category:** Tools
- **Language:** English
- **Homepage:** https://github.com/maxknerrich/ytctl
- **Description:**

  > Better controls for YouTube.
  >
  > ytctl gives you flexible playback-speed control without silently changing your saved preferences.
  >
  > • Customizable playback-speed hotkeys
  > • Unlimited speed profiles, up to nine with their own hotkey
  > • Separate defaults for regular videos and Shorts
  > • Per-creator profile or custom-speed rules
  > • Temporary speed changes that never overwrite your rules
  > • JSON backup and restore
  > • Live streams and ads are left untouched
  >
  > All settings stay in your browser. ytctl does not collect analytics, viewing history, or personal data.

## Graphic assets

Upload from `store/screenshots/` (regenerate with `npm run store:screenshots`):

- **Screenshots (1280×800):** `1-creator-rules.png`, `2-hotkeys.png`, `3-settings.png`, `4-themes.png`
- **Small promo tile (440×280):** `promo-small.png`

The same four screenshots go on the AMO listing (Developer Hub → Edit Product Page → Media).

## Privacy practices

- **Single purpose:** Control YouTube playback speed with hotkeys, reusable speed profiles, and per-creator rules.
- **storage:** Saves the user's speed defaults, profiles, hotkeys, and creator rules locally.
- **Host permission (youtube.com):** The content script runs on YouTube to read the current video's creator and set the video's playback speed. The extension only reads and changes YouTube pages.
- **Remote code:** No, the extension does not use remote code.
- **Data usage:** No user data is collected or transmitted. Tick none of the data categories, then confirm all three certifications.
- **Privacy policy URL:** https://github.com/maxknerrich/ytctl/blob/main/PRIVACY.md
