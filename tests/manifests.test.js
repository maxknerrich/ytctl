const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const firefox = readJson("manifest.firefox.json");
const chrome = readJson("manifest.chrome.json");
const development = readJson("manifest.json");
const packageJson = readJson("package.json");

test("development manifest matches the Firefox release manifest", () => {
  assert.deepEqual(development, firefox);
});

test("browser manifests describe the same extension version and runtime", () => {
  assert.equal(chrome.name, firefox.name);
  assert.equal(chrome.version, firefox.version);
  assert.equal(firefox.version, packageJson.version);
  assert.deepEqual(chrome.content_scripts, firefox.content_scripts);
  assert.deepEqual(chrome.action, firefox.action);
  assert.deepEqual(Object.keys(chrome.commands), Object.keys(firefox.commands));
});

test("Firefox uses background scripts and Gecko settings", () => {
  assert.deepEqual(firefox.background.scripts, ["shared.js", "background.js"]);
  assert.equal(firefox.browser_specific_settings.gecko.id, "ytctl@maxknerrich");
});

test("Chrome uses a service worker and no Firefox-only settings", () => {
  assert.equal(chrome.background.service_worker, "background.js");
  assert.equal(chrome.browser_specific_settings, undefined);
});

test("Chrome stays within its four suggested-shortcut limit", () => {
  const suggested = Object.values(chrome.commands).filter((command) => command.suggested_key);
  assert.equal(suggested.length, 4);
});
