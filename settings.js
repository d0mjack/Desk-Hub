(function () {
  "use strict";
  const choices = Array.from(document.querySelectorAll("[data-theme-choice]"));
  const accentButtons = Array.from(document.querySelectorAll("[data-accent-color]"));
  const customAccentPicker = document.getElementById("custom-accent-color");
  const customAccentPreview = document.getElementById("custom-color-preview");
  const customAccentChoice = document.getElementById("custom-color-choice");
  const saveButton = document.getElementById("appearance-save");
  const saveStatus = document.getElementById("appearance-save-status");
  const palettes = {
    meadow: { paper: "#f4f1ea", card: "#fffefa", ink: "#252922", muted: "#888b80", line: "#e9e6dd", green: "#345b45", soft: "#e6eee6", gold: "#c39342", goldSoft: "#f6edda" },
    warm: { paper: "#eee7dc", card: "#fffaf1", ink: "#302c25", muted: "#928879", line: "#e8dfd1", green: "#65543c", soft: "#eee6d7", gold: "#bc8348", goldSoft: "#f3e5d1" },
    ocean: { paper: "#e9eef0", card: "#fbfdfe", ink: "#252d31", muted: "#818e91", line: "#dde5e6", green: "#365e69", soft: "#dfebed", gold: "#b9824f", goldSoft: "#f1e5d7" },
    midnight: { paper: "#171b1c", card: "#222829", ink: "#eef0e9", muted: "#abb2aa", line: "#394140", green: "#c58c32", soft: "#3a3020", gold: "#d8b36c", goldSoft: "#453b29" }
  };
  const variables = { paper: "--paper", card: "--card", ink: "--ink", muted: "--muted", line: "--line", green: "--green", soft: "--green-soft", gold: "--gold", goldSoft: "--gold-soft" };
  let currentTheme = "meadow";
  let currentAccent = "";

  function blendWithCard(color, card, amount) {
    const rgb = (hex) => hex.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16));
    const first = rgb(color);
    const second = rgb(card);
    return `#${first.map((value, index) => Math.round(value * amount + second[index] * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
  }

  function apply() {
    const palette = palettes[currentTheme] || palettes.meadow;
    document.body.dataset.theme = currentTheme;
    Object.keys(variables).forEach((key) => document.documentElement.style.setProperty(variables[key], palette[key]));
    document.documentElement.style.setProperty("--green", currentAccent || palette.green);
    document.documentElement.style.setProperty("--green-soft", currentAccent ? blendWithCard(currentAccent, palette.card, 0.18) : palette.soft);
    const heroAccent = currentAccent || palette.green;
    const heroSurface = currentAccent || currentTheme === "midnight"
      ? blendWithCard(heroAccent, "#171b1c", 0.64)
      : palette.green;
    document.documentElement.style.setProperty("--hero-surface", heroSurface);
    document.documentElement.style.setProperty("--nav-surface", currentTheme === "midnight" ? "#222829" : "#fffefa");
    document.documentElement.style.setProperty("--nav-border", currentTheme === "midnight" ? "#394140" : "rgba(37,41,34,.07)");
    document.querySelectorAll(".theme-swatch").forEach((swatch) => {
      const theme = palettes[swatch.closest("[data-theme-choice]").dataset.themeChoice];
      swatch.style.background = `linear-gradient(135deg, ${theme.paper} 50%, ${currentAccent || theme.green} 50%)`;
    });
    choices.forEach((button) => {
      const selected = button.dataset.themeChoice === currentTheme;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    accentButtons.forEach((button) => {
      const selected = button.dataset.accentColor === currentAccent;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    const pickerColor = currentAccent || palette.green;
    customAccentPicker.value = pickerColor;
    customAccentPreview.style.backgroundColor = pickerColor;
    const isCustom = !!currentAccent && !accentButtons.some((button) => button.dataset.accentColor === currentAccent);
    customAccentChoice.classList.toggle("selected", isCustom);
  }

  function save() {
    try {
      const value = JSON.stringify({ theme: currentTheme, accent: currentAccent });
      localStorage.setItem("deskHubAppearance", value);
      if (localStorage.getItem("deskHubAppearance") !== value) throw new Error("Could not confirm the saved value");
      saveStatus.textContent = "Saved on this tablet";
      return true;
    } catch (_) {
      saveStatus.textContent = "Could not save here. Check browser storage settings.";
      return false;
    }
  }

  try {
    const saved = JSON.parse(localStorage.getItem("deskHubAppearance") || "{}");
    currentTheme = palettes[saved.theme] ? saved.theme : "meadow";
    currentAccent = /^#[0-9a-f]{6}$/i.test(saved.accent || "") ? saved.accent : "";
  } catch (_) {
    saveStatus.textContent = "Browser storage is unavailable; appearance may reset.";
  }
  apply();
  choices.forEach((button) => button.addEventListener("click", () => {
    currentTheme = button.dataset.themeChoice;
    apply();
    save();
  }));
  accentButtons.forEach((button) => button.addEventListener("click", () => {
    currentAccent = button.dataset.accentColor;
    apply();
    save();
  }));
  customAccentPicker.addEventListener("input", () => {
    currentAccent = customAccentPicker.value;
    apply();
  });
  customAccentPicker.addEventListener("change", () => {
    currentAccent = customAccentPicker.value;
    apply();
    save();
  });
  saveButton.addEventListener("click", save);
})();
