import pytest
from app.engine.router import VRPOptimizer

def test_vrp_optimizer_basic():
    depot = {"id": 1, "latitude": 37.78912, "longitude": -122.39845}
    vehicles = [
        {"id": 1, "plate_number": "VAN-01", "capacity_kg": 500.0},
        {"id": 2, "plate_number": "VAN-02", "capacity_kg": 500.0}
    ]
    orders = [
        {"id": 101, "customer_name": "Cust A", "delivery_address": "Addr A", "destination_lat": 37.790, "destination_lng": -122.400, "weight_kg": 50.0, "status": "pending"},
        {"id": 102, "customer_name": "Cust B", "delivery_address": "Addr B", "destination_lat": 37.795, "destination_lng": -122.405, "weight_kg": 70.0, "status": "pending"},
        {"id": 103, "customer_name": "Cust C", "delivery_address": "Addr C", "destination_lat": 37.785, "destination_lng": -122.410, "weight_kg": 40.0, "status": "pending"}
    ]

    routes = VRPOptimizer.optimize_fleet_routes(depot, vehicles, orders)
    assert len(routes) >= 1
    total_assigned_stops = sum(r["stops_count"] for r in routes)
    assert total_assigned_stops == 3
    for r in routes:
        assert r["total_distance_km"] > 0
        assert len(r["polyline"]) > 0

def test_vrp_capacity_constraint():
    depot = {"id": 1, "latitude": 37.78912, "longitude": -122.39845}
    # Vehicle can only carry 60kg
    vehicles = [
        {"id": 1, "plate_number": "TINY-VAN", "capacity_kg": 60.0},
        {"id": 2, "plate_number": "TINY-VAN-2", "capacity_kg": 60.0}
    ]
    # Orders are 40kg each -> cannot combine on 1 vehicle without exceeding 60kg
    orders = [
        {"id": 1, "customer_name": "A", "delivery_address": "Addr A", "destination_lat": 37.790, "destination_lng": -122.400, "weight_kg": 40.0, "status": "pending"},
        {"id": 2, "customer_name": "B", "delivery_address": "Addr B", "destination_lat": 37.795, "destination_lng": -122.405, "weight_kg": 40.0, "status": "pending"}
    ]

    routes = VRPOptimizer.optimize_fleet_routes(depot, vehicles, orders)
    assert len(routes) == 2  # Separated into 2 routes due to capacity limit
