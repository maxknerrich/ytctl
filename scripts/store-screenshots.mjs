// Renders the store listing images into store/screenshots/: four 1280×800
// screenshots (Chrome Web Store and AMO) and the 440×280 Chrome promo tile.
// The UI in them is real: the packaged Chrome build running against the fake
// YouTube from the e2e tests, captured at 2× and framed with a headline.
// Run with `npm run store:screenshots`.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { launch } from "../tests/e2e/browsers.mjs";
import { startFakeYouTube } from "../tests/e2e/fake-youtube.mjs";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "store/screenshots");

const CREATORS = {
  conversation: { channelId: "UClongconversation", author: "The Long Conversation" },
  lecture: { channelId: "UCprofadalin", author: "Prof. Ada Lin" },
  devtips: { channelId: "UCdailydevtips", author: "Daily Dev Tips" }
};

const VIDEOS = { episode: CREATORS.conversation, lecture: CREATORS.lecture, tip: CREATORS.devtips };

const rule = (creator, video, shorts = null) => ({
  channelId: creator.channelId,
  channelName: creator.author,
  channelUrl: `https://www.youtube.com/channel/${creator.channelId}`,
  video,
  shorts
});

const SETTINGS = {
  version: 1,
  defaultVideoSpeed: 1.25,
  defaultShortsSpeed: 1.5,
  hotkeyStep: 0.25,
  profiles: [
    { id: "podcasts", name: "Podcasts", speed: 1.75, slot: 1 },
    { id: "lectures", name: "Lectures", speed: 2, slot: 2 },
    { id: "tutorials", name: "Tutorials", speed: 1.5, slot: 3 },
    { id: "music", name: "Music", speed: 1, slot: null }
  ],
  assignments: Object.fromEntries([
    rule(CREATORS.conversation, { type: "profile", profileId: "podcasts" }),
    rule(CREATORS.lecture, { type: "profile", profileId: "lectures" }, { type: "custom", speed: 1.5 }),
    rule(CREATORS.devtips, { type: "profile", profileId: "tutorials" }, { type: "custom", speed: 2 })
  ].map((assignment) => [assignment.channelId, assignment]))
};

// Stand-in video frame, shared by the captured player and the framed mockups.
const PLAYER_CSS = `
  background:
    linear-gradient(#ff4e45, #ff4e45) left bottom / 38% 4px no-repeat,
    linear-gradient(rgb(255 255 255 / 0.3), rgb(255 255 255 / 0.3)) left bottom / 100% 4px no-repeat,
    radial-gradient(circle at 28% 42%, rgb(244 162 97 / 0.85), transparent 34%),
    radial-gradient(circle at 72% 58%, rgb(42 157 143 / 0.8), transparent 40%),
    linear-gradient(135deg, #1d3557, #0b132b);`;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function capture() {
  const youtube = await startFakeYouTube(VIDEOS);
  // Popups can't be emulated at 2×, so the whole browser renders at 2×.
  const { browser, origin } = await launch("chrome", { proxyPort: youtube.port, args: ["--force-device-scale-factor=2"] });
  try {
    const options = await browser.newPage();
    await options.goto(`${origin}/options.html`);
    await options.evaluate((value) => browser.storage.local.set({ settings: value }), SETTINGS);
    await options.setViewport({ width: 1100, height: 1800, deviceScaleFactor: 2 });
    await options.reload();
    await pause(300);
    const clip = await options.evaluate(() => {
      const top = document.getElementById("profiles").getBoundingClientRect();
      const bottom = document.getElementById("creators").getBoundingClientRect();
      return { x: top.x - 24, y: top.y - 24, width: top.width + 48, height: bottom.bottom - top.top + 48 };
    });
    const settings = await options.screenshot({ clip, encoding: "base64" });

    const watch = async (pathname) => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
      await page.goto(`https://www.youtube.com${pathname}`);
      await page.waitForFunction(() => document.querySelector("video").playbackRate !== 1);
      return page;
    };

    const popup = async (page, scheme) => {
      await page.bringToFront();
      const worker = await (await browser.waitForTarget((target) => target.type() === "service_worker")).worker();
      await worker.evaluate("chrome.action.openPopup()");
      const view = await (await browser.waitForTarget((target) => target.url().endsWith("/popup.html"))).asPage();
      await view.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
      await view.waitForFunction(() => document.getElementById("title").textContent);
      // The headless popup window is shorter than its content: capture it all.
      await view.addStyleTag({ content: "html { scrollbar-width: none; }" });
      await pause(200);
      const height = await view.evaluate(() => document.documentElement.scrollHeight);
      const image = await view.screenshot({ clip: { x: 0, y: 0, width: 340, height }, captureBeyondViewport: true, encoding: "base64" });
      await view.close();
      return image;
    };

    const episode = await watch("/watch?v=episode");
    const popupLight = await popup(episode, "light");
    const popupDark = await popup(await watch("/shorts/tip"), "dark");

    await episode.bringToFront();
    await episode.addStyleTag({ content: `#movie_player { width: 720px !important; height: 405px !important; ${PLAYER_CSS} } video { opacity: 0; }` });
    await episode.click("video");
    for (const key of ["Alt", "Shift"]) await episode.keyboard.down(key);
    await episode.keyboard.press("Digit2");
    for (const key of ["Shift", "Alt"]) await episode.keyboard.up(key);
    await pause(250);
    const player = await (await episode.$("#movie_player")).screenshot({ encoding: "base64" });

    return { settings, popupLight, popupDark, player };
  } finally {
    await browser.close();
    await youtube.close();
  }
}

const img = (base64, alt, className = "") => `<img class="${className}" alt="${alt}" src="data:image/png;base64,${base64}">`;

const toolbar = (url, icon) => `
  <div class="toolbar" aria-hidden="true">
    <span class="dots"><i></i><i></i><i></i></span>
    <span class="url">${url}</span>
    ${icon ? `<img class="ext" alt="" src="${icon}">` : ""}
  </div>`;

const keys = (...names) => `<span class="combo">${names.map((name) => `<kbd>${name}</kbd>`).join("<span class=\"plus\">+</span>")}</span>`;

const page = (body, { width = 1280, height = 800 } = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  :root {
    --ink: #0e0e10;
    --ink-2: #1a1a1d;
    --paper: #f7f7f8;
    --chrome: #e7e7ea;
    --chrome-2: #d3d3d8;
    --text: #f4f4f5;
    --muted: #a8a8b0;
    --accent: #ff4e45;
    --glow: rgb(230 33 23 / 0.32);
    --shadow: 0 32px 80px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.07);
    --shadow-tight: 0 18px 40px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.07);
  }
  * { box-sizing: border-box; margin: 0; }
  html { font: 16px/1.4 system-ui, sans-serif; color: var(--text); }
  body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    background:
      radial-gradient(circle at 0% 0%, var(--glow), transparent 45%),
      radial-gradient(circle at 100% 100%, rgb(255 255 255 / 0.05), transparent 40%),
      var(--ink);
  }
  .frame {
    display: grid;
    grid-template-columns: 400px 1fr;
    align-items: center;
    gap: 56px;
    height: 100%;
    padding: 64px;
  }
  .frame.stacked { grid-template-columns: 1fr; grid-template-rows: auto 1fr; justify-items: center; gap: 40px; text-align: center; }
  h1 { font-size: 50px; font-weight: 750; line-height: 1.08; letter-spacing: -0.03em; text-wrap: balance; }
  h1 em { color: var(--accent); font-style: normal; }
  .copy p { margin-top: 20px; color: var(--muted); font-size: 21px; text-wrap: pretty; }
  .stage { position: relative; }
  .window { overflow: hidden; border-radius: 14px; background: var(--paper); box-shadow: var(--shadow); }
  .toolbar { display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 14px; background: var(--chrome); }
  .dots { display: flex; gap: 7px; }
  .dots i { width: 12px; height: 12px; border-radius: 50%; background: var(--chrome-2); }
  .url { flex: 1; padding: 3px 12px; border-radius: 99px; background: var(--paper); color: #6b6b73; font-size: 13px; }
  .ext { width: 22px; height: 22px; padding: 2px; border-radius: 6px; background: var(--chrome-2); }
  .player { aspect-ratio: 16 / 9; ${PLAYER_CSS} }
  .meta { display: grid; gap: 10px; padding: 18px 20px 22px; }
  .meta i { display: block; height: 12px; border-radius: 6px; background: var(--chrome); }
  .shot { display: block; width: 100%; }
  .popup { position: absolute; top: 46px; right: 10px; width: 340px; border-radius: 12px; box-shadow: var(--shadow); }
  .rounded { border-radius: 14px; box-shadow: var(--shadow); }
  .hotkeys { display: grid; gap: 14px; margin-top: 32px; font-size: 17px; }
  .hotkeys div { display: grid; grid-template-columns: 190px 1fr; align-items: center; }
  .hotkeys .combo { display: flex; align-items: center; gap: 6px; }
  .hotkeys .combo + span { color: var(--muted); }
  kbd {
    min-width: 34px;
    padding: 4px 9px;
    border: 1px solid rgb(255 255 255 / 0.14);
    border-bottom-width: 3px;
    border-radius: 8px;
    background: var(--ink-2);
    font: 600 14px/1.2 system-ui, sans-serif;
    text-align: center;
  }
  .plus { color: var(--muted); font-size: 13px; }
  .pair { display: flex; align-items: start; gap: 72px; }
  .pair figure { display: grid; gap: 14px; justify-items: center; }
  .pair figcaption { color: var(--muted); font-size: 16px; }
  .pair img { width: 340px; box-shadow: var(--shadow-tight); }
</style>
</head>
<body>${body}</body>
</html>`;

const frames = (shots, icon) => ({
  "1-creator-rules": page(`
    <main class="frame">
      <header class="copy">
        <h1>Every creator at <em>their own speed</em></h1>
        <p>Pick a speed once per channel. ytctl applies it to every video and Short from them, automatically.</p>
      </header>
      <div class="stage">
        <div class="window">
          ${toolbar("youtube.com/watch?v=…", icon)}
          <div class="player"></div>
          <div class="meta" aria-hidden="true"><i style="width: 62%"></i><i style="width: 34%"></i></div>
        </div>
        ${img(shots.popupLight, "ytctl popup applying the Podcasts profile to The Long Conversation", "popup")}
      </div>
    </main>`),

  "2-hotkeys": page(`
    <main class="frame">
      <header class="copy">
        <h1>Hotkeys for <em>every speed</em></h1>
        <p>Speed up, slow down, or jump to a profile. The player shows where you landed.</p>
        <div class="hotkeys">
          <div>${keys("Alt", "Shift", "↑")}<span>Faster</span></div>
          <div>${keys("Alt", "Shift", "↓")}<span>Slower</span></div>
          <div>${keys("Alt", "Shift", "0")}<span>Back to the rule</span></div>
          <div>${keys("Alt", "Shift", "1–9")}<span>Profiles</span></div>
        </div>
      </header>
      <div class="stage">${img(shots.player, "Video player showing the 2× Lectures speed overlay", "shot rounded")}</div>
    </main>`),

  "3-settings": page(`
    <main class="frame">
      <header class="copy">
        <h1>Profiles and rules <em>in one place</em></h1>
        <p>Name the speeds you use, then assign them to creators. Changes save as you type.</p>
      </header>
      <div class="stage">
        <div class="window">
          ${toolbar("ytctl — Settings", icon)}
          ${img(shots.settings, "ytctl settings with profiles and creator rules", "shot")}
        </div>
      </div>
    </main>`),

  "4-themes": page(`
    <main class="frame stacked">
      <header class="copy">
        <h1>Light or dark, <em>it follows you</em></h1>
        <p>Matches your system theme. Settings stay on your device.</p>
      </header>
      <div class="pair">
        <figure>${img(shots.popupLight, "Popup in light mode", "rounded")}<figcaption>Videos</figcaption></figure>
        <figure>${img(shots.popupDark, "Popup in dark mode on a Short", "rounded")}<figcaption>Shorts</figcaption></figure>
      </div>
    </main>`),

  "promo-small": page(`
    <main class="tile">
      <style>
        .tile { display: grid; place-content: center; justify-items: center; gap: 10px; height: 100%; text-align: center; }
        .tile img { width: 76px; }
        .tile h1 { font-size: 44px; }
        .tile p { color: var(--muted); font-size: 17px; }
      </style>
      <img alt="" src="${icon}">
      <h1>ytctl</h1>
      <p>Playback speed per creator, with hotkeys</p>
    </main>`, { width: 440, height: 280 })
});

async function render(htmlByName) {
  const { browser } = await launch("chrome", { proxyPort: 9 });
  try {
    const tab = await browser.newPage();
    for (const [name, html] of Object.entries(htmlByName)) {
      const [width, height] = name.startsWith("promo") ? [440, 280] : [1280, 800];
      await tab.setViewport({ width, height });
      await tab.setContent(html, { waitUntil: "load" });
      await writeFile(path.join(out, `${name}.png`), await tab.screenshot({ type: "png" }));
      console.log(`store/screenshots/${name}.png`);
    }
  } finally {
    await browser.close();
  }
}

await mkdir(out, { recursive: true });
const icon = `data:image/svg+xml;base64,${(await readFile(path.join(root, "icons/icon.svg"))).toString("base64")}`;
await render(frames(await capture(), icon));
