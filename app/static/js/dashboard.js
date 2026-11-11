/**
 * FleetFlow Live Operations Dashboard Controller
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
        showToast(`Route completed by ${event.vehicle_plate}! Vehicle returned to hub.`, 'info');
        refreshTopKPIs();
        if (window.fleetMap) {
            window.fleetMap.loadRoutesAndStops();
        }
    }
});

function renderSidebarVehicles(vehicles) {
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

        const statusClass = isActive 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse'
            : (isMaint ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-slate-800 text-slate-400 border-slate-700');

        const fuelColor = v.battery_fuel_pct > 50 ? 'bg-emerald-400' : (v.battery_fuel_pct > 20 ? 'bg-amber-400' : 'bg-rose-500');

        return `
            <div class="bg-slate-950/70 border border-slate-800/80 hover:border-teal-500/40 rounded-xl p-3 text-xs space-y-2 transition shadow-sm group">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center font-bold text-xs">
                            <i class="fa-solid fa-truck"></i>
                        </div>
                        <div>
                            <div class="font-bold text-white text-xs">${v.plate_number}</div>
                            <div class="text-[10px] text-slate-400">${v.vehicle_type}</div>
                        </div>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusClass} uppercase">
                        ${v.status}
                    </span>
                </div>

                <!-- Telemetry Stats Row -->
                <div class="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-900">
                    <div>
                        <span class="text-slate-500">Speed:</span>
                        <span class="font-mono text-teal-400 font-bold ml-1">${v.speed_kmh} km/h</span>
                    </div>
                    <div class="flex items-center justify-end gap-1.5">
                        <span class="text-slate-500">Power:</span>
                        <div class="w-10 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div class="h-full ${fuelColor}" style="width: ${v.battery_fuel_pct}%"></div>
                        </div>
                        <span class="font-mono text-slate-300 text-[10px]">${v.battery_fuel_pct}%</span>
                    </div>
                </div>

                <!-- Next Stop & ETA -->
                ${isActive ? `
                    <div class="bg-slate-900/90 rounded-lg p-2 space-y-1 text-[11px]">
                        <div class="flex items-center justify-between text-slate-400 text-[10px]">
                            <span>Next Drop-off:</span>
                            <span class="text-teal-400 font-bold">ETA: ${v.eta_minutes}m</span>
                        </div>
                        <div class="text-white truncate font-medium text-[11px]">${v.next_stop_address}</div>
                    </div>
                ` : `
                    <div class="text-slate-500 text-[10px] italic">Idle at central logistics facility</div>
                `}

                <!-- Focus Map Button -->
                <button onclick="focusVehicle(${v.latitude}, ${v.longitude})" class="w-full py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-[10px] font-medium border border-slate-800 flex items-center justify-center gap-1.5 transition">
                    <i class="fa-solid fa-crosshairs text-teal-400"></i>
                    <span>Track on Map</span>
                </button>
            </div>
        `;
    }).join('');
}

function focusVehicle(lat, lng) {
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
            playBtn.className = 'w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center text-xs transition shadow-md shadow-amber-500/30';
        } else {
            icon.className = 'fa-solid fa-play';
            playBtn.className = 'w-8 h-8 rounded-lg bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center text-xs transition shadow-md shadow-teal-500/30';
        }
    }

    // Update speed button pills
    ['1x', '2x', '5x'].forEach(s => {
        const btn = document.getElementById(`spd-${s}`);
        if (!btn) return;
        const targetSpeed = parseFloat(s.replace('x', ''));
        if (Math.abs(currentSimSpeed - targetSpeed) < 0.6) {
            btn.className = 'px-2 py-1 rounded text-xs font-mono font-bold bg-teal-500 text-white transition';
        } else {
            btn.className = 'px-2 py-1 rounded text-xs font-mono font-medium text-slate-400 hover:text-white transition';
        }
    });
}

// Quick Actions from Sidebar
async function triggerOptimization() {
    const btn = document.getElementById('btn-quick-optimize');
    try {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Solving VRP...</span>`;
        
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
            showToast("Fleet optimized and dispatched successfully!", "success");
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
            showToast("Added 5 new sample orders to SF metro area!", "success");
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
