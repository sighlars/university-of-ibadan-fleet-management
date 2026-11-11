/**
 * FleetFlow Leaflet Map Controller
 */

class FleetMapController {
    constructor() {
        this.map = null;
        this.depotMarker = null;
        this.vehicleMarkers = new Map(); // vehicle_id -> L.Marker
        this.routeLayers = new Map();   // route_id -> L.Polyline
        this.stopMarkers = new Map();    // order_id -> L.Marker
        // University of Ibadan Central Works & Transport Depot
        this.depotCoords = [7.445210, 3.899015];
        this.init();
    }

    init() {
        // Initialize Map centered on University of Ibadan campus
        this.map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView(this.depotCoords, 15);

        // Dark Basemap Tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(this.map);

        // Add Zoom Control to bottom right
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        // Add Central Depot Marker
        this.renderDepot();


        // Load initial routes & stops
        this.loadRoutesAndStops();

        // Listen for WebSocket telemetry updates
        window.addEventListener('telemetry:update', (e) => {
            if (e.detail && e.detail.vehicles) {
                this.updateVehicles(e.detail.vehicles);
            }
        });

        // Listen for milestone events like deliveries
        window.addEventListener('telemetry:event', (e) => {
            if (e.detail && e.detail.type === 'delivery_completed') {
                this.markStopDelivered(e.detail.order_id);
            }
        });
    }

    renderDepot() {
        const depotIcon = L.divIcon({
            className: 'depot-marker-icon',
            html: `
                <div class="depot-marker-container" title="SF Metro Central Logistics Hub">
                    <i class="fa-solid fa-warehouse text-base"></i>
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        this.depotMarker = L.marker(this.depotCoords, { icon: depotIcon }).addTo(this.map);
        this.depotMarker.bindPopup(`
            <div class="space-y-1">
                <div class="font-bold text-amber-400 text-sm flex items-center gap-1.5">
                    <i class="fa-solid fa-warehouse"></i>
                    UI Central Transport & Works Pool
                </div>
                <div class="text-slate-300 font-medium">Works & Maintenance Dept, University of Ibadan</div>
                <div class="text-slate-400 text-[11px]">Central Logistics Depot, Fueling & Maintenance Facility</div>
            </div>
        `);

    }

    async loadRoutesAndStops() {
        try {
            // Fetch routes
            const routesRes = await fetch('/api/routes');
            const routes = await routesRes.json();

            // Clear previous route layers
            this.routeLayers.forEach(l => this.map.removeLayer(l));
            this.routeLayers.clear();

            const routeColors = ['#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

            routes.forEach((route, idx) => {
                if (route.polyline && route.polyline.length > 0) {
                    const color = routeColors[idx % routeColors.length];
                    const poly = L.polyline(route.polyline, {
                        color: color,
                        weight: 4,
                        opacity: 0.75,
                        dashArray: route.status === 'planned' ? '6, 8' : null
                    }).addTo(this.map);

                    poly.bindPopup(`
                        <div class="space-y-1 font-sans">
                            <div class="font-bold text-teal-400">Route #${route.id} (${route.status.toUpperCase()})</div>
                            <div class="text-slate-300">Vehicle: <span class="font-bold text-white">${route.vehicle_plate || 'Unassigned'}</span></div>
                            <div class="text-slate-400">Distance: ${route.total_distance_km} km | Stops: ${route.stops_count}</div>
                        </div>
                    `);

                    this.routeLayers.set(route.id, poly);
                }
            });

            // Fetch orders for stop pins
            const ordersRes = await fetch('/api/orders');
            const orders = await ordersRes.json();

            // Clear existing stop markers
            this.stopMarkers.forEach(m => this.map.removeLayer(m));
            this.stopMarkers.clear();

            orders.forEach(o => {
                if (o.status === 'cancelled') return;

                const isDelivered = o.status === 'delivered';
                const stopIcon = L.divIcon({
                    className: 'stop-marker-icon',
                    html: `
                        <div class="stop-marker-container ${isDelivered ? 'delivered' : ''}">
                            <i class="fa-solid ${isDelivered ? 'fa-check' : 'fa-box'}"></i>
                        </div>
                    `,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });

                const marker = L.marker([o.destination_lat, o.destination_lng], { icon: stopIcon }).addTo(this.map);
                marker.bindPopup(`
                    <div class="space-y-1 font-sans">
                        <div class="font-bold text-amber-400 flex items-center justify-between">
                            <span>#${o.tracking_number}</span>
                            <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">${o.priority}</span>
                        </div>
                        <div class="font-semibold text-white">${o.customer_name}</div>
                        <div class="text-slate-300 text-[11px]">${o.delivery_address}</div>
                        <div class="text-slate-400 text-[11px]">Weight: ${o.weight_kg} kg | Status: <span class="font-bold text-slate-200">${o.status}</span></div>
                    </div>
                `);

                this.stopMarkers.set(o.id, marker);
            });

        } catch (err) {
            console.error('Error loading routes & stops on map', err);
        }
    }

    updateVehicles(vehiclesList) {
        vehiclesList.forEach(veh => {
            const id = veh.vehicle_id;
            const lat = veh.latitude;
            const lng = veh.longitude;
            const heading = veh.heading_deg || 0;
            const isActive = veh.status === 'in_transit';

            // Select icon based on vehicle type
            let iconClass = 'fa-truck-fast';
            if (veh.vehicle_type.toLowerCase().includes('bike')) {
                iconClass = 'fa-bicycle';
            } else if (veh.vehicle_type.toLowerCase().includes('truck')) {
                iconClass = 'fa-truck-front';
            }

            const html = `
                <div class="vehicle-marker-container ${isActive ? 'active' : ''} ${veh.status === 'maintenance' ? 'maintenance' : ''}">
                    <div class="vehicle-marker-heading" style="transform: rotate(${heading}deg); transform-origin: 50% 22px;"></div>
                    <i class="fa-solid ${iconClass} text-white text-xs"></i>
                </div>
            `;

            const icon = L.divIcon({
                className: 'vehicle-marker-icon',
                html: html,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            if (this.vehicleMarkers.has(id)) {
                const marker = this.vehicleMarkers.get(id);
                marker.setLatLng([lat, lng]);
                marker.setIcon(icon);
                this.updateVehiclePopup(marker, veh);
            } else {
                const marker = L.marker([lat, lng], { icon: icon }).addTo(this.map);
                this.updateVehiclePopup(marker, veh);
                this.vehicleMarkers.set(id, marker);
            }
        });
    }

    updateVehiclePopup(marker, veh) {
        marker.setPopupContent(`
            <div class="space-y-1.5 font-sans min-w-[180px]">
                <div class="flex items-center justify-between border-b border-slate-700/80 pb-1">
                    <span class="font-bold text-white text-sm">${veh.plate_number}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${veh.status === 'in_transit' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'} uppercase">${veh.status}</span>
                </div>
                <div class="text-slate-300 text-[11px]">Type: <span class="font-medium text-white">${veh.vehicle_type}</span></div>
                <div class="text-slate-300 text-[11px]">Driver: <span class="font-medium text-white">${veh.driver_name || 'Unassigned'}</span></div>
                <div class="text-slate-300 text-[11px]">Speed: <span class="font-mono text-teal-400 font-bold">${veh.speed_kmh} km/h</span></div>
                <div class="text-slate-300 text-[11px]">Battery / Fuel: <span class="font-mono text-emerald-400 font-bold">${veh.battery_fuel_pct}%</span></div>
                <div class="text-slate-400 text-[10px] pt-1 border-t border-slate-800">
                    Next: <span class="text-slate-200">${veh.next_stop_address || 'Returning to Hub'}</span>
                </div>
            </div>
        `);
    }

    markStopDelivered(orderId) {
        if (this.stopMarkers.has(orderId)) {
            const marker = this.stopMarkers.get(orderId);
            const stopIcon = L.divIcon({
                className: 'stop-marker-icon',
                html: `
                    <div class="stop-marker-container delivered">
                        <i class="fa-solid fa-check"></i>
                    </div>
                `,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            marker.setIcon(stopIcon);
        }
    }

    flyTo(lat, lng, zoom = 15) {
        if (this.map) {
            this.map.flyTo([lat, lng], zoom, { duration: 1.2 });
        }
    }
}

// Instantiate map controller
document.addEventListener('DOMContentLoaded', () => {
    window.fleetMap = new FleetMapController();
});
