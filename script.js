(function () {
  "use strict";

  const data = window.schoolScheduleData;
  const goldDays = new Set(data.goldDays);
  const blackDays = new Set(data.blackDays);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const pad = (number) => String(number).padStart(2, "0");
  const keyFor = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const prettyDate = (date) => `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;

  function updateClock() {
    const now = new Date();
    const hour = String(now.getHours() % 12 || 12).padStart(2, "0");
    const minute = pad(now.getMinutes());
    const period = now.getHours() >= 12 ? "PM" : "AM";
    const shownTime = `${hour}:${minute}`;
    ["clock", "full-clock"].forEach((id) => {
      const display = document.getElementById(id);
      display.textContent = shownTime;
      display.setAttribute("aria-label", `${Number(hour)}:${minute} ${period}`);
    });
    document.getElementById("clock-period").textContent = period;
    document.getElementById("full-clock-period").textContent = period;
    document.getElementById("clock-date").textContent = days[now.getDay()];
    document.getElementById("today-date").textContent = prettyDate(now);
  }

  function schoolDay(date) {
    const key = keyFor(date);
    if (goldDays.has(key)) return "gold";
    if (blackDays.has(key)) return "black";
    return null;
  }

  function nextSchoolDay(from) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    for (let i = 0; i < 370; i += 1) {
      date.setDate(date.getDate() + 1);
      if (schoolDay(date)) return date;
    }
    return null;
  }

  function rowsFor(type) {
    const rows = data.courses[type].map((course) => ({ period: `PERIOD ${course.period}`, name: course.name, time: "" }));
    rows.splice(3, 0, { period: "LUNCH", name: `Lunch ${data.lunch[type]}`, time: "", lunch: true });
    return rows;
  }

  function renderRows(target, rows) {
    if (!rows) {
      target.innerHTML = '<div class="empty-state">No school is listed for this date.</div>';
      return;
    }
    target.innerHTML = rows.map((row) => `<div class="class-row${row.lunch ? " lunch-row" : ""}"><span class="class-period">${row.period}</span><span class="class-name">${row.name}</span><span class="class-time">${row.time}</span></div>`).join("");
  }

  function renderSchedule() {
    const today = new Date();
    const type = schoolDay(today);
    const next = type ? null : nextSchoolDay(today);
    const badge = document.getElementById("day-badge");
    const title = document.getElementById("day-name");
    badge.className = `day-badge${type ? ` ${type}` : " no-school"}`;
    badge.textContent = type ? `${type.toUpperCase()} DAY` : "NO SCHOOL";
    title.textContent = type ? `${type[0].toUpperCase()}${type.slice(1)} Day` : "No school today";
    document.getElementById("next-day").textContent = next ? `Next school day · ${prettyDate(next)} · ${schoolDay(next).toUpperCase()}` : "";
    document.getElementById("home-schedule-title").textContent = type ? "Today’s classes" : "No classes today";
    renderRows(document.getElementById("home-schedule"), type ? rowsFor(type) : null);

    document.getElementById("schedule-date").textContent = prettyDate(today).toUpperCase();
    document.getElementById("schedule-title").textContent = type ? `${type[0].toUpperCase()}${type.slice(1)} Day` : "No school listed";
    const scheduleBadge = document.getElementById("schedule-badge");
    scheduleBadge.className = `day-badge large${type ? ` ${type}` : " no-school"}`;
    scheduleBadge.textContent = type ? `${type.toUpperCase()} DAY` : "NO SCHOOL";
    document.getElementById("schedule-note").textContent = type ? "Four periods, with lunch called out on its own." : next ? `Next listed school day: ${prettyDate(next)} · ${schoolDay(next).toUpperCase()}` : "No upcoming school days found in the calendar.";
    renderRows(document.getElementById("schedule-list"), type ? rowsFor(type) : null);
    const robotics = type === "gold" && [3, 4].includes(today.getDay());
    document.getElementById("robotics-note").hidden = !robotics;
  }

  updateClock();
  renderSchedule();
  setInterval(updateClock, 1000);
  setInterval(renderSchedule, 60000);
})();
