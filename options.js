(() => {
  "use strict";

  const elements = {
    defaultVideo: document.getElementById("default-video"),
    defaultShorts: document.getElementById("default-shorts"),
    hotkeyStep: document.getElementById("hotkey-step"),
    saveDefaults: document.getElementById("save-defaults"),
    profilesBody: document.getElementById("profiles-body"),
    profilesEmpty: document.getElementById("profiles-empty"),
    addProfile: document.getElementById("add-profile"),
    newProfileName: document.getElementById("new-profile-name"),
    newProfileSpeed: document.getElementById("new-profile-speed"),
    newProfileSlot: document.getElementById("new-profile-slot"),
    hotkeyList: document.getElementById("hotkey-list"),
    assignmentSearch: document.getElementById("assignment-search"),
    assignmentsBody: document.getElementById("assignments-body"),
    assignmentsEmpty: document.getElementById("assignments-empty"),
    exportSettings: document.getElementById("export-settings"),
    importFile: document.getElementById("import-file"),
    importMode: document.getElementById("import-mode"),
    importSettings: document.getElementById("import-settings"),
    status: document.getElementById("status")
  };

  const hotkeyLabels = {
    increase: "Increase speed",
    decrease: "Decrease speed",
    reset: "Reset speed",
    openPopup: "Open toolbar popup",
    profile1: "Profile slot 1",
    profile2: "Profile slot 2",
    profile3: "Profile slot 3",
    profile4: "Profile slot 4",
    profile5: "Profile slot 5",
    profile6: "Profile slot 6",
    profile7: "Profile slot 7",
    profile8: "Profile slot 8",
    profile9: "Profile slot 9"
  };

  let settings;
  let statusTimer;

  function showStatus(message, error = false) {
    clearTimeout(statusTimer);
    elements.status.textContent = message;
    elements.status.classList.toggle("error", error);
    elements.status.classList.add("visible");
    statusTimer = setTimeout(() => elements.status.classList.remove("visible"), 2600);
  }

  function createButton(text, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    if (className) button.className = className;
    button.addEventListener("click", handler);
    return button;
  }

  function fillSlotSelect(select, selected = null) {
    select.replaceChildren();
    const noSlot = document.createElement("option");
    noSlot.value = "";
    noSlot.textContent = "No hotkey slot";
    select.append(noSlot);
    for (let slot = 1; slot <= 9; slot += 1) {
      const owner = settings.profiles.find((profile) => profile.slot === slot);
      if (owner && slot !== selected) continue;
      const option = document.createElement("option");
      option.value = String(slot);
      option.textContent = `Slot ${slot} · ${YTSpeed.formatHotkey(settings.hotkeys[`profile${slot}`])}`;
      select.append(option);
    }
    select.value = selected ? String(selected) : "";
  }

  function validProfileName(name, exceptId = null) {
    const normalized = name.trim().toLocaleLowerCase();
    return normalized && !settings.profiles.some((profile) => profile.id !== exceptId && profile.name.toLocaleLowerCase() === normalized);
  }

  function renderProfiles() {
    elements.profilesBody.replaceChildren();
    for (const profile of settings.profiles) {
      const row = document.createElement("tr");

      const nameCell = document.createElement("td");
      const name = document.createElement("input");
      name.type = "text";
      name.maxLength = 60;
      name.value = profile.name;
      name.setAttribute("aria-label", `Name for ${profile.name}`);
      nameCell.append(name);

      const speedCell = document.createElement("td");
      const speed = document.createElement("input");
      speed.type = "number";
      speed.min = String(YTSpeed.MIN_SPEED);
      speed.max = String(YTSpeed.MAX_SPEED);
      speed.step = "0.05";
      speed.value = profile.speed;
      speed.setAttribute("aria-label", `Speed for ${profile.name}`);
      speedCell.append(speed, " ×");

      const slotCell = document.createElement("td");
      const slot = document.createElement("select");
      slot.setAttribute("aria-label", `Hotkey slot for ${profile.name}`);
      fillSlotSelect(slot, profile.slot);
      slotCell.append(slot);

      const actions = document.createElement("td");
      actions.append(
        createButton("Save", "small primary", async () => {
          if (!validProfileName(name.value, profile.id)) {
            showStatus("Profile names must be non-empty and unique.", true);
            return;
          }
          const chosenSlot = slot.value ? Number(slot.value) : null;
          const conflict = settings.profiles.find((item) => item.id !== profile.id && item.slot === chosenSlot);
          if (conflict) {
            showStatus(`Slot ${chosenSlot} is already assigned to “${conflict.name}”.`, true);
            return;
          }
          profile.name = name.value.trim();
          profile.speed = YTSpeed.clampSpeed(speed.value);
          profile.slot = chosenSlot;
          settings = await YTSpeed.saveSettings(settings);
          renderAll();
          showStatus(`Profile “${profile.name}” saved.`);
        }),
        " ",
        createButton("Delete", "small danger", async () => {
          const usage = YTSpeed.profileUsage(settings, profile.id);
          if (!confirm(`Delete “${profile.name}”? ${usage} creator rule${usage === 1 ? "" : "s"} will fall back to its default speed.`)) return;
          settings.profiles = settings.profiles.filter((item) => item.id !== profile.id);
          for (const [channelId, assignment] of Object.entries(settings.assignments)) {
            if (assignment.video?.type === "profile" && assignment.video.profileId === profile.id) assignment.video = null;
            if (assignment.shorts?.type === "profile" && assignment.shorts.profileId === profile.id) assignment.shorts = null;
            if (!assignment.video && !assignment.shorts) delete settings.assignments[channelId];
          }
          settings = await YTSpeed.saveSettings(settings);
          renderAll();
          showStatus(`Profile “${profile.name}” deleted.`);
        })
      );

      row.append(nameCell, speedCell, slotCell, actions);
      elements.profilesBody.append(row);
    }
    elements.profilesEmpty.hidden = settings.profiles.length > 0;
    fillSlotSelect(elements.newProfileSlot);
  }

  function renderHotkeys() {
    elements.hotkeyList.replaceChildren();
    for (const [key, label] of Object.entries(hotkeyLabels)) {
      const row = document.createElement("div");
      row.className = "hotkey-row";
      const name = document.createElement("span");
      name.textContent = label;
      const capture = document.createElement("button");
      capture.type = "button";
      capture.className = "hotkey-capture";
      capture.textContent = YTSpeed.formatHotkey(settings.hotkeys[key]);
      capture.setAttribute("aria-label", `${label}: ${capture.textContent}. Click to change.`);

      capture.addEventListener("click", () => {
        capture.classList.add("capturing");
        capture.textContent = "Press shortcut…";
        capture.focus();
      });
      capture.addEventListener("blur", () => {
        capture.classList.remove("capturing");
        capture.textContent = YTSpeed.formatHotkey(settings.hotkeys[key]);
      });
      capture.addEventListener("keydown", async (event) => {
        if (!capture.classList.contains("capturing")) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") {
          capture.blur();
          return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          settings.hotkeys[key] = "";
          settings = await YTSpeed.saveSettings(settings);
          renderHotkeys();
          showStatus(`${label} shortcut cleared.`);
          return;
        }
        const combo = YTSpeed.eventHotkey(event);
        if (!combo) return;
        if (!event.ctrlKey && !event.altKey && !event.metaKey) {
          showStatus("Use Ctrl, Alt, or Meta in a shortcut to avoid conflicts.", true);
          return;
        }
        const duplicate = Object.entries(settings.hotkeys).find(([otherKey, value]) => otherKey !== key && value === combo);
        if (duplicate) {
          showStatus(`That shortcut is already used by ${hotkeyLabels[duplicate[0]]}.`, true);
          return;
        }
        settings.hotkeys[key] = combo;
        settings = await YTSpeed.saveSettings(settings);
        renderAll();
        showStatus(`${label} shortcut saved.`);
      });

      const clear = createButton("Clear", "small", async () => {
        settings.hotkeys[key] = "";
        settings = await YTSpeed.saveSettings(settings);
        renderHotkeys();
        showStatus(`${label} shortcut cleared.`);
      });
      row.append(name, capture, clear);
      elements.hotkeyList.append(row);
    }
  }

  function createRuleEditor(rule, kind) {
    const wrapper = document.createElement("div");
    wrapper.className = "rule-editor";
    wrapper.dataset.kind = kind;
    const select = document.createElement("select");
    select.setAttribute("aria-label", `${kind} rule`);

    const defaultOption = document.createElement("option");
    defaultOption.value = "default";
    defaultOption.textContent = "Default";
    select.append(defaultOption);
    for (const profile of settings.profiles) {
      const option = document.createElement("option");
      option.value = `profile:${profile.id}`;
      option.textContent = `${profile.name} · ${profile.speed}×`;
      select.append(option);
    }
    const customOption = document.createElement("option");
    customOption.value = "custom";
    customOption.textContent = "Custom";
    select.append(customOption);

    const speed = document.createElement("input");
    speed.type = "number";
    speed.min = String(YTSpeed.MIN_SPEED);
    speed.max = String(YTSpeed.MAX_SPEED);
    speed.step = "0.05";
    speed.setAttribute("aria-label", `${kind} custom speed`);
    speed.value = rule?.type === "custom" ? rule.speed : (kind === "shorts" ? settings.defaultShortsSpeed : settings.defaultVideoSpeed);

    if (rule?.type === "profile" && settings.profiles.some((profile) => profile.id === rule.profileId)) select.value = `profile:${rule.profileId}`;
    else if (rule?.type === "custom") select.value = "custom";
    else select.value = "default";
    speed.hidden = select.value !== "custom";
    select.addEventListener("change", () => { speed.hidden = select.value !== "custom"; });
    wrapper.append(select, speed);
    return wrapper;
  }

  function readRuleEditor(editor) {
    const select = editor.querySelector("select");
    if (select.value === "default") return null;
    if (select.value === "custom") return { type: "custom", speed: YTSpeed.clampSpeed(editor.querySelector("input").value) };
    return { type: "profile", profileId: select.value.slice(8) };
  }

  function renderAssignments() {
    elements.assignmentsBody.replaceChildren();
    const query = elements.assignmentSearch.value.trim().toLocaleLowerCase();
    const assignments = Object.values(settings.assignments)
      .filter((assignment) => !query || assignment.channelName.toLocaleLowerCase().includes(query) || assignment.channelId.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.channelName.localeCompare(b.channelName));

    for (const assignment of assignments) {
      const row = document.createElement("tr");
      const creatorCell = document.createElement("td");
      const creatorInfo = document.createElement("div");
      creatorInfo.className = "creator-info";
      let avatar;
      if (assignment.channelAvatarUrl) {
        avatar = document.createElement("img");
        avatar.src = assignment.channelAvatarUrl;
        avatar.alt = "";
        avatar.referrerPolicy = "no-referrer";
      } else {
        avatar = document.createElement("span");
        avatar.textContent = assignment.channelName.charAt(0).toLocaleUpperCase();
        avatar.setAttribute("aria-hidden", "true");
      }
      avatar.className = "creator-avatar";
      const creatorText = document.createElement("div");
      const link = document.createElement("a");
      link.className = "creator-link";
      link.href = assignment.channelUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = assignment.channelName;
      const id = document.createElement("span");
      id.className = "creator-id";
      id.textContent = assignment.channelId;
      creatorText.append(link, id);
      creatorInfo.append(avatar, creatorText);
      creatorCell.append(creatorInfo);

      const videoCell = document.createElement("td");
      const videoEditor = createRuleEditor(assignment.video, "video");
      videoCell.append(videoEditor);
      const shortsCell = document.createElement("td");
      const shortsEditor = createRuleEditor(assignment.shorts, "shorts");
      shortsCell.append(shortsEditor);

      const actions = document.createElement("td");
      actions.append(
        createButton("Save", "small primary", async () => {
          assignment.video = readRuleEditor(videoEditor);
          assignment.shorts = readRuleEditor(shortsEditor);
          assignment.updatedAt = Date.now();
          if (!assignment.video && !assignment.shorts) delete settings.assignments[assignment.channelId];
          settings = await YTSpeed.saveSettings(settings);
          renderAssignments();
          showStatus(`Rules for “${assignment.channelName}” saved.`);
        }),
        " ",
        createButton("Delete", "small danger", async () => {
          if (!confirm(`Delete all rules for “${assignment.channelName}”?`)) return;
          delete settings.assignments[assignment.channelId];
          settings = await YTSpeed.saveSettings(settings);
          renderAssignments();
          showStatus(`Rules for “${assignment.channelName}” deleted.`);
        })
      );
      row.append(creatorCell, videoCell, shortsCell, actions);
      elements.assignmentsBody.append(row);
    }
    elements.assignmentsEmpty.hidden = assignments.length > 0;
    elements.assignmentsEmpty.textContent = query && assignments.length === 0 ? "No creators match your search." : "No creator rules yet.";
  }

  function renderDefaults() {
    elements.defaultVideo.value = settings.defaultVideoSpeed;
    elements.defaultShorts.value = settings.defaultShortsSpeed;
    elements.hotkeyStep.value = settings.hotkeyStep;
  }

  function renderAll() {
    renderDefaults();
    renderProfiles();
    renderHotkeys();
    renderAssignments();
  }

  elements.saveDefaults.addEventListener("click", async () => {
    settings.defaultVideoSpeed = YTSpeed.clampSpeed(elements.defaultVideo.value);
    settings.defaultShortsSpeed = YTSpeed.clampSpeed(elements.defaultShorts.value);
    settings.hotkeyStep = Number(elements.hotkeyStep.value);
    settings = await YTSpeed.saveSettings(settings);
    renderDefaults();
    showStatus("Playback defaults saved.");
  });

  elements.addProfile.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validProfileName(elements.newProfileName.value)) {
      showStatus("Profile names must be non-empty and unique.", true);
      return;
    }
    settings.profiles.push({
      id: YTSpeed.makeId(),
      name: elements.newProfileName.value.trim(),
      speed: YTSpeed.clampSpeed(elements.newProfileSpeed.value),
      slot: elements.newProfileSlot.value ? Number(elements.newProfileSlot.value) : null
    });
    settings = await YTSpeed.saveSettings(settings);
    elements.newProfileName.value = "";
    elements.newProfileSpeed.value = "1.5";
    renderAll();
    showStatus("Profile added.");
  });

  elements.assignmentSearch.addEventListener("input", renderAssignments);

  elements.exportSettings.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `youtube-speed-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus("Settings exported.");
  });

  elements.importSettings.addEventListener("click", async () => {
    const file = elements.importFile.files[0];
    if (!file) {
      showStatus("Choose a JSON backup first.", true);
      return;
    }
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || typeof raw !== "object" || raw.version !== 1 || !Array.isArray(raw.profiles) || !raw.assignments || typeof raw.assignments !== "object") {
        throw new Error("This is not a valid YouTube Speed Profiles backup.");
      }
      const imported = YTSpeed.normalize(raw);
      if (elements.importMode.value === "replace") {
        settings = await YTSpeed.saveSettings(imported);
      } else {
        const profiles = new Map(settings.profiles.map((profile) => [profile.id, profile]));
        for (const profile of imported.profiles) profiles.set(profile.id, profile);
        settings = await YTSpeed.saveSettings({
          ...settings,
          defaultVideoSpeed: imported.defaultVideoSpeed,
          defaultShortsSpeed: imported.defaultShortsSpeed,
          hotkeyStep: imported.hotkeyStep,
          hotkeys: { ...settings.hotkeys, ...imported.hotkeys },
          profiles: [...profiles.values()],
          assignments: { ...settings.assignments, ...imported.assignments }
        });
      }
      renderAll();
      elements.importFile.value = "";
      showStatus("Settings imported.");
    } catch (error) {
      showStatus(error.message || "Could not import that file.", true);
    }
  });

  YTSpeed.loadSettings().then((loaded) => {
    settings = loaded;
    renderAll();
  }).catch((error) => showStatus(error.message || "Could not load settings.", true));
})();
