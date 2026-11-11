import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Vehicle, Route, Order, TelemetryLog, RouteStatus, VehicleStatus, OrderStatus
from app.engine.distance import haversine_distance, calculate_bearing
from app.api.websocket import ws_manager

logger = logging.getLogger("simulator")

class FleetSimulator:
    def __init__(self):
        self.is_running: bool = False
        self.speed_multiplier: float = 1.0
        self._task: Optional[asyncio.Task] = None
        self.tick_rate_seconds: float = 1.0

    def start(self):
        if not self.is_running:
            self.is_running = True
            try:
                loop = asyncio.get_running_loop()
                if self._task is None or self._task.done():
                    self._task = loop.create_task(self._simulation_loop())
                logger.info("Fleet simulation started.")
            except RuntimeError:
                logger.info("Simulation flagged as started (no active event loop in current thread).")


    def pause(self):
        self.is_running = False
        logger.info("Fleet simulation paused.")

    def set_speed(self, multiplier: float):
        self.speed_multiplier = max(0.2, min(multiplier, 10.0))
        logger.info(f"Fleet simulation speed set to {self.speed_multiplier}x")

    async def step(self):
        """Single manual simulation tick (useful when paused or for testing)"""
        await self._tick()

    async def _simulation_loop(self):
        logger.info("Simulation loop running...")
        while True:
            try:
                if self.is_running:
                    await self._tick()
                sleep_duration = max(0.1, self.tick_rate_seconds / self.speed_multiplier)
                await asyncio.sleep(sleep_duration)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in simulation loop: {e}", exc_info=True)
                await asyncio.sleep(1.0)

    async def _tick(self):
        """Runs one cycle of vehicle advancement and telemetry update"""
        db: Session = SessionLocal()
        try:
            active_routes = db.query(Route).filter(Route.status == RouteStatus.ACTIVE).all()
            telemetry_list: List[Dict[str, Any]] = []
            events: List[Dict[str, Any]] = []

            for route in active_routes:
                vehicle = db.query(Vehicle).filter(Vehicle.id == route.vehicle_id).first()
                if not vehicle:
                    continue

                if not route.polyline_json:
                    continue

                waypoints: List[List[float]] = json.loads(route.polyline_json)
                total_wps = len(waypoints)
                curr_idx = route.current_waypoint_idx or 0

                # Determine next waypoint step index
                step_jump = max(1, int(1 * self.speed_multiplier))
                next_idx = min(curr_idx + step_jump, total_wps - 1)

                if curr_idx < total_wps:
                    curr_pt = waypoints[curr_idx]
                    next_pt = waypoints[next_idx]

                    # Calculate distance covered in this tick
                    step_dist = haversine_distance(curr_pt[0], curr_pt[1], next_pt[0], next_pt[1])
                    heading = calculate_bearing(curr_pt[0], curr_pt[1], next_pt[0], next_pt[1])

                    # Update vehicle position
                    vehicle.current_lat = round(next_pt[0], 6)
                    vehicle.current_lng = round(next_pt[1], 6)
                    vehicle.mileage_km = round(vehicle.mileage_km + step_dist, 2)
                    
                    # Battery / Fuel consumption simulation
                    # EV uses ~0.08% per km; Truck ~0.15%
                    consumption_rate = 0.08 if "electric" in vehicle.vehicle_type.value.lower() else 0.15
                    vehicle.battery_fuel_pct = max(0.0, round(vehicle.battery_fuel_pct - (step_dist * consumption_rate), 1))
                    
                    # Speed simulation (urban speed with jitter)
                    sim_speed = 35.0 if step_dist > 0.01 else 0.0

                    route.current_waypoint_idx = next_idx
                    vehicle.status = VehicleStatus.IN_TRANSIT

                    # Check proximity to customer delivery stops
                    route_orders = db.query(Order).filter(
                        Order.assigned_route_id == route.id,
                        Order.status.in_([OrderStatus.PENDING, OrderStatus.ASSIGNED, OrderStatus.IN_TRANSIT])
                    ).all()

                    for order in route_orders:
                        dist_to_order = haversine_distance(vehicle.current_lat, vehicle.current_lng, order.destination_lat, order.destination_lng)
                        # If within 70 meters of stop, mark as delivered
                        if dist_to_order <= 0.07:
                            order.status = OrderStatus.DELIVERED
                            order.delivered_at = datetime.now(timezone.utc)
                            events.append({
                                "type": "delivery_completed",
                                "order_id": order.id,
                                "tracking_number": order.tracking_number,
                                "customer_name": order.customer_name,
                                "address": order.delivery_address,
                                "vehicle_plate": vehicle.plate_number
                            })
                            logger.info(f"Order #{order.tracking_number} delivered by {vehicle.plate_number}!")

                    # Route loop: continuous campus logistics cycle
                    if next_idx >= total_wps - 1:
                        route.current_waypoint_idx = 0
                        # Replenish battery / fuel on return loop
                        if vehicle.battery_fuel_pct < 25.0:
                            vehicle.battery_fuel_pct = 95.0

                        events.append({
                            "type": "route_loop_completed",
                            "route_id": route.id,
                            "vehicle_plate": vehicle.plate_number
                        })
                        logger.info(f"Route #{route.id} completed loop by {vehicle.plate_number}; restarting active delivery loop!")

                    # Record telemetry packet
                    next_stop = None
                    active_orders_count = 0
                    completed_orders_count = 0
                    for ro in db.query(Order).filter(Order.assigned_route_id == route.id).all():
                        if ro.status == OrderStatus.DELIVERED:
                            completed_orders_count += 1
                        else:
                            active_orders_count += 1
                            if next_stop is None:
                                next_stop = ro.delivery_address

                    remaining_wps = total_wps - next_idx
                    eta_mins = round((remaining_wps * 0.1 / 35.0) * 60.0, 1) if sim_speed > 0 else 0.0

                    t_packet = {
                        "vehicle_id": vehicle.id,
                        "plate_number": vehicle.plate_number,
                        "model": vehicle.model,
                        "vehicle_type": vehicle.vehicle_type.value,
                        "capacity_kg": vehicle.capacity_kg,
                        "driver_name": vehicle.driver.name if vehicle.driver else "Unassigned",
                        "driver_phone": vehicle.driver.phone if vehicle.driver else "",
                        "driver_rating": vehicle.driver.rating if vehicle.driver else 4.9,
                        "latitude": vehicle.current_lat,
                        "longitude": vehicle.current_lng,
                        "speed_kmh": sim_speed,
                        "battery_fuel_pct": vehicle.battery_fuel_pct,
                        "heading_deg": heading,
                        "status": vehicle.status.value,
                        "current_route_id": route.id if route.status == RouteStatus.ACTIVE else None,
                        "active_deliveries": active_orders_count,
                        "completed_deliveries": completed_orders_count,
                        "next_stop_address": next_stop or "Returning to Hub",
                        "eta_minutes": eta_mins
                    }
                    telemetry_list.append(t_packet)

                    # Periodically save a log to database (every 5 steps)
                    if next_idx % 5 == 0:
                        db.add(TelemetryLog(
                            vehicle_id=vehicle.id,
                            latitude=vehicle.current_lat,
                            longitude=vehicle.current_lng,
                            speed_kmh=sim_speed,
                            battery_fuel_pct=vehicle.battery_fuel_pct,
                            heading_deg=heading
                        ))

            # Also report idle vehicles in telemetry so the map keeps them visible
            idle_vehicles = db.query(Vehicle).filter(Vehicle.status != VehicleStatus.IN_TRANSIT).all()
            for iv in idle_vehicles:
                telemetry_list.append({
                    "vehicle_id": iv.id,
                    "plate_number": iv.plate_number,
                    "model": iv.model,
                    "vehicle_type": iv.vehicle_type.value,
                    "capacity_kg": iv.capacity_kg,
                    "driver_name": iv.driver.name if iv.driver else "Unassigned",
                    "driver_phone": iv.driver.phone if iv.driver else "",
                    "driver_rating": iv.driver.rating if iv.driver else 4.9,
                    "latitude": iv.current_lat,
                    "longitude": iv.current_lng,
                    "speed_kmh": 0.0,
                    "battery_fuel_pct": iv.battery_fuel_pct,
                    "heading_deg": 0.0,
                    "status": iv.status.value,
                    "current_route_id": None,
                    "active_deliveries": 0,
                    "completed_deliveries": 0,
                    "next_stop_address": "Stationed at Central Depot Bay",
                    "eta_minutes": 0.0
                })

            db.commit()

            # Broadcast live telemetry over WebSocket
            if telemetry_list or events:
                await ws_manager.broadcast({
                    "type": "telemetry_update",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "sim_state": {
                        "is_running": self.is_running,
                        "speed": self.speed_multiplier
                    },
                    "vehicles": telemetry_list,
                    "events": events
                })

        except Exception as e:
            db.rollback()
            logger.error(f"Error in simulation tick: {e}", exc_info=True)
        finally:
            db.close()

simulator = FleetSimulator()
