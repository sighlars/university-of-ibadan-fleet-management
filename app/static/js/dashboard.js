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
        container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">No vehicles registered.</div>`;
        return;
    }

    container.innerHTML = vehicles.map(v => {
        const isActive = v.status === 'in_transit';
        const isMaint = v.status === 'maintenance';

        const statusBadge = isActive
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase">In Transit</span>'
            : (isMaint 
                ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 uppercase">Maintenance</span>'
                : '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 uppercase">Idle</span>');

        const fuelColor = v.battery_fuel_pct > 50 ? 'bg-emerald-400' : (v.battery_fuel_pct > 20 ? 'bg-amber-400' : 'bg-rose-500');

        return `
            <div class="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-3 text-xs space-y-2.5 transition">
                <div class="flex items-center justify-between">
                    <div>
                        <div class="font-bold text-white font-mono text-xs flex items-center gap-1.5">
                            <span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}"></span>
                            ${v.plate_number}
                        </div>
                        <div class="text-[11px] text-slate-400 truncate max-w-[150px]">${v.model || v.vehicle_type}</div>
                    </div>
                    ${statusBadge}
                </div>

                <!-- Driver & Telemetry Row -->
                <div class="grid grid-cols-2 gap-2 text-[11px] pt-1.5 border-t border-slate-800/80">
                    <div class="text-slate-400">
                        <span>Speed:</span>
                        <span class="font-mono text-white font-semibold ml-1">${v.speed_kmh} km/h</span>
                    </div>
                    <div class="flex items-center justify-end gap-1.5">
                        <span class="text-slate-400">Fuel:</span>
                        <div class="w-8 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div class="h-full ${fuelColor}" style="width: ${v.battery_fuel_pct}%"></div>
                        </div>
                        <span class="font-mono text-slate-300 text-[10px]">${v.battery_fuel_pct}%</span>
                    </div>
                </div>

                <!-- Next Stop & ETA -->
                ${isActive ? `
                    <div class="bg-slate-950/70 border border-slate-800/70 rounded-lg p-2 text-[11px] space-y-0.5">
                        <div class="flex items-center justify-between text-slate-400 text-[10px]">
                            <span>Next Stop:</span>
                            <span class="text-amber-400 font-mono font-semibold">ETA: ${v.eta_minutes}m</span>
                        </div>
                        <div class="text-white truncate font-medium text-[11px]">${v.next_stop_address}</div>
                    </div>
                ` : `
                    <div class="text-slate-500 text-[10px]">Stationed at Central Logistics Yard</div>
                `}

                <!-- Focus Map & 3D Inspect Buttons -->
                <div class="grid grid-cols-2 gap-1.5 pt-1">
                    <button onclick="focusVehicle(${v.latitude}, ${v.longitude})" class="py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white text-[11px] font-medium border border-slate-700/60 flex items-center justify-center gap-1 transition">
                        <i class="fa-solid fa-crosshairs text-amber-400"></i>
                        <span>Focus Map</span>
                    </button>
                    <button onclick="openVehicleInspectorFromCard('${v.plate_number}')" class="py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 text-[11px] font-medium border border-amber-500/30 flex items-center justify-center gap-1 transition">
                        <i class="fa-solid fa-cube text-[10px]"></i>
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
            playBtn.className = 'w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center justify-center text-xs transition';
        } else {
            icon.className = 'fa-solid fa-play';
            playBtn.className = 'w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center text-xs transition';
        }
    }

    // Update speed button pills
    ['1x', '2x', '5x'].forEach(s => {
        const btn = document.getElementById(`spd-${s}`);
        if (!btn) return;
        const targetSpeed = parseFloat(s.replace('x', ''));
        if (Math.abs(currentSimSpeed - targetSpeed) < 0.6) {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 transition';
        } else {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-mono text-slate-400 hover:text-white transition';
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
