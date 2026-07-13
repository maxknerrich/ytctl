# ytctl

**Better controls for YouTube.**

The first ytctl feature is flexible playback-speed control with hotkeys, user-created profiles, and per-creator rules.

> **Status:** `0.1.x` beta. Versioning follows [Epoch Semantic Versioning](VERSIONING.md).

## Features

- Playback speeds from 0.25× to 4×
- Customizable increase, decrease, reset, and profile-slot hotkeys
- Unlimited user-created profiles with up to nine hotkey slots
- Separate defaults and creator rules for regular videos and Shorts
- Temporary speed changes that never overwrite rules automatically
- Creator profile or custom-speed assignments from the toolbar popup
- Searchable creator-rule management with channel avatars in Settings
- Local-only storage with JSON backup and restore
- Live streams fixed at 1× and ads left untouched

## Install temporarily for development

### Firefox

1. Open `about:debugging`.
2. Select **This Firefox**.
3. Select **Load Temporary Add-on…**.
4. Choose this repository's `manifest.json`.
5. Reload any YouTube tabs that were already open.

### Chrome

1. Run `./scripts/package.sh`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose `dist/chrome`.
6. Reload any YouTube tabs that were already open.

## Package releases

Run:

```bash
./scripts/package.sh
```

This creates:

- `dist/ytctl-firefox-<version>.zip`
- `dist/ytctl-chrome-<version>.zip`
- `dist/firefox` and `dist/chrome` unpacked development builds

`manifest.json` and `manifest.firefox.json` are the Firefox manifests. Chrome-specific differences live in `manifest.chrome.json`. Firefox releases must be signed through Mozilla Add-ons; Chrome releases can be uploaded to the Chrome Web Store.

## Development

```bash
npm install
npm test
npm run package
```

## Versioning with Changesets

Add a changeset with each user-facing pull request:

```bash
npm run changeset
```

To consume pending changesets and update `CHANGELOG.md`, `package.json`, and all extension manifests:

```bash
npm run changeset:version
```

Commit the generated version changes, then run `npm run package` to produce the browser archives.

## Publish to Firefox Add-ons

The manually triggered **Publish Firefox** workflow validates and submits the extension to AMO. Configure these GitHub Actions repository secrets first:

- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

Create the credentials at [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key/). Then open **Actions → Publish Firefox → Run workflow**. Leave **Submit to AMO** disabled for a dry run that tests, packages, lints, and uploads the artifact without publishing. Enable it and select the `listed` channel when ready to submit. The initial listing metadata is stored in `store/firefox/amo-metadata.json`.

Mozilla reviews listed submissions before publication. Subsequent submissions must use a new version generated through Changesets.

## Default hotkeys

- `Alt + Shift + ↑`: increase speed
- `Alt + Shift + ↓`: decrease speed
- `Alt + Shift + 0`: reset to the applicable creator rule or default
- `Alt + Shift + P`: open the toolbar popup
- `Alt + Shift + 1` through `9`: temporarily activate the profile in that slot

Hotkeys can be changed or cleared in the extension's Settings page. They are ignored while focus is in a text or editable field.

## License

[MIT](LICENSE) © 2026 Max Knerrich

## Data

All settings are stored in `browser.storage.local`. The extension does not store viewing history, use Firefox Sync, or send data to external services. Channel metadata is resolved from the active YouTube page; if YouTube has not exposed it in the page yet, the extension may fetch that same YouTube page to identify the stable channel ID.
