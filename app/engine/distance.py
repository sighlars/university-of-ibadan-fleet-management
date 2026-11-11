import math
from typing import List, Tuple

EARTH_RADIUS_KM = 6371.0088

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees).
    Returns distance in kilometers.
    """
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_KM * c

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the compass bearing (heading in degrees: 0 to 360) 
    from point 1 to point 2.
    """
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    diff_long = math.radians(lon2 - lon1)

    x = math.sin(diff_long) * math.cos(lat2_rad)
    y = (math.cos(lat1_rad) * math.sin(lat2_rad) -
         math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(diff_long))

    initial_bearing = math.atan2(x, y)
    initial_bearing = math.degrees(initial_bearing)
    compass_bearing = (initial_bearing + 360.0) % 360.0
    return round(compass_bearing, 1)

def generate_city_grid_waypoints(
    start_lat: float, start_lon: float, 
    end_lat: float, end_lon: float, 
    step_km: float = 0.05
) -> List[Tuple[float, float]]:
    """
    Generates a list of smooth realistic waypoints between two points.
    Simulates urban street navigation by routing along Manhattan-style street blocks
    with rounded corners and intermediate micro-steps for smooth map tracking.
    """
    total_dist = haversine_distance(start_lat, start_lon, end_lat, end_lon)
    if total_dist < 0.001:
        return [(start_lat, start_lon), (end_lat, end_lon)]

    waypoints: List[Tuple[float, float]] = [(start_lat, start_lon)]

    # Corner inflection point to simulate street grid turn
    corner_lat = start_lat
    corner_lon = end_lon

    # Segment 1: start to corner
    seg1_dist = haversine_distance(start_lat, start_lon, corner_lat, corner_lon)
    steps1 = max(1, int(seg1_dist / step_km))
    for s in range(1, steps1 + 1):
        ratio = s / float(steps1)
        lat = start_lat + (corner_lat - start_lat) * ratio
        lon = start_lon + (corner_lon - start_lon) * ratio
        waypoints.append((lat, lon))

    # Segment 2: corner to end
    seg2_dist = haversine_distance(corner_lat, corner_lon, end_lat, end_lon)
    steps2 = max(1, int(seg2_dist / step_km))
    for s in range(1, steps2 + 1):
        ratio = s / float(steps2)
        lat = corner_lat + (end_lat - corner_lat) * ratio
        lon = corner_lon + (end_lon - corner_lon) * ratio
        waypoints.append((lat, lon))

    return waypoints
