# SmartCity-and-IOT-Dashboard
WEBWEAVE

Real-Time IoT Dashboard with Fog/Edge Computing for Environmental Monitoring

This real-time monitoring system leverages Internet of Things (IoT) sensors combined with Fog and Edge computing to efficiently track and visualize in intelligent environments. The system collects data from distributed edge devices (such as ESP32), processes it at fog nodes (Raspberry Pi), and presents the information on a live web dashboard for real-time monitoring.


Key Features

- Real-time Sensor Data Monitoring: Collects and displays critical environmental data such as PM2.5, CO2 levels, temperature, voltage, and current.
- Edge Computing: Provides localized data processing and decision-making at the device level for faster responses.
- Fog Computing: Aggregates, filters, and processes data at the network edge to reduce latency and bandwidth consumption.
- Web-Based Dashboard: Real-time visualization through interactive charts and map-based displays.
- Threshold Alerts: Sends notifications when environmental parameters exceed predefined limits.
- Historical Data Access: Allows for the viewing and export of historical data for trend analysis and reporting.

System Architecture

1. IoT Sensors (ESP32): Data collection at the edge, including PM2.5, CO2, temperature, and current/voltage readings.
2. Fog Node (Raspberry Pi): Local data processing, threshold breach detection, and coordination of connected devices.
3. Cloud Database / API: Centralized data storage, analytics, and API exposure for dashboard integration.
4. Web Dashboard: Interactive web interface for real-time visualization, including charts and maps for deeper insights.

Technical Architecture

 Layers of Operation:

- Edge Layer: Raw sensor data collection (PM2.5, CO2, Temperature, Voltage, etc.)
- Fog Layer: Local data processing, threshold alerting, and device coordination for low-latency operations.
- **Cloud Layer: Centralized data storage with APIs to serve the web dashboard.
- **Dashboard: Real-time display of environmental metrics via interactive graphs and dynamic maps.


 Technology Stack

Hardware: The system utilizes ESP32 microcontrollers along with a variety of sensors for data collection, including the PMS5003 for air quality measurements, the ACS712 for current sensing, and the DHT22 for temperature and humidity readings.

Fog Node: Raspberry Pi serves as the processing unit for data aggregation and local decision-making. The system uses Python for backend scripting, and MQTT is employed for efficient message brokering between the devices and fog nodes.

Backend: For handling data and communication, the backend can be built with either Node.js or Flask. Data can be stored in databases like MongoDB or Firebase, depending on the specific project requirements.

Frontend: The frontend dashboard can be developed using either React.js or Vue.js. For real-time data visualization, Chart.js is used for graphs, and Mapbox helps with map-based visualizations.
