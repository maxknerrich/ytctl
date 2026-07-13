(() => {
  "use strict";

  let settings = YTSpeed.defaults();
  let attachedVideo = null;
  let ownRateUntil = 0;
  let resolveToken = 0;
  let lastUrl = location.href;
  let lastAdState = false;
  let lastHotkeyAction = "";
  let lastHotkeySource = "";
  let lastHotkeyAt = 0;
  const channelCache = new Map();

  const state = {
    videoId: null,
    kind: "video",
    isLive: false,
    channel: null,
    temporarySpeed: null,
    base: { speed: 1, source: "default", label: "Default" }
  };

  function getVideoId() {
    const shortsMatch = location.pathname.match(/^\/shorts\/([^/?]+)/);
    if (shortsMatch) return shortsMatch[1];
    const fromQuery = new URL(location.href).searchParams.get("v");
    if (fromQuery) return fromQuery;
    const data = getPlayerData();
    return data?.video_id || data?.videoId || null;
  }

  function getKind() {
    return location.pathname.startsWith("/shorts/") ? "shorts" : "video";
  }

  function visibleVideo() {
    const activeShort = document.querySelector("ytd-reel-video-renderer[is-active] video, ytd-reel-video-renderer[active] video");
    if (activeShort) return activeShort;
    const playerVideo = document.querySelector("#movie_player video.html5-main-video, #movie_player video");
    if (playerVideo) return playerVideo;
    const videos = [...document.querySelectorAll("video")];
    return videos.find((video) => !video.paused && video.readyState > 0)
      || videos.find((video) => video.getBoundingClientRect().width > 0)
      || null;
  }

  function getPlayerElement() {
    if (state.kind === "shorts") {
      return attachedVideo?.closest(".html5-video-player") || document.querySelector("ytd-reel-video-renderer[is-active] .html5-video-player");
    }
    return document.querySelector("#movie_player") || attachedVideo?.closest(".html5-video-player");
  }

  function getPlayerData() {
    const player = document.querySelector("#movie_player") || document.querySelector("ytd-reel-video-renderer[is-active] .html5-video-player");
    if (!player) return null;
    for (const candidate of [player, player.wrappedJSObject]) {
      try {
        if (typeof candidate?.getVideoData === "function") return candidate.getVideoData();
      } catch (_) {
        // Firefox page/content boundaries can make one of these inaccessible.
      }
    }
    return null;
  }

  function detectLive(video) {
    if (!video || state.kind === "shorts") return false;
    if (video.duration === Infinity) return true;
    const flexy = document.querySelector("ytd-watch-flexy");
    if (flexy?.hasAttribute("is-live") || flexy?.hasAttribute("is-live-content")) return true;
    const liveBadge = document.querySelector(".ytp-live-badge");
    return Boolean(liveBadge && getComputedStyle(liveBadge).display !== "none");
  }

  function isAdPlaying() {
    return Boolean(getPlayerElement()?.classList.contains("ad-showing"));
  }

  function creatorAvatarUrl() {
    const selector = state.kind === "shorts"
      ? "ytd-reel-video-renderer[is-active] #avatar img, ytd-reel-video-renderer[active] #avatar img"
      : "ytd-watch-metadata #owner #avatar img, ytd-video-owner-renderer #avatar img";
    const image = document.querySelector(selector);
    const url = image?.currentSrc || image?.src || "";
    return /^https?:\/\//.test(url) ? url : "";
  }

  function channelFromPlayer(videoId) {
    const data = getPlayerData();
    const dataVideoId = data?.video_id || data?.videoId;
    if (!data || (dataVideoId && videoId && dataVideoId !== videoId)) return null;
    const channelId = data.channel_id || data.channelId;
    if (!channelId) return null;
    return {
      id: channelId,
      name: data.author || data.ownerChannelName || channelId,
      url: `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`,
      avatarUrl: creatorAvatarUrl()
    };
  }

  function parseJsonObjectAt(text, start) {
    const open = text.indexOf("{", start);
    if (open < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = open; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(open, index + 1));
          } catch (_) {
            return null;
          }
        }
      }
    }
    return null;
  }

  function channelFromText(text, videoId) {
    let cursor = 0;
    const marker = '"videoDetails"';
    while ((cursor = text.indexOf(marker, cursor)) >= 0) {
      const details = parseJsonObjectAt(text, cursor + marker.length);
      if (details?.channelId && (!videoId || details.videoId === videoId)) {
        return {
          id: details.channelId,
          name: details.author || details.channelId,
          url: `https://www.youtube.com/channel/${encodeURIComponent(details.channelId)}`,
          avatarUrl: creatorAvatarUrl()
        };
      }
      cursor += marker.length;
    }
    return null;
  }

  async function resolveChannel(videoId) {
    if (!videoId) return null;
    if (channelCache.has(videoId)) {
      const cached = channelCache.get(videoId);
      if (!cached.avatarUrl) cached.avatarUrl = creatorAvatarUrl();
      return cached;
    }

    const playerChannel = channelFromPlayer(videoId);
    if (playerChannel) {
      channelCache.set(videoId, playerChannel);
      return playerChannel;
    }

    for (const script of document.scripts) {
      if (!script.textContent?.includes(videoId) || !script.textContent.includes('"videoDetails"')) continue;
      const channel = channelFromText(script.textContent, videoId);
      if (channel) {
        channelCache.set(videoId, channel);
        return channel;
      }
    }

    try {
      const response = await fetch(location.href, { credentials: "same-origin", cache: "no-store" });
      if (response.ok) {
        const channel = channelFromText(await response.text(), videoId);
        if (channel) {
          channelCache.set(videoId, channel);
          return channel;
        }
      }
    } catch (_) {
      // The video still receives the configured default if metadata cannot be resolved.
    }

    const stableLink = state.kind === "shorts"
      ? document.querySelector('ytd-reel-video-renderer[is-active] a[href^="/channel/UC"], ytd-reel-video-renderer[active] a[href^="/channel/UC"]')
      : document.querySelector('ytd-watch-metadata #owner a[href^="/channel/UC"], ytd-video-owner-renderer a[href^="/channel/UC"]');
    const match = stableLink?.href.match(/\/channel\/(UC[^/?]+)/);
    if (match) {
      const name = stableLink.textContent.trim() || stableLink.getAttribute("aria-label") || match[1];
      const channel = { id: match[1], name, url: `https://www.youtube.com/channel/${match[1]}`, avatarUrl: creatorAvatarUrl() };
      channelCache.set(videoId, channel);
      return channel;
    }
    return null;
  }

  function persistCreatorMetadata(channel) {
    const current = settings.assignments[channel?.id];
    if (!current) return;
    const avatarUrl = channel.avatarUrl || current.channelAvatarUrl || "";
    if (current.channelName === channel.name && current.channelUrl === channel.url && current.channelAvatarUrl === avatarUrl) return;
    YTSpeed.updateSettings((next) => {
      const assignment = next.assignments[channel.id];
      if (!assignment) return next;
      assignment.channelName = channel.name;
      assignment.channelUrl = channel.url;
      assignment.channelAvatarUrl = avatarUrl;
      return next;
    }).then((updated) => { settings = updated; });
  }

  function calculateBase() {
    if (state.isLive) return { speed: 1, source: "live", label: "Live stream" };
    return YTSpeed.effectiveRule(settings, state.channel?.id, state.kind);
  }

  function desiredSpeed() {
    if (state.isLive) return 1;
    return state.temporarySpeed ?? state.base.speed;
  }

  function setVideoRate(speed) {
    if (!attachedVideo || isAdPlaying()) return;
    const next = YTSpeed.clampSpeed(speed);
    if (Math.abs(attachedVideo.playbackRate - next) < 0.001) return;
    ownRateUntil = Date.now() + 250;
    attachedVideo.playbackRate = next;
  }

  function applyDesired() {
    state.base = calculateBase();
    setVideoRate(desiredSpeed());
  }

  function showOverlay(message) {
    let overlay = document.getElementById("yt-speed-profiles-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "yt-speed-profiles-overlay";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      document.body.append(overlay);
    }
    overlay.textContent = message;
    overlay.classList.remove("visible");
    void overlay.offsetWidth;
    overlay.classList.add("visible");
    clearTimeout(showOverlay.timer);
    showOverlay.timer = setTimeout(() => overlay.classList.remove("visible"), 1500);
  }

  function setTemporary(speed, label = "Speed") {
    if (state.isLive) {
      showOverlay("Live streams stay at 1×");
      return false;
    }
    state.temporarySpeed = YTSpeed.clampSpeed(speed);
    setVideoRate(state.temporarySpeed);
    showOverlay(`${label}: ${state.temporarySpeed}×`);
    return true;
  }

  function resetTemporary() {
    state.temporarySpeed = null;
    state.base = calculateBase();
    setVideoRate(state.base.speed);
    showOverlay(`Reset: ${state.base.label} — ${state.base.speed}×`);
  }

  function onRateChange() {
    if (!attachedVideo || Date.now() <= ownRateUntil || isAdPlaying() || state.isLive) return;
    state.temporarySpeed = YTSpeed.clampSpeed(attachedVideo.playbackRate);
  }

  function attachVideo(video) {
    if (attachedVideo === video) return;
    if (attachedVideo) attachedVideo.removeEventListener("ratechange", onRateChange);
    attachedVideo = video;
    if (!video) return;
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("loadedmetadata", refreshPage, { once: true });
    applyDesired();
  }

  async function startVideo(videoId, kind) {
    const token = ++resolveToken;
    state.videoId = videoId;
    state.kind = kind;
    state.channel = null;
    state.temporarySpeed = null;
    state.isLive = detectLive(visibleVideo());
    state.base = calculateBase();
    attachVideo(visibleVideo());
    applyDesired();

    const channel = await resolveChannel(videoId);
    if (token !== resolveToken || state.videoId !== videoId) return;
    state.channel = channel;
    persistCreatorMetadata(channel);
    state.base = calculateBase();
    applyDesired();
  }

  function refreshPage() {
    const video = visibleVideo();
    attachVideo(video);
    const videoId = getVideoId();
    const kind = getKind();
    if (videoId && (videoId !== state.videoId || kind !== state.kind)) {
      startVideo(videoId, kind);
      return;
    }

    if (state.channel && !state.channel.avatarUrl) {
      state.channel.avatarUrl = creatorAvatarUrl();
      if (state.channel.avatarUrl) persistCreatorMetadata(state.channel);
    }

    const live = detectLive(video);
    if (live !== state.isLive) {
      state.isLive = live;
      state.temporarySpeed = null;
      applyDesired();
    }

    const ad = isAdPlaying();
    if (lastAdState && !ad) applyDesired();
    lastAdState = ad;
  }

  function stateSnapshot() {
    return {
      supported: Boolean(state.videoId && attachedVideo),
      videoId: state.videoId,
      kind: state.kind,
      isLive: state.isLive,
      isAd: isAdPlaying(),
      channel: state.channel,
      temporarySpeed: state.temporarySpeed,
      currentSpeed: attachedVideo?.playbackRate ?? desiredSpeed(),
      base: state.base
    };
  }

  async function reloadSettings(resetTemporary = false) {
    settings = await YTSpeed.loadSettings();
    if (resetTemporary) state.temporarySpeed = null;
    state.base = calculateBase();
    applyDesired();
  }

  function runHotkeyAction(action, source) {
    if (!state.videoId || !attachedVideo) return false;
    const now = Date.now();
    if (action === lastHotkeyAction && source !== lastHotkeySource && now - lastHotkeyAt < 200) return false;
    lastHotkeyAction = action;
    lastHotkeySource = source;
    lastHotkeyAt = now;

    if (action === "increase") setTemporary(desiredSpeed() + settings.hotkeyStep);
    else if (action === "decrease") setTemporary(desiredSpeed() - settings.hotkeyStep);
    else if (action === "reset") resetTemporary();
    else if (action.startsWith("profile")) {
      const slot = Number(action.replace("profile", ""));
      const profile = settings.profiles.find((item) => item.slot === slot);
      if (profile) setTemporary(profile.speed, `Profile: ${profile.name}`);
      else showOverlay(`No profile assigned to slot ${slot}`);
    } else return false;
    return true;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return undefined;
    if (message.type === "GET_STATE") {
      refreshPage();
      return Promise.resolve(stateSnapshot());
    }
    if (message.type === "SET_TEMP_SPEED") {
      setTemporary(message.speed);
      return Promise.resolve(stateSnapshot());
    }
    if (message.type === "ADJUST_SPEED") {
      setTemporary(desiredSpeed() + Number(message.delta || 0));
      return Promise.resolve(stateSnapshot());
    }
    if (message.type === "RESET_SPEED") {
      resetTemporary();
      return Promise.resolve(stateSnapshot());
    }
    if (message.type === "REFRESH_SETTINGS") {
      return reloadSettings(Boolean(message.resetTemporary)).then(stateSnapshot);
    }
    if (message.type === "RUN_HOTKEY_ACTION") {
      if (!YTSpeed.isEditable(document.activeElement)) runHotkeyAction(message.action, "command");
      return Promise.resolve(stateSnapshot());
    }
    return undefined;
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || YTSpeed.isEditable(event.target)) return;
    const combo = YTSpeed.eventHotkey(event);
    if (!combo) return;
    const action = Object.entries(settings.hotkeys).find(([, configured]) => configured && configured === combo)?.[0];
    if (!action || !runHotkeyAction(action, "page")) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener("yt-navigate-finish", refreshPage);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[YTSpeed.STORAGE_KEY]) reloadSettings(false);
  });

  YTSpeed.loadSettings().then((loaded) => {
    settings = loaded;
    refreshPage();
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        refreshPage();
      } else {
        refreshPage();
      }
    }, 700);
  });
})();
