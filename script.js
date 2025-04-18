document.addEventListener('DOMContentLoaded', () => {
    console.log("Smart City Dashboard Initializing...");

    // --- Existing Variables ---
    let pollutionChart, energyDistrictChart, aqiGaugeChart, powerSourceChart;
    let pollutionData = {
        labels: [],
        aqi: [],
        pm25: [],
        co2: []
    };
    const MAX_DATA_POINTS = 20;

    const totalVehiclesEl = document.getElementById('total-vehicles');
    const currentAqiEl = document.getElementById('current-aqi');
    const aqiStatusEl = document.getElementById('aqi-status');
    const energyTodayEl = document.getElementById('energy-today');
    const trafficLightEl = document.getElementById('traffic-light');
    const trafficTextEl = document.getElementById('traffic-text');
    const aqiGaugeValueEl = document.getElementById('aqiGaugeValue');
    const notificationBarEl = document.getElementById('notification-bar');
    const notificationMessageEl = document.getElementById('notification-message');
    const chartContainers = document.querySelectorAll('.chart-container');
    const themeToggleButton = document.getElementById('theme-toggle');
    const themeIconSun = document.getElementById('theme-icon-sun');
    const themeIconMoon = document.getElementById('theme-icon-moon');

    // --- New Variables for Routing/Mapping ---
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

    let map;
    let routingControl;
    let userStartCoords = null; // To store [lat, lng] from geolocation

    // --- Theme Handling (Existing) ---
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
        updateChartThemes(isDark);
        if (map) {
            setTimeout(() => map.invalidateSize(), 100);
        }
    };

    const currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(currentTheme === 'dark');

    themeToggleButton.addEventListener('click', () => {
        const isDark = document.documentElement.classList.contains('dark');
        applyTheme(!isDark);
    });

    // --- Initialize Map ---
    function initializeMap() {
        if (!mapElement) {
            console.error("Map element not found!");
            return;
        }
        // Default coordinates (e.g., center of a city) if geolocation fails or isn't used
        const defaultCoords = [40.7128, -74.0060]; // Example: New York City
        
        map = L.map('map').setView(defaultCoords, 12);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        // Initialize the routing control but don't add it to the map yet
        routingControl = L.Routing.control({
            waypoints: [],
            routeWhileDragging: false,
            draggableWaypoints: false,
            addWaypoints: false,
            createMarker: function() { return null; },
            show: false,
            lineOptions: {
                styles: [{color: '#3b82f6', opacity: 0.8, weight: 6}]
            },
            geocoder: null
        }); // Don't add initially

        console.log("Map initialized.");
    }

    // --- Geolocation ---
    useLocationBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(handleGeolocationSuccess, handleGeolocationError, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
            startLocationInput.placeholder = "Getting location...";
            startLocationInput.value = "";
            userStartCoords = null;
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

        // Optional: Reverse geocode to get an address for the input field
        reverseGeocode(lat, lon);

        // Center map on user's location
        if (map) {
            map.setView(userStartCoords, 14);
            // Add a marker for the user's location
            L.marker(userStartCoords, {
                icon: L.divIcon({className: 'fas fa-map-marker-alt text-red-600 text-2xl', iconAnchor: [10, 28]})
            }).addTo(map).bindPopup("Your Location").openPopup();
        }
    }

    function handleGeolocationError(error) {
        console.error("Geolocation error:", error);
        userStartCoords = null;
        let message = "Could not get your location.";
        switch(error.code) {
            case error.PERMISSION_DENIED: message = "Location access denied. Please allow access in your browser settings."; break;
            case error.POSITION_UNAVAILABLE: message = "Location information is unavailable."; break;
            case error.TIMEOUT: message = "Getting location timed out."; break;
        }
        showNotification(message, "error");
        startLocationInput.placeholder = "Enter address or use current location";
    }

    // --- Geocoding (Address to Coordinates) & Reverse Geocoding (Coordinates to Address) ---
    const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

    async function geocodeAddress(address) {
        if (!address) return null;
        const params = new URLSearchParams({ q: address, format: 'json', limit: 1 });
        try {
            const response = await fetch(`${NOMINATIM_BASE_URL}/search?${params}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data && data.length > 0) {
                return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            } else {
                return null;
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            showNotification(`Could not find coordinates for: ${address}`, "error");
            return null;
        }
    }

    async function reverseGeocode(lat, lon) {
        const params = new URLSearchParams({ lat: lat, lon: lon, format: 'json' });
        try {
            const response = await fetch(`${NOMINATIM_BASE_URL}/reverse?${params}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data && data.display_name) {
                startLocationInput.value = data.display_name;
                startLocationInput.placeholder = "Enter address or use current location";
            } else {
                startLocationInput.value = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
                startLocationInput.placeholder = "Enter address or use current location";
            }
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            startLocationInput.value = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
            startLocationInput.placeholder = "Enter address or use current location";
        }
    }

    // --- Routing ---
    findRouteBtn.addEventListener('click', async () => {
        const startAddress = startLocationInput.value;
        const destinationAddress = destinationLocationInput.value;

        if (!destinationAddress) {
            showNotification("Please enter a destination address.", "warning");
            return;
        }

        // Clear previous results and errors
        routeResultsEl.classList.add('hidden');
        routeErrorEl.textContent = '';
        routeSummaryEl.textContent = '';
        routeAqiEl.textContent = '';
        routeTrafficEl.textContent = '';
        if (routingControl && map) {
            routingControl.setWaypoints([]);
            map.removeControl(routingControl);
        }

        let startCoords = userStartCoords;

        // If user typed something in start OR didn't use geolocation, geocode the start address
        if (!startCoords || startAddress !== startLocationInput.placeholder) {
            if (!startAddress) {
                showNotification("Please enter a start address or use your current location.", "warning");
                return;
            }
            console.log("Geocoding start address:", startAddress);
            startCoords = await geocodeAddress(startAddress);
            if (!startCoords) return;
        }
        
        console.log("Geocoding destination address:", destinationAddress);
        const destinationCoords = await geocodeAddress(destinationAddress);
        if (!destinationCoords) return;

        console.log("Finding route between:", startCoords, "and", destinationCoords);

        // Set waypoints and add control to map
        const waypoints = [
            L.latLng(startCoords[0], startCoords[1]),
            L.latLng(destinationCoords[0], destinationCoords[1])
        ];

        routingControl.setWaypoints(waypoints);
        routingControl.addTo(map);

        // Listen for the route being found
        routingControl.off('routesfound').on('routesfound', function(e) {
            const routes = e.routes;
            if (routes.length > 0) {
                console.log("Route found:", routes[0]);
                const summary = routes[0].summary;
                const routeGeometry = routes[0].coordinates;

                // Estimate conditions based on the found route
                const estimation = estimateRouteConditions(routeGeometry, summary);

                // Display results
                routeSummaryEl.textContent = `Route: ${(summary.totalDistance / 1000).toFixed(1)} km, ${Math.round(summary.totalTime / 60)} min`;
                routeAqiEl.innerHTML = `Estimated Avg AQI: <span class="font-bold ${estimation.aqiColor}">${estimation.avgAqi} (${estimation.aqiDesc})</span>`;
                routeTrafficEl.innerHTML = `Estimated Traffic: <span class="font-bold ${estimation.trafficColor}">${estimation.trafficLevel}</span>`;
                routeResultsEl.classList.remove('hidden');
                routeErrorEl.textContent = '';

                map.fitBounds(routes[0].latLngBounds);

            } else {
                handleRouteError("No route found between these locations.");
            }
        });

        // Listen for routing errors
        routingControl.off('routingerror').on('routingerror', function(e) {
            handleRouteError(e.error ? e.error.message : "Could not calculate route.");
        });

    });

    function handleRouteError(message) {
        console.error("Routing Error:", message);
        routeErrorEl.textContent = `Routing Error: ${message}`;
        routeResultsEl.classList.remove('hidden');
        routeSummaryEl.textContent = '';
        routeAqiEl.textContent = '';
        routeTrafficEl.textContent = '';
        if (routingControl && map) {
            routingControl.setWaypoints([]);
        }
    }

    // --- Route Condition Estimation (SIMULATION) ---
    function estimateRouteConditions(routeGeometry, summary) {
        // ** This is a basic simulation **
        // A real system would query APIs with route geometry or use complex models.
        // We'll base it loosely on distance and maybe random factors.

        const distanceKm = summary.totalDistance / 1000;

        // Simulate AQI - longer routes potentially pass through more varied areas
        let baseAqi = 40;
        let randomFactorAqi = Math.random() * 50;
        let distanceFactorAqi = Math.min(distanceKm * 2, 60);
        let avgAqi = Math.round(baseAqi + randomFactorAqi + distanceFactorAqi);
        avgAqi = Math.min(avgAqi, 180);

        let aqiColor = 'text-green-600 dark:text-green-400';
        let aqiDesc = 'Good';
        if (avgAqi > 150) {
            aqiColor = 'text-red-600 dark:text-red-400'; aqiDesc = 'Unhealthy';
        } else if (avgAqi > 100) {
            aqiColor = 'text-orange-500 dark:text-orange-400'; aqiDesc = 'Moderate';
        } else if (avgAqi > 50) {
            aqiColor = 'text-yellow-500 dark:text-yellow-400'; aqiDesc = 'Acceptable';
        }

        // Simulate Traffic - based on time of day (simple proxy) & distance
        let trafficLevel = "Low";
        let trafficColor = "text-green-600 dark:text-green-400";
        let trafficScore = Math.random();
        const currentHour = new Date().getHours();

        if ((currentHour >= 7 && currentHour <= 9) || (currentHour >= 16 && currentHour <= 18)) {
            trafficScore += 0.4;
        }
        if (distanceKm > 15) {
            trafficScore += 0.2;
        }

        if (trafficScore > 0.8) {
            trafficLevel = "High"; trafficColor = "text-red-600 dark:text-red-400";
        } else if (trafficScore > 0.4) {
            trafficLevel = "Medium"; trafficColor = "text-yellow-600 dark:text-yellow-400";
        }

        return {
            avgAqi: avgAqi,
            aqiDesc: aqiDesc,
            aqiColor: aqiColor,
            trafficLevel: trafficLevel,
            trafficColor: trafficColor
        };
    }

    // --- Existing Data Simulation & UI Updates ---
    function generateSimulatedData() {
        const aqi = Math.floor(Math.random() * (180 - 30) + 30);
        const pm25 = Math.random() * (90 - 5) + 5;
        const co2 = Math.random() * (600 - 350) + 350;
        const energy_kwh = Math.floor(Math.random() * (5000 - 1000) + 1000);
        const traffic_congestion_options = ["Low", "Medium", "High"];
        const traffic_congestion = traffic_congestion_options[Math.floor(Math.random() * 3)];
        const vehicles = Math.floor(Math.random() * (15000 - 5000) + 5000);
        const renewable_power = Math.random() * (70 - 30) + 30;

        const districts = {
            'Downtown': Math.floor(Math.random() * 1500 + 500),
            'Industrial': Math.floor(Math.random() * 2000 + 1000),
            'Residential': Math.floor(Math.random() * 1000 + 300),
            'Commercial': Math.floor(Math.random() * 1200 + 400)
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
            energy_by_district: districts
        };
    }

    function updateDashboardUI(data) {
        // --- Update City-Wide Stats (Existing Logic) ---
        totalVehiclesEl.textContent = data.total_vehicles.toLocaleString();
        currentAqiEl.textContent = data.aqi;
        energyTodayEl.textContent = data.energy_today_kwh.toLocaleString();
        aqiGaugeValueEl.textContent = data.aqi;

        let cityAqiColor = 'text-green-600 dark:text-green-400';
        let cityAqiDesc = 'Good';
        if (data.aqi > 150) {
            cityAqiColor = 'text-red-600 dark:text-red-400'; cityAqiDesc = 'Unhealthy';
            showNotification(`High City-Wide AQI levels (${data.aqi}) detected!`, 'warning');
        } else if (data.aqi > 100) {
            cityAqiColor = 'text-orange-500 dark:text-orange-400'; cityAqiDesc = 'Moderate';
        } else if (data.aqi > 50) {
            cityAqiColor = 'text-yellow-500 dark:text-yellow-400'; cityAqiDesc = 'Acceptable';
        }
        currentAqiEl.className = `text-3xl font-bold ${cityAqiColor}`;
        aqiStatusEl.textContent = `Status: ${cityAqiDesc}`;
        aqiStatusEl.className = `text-xs mt-1 ${cityAqiColor}`;

        let cityTrafficColorClass = 'bg-gray-400';
        let cityTrafficBlink = false;
        switch (data.traffic_congestion) {
            case "Low": cityTrafficColorClass = 'bg-green-500'; break;
            case "Medium": cityTrafficColorClass = 'bg-yellow-500'; break;
            case "High":
                cityTrafficColorClass = 'bg-red-500'; cityTrafficBlink = true;
                showNotification(`High City-Wide traffic congestion detected!`, 'info');
                break;
        }
        trafficLightEl.className = `w-4 h-4 rounded-full mr-2 ${cityTrafficColorClass} ${cityTrafficBlink ? 'blink' : ''}`;
        trafficTextEl.textContent = data.traffic_congestion;

        // --- Update Pollution Chart Data (Existing Logic) ---
        pollutionData.labels.push(data.time);
        pollutionData.aqi.push(data.aqi);
        pollutionData.pm25.push(data.pm25);
        pollutionData.co2.push(data.co2);

        if (pollutionData.labels.length > MAX_DATA_POINTS) {
            pollutionData.labels.shift();
            pollutionData.aqi.shift();
            pollutionData.pm25.shift();
            pollutionData.co2.shift();
        }

        updateCharts(data);
    }

    // --- Initialize Charts (Existing, unchanged except for theme parts moved inside) ---
    function initializeCharts() {
        const commonOptions = (isDark) => ({
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: isDark ? '#e5e7eb' : '#4b5563' }}},
            scales: {
                x: { ticks: { color: isDark ? '#9ca3af' : '#6b7280' }, grid: { color: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' } },
                y: { ticks: { color: isDark ? '#9ca3af' : '#6b7280' }, grid: { color: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' } }
            }
        });

        const isDark = document.documentElement.classList.contains('dark');
        const currentCommonOptions = commonOptions(isDark);

        // Pollution Chart
        const ctxPollution = document.getElementById('pollutionChart').getContext('2d');
        pollutionChart = new Chart(ctxPollution, {
            type: 'line',
            data: { labels: pollutionData.labels, datasets: [
                { label: 'AQI', data: pollutionData.aqi, borderColor: isDark ? '#60a5fa' : '#3b82f6', tension: 0.3, yAxisID: 'yAqi' },
                { label: 'PM2.5 (µg/m³)', data: pollutionData.pm25, borderColor: isDark ? '#facc15' : '#eab308', tension: 0.3, yAxisID: 'yPm25' },
                { label: 'CO2 (ppm)', data: pollutionData.co2, borderColor: isDark ? '#a78bfa' : '#8b5cf6', tension: 0.3, yAxisID: 'yCo2', hidden: true }
            ] },
            options: {
                ...currentCommonOptions,
                scales: {
                    x: {...currentCommonOptions.scales.x },
                    yAqi: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'AQI', color: currentCommonOptions.scales.y.ticks.color },
                        grid: { drawOnChartArea: false },
                        ticks:{ color: isDark ? '#60a5fa' : '#3b82f6'}
                    },
                    yPm25: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'PM2.5', color: currentCommonOptions.scales.y.ticks.color },
                        grid: { drawOnChartArea: false },
                        ticks: { color: isDark ? '#facc15' : '#eab308'}
                    },
                    yCo2: {
                        type: 'linear',
                        display: false,
                        position: 'right',
                        title: { display: true, text: 'CO2', color: currentCommonOptions.scales.y.ticks.color },
                        grid: { drawOnChartArea: false },
                        ticks: { color: isDark ? '#a78bfa' : '#8b5cf6'}
                    }
                }
            }
        });

        // Energy District Chart
        const ctxEnergyDistrict = document.getElementById('energyDistrictChart').getContext('2d');
        energyDistrictChart = new Chart(ctxEnergyDistrict, {
            type: 'bar',
            data: { labels: [], datasets: [{
                label: 'kWh Consumed',
                data: [],
                backgroundColor: [
                    isDark ? 'rgba(59, 130, 246, 0.7)' : 'rgba(59, 130, 246, 0.8)',
                    isDark ? 'rgba(234, 179, 8, 0.7)' : 'rgba(234, 179, 8, 0.8)',
                    isDark ? 'rgba(16, 185, 129, 0.7)' : 'rgba(16, 185, 129, 0.8)',
                    isDark ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.8)'
                ],
                borderColor: [
                    isDark ? 'rgba(37, 99, 235, 1)' : 'rgba(37, 99, 235, 1)',
                    isDark ? 'rgba(217, 119, 6, 1)' : 'rgba(217, 119, 6, 1)',
                    isDark ? 'rgba(5, 150, 105, 1)' : 'rgba(5, 150, 105, 1)',
                    isDark ? 'rgba(220, 38, 38, 1)' : 'rgba(220, 38, 38, 1)'
                ],
                borderWidth: 1
            }] },
            options: {
                ...currentCommonOptions,
                scales: {
                    x: { ...currentCommonOptions.scales.x, grid: { display: false } },
                    y: { ...currentCommonOptions.scales.y, beginAtZero: true }
                },
                plugins: { ...currentCommonOptions.plugins, legend: { display: false }}
            }
        });

        // AQI Gauge Chart
        const ctxAqiGauge = document.getElementById('aqiGaugeChart').getContext('2d');
        aqiGaugeChart = new Chart(ctxAqiGauge, {
            type: 'doughnut',
            data: { labels: ['AQI', 'Remaining'], datasets: [{
                data: [50, 150],
                backgroundColor: [
                    isDark ? '#f87171' : '#ef4444',
                    isDark ? '#4b5563' : '#e5e7eb'
                ],
                borderWidth: 0,
                circumference: 180,
                rotation: 270
            }] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                cutout: '70%',
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            }
        });

        // Power Source Chart
        const ctxPowerSource = document.getElementById('powerSourceChart').getContext('2d');
        powerSourceChart = new Chart(ctxPowerSource, {
            type: 'pie',
            data: { labels: ['Renewable', 'Grid'], datasets: [{
                label: 'Power Mix',
                data: [60, 40],
                backgroundColor: [
                    isDark ? 'rgba(16, 185, 129, 0.8)' : 'rgba(16, 185, 129, 0.9)',
                    isDark ? 'rgba(107, 114, 128, 0.8)' : 'rgba(107, 114, 128, 0.9)'
                ],
                borderColor: [
                    isDark ? 'rgba(5, 150, 105, 1)' : 'rgba(5, 150, 105, 1)',
                    isDark ? 'rgba(75, 85, 99, 1)' : 'rgba(75, 85, 99, 1)'
                ],
                borderWidth: 1
            }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: isDark ? '#e5e7eb' : '#4b5563' }
                    }
                }
            }
        });

        chartContainers.forEach(c => c.classList.add('loaded'));
    }

    // --- Update Charts (Existing, slightly modified for AQI gauge color logic) ---
    function updateCharts(data) {
        if (!pollutionChart || !energyDistrictChart || !aqiGaugeChart || !powerSourceChart) return;

        // Pollution chart
        pollutionChart.data.labels = pollutionData.labels;
        pollutionChart.data.datasets[0].data = pollutionData.aqi;
        pollutionChart.data.datasets[1].data = pollutionData.pm25;
        pollutionChart.data.datasets[2].data = pollutionData.co2;
        pollutionChart.update('none');

        // Energy district chart
        energyDistrictChart.data.labels = Object.keys(data.energy_by_district);
        energyDistrictChart.data.datasets[0].data = Object.values(data.energy_by_district);
        energyDistrictChart.update();

        // AQI Gauge (uses city-wide AQI)
        const aqiValue = data.aqi;
        const maxAqi = 200;
        const remainingAqi = Math.max(0, maxAqi - aqiValue);
        aqiGaugeChart.data.datasets[0].data = [aqiValue, remainingAqi];

        // Determine gauge color based on the AQI value
        let gaugeColor = getAqiColor(aqiValue, document.documentElement.classList.contains('dark'));
        aqiGaugeChart.data.datasets[0].backgroundColor[0] = gaugeColor;
        aqiGaugeChart.update('none');

        // Power source chart
        const renewable = data.renewable_power_percent;
        const grid = 100 - renewable;
        powerSourceChart.data.datasets[0].data = [renewable, grid];
        powerSourceChart.update();
    }
    
    // Helper to get AQI color based on value and theme
    function getAqiColor(aqiValue, isDark) {
        if (aqiValue > 150) return isDark ? '#f87171' : '#ef4444';
        if (aqiValue > 100) return isDark ? '#fb923c' : '#f97316';
        if (aqiValue > 50) return isDark ? '#facc15' : '#eab308';
        return isDark ? '#34d399' : '#10b981';
    }

    // --- Update Chart Themes (Existing, unchanged) ---
    function updateChartThemes(isDark) {
        if (!pollutionChart) return;
        const tickColor = isDark ? '#9ca3af' : '#6b7280';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const legendColor = isDark ? '#e5e7eb' : '#4b5563';
        const updateOptions = (chart) => {
            chart.options.plugins.legend.labels.color = legendColor;
            if (chart.options.scales) {
                Object.values(chart.options.scales).forEach(axis => {
                    if(axis.ticks) axis.ticks.color = tickColor;
                    if(axis.grid) axis.grid.color = gridColor;
                    if(axis.title) axis.title.color = tickColor;
                });
            }
            // Specific color updates based on chart type
            if (chart === pollutionChart) {
                chart.data.datasets[0].borderColor = isDark ? '#60a5fa' : '#3b82f6';
                chart.data.datasets[1].borderColor = isDark ? '#facc15' : '#eab308';
                chart.data.datasets[2].borderColor = isDark ? '#a78bfa' : '#8b5cf6';
                chart.options.scales.yAqi.ticks.color = isDark ? '#60a5fa' : '#3b82f6';
                chart.options.scales.yAqi.title.color = tickColor;
                chart.options.scales.yPm25.ticks.color = isDark ? '#facc15' : '#eab308';
                chart.options.scales.yPm25.title.color = tickColor;
                chart.options.scales.yCo2.ticks.color = isDark ? '#a78bfa' : '#8b5cf6';
                chart.options.scales.yCo2.title.color = tickColor;
            } else if (chart === energyDistrictChart) {
                chart.data.datasets[0].backgroundColor = [
                    isDark ? 'rgba(59, 130, 246, 0.7)' : 'rgba(59, 130, 246, 0.8)',
                    isDark ? 'rgba(234, 179, 8, 0.7)' : 'rgba(234, 179, 8, 0.8)',
                    isDark ? 'rgba(16, 185, 129, 0.7)' : 'rgba(16, 185, 129, 0.8)',
                    isDark ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.8)'
                ];
                chart.data.datasets[0].borderColor = [
                    isDark ? 'rgba(37, 99, 235, 1)' : 'rgba(37, 99, 235, 1)',
                    isDark ? 'rgba(217, 119, 6, 1)' : 'rgba(217, 119, 6, 1)',
                    isDark ? 'rgba(5, 150, 105, 1)' : 'rgba(5, 150, 105, 1)',
                    isDark ? 'rgba(220, 38, 38, 1)' : 'rgba(220, 38, 38, 1)'
                ];
            } else if (chart === aqiGaugeChart) {
                chart.data.datasets[0].backgroundColor[1] = isDark ? '#4b5563' : '#e5e7eb';
                const currentAqiValue = chart.data.datasets[0].data[0];
                chart.data.datasets[0].backgroundColor[0] = getAqiColor(currentAqiValue, isDark);
            } else if (chart === powerSourceChart) {
                chart.data.datasets[0].backgroundColor = [
                    isDark ? 'rgba(16, 185, 129, 0.8)' : 'rgba(16, 185, 129, 0.9)',
                    isDark ? 'rgba(107, 114, 128, 0.8)' : 'rgba(107, 114, 128, 0.9)'
                ];
                chart.data.datasets[0].borderColor = [
                    isDark ? 'rgba(5, 150, 105, 1)' : 'rgba(5, 150, 105, 1)',
                    isDark ? 'rgba(75, 85, 99, 1)' : 'rgba(75, 85, 99, 1)'
                ];
                chart.options.plugins.legend.labels.color = legendColor;
            }
            chart.update();
        };

        [pollutionChart, energyDistrictChart, aqiGaugeChart, powerSourceChart].forEach(updateOptions);
    }

    // --- Notifications (Existing, unchanged) ---
    let notificationTimeout;
    function showNotification(message, type = 'info') {
        notificationMessageEl.textContent = message;
        notificationBarEl.className = 'mb-4 p-3 border rounded-lg shadow-md';
        
        let baseClasses = '';
        let iconClass = 'fa-info-circle';

        if (type === 'warning') {
            baseClasses = 'bg-yellow-100 dark:bg-yellow-900 border-yellow-400 dark:border-yellow-600 text-yellow-700 dark:text-yellow-200';
            iconClass = 'fa-exclamation-triangle';
        } else if (type === 'error') {
            baseClasses = 'bg-red-100 dark:bg-red-900 border-red-400 dark:border-red-600 text-red-700 dark:text-red-200';
            iconClass = 'fa-times-circle';
        } else {
            baseClasses = 'bg-blue-100 dark:bg-blue-900 border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-200';
        }
        notificationBarEl.classList.add(...baseClasses.split(' '));
        notificationMessageEl.previousElementSibling.className = `fas ${iconClass} mr-2`;

        notificationBarEl.classList.remove('hidden');
        notificationBarEl.classList.add('opacity-0', 'transition-opacity', 'duration-500');
        void notificationBarEl.offsetWidth;
        notificationBarEl.classList.remove('opacity-0');

        clearTimeout(notificationTimeout);
        notificationTimeout = setTimeout(() => {
            notificationBarEl.classList.add('opacity-0');
            notificationBarEl.addEventListener('transitionend', () => {
                notificationBarEl.classList.add('hidden');
            }, { once: true });
        }, 5000);
    }

    // --- Initial Setup ---
    initializeMap();
    initializeCharts();
    updateDashboardUI(generateSimulatedData());

    // --- Interval Timer (Existing) ---
    setInterval(() => {
        const newData = generateSimulatedData();
        updateDashboardUI(newData);
        console.log("Dashboard city-wide stats updated at:", new Date().toLocaleTimeString());
    }, 5000);

    console.log("Smart City Dashboard Ready.");

});
