// End-to-end tests: the packaged extension in real Chrome and Firefox against
// a fake YouTube (see fake-youtube.mjs). Run with `npm run test:e2e`.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BROWSERS, launch, open } from "./browsers.mjs";
import { CREATORS, startFakeYouTube } from "./fake-youtube.mjs";

const SETTINGS = {
  version: 1,
  defaultVideoSpeed: 1.25,
  defaultShortsSpeed: 1.5,
  hotkeyStep: 0.25,
  profiles: [
    { id: "podcasts", name: "Podcasts", speed: 1.75, slot: 1 },
    { id: "lectures", name: "Lectures", speed: 2, slot: 2 }
  ],
  assignments: {
    [CREATORS.ruled.channelId]: {
      channelId: CREATORS.ruled.channelId,
      channelName: CREATORS.ruled.author,
      channelUrl: `https://www.youtube.com/channel/${CREATORS.ruled.channelId}`,
      video: { type: "profile", profileId: "podcasts" },
      shorts: null
    }
  }
};

const TIMEOUT = { timeout: 10_000 };

for (const name of BROWSERS) {
  describe(name, { timeout: 120_000 }, () => {
    let youtube;
    let session;

    before(async () => {
      youtube = await startFakeYouTube();
      session = await launch(name, { proxyPort: youtube.port });
    });

    after(async () => {
      await session?.browser.close();
      await youtube?.close();
    });

    async function extensionPage(file, browser = session.browser, origin = session.origin) {
      const page = await browser.newPage();
      await open(page, `${origin}/${file}`);
      return page;
    }

    async function setSettings(settings) {
      const page = await extensionPage("options.html");
      await page.evaluate((value) => browser.storage.local.set({ settings: value }), settings);
      await page.close();
    }

    const getSettings = (page) => page.evaluate(async () => (await browser.storage.local.get("settings")).settings);

    async function watch(pathname, browser = session.browser) {
      const page = await browser.newPage();
      await page.goto(`https://www.youtube.com${pathname}`);
      return page;
    }

    const waitForSpeed = (page, speed) => page.waitForFunction(
      (expected) => Math.abs(document.querySelector("video").playbackRate - expected) < 0.001,
      TIMEOUT,
      speed
    );

    test("applies the creator rule, the video default, and the Shorts default", async () => {
      await setSettings(SETTINGS);
      const ruled = await watch("/watch?v=ruled");
      await waitForSpeed(ruled, 1.75);
      const plain = await watch("/watch?v=plain");
      await waitForSpeed(plain, 1.25);
      const short = await watch("/shorts/short");
      await waitForSpeed(short, 1.5);
      await Promise.all([ruled.close(), plain.close(), short.close()]);
    });

    test("hotkeys change the speed temporarily and show it in the player", async () => {
      await setSettings(SETTINGS);
      const page = await watch("/watch?v=ruled");
      await waitForSpeed(page, 1.75);
      await page.click("video");

      const chord = async (key) => {
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");
        await page.keyboard.press(key);
        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");
      };

      const overlay = () => page.$eval("#movie_player > #ytctl-overlay", (element) => element.textContent);

      await chord("ArrowUp");
      await waitForSpeed(page, 2);
      assert.equal(await overlay(), "2×");

      await chord("Digit0");
      await waitForSpeed(page, 1.75);
      assert.equal(await overlay(), "1.75×Reset · Podcasts");

      await chord("Digit2");
      await waitForSpeed(page, 2);
      assert.equal(await overlay(), "2×Lectures");

      const page2 = await extensionPage("options.html");
      assert.equal((await getSettings(page2)).assignments[CREATORS.ruled.channelId].video.profileId, "podcasts", "hotkeys never change rules");
      await Promise.all([page.close(), page2.close()]);
    });

    // Firefox refuses automated input on extension pages.
    test("the settings page saves edits without a save button", { skip: name === "firefox" && "input automation on extension pages is Chrome-only" }, async () => {
      await setSettings(SETTINGS);
      const page = await extensionPage("options.html");
      await page.waitForSelector(".profile .name", TIMEOUT);
      await page.click("#add-profile");
      await page.waitForFunction(() => document.querySelectorAll(".profile .name").length === 3, TIMEOUT);

      const name = (await page.$$(".profile .name"))[2];
      await name.evaluate((input) => { input.focus(); input.select(); });
      await page.keyboard.type("Gaming");
      await page.keyboard.press("Tab");
      await page.waitForFunction(async () => (await browser.storage.local.get("settings")).settings.profiles.some((p) => p.name === "Gaming"), TIMEOUT);

      await open(page, `${session.origin}/options.html`);
      await page.waitForFunction(() => [...document.querySelectorAll(".profile .name")].some((input) => input.value === "Gaming"), TIMEOUT);
      await page.close();
    });

    test("settings survive a browser restart", async () => {
      const userDataDir = await mkdtemp(path.join(tmpdir(), `ytctl-${name}-`));
      try {
        let restarted = await launch(name, { proxyPort: youtube.port, userDataDir });
        const first = await extensionPage("options.html", restarted.browser, restarted.origin);
        await first.evaluate((value) => browser.storage.local.set({ settings: value }), SETTINGS);
        await restarted.browser.close();

        restarted = await launch(name, { proxyPort: youtube.port, userDataDir });
        try {
          const options = await extensionPage("options.html", restarted.browser, restarted.origin);
          const stored = await getSettings(options);
          assert.deepEqual(stored.profiles.map((profile) => profile.name), ["Podcasts", "Lectures"]);
          assert.ok(stored.assignments[CREATORS.ruled.channelId]);
          await waitForSpeed(await watch("/watch?v=ruled", restarted.browser), 1.75);
        } finally {
          await restarted.browser.close();
        }
      } finally {
        await rm(userDataDir, { recursive: true, force: true });
      }
    });

    // Firefox offers automation no way to open an extension popup.
    test("the popup controls speed and saves creator rules", { skip: name !== "chrome" && "popup automation is Chrome-only" }, async () => {
      await setSettings(SETTINGS);
      const page = await watch("/watch?v=ruled");
      await waitForSpeed(page, 1.75);
      await page.bringToFront();

      const workerTarget = await session.browser.waitForTarget((target) => target.type() === "service_worker" && target.url().startsWith(session.origin));
      await (await workerTarget.worker()).evaluate("chrome.action.openPopup()");
      const popup = await (await session.browser.waitForTarget((target) => target.url().endsWith("/popup.html"))).asPage();
      await popup.waitForFunction((author) => document.getElementById("title").textContent === author, TIMEOUT, CREATORS.ruled.author);
      assert.equal(await popup.$eval("#assignment", (select) => select.value), "profile:podcasts");

      const [, lectures] = await popup.$$(".chip");
      await lectures.click();
      await waitForSpeed(page, 2);

      await popup.click("#save-current");
      await popup.waitForFunction(async (channelId) => {
        const { settings } = await browser.storage.local.get("settings");
        return settings.assignments[channelId]?.video?.speed === 2;
      }, TIMEOUT, CREATORS.ruled.channelId);

      await popup.select("#assignment", "default");
      await waitForSpeed(page, 1.25);
      assert.equal((await getSettings(popup)).assignments[CREATORS.ruled.channelId], undefined);
    });
  });
}
