from datetime import datetime, timezone
import enum
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, Text, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from app.database import Base

class VehicleStatus(str, enum.Enum):
    IDLE = "idle"
    IN_TRANSIT = "in_transit"
    DELIVERING = "delivering"
    MAINTENANCE = "maintenance"

class VehicleType(str, enum.Enum):
    ELECTRIC_VAN = "Electric Van"
    CARGO_TRUCK = "Cargo Truck"
    CARGO_BIKE = "Cargo Bike"
    HYBRID_VAN = "Hybrid Van"

class DriverStatus(str, enum.Enum):
    AVAILABLE = "available"
    ON_DELIVERY = "on_delivery"
    OFF_DUTY = "off_duty"

class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

class OrderPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

class RouteStatus(str, enum.Enum):
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class Depot(Base):
    __tablename__ = "depots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    address = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    contact_phone = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    orders = relationship("Order", back_populates="depot")
    routes = relationship("Route", back_populates="depot")

class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(50), nullable=False)
    license_number = Column(String(50), unique=True, nullable=False)
    status = Column(SQLEnum(DriverStatus), default=DriverStatus.AVAILABLE)
    rating = Column(Float, default=4.9)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    vehicles = relationship("Vehicle", back_populates="driver")

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    plate_number = Column(String(50), unique=True, nullable=False, index=True)
    model = Column(String(100), nullable=False)
    vehicle_type = Column(SQLEnum(VehicleType), default=VehicleType.ELECTRIC_VAN)
    capacity_kg = Column(Float, nullable=False, default=500.0)
    current_lat = Column(Float, nullable=False)
    current_lng = Column(Float, nullable=False)
    status = Column(SQLEnum(VehicleStatus), default=VehicleStatus.IDLE)
    battery_fuel_pct = Column(Float, default=100.0)
    mileage_km = Column(Float, default=0.0)
    max_range_km = Column(Float, default=250.0)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    driver = relationship("Driver", back_populates="vehicles")
    routes = relationship("Route", back_populates="vehicle")
    orders = relationship("Order", back_populates="assigned_vehicle")
    telemetry_logs = relationship("TelemetryLog", back_populates="vehicle", cascade="all, delete-orphan")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    tracking_number = Column(String(50), unique=True, index=True, nullable=False)
    customer_name = Column(String(100), nullable=False)
    customer_phone = Column(String(50), nullable=False)
    delivery_address = Column(String(255), nullable=False)
    destination_lat = Column(Float, nullable=False)
    destination_lng = Column(Float, nullable=False)
    weight_kg = Column(Float, default=5.0)
    priority = Column(SQLEnum(OrderPriority), default=OrderPriority.MEDIUM)
    status = Column(SQLEnum(OrderStatus), default=OrderStatus.PENDING)
    
    depot_id = Column(Integer, ForeignKey("depots.id"), nullable=True)
    assigned_vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    assigned_route_id = Column(Integer, ForeignKey("routes.id"), nullable=True)
    stop_order = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    delivered_at = Column(DateTime, nullable=True)

    depot = relationship("Depot", back_populates="orders")
    assigned_vehicle = relationship("Vehicle", back_populates="orders")
    route = relationship("Route", back_populates="orders")

class Route(Base):
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    depot_id = Column(Integer, ForeignKey("depots.id"), nullable=False)
    status = Column(SQLEnum(RouteStatus), default=RouteStatus.PLANNED)
    total_distance_km = Column(Float, default=0.0)
    estimated_duration_mins = Column(Float, default=0.0)
    stops_count = Column(Integer, default=0)
    polyline_json = Column(Text, nullable=True)  # JSON string of coordinates [[lat, lng], ...]
    current_waypoint_idx = Column(Integer, default=0)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    vehicle = relationship("Vehicle", back_populates="routes")
    depot = relationship("Depot", back_populates="routes")
    orders = relationship("Order", back_populates="route")

class TelemetryLog(Base):
    __tablename__ = "telemetry_logs"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    speed_kmh = Column(Float, default=0.0)
    battery_fuel_pct = Column(Float, default=100.0)
    heading_deg = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    vehicle = relationship("Vehicle", back_populates="telemetry_logs")
