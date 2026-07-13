if (!globalThis.YTSpeed && typeof importScripts === "function") importScripts("shared.js");

(() => {
  "use strict";

  const actionCommands = [
    "increase", "decrease", "reset",
    "profile1", "profile2", "profile3", "profile4", "profile5",
    "profile6", "profile7", "profile8", "profile9"
  ];
  const settingToCommand = {
    increase: "increase",
    decrease: "decrease",
    reset: "reset",
    openPopup: "_execute_action",
    profile1: "profile1",
    profile2: "profile2",
    profile3: "profile3",
    profile4: "profile4",
    profile5: "profile5",
    profile6: "profile6",
    profile7: "profile7",
    profile8: "profile8",
    profile9: "profile9"
  };

  async function syncCommands(settings) {
    for (const [settingName, commandName] of Object.entries(settingToCommand)) {
      try {
        await browser.commands.update({
          name: commandName,
          shortcut: YTSpeed.toCommandShortcut(settings.hotkeys[settingName] || "")
        });
      } catch (error) {
        console.warn(`Could not register shortcut for ${commandName}:`, error);
      }
    }
  }

  browser.commands.onCommand.addListener(async (command) => {
    if (!actionCommands.includes(command)) return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\/(www\.)?youtube\.com\//.test(tab.url || "")) return;
    try {
      await browser.tabs.sendMessage(tab.id, { type: "RUN_HOTKEY_ACTION", action: command });
    } catch (_) {
      // Existing YouTube tabs need one reload after the extension is installed.
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[YTSpeed.STORAGE_KEY]) return;
    syncCommands(YTSpeed.normalize(changes[YTSpeed.STORAGE_KEY].newValue));
  });

  YTSpeed.loadSettings().then(syncCommands);
})();
