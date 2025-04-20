document.addEventListener('DOMContentLoaded', () => {
    // --- START: API Key Configuration ---
    const OPENWEATHER_API_KEY = 'b76b90a74a663c1c32df578f3d993b72'; // <--- YOUR KEY HERE (Replace if needed)
    // --- END: API Key Configuration ---

    console.log("CityLytics Dashboard Initializing...");

    // --- State Variables ---
    let pollutionChart, energyDistrictChart, aqiGaugeChart, powerSourceChart;
    let pollutionData = { labels: [], pm25: [], co: [] };
    const MAX_DATA_POINTS = 30;
    let routingMap = null, tempMap = null, precipMap = null; // Separate map instances
    let routingControl = null;
    let userStartCoords = null;
    let userLocationMarker = null;
    let currentCity = { name: 'Chennai', searchName: 'Chennai, IN', coords: [13.0827, 80.2707] };
    let currentWeatherData = null;
    let dataUpdateIntervalId = null;
    const DATA_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
    let isFetchingData = false;
    let routingMapInitialized = false;
    let weatherMapsInitialized = false;
    let timeUpdateIntervalId = null;

    // --- DOM Element References ---
    const totalVehiclesEl = document.getElementById('total-vehicles'),
          vehiclesComparisonEl = document.getElementById('vehicles-comparison'),
          currentAqiEl = document.getElementById('current-aqi'),
          aqiStatusEl = document.getElementById('aqi-status'),
          energyTodayEl = document.getElementById('energy-today'),
          energyComparisonEl = document.getElementById('energy-comparison'),
          aqiGaugeValueEl = document.getElementById('aqiGaugeValue'),
          weatherIconEl = document.getElementById('weather-icon'),
          weatherTextEl = document.getElementById('weather-text'),
          weatherDescEl = document.getElementById('weather-desc'),
          notificationBarEl = document.getElementById('notification-bar'),
          notificationMessageEl = document.getElementById('notification-message'),
          chartContainers = document.querySelectorAll('.chart-container'),
          themeToggleButton = document.getElementById('theme-toggle'),
          themeIconSun = document.getElementById('theme-icon-sun'),
          themeIconMoon = document.getElementById('theme-icon-moon'),
          cityInput = document.getElementById('city-input'),
          updateCityBtn = document.getElementById('update-city-btn'),
          currentCityDisplayEl = document.getElementById('current-city-display'),
          currentCityDisplaySm = document.getElementById('current-city-display-sm'),
          currentCityDisplayOverview = document.getElementById('current-city-display-overview'),
          startLocationInput = document.getElementById('start-location'),
          destinationLocationInput = document.getElementById('destination-location'),
          useLocationBtn = document.getElementById('use-location-btn'),
          findRouteBtn = document.getElementById('find-route-btn'),
          mapElement = document.getElementById('map'),
          routeResultsEl = document.getElementById('route-results'),
          routeSummaryEl = document.getElementById('route-summary'),
          routeAqiEl = document.getElementById('route-aqi'),
          routeErrorEl = document.getElementById('route-error'),
          routeInputsContainer = document.getElementById('route-inputs-container'),
          routeResultsContainer = document.getElementById('route-results-container');

    const currentTimeEl = document.getElementById('current-time');
    const tempMapEl = document.getElementById('temp-map');
    const precipMapEl = document.getElementById('precip-map');

    // --- Check Essential Elements ---
    if (!mapElement || !currentTimeEl || !tempMapEl || !precipMapEl || !totalVehiclesEl || !themeToggleButton || !cityInput /* Add checks for other essential elements */ ) {
        console.error("CRITICAL: Essential UI elements missing!");
        document.body.innerHTML = '<p class="p-4 text-center text-red-600 font-bold">Error: UI failed to load properly. Check console.</p>';
        return; // Stop execution
    }

    // --- Map Invalidation (Simplified for theme/resize) ---
    function invalidateAllMaps() {
        const mapsToUpdate = [routingMap, tempMap, precipMap];
        mapsToUpdate.forEach(mapInstance => {
            if (mapInstance) {
                try {
                    setTimeout(() => mapInstance.invalidateSize({ animate: true }), 100);
                } catch (e) { console.warn("Map invalidate error:", e); }
            }
        });
    }

    // --- API Key Check ---
    if (OPENWEATHER_API_KEY === 'YOUR_API_KEY_HERE' || !OPENWEATHER_API_KEY) {
        const msg="OWM API Key missing or placeholder. Weather/AQI features will be limited or disabled.";
        console.error(msg);
        showNotification(msg, "error", false); // Show indefinitely
    }

    // --- Theme Handling ---
    const applyTheme = (isDark) => {
        try {
            const action = isDark ? 'add' : 'remove';
            document.documentElement.classList[action]('dark');
            if (themeIconSun) themeIconSun.classList.toggle('hidden', isDark);
            if (themeIconMoon) themeIconMoon.classList.toggle('hidden', !isDark);
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            invalidateAllMaps(); // Invalidate maps on theme change
            updateChartThemes(isDark);
        } catch (e) { console.error("Theme apply error:", e)}
    };

    try { // Initial Theme Set
        const storedTheme = localStorage.getItem('theme');
        const pDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(storedTheme ? (storedTheme === 'dark') : pDark);
    } catch (e) { applyTheme(false); } // Fallback to light

    if (themeToggleButton) { // Theme Toggle Listener
        themeToggleButton.addEventListener('click', () => {
            applyTheme(!document.documentElement.classList.contains('dark'));
        });
    }

    // --- Initialize Routing Map ---
    function initializeRoutingMap() {
        if (routingMapInitialized || !mapElement) return;
        console.log("Initializing Routing Map...");
        try {
            routingMap = L.map(mapElement, { zoomControl: true, attributionControl: false }).setView(currentCity.coords, 11);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(routingMap);
            L.control.attribution({prefix: false}).addTo(routingMap);

            routingControl = L.Routing.control({
                waypoints: [],
                routeWhileDragging: true,
                showAlternatives: true,
                geocoder: null,
                createMarker: (i, wp) => L.marker(wp.latLng),
                lineOptions: { styles: [{color: '#3b82f6', opacity: 0.8, weight: 6}] },
                collapsible: true,
                show: false
             });

            routingControl.on('routesfound', (e) => {
                try {
                    console.log("Routes found event data:", e);
                    const routes = e.routes;

                    if (routes && routes.length > 0) {
                        const route = routes[0];
                        console.log("Processing route:", route);

                        if (!route.summary) {
                            console.error("Route found, but summary object is missing:", route);
                            handleRouteError("Received incomplete route data (missing summary).");
                            return;
                        }
                        const summary = route.summary;

                        if (typeof summary.totalDistance !== 'number' || typeof summary.totalTime !== 'number') {
                           console.error("Invalid route summary data types:", summary);
                           handleRouteError("Received invalid route summary data (distance/time).");
                           return;
                        }

                        const estimatedConditions = estimateRouteConditions(summary);
                        console.log("Estimated conditions:", estimatedConditions);

                        const aqiText = (estimatedConditions && estimatedConditions.aqi !== 'N/A' && estimatedConditions.aqi != null)
                            ? `${estimatedConditions.aqi} (${getAqiDescription(estimatedConditions.aqi)})`
                            : 'N/A';

                        if (routeSummaryEl) routeSummaryEl.textContent = `Distance: ${(summary.totalDistance / 1000).toFixed(1)} km, Time: ${formatTime(summary.totalTime)}`;
                        if (routeAqiEl) routeAqiEl.textContent = `Est. AQI: ${aqiText}`;
                        if (routeErrorEl) routeErrorEl.textContent = '';
                        if (routeResultsContainer) routeResultsContainer.classList.remove('hidden');

                        if (!routingMap.hasLayer(routingControl)) {
                            console.log("Adding routingControl to map");
                            routingControl.addTo(routingMap);
                        } else {
                            console.log("routingControl already on map");
                        }

                        console.log("Route processing successful.");

                    } else {
                        console.warn("Routes found event fired, but routes array is empty or null:", routes);
                        handleRouteError("No valid routes found.");
                    }
                } catch (err) {
                    console.error("Error processing route data details:", err);
                    handleRouteError("Error processing route data. Check browser console for details.");
                }
                finally {
                    if(findRouteBtn) {
                        findRouteBtn.disabled=false;
                        findRouteBtn.innerHTML='<i class="fas fa-route mr-2"></i>Find Route';
                    }
                }
            });

            routingControl.on('routingerror', (e) => {
                console.error("Routing Error Event:", e);
                handleRouteError(e.error?.message || "Could not find route.");
                if(findRouteBtn) { findRouteBtn.disabled=false; findRouteBtn.innerHTML='<i class="fas fa-route mr-2"></i>Find Route'; }
                if (routingMap.hasLayer(routingControl)) {
                     routingMap.removeLayer(routingControl);
                 }
            });

            routingMapInitialized = true;
            console.log("Routing Map Initialized.");
            setTimeout(() => routingMap.invalidateSize({animate: true}), 150);
        } catch (error) {
            console.error("Routing Map Init Error:", error);
            showNotification("Routing map initialization failed.", "error");
            routingMap = null;
            routingMapInitialized = false;
            if(mapElement) mapElement.textContent = 'Map failed to load.';
        }
    } // End initializeRoutingMap

    // --- Initialize Weather Maps ---
    function initializeWeatherMaps() {
        if (weatherMapsInitialized || !tempMapEl || !precipMapEl) return;
        if (OPENWEATHER_API_KEY === 'YOUR_API_KEY_HERE' || !OPENWEATHER_API_KEY) {
             console.warn("Skipping Weather Map initialization due to missing API key.");
             if(tempMapEl) tempMapEl.textContent = 'Weather Map Disabled (API Key Missing)';
             if(precipMapEl) precipMapEl.textContent = 'Weather Map Disabled (API Key Missing)';
             return;
        }

        console.log("Initializing Weather Maps...");
        try {
            const baseLayerUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
            const baseLayerOptions = { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OSM</a>' };
            const weatherAttribution = 'Weather © <a href="https://openweathermap.org/" target="_blank" rel="noopener noreferrer">OWM</a>';

            tempMap = L.map(tempMapEl, { zoomControl: true, attributionControl: false }).setView(currentCity.coords, 9);
            L.tileLayer(baseLayerUrl, baseLayerOptions).addTo(tempMap);
            L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`, { attribution: weatherAttribution, opacity: 0.7 }).addTo(tempMap);
            L.control.attribution({prefix: false}).addTo(tempMap);

            precipMap = L.map(precipMapEl, { zoomControl: true, attributionControl: false }).setView(currentCity.coords, 9);
            L.tileLayer(baseLayerUrl, baseLayerOptions).addTo(precipMap);
            L.tileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`, { attribution: weatherAttribution, opacity: 0.7 }).addTo(precipMap);
            L.control.attribution({prefix: false}).addTo(precipMap);

            weatherMapsInitialized = true;
            console.log("Weather Maps Initialized.");
            setTimeout(() => {
                tempMap?.invalidateSize({animate: true});
                precipMap?.invalidateSize({animate: true});
            }, 150);
        } catch (error) {
            console.error("Weather Maps Init Error:", error);
            showNotification("Weather maps initialization failed.", "error");
            tempMap = null; precipMap = null; weatherMapsInitialized = false;
            if(tempMapEl) tempMapEl.textContent = 'Temp Map Failed.';
            if(precipMapEl) precipMapEl.textContent = 'Precip Map Failed.';
        }
    } // End initializeWeatherMaps

    // --- Update Map Views ---
    function updateRoutingMapView() {
        if (routingMap && currentCity?.coords) {
            try {
                 routingMap.setView(currentCity.coords, 11);
                 if (routingControl) {
                     routingControl.setWaypoints([]);
                     if (routingMap.hasLayer(routingControl)) {
                         routingMap.removeLayer(routingControl);
                     }
                 }
                 if(routeResultsContainer) routeResultsContainer.classList.add('hidden');
                 removeUserMarker();
                 setTimeout(() => routingMap.invalidateSize({animate: true}), 50);
            } catch (e) { console.warn("Error updating routing map view:", e); }
        }
    }
    function updateWeatherMapsView() {
        if (currentCity?.coords) {
            [tempMap, precipMap].forEach(m => {
                if (m) {
                    try {
                        m.setView(currentCity.coords, 9);
                        setTimeout(() => m.invalidateSize({animate: true}), 50);
                    } catch (e) { console.warn("Error updating weather map view:", e); }
                }
            });
        }
    }

    // --- Geolocation ---
    if (useLocationBtn) {
        useLocationBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                 showNotification("Geolocation is not supported by your browser.", "warning");
                 return;
             }
            showNotification("Getting your location...", "info");
            useLocationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            useLocationBtn.disabled = true;
            navigator.geolocation.getCurrentPosition(handleGeolocationSuccess, handleGeolocationError, { timeout: 10000 });
        });
    }
    async function handleGeolocationSuccess(position) {
        try {
            userStartCoords = [position.coords.latitude, position.coords.longitude];
            showNotification("Location found!", "success");

            if (routingMap) {
                removeUserMarker(); // Remove previous marker if any
                const icon = L.divIcon({
                    className: 'user-location-icon',
                    html: '<i class="fas fa-map-pin text-red-600 text-2xl"></i>',
                    iconSize: [24, 24],
                    iconAnchor: [12, 24]
                });
                userLocationMarker = L.marker(userStartCoords, { icon: icon, zIndexOffset: 1000 }).addTo(routingMap);
                routingMap.setView(userStartCoords, 13); // Zoom in closer
            }

            const address = await reverseGeocode(userStartCoords[0], userStartCoords[1]);
            if (startLocationInput) {
                 startLocationInput.value = address?.display_name || `Lat: ${userStartCoords[0].toFixed(4)}, Lon: ${userStartCoords[1].toFixed(4)}`;
            }
        } catch (e) {
            console.error("Error processing location:", e);
            if (startLocationInput && userStartCoords) {
                 startLocationInput.value = `Lat: ${userStartCoords[0].toFixed(4)}, Lon: ${userStartCoords[1].toFixed(4)}`;
            }
            showNotification("Error processing location data.", "warning");
        } finally {
            if (useLocationBtn) {
                 useLocationBtn.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
                 useLocationBtn.disabled = false;
            }
        }
    } // End handleGeolocationSuccess
    function handleGeolocationError(error) {
        let msg = "Could not get location.";
        switch(error.code){
            case error.PERMISSION_DENIED: msg="Geolocation permission denied."; break;
            case error.POSITION_UNAVAILABLE: msg="Location information unavailable."; break;
            case error.TIMEOUT: msg="Geolocation request timed out."; break;
        }
        showNotification(msg, "error");
        userStartCoords = null;
        if(startLocationInput) startLocationInput.placeholder="Enter start address...";
        if(useLocationBtn){ useLocationBtn.innerHTML='<i class="fas fa-location-crosshairs"></i>'; useLocationBtn.disabled=false; }
    }
    function removeUserMarker() {
        if (userLocationMarker && routingMap) {
            try { routingMap.removeLayer(userLocationMarker); } catch (e) { console.warn("Error removing user marker:", e); }
            userLocationMarker = null;
        }
    }

    // --- Geocoding (Nominatim) ---
    const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
    async function geocodeAddress(address, isCityLookup = false) {
        if (!address) return null;
        const params = new URLSearchParams({
            q: address,
            format: 'json',
            limit: 1,
            addressdetails: 1
        });
        const url = `${NOMINATIM_BASE_URL}/search?${params.toString()}`;
        console.log("Geocoding:", url);
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'CityLytics/1.0 (WebApp)' } });
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            const data = await response.json();
            if (data && data.length > 0) {
                const r = data[0];
                let name = r.display_name;
                let searchName = name;
                if (isCityLookup && r.address) {
                    name = r.address.city || r.address.town || r.address.village || r.address.state || r.name || address.split(',')[0].trim();
                    searchName = `${name}${r.address.country_code ? ', ' + r.address.country_code.toUpperCase() : ''}`;
                }
                console.log("Geocode Result:", { name, searchName, display_name: r.display_name, coords: [parseFloat(r.lat), parseFloat(r.lon)] });
                return { name, searchName, display_name: r.display_name, coords: [parseFloat(r.lat), parseFloat(r.lon)] };
            } else {
                console.warn(`Geocode: No results found for "${address}"`);
                showNotification(`Location not found: "${address}".`, "warning");
                return null;
            }
        } catch (error) {
            console.error(`Geocode Error for "${address}":`, error);
            showNotification(`Could not find location: "${address}". Check connection or try being more specific.`, "warning");
            return null;
        }
    } // End geocodeAddress
    async function reverseGeocode(lat, lon) {
        const params = new URLSearchParams({
            lat: lat.toFixed(6),
            lon: lon.toFixed(6),
            format: 'json',
            addressdetails: 1
        });
        const url = `${NOMINATIM_BASE_URL}/reverse?${params.toString()}`;
        console.log("Reverse Geocoding:", url);
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'CityLytics/1.0 (WebApp)' } });
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            const data = await response.json();
             console.log("Reverse Geocode Result:", data);
            return data;
        } catch (error) {
            console.error(`Reverse Geocode Error for (${lat}, ${lon}):`, error);
            showNotification("Could not get address for coordinates.", "warning");
            return null;
        }
    } // End reverseGeocode

    // --- City Change Handling ---
    async function handleCityUpdate() {
       if (!cityInput || !updateCityBtn) return;
        const cityName = cityInput.value.trim();
        if (!cityName) { showNotification("Please enter a city name.", "warning"); return; }

        showNotification(`Looking up city: ${cityName}...`, 'info');
        updateCityBtn.disabled = true;
        updateCityBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const geocodedCity = await geocodeAddress(cityName, true);
            if (geocodedCity?.coords) {
                currentCity = {
                    name: geocodedCity.name,
                    searchName: geocodedCity.searchName || geocodedCity.name,
                    coords: geocodedCity.coords
                };
                cityInput.value = '';
                cityInput.placeholder = `Search City...`;

                const cityText = `(${currentCity.name})`;
                if (currentCityDisplayOverview) currentCityDisplayOverview.textContent = cityText;

                updateRoutingMapView();
                updateWeatherMapsView();
                await fetchAllCityData(true);
            }
            // Notification for failure handled in geocodeAddress
        } catch (e) {
            console.error("Error during city update process:", e);
            showNotification(`An error occurred while updating the city.`, "error");
        } finally {
            if (updateCityBtn) {
                updateCityBtn.disabled = false;
                updateCityBtn.innerHTML = '<i class="fas fa-search"></i>';
            }
        }
    } // End handleCityUpdate
    if (updateCityBtn) updateCityBtn.addEventListener('click', handleCityUpdate);
    if (cityInput) cityInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleCityUpdate(); } });

    // --- OWM API Fetching ---
    async function fetchOpenWeatherData(lat, lon) {
        if (OPENWEATHER_API_KEY === 'YOUR_API_KEY_HERE' || !OPENWEATHER_API_KEY) {
            console.warn("Skipping OpenWeatherMap API calls due to missing key.");
            return { aqiData: null, weatherData: null };
        }
        const airUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
        let combined = { aqiData: null, weatherData: null };
        console.log("Fetching OWM Data for:", lat, lon);

        try {
            const [airRes, weatherRes] = await Promise.allSettled([
                fetch(airUrl).then(r => r.ok ? r.json() : Promise.reject({ status: r.status, message: `Air Pollution API Error ${r.status}` })),
                fetch(weatherUrl).then(r => r.ok ? r.json() : Promise.reject({ status: r.status, message: `Weather API Error ${r.status}` }))
            ]);

            // --- DEBUG LOG ADDED ---
            if (airRes.status === 'fulfilled' && airRes.value?.list?.[0]) {
                console.log("AQI Data Received:", airRes.value.list[0]);
                // *** ADDED LOG ***
                console.log(">>> Specific Components Data:", airRes.value.list[0].components);
                combined.aqiData = {
                    aqi: airRes.value.list[0].main?.aqi,
                    components: airRes.value.list[0].components
                };
            } else {
                 console.error("Air Quality Fetch Error:", airRes.reason || "No data");
                 if (airRes.reason?.status === 401) { showNotification("Air Quality API Key Error (Unauthorized). Check your key.", "error", false); }
                 else if (airRes.reason && airRes.reason.status !== 404) { showNotification("Could not fetch Air Quality data.", "warning"); }
            }
            // --- END DEBUG LOG ---

            if (weatherRes.status === 'fulfilled' && weatherRes.value?.weather?.[0]) {
                console.log("Weather Data Received:", weatherRes.value);
                const d = weatherRes.value;
                combined.weatherData = {
                    temp: d.main?.temp,
                    feels_like: d.main?.feels_like,
                    description: d.weather[0]?.description,
                    icon: d.weather[0]?.icon,
                    humidity: d.main?.humidity,
                    wind_speed: d.wind?.speed,
                    city_name: d.name
                };
            } else {
                console.error("Weather Fetch Error:", weatherRes.reason || "No data");
                if (weatherRes.reason?.status === 401) { showNotification("Weather API Key Error (Unauthorized). Check your key.", "error", false); }
                 else if (weatherRes.reason && weatherRes.reason.status !== 404) { showNotification("Could not fetch Weather data.", "warning"); }
            }
            return combined;
        } catch (error) {
            console.error("Network Error fetching OWM data:", error);
            showNotification("Network error fetching weather/AQI data. Check connection.", "error");
            return { aqiData: null, weatherData: null };
        }
    } // End fetchOpenWeatherData

    // --- Data Orchestration ---
    async function fetchAllCityData(isManualUpdate = false) {
        if (isFetchingData) { console.log("Data fetch already in progress."); return; }
        isFetchingData = true;
        console.log("Fetching all city data for:", currentCity.name);
        let uiData = null;

        try {
            const owmData = await fetchOpenWeatherData(currentCity.coords[0], currentCity.coords[1]);
            currentWeatherData = owmData;

            // --- DEBUG LOG ADDED ---
            const simulatedData = generateSimulatedParts(owmData);
            // --- END DEBUG LOG ---

            uiData = {
                time: new Date(),
                aqi: owmData?.aqiData?.aqi ? convertAqiScale(owmData.aqiData.aqi) : null,
                pm25: owmData?.aqiData?.components?.pm2_5 ?? null,
                co: owmData?.aqiData?.components?.co ?? null,
                weather_description: owmData?.weatherData?.description ?? null,
                weather_icon: owmData?.weatherData?.icon ?? null,
                temp: owmData?.weatherData?.temp ?? null,
                ...simulatedData // Spread the simulated values
            };

            // --- DEBUG LOG ADDED ---
            console.log("Merged uiData including simulated parts:", uiData);
            // --- END DEBUG LOG ---

             if (isManualUpdate) {
                showNotification(`Data updated for ${currentCity.name}.`, 'success');
             }

        } catch (e) {
            console.error("Error in fetchAllCityData:", e);
            showNotification(`Error fetching latest data for ${currentCity.name}.`, "error");
        } finally {
            updateDashboardUI(uiData);
            clearTimeout(dataUpdateIntervalId);
            dataUpdateIntervalId = setTimeout(() => fetchAllCityData(false), DATA_REFRESH_INTERVAL);
            isFetchingData = false;
            console.log("Finished data fetch cycle.");
        }
    } // End fetchAllCityData

    // --- Simulated Data Generation ---
    function generateSimulatedParts(realData) {
        // --- DEBUG LOG ADDED ---
        console.log("--- generateSimulatedParts START ---", realData);
        // --- END DEBUG LOG ---

        const baseEnergy = realData?.weatherData?.temp > 25 ? 5500 : 4500;
        const baseVehicles = realData?.weatherData?.temp < 10 ? 11000 : 13000;
        const energy_kwh = Math.max(500, Math.floor(baseEnergy + (Math.random() - 0.5) * 4000));
        const vehicles = Math.max(1000, Math.floor(baseVehicles + (Math.random() - 0.5) * 8000));
        const renewablePercent = Math.random() * (85 - 35) + 35;
        const vehicleChange = (Math.random() * 12 - 5).toFixed(0);
        const energyChange = (Math.random() * 10 - 6).toFixed(0);
        const districts = {'Downtown':.2,'Industrial':.3,'Residential N':.15,'Residential S':.1,'Commercial':.2,'Suburban':.05};
        const energyByDistrict = {};
        let totalSimulatedEnergy = 0;
        for (const [name, ratio] of Object.entries(districts)) {
            const districtEnergy = Math.floor(energy_kwh * ratio * (0.8 + Math.random() * 0.4));
            energyByDistrict[name] = districtEnergy;
            totalSimulatedEnergy += districtEnergy;
        }
        const scaleFactor = totalSimulatedEnergy > 0 ? energy_kwh / totalSimulatedEnergy : 1;
        if (Math.abs(1 - scaleFactor) > 0.1) {
            for (const name in energyByDistrict) {
                energyByDistrict[name] = Math.floor(energyByDistrict[name] * scaleFactor);
            }
        }

        const result = {
            energy_today_kwh: energy_kwh,
            total_vehicles: vehicles,
            renewable_power_percent: parseFloat(renewablePercent.toFixed(1)),
            energy_by_district: energyByDistrict,
            comparison: {
                 vehicleChange: parseInt(vehicleChange),
                 energyChange: parseInt(energyChange)
            }
        };

        // --- DEBUG LOG ADDED ---
        console.log("--- generateSimulatedParts END --- Returning:", result);
        // --- END DEBUG LOG ---
        return result;
    } // End generateSimulatedParts

    // --- Helper Functions ---
    function convertAqiScale(owmAqi) {
        if (owmAqi == null) return null;
        switch (owmAqi) {
            case 1: return Math.round(Math.random() * 50);
            case 2: return Math.round(51 + Math.random() * 49);
            case 3: return Math.round(101 + Math.random() * 49);
            case 4: return Math.round(151 + Math.random() * 49);
            case 5: return Math.round(201 + Math.random() * 100);
            default: return null;
        }
    }
    function getAqiDescription(aqiValue) {
        if (aqiValue == null || aqiValue === 'N/A') return "N/A";
        if (aqiValue <= 50) return "Good";
        if (aqiValue <= 100) return "Moderate";
        if (aqiValue <= 150) return "Unhealthy (Sen)";
        if (aqiValue <= 200) return "Unhealthy";
        if (aqiValue <= 300) return "Very Unhealthy";
        return "Hazardous";
    }
    function getAqiColor(aqiValue, isDark, returnClass = false) {
        const C = {
            good: { l: '#10b981', d: '#34d399', cl: 'text-emerald-600 dark:text-emerald-400', bgcl: 'bg-emerald-500' },
            mod:  { l: '#f59e0b', d: '#fcd34d', cl: 'text-amber-600 dark:text-amber-400',   bgcl: 'bg-amber-500' },
            usg:  { l: '#f97316', d: '#fb923c', cl: 'text-orange-600 dark:text-orange-400', bgcl: 'bg-orange-500' },
            unh:  { l: '#ef4444', d: '#f87171', cl: 'text-red-500 dark:text-red-400',     bgcl: 'bg-red-500' },
            vunh: { l: '#a855f7', d: '#c084fc', cl: 'text-purple-600 dark:text-purple-400', bgcl: 'bg-purple-600' },
            haz:  { l: '#7e22ce', d: '#a78bfa', cl: 'text-purple-800 dark:text-purple-300', bgcl: 'bg-purple-800' },
            def:  { l: '#6b7280', d: '#9ca3af', cl: 'text-gray-500 dark:text-gray-400',     bgcl: 'bg-gray-500' }
        };
        let level = 'def';
        if (aqiValue != null && aqiValue !== 'N/A') {
            if (aqiValue <= 50) level = 'good';
            else if (aqiValue <= 100) level = 'mod';
            else if (aqiValue <= 150) level = 'usg';
            else if (aqiValue <= 200) level = 'unh';
            else if (aqiValue <= 300) level = 'vunh';
            else level = 'haz';
        }
        const themeKey = isDark ? 'd' : 'l';
        const classKey = 'cl';
        if (returnClass) {
            return C[level][classKey];
        } else {
            return C[level][themeKey];
        }
    }
    function getWeatherIconClass(iconCode) {
        if (!iconCode) return 'fas fa-question-circle text-gray-400 text-xl mr-2';
        const map = {
            '01d': 'fas fa-sun text-yellow-400', '01n': 'fas fa-moon text-indigo-300',
            '02d': 'fas fa-cloud-sun text-yellow-400', '02n': 'fas fa-cloud-moon text-indigo-300',
            '03d': 'fas fa-cloud text-sky-400', '03n': 'fas fa-cloud text-sky-400',
            '04d': 'fas fa-cloud-meatball text-sky-500', '04n': 'fas fa-cloud-meatball text-sky-500',
            '09d': 'fas fa-cloud-showers-heavy text-blue-500', '09n': 'fas fa-cloud-showers-heavy text-blue-400',
            '10d': 'fas fa-cloud-sun-rain text-blue-400', '10n': 'fas fa-cloud-moon-rain text-blue-300',
            '11d': 'fas fa-bolt-lightning text-yellow-500', '11n': 'fas fa-bolt-lightning text-yellow-500',
            '13d': 'fas fa-snowflake text-cyan-400', '13n': 'fas fa-snowflake text-cyan-400',
            '50d': 'fas fa-smog text-gray-400', '50n': 'fas fa-smog text-gray-400'
        };
        return `${map[iconCode] || 'fas fa-question-circle text-gray-400'} text-xl mr-2`;
    }
    function capitalizeFirstLetter(string) {
        return string ? string.charAt(0).toUpperCase() + string.slice(1) : '';
    }
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "N/A";
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs.toString().padStart(2, '0')}s`;
        } else {
            return `${secs}s`;
        }
    }
    function hexToRgba(hex, alpha = 1) {
        if (!hex || typeof hex !== 'string') {
             console.warn("hexToRgba received invalid hex:", hex);
             return `rgba(128, 128, 128, ${alpha})`;
        }
        let r = 0, g = 0, b = 0;
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else {
             console.warn("hexToRgba received hex with invalid length:", hex);
             return `rgba(128, 128, 128, ${alpha})`;
        }
        if (isNaN(r) || isNaN(g) || isNaN(b)) {
             console.warn("hexToRgba failed to parse hex:", hex);
             return `rgba(128, 128, 128, ${alpha})`;
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } // End hexToRgba

    // --- Update Dashboard UI ---
    function updateDashboardUI(data) {
        updateTime();

        if (!data) {
            console.warn("Updating UI with null data (clearing fields).");
            if(totalVehiclesEl) totalVehiclesEl.textContent = '--';
            if(vehiclesComparisonEl) vehiclesComparisonEl.textContent = 'N/A';
            if(energyTodayEl) energyTodayEl.textContent = '--';
            if(energyComparisonEl) energyComparisonEl.textContent = 'N/A';
            if(currentAqiEl) { currentAqiEl.textContent = '--'; currentAqiEl.className = 'stat-value'; }
            if(aqiStatusEl) { aqiStatusEl.textContent = 'Status: N/A'; aqiStatusEl.className = 'stat-comparison'; }
            if(aqiGaugeValueEl) aqiGaugeValueEl.textContent = '--';
            if(weatherIconEl) weatherIconEl.className = getWeatherIconClass(null);
            if(weatherTextEl) weatherTextEl.textContent = '--';
            if(weatherDescEl) weatherDescEl.textContent = 'Conditions N/A';
            clearChartData();
            return;
        }

        console.log("Updating UI with data:", data);

        const cityText = `(${currentCity.name})`;
        if (currentCityDisplayOverview) currentCityDisplayOverview.textContent = cityText;

        if(totalVehiclesEl) totalVehiclesEl.textContent = data.total_vehicles?.toLocaleString() ?? '--';

        // --- DEBUG LOGS ADDED ---
        if(energyTodayEl) {
             console.log(`Updating energyTodayEl with: ${data.energy_today_kwh?.toLocaleString() ?? '--'}`);
             energyTodayEl.textContent = data.energy_today_kwh?.toLocaleString() ?? '--';
        }
        if(energyComparisonEl){
             const energyChange = data.comparison?.energyChange ?? 0;
             console.log(`Updating energyComparisonEl with change: ${energyChange}`);
             energyComparisonEl.textContent = `${energyChange >= 0 ? '+' : ''}${energyChange}% vs Prev`;
             energyComparisonEl.className = `stat-comparison ${energyChange <= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`;
        }
        // --- END DEBUG LOGS ---

        if(currentAqiEl) currentAqiEl.textContent = data.aqi ?? '--';
        if(aqiGaugeValueEl) aqiGaugeValueEl.textContent = data.aqi ?? '--';

        const vehicleChange = data.comparison?.vehicleChange ?? 0;
        if(vehiclesComparisonEl){
            vehiclesComparisonEl.textContent = `${vehicleChange >= 0 ? '+' : ''}${vehicleChange}% vs Prev`;
            vehiclesComparisonEl.className = `stat-comparison ${vehicleChange >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`;
        }

        const isDark = document.documentElement.classList.contains('dark');
        const aqiDescription = getAqiDescription(data.aqi);
        const aqiColorClass = getAqiColor(data.aqi, isDark, true);

        if(currentAqiEl) currentAqiEl.className = `stat-value ${aqiColorClass}`;
        if(aqiStatusEl) {
             aqiStatusEl.textContent = `Status: ${aqiDescription}`;
             aqiStatusEl.className = `stat-comparison ${aqiColorClass}`;
        }

        if(weatherIconEl) weatherIconEl.className = getWeatherIconClass(data.weather_icon);
        if(weatherTextEl) weatherTextEl.textContent = data.temp != null ? `${data.temp.toFixed(0)}°C` : '--';
        if(weatherDescEl) weatherDescEl.textContent = data.weather_description ? capitalizeFirstLetter(data.weather_description) : 'Conditions';

        const timeLabel = data.time?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '--';
        const pm25 = data.pm25 ?? null;
        const co = data.co ?? null;

        // --- DEBUG LOG ADDED ---
        console.log(`Checking pollution values before buffer: PM2.5 = ${pm25}, CO = ${co}`);
        // --- END DEBUG LOG ---

        if (pm25 != null || co != null) {
            pollutionData.labels.push(timeLabel);
            pollutionData.pm25.push(pm25);
            pollutionData.co.push(co);
            if (pollutionData.labels.length > MAX_DATA_POINTS) {
                pollutionData.labels.shift();
                pollutionData.pm25.shift();
                pollutionData.co.shift();
            }
        }

        updateCharts(data); // Call the version with logs
    } // End updateDashboardUI

    // --- Chart Functions ---
    function initializeCharts() {
        console.log("Initializing charts...");
        const ctxPollution = document.getElementById('pollutionChart')?.getContext('2d');
        const ctxEnergy = document.getElementById('energyDistrictChart')?.getContext('2d');
        const ctxAqiGauge = document.getElementById('aqiGaugeChart')?.getContext('2d');
        const ctxPowerSource = document.getElementById('powerSourceChart')?.getContext('2d');

        const isDark = document.documentElement.classList.contains('dark');
        const commonOptions = getCommonChartOptions(isDark);

        try {
            // Pollution Line Chart
            if (ctxPollution && !Chart.getChart(ctxPollution.canvas)) {
                const pmColor = getAqiColor(170, isDark);
                const coColor = getAqiColor(70, isDark);
                pollutionChart = new Chart(ctxPollution, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [
                            { label: 'PM2.5 (µg/m³)', data: [], borderColor: pmColor, backgroundColor: hexToRgba(pmColor, 0.1), tension: 0.3, yAxisID: 'yPm25', fill: 'start', pointRadius: 2, borderWidth: 1.5 },
                            { label: 'CO (µg/m³)', data: [], borderColor: coColor, backgroundColor: hexToRgba(coColor, 0.1), tension: 0.3, yAxisID: 'yCo', fill: 'start', pointRadius: 2, borderWidth: 1.5 }
                        ]
                    },
                    options: {
                        ...commonOptions,
                        scales: getPollutionScales(isDark, commonOptions),
                        interaction: { mode: 'index', intersect: false },
                        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } }, tooltip: { mode: 'index', intersect: false } }
                    }
                });
            }

            // Energy District Bar Chart
            if (ctxEnergy && !Chart.getChart(ctxEnergy.canvas)) {
                const districtColors = getDistrictColors(isDark);
                energyDistrictChart = new Chart(ctxEnergy, {
                    type: 'bar',
                    data: { labels: [], datasets: [{ label: 'kWh', data: [], backgroundColor: districtColors.background, borderColor: districtColors.border, borderWidth: 1 }] },
                    options: {
                        ...commonOptions,
                        indexAxis: 'y',
                        scales: {
                            x: { ...commonOptions.scales.x, title: { display: true, text: 'Energy Consumption (kWh)', color: commonOptions.plugins.legend.labels.color } },
                            y: { ...commonOptions.scales.y, ticks: {...commonOptions.scales.y.ticks, autoSkip: false} }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }

            // AQI Gauge Doughnut Chart
            if (ctxAqiGauge && !Chart.getChart(ctxAqiGauge.canvas)) {
                const initialAqiColor = getAqiColor(null, isDark);
                const gaugeBgColor = isDark ? '#374151' : '#e5e7eb';
                 aqiGaugeChart = new Chart(ctxAqiGauge, {
                    type: 'doughnut',
                    data: {
                        datasets: [{
                            data: [0, 300],
                            backgroundColor: [initialAqiColor, gaugeBgColor],
                            borderColor: [isDark ? '#1f2937' : '#ffffff', isDark ? '#1f2937' : '#ffffff'],
                            borderWidth: 1,
                            circumference: 180,
                            rotation: 270
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, aspectRatio: 1.5,
                        cutout: '70%',
                        plugins: { legend: { display: false }, tooltip: { enabled: false } },
                        animation: { duration: 500 }
                    }
                });
            }

            // Power Source Pie Chart
            if (ctxPowerSource && !Chart.getChart(ctxPowerSource.canvas)) {
                 const powerColors = ['#10b981', '#f59e0b', '#6b7280'];
                 const powerColorsDark = ['#34d399', '#fcd34d', '#9ca3af'];
                 powerSourceChart = new Chart(ctxPowerSource, {
                     type: 'pie',
                     data: {
                         labels: ['Renewable', 'Fossil Fuel', 'Other'],
                         datasets: [{
                             label: 'Source %',
                             data: [0, 0, 0],
                             backgroundColor: isDark ? powerColorsDark : powerColors,
                             borderWidth: 2,
                             borderColor: isDark ? '#0f172a' : '#ffffff'
                         }]
                     },
                     options: {
                         ...commonOptions,
                         responsive: true, maintainAspectRatio: false,
                         plugins: {
                             legend: { position: 'right', labels: { boxWidth: 12, padding: 15, color: commonOptions.plugins.legend.labels.color } },
                             tooltip: {
                                enabled: true,
                                callbacks: {
                                     label: function(context) {
                                         let label = context.label || '';
                                         if (label) { label += ': '; }
                                         if (context.parsed != null) { label += context.parsed.toFixed(1) + '%'; }
                                         return label;
                                     }
                                 }
                             }
                         }
                     }
                 });
             }
            console.log("Charts Initialized (if canvases found).");
        } catch (e) {
            console.error("Chart Initialization Error:", e);
            showNotification("Failed to initialize charts.", "error");
        }
    } // End initializeCharts
    function clearChartData() {
        console.warn("Clearing chart data...");
        try {
            const isDark = document.documentElement.classList.contains('dark');
            pollutionData = { labels: [], pm25: [], co: [] };

            if (pollutionChart?.data) {
                pollutionChart.data.labels = [];
                pollutionChart.data.datasets[0].data = [];
                pollutionChart.data.datasets[1].data = [];
                pollutionChart.update('none');
            }
            if (energyDistrictChart?.data) {
                energyDistrictChart.data.labels = [];
                energyDistrictChart.data.datasets[0].data = [];
                energyDistrictChart.update('none');
            }
            if (aqiGaugeChart?.data) {
                const gaugeBgColor = isDark ? '#374151' : '#e5e7eb';
                const defaultColor = getAqiColor(null, isDark);
                aqiGaugeChart.data.datasets[0].data = [0, 300];
                aqiGaugeChart.data.datasets[0].backgroundColor = [defaultColor, gaugeBgColor];
                aqiGaugeChart.data.datasets[0].borderColor = [isDark ? '#1f2937' : '#ffffff', isDark ? '#1f2937' : '#ffffff'];
                aqiGaugeChart.update('none');
                if (aqiGaugeValueEl) aqiGaugeValueEl.textContent = '--';
            }
            if (powerSourceChart?.data) {
                powerSourceChart.data.datasets[0].data = [0, 0, 0];
                powerSourceChart.update('none');
            }
        } catch (e) { console.error("Error clearing chart data:", e); }
    } // End clearChartData
    function getCommonChartOptions(isDark) {
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        const textColor = isDark ? '#d1d5db' : '#4b5568';
        const tooltipBg = isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.95)';
        const tooltipTitle = isDark ? '#f1f5f9' : '#1f2937';
        const tooltipBody = isDark ? '#cbd5e1' : '#334155';
        const tooltipBorder = isDark ? '#475569' : '#d1d5db';

        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: textColor, maxRotation: 0, autoSkip: true, padding: 5, font: { size: 10 } }, grid: { color: gridColor, drawTicks: false, drawOnChartArea: false, borderColor: gridColor } },
                y: { ticks: { color: textColor, padding: 5, font: { size: 10 } }, grid: { color: gridColor, borderDash: [3, 3], drawTicks: false, borderColor: gridColor }, beginAtZero: true }
            },
            plugins: {
                legend: { labels: { color: textColor, boxWidth: 10, padding: 10, font: { size: 11 } } },
                tooltip: { enabled: true, backgroundColor: tooltipBg, titleColor: tooltipTitle, titleFont: { weight: 'bold', size: 13 }, bodyColor: tooltipBody, bodyFont: { size: 11 }, borderColor: tooltipBorder, borderWidth: 1, padding: 10, cornerRadius: 4, displayColors: true, boxPadding: 4 }
            },
            animation: { duration: 400 }
        };
    } // End getCommonChartOptions
    function getPollutionScales(isDark, commonOptions) {
        const textColor = isDark ? '#d1d5db' : '#4b5568';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        const pmColor = getAqiColor(170, isDark);
        const coColor = getAqiColor(70, isDark);

        return {
            x: { ...commonOptions.scales.x },
            yPm25: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: 'PM2.5 (µg/m³)', color: pmColor, font: { size: 10 } }, ticks: { color: pmColor, padding: 5, font: { size: 10 } }, grid: { color: gridColor, borderDash: [3, 3], drawTicks: false, borderColor: gridColor } },
            yCo: { type: 'linear', position: 'right', beginAtZero: true, title: { display: true, text: 'CO (µg/m³)', color: coColor, font: { size: 10 } }, ticks: { color: coColor, padding: 5, font: { size: 10 } }, grid: { drawOnChartArea: false } }
        };
    } // End getPollutionScales
    const districtBaseColors = [
         { l: '#60a5fa', d: '#93c5fd' }, { l: '#2dd4bf', d: '#5eead4' }, { l: '#facc15', d: '#fde047' },
         { l: '#a78bfa', d: '#c4b5fd' }, { l: '#f472b6', d: '#f9a8d4' }, { l: '#9ca3af', d: '#d1d5db' }
     ];
    function getDistrictColors(isDark, opacity = 0.8, count = districtBaseColors.length) {
        const themeKey = isDark ? 'd' : 'l';
        const numBaseColors = districtBaseColors.length;
        const backgroundColors = [];
        const borderColors = [];

        for (let i = 0; i < count; i++) {
            const colorPair = districtBaseColors[i % numBaseColors];
            backgroundColors.push(hexToRgba(colorPair[themeKey], opacity));
            borderColors.push(colorPair[themeKey]);
        }
        return { background: backgroundColors, border: borderColors };
    } // End getDistrictColors

    // --- updateCharts Function with DEBUG LOGS ---
    function updateCharts(data) {
        if (!data) { clearChartData(); return; }

        const isDark = document.documentElement.classList.contains('dark');
        // console.log("Updating charts with data:", data); // Optional: Keep if needed

        try {
            // Update Pollution Chart
            if (pollutionChart?.data) {
                // *** DEBUG LOG ADDED ***
                console.log("Updating pollutionChart data:", JSON.parse(JSON.stringify(pollutionData)));
                pollutionChart.data.labels = pollutionData.labels;
                pollutionChart.data.datasets[0].data = pollutionData.pm25;
                pollutionChart.data.datasets[1].data = pollutionData.co;
                pollutionChart.update('none');
            } else { console.warn("Pollution chart object or its data property is not available."); }

            // Update Energy District Chart
            if (energyDistrictChart?.data) {
                const districtData = data.energy_by_district ?? {};
                 // *** DEBUG LOG ADDED ***
                console.log("Updating energyDistrictChart with data:", districtData);
                const labels = Object.keys(districtData);
                const values = Object.values(districtData);
                energyDistrictChart.data.labels = labels;
                energyDistrictChart.data.datasets[0].data = values;

                const districtColors = getDistrictColors(isDark, 0.8, labels.length);
                energyDistrictChart.data.datasets[0].backgroundColor = districtColors.background;
                energyDistrictChart.data.datasets[0].borderColor = districtColors.border;
                energyDistrictChart.update('none');
            } else { console.warn("Energy district chart object or its data property is not available."); }

            // Update AQI Gauge Chart
            if (aqiGaugeChart?.data) {
                const aqi = data.aqi ?? 0;
                const maxAqi = 300;
                const gaugeValue = Math.min(Math.max(aqi, 0), maxAqi);
                const remainingValue = Math.max(0, maxAqi - gaugeValue);
                const gaugeColor = getAqiColor(aqi, isDark);
                const gaugeBgColor = isDark ? '#374151' : '#e5e7eb';

                aqiGaugeChart.data.datasets[0].data = [gaugeValue, remainingValue];
                aqiGaugeChart.data.datasets[0].backgroundColor = [gaugeColor, gaugeBgColor];
                 aqiGaugeChart.data.datasets[0].borderColor = [isDark ? '#1f2937' : '#ffffff', isDark ? '#1f2937' : '#ffffff'];
                aqiGaugeChart.update();
            } else { console.warn("AQI gauge chart object or its data property is not available."); }

            // Update Power Source Pie Chart
            if (powerSourceChart?.data) {
                 const ren = data.renewable_power_percent ?? 0;
                 const fos = Math.max(0, 100 - ren);
                 const oth = Math.max(0, 100 - ren - fos);

                 powerSourceChart.data.datasets[0].data = [ren, fos, oth];
                 // console.log(`Updating Power Source Chart: Ren=${ren.toFixed(1)}%, Fos=${fos.toFixed(1)}%, Oth=${oth.toFixed(1)}%`); // Optional
                 powerSourceChart.update('none');
            } else { console.warn("Power source chart object or its data property is not available."); }

        } catch (e) { console.error("Error updating charts:", e); }
    } // End updateCharts
    // --- END updateCharts Function ---

    function updateChartThemes(isDark) {
        console.log(`Updating chart themes (Dark Mode: ${isDark})`);
        const commonOptions = getCommonChartOptions(isDark);
        const chartsToUpdate = [
            { chart: pollutionChart, type: 'pollution' },
            { chart: energyDistrictChart, type: 'energy' },
            { chart: aqiGaugeChart, type: 'aqi' },
            { chart: powerSourceChart, type: 'power' }
        ];

        chartsToUpdate.forEach(({ chart, type }) => {
            if (chart?.options && chart.data) {
                try {
                    Object.assign(chart.options.plugins.tooltip, commonOptions.plugins.tooltip);
                    Object.assign(chart.options.plugins.legend, commonOptions.plugins.legend);
                    if (chart.options.scales?.x) chart.options.scales.x = { ...chart.options.scales.x, ...commonOptions.scales.x };
                    if (chart.options.scales?.y) chart.options.scales.y = { ...chart.options.scales.y, ...commonOptions.scales.y };

                    if (type === 'pollution') {
                         chart.options.scales = getPollutionScales(isDark, commonOptions);
                         const pmColor = getAqiColor(170, isDark);
                         const coColor = getAqiColor(70, isDark);
                         chart.data.datasets[0].borderColor = pmColor;
                         chart.data.datasets[0].backgroundColor = hexToRgba(pmColor, 0.1);
                         chart.data.datasets[1].borderColor = coColor;
                         chart.data.datasets[1].backgroundColor = hexToRgba(coColor, 0.1);
                         if (chart.options.scales.yPm25?.title) chart.options.scales.yPm25.title.color = pmColor;
                         if (chart.options.scales.yPm25?.ticks) chart.options.scales.yPm25.ticks.color = pmColor;
                         if (chart.options.scales.yCo?.title) chart.options.scales.yCo.title.color = coColor;
                         if (chart.options.scales.yCo?.ticks) chart.options.scales.yCo.ticks.color = coColor;

                    } else if (type === 'energy') {
                         const districtColors = getDistrictColors(isDark, 0.8, chart.data.labels?.length || 0);
                         chart.data.datasets[0].backgroundColor = districtColors.background;
                         chart.data.datasets[0].borderColor = districtColors.border;
                         if(chart.options.scales?.x?.title) chart.options.scales.x.title.color = commonOptions.plugins.legend.labels.color;

                    } else if (type === 'aqi') {
                         const aqi = chart.data.datasets[0].data[0] ?? 0;
                         const gaugeColor = getAqiColor(aqi, isDark);
                         const gaugeBgColor = isDark ? '#374151' : '#e5e7eb';
                         chart.data.datasets[0].backgroundColor = [gaugeColor, gaugeBgColor];
                         chart.data.datasets[0].borderColor = [isDark ? '#1f2937' : '#ffffff', isDark ? '#1f2937' : '#ffffff'];

                    } else if (type === 'power') {
                         const powerColors = ['#10b981', '#f59e0b', '#6b7280'];
                         const powerColorsDark = ['#34d399', '#fcd34d', '#9ca3af'];
                         chart.data.datasets[0].backgroundColor = isDark ? powerColorsDark : powerColors;
                         chart.data.datasets[0].borderColor = isDark ? '#0f172a' : '#ffffff';
                         if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = commonOptions.plugins.legend.labels.color;
                    }

                    chart.update();
                } catch (e) { console.error(`Error updating theme for ${type} chart:`, e); }
            }
        });
    } // End updateChartThemes

    // --- Routing Logic ---
    if (findRouteBtn) {
        findRouteBtn.addEventListener('click', async () => {
            if (!routingMap || !routingControl) { showNotification("Routing map is not ready.", "error"); return; }

            const startVal = startLocationInput.value.trim();
            const destVal = destinationLocationInput.value.trim();

            if (!startVal || !destVal) { showNotification("Please enter both start and destination locations.", "warning"); return; }

            findRouteBtn.disabled = true;
            findRouteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Finding Route...';
            if (routeResultsContainer) routeResultsContainer.classList.add('hidden');
            if (routeErrorEl) routeErrorEl.textContent = '';
             if (routingMap.hasLayer(routingControl)) {
                 routingMap.removeLayer(routingControl);
             }
            routingControl.setWaypoints([]);

            try {
                let startWp = null, destWp = null;

                if (userStartCoords && (startVal.toLowerCase().includes('current') || startVal.startsWith('Lat:'))) {
                     console.log("Using current location coordinates for start.");
                     startWp = L.latLng(userStartCoords);
                     routingMap.panTo(userStartCoords);
                } else {
                     const startGeo = await geocodeAddress(startVal);
                     if (startGeo?.coords) {
                         startWp = L.latLng(startGeo.coords);
                     } else {
                         handleRouteError(`Could not find start location: "${startVal}"`);
                         return;
                     }
                }

                const destGeo = await geocodeAddress(destVal);
                if (destGeo?.coords) {
                    destWp = L.latLng(destGeo.coords);
                } else {
                    handleRouteError(`Could not find destination location: "${destVal}"`);
                    return;
                }

                if (startWp && destWp) {
                    console.log("Setting waypoints:", startWp, destWp);
                    routingControl.setWaypoints([startWp, destWp]);
                }

            } catch (error) {
                console.error("Unexpected error during route finding setup:", error);
                handleRouteError("An unexpected error occurred before finding the route.");
                 if(findRouteBtn) {
                    findRouteBtn.disabled = false;
                    findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route';
                 }
            }
        });
    } // End findRouteBtn listener

    function handleRouteError(message) {
        console.warn("Handling Route Error:", message);
        if (routeErrorEl) routeErrorEl.textContent = `Error: ${message}`;
        if (routeSummaryEl) routeSummaryEl.textContent = '';
        if (routeAqiEl) routeAqiEl.textContent = '';
        if (routeResultsContainer) routeResultsContainer.classList.remove('hidden');

        if (findRouteBtn && findRouteBtn.disabled) {
            findRouteBtn.disabled = false;
            findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route';
        }
         if (routingMap && routingControl && routingMap.hasLayer(routingControl)) {
             try { routingMap.removeLayer(routingControl); } catch(e){ console.warn("Error removing routing control on error:", e); }
         }
    } // End handleRouteError

    // --- estimateRouteConditions Function (Cleaned) ---
    function estimateRouteConditions(summary) {
        if (!summary) {
            console.warn("estimateRouteConditions called with null or undefined summary");
            return { aqi: 'N/A' };
        }
        const owmAqi = currentWeatherData?.aqiData?.aqi;
        const currentAqiValue = owmAqi != null ? convertAqiScale(owmAqi) : null;
        // console.log("Base AQI for estimation:", currentAqiValue); // Optional log

        let estimatedAqi = currentAqiValue;

        if (estimatedAqi !== null && typeof summary.totalDistance === 'number' && summary.totalDistance > 15000) {
             // console.log("Adjusting AQI for long distance."); // Optional log
             estimatedAqi = Math.min(500, Math.round(estimatedAqi * 1.05));
        }

        const result = { aqi: estimatedAqi ?? 'N/A' };
        // console.log("Estimated Route AQI:", result.aqi); // Optional log
        return result;
    } // End estimateRouteConditions

    // --- Notifications ---
    let notificationTimeout;
    function showNotification(message, type = 'info', autoHide = true, duration = 4000) {
        if (!notificationBarEl || !notificationMessageEl) {
            console.log(`Notification (${type}): ${message}`);
            return;
        }
        if (type !== 'info') console.log(`Notify [${type}]: ${message}`);

        clearTimeout(notificationTimeout);
        notificationMessageEl.textContent = message;
        notificationBarEl.className = 'notification-bar flex items-center border rounded-lg p-3 mb-4 text-sm transition-opacity duration-300 opacity-100';

        notificationBarEl.classList.remove(
            'border-blue-300', 'dark:border-blue-700', 'bg-blue-100', 'dark:bg-blue-900/80', 'text-blue-800', 'dark:text-blue-200',
            'border-green-400', 'dark:border-green-600', 'bg-green-50', 'dark:bg-green-900/80', 'text-green-800', 'dark:text-green-200',
            'border-yellow-400', 'dark:border-yellow-600', 'bg-yellow-50', 'dark:bg-yellow-900/80', 'text-yellow-800', 'dark:text-yellow-200',
            'border-red-400', 'dark:border-red-600', 'bg-red-50', 'dark:bg-red-900/80', 'text-red-800', 'dark:text-red-200'
        );

        let iconClass = 'fas fa-info-circle';
        let borderClass = 'border-blue-300 dark:border-blue-700';
        let bgClass = 'bg-blue-100 dark:bg-blue-900/80';
        let textClass = 'text-blue-800 dark:text-blue-200';

        switch (type) {
            case 'success': iconClass = 'fas fa-check-circle'; borderClass = 'border-green-400 dark:border-green-600'; bgClass = 'bg-green-50 dark:bg-green-900/80'; textClass = 'text-green-800 dark:text-green-200'; break;
            case 'warning': iconClass = 'fas fa-exclamation-triangle'; borderClass = 'border-yellow-400 dark:border-yellow-600'; bgClass = 'bg-yellow-50 dark:bg-yellow-900/80'; textClass = 'text-yellow-800 dark:text-yellow-200'; break;
            case 'error': iconClass = 'fas fa-times-circle'; borderClass = 'border-red-400 dark:border-red-600'; bgClass = 'bg-red-50 dark:bg-red-900/80'; textClass = 'text-red-800 dark:text-red-200'; break;
        }

        notificationBarEl.classList.add(borderClass, bgClass, textClass);
        const iconEl = notificationBarEl.querySelector('i');
        if (iconEl) iconEl.className = `${iconClass} mr-3 flex-shrink-0 text-lg`;

        notificationBarEl.classList.remove('hidden');

        if (autoHide) {
            notificationTimeout = setTimeout(() => {
                notificationBarEl.classList.add('opacity-0');
                setTimeout(() => {
                    notificationBarEl.classList.add('hidden');
                }, 300);
            }, duration);
        }
    } // End showNotification

    // --- Update Time Display ---
    function updateTime() {
        if (currentTimeEl) {
            try {
                currentTimeEl.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            } catch (e) {
                 currentTimeEl.textContent = '--:--';
                 console.error("Error formatting time:", e);
            }
        }
    } // End updateTime

    // --- Initial Setup ---
    async function initializeDashboard() {
        console.log("Dashboard Init...");
        try {
            if(mapElement) mapElement.textContent = 'Loading Routing Map...';
            if(tempMapEl) tempMapEl.textContent = 'Loading Temperature Map...';
            if(precipMapEl) precipMapEl.textContent = 'Loading Precipitation Map...';

            initializeCharts();
            initializeRoutingMap();
            initializeWeatherMaps();

            const cityText = `(${currentCity.name})`;
            if (currentCityDisplayOverview) currentCityDisplayOverview.textContent = cityText;

            updateTime();
            timeUpdateIntervalId = setInterval(updateTime, 30000);

            await fetchAllCityData(false); // Initial data fetch

            console.log("Dashboard Setup Complete.");
          
        } catch (e) {
           
        }
    } // End initializeDashboard

    initializeDashboard(); // Start the application

}); // End DOMContentLoaded listener