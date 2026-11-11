import pytest
from app.engine.distance import haversine_distance, calculate_bearing, generate_city_grid_waypoints

def test_haversine_same_point():
    lat, lon = 7.445210, 3.899015
    dist = haversine_distance(lat, lon, lat, lon)
    assert dist == 0.0

def test_haversine_ui_campus_distance():
    # University of Ibadan Main Gate (7.4429, 3.8996) to Trenchard Hall (7.4485, 3.9002) ~ 0.62 km
    dist = haversine_distance(7.4429, 3.8996, 7.4485, 3.9002)
    assert 0.4 < dist < 0.9

    # UI Works Depot (7.4452, 3.8990) to UI ICC / 2nd Gate (7.4560, 3.8920) ~ 1.43 km
    dist_icc = haversine_distance(7.4452, 3.8990, 7.4560, 3.8920)
    assert 1.0 < dist_icc < 2.0

def test_calculate_bearing_cardinal():
    # North
    heading_north = calculate_bearing(7.44, 3.89, 7.45, 3.89)
    assert abs(heading_north - 0.0) < 1.0 or abs(heading_north - 360.0) < 1.0

    # East
    heading_east = calculate_bearing(7.44, 3.89, 7.44, 3.90)
    assert 85.0 < heading_east < 95.0

def test_generate_waypoints():
    start_lat, start_lon = 7.4452, 3.8990
    end_lat, end_lon = 7.4485, 3.9002
    waypoints = generate_city_grid_waypoints(start_lat, start_lon, end_lat, end_lon, step_km=0.05)
    
    assert len(waypoints) >= 2
    assert waypoints[0] == (start_lat, start_lon)
    assert waypoints[-1] == (end_lat, end_lon)
