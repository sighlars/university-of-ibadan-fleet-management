import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.database import engine, Base, SessionLocal
from app.models import (
    Depot, Driver, Vehicle, Order, Route, TelemetryLog,
    DriverStatus, VehicleStatus, VehicleType, OrderStatus, OrderPriority
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed")

def seed_database():
    """Seeds the database with authentic University of Ibadan campus fleet, drivers, depot, and logistics routes."""
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    try:
        # Check if already seeded with UI data
        existing = db.query(Depot).first()
        if existing and "Ibadan" in existing.name:
            logger.info("University of Ibadan fleet data already initialized. Skipping.")
            return

        # If previous seed was SF, wipe and re-seed
        if existing:
            logger.info("Detected previous non-UI seed data. Resetting to University of Ibadan...")
            Base.metadata.drop_all(bind=engine)
            Base.metadata.create_all(bind=engine)

        logger.info("Seeding University of Ibadan Central Logistics Depot...")
        depot = Depot(
            name="UI Central Campus Logistics Hub",
            address="Central Logistics Area, University of Ibadan Campus, Oyo State, Nigeria",
            latitude=7.445210,
            longitude=3.899015,
            contact_phone="+234 (0) 803 000 0000"
        )

        db.add(depot)
        db.flush()

        logger.info("Seeding University of Ibadan Official Fleet Drivers...")
        drivers = [
            Driver(name="Mr. Babatunde Adeyemi", phone="+234 803 411 2091", license_number="DL-OY-90218-UI", status=DriverStatus.AVAILABLE, rating=4.96),
            Driver(name="Mr. Emmanuel Olatunji", phone="+234 805 219 4432", license_number="DL-OY-48192-UI", status=DriverStatus.AVAILABLE, rating=4.92),
            Driver(name="Mrs. Aminat Bello", phone="+234 813 908 1120", license_number="DL-OY-77124-UI", status=DriverStatus.AVAILABLE, rating=4.98),
            Driver(name="Mr. Chinedu Okonkwo", phone="+234 802 674 8839", license_number="DL-OY-33918-UI", status=DriverStatus.AVAILABLE, rating=4.95),
            Driver(name="Mr. Sunday Adeleke", phone="+234 807 551 9024", license_number="DL-OY-61029-UI", status=DriverStatus.AVAILABLE, rating=4.87),
            Driver(name="Mrs. Folashade Ogunleye", phone="+234 816 430 7719", license_number="DL-OY-55102-UI", status=DriverStatus.AVAILABLE, rating=4.91),
        ]
        db.add_all(drivers)
        db.flush()

        logger.info("Seeding University of Ibadan Official Fleet Vehicles...")
        vehicles = [
            Vehicle(
                plate_number="UI-08-BUS",
                model="Toyota Coaster Executive Campus Shuttle",
                vehicle_type=VehicleType.CAMPUS_SHUTTLE,
                capacity_kg=2400.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IDLE,
                battery_fuel_pct=95.0,
                mileage_km=1420.0,
                max_range_km=450.0,
                driver_id=drivers[0].id
            ),
            Vehicle(
                plate_number="UI-14-WKS",
                model="Toyota Hilux D-4D Double Cabin 4x4",
                vehicle_type=VehicleType.UTILITY_PICKUP,
                capacity_kg=1000.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IDLE,
                battery_fuel_pct=90.0,
                mileage_km=3150.0,
                max_range_km=600.0,
                driver_id=drivers[1].id
            ),
            Vehicle(
                plate_number="UI-02-DSP",
                model="Yamaha YBR 125 Central Registry Courier",
                vehicle_type=VehicleType.DISPATCH_BIKE,
                capacity_kg=120.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IDLE,
                battery_fuel_pct=88.0,
                mileage_km=890.0,
                max_range_km=220.0,
                driver_id=drivers[2].id
            ),
            Vehicle(
                plate_number="UI-05-MED",
                model="Toyota HiAce Health Services & Lab Ambulance",
                vehicle_type=VehicleType.MEDICAL_AMBULANCE,
                capacity_kg=800.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IDLE,
                battery_fuel_pct=98.0,
                mileage_km=2140.0,
                max_range_km=500.0,
                driver_id=drivers[3].id
            ),
            Vehicle(
                plate_number="UI-21-TRK",
                model="Mercedes-Benz Atego Works Facilities Flatbed",
                vehicle_type=VehicleType.HEAVY_TRUCK,
                capacity_kg=4500.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IDLE,
                battery_fuel_pct=85.0,
                mileage_km=6420.0,
                max_range_km=550.0,
                driver_id=drivers[4].id
            ),
            Vehicle(
                plate_number="UI-11-AGR",
                model="Toyota Land Cruiser Agricultural Logistics",
                vehicle_type=VehicleType.UTILITY_PICKUP,
                capacity_kg=1200.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IDLE,
                battery_fuel_pct=92.0,
                mileage_km=4310.0,
                max_range_km=550.0,
                driver_id=drivers[5].id
            ),
        ]
        db.add_all(vehicles)
        db.flush()

        logger.info("Seeding Real University of Ibadan Campus Delivery Dispatches...")
        orders_data = [
            # Academic Core & Library
            ("UI-LOG-801", "Kenneth Dike Library (KDL) Archival Records", "+234 803 555 101", "Kenneth Dike Library, UI Campus Core", 7.4478, 3.9008, 45.0, OrderPriority.HIGH),
            ("UI-LOG-802", "Senate Chambers & Central Administration", "+234 802 555 102", "Tekena Tamuno Senate Building, UI", 7.4485, 3.8998, 14.0, OrderPriority.URGENT),
            ("UI-LOG-803", "UI Bookshop & Publishing House Consignment", "+234 805 555 103", "UI Bookshop Complex, Faculty of Arts Road", 7.4482, 3.9012, 110.0, OrderPriority.MEDIUM),
            
            # Faculties & Laboratories
            ("UI-LOG-804", "Faculty of Technology (Civil & Mech Labs)", "+234 813 555 104", "Faculty of Technology Complex, UI", 7.4520, 3.8985, 95.0, OrderPriority.URGENT),
            ("UI-LOG-805", "Faculty of Science (Chemistry & Zoology Labs)", "+234 816 555 105", "Faculty of Science Quadrangle, UI", 7.4495, 3.9020, 65.0, OrderPriority.HIGH),
            ("UI-LOG-806", "Faculty of Pharmacy Research Unit", "+234 807 555 106", "Faculty of Pharmacy Building, UI", 7.4490, 3.9035, 18.5, OrderPriority.URGENT),
            ("UI-LOG-807", "Faculty of The Social Sciences Registry", "+234 809 555 107", "Social Sciences Complex, UI", 7.4465, 3.8978, 22.0, OrderPriority.MEDIUM),
            ("UI-LOG-808", "Faculty of Arts & Trenchard Hall Operations", "+234 812 555 108", "Trenchard Hall Administrative Annex, UI", 7.4480, 3.9002, 30.0, OrderPriority.LOW),

            # Medical & Health Services
            ("UI-LOG-809", "Jaja Clinic (University Health Services)", "+234 803 555 109", "Jaja Health Centre, Health Sciences Road", 7.4462, 3.8970, 24.0, OrderPriority.URGENT),
            ("UI-LOG-810", "College of Medicine Medical Liaison (UCH Link)", "+234 802 555 110", "College of Medicine Complex, UI Campus", 7.4470, 3.9015, 38.0, OrderPriority.HIGH),

            # Postgraduate, Conference & Ventures
            ("UI-LOG-811", "Postgraduate College Academic Transcripts", "+234 805 555 111", "Morohundiya PG College Complex, UI", 7.4505, 3.8960, 42.0, OrderPriority.HIGH),
            ("UI-LOG-812", "International Conference Centre (ICC) Supplies", "+234 818 555 112", "UI International Conference Centre, 2nd Gate", 7.4560, 3.8920, 180.0, OrderPriority.MEDIUM),
            ("UI-LOG-813", "UI Ventures (Bakery & Water Treatment Unit)", "+234 806 555 113", "UI Ventures Commercial Centre, Barth Road", 7.4435, 3.9025, 320.0, OrderPriority.HIGH),
            ("UI-LOG-814", "Teaching & Research Farm (Agric produce)", "+234 814 555 114", "Parry Road Agricultural Research Farm, UI", 7.4445, 3.9055, 150.0, OrderPriority.MEDIUM),

            # Student Residential Halls & Services
            ("UI-LOG-815", "Sultan Bello & Mellanby Halls Student Desk", "+234 815 555 115", "Sultan Bello Hall Quadrangle, UI", 7.4478, 3.8992, 35.0, OrderPriority.LOW),
            ("UI-LOG-816", "Queen Elizabeth II Hall Food & Facilities", "+234 808 555 116", "Queen Hall, University of Ibadan", 7.4455, 3.8985, 80.0, OrderPriority.MEDIUM),
            ("UI-LOG-817", "Independence & Nnamdi Azikiwe (Zik) Halls", "+234 811 555 117", "Zik-Indy Central Logistics Gate, UI", 7.4545, 3.8955, 60.0, OrderPriority.MEDIUM),
            ("UI-LOG-818", "Obafemi Awolowo (Awo) Hall Facilities", "+234 817 555 118", "Awo Hall Complex, Off Tech Road, UI", 7.4530, 3.9010, 50.0, OrderPriority.LOW),
        ]

        orders = []
        for trk, name, phone, addr, lat, lng, weight, prio in orders_data:
            orders.append(Order(
                tracking_number=trk,
                customer_name=name,
                customer_phone=phone,
                delivery_address=addr,
                destination_lat=lat,
                destination_lng=lng,
                weight_kg=weight,
                priority=prio,
                status=OrderStatus.PENDING,
                depot_id=depot.id
            ))

        db.add_all(orders)
        db.commit()
        logger.info(f"University of Ibadan fleet system successfully seeded with {len(vehicles)} vehicles, {len(drivers)} drivers, and {len(orders)} campus delivery dispatches.")

    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding database: {e}", exc_info=True)
    finally:
        db.close()

def reset_and_reseed():
    """Drops and reseeds entire database with fresh University of Ibadan campus data."""
    Base.metadata.drop_all(bind=engine)
    seed_database()

if __name__ == "__main__":
    seed_database()
