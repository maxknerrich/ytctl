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

> [!WARNING]
> Firefox removes temporary add-ons when it quits, **including their stored settings**. ytctl uses a fixed add-on ID, so loading it temporarily in a profile that also has the AMO build installed replaces that build. Quitting Firefox then deletes the settings of both. Develop in a separate profile, e.g. `npx web-ext run --source-dir . --firefox-profile ytctl-dev --profile-create-if-missing --keep-profile-changes`.

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

`manifest.json` and `manifest.firefox.json` are the Firefox manifests. Chrome-specific differences live in `manifest.chrome.json`. Firefox releases must be signed through Mozilla Add-ons; Chrome releases go to the Chrome Web Store (see [Releases](#releases)).

## Development

```bash
npm install
npm test
npm run package
npm run test:e2e
```

`npm run test:e2e` packages the extension and runs it in headless Chrome for Testing and Firefox (`tests/e2e/`). Both browsers are downloaded on first use into `.cache/browsers`. A local proxy plays the part of www.youtube.com, so the tests are deterministic and never touch the network.

- `YTCTL_BROWSERS=chrome` (or `firefox`) runs a single browser.
- `HEADFUL=1` shows the browser windows.
- `YTCTL_CHROME` / `YTCTL_FIREFOX` point at a local binary instead of the download.

`npm run store:screenshots` renders the store listing images into `store/screenshots/` from the real extension UI, using the same Chrome setup. See `store/chrome/listing.md` for where they go.

The popup and settings-page tests only run in Chrome. Firefox can't open extension popups from automation, and it refuses automated input on extension pages.

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

## Releases

The **Release** workflow (`.github/workflows/release.yml`) builds both packages once and submits them to the stores:

1. User-facing pull requests include a changeset.
2. After those pull requests merge, Changesets creates or updates the version PR.
3. Merging the version PR changes `package.json`. That version goes to AMO and the Chrome Web Store, and a GitHub release with both zips is created.

Run the workflow manually to dry-run (leave both stores unticked) or to resubmit one store. Direct pushes to `main` are blocked; all changes go through pull requests and CI.

### Firefox Add-ons

Mozilla reviews listed submissions before publication. Configure these secrets on the `amo` environment:

- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

Create the credentials at [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key/). Listing metadata lives in `store/firefox/amo-metadata.json`.

### Chrome Web Store

Chrome versions are submitted with **staged publishing**. Google reviews each version automatically. Once it is approved it waits in the Developer Dashboard until you press **Publish**, so nothing reaches users without your sign-off. Pick **immediate** when running the workflow manually to skip that step.

The store accepts one pending submission at a time. If a version is still in review, cancel it in the dashboard before submitting the next one.

One-time setup:

1. **Create the item.** In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/), upload `dist/ytctl-chrome-<version>.zip` by hand. Then fill in the listing and privacy tabs using `store/chrome/listing.md`, and submit. Note the item ID and the publisher ID (**Publisher → Settings**).
2. **Create a service account** that GitHub Actions can impersonate without a key, using Workload Identity Federation:

   ```bash
   PROJECT=your-gcp-project
   REPO=maxknerrich/ytctl
   gcloud services enable chromewebstore.googleapis.com iamcredentials.googleapis.com --project "$PROJECT"
   gcloud iam service-accounts create ytctl-release --project "$PROJECT"
   gcloud iam workload-identity-pools create github --location global --project "$PROJECT"
   gcloud iam workload-identity-pools providers create-oidc ytctl --location global --project "$PROJECT" \
     --workload-identity-pool github --issuer-uri https://token.actions.githubusercontent.com \
     --attribute-mapping google.subject=assertion.sub,attribute.repository=assertion.repository \
     --attribute-condition "assertion.repository == '$REPO'"
   POOL="$(gcloud iam workload-identity-pools describe github --location global --project "$PROJECT" --format 'value(name)')"
   gcloud iam service-accounts add-iam-policy-binding "ytctl-release@$PROJECT.iam.gserviceaccount.com" --project "$PROJECT" \
     --role roles/iam.workloadIdentityUser --member "principalSet://iam.googleapis.com/$POOL/attribute.repository/$REPO"
   gcloud iam workload-identity-pools providers describe ytctl --location global --project "$PROJECT" \
     --workload-identity-pool github --format 'value(name)'   # → GCP_WORKLOAD_IDENTITY_PROVIDER
   ```

3. **Link the service account.** Add `ytctl-release@<project>.iam.gserviceaccount.com` under **Account** in the Developer Dashboard.
4. **Configure GitHub.** Create a `chrome-web-store` environment with these variables. They are identifiers, not secrets:
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`: output of the last command above
   - `GCP_SERVICE_ACCOUNT`: `ytctl-release@<project>.iam.gserviceaccount.com`
   - `CWS_PUBLISHER_ID`
   - `CWS_EXTENSION_ID`

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

All settings are stored in `browser.storage.local` on the device. The extension does not store viewing history, sync settings, or send data to external services. Channel metadata is resolved from the active YouTube page; if YouTube has not exposed it in the page yet, the extension may fetch that same YouTube page to identify the stable channel ID.
