(() => {
  "use strict";

  const STORAGE_KEY = "settings";
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 4;
  const SPEED_PRECISION = 2;
  const STEP_OPTIONS = [0.05, 0.1, 0.25, 0.5];

  const defaultHotkeys = () => ({
    increase: "Alt+Shift+ArrowUp",
    decrease: "Alt+Shift+ArrowDown",
    reset: "Alt+Shift+Digit0",
    openPopup: "Alt+Shift+KeyP",
    profile1: "Alt+Shift+Digit1",
    profile2: "Alt+Shift+Digit2",
    profile3: "Alt+Shift+Digit3",
    profile4: "Alt+Shift+Digit4",
    profile5: "Alt+Shift+Digit5",
    profile6: "Alt+Shift+Digit6",
    profile7: "Alt+Shift+Digit7",
    profile8: "Alt+Shift+Digit8",
    profile9: "Alt+Shift+Digit9"
  });

  const defaults = () => ({
    version: 1,
    defaultVideoSpeed: 1,
    defaultShortsSpeed: 1,
    hotkeyStep: 0.1,
    hotkeys: defaultHotkeys(),
    profiles: [],
    assignments: {}
  });

  function clampSpeed(value, fallback = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, Number(numeric.toFixed(SPEED_PRECISION))));
  }

  function validRule(rule, profileIds) {
    if (!rule || typeof rule !== "object") return null;
    if (rule.type === "profile" && typeof rule.profileId === "string") {
      return profileIds.has(rule.profileId) ? { type: "profile", profileId: rule.profileId } : null;
    }
    if (rule.type === "custom") {
      return { type: "custom", speed: clampSpeed(rule.speed) };
    }
    return null;
  }

  function normalize(raw) {
    const base = defaults();
    if (!raw || typeof raw !== "object") return base;

    base.defaultVideoSpeed = clampSpeed(raw.defaultVideoSpeed);
    base.defaultShortsSpeed = clampSpeed(raw.defaultShortsSpeed);
    base.hotkeyStep = STEP_OPTIONS.includes(Number(raw.hotkeyStep)) ? Number(raw.hotkeyStep) : 0.1;

    if (raw.hotkeys && typeof raw.hotkeys === "object") {
      for (const key of Object.keys(base.hotkeys)) {
        if (typeof raw.hotkeys[key] === "string") base.hotkeys[key] = raw.hotkeys[key];
      }
    }

    const usedSlots = new Set();
    const usedIds = new Set();
    if (Array.isArray(raw.profiles)) {
      base.profiles = raw.profiles.flatMap((profile) => {
        if (!profile || typeof profile !== "object" || typeof profile.name !== "string") return [];
        const name = profile.name.trim();
        if (!name) return [];
        let id = typeof profile.id === "string" && profile.id ? profile.id : makeId();
        if (usedIds.has(id)) id = makeId();
        usedIds.add(id);
        const candidateSlot = Number(profile.slot);
        const slot = Number.isInteger(candidateSlot) && candidateSlot >= 1 && candidateSlot <= 9 && !usedSlots.has(candidateSlot)
          ? candidateSlot
          : null;
        if (slot) usedSlots.add(slot);
        return [{ id, name, speed: clampSpeed(profile.speed), slot }];
      });
    }

    const profileIds = new Set(base.profiles.map((profile) => profile.id));
    if (raw.assignments && typeof raw.assignments === "object" && !Array.isArray(raw.assignments)) {
      for (const [channelId, assignment] of Object.entries(raw.assignments)) {
        if (!channelId || !assignment || typeof assignment !== "object") continue;
        const video = validRule(assignment.video, profileIds);
        const shorts = validRule(assignment.shorts, profileIds);
        if (!video && !shorts) continue;
        base.assignments[channelId] = {
          channelId,
          channelName: typeof assignment.channelName === "string" && assignment.channelName.trim()
            ? assignment.channelName.trim()
            : channelId,
          channelUrl: typeof assignment.channelUrl === "string" ? assignment.channelUrl : `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`,
          channelAvatarUrl: typeof assignment.channelAvatarUrl === "string" ? assignment.channelAvatarUrl : "",
          video,
          shorts,
          updatedAt: Number.isFinite(Number(assignment.updatedAt)) ? Number(assignment.updatedAt) : Date.now()
        };
      }
    }
    return base;
  }

  async function loadSettings() {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const settings = normalize(stored[STORAGE_KEY]);
    if (!stored[STORAGE_KEY]) await saveSettings(settings);
    return settings;
  }

  async function saveSettings(settings) {
    const normalized = normalize(settings);
    await browser.storage.local.set({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  async function updateSettings(mutator) {
    const settings = await loadSettings();
    const result = await mutator(settings) || settings;
    return saveSettings(result);
  }

  function makeId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function eventHotkey(event) {
    const modifiers = [];
    if (event.ctrlKey) modifiers.push("Ctrl");
    if (event.altKey) modifiers.push("Alt");
    if (event.shiftKey) modifiers.push("Shift");
    if (event.metaKey) modifiers.push("Meta");
    const code = event.code;
    if (!code || ["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"].includes(code)) {
      return "";
    }
    return [...modifiers, code].join("+");
  }

  function formatHotkey(combo) {
    if (!combo) return "Not assigned";
    return combo
      .replaceAll("Digit", "")
      .replaceAll("Key", "")
      .replace("ArrowUp", "↑")
      .replace("ArrowDown", "↓")
      .replace("ArrowLeft", "←")
      .replace("ArrowRight", "→")
      .split("+")
      .join(" + ");
  }

  function toCommandShortcut(combo) {
    if (!combo) return "";
    const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform || "");
    return combo.split("+").map((part) => {
      if (part === "Ctrl" && isMac) return "MacCtrl";
      if (part === "Meta" && isMac) return "Command";
      if (part.startsWith("Key")) return part.slice(3);
      if (part.startsWith("Digit")) return part.slice(5);
      if (part.startsWith("Arrow")) return part.slice(5);
      return part;
    }).join("+");
  }

  function isEditable(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox']"));
  }

  function effectiveRule(settings, channelId, kind) {
    const defaultSpeed = kind === "shorts" ? settings.defaultShortsSpeed : settings.defaultVideoSpeed;
    const fallback = { speed: defaultSpeed, source: "default", label: kind === "shorts" ? "Shorts default" : "Default" };
    if (!channelId) return fallback;
    const rule = settings.assignments[channelId]?.[kind];
    if (!rule) return fallback;
    if (rule.type === "custom") {
      return { speed: rule.speed, source: "custom", label: "Creator custom speed" };
    }
    if (rule.type === "profile") {
      const profile = settings.profiles.find((item) => item.id === rule.profileId);
      if (profile) return { speed: profile.speed, source: "profile", profileId: profile.id, label: profile.name };
    }
    return fallback;
  }

  function profileUsage(settings, profileId) {
    let count = 0;
    for (const assignment of Object.values(settings.assignments)) {
      if (assignment.video?.type === "profile" && assignment.video.profileId === profileId) count += 1;
      if (assignment.shorts?.type === "profile" && assignment.shorts.profileId === profileId) count += 1;
    }
    return count;
  }

  globalThis.YTSpeed = {
    STORAGE_KEY,
    MIN_SPEED,
    MAX_SPEED,
    STEP_OPTIONS,
    defaults,
    normalize,
    clampSpeed,
    loadSettings,
    saveSettings,
    updateSettings,
    makeId,
    eventHotkey,
    formatHotkey,
    toCommandShortcut,
    isEditable,
    effectiveRule,
    profileUsage
  };
})();
