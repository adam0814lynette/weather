const DEFAULT_LOCATION = { latitude: 37.6872, longitude: -97.3301, label: "Wichita, KS" };
const CACHE_KEY = "wichita-weather-last-forecast-v1";
const LOCATION_KEY = "wichita-weather-location-v1";
const THEME_KEY = "wichita-weather-theme-v1";
const RADAR_WMS = "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows";
let activeLocation = readJSON(LOCATION_KEY) || DEFAULT_LOCATION;
let radarMap;
let radarLayer;
let radarMarker;

const $ = (selector) => document.querySelector(selector);
const els = {
  status: $("#status"), location: $("#locationName"), alerts: $("#alerts"),
  currentTemp: $("#currentTemp"), currentCondition: $("#currentCondition"),
  currentLabel: $("#currentLabel"), weatherMark: $("#weatherMark"),
  feelsLike: $("#feelsLike"), humidity: $("#humidity"), wind: $("#wind"),
  hourly: $("#hourly"), daily: $("#daily"), updated: $("#updatedAt"),
  connection: $("#connection"), officeInfo: $("#officeInfo"), searchResults: $("#searchResults")
};

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
}

function setStatus(message = "", error = false) {
  els.status.className = `status${error ? " error" : ""}`;
  els.status.innerHTML = message ? `${error ? "" : '<span class="spinner" aria-hidden="true"></span>'}${message}` : "";
}

function setTheme(theme) {
  const selected = ["light", "dark"].includes(theme) ? theme : "system";
  document.documentElement.dataset.theme = selected === "system" ? "" : selected;
  localStorage.setItem(THEME_KEY, selected);
  $("#themeBtn").textContent = selected === "dark" ? "☾" : selected === "light" ? "☀" : "◐";
  document.querySelectorAll("[data-theme]").forEach(button => button.setAttribute("aria-current", String(button.dataset.theme === selected)));
}

async function getJSON(url) {
  const response = await fetch(url, { headers: { Accept: "application/geo+json" } });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  return response.json();
}

function cToF(celsius) { return celsius == null ? null : Math.round((celsius * 9 / 5) + 32); }

function feelsLike(tempF, humidity, windMph) {
  if (tempF == null) return null;
  if (tempF >= 80 && humidity >= 40) {
    const t = tempF, r = humidity;
    return Math.round(-42.379 + 2.04901523*t + 10.14333127*r - .22475541*t*r - .00683783*t*t - .05481717*r*r + .00122874*t*t*r + .00085282*t*r*r - .00000199*t*t*r*r);
  }
  if (tempF <= 50 && windMph > 3) return Math.round(35.74 + .6215*tempF - 35.75*Math.pow(windMph,.16) + .4275*tempF*Math.pow(windMph,.16));
  return Math.round(tempF);
}

function symbolFor(text = "", isDay = true) {
  const value = text.toLowerCase();
  if (/thunder|t-storm/.test(value)) return "⛈";
  if (/snow|sleet|blizzard|ice/.test(value)) return "❄";
  if (/rain|shower|drizzle/.test(value)) return "🌧";
  if (/fog|haze|smoke/.test(value)) return "🌫";
  if (/cloud|overcast/.test(value)) return "☁";
  if (/partly|mostly sunny|mostly clear/.test(value)) return isDay ? "🌤" : "☁";
  if (/wind/.test(value)) return "💨";
  return isDay ? "☀" : "☾";
}

function probability(period) {
  const value = period.probabilityOfPrecipitation?.value;
  return value == null ? "" : `${Math.round(value)}%`;
}

function initializeRadar() {
  if (typeof L === "undefined") {
    $("#radarMap").hidden = true;
    $("#radarUnavailable").hidden = false;
    $("#radarTime").textContent = "Map library unavailable";
    return;
  }
  radarMap = L.map("radarMap", { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([activeLocation.latitude, activeLocation.longitude], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(radarMap);
  radarLayer = L.tileLayer.wms(RADAR_WMS, {
    layers: "conus_bref_qcd", styles: "radar_reflectivity", format: "image/png",
    transparent: true, version: "1.3.0", opacity: .78, attribution: "NOAA/NWS MRMS"
  }).addTo(radarMap);
  radarMarker = L.circleMarker([activeLocation.latitude, activeLocation.longitude], {
    radius: 6, color: "#fff", weight: 3, fillColor: "#1769aa", fillOpacity: 1
  }).addTo(radarMap).bindTooltip(activeLocation.label || "Forecast location");
  radarLayer.on("tileerror", () => {
    $("#radarTime").textContent = "Some radar tiles unavailable";
  });
  updateRadar(activeLocation);
}

async function updateRadar(location, refresh = false) {
  if (!radarMap) return;
  const point = [location.latitude, location.longitude];
  radarMap.setView(point, radarMap.getZoom() || 7);
  radarMarker.setLatLng(point).setTooltipContent(location.label || "Forecast location");
  if (refresh) radarLayer.setParams({ _refresh: Date.now() });
  try {
    const response = await fetch(`${RADAR_WMS}?service=WMS&request=GetCapabilities&version=1.3.0`);
    if (!response.ok) throw new Error("Radar metadata unavailable");
    const xml = new DOMParser().parseFromString(await response.text(), "text/xml");
    const dimension = [...xml.querySelectorAll("Dimension")].find(node => node.getAttribute("name") === "time");
    const latest = dimension?.getAttribute("default");
    $("#radarTime").textContent = latest ? `Image ${new Date(latest).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Latest available image";
  } catch (_) {
    $("#radarTime").textContent = navigator.onLine ? "Latest available image" : "Radar unavailable offline";
  }
}

function render(data, cached = false) {
  const { label, observation, hourly, daily, alerts, savedAt, office } = data;
  els.location.textContent = label;
  const firstHour = hourly.properties.periods[0];
  const obs = observation?.properties;
  const temp = cToF(obs?.temperature?.value) ?? firstHour.temperature;
  const humidity = Math.round(obs?.relativeHumidity?.value ?? 0);
  const windMph = obs?.windSpeed?.value == null ? Number.parseInt(firstHour.windSpeed) || 0 : Math.round(obs.windSpeed.value * .621371);
  const condition = obs?.textDescription || firstHour.shortForecast;
  els.currentTemp.textContent = temp ?? "--";
  els.currentCondition.textContent = condition;
  els.currentLabel.textContent = obs ? "Current conditions" : "Current forecast";
  els.weatherMark.textContent = symbolFor(condition, firstHour.isDaytime);
  els.feelsLike.textContent = `${feelsLike(temp, humidity, windMph) ?? "--"}°`;
  els.humidity.textContent = obs?.relativeHumidity?.value == null ? "--" : `${humidity}%`;
  els.wind.textContent = obs?.windDirection?.value == null ? firstHour.windSpeed : `${firstHour.windDirection} ${windMph} mph`;

  els.hourly.innerHTML = hourly.properties.periods.slice(0, 24).map((period, index) => `
    <article class="hour">
      <time datetime="${period.startTime}">${index === 0 ? "Now" : new Intl.DateTimeFormat([], { hour: "numeric" }).format(new Date(period.startTime))}</time>
      <span class="symbol" aria-label="${period.shortForecast}">${symbolFor(period.shortForecast, period.isDaytime)}</span>
      <strong>${period.temperature}°</strong>
      <small>${probability(period)}</small>
    </article>`).join("");

  const periods = daily.properties.periods;
  const rows = [];
  for (let i = 0; i < periods.length; i += 1) {
    const day = periods[i];
    const night = day.isDaytime ? periods[i + 1] : day;
    if (!day.isDaytime && i === 0) {
      rows.push({ name: "Tonight", summary: day.shortForecast, symbol: symbolFor(day.shortForecast, false), high: null, low: day.temperature });
      continue;
    }
    if (!day.isDaytime) continue;
    rows.push({ name: day.name, summary: day.shortForecast, symbol: symbolFor(day.shortForecast, true), high: day.temperature, low: night && !night.isDaytime ? night.temperature : null });
  }
  els.daily.innerHTML = rows.slice(0, 7).map(day => {
    const source = periods.find(period => period.name === day.name) || periods[0];
    return `<details class="day">
      <summary aria-label="Show details for ${day.name}">
        <div class="day-name">${day.name}<small>${day.summary}</small></div>
        <div class="day-symbol" aria-hidden="true">${day.symbol}</div>
        <div class="temps">${day.high == null ? "" : `${day.high}°`}<span>${day.low == null ? "" : `${day.low}°`}</span></div>
        <span class="day-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="day-detail">
        <p>${source.detailedForecast || source.shortForecast}</p>
        <dl>
          <div><dt>Precipitation</dt><dd>${probability(source) || "Not listed"}</dd></div>
          <div><dt>Wind</dt><dd>${source.windDirection} ${source.windSpeed}</dd></div>
        </dl>
      </div>
    </details>`;
  }).join("");

  renderAlerts(alerts.features || []);
  const time = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date(savedAt));
  els.updated.textContent = `${cached ? "Saved forecast" : "Updated"} ${time}`;
  els.officeInfo.innerHTML = office?.url
    ? `Issued by <a href="${office.url}" target="_blank" rel="noreferrer">${office.name}</a>. Last retrieved ${new Date(savedAt).toLocaleString()}.`
    : `Last retrieved ${new Date(savedAt).toLocaleString()}.`;
  els.connection.hidden = !cached && navigator.onLine;
  setStatus(cached ? "Showing the last saved forecast. Refresh when connected." : "");
}

function renderAlerts(features) {
  els.alerts.innerHTML = "";
  features.forEach(feature => {
    const node = $("#alertTemplate").content.cloneNode(true);
    const p = feature.properties;
    node.querySelector("strong").textContent = p.event;
    node.querySelector("small").textContent = p.headline || p.areaDesc;
    node.querySelector(".alert-body").textContent = `${p.description || ""}\n\n${p.instruction || ""}`.trim();
    els.alerts.append(node);
  });
  els.alerts.hidden = features.length === 0;
}

async function loadWeather(location = activeLocation) {
  activeLocation = location;
  updateRadar(location);
  setStatus("Loading the latest forecast…");
  try {
    const coords = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
    const point = await getJSON(`https://api.weather.gov/points/${coords}`);
    const p = point.properties;
    const label = location.label || [p.relativeLocation?.properties?.city, p.relativeLocation?.properties?.state].filter(Boolean).join(", ") || "Your location";
    const [hourly, daily, alerts, stations] = await Promise.all([
      getJSON(p.forecastHourly), getJSON(p.forecast),
      getJSON(`https://api.weather.gov/alerts/active?point=${coords}`),
      getJSON(p.observationStations)
    ]);
    let observation = null;
    const stationUrl = stations.features?.[0]?.id;
    if (stationUrl) {
      try { observation = await getJSON(`${stationUrl}/observations/latest`); } catch (_) { /* forecast fallback */ }
    }
    let office = null;
    if (p.forecastOffice) {
      try {
        const officeData = await getJSON(p.forecastOffice);
        office = { name: officeData.properties?.name || `NWS ${p.cwa}`, url: officeData.properties?.website || p.forecastOffice };
      } catch (_) { office = { name: `NWS ${p.cwa}`, url: p.forecastOffice }; }
    }
    const data = { label, observation, hourly, daily, alerts, office, savedAt: new Date().toISOString() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(LOCATION_KEY, JSON.stringify(activeLocation));
    render(data);
  } catch (error) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) render(JSON.parse(cached), true);
    else {
      setStatus('Unable to reach the National Weather Service. <button class="inline-retry" type="button">Try again</button>', true);
      els.status.querySelector("button")?.addEventListener("click", () => loadWeather());
    }
    console.error(error);
  }
}

$("#locateBtn").addEventListener("click", () => {
  if (!navigator.geolocation) return setStatus("Location services are not supported by this browser.", true);
  setStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    position => loadWeather({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    () => setStatus("Location access was unavailable. Wichita remains selected.", true),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
});
$("#refreshBtn").addEventListener("click", () => loadWeather(activeLocation));
$("#radarCenterBtn").addEventListener("click", () => updateRadar(activeLocation, true));

$("#themeBtn").addEventListener("click", event => {
  event.stopPropagation();
  const menu = $("#themeMenu");
  menu.hidden = !menu.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!menu.hidden));
});
$("#themeMenu").addEventListener("click", event => {
  const choice = event.target.closest("[data-theme]");
  if (!choice) return;
  setTheme(choice.dataset.theme);
  $("#themeMenu").hidden = true;
  $("#themeBtn").setAttribute("aria-expanded", "false");
});
document.addEventListener("click", event => {
  if (!event.target.closest("#themeMenu") && !event.target.closest("#themeBtn")) {
    $("#themeMenu").hidden = true;
    $("#themeBtn").setAttribute("aria-expanded", "false");
  }
});

$("#searchForm").addEventListener("submit", async event => {
  event.preventDefault();
  const query = $("#locationSearch").value.trim();
  if (query.length < 2) return;
  const submit = event.currentTarget.querySelector("button");
  submit.disabled = true;
  submit.textContent = "Finding…";
  els.searchResults.hidden = true;
  try {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json&countryCode=US`);
    if (!response.ok) throw new Error("Location search failed");
    const results = (await response.json()).results || [];
    if (!results.length) {
      els.searchResults.innerHTML = '<div class="search-result">No matching U.S. locations found.</div>';
    } else {
      els.searchResults.innerHTML = results.map((place, index) => `<button class="search-result" type="button" data-index="${index}"><strong>${place.name}</strong><small>${[place.admin1, place.country].filter(Boolean).join(", ")}</small></button>`).join("");
      els.searchResults.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
        const place = results[Number(button.dataset.index)];
        const state = place.admin1 || place.country_code;
        els.searchResults.hidden = true;
        $("#locationSearch").value = "";
        loadWeather({ latitude: place.latitude, longitude: place.longitude, label: `${place.name}, ${state}` });
      }));
    }
    els.searchResults.hidden = false;
  } catch (_) {
    els.searchResults.innerHTML = '<div class="search-result">Location search is unavailable. Please try again.</div>';
    els.searchResults.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = "Search";
  }
});

function updateConnection() {
  els.connection.hidden = navigator.onLine;
  if (navigator.onLine && els.status.textContent.includes("saved forecast")) loadWeather(activeLocation);
}
window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js");
setTheme(localStorage.getItem(THEME_KEY) || "system");
updateConnection();
initializeRadar();
loadWeather(activeLocation);
