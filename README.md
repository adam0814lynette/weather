# Wichita Weather

Current app version: **1.6.0**

A mobile-first, installable weather app using official forecast, observation, and alert data from the U.S. National Weather Service. Wichita, Kansas is the first-run default, and users can search for another U.S. city or ZIP code or use their device location.

## Features

- Current conditions, feels-like temperature, humidity, and wind
- Prominent official NWS radar link centered on the active forecast location
- Scrollable 24-hour forecast and expandable seven-day details
- Active NWS alerts with full descriptions and instructions
- City/ZIP search, device location, and remembered preferences
- Weather-responsive color palettes with contrast-aware typography
- Locally calculated civil dawn, sunrise, sunset, civil dusk, and approximate moon phase
- Automatic refresh across local date changes and when returning to the app
- Explicit dates, relative update age, and a 12-hour precipitation chart
- Expandable dew point, visibility, pressure, and wind-gust details
- Up to five saved forecast locations
- Custom futuristic monochrome SVG weather icons
- Cached last forecast and offline application shell
- Responsive, keyboard-accessible interface

## Run locally

This app has no build step or package dependencies. Serve the directory over HTTP so geolocation and the service worker behave correctly:

```sh
python3 -m http.server 8000 --directory wichita-weather
```

Then open `http://localhost:8000`.

## Deploy on GitHub Pages

1. Push this directory to a GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select the branch and the folder containing the app.

All application paths are relative, so the PWA works from a repository subdirectory such as `https://username.github.io/wichita-weather/`.

## Data and privacy

Weather forecasts, observations, and alerts come from the [National Weather Service API](https://www.weather.gov/documentation/services-web-api). Location search uses the [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api), based on GeoNames data.

The app has no analytics, advertising, accounts, or application server. Theme and location preferences are stored only in the browser. When device location is requested, its coordinates are sent directly to the National Weather Service to retrieve the local forecast.

## Limitations

- NWS point forecasts cover the United States and its territories.
- Live data requires internet access; when unavailable, the app displays the last successfully saved forecast.
- Browser location access normally requires HTTPS, which GitHub Pages provides automatically.

## License

Released under the MIT License. See [LICENSE](LICENSE).
