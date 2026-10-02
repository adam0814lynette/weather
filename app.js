const DEFAULT_LOCATION = { latitude: 37.6872, longitude: -97.3301, label: "Wichita, KS" };
const CACHE_KEY = "wichita-weather-last-forecast-v1";
const LOCATION_KEY = "wichita-weather-location-v1";
const FAVORITES_KEY = "wichita-weather-favorites-v1";
const CONDITIONS_KEY = "wichita-weather-conditions-open-v1";
let activeLocation = readJSON(LOCATION_KEY) || DEFAULT_LOCATION;
let favorites = readJSON(FAVORITES_KEY) || [];
let lastRefreshAt = 0;
let lastDateKey = "";
let lastTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let automaticRefreshRunning = false;
let weatherRequestRunning = false;

const $ = (selector) => document.querySelector(selector);
const els = {
  status: $("#status"), location: $("#locationName"), alerts: $("#alerts"),
  currentTemp: $("#currentTemp"), currentCondition: $("#currentCondition"),
  currentLabel: $("#currentLabel"), weatherMark: $("#weatherMark"),
  feelsLike: $("#feelsLike"), humidity: $("#humidity"), wind: $("#wind"),
  dewPoint: $("#dewPoint"), visibility: $("#visibility"), pressure: $("#pressure"), windGust: $("#windGust"),
  dawn: $("#dawnTime"), sunrise: $("#sunriseTime"), sunset: $("#sunsetTime"), dusk: $("#duskTime"),
  astronomyDate: $("#astronomyDate"), moonPhase: $("#moonPhase"), moonIllumination: $("#moonIllumination"),
  hourly: $("#hourly"), precipChart: $("#precipChart"), daily: $("#daily"), updated: $("#updatedAt"),
  connection: $("#connection"), officeInfo: $("#officeInfo"), searchResults: $("#searchResults"),
  favorites: $("#favorites"), saveLocation: $("#saveLocationBtn"),
  moreConditions: $(".more-conditions"), hourlyCue: $("#hourlyCue"), refresh: $("#refreshBtn")
};

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
}

function setStatus(message = "", error = false) {
  els.status.className = `status${error ? " error" : ""}`;
  els.status.innerHTML = message ? `${error ? "" : '<span class="spinner" aria-hidden="true"></span>'}${message}` : "";
}

async function getJSON(url) {
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/geo+json" } });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  return response.json();
}

function cToF(celsius) { return celsius == null ? null : Math.round((celsius * 9 / 5) + 32); }

function speedToMph(quantity) {
  if (quantity?.value == null) return null;
  const unit = quantity.unitCode || "";
  if (unit.includes("km_h")) return quantity.value * .621371;
  if (unit.includes("m_s")) return quantity.value * 2.23694;
  return quantity.value;
}

function sameLocation(a, b) {
  return a && b && Math.abs(a.latitude - b.latitude) < .001 && Math.abs(a.longitude - b.longitude) < .001;
}

function renderFavorites() {
  els.favorites.replaceChildren();
  favorites.forEach(favorite => {
    const group = document.createElement("span");
    group.className = "favorite";
    const load = document.createElement("button");
    load.type = "button";
    load.className = "favorite-load";
    load.textContent = favorite.label;
    load.addEventListener("click", () => loadWeather(favorite));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "favorite-remove";
    remove.setAttribute("aria-label", `Remove ${favorite.label} from saved locations`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      favorites = favorites.filter(item => !sameLocation(item, favorite));
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
      renderFavorites();
    });
    group.append(load, remove);
    els.favorites.append(group);
  });
  const saved = favorites.some(item => sameLocation(item, activeLocation));
  els.saveLocation.textContent = saved ? "★ Saved" : "☆ Save location";
  els.saveLocation.classList.toggle("saved", saved);
}

function updateAgeLabel() {
  const timestamp = Number(els.updated.dataset.timestamp);
  if (!timestamp) return;
  const ageMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  const retrieved = new Date(timestamp);
  const dayDifference = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(retrieved).setHours(0, 0, 0, 0)) / 86400000);
  const clock = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(retrieved);
  const age = ageMinutes < 1 ? "just now"
    : ageMinutes < 60 ? `${ageMinutes} min ago`
    : ageMinutes < 360 ? `${Math.floor(ageMinutes / 60)} hr ago`
    : dayDifference === 1 ? `yesterday at ${clock}`
    : `at ${clock}`;
  els.updated.textContent = `${els.updated.dataset.cached === "true" ? "Saved" : "Updated"} ${age}`;
}

function compactHour(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true, timeZone }).formatToParts(date);
  const hour = parts.find(part => part.type === "hour")?.value || "";
  const period = parts.find(part => part.type === "dayPeriod")?.value?.[0]?.toLowerCase() || "";
  return `${hour}${period}`;
}

function updateHourlyCue() {
  const remaining = els.hourly.scrollWidth - els.hourly.clientWidth - els.hourly.scrollLeft;
  els.hourlyCue.hidden = remaining < 8;
}

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
  if (/thunder|t-storm/.test(value)) return "storm";
  if (/(rain|shower|drizzle).*(snow|sleet|ice)|(snow|sleet|ice).*(rain|shower)/.test(value)) return "mixed";
  if (/snow|sleet|blizzard|ice/.test(value)) return "snow";
  if (/rain|shower|drizzle/.test(value)) return "rain";
  if (/fog|haze|smoke/.test(value)) return "fog";
  if (/wind|breezy/.test(value)) return "wind";
  if (/partly|mostly sunny|mostly clear/.test(value)) return isDay ? "partly-day" : "partly-night";
  if (/cloud|overcast/.test(value)) return "cloudy";
  if (/sun|clear|fair/.test(value)) return isDay ? "clear-day" : "clear-night";
  return "unknown";
}

function weatherIcon(name, label = "") {
  return `<svg class="wx-icon" aria-hidden="true" focusable="false"><use href="#wx-${name}"></use></svg>${label ? `<span class="sr-only">${label}</span>` : ""}`;
}

function probability(period) {
  const value = period.probabilityOfPrecipitation?.value;
  return value == null ? "" : `${Math.round(value)}%`;
}

function solarTimes(date, latitude, longitude, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric"
  }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  const dayStart = Date.UTC(parts.year, parts.month - 1, parts.day);
  const yearStart = Date.UTC(parts.year, 0, 0);
  const dayOfYear = Math.floor((dayStart - yearStart) / 86400000);
  const gamma = 2 * Math.PI / 365 * (dayOfYear - 1);
  const eqTime = 229.18 * (.000075 + .001868*Math.cos(gamma) - .032077*Math.sin(gamma) - .014615*Math.cos(2*gamma) - .040849*Math.sin(2*gamma));
  const decl = .006918 - .399912*Math.cos(gamma) + .070257*Math.sin(gamma) - .006758*Math.cos(2*gamma) + .000907*Math.sin(2*gamma) - .002697*Math.cos(3*gamma) + .00148*Math.sin(3*gamma);
  const latRad = latitude * Math.PI / 180;
  const solarNoon = 720 - 4 * longitude - eqTime;
  const eventTime = (zenith, morning) => {
    const angle = Math.acos(Math.cos(zenith * Math.PI / 180) / (Math.cos(latRad) * Math.cos(decl)) - Math.tan(latRad) * Math.tan(decl));
    if (!Number.isFinite(angle)) return null;
    const minutes = solarNoon + (morning ? -1 : 1) * 4 * angle * 180 / Math.PI;
    return new Date(dayStart + minutes * 60000);
  };
  return {
    dawn: eventTime(96, true),
    sunrise: eventTime(90.833, true),
    sunset: eventTime(90.833, false),
    dusk: eventTime(96, false)
  };
}

function moonData(date) {
  const synodicMonth = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const age = (((date.getTime() - knownNewMoon) / 86400000) % synodicMonth + synodicMonth) % synodicMonth;
  const phase = age / synodicMonth;
  const names = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"];
  return { name: names[Math.floor((phase + 1/16) * 8) % 8], illumination: Math.round((1 - Math.cos(2 * Math.PI * phase)) * 50) };
}

function localDateKey(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function weatherPalette(condition, solar, now = new Date()) {
  const value = condition.toLowerCase();
  if (/thunder|t-storm/.test(value)) return "storm";
  if (/snow|sleet|blizzard|ice/.test(value)) return "snow";
  if (/rain|shower|drizzle/.test(value)) return "rain";
  if (/fog|haze|smoke/.test(value)) return "fog";
  if (/cloud|overcast/.test(value)) return "cloudy";
  if (solar.sunrise && solar.sunset) {
    const goldenWindow = 75 * 60000;
    if (Math.abs(now - solar.sunrise) <= goldenWindow || Math.abs(now - solar.sunset) <= goldenWindow) return "golden";
    if (now < solar.sunrise || now >= solar.sunset) return "night";
  }
  return "clear-day";
}

function applyWeatherPalette(condition, solar) {
  const palette = weatherPalette(condition, solar);
  document.documentElement.dataset.weather = palette;
  const colors = { "clear-day":"#dff3ff", golden:"#f6b27e", cloudy:"#cbd3d8", fog:"#d4dadd", rain:"#9caeb9", snow:"#d9f0f8", storm:"#142d41", night:"#091b29" };
  document.querySelector('meta[name="theme-color"]').content = colors[palette];
}

function radarURL(location) {
  const settings = {
    agenda: { id: "weather", center: [location.longitude, location.latitude], location: [location.longitude, location.latitude], zoom: 7, layer: "bref_qcd" },
    animating: false, base: "standard", artcc: false, county: false, cwa: false,
    rfc: false, state: false, menu: true, shortFusedOnly: false,
    opacity: { alerts: .8, local: .6, localStations: .8, national: .6 }
  };
  return `https://radar.weather.gov/?settings=v1_${encodeURIComponent(btoa(JSON.stringify(settings)))}`;
}

function updateRadarLink(location) {
  $("#radarLink").href = radarURL(location);
  $("#radarLocation").textContent = `Regional view centered on ${location.label || "your location"}`;
}

function render(data, cached = false) {
  const { label, observation, hourly, daily, alerts, savedAt, office } = data;
  els.location.textContent = label;
  const firstHour = hourly.properties.periods[0];
  const obs = observation?.properties;
  const temp = cToF(obs?.temperature?.value) ?? firstHour.temperature;
  const humidity = Math.round(obs?.relativeHumidity?.value ?? 0);
  const windMph = Math.round(speedToMph(obs?.windSpeed) ?? Number.parseInt(firstHour.windSpeed) ?? 0);
  const condition = obs?.textDescription || firstHour.shortForecast;
  const coordinates = data.location || activeLocation;
  activeLocation = { latitude: coordinates.latitude, longitude: coordinates.longitude, label };
  updateRadarLink(activeLocation);
  renderFavorites();
  const timeZone = data.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const solar = solarTimes(new Date(), coordinates.latitude, coordinates.longitude, timeZone);
  const timeFormatter = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit", timeZone });
  const moon = moonData(new Date());
  applyWeatherPalette(condition, solar);
  els.currentTemp.textContent = temp ?? "--";
  els.currentCondition.textContent = condition;
  els.currentLabel.textContent = obs ? "Current conditions" : "Current forecast";
  els.weatherMark.innerHTML = weatherIcon(symbolFor(condition, firstHour.isDaytime));
  els.feelsLike.textContent = `${feelsLike(temp, humidity, windMph) ?? "--"}°`;
  els.humidity.textContent = obs?.relativeHumidity?.value == null ? "--" : `${humidity}%`;
  els.wind.textContent = obs?.windDirection?.value == null ? firstHour.windSpeed : `${firstHour.windDirection} ${windMph} mph`;
  els.dewPoint.textContent = obs?.dewpoint?.value == null ? "--" : `${cToF(obs.dewpoint.value)}°`;
  els.visibility.textContent = obs?.visibility?.value == null ? "--" : `${(obs.visibility.value / 1609.344).toFixed(1)} mi`;
  els.pressure.textContent = obs?.barometricPressure?.value == null ? "--" : `${(obs.barometricPressure.value / 3386.389).toFixed(2)} inHg`;
  const gustMph = speedToMph(obs?.windGust);
  els.windGust.textContent = gustMph == null ? "None reported" : `${Math.round(gustMph)} mph`;
  const displaySolarTime = value => value ? timeFormatter.format(value) : "Unavailable";
  els.dawn.textContent = displaySolarTime(solar.dawn);
  els.sunrise.textContent = displaySolarTime(solar.sunrise);
  els.sunset.textContent = displaySolarTime(solar.sunset);
  els.dusk.textContent = displaySolarTime(solar.dusk);
  els.astronomyDate.textContent = new Intl.DateTimeFormat([], { timeZone, weekday: "short", month: "short", day: "numeric" }).format(new Date());
  els.moonPhase.textContent = moon.name;
  els.moonIllumination.textContent = `${moon.illumination}% illuminated`;

  els.hourly.innerHTML = hourly.properties.periods.slice(0, 24).map((period, index) => `
    <article class="hour">
      <time datetime="${period.startTime}">${index === 0 ? "Now" : new Intl.DateTimeFormat([], { hour: "numeric" }).format(new Date(period.startTime))}</time>
      <span class="symbol">${weatherIcon(symbolFor(period.shortForecast, period.isDaytime), period.shortForecast)}</span>
      <strong>${period.temperature}°</strong>
      <small>${probability(period)}</small>
    </article>`).join("");

  els.precipChart.innerHTML = hourly.properties.periods.slice(0, 12).map((period, index) => {
    const chance = Math.round(period.probabilityOfPrecipitation?.value ?? 0);
    const hour = index === 0 ? "Now" : index % 3 === 0 ? compactHour(new Date(period.startTime), timeZone) : "";
    const barHeight = Math.max(2, chance * .35);
    return `<div class="precip-column" title="${period.shortForecast}: ${chance}% chance of precipitation" aria-label="${compactHour(new Date(period.startTime), timeZone)}, ${chance}% chance of precipitation"><span class="precip-meter" style="--bar:${barHeight}px"><span class="precip-value">${chance >= 20 ? `${chance}%` : ""}</span><span class="precip-bar"></span></span><small>${hour}</small></div>`;
  }).join("");
  requestAnimationFrame(updateHourlyCue);

  const periods = daily.properties.periods;
  const rows = [];
  for (let i = 0; i < periods.length; i += 1) {
    const day = periods[i];
    const night = day.isDaytime ? periods[i + 1] : day;
    if (!day.isDaytime && i === 0) {
      const carriesOverFromYesterday = localDateKey(new Date(day.startTime), timeZone) !== localDateKey(new Date(), timeZone);
      if (carriesOverFromYesterday || /^overnight$/i.test(day.name)) continue;
      rows.push({ name: day.name || "Tonight", startTime: day.startTime, summary: day.shortForecast, symbol: symbolFor(day.shortForecast, false), high: null, low: day.temperature });
      continue;
    }
    if (!day.isDaytime) continue;
    rows.push({ name: day.name, startTime: day.startTime, summary: day.shortForecast, symbol: symbolFor(day.shortForecast, true), high: day.temperature, low: night && !night.isDaytime ? night.temperature : null });
  }
  els.daily.innerHTML = rows.slice(0, 7).map(day => {
    const source = periods.find(period => period.name === day.name) || periods[0];
    return `<details class="day">
      <summary aria-label="Show details for ${day.name}">
        <div class="day-name">${day.name}<span class="day-date">${new Intl.DateTimeFormat([], { month: "short", day: "numeric", timeZone }).format(new Date(day.startTime))}</span><small>${day.summary}</small></div>
        <div class="day-symbol">${weatherIcon(day.symbol, day.summary)}</div>
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
  els.updated.dataset.timestamp = String(new Date(savedAt).getTime());
  els.updated.dataset.cached = String(cached);
  els.updated.title = `Retrieved ${new Date(savedAt).toLocaleString()}`;
  updateAgeLabel();
  els.officeInfo.innerHTML = office?.url
    ? `Issued by <a href="${office.url}" target="_blank" rel="noreferrer">${office.name}</a>. Last retrieved ${new Date(savedAt).toLocaleString()}.`
    : `Last retrieved ${new Date(savedAt).toLocaleString()}.`;
  els.connection.hidden = !cached && navigator.onLine;
  lastTimeZone = timeZone;
  lastDateKey = localDateKey(new Date(), timeZone);
  lastRefreshAt = new Date(savedAt).getTime();
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
  weatherRequestRunning = true;
  els.refresh.disabled = true;
  els.refresh.setAttribute("aria-busy", "true");
  els.refresh.textContent = "Refreshing…";
  activeLocation = location;
  updateRadarLink(location);
  setStatus("Loading the latest forecast…");
  try {
    const coords = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
    const point = await getJSON(`https://api.weather.gov/points/${coords}`);
    const p = point.properties;
    const label = location.label || [p.relativeLocation?.properties?.city, p.relativeLocation?.properties?.state].filter(Boolean).join(", ") || "Your location";
    activeLocation = { latitude: location.latitude, longitude: location.longitude, label };
    updateRadarLink(activeLocation);
    renderFavorites();
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
    const data = {
      label, observation, hourly, daily, alerts, office,
      location: { latitude: location.latitude, longitude: location.longitude },
      timeZone: p.timeZone,
      savedAt: new Date().toISOString()
    };
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
  } finally {
    weatherRequestRunning = false;
    els.refresh.disabled = false;
    els.refresh.removeAttribute("aria-busy");
    els.refresh.textContent = "Refresh forecast";
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
els.refresh.addEventListener("click", () => loadWeather(activeLocation));
els.moreConditions.open = localStorage.getItem(CONDITIONS_KEY) === "true";
els.moreConditions.addEventListener("toggle", () => localStorage.setItem(CONDITIONS_KEY, String(els.moreConditions.open)));
els.hourly.addEventListener("scroll", updateHourlyCue, { passive: true });
window.addEventListener("resize", updateHourlyCue);
els.saveLocation.addEventListener("click", () => {
  const index = favorites.findIndex(item => sameLocation(item, activeLocation));
  if (index >= 0) favorites.splice(index, 1);
  else favorites = [{ ...activeLocation }, ...favorites].slice(0, 5);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  renderFavorites();
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

async function maybeAutoRefresh() {
  if (document.hidden || automaticRefreshRunning || weatherRequestRunning) return;
  const now = new Date();
  const newLocalDay = localDateKey(now, lastTimeZone) !== lastDateKey;
  const stale = !lastRefreshAt || now.getTime() - lastRefreshAt > 15 * 60000;
  if (!newLocalDay && !stale) return;
  automaticRefreshRunning = true;
  try { await loadWeather(activeLocation); } finally { automaticRefreshRunning = false; }
}
window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);
window.addEventListener("pageshow", maybeAutoRefresh);
document.addEventListener("visibilitychange", maybeAutoRefresh);
setInterval(maybeAutoRefresh, 5 * 60000);
setInterval(updateAgeLabel, 60000);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js");
localStorage.removeItem("wichita-weather-theme-v1");
updateConnection();
updateRadarLink(activeLocation);
renderFavorites();
loadWeather(activeLocation);
