// DOM helpers shared by the popup and the settings page (styles in ui.css).
(() => {
  "use strict";

  const ICONS = {
    settings: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M13 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
    minus: "M5 12h14",
    plus: "M12 5v14M5 12h14",
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
    external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"
  };

  // Builds an element. Props starting with "on" become listeners, known DOM
  // properties are assigned, everything else (aria-*, data-*) is an attribute.
  function h(tag, props = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined) continue;
      // ARIA states are the strings "true"/"false", not boolean attributes.
      if (key.startsWith("aria-")) element.setAttribute(key, String(value));
      else if (value === false) continue;
      else if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
      else if (key in element && !key.includes("-")) element[key] = value;
      else element.setAttribute(key, value === true ? "" : String(value));
    }
    element.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
    return element;
  }

  // Decorative 24×24 stroked icon from ICONS; label the surrounding button instead.
  function icon(name) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", ICONS[name]);
    svg.append(path);
    return svg;
  }

  // Formats a speed for display: 1.5 → "1.5×".
  const speed = (value) => `${Number(value)}×`;

  // Number input wrapped in a ".speed-field" that shows a trailing ×.
  function speedInput(props) {
    return h("span", { className: "speed-field" },
      h("input", { type: "number", min: YTSpeed.MIN_SPEED, max: YTSpeed.MAX_SPEED, step: 0.05, required: true, ...props }));
  }

  // Modal question built on <dialog>. Resolves with the chosen value, or "" when
  // dismissed. Works in popups, where window.confirm() is unavailable in Firefox.
  function ask(message, choices) {
    const dialog = h("dialog", { className: "dialog" },
      h("p", {}, message),
      h("form", { method: "dialog" },
        h("button", { className: "btn ghost", value: "" }, "Cancel"),
        choices.map((choice) => h("button", { className: `btn ${choice.kind || ""}`, value: choice.value }, choice.label))));
    document.body.append(dialog);
    dialog.showModal();
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => {
        resolve(dialog.returnValue);
        dialog.remove();
      }, { once: true });
    });
  }

  let toastTimer;

  // Brief status message at the bottom of the page, announced to screen readers.
  function toast(message, error = false) {
    let element = document.getElementById("toast");
    if (!element) {
      element = h("p", { id: "toast", className: "toast", role: "status", "aria-live": "polite" });
      document.body.append(element);
    }
    clearTimeout(toastTimer);
    element.textContent = message;
    element.classList.toggle("error", error);
    element.classList.add("visible");
    toastTimer = setTimeout(() => element.classList.remove("visible"), error ? 4000 : 1800);
  }

  // Avatar image for a creator, or their initial when no image is known.
  function avatar(name, url) {
    return url
      ? h("img", { className: "avatar", src: url, alt: "", referrerPolicy: "no-referrer" })
      : h("span", { className: "avatar", "aria-hidden": "true" }, (name || "?").charAt(0).toLocaleUpperCase());
  }

  globalThis.UI = { h, icon, speed, speedInput, ask, toast, avatar };
})();
