(function () {
  "use strict";
  const pages = ["home", "clock", "schedule", "focus", "alarms", "settings"];
  const knobPages = ["home", "clock", "schedule", "focus", "alarms", "settings"];
  let wakeLock = null;
  let currentPage = "home";
  let lastPotIndex = null;
  let physicalPollInFlight = false;
  let calibrationInProgress = false;
  let calibrationSetCount = 0;
  const calibrationKey = "deskHubPotCalibration";
  let calibration = null;
  try { calibration = JSON.parse(localStorage.getItem(calibrationKey) || "null"); } catch (_) {}
  const nightReturnDelay = 2 * 60 * 1000;
  const nightControlHideDelay = 10000;
  let lastActivity = Date.now();
  let nightDisplay = false;
  let lastKnobActivityReading = null;

  function pageIndexFor(position) {
    // Six equal slices across the calibrated span, clamped at both end stops.
    return Math.min(knobPages.length - 1, Math.floor(position * knobPages.length));
  }

  function isNightTime() {
    const hour = new Date().getHours();
    return hour >= 20 || hour < 6;
  }

  function updateNightDisplay() {
    const shouldUseNightDisplay = isNightTime();
    document.body.classList.toggle("night-display", shouldUseNightDisplay);
    if (shouldUseNightDisplay !== nightDisplay) {
      nightDisplay = shouldUseNightDisplay;
      lastActivity = Date.now();
      if (nightDisplay) showPage("clock");
    }
  }

  async function updateWakeLock(name) {
    const shouldStayAwake = name === "clock" || !!window.deskHubHasEnabledAlarms;
    if (!shouldStayAwake) {
      if (wakeLock) { try { await wakeLock.release(); } catch (_) {} wakeLock = null; }
      document.getElementById("wake-status").textContent = "Clock display";
      return;
    }
    if (wakeLock) return;
    if (!("wakeLock" in navigator)) {
      document.getElementById("wake-status").textContent = "Keep this tab open to leave the clock visible";
      return;
    }
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      document.getElementById("wake-status").textContent = "Display staying awake";
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch (_) {
      document.getElementById("wake-status").textContent = "Display sleep depends on tablet settings";
    }
  }

  function showPage(name) {
    if (!pages.includes(name)) return;
    currentPage = name;
    window.deskHubCurrentPage = name;
    pages.forEach((page) => {
      document.getElementById(`page-${page}`).classList.toggle("active", page === name);
      const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
      if (nav) nav.classList.toggle("active", page === name);
    });
    if (window.location.hash !== `#${name}`) window.location.hash = name;
    window.scrollTo(0, 0);
    updateWakeLock(name);
  }

  async function readPhysicalControls() {
    if (physicalPollInFlight) return;
    physicalPollInFlight = true;
    try {
      const response = await fetch("/api/control", { cache: "no-store" });
      if (!response.ok) return;
      const controls = await response.json();
      const status = document.getElementById("hardware-status");
      status.textContent = controls.pot === null ? "Knob not available" : "Pico controls connected";
      if (controls.pot !== null) {
        const reading = controls.pot;
        window.deskHubPotReading = reading;
        const left = calibration && Number.isFinite(calibration.left) ? calibration.left : 0;
        const right = calibration && Number.isFinite(calibration.right) ? calibration.right : 65535;
        const span = right - left;
        const position = Math.max(0, Math.min(1, span ? (reading - left) / span : reading / 65535));
        if (lastKnobActivityReading === null) lastKnobActivityReading = reading;
        if (Math.abs(reading - lastKnobActivityReading) >= 500) {
          lastActivity = Date.now();
          document.body.classList.remove("night-controls-hidden");
          lastKnobActivityReading = reading;
        }
        if (lastPotIndex === null) {
          lastPotIndex = pageIndexFor(position);
          if (!nightDisplay && !calibrationInProgress) showPage(knobPages[lastPotIndex]);
        } else if (!calibrationInProgress) {
          // Absolute position selects the page immediately, without movement-based
          // stepping or a per-page delay.
          const target = pageIndexFor(position);
          const edgeMargin = 0.012;
          const shouldStepForward = target > lastPotIndex && position >= (lastPotIndex + 1) / knobPages.length + edgeMargin;
          const shouldStepBack = target < lastPotIndex && position <= lastPotIndex / knobPages.length - edgeMargin;
          if (shouldStepForward || shouldStepBack) {
            lastPotIndex = target;
            lastActivity = Date.now();
            document.body.classList.remove("night-controls-hidden");
            showPage(knobPages[target]);
          }
        }
      }
    } catch (_) {
      document.getElementById("hardware-status").textContent = "Touch navigation ready";
    } finally {
      physicalPollInFlight = false;
    }
  }

  window.deskHubRefreshWakeLock = () => updateWakeLock(currentPage);
  function savePotEnd(which) {
    const message = document.getElementById("knob-calibration-status");
    if (!Number.isFinite(window.deskHubPotReading)) {
      message.textContent = "Connect to the Pico first, then try again.";
      return;
    }
    if (!calibrationInProgress) calibrationSetCount = 0;
    calibrationInProgress = true;
    calibration = calibration || { left: null, right: null };
    calibration[which] = window.deskHubPotReading;
    calibrationSetCount++;
    localStorage.setItem(calibrationKey, JSON.stringify(calibration));
    if (calibrationSetCount < 2) {
      message.textContent = `Saved ${which} endpoint. Turn to the other end and tap its button; page navigation is paused while calibrating.`;
      return;
    }
    if (Number.isFinite(calibration.left) && Number.isFinite(calibration.right)) {
      if (Math.abs(calibration.right - calibration.left) < 4000) {
        calibrationSetCount = 1;
        message.textContent = "The endpoints are too close. Turn to the opposite end and set it again.";
        return;
      }
      const leftEnd = calibration.left;
      const rightEnd = calibration.right;
      const position = Math.max(0, Math.min(1, (window.deskHubPotReading - leftEnd) / (rightEnd - leftEnd)));
      lastPotIndex = pageIndexFor(position);
      calibrationInProgress = false;
      message.textContent = "Knob range saved. Left is Home; right is Settings.";
    } else {
      calibrationInProgress = false;
      message.textContent = "Set both physical end stops to finish calibration.";
    }
  }
  document.getElementById("knob-set-left").addEventListener("click", () => savePotEnd("left"));
  document.getElementById("knob-set-right").addEventListener("click", () => savePotEnd("right"));
  document.getElementById("knob-calibration-status").textContent = calibration && Number.isFinite(calibration.left) && Number.isFinite(calibration.right)
    ? "Knob range calibrated. Left is Home; right is Settings."
    : "Calibration recommended: set the two physical end stops below.";
  function wakeNightControls() {
    lastActivity = Date.now();
    document.body.classList.remove("night-controls-hidden");
  }
  document.addEventListener("pointerdown", wakeNightControls, { passive: true });
  document.addEventListener("keydown", wakeNightControls);
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.page)));
  document.querySelectorAll("[data-open-page]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.openPage)));
  document.getElementById("open-settings").addEventListener("click", () => showPage("settings"));
  window.addEventListener("hashchange", () => showPage(window.location.hash.slice(1) || "home"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden && document.getElementById("page-clock").classList.contains("active")) updateWakeLock("clock"); });
  nightDisplay = isNightTime();
  document.body.classList.toggle("night-display", nightDisplay);
  showPage(nightDisplay ? "clock" : (window.location.hash.slice(1) || "home"));
  readPhysicalControls();
  setInterval(readPhysicalControls, 100);
  setInterval(() => {
    updateNightDisplay();
    if (nightDisplay && currentPage !== "clock" && Date.now() - lastActivity >= nightReturnDelay) {
      lastActivity = Date.now();
      showPage("clock");
    }
    const shouldHideNightControls = nightDisplay && currentPage === "clock" && Date.now() - lastActivity >= nightControlHideDelay;
    document.body.classList.toggle("night-controls-hidden", shouldHideNightControls);
  }, 15000);
})();
