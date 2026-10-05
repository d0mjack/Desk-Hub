(function () {
  "use strict";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const form = document.getElementById("alarm-form");
  const list = document.getElementById("alarm-list");
  const overlay = document.getElementById("alarm-overlay");
  const soundButton = document.getElementById("alarm-sound-toggle");
  const soundTestButton = document.getElementById("alarm-sound-test");
  const soundStatus = document.getElementById("alarm-sound-status");
  const saveStatus = document.getElementById("alarm-save-status");
  const hourOutput = document.getElementById("alarm-hour");
  const minuteOutput = document.getElementById("alarm-minute");
  let selectedHour = 7;
  let selectedMinute = 0;
  let selectedMeridiem = "AM";
  let selectedLabel = "Wake up";
  let alarms = [];
  let fired = {};
  let soundEnabled = false;
  let toneChoice = "bold";
  let audioContext = null;
  let toneTimer = null;
  let activeAlarm = null;
  const ringingQueue = [];

  let storageReadFailed = false;
  try { alarms = JSON.parse(localStorage.getItem("deskHubAlarms") || "[]"); } catch (_) { alarms = []; storageReadFailed = true; }
  try { fired = JSON.parse(localStorage.getItem("deskHubAlarmFired") || "{}"); } catch (_) { fired = {}; storageReadFailed = true; }
  try {
    const savedTone = localStorage.getItem("deskHubAlarmTone");
    if (["soft", "classic", "bold"].includes(savedTone)) toneChoice = savedTone;
  } catch (_) {}

  Object.defineProperty(window, "deskHubHasEnabledAlarms", { get: () => !!activeAlarm || ringingQueue.length > 0 || alarms.some((alarm) => alarm.enabled || alarm.snoozeUntil) });

  function save() {
    try {
      const savedAlarms = JSON.stringify(alarms);
      const savedFired = JSON.stringify(fired);
      localStorage.setItem("deskHubAlarms", savedAlarms);
      localStorage.setItem("deskHubAlarmFired", savedFired);
      if (localStorage.getItem("deskHubAlarms") !== savedAlarms || localStorage.getItem("deskHubAlarmFired") !== savedFired) throw new Error("Could not confirm the saved value");
      saveStatus.textContent = "Saved on this tablet";
      if (window.deskHubRefreshWakeLock) window.deskHubRefreshWakeLock();
      return true;
    } catch (_) {
      saveStatus.textContent = "Could not save here. Check browser storage settings.";
      return false;
    }
  }

  function formatTime(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
  }

  function repeatText(alarm) {
    if (!alarm.days || alarm.days.length === 0) return "Once";
    if (alarm.days.length === 7) return "Every day";
    if ([1, 2, 3, 4, 5].every((day) => alarm.days.includes(day)) && alarm.days.length === 5) return "Weekdays";
    return alarm.days.slice().sort((a, b) => a - b).map((day) => days[day]).join(" · ");
  }

  function render() {
    list.replaceChildren();
    const upcoming = alarms.filter((alarm) => alarm.enabled).slice().sort((a, b) => a.time.localeCompare(b.time));
    const alarmLed = document.querySelector(".alarm-led");
    document.getElementById("clock-alarm-indicator").textContent = upcoming.length ? "ALARM SET" : "ALARM OFF";
    alarmLed.classList.toggle("active", upcoming.length > 0);
    document.getElementById("clock-next-alarm").textContent = upcoming.length ? formatTime(upcoming[0].time) : "Not set";
    if (alarms.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No alarms set.";
      list.appendChild(empty);
      return;
    }
    alarms.slice().sort((a, b) => a.time.localeCompare(b.time)).forEach((alarm) => {
      const row = document.createElement("div");
      row.className = `alarm-item${alarm.enabled ? "" : " disabled"}`;
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = !!alarm.enabled;
      toggle.setAttribute("aria-label", `Enable ${alarm.label || "alarm"}`);
      toggle.addEventListener("change", () => { alarm.enabled = toggle.checked; save(); render(); });
      const info = document.createElement("div");
      info.className = "alarm-item-info";
      const time = document.createElement("strong");
      time.textContent = formatTime(alarm.time);
      const label = document.createElement("span");
      label.textContent = `${alarm.label || "Alarm"} · ${repeatText(alarm)}`;
      info.append(time, label);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "alarm-delete";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => { alarms = alarms.filter((item) => item.id !== alarm.id); save(); render(); });
      row.append(toggle, info, remove);
      list.appendChild(row);
    });
  }

  function createAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) audioContext = new AudioContextClass();
    return audioContext;
  }

  function beep(force = false) {
    if ((!soundEnabled && !force) || !audioContext) return;
    try {
      if (audioContext.state === "suspended") audioContext.resume();
      const tones = {
        soft: { frequencies: [523, 659], type: "sine", volume: 0.11, gap: 0.34, duration: 0.46 },
        classic: { frequencies: [740, 988], type: "sine", volume: 0.16, gap: 0.24, duration: 0.4 },
        bold: { frequencies: [880, 1175, 880], type: "triangle", volume: 0.22, gap: 0.16, duration: 0.48 }
      }[toneChoice];
      tones.frequencies.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = audioContext.currentTime + index * tones.gap;
        oscillator.frequency.value = frequency;
        oscillator.type = tones.type;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(tones.volume, start + 0.035);
        gain.gain.exponentialRampToValueAtTime(0.001, start + tones.duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + tones.duration + 0.02);
      });
    } catch (_) {}
  }

  function stopTone() { clearInterval(toneTimer); toneTimer = null; }

  function showNextAlarm() {
    activeAlarm = ringingQueue.shift() || null;
    if (!activeAlarm) { overlay.hidden = true; stopTone(); if (window.deskHubRefreshWakeLock) window.deskHubRefreshWakeLock(); return; }
    document.getElementById("alarm-ring-title").textContent = activeAlarm.label || "Time to wake up";
    document.getElementById("ringing-time").textContent = formatTime(activeAlarm.time);
    document.getElementById("ringing-label").textContent = "Your alarm is ringing.";
    overlay.hidden = false;
    if ("vibrate" in navigator) { try { navigator.vibrate([250, 150, 250]); } catch (_) {} }
    beep();
    toneTimer = setInterval(beep, 1800);
    if (window.deskHubRefreshWakeLock) window.deskHubRefreshWakeLock();
  }

  function ring(alarm) {
    if (activeAlarm) ringingQueue.push(alarm);
    else { ringingQueue.push(alarm); showNextAlarm(); }
  }

  function checkAlarms() {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const nowMs = now.getTime();
    let changed = false;
    alarms.forEach((alarm) => {
      if (alarm.snoozeUntil && nowMs >= alarm.snoozeUntil) {
        alarm.snoozeUntil = 0;
        changed = true;
        ring(alarm);
        return;
      }
      if (!alarm.enabled || alarm.time !== time) return;
      if (alarm.days && alarm.days.length && !alarm.days.includes(now.getDay())) return;
      const key = `${alarm.id}:${dateKey}`;
      if (fired[key]) return;
      fired[key] = true;
      if (!alarm.days || alarm.days.length === 0) alarm.enabled = false;
      changed = true;
      ring(alarm);
    });
    if (changed) { save(); render(); }
  }

  function updateTimeControls() {
    hourOutput.textContent = String(selectedHour);
    minuteOutput.textContent = String(selectedMinute).padStart(2, "0");
    document.querySelectorAll("[data-meridiem]").forEach((button) => {
      button.classList.toggle("selected", button.dataset.meridiem === selectedMeridiem);
    });
  }

  document.querySelectorAll("[data-time-unit]").forEach((button) => button.addEventListener("click", () => {
    const step = Number(button.dataset.step);
    if (button.dataset.timeUnit === "hour") selectedHour = ((selectedHour - 1 + step + 12) % 12) + 1;
    else selectedMinute = (selectedMinute + step + 60) % 60;
    updateTimeControls();
  }));
  document.querySelectorAll("[data-meridiem]").forEach((button) => button.addEventListener("click", () => {
    selectedMeridiem = button.dataset.meridiem;
    updateTimeControls();
  }));
  document.querySelectorAll("[data-alarm-label]").forEach((button) => button.addEventListener("click", () => {
    selectedLabel = button.dataset.alarmLabel;
    document.querySelectorAll("[data-alarm-label]").forEach((choice) => choice.classList.toggle("selected", choice === button));
  }));
  updateTimeControls();

  function updateToneChoices() {
    document.querySelectorAll("[data-alarm-tone]").forEach((button) => {
      const selected = button.dataset.alarmTone === toneChoice;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }
  document.querySelectorAll("[data-alarm-tone]").forEach((button) => button.addEventListener("click", () => {
    toneChoice = button.dataset.alarmTone;
    try { localStorage.setItem("deskHubAlarmTone", toneChoice); } catch (_) {}
    updateToneChoices();
    soundStatus.textContent = `${button.textContent} tone selected`;
  }));
  updateToneChoices();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const hour24 = (selectedHour % 12) + (selectedMeridiem === "PM" ? 12 : 0);
    const time = `${String(hour24).padStart(2, "0")}:${String(selectedMinute).padStart(2, "0")}`;
    const daysPicked = Array.from(form.querySelectorAll(".weekday-choices input:checked")).map((input) => Number(input.value));
    alarms.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, time, label: selectedLabel, days: daysPicked, enabled: true, snoozeUntil: 0 });
    const saved = save();
    render();
    if (saved) {
      form.reset();
      selectedHour = 7;
      selectedMinute = 0;
      selectedMeridiem = "AM";
      selectedLabel = "Wake up";
      document.querySelectorAll("[data-alarm-label]").forEach((choice) => choice.classList.toggle("selected", choice.dataset.alarmLabel === selectedLabel));
      updateTimeControls();
    }
  });

  soundButton.addEventListener("click", async () => {
    const context = createAudioContext();
    if (!context) { soundButton.textContent = "This browser has no alarm audio"; return; }
    try { await context.resume(); } catch (_) {}
    soundEnabled = true;
    soundButton.textContent = "Alarm sound enabled";
    soundStatus.textContent = "Alarm sound is ready";
    beep();
  });
  soundTestButton.addEventListener("click", async () => {
    const context = createAudioContext();
    if (!context) { soundStatus.textContent = "This browser has no alarm audio"; return; }
    try { await context.resume(); } catch (_) {}
    soundStatus.textContent = `Playing ${toneChoice} tone`;
    beep(true);
  });
  document.getElementById("alarm-dismiss").addEventListener("click", () => { stopTone(); activeAlarm = null; showNextAlarm(); });
  document.getElementById("alarm-snooze").addEventListener("click", () => {
    if (activeAlarm) { activeAlarm.snoozeUntil = Date.now() + 9 * 60 * 1000; save(); }
    stopTone(); activeAlarm = null; showNextAlarm();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkAlarms(); });
  soundButton.textContent = soundEnabled ? "Alarm sound enabled" : "Enable alarm sound";
  if (storageReadFailed) saveStatus.textContent = "Browser storage could not be read; alarms may not persist.";
  render();
  checkAlarms();
  setInterval(checkAlarms, 5000);
})();
