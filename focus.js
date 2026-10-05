(function () {
  "use strict";
  const timerValue = document.getElementById("timer-value");
  const timerHint = document.getElementById("timer-hint");
  const timerLabel = document.getElementById("timer-label");
  const ring = document.getElementById("timer-ring");
  const startButton = document.getElementById("timer-start");
  const resetButton = document.getElementById("timer-reset");
  const tabs = Array.from(document.querySelectorAll(".focus-tab"));
  let duration = 25 * 60;
  let remaining = duration;
  let interval = null;
  let running = false;


  function draw() {
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    timerValue.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    const progress = duration ? (duration - remaining) / duration : 0;
    const degrees = Math.round(progress * 360);
    ring.style.background = `conic-gradient(var(--green) ${degrees}deg, #e9e8df ${degrees}deg)`;
    startButton.textContent = running ? "Pause" : remaining === duration ? "Start focus" : "Resume";
    timerHint.textContent = running ? "Stay with this one thing" : remaining === duration ? "Ready when you are" : "Take a breath, then continue";
  }

  function stop() { clearInterval(interval); interval = null; running = false; }
  function finish() {
    stop();
    timerHint.textContent = "Session complete · nice work";
    startButton.textContent = "Start again";
    try { if ("vibrate" in navigator) navigator.vibrate([120, 70, 120]); } catch (_) {}
  }

  startButton.addEventListener("click", () => {
    if (running) { stop(); draw(); return; }
    if (remaining <= 0) remaining = duration;
    running = true;
    draw();
    interval = setInterval(() => { remaining -= 1; if (remaining <= 0) { remaining = 0; finish(); } else draw(); }, 1000);
  });
  resetButton.addEventListener("click", () => { stop(); remaining = duration; draw(); });
  tabs.forEach((tab) => tab.addEventListener("click", () => {
    stop(); duration = Number(tab.dataset.minutes) * 60; remaining = duration;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    timerLabel.textContent = Number(tab.dataset.minutes) === 25 ? "FOCUS TIME" : "BREAK TIME";
    draw();
  }));
  draw();
})();
