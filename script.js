document.addEventListener('DOMContentLoaded', () => {
    console.log("Smart City Dashboard Initializing...");

    // --- State Variables ---
    let pollutionChart, energyDistrictChart, aqiGaugeChart, powerSourceChart;
    let pollutionData = { labels: [], aqi: [], pm25: [], co2: [] };
    const MAX_DATA_POINTS = 20; // Max points for pollution trend chart
    let map;
    let routingControl;
    let userStartCoords = null; // To store [lat, lng] from geolocation
    let userLocationMarker = null; // To store the marker for user's location
    let previousData = {}; // Store previous data for comparison

    // --- DOM Element References ---
    const totalVehiclesEl = document.getElementById('total-vehicles');
    const vehiclesComparisonEl = document.getElementById('vehicles-comparison');
    const currentAqiEl = document.getElementById('current-aqi');
    const aqiStatusEl = document.getElementById('aqi-status');
    const energyTodayEl = document.getElementById('energy-today');
    const energyComparisonEl = document.getElementById('energy-comparison');
    const trafficLightEl = document.getElementById('traffic-light');
    const trafficTextEl = document.getElementById('traffic-text');
    const aqiGaugeValueEl = document.getElementById('aqiGaugeValue');
    const notificationBarEl = document.getElementById('notification-bar');
    const notificationMessageEl = document.getElementById('notification-message');
    const chartContainers = document.querySelectorAll('.chart-container');
    const themeToggleButton = document.getElementById('theme-toggle');
    const themeIconSun = document.getElementById('theme-icon-sun');
    const themeIconMoon = document.getElementById('theme-icon-moon');
    const startLocationInput = document.getElementById('start-location');
    const destinationLocationInput = document.getElementById('destination-location');
    const useLocationBtn = document.getElementById('use-location-btn');
    const findRouteBtn = document.getElementById('find-route-btn');
    const mapElement = document.getElementById('map');
    const routeResultsEl = document.getElementById('route-results');
    const routeSummaryEl = document.getElementById('route-summary');
    const routeAqiEl = document.getElementById('route-aqi');
    const routeTrafficEl = document.getElementById('route-traffic');
    const routeErrorEl = document.getElementById('route-error');

    // --- Theme Handling ---
    const applyTheme = (isDark) => {
        if (isDark) {
            document.documentElement.classList.add('dark');
            themeIconSun.classList.add('hidden');
            themeIconMoon.classList.remove('hidden');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            themeIconSun.classList.remove('hidden');
            themeIconMoon.classList.add('hidden');
            localStorage.setItem('theme', 'light');
        }
        // Update chart themes only if charts are initialized
        if (pollutionChart) {
            updateChartThemes(isDark);
        }
        // Invalidate map size after a short delay to allow CSS transitions
        if (map) {
            setTimeout(() => map.invalidateSize(), 150);
        }
    };

    // Check stored theme or system preference
    const currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(currentTheme === 'dark'); // Apply theme on initial load

    // Theme toggle button listener
    themeToggleButton.addEventListener('click', () => {
        const isDark = document.documentElement.classList.contains('dark');
        applyTheme(!isDark);
    });

    // --- Initialize Leaflet Map ---
    function initializeMap() {
        if (!mapElement) {
            console.error("Map element (#map) not found!");
            return;
        }
        // Default coordinates (e.g., center of a major city like New York)
        const defaultCoords = [40.7128, -74.0060];

        try {
            map = L.map('map').setView(defaultCoords, 12);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            }).addTo(map);

            // Initialize the routing control (without adding it to map yet)
            routingControl = L.Routing.control({
                waypoints: [],
                routeWhileDragging: false,
                draggableWaypoints: false,
                addWaypoints: false,          // We add waypoints programmatically
                createMarker: function() { return null; }, // Hide default start/end markers from routing machine
                show: true,                   // Show the itinerary panel
                collapsible: true,            // Allow collapsing the itinerary
                lineOptions: {
                    styles: [{color: '#3b82f6', opacity: 0.8, weight: 6}] // primary-500
                },
                containerClassName: 'leaflet-routing-container', // For specific styling if needed
                geocoder: null // Disable built-in geocoder, we use Nominatim directly via fetch
            });

            console.log("Leaflet Map initialized.");

        } catch (error) {
            console.error("Error initializing Leaflet map:", error);
            mapElement.innerHTML = '<p class="text-red-500 p-4">Error loading map. Please try again later.</p>';
            showNotification("Map could not be loaded.", "error");
        }
    }

    // --- Geolocation Handling ---
    useLocationBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
            startLocationInput.placeholder = "Getting location...";
            startLocationInput.value = "";
            userStartCoords = null;
            useLocationBtn.disabled = true; // Disable button while getting location
            navigator.geolocation.getCurrentPosition(handleGeolocationSuccess, handleGeolocationError, {
                enableHighAccuracy: true,
                timeout: 10000, // 10 seconds
                maximumAge: 0 // Force fresh location
            });
        } else {
            showNotification("Geolocation is not supported by this browser.", "error");
            startLocationInput.placeholder = "Geolocation unavailable";
        }
    });

    function handleGeolocationSuccess(position) {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        userStartCoords = [lat, lon];
        console.log("Geolocation success:", userStartCoords);
        useLocationBtn.disabled = false; // Re-enable button

        // Reverse geocode to get an address for the input field
        reverseGeocode(lat, lon); // Will update the input field text

        // Center map and add/update marker
        if (map) {
            map.setView(userStartCoords, 14);
            // Remove previous marker if it exists
            removeUserMarker();
            // Add a new marker for the user's location
            try {
                userLocationMarker = L.marker(userStartCoords, {
                     icon: L.divIcon({
                         className: 'user-location-icon', // Custom class for styling
                         html: '<i class="fas fa-map-marker-alt"></i>',
                         iconSize: [24, 24], // Adjust size as needed
                         iconAnchor: [12, 24] // Anchor point at the bottom center
                     })
                }).addTo(map).bindPopup("Your Current Location").openPopup();
            } catch(error) {
                console.error("Error adding user location marker:", error);
            }
        }
    }

    function handleGeolocationError(error) {
        console.error("Geolocation error:", error);
        userStartCoords = null;
        useLocationBtn.disabled = false; // Re-enable button
        let message = "Could not get your location.";
        switch(error.code) {
            case error.PERMISSION_DENIED: message = "Location access denied. Allow access in browser settings."; break;
            case error.POSITION_UNAVAILABLE: message = "Location information is unavailable."; break;
            case error.TIMEOUT: message = "Getting location timed out."; break;
        }
        showNotification(message, "error");
        startLocationInput.placeholder = "Enter address or use current location";
    }

     // --- Remove User Location Marker ---
     function removeUserMarker() {
        if (userLocationMarker && map) {
            try {
                map.removeLayer(userLocationMarker);
            } catch(e) {
                console.warn("Could not remove user location marker layer:", e);
            } finally {
                 userLocationMarker = null;
            }
        }
    }

    // --- Geocoding (Address <-> Coordinates using Nominatim) ---
    const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

    // Debounce function to limit API calls
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Example usage (if you wanted debounced geocoding on input change, not used for button click)
    // const debouncedGeocode = debounce(geocodeAddress, 500);

    async function geocodeAddress(address) {
        if (!address || address.trim() === '') return null;
        const params = new URLSearchParams({ q: address, format: 'json', limit: 1 });
        console.log(`Geocoding request: ${NOMINATIM_BASE_URL}/search?${params}`);
        try {
            const response = await fetch(`${NOMINATIM_BASE_URL}/search?${params}`, {
                headers: { 'Accept': 'application/json' } // Be explicit about expected format
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
            const data = await response.json();
            if (data && data.length > 0) {
                console.log(`Geocoded '${address}' to:`, [data[0].lat, data[0].lon]);
                return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            } else {
                showNotification(`Could not find coordinates for: ${address}`, "warning");
                return null;
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            showNotification(`Geocoding failed for "${address}". Check address or network. (${error.message})`, "error");
            return null;
        }
    }

    async function reverseGeocode(lat, lon) {
        const params = new URLSearchParams({ lat: lat, lon: lon, format: 'json' });
        console.log(`Reverse geocoding request: ${NOMINATIM_BASE_URL}/reverse?${params}`);
        try {
            const response = await fetch(`${NOMINATIM_BASE_URL}/reverse?${params}`, {
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
            const data = await response.json();
            if (data && data.display_name) {
                startLocationInput.value = data.display_name;
                startLocationInput.placeholder = "Enter address or use current location";
                console.log(`Reverse geocoded [${lat}, ${lon}] to:`, data.display_name);
            } else {
                startLocationInput.value = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
                startLocationInput.placeholder = "Enter address or use current location";
                showNotification("Could not get address details for current location.", "warning");
            }
        } catch (error) {
            console.error('Reverse geocoding error:', error);
             showNotification(`Reverse geocoding failed. (${error.message})`, "error");
            startLocationInput.value = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`; // Still show coords
            startLocationInput.placeholder = "Enter address or use current location";
        }
    }

    // --- Routing Logic ---
    findRouteBtn.addEventListener('click', async () => {
        const startAddress = startLocationInput.value;
        const destinationAddress = destinationLocationInput.value;

        // Basic validation
        if (!destinationAddress || destinationAddress.trim() === '') {
            showNotification("Please enter a destination address.", "warning");
            destinationLocationInput.focus();
            return;
        }
        // Start validation: Need either geolocated coords OR a non-empty input field
        if (!userStartCoords && (!startAddress || startAddress.trim() === '')) {
             showNotification("Please enter a start address or use your current location.", "warning");
             startLocationInput.focus();
             return;
        }

        // --- UI Updates for Processing ---
        findRouteBtn.disabled = true; // Disable button during processing
        findRouteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Finding...';
        routeResultsEl.classList.add('hidden'); // Hide previous results
        routeErrorEl.textContent = ''; // Clear previous errors

        // Clear previous route from map
        if (routingControl && map) {
             routingControl.setWaypoints([]); // Clear waypoints visually
             try {
                map.removeControl(routingControl); // Remove the control panel if it exists
             } catch (e) {
                 // Ignore error if control wasn't on map
             }
        }
        removeUserMarker(); // Remove the single 'current location' marker if it exists


        // --- Determine Start Coordinates ---
        let startCoords = userStartCoords; // Use geolocated coords if available and input is empty/matches

        // Check if user typed something different from the geolocated address/placeholder
        const isStartInputDifferent = startAddress && startAddress.trim() !== '' &&
                                      startAddress !== startLocationInput.placeholder &&
                                      (!userStartCoords || startAddress !== `Lat: ${userStartCoords[0].toFixed(4)}, Lon: ${userStartCoords[1].toFixed(4)}`);

        if (isStartInputDifferent || !startCoords) {
             console.log("Geocoding start address:", startAddress);
             startCoords = await geocodeAddress(startAddress);
             if (!startCoords) { // Geocoding failed
                 findRouteBtn.disabled = false;
                 findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route & Estimate';
                 return; // Stop processing
            }
        }

        // --- Determine Destination Coordinates ---
        console.log("Geocoding destination address:", destinationAddress);
        const destinationCoords = await geocodeAddress(destinationAddress);
        if (!destinationCoords) { // Geocoding failed
            findRouteBtn.disabled = false;
            findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route & Estimate';
            return; // Stop processing
        }

        console.log("Attempting to find route between:", startCoords, "and", destinationCoords);

        // --- Setup and Execute Routing ---
        try {
            const waypoints = [
                L.latLng(startCoords[0], startCoords[1]),
                L.latLng(destinationCoords[0], destinationCoords[1])
            ];

            // Add the routing control back to the map and set waypoints
            routingControl.setWaypoints(waypoints);
            routingControl.addTo(map); // Add control panel to map

            // Re-attach event listeners for this specific route request
            routingControl.off('routesfound').on('routesfound', (e) => {
                const routes = e.routes;
                if (routes.length > 0) {
                    console.log("Route found:", routes[0]);
                    const summary = routes[0].summary; // {totalDistance, totalTime}
                    const routeGeometry = routes[0].coordinates; // Array of L.LatLng objects

                    // Estimate conditions based on the found route
                    const estimation = estimateRouteConditions(routeGeometry, summary);

                    // Display results
                    const distanceKm = (summary.totalDistance / 1000).toFixed(1);
                    const timeMinutes = Math.round(summary.totalTime / 60);
                    routeSummaryEl.textContent = `Route: ${distanceKm} km, approx. ${timeMinutes} min`;
                    routeAqiEl.innerHTML = `Est. Avg AQI: <span class="font-bold ${estimation.aqiColor}">${estimation.avgAqi} (${estimation.aqiDesc})</span>`;
                    routeTrafficEl.innerHTML = `Est. Traffic: <span class="font-bold ${estimation.trafficColor}">${estimation.trafficLevel}</span>`;
                    routeResultsEl.classList.remove('hidden');
                    routeErrorEl.textContent = ''; // Clear any previous error

                    // Fit map bounds to the route
                     if (map && routes[0].bounds) {
                         map.fitBounds(routes[0].bounds); // Use bounds provided by routing machine if available
                     } else if (map) {
                         map.fitBounds(L.latLngBounds(waypoints)); // Fallback to waypoint bounds
                     }

                } else {
                    handleRouteError("No route found between these locations.");
                }
                // Re-enable button regardless of success/failure inside this handler
                findRouteBtn.disabled = false;
                findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route & Estimate';
            });

            routingControl.off('routingerror').on('routingerror', (e) => {
                console.error("Routing Error Event:", e);
                handleRouteError(e.error ? e.error.message : "Could not calculate the route. Check locations or network.");
                findRouteBtn.disabled = false;
                findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route & Estimate';
            });

            // Fallback timeout in case events don't fire
            setTimeout(() => {
                if (findRouteBtn.disabled) { // If still disabled after timeout
                    console.warn("Route finding timeout fallback.");
                    handleRouteError("Route calculation timed out or failed silently.");
                    findRouteBtn.disabled = false;
                    findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route & Estimate';
                }
            }, 20000); // 20 second timeout fallback

        } catch (error) {
            console.error("Error setting up routing:", error);
            handleRouteError("An unexpected error occurred during route planning.");
            findRouteBtn.disabled = false;
            findRouteBtn.innerHTML = '<i class="fas fa-route mr-2"></i>Find Route & Estimate';
        }
    });

    // Centralized function to handle displaying route errors
    function handleRouteError(message) {
        console.error("Routing Error:", message);
        routeErrorEl.textContent = `Error: ${message}`;
        routeResultsEl.classList.remove('hidden'); // Show results container to display error
        routeSummaryEl.textContent = ''; // Clear other fields
        routeAqiEl.textContent = '';
        routeTrafficEl.textContent = '';
        // Consider removing the (potentially empty) routing control panel on error
        if (routingControl && map) {
             try { map.removeControl(routingControl); } catch(e) {}
        }
    }

    // --- Route Condition Estimation (SIMULATION) ---
    function estimateRouteConditions(routeGeometry, summary) {
        // ** SIMULATION ONLY ** - Replace with real data lookups if available
        const distanceKm = summary.totalDistance / 1000;
        const timeMinutes = summary.totalTime / 60;

        // Simulate AQI - Factors: Base city AQI, distance, random element
        const currentCityAqi = previousData.aqi || 50; // Use last known city AQI or a default
        let randomFactorAqi = (Math.random() - 0.3) * 30; // +/- random variation
        let distanceFactorAqi = Math.min(distanceKm * 1.0, 40); // Modest impact from distance
        let avgAqi = Math.round(currentCityAqi + randomFactorAqi + distanceFactorAqi);
        avgAqi = Math.max(10, Math.min(avgAqi, 250)); // Clamp AQI between realistic bounds

        let aqiColor = getAqiColor(avgAqi, document.documentElement.classList.contains('dark'), true); // Get text color class
        let aqiDesc = 'Good';
        if (avgAqi > 150) { aqiDesc = 'Unhealthy'; }
        else if (avgAqi > 100) { aqiDesc = 'Unhealthy (Sen.)'; } // Shortened for space
        else if (avgAqi > 50) { aqiDesc = 'Moderate'; }

        // Simulate Traffic - Factors: Current city traffic, time of day, distance, random element
        const currentCityTraffic = previousData.traffic_congestion || "Low";
        let trafficScore = Math.random() * 0.2; // Base randomness
        const currentHour = new Date().getHours();

        // Add score based on city average
        if (currentCityTraffic === "Medium") trafficScore += 0.3;
        if (currentCityTraffic === "High") trafficScore += 0.6;

        // Rush hours have strong influence
        if ((currentHour >= 7 && currentHour <= 9) || (currentHour >= 16 && currentHour <= 19)) { // Extended evening rush
            trafficScore += 0.4;
        }
        // Distance factor
        if (distanceKm > 10) trafficScore += 0.1;
        if (distanceKm > 25) trafficScore += 0.1;

        // Determine level and color based on final score
        let trafficLevel = "Low";
        let trafficColor = "text-green-600 dark:text-green-400";
        if (trafficScore > 0.75) { trafficLevel = "High"; trafficColor = "text-red-600 dark:text-red-400"; }
        else if (trafficScore > 0.4) { trafficLevel = "Medium"; trafficColor = "text-yellow-600 dark:text-yellow-400"; }

        return { avgAqi, aqiDesc, aqiColor, trafficLevel, trafficColor };
    }

    // --- Simulate Fetching Real-time City Data ---
    function generateSimulatedData() {
        const aqi = Math.floor(Math.random() * (190 - 15) + 15); // Range 15-190
        const pm25 = Math.random() * (85 - 3) + 3;
        const co2 = Math.random() * (600 - 380) + 380;
        const energy_kwh = Math.floor(Math.random() * (7000 - 2500) + 2500);
        const traffic_congestion_options = ["Low", "Medium", "High"];
        const traffic_congestion = traffic_congestion_options[Math.floor(Math.random() * 3)];
        const vehicles = Math.floor(Math.random() * (20000 - 7000) + 7000);
        const renewable_power = Math.random() * (85 - 45) + 45; // Range 45-85%

        // Simulate comparison data (percentage change from a hypothetical previous value)
        const vehicleChange = (Math.random() * 12 - 4).toFixed(0); // -4% to +8%
        const energyChange = (Math.random() * 10 - 6).toFixed(0); // -6% to +4%

        const districts = { // Consistent district names
            'Downtown': Math.floor(Math.random() * 1700 + 600),
            'Industrial': Math.floor(Math.random() * 2400 + 1200),
            'Residential N': Math.floor(Math.random() * 1200 + 400), // Split residential
            'Residential S': Math.floor(Math.random() * 1100 + 350),
            'Commercial': Math.floor(Math.random() * 1400 + 500),
            'Suburban': Math.floor(Math.random() * 1000 + 200)
        };

        return {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            aqi: aqi,
            pm25: parseFloat(pm25.toFixed(1)),
            co2: parseFloat(co2.toFixed(1)),
            energy_today_kwh: energy_kwh,
            total_vehicles: vehicles,
            traffic_congestion: traffic_congestion,
            renewable_power_percent: parseFloat(renewable_power.toFixed(1)),
            energy_by_district: districts,
            comparison: {
                vehicleChange: parseInt(vehicleChange),
                energyChange: parseInt(energyChange)
            }
        };
    }

    // --- Update Dashboard UI Elements ---
    function updateDashboardUI(data) {
        if (!data) return; // Safety check

        // Update City-Wide Stats
        totalVehiclesEl.textContent = data.total_vehicles?.toLocaleString() ?? '--';
        currentAqiEl.textContent = data.aqi ?? '--';
        energyTodayEl.textContent = data.energy_today_kwh?.toLocaleString() ?? '--';
        aqiGaugeValueEl.textContent = data.aqi ?? '--';

        // Update Comparison Texts if comparison data exists
        if (data.comparison) {
            const vChange = data.comparison.vehicleChange;
            vehiclesComparisonEl.textContent = `${vChange >= 0 ? '+' : ''}${vChange}% vs yesterday`;
            vehiclesComparisonEl.className = `text-xs mt-1 ${vChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`;

            const eChange = data.comparison.energyChange;
            energyComparisonEl.textContent = `${eChange >= 0 ? '+' : ''}${eChange}% vs yesterday`;
            energyComparisonEl.className = `text-xs mt-1 ${eChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`;
        } else {
            vehiclesComparisonEl.textContent = ''; // Clear if no comparison data
            energyComparisonEl.textContent = '';
        }

        // Update AQI Status and Color
        const isDark = document.documentElement.classList.contains('dark');
        let cityAqiTextColor = getAqiColor(data.aqi, isDark, true); // Text color class
        let cityAqiDesc = 'Good';
        let highAqiAlert = false;
        if (data.aqi > 150) { cityAqiDesc = 'Unhealthy'; highAqiAlert = true; }
        else if (data.aqi > 100) { cityAqiDesc = 'Unhealthy (Sen.)'; highAqiAlert = true; }
        else if (data.aqi > 50) { cityAqiDesc = 'Moderate'; }

        currentAqiEl.className = `text-3xl font-bold ${cityAqiTextColor}`;
        aqiStatusEl.textContent = `Status: ${cityAqiDesc}`;
        aqiStatusEl.className = `text-xs mt-1 ${cityAqiTextColor}`;

        // Trigger Notification for AQI if needed (significant increase into alert zone)
        const aqiThreshold = 100; // Notify above Moderate
        if (highAqiAlert && data.aqi > aqiThreshold && data.aqi > (previousData.aqi || 0) + 15) {
             showNotification(`City-Wide AQI is ${cityAqiDesc.toLowerCase()} (${data.aqi}). Sensitive groups may experience effects.`, 'warning');
        }

        // Update Traffic Status Light and Text
        let cityTrafficColorClass = 'bg-gray-400';
        let cityTrafficBlink = false;
        let highTrafficAlert = false;
        switch (data.traffic_congestion) {
            case "Low": cityTrafficColorClass = 'bg-green-500'; break;
            case "Medium": cityTrafficColorClass = 'bg-yellow-500'; break;
            case "High":
                cityTrafficColorClass = 'bg-red-500';
                cityTrafficBlink = true;
                highTrafficAlert = true;
                break;
        }
        // Ensure blink class is properly added/removed
        trafficLightEl.className = `w-4 h-4 rounded-full mr-2 inline-block ${cityTrafficColorClass}`;
        if (cityTrafficBlink) {
            trafficLightEl.classList.add('blink');
        } else {
            trafficLightEl.classList.remove('blink');
        }
        trafficTextEl.textContent = data.traffic_congestion ?? '--';

        // Trigger Notification for Traffic if changed to High
        if (highTrafficAlert && previousData.traffic_congestion !== "High") {
             showNotification(`High City-Wide traffic congestion detected! Expect delays.`, 'info');
        }

        // Update Pollution Chart Data
        const currentTimeLabel = data.time?.substring(0, 5) ?? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // HH:MM format or current time

        // Avoid duplicate time labels if updates are faster than a minute
        if (!pollutionData.labels.length || pollutionData.labels[pollutionData.labels.length - 1] !== currentTimeLabel) {
             pollutionData.labels.push(currentTimeLabel);
             pollutionData.aqi.push(data.aqi);
             pollutionData.pm25.push(data.pm25);
             pollutionData.co2.push(data.co2);

             // Trim data if it exceeds max points
            if (pollutionData.labels.length > MAX_DATA_POINTS) {
                pollutionData.labels.shift();
                pollutionData.aqi.shift();
                pollutionData.pm25.shift();
                pollutionData.co2.shift();
            }
        } else {
             // Update the last data point instead of adding a new one for the same minute
             const lastIndex = pollutionData.labels.length - 1;
             pollutionData.aqi[lastIndex] = data.aqi;
             pollutionData.pm25[lastIndex] = data.pm25;
             pollutionData.co2[lastIndex] = data.co2;
        }

        // Update all charts with the new data
        updateCharts(data);

        // Store current data for next comparison
        previousData = data;
    }

    // --- Initialize Charts ---
    function initializeCharts() {
        try {
            const isDark = document.documentElement.classList.contains('dark');
            const currentCommonOptions = getCommonChartOptions(isDark);

            // Pollution Chart
            const ctxPollution = document.getElementById('pollutionChart')?.getContext('2d');
            if (!ctxPollution) throw new Error("pollutionChart canvas not found");
            pollutionChart = new Chart(ctxPollution, {
                type: 'line',
                data: { labels: [], datasets: [ // Start with empty data
                    { label: 'AQI', data: [], borderColor: isDark ? '#60a5fa' : '#3b82f6', tension: 0.3, yAxisID: 'yAqi', borderWidth: 2 }, // Blue
                    { label: 'PM2.5 (µg/m³)', data: [], borderColor: isDark ? '#facc15' : '#eab308', tension: 0.3, yAxisID: 'yPm25', borderWidth: 2 }, // Yellow
                    { label: 'CO2 (ppm)', data: [], borderColor: isDark ? '#a78bfa' : '#8b5cf6', tension: 0.3, yAxisID: 'yCo2', borderWidth: 2, hidden: true } // Purple
                ] },
                options: { ...currentCommonOptions, scales: getPollutionScales(isDark, currentCommonOptions) }
            });

            // Energy District Chart
            const ctxEnergyDistrict = document.getElementById('energyDistrictChart')?.getContext('2d');
             if (!ctxEnergyDistrict) throw new Error("energyDistrictChart canvas not found");
            energyDistrictChart = new Chart(ctxEnergyDistrict, {
                type: 'bar',
                data: { labels: [], datasets: [{ // Start empty
                    label: 'kWh Consumed', data: [],
                    backgroundColor: getDistrictColors(isDark, 0.7),
                    borderColor: getDistrictColors(isDark, 1.0),
                    borderWidth: 1
                }] },
                options: { ...currentCommonOptions, indexAxis: 'y', // Horizontal bars often better for district names
                    scales: {
                        x: { ...currentCommonOptions.scales.x, beginAtZero: true, title: { display: true, text: 'kWh' } },
                        y: { ...currentCommonOptions.scales.y, grid: { display: false } } // Keep y-axis ticks/labels
                    }, plugins: { ...currentCommonOptions.plugins, legend: { display: false }}
                }
            });

            // AQI Gauge Chart
            const ctxAqiGauge = document.getElementById('aqiGaugeChart')?.getContext('2d');
            if (!ctxAqiGauge) throw new Error("aqiGaugeChart canvas not found");
            aqiGaugeChart = new Chart(ctxAqiGauge, {
                type: 'doughnut',
                data: { labels: ['AQI', 'Remaining'], datasets: [{
                    data: [50, 150], // Initial placeholder
                    backgroundColor: [ getAqiColor(50, isDark), isDark ? '#4b5563' : '#e5e7eb' ], // Initial color + gray bg
                    borderWidth: 0, circumference: 180, rotation: 270
                }] },
                options: { responsive: true, maintainAspectRatio: true, aspectRatio: 2, cutout: '70%',
                           plugins: { legend: { display: false }, tooltip: { enabled: false } }
                         }
            });

            // Power Source Chart
            const ctxPowerSource = document.getElementById('powerSourceChart')?.getContext('2d');
            if (!ctxPowerSource) throw new Error("powerSourceChart canvas not found");
            powerSourceChart = new Chart(ctxPowerSource, {
                type: 'pie',
                data: { labels: ['Renewable', 'Grid'], datasets: [{ // Start empty/default
                    label: 'Power Mix %', data: [60, 40], // Initial placeholder
                    backgroundColor: [ isDark ? 'rgba(16, 185, 129, 0.8)' : 'rgba(16, 185, 129, 0.9)', // Green
                                       isDark ? 'rgba(107, 114, 128, 0.8)' : 'rgba(107, 114, 128, 0.9)' ], // Gray
                    borderColor: [ isDark ? 'rgba(5, 150, 105, 1)' : 'rgba(5, 150, 105, 1)',
                                   isDark ? 'rgba(75, 85, 99, 1)' : 'rgba(75, 85, 99, 1)' ],
                    borderWidth: 1
                }] },
                options: { responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { color: isDark ? '#e5e7eb' : '#4b5563' } },
                               tooltip: { callbacks: { label: function(context) { return `${context.label}: ${context.formattedValue}%`; }}} // Add % to tooltip
                             }
                }
            });

            // Add loaded class for fade-in effect after a small delay
            setTimeout(() => {
                 chartContainers.forEach(c => c.classList.add('loaded'));
            }, 100);
            console.log("Charts initialized.");

        } catch (error) {
             console.error("Error initializing charts:", error);
             showNotification("Could not initialize dashboard charts.", "error");
             // Optionally disable chart areas or show error message within them
        }
    }

    // --- Helper Functions for Chart Options ---
    function getCommonChartOptions(isDark) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: isDark ? '#e5e7eb' : '#4b5563', padding: 15 } }, // gray-200 / gray-600
                tooltip: {
                     backgroundColor: isDark ? 'rgba(55, 65, 81, 0.9)' : 'rgba(31, 41, 55, 0.9)', // gray-700 / gray-800
                     titleColor: isDark ? '#f9fafb' : '#f3f4f6', // gray-50 / gray-100
                     bodyColor: isDark ? '#d1d5db' : '#e5e7eb', // gray-300 / gray-200
                     padding: 10,
                     cornerRadius: 4,
                     borderColor: isDark ? '#4b5563' : '#6b7280', // gray-600 / gray-500
                     borderWidth: 1
                }
            },
            scales: { // Default scale settings (can be overridden per chart)
                x: { ticks: { color: isDark ? '#9ca3af' : '#6b7280', maxRotation: 0, autoSkipPadding: 10 }, // gray-400 / gray-500
                     grid: { color: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' } }, // Lighter grid lines
                y: { ticks: { color: isDark ? '#9ca3af' : '#6b7280' },
                     grid: { color: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
                     title: { display: false, color: isDark ? '#cbd5e1' : '#475569'} // Default y-axis title off (slate-300 / slate-600)
                    }
            },
            animation: { duration: 500 }, // Subtle animation on updates
            layout: { padding: 5 } // Add slight padding inside chart area
        };
    }

    function getPollutionScales(isDark, commonOptions) {
        const titleColor = commonOptions.scales.y.title.color;
        const gridColor = commonOptions.scales.x.grid.color;
        return {
            x: {...commonOptions.scales.x, title: { display: true, text: 'Time', color: titleColor} },
            yAqi: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'AQI', color: titleColor },
                    grid: { drawOnChartArea: true, color: gridColor }, ticks:{ color: isDark ? '#60a5fa' : '#3b82f6'} }, // Blue
            yPm25: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'PM2.5 (µg/m³)', color: titleColor },
                     grid: { drawOnChartArea: false }, ticks: { color: isDark ? '#facc15' : '#eab308'} }, // Yellow
            yCo2: { type: 'linear', display: false, position: 'right', title: { display: true, text: 'CO2 (ppm)', color: titleColor },
                    grid: { drawOnChartArea: false }, ticks: { color: isDark ? '#a78bfa' : '#8b5cf6'} } // Purple (hidden by default)
        };
    }

     // Define consistent base colors for districts (more colorblind-friendly options)
    const districtBaseColors = [
        { dark: 'rgba(59, 130, 246, VAL)', light: 'rgba(37, 99, 235, VAL)' },   // Blue 500 / 700
        { dark: 'rgba(245, 158, 11, VAL)', light: 'rgba(217, 119, 6, VAL)' },   // Amber 500 / 600
        { dark: 'rgba(16, 185, 129, VAL)', light: 'rgba(5, 150, 105, VAL)' },   // Emerald 500 / 600
        { dark: 'rgba(239, 68, 68, VAL)', light: 'rgba(220, 38, 38, VAL)' },    // Red 500 / 600
        { dark: 'rgba(168, 85, 247, VAL)', light: 'rgba(147, 51, 234, VAL)' },  // Purple 500 / 600
        { dark: 'rgba(34, 211, 238, VAL)', light: 'rgba(8, 145, 178, VAL)' },   // Cyan 400 / 600
        { dark: 'rgba(236, 72, 153, VAL)', light: 'rgba(219, 39, 119, VAL)' },  // Pink 500 / 600
    ];

    // Function to get colors, cycling if more districts than base colors
    function getDistrictColors(isDark, opacity = 0.7, count = districtBaseColors.length) {
        const themeKey = isDark ? 'dark' : 'light';
        const colors = [];
        for (let i = 0; i < count; i++) {
             colors.push(districtBaseColors[i % districtBaseColors.length][themeKey].replace('VAL', opacity));
        }
        return colors;
    }

    // --- Update Charts with New Data ---
    function updateCharts(data) {
        if (!pollutionChart || !energyDistrictChart || !aqiGaugeChart || !powerSourceChart || !data) {
            // console.warn("Attempted to update charts before initialization or with no data.");
            return;
        }
        try {
            const isDark = document.documentElement.classList.contains('dark');

            // Pollution chart
            pollutionChart.data.labels = pollutionData.labels;
            pollutionChart.data.datasets[0].data = pollutionData.aqi;
            pollutionChart.data.datasets[1].data = pollutionData.pm25;
            pollutionChart.data.datasets[2].data = pollutionData.co2;
            pollutionChart.update('none'); // 'none' for smoother updates

            // Energy district chart
            if (data.energy_by_district) {
                const districtLabels = Object.keys(data.energy_by_district);
                const districtData = Object.values(data.energy_by_district);
                energyDistrictChart.data.labels = districtLabels;
                energyDistrictChart.data.datasets[0].data = districtData;
                // Get colors based on the *actual* number of districts
                const numDistricts = districtLabels.length;
                energyDistrictChart.data.datasets[0].backgroundColor = getDistrictColors(isDark, 0.7, numDistricts);
                energyDistrictChart.data.datasets[0].borderColor = getDistrictColors(isDark, 1.0, numDistricts);
                energyDistrictChart.update();
            }

            // AQI Gauge
            const aqiValue = data.aqi || 0;
            const maxAqi = 200; // Define a max for the gauge scale
            const gaugeValue = Math.min(aqiValue, maxAqi); // Cap value at max
            const remainingAqi = Math.max(0, maxAqi - gaugeValue);
            aqiGaugeChart.data.datasets[0].data = [gaugeValue, remainingAqi];
            aqiGaugeChart.data.datasets[0].backgroundColor[0] = getAqiColor(aqiValue, isDark); // Color based on actual value
            aqiGaugeChart.update('none');

            // Power source chart
            const renewable = data.renewable_power_percent || 0;
            const grid = Math.max(0, 100 - renewable); // Ensure grid isn't negative
            powerSourceChart.data.datasets[0].data = [renewable, grid];
            powerSourceChart.update();

        } catch (error) {
            console.error("Error updating charts:", error);
            // Potentially show a subtle error state on the chart or a notification
        }
    }

    // Helper to get AQI color (can return CSS color value OR Tailwind class)
    function getAqiColor(aqiValue, isDark, returnClass = false) {
        // Define color pairs (tailwind class, hex/rgba value)
         const colors = {
            good: { dark: 'text-green-400', light: 'text-green-600', value: isDark ? '#4ade80' : '#16a34a' },
            moderate: { dark: 'text-yellow-400', light: 'text-yellow-600', value: isDark ? '#facc15' : '#ca8a04' },
            unhealthy_sensitive: { dark: 'text-orange-400', light: 'text-orange-600', value: isDark ? '#fb923c' : '#ea580c' },
            unhealthy: { dark: 'text-red-400', light: 'text-red-600', value: isDark ? '#f87171' : '#dc2626' },
            very_unhealthy: { dark: 'text-purple-400', light: 'text-purple-600', value: isDark ? '#c084fc' : '#9333ea' },
            hazardous: { dark: 'text-fuchsia-500', light: 'text-fuchsia-700', value: isDark ? '#d946ef' : '#a21caf' }
        };
        const theme = isDark ? 'dark' : 'light';

        let level = 'good';
        if (aqiValue > 300) level = 'hazardous';
        else if (aqiValue > 200) level = 'very_unhealthy';
        else if (aqiValue > 150) level = 'unhealthy';
        else if (aqiValue > 100) level = 'unhealthy_sensitive';
        else if (aqiValue > 50) level = 'moderate';

        return returnClass ? colors[level][theme] : colors[level].value;
    }

    // --- Update Chart Themes on Toggle ---
    function updateChartThemes(isDark) {
        if (!pollutionChart) return; // Don't run if charts aren't ready

        try {
            const commonOptions = getCommonChartOptions(isDark);
            const charts = [pollutionChart, energyDistrictChart, aqiGaugeChart, powerSourceChart];

            charts.forEach(chart => {
                 if (!chart) return; // Skip if a chart failed to initialize

                // Update common options like legend and tooltip styles
                chart.options.plugins.legend.labels.color = commonOptions.plugins.legend.labels.color;
                chart.options.plugins.tooltip.backgroundColor = commonOptions.plugins.tooltip.backgroundColor;
                chart.options.plugins.tooltip.titleColor = commonOptions.plugins.tooltip.titleColor;
                chart.options.plugins.tooltip.bodyColor = commonOptions.plugins.tooltip.bodyColor;
                chart.options.plugins.tooltip.borderColor = commonOptions.plugins.tooltip.borderColor;


                // Update scales if they exist
                if (chart.options.scales) {
                    Object.keys(chart.options.scales).forEach(axisKey => {
                         const axis = chart.options.scales[axisKey];
                         if(axis.ticks) axis.ticks.color = commonOptions.scales.x.ticks.color;
                         if(axis.grid) axis.grid.color = commonOptions.scales.x.grid.color;
                         if(axis.title) axis.title.color = commonOptions.scales.y.title.color;
                    });
                }

                // Update specific colors based on chart type
                 if (chart === pollutionChart) {
                    chart.data.datasets[0].borderColor = isDark ? '#60a5fa' : '#3b82f6'; // blue
                    chart.data.datasets[1].borderColor = isDark ? '#facc15' : '#eab308'; // yellow
                    chart.data.datasets[2].borderColor = isDark ? '#a78bfa' : '#8b5cf6'; // purple
                    // Re-apply specific scale colors
                    chart.options.scales.yAqi.ticks.color = isDark ? '#60a5fa' : '#3b82f6';
                    chart.options.scales.yPm25.ticks.color = isDark ? '#facc15' : '#eab308';
                    chart.options.scales.yCo2.ticks.color = isDark ? '#a78bfa' : '#8b5cf6';
                } else if (chart === energyDistrictChart) {
                     const numDistricts = chart.data.labels.length;
                     chart.data.datasets[0].backgroundColor = getDistrictColors(isDark, 0.7, numDistricts);
                     chart.data.datasets[0].borderColor = getDistrictColors(isDark, 1.0, numDistricts);
                     // Update axis title colors if they exist
                     if (chart.options.scales.x?.title) chart.options.scales.x.title.color = commonOptions.scales.y.title.color;

                } else if (chart === aqiGaugeChart) {
                    const currentAqiValue = chart.data.datasets[0].data[0]; // Get current value from chart data
                    chart.data.datasets[0].backgroundColor[0] = getAqiColor(currentAqiValue, isDark); // Get hex color
                    chart.data.datasets[0].backgroundColor[1] = isDark ? '#4b5563' : '#e5e7eb'; // gray bg (gray-600 / gray-200)
                } else if (chart === powerSourceChart) {
                     chart.data.datasets[0].backgroundColor = [
                        isDark ? 'rgba(16, 185, 129, 0.8)' : 'rgba(16, 185, 129, 0.9)', // Emerald
                        isDark ? 'rgba(107, 114, 128, 0.8)' : 'rgba(107, 114, 128, 0.9)' // Gray
                    ];
                    chart.data.datasets[0].borderColor = [
                        isDark ? 'rgba(5, 150, 105, 1)' : 'rgba(5, 150, 105, 1)',
                        isDark ? 'rgba(75, 85, 99, 1)' : 'rgba(75, 85, 99, 1)'
                    ];
                }
                chart.update(); // Update the chart to reflect theme changes
            });
            console.log("Chart themes updated.");
        } catch (error) {
            console.error("Error updating chart themes:", error);
        }
    }

    // --- Notifications ---
    let notificationTimeout;
    function showNotification(message, type = 'info') { // types: info, warning, error, success
        if (!notificationBarEl || !notificationMessageEl) {
            console.warn("Notification elements not found.");
            return;
        }

        // Use SweetAlert2 if available and preferred, otherwise use the bar
        if (typeof Swal === 'function' && (type === 'error' || type === 'warning')) {
             Swal.fire({
                icon: type, // 'warning', 'error', 'success', 'info', 'question'
                title: type.charAt(0).toUpperCase() + type.slice(1), // Capitalize type
                text: message,
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 5000, // 5 seconds
                timerProgressBar: true,
                didOpen: (toast) => {
                    toast.addEventListener('mouseenter', Swal.stopTimer)
                    toast.addEventListener('mouseleave', Swal.resumeTimer)
                  }
             });
        } else {
            // Fallback or default to the notification bar
            notificationMessageEl.textContent = message;
            // Reset classes carefully
            notificationBarEl.className = 'mb-4 p-3 border rounded-lg shadow-md opacity-0 transition-opacity duration-500 ease-in-out';

            let baseClasses = '';
            let iconClass = 'fa-info-circle'; // Default icon

            switch(type) {
                case 'warning':
                    baseClasses = 'bg-yellow-100 dark:bg-yellow-900 border-yellow-400 dark:border-yellow-600 text-yellow-700 dark:text-yellow-200';
                    iconClass = 'fa-exclamation-triangle';
                    break;
                case 'error':
                    baseClasses = 'bg-red-100 dark:bg-red-900 border-red-400 dark:border-red-600 text-red-700 dark:text-red-200';
                    iconClass = 'fa-times-circle';
                    break;
                 case 'success':
                     baseClasses = 'bg-green-100 dark:bg-green-900 border-green-400 dark:border-green-600 text-green-700 dark:text-green-200';
                     iconClass = 'fa-check-circle';
                     break;
                case 'info':
                default:
                    baseClasses = 'bg-blue-100 dark:bg-blue-900 border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-200';
                    break; // iconClass remains fa-info-circle
            }
            notificationBarEl.classList.add(...baseClasses.split(' '));
            notificationMessageEl.previousElementSibling.className = `fas ${iconClass} mr-2 flex-shrink-0`; // Update icon, ensure it doesn't shrink

            // Show notification with fade-in
            notificationBarEl.classList.remove('hidden');
            // Force reflow before adding opacity-100 to ensure transition runs
            void notificationBarEl.offsetWidth;
            notificationBarEl.classList.remove('opacity-0');
            notificationBarEl.classList.add('opacity-100');

            // Auto-hide after a delay
            clearTimeout(notificationTimeout);
            notificationTimeout = setTimeout(() => {
                notificationBarEl.classList.remove('opacity-100');
                 notificationBarEl.classList.add('opacity-0');
                // Wait for fade-out transition to finish before hiding completely
                notificationBarEl.addEventListener('transitionend', () => {
                    if (notificationBarEl.classList.contains('opacity-0')) { // Check if it's still fading out
                         notificationBarEl.classList.add('hidden');
                    }
                }, { once: true });
            }, 6000); // 6 seconds display time
        }
    }

    // --- Initial Setup ---
    function initializeDashboard() {
        initializeMap();
        initializeCharts(); // Initialize charts AFTER map but before first data update
        const initialData = generateSimulatedData();
        previousData = initialData; // Set initial data for comparison baseline
        updateDashboardUI(initialData); // Perform the first UI update with initial data

        // Start the interval timer for subsequent data refreshes
        setInterval(() => {
            const newData = generateSimulatedData();
            updateDashboardUI(newData);
            // console.log("Dashboard data refreshed:", new Date().toLocaleTimeString());
        }, 7000); // Update interval (e.g., every 7 seconds)

        console.log("Smart City Dashboard Ready.");
    }

    // --- Start the application ---
    initializeDashboard();

});