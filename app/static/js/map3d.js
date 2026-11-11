/**
 * UI-FleetFlow 3D Digital Twin Engine (Three.js)
 * Real-time 3D campus simulation with PBR lighting, soft shadows, 3D vehicles,
 * road networks, landmark architecture, and vehicle follow/inspect camera.
 */

class Campus3DEngine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // GPS projection origin: UI Central Logistics Depot
        this.originLat = 7.445210;
        this.originLng = 3.899015;
        this.scaleMeterToUnits = 0.25; // 1 meter = 0.25 Three.js units

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.vehicles3D = new Map(); // vehicle_id -> THREE.Group
        this.routes3D = new Map();   // route_id -> THREE.Line
        this.stops3D = new Map();    // order_id -> THREE.Group
        this.followedVehicleId = null;

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

        // Scene & Atmospheric Fog (Daylight Campus Environment)
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xdbeafe); // Crisp daylight sky
        this.scene.fog = new THREE.FogExp2(0xdbeafe, 0.0011);

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
        this.camera.position.set(0, 180, 260);

        // WebGL Renderer with High-Fidelity PBR Shading
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.container.appendChild(this.renderer.domElement);

        // OrbitControls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.04; // Don't clip below ground
        this.controls.minDistance = 8;
        this.controls.maxDistance = 750;
        this.controls.target.set(0, 0, 0);

        // Build Environment
        this.setupLighting();
        this.buildCampusTerrain();
        this.buildLandmarkBuildings();
        this.loadRoutesAndStops();

        // Event Listeners
        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('telemetry:update', (e) => this.onTelemetryUpdate(e));
        this.renderer.domElement.addEventListener('click', (e) => this.onPointerClick(e));

        this.isInitialized = true;
        this.animate();
    }

    setupLighting() {
        // Ambient Sky & Daylight Bounce Light
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.85);
        this.scene.add(hemiLight);

        // Directional Sunlight with Soft Shadows
        const sun = new THREE.DirectionalLight(0xfffbeb, 1.5);
        sun.position.set(240, 360, 160);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 850;
        const d = 260;
        sun.shadow.camera.left = -d;
        sun.shadow.camera.right = d;
        sun.shadow.camera.top = d;
        sun.shadow.camera.bottom = -d;
        sun.shadow.bias = -0.0004;
        this.scene.add(sun);

        // Soft sky rim light
        const rim = new THREE.DirectionalLight(0x93c5fd, 0.4);
        rim.position.set(-200, 120, -200);
        this.scene.add(rim);
    }

    buildCampusTerrain() {
        // Ground Lawns (Lush University of Ibadan campus green)
        const groundGeo = new THREE.PlaneGeometry(1600, 1600, 32, 32);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x3d7042, // Vibrant natural campus turf
            roughness: 0.95,
            metalness: 0.05
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Subtle architectural ground grid overlay
        const grid = new THREE.GridHelper(1600, 80, 0x94a3b8, 0xcbd5e1);
        grid.position.y = 0.05;
        this.scene.add(grid);

        // Paved Campus Road Network
        this.buildRoadNetwork();
    }

    buildRoadNetwork() {
        // Real University of Ibadan Main Roads represented as 3D ribbons
        const roads = [
            // Main Boulevard (Main Gate to Trenchard Hall / Senate)
            { from: [7.4429, 3.8996], to: [7.4485, 3.8998], width: 14 },
            // Oduduwa Road (Works Depot across Central Academic Core)
            { from: [7.4452, 3.8990], to: [7.4478, 3.9008], width: 11 },
            // Tech Road (Senate to Faculty of Technology & Law)
            { from: [7.4485, 3.8998], to: [7.4520, 3.8985], width: 11 },
            // Amina Way (Trenchard Hall to Student Residential Quad)
            { from: [7.4482, 3.9001], to: [7.4545, 3.8955], width: 10 },
            // Benue Road (Tech Complex to ICC / 2nd Gate)
            { from: [7.4520, 3.8985], to: [7.4560, 3.8920], width: 12 },
            // Health Sciences Way (Central Hub to Jaja Clinic)
            { from: [7.4452, 3.8990], to: [7.4462, 3.8970], width: 10 },
            // Science Road (KDL to Faculty of Science & Pharmacy)
            { from: [7.4478, 3.9008], to: [7.4495, 3.9020], width: 10 },
            // Barth Road (UI Commercial Ventures to Parry Road Farm)
            { from: [7.4435, 3.9025], to: [7.4445, 3.9055], width: 10 },
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

            const roadGeo = new THREE.PlaneGeometry(r.width, length);
            const roadMesh = new THREE.Mesh(roadGeo, roadMat);
            roadMesh.rotation.x = -Math.PI / 2;
            roadMesh.rotation.z = -angle;
            roadMesh.position.set((p1.x + p2.x) / 2, 0.1, (p1.z + p2.z) / 2);
            roadMesh.receiveShadow = true;
            this.scene.add(roadMesh);

            // Add subtle road center dash markings
            const dashMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, opacity: 0.8, transparent: true });
            const dashGeo = new THREE.PlaneGeometry(0.8, length * 0.9);
            const dashMesh = new THREE.Mesh(dashGeo, dashMat);
            dashMesh.rotation.x = -Math.PI / 2;
            dashMesh.rotation.z = -angle;
            dashMesh.position.set((p1.x + p2.x) / 2, 0.12, (p1.z + p2.z) / 2);
            this.scene.add(dashMesh);
        });
    }

    buildLandmarkBuildings() {
        // Real University of Ibadan Landmarks modeled in 3D
        const buildings = [
            // Kenneth Dike Library (Tiered architectural monolith)
            { name: "Kenneth Dike Library", lat: 7.4478, lng: 3.9008, w: 26, d: 32, h: 22, color: 0x94a3b8, label: "KDL Library" },
            // Trenchard Hall (Ceremonial center with high roof & clock tower)
            { name: "Trenchard Hall", lat: 7.4482, lng: 3.9001, w: 34, d: 20, h: 20, color: 0xcbd5e1, label: "Trenchard Hall" },
            // Tekena Tamuno Senate Building (Central Admin Tower)
            { name: "Senate Building", lat: 7.4485, lng: 3.8998, w: 22, d: 22, h: 36, color: 0x334155, label: "Senate Admin" },
            // Faculty of Technology Engineering Complex
            { name: "Faculty of Technology", lat: 7.4520, lng: 3.8985, w: 38, d: 24, h: 18, color: 0x64748b, label: "Faculty of Technology" },
            // Faculty of Science Quadrangle
            { name: "Faculty of Science", lat: 7.4495, lng: 3.9020, w: 30, d: 26, h: 16, color: 0x475569, label: "Faculty of Science" },
            // Jaja Health Services Clinic
            { name: "Jaja Health Clinic", lat: 7.4462, lng: 3.8970, w: 22, d: 18, h: 12, color: 0xe2e8f0, label: "Jaja Clinic" },
            // College of Medicine Complex
            { name: "College of Medicine", lat: 7.4470, lng: 3.9015, w: 24, d: 20, h: 16, color: 0x475569, label: "College of Medicine" },
            // UI Postgraduate College
            { name: "Postgraduate College", lat: 7.4505, lng: 3.8960, w: 26, d: 22, h: 15, color: 0x64748b, label: "Postgraduate College" },
            // International Conference Centre (ICC)
            { name: "UI Conference Centre", lat: 7.4560, lng: 3.8920, w: 42, d: 30, h: 24, color: 0xd4af37, label: "UI ICC" },
            // UI Central Logistics Hub & Depot Bays
            { name: "Central Logistics Depot", lat: 7.4452, lng: 3.8990, w: 36, d: 26, h: 14, color: 0x002147, label: "Central Depot" },
            // Student Residence: Sultan Bello Hall
            { name: "Sultan Bello Hall", lat: 7.4478, lng: 3.8992, w: 26, d: 20, h: 14, color: 0x334155, label: "Bello Hall" },
            // Student Residence: Zik Hall
            { name: "Nnamdi Azikiwe Hall", lat: 7.4545, lng: 3.8955, w: 32, d: 22, h: 16, color: 0x475569, label: "Zik Hall" }
        ];

        buildings.forEach(b => {
            const pos = this.gpsToWorld(b.lat, b.lng);
            const group = new THREE.Group();
            group.position.set(pos.x, 0, pos.z);

            // Main Body
            const mat = new THREE.MeshStandardMaterial({
                color: b.color,
                roughness: 0.6,
                metalness: 0.2
            });
            const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = b.h / 2;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);

            // Roof trim / architectural accent
            const roofGeo = new THREE.BoxGeometry(b.w + 1.5, 1.2, b.d + 1.5);
            const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
            const roof = new THREE.Mesh(roofGeo, roofMat);
            roof.position.y = b.h + 0.6;
            roof.castShadow = true;
            group.add(roof);

            // Add 3D Floating Name Banner
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#002147'; // Institutional UI Navy
            ctx.fillRect(0, 0, 256, 64);
            ctx.strokeStyle = '#C59B27'; // UI Gold trim
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, 252, 60);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 24px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.label, 128, 32);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.y = b.h + 10;
            sprite.scale.set(22, 5.5, 1);
            group.add(sprite);

            this.scene.add(group);
        });
    }

    createProceduralVehicleMesh(vType, plate) {
        const group = new THREE.Group();

        // Distinct colors & scales by vehicle type
        const typeLower = (vType || "").toLowerCase();
        let bodyColor = 0xd4af37; // UI gold default
        let w = 4.0, h = 3.4, l = 9.0; // Standard Van / HiAce

        if (typeLower.includes('bus') || typeLower.includes('shuttle')) {
            bodyColor = 0x0284c7; // Blue Coaster Shuttle
            w = 5.0; h = 4.8; l = 16.0;
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
            bodyColor = 0x475569; // Heavy Grey Flatbed
            w = 5.5; h = 5.2; l = 18.0;
        }

        // Main Vehicle Chassis / Lower Body
        const chassisMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: 0.3,
            metalness: 0.7
        });
        const chassisGeo = new THREE.BoxGeometry(w, h * 0.55, l);
        const chassis = new THREE.Mesh(chassisGeo, chassisMat);
        chassis.position.y = 1.6;
        chassis.castShadow = true;
        group.add(chassis);

        // Cabin / Glass Greenhouse
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

        // Headlights (Emissive glowing LED bars)
        const lightMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xfff8db,
            emissiveIntensity: 1.8
        });
        const lightGeo = new THREE.BoxGeometry(w * 0.22, 0.5, 0.2);
        const leftLight = new THREE.Mesh(lightGeo, lightMat);
        leftLight.position.set(-w * 0.35, 1.6, -l / 2 - 0.05);
        const rightLight = new THREE.Mesh(lightGeo, lightMat);
        rightLight.position.set(w * 0.35, 1.6, -l / 2 - 0.05);
        group.add(leftLight);
        group.add(rightLight);

        // Taillights
        const tailMat = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            emissive: 0xef4444,
            emissiveIntensity: 1.5
        });
        const tailGeo = new THREE.BoxGeometry(w * 0.2, 0.4, 0.2);
        const leftTail = new THREE.Mesh(tailGeo, tailMat);
        leftTail.position.set(-w * 0.35, 1.6, l / 2 + 0.05);
        const rightTail = new THREE.Mesh(tailGeo, tailMat);
        rightTail.position.set(w * 0.35, 1.6, l / 2 + 0.05);
        group.add(leftTail);
        group.add(rightTail);

        // Wheels with metallic rims & rubber tires
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

            const rimGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.75, 8);
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.z = Math.PI / 2;
            wheelGroup.add(rim);

            group.add(wheelGroup);
            group.userData.wheels.push(wheelGroup);
        });

        // Floating 3D Plate Tag
        const canvas = document.createElement('canvas');
        canvas.width = 192;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#002147';
        ctx.fillRect(0, 0, 192, 48);
        ctx.strokeStyle = '#C59B27';
        ctx.lineWidth = 3;
        ctx.strokeRect(1, 1, 190, 46);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 22px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(plate || "UI-FLEET", 96, 24);

        const plateTex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: plateTex, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.y = h + 3.2;
        sprite.scale.set(12, 3, 1);
        group.add(sprite);

        return group;
    }

    onTelemetryUpdate(event) {
        if (!event.detail || !event.detail.vehicles) return;

        const vehicles = event.detail.vehicles;
        vehicles.forEach(veh => {
            const id = veh.vehicle_id;
            const targetPos = this.gpsToWorld(veh.latitude, veh.longitude);
            const headingRad = THREE.MathUtils.degToRad(veh.heading_deg || 0);

            if (!this.vehicles3D.has(id)) {
                // Instantiate 3D vehicle
                const vehMesh = this.createProceduralVehicleMesh(veh.vehicle_type, veh.plate_number);
                vehMesh.position.set(targetPos.x, 0, targetPos.z);
                vehMesh.rotation.y = -headingRad; // Align with compass heading
                vehMesh.userData.vehicleData = veh;
                this.scene.add(vehMesh);
                this.vehicles3D.set(id, vehMesh);
            } else {
                const vehMesh = this.vehicles3D.get(id);
                vehMesh.userData.vehicleData = veh;

                // Smoothly interpolate position towards target
                const currentPos = vehMesh.position;
                currentPos.x += (targetPos.x - currentPos.x) * 0.25;
                currentPos.z += (targetPos.z - currentPos.z) * 0.25;

                // Rotate heading smoothly
                const targetRot = -headingRad;
                vehMesh.rotation.y += (targetRot - vehMesh.rotation.y) * 0.2;

                // Spin wheels if in motion
                if (veh.speed_kmh > 0 && vehMesh.userData.wheels) {
                    vehMesh.userData.wheels.forEach(w => {
                        w.rotation.x += (veh.speed_kmh * 0.05);
                    });
                }

                // If currently following this vehicle with chase cam
                if (this.followedVehicleId === id) {
                    const chaseOffset = new THREE.Vector3(0, 24, 45).applyAxisAngle(new THREE.Vector3(0, 1, 0), vehMesh.rotation.y);
                    this.camera.position.lerp(new THREE.Vector3().addVectors(vehMesh.position, chaseOffset), 0.1);
                    this.controls.target.lerp(vehMesh.position, 0.15);
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
                        points.push(new THREE.Vector3(wPos.x, 0.35, wPos.z));
                    });

                    const curve = new THREE.CatmullRomCurve3(points);
                    const tubeGeo = new THREE.TubeGeometry(curve, points.length * 4, 0.45, 6, false);
                    const tubeMat = new THREE.MeshStandardMaterial({
                        color: idx % 2 === 0 ? 0x0284c7 : 0xd97706,
                        emissive: idx % 2 === 0 ? 0x0284c7 : 0xd97706,
                        emissiveIntensity: 0.6,
                        roughness: 0.3
                    });
                    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
                    this.scene.add(tubeMesh);
                    this.routes3D.set(route.id, tubeMesh);
                }
            });

            // Delivery Stops (Holographic Landing Ring Beacons)
            const ordersRes = await fetch('/api/orders');
            const orders = await ordersRes.json();

            this.stops3D.forEach(s => this.scene.remove(s));
            this.stops3D.clear();

            orders.forEach(o => {
                if (o.status === 'cancelled') return;
                const pos = this.gpsToWorld(o.destination_lat, o.destination_lng);
                const stopGroup = new THREE.Group();
                stopGroup.position.set(pos.x, 0.2, pos.z);

                const isDelivered = o.status === 'delivered';
                const ringMat = new THREE.MeshBasicMaterial({
                    color: isDelivered ? 0x10b981 : 0xf59e0b,
                    wireframe: true
                });
                const ringGeo = new THREE.RingGeometry(2.5, 3.8, 16);
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = -Math.PI / 2;
                stopGroup.add(ring);

                // Floating Pin Cone
                const pinGeo = new THREE.ConeGeometry(1.2, 3.5, 6);
                const pinMat = new THREE.MeshStandardMaterial({
                    color: isDelivered ? 0x10b981 : 0xd97706,
                    emissive: isDelivered ? 0x10b981 : 0xd97706,
                    emissiveIntensity: 0.4
                });
                const pin = new THREE.Mesh(pinGeo, pinMat);
                pin.position.y = 3.5;
                pin.rotation.x = Math.PI; // point down
                stopGroup.add(pin);

                this.scene.add(stopGroup);
                this.stops3D.set(o.id, stopGroup);
            });

        } catch (err) {
            console.error('Error loading 3D routes & stops', err);
        }
    }

    followVehicle(vehicleId) {
        if (this.followedVehicleId === vehicleId) {
            this.followedVehicleId = null; // Toggle off
            showToast("Camera detached to free orbit", "info");
        } else {
            this.followedVehicleId = vehicleId;
            showToast(`Tracking Vehicle in 3D Chase Camera`, "info");
        }
    }

    setCameraPreset(preset) {
        this.followedVehicleId = null; // detach chase
        if (preset === 'bird') {
            this.camera.position.set(0, 190, 240);
            this.controls.target.set(0, 0, 0);
        } else if (preset === 'street') {
            this.camera.position.set(0, 18, 65);
            this.controls.target.set(0, 8, 0);
        } else if (preset === 'top') {
            this.camera.position.set(0, 360, 0.1);
            this.controls.target.set(0, 0, 0);
        }
        this.controls.update();
    }

    onPointerClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        for (let hit of intersects) {
            // Check if user clicked a vehicle
            let current = hit.object;
            while (current && current !== this.scene) {
                if (current.userData && current.userData.vehicleData) {
                    const veh = current.userData.vehicleData;
                    open3DVehicleInspector(veh);
                    return;
                }
                current = current.parent;
            }
        }
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
