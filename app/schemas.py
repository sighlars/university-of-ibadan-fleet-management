from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict
from app.models import VehicleStatus, VehicleType, DriverStatus, OrderStatus, OrderPriority, RouteStatus

# --- Depot Schemas ---
class DepotBase(BaseModel):
    name: str
    address: str
    latitude: float
    longitude: float
    contact_phone: Optional[str] = None

class DepotCreate(DepotBase):
    pass

class DepotResponse(DepotBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Driver Schemas ---
class DriverBase(BaseModel):
    name: str
    phone: str
    license_number: str
    status: DriverStatus = DriverStatus.AVAILABLE
    rating: float = 5.0

class DriverCreate(DriverBase):
    pass

class DriverResponse(DriverBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Vehicle Schemas ---
class VehicleBase(BaseModel):
    plate_number: str
    model: str
    vehicle_type: VehicleType = VehicleType.UTILITY_PICKUP
    capacity_kg: float = 500.0

    current_lat: float
    current_lng: float
    status: VehicleStatus = VehicleStatus.IDLE
    battery_fuel_pct: float = 100.0
    mileage_km: float = 0.0
    max_range_km: float = 250.0
    driver_id: Optional[int] = None

class VehicleCreate(VehicleBase):
    pass

class VehicleUpdate(BaseModel):
    model: Optional[str] = None
    status: Optional[VehicleStatus] = None
    driver_id: Optional[int] = None
    battery_fuel_pct: Optional[float] = None
    capacity_kg: Optional[float] = None

class VehicleResponse(VehicleBase):
    id: int
    updated_at: datetime
    driver: Optional[DriverResponse] = None
    model_config = ConfigDict(from_attributes=True)

# --- Order Schemas ---
class OrderBase(BaseModel):
    customer_name: str
    customer_phone: str
    delivery_address: str
    destination_lat: float
    destination_lng: float
    weight_kg: float = 5.0
    priority: OrderPriority = OrderPriority.MEDIUM

class OrderCreate(OrderBase):
    depot_id: Optional[int] = None

class OrderResponse(OrderBase):
    id: int
    tracking_number: str
    status: OrderStatus
    depot_id: Optional[int] = None
    assigned_vehicle_id: Optional[int] = None
    assigned_route_id: Optional[int] = None
    stop_order: Optional[int] = None
    created_at: datetime
    delivered_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

# --- Route Schemas ---
class RouteStop(BaseModel):
    order_id: int
    customer_name: str
    delivery_address: str
    lat: float
    lng: float
    weight_kg: float
    stop_order: int
    status: OrderStatus

class RouteResponse(BaseModel):
    id: int
    vehicle_id: int
    vehicle_plate: Optional[str] = None
    depot_id: int
    status: RouteStatus
    total_distance_km: float
    estimated_duration_mins: float
    stops_count: int
    current_waypoint_idx: int
    polyline: List[List[float]] = []
    stops: List[RouteStop] = []
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


# --- Telemetry & Live Tracking Schemas ---
class TelemetryUpdate(BaseModel):
    vehicle_id: int
    plate_number: str
    vehicle_type: str
    driver_name: Optional[str] = None
    latitude: float
    longitude: float
    speed_kmh: float
    battery_fuel_pct: float
    heading_deg: float
    status: str
    current_route_id: Optional[int] = None
    active_deliveries: int = 0
    completed_deliveries: int = 0
    next_stop_address: Optional[str] = None
    eta_minutes: Optional[float] = None

class SimulationControl(BaseModel):
    action: str = Field(..., description="'start', 'pause', 'reset', 'step', or 'speed'")
    speed_multiplier: Optional[float] = 1.0

# --- Analytics Schemas ---
class FleetKPIs(BaseModel):
    total_vehicles: int
    active_vehicles: int
    idle_vehicles: int
    maintenance_vehicles: int
    total_orders: int
    pending_orders: int
    in_transit_orders: int
    delivered_orders: int
    on_time_rate_pct: float
    total_distance_km: float
    co2_saved_kg: float
    fleet_utilization_pct: float
