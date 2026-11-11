/**
 * UI-FleetFlow 3D Vehicle Inspector
 * Combines authentic Three.js 3D Digital Twin turntable of the selected
 * Nigerian campus dispatch vehicle with institutional telematics diagnostics.
 */

let inspectorRenderer = null;
let inspectorScene = null;
let inspectorCamera = null;
let inspectorControls = null;
let inspectorAnimId = null;
let inspectorCurrentVehicle = null;

function open3DVehicleInspector(veh) {
    inspectorCurrentVehicle = veh;
    const modal = document.getElementById('inspector-3d-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    // Populate Vehicle Data in UI
    const lat = veh.latitude !== undefined ? veh.latitude : (veh.current_lat || 7.4452);
    const lng = veh.longitude !== undefined ? veh.longitude : (veh.current_lng || 3.8990);
    const speed = Math.round(veh.speed_kmh || 0);
    const fuel = Math.round(veh.battery_fuel_pct !== undefined ? veh.battery_fuel_pct : 94);

    const plateEl = document.getElementById('ins-plate');
    if (plateEl) plateEl.textContent = veh.plate_number;

    const modelEl = document.getElementById('ins-model');
    if (modelEl) modelEl.textContent = veh.model || veh.vehicle_type;

    const typeEl = document.getElementById('ins-type');
    if (typeEl) typeEl.textContent = veh.vehicle_type;

    const driverEl = document.getElementById('ins-driver');
    if (driverEl) driverEl.textContent = veh.driver_name || (veh.driver ? veh.driver.name : 'Unassigned');

    const statusEl = document.getElementById('ins-status');
    if (statusEl) {
        const isTransit = veh.status === 'in_transit';
        const isMaint = veh.status === 'maintenance';
        statusEl.textContent = isTransit ? 'IN TRANSIT' : (isMaint ? 'MAINTENANCE' : 'STATIONED');
        statusEl.className = isTransit
            ? 'px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono shrink-0 whitespace-nowrap'
            : (isMaint
                ? 'px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 font-mono shrink-0 whitespace-nowrap'
                : 'px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 font-mono shrink-0 whitespace-nowrap');
    }

    const speedEl = document.getElementById('ins-speed');
    if (speedEl) speedEl.textContent = `${speed} km/h`;

    const fuelEl = document.getElementById('ins-fuel');
    if (fuelEl) fuelEl.textContent = `${fuel}%`;

    const latlngEl = document.getElementById('ins-latlng');
    if (latlngEl) latlngEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    const fuelBar = document.getElementById('ins-fuel-bar');
    if (fuelBar) fuelBar.style.width = `${fuel}%`;

    // Update lock button text based on current lock state
    if (window.campus3D) {
        const isLocked = window.campus3D.followedVehicleId === veh.vehicle_id;
        window.campus3D.updateFollowUI(isLocked, veh.vehicle_id);
    }

    // Initialize 3D Turntable directly on next layout frame
    requestAnimationFrame(() => {
        initTurntable();
    });
}

function close3DVehicleInspector() {
    const modal = document.getElementById('inspector-3d-modal');
    if (modal) modal.classList.add('hidden');

    if (inspectorAnimId) {
        cancelAnimationFrame(inspectorAnimId);
        inspectorAnimId = null;
    }
}

function switchInspectorTab(tab) {
    initTurntable();
}

function initTurntable() {
    const container = document.getElementById('turntable-canvas-container');
    if (!container) return;

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 220;

    if (!inspectorRenderer) {
        inspectorScene = new THREE.Scene();
        inspectorScene.background = new THREE.Color(0xf8fafc); // Clean light mode background

        inspectorCamera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
        inspectorCamera.position.set(11, 6.5, 12);

        inspectorRenderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        inspectorRenderer.setSize(width, height);
        inspectorRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        inspectorRenderer.shadowMap.enabled = true;
        inspectorRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        inspectorRenderer.toneMappingExposure = 1.1;
        container.innerHTML = '';
        container.appendChild(inspectorRenderer.domElement);

        inspectorControls = new THREE.OrbitControls(inspectorCamera, inspectorRenderer.domElement);
        inspectorControls.enableDamping = true;
        inspectorControls.dampingFactor = 0.08;
        inspectorControls.autoRotate = true;
        inspectorControls.autoRotateSpeed = 1.6;
        inspectorControls.maxPolarAngle = Math.PI / 2 - 0.05;
        inspectorControls.minDistance = 5;
        inspectorControls.maxDistance = 22;
        inspectorControls.enableZoom = true;
        inspectorControls.touches = {
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN
        };

        // Studio Lighting Setup
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.0);
        inspectorScene.add(hemiLight);

        const keyLight = new THREE.DirectionalLight(0xfff8eb, 1.5);
        keyLight.position.set(12, 16, 12);
        keyLight.castShadow = true;
        inspectorScene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.5);
        fillLight.position.set(-12, 8, -12);
        inspectorScene.add(fillLight);

        // Circular Pedestal / Turntable Platform
        const platGeo = new THREE.CylinderGeometry(8.5, 9.0, 0.6, 48);
        const platMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.6 });
        const plat = new THREE.Mesh(platGeo, platMat);
        plat.position.y = -0.3;
        plat.receiveShadow = true;
        inspectorScene.add(plat);

        const ringGeo = new THREE.RingGeometry(7.5, 7.8, 48);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x002147, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        inspectorScene.add(ring);
    } else {
        const width = container.clientWidth || 360;
        const height = container.clientHeight || 220;
        inspectorCamera.aspect = width / height;
        inspectorCamera.updateProjectionMatrix();
        inspectorRenderer.setSize(width, height);
    }

    // Clear previous vehicle mesh from inspector
    const existing = inspectorScene.getObjectByName("inspectedVehicle");
    if (existing) inspectorScene.remove(existing);

    // Build procedural 3D model for inspected vehicle
    if (window.campus3D && inspectorCurrentVehicle) {
        const vMesh = window.campus3D.createProceduralVehicleMesh(
            inspectorCurrentVehicle.vehicle_type,
            inspectorCurrentVehicle.plate_number,
            inspectorCurrentVehicle
        );
        vMesh.name = "inspectedVehicle";
        vMesh.position.set(0, 0, 0);

        // Remove floating sprite inside turntable for clean studio view
        if (vMesh.userData.telemetrySprite) {
            vMesh.remove(vMesh.userData.telemetrySprite);
        }

        inspectorScene.add(vMesh);
    }

    if (!inspectorAnimId) {
        function animateTurntable() {
            inspectorAnimId = requestAnimationFrame(animateTurntable);
            if (inspectorControls) inspectorControls.update();
            if (inspectorRenderer && inspectorScene && inspectorCamera) {
                inspectorRenderer.render(inspectorScene, inspectorCamera);
            }
        }
        animateTurntable();
    }
}

function chaseInspectedVehicle() {
    if (inspectorCurrentVehicle && window.campus3D) {
        window.campus3D.followVehicle(inspectorCurrentVehicle.vehicle_id);
        close3DVehicleInspector();
        if (window.switchViewMode) window.switchViewMode('3d');
    }
}

// Window resize listener to keep turntable aspect ratio accurate
window.addEventListener('resize', () => {
    const modal = document.getElementById('inspector-3d-modal');
    if (modal && !modal.classList.contains('hidden') && inspectorRenderer && inspectorCamera) {
        const container = document.getElementById('turntable-canvas-container');
        if (container) {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w && h) {
                inspectorCamera.aspect = w / h;
                inspectorCamera.updateProjectionMatrix();
                inspectorRenderer.setSize(w, h);
            }
        }
    }
});
