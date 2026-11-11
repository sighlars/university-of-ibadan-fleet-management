/**
 * UI-FleetFlow 3D Digital Twin Engine (Three.js)
 * Real-time 3D University of Ibadan Campus Simulation with:
 * - High-fidelity daylight campus environment
 * - Real OpenStreetMap 16-tile georeferenced ground draped onto 3D terrain
 * - 38 authentic University of Ibadan architectural landmarks
 * - 16 real campus road networks with asphalt ribbons and markings
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
        this.scene.fog = new THREE.FogExp2(0xdbeafe, 0.0009);

        // 2. Camera: Wide-angle perspective overlooking campus
        this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 4000);
        this.camera.position.set(0, 220, 310);

        // 3. WebGL Renderer with PBR tone mapping & soft shadows
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.container.appendChild(this.renderer.domElement);

        // 4. OrbitControls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 1100;
        this.controls.target.set(0, 0, 0);

        // 5. Environment & Campus Architecture
        this.setupLighting();
        this.buildCampusTerrain();
        this.buildRoadNetwork();
        this.buildLandmarkBuildings();
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
        const sun = new THREE.DirectionalLight(0xfffbeb, 1.6);
        sun.position.set(280, 420, 220);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 1200;
        const d = 450;
        sun.shadow.camera.left = -d;
        sun.shadow.camera.right = d;
        sun.shadow.camera.top = d;
        sun.shadow.camera.bottom = -d;
        sun.shadow.bias = -0.0004;
        this.scene.add(sun);

        // Soft sky rim light
        const rim = new THREE.DirectionalLight(0x93c5fd, 0.45);
        rim.position.set(-240, 160, -240);
        this.scene.add(rim);
    }

    buildCampusTerrain() {
        // 1. Broad Base Ground Plane for Infinite Horizon in Light Mode
        const baseGeo = new THREE.PlaneGeometry(3500, 3500);
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
                // Compute exact geographic bounding box for this OSM tile
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
                tileMesh.position.set(pos.x, 0.06, pos.z);
                tileMesh.receiveShadow = true;
                this.scene.add(tileMesh);
            }
        }

        // Subtle CAD Digital Twin Coordinate Grid Overlay
        const grid = new THREE.GridHelper(1600, 80, 0x0284c7, 0x94a3b8);
        grid.position.y = 0.08;
        grid.material.opacity = 0.15;
        grid.material.transparent = true;
        this.scene.add(grid);
    }

    buildRoadNetwork() {
        // 16 Real University of Ibadan Campus Road Arteries
        // Providing sleek 3D navigation road guides that sit cleanly on top of the real OSM ground map
        const roads = [
            { from: [7.4429, 3.8996], to: [7.4485, 3.8998], width: 14, name: "University Crescent" },
            { from: [7.4452, 3.8990], to: [7.4480, 3.9010], width: 12, name: "Oduduwa Road" },
            { from: [7.4485, 3.8998], to: [7.4520, 3.8985], width: 12, name: "Technology Way" },
            { from: [7.4520, 3.8985], to: [7.4530, 3.9010], width: 11, name: "Awo Hall Road" },
            { from: [7.4478, 3.9008], to: [7.4495, 3.9035], width: 11, name: "Science Road" },
            { from: [7.4482, 3.9001], to: [7.4490, 3.8965], width: 11, name: "Amina Way" },
            { from: [7.4520, 3.8985], to: [7.4560, 3.8920], width: 14, name: "Benue Road" },
            { from: [7.4545, 3.8955], to: [7.4505, 3.8960], width: 11, name: "Niger Road" },
            { from: [7.4460, 3.9010], to: [7.4470, 3.9015], width: 10, name: "Sankore Avenue" },
            { from: [7.4435, 3.9025], to: [7.4445, 3.9055], width: 11, name: "Barth Road" },
            { from: [7.4445, 3.9055], to: [7.4410, 3.9040], width: 10, name: "Parry Road" },
            { from: [7.4452, 3.8990], to: [7.4462, 3.8970], width: 11, name: "Health Sciences Link" },
            { from: [7.4490, 3.8965], to: [7.4505, 3.8960], width: 10, name: "Appleton Road" },
            { from: [7.4520, 3.8985], to: [7.4550, 3.8965], width: 10, name: "El-Kanemi Road" },
            { from: [7.4492, 3.8995], to: [7.4495, 3.9020], width: 10, name: "Danfodio Road" },
            { from: [7.4435, 3.9025], to: [7.4415, 3.9030], width: 9, name: "Awba Dam Road" },
            { from: [7.4448, 3.8985], to: [7.4455, 3.8995], width: 12, name: "Central Depot Yard Loop" }
        ];

        const roadMat = new THREE.MeshStandardMaterial({
            color: 0x334155, // Clean asphalt slate
            roughness: 0.75,
            metalness: 0.15,
            transparent: true,
            opacity: 0.55 // Semi-transparent so OSM road labels and curves show through clearly!
        });

        roads.forEach(r => {
            const p1 = this.gpsToWorld(r.from[0], r.from[1]);
            const p2 = this.gpsToWorld(r.to[0], r.to[1]);

            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const length = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dx, dz);

            // Main Asphalt Ribbon
            const roadGeo = new THREE.PlaneGeometry(r.width, length);
            const roadMesh = new THREE.Mesh(roadGeo, roadMat);
            roadMesh.rotation.x = -Math.PI / 2;
            roadMesh.rotation.z = -angle;
            roadMesh.position.set((p1.x + p2.x) / 2, 0.10, (p1.z + p2.z) / 2);
            roadMesh.receiveShadow = true;
            this.scene.add(roadMesh);

            // Center Dashed Lane Markings
            const dashMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, opacity: 0.85, transparent: true });
            const dashGeo = new THREE.PlaneGeometry(0.7, length * 0.9);
            const dashMesh = new THREE.Mesh(dashGeo, dashMat);
            dashMesh.rotation.x = -Math.PI / 2;
            dashMesh.rotation.z = -angle;
            dashMesh.position.set((p1.x + p2.x) / 2, 0.12, (p1.z + p2.z) / 2);
            this.scene.add(dashMesh);
        });

        // Paved Central Fleet Depot Parking Yard with 6 Numbered Parking Bays
        this.buildDepotFleetBayPavement();
    }

    buildDepotFleetBayPavement() {
        const depotPos = this.gpsToWorld(this.originLat, this.originLng);

        // Large Paved Depot Logistics Apron
        const yardGeo = new THREE.PlaneGeometry(80, 50);
        const yardMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 });
        const yard = new THREE.Mesh(yardGeo, yardMat);
        yard.rotation.x = -Math.PI / 2;
        yard.position.set(depotPos.x, 0.11, depotPos.z + 18);
        yard.receiveShadow = true;
        this.scene.add(yard);

        // Yellow Parking Bay Slots for 6 Vehicles (Bay 1 to 6)
        this.depotBayPositions.forEach(b => {
            const slotGeo = new THREE.PlaneGeometry(8, 14);
            const slotMat = new THREE.MeshBasicMaterial({ color: 0xd97706, wireframe: true });
            const slot = new THREE.Mesh(slotGeo, slotMat);
            slot.rotation.x = -Math.PI / 2;
            slot.position.set(depotPos.x + b.x, 0.13, depotPos.z + b.z);
            this.scene.add(slot);
        });
    }

    buildLandmarkBuildings() {
        // 38 Authentic Real University of Ibadan Campus Architectural Landmarks
        const landmarks = [
            // Administrative & Central Core
            { id: "kdl", name: "Kenneth Dike Library (KDL)", lat: 7.4478, lng: 3.9008, w: 32, d: 36, h: 22, color: 0x94a3b8, label: "KDL Library", zone: "Academic Core" },
            { id: "trenchard", name: "Trenchard Hall & Tower", lat: 7.4482, lng: 3.9001, w: 38, d: 24, h: 24, color: 0xcbd5e1, label: "Trenchard Hall", zone: "Academic Core", tower: true },
            { id: "senate", name: "Tekena Tamuno Senate Building", lat: 7.4485, lng: 3.8998, w: 24, d: 24, h: 42, color: 0x002147, label: "Senate Admin Tower", zone: "Central Administration" },
            { id: "depot", name: "UI Central Logistics Hub", lat: 7.4452, lng: 3.8990, w: 38, d: 24, h: 14, color: 0x002147, label: "Central Fleet Depot", zone: "Logistics Hub", hasBays: true },
            { id: "bookshop", name: "UI Bookshop & Publishing House", lat: 7.4482, lng: 3.9012, w: 22, d: 18, h: 12, color: 0x64748b, label: "UI Bookshop", zone: "Commercial" },
            { id: "sub", name: "Student Union Building (SUB)", lat: 7.4472, lng: 3.8988, w: 28, d: 20, h: 14, color: 0x475569, label: "Student Union (SUB)", zone: "Student Affairs" },
            { id: "maingate", name: "UI Main Gate & Jubilee Arch", lat: 7.4429, lng: 3.8996, w: 34, d: 12, h: 16, color: 0xc59b27, label: "UI Main Gate", zone: "Campus Gateway" },
            { id: "secondgate", name: "UI Second Gate (Sango Link)", lat: 7.4580, lng: 3.8890, w: 26, d: 10, h: 14, color: 0x64748b, label: "UI 2nd Gate", zone: "Campus Gateway" },

            // Faculties & Academic Complexes
            { id: "tech", name: "Faculty of Technology", lat: 7.4520, lng: 3.8985, w: 42, d: 28, h: 20, color: 0x334155, label: "Faculty of Technology", zone: "Engineering & Applied Tech" },
            { id: "science", name: "Faculty of Science Quadrangle", lat: 7.4495, lng: 3.9020, w: 36, d: 32, h: 18, color: 0x475569, label: "Faculty of Science", zone: "Pure Sciences" },
            { id: "pharmacy", name: "Faculty of Pharmacy", lat: 7.4490, lng: 3.9035, w: 26, d: 20, h: 16, color: 0x64748b, label: "Faculty of Pharmacy", zone: "Medical Sciences" },
            { id: "socialsciences", name: "Faculty of The Social Sciences", lat: 7.4465, lng: 3.8978, w: 34, d: 26, h: 16, color: 0x475569, label: "Social Sciences", zone: "Social Sciences" },
            { id: "arts", name: "Faculty of Arts & Theatre Arts", lat: 7.4480, lng: 3.9002, w: 30, d: 24, h: 15, color: 0x64748b, label: "Faculty of Arts", zone: "Humanities" },
            { id: "law", name: "Faculty of Law & Law Library", lat: 7.4502, lng: 3.8990, w: 28, d: 22, h: 16, color: 0x334155, label: "Faculty of Law", zone: "Legal Studies" },
            { id: "education", name: "Faculty of Education", lat: 7.4460, lng: 3.9010, w: 30, d: 22, h: 15, color: 0x64748b, label: "Faculty of Education", zone: "Education" },
            { id: "agric", name: "Faculty of Agriculture & Forestry", lat: 7.4450, lng: 3.9025, w: 32, d: 24, h: 15, color: 0x2e633d, label: "Faculty of Agriculture", zone: "Agricultural Sciences" },
            { id: "vet", name: "Faculty of Veterinary Medicine", lat: 7.4442, lng: 3.9018, w: 28, d: 22, h: 15, color: 0x475569, label: "Veterinary Medicine", zone: "Veterinary Complex" },
            { id: "med", name: "College of Medicine (UCH Liaison)", lat: 7.4470, lng: 3.9015, w: 32, d: 24, h: 18, color: 0x0284c7, label: "College of Medicine", zone: "Health Sciences" },
            { id: "postgrad", name: "Postgraduate College (Morohundiya)", lat: 7.4505, lng: 3.8960, w: 30, d: 24, h: 16, color: 0x475569, label: "Postgraduate College", zone: "Postgraduate School" },

            // Healthcare & Research Centers
            { id: "jaja", name: "Jaja Health Clinic", lat: 7.4462, lng: 3.8970, w: 26, d: 20, h: 14, color: 0xf8fafc, label: "Jaja Health Clinic", zone: "Health Services", isHospital: true },
            { id: "icc", name: "UI International Conference Centre", lat: 7.4560, lng: 3.8920, w: 46, d: 32, h: 22, color: 0xc59b27, label: "UI ICC Pavilion", zone: "Conference & Events" },
            { id: "ventures", name: "UI Ventures (Bakery & Water)", lat: 7.4435, lng: 3.9025, w: 36, d: 24, h: 14, color: 0xd97706, label: "UI Ventures Commercial", zone: "Commercial Services" },
            { id: "farm", name: "Teaching & Research Farm", lat: 7.4445, lng: 3.9055, w: 38, d: 28, h: 12, color: 0x2e633d, label: "UI Research Farm", zone: "Agricultural Operations" },
            { id: "zoo", name: "University Zoological Gardens (Zoo)", lat: 7.4420, lng: 3.9010, w: 34, d: 26, h: 12, color: 0x3d7042, label: "UI Zoological Gardens", zone: "Conservation" },
            { id: "botanical", name: "UI Botanical Gardens & Awba Lake", lat: 7.4410, lng: 3.9040, w: 28, d: 20, h: 11, color: 0x3d7042, label: "Botanical Gardens", zone: "Conservation" },
            { id: "stadium", name: "UI Olympic Sports Stadium", lat: 7.4490, lng: 3.8965, w: 48, d: 30, h: 16, color: 0x334155, label: "UI Sports Stadium", zone: "Athletics" },

            // Student Residential Halls
            { id: "bello", name: "Sultan Bello Hall", lat: 7.4478, lng: 3.8992, w: 28, d: 22, h: 15, color: 0x475569, label: "Sultan Bello Hall", zone: "Student Residences" },
            { id: "mellanby", name: "Mellanby Hall", lat: 7.4488, lng: 3.8990, w: 28, d: 20, h: 15, color: 0x475569, label: "Mellanby Hall", zone: "Student Residences" },
            { id: "tedder", name: "Tedder Hall", lat: 7.4485, lng: 3.8988, w: 28, d: 20, h: 15, color: 0x475569, label: "Tedder Hall", zone: "Student Residences" },
            { id: "kuti", name: "Kuti Hall", lat: 7.4492, lng: 3.8995, w: 28, d: 20, h: 15, color: 0x475569, label: "Kuti Hall", zone: "Student Residences" },
            { id: "queen", name: "Queen Elizabeth II Hall", lat: 7.4455, lng: 3.8985, w: 30, d: 22, h: 15, color: 0x475569, label: "Queen Elizabeth Hall", zone: "Student Residences" },
            { id: "idia", name: "Queen Idia Hall", lat: 7.4515, lng: 3.8945, w: 32, d: 22, h: 16, color: 0x475569, label: "Queen Idia Hall", zone: "Student Residences" },
            { id: "zik", name: "Nnamdi Azikiwe (Zik) Hall", lat: 7.4545, lng: 3.8955, w: 34, d: 24, h: 16, color: 0x334155, label: "Zik Hall Quad", zone: "Student Residences" },
            { id: "indy", name: "Independence (Indy) Hall", lat: 7.4550, lng: 3.8965, w: 34, d: 24, h: 16, color: 0x334155, label: "Indy Hall Tower", zone: "Student Residences" },
            { id: "awo", name: "Obafemi Awolowo (Awo) Hall", lat: 7.4530, lng: 3.9010, w: 34, d: 24, h: 16, color: 0x475569, label: "Awo Hall Complex", zone: "Student Residences" },

            // Religious Worship Centres
            { id: "resurrection", name: "Chapel of the Resurrection", lat: 7.4475, lng: 3.9000, w: 24, d: 20, h: 18, color: 0xcbd5e1, label: "Resurrection Chapel", zone: "Religious Centre" },
            { id: "catholic", name: "Our Lady Seat of Wisdom Catholic Church", lat: 7.4480, lng: 3.8980, w: 24, d: 20, h: 16, color: 0xcbd5e1, label: "Catholic Chaplaincy", zone: "Religious Centre" },
            { id: "mosque", name: "UI Central Mosque", lat: 7.4468, lng: 3.8980, w: 26, d: 22, h: 18, color: 0x10b981, label: "UI Central Mosque", zone: "Religious Centre" }
        ];

        this.landmarks3D = [];

        landmarks.forEach(b => {
            const pos = this.gpsToWorld(b.lat, b.lng);
            const group = new THREE.Group();
            group.position.set(pos.x, 0, pos.z);
            group.userData.landmarkData = b;

            // Main Building Mass
            const mat = new THREE.MeshStandardMaterial({
                color: b.color,
                roughness: 0.5,
                metalness: 0.2
            });
            const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = b.h / 2;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);

            // Roof Trim
            const roofGeo = new THREE.BoxGeometry(b.w + 1.2, 1.2, b.d + 1.2);
            const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
            const roof = new THREE.Mesh(roofGeo, roofMat);
            roof.position.y = b.h + 0.6;
            roof.castShadow = true;
            group.add(roof);

            // Architectural Accents: Clock Tower on Trenchard Hall
            if (b.tower) {
                const towerGeo = new THREE.BoxGeometry(10, 18, 10);
                const towerMat = new THREE.MeshStandardMaterial({ color: 0xc59b27, roughness: 0.3 });
                const tower = new THREE.Mesh(towerGeo, towerMat);
                tower.position.set(0, b.h + 9, 0);
                tower.castShadow = true;
                group.add(tower);

                const spireGeo = new THREE.ConeGeometry(5, 10, 4);
                const spireMat = new THREE.MeshStandardMaterial({ color: 0x002147 });
                const spire = new THREE.Mesh(spireGeo, spireMat);
                spire.position.set(0, b.h + 23, 0);
                group.add(spire);
            }

            // Floating Campus Signboard Billboard
            const labelSprite = this.createLandmarkBillboard(b.label || b.name);
            labelSprite.position.set(0, b.h + (b.tower ? 32 : 12), 0);
            group.add(labelSprite);

            this.scene.add(group);
            this.landmarks3D.push(group);
        });
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

    /**
     * Creates authentic procedural 3D vehicle models representing genuine Nigerian campus utility assets:
     * - UI-01-DSP: Bajaj Boxer BM 100 Courier Delivery Bike (2 wheels, courier parcel box)
     * - UI-02-MED: TVS HLX 125 Laboratory Dispatch Bike (2 wheels, medical transport coolbox)
     * - UI-03-KEKE: Piaggio Ape Cargo Delivery Tricycle (3 wheels: 1 front, 2 rear, open cargo bed)
     * - UI-04-VAN: Suzuki Super Carry 1.0L Mini Delivery Van (cabover mini van)
     * - UI-05-BUS: Toyota HiAce 2.7L Commuter Logistics Van (classic Nigerian campus van)
     * - UI-06-WKS: Toyota Hilux 2.5 D-4D Workhorse Pickup (rugged utility single-cab pickup)
     */
    createProceduralVehicleMesh(vType, plate, initialData = {}) {
        const group = new THREE.Group();
        const pUpper = (plate || "").toUpperCase();
        const mLower = (initialData.model || "").toLowerCase();
        const tLower = (vType || "").toLowerCase();

        group.userData.wheels = [];
        let totalHeight = 3.5;

        // ==========================================
        // 1 & 2. MOTORCYCLE / DISPATCH BIKES
        // UI-01-DSP (Bajaj Boxer) & UI-02-MED (TVS HLX)
        // ==========================================
        if (pUpper.includes("01") || pUpper.includes("02") || mLower.includes("bike") || mLower.includes("bajaj") || mLower.includes("tvs")) {
            const isMedical = pUpper.includes("MED") || pUpper.includes("02") || mLower.includes("lab");
            totalHeight = 3.2;

            // Slender Bike Chassis / Frame
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
            const frameGeo = new THREE.BoxGeometry(0.5, 0.7, 3.4);
            const frame = new THREE.Mesh(frameGeo, frameMat);
            frame.position.y = 1.1;
            frame.castShadow = true;
            group.add(frame);

            // Fuel Tank
            const tankMat = new THREE.MeshStandardMaterial({
                color: isMedical ? 0xef4444 : 0x15803d, // Red for TVS Medical, Green for UI Courier
                roughness: 0.3,
                metalness: 0.5
            });
            const tankGeo = new THREE.BoxGeometry(0.8, 0.6, 1.3);
            const tank = new THREE.Mesh(tankGeo, tankMat);
            tank.position.set(0, 1.5, -0.4);
            tank.castShadow = true;
            group.add(tank);

            // Black Leather Saddle Seat
            const seatMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
            const seatGeo = new THREE.BoxGeometry(0.7, 0.35, 1.5);
            const seat = new THREE.Mesh(seatGeo, seatMat);
            seat.position.set(0, 1.45, 0.6);
            seat.castShadow = true;
            group.add(seat);

            // Handlebars (Chrome horizontal bar with black grips)
            const barMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.2 });
            const barGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8);
            const bar = new THREE.Mesh(barGeo, barMat);
            bar.rotation.z = Math.PI / 2;
            bar.position.set(0, 1.9, -1.2);
            group.add(bar);

            // Front Fork Suspension
            const forkGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8);
            const leftFork = new THREE.Mesh(forkGeo, barMat);
            leftFork.position.set(-0.25, 1.1, -1.7);
            const rightFork = new THREE.Mesh(forkGeo, barMat);
            rightFork.position.set(0.25, 1.1, -1.7);
            group.add(leftFork);
            group.add(rightFork);

            // Bright Round Headlight (Facing forward: -Z)
            const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8db, emissiveIntensity: 2.2 });
            const headGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
            const headlight = new THREE.Mesh(headGeo, headMat);
            headlight.rotation.x = Math.PI / 2;
            headlight.position.set(0, 1.6, -1.6);
            group.add(headlight);

            // Rear Red Taillight (+Z)
            const tailMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 2.0 });
            const tailGeo = new THREE.BoxGeometry(0.3, 0.2, 0.1);
            const taillight = new THREE.Mesh(tailGeo, tailMat);
            taillight.position.set(0, 1.3, 2.1);
            group.add(taillight);

            // Rear Top Courier Transport Box
            const boxColor = isMedical ? 0xf8fafc : 0xc59b27; // Clean white medical coolbox or UI Gold dispatch parcel box
            const boxMat = new THREE.MeshStandardMaterial({ color: boxColor, roughness: 0.4 });
            const boxGeo = new THREE.BoxGeometry(1.4, 1.2, 1.4);
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.set(0, 2.0, 1.3);
            box.castShadow = true;
            group.add(box);

            // Box Medical / Courier Accent Lid
            const lidMat = new THREE.MeshStandardMaterial({ color: isMedical ? 0xdc2626 : 0x002147 });
            const lidGeo = new THREE.BoxGeometry(1.45, 0.15, 1.45);
            const lid = new THREE.Mesh(lidGeo, lidMat);
            lid.position.set(0, 2.65, 1.3);
            group.add(lid);

            // 2 Motorcycle Wheels (Front at -Z, Rear at +Z)
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
        // ==========================================
        // 3. PIAGGIO APE CARGO TRICYCLE (KEKE)
        // UI-03-KEKE: 3 Wheels (1 Front, 2 Rear) + Yellow Canopy + Rear Tray
        // ==========================================
        else if (pUpper.includes("03") || pUpper.includes("KEKE") || mLower.includes("keke") || mLower.includes("tricycle") || mLower.includes("ape")) {
            totalHeight = 3.8;

            // Front Passenger Cabin Body (Classic Commercial Keke Yellow)
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.35, metalness: 0.4 });
            const cabGeo = new THREE.BoxGeometry(2.4, 2.0, 2.2);
            const cab = new THREE.Mesh(cabGeo, bodyMat);
            cab.position.set(0, 1.5, -0.6);
            cab.castShadow = true;
            group.add(cab);

            // Front Windshield
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, transparent: true, opacity: 0.8 });
            const windGeo = new THREE.BoxGeometry(2.2, 1.2, 0.1);
            const windshield = new THREE.Mesh(windGeo, glassMat);
            windshield.position.set(0, 2.0, -1.7);
            group.add(windshield);

            // Black Vinyl Canopy Roof
            const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
            const roofGeo = new THREE.BoxGeometry(2.5, 0.2, 2.4);
            const roof = new THREE.Mesh(roofGeo, roofMat);
            roof.position.set(0, 2.6, -0.6);
            roof.castShadow = true;
            group.add(roof);

            // Single Center Round Headlight in front (-Z)
            const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8db, emissiveIntensity: 2.0 });
            const headGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16);
            const headlight = new THREE.Mesh(headGeo, headMat);
            headlight.rotation.x = Math.PI / 2;
            headlight.position.set(0, 1.4, -1.75);
            group.add(headlight);

            // Rear Open Metal Cargo Tray (carrying parcels)
            const trayMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 });
            const trayGeo = new THREE.BoxGeometry(2.8, 0.9, 2.6);
            const tray = new THREE.Mesh(trayGeo, trayMat);
            tray.position.set(0, 1.0, 1.5);
            tray.castShadow = true;
            group.add(tray);

            // Parcels inside tray
            const parcelMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8 });
            const p1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.9), parcelMat);
            p1.position.set(-0.6, 1.6, 1.4);
            group.add(p1);
            const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.1), parcelMat);
            p2.position.set(0.6, 1.65, 1.6);
            group.add(p2);

            // Taillights (+Z)
            const tailMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.8 });
            const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), tailMat);
            tl.position.set(-1.1, 0.9, 2.82);
            const tr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), tailMat);
            tr.position.set(1.1, 0.9, 2.82);
            group.add(tl);
            group.add(tr);

            // 3 WHEELS: 1 Single Front Wheel at center, 2 Rear Wheels
            const wheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.35, 16);
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.7, roughness: 0.3 });

            const kekeWheelConfigs = [
                [0, 0.65, -1.6],     // 1 Front Wheel
                [-1.3, 0.65, 1.6],   // Rear Left Wheel
                [1.3, 0.65, 1.6]     // Rear Right Wheel
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
        // ==========================================
        // 4. SUZUKI SUPER CARRY 1.0L MINI DELIVERY VAN
        // UI-04-VAN: Compact cabover Kei van (White/Silver)
        // ==========================================
        else if (pUpper.includes("04") || mLower.includes("carry") || (tLower.includes("shuttle") && pUpper.includes("VAN"))) {
            totalHeight = 4.2;

            // Compact Japanese Mini Van Body
            const vanMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.4 });
            const bodyGeo = new THREE.BoxGeometry(3.2, 2.6, 6.2);
            const body = new THREE.Mesh(bodyGeo, vanMat);
            body.position.set(0, 1.7, 0);
            body.castShadow = true;
            group.add(body);

            // Vertical Front Cabover Windshield
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, transparent: true, opacity: 0.85 });
            const windGeo = new THREE.BoxGeometry(2.9, 1.2, 0.1);
            const windshield = new THREE.Mesh(windGeo, glassMat);
            windshield.position.set(0, 2.2, -3.12);
            group.add(windshield);

            // Front Bumper & Black Grille
            const grillMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
            const grill = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.7, 0.2), grillMat);
            grill.position.set(0, 0.9, -3.15);
            group.add(grill);

            // Headlights (-Z)
            const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8db, emissiveIntensity: 2.0 });
            const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.1), lightMat);
            hl1.position.set(-1.1, 1.3, -3.16);
            const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.1), lightMat);
            hl2.position.set(1.1, 1.3, -3.16);
            group.add(hl1);
            group.add(hl2);

            // Rear Roll-up Doors (+Z)
            const rearDoor = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 }));
            rearDoor.position.set(0, 1.6, 3.12);
            group.add(rearDoor);

            // Taillights (+Z)
            const tailMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.8 });
            const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.1), tailMat);
            tl1.position.set(-1.3, 1.2, 3.16);
            const tl2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.1), tailMat);
            tl2.position.set(1.3, 1.2, 3.16);
            group.add(tl1);
            group.add(tl2);

            // 4 Mini Van Wheels
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
        // ==========================================
        // 5. TOYOTA HIACE 2.7L COMMUTER LOGISTICS VAN
        // UI-05-BUS: Classic Nigerian White Commuter Van with UI Crest Stripe
        // ==========================================
        else if (pUpper.includes("05") || pUpper.includes("BUS") || mLower.includes("hiace") || tLower.includes("shuttle")) {
            totalHeight = 4.8;

            // Long Aerodynamic HiAce Van Body
            const vanMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.5 });
            const bodyGeo = new THREE.BoxGeometry(4.2, 3.2, 9.8);
            const body = new THREE.Mesh(bodyGeo, vanMat);
            body.position.set(0, 2.1, 0);
            body.castShadow = true;
            group.add(body);

            // University of Ibadan Gold & Navy Logistics Stripe Decal
            const stripeMat = new THREE.MeshBasicMaterial({ color: 0xc59b27 });
            const leftStripe = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 0.35), stripeMat);
            leftStripe.position.set(-2.12, 1.8, 0);
            leftStripe.rotation.y = -Math.PI / 2;
            group.add(leftStripe);

            const rightStripe = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 0.35), stripeMat);
            rightStripe.position.set(2.12, 1.8, 0);
            rightStripe.rotation.y = Math.PI / 2;
            group.add(rightStripe);

            // Aerodynamic Sloped Front Windshield
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, transparent: true, opacity: 0.88 });
            const windGeo = new THREE.BoxGeometry(3.9, 1.6, 0.2);
            const windshield = new THREE.Mesh(windGeo, glassMat);
            windshield.position.set(0, 2.7, -4.7);
            windshield.rotation.x = -Math.PI / 16;
            group.add(windshield);

            // Side Passenger Tinted Windows
            const sideWinGeo = new THREE.BoxGeometry(0.1, 1.1, 6.0);
            const sideWinLeft = new THREE.Mesh(sideWinGeo, glassMat);
            sideWinLeft.position.set(-2.12, 2.6, 0.5);
            const sideWinRight = new THREE.Mesh(sideWinGeo, glassMat);
            sideWinRight.position.set(2.12, 2.6, 0.5);
            group.add(sideWinLeft);
            group.add(sideWinRight);

            // Dual Halogen Headlights (-Z)
            const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8db, emissiveIntensity: 2.2 });
            const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.1), lightMat);
            hl1.position.set(-1.4, 1.5, -4.95);
            const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.1), lightMat);
            hl2.position.set(1.4, 1.5, -4.95);
            group.add(hl1);
            group.add(hl2);

            // Rear Taillights (+Z)
            const tailMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 2.0 });
            const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.1), tailMat);
            tl1.position.set(-1.7, 1.9, 4.95);
            const tl2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.1), tailMat);
            tl2.position.set(1.7, 1.9, 4.95);
            group.add(tl1);
            group.add(tl2);

            // 4 Van Wheels
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
        // ==========================================
        // 6. TOYOTA HILUX 2.5 D-4D WORKHORSE PICKUP
        // UI-06-WKS: Rugged Single-Cab Works Pickup in Amber Gold
        // ==========================================
        else {
            totalHeight = 4.2;

            // Front Single-Cab (Amber Gold Utility Livery)
            const cabMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.4 });
            const cabGeo = new THREE.BoxGeometry(4.2, 2.4, 4.4);
            const cab = new THREE.Mesh(cabGeo, cabMat);
            cab.position.set(0, 2.0, -1.8);
            cab.castShadow = true;
            group.add(cab);

            // Front Hood & Rugged Bull Bar
            const hoodGeo = new THREE.BoxGeometry(4.0, 1.4, 2.4);
            const hood = new THREE.Mesh(hoodGeo, cabMat);
            hood.position.set(0, 1.5, -4.2);
            hood.castShadow = true;
            group.add(hood);

            const bullBarMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
            const bullBar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.0, 0.3), bullBarMat);
            bullBar.position.set(0, 1.2, -5.5);
            group.add(bullBar);

            // Windshield
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, transparent: true, opacity: 0.85 });
            const windGeo = new THREE.BoxGeometry(3.8, 1.3, 0.1);
            const windshield = new THREE.Mesh(windGeo, glassMat);
            windshield.position.set(0, 2.4, -3.9);
            group.add(windshield);

            // Rear Open Pickup Bed
            const bedMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 });
            const bedGeo = new THREE.BoxGeometry(4.0, 1.5, 4.8);
            const bed = new THREE.Mesh(bedGeo, bedMat);
            bed.position.set(0, 1.5, 2.6);
            bed.castShadow = true;
            group.add(bed);

            // Black Heavy-Duty Roll Bar in Bed
            const barMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
            const rollBar = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.0, 0.2), barMat);
            rollBar.position.set(0, 2.6, 0.5);
            group.add(rollBar);

            // Headlights (-Z)
            const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8db, emissiveIntensity: 2.2 });
            const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.1), lightMat);
            hl1.position.set(-1.4, 1.5, -5.45);
            const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.1), lightMat);
            hl2.position.set(1.4, 1.5, -5.45);
            group.add(hl1);
            group.add(hl2);

            // Taillights (+Z)
            const tailMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 2.0 });
            const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.1), tailMat);
            tl1.position.set(-1.6, 1.6, 5.05);
            const tl2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.1), tailMat);
            tl2.position.set(1.6, 1.6, 5.05);
            group.add(tl1);
            group.add(tl2);

            // 4 Raised Pickup Tires
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

        // ==========================================
        // Dynamic Floating Telemetry & Fuel Gauge Billboard Sprite
        // ==========================================
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

        // 1. Background Pill Container
        ctx.fillStyle = 'rgba(0, 33, 71, 0.94)'; // Deep UI Navy
        ctx.beginPath();
        ctx.roundRect(4, 4, 372, 112, 14);
        ctx.fill();

        ctx.strokeStyle = '#c59b27'; // UI Gold Border
        ctx.lineWidth = 3;
        ctx.stroke();

        // 2. Top Row: Plate & Status Badge
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(plate || "UI-FLEET", 18, 36);

        // Status Tag
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

        // 3. Middle Row: Speed Indicator
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText("Speed: ", 18, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px JetBrains Mono, monospace';
        ctx.fillText(`${Math.round(speedKmh || 0)} km/h`, 72, 64);

        // 4. Bottom Row: Animated Fuel / Battery Gauge Bar
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillText(`⛽ Fuel: ${fuel}%`, 18, 92);

        // Fuel Bar Track
        const barX = 145;
        const barY = 80;
        const barW = 215;
        const barH = 14;

        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 4);
        ctx.fill();

        // Fuel Bar Fill
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

            // If vehicle is stationed/idle at depot, park it in its designated outdoor parking bay!
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
                // Instantiate 3D vehicle
                const vehMesh = this.createProceduralVehicleMesh(veh.vehicle_type, veh.plate_number, veh);
                vehMesh.position.set(targetPos.x, 0.15, targetPos.z);
                vehMesh.userData.vehicleData = veh;
                this.scene.add(vehMesh);
                this.vehicles3D.set(id, vehMesh);
            } else {
                const vehMesh = this.vehicles3D.get(id);
                vehMesh.userData.vehicleData = veh;

                // Displacement delta to compute strictly forward velocity heading!
                const dx = targetPos.x - vehMesh.position.x;
                const dz = targetPos.z - vehMesh.position.z;
                const distMoved = Math.hypot(dx, dz);

                // Smooth position lerp
                vehMesh.position.x += dx * 0.25;
                vehMesh.position.z += dz * 0.25;
                vehMesh.position.y = 0.15; // Ensure tires rest directly on road surface

                // STRICT FORWARD ROTATION:
                // Because headlights are at -Z and taillights at +Z,
                // the forward heading angle along velocity vector (dx, dz) is Math.atan2(-dx, -dz).
                // This guarantees the car ALWAYS faces forward in its movement direction and never drives backwards!
                if (distMoved > 0.05) {
                    const forwardAngle = Math.atan2(-dx, -dz);

                    // Shortest-path angle interpolation to prevent 360-spin
                    let diff = forwardAngle - vehMesh.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    vehMesh.rotation.y += diff * 0.25;

                    // Wheel spin animation matching vehicle speed
                    if (vehMesh.userData.wheels) {
                        const rollSpeed = (veh.speed_kmh || 30) * 0.035;
                        vehMesh.userData.wheels.forEach(w => {
                            w.rotation.x -= rollSpeed;
                        });
                    }
                } else if (isStationedAtDepot) {
                    // Smoothly orient facing depot parking bay exit (heading 0)
                    let diff = 0 - vehMesh.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    vehMesh.rotation.y += diff * 0.15;
                }

                // Redraw floating fuel gauge billboard
                this.updateVehicleSprite(vehMesh, veh);

                // Chase Cam Follow
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

            // Clear old routes
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

            // Load Orders Delivery Stops
            const ordersRes = await fetch('/api/orders');
            const orders = await ordersRes.json();

            // Clear old stops
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

                // Floating Pin Cone
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
                // 1. Check if user clicked a Vehicle
                if (current.userData && current.userData.vehicleData) {
                    const veh = current.userData.vehicleData;
                    this.selectVehicle(veh);
                    return;
                }
                // 2. Check if user clicked a Campus Landmark Building
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

        // Smooth camera transition towards vehicle
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
        document.getElementById('lqc-zone').textContent = landmark.zone;
        document.getElementById('lqc-coords').textContent = `${landmark.lat.toFixed(4)}, ${landmark.lng.toFixed(4)}`;

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

    setCameraPreset(preset) {
        this.followedVehicleId = null; // Detach follow
        if (preset === 'bird') {
            this.camera.position.set(0, 220, 310);
            this.controls.target.set(0, 0, 0);
        } else if (preset === 'street') {
            this.camera.position.set(0, 22, 60);
            this.controls.target.set(0, 8, -20);
        } else if (preset === 'top') {
            this.camera.position.set(0, 440, 0.1);
            this.controls.target.set(0, 0, 0);
        } else if (preset === 'depot') {
            this.camera.position.set(-15, 30, 65);
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

        // Animate stop ring pulsation
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
