(() => {
  "use strict";

  const { h, icon, speed, speedInput, ask, toast, avatar } = UI;
  const $ = (id) => document.getElementById(id);
  const elements = {
    version: $("version"),
    defaultVideo: $("default-video"),
    defaultShorts: $("default-shorts"),
    hotkeyStep: $("hotkey-step"),
    addProfile: $("add-profile"),
    profilesList: $("profiles-list"),
    profilesEmpty: $("profiles-empty"),
    creatorSearch: $("creator-search"),
    creatorsList: $("creators-list"),
    creatorsEmpty: $("creators-empty"),
    chromeShortcuts: $("chrome-shortcuts"),
    openChromeShortcuts: $("open-chrome-shortcuts"),
    hotkeysList: $("hotkeys-list"),
    exportSettings: $("export-settings"),
    importSettings: $("import-settings"),
    importFile: $("import-file")
  };

  const hotkeyLabels = {
    increase: "Increase speed",
    decrease: "Decrease speed",
    reset: "Reset speed",
    openPopup: "Open popup",
    ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`profile${index + 1}`, `Profile slot ${index + 1}`]))
  };

  let settings = YTSpeed.defaults();

  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

  // Applies `mutator` to fresh settings from storage and re-renders. Changes
  // from the popup or other tabs arrive through the storage listener below.
  async function save(mutator, message = "Saved") {
    try {
      settings = await YTSpeed.updateSettings(mutator);
      renderAll();
      if (message) toast(message);
    } catch (error) {
      toast(error.message || "Could not save settings", true);
    }
  }

  // Re-renders while keeping focus (and any half-typed text) on the element
  // with the same data-key, so autosave never kicks the user out of a field.
  function renderAll() {
    const active = document.activeElement;
    const key = active?.dataset?.key;
    const typing = key && active.matches("input:not([type=number])") ? { value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;

    renderDefaults();
    renderProfiles();
    renderCreators();
    renderHotkeys();

    const next = key && document.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (!next) return;
    next.focus({ preventScroll: true });
    if (typing) {
      next.value = typing.value;
      next.setSelectionRange(typing.start, typing.end);
    }
  }

  // Playback ---------------------------------------------------------------

  function renderDefaults() {
    elements.defaultVideo.value = settings.defaultVideoSpeed;
    elements.defaultShorts.value = settings.defaultShortsSpeed;
    elements.hotkeyStep.value = settings.hotkeyStep;
  }

  function bindDefault(input, field) {
    input.dataset.key = field;
    input.addEventListener("change", () => {
      if (!input.checkValidity()) return toast(`Enter a speed between ${speed(YTSpeed.MIN_SPEED)} and ${speed(YTSpeed.MAX_SPEED)}`, true);
      save((next) => { next[field] = YTSpeed.clampSpeed(input.value); });
    });
  }

  bindDefault(elements.defaultVideo, "defaultVideoSpeed");
  bindDefault(elements.defaultShorts, "defaultShortsSpeed");
  elements.hotkeyStep.addEventListener("change", () => save((next) => { next.hotkeyStep = Number(elements.hotkeyStep.value); }));

  // Profiles ---------------------------------------------------------------

  function nameTaken(name, exceptId) {
    const normalized = name.trim().toLocaleLowerCase();
    return settings.profiles.some((profile) => profile.id !== exceptId && profile.name.toLocaleLowerCase() === normalized);
  }

  function slotSelect(profile) {
    const taken = new Set(settings.profiles.filter((other) => other.id !== profile.id).map((other) => other.slot));
    const select = h("select", {
      className: "select slot",
      "aria-label": `Hotkey slot for ${profile.name}`,
      "data-key": `profile-slot-${profile.id}`,
      onchange: () => save((next) => {
        const target = next.profiles.find((item) => item.id === profile.id);
        if (target) target.slot = select.value ? Number(select.value) : null;
      })
    },
    h("option", { value: "" }, "No hotkey"),
    Array.from({ length: 9 }, (_, index) => index + 1)
      .filter((slot) => !taken.has(slot))
      .map((slot) => h("option", { value: slot }, `Slot ${slot} · ${YTSpeed.formatHotkey(settings.hotkeys[`profile${slot}`])}`)));
    select.value = profile.slot ? String(profile.slot) : "";
    return select;
  }

  function profileRow(profile) {
    const name = h("input", {
      type: "text",
      className: "input name",
      value: profile.name,
      maxLength: 60,
      required: true,
      "aria-label": "Profile name",
      "data-key": `profile-name-${profile.id}`,
      onchange: () => {
        const value = name.value.trim();
        if (!value || nameTaken(value, profile.id)) {
          name.value = profile.name;
          return toast(value ? `A profile named “${value}” already exists` : "Profile names can’t be empty", true);
        }
        save((next) => {
          const target = next.profiles.find((item) => item.id === profile.id);
          if (target) target.name = value;
        });
      }
    });

    const speedField = speedInput({
      value: profile.speed,
      "aria-label": `Speed for ${profile.name}`,
      "data-key": `profile-speed-${profile.id}`,
      onchange: (event) => {
        if (!event.target.checkValidity()) return;
        save((next) => {
          const target = next.profiles.find((item) => item.id === profile.id);
          if (target) target.speed = YTSpeed.clampSpeed(event.target.value);
        });
      }
    });

    const remove = h("button", {
      type: "button",
      className: "icon-btn danger",
      "aria-label": `Delete ${profile.name}`,
      title: "Delete profile",
      onclick: async () => {
        const usage = YTSpeed.profileUsage(settings, profile.id);
        const answer = await ask(
          usage ? `Delete “${profile.name}”? ${plural(usage, "creator rule")} will fall back to the default speed.` : `Delete “${profile.name}”?`,
          [{ label: "Delete", value: "delete", kind: "primary" }]
        );
        if (answer !== "delete") return;
        await save((next) => {
          next.profiles = next.profiles.filter((item) => item.id !== profile.id);
          for (const [channelId, assignment] of Object.entries(next.assignments)) {
            for (const kind of ["video", "shorts"]) {
              if (assignment[kind]?.type === "profile" && assignment[kind].profileId === profile.id) assignment[kind] = null;
            }
            if (!assignment.video && !assignment.shorts) delete next.assignments[channelId];
          }
        }, `“${profile.name}” deleted`);
        elements.addProfile.focus();
      }
    }, icon("trash"));

    return h("li", { className: "profile" }, name, speedField, slotSelect(profile), remove);
  }

  function renderProfiles() {
    elements.profilesList.replaceChildren(...settings.profiles.map(profileRow));
    elements.profilesEmpty.hidden = settings.profiles.length > 0;
  }

  elements.addProfile.addEventListener("click", async () => {
    let number = settings.profiles.length + 1;
    while (nameTaken(`Profile ${number}`)) number += 1;
    const id = YTSpeed.makeId();
    const usedSlots = new Set(settings.profiles.map((profile) => profile.slot));
    const slot = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((candidate) => !usedSlots.has(candidate)) ?? null;
    await save((next) => {
      next.profiles.push({ id, name: `Profile ${number}`, speed: 1.5, slot });
    }, "Profile added");
    const name = document.querySelector(`[data-key="profile-name-${CSS.escape(id)}"]`);
    name?.focus();
    name?.select();
  });

  // Creator rules ----------------------------------------------------------

  function ruleEditor(assignment, kind) {
    const rule = assignment[kind];
    const label = kind === "shorts" ? "Shorts" : "Videos";
    const defaultSpeed = kind === "shorts" ? settings.defaultShortsSpeed : settings.defaultVideoSpeed;
    const keyBase = `rule-${kind}-${assignment.channelId}`;

    const select = h("select", { className: "select", "aria-label": `${label} rule for ${assignment.channelName}`, "data-key": keyBase },
      h("option", { value: "default" }, `Default (${speed(defaultSpeed)})`),
      settings.profiles.map((profile) => h("option", { value: `profile:${profile.id}` }, `${profile.name} · ${speed(profile.speed)}`)),
      h("option", { value: "custom" }, "Custom"));
    select.value = rule?.type === "profile" ? `profile:${rule.profileId}` : rule?.type === "custom" ? "custom" : "default";

    const custom = speedInput({
      value: rule?.type === "custom" ? rule.speed : defaultSpeed,
      "aria-label": `Custom ${label.toLowerCase()} speed for ${assignment.channelName}`,
      "data-key": `${keyBase}-custom`
    });
    custom.hidden = select.value !== "custom";
    const customInput = custom.querySelector("input");

    const commit = () => {
      if (select.value === "custom" && !customInput.checkValidity()) return;
      const value = select.value === "default"
        ? null
        : select.value === "custom"
          ? { type: "custom", speed: YTSpeed.clampSpeed(customInput.value) }
          : { type: "profile", profileId: select.value.slice("profile:".length) };
      save((next) => {
        const target = next.assignments[assignment.channelId];
        if (!target) return;
        target[kind] = value;
        target.updatedAt = Date.now();
        if (!target.video && !target.shorts) delete next.assignments[assignment.channelId];
      }, value || assignment[kind === "video" ? "shorts" : "video"] ? "Saved" : `Rule for ${assignment.channelName} removed`);
    };
    select.addEventListener("change", commit);
    customInput.addEventListener("change", commit);

    return h("div", { className: "rule-editor" }, h("span", { className: "muted", "aria-hidden": "true" }, label), h("div", {}, select, custom));
  }

  function creatorRow(assignment) {
    const remove = h("button", {
      type: "button",
      className: "icon-btn danger",
      "aria-label": `Delete rules for ${assignment.channelName}`,
      title: "Delete rules",
      onclick: async () => {
        const answer = await ask(`Delete all rules for “${assignment.channelName}”?`, [{ label: "Delete", value: "delete", kind: "primary" }]);
        if (answer !== "delete") return;
        await save((next) => { delete next.assignments[assignment.channelId]; }, `Rules for ${assignment.channelName} deleted`);
        elements.creatorSearch.focus();
      }
    }, icon("trash"));

    return h("li", { className: "creator" },
      h("div", { className: "creator-info" },
        avatar(assignment.channelName, assignment.channelAvatarUrl),
        h("div", {},
          h("a", { href: assignment.channelUrl, target: "_blank", rel: "noreferrer" }, assignment.channelName),
          h("small", { className: "muted" }, assignment.channelId))),
      ruleEditor(assignment, "video"),
      ruleEditor(assignment, "shorts"),
      remove);
  }

  function renderCreators() {
    const query = elements.creatorSearch.value.trim().toLocaleLowerCase();
    const all = Object.values(settings.assignments);
    const shown = all
      .filter((assignment) => !query || `${assignment.channelName} ${assignment.channelId}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.channelName.localeCompare(b.channelName));
    elements.creatorsList.replaceChildren(...shown.map(creatorRow));
    elements.creatorsEmpty.hidden = shown.length > 0;
    elements.creatorsEmpty.textContent = all.length ? "No creators match your search." : "No creator rules yet.";
    elements.creatorSearch.hidden = all.length === 0;
  }

  elements.creatorSearch.addEventListener("input", renderCreators);

  // Hotkeys ----------------------------------------------------------------

  function setHotkey(key, combo) {
    save((next) => { next.hotkeys[key] = combo; }, combo ? `${hotkeyLabels[key]}: ${YTSpeed.formatHotkey(combo)}` : `${hotkeyLabels[key]} cleared`);
  }

  // A key-cap button that records the next modifier combination pressed while
  // it is in capture mode. Capture mode is toggled in place, without re-rendering.
  function hotkeyRow(key, label) {
    const combo = settings.hotkeys[key];
    const text = combo ? YTSpeed.formatHotkey(combo) : "Not set";
    const capture = h("button", {
      type: "button",
      className: `capture${combo ? "" : " unset"}`,
      "aria-label": `${label}: ${combo ? text : "not set"}. Press to change.`,
      "data-key": `hotkey-${key}`
    }, text);
    const isCapturing = () => capture.classList.contains("capturing");
    const stop = () => {
      capture.classList.remove("capturing");
      capture.textContent = text;
    };

    capture.addEventListener("click", () => {
      if (isCapturing()) return stop();
      capture.classList.add("capturing");
      capture.textContent = "Press keys…";
    });
    capture.addEventListener("blur", stop);
    capture.addEventListener("keydown", (event) => {
      if (!isCapturing() || event.key === "Tab") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") return stop();
      if (event.key === "Backspace" || event.key === "Delete") return setHotkey(key, "");
      const next = YTSpeed.eventHotkey(event);
      if (!next) return;
      if (!event.ctrlKey && !event.altKey && !event.metaKey) return toast("Include Ctrl, Alt, or ⌘ so the shortcut doesn’t clash with YouTube", true);
      const owner = Object.entries(settings.hotkeys).find(([other, value]) => other !== key && value === next);
      if (owner) return toast(`Already used by ${hotkeyLabels[owner[0]]}`, true);
      setHotkey(key, next);
    });

    return h("div", { className: "hotkey" }, h("span", {}, label), capture);
  }

  function renderHotkeys() {
    elements.hotkeysList.replaceChildren(...Object.entries(hotkeyLabels).map(([key, label]) => hotkeyRow(key, label)));
  }

  // Chrome can't change browser-level shortcuts from an extension.
  elements.chromeShortcuts.hidden = typeof browser.commands?.update === "function";
  elements.openChromeShortcuts.addEventListener("click", () => browser.tabs.create({ url: "chrome://extensions/shortcuts" }));

  // Backup -----------------------------------------------------------------

  elements.exportSettings.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" }));
    h("a", { href: url, download: `ytctl-${new Date().toISOString().slice(0, 10)}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Settings exported");
  });

  elements.importSettings.addEventListener("click", () => elements.importFile.click());

  elements.importFile.addEventListener("change", async () => {
    const file = elements.importFile.files[0];
    elements.importFile.value = "";
    if (!file) return;
    let imported;
    try {
      const raw = JSON.parse(await file.text());
      if (raw?.version !== 1 || !Array.isArray(raw.profiles) || typeof raw.assignments !== "object") throw new Error();
      imported = YTSpeed.normalize(raw);
    } catch (_) {
      return toast("That file isn’t a ytctl backup", true);
    }
    const answer = await ask(
      `Import ${plural(imported.profiles.length, "profile")} and ${plural(Object.keys(imported.assignments).length, "creator rule")} from “${file.name}”?`,
      [
        { label: "Replace all", value: "replace" },
        { label: "Merge", value: "merge", kind: "primary" }
      ]
    );
    if (answer === "replace") return save(() => imported, "Settings replaced");
    if (answer !== "merge") return;
    save((current) => {
      const profiles = new Map(current.profiles.map((profile) => [profile.id, profile]));
      for (const profile of imported.profiles) profiles.set(profile.id, profile);
      return {
        ...imported,
        hotkeys: { ...current.hotkeys, ...imported.hotkeys },
        profiles: [...profiles.values()],
        assignments: { ...current.assignments, ...imported.assignments }
      };
    }, "Settings merged");
  });

  // Start ------------------------------------------------------------------

  elements.version.textContent = `Version ${browser.runtime.getManifest().version}`;

  YTSpeed.onSettingsChanged((next) => {
    settings = next;
    renderAll();
  });

  YTSpeed.loadSettings()
    .then((loaded) => {
      settings = loaded;
      renderAll();
    })
    .catch((error) => toast(error.message || "Could not load settings", true));
})();
