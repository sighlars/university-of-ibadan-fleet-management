/**
 * UI-FleetFlow Leaflet Campus Map Controller
 * Uses OpenStreetMap standard tiles (Zero API key required, 100% open source)
 */

class FleetMapController {
    constructor() {
        this.map = null;
        this.depotMarker = null;
        this.vehicleMarkers = new Map(); // vehicle_id -> L.Marker
        this.routeLayers = new Map();   // route_id -> L.Polyline
        this.stopMarkers = new Map();    // order_id -> L.Marker
        // University of Ibadan Campus Center
        this.depotCoords = [7.445210, 3.899015];
        this.init();
    }

    init() {
        // Initialize Map
        this.map = L.map('map', {
            zoomControl: false,
            attributionControl: true
        }).setView(this.depotCoords, 15);

        // Standard OpenStreetMap Tiles (Open source, no API key required)
        const osmStandard = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
        }).addTo(this.map);

        // Reposition Zoom Control for responsive screens
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
            className: 'depot-marker-wrapper',
            html: `
                <div class="depot-pin" title="Central Campus Logistics Hub">
                    <i class="fa-solid fa-warehouse text-sm"></i>
                </div>
            `,
            iconSize: [38, 38],
            iconAnchor: [19, 19]
        });

        this.depotMarker = L.marker(this.depotCoords, { icon: depotIcon }).addTo(this.map);
        this.depotMarker.bindPopup(`
            <div class="space-y-1 font-sans">
                <div class="font-semibold text-amber-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <i class="fa-solid fa-warehouse"></i>
                    Central Campus Logistics Hub
                </div>
                <div class="text-white text-xs font-medium">University of Ibadan, Ibadan</div>
                <div class="text-slate-400 text-[11px]">Primary Dispatch, Fueling & Maintenance Depot</div>
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

            // Refined, dignified route colors (Navy, Gold, Teal, Indigo, Slate)
            const routeColors = ['#0284C7', '#D97706', '#0D9488', '#6366F1', '#E11D48'];

            routes.forEach((route, idx) => {
                if (route.polyline && route.polyline.length > 0) {
                    const color = routeColors[idx % routeColors.length];
                    const poly = L.polyline(route.polyline, {
                        color: color,
                        weight: 3.5,
                        opacity: 0.85,
                        dashArray: route.status === 'planned' ? '6, 6' : null
                    }).addTo(this.map);

                    poly.bindPopup(`
                        <div class="space-y-1 font-sans">
                            <div class="font-semibold text-white text-xs">Route #${route.id} (${route.status.toUpperCase()})</div>
                            <div class="text-slate-300 text-xs">Vehicle: <span class="font-bold text-amber-400 font-mono">${route.vehicle_plate || 'Unassigned'}</span></div>
                            <div class="text-slate-400 text-[11px]">Distance: ${route.total_distance_km} km | Stops: ${route.stops_count}</div>
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
                    className: 'stop-marker-wrapper',
                    html: `
                        <div class="stop-pin ${isDelivered ? 'delivered' : ''}">
                            <i class="fa-solid ${isDelivered ? 'fa-check' : 'fa-location-dot'}"></i>
                        </div>
                    `,
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                });

                const marker = L.marker([o.destination_lat, o.destination_lng], { icon: stopIcon }).addTo(this.map);
                marker.bindPopup(`
                    <div class="space-y-1.5 font-sans min-w-[190px]">
                        <div class="flex items-center justify-between border-b border-slate-700/60 pb-1">
                            <span class="font-mono text-amber-400 font-bold text-xs">#${o.tracking_number}</span>
                            <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-semibold">${o.priority}</span>
                        </div>
                        <div class="font-semibold text-white text-xs leading-snug">${o.customer_name}</div>
                        <div class="text-slate-300 text-[11px]">${o.delivery_address}</div>
                        <div class="text-slate-400 text-[10px] pt-1 border-t border-slate-800 flex justify-between">
                            <span>Weight: ${o.weight_kg} kg</span>
                            <span class="font-semibold uppercase text-slate-200">${o.status}</span>
                        </div>
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
            const statusClass = veh.status === 'in_transit' ? 'in-transit' : (veh.status === 'maintenance' ? 'maintenance' : '');

            let iconClass = 'fa-truck';
            const vType = veh.vehicle_type.toLowerCase();
            if (vType.includes('bike')) {
                iconClass = 'fa-motorcycle';
            } else if (vType.includes('bus') || vType.includes('shuttle')) {
                iconClass = 'fa-bus';
            } else if (vType.includes('ambulance') || vType.includes('health')) {
                iconClass = 'fa-truck-medical';
            } else if (vType.includes('heavy') || vType.includes('flatbed')) {
                iconClass = 'fa-truck-front';
            }

            const html = `
                <div class="vehicle-pin ${statusClass}">
                    <div class="vehicle-heading-arrow" style="transform: rotate(${heading}deg); transform-origin: 50% 20px;"></div>
                    <i class="fa-solid ${iconClass} text-[11px]"></i>
                </div>
            `;

            const icon = L.divIcon({
                className: 'vehicle-marker-wrapper',
                html: html,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
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
            <div class="space-y-1.5 font-sans min-w-[200px]">
                <div class="flex items-center justify-between border-b border-slate-700/70 pb-1">
                    <span class="font-bold text-white font-mono text-xs">${veh.plate_number}</span>
                    <span class="text-[9px] px-2 py-0.5 rounded-full font-semibold ${veh.status === 'in_transit' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-300'} uppercase">${veh.status}</span>
                </div>
                <div class="text-slate-300 text-[11px]">Category: <span class="font-medium text-white">${veh.vehicle_type}</span></div>
                <div class="text-slate-300 text-[11px]">Driver: <span class="font-medium text-white">${veh.driver_name || 'Unassigned'}</span></div>
                <div class="text-slate-300 text-[11px] grid grid-cols-2 gap-1 pt-1 font-mono">
                    <div>Speed: <span class="text-amber-400 font-bold">${veh.speed_kmh} km/h</span></div>
                    <div>Fuel: <span class="text-emerald-400 font-bold">${veh.battery_fuel_pct}%</span></div>
                </div>
                <div class="text-slate-400 text-[10px] pt-1 border-t border-slate-800">
                    Next: <span class="text-slate-200 font-medium">${veh.next_stop_address || 'At Central Depot'}</span>
                </div>
            </div>
        `);
    }

    markStopDelivered(orderId) {
        if (this.stopMarkers.has(orderId)) {
            const marker = this.stopMarkers.get(orderId);
            const stopIcon = L.divIcon({
                className: 'stop-marker-wrapper',
                html: `
                    <div class="stop-pin delivered">
                        <i class="fa-solid fa-check"></i>
                    </div>
                `,
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            });
            marker.setIcon(stopIcon);
        }
    }

    flyTo(lat, lng, zoom = 16) {
        if (this.map) {
            this.map.flyTo([lat, lng], zoom, { duration: 1.0 });
        }
    }
}

// Instantiate map controller
document.addEventListener('DOMContentLoaded', () => {
    window.fleetMap = new FleetMapController();
});
