document.addEventListener('DOMContentLoaded', () => {
    // --- START: API Key Configuration ---
    // !!! IMPORTANT: Replace 'YOUR_API_KEY_HERE' with your actual OpenWeatherMap API key.
    // !!! Get one for free at https://openweathermap.org/appid

    const OPENWEATHER_API_KEY = 'b76b90a74a663c1c32df578f3d993b72'; // <--- PUT YOUR REAL KEY HERE!
    // --- END: API Key Configuration ---

    console.log("CityLytics Dashboard Initializing...");

    // --- State Variables ---
    let pollutionChart, energyDistrictChart, aqiGaugeChart, powerSourceChart;
    let pollutionData = { labels: [], pm25: [], co: [] };
    const MAX_DATA_POINTS = 30; // Increased max points slightly
    let map = null;
    let routingControl = null;
    let userStartCoords = null;
    let userLocationMarker = null;
    // Default city if geolocation fails or on first load
// Default city if geolocation fails or on first load
    let currentCity = { name: 'Chennai', searchName: 'Chennai, IN', coords: [13.0827, 80.2707] };
    let currentWeatherData = null; // Store the combined weather/AQI data
    let dataUpdateIntervalId = null;
    const DATA_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
    let isFetchingData = false; // Flag to prevent concurrent fetches

    // --- DOM Element References ---
    const totalVehiclesEl = document.getElementById('total-vehicles');
    const vehiclesComparisonEl = document.getElementById('vehicles-comparison');
    const currentAqiEl = document.getElementById('current-aqi');
    const aqiStatusEl = document.getElementById('aqi-status');
    const energyTodayEl = document.getElementById('energy-today');
    const energyComparisonEl = document.getElementById('energy-comparison');
    const aqiGaugeValueEl = document.getElementById('aqiGaugeValue');
    const weatherIconEl = document.getElementById('weather-icon');
    const weatherTextEl = document.getElementById('weather-text');
    const weatherDescEl = document.getElementById('weather-desc');
    const notificationBarEl = document.getElementById('notification-bar');
    const notificationMessageEl = document.getElementById('notification-message');
    const chartContainers = document.querySelectorAll('.chart-container');
    const themeToggleButton = document.getElementById('theme-toggle');
    const themeIconSun = document.getElementById('theme-icon-sun');
    const themeIconMoon = document.getElementById('theme-icon-moon');
    const cityInput = document.getElementById('city-input');
    const updateCityBtn = document.getElementById('update-city-btn');
    const currentCityDisplayEl = document.getElementById('current-city-display');
    const startLocationInput = document.getElementById('start-location');
    const destinationLocationInput = document.getElementById('destination-location');
    const useLocationBtn = document.getElementById('use-location-btn');
    const findRouteBtn = document.getElementById('find-route-btn');
    const mapElement = document.getElementById('map');
    const routeResultsEl = document.getElementById('route-results');
    const routeSummaryEl = document.getElementById('route-summary');
    const routeAqiEl = document.getElementById('route-aqi');
    const routeErrorEl = document.getElementById('route-error');

    // --- Check Essential Elements ---
    if (!mapElement) console.error("CRITICAL: Map container element (#map) not found!");
    if (!themeToggleButton) console.error("CRITICAL: Theme toggle button (#theme-toggle) not found!");
    // Add checks for other critical elements if needed

    // --- API Key Check ---
    if (OPENWEATHER_API_KEY === 'YOUR_API_KEY_HERE' || !OPENWEATHER_API_KEY) {
        const msg = "OpenWeatherMap API Key is missing or invalid. Real-time weather and AQI data will not load. Please add your key to script.js.";
        console.error("CRITICAL: " + msg);
        showNotification(msg, "error", false); // Show persistent notification
    }

    // --- Theme Handling ---
    const applyTheme = (isDark) => {
        try {
            const action = isDark ? 'add' : 'remove';
            document.documentElement.classList[action]('dark');
            if (themeIconSun) themeIconSun.classList.toggle('hidden', isDark);
            if (themeIconMoon) themeIconMoon.classList.toggle('hidden', !isDark);
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            console.log("Theme applied:", isDark ? "Dark" : "Light");

            // Update components sensitive to theme changes
            if (map) {
                // Delay map invalidation slightly to allow DOM updates
                setTimeout(() => {
                    try {
                        console.log("Invalidating map size for theme change...");
                        map.invalidateSize();
                    } catch (e) {
                        console.warn("Map invalidation error after theme change:", e);
                    }
                }, 150);
            }
             updateChartThemes(isDark); // Update chart colors etc.

        } catch (e) {
            console.error("Error applying theme:", e);
        }
    };

    // Initial theme application
    try {
        const storedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        // Use stored theme if available, otherwise system preference
        const initialThemeDark = storedTheme ? (storedTheme === 'dark') : prefersDark;
        console.log(`Initial theme check: Stored='${storedTheme}', PrefersDark=${prefersDark}, ApplyingDark=${initialThemeDark}`);
        applyTheme(initialThemeDark);
    } catch (e) {
        console.error("Error applying initial theme:", e);
        applyTheme(false); // Default to light theme on error
    }

    // Theme toggle button listener
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', () => {
            console.log("Theme toggle clicked");
            try {
                const isCurrentlyDark = document.documentElement.classList.contains('dark');
                applyTheme(!isCurrentlyDark);
            } catch (e) {
                console.error("Error processing theme toggle click:", e);
            }
        });
    } else {
        console.warn("Theme toggle button not found, cannot attach listener.");
    }

    // --- Initialize Leaflet Map ---
    function initializeMap() {
        if (map) {
             console.log("Map already initialized.");
             // Ensure view is correct even if re-initializing logic is called
             updateMapView();
             return;
        }
        if (!mapElement) {
            console.error("Cannot initialize map: Map container element (#map) not found!");
            showNotification("Error: Map container not found. Map functionality disabled.", "error", false);
            return;
        }
        console.log("Attempting to initialize Leaflet map...");
        try {
            map = L.map(mapElement, {
                zoomControl: true // Ensure zoom control is enabled
            }).setView(currentCity.coords, 11); // Start with default/current city view

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            }).addTo(map);

             // Initialize routing control but don't add it to the map yet
             routingControl = L.Routing.control({
                waypoints: [], // Start with no waypoints
                routeWhileDragging: true,
                showAlternatives: true,
                 geocoder: null, // Disable default geocoder - we use our own inputs
                 // Use custom icons potentially, or default
                 createMarker: function(i, wp) {
                    // Use default markers for start/end, but maybe hide if using userLocationMarker
                     if (i === 0 && userStartCoords && wp.latLng && wp.latLng.equals(L.latLng(userStartCoords))) {
                         // Optionally hide the default start marker if it overlaps the user location marker
                         // return L.marker(wp.latLng, { opacity: 0, interactive: false });
                     }
                    return L.marker(wp.latLng);
                }
             });
             // Add event listeners AFTER initialization
            routingControl.on('routesfound', function(e) {
                try {
                    const routes = e.routes;
                    console.log('Routes found:', routes);
                    if (routes.length > 0) {
                        const summary = routes[0].summary; // Take the first route's summary
                        const estimated = estimateRouteConditions(summary);
                        if (routeSummaryEl) routeSummaryEl.textContent = `Distance: ${(summary.totalDistance / 1000).toFixed(1)} km, Time: ${formatTime(summary.totalTime)}`;
                        if (routeAqiEl) routeAqiEl.textContent = `Est. Avg AQI along route: ${estimated.aqi} (${getAqiDescription(estimated.aqi)})`;
                        if (routeErrorEl) routeErrorEl.textContent = ''; // Clear previous errors
                        if (routeResultsEl) routeResultsEl.classList.remove('hidden');
                    } else {
                        handleRouteError("No routes found between the specified locations.");
                    }
                } catch (err) {
                    console.error("Error processing found routes:", err);
                    handleRouteError("Error processing route data.");
                } finally {
                    if (findRouteBtn) findRouteBtn.disabled = false;
                    if (findRouteBtn) findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route & Estimate';
                }
            });
            routingControl.on('routingerror', function(e) {
                console.error('Routing Error:', e);
                handleRouteError(e.error?.message || "Could not find a route. Check addresses or connectivity.");
                if (findRouteBtn) findRouteBtn.disabled = false;
                if (findRouteBtn) findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route & Estimate';
            });

            map.whenReady(() => {
                console.log("Leaflet Map Ready for:", currentCity.name);
                 // Add routing control to map only AFTER it's ready if needed immediately (or wait for button click)
                 // routingControl.addTo(map); // Example if you wanted it visible initially
                 // L.control.scale().addTo(map); // Optional: Add scale control
            });

            map.on('load', () => console.log("Map layers fully loaded."));

        } catch (error) {
            console.error("CRITICAL Error initializing Leaflet Map:", error);
            showNotification("Error initializing map. Map features may be unavailable.", "error", false);
            map = null; // Ensure map state is clean if init fails
            if(mapElement) mapElement.innerHTML = '<p class="text-red-500 p-4">Map failed to load. Please refresh or check console.</p>';
        }
    }

    // --- Update Map View ---
    function updateMapView() {
        if (map && currentCity && currentCity.coords) {
            try {
                console.log(`Updating map view to ${currentCity.name} [${currentCity.coords}]`);
                map.setView(currentCity.coords, 11); // Zoom level 11 for city overview
            } catch (e) {
                console.error("Error updating map view:", e);
            }
        } else if (!map) {
            console.warn("Cannot update map view: Map not initialized. Attempting re-initialization.");
            // Don't auto-reinitialize here, let initialization handle it.
        } else {
            console.warn("Cannot update map view: Invalid city data.");
        }
    }

    // --- Geolocation Handling ---
    if (useLocationBtn) {
        useLocationBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                showNotification("Geolocation is not supported by your browser.", "warning");
                return;
            }
            console.log("Requesting user location...");
            showNotification("Getting your location...", "info");
            // Visual feedback
            if (useLocationBtn) useLocationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            if (useLocationBtn) useLocationBtn.disabled = true;

            navigator.geolocation.getCurrentPosition(handleGeolocationSuccess, handleGeolocationError, {
                enableHighAccuracy: false, // More battery friendly
                timeout: 10000, // 10 seconds timeout
                maximumAge: 60000 // Allow cached position up to 1 minute old
            });
        });
    } else {
        console.warn("Use location button (#use-location-btn) not found.");
    }

    async function handleGeolocationSuccess(position) {
        try {
            userStartCoords = [position.coords.latitude, position.coords.longitude];
            console.log("Geolocation successful:", userStartCoords);
            showNotification("Location found!", "success");

            // Add or update a marker on the map
            if (map) {
                removeUserMarker(); // Remove previous marker if exists
                 const userIcon = L.divIcon({
                    className: 'user-location-icon', // Use CSS class for styling
                    html: '<i class="fas fa-map-pin"></i>',
                    iconSize: [24, 24],
                    iconAnchor: [12, 24] // Point of the icon which corresponds to marker's location
                });
                userLocationMarker = L.marker(userStartCoords, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
                map.setView(userStartCoords, 13); // Zoom closer to user location
            }

            // Attempt to reverse geocode to get an address for the input field
            const addressData = await reverseGeocode(userStartCoords[0], userStartCoords[1]);
            if (startLocationInput) {
                startLocationInput.value = addressData?.display_name || `Lat: ${userStartCoords[0].toFixed(4)}, Lon: ${userStartCoords[1].toFixed(4)}`;
            }
        } catch (e) {
            console.error("Error processing geolocation success:", e);
            if (startLocationInput) startLocationInput.value = `Lat: ${userStartCoords[0].toFixed(4)}, Lon: ${userStartCoords[1].toFixed(4)}`;
            showNotification("Location found, but error processing details.", "warning");
        } finally {
             if (useLocationBtn) useLocationBtn.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
             if (useLocationBtn) useLocationBtn.disabled = false;
        }
    }

    function handleGeolocationError(error) {
        console.error("Geolocation error:", error);
        let message = "Could not get your location.";
        switch (error.code) {
            case error.PERMISSION_DENIED: message = "Geolocation permission denied."; break;
            case error.POSITION_UNAVAILABLE: message = "Location information is unavailable."; break;
            case error.TIMEOUT: message = "Geolocation request timed out."; break;
        }
        showNotification(message, "error");
        userStartCoords = null; // Reset coords
        if (startLocationInput) startLocationInput.placeholder = "Enter address or use current location"; // Reset placeholder
         if (useLocationBtn) useLocationBtn.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
         if (useLocationBtn) useLocationBtn.disabled = false;
    }

    function removeUserMarker() {
        try {
            if (userLocationMarker && map) {
                map.removeLayer(userLocationMarker);
                userLocationMarker = null;
                console.log("Removed user location marker.");
            }
        } catch (e) {
            console.error("Error removing user marker:", e);
        }
    }

    // --- Geocoding (Nominatim - OpenStreetMap) ---
    const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

    async function geocodeAddress(address, isCityLookup = false) {
        if (!address) return null;
        const params = new URLSearchParams({
            q: address,
            format: 'json',
            limit: 1, // Get only the top result
            addressdetails: 1 // Get details like city, country etc.
        });
         // For city lookup, add feature type filter if desired (e.g., city, town)
         // params.append('featuretype', 'city'); // Might be too restrictive

        const url = `${NOMINATIM_BASE_URL}/search?${params.toString()}`;
        console.log(`Geocoding address: ${address} via URL: ${url}`);

        try {
            const response = await fetch(url, {
                 headers: { 'User-Agent': 'CityLyticsDashboard/1.0 (https://example.com; your-email@example.com)' } // Replace with your info if deploying
            });
            if (!response.ok) {
                console.error(`Nominatim geocoding failed: ${response.status} ${response.statusText}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data && data.length > 0) {
                const result = data[0];
                console.log("Geocoding result:", result);
                 // Extract a sensible display name and coordinates
                 let name = result.display_name;
                 let searchName = name; // Default search name
                 if (isCityLookup && result.address) {
                     // Construct a cleaner name for city display
                     name = result.address.city || result.address.town || result.address.village || result.address.state || result.name || address;
                     searchName = `${name}, ${result.address.country_code?.toUpperCase() || ''}`; // Use for API searches
                 }
                return {
                    name: name,
                    searchName: searchName,
                    display_name: result.display_name,
                    coords: [parseFloat(result.lat), parseFloat(result.lon)]
                };
            } else {
                console.warn(`No geocoding results found for: ${address}`);
                return null;
            }
        } catch (error) {
            console.error(`Error geocoding address "${address}":`, error);
            showNotification(`Could not find location for "${address}".`, "warning");
            return null;
        }
    }

    async function reverseGeocode(lat, lon) {
        const params = new URLSearchParams({
            lat: lat.toFixed(6), // Precision
            lon: lon.toFixed(6),
            format: 'json',
            addressdetails: 1
        });
        const url = `${NOMINATIM_BASE_URL}/reverse?${params.toString()}`;
        console.log(`Reverse geocoding coords: ${lat},${lon} via URL: ${url}`);

        try {
            const response = await fetch(url, {
                 headers: { 'User-Agent': 'CityLyticsDashboard/1.0 (https://example.com; your-email@example.com)' }
            });
            if (!response.ok) {
                console.error(`Nominatim reverse geocoding failed: ${response.status} ${response.statusText}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log("Reverse geocoding result:", data);
            return data; // Return the full data object (contains display_name, address object etc.)
        } catch (error) {
            console.error(`Error reverse geocoding coordinates (${lat}, ${lon}):`, error);
            showNotification("Could not determine address for current location.", "warning");
            return null;
        }
    }


    // --- City Change Handling ---
    async function handleCityUpdate() {
       if (!cityInput || !updateCityBtn) return console.error("City input/button not found for update");

    const cityName = cityInput.value.trim();
    if (!cityName) {
        showNotification("Please enter a city name.", "warning");
        return;
    }

    console.log(`Attempting to update city to: ${cityName}`);
    // THIS is the line that should show the notification for city search:
    showNotification(`Looking up city: ${cityName}...`, 'info');
    updateCityBtn.disabled = true;
    const originalIcon = updateCityBtn.innerHTML;
    updateCityBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            const geocodedCity = await geocodeAddress(cityName, true); // true for city lookup

            if (geocodedCity && geocodedCity.coords) {
                currentCity = {
                    name: geocodedCity.name,
                    searchName: geocodedCity.searchName || geocodedCity.name, // Fallback for search
                    coords: geocodedCity.coords
                };
                console.log("City updated successfully:", currentCity);
                cityInput.value = ''; // Clear input after successful update
                cityInput.placeholder = `Current: ${currentCity.name}`;
                if (currentCityDisplayEl) currentCityDisplayEl.textContent = `(${currentCity.name})`;

                updateMapView(); // Move map to new city

                // Clear previous route/results as they are no longer relevant
                if (routingControl && map) {
                    try {
                        routingControl.setWaypoints([]); // Clear waypoints
                        if (map.hasLayer(routingControl)) { // Check if control is on map before removing
                            map.removeControl(routingControl);
                        }
                    } catch (e) {
                         console.warn("Minor issue clearing routing control:", e);
                    }
                }
                if(routeResultsEl) routeResultsEl.classList.add('hidden'); // Hide results panel
                removeUserMarker(); // Remove user marker if switching city

                // Fetch data for the new city and reset interval
                await fetchAllCityData(true); // Pass true to indicate manual update, prevents auto-schedule clash

            } else {
                showNotification(`Could not find city: "${cityName}". Please try a different name or format (e.g., "City, Country").`, "error");
            }
        } catch (e) {
            console.error("Error during city update process:", e);
            showNotification(`Error updating city to "${cityName}". See console for details.`, "error");
        } finally {
            if (updateCityBtn) {
                 updateCityBtn.disabled = false;
                 updateCityBtn.innerHTML = originalIcon;
            }
        }
    }

    if (updateCityBtn) updateCityBtn.addEventListener('click', handleCityUpdate);
    if (cityInput) cityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent potential form submission
            handleCityUpdate();
        }
    });


    // --- API Data Fetching (OpenWeatherMap) ---
    async function fetchOpenWeatherData(lat, lon) {
        if (OPENWEATHER_API_KEY === 'YOUR_API_KEY_HERE' || !OPENWEATHER_API_KEY) {
            console.error("API Key Check inside fetch: Key is missing or placeholder. Cannot fetch OWM data.");
            // Return null for both parts if key is missing
            return { aqiData: null, weatherData: null };
        }

        const airPollutionUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`; // Use metric units

        let combinedData = { aqiData: null, weatherData: null };

        // Use Promise.allSettled to ensure both requests complete, even if one fails
        console.log(`Fetching OWM data for Lat: ${lat}, Lon: ${lon}`);
        try {
             const results = await Promise.allSettled([
                fetch(airPollutionUrl).then(async response => {
                    console.log(`Air Pollution Response Status: ${response.status} ${response.statusText}`);
                    if (!response.ok) throw new Error(`AQI fetch failed: ${response.status} ${response.statusText}`);
                    return await response.json();
                }),
                fetch(weatherUrl).then(async response => {
                    console.log(`Weather Response Status: ${response.status} ${response.statusText}`);
                    if (!response.ok) throw new Error(`Weather fetch failed: ${response.status} ${response.statusText}`);
                    return await response.json();
                })
            ]);

             // Process Air Pollution Response
             const airResult = results[0];
             if (airResult.status === 'fulfilled' && airResult.value?.list?.[0]) {
                const airData = airResult.value.list[0];
                combinedData.aqiData = {
                    aqi: airData.main?.aqi, // OWM AQI Scale 1-5
                    components: airData.components // Contains pm2_5, co, no, no2, o3, so2
                };
                console.log("Successfully fetched Air Pollution Data:", combinedData.aqiData);
             } else {
                console.error("Failed to fetch or parse Air Pollution data:", airResult.reason || "No data found");
                if(airResult.reason) showNotification("Could not fetch Air Quality data. Check API key or network.", "warning", true, 5000);
             }

             // Process Weather Response
             const weatherResult = results[1];
              if (weatherResult.status === 'fulfilled' && weatherResult.value?.weather?.[0]) {
                 const weatherData = weatherResult.value;
                 combinedData.weatherData = {
                    temp: weatherData.main?.temp,
                    feels_like: weatherData.main?.feels_like,
                    description: weatherData.weather[0]?.description,
                    icon: weatherData.weather[0]?.icon, // Icon code (e.g., '01d')
                    humidity: weatherData.main?.humidity,
                    wind_speed: weatherData.wind?.speed,
                    city_name: weatherData.name // City name returned by API (can differ from input)
                 };
                 console.log("Successfully fetched Weather Data:", combinedData.weatherData);
             } else {
                console.error("Failed to fetch or parse Weather data:", weatherResult.reason || "No data found");
                 if(weatherResult.reason) showNotification("Could not fetch Weather data. Check API key or network.", "warning", true, 5000);
             }

            // Check if any data was received at all
            if (!combinedData.aqiData && !combinedData.weatherData) {
                console.error("Total failure fetching OpenWeatherMap data.");
                // Persistent notification already shown if API key missing, otherwise temporary one from individual fetches.
            }

            return combinedData;

        } catch (error) {
            // This catch might handle errors outside the Promise.allSettled structure, like network issues before fetch starts
            console.error('Critical error during fetchOpenWeatherData execution:', error);
            showNotification("Network error fetching weather/AQI data. Please check connection.", "error");
            return { aqiData: null, weatherData: null }; // Return empty structure on critical failure
        }
    }


    // --- Main Data Orchestration ---
    async function fetchAllCityData(isManualUpdate = false) {
        if (isFetchingData) {
            console.warn("Data fetch already in progress. Skipping this request.");
            return;
        }
        isFetchingData = true;
        console.log(`Fetching all data for ${currentCity.name} at ${new Date().toLocaleTimeString()}`);

        let combinedDataForUI = null; // Initialize as null

        try {
            // 1. Fetch Real Data (Weather & AQI)
            const owmData = await fetchOpenWeatherData(currentCity.coords[0], currentCity.coords[1]);
            currentWeatherData = owmData; // Store for potential later use (e.g., route estimation)

            // 2. Generate Simulated Data
            const simulatedData = generateSimulatedParts(owmData); // Pass real data in case simulation depends on it (optional)

            // 3. Combine Real and Simulated Data for UI Update
            // Use optional chaining (?.) and nullish coalescing (??) extensively
            combinedDataForUI = {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), // Simpler time format
                aqi: owmData?.aqiData?.aqi ? convertAqiScale(owmData.aqiData.aqi) : null, // Convert OWM 1-5 to US AQI ~0-300+
                pm25: owmData?.aqiData?.components?.pm2_5 ?? null,
                co: owmData?.aqiData?.components?.co ?? null,
                weather_description: owmData?.weatherData?.description ?? null,
                weather_icon: owmData?.weatherData?.icon ?? null, // e.g., '01d'
                temp: owmData?.weatherData?.temp ?? null,
                // Simulated parts
                energy_today_kwh: simulatedData.energy_today_kwh,
                total_vehicles: simulatedData.total_vehicles,
                renewable_power_percent: simulatedData.renewable_power_percent,
                energy_by_district: simulatedData.energy_by_district,
                comparison: simulatedData.comparison
            };
            console.log("Successfully combined real and simulated data for UI:", combinedDataForUI);

        } catch (e) {
            console.error("Error during main data fetching/processing (fetchAllCityData):", e);
            showNotification(`Error fetching latest data for ${currentCity.name}. Check console.`, "error");
            // combinedDataForUI remains null in case of critical error here
        } finally {
            // 4. Update the UI (always attempt, even if data is null)
            updateDashboardUI(combinedDataForUI);

            // 5. Schedule next update ONLY if not a manual trigger and no error occurred during setup
            // Clear previous timer regardless
            clearTimeout(dataUpdateIntervalId);
            if (!isManualUpdate) { // Don't reschedule if triggered by city change button
                 dataUpdateIntervalId = setTimeout(() => fetchAllCityData(false), DATA_REFRESH_INTERVAL); // Pass false for subsequent auto-fetches
                console.log(`Next automatic data refresh scheduled in ${DATA_REFRESH_INTERVAL / 60000} minutes.`);
            } else {
                 console.log("Manual update complete. Automatic refresh timer reset.");
                 // Reset the main interval after a manual update completes, so it continues automatically
                  dataUpdateIntervalId = setTimeout(() => fetchAllCityData(false), DATA_REFRESH_INTERVAL);
                 console.log(`Automatic refresh will resume in ${DATA_REFRESH_INTERVAL / 60000} minutes.`);
            }
            isFetchingData = false; // Allow next fetch
        }
    }

    // --- Generate Simulated Data Parts ---
    function generateSimulatedParts(realData) {
        // Example: Simulation could potentially use real weather (e.g., higher energy use if very hot/cold)
        // For now, it's independent random data.

        const baseEnergy = 5000; // Base kWh
        const baseVehicles = 12000; // Base vehicle count

        // Simple random variation
        const energy_kwh = Math.floor(baseEnergy + (Math.random() - 0.5) * 4000); // +/- 2000 from base
        const vehicles = Math.floor(baseVehicles + (Math.random() - 0.5) * 8000); // +/- 4000 from base

        const renewable_power = Math.random() * (85 - 35) + 35; // % renewable between 35% and 85%
        const vehicleChange = (Math.random() * 12 - 5).toFixed(0); // % change vs yesterday (-5% to +7%)
        const energyChange = (Math.random() * 10 - 6).toFixed(0); // % change vs yesterday (-6% to +4%)

        // Simulated energy use by district (make total roughly match energy_kwh for consistency)
        const districts = {
            'Downtown': Math.random(),
            'Industrial': Math.random() * 1.5, // Typically higher use
            'Residential N': Math.random() * 0.8,
            'Residential S': Math.random() * 0.7,
            'Commercial': Math.random() * 1.1,
            'Suburban': Math.random() * 0.5
        };
        const totalRatio = Object.values(districts).reduce((sum, val) => sum + val, 0);
        const scaledDistricts = {};
        for (const [key, value] of Object.entries(districts)) {
            scaledDistricts[key] = Math.floor((value / totalRatio) * energy_kwh);
        }

        return {
            energy_today_kwh: Math.max(500, energy_kwh), // Ensure non-negative
            total_vehicles: Math.max(1000, vehicles), // Ensure non-negative
            renewable_power_percent: parseFloat(renewable_power.toFixed(1)),
            energy_by_district: scaledDistricts,
            comparison: {
                vehicleChange: parseInt(vehicleChange),
                energyChange: parseInt(energyChange)
            }
        };
    }

    // --- Helpers ---

    // Convert OWM AQI (1-5) to an approximate US AQI scale (0-500)
    // This is a ROUGH estimation. Real conversion depends on pollutant concentrations.
    function convertAqiScale(owmAqi) {
        if (owmAqi === null || owmAqi === undefined) return null;
        switch (owmAqi) {
            case 1: return Math.round(Math.random() * 50); // Good (0-50)
            case 2: return Math.round(51 + Math.random() * 49); // Moderate (51-100)
            case 3: return Math.round(101 + Math.random() * 49); // Unhealthy for Sensitive Groups (101-150)
            case 4: return Math.round(151 + Math.random() * 49); // Unhealthy (151-200)
            case 5: return Math.round(201 + Math.random() * 100); // Very Unhealthy (201-300), can extend higher
            default: return null; // Unknown
        }
    }

    function getAqiDescription(aqiValue) {
        if (aqiValue === null || aqiValue === undefined) return "N/A";
        if (aqiValue <= 50) return "Good";
        if (aqiValue <= 100) return "Moderate";
        if (aqiValue <= 150) return "Unhealthy for Sensitive Groups";
        if (aqiValue <= 200) return "Unhealthy";
        if (aqiValue <= 300) return "Very Unhealthy";
        return "Hazardous";
    }

    // Gets Tailwind COLOR classes or hex codes for AQI
    function getAqiColor(aqiValue, isDark, returnClass = false) {
        // Define colors using hex for Chart.js, Tailwind classes for text/UI
        const colors = {
            good: { light: '#22c55e', dark: '#4ade80', classLight: 'text-green-600', classDark: 'text-green-400' }, // green-600, green-400
            moderate: { light: '#eab308', dark: '#facc15', classLight: 'text-yellow-600', classDark: 'text-yellow-400' }, // yellow-600, yellow-400
            usg: { light: '#f97316', dark: '#fb923c', classLight: 'text-orange-600', classDark: 'text-orange-400' }, // orange-600, orange-400
            unhealthy: { light: '#ef4444', dark: '#f87171', classLight: 'text-red-500', classDark: 'text-red-400' }, // red-500, red-400
            very_unhealthy: { light: '#a855f7', dark: '#c084fc', classLight: 'text-purple-600', classDark: 'text-purple-400' }, // purple-600, purple-400
            hazardous: { light: '#7e22ce', dark: '#a78bfa', classLight: 'text-purple-800', classDark: 'text-purple-300' }, // purple-800, purple-300
            default: { light: '#6b7280', dark: '#9ca3af', classLight: 'text-gray-500', classDark: 'text-gray-400' } // gray-500, gray-400
        };

        let level = 'default';
        if (aqiValue !== null && aqiValue !== undefined) {
            if (aqiValue <= 50) level = 'good';
            else if (aqiValue <= 100) level = 'moderate';
            else if (aqiValue <= 150) level = 'usg';
            else if (aqiValue <= 200) level = 'unhealthy';
            else if (aqiValue <= 300) level = 'very_unhealthy';
            else level = 'hazardous';
        }

        const themeKey = isDark ? 'dark' : 'light';
        const classThemeKey = isDark ? 'classDark' : 'classLight';

        return returnClass ? colors[level][classThemeKey] : colors[level][themeKey];
    }

    // Map OWM icon codes to Font Awesome icons
    function getWeatherIconClass(iconCode) {
        if (!iconCode) return 'fas fa-question-circle'; // Default if no code
        const iconMap = {
            '01d': 'fas fa-sun', '01n': 'fas fa-moon', // Clear sky
            '02d': 'fas fa-cloud-sun', '02n': 'fas fa-cloud-moon', // Few clouds
            '03d': 'fas fa-cloud', '03n': 'fas fa-cloud', // Scattered clouds
            '04d': 'fas fa-cloud', '04n': 'fas fa-cloud', // Broken clouds (use same as scattered)
            '09d': 'fas fa-cloud-showers-heavy', '09n': 'fas fa-cloud-showers-heavy', // Shower rain
            '10d': 'fas fa-cloud-sun-rain', '10n': 'fas fa-cloud-moon-rain', // Rain
            '11d': 'fas fa-bolt', '11n': 'fas fa-bolt', // Thunderstorm
            '13d': 'fas fa-snowflake', '13n': 'fas fa-snowflake', // Snow
            '50d': 'fas fa-smog', '50n': 'fas fa-smog', // Mist/fog
        };
        // Base color classes (can be overridden)
        const baseColor = "text-blue-500 dark:text-blue-400"; // Default weather icon color
        const nightColor = "text-indigo-400 dark:text-indigo-300";
        const sunColor = "text-yellow-500 dark:text-yellow-400";

        let faClass = iconMap[iconCode] || 'fas fa-question-circle';
        let colorClass = baseColor;

        // Adjust color based on icon type
        if (iconCode.includes('01d')) colorClass = sunColor; // Sunny
        if (iconCode.includes('01n')) colorClass = nightColor; // Clear night
        if (iconCode.includes('11')) colorClass = "text-yellow-600 dark:text-yellow-500"; // Thunder
        if (iconCode.includes('13')) colorClass = "text-cyan-500 dark:text-cyan-400"; // Snow

        return `${faClass} ${colorClass} mr-2`; // Return combined Font Awesome and color classes
    }


    function capitalizeFirstLetter(string) {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

     // Format time in seconds to HH:MM:SS or MM:SS
     function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "N/A";
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
        } else {
            return `${minutes}m ${secs.toString().padStart(2, '0')}s`;
        }
    }


    // --- Update Dashboard UI Elements ---
    function updateDashboardUI(data) {
        // Ensure critical elements exist before proceeding
        if (!totalVehiclesEl || !energyTodayEl || !currentAqiEl || !aqiGaugeValueEl || !weatherIconEl || !weatherTextEl) {
            console.error("One or more critical UI elements are missing. Cannot update dashboard.");
            return;
        }
        console.log("Attempting to update UI. Data received:", data);

        // Handle case where data fetch failed completely
        if (!data) {
            console.warn("Received null data for UI update. Clearing dashboard fields.");
            totalVehiclesEl.textContent = '--';
            vehiclesComparisonEl.textContent = 'vs yesterday N/A';
            energyTodayEl.textContent = '--';
            energyComparisonEl.textContent = 'vs yesterday N/A';
            currentAqiEl.textContent = '--';
            aqiStatusEl.textContent = 'Status: N/A';
            aqiGaugeValueEl.textContent = '--';
            weatherIconEl.className = 'fas fa-question-circle text-gray-500 mr-2'; // Reset icon
            weatherTextEl.textContent = '--';
            weatherDescEl.textContent = 'City Conditions';
            // Clear charts as well
            clearChartData();
            return; // Exit function after clearing
        }

        // --- Update Stat Cards (using nullish coalescing '??') ---
        totalVehiclesEl.textContent = data.total_vehicles?.toLocaleString() ?? '--';
        energyTodayEl.textContent = `${data.energy_today_kwh?.toLocaleString() ?? '--'} kWh`; // Add units directly
        currentAqiEl.textContent = data.aqi ?? '--';
        aqiGaugeValueEl.textContent = data.aqi ?? '--';

        // Comparison text
        const vChange = data.comparison?.vehicleChange ?? 0;
        vehiclesComparisonEl.textContent = `${vChange >= 0 ? '+' : ''}${vChange}% vs yesterday`;
        vehiclesComparisonEl.className = `text-xs mt-1 ${vChange >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`;

        const eChange = data.comparison?.energyChange ?? 0;
        energyComparisonEl.textContent = `${eChange >= 0 ? '+' : ''}${eChange}% vs yesterday`;
        energyComparisonEl.className = `text-xs mt-1 ${eChange <= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`; // Lower energy is good

        // AQI Status and Color
        const isDark = document.documentElement.classList.contains('dark');
        let aqiDesc = getAqiDescription(data.aqi);
        let aqiColorClass = getAqiColor(data.aqi, isDark, true); // Get Tailwind class

        currentAqiEl.className = `text-3xl font-bold ${aqiColorClass}`; // Apply color class
        aqiStatusEl.textContent = `Status: ${aqiDesc}`;
        aqiStatusEl.className = `text-xs mt-1 ${aqiColorClass}`; // Apply color class

        // Weather/Traffic Proxy Card Update
        weatherIconEl.className = getWeatherIconClass(data.weather_icon); // Update icon and color
        weatherTextEl.textContent = data.temp !== null ? `${data.temp.toFixed(0)}°C` : '--';
        weatherDescEl.textContent = data.weather_description ? capitalizeFirstLetter(data.weather_description) : 'City Conditions';

        // --- Update Pollution Chart Data ---
        const currentTimeLabel = data.time ?? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const currentPm25 = data.pm25 ?? null;
        const currentCo = data.co ?? null; // OWM provides CO in μg/m³. Convert to ppm? (approx divide by 1150 for typical conditions) - Keep as μg/m³ for simplicity now.

        // Only add data if we have at least one valid pollutant value for this timestamp
        if (currentPm25 !== null || currentCo !== null) {
            pollutionData.labels.push(currentTimeLabel);
            pollutionData.pm25.push(currentPm25); // Store raw value or null
            pollutionData.co.push(currentCo);     // Store raw value or null

            // Limit data points
            if (pollutionData.labels.length > MAX_DATA_POINTS) {
                pollutionData.labels.shift();
                pollutionData.pm25.shift();
                pollutionData.co.shift();
            }
            console.log("Updated pollution data arrays:", pollutionData);
        } else {
             console.log("No valid PM2.5 or CO data to add to pollution chart for this update.");
        }

        // --- Update all charts with new data ---
        updateCharts(data);

        // Trigger fade-in animation for charts now that they *should* have data
        chartContainers.forEach(container => container.classList.add('loaded'));

        console.log("UI update process completed.");
    }

    // --- Initialize Charts ---
    function initializeCharts() {
         console.log("Initializing charts...");
         const ctxPollution = document.getElementById('pollutionChart')?.getContext('2d');
         const ctxEnergy = document.getElementById('energyDistrictChart')?.getContext('2d');
         const ctxAqiGauge = document.getElementById('aqiGaugeChart')?.getContext('2d');
         const ctxPowerSource = document.getElementById('powerSourceChart')?.getContext('2d');
         const isDark = document.documentElement.classList.contains('dark');
         const commonOptions = getCommonChartOptions(isDark);

         try {
             // Pollution Chart (Line)
            if (ctxPollution && !Chart.getChart(ctxPollution.canvas)) {
                 pollutionChart = new Chart(ctxPollution, {
                    type: 'line',
                    data: { labels: [], datasets: [
                        { label: 'PM2.5 (µg/m³)', data: [], borderColor: getAqiColor(170, isDark), // Unhealthy color
                          backgroundColor: hexToRgba(getAqiColor(170, isDark), 0.1), tension: 0.3, yAxisID: 'yPm25', fill: 'start', pointRadius: 2, pointHoverRadius: 5 },
                        { label: 'CO (µg/m³)', data: [], borderColor: getAqiColor(70, isDark), // Moderate color
                          backgroundColor: hexToRgba(getAqiColor(70, isDark), 0.1), tension: 0.3, yAxisID: 'yCo', fill: 'start', pointRadius: 2, pointHoverRadius: 5 }
                    ]},
                    options: { ...commonOptions, scales: getPollutionScales(isDark, commonOptions), interaction: { mode: 'index', intersect: false }, tooltips: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels:{ boxWidth: 12, padding: 15}} } }
                });
                console.log("Pollution chart initialized.");
            }

            // Energy District Chart (Bar)
             if (ctxEnergy && !Chart.getChart(ctxEnergy.canvas)) {
                const districtColors = getDistrictColors(isDark);
                 energyDistrictChart = new Chart(ctxEnergy, {
                    type: 'bar',
                    data: { labels: [], datasets: [{ label: 'Energy Usage (kWh)', data: [], backgroundColor: districtColors.background, borderColor: districtColors.border, borderWidth: 1 }] },
                    options: { ...commonOptions, indexAxis: 'y', scales: { x: { ...commonOptions.scales.x, title: { display: true, text: 'kWh'}}, y: commonOptions.scales.y }, plugins: { legend: { display: false } } }
                });
                console.log("Energy district chart initialized.");
            }

             // AQI Gauge Chart (Doughnut)
             if (ctxAqiGauge && !Chart.getChart(ctxAqiGauge.canvas)) {
                 aqiGaugeChart = new Chart(ctxAqiGauge, {
                    type: 'doughnut',
                    data: {
                        // labels: ['AQI', 'Remaining'], // Labels often hidden for gauges
                        datasets: [{
                            data: [0, 300], // Initial: 0 value, max possible (or typical max like 300)
                            backgroundColor: [getAqiColor(0, isDark), isDark ? '#4b5568' : '#e5e7eb'], // Initial color, background segment color (gray-600/gray-200)
                            borderColor: [isDark ? '#374151' : '#f9fafb'], // Border color for segments (gray-700/gray-50)
                            borderWidth: 1,
                            circumference: 180, // Half circle
                            rotation: 270, // Start at bottom
                        }]
                    },
                     options: {
                         responsive: true,
                         maintainAspectRatio: true, // Adjust based on container
                         aspectRatio: 1.5, // Make it wider than tall if needed
                         cutout: '70%', // Adjust thickness of the gauge
                         plugins: {
                            legend: { display: false },
                            tooltip: { enabled: false }, // Disable tooltips for gauge
                         },
                         animation: { duration: 500 }
                     }
                });
                console.log("AQI gauge chart initialized.");
             }

            // Power Source Chart (Pie/Doughnut)
             if (ctxPowerSource && !Chart.getChart(ctxPowerSource.canvas)) {
                const powerColors = [ '#22c55e', '#facc15', '#f97316', '#6b7280', '#3b82f6']; // Green, Yellow, Orange, Gray, Blue
                const powerColorsDark = ['#4ade80', '#fde047', '#fb923c', '#9ca3af', '#60a5fa'];
                 powerSourceChart = new Chart(ctxPowerSource, {
                    type: 'pie',
                    data: { labels: ['Renewable', 'Fossil Fuel', 'Other'], datasets: [{ label: 'Power Mix (%)', data: [0, 0, 0], backgroundColor: isDark ? powerColorsDark : powerColors, borderWidth: 1, borderColor: isDark ? '#1f2937':'#ffffff'}] },
                     options: { ...commonOptions, responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } } } }
                });
                 console.log("Power source chart initialized.");
             }

         } catch (error) {
             console.error("Error initializing charts:", error);
             showNotification("Error creating charts. Visualization may be incomplete.", "error");
         }
     }

    // --- Clear Chart Data ---
    function clearChartData() {
        console.warn("Clearing chart data...");
         try {
             const isDark = document.documentElement.classList.contains('dark');

             // Pollution Chart
             pollutionData = { labels: [], pm25: [], co: [] }; // Reset source data
             if (pollutionChart && pollutionChart.data) {
                 pollutionChart.data.labels = [];
                 if (pollutionChart.data.datasets[0]) pollutionChart.data.datasets[0].data = [];
                 if (pollutionChart.data.datasets[1]) pollutionChart.data.datasets[1].data = [];
                 pollutionChart.update('none'); // Use 'none' for silent update
                 console.log("Cleared pollution chart.");
             } else { console.warn("Pollution chart instance not available for clearing."); }

             // Energy District Chart
             if (energyDistrictChart && energyDistrictChart.data) {
                 energyDistrictChart.data.labels = [];
                 if (energyDistrictChart.data.datasets[0]) energyDistrictChart.data.datasets[0].data = [];
                 energyDistrictChart.update('none');
                 console.log("Cleared energy chart.");
             } else { console.warn("Energy chart instance not available for clearing."); }

             // AQI Gauge Chart
             if (aqiGaugeChart && aqiGaugeChart.data) {
                 const gaugeBgColor = isDark ? '#4b5568' : '#e5e7eb'; // gray-600 / gray-200
                 const defaultAqiColor = getAqiColor(null, isDark); // Default color for 0 value
                 if (aqiGaugeChart.data.datasets[0]) {
                     aqiGaugeChart.data.datasets[0].data = [0, 300]; // Reset to 0 value, 300 max
                     aqiGaugeChart.data.datasets[0].backgroundColor = [defaultAqiColor, gaugeBgColor];
                 }
                 aqiGaugeChart.update('none');
                 if(aqiGaugeValueEl) aqiGaugeValueEl.textContent='--'; // Reset center text
                 console.log("Cleared AQI gauge.");
             } else { console.warn("AQI Gauge instance not available for clearing."); }

             // Power Source Chart
             if (powerSourceChart && powerSourceChart.data) {
                 if (powerSourceChart.data.datasets[0]) powerSourceChart.data.datasets[0].data = [0, 0, 0]; // Reset data
                 powerSourceChart.update('none');
                 console.log("Cleared power source chart.");
             } else { console.warn("Power Source chart instance not available for clearing."); }

         } catch (e) { console.error("Error during clearChartData execution:", e); }
    }


    // --- Chart Configuration Helpers ---
    function getCommonChartOptions(isDark) {
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDark ? '#e5e7eb' : '#374151'; // gray-200 / gray-700

        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: { color: textColor, maxRotation: 0, autoSkip: true, autoSkipPadding: 15 },
                    grid: { color: gridColor, drawOnChartArea: false } // Hide vertical grid lines usually
                },
                y: {
                    ticks: { color: textColor, padding: 5 },
                    grid: { color: gridColor, borderDash: [2, 3] }, // Dashed horizontal lines
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    labels: { color: textColor, boxWidth: 10, padding: 10 }
                },
                tooltip: {
                     backgroundColor: isDark ? 'rgba(40, 50, 60, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                     titleColor: isDark ? '#f3f4f6' : '#1f2937',
                     bodyColor: isDark ? '#d1d5db' : '#4b5568',
                     borderColor: isDark ? '#6b7280' : '#d1d5db',
                     borderWidth: 1,
                     padding: 10,
                     cornerRadius: 4,
                     displayColors: true, // Show color box next to label in tooltip
                     boxPadding: 4
                 }
            },
            animation: {
                duration: 400 // Faster animation
            }
        };
    }

    function getPollutionScales(isDark, commonOptions) {
         const textColor = isDark ? '#e5e7eb' : '#374151';
         const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        return {
             x: { ...commonOptions.scales.x, title: { display: true, text: 'Time', color: textColor } },
             // Primary Y Axis (PM2.5)
             yPm25: {
                type: 'linear',
                position: 'left',
                beginAtZero: true,
                title: { display: true, text: 'PM2.5 (µg/m³)', color: getAqiColor(170, isDark)},
                ticks: { color: getAqiColor(170, isDark), padding: 5 },
                grid: { color: gridColor, borderDash: [2, 3] },
                 // Suggest max based on typical ranges or data?
                 // suggestedMax: 150 // Example
             },
             // Secondary Y Axis (CO) - Scale might differ significantly
             yCo: {
                 type: 'linear',
                 position: 'right',
                 beginAtZero: true,
                 title: { display: true, text: 'CO (µg/m³)', color: getAqiColor(70, isDark) },
                 ticks: { color: getAqiColor(70, isDark), padding: 5 },
                 grid: { drawOnChartArea: false }, // Don't draw grid lines for secondary axis
                 // suggestedMax: 10000 // CO values can be much higher
             }
         };
    }

    // Base colors for districts - provide more if needed
    const districtBaseColors = [
        { light: '#3b82f6', dark: '#60a5fa' }, // Blue
        { light: '#10b981', dark: '#34d399' }, // Emerald
        { light: '#f59e0b', dark: '#fcd34d' }, // Amber
        { light: '#8b5cf6', dark: '#a78bfa' }, // Violet
        { light: '#ec4899', dark: '#f472b6' }, // Pink
        { light: '#6b7280', dark: '#9ca3af' }  // Gray
    ];

    function getDistrictColors(isDark, opacity = 0.7, count = districtBaseColors.length) {
        const themeKey = isDark ? 'dark' : 'light';
        const backgroundColors = districtBaseColors.slice(0, count).map(c => hexToRgba(c[themeKey], opacity));
        const borderColors = districtBaseColors.slice(0, count).map(c => c[themeKey]);
        return { background: backgroundColors, border: borderColors };
    }

    // Utility to convert hex to rgba
    function hexToRgba(hex, alpha = 1) {
         if (!hex) return `rgba(128, 128, 128, ${alpha})`; // Default gray if hex is invalid
        let r = 0, g = 0, b = 0;
         if (hex.length == 4) { // #rgb format
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length == 7) { // #rrggbb format
            r = parseInt(hex[1] + hex[2], 16);
            g = parseInt(hex[3] + hex[4], 16);
            b = parseInt(hex[5] + hex[6], 16);
         } else {
             console.warn("Invalid hex color format:", hex);
             return `rgba(128, 128, 128, ${alpha})`; // Default gray
         }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }


    // --- Update Charts with New Data ---
    function updateCharts(data) {
        if (!data) {
            console.warn("No data provided to updateCharts. Clearing chart data instead.");
             clearChartData();
            return;
        }
         console.log("Updating charts with data:", data);
         const isDark = document.documentElement.classList.contains('dark');

        try {
            // Pollution Chart
            if (pollutionChart && pollutionChart.data) {
                 // Use the updated pollutionData state variable
                pollutionChart.data.labels = pollutionData.labels;
                 if (pollutionChart.data.datasets[0]) pollutionChart.data.datasets[0].data = pollutionData.pm25;
                 if (pollutionChart.data.datasets[1]) pollutionChart.data.datasets[1].data = pollutionData.co;
                 // Update colors based on current theme (in case theme changed since init)
                 if (pollutionChart.options?.scales) {
                     pollutionChart.options.scales = getPollutionScales(isDark, getCommonChartOptions(isDark));
                     pollutionChart.data.datasets[0].borderColor = getAqiColor(170, isDark);
                     pollutionChart.data.datasets[0].backgroundColor = hexToRgba(getAqiColor(170, isDark), 0.1);
                     pollutionChart.data.datasets[1].borderColor = getAqiColor(70, isDark);
                     pollutionChart.data.datasets[1].backgroundColor = hexToRgba(getAqiColor(70, isDark), 0.1);
                 }
                 pollutionChart.update();
                 console.log("Pollution chart updated.");
            } else { console.warn("Pollution chart instance not ready for update."); }

            // Energy District Chart
            if (energyDistrictChart && energyDistrictChart.data) {
                 const districts = data.energy_by_district ?? {};
                 energyDistrictChart.data.labels = Object.keys(districts);
                 if (energyDistrictChart.data.datasets[0]) {
                     energyDistrictChart.data.datasets[0].data = Object.values(districts);
                     // Update colors based on current theme
                     const districtColors = getDistrictColors(isDark, 0.7, energyDistrictChart.data.labels.length);
                     energyDistrictChart.data.datasets[0].backgroundColor = districtColors.background;
                     energyDistrictChart.data.datasets[0].borderColor = districtColors.border;
                 }
                 energyDistrictChart.update();
                 console.log("Energy district chart updated.");
            } else { console.warn("Energy district chart instance not ready for update."); }

            // AQI Gauge Chart
            if (aqiGaugeChart && aqiGaugeChart.data) {
                 const aqiValue = data.aqi ?? 0; // Default to 0 if null
                 const maxAqi = 300; // Use a fixed max for the gauge background segment
                 const gaugeValue = Math.min(aqiValue, maxAqi); // Cap value at max for display
                 const remainingValue = Math.max(0, maxAqi - gaugeValue);
                 const aqiColor = getAqiColor(aqiValue, isDark); // Color based on actual AQI
                 const gaugeBgColor = isDark ? '#4b5568' : '#e5e7eb'; // gray-600 / gray-200

                 if (aqiGaugeChart.data.datasets[0]) {
                    aqiGaugeChart.data.datasets[0].data = [gaugeValue, remainingValue];
                    aqiGaugeChart.data.datasets[0].backgroundColor = [aqiColor, gaugeBgColor];
                 }
                 aqiGaugeChart.update();
                 console.log("AQI gauge updated.");
            } else { console.warn("AQI Gauge instance not ready for update."); }

             // Power Source Chart
             if (powerSourceChart && powerSourceChart.data) {
                 const renewablePercent = data.renewable_power_percent ?? 0;
                 // Assume remaining is fossil fuel, can be refined if more data available
                 const fossilPercent = Math.max(0, 100 - renewablePercent);
                 const otherPercent = 0; // Placeholder for 'Other'

                 if (powerSourceChart.data.datasets[0]) {
                     powerSourceChart.data.datasets[0].data = [renewablePercent, fossilPercent, otherPercent];
                     // Ensure labels match the data structure
                     powerSourceChart.data.labels = ['Renewable', 'Fossil Fuel', 'Other'];
                     // Update colors
                     const powerColors = [ '#22c55e', '#f97316', '#6b7280']; // Green, Orange, Gray
                     const powerColorsDark = ['#4ade80', '#fb923c', '#9ca3af'];
                     powerSourceChart.data.datasets[0].backgroundColor = isDark ? powerColorsDark : powerColors;
                     powerSourceChart.data.datasets[0].borderColor = isDark ? '#1f2937':'#ffffff';
                 }
                 powerSourceChart.update();
                 console.log("Power source chart updated.");
             } else { console.warn("Power source chart instance not ready for update."); }

        } catch (error) {
             console.error("Error updating charts:", error);
             showNotification("Error updating chart visualizations.", "warning");
        }
    }

    // Update chart themes (colors, grids) when toggling dark/light mode
    function updateChartThemes(isDark) {
         console.log("Updating chart themes for", isDark ? "Dark Mode" : "Light Mode");
         const commonOptions = getCommonChartOptions(isDark);

         const charts = [
            { chart: pollutionChart, type: 'pollution' },
            { chart: energyDistrictChart, type: 'energy' },
            { chart: aqiGaugeChart, type: 'aqi' },
            { chart: powerSourceChart, type: 'power' }
         ];

         charts.forEach(({ chart, type }) => {
            if (chart && chart.options && chart.data) {
                 try {
                     // Update common options (scales, plugins)
                     chart.options.scales = { ...commonOptions.scales }; // Reset basic scales
                     chart.options.plugins = { ...commonOptions.plugins }; // Reset plugins

                     // Type-specific updates
                     if (type === 'pollution') {
                        chart.options.scales = getPollutionScales(isDark, commonOptions); // Re-apply specific scales
                         chart.data.datasets[0].borderColor = getAqiColor(170, isDark);
                         chart.data.datasets[0].backgroundColor = hexToRgba(getAqiColor(170, isDark), 0.1);
                         chart.data.datasets[1].borderColor = getAqiColor(70, isDark);
                         chart.data.datasets[1].backgroundColor = hexToRgba(getAqiColor(70, isDark), 0.1);
                     } else if (type === 'energy') {
                         chart.options.indexAxis = 'y'; // Ensure bar chart axis is correct
                         chart.options.scales.x = { ...commonOptions.scales.x, title: { display: true, text: 'kWh', color: isDark ? '#e5e7eb' : '#374151'} };
                         chart.options.scales.y = { ...commonOptions.scales.y };
                         chart.options.plugins.legend = { display: false };
                         const districtColors = getDistrictColors(isDark, 0.7, chart.data.labels?.length || 0);
                         chart.data.datasets[0].backgroundColor = districtColors.background;
                         chart.data.datasets[0].borderColor = districtColors.border;
                     } else if (type === 'aqi') {
                         const aqiValue = chart.data.datasets[0].data[0] ?? 0; // Get current value
                         const gaugeBgColor = isDark ? '#4b5568' : '#e5e7eb';
                         chart.data.datasets[0].backgroundColor = [getAqiColor(aqiValue, isDark), gaugeBgColor];
                         chart.data.datasets[0].borderColor = isDark ? '#374151' : '#f9fafb';
                         // Options are simpler, mostly covered by common/initial setup
                     } else if (type === 'power') {
                         const powerColors = [ '#22c55e', '#f97316', '#6b7280'];
                         const powerColorsDark = ['#4ade80', '#fb923c', '#9ca3af'];
                         chart.data.datasets[0].backgroundColor = isDark ? powerColorsDark : powerColors;
                         chart.data.datasets[0].borderColor = isDark ? '#1f2937':'#ffffff';
                         chart.options.plugins.legend = { position: 'right', labels: { color: isDark ? '#e5e7eb' : '#374151', boxWidth: 12, padding: 10 } };
                     }

                     chart.update();
                     console.log(`Updated theme for ${type} chart.`);
                 } catch (e) {
                     console.error(`Error updating theme for ${type} chart:`, e);
                 }
            } else {
                // console.warn(`Chart instance for '${type}' not available for theme update.`);
            }
        });
     }


    // --- Routing Logic ---
    if (findRouteBtn) {
        findRouteBtn.addEventListener('click', async () => {
            if (!map || !routingControl) {
                 showNotification("Map or routing service not ready. Please wait or refresh.", "error");
                 console.error("Map or routingControl not initialized for finding route.");
                 return;
            }

            const startValue = startLocationInput.value.trim();
            const destValue = destinationLocationInput.value.trim();

            if (!startValue || !destValue) {
                showNotification("Please enter both start and destination locations.", "warning");
                return;
            }

            console.log(`Finding route from "${startValue}" to "${destValue}"`);
            findRouteBtn.disabled = true;
            findRouteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Finding...';
            routeResultsEl.classList.add('hidden'); // Hide old results
            routeErrorEl.textContent = ''; // Clear old errors

             // Ensure routing control is added to the map if it wasn't already
             if (!map.hasLayer(routingControl)) {
                routingControl.addTo(map);
             }
            // Clear previous waypoints *before* geocoding new ones
             routingControl.setWaypoints([]);

            try {
                let startWaypoint = null;
                let destWaypoint = null;

                // Determine start point: Use geolocated coords if input matches, otherwise geocode
                 if (userStartCoords && startValue.toLowerCase().includes('current location') || (startValue.includes('Lat:') && startValue.includes('Lon:'))) {
                    // Check if input indicates current location OR looks like the lat/lon string we set
                    startWaypoint = L.latLng(userStartCoords);
                    console.log("Using current user location as start point.");
                    // Optionally, recenter map slightly if needed
                     map.panTo(userStartCoords);
                } else {
                     console.log("Geocoding start address:", startValue);
                     const startGeo = await geocodeAddress(startValue);
                     if (startGeo && startGeo.coords) {
                        startWaypoint = L.latLng(startGeo.coords);
                     } else {
                        handleRouteError(`Could not find location for start: "${startValue}"`);
                        return; // Exit if start geocoding fails
                     }
                }

                // Geocode destination
                 console.log("Geocoding destination address:", destValue);
                 const destGeo = await geocodeAddress(destValue);
                 if (destGeo && destGeo.coords) {
                    destWaypoint = L.latLng(destGeo.coords);
                 } else {
                    handleRouteError(`Could not find location for destination: "${destValue}"`);
                    return; // Exit if destination geocoding fails
                 }

                // If both waypoints are valid, set them
                if (startWaypoint && destWaypoint) {
                     console.log("Setting waypoints:", startWaypoint, destWaypoint);
                     routingControl.setWaypoints([startWaypoint, destWaypoint]);
                     // The 'routesfound' or 'routingerror' event will handle the rest
                } else {
                    // This case should theoretically be caught by the returns above
                     handleRouteError("Failed to determine valid start or destination points.");
                }

            } catch (error) {
                console.error("Error during route finding process:", error);
                handleRouteError("An unexpected error occurred while finding the route.");
            } finally {
                 // Button state (enabled/text) is reset within the 'routesfound' and 'routingerror' event handlers
                 // to ensure it happens *after* the async routing completes.
                 // If an error happens *before* setting waypoints (e.g., geocoding fails early), reset here.
                  if (!routingControl.getWaypoints() || routingControl.getWaypoints().length < 2 || !routingControl.getWaypoints()[0] || !routingControl.getWaypoints()[1] ) {
                       if (findRouteBtn) findRouteBtn.disabled = false;
                       if (findRouteBtn) findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route & Estimate';
                   }
            }
        });
    } else {
        console.warn("Find route button (#find-route-btn) not found.");
    }

    function handleRouteError(message) {
        console.error("Route Error:", message);
        if (routeErrorEl) routeErrorEl.textContent = `Error: ${message}`;
        if (routeSummaryEl) routeSummaryEl.textContent = ''; // Clear summary
        if (routeAqiEl) routeAqiEl.textContent = ''; // Clear AQI
        if (routeResultsEl) routeResultsEl.classList.remove('hidden'); // Show panel to display error
        // Ensure button is re-enabled even on error
         if (findRouteBtn) {
            findRouteBtn.disabled = false;
            findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route & Estimate';
         }
    }

    // Estimate conditions along the route (simplified)
    function estimateRouteConditions(summary) {
        // Very basic estimation: use current city-wide AQI as a proxy.
        // A real system would need AQI data along the route path.
        const currentAqiValue = currentWeatherData?.aqiData?.aqi ? convertAqiScale(currentWeatherData.aqiData.aqi) : null;

        // Could add logic based on time of day, distance, current weather etc.
        // e.g., slightly higher AQI during rush hour estimate
        let estimatedAqi = currentAqiValue;
        if (estimatedAqi !== null) {
            // Example modifier: increase slightly if distance is long?
            if (summary.totalDistance > 15000) { // Over 15km
                 estimatedAqi = Math.min(500, Math.round(estimatedAqi * 1.05)); // Increase by 5%, cap at 500
            }
        }

        return {
            aqi: estimatedAqi ?? 'N/A', // Return 'N/A' if base AQI wasn't available
            // Add other estimations here if needed (e.g., traffic level proxy)
        };
    }

    // --- Notifications ---
    let notificationTimeout;
    function showNotification(message, type = 'info', autoHide = true, duration = 4000) {
        if (!notificationBarEl || !notificationMessageEl) {
             console.warn("Notification elements not found. Message:", message);
             // Fallback to alert if elements missing
             // alert(`${type.toUpperCase()}: ${message}`);
             return;
        }
        console.log(`Notification [${type}]: ${message}`);

        // Clear previous timeout if rapidly firing notifications
        clearTimeout(notificationTimeout);

        notificationMessageEl.textContent = message;
        // Reset classes, then apply new ones
        notificationBarEl.className = 'mb-4 p-3 border rounded-lg shadow-md'; // Base classes

        let iconClass = 'fas fa-info-circle'; // Default icon
        let borderClass = 'border-blue-300 dark:border-blue-700';
        let bgClass = 'bg-blue-100 dark:bg-blue-900';
        let textClass = 'text-blue-800 dark:text-blue-200';

        switch (type) {
            case 'success':
                iconClass = 'fas fa-check-circle';
                borderClass = 'border-green-300 dark:border-green-700';
                bgClass = 'bg-green-100 dark:bg-green-900';
                textClass = 'text-green-800 dark:text-green-200';
                break;
            case 'warning':
                iconClass = 'fas fa-exclamation-triangle';
                borderClass = 'border-yellow-300 dark:border-yellow-700';
                bgClass = 'bg-yellow-100 dark:bg-yellow-900';
                textClass = 'text-yellow-800 dark:text-yellow-200';
                break;
            case 'error':
                iconClass = 'fas fa-times-circle';
                borderClass = 'border-red-300 dark:border-red-700';
                bgClass = 'bg-red-100 dark:bg-red-900';
                textClass = 'text-red-800 dark:text-red-200';
                break;
            // Keep 'info' as default blue
        }

        // Apply styling classes
        notificationBarEl.classList.add(borderClass, bgClass, textClass);
        const iconElement = notificationBarEl.querySelector('i');
        if (iconElement) iconElement.className = `${iconClass} mr-2`; // Update icon class

        notificationBarEl.classList.remove('hidden'); // Show the bar

        // Auto-hide logic
        if (autoHide) {
            notificationTimeout = setTimeout(() => {
                notificationBarEl.classList.add('hidden');
            }, duration);
        }
    }

    // --- Initial Setup ---
    async function initializeDashboard() {
        console.log("Running Dashboard Initialization Sequence...");
        try {
            // 1. Initialize Map (must happen before data fetch if fetch needs map)
            initializeMap(); // Sets up map instance

            // 2. Initialize Charts (create empty chart structures)
            initializeCharts();

            // 3. Set initial UI states based on default city
            if (cityInput) cityInput.placeholder = `Current: ${currentCity.name}`;
            if (currentCityDisplayEl) currentCityDisplayEl.textContent = `(${currentCity.name})`;
            else console.warn("Current city display element not found.");

            // 4. Fetch initial data for the default/current city
            // Do not pass 'true' here, allow it to schedule the first automatic refresh
            await fetchAllCityData(false);

            console.log("CityLytics Dashboard Initial Setup Complete.");

        } catch (e) {
            console.error("CRITICAL Error during dashboard initialization:", e);
            showNotification("Dashboard failed to initialize completely. Some features might be broken. Please refresh.", "error", false);
            // Attempt to clear UI elements to indicate failure
            updateDashboardUI(null);
        }
    }

    // --- Start the application ---
    initializeDashboard();

}); // End DOMContentLoaded