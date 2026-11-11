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
    """Seeds the database with realistic sample fleet, drivers, depot, and orders."""
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    try:
        # Check if already seeded
        if db.query(Depot).first():
            logger.info("Database already seeded. Skipping.")
            return

        logger.info("Seeding Central Logistics Depot...")
        depot = Depot(
            name="SF Metro Central Logistics Hub",
            address="500 Howard Street, San Francisco, CA 94105",
            latitude=37.78912,
            longitude=-122.39845,
            contact_phone="+1 (415) 800-FLEET"
        )
        db.add(depot)
        db.flush()

        logger.info("Seeding Drivers...")
        drivers = [
            Driver(name="Marcus Vance", phone="+1 (415) 555-0142", license_number="DL-CA-984321", status=DriverStatus.AVAILABLE, rating=4.95),
            Driver(name="Elena Rostova", phone="+1 (415) 555-0189", license_number="DL-CA-847291", status=DriverStatus.AVAILABLE, rating=4.98),
            Driver(name="Darius Washington", phone="+1 (415) 555-0177", license_number="DL-CA-562910", status=DriverStatus.AVAILABLE, rating=4.88),
            Driver(name="Sofia Chen", phone="+1 (415) 555-0163", license_number="DL-CA-339182", status=DriverStatus.AVAILABLE, rating=4.92),
            Driver(name="Carlos Mendes", phone="+1 (415) 555-0155", license_number="DL-CA-772019", status=DriverStatus.AVAILABLE, rating=4.85),
        ]
        db.add_all(drivers)
        db.flush()

        logger.info("Seeding Fleet Vehicles...")
        vehicles = [
            Vehicle(
                plate_number="EV-VAN-101",
                model="Ford E-Transit Cargo",
                vehicle_type=VehicleType.ELECTRIC_VAN,
                capacity_kg=750.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IDLE,
                battery_fuel_pct=98.0,
                mileage_km=1420.5,
                max_range_km=260.0,
                driver_id=drivers[0].id
            ),
            Vehicle(
                plate_number="EV-VAN-102",
                model="Rivian EDV 700",
                vehicle_type=VehicleType.ELECTRIC_VAN,
                capacity_kg=900.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IDLE,
                battery_fuel_pct=100.0,
                mileage_km=890.2,
                max_range_km=290.0,
                driver_id=drivers[1].id
            ),
            Vehicle(
                plate_number="BIKE-201",
                model="Urban Arrow Cargo XL",
                vehicle_type=VehicleType.CARGO_BIKE,
                capacity_kg=150.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IDLE,
                battery_fuel_pct=92.0,
                mileage_km=430.0,
                max_range_km=90.0,
                driver_id=drivers[2].id
            ),
            Vehicle(
                plate_number="TRK-301",
                model="Freightliner eM2 Heavy",
                vehicle_type=VehicleType.CARGO_TRUCK,
                capacity_kg=2200.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IDLE,
                battery_fuel_pct=88.0,
                mileage_km=3210.0,
                max_range_km=350.0,
                driver_id=drivers[3].id
            ),
            Vehicle(
                plate_number="HYB-401",
                model="Mercedes-Benz Sprinter Eco",
                vehicle_type=VehicleType.HYBRID_VAN,
                capacity_kg=850.0,
                current_lat=depot.latitude,
                current_lng=depot.longitude,
                status=VehicleStatus.IDLE,
                battery_fuel_pct=95.0,
                mileage_km=2140.0,
                max_range_km=400.0,
                driver_id=drivers[4].id
            ),
        ]
        db.add_all(vehicles)
        db.flush()

        logger.info("Seeding Orders across San Francisco...")
        orders_data = [
            # Downtown / Financial District
            ("FLT-701A29", "Salesforce Tower Logistics", "+1 415-555-1001", "415 Mission St, San Francisco", 37.7897, -122.3972, 12.5, OrderPriority.HIGH),
            ("FLT-819B34", "Montgomery Financial Corp", "+1 415-555-1002", "100 Montgomery St, San Francisco", 37.7905, -122.4021, 8.0, OrderPriority.MEDIUM),
            ("FLT-332C11", "Embarcadero Marketplace", "+1 415-555-1003", "1 Ferry Building, San Francisco", 37.7955, -122.3937, 24.0, OrderPriority.URGENT),
            ("FLT-904D88", "Telegraph Hill Creative Studio", "+1 415-555-1004", "250 Filbert St, San Francisco", 37.8016, -122.4045, 6.2, OrderPriority.LOW),
            
            # SoMa & Mission District
            ("FLT-115E45", "Mission Dolores Coffee Roasters", "+1 415-555-1005", "566 Dolores St, San Francisco", 37.7596, -122.4270, 18.0, OrderPriority.HIGH),
            ("FLT-628F72", "Valencia Street Apparel", "+1 415-555-1006", "820 Valencia St, San Francisco", 37.7599, -122.4215, 14.5, OrderPriority.MEDIUM),
            ("FLT-443G19", "Folsom Design Center", "+1 415-555-1007", "1045 Folsom St, San Francisco", 37.7779, -122.4077, 32.0, OrderPriority.HIGH),
            ("FLT-557H60", "Potrero Hill BioLabs", "+1 415-555-1008", "1616 20th St, San Francisco", 37.7615, -122.3986, 45.0, OrderPriority.URGENT),

            # North Beach & Marina
            ("FLT-229J31", "Fisherman's Wharf Seafood Supply", "+1 415-555-1009", "2801 Leavenworth St, San Francisco", 37.8080, -122.4177, 50.0, OrderPriority.MEDIUM),
            ("FLT-771K94", "Marina Green Sports Goods", "+1 415-555-1010", "200 Marina Blvd, San Francisco", 37.8055, -122.4385, 15.0, OrderPriority.LOW),
            ("FLT-882L15", "Union Street Boutiques", "+1 415-555-1011", "2180 Union St, San Francisco", 37.7972, -122.4361, 9.5, OrderPriority.MEDIUM),

            # Western Addition / Richmond / Sunset
            ("FLT-339M47", "Presidio Healthcare Clinic", "+1 415-555-1012", "103 Montgomery St, San Francisco", 37.7997, -122.4580, 22.0, OrderPriority.HIGH),
            ("FLT-491N83", "Clement Asian Produce", "+1 415-555-1013", "1200 Clement St, San Francisco", 37.7828, -122.4722, 38.0, OrderPriority.MEDIUM),
            ("FLT-512P20", "Golden Gate Park Science Academy", "+1 415-555-1014", "55 Music Concourse Dr, San Francisco", 37.7699, -122.4661, 28.5, OrderPriority.HIGH),
            ("FLT-674Q77", "Sunset District Hardware", "+1 415-555-1015", "1900 Irving St, San Francisco", 37.7638, -122.4770, 42.0, OrderPriority.LOW),
            ("FLT-928R51", "Castro Community Pharmacy", "+1 415-555-1016", "429 Castro St, San Francisco", 37.7620, -122.4348, 11.0, OrderPriority.URGENT),
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
        logger.info(f"Database successfully seeded! Created {len(vehicles)} vehicles, {len(drivers)} drivers, and {len(orders)} orders.")

    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding database: {e}", exc_info=True)
    finally:
        db.close()

def reset_and_reseed():
    """Drops and reseeds entire database for quick demonstration resets."""
    Base.metadata.drop_all(bind=engine)
    seed_database()

if __name__ == "__main__":
    seed_database()
