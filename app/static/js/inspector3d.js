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
    if (statusEl) statusEl.textContent = (veh.status || 'IN_TRANSIT').toUpperCase().replace('_', ' ');

    const speedEl = document.getElementById('ins-speed');
    if (speedEl) speedEl.textContent = `${speed} km/h`;

    const fuelEl = document.getElementById('ins-fuel');
    if (fuelEl) fuelEl.textContent = `${fuel}%`;

    const latlngEl = document.getElementById('ins-latlng');
    if (latlngEl) latlngEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    const fuelBar = document.getElementById('ins-fuel-bar');
    if (fuelBar) fuelBar.style.width = `${fuel}%`;

    // Always start with Digital Twin Turntable active as primary view!
    switchInspectorTab('turntable');
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
    const sketchfabContainer = document.getElementById('ins-tab-sketchfab');
    const turntableContainer = document.getElementById('ins-tab-turntable');
    const btnSketchfab = document.getElementById('btn-tab-sketchfab');
    const btnTurntable = document.getElementById('btn-tab-turntable');

    if (tab === 'turntable') {
        if (sketchfabContainer) sketchfabContainer.classList.add('hidden');
        if (turntableContainer) turntableContainer.classList.remove('hidden');
        if (btnTurntable) {
            btnTurntable.className = 'px-3 py-1 rounded text-xs font-semibold bg-uinavy text-white shadow-sm';
        }
        if (btnSketchfab) {
            btnSketchfab.className = 'px-3 py-1 rounded text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100';
        }
        initTurntable();
    } else {
        if (sketchfabContainer) sketchfabContainer.classList.remove('hidden');
        if (turntableContainer) turntableContainer.classList.add('hidden');
        if (btnSketchfab) {
            btnSketchfab.className = 'px-3 py-1 rounded text-xs font-semibold bg-uinavy text-white shadow-sm';
        }
        if (btnTurntable) {
            btnTurntable.className = 'px-3 py-1 rounded text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100';
        }
    }
}

function initTurntable() {
    const container = document.getElementById('turntable-canvas-container');
    if (!container) return;

    if (!inspectorRenderer) {
        const width = container.clientWidth || 500;
        const height = container.clientHeight || 420;

        inspectorScene = new THREE.Scene();
        inspectorScene.background = new THREE.Color(0xf8fafc); // Clean light mode background

        inspectorCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
        inspectorCamera.position.set(12, 7, 13);

        inspectorRenderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        inspectorRenderer.setSize(width, height);
        inspectorRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        inspectorRenderer.shadowMap.enabled = true;
        inspectorRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        inspectorRenderer.toneMappingExposure = 1.1;
        container.appendChild(inspectorRenderer.domElement);

        inspectorControls = new THREE.OrbitControls(inspectorCamera, inspectorRenderer.domElement);
        inspectorControls.enableDamping = true;
        inspectorControls.dampingFactor = 0.08;
        inspectorControls.autoRotate = true;
        inspectorControls.autoRotateSpeed = 1.6;
        inspectorControls.maxPolarAngle = Math.PI / 2 - 0.05;
        inspectorControls.minDistance = 6;
        inspectorControls.maxDistance = 25;

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
        const width = container.clientWidth || 500;
        const height = container.clientHeight || 420;
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
