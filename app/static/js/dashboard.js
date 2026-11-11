/**
 * UI-FleetFlow Live Operations Controller
 */

let isSimulationRunning = false;
let currentSimSpeed = 1.0;

// Listen for telemetry updates to populate sidebar cards and stats
window.addEventListener('telemetry:update', (e) => {
    const data = e.detail;
    if (data.vehicles) {
        renderSidebarVehicles(data.vehicles);
    }
    if (data.sim_state) {
        updateSimControls(data.sim_state.is_running, data.sim_state.speed);
    }
});

// Listen for milestones like deliveries to show toasts
window.addEventListener('telemetry:event', (e) => {
    const event = e.detail;
    if (event.type === 'delivery_completed') {
        showToast(`Delivered: ${event.customer_name} (${event.vehicle_plate})`, 'success');
        refreshTopKPIs();
    } else if (event.type === 'route_completed') {
        showToast(`Route completed by ${event.vehicle_plate}! Returned to depot.`, 'info');
        refreshTopKPIs();
        if (window.fleetMap) {
            window.fleetMap.loadRoutesAndStops();
        }
    }
});

function renderSidebarVehicles(vehicles) {
    lastVehiclesCache = vehicles;
    const container = document.getElementById('vehicle-card-list');

    const badge = document.getElementById('vehicle-count-badge');
    if (!container) return;

    const activeCount = vehicles.filter(v => v.status === 'in_transit').length;
    if (badge) {
        badge.textContent = `${activeCount} / ${vehicles.length} Active`;
    }

    if (vehicles.length === 0) {
        container.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs">No vehicles registered.</div>`;
        return;
    }

    container.innerHTML = vehicles.map(v => {
        const isActive = v.status === 'in_transit';
        const isMaint = v.status === 'maintenance';

        const statusBadge = isActive
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase font-mono">In Transit</span>'
            : (isMaint 
                ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 uppercase font-mono">Maintenance</span>'
                : '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 uppercase font-mono">Idle</span>');

        const fuelColor = v.battery_fuel_pct > 50 ? 'bg-emerald-500' : (v.battery_fuel_pct > 20 ? 'bg-amber-500' : 'bg-rose-500');

        return `
            <div class="bg-white border border-slate-200 hover:border-uinavy/40 hover:shadow-sm rounded-xl p-3 text-xs space-y-2.5 transition">
                <div class="flex items-center justify-between">
                    <div>
                        <div class="font-bold text-slate-900 font-mono text-xs flex items-center gap-1.5">
                            <span class="w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}"></span>
                            ${v.plate_number}
                        </div>
                        <div class="text-[11px] text-slate-500 truncate max-w-[150px]">${v.model || v.vehicle_type}</div>
                    </div>
                    ${statusBadge}
                </div>

                <!-- Driver & Telemetry Row -->
                <div class="grid grid-cols-2 gap-2 text-[11px] pt-1.5 border-t border-slate-100">
                    <div class="text-slate-500">
                        <span>Speed:</span>
                        <span class="font-mono text-slate-900 font-semibold ml-1">${v.speed_kmh} km/h</span>
                    </div>
                    <div class="flex items-center justify-end gap-1.5">
                        <span class="text-slate-500">Fuel:</span>
                        <div class="w-8 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div class="h-full ${fuelColor}" style="width: ${v.battery_fuel_pct}%"></div>
                        </div>
                        <span class="font-mono text-slate-700 text-[10px] font-medium">${v.battery_fuel_pct}%</span>
                    </div>
                </div>

                <!-- Next Stop & ETA -->
                ${isActive ? `
                    <div class="bg-slate-50 border border-slate-200/90 rounded-lg p-2 text-[11px] space-y-0.5">
                        <div class="flex items-center justify-between text-slate-500 text-[10px]">
                            <span>Next Stop:</span>
                            <span class="text-amber-700 font-mono font-semibold">ETA: ${v.eta_minutes}m</span>
                        </div>
                        <div class="text-slate-900 truncate font-medium text-[11px]">${v.next_stop_address}</div>
                    </div>
                ` : `
                    <div class="text-slate-400 text-[10px]">Stationed at Central Logistics Yard</div>
                `}

                <!-- Focus Map & 3D Inspect Buttons -->
                <div class="grid grid-cols-2 gap-1.5 pt-1">
                    <button onclick="focusVehicle(${v.latitude}, ${v.longitude})" class="py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-[11px] font-medium border border-slate-200 flex items-center justify-center gap-1 transition">
                        <i class="fa-solid fa-crosshairs text-uinavy"></i>
                        <span>Focus Map</span>
                    </button>
                    <button onclick="openVehicleInspectorFromCard('${v.plate_number}')" class="py-1.5 rounded-lg bg-uinavy-50 hover:bg-uinavy-100 text-uinavy hover:text-uinavy-dark text-[11px] font-semibold border border-uinavy-200 flex items-center justify-center gap-1 transition">
                        <i class="fa-solid fa-cube text-[10px] text-uigold-dark"></i>
                        <span>Inspect 3D</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

let lastVehiclesCache = [];

function openVehicleInspectorFromCard(plateNumber) {
    const veh = lastVehiclesCache.find(v => v.plate_number === plateNumber);
    if (veh && typeof open3DVehicleInspector === 'function') {
        open3DVehicleInspector(veh);
    }
}


function focusVehicle(lat, lng) {
    if (window.campus3D && typeof window.campus3D.gpsToWorld === 'function') {
        const wPos = window.campus3D.gpsToWorld(lat, lng);
        window.campus3D.controls.target.set(wPos.x, 0, wPos.z);
        window.campus3D.camera.position.set(wPos.x + 25, 45, wPos.z + 55);
        window.campus3D.controls.update();
    }
    if (window.fleetMap) {
        window.fleetMap.flyTo(lat, lng, 16);
    }
}


async function refreshTopKPIs() {
    try {
        const res = await fetch('/api/analytics/kpis');
        const kpis = await res.json();
        
        const inTransitEl = document.getElementById('stat-in-transit');
        const pendingEl = document.getElementById('stat-pending');
        const deliveredEl = document.getElementById('stat-delivered');

        if (inTransitEl) inTransitEl.textContent = kpis.in_transit_orders;
        if (pendingEl) pendingEl.textContent = kpis.pending_orders;
        if (deliveredEl) deliveredEl.textContent = kpis.delivered_orders;
    } catch (err) {
        console.error('Error fetching KPIs', err);
    }
}

// Simulation Controls
async function toggleSimulation() {
    const action = isSimulationRunning ? 'pause' : 'start';
    try {
        const res = await fetch('/api/analytics/simulation/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action })
        });
        const data = await res.json();
        updateSimControls(data.is_running, data.speed);
    } catch (err) {
        showToast("Error updating simulation state", "error");
    }
}

async function stepSimulation() {
    try {
        await fetch('/api/analytics/simulation/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'step' })
        });
    } catch (err) {
        console.error(err);
    }
}

async function setSimSpeed(speed) {
    try {
        const res = await fetch('/api/analytics/simulation/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'speed', speed_multiplier: speed })
        });
        const data = await res.json();
        updateSimControls(data.is_running, data.speed);
    } catch (err) {
        console.error(err);
    }
}

function updateSimControls(running, speed) {
    isSimulationRunning = running;
    currentSimSpeed = speed;

    const playBtn = document.getElementById('sim-play-btn');
    const icon = document.getElementById('sim-icon');

    if (playBtn && icon) {
        if (running) {
            icon.className = 'fa-solid fa-pause';
            playBtn.className = 'w-7 h-7 rounded-lg bg-uinavy text-white flex items-center justify-center text-xs transition shadow-sm';
        } else {
            icon.className = 'fa-solid fa-play';
            playBtn.className = 'w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center justify-center text-xs transition';
        }
    }

    // Update speed button pills
    ['1x', '2x', '5x'].forEach(s => {
        const btn = document.getElementById(`spd-${s}`);
        if (!btn) return;
        const targetSpeed = parseFloat(s.replace('x', ''));
        if (Math.abs(currentSimSpeed - targetSpeed) < 0.6) {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-uinavy text-white shadow-xs transition';
        } else {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-mono text-slate-600 hover:text-slate-900 transition';
        }
    });
}

// Quick Actions from Sidebar
async function triggerOptimization() {
    const btn = document.getElementById('btn-quick-optimize');
    try {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Optimizing...</span>`;
        
        // 1. Optimize
        const optRes = await fetch('/api/routes/optimize', { method: 'POST' });
        if (!optRes.ok) {
            const err = await optRes.json();
            showToast(err.detail || "Optimization failed. Check pending orders and available vehicles.", "error");
            return;
        }

        // 2. Dispatch
        const dispRes = await fetch('/api/routes/dispatch-all', { method: 'POST' });
        if (dispRes.ok) {
            showToast("Campus routes solved and dispatched!", "success");
            if (window.fleetMap) {
                window.fleetMap.loadRoutesAndStops();
            }
            refreshTopKPIs();
        }
    } catch (err) {
        showToast("Error optimizing fleet", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i><span>Optimize & Dispatch All</span>`;
    }
}

async function addSampleOrders() {
    try {
        const res = await fetch('/api/orders/batch-sample?count=5', { method: 'POST' });
        if (res.ok) {
            showToast("Added 5 new campus consignments!", "success");
            if (window.fleetMap) {
                window.fleetMap.loadRoutesAndStops();
            }
            refreshTopKPIs();
        }
    } catch (err) {
        showToast("Error adding sample orders", "error");
    }
}

// Initial fetch on page load
document.addEventListener('DOMContentLoaded', () => {
    refreshTopKPIs();
});
