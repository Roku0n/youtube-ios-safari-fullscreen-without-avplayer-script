[中文](README.md) | English

# YouTube iPhone iOS Safari Faux-Fullscreen (Userscript)

A userscript for iPhone iOS Safari: when you tap the fullscreen button on a YouTube mobile web (`m.youtube.com`) video, the player fills the entire screen, but **without triggering iOS's native fullscreen video player**. The player controls (play/pause, progress bar, time, settings, etc.) stay as regular DOM elements in the page and keep rendering normally.

## Why

On iPhone iOS Safari, once a `<video>` element enters native fullscreen, the frame is handed off to the system's own video player. Any DOM overlay on the page (subtitles, translation overlays, custom UI, etc.) can no longer be shown on top of the video. This script intercepts the fullscreen request and manually fills the player container with CSS instead, avoiding that limitation.

## What it does

- Fills the player container to the full visual viewport (tracks `visualViewport` live, so it adapts through Safari's toolbar show/hide animation)
- Moves the progress bar and the bottom control bar (time display, exit-fullscreen button) up together, clear of the iPhone Home indicator's gesture area, without breaking progress-bar dragging
- Ships a built-in debug panel that doesn't depend on a browser console (tap the `▣` button in the top-left corner)

## Installation

1. Install the [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) app and its Safari extension on iOS
2. Open the Userscripts app and set a save directory for scripts (an iCloud Drive folder works well if you want it synced across devices)
3. Save `youtube-ios-fullscreen.user.js` into that directory
4. Enable the Userscripts extension in Safari's extension settings, and grant it permission on `m.youtube.com`
5. Open any video on `m.youtube.com` and tap the fullscreen button to test

## Known limitations

- **iPhone iOS Safari only.** Not tested on iPadOS — iPadOS natively supports `Element.requestFullscreen()` on arbitrary elements, unlike iPhone, so this script's workaround likely doesn't apply there and probably isn't needed. Also not tested on other iOS browsers (e.g. Chrome for iOS, which is still WebKit under the hood).
- **The like/dislike/save buttons and the "up next" recommendation card** (the two clusters that stay pinned in the bottom-left/bottom-right corners during real fullscreen on Android) can't currently be reproduced. Internally, YouTube calls these `fullscreenEngagementOverlayRenderer` / `playerOverlayAutoplayRenderer`, and its own player JS only creates them when the browser is genuinely in `document.fullscreenElement` state — they get torn down the moment fullscreen exits. Since this script intercepts the real `requestFullscreen()` call up front (specifically to avoid the native player taking over), YouTube's own fullscreen-handling code — including whatever creates these two overlays — never actually runs. Faking `fullscreenElement`-related properties and dispatching a `fullscreenchange` event afterward doesn't retroactively trigger that creation logic either.
- Only tested on `m.youtube.com` (mobile web). YouTube's frontend changes periodically, so the selectors/class names this script relies on may break over time and need re-adapting.

## Version

Current version is 1.0, the first public release.

## License

MIT, see [LICENSE](LICENSE).
