# CityLytics 🌇

CityLytics is a professional-grade, responsive smart city analytics dashboard that visualizes key metrics such as air quality, traffic, energy usage, and weather. Built using modern frontend technologies, it is ideal for urban planners, data enthusiasts, and educators looking to simulate smart city operations.

---

Key Features

 Smart City Search
  - Lookup cities using OpenStreetMap Nominatim API.
  - View live environmental and simulated urban data.

Real-Time Dashboards
  - Live weather and AQI readings.
  - Dynamic charts powered by Chart.js for pollution, energy consumption, and more.

Traffic & Routing Intelligence
  - Plan routes using Leaflet.js with AQI impact estimation.
  - Interactive map powered by Leaflet Routing Machine.

Energy Monitoring
  - Simulated energy usage breakdown by district.
  - Visualize renewable vs non-renewable power mix.

 Light/Dark Mode
  - Smooth theme transition with preference memory.



Tech Stack

| Technology         | Role                         |
|--------------------|------------------------------|
| HTML5/CSS3         | Structure and styling        |
| Tailwind CSS       | Responsive UI framework      |
| JavaScript (ES6+)  | Core logic and interactivity |
| Chart.js           | Charts and visual analytics  |
| Leaflet.js         | Mapping and routing          |
| Dexie.js           | Local storage via IndexedDB  |
| SweetAlert2        | User-friendly alert system   |



---

Getting Started

1. Clone the repository

```bash
git clone https://github.com/your-username/citylytics.git
cd citylytics
```

2. Set up OpenWeatherMap API key

Open `script.js` and replace the API key:

```js
const OPENWEATHER_API_KEY = 'YOUR_API_KEY_HERE';
```

> You can register and get a free key from [OpenWeatherMap](https://openweathermap.org/api).

3. Launch the app

Simply open `index.html` in any modern browser:

```bash
open index.html
```

---

Acknowledgements

- [OpenStreetMap](https://www.openstreetmap.org/)
- [OpenWeatherMap](https://openweathermap.org/)
- [Leaflet.js](https://leafletjs.com/)
- [Chart.js](https://www.chartjs.org/)
- [SweetAlert2](https://sweetalert2.github.io/)

---

