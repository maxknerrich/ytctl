(() => {
  "use strict";

  const { h, icon, speed, toast, ask, avatar } = UI;
  const $ = (id) => document.getElementById(id);
  const elements = {
    avatar: $("avatar"),
    title: $("title"),
    context: $("context"),
    openSettings: $("open-settings"),
    unavailable: $("unavailable"),
    speed: $("speed"),
    currentSpeed: $("current-speed"),
    decrease: $("decrease"),
    increase: $("increase"),
    source: $("source"),
    reset: $("reset"),
    presets: $("presets"),
    rule: $("rule"),
    kindName: $("kind-name"),
    assignment: $("assignment"),
    customField: $("custom-field"),
    customSpeed: $("custom-speed"),
    saveCurrent: $("save-current"),
    updateProfile: $("update-profile")
  };

  // Quick speeds offered when the user has not created any profiles yet.
  const FALLBACK_PRESETS = [1, 1.25, 1.5, 1.75, 2];

  let settings = YTSpeed.defaults();
  let tabId;
  let pageState = null;

  const sameSpeed = (a, b) => Math.abs(a - b) < 0.001;

  async function send(message) {
    try {
      return await browser.tabs.sendMessage(tabId, message);
    } catch (_) {
      return null;
    }
  }

  // Sends a speed command to the page and re-renders with the returned state.
  async function command(message) {
    pageState = (await send(message)) || pageState;
    render();
  }

  function storedRule() {
    if (!pageState?.channel) return null;
    return settings.assignments[pageState.channel.id]?.[pageState.kind] || null;
  }

  function ruleProfile() {
    const rule = storedRule();
    return rule?.type === "profile" ? settings.profiles.find((profile) => profile.id === rule.profileId) : null;
  }

  function renderHeader() {
    const channel = pageState?.channel;
    if (channel) {
      const next = avatar(channel.name, channel.avatarUrl);
      next.id = "avatar";
      elements.avatar.replaceWith(next);
      elements.avatar = next;
    }
    elements.title.textContent = channel?.name || "ytctl";
    if (!tabId) elements.context.textContent = "Not a YouTube tab";
    else if (!pageState) elements.context.textContent = "Reload this tab to connect";
    else if (!pageState.supported) elements.context.textContent = "No video playing";
    else if (pageState.isLive) elements.context.textContent = "Live stream · fixed at 1×";
    else elements.context.textContent = `${pageState.kind === "shorts" ? "Short" : "Video"}${channel ? "" : " · creator unknown"}`;
  }

  function renderSpeed() {
    const { currentSpeed, temporarySpeed, base, isLive } = pageState;
    if (document.activeElement !== elements.currentSpeed) elements.currentSpeed.value = YTSpeed.clampSpeed(currentSpeed);
    for (const control of [elements.currentSpeed, elements.decrease, elements.increase]) control.disabled = isLive;

    const temporary = temporarySpeed !== null && !sameSpeed(temporarySpeed, base.speed);
    elements.source.textContent = temporary ? `Temporary · ${base.label} is ${speed(base.speed)}` : `${base.label} · ${speed(base.speed)}`;
    elements.reset.hidden = !temporary || isLive;

    const presets = settings.profiles.length
      ? settings.profiles.map((profile) => ({ label: profile.name, value: profile.speed }))
      : FALLBACK_PRESETS.map((value) => ({ label: speed(value), value }));
    elements.presets.hidden = isLive;
    elements.presets.replaceChildren(...presets.map((preset) => h("button", {
      type: "button",
      className: "chip",
      "aria-pressed": sameSpeed(preset.value, currentSpeed),
      onclick: () => command({ type: "SET_TEMP_SPEED", speed: preset.value })
    }, preset.label, settings.profiles.length ? h("small", {}, speed(preset.value)) : null)));
  }

  function renderRule() {
    const { channel, kind, currentSpeed, isLive, base } = pageState;
    elements.rule.hidden = !channel;
    if (!channel) return;

    elements.kindName.textContent = kind === "shorts" ? "Shorts" : "videos";
    const defaultSpeed = kind === "shorts" ? settings.defaultShortsSpeed : settings.defaultVideoSpeed;
    elements.assignment.replaceChildren(
      h("option", { value: "default" }, `Default speed (${speed(defaultSpeed)})`),
      ...settings.profiles.map((profile) => h("option", { value: `profile:${profile.id}` }, `${profile.name} · ${speed(profile.speed)}`)),
      h("option", { value: "custom" }, "Custom speed…")
    );

    const rule = storedRule();
    const profile = ruleProfile();
    elements.assignment.value = profile ? `profile:${profile.id}` : rule?.type === "custom" ? "custom" : "default";
    elements.customField.hidden = elements.assignment.value !== "custom";
    if (rule?.type === "custom" && document.activeElement !== elements.customSpeed) elements.customSpeed.value = rule.speed;

    const differs = !isLive && !sameSpeed(currentSpeed, base.speed);
    const current = speed(YTSpeed.clampSpeed(currentSpeed));
    elements.saveCurrent.hidden = !differs;
    elements.saveCurrent.textContent = `Always use ${current} here`;
    elements.updateProfile.hidden = !differs || !profile;
    if (profile) elements.updateProfile.textContent = `Set “${profile.name}” to ${current}`;
  }

  function render() {
    const available = Boolean(pageState?.supported);
    renderHeader();
    elements.unavailable.hidden = available;
    elements.speed.hidden = !available;
    elements.rule.hidden = !available;
    if (!available) return;
    renderSpeed();
    renderRule();
  }

  // Stores `rule` (or removes it when null) for the current creator and content kind.
  async function saveRule(rule) {
    const { channel, kind } = pageState;
    settings = await YTSpeed.updateSettings((next) => {
      const assignment = next.assignments[channel.id] || { channelId: channel.id, video: null, shorts: null };
      assignment.channelName = channel.name;
      assignment.channelUrl = channel.url;
      assignment.channelAvatarUrl = channel.avatarUrl || assignment.channelAvatarUrl || "";
      assignment[kind] = rule;
      assignment.updatedAt = Date.now();
      if (!assignment.video && !assignment.shorts) delete next.assignments[channel.id];
      else next.assignments[channel.id] = assignment;
    });
    await command({ type: "REFRESH_SETTINGS", resetTemporary: true });
    toast(rule ? "Creator rule saved" : "Creator rule removed");
  }

  function selectedRule() {
    const { value } = elements.assignment;
    if (value === "custom") return { type: "custom", speed: YTSpeed.clampSpeed(elements.customSpeed.value) };
    if (value.startsWith("profile:")) return { type: "profile", profileId: value.slice("profile:".length) };
    return null;
  }

  elements.openSettings.append(icon("settings"));
  elements.decrease.append(icon("minus"));
  elements.increase.append(icon("plus"));

  elements.decrease.addEventListener("click", () => command({ type: "ADJUST_SPEED", delta: -settings.hotkeyStep }));
  elements.increase.addEventListener("click", () => command({ type: "ADJUST_SPEED", delta: settings.hotkeyStep }));
  elements.currentSpeed.addEventListener("change", () => command({ type: "SET_TEMP_SPEED", speed: elements.currentSpeed.value }));
  elements.reset.addEventListener("click", () => command({ type: "RESET_SPEED" }));

  elements.assignment.addEventListener("change", () => {
    if (elements.assignment.value === "custom" && !elements.customSpeed.value) {
      elements.customSpeed.value = YTSpeed.clampSpeed(pageState.currentSpeed);
    }
    saveRule(selectedRule());
  });

  elements.customSpeed.addEventListener("change", () => {
    if (elements.customSpeed.checkValidity()) saveRule(selectedRule());
  });

  elements.saveCurrent.addEventListener("click", () => {
    elements.customSpeed.value = YTSpeed.clampSpeed(pageState.currentSpeed);
    saveRule({ type: "custom", speed: YTSpeed.clampSpeed(pageState.currentSpeed) });
  });

  elements.updateProfile.addEventListener("click", async () => {
    const profile = ruleProfile();
    if (!profile) return;
    const usage = YTSpeed.profileUsage(settings, profile.id);
    const next = YTSpeed.clampSpeed(pageState.currentSpeed);
    const answer = await ask(
      `Change “${profile.name}” from ${speed(profile.speed)} to ${speed(next)}? This affects ${usage} creator rule${usage === 1 ? "" : "s"}.`,
      [{ label: "Update profile", value: "update", kind: "primary" }]
    );
    if (answer !== "update") return;
    settings = await YTSpeed.updateSettings((draft) => {
      const target = draft.profiles.find((item) => item.id === profile.id);
      if (target) target.speed = next;
    });
    await command({ type: "REFRESH_SETTINGS", resetTemporary: true });
    toast(`“${profile.name}” updated`);
  });

  elements.openSettings.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });

  YTSpeed.onSettingsChanged((next) => {
    settings = next;
    render();
  });

  (async () => {
    settings = await YTSpeed.loadSettings();
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && /^https?:\/\/(www\.)?youtube\.com\//.test(tab.url || "")) {
      tabId = tab.id;
      pageState = await send({ type: "GET_STATE" });
    }
    render();
  })().catch((error) => {
    pageState = null;
    render();
    toast(error.message || "Unable to load ytctl", true);
  });
})();
