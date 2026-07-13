const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadShared(apiGlobal = "browser") {
  const store = {};
  const extensionApi = {
    storage: {
      local: {
        async get(key) { return { [key]: store[key] }; },
        async set(values) { Object.assign(store, values); }
      }
    }
  };
  const context = {
    [apiGlobal]: extensionApi,
    crypto: { randomUUID: () => `id-${Math.random()}` },
    console
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("shared.js", "utf8"), context);
  return { api: context.YTSpeed, store };
}

test("the Chrome API is exposed through the browser compatibility name", () => {
  const { api } = loadShared("chrome");
  assert.equal(typeof api.loadSettings, "function");
});

test("defaults have no generated profiles", () => {
  const { api } = loadShared();
  const settings = api.defaults();
  assert.equal(settings.defaultVideoSpeed, 1);
  assert.equal(settings.defaultShortsSpeed, 1);
  assert.equal(settings.profiles.length, 0);
  assert.equal(settings.hotkeys.increase, "Alt+Shift+ArrowUp");
});

test("normalization clamps speeds and prevents duplicate slots", () => {
  const { api } = loadShared();
  const settings = api.normalize({
    defaultVideoSpeed: 10,
    defaultShortsSpeed: 0,
    hotkeyStep: 123,
    profiles: [
      { id: "one", name: "One", speed: 8, slot: 1 },
      { id: "two", name: "Two", speed: 0.1, slot: 1 }
    ],
    assignments: {}
  });
  assert.equal(settings.defaultVideoSpeed, 4);
  assert.equal(settings.defaultShortsSpeed, 0.25);
  assert.equal(settings.hotkeyStep, 0.1);
  assert.equal(settings.profiles[0].speed, 4);
  assert.equal(settings.profiles[0].slot, 1);
  assert.equal(settings.profiles[1].speed, 0.25);
  assert.equal(settings.profiles[1].slot, null);
});

test("effective rules use profiles, custom speeds, and context defaults", () => {
  const { api } = loadShared();
  const settings = api.normalize({
    defaultVideoSpeed: 1.1,
    defaultShortsSpeed: 1.2,
    profiles: [{ id: "coding", name: "Coding", speed: 1.75, slot: 2 }],
    assignments: {
      UC123: {
        channelName: "Example",
        video: { type: "profile", profileId: "coding" },
        shorts: { type: "custom", speed: 0.8 }
      }
    }
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.effectiveRule(settings, "UC123", "video"))),
    { speed: 1.75, source: "profile", profileId: "coding", label: "Coding" }
  );
  assert.equal(api.effectiveRule(settings, "UC123", "shorts").speed, 0.8);
  assert.equal(api.effectiveRule(settings, "missing", "shorts").speed, 1.2);
});

test("DOM hotkeys convert to Firefox command shortcuts", () => {
  const { api } = loadShared();
  assert.equal(api.toCommandShortcut("Alt+Shift+ArrowUp"), "Alt+Shift+Up");
  assert.equal(api.toCommandShortcut("Alt+Shift+Digit2"), "Alt+Shift+2");
  assert.equal(api.toCommandShortcut("Ctrl+KeyK"), "Ctrl+K");
});

test("settings persist through local storage", async () => {
  const { api, store } = loadShared();
  const settings = api.defaults();
  settings.defaultVideoSpeed = 1.5;
  await api.saveSettings(settings);
  assert.equal(store.settings.defaultVideoSpeed, 1.5);
  assert.equal((await api.loadSettings()).defaultVideoSpeed, 1.5);
});
