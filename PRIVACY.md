# ytctl privacy policy

_Effective 21 October 2026_

ytctl is a browser extension that controls YouTube's playback speed. It does not collect, sell, or share any personal data.

## What ytctl stores

Your settings are kept in your browser's local extension storage (`storage.local`) on your device:

- default speeds, speed profiles, and hotkeys
- creator rules: the channel ID, name, and avatar URL of each creator you set a rule for

None of it leaves your device. Settings are not synced, and you can delete them at any time by removing the extension. A JSON backup is only created when you export one, and it is saved where you choose.

## What ytctl reads

On YouTube pages, ytctl reads which channel the current video belongs to, so it can apply your rule for that creator. It does not record your viewing history.

If YouTube hasn't put the channel ID into the page yet, ytctl may request the same YouTube page again to find it. That request goes only to youtube.com, the site you are already on. The popup and settings page show creator avatars, which your browser loads from YouTube's image servers. Both are covered by [Google's privacy policy](https://policies.google.com/privacy).

## What ytctl doesn't do

- no analytics, tracking, or telemetry
- no accounts, and no servers of its own
- no data sent to the developer or any third party
- no remote code

## Permissions

- **storage**: saves your settings on your device.
- **youtube.com**: runs on YouTube to identify the video's creator and set the playback speed. ytctl does not run on any other site.

## Changes and contact

Changes to this policy are published in this file, with the date above updated. Questions can be asked in the project's [GitHub issues](https://github.com/maxknerrich/ytctl/issues).
