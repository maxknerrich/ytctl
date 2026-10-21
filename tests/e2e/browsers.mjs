// Launches Chrome for Testing or Firefox with the packaged extension from
// dist/<browser> installed, routing all traffic through the fake YouTube proxy.
// Browsers are downloaded once into .cache/browsers. Set YTCTL_CHROME or
// YTCTL_FIREFOX to a binary path to use a local install instead.
import path from "node:path";
import { Browser, detectBrowserPlatform, install, resolveBuildId } from "@puppeteer/browsers";
import puppeteer from "puppeteer-core";

const root = path.resolve(import.meta.dirname, "../..");

// Fixed internal UUID so tests know the extension's moz-extension:// origin.
const FIREFOX_UUID = "0b5f0f4e-6f2a-4d7c-9a51-7c1d2b3e4f50";
const FIREFOX_ID = "ytctl@maxknerrich";

export const BROWSERS = (process.env.YTCTL_BROWSERS || "chrome,firefox").split(",");

async function executablePath(name) {
  const override = process.env[`YTCTL_${name.toUpperCase()}`];
  if (override) return override;
  const browser = name === "chrome" ? Browser.CHROME : Browser.FIREFOX;
  const platform = detectBrowserPlatform();
  const buildId = await resolveBuildId(browser, platform, "stable");
  const installed = await install({ browser, buildId, platform, cacheDir: path.join(root, ".cache/browsers") });
  return installed.executablePath;
}

function firefoxPrefs(proxyPort) {
  return {
    "network.proxy.type": 1,
    "network.proxy.http": "127.0.0.1",
    "network.proxy.http_port": proxyPort,
    "network.proxy.ssl": "127.0.0.1",
    "network.proxy.ssl_port": proxyPort,
    "network.proxy.no_proxies_on": "",
    "network.proxy.allow_hijacking_localhost": true,
    "extensions.webextensions.uuids": JSON.stringify({ [FIREFOX_ID]: FIREFOX_UUID }),
    // Test installs are temporary, and Firefox deletes a temporary add-on's
    // storage when it quits. Keep it so restart tests see what a signed
    // install would.
    "extensions.webextensions.keepStorageOnUninstall": true,
    "extensions.webextensions.keepUuidOnUninstall": true
  };
}

// Navigates `page` to `url` and waits for it to load. Firefox loads extension
// pages without network events, so Puppeteer's goto() and reload() never
// settle there (and page.url() goes stale); navigate over BiDi directly.
export async function open(page, url) {
  if (url.startsWith("moz-extension:")) await page.mainFrame().browsingContext.navigate(url, "complete");
  else await page.goto(url);
}

// Starts `name` ("chrome" | "firefox") with the extension installed.
// `args` are extra Chrome flags. Resolves to { browser, id, origin }, where
// origin hosts the extension pages.
export async function launch(name, { proxyPort, userDataDir, args = [] }) {
  const options = {
    executablePath: await executablePath(name),
    headless: !process.env.HEADFUL,
    acceptInsecureCerts: true,
    userDataDir
  };
  const browser = name === "chrome"
    ? await puppeteer.launch({
      ...options,
      browser: "chrome",
      pipe: true,
      enableExtensions: true,
      // installExtension() over CDP needs the unsafe-debugging flag.
      args: [`--proxy-server=http://127.0.0.1:${proxyPort}`, "--ignore-certificate-errors", "--enable-unsafe-extension-debugging", ...args]
    })
    : await puppeteer.launch({
      ...options,
      browser: "firefox",
      extraPrefsFirefox: firefoxPrefs(proxyPort),
      // WebDriver BiDi only navigates to moz-extension:// pages with system access.
      args: ["--remote-allow-system-access"]
    });

  const id = await browser.installExtension(path.join(root, "dist", name));
  const origin = name === "chrome" ? `chrome-extension://${id}` : `moz-extension://${FIREFOX_UUID}`;
  return { browser, id, origin };
}
