/**
 * UI-FleetFlow 3D Vehicle Inspector
 * Combines Sketchfab 3D Interactive Collection with real-time Three.js turntable
 * and institutional telematics diagnostics.
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
    document.getElementById('ins-plate').textContent = veh.plate_number;
    document.getElementById('ins-model').textContent = veh.model || veh.vehicle_type;
    document.getElementById('ins-type').textContent = veh.vehicle_type;
    document.getElementById('ins-driver').textContent = veh.driver_name || (veh.driver ? veh.driver.name : 'Unassigned');
    document.getElementById('ins-status').textContent = veh.status.toUpperCase();
    document.getElementById('ins-speed').textContent = `${veh.speed_kmh} km/h`;
    document.getElementById('ins-fuel').textContent = `${veh.battery_fuel_pct}%`;
    document.getElementById('ins-latlng').textContent = `${veh.latitude.toFixed(5)}, ${veh.longitude.toFixed(5)}`;

    const fuelBar = document.getElementById('ins-fuel-bar');
    if (fuelBar) fuelBar.style.width = `${veh.battery_fuel_pct}%`;

    // Start with Sketchfab tab active by default
    switchInspectorTab('sketchfab');
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

    if (tab === 'sketchfab') {
        if (sketchfabContainer) sketchfabContainer.classList.remove('hidden');
        if (turntableContainer) turntableContainer.classList.add('hidden');
        if (btnSketchfab) {
            btnSketchfab.className = 'px-3 py-1 rounded text-xs font-semibold bg-slate-800 text-amber-400 border border-slate-700';
        }
        if (btnTurntable) {
            btnTurntable.className = 'px-3 py-1 rounded text-xs font-medium text-slate-400 hover:text-white bg-slate-900';
        }
    } else {
        if (sketchfabContainer) sketchfabContainer.classList.add('hidden');
        if (turntableContainer) turntableContainer.classList.remove('hidden');
        if (btnTurntable) {
            btnTurntable.className = 'px-3 py-1 rounded text-xs font-semibold bg-slate-800 text-amber-400 border border-slate-700';
        }
        if (btnSketchfab) {
            btnSketchfab.className = 'px-3 py-1 rounded text-xs font-medium text-slate-400 hover:text-white bg-slate-900';
        }
        initTurntable();
    }
}

function initTurntable() {
    const container = document.getElementById('turntable-canvas-container');
    if (!container) return;

    if (!inspectorRenderer) {
        const width = container.clientWidth || 500;
        const height = container.clientHeight || 340;

        inspectorScene = new THREE.Scene();
        inspectorScene.background = new THREE.Color(0x0a0f1d);

        inspectorCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
        inspectorCamera.position.set(12, 8, 14);

        inspectorRenderer = new THREE.WebGLRenderer({ antialias: true });
        inspectorRenderer.setSize(width, height);
        inspectorRenderer.shadowMap.enabled = true;
        inspectorRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        container.appendChild(inspectorRenderer.domElement);

        inspectorControls = new THREE.OrbitControls(inspectorCamera, inspectorRenderer.domElement);
        inspectorControls.enableDamping = true;
        inspectorControls.autoRotate = true;
        inspectorControls.autoRotateSpeed = 1.8;

        // Lights
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.8);
        inspectorScene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xfff8eb, 1.5);
        dirLight.position.set(10, 15, 10);
        dirLight.castShadow = true;
        inspectorScene.add(dirLight);

        const pointLight = new THREE.PointLight(0xd4af37, 1.2, 20);
        pointLight.position.set(-8, 5, -8);
        inspectorScene.add(pointLight);

        // Circular Pedestal / Turntable Platform
        const platGeo = new THREE.CylinderGeometry(8, 8.5, 0.6, 32);
        const platMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.3, metalness: 0.8 });
        const plat = new THREE.Mesh(platGeo, platMat);
        plat.position.y = -0.3;
        plat.receiveShadow = true;
        inspectorScene.add(plat);

        const ringGeo = new THREE.RingGeometry(7.2, 7.5, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        inspectorScene.add(ring);
    }

    // Clear previous vehicle mesh from inspector
    const existing = inspectorScene.getObjectByName("inspectedVehicle");
    if (existing) inspectorScene.remove(existing);

    // Build procedural 3D model for inspected vehicle
    if (window.campus3D && inspectorCurrentVehicle) {
        const vMesh = window.campus3D.createProceduralVehicleMesh(
            inspectorCurrentVehicle.vehicle_type,
            inspectorCurrentVehicle.plate_number
        );
        vMesh.name = "inspectedVehicle";
        vMesh.position.set(0, 0, 0);
        inspectorScene.add(vMesh);
    }

    function animateTurntable() {
        inspectorAnimId = requestAnimationFrame(animateTurntable);
        if (inspectorControls) inspectorControls.update();
        if (inspectorRenderer && inspectorScene && inspectorCamera) {
            inspectorRenderer.render(inspectorScene, inspectorCamera);
        }
    }
    animateTurntable();
}

function chaseInspectedVehicle() {
    if (inspectorCurrentVehicle && window.campus3D) {
        window.campus3D.followVehicle(inspectorCurrentVehicle.vehicle_id);
        close3DVehicleInspector();
        // Switch to 3D tab if not already
        if (window.switchViewMode) window.switchViewMode('3d');
    }
}
