import logging
import json
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.database import engine, Base, SessionLocal
from app.models import (
    Depot, Driver, Vehicle, Order, Route, TelemetryLog,
    DriverStatus, VehicleStatus, VehicleType, OrderStatus, OrderPriority, RouteStatus
)
from app.engine.distance import haversine_distance

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed")

# Real University of Ibadan Campus Road Intersections & Landmark Nodes
CAMPUS_NODES = {
    "DEPOT": (7.445210, 3.899015),
    "MAIN_GATE": (7.442900, 3.899600),
    "SUB": (7.447200, 3.898800),
    "QUEEN_HALL": (7.445500, 3.898500),
    "JAJA_CLINIC": (7.446200, 3.897000),
    "TRENCHARD": (7.448200, 3.900100),
    "SENATE": (7.448500, 3.899800),
    "KDL_LIBRARY": (7.447800, 3.900800),
    "BELLO_HALL": (7.447800, 3.899200),
    "MELLANBY_HALL": (7.448800, 3.899000),
    "TEDDER_HALL": (7.448500, 3.898800),
    "KUTI_HALL": (7.449200, 3.899500),
    "SPORTS_COMPLEX": (7.449000, 3.896500),
    "POSTGRAD_COLLEGE": (7.450500, 3.896000),
    "TECH_COMPLEX": (7.452000, 3.898500),
    "AWO_HALL": (7.453000, 3.901000),
    "ZIK_HALL": (7.454500, 3.895500),
    "INDY_HALL": (7.455000, 3.896500),
    "ICC_PAVILION": (7.456000, 3.892000),
    "SCIENCE_QUAD": (7.449500, 3.902000),
    "PHARMACY": (7.449000, 3.903500),
    "MEDICINE": (7.447000, 3.901500),
    "VENTURES": (7.443500, 3.902500),
    "FARM": (7.444500, 3.905500),
    "BOTANICAL": (7.441000, 3.904000)
}

def generate_road_waypoints(node_keys, steps_per_segment=6):
    waypoints = []
    for i in range(len(node_keys) - 1):
        p1 = CAMPUS_NODES[node_keys[i]]
        p2 = CAMPUS_NODES[node_keys[i + 1]]
        for s in range(steps_per_segment):
            ratio = s / float(steps_per_segment)
            lat = p1[0] + (p2[0] - p1[0]) * ratio
            lon = p1[1] + (p2[1] - p1[1]) * ratio
            waypoints.append([round(lat, 6), round(lon, 6)])
    last_p = CAMPUS_NODES[node_keys[-1]]
    waypoints.append([round(last_p[0], 6), round(last_p[1], 6)])
    return waypoints

def seed_database():
    """Seeds database with authentic University of Ibadan campus delivery fleet and active routes."""
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    try:
        # Check if already seeded with authentic fleet
        existing_v = db.query(Vehicle).filter(Vehicle.plate_number == "UI-01-DSP").first()
        if existing_v:
            logger.info("Authentic University of Ibadan fleet already seeded. Skipping.")
            return

        # Wipe previous non-authentic fleet
        logger.info("Resetting database to authentic University of Ibadan campus fleet...")
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        # 1. Central Logistics Depot
        depot = Depot(
            name="UI Central Campus Logistics Hub",
            address="Central Logistics Area, University of Ibadan Campus, Oyo State, Nigeria",
            latitude=7.445210,
            longitude=3.899015,
            contact_phone="+234 (0) 803 000 0000"
        )
        db.add(depot)
        db.flush()

        # 2. Authentic Nigerian Campus Fleet Drivers
        drivers = [
            Driver(name="Mr. Babatunde Adeyemi", phone="+234 803 411 2091", license_number="DL-OY-90218-UI", status=DriverStatus.ON_DELIVERY, rating=4.96),
            Driver(name="Mr. Emmanuel Olatunji", phone="+234 805 219 4432", license_number="DL-OY-48192-UI", status=DriverStatus.ON_DELIVERY, rating=4.92),
            Driver(name="Mrs. Aminat Bello", phone="+234 813 908 1120", license_number="DL-OY-77124-UI", status=DriverStatus.ON_DELIVERY, rating=4.98),
            Driver(name="Mr. Chinedu Okonkwo", phone="+234 802 674 8839", license_number="DL-OY-33918-UI", status=DriverStatus.ON_DELIVERY, rating=4.95),
            Driver(name="Mr. Sunday Adeleke", phone="+234 807 551 9024", license_number="DL-OY-61029-UI", status=DriverStatus.ON_DELIVERY, rating=4.87),
            Driver(name="Mrs. Folashade Ogunleye", phone="+234 816 430 7719", license_number="DL-OY-55102-UI", status=DriverStatus.ON_DELIVERY, rating=4.91),
        ]
        db.add_all(drivers)
        db.flush()

        # 3. Authentic Real Nigerian Campus Delivery Vehicles (No fake luxury cars!)
        vehicles = [
            # 1. Bajaj Boxer Courier Delivery Bike
            Vehicle(
                plate_number="UI-01-DSP",
                model="Bajaj Boxer BM 100 Courier Delivery Bike",
                vehicle_type=VehicleType.DISPATCH_BIKE,
                capacity_kg=85.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IN_TRANSIT,
                battery_fuel_pct=94.0,
                mileage_km=890.0,
                max_range_km=250.0,
                driver_id=drivers[0].id
            ),
            # 2. TVS HLX Medical Laboratory Courier Bike
            Vehicle(
                plate_number="UI-02-MED",
                model="TVS HLX 125 Laboratory Dispatch Bike",
                vehicle_type=VehicleType.DISPATCH_BIKE,
                capacity_kg=90.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IN_TRANSIT,
                battery_fuel_pct=92.0,
                mileage_km=1140.0,
                max_range_km=260.0,
                driver_id=drivers[1].id
            ),
            # 3. Piaggio Ape City Cargo Delivery Tricycle (Keke)
            Vehicle(
                plate_number="UI-03-KEKE",
                model="Piaggio Ape Cargo Delivery Tricycle",
                vehicle_type=VehicleType.DISPATCH_BIKE,
                capacity_kg=350.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IN_TRANSIT,
                battery_fuel_pct=88.0,
                mileage_km=1820.0,
                max_range_km=200.0,
                driver_id=drivers[2].id
            ),
            # 4. Suzuki Super Carry Mini Delivery Van
            Vehicle(
                plate_number="UI-04-VAN",
                model="Suzuki Super Carry 1.0L Mini Delivery Van",
                vehicle_type=VehicleType.CAMPUS_SHUTTLE,
                capacity_kg=750.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IN_TRANSIT,
                battery_fuel_pct=96.0,
                mileage_km=2350.0,
                max_range_km=400.0,
                driver_id=drivers[3].id
            ),
            # 5. Toyota HiAce Logistics Van
            Vehicle(
                plate_number="UI-05-BUS",
                model="Toyota HiAce 2.7L Commuter Logistics Van",
                vehicle_type=VehicleType.CAMPUS_SHUTTLE,
                capacity_kg=1200.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IN_TRANSIT,
                battery_fuel_pct=90.0,
                mileage_km=3150.0,
                max_range_km=500.0,
                driver_id=drivers[4].id
            ),
            # 6. Toyota Hilux Workhorse Maintenance Pickup
            Vehicle(
                plate_number="UI-06-WKS",
                model="Toyota Hilux 2.5 D-4D Workhorse Pickup",
                vehicle_type=VehicleType.UTILITY_PICKUP,
                capacity_kg=1100.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IN_TRANSIT,
                battery_fuel_pct=86.0,
                mileage_km=4210.0,
                max_range_km=600.0,
                driver_id=drivers[5].id
            ),
        ]
        db.add_all(vehicles)
        db.flush()

        # 4. Authentic UI Campus Delivery Orders
        orders_data = [
            # Route 1: Central Admin & Express Courier (UI-01-DSP)
            ("UI-LOG-801", "Kenneth Dike Library (KDL) Archival Records", "+234 803 555 101", "Kenneth Dike Library, UI Campus Core", 7.4478, 3.9008, 12.0, OrderPriority.HIGH),
            ("UI-LOG-802", "Senate Chambers & Central Administration", "+234 802 555 102", "Tekena Tamuno Senate Building, UI", 7.4485, 3.8998, 8.0, OrderPriority.URGENT),
            ("UI-LOG-803", "UI Student Union (SUB) Council Documents", "+234 805 555 103", "Student Union Building (SUB), UI", 7.4472, 3.8988, 5.0, OrderPriority.MEDIUM),

            # Route 2: Medical & Science Laboratory Liaison (UI-02-MED)
            ("UI-LOG-804", "Jaja Health Clinic Medical Supplies", "+234 803 555 109", "Jaja Health Centre, Health Sciences Road", 7.4462, 3.8970, 15.0, OrderPriority.URGENT),
            ("UI-LOG-805", "College of Medicine Clinical Transcripts", "+234 802 555 110", "College of Medicine Complex, UI Campus", 7.4470, 3.9015, 20.0, OrderPriority.HIGH),
            ("UI-LOG-806", "Faculty of Pharmacy Research Reagents", "+234 807 555 106", "Faculty of Pharmacy Building, UI", 7.4490, 3.9035, 14.0, OrderPriority.URGENT),

            # Route 3: Student Residential Halls Loop (UI-03-KEKE)
            ("UI-LOG-807", "Sultan Bello & Mellanby Halls Student Deliveries", "+234 815 555 115", "Sultan Bello Hall Quadrangle, UI", 7.4478, 3.8992, 35.0, OrderPriority.MEDIUM),
            ("UI-LOG-808", "Tedder & Kuti Halls Consignments", "+234 812 555 116", "Tedder Hall Quadrangle, UI", 7.4485, 3.8988, 40.0, OrderPriority.LOW),
            ("UI-LOG-809", "Queen Elizabeth II Hall Food Logistics", "+234 808 555 117", "Queen Hall, University of Ibadan", 7.4455, 3.8985, 55.0, OrderPriority.MEDIUM),

            # Route 4: UI Ventures Commercial & Farm Produce (UI-04-VAN)
            ("UI-LOG-810", "UI Ventures (Bakery & Water Bottling Consignment)", "+234 806 555 113", "UI Ventures Commercial Centre, Barth Road", 7.4435, 3.9025, 220.0, OrderPriority.HIGH),
            ("UI-LOG-811", "Teaching & Research Farm Dairy & Produce", "+234 814 555 114", "Parry Road Agricultural Research Farm, UI", 7.4445, 3.9055, 180.0, OrderPriority.MEDIUM),
            ("UI-LOG-812", "UI International Conference Centre (ICC) Catering", "+234 818 555 112", "UI International Conference Centre, 2nd Gate", 7.4560, 3.8920, 150.0, OrderPriority.HIGH),

            # Route 5: Engineering & Technology Academic North (UI-05-BUS)
            ("UI-LOG-813", "Faculty of Technology (Civil & Mech Engineering Labs)", "+234 813 555 104", "Faculty of Technology Complex, UI", 7.4520, 3.8985, 95.0, OrderPriority.URGENT),
            ("UI-LOG-814", "Obafemi Awolowo (Awo) Hall Facilities", "+234 817 555 118", "Awo Hall Complex, Off Tech Road, UI", 7.4530, 3.9010, 60.0, OrderPriority.MEDIUM),
            ("UI-LOG-815", "Postgraduate College Academic Certificates", "+234 805 555 111", "Morohundiya PG College Complex, UI", 7.4505, 3.8960, 45.0, OrderPriority.HIGH),

            # Route 6: Heavy Facilities & Northern Residences (UI-06-WKS)
            ("UI-LOG-816", "Faculty of Science (Chemistry & Zoology Apparatus)", "+234 816 555 105", "Faculty of Science Quadrangle, UI", 7.4495, 3.9020, 140.0, OrderPriority.HIGH),
            ("UI-LOG-817", "Independence & Nnamdi Azikiwe (Zik) Halls Works Hardware", "+234 811 555 117", "Zik-Indy Central Logistics Gate, UI", 7.4545, 3.8955, 160.0, OrderPriority.MEDIUM),
            ("UI-LOG-818", "Works & Maintenance Electrical Substation Parts", "+234 809 555 107", "Works Services Substation, UI Campus", 7.4452, 3.8990, 200.0, OrderPriority.URGENT),
        ]

        created_orders = []
        for trk, name, phone, addr, lat, lng, weight, prio in orders_data:
            ord_obj = Order(
                tracking_number=trk,
                customer_name=name,
                customer_phone=phone,
                delivery_address=addr,
                destination_lat=lat,
                destination_lng=lng,
                weight_kg=weight,
                priority=prio,
                status=OrderStatus.IN_TRANSIT,
                depot_id=depot.id
            )
            created_orders.append(ord_obj)
        db.add_all(created_orders)
        db.flush()

        # 5. Create 6 Active Realistic Campus Road Routes (One for each vehicle!)
        routes_plan = [
            (vehicles[0], ["DEPOT", "QUEEN_HALL", "SUB", "TRENCHARD", "SENATE", "KDL_LIBRARY", "DEPOT"], [created_orders[0], created_orders[1], created_orders[2]]),
            (vehicles[1], ["DEPOT", "JAJA_CLINIC", "MEDICINE", "PHARMACY", "SCIENCE_QUAD", "DEPOT"], [created_orders[3], created_orders[4], created_orders[5]]),
            (vehicles[2], ["DEPOT", "BELLO_HALL", "MELLANBY_HALL", "TEDDER_HALL", "KUTI_HALL", "DEPOT"], [created_orders[6], created_orders[7], created_orders[8]]),
            (vehicles[3], ["DEPOT", "VENTURES", "FARM", "BOTANICAL", "ICC_PAVILION", "DEPOT"], [created_orders[9], created_orders[10], created_orders[11]]),
            (vehicles[4], ["DEPOT", "TRENCHARD", "TECH_COMPLEX", "AWO_HALL", "POSTGRAD_COLLEGE", "DEPOT"], [created_orders[12], created_orders[13], created_orders[14]]),
            (vehicles[5], ["DEPOT", "SCIENCE_QUAD", "TECH_COMPLEX", "ZIK_HALL", "INDY_HALL", "DEPOT"], [created_orders[15], created_orders[16], created_orders[17]])
        ]

        now = datetime.now(timezone.utc)
        for veh, node_keys, r_orders in routes_plan:
            wps = generate_road_waypoints(node_keys, steps_per_segment=6)
            
            # Compute total distance
            tot_dist = 0.0
            for i in range(len(wps) - 1):
                tot_dist += haversine_distance(wps[i][0], wps[i][1], wps[i+1][0], wps[i+1][1])

            route = Route(
                vehicle_id=veh.id,
                depot_id=depot.id,
                status=RouteStatus.ACTIVE,
                total_distance_km=round(tot_dist, 2),
                estimated_duration_mins=round((tot_dist / 32.0) * 60.0 + (len(r_orders) * 5.0), 1),
                stops_count=len(r_orders),
                polyline_json=json.dumps(wps),
                current_waypoint_idx=1,
                started_at=now
            )
            db.add(route)
            db.flush()

            # Assign orders to this route
            for idx, ro in enumerate(r_orders, start=1):
                ro.assigned_route_id = route.id
                ro.assigned_vehicle_id = veh.id
                ro.stop_order = idx

        db.commit()
        logger.info(f"University of Ibadan fleet system successfully initialized with 6 authentic dispatch vehicles actively driving on 6 campus routes!")

    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding database: {e}", exc_info=True)
    finally:
        db.close()

def reset_and_reseed():
    """Drops and reseeds entire database with authentic University of Ibadan fleet and active routes."""
    Base.metadata.drop_all(bind=engine)
    seed_database()

if __name__ == "__main__":
    seed_database()
