# Wichita Weather — Development Handoff

This is the living technical guide for Wichita Weather. Update it whenever behavior, data sources, storage formats, dependencies, deployment steps, or the application version changes.

## Project status

- Current version: **1.4.0**
- Architecture: static client-side Progressive Web App (PWA)
- Default location: Wichita, Kansas (`37.6872, -97.3301`)
- Build system: none
- Backend: none
- Intended hosting: GitHub Pages or any static HTTPS server
- Primary weather source: U.S. National Weather Service
- Radar: external link to the official NWS radar viewer
- Location-search source: Open-Meteo Geocoding API

## Development approach

The app was developed as a progressively enhanced static website:

1. Establish a mobile-first layout around the official NWS forecast data.
2. Add current observations, hourly forecasts, daily forecasts, and active alerts.
3. Add PWA installation and last-successful-forecast caching.
4. Add location search, saved preferences, accessibility improvements, and offline feedback.
5. Evaluate an embedded latest-frame radar map, then defer it after public basemap providers introduced access restrictions.
6. Validate each feature in a phone-sized browser using live API responses.

The project deliberately avoids a framework and compilation step. HTML, CSS, and JavaScript can be edited directly and deployed as static files.

## File map

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, accessible labels, controls, forecast sections, solar times, and the official radar action |
| `styles.css` | Responsive layout, weather-responsive palettes, contrast rules, cards, forecast details, and accessibility helpers |
| `app.js` | API requests, rendering, weather-palette selection, solar calculations, caching, geolocation, and user interactions |
| `sw.js` | Service worker for caching the local application shell |
| `manifest.webmanifest` | Installable PWA metadata and icons |
| `icon.svg` | Source application artwork |
| `icon-192.png` | Standard PWA installation icon |
| `icon-512.png` | Large PWA installation icon |
| `README.md` | User-facing overview, local setup, deployment, privacy, and limitations |
| `LICENSE` | MIT License |
| `DEVELOPMENT_HANDOFF.md` | This development and maintenance guide |

## Application startup

At the end of `app.js`, startup occurs in this order:

1. Set the online/offline indicator.
2. Prepare the location-aware official radar link.
3. Load weather for the saved location or Wichita if no location has been saved.
4. Calculate sunrise/sunset and apply the current weather palette.
5. Register the service worker when the page is served over HTTP or HTTPS.

The app should be served over HTTP during development. Opening `index.html` directly may display weather, but service workers and browser geolocation have restrictions on `file://` pages.

```sh
python3 -m http.server 8000 --directory wichita-weather
```

Open `http://localhost:8000`.

## Weather-data flow

`loadWeather(location)` coordinates the weather request sequence:

1. Call `https://api.weather.gov/points/{latitude},{longitude}`.
2. Read the returned URLs for the hourly forecast, daily forecast, observation stations, and issuing forecast office.
3. Request hourly forecast, daily forecast, active alerts, and observation-station data concurrently.
4. Request the latest observation from the first available station.
5. Request forecast-office information when available.
6. Combine the responses into one local object.
7. Save the successful result to `localStorage`.
8. Render current conditions, hourly cards, daily details, alerts, timestamps, and forecast-office information.

If current observations are unavailable, the current-conditions card falls back to the first hourly forecast period.

### NWS endpoints in use

- Point metadata: `https://api.weather.gov/points/{latitude},{longitude}`
- Active alerts: `https://api.weather.gov/alerts/active?point={latitude},{longitude}`
- Forecast, hourly, office, station-list, and observation URLs are discovered from point metadata rather than constructed manually.

This discovery-based approach follows the linked structure of the NWS API and avoids hard-coding a Weather Forecast Office grid point.

## Location handling

The initial location is defined by `DEFAULT_LOCATION` in `app.js`.

Users can change it in two ways:

- Search for a U.S. city or ZIP code through Open-Meteo's geocoding endpoint.
- Grant browser geolocation access through the target button.

Search requests are restricted to `countryCode=US` because the NWS point-forecast service is intended for the United States and its territories.

When the location changes:

- `activeLocation` is updated.
- The location is saved locally.
- Weather data is reloaded.
- The official radar link updates to the selected coordinates.
- The Refresh button continues to use the active location.

## Rendering behavior

### Current conditions

The current card uses the latest station observation when possible. Temperature values from station observations are converted from Celsius to Fahrenheit. Heat index or wind chill is calculated locally when conditions meet the applicable thresholds; otherwise the displayed feels-like value is the air temperature.

### Hourly forecast

The first 24 NWS hourly periods are displayed in a horizontally scrollable track. Each card includes time, a weather symbol, temperature, and precipitation probability.

### Daily forecast

The NWS day/night periods are paired into up to seven rows. Rows use native `<details>` and `<summary>` elements so they are clickable and keyboard accessible. Expanded content shows the detailed NWS forecast, precipitation probability, and wind.

### Alerts

Active alerts are rendered as expandable cards. Alert descriptions and instructions remain collapsed until selected.

### Weather symbols

`symbolFor()` maps forecast text to names in the custom futuristic monochrome SVG set. `weatherIcon()` turns that name into a reference to the corresponding symbol defined in the hidden SVG sprite near the beginning of `index.html`. The underlying forecast text remains available to assistive technologies and should be treated as authoritative; the icon is only a visual summary.

To customize an icon, edit its `<symbol id="wx-…">` paths in `index.html`. All icons use a `48 × 48` viewBox, inherit `currentColor`, and share stroke settings from `.wx-icon` in `styles.css`. To change condition matching, edit the ordered checks inside `symbolFor()` in `app.js`. More specific conditions must remain above broad conditions such as clouds. New symbols should preserve the nearby textual forecast and screen-reader labels.

## Sunrise, sunset, and weather palettes

`solarTimes()` calculates sunrise and sunset locally from the selected coordinates and the location time zone returned by the NWS `/points` endpoint. It uses the NOAA solar-equation approach, including the standard 90.833° sunrise/sunset zenith. No additional network service is required.

`weatherPalette()` selects one of these palettes from current conditions and solar time:

- `clear-day`: pale blue and white
- `golden`: peach, coral, and lavender within 75 minutes of sunrise or sunset
- `cloudy` / `fog`: silver-gray and white
- `rain`: cool blue-gray
- `snow`: icy cyan and white
- `storm`: dark slate with light typography
- `night`: deep navy with light typography

Each palette defines its own primary text, secondary text, links, borders, cards, control text, and alert text through CSS custom properties. Do not add fixed dark or light text colors to general components; use `var(--ink)`, `var(--muted)`, `var(--blue)`, or `var(--button-ink)` so contrast follows the active palette.

## Radar status

Embedded radar is currently deferred. Earlier versions combined NOAA's public MRMS WMS radar layer with third-party basemap tiles, but the unauthenticated basemap services produced access-block and API-key errors in real deployments. Version 1.2.2 removed Leaflet and all embedded tile requests. Version 1.3.0 adds a prominent official NWS radar action near the top of the forecast.

`radarURL(location)` generates the NWS viewer's versioned, Base64-encoded settings object. The `weather` agenda receives the active longitude and latitude as both its center and location, uses regional zoom level 7, and selects quality-controlled base reflectivity. `updateRadarLink()` refreshes the destination and location label whenever the forecast location changes.

If embedded radar is revisited, use a basemap provider with explicit terms for the expected traffic and a supported authentication method. Do not place a private API key directly in this static client.

## Local browser storage

The following keys are currently used:

| Key | Stored value |
| --- | --- |
| `wichita-weather-last-forecast-v1` | Last successful combined forecast object |
| `wichita-weather-location-v1` | Active latitude, longitude, and display label |

Storage values are read defensively through `readJSON()`. If a value is missing or malformed, the app falls back to safe defaults.

If a stored-data structure changes incompatibly, increment the suffix in its key and document the migration here.

## Offline behavior

There are two separate caching mechanisms:

### Application shell

`sw.js` stores the local HTML, CSS, JavaScript, manifest, and icons. The current service-worker cache is `wichita-weather-shell-v12`.

For same-origin application files, the service worker uses a network-first strategy and falls back to its cache when the network fails. Activating a new worker removes older application-shell caches.

### Forecast data

After every successful weather request, the combined forecast object is saved to `localStorage`. If a subsequent weather request fails, the saved forecast is rendered with a visible saved/offline message and its original retrieval time.

Third-party map resources and live radar tiles are not cached by the service worker.

## Color and contrast

The app no longer offers manual themes. `data-weather` on `<html>` controls the active palette. When adding a component, verify it in every weather palette—especially `night` and `storm`. Avoid fixed white backgrounds or text colors in general UI components because those can become unreadable when the palette changes.

## Accessibility conventions

- Controls use native buttons, forms, `<details>`, and `<summary>` wherever possible.
- Dynamic status text uses `role="status"` and `aria-live="polite"`.
- Icon-only buttons include accessible labels.
- Decorative weather symbols are hidden where nearby forecast text supplies the meaning.
- Focus styles must remain visible.
- The layout supports narrow screens and larger text without horizontal page scrolling.
- Motion is minimized when `prefers-reduced-motion` is enabled.

Any new interaction should work with touch, mouse, and keyboard before release.

## Versioning and release process

The visible version appears in the lower-right corner of the app and in `README.md` and this file.

Use semantic versions:

- Patch (`1.1.1`): bug fix or minor visual correction with no new feature.
- Minor (`1.2.0`): backward-compatible feature or meaningful interface addition.
- Major (`2.0.0`): incompatible storage change, major redesign, or architecture change.

For each release:

1. Update the visible version in `index.html`.
2. Update the version in `README.md` and this document.
3. Add a release entry to the change log below.
4. Increment the service-worker cache name if any cached application file changed.
5. Run syntax and browser tests.
6. Hard-refresh once after deployment and confirm the new version appears.

## Testing checklist

### Automated checks

```sh
node --check wichita-weather/app.js
node --check wichita-weather/sw.js
```

Validate that `manifest.webmanifest` parses as JSON and every referenced icon exists.

### Browser checks

Test at minimum:

- Mobile viewport around 390 × 844
- Desktop viewport
- Every weather-responsive palette, especially night and storm text contrast
- Sunrise and sunset values for the selected location and time zone
- Wichita first-run forecast
- City search and ZIP-code search
- Saved location after reload
- Device-location denial and success paths
- Hourly horizontal scrolling
- Daily row expansion
- Active alert expansion when alerts are available
- Official NWS radar link
- Offline reload with a previously saved forecast
- Complete first load with no saved forecast and no network
- Keyboard navigation and visible focus
- PWA manifest and service-worker registration

Watch for `pageerror`, failed network requests, non-2xx responses, and console errors during browser testing.

## Deployment notes

All local asset URLs are relative, allowing deployment under a GitHub Pages repository path rather than only at a domain root.

GitHub Pages provides HTTPS, which is important for geolocation and service-worker support. After deploying a service-worker update, an already-open tab may continue using the prior worker until the page is closed or refreshed.

No API keys or secrets belong in this repository. If a future feature requires a secret, introduce a backend or serverless proxy rather than embedding the secret in client-side JavaScript.

## Known limitations

- Weather and radar coverage are limited to the NWS service area.
- The first observation station returned by NWS may not be the geographically closest under every condition.
- Unicode weather symbols can vary slightly across operating systems.
- The official radar viewer requires an internet connection.
- Location search depends on a third-party geocoding service.
- NWS or mapping-service outages can temporarily prevent live updates.

## Safe extension points

Good candidates for future work include:

- Temperature-unit preference
- Saved multiple locations
- Radar warning polygons
- Radar animation with explicit frame controls
- Air-quality or UV data from an authoritative source
- More detailed observation data such as visibility, pressure, and dew point
- Automated Playwright regression tests in the repository

Before adding a weather-data source, document its ownership, update frequency, rate limits, attribution requirements, CORS behavior, and fallback behavior.

## Change log

### 1.4.0 — 2026-09-28

- Removed manual light, dark, and system theme controls.
- Added automatic clear-day, golden-hour, cloudy, fog, rain, snow, storm, and night palettes.
- Added palette-specific primary, secondary, control, link, and alert colors for readable contrast.
- Added locally calculated sunrise and sunset times using the selected coordinates and NWS time zone.
- Updated the browser theme color with the active weather palette.
- Updated the service-worker cache to `wichita-weather-shell-v12`.

### 1.3.3 — 2026-09-28

- Isolated the horizontal 24-hour forecast track from the root document layout on Android Chrome.
- Prevented off-screen hourly cards from widening and scaling the mobile page while retaining touch scrolling.
- Updated the service-worker cache to `wichita-weather-shell-v11`.

### 1.3.2 — 2026-09-28

- Changed the SVG symbol sheet to `display: none` so Android Chrome does not include invisible symbol stroke bounds in the document width.
- Hardened SVG definition containment while investigating Android viewport scaling.
- Updated the service-worker cache to `wichita-weather-shell-v10`.

### 1.3.1 — 2026-09-28

- Contained the hidden SVG symbol library so it cannot contribute to mobile document overflow.
- Clipped unintended horizontal overflow at the document boundary.
- Made new service workers activate and claim open pages immediately so obsolete cached map code does not linger.
- Updated the service-worker cache to `wichita-weather-shell-v9`.

### 1.3.0 — 2026-09-28

- Promoted the official NWS radar link into a prominent action near the top of the forecast.
- Added location-aware NWS radar settings centered on the active searched or GPS forecast location.
- Updated the service-worker cache to `wichita-weather-shell-v8`.

### 1.2.2 — 2026-09-28

- Removed the embedded Leaflet radar map after public basemap providers returned access-block and API-key errors.
- Added a lightweight direct link to the official NWS radar viewer.
- Removed external map-library and tile dependencies.
- Updated the service-worker cache to `wichita-weather-shell-v7`.

### 1.2.1 — 2026-09-28

- Replaced the blocked OpenStreetMap public tile endpoint with the CARTO Positron basemap.
- Preserved OpenStreetMap and CARTO attribution in the radar map.
- Updated the service-worker cache to `wichita-weather-shell-v6`.

### 1.2.0 — 2026-09-28

- Replaced operating-system emoji with a custom futuristic monochrome SVG weather-icon set.
- Added consistent theme-aware icon sizing, strokes, and restrained dark-mode glow.
- Centralized icon artwork in an SVG sprite and forecast matching in `symbolFor()`.
- Updated the service-worker cache to `wichita-weather-shell-v5`.

### 1.1.1 — 2026-09-28

- Corrected the Leaflet stylesheet loading and responsive sizing so map tiles fill the radar card after layout and viewport changes.
- Updated the service-worker cache to `wichita-weather-shell-v4`.

### 1.1.0 — 2026-09-28

- Added the latest NOAA/MRMS base-reflectivity radar map.
- Added radar timestamp, forecast-location marker, legend, and Recenter control.
- Added a visible application version for update monitoring.
- Updated the service-worker cache to `wichita-weather-shell-v3`.

### 1.0.0 — 2026-09-28

- Added current conditions, 24-hour forecast, expandable seven-day forecast, and NWS alerts.
- Added city/ZIP search, device location, and saved-location behavior.
- Added light, dark, and system themes.
- Added offline forecast fallback, PWA metadata, install icons, privacy text, and GitHub Pages documentation.

## Maintenance rule

Every functional change should update the relevant section of this guide. Every released change should also add a concise entry to the change log and update the version wherever it is displayed.
