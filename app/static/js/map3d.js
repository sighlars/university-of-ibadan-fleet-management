/**
 * UI-FleetFlow 3D Digital Twin Engine (Three.js)
 * Real-time 3D University of Ibadan Campus Simulation with:
 * - High-fidelity daylight campus environment
 * - Real OpenStreetMap-style procedural campus ground master plan
 * - 38 authentic University of Ibadan architectural landmarks
 * - 16 real campus road networks with asphalt ribbons and markings
 * - 3D vehicles with spinning wheels, real-time driving simulation,
 *   live floating fuel gauge HUD above each vehicle, and interactive inspection on click.
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
        this.scene.fog = new THREE.FogExp2(0xdbeafe, 0.0011);

        // 2. Camera: Wide-angle perspective overlooking campus
        this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 3500);
        this.camera.position.set(0, 210, 290);

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
        this.controls.maxDistance = 900;
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
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.9);
        this.scene.add(hemiLight);

        // Main Directional Sunlight with Soft PCF Shadows
        const sun = new THREE.DirectionalLight(0xfffbeb, 1.55);
        sun.position.set(280, 400, 200);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 1000;
        const d = 350;
        sun.shadow.camera.left = -d;
        sun.shadow.camera.right = d;
        sun.shadow.camera.top = d;
        sun.shadow.camera.bottom = -d;
        sun.shadow.bias = -0.0004;
        this.scene.add(sun);

        // Soft sky rim light
        const rim = new THREE.DirectionalLight(0x93c5fd, 0.4);
        rim.position.set(-220, 150, -220);
        this.scene.add(rim);
    }

    buildCampusTerrain() {
        // High-Resolution Procedural OpenStreetMap-style Ground Canvas Texture (2048x2048)
        const groundTex = this.createCampusGroundMapTexture();

        const groundGeo = new THREE.PlaneGeometry(1800, 1800, 32, 32);
        const groundMat = new THREE.MeshStandardMaterial({
            map: groundTex,
            roughness: 0.95,
            metalness: 0.05
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Subtle CAD Digital Twin Coordinate Grid Overlay
        const grid = new THREE.GridHelper(1800, 90, 0x94a3b8, 0xcbd5e1);
        grid.position.y = 0.04;
        this.scene.add(grid);
    }

    createCampusGroundMapTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 2048;
        const ctx = canvas.getContext('2d');

        // 1. Campus Base Turf Green
        ctx.fillStyle = '#3b7045';
        ctx.fillRect(0, 0, 2048, 2048);

        // 2. Organic Lawn and Forest Variations
        ctx.fillStyle = '#34663e';
        ctx.beginPath();
        ctx.ellipse(1400, 1400, 500, 400, Math.PI / 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#42784d';
        ctx.beginPath();
        ctx.ellipse(600, 700, 450, 350, -Math.PI / 8, 0, Math.PI * 2);
        ctx.fill();

        // 3. Awba Dam Reservoir (Southeast UI Campus Water Body)
        const waterGrad = ctx.createLinearGradient(1350, 1500, 1900, 1900);
        waterGrad.addColorStop(0, '#0284c7');
        waterGrad.addColorStop(1, '#0369a1');
        ctx.fillStyle = waterGrad;
        ctx.beginPath();
        ctx.ellipse(1650, 1650, 320, 220, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 6;
        ctx.stroke();

        // 4. UI Olympic Sports Complex Stadium (Running track & Soccer pitch)
        // Red running track oval
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.roundRect(850, 750, 260, 160, [80]);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Green soccer pitch
        ctx.fillStyle = '#15803d';
        ctx.fillRect(890, 780, 180, 100);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(890, 780, 180, 100);
        ctx.beginPath();
        ctx.arc(980, 830, 22, 0, Math.PI * 2);
        ctx.moveTo(980, 780);
        ctx.lineTo(980, 880);
        ctx.stroke();

        // 5. Major Pedestrian Walkways (OpenStreetMap pedestrian footways in light stone)
        ctx.strokeStyle = '#e2dfd9';
        ctx.lineWidth = 5;
        ctx.beginPath();
        // Central academic walkway spine
        ctx.moveTo(1024, 1300); ctx.lineTo(1024, 700);
        ctx.moveTo(900, 1024); ctx.lineTo(1200, 1024);
        ctx.moveTo(850, 1150); ctx.lineTo(1150, 850);
        ctx.stroke();

        // 6. Paved Asphalt Parking Aprons (Senate, KDL, Trenchard, Central Depot)
        ctx.fillStyle = '#334155';
        ctx.fillRect(980, 960, 90, 50);   // Depot Apron
        ctx.fillRect(1000, 830, 70, 45);  // Trenchard Hall Forecourt
        ctx.fillRect(1010, 780, 80, 40);  // Senate Parking
        ctx.fillRect(1050, 840, 75, 45);  // KDL Forecourt

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    buildRoadNetwork() {
        // 16 Real University of Ibadan Campus Road Arteries
        const roads = [
            // 1. University Crescent / Main Gate Boulevard (Main Gate -> SUB -> Trenchard Hall)
            { from: [7.4429, 3.8996], to: [7.4485, 3.8998], width: 14, name: "University Crescent" },
            // 2. Oduduwa Road (Central Depot -> Faculty of Arts -> Trenchard Hall -> KDL Library)
            { from: [7.4452, 3.8990], to: [7.4480, 3.9010], width: 12, name: "Oduduwa Road" },
            // 3. Tech Road (Senate Building -> Faculty of Technology -> Awo Hall)
            { from: [7.4485, 3.8998], to: [7.4520, 3.8985], width: 12, name: "Technology Way" },
            { from: [7.4520, 3.8985], to: [7.4530, 3.9010], width: 11, name: "Awo Hall Road" },
            // 4. Science Road (KDL Library -> Faculty of Science -> Pharmacy)
            { from: [7.4478, 3.9008], to: [7.4495, 3.9035], width: 11, name: "Science Road" },
            // 5. Amina Way (Trenchard Hall -> Bello Hall -> Mellanby -> Sports Complex)
            { from: [7.4482, 3.9001], to: [7.4490, 3.8965], width: 11, name: "Amina Way" },
            // 6. Benue Road (Faculty of Technology -> Zik Hall -> UI ICC & 2nd Gate)
            { from: [7.4520, 3.8985], to: [7.4560, 3.8920], width: 14, name: "Benue Road" },
            // 7. Niger Road (Benue Road -> Queen Idia Hall -> PG College)
            { from: [7.4545, 3.8955], to: [7.4505, 3.8960], width: 11, name: "Niger Road" },
            // 8. Sankore Avenue (Faculty of Education -> College of Medicine)
            { from: [7.4460, 3.9010], to: [7.4470, 3.9015], width: 10, name: "Sankore Avenue" },
            // 9. Barth Road (UI Commercial Ventures -> Parry Road Farm)
            { from: [7.4435, 3.9025], to: [7.4445, 3.9055], width: 11, name: "Barth Road" },
            // 10. Parry Road (Farm -> Botanical Gardens & Awba Pavilion)
            { from: [7.4445, 3.9055], to: [7.4410, 3.9040], width: 10, name: "Parry Road" },
            // 11. Health Sciences Link (Central Depot -> Jaja Clinic)
            { from: [7.4452, 3.8990], to: [7.4462, 3.8970], width: 11, name: "Health Sciences Link" },
            // 12. Appleton Road (Sports Complex -> Postgraduate College)
            { from: [7.4490, 3.8965], to: [7.4505, 3.8960], width: 10, name: "Appleton Road" },
            // 13. El-Kanemi Road (Faculty of Tech -> Indy Hall)
            { from: [7.4520, 3.8985], to: [7.4550, 3.8965], width: 10, name: "El-Kanemi Road" },
            // 14. Danfodio Road (Kuti Hall -> Science Quad)
            { from: [7.4492, 3.8995], to: [7.4495, 3.9020], width: 10, name: "Danfodio Road" },
            // 15. Awba Dam Access Road (Barth Rd to Awba Lake)
            { from: [7.4435, 3.9025], to: [7.4415, 3.9030], width: 9, name: "Awba Dam Road" },
            // 16. Depot Service Loop (Fleet maintenance yard connector)
            { from: [7.4448, 3.8985], to: [7.4455, 3.8995], width: 12, name: "Central Depot Yard Loop" }
        ];

        const roadMat = new THREE.MeshStandardMaterial({
            color: 0x334155, // Clean asphalt slate
            roughness: 0.75,
            metalness: 0.15
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
            roadMesh.position.set((p1.x + p2.x) / 2, 0.12, (p1.z + p2.z) / 2);
            roadMesh.receiveShadow = true;
            this.scene.add(roadMesh);

            // Center Dashed Lane Markings
            const dashMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, opacity: 0.85, transparent: true });
            const dashGeo = new THREE.PlaneGeometry(0.7, length * 0.9);
            const dashMesh = new THREE.Mesh(dashGeo, dashMat);
            dashMesh.rotation.x = -Math.PI / 2;
            dashMesh.rotation.z = -angle;
            dashMesh.position.set((p1.x + p2.x) / 2, 0.14, (p1.z + p2.z) / 2);
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
        yard.position.set(depotPos.x, 0.13, depotPos.z + 18);
        yard.receiveShadow = true;
        this.scene.add(yard);

        // Yellow Parking Bay Slots for 6 Vehicles (Bay 1 to 6)
        this.depotBayPositions.forEach(b => {
            const slotGeo = new THREE.PlaneGeometry(8, 14);
            const slotMat = new THREE.MeshBasicMaterial({ color: 0xd97706, wireframe: true });
            const slot = new THREE.Mesh(slotGeo, slotMat);
            slot.rotation.x = -Math.PI / 2;
            slot.position.set(depotPos.x + b.x, 0.15, depotPos.z + b.z);
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

                const spireGeo = new THREE.ConeGeometry(5, 10, 8);
                const spireMat = new THREE.MeshStandardMaterial({ color: 0x002147 });
                const spire = new THREE.Mesh(spireGeo, spireMat);
                spire.position.set(0, b.h + 23, 0);
                group.add(spire);
            }

            // Architectural Accents: Red Medical Cross on Jaja Clinic
            if (b.isHospital) {
                const crossMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
                const crossH = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 0.4), crossMat);
                crossH.position.set(0, b.h * 0.7, b.d / 2 + 0.3);
                const crossV = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 0.4), crossMat);
                crossV.position.set(0, b.h * 0.7, b.d / 2 + 0.3);
                group.add(crossH);
                group.add(crossV);
            }

            // Floating University of Ibadan UI Navy & Gold Badge Sprite
            const canvas = document.createElement('canvas');
            canvas.width = 280;
            canvas.height = 70;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#002147';
            ctx.fillRect(0, 0, 280, 70);
            ctx.strokeStyle = '#C59B27';
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, 276, 66);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 22px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.label, 140, 35);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.y = b.h + (b.tower ? 28 : 10);
            sprite.scale.set(24, 6, 1);
            group.add(sprite);

            this.scene.add(group);
            this.landmarks3D.push(group);
        });
    }

    async loadInitialVehicles() {
        try {
            const res = await fetch('/api/vehicles');
            const vehicles = await res.json();
            if (vehicles && vehicles.length) {
                this.updateVehiclesTelemetry(vehicles);
            }
        } catch (err) {
            console.error('Error loading initial vehicles in 3D', err);
        }
    }

    createProceduralVehicleMesh(vType, plate, initialData = {}) {
        const group = new THREE.Group();
        const typeLower = (vType || "").toLowerCase();

        let bodyColor = 0xc59b27; // UI gold default
        let w = 4.0, h = 3.4, l = 9.0;

        if (typeLower.includes('bus') || typeLower.includes('shuttle')) {
            bodyColor = 0x0284c7; // Blue Coaster Shuttle
            w = 5.0; h = 4.8; l = 15.0;
        } else if (typeLower.includes('pickup') || typeLower.includes('hilux')) {
            bodyColor = 0xd97706; // Amber Hilux Pickup
            w = 4.5; h = 3.6; l = 10.5;
        } else if (typeLower.includes('ambulance') || typeLower.includes('health')) {
            bodyColor = 0xf8fafc; // Clean White Emergency
            w = 4.2; h = 4.0; l = 10.0;
        } else if (typeLower.includes('bike') || typeLower.includes('courier')) {
            bodyColor = 0x10b981; // Green Dispatch Bike
            w = 1.8; h = 2.4; l = 4.5;
        } else if (typeLower.includes('heavy') || typeLower.includes('truck')) {
            bodyColor = 0x334155; // Heavy Grey Flatbed
            w = 5.5; h = 5.2; l = 18.0;
        }

        // Vehicle Chassis Body
        const chassisMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: 0.3,
            metalness: 0.6
        });
        const chassisGeo = new THREE.BoxGeometry(w, h * 0.55, l);
        const chassis = new THREE.Mesh(chassisGeo, chassisMat);
        chassis.position.y = 1.6;
        chassis.castShadow = true;
        group.add(chassis);

        // Glass Greenhouse Cabin
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            roughness: 0.1,
            metalness: 0.9,
            transparent: true,
            opacity: 0.85
        });
        const cabinGeo = new THREE.BoxGeometry(w * 0.92, h * 0.5, l * 0.65);
        const cabin = new THREE.Mesh(cabinGeo, glassMat);
        cabin.position.set(0, 1.6 + h * 0.45, -l * 0.05);
        cabin.castShadow = true;
        group.add(cabin);

        // Headlights
        const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8db, emissiveIntensity: 1.8 });
        const lightGeo = new THREE.BoxGeometry(w * 0.2, 0.4, 0.2);
        const leftLight = new THREE.Mesh(lightGeo, lightMat);
        leftLight.position.set(-w * 0.35, 1.6, -l / 2 - 0.05);
        const rightLight = new THREE.Mesh(lightGeo, lightMat);
        rightLight.position.set(w * 0.35, 1.6, -l / 2 - 0.05);
        group.add(leftLight);
        group.add(rightLight);

        // Taillights
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.5 });
        const tailGeo = new THREE.BoxGeometry(w * 0.2, 0.4, 0.2);
        const leftTail = new THREE.Mesh(tailGeo, tailMat);
        leftTail.position.set(-w * 0.35, 1.6, l / 2 + 0.05);
        const rightTail = new THREE.Mesh(tailGeo, tailMat);
        rightTail.position.set(w * 0.35, 1.6, l / 2 + 0.05);
        group.add(leftTail);
        group.add(rightTail);

        // Wheels with chrome hubs
        const wheelGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.7, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
        const rimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.8, roughness: 0.2 });

        const wheelPositions = [
            [-w / 2 - 0.2, 1.0, -l * 0.32],
            [w / 2 + 0.2, 1.0, -l * 0.32],
            [-w / 2 - 0.2, 1.0, l * 0.32],
            [w / 2 + 0.2, 1.0, l * 0.32]
        ];

        group.userData.wheels = [];
        wheelPositions.forEach(wp => {
            const wheelGroup = new THREE.Group();
            wheelGroup.position.set(wp[0], wp[1], wp[2]);

            const tire = new THREE.Mesh(wheelGeo, wheelMat);
            tire.rotation.z = Math.PI / 2;
            tire.castShadow = true;
            wheelGroup.add(tire);

            const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.75, 8), rimMat);
            rim.rotation.z = Math.PI / 2;
            wheelGroup.add(rim);

            group.add(wheelGroup);
            group.userData.wheels.push(wheelGroup);
        });

        // Dynamic Floating Telemetry & Fuel Gauge Billboard Sprite
        const sprite = this.createVehicleTelemetrySprite(plate, initialData.battery_fuel_pct || 95, initialData.speed_kmh || 0, initialData.status || 'idle');
        sprite.position.y = h + 5.5;
        group.add(sprite);
        group.userData.telemetrySprite = sprite;
        group.userData.vehicleHeight = h;

        return group;
    }

    createVehicleTelemetrySprite(plate, fuelPct, speedKmh, status) {
        const canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 120;
        this.drawVehicleSpriteCanvas(canvas, plate, fuelPct, speedKmh, status);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(16, 5.3, 1);
        sprite.userData.canvas = canvas;
        sprite.userData.texture = texture;
        return sprite;
    }

    drawVehicleSpriteCanvas(canvas, plate, fuelPct, speedKmh, status) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 360, 120);

        const isTransit = status === 'in_transit';
        const fuel = Math.max(0, Math.min(100, Math.round(fuelPct)));

        // 1. Background Pill Container
        ctx.fillStyle = 'rgba(0, 33, 71, 0.94)'; // Deep UI Navy
        ctx.beginPath();
        ctx.roundRect(4, 4, 352, 112, 14);
        ctx.fill();

        ctx.strokeStyle = '#C59B27'; // UI Gold Border
        ctx.lineWidth = 3;
        ctx.stroke();

        // 2. Top Row: Plate & Status Badge
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(plate || "UI-FLEET", 18, 36);

        // Status Tag
        const tagText = isTransit ? "IN TRANSIT" : (status === 'maintenance' ? "SERVICE" : "IDLE / BAY");
        const tagBg = isTransit ? "#059669" : (status === 'maintenance' ? "#dc2626" : "#475569");
        ctx.fillStyle = tagBg;
        ctx.beginPath();
        ctx.roundRect(220, 16, 120, 26, 6);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tagText, 280, 33);

        // 3. Middle Row: Speed Indicator
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText("Speed: ", 18, 64);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 15px JetBrains Mono, monospace';
        ctx.fillText(`${Math.round(speedKmh || 0)} km/h`, 72, 64);

        // 4. Bottom Row: Animated Fuel / Battery Gauge Bar
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillText(`⛽ Fuel / Battery: ${fuel}%`, 18, 90);

        // Fuel Bar Track
        const barX = 180;
        const barY = 78;
        const barW = 160;
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
            let headingRad = THREE.MathUtils.degToRad(veh.heading_deg || 0);

            // If vehicle is stationed/idle at depot, park it in its designated outdoor parking bay!
            const distToDepot = Math.sqrt(
                Math.pow(veh.latitude - this.originLat, 2) + Math.pow(veh.longitude - this.originLng, 2)
            );

            if (veh.status === 'idle' || distToDepot < 0.0003) {
                const bayInfo = this.depotBayPositions[idx % this.depotBayPositions.length];
                targetPos = {
                    x: depotPos.x + bayInfo.x,
                    z: depotPos.z + bayInfo.z
                };
                headingRad = 0; // Park facing the road
            }

            if (!this.vehicles3D.has(id)) {
                // Instantiate 3D vehicle
                const vehMesh = this.createProceduralVehicleMesh(veh.vehicle_type, veh.plate_number, veh);
                vehMesh.position.set(targetPos.x, 0.15, targetPos.z);
                vehMesh.rotation.y = -headingRad;
                vehMesh.userData.vehicleData = veh;
                this.scene.add(vehMesh);
                this.vehicles3D.set(id, vehMesh);
            } else {
                const vehMesh = this.vehicles3D.get(id);
                vehMesh.userData.vehicleData = veh;

                // Smooth position lerp
                vehMesh.position.x += (targetPos.x - vehMesh.position.x) * 0.25;
                vehMesh.position.z += (targetPos.z - vehMesh.position.z) * 0.25;
                vehMesh.position.y = 0.15; // Ensure tires rest directly on road surface

                // Smooth rotation lerp
                const targetRot = -headingRad;
                vehMesh.rotation.y += (targetRot - vehMesh.rotation.y) * 0.2;

                // Wheel spin animation matching vehicle speed
                if (veh.speed_kmh > 0 && vehMesh.userData.wheels) {
                    vehMesh.userData.wheels.forEach(w => {
                        w.rotation.x += (veh.speed_kmh * 0.04);
                    });
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
                        points.push(new THREE.Vector3(wPos.x, 0.4, wPos.z));
                    });

                    const curve = new THREE.CatmullRomCurve3(points);
                    const tubeGeo = new THREE.TubeGeometry(curve, points.length * 4, 0.5, 6, false);
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

            // Delivery Stops (Concentric Beacons & Holographic Pins)
            const ordersRes = await fetch('/api/orders');
            const orders = await ordersRes.json();

            this.stops3D.forEach(s => this.scene.remove(s));
            this.stops3D.clear();

            orders.forEach(o => {
                if (o.status === 'cancelled') return;
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
            showToast("Chase Camera detached to free orbit", "info");
        } else {
            this.followedVehicleId = vehicleId;
            showToast(`Tracking vehicle in 3D Chase Camera`, "info");
        }
    }

    setCameraPreset(preset) {
        this.followedVehicleId = null; // Detach follow
        if (preset === 'bird') {
            this.camera.position.set(0, 210, 290);
            this.controls.target.set(0, 0, 0);
        } else if (preset === 'street') {
            this.camera.position.set(0, 22, 60);
            this.controls.target.set(0, 8, -20);
        } else if (preset === 'top') {
            this.camera.position.set(0, 420, 0.1);
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
