(() => {
  "use strict";

  const elements = {
    unavailable: document.getElementById("unavailable"),
    controls: document.getElementById("controls"),
    context: document.getElementById("context-label"),
    currentSpeed: document.getElementById("current-speed"),
    decrease: document.getElementById("decrease"),
    increase: document.getElementById("increase"),
    reset: document.getElementById("reset"),
    effectiveRule: document.getElementById("effective-rule"),
    creatorSection: document.getElementById("creator-section"),
    creatorName: document.getElementById("creator-name"),
    kindName: document.getElementById("kind-name"),
    assignment: document.getElementById("assignment"),
    customRow: document.getElementById("custom-speed-row"),
    customSpeed: document.getElementById("custom-speed"),
    saveAssignment: document.getElementById("save-assignment"),
    saveCurrentCustom: document.getElementById("save-current-custom"),
    updateProfile: document.getElementById("update-profile"),
    openSettings: document.getElementById("open-settings"),
    status: document.getElementById("status")
  };

  let settings;
  let tabId;
  let pageState;

  function setStatus(message, error = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("error", error);
  }

  async function send(message) {
    try {
      return await browser.tabs.sendMessage(tabId, message);
    } catch (_) {
      return null;
    }
  }

  function selectedRule() {
    const value = elements.assignment.value;
    if (value === "default") return null;
    if (value === "custom") return { type: "custom", speed: YTSpeed.clampSpeed(elements.customSpeed.value) };
    if (value.startsWith("profile:")) return { type: "profile", profileId: value.slice(8) };
    return null;
  }

  function currentStoredRule() {
    if (!pageState?.channel) return null;
    return settings.assignments[pageState.channel.id]?.[pageState.kind] || null;
  }

  function fillAssignmentOptions() {
    elements.assignment.replaceChildren();
    const defaultOption = document.createElement("option");
    defaultOption.value = "default";
    defaultOption.textContent = `No creator rule (${pageState.kind === "shorts" ? settings.defaultShortsSpeed : settings.defaultVideoSpeed}× default)`;
    elements.assignment.append(defaultOption);

    for (const profile of settings.profiles) {
      const option = document.createElement("option");
      option.value = `profile:${profile.id}`;
      option.textContent = `${profile.name} — ${profile.speed}×`;
      elements.assignment.append(option);
    }

    const customOption = document.createElement("option");
    customOption.value = "custom";
    customOption.textContent = "Custom speed…";
    elements.assignment.append(customOption);

    const rule = currentStoredRule();
    if (rule?.type === "profile" && settings.profiles.some((profile) => profile.id === rule.profileId)) {
      elements.assignment.value = `profile:${rule.profileId}`;
    } else if (rule?.type === "custom") {
      elements.assignment.value = "custom";
      elements.customSpeed.value = rule.speed;
    } else {
      elements.assignment.value = "default";
      elements.customSpeed.value = pageState.currentSpeed;
    }
    elements.customRow.hidden = elements.assignment.value !== "custom";
  }

  function render() {
    const available = Boolean(pageState?.supported);
    elements.unavailable.hidden = available;
    elements.controls.hidden = !available;
    if (!available) {
      elements.context.textContent = "No supported video detected";
      return;
    }

    const kindLabel = pageState.kind === "shorts" ? "Short" : "Video";
    elements.context.textContent = pageState.isLive ? "Live stream · fixed at 1×" : kindLabel;
    elements.currentSpeed.value = Number(pageState.currentSpeed).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    elements.currentSpeed.disabled = pageState.isLive;
    elements.decrease.disabled = pageState.isLive;
    elements.increase.disabled = pageState.isLive;
    elements.reset.disabled = pageState.isLive;
    elements.effectiveRule.textContent = pageState.temporarySpeed !== null
      ? `Temporary override · assigned: ${pageState.base.label} (${pageState.base.speed}×)`
      : `${pageState.base.label} · ${pageState.base.speed}×`;

    elements.kindName.textContent = pageState.kind === "shorts" ? "Shorts" : "videos";
    if (!pageState.channel) {
      elements.creatorName.textContent = "Creator unavailable";
      elements.creatorSection.querySelectorAll("select, input, button").forEach((control) => { control.disabled = true; });
      elements.updateProfile.hidden = true;
      return;
    }

    elements.creatorSection.querySelectorAll("select, input, button").forEach((control) => { control.disabled = false; });
    elements.creatorName.textContent = pageState.channel.name;
    fillAssignmentOptions();

    const rule = currentStoredRule();
    const profile = rule?.type === "profile" ? settings.profiles.find((item) => item.id === rule.profileId) : null;
    const canUpdate = profile && Math.abs(profile.speed - pageState.currentSpeed) >= 0.001;
    elements.updateProfile.hidden = !canUpdate;
    if (canUpdate) elements.updateProfile.textContent = `Update “${profile.name}” to ${YTSpeed.clampSpeed(pageState.currentSpeed)}×`;
  }

  async function refreshFromPage() {
    pageState = await send({ type: "GET_STATE" });
    render();
  }

  async function saveRule(rule) {
    const channel = pageState.channel;
    const kind = pageState.kind;
    settings = await YTSpeed.updateSettings((next) => {
      const existing = next.assignments[channel.id] || {
        channelId: channel.id,
        channelName: channel.name,
        channelUrl: channel.url,
        channelAvatarUrl: channel.avatarUrl || "",
        video: null,
        shorts: null,
        updatedAt: Date.now()
      };
      existing.channelName = channel.name;
      existing.channelUrl = channel.url;
      existing.channelAvatarUrl = channel.avatarUrl || existing.channelAvatarUrl || "";
      existing[kind] = rule;
      existing.updatedAt = Date.now();
      if (!existing.video && !existing.shorts) delete next.assignments[channel.id];
      else next.assignments[channel.id] = existing;
      return next;
    });
    pageState = await send({ type: "REFRESH_SETTINGS", resetTemporary: true }) || pageState;
    render();
  }

  elements.assignment.addEventListener("change", () => {
    elements.customRow.hidden = elements.assignment.value !== "custom";
    if (elements.assignment.value === "custom" && !elements.customSpeed.value) {
      elements.customSpeed.value = pageState.currentSpeed;
    }
  });

  elements.decrease.addEventListener("click", async () => {
    pageState = await send({ type: "ADJUST_SPEED", delta: -settings.hotkeyStep }) || pageState;
    render();
  });

  elements.increase.addEventListener("click", async () => {
    pageState = await send({ type: "ADJUST_SPEED", delta: settings.hotkeyStep }) || pageState;
    render();
  });

  elements.currentSpeed.addEventListener("change", async () => {
    pageState = await send({ type: "SET_TEMP_SPEED", speed: elements.currentSpeed.value }) || pageState;
    render();
  });

  elements.reset.addEventListener("click", async () => {
    pageState = await send({ type: "RESET_SPEED" }) || pageState;
    render();
  });

  elements.saveAssignment.addEventListener("click", async () => {
    await saveRule(selectedRule());
    setStatus("Creator rule saved.");
  });

  elements.saveCurrentCustom.addEventListener("click", async () => {
    await saveRule({ type: "custom", speed: YTSpeed.clampSpeed(pageState.currentSpeed) });
    setStatus("Current speed saved for this creator.");
  });

  elements.updateProfile.addEventListener("click", async () => {
    const rule = currentStoredRule();
    const profile = rule?.type === "profile" ? settings.profiles.find((item) => item.id === rule.profileId) : null;
    if (!profile) return;
    const usage = YTSpeed.profileUsage(settings, profile.id);
    const speed = YTSpeed.clampSpeed(pageState.currentSpeed);
    if (!confirm(`Update “${profile.name}” from ${profile.speed}× to ${speed}×? This affects ${usage} creator rule${usage === 1 ? "" : "s"}.`)) return;
    settings = await YTSpeed.updateSettings((next) => {
      const target = next.profiles.find((item) => item.id === profile.id);
      if (target) target.speed = speed;
      return next;
    });
    pageState = await send({ type: "REFRESH_SETTINGS", resetTemporary: true }) || pageState;
    render();
    setStatus(`Profile “${profile.name}” updated.`);
  });

  elements.openSettings.addEventListener("click", () => browser.runtime.openOptionsPage());

  (async () => {
    settings = await YTSpeed.loadSettings();
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    if (!tabId || !/^https?:\/\/(www\.)?youtube\.com\//.test(tab.url || "")) {
      pageState = null;
      render();
      return;
    }
    await refreshFromPage();
  })().catch((error) => {
    setStatus(error.message || "Unable to load the extension.", true);
    pageState = null;
    render();
  });
})();
