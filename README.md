# ytctl

**Better controls for YouTube.**

The first ytctl feature is flexible playback-speed control with hotkeys, user-created profiles, and per-creator rules.

## Features

- Playback speeds from 0.25× to 4×
- Customizable increase, decrease, reset, and profile-slot hotkeys
- Unlimited user-created profiles with up to nine hotkey slots
- Separate defaults and creator rules for regular videos and Shorts
- Temporary speed changes that never overwrite rules automatically
- Creator profile or custom-speed assignments from the toolbar popup
- Searchable creator-rule management in Settings
- Local-only storage with JSON backup and restore
- Live streams fixed at 1× and ads left untouched

## Install temporarily for development

1. Open `about:debugging` in Firefox.
2. Select **This Firefox**.
3. Select **Load Temporary Add-on…**.
4. Choose this repository's `manifest.json`.
5. Open a YouTube video and pin the extension to the toolbar if desired.

Temporary extensions are removed when Firefox restarts. A persistent installation must be packaged and signed through Mozilla Add-ons.

## Default hotkeys

- `Alt + Shift + ↑`: increase speed
- `Alt + Shift + ↓`: decrease speed
- `Alt + Shift + 0`: reset to the applicable creator rule or default
- `Alt + Shift + P`: open the toolbar popup
- `Alt + Shift + 1` through `9`: temporarily activate the profile in that slot

Hotkeys can be changed or cleared in the extension's Settings page. They are ignored while focus is in a text or editable field.

## Data

All settings are stored in `browser.storage.local`. The extension does not store viewing history, use Firefox Sync, or send data to external services. Channel metadata is resolved from the active YouTube page; if YouTube has not exposed it in the page yet, the extension may fetch that same YouTube page to identify the stable channel ID.
