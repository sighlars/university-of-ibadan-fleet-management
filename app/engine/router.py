import json
from typing import List, Dict, Any, Tuple
from app.engine.distance import haversine_distance, generate_city_grid_waypoints

class VRPOptimizer:
    """
    Capacitated Vehicle Routing Problem (CVRP) Optimizer
    Uses Clarke-Wright Savings algorithm combined with 2-Opt Local Search TSP improvement.
    Optimizes multi-vehicle parcel deliveries from a central depot.
    """

    AVERAGE_URBAN_SPEED_KMH = 32.0  # Realistic city delivery speed
    SERVICE_TIME_PER_STOP_MINS = 5.0  # Unloading & customer handover

    @classmethod
    def optimize_fleet_routes(
        cls,
        depot: Dict[str, Any],
        vehicles: List[Dict[str, Any]],
        orders: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Takes depot info, list of available vehicles, and pending orders.
        Returns optimized route assignments for each vehicle.
        """
        if not orders or not vehicles:
            return []

        depot_lat = depot["latitude"]
        depot_lng = depot["longitude"]
        depot_id = depot["id"]

        # Sort vehicles by capacity descending so largest capacity vehicles get primary routes
        sorted_vehicles = sorted(vehicles, key=lambda v: v.get("capacity_kg", 500.0), reverse=True)

        # 1. Clarke-Wright Savings Computation
        # Initial separate routes: each order i has route [i]
        order_dict = {o["id"]: o for o in orders}
        order_ids = list(order_dict.keys())
        n = len(order_ids)

        # Calculate savings S_ij = d(D, i) + d(D, j) - d(i, j)
        savings: List[Tuple[float, int, int]] = []
        for i in range(n):
            id_i = order_ids[i]
            oi = order_dict[id_i]
            d_d_i = haversine_distance(depot_lat, depot_lng, oi["destination_lat"], oi["destination_lng"])

            for j in range(i + 1, n):
                id_j = order_ids[j]
                oj = order_dict[id_j]
                d_d_j = haversine_distance(depot_lat, depot_lng, oj["destination_lat"], oj["destination_lng"])
                d_i_j = haversine_distance(oi["destination_lat"], oi["destination_lng"], oj["destination_lat"], oj["destination_lng"])

                s = d_d_i + d_d_j - d_i_j
                if s > 0:
                    savings.append((s, id_i, id_j))

        # Sort savings descending
        savings.sort(key=lambda x: x[0], reverse=True)

        # Initialize clusters: each order is its own route
        routes_map: Dict[int, List[int]] = {oid: [oid] for oid in order_ids}
        route_loads: Dict[int, float] = {oid: order_dict[oid].get("weight_kg", 5.0) for oid in order_ids}
        
        # Max capacity across available vehicles
        max_vehicle_cap = max([v.get("capacity_kg", 500.0) for v in sorted_vehicles]) if sorted_vehicles else 500.0

        # Merge routes based on savings
        for saving, id_i, id_j in savings:
            # Find which route currently contains id_i and id_j
            route_i_key = None
            route_j_key = None
            for key, r in routes_map.items():
                if id_i in r:
                    route_i_key = key
                if id_j in r:
                    route_j_key = key

            if route_i_key is not None and route_j_key is not None and route_i_key != route_j_key:
                route_i = routes_map[route_i_key]
                route_j = routes_map[route_j_key]

                # Check if id_i is an endpoint of route_i and id_j is an endpoint of route_j
                is_i_endpoint = (route_i[0] == id_i or route_i[-1] == id_i)
                is_j_endpoint = (route_j[0] == id_j or route_j[-1] == id_j)

                if is_i_endpoint and is_j_endpoint:
                    combined_load = route_loads[route_i_key] + route_loads[route_j_key]
                    if combined_load <= max_vehicle_cap:
                        # Order routes so endpoints align
                        if route_i[0] == id_i:
                            route_i.reverse()
                        if route_j[-1] == id_j:
                            route_j.reverse()

                        # Merge
                        merged = route_i + route_j
                        routes_map[route_i_key] = merged
                        route_loads[route_i_key] = combined_load
                        del routes_map[route_j_key]
                        del route_loads[route_j_key]

        # Remaining route clusters
        clustered_order_routes = list(routes_map.values())

        # 2. Assign route clusters to available vehicles
        # Sort clusters by total load descending
        clustered_order_routes.sort(key=lambda r: sum(order_dict[oid].get("weight_kg", 5.0) for oid in r), reverse=True)

        final_routes: List[Dict[str, Any]] = []
        unassigned_orders: List[int] = []

        for r_orders in clustered_order_routes:
            total_load = sum(order_dict[oid].get("weight_kg", 5.0) for oid in r_orders)
            
            # Find an available vehicle with sufficient capacity
            assigned_veh = None
            for v in sorted_vehicles:
                if v["id"] not in [fr["vehicle_id"] for fr in final_routes] and v.get("capacity_kg", 500.0) >= total_load:
                    assigned_veh = v
                    break

            if assigned_veh is None:
                # If no vehicle fits the whole cluster, take the first available vehicle
                for v in sorted_vehicles:
                    if v["id"] not in [fr["vehicle_id"] for fr in final_routes]:
                        assigned_veh = v
                        break

            if assigned_veh is None:
                # No more available vehicles
                unassigned_orders.extend(r_orders)
                continue

            # 3. Apply 2-Opt TSP improvement on the stop sequence
            optimized_sequence = cls._two_opt_route(depot_lat, depot_lng, r_orders, order_dict)

            # 4. Generate navigation waypoints and metrics
            total_dist_km, waypoints = cls._build_route_path(depot_lat, depot_lng, optimized_sequence, order_dict)
            drive_time_mins = (total_dist_km / cls.AVERAGE_URBAN_SPEED_KMH) * 60.0
            total_time_mins = drive_time_mins + (len(optimized_sequence) * cls.SERVICE_TIME_PER_STOP_MINS)

            stops_payload = []
            for idx, oid in enumerate(optimized_sequence, start=1):
                o = order_dict[oid]
                stops_payload.append({
                    "order_id": o["id"],
                    "customer_name": o["customer_name"],
                    "delivery_address": o["delivery_address"],
                    "lat": o["destination_lat"],
                    "lng": o["destination_lng"],
                    "weight_kg": o.get("weight_kg", 5.0),
                    "stop_order": idx,
                    "status": o.get("status", "pending")
                })

            final_routes.append({
                "vehicle_id": assigned_veh["id"],
                "vehicle_plate": assigned_veh.get("plate_number", ""),
                "depot_id": depot_id,
                "stops": stops_payload,
                "total_distance_km": round(total_dist_km, 2),
                "estimated_duration_mins": round(total_time_mins, 1),
                "stops_count": len(stops_payload),
                "polyline": waypoints
            })

        return final_routes

    @classmethod
    def _two_opt_route(
        cls,
        depot_lat: float, depot_lng: float,
        order_ids: List[int],
        order_dict: Dict[int, Any]
    ) -> List[int]:
        """
        2-Opt local search heuristic to optimize the order sequence within a vehicle route.
        Eliminates crossing edges and minimizes round-trip distance.
        """
        if len(order_ids) <= 2:
            return order_ids

        best_route = list(order_ids)
        improved = True
        max_iterations = 50
        iteration = 0

        def route_distance(r: List[int]) -> float:
            dist = 0.0
            prev_lat, prev_lng = depot_lat, depot_lng
            for oid in r:
                curr = order_dict[oid]
                dist += haversine_distance(prev_lat, prev_lng, curr["destination_lat"], curr["destination_lng"])
                prev_lat, prev_lng = curr["destination_lat"], curr["destination_lng"]
            # Return to depot
            dist += haversine_distance(prev_lat, prev_lng, depot_lat, depot_lng)
            return dist

        best_dist = route_distance(best_route)

        while improved and iteration < max_iterations:
            improved = False
            iteration += 1
            for i in range(len(best_route) - 1):
                for j in range(i + 1, len(best_route)):
                    new_route = best_route[:i] + best_route[i:j+1][::-1] + best_route[j+1:]
                    new_dist = route_distance(new_route)
                    if new_dist < best_dist - 0.001:
                        best_dist = new_dist
                        best_route = new_route
                        improved = True
                        break
                if improved:
                    break

        return best_route

    @classmethod
    def _build_route_path(
        cls,
        depot_lat: float, depot_lng: float,
        sequence: List[int],
        order_dict: Dict[int, Any]
    ) -> Tuple[float, List[List[float]]]:
        """
        Builds full waypoint path (depot -> stop 1 -> ... -> stop N -> depot)
        Returns (total_distance_km, polyline coordinates)
        """
        total_distance = 0.0
        full_polyline: List[List[float]] = []

        curr_lat, curr_lng = depot_lat, depot_lng
        full_polyline.append([round(curr_lat, 6), round(curr_lng, 6)])

        for oid in sequence:
            dest = order_dict[oid]
            dest_lat = dest["destination_lat"]
            dest_lng = dest["destination_lng"]
            total_distance += haversine_distance(curr_lat, curr_lng, dest_lat, dest_lng)
            
            # Generate intermediate street-grid waypoints
            seg_waypoints = generate_city_grid_waypoints(curr_lat, curr_lng, dest_lat, dest_lng, step_km=0.1)
            for pt in seg_waypoints[1:]:
                full_polyline.append([round(pt[0], 6), round(pt[1], 6)])

            curr_lat, curr_lng = dest_lat, dest_lng

        # Return leg to depot
        total_distance += haversine_distance(curr_lat, curr_lng, depot_lat, depot_lng)
        return_waypoints = generate_city_grid_waypoints(curr_lat, curr_lng, depot_lat, depot_lng, step_km=0.1)
        for pt in return_waypoints[1:]:
            full_polyline.append([round(pt[0], 6), round(pt[1], 6)])

        return total_distance, full_polyline
