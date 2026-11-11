import pytest
from app.engine.router import VRPOptimizer

def test_vrp_optimizer_basic():
    # University of Ibadan Works Depot
    depot = {"id": 1, "latitude": 7.445210, "longitude": 3.899015}
    vehicles = [
        {"id": 1, "plate_number": "UI-08-BUS", "capacity_kg": 1500.0},
        {"id": 2, "plate_number": "UI-14-WKS", "capacity_kg": 1000.0}
    ]
    orders = [
        {"id": 101, "customer_name": "Kenneth Dike Library", "delivery_address": "KDL, UI", "destination_lat": 7.4478, "destination_lng": 3.9008, "weight_kg": 45.0, "status": "pending"},
        {"id": 102, "customer_name": "Faculty of Technology", "delivery_address": "Tech, UI", "destination_lat": 7.4520, "destination_lng": 3.8985, "weight_kg": 70.0, "status": "pending"},
        {"id": 103, "customer_name": "Jaja Clinic", "delivery_address": "Jaja, UI", "destination_lat": 7.4462, "destination_lng": 3.8970, "weight_kg": 20.0, "status": "pending"}
    ]

    routes = VRPOptimizer.optimize_fleet_routes(depot, vehicles, orders)
    assert len(routes) >= 1
    total_assigned_stops = sum(r["stops_count"] for r in routes)
    assert total_assigned_stops == 3
    for r in routes:
        assert r["total_distance_km"] > 0
        assert len(r["polyline"]) > 0

def test_vrp_capacity_constraint():
    depot = {"id": 1, "latitude": 7.445210, "longitude": 3.899015}
    # Dispatch Bike with 50kg capacity limit
    vehicles = [
        {"id": 1, "plate_number": "UI-02-DSP", "capacity_kg": 50.0},
        {"id": 2, "plate_number": "UI-03-DSP", "capacity_kg": 50.0}
    ]
    # Two parcels of 40kg each -> cannot combine on one 50kg bike
    orders = [
        {"id": 1, "customer_name": "A", "delivery_address": "Addr A", "destination_lat": 7.448, "destination_lng": 3.900, "weight_kg": 40.0, "status": "pending"},
        {"id": 2, "customer_name": "B", "delivery_address": "Addr B", "destination_lat": 7.450, "destination_lng": 3.898, "weight_kg": 40.0, "status": "pending"}
    ]

    routes = VRPOptimizer.optimize_fleet_routes(depot, vehicles, orders)
    assert len(routes) == 2  # Separated into 2 routes due to capacity limit
