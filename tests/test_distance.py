import pytest
from app.engine.distance import haversine_distance, calculate_bearing, generate_city_grid_waypoints

def test_haversine_same_point():
    lat, lon = 37.7749, -122.4194
    dist = haversine_distance(lat, lon, lat, lon)
    assert dist == 0.0

def test_haversine_known_distance():
    # San Francisco (37.7749, -122.4194) to Oakland (37.8044, -122.2712) ~ 13.5 km
    dist = haversine_distance(37.7749, -122.4194, 37.8044, -122.2712)
    assert 12.0 < dist < 15.0

def test_calculate_bearing_cardinal():
    # North
    heading_north = calculate_bearing(37.0, -122.0, 38.0, -122.0)
    assert abs(heading_north - 0.0) < 1.0 or abs(heading_north - 360.0) < 1.0

    # East
    heading_east = calculate_bearing(37.0, -122.0, 37.0, -121.0)
    assert 85.0 < heading_east < 95.0

def test_generate_waypoints():
    start_lat, start_lon = 37.7749, -122.4194
    end_lat, end_lon = 37.7800, -122.4100
    waypoints = generate_city_grid_waypoints(start_lat, start_lon, end_lat, end_lon, step_km=0.1)
    
    assert len(waypoints) >= 2
    assert waypoints[0] == (start_lat, start_lon)
    assert waypoints[-1] == (end_lat, end_lon)
