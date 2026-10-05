(function () {
  "use strict";
  const fallback = { latitude: 41.7534, longitude: -86.1108, name: "Granger, IN" };
  const labels = { 0: ["☀", "Clear skies"], 1: ["◐", "Mostly clear"], 2: ["☁", "Partly cloudy"], 3: ["☁", "Cloudy"], 45: ["≋", "Foggy"], 48: ["≋", "Foggy"], 51: ["☂", "Light drizzle"], 53: ["☂", "Drizzle"], 55: ["☂", "Heavy drizzle"], 61: ["☂", "Light rain"], 63: ["☂", "Rain"], 65: ["☂", "Heavy rain"], 71: ["❄", "Light snow"], 73: ["❄", "Snow"], 75: ["❄", "Heavy snow"], 80: ["☂", "Rain showers"], 81: ["☂", "Rain showers"], 82: ["☂", "Heavy showers"], 95: ["ϟ", "Thunderstorms"] };
  const icon = document.getElementById("weather-icon");
  const temp = document.getElementById("weather-temp");
  const description = document.getElementById("weather-description");
  const place = document.getElementById("weather-location");
  const clockWeather = document.getElementById("clock-weather");

  function getPosition() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ ...fallback, label: fallback.name });
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, label: "Your location" }),
        () => resolve({ ...fallback, label: fallback.name }),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 30 * 60 * 1000 }
      );
    });
  }

  async function loadWeather() {
    try {
      const location = await getPosition();
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Weather unavailable");
      const data = await response.json();
      const [symbol, text] = labels[data.current.weather_code] || ["◌", "Current conditions"];
      const degrees = Math.round(data.current.temperature_2m);
      icon.textContent = symbol;
      temp.textContent = `${degrees}°`;
      description.textContent = text;
      place.textContent = `${location.label} · right now`;
      if (clockWeather) clockWeather.textContent = `${degrees}° · ${text}`;
    } catch (error) {
      console.error("Weather request failed:", error);
      icon.textContent = "◌";
      temp.textContent = "--°";
      description.textContent = navigator.onLine ? "Weather unavailable right now" : "Connect to the internet for weather";
      place.textContent = "Granger, IN";
      if (clockWeather) clockWeather.textContent = "Weather unavailable";
    }
  }
  loadWeather();
})();
