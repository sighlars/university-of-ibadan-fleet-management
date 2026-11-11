import json
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Route, Vehicle, Order, Depot, RouteStatus, VehicleStatus, OrderStatus
from app.schemas import RouteResponse, RouteStop
from app.engine.router import VRPOptimizer
from app.engine.simulator import simulator

router = APIRouter(prefix="/routes", tags=["Routes & Logistics"])

@router.get("", response_model=List[RouteResponse])
def get_routes(status_filter: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Route)
    if status_filter:
        query = query.filter(Route.status == status_filter)
    routes = query.order_by(Route.created_at.desc()).all()

    results = []
    for r in routes:
        polyline_coords = json.loads(r.polyline_json) if r.polyline_json else []
        route_orders = db.query(Order).filter(Order.assigned_route_id == r.id).order_by(Order.stop_order).all()
        stops = [
            RouteStop(
                order_id=o.id,
                customer_name=o.customer_name,
                delivery_address=o.delivery_address,
                lat=o.destination_lat,
                lng=o.destination_lng,
                weight_kg=o.weight_kg,
                stop_order=o.stop_order or 0,
                status=o.status
            ) for o in route_orders
        ]
        results.append(RouteResponse(
            id=r.id,
            vehicle_id=r.vehicle_id,
            vehicle_plate=r.vehicle.plate_number if r.vehicle else None,
            depot_id=r.depot_id,
            status=r.status,
            total_distance_km=r.total_distance_km,
            estimated_duration_mins=r.estimated_duration_mins,
            stops_count=r.stops_count,
            current_waypoint_idx=r.current_waypoint_idx or 0,
            polyline=polyline_coords,
            stops=stops,
            created_at=r.created_at,
            started_at=r.started_at,
            completed_at=r.completed_at
        ))
    return results

@router.post("/optimize", response_model=List[RouteResponse])
def optimize_fleet(db: Session = Depends(get_db)):
    """
    Solves Capacitated Vehicle Routing Problem (CVRP) for all pending orders
    and available fleet vehicles.
    """
    depot = db.query(Depot).first()
    if not depot:
        raise HTTPException(status_code=400, detail="Depot not configured. Seed database first.")

    pending_orders = db.query(Order).filter(Order.status == OrderStatus.PENDING).all()
    if not pending_orders:
        raise HTTPException(status_code=400, detail="No pending orders to optimize. Create orders first.")

    available_vehicles = db.query(Vehicle).filter(
        Vehicle.status.in_([VehicleStatus.IDLE]),
        Vehicle.battery_fuel_pct > 15.0
    ).all()

    if not available_vehicles:
        raise HTTPException(status_code=400, detail="No idle vehicles with sufficient battery/fuel available.")

    # Prepare data dicts for VRP solver
    depot_dict = {
        "id": depot.id,
        "latitude": depot.latitude,
        "longitude": depot.longitude
    }

    vehicles_dicts = [{
        "id": v.id,
        "plate_number": v.plate_number,
        "capacity_kg": v.capacity_kg
    } for v in available_vehicles]

    orders_dicts = [{
        "id": o.id,
        "customer_name": o.customer_name,
        "delivery_address": o.delivery_address,
        "destination_lat": o.destination_lat,
        "destination_lng": o.destination_lng,
        "weight_kg": o.weight_kg,
        "status": o.status.value
    } for o in pending_orders]

    # Run VRP Clarke-Wright + 2-Opt Optimization
    optimized_plan = VRPOptimizer.optimize_fleet_routes(depot_dict, vehicles_dicts, orders_dicts)

    if not optimized_plan:
        raise HTTPException(status_code=400, detail="Optimization solver could not find feasible routes.")

    # Remove previous un-dispatched PLANNED routes
    old_planned = db.query(Route).filter(Route.status == RouteStatus.PLANNED).all()
    for opr in old_planned:
        db.query(Order).filter(Order.assigned_route_id == opr.id).update({
            Order.assigned_route_id: None,
            Order.assigned_vehicle_id: None,
            Order.status: OrderStatus.PENDING,
            Order.stop_order: None
        })
        db.delete(opr)
    db.commit()

    created_routes: List[RouteResponse] = []

    for r_data in optimized_plan:
        new_route = Route(
            vehicle_id=r_data["vehicle_id"],
            depot_id=r_data["depot_id"],
            status=RouteStatus.PLANNED,
            total_distance_km=r_data["total_distance_km"],
            estimated_duration_mins=r_data["estimated_duration_mins"],
            stops_count=r_data["stops_count"],
            polyline_json=json.dumps(r_data["polyline"]),
            current_waypoint_idx=0
        )
        db.add(new_route)
        db.flush()  # get route.id

        stops_list = []
        for stop_info in r_data["stops"]:
            order = db.query(Order).filter(Order.id == stop_info["order_id"]).first()
            if order:
                order.assigned_route_id = new_route.id
                order.assigned_vehicle_id = new_route.vehicle_id
                order.stop_order = stop_info["stop_order"]
                order.status = OrderStatus.ASSIGNED

                stops_list.append(RouteStop(
                    order_id=order.id,
                    customer_name=order.customer_name,
                    delivery_address=order.delivery_address,
                    lat=order.destination_lat,
                    lng=order.destination_lng,
                    weight_kg=order.weight_kg,
                    stop_order=order.stop_order,
                    status=order.status
                ))

        created_routes.append(RouteResponse(
            id=new_route.id,
            vehicle_id=new_route.vehicle_id,
            vehicle_plate=r_data.get("vehicle_plate"),
            depot_id=new_route.depot_id,
            status=new_route.status,
            total_distance_km=new_route.total_distance_km,
            estimated_duration_mins=new_route.estimated_duration_mins,
            stops_count=new_route.stops_count,
            current_waypoint_idx=0,
            polyline=r_data["polyline"],
            stops=stops_list,
            created_at=datetime.now(timezone.utc)
        ))

    db.commit()
    return created_routes

@router.post("/dispatch-all")
async def dispatch_all_routes(db: Session = Depends(get_db)):
    """Dispatches all planned routes into active execution and starts real-time simulation."""

    planned_routes = db.query(Route).filter(Route.status == RouteStatus.PLANNED).all()
    if not planned_routes:
        raise HTTPException(status_code=400, detail="No planned routes available to dispatch.")

    now = datetime.now(timezone.utc)
    for r in planned_routes:
        r.status = RouteStatus.ACTIVE
        r.started_at = now
        
        # Update vehicle
        vehicle = db.query(Vehicle).filter(Vehicle.id == r.vehicle_id).first()
        if vehicle:
            vehicle.status = VehicleStatus.IN_TRANSIT

        # Update orders
        db.query(Order).filter(Order.assigned_route_id == r.id).update({
            Order.status: OrderStatus.IN_TRANSIT
        })

    db.commit()

    # Launch simulation
    simulator.start()

    return {"message": f"Successfully dispatched {len(planned_routes)} routes. Simulation active.", "dispatched_count": len(planned_routes)}
