/**
 * UI-FleetFlow 3D Digital Twin Engine (Three.js)
 * Real-time 3D University of Ibadan Campus Simulation with:
 * - High-fidelity daylight campus environment
 * - Real OpenStreetMap 16-tile georeferenced ground draped onto 3D terrain
 * - 1,458 REAL OpenStreetMap extruded 3D buildings directly from OSM vector geometry
 * - 235 REAL OpenStreetMap road networks with genuine curved asphalt geometry
 * - Authentic Nigerian campus utility/dispatch vehicles:
 *   1. UI-01-DSP: Bajaj Boxer BM 100 Courier Delivery Bike (85 kg)
 *   2. UI-02-MED: TVS HLX 125 Laboratory Dispatch Bike (90 kg)
 *   3. UI-03-KEKE: Piaggio Ape Cargo Delivery Tricycle (350 kg)
 *   4. UI-04-VAN: Suzuki Super Carry 1.0L Mini Delivery Van (750 kg)
 *   5. UI-05-BUS: Toyota HiAce 2.7L Commuter Logistics Van (1200 kg)
 *   6. UI-06-WKS: Toyota Hilux 2.5 D-4D Workhorse Pickup (1100 kg)
 * - Forward-facing velocity vector driving dynamics (never drives backwards!)
 * - Floating live fuel gauge HUD above each vehicle with on-click telematics inspection.
 */

class Campus3DEngine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // GPS projection origin: UI Central Logistics Hub & Depot
        this.originLat = 7.445210;
        this.originLng = 3.899015;
        this.scaleMeterToUnits = 0.25; // 1 meter = 0.25 Three.js units (~500 units spans 2km campus)

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.vehicles3D = new Map();  // vehicle_id -> THREE.Group
        this.routes3D = new Map();    // route_id -> THREE.Mesh
        this.stops3D = new Map();     // order_id -> THREE.Group
        this.landmarks3D = [];        // list of landmark groups with metadata
        this.followedVehicleId = null;
        this.selectedVehicleId = null;

        // Numbered Outdoor Parking Bays in front of the Central Depot Yard (Bay 1 to 6)
        this.depotBayPositions = [
            { bay: 1, x: -28, z: 22, heading: 0 },
            { bay: 2, x: -17, z: 22, heading: 0 },
            { bay: 3, x: -6,  z: 22, heading: 0 },
            { bay: 4, x: 5,   z: 22, heading: 0 },
            { bay: 5, x: 16,  z: 22, heading: 0 },
            { bay: 6, x: 27,  z: 22, heading: 0 }
        ];

        this.isInitialized = false;
        this.animationFrameId = null;

        this.init();
    }

    gpsToWorld(lat, lng) {
        // 1 deg lat ~ 110574m, 1 deg lng ~ 110380m
        const metersX = (lng - this.originLng) * 110380.0;
        const metersZ = -(lat - this.originLat) * 110574.0; // North is -Z
        return {
            x: metersX * this.scaleMeterToUnits,
            z: metersZ * this.scaleMeterToUnits
        };
    }

    init() {
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;

        // 1. Scene & Atmospheric Daylight Fog
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xdbeafe); // Clean daylight sky
        this.scene.fog = new THREE.FogExp2(0xdbeafe, 0.0008);

        // 2. Camera: Wide-angle perspective overlooking campus (isometric 3D Google Maps style)
        this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 4500);
        this.camera.position.set(0, 240, 340);

        // 3. WebGL Renderer with PBR tone mapping & soft shadows
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;
        this.container.appendChild(this.renderer.domElement);

        // 4. OrbitControls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 1200;
        this.controls.target.set(0, 0, 0);

        // 5. Environment & Real OpenStreetMap 3D City Layout
        this.setupLighting();
        this.buildCampusTerrain();
        this.buildDepotFleetBayPavement();
        this.buildRealOSMRoads();
        this.buildRealOSMBuildings();
        this.loadRoutesAndStops();
        this.loadInitialVehicles();

        // 6. Event Listeners
        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('telemetry:update', (e) => this.onTelemetryUpdate(e));
        this.renderer.domElement.addEventListener('click', (e) => this.onPointerClick(e));

        this.isInitialized = true;
        this.animate();
    }

    setupLighting() {
        // Natural Daylight Hemisphere
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.95);
        this.scene.add(hemiLight);

        // Main Directional Sunlight with Soft PCF Shadows
        const sun = new THREE.DirectionalLight(0xfffbeb, 1.65);
        sun.position.set(320, 480, 240);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 1400;
        const d = 500;
        sun.shadow.camera.left = -d;
        sun.shadow.camera.right = d;
        sun.shadow.camera.top = d;
        sun.shadow.camera.bottom = -d;
        sun.shadow.bias = -0.0004;
        this.scene.add(sun);

        // Soft sky rim light
        const rim = new THREE.DirectionalLight(0x93c5fd, 0.45);
        rim.position.set(-260, 180, -260);
        this.scene.add(rim);
    }

    buildCampusTerrain() {
        // 1. Broad Base Ground Plane for Infinite Horizon in Light Mode
        const baseGeo = new THREE.PlaneGeometry(4000, 4000);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0, // Soft light institutional ground
            roughness: 0.9,
            metalness: 0.05
        });
        const baseGround = new THREE.Mesh(baseGeo, baseMat);
        baseGround.rotation.x = -Math.PI / 2;
        baseGround.position.y = 0.0;
        baseGround.receiveShadow = true;
        this.scene.add(baseGround);

        // 2. Real OpenStreetMap 16-Tile Grid (Zoom Level 15)
        // Directly covers University of Ibadan campus bounds (lat 7.4278 to 7.4714, lon 3.8781 to 3.9221)
        const textureLoader = new THREE.TextureLoader();
        const n = 32768.0; // 2^15

        for (let x = 16737; x <= 16740; x++) {
            for (let y = 15702; y <= 15705; y++) {
                const lon_w = (x / n) * 360.0 - 180.0;
                const lon_e = ((x + 1) / n) * 360.0 - 180.0;
                const lat_n = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180.0 / Math.PI;
                const lat_s = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180.0 / Math.PI;

                const center_lon = (lon_w + lon_e) / 2.0;
                const center_lat = (lat_n + lat_s) / 2.0;

                const pos = this.gpsToWorld(center_lat, center_lon);
                const p_nw = this.gpsToWorld(lat_n, lon_w);
                const p_se = this.gpsToWorld(lat_s, lon_e);
                const tileW = Math.abs(p_se.x - p_nw.x);
                const tileH = Math.abs(p_se.z - p_nw.z);

                const tileTex = textureLoader.load(`/api/tiles/15/${x}/${y}.png`, () => {
                    if (this.renderer && this.scene && this.camera) {
                        this.renderer.render(this.scene, this.camera);
                    }
                });
                tileTex.minFilter = THREE.LinearFilter;
                tileTex.magFilter = THREE.LinearFilter;

                const tileMat = new THREE.MeshStandardMaterial({
                    map: tileTex,
                    roughness: 0.85,
                    metalness: 0.05
                });
                const tileGeo = new THREE.PlaneGeometry(tileW, tileH);
                const tileMesh = new THREE.Mesh(tileGeo, tileMat);
                tileMesh.rotation.x = -Math.PI / 2;
                tileMesh.position.set(pos.x, 0.05, pos.z);
                tileMesh.receiveShadow = true;
                this.scene.add(tileMesh);
            }
        }

        // Subtle CAD Digital Twin Coordinate Grid Overlay
        const grid = new THREE.GridHelper(1800, 90, 0x0284c7, 0x94a3b8);
        grid.position.y = 0.06;
        grid.material.opacity = 0.12;
        grid.material.transparent = true;
        this.scene.add(grid);
    }

    buildDepotFleetBayPavement() {
        const depotPos = this.gpsToWorld(this.originLat, this.originLng);

        // Large Paved Depot Logistics Apron
        const yardGeo = new THREE.PlaneGeometry(80, 50);
        const yardMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 });
        const yard = new THREE.Mesh(yardGeo, yardMat);
        yard.rotation.x = -Math.PI / 2;
        yard.position.set(depotPos.x, 0.09, depotPos.z + 18);
        yard.receiveShadow = true;
        this.scene.add(yard);

        // Yellow Parking Bay Slots for 6 Vehicles (Bay 1 to 6)
        this.depotBayPositions.forEach(b => {
            const slotGeo = new THREE.PlaneGeometry(8, 14);
            const slotMat = new THREE.MeshBasicMaterial({ color: 0xd97706, wireframe: true });
            const slot = new THREE.Mesh(slotGeo, slotMat);
            slot.rotation.x = -Math.PI / 2;
            slot.position.set(depotPos.x + b.x, 0.11, depotPos.z + b.z);
            this.scene.add(slot);
        });
    }

    /**
     * Builds genuine 3D extruded OpenStreetMap buildings directly from real OSM vector polygons
     * (1,458 real buildings across the University of Ibadan campus).
     */
    async buildRealOSMBuildings() {
        try {
            const res = await fetch('/static/data/ui_osm_buildings.geojson');
            const data = await res.json();
            if (!data || !data.features) return;

            const buildingsGroup = new THREE.Group();
            buildingsGroup.name = "realOSMBuildings";

            // Architectural PBR Materials
            const defaultBuildingMat = new THREE.MeshStandardMaterial({
                color: 0xe2e8f0, // Clean light limestone/concrete
                roughness: 0.65,
                metalness: 0.15
            });

            const senateTowerMat = new THREE.MeshStandardMaterial({
                color: 0x002147, // UI Navy for Senate Tower
                roughness: 0.35,
                metalness: 0.45
            });

            const trenchardMat = new THREE.MeshStandardMaterial({
                color: 0xc59b27, // UI Gold for Trenchard Tower
                roughness: 0.4,
                metalness: 0.35
            });

            const hallMat = new THREE.MeshStandardMaterial({
                color: 0x475569, // Student Hall slate
                roughness: 0.7,
                metalness: 0.1
            });

            const clinicMat = new THREE.MeshStandardMaterial({
                color: 0xf8fafc, // Clean medical white
                roughness: 0.4,
                metalness: 0.2
            });

            data.features.forEach(feat => {
                const geomData = feat.geometry;
                if (!geomData || geomData.type !== 'Polygon') return;

                const coords = geomData.coordinates[0];
                if (!coords || coords.length < 3) return;

                const props = feat.properties || {};
                const name = props.name || '';
                const nameLower = name.toLowerCase();

                // Compute polygon center in world space
                let sumX = 0, sumZ = 0;
                const worldPts = coords.map(pt => {
                    const w = this.gpsToWorld(pt[1], pt[0]); // pt[1]=lat, pt[0]=lon
                    sumX += w.x;
                    sumZ += w.z;
                    return w;
                });

                const cx = sumX / coords.length;
                const cz = sumZ / coords.length;

                // Create 2D shape relative to center with 0.92 inset for clean architectural setbacks
                const shape = new THREE.Shape();
                worldPts.forEach((w, idx) => {
                    const rx = (w.x - cx) * 0.92;
                    const rz = (w.z - cz) * 0.92;
                    if (idx === 0) shape.moveTo(rx, -rz);
                    else shape.lineTo(rx, -rz);
                });

                // Calculate realistic height
                let heightMeters = props.height_m || 5.0;
                let mat = defaultBuildingMat;

                if (nameLower.includes('senate') || nameLower.includes('admin') || nameLower.includes('tekena')) {
                    heightMeters = 38.0;
                    mat = senateTowerMat;
                } else if (nameLower.includes('trenchard')) {
                    heightMeters = 24.0;
                    mat = trenchardMat;
                } else if (nameLower.includes('library') || nameLower.includes('dike')) {
                    heightMeters = 18.0;
                    mat = defaultBuildingMat;
                } else if (nameLower.includes('union') || nameLower.includes('sub')) {
                    heightMeters = 15.0;
                    mat = hallMat;
                } else if (nameLower.includes('jaja') || nameLower.includes('clinic') || nameLower.includes('hospital')) {
                    heightMeters = 14.0;
                    mat = clinicMat;
                } else if (nameLower.includes('hall') || nameLower.includes('college')) {
                    heightMeters = 16.0;
                    mat = hallMat;
                } else if (nameLower.includes('faculty') || nameLower.includes('centre')) {
                    heightMeters = 14.0;
                    mat = hallMat;
                }

                const heightUnits = heightMeters * this.scaleMeterToUnits;

                const extrudeSettings = {
                    depth: heightUnits,
                    bevelEnabled: false
                };

                const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                // Rotate so depth extrudes vertically out of the ground at y = 0
                geom.rotateX(-Math.PI / 2);

                const mesh = new THREE.Mesh(geom, mat);
                mesh.position.set(cx, 0.07, cz);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                mesh.userData.landmarkData = {
                    name: name || `Campus Building #${feat.id}`,
                    zone: props.type || 'University Facility',
                    lat: worldPts[0] ? this.originLat - (cz / (this.scaleMeterToUnits * 110574.0)) : this.originLat,
                    lng: worldPts[0] ? this.originLng + (cx / (this.scaleMeterToUnits * 110380.0)) : this.originLng,
                    height: heightMeters
                };

                buildingsGroup.add(mesh);

                // Add floating billboard sprite only for major recognizable landmarks
                const isTrivialLabel = /pavillion|generator|court|shed/i.test(nameLower);
                if (name && name.length > 2 && !isTrivialLabel) {
                    const labelSprite = this.createLandmarkBillboard(name);
                    labelSprite.position.set(cx, heightUnits + 8.0, cz);
                    buildingsGroup.add(labelSprite);
                }
            });

            this.scene.add(buildingsGroup);
            console.log(`Rendered ${data.features.length} real 3D OpenStreetMap buildings.`);
        } catch (err) {
            console.error('Error loading real OSM 3D buildings', err);
        }
    }

    /**
     * Builds genuine OpenStreetMap road vector ribbons (235 authentic UI road ways)
     */
    async buildRealOSMRoads() {
        try {
            const res = await fetch('/static/data/ui_osm_roads.geojson');
            const data = await res.json();
            if (!data || !data.features) return;

            const roadsGroup = new THREE.Group();
            roadsGroup.name = "realOSMRoads";

            const roadMat = new THREE.MeshStandardMaterial({
                color: 0x334155,
                roughness: 0.8,
                metalness: 0.1,
                transparent: true,
                opacity: 0.45 // Transparent asphalt ribbon that blends directly with OSM ground tiles!
            });

            data.features.forEach(feat => {
                const geomData = feat.geometry;
                if (!geomData || geomData.type !== 'LineString') return;
                const coords = geomData.coordinates;
                if (!coords || coords.length < 2) return;

                const highwayType = (feat.properties && feat.properties.highway) || 'road';
                let roadWidth = 8.0;
                if (highwayType === 'primary' || highwayType === 'secondary' || highwayType === 'tertiary') roadWidth = 12.0;
                else if (highwayType === 'footway' || highwayType === 'path') roadWidth = 4.0;

                for (let i = 0; i < coords.length - 1; i++) {
                    const p1 = this.gpsToWorld(coords[i][1], coords[i][0]);
                    const p2 = this.gpsToWorld(coords[i + 1][1], coords[i + 1][0]);

                    const dx = p2.x - p1.x;
                    const dz = p2.z - p1.z;
                    const len = Math.hypot(dx, dz);
                    if (len < 0.5) continue;

                    const angle = Math.atan2(dx, dz);

                    const roadGeo = new THREE.PlaneGeometry(roadWidth, len);
                    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
                    roadMesh.rotation.x = -Math.PI / 2;
                    roadMesh.rotation.z = -angle;
                    roadMesh.position.set((p1.x + p2.x) / 2, 0.08, (p1.z + p2.z) / 2);
                    roadMesh.receiveShadow = true;
                    roadsGroup.add(roadMesh);
                }
            });

            this.scene.add(roadsGroup);
            console.log(`Rendered ${data.features.length} real OpenStreetMap road networks.`);
        } catch (err) {
            console.error('Error loading real OSM roads', err);
        }
    }

    createLandmarkBillboard(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(0, 33, 71, 0.88)';
        ctx.beginPath();
        ctx.roundRect(8, 8, 368, 80, 12);
        ctx.fill();

        ctx.strokeStyle = '#c59b27';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 192, 48);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(24, 6, 1);
        return sprite;
    }

    async loadInitialVehicles() {
        try {
            const res = await fetch('/api/vehicles');
            const vehicles = await res.json();
            if (vehicles && vehicles.length > 0) {
                this.updateVehiclesTelemetry(vehicles);
            }
        } catch (err) {
            console.error('Error loading initial vehicles in 3D', err);
        }
    }

    createProceduralVehicleMesh(vType, plate, initialData = {}) {
        const group = new THREE.Group();
        const pUpper = (plate || "").toUpperCase();
        const mLower = (initialData.model || "").toLowerCase();
        const tLower = (vType || "").toLowerCase();

        group.userData.wheels = [];
        let totalHeight = 3.5;

        // 1 & 2. MOTORCYCLE / DISPATCH BIKES
        if (pUpper.includes("01") || pUpper.includes("02") || mLower.includes("bike") || mLower.includes("bajaj") || mLower.includes("tvs")) {
            const isMedical = pUpper.includes("MED") || pUpper.includes("02") || mLower.includes("lab");
            totalHeight = 3.2;

            const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
            const frameGeo = new THREE.BoxGeometry(0.5, 0.7, 3.4);
            const frame = new THREE.Mesh(frameGeo, frameMat);
            frame.position.y = 1.1;
            frame.castShadow = true;
            group.add(frame);

            const tankMat = new THREE.MeshStandardMaterial({
                color: isMedical ? 0xef4444 : 0x15803d,
                roughness: 0.3,
                metalness: 0.5
            });
            const tankGeo = new THREE.BoxGeometry(0.8, 0.6, 1.3);
            const tank = new THREE.Mesh(tankGeo, tankMat);
            tank.position.set(0, 1.5, -0.4);
            tank.castShadow = true;
            group.add(tank);

            const seatMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 1.5), seatMat);
            seat.position.set(0, 1.45, 0.6);
            seat.castShadow = true;
            group.add(seat);

            const barMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.2 });
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8), barMat);
            bar.rotation.z = Math.PI / 2;
            bar.position.set(0, 1.9, -1.2);
            group.add(bar);

            const forkGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8);
            const leftFork = new THREE.Mesh(forkGeo, barMat);
            leftFork.position.set(-0.25, 1.1, -1.7);
            const rightFork = new THREE.Mesh(forkGeo, barMat);
            rightFork.position.set(0.25, 1.1, -1.7);
            group.add(leftFork);
            group.add(rightFork);

            const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8db, emissiveIntensity: 2.2 });
            const headlight = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), headMat);
            headlight.rotation.x = Math.PI / 2;
            headlight.position.set(0, 1.6, -1.6);
            group.add(headlight);

            const tailMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 2.0 });
            const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), tailMat);
            taillight.position.set(0, 1.3, 2.1);
            group.add(taillight);

            const boxColor = isMedical ? 0xf8fafc : 0xc59b27;
            const boxMat = new THREE.MeshStandardMaterial({ color: boxColor, roughness: 0.4 });
            const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), boxMat);
            box.position.set(0, 2.0, 1.3);
            box.castShadow = true;
            group.add(box);

            const lidMat = new THREE.MeshStandardMaterial({ color: isMedical ? 0xdc2626 : 0x002147 });
            const lid = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.15, 1.45), lidMat);
            lid.position.set(0, 2.65, 1.3);
            group.add(lid);

            const wheelGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.3, 16);
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2 });

            const wheelZPositions = [-1.7, 1.4];
            wheelZPositions.forEach(zPos => {
                const wheelGroup = new THREE.Group();
                wheelGroup.position.set(0, 0.75, zPos);

                const tire = new THREE.Mesh(wheelGeo, tireMat);
                tire.rotation.z = Math.PI / 2;
                tire.castShadow = true;
                wheelGroup.add(tire);

                const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 12), rimMat);
                rim.rotation.z = Math.PI / 2;
                wheelGroup.add(rim);

                group.add(wheelGroup);
                group.userData.wheels.push(wheelGroup);
            });
        }
        // 3. PIAGGIO APE CARGO TRICYCLE (KEKE)
        else if (pUpper.includes("03") || pUpper.includes("KEKE") || mLower.includes("keke") || mLower.includes("tricycle") || mLower.includes("ape")) {
            totalHeight = 3.8;

            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.35, metalness: 0.4 });
            const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 2.2), bodyMat);
            cab.position.set(0, 1.5, -0.6);
            cab.castShadow = true;
            group.add(cab);

            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, transparent: true, opacity: 0.8 });
            const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.1), glassMat);
            windshield.position.set(0, 2.0, -1.7);
            group.add(windshield);

            const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 2.4), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }));
            roof.position.set(0, 2.6, -0.6);
            roof.castShadow = true;
            group.add(roof);

            const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8db, emissiveIntensity: 2.0 });
            const headlight = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16), headMat);
            headlight.rotation.x = Math.PI / 2;
            headlight.position.set(0, 1.4, -1.75);
            group.add(headlight);

            const tray = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 2.6), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 }));
            tray.position.set(0, 1.0, 1.5);
            tray.castShadow = true;
            group.add(tray);

            const parcelMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8 });
            const p1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.9), parcelMat);
            p1.position.set(-0.6, 1.6, 1.4);
            group.add(p1);
            const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.1), parcelMat);
            p2.position.set(0.6, 1.65, 1.6);
            group.add(p2);

            const wheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.35, 16);
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.7, roughness: 0.3 });

            const kekeWheelConfigs = [
                [0, 0.65, -1.6],
                [-1.3, 0.65, 1.6],
                [1.3, 0.65, 1.6]
            ];

            kekeWheelConfigs.forEach(pos => {
                const wg = new THREE.Group();
                wg.position.set(pos[0], pos[1], pos[2]);
                const tire = new THREE.Mesh(wheelGeo, tireMat);
                tire.rotation.z = Math.PI / 2;
                tire.castShadow = true;
                wg.add(tire);
                const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.37, 8), rimMat);
                rim.rotation.z = Math.PI / 2;
                wg.add(rim);
                group.add(wg);
                group.userData.wheels.push(wg);
            });
        }
        // 4. SUZUKI SUPER CARRY MINI VAN
        else if (pUpper.includes("04") || mLower.includes("carry") || (tLower.includes("shuttle") && pUpper.includes("VAN"))) {
            totalHeight = 4.2;

            const vanMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.4 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 6.2), vanMat);
            body.position.set(0, 1.7, 0);
            body.castShadow = true;
            group.add(body);

            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, transparent: true, opacity: 0.85 });
            const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.2, 0.1), glassMat);
            windshield.position.set(0, 2.2, -3.12);
            group.add(windshield);

            const grill = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.7, 0.2), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 }));
            grill.position.set(0, 0.9, -3.15);
            group.add(grill);

            const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8db, emissiveIntensity: 2.0 });
            const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.1), lightMat);
            hl1.position.set(-1.1, 1.3, -3.16);
            const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.1), lightMat);
            hl2.position.set(1.1, 1.3, -3.16);
            group.add(hl1);
            group.add(hl2);

            const wheelGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.45, 16);
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.8, roughness: 0.2 });

            const miniWheelPositions = [
                [-1.5, 0.7, -2.0],
                [1.5, 0.7, -2.0],
                [-1.5, 0.7, 2.0],
                [1.5, 0.7, 2.0]
            ];

            miniWheelPositions.forEach(wp => {
                const wg = new THREE.Group();
                wg.position.set(wp[0], wp[1], wp[2]);
                const tire = new THREE.Mesh(wheelGeo, tireMat);
                tire.rotation.z = Math.PI / 2;
                tire.castShadow = true;
                wg.add(tire);
                const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.48, 8), rimMat);
                rim.rotation.z = Math.PI / 2;
                wg.add(rim);
                group.add(wg);
                group.userData.wheels.push(wg);
            });
        }
        // 5. TOYOTA HIACE LOGISTICS VAN
        else if (pUpper.includes("05") || pUpper.includes("BUS") || mLower.includes("hiace") || tLower.includes("shuttle")) {
            totalHeight = 4.8;

            const vanMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.5 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 9.8), vanMat);
            body.position.set(0, 2.1, 0);
            body.castShadow = true;
            group.add(body);

            const stripeMat = new THREE.MeshBasicMaterial({ color: 0xc59b27 });
            const leftStripe = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 0.35), stripeMat);
            leftStripe.position.set(-2.12, 1.8, 0);
            leftStripe.rotation.y = -Math.PI / 2;
            group.add(leftStripe);

            const rightStripe = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 0.35), stripeMat);
            rightStripe.position.set(2.12, 1.8, 0);
            rightStripe.rotation.y = Math.PI / 2;
            group.add(rightStripe);

            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, transparent: true, opacity: 0.88 });
            const windshield = new THREE.Mesh(new THREE.BoxGeometry(3.9, 1.6, 0.2), glassMat);
            windshield.position.set(0, 2.7, -4.7);
            windshield.rotation.x = -Math.PI / 16;
            group.add(windshield);

            const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8db, emissiveIntensity: 2.2 });
            const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.1), lightMat);
            hl1.position.set(-1.4, 1.5, -4.95);
            const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.1), lightMat);
            hl2.position.set(1.4, 1.5, -4.95);
            group.add(hl1);
            group.add(hl2);

            const wheelGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.6, 16);
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });

            const vanWheelPositions = [
                [-2.0, 0.95, -3.0],
                [2.0, 0.95, -3.0],
                [-2.0, 0.95, 2.8],
                [2.0, 0.95, 2.8]
            ];

            vanWheelPositions.forEach(wp => {
                const wg = new THREE.Group();
                wg.position.set(wp[0], wp[1], wp[2]);
                const tire = new THREE.Mesh(wheelGeo, tireMat);
                tire.rotation.z = Math.PI / 2;
                tire.castShadow = true;
                wg.add(tire);
                const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.65, 8), rimMat);
                rim.rotation.z = Math.PI / 2;
                wg.add(rim);
                group.add(wg);
                group.userData.wheels.push(wg);
            });
        }
        // 6. TOYOTA HILUX WORKHORSE PICKUP
        else {
            totalHeight = 4.2;

            const cabMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.4 });
            const cab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 4.4), cabMat);
            cab.position.set(0, 2.0, -1.8);
            cab.castShadow = true;
            group.add(cab);

            const hood = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.4, 2.4), cabMat);
            hood.position.set(0, 1.5, -4.2);
            hood.castShadow = true;
            group.add(hood);

            const bullBar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.0, 0.3), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 }));
            bullBar.position.set(0, 1.2, -5.5);
            group.add(bullBar);

            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, transparent: true, opacity: 0.85 });
            const windshield = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.3, 0.1), glassMat);
            windshield.position.set(0, 2.4, -3.9);
            group.add(windshield);

            const bed = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.5, 4.8), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 }));
            bed.position.set(0, 1.5, 2.6);
            bed.castShadow = true;
            group.add(bed);

            const rollBar = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.0, 0.2), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 }));
            rollBar.position.set(0, 2.6, 0.5);
            group.add(rollBar);

            const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8db, emissiveIntensity: 2.2 });
            const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.1), lightMat);
            hl1.position.set(-1.4, 1.5, -5.45);
            const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.1), lightMat);
            hl2.position.set(1.4, 1.5, -5.45);
            group.add(hl1);
            group.add(hl2);

            const wheelGeo = new THREE.CylinderGeometry(1.05, 1.05, 0.65, 16);
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.8, roughness: 0.2 });

            const pickupWheelPositions = [
                [-1.9, 1.05, -3.2],
                [1.9, 1.05, -3.2],
                [-1.9, 1.05, 3.0],
                [1.9, 1.05, 3.0]
            ];

            pickupWheelPositions.forEach(wp => {
                const wg = new THREE.Group();
                wg.position.set(wp[0], wp[1], wp[2]);
                const tire = new THREE.Mesh(wheelGeo, tireMat);
                tire.rotation.z = Math.PI / 2;
                tire.castShadow = true;
                wg.add(tire);
                const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.7, 8), rimMat);
                rim.rotation.z = Math.PI / 2;
                wg.add(rim);
                group.add(wg);
                group.userData.wheels.push(wg);
            });
        }

        // Dynamic Floating Telemetry Billboard
        const sprite = this.createVehicleTelemetrySprite(
            plate,
            initialData.battery_fuel_pct !== undefined ? initialData.battery_fuel_pct : 94,
            initialData.speed_kmh || 0,
            initialData.status || 'in_transit'
        );
        sprite.position.y = totalHeight + 4.0;
        group.add(sprite);
        group.userData.telemetrySprite = sprite;
        group.userData.vehicleHeight = totalHeight;

        return group;
    }

    createVehicleTelemetrySprite(plate, fuelPct, speedKmh, status) {
        const canvas = document.createElement('canvas');
        canvas.width = 380;
        canvas.height = 120;
        this.drawVehicleSpriteCanvas(canvas, plate, fuelPct, speedKmh, status);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(18, 5.7, 1);
        sprite.userData.canvas = canvas;
        sprite.userData.texture = texture;
        return sprite;
    }

    drawVehicleSpriteCanvas(canvas, plate, fuelPct, speedKmh, status) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 380, 120);

        const isTransit = status === 'in_transit';
        const fuel = Math.max(0, Math.min(100, Math.round(fuelPct)));

        // 1. Background Container
        ctx.fillStyle = 'rgba(0, 33, 71, 0.94)';
        ctx.beginPath();
        ctx.roundRect(4, 4, 372, 112, 14);
        ctx.fill();

        ctx.strokeStyle = '#c59b27';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 2. Plate & Status
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(plate || "UI-FLEET", 18, 36);

        const tagText = isTransit ? "IN TRANSIT" : (status === 'maintenance' ? "SERVICE" : "IDLE / BAY");
        const tagBg = isTransit ? "#059669" : (status === 'maintenance' ? "#dc2626" : "#475569");
        ctx.fillStyle = tagBg;
        ctx.beginPath();
        ctx.roundRect(235, 14, 125, 26, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tagText, 297, 32);

        // 3. Speed
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText("Speed: ", 18, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px JetBrains Mono, monospace';
        ctx.fillText(`${Math.round(speedKmh || 0)} km/h`, 72, 64);

        // 4. Fuel Bar
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillText(`⛽ Fuel: ${fuel}%`, 18, 92);

        const barX = 145;
        const barY = 80;
        const barW = 215;
        const barH = 14;

        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 4);
        ctx.fill();

        const barColor = fuel > 50 ? '#10b981' : (fuel > 20 ? '#f59e0b' : '#ef4444');
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(barX, barY, Math.max(4, (barW * fuel) / 100), barH, 4);
        ctx.fill();
    }

    updateVehicleSprite(vehMesh, vehData) {
        const sprite = vehMesh.userData.telemetrySprite;
        if (!sprite || !sprite.userData.canvas) return;

        this.drawVehicleSpriteCanvas(
            sprite.userData.canvas,
            vehData.plate_number,
            vehData.battery_fuel_pct,
            vehData.speed_kmh,
            vehData.status
        );
        sprite.userData.texture.needsUpdate = true;
    }

    onTelemetryUpdate(event) {
        if (!event.detail || !event.detail.vehicles) return;
        this.updateVehiclesTelemetry(event.detail.vehicles);
    }

    updateVehiclesTelemetry(vehiclesList) {
        const depotPos = this.gpsToWorld(this.originLat, this.originLng);

        vehiclesList.forEach((veh, idx) => {
            const id = veh.vehicle_id;
            let targetPos = this.gpsToWorld(veh.latitude, veh.longitude);

            const distToDepot = Math.sqrt(
                Math.pow(veh.latitude - this.originLat, 2) + Math.pow(veh.longitude - this.originLng, 2)
            );

            const isStationedAtDepot = veh.status === 'idle' || (distToDepot < 0.0003 && veh.status !== 'in_transit');

            if (isStationedAtDepot) {
                const bayInfo = this.depotBayPositions[idx % this.depotBayPositions.length];
                targetPos = {
                    x: depotPos.x + bayInfo.x,
                    z: depotPos.z + bayInfo.z
                };
            }

            if (!this.vehicles3D.has(id)) {
                const vehMesh = this.createProceduralVehicleMesh(veh.vehicle_type, veh.plate_number, veh);
                vehMesh.position.set(targetPos.x, 0.15, targetPos.z);
                vehMesh.userData.vehicleData = veh;
                this.scene.add(vehMesh);
                this.vehicles3D.set(id, vehMesh);
            } else {
                const vehMesh = this.vehicles3D.get(id);
                vehMesh.userData.vehicleData = veh;

                const dx = targetPos.x - vehMesh.position.x;
                const dz = targetPos.z - vehMesh.position.z;
                const distMoved = Math.hypot(dx, dz);

                vehMesh.position.x += dx * 0.25;
                vehMesh.position.z += dz * 0.25;
                vehMesh.position.y = 0.15;

                // STRICT FORWARD VELOCITY HEADING:
                // Car always faces forward along movement direction, never drives backwards!
                if (distMoved > 0.05) {
                    const forwardAngle = Math.atan2(-dx, -dz);

                    let diff = forwardAngle - vehMesh.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    vehMesh.rotation.y += diff * 0.25;

                    if (vehMesh.userData.wheels) {
                        const rollSpeed = (veh.speed_kmh || 30) * 0.035;
                        vehMesh.userData.wheels.forEach(w => {
                            w.rotation.x -= rollSpeed;
                        });
                    }
                } else if (isStationedAtDepot) {
                    let diff = 0 - vehMesh.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    vehMesh.rotation.y += diff * 0.15;
                }

                this.updateVehicleSprite(vehMesh, veh);

                if (this.followedVehicleId === id) {
                    const chaseOffset = new THREE.Vector3(0, 24, 45).applyAxisAngle(new THREE.Vector3(0, 1, 0), vehMesh.rotation.y);
                    this.camera.position.lerp(new THREE.Vector3().addVectors(vehMesh.position, chaseOffset), 0.12);
                    this.controls.target.lerp(vehMesh.position, 0.18);
                }
            }
        });
    }

    async loadRoutesAndStops() {
        try {
            const routesRes = await fetch('/api/routes');
            const routes = await routesRes.json();

            this.routes3D.forEach(r => this.scene.remove(r));
            this.routes3D.clear();

            routes.forEach((route, idx) => {
                if (route.polyline && route.polyline.length > 1) {
                    const points = [];
                    route.polyline.forEach(pt => {
                        const wPos = this.gpsToWorld(pt[0], pt[1]);
                        points.push(new THREE.Vector3(wPos.x, 0.45, wPos.z));
                    });

                    const curve = new THREE.CatmullRomCurve3(points);
                    const tubeGeo = new THREE.TubeGeometry(curve, points.length * 4, 0.55, 6, false);
                    const tubeMat = new THREE.MeshStandardMaterial({
                        color: idx % 2 === 0 ? 0x0284c7 : 0xd97706,
                        emissive: idx % 2 === 0 ? 0x0284c7 : 0xd97706,
                        emissiveIntensity: 0.65,
                        roughness: 0.3
                    });
                    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
                    this.scene.add(tubeMesh);
                    this.routes3D.set(route.id, tubeMesh);
                }
            });

            const ordersRes = await fetch('/api/orders');
            const orders = await ordersRes.json();

            this.stops3D.forEach(s => this.scene.remove(s));
            this.stops3D.clear();

            orders.forEach(o => {
                const pos = this.gpsToWorld(o.destination_lat, o.destination_lng);
                const stopGroup = new THREE.Group();
                stopGroup.position.set(pos.x, 0.25, pos.z);

                const isDelivered = o.status === 'delivered';
                const ringMat = new THREE.MeshBasicMaterial({
                    color: isDelivered ? 0x10b981 : 0xd97706,
                    wireframe: true
                });
                const ringGeo = new THREE.RingGeometry(2.5, 4.0, 16);
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = -Math.PI / 2;
                stopGroup.add(ring);

                const pinGeo = new THREE.ConeGeometry(1.2, 3.8, 6);
                const pinMat = new THREE.MeshStandardMaterial({
                    color: isDelivered ? 0x10b981 : 0xd97706,
                    emissive: isDelivered ? 0x10b981 : 0xd97706,
                    emissiveIntensity: 0.4
                });
                const pin = new THREE.Mesh(pinGeo, pinMat);
                pin.position.y = 3.6;
                pin.rotation.x = Math.PI;
                stopGroup.add(pin);

                this.scene.add(stopGroup);
                this.stops3D.set(o.id, stopGroup);
            });

        } catch (err) {
            console.error('Error loading 3D routes & stops', err);
        }
    }

    onPointerClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        for (let hit of intersects) {
            let current = hit.object;
            while (current && current !== this.scene) {
                if (current.userData && current.userData.vehicleData) {
                    const veh = current.userData.vehicleData;
                    this.selectVehicle(veh);
                    return;
                }
                if (current.userData && current.userData.landmarkData) {
                    const landmark = current.userData.landmarkData;
                    this.showLandmarkQuickCard(landmark);
                    return;
                }
                current = current.parent;
            }
        }
    }

    selectVehicle(veh) {
        this.selectedVehicleId = veh.vehicle_id;
        this.showVehicleQuickCard(veh);

        const vehMesh = this.vehicles3D.get(veh.vehicle_id);
        if (vehMesh) {
            const targetCam = new THREE.Vector3(vehMesh.position.x + 28, 38, vehMesh.position.z + 42);
            this.camera.position.lerp(targetCam, 0.3);
            this.controls.target.lerp(vehMesh.position, 0.4);
        }
    }

    showVehicleQuickCard(veh) {
        const card = document.getElementById('veh-quick-card');
        if (!card) return;

        document.getElementById('vqc-plate').textContent = veh.plate_number;
        document.getElementById('vqc-model').textContent = veh.model || veh.vehicle_type;
        document.getElementById('vqc-type').textContent = veh.vehicle_type;
        document.getElementById('vqc-driver').textContent = veh.driver_name || "Unassigned";
        document.getElementById('vqc-speed').textContent = `${Math.round(veh.speed_kmh || 0)} km/h`;
        document.getElementById('vqc-fuel').textContent = `${Math.round(veh.battery_fuel_pct)}%`;
        document.getElementById('vqc-fuel-bar').style.width = `${Math.round(veh.battery_fuel_pct)}%`;
        document.getElementById('vqc-status').textContent = (veh.status || 'IDLE').toUpperCase();
        document.getElementById('vqc-next').textContent = veh.next_stop_address || "Stationed at Depot";

        card.classList.remove('hidden');
    }

    showLandmarkQuickCard(landmark) {
        const card = document.getElementById('landmark-quick-card');
        if (!card) return;

        document.getElementById('lqc-name').textContent = landmark.name;
        document.getElementById('lqc-zone').textContent = landmark.zone || 'University of Ibadan Facility';
        document.getElementById('lqc-coords').textContent = `${landmark.lat.toFixed(5)}, ${landmark.lng.toFixed(5)}`;

        card.classList.remove('hidden');
    }

    followVehicle(vehicleId) {
        if (this.followedVehicleId === vehicleId) {
            this.followedVehicleId = null;
            if (typeof showToast === 'function') showToast("Chase Camera detached to free orbit", "info");
        } else {
            this.followedVehicleId = vehicleId;
            if (typeof showToast === 'function') showToast(`Tracking vehicle in 3D Chase Camera`, "info");
        }
    }

    setCameraAngle(angle) {
        this.setCameraPreset(angle);
    }

    setCameraPreset(preset) {
        this.followedVehicleId = null;
        if (preset === 'bird') {
            this.camera.position.set(0, 240, 340);
            this.controls.target.set(0, 0, 0);
        } else if (preset === 'street') {
            this.camera.position.set(0, 24, 70);
            this.controls.target.set(0, 8, -25);
        } else if (preset === 'top') {
            this.camera.position.set(0, 480, 0.1);
            this.controls.target.set(0, 0, 0);
        } else if (preset === 'depot') {
            this.camera.position.set(-15, 32, 70);
            this.controls.target.set(0, 4, 18);
        }
        this.controls.update();
    }

    onWindowResize() {
        if (!this.container || !this.camera || !this.renderer) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(() => this.animate());

        if (this.controls) {
            this.controls.update();
        }

        this.stops3D.forEach(sg => {
            sg.rotation.y += 0.015;
        });

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.remove();
        }
    }
}
