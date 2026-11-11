import random
import string
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Order, Depot, OrderStatus, OrderPriority
from app.schemas import OrderCreate, OrderResponse

router = APIRouter(prefix="/orders", tags=["Orders"])

def generate_tracking_number() -> str:
    chars = string.ascii_uppercase + string.digits
    suffix = ''.join(random.choices(chars, k=7))
    return f"FLT-{suffix}"

@router.get("", response_model=List[OrderResponse])
def get_orders(status_filter: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Order)
    if status_filter:
        query = query.filter(Order.status == status_filter)
    return query.order_by(Order.created_at.desc()).all()

@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(order_in: OrderCreate, db: Session = Depends(get_db)):
    depot_id = order_in.depot_id
    if not depot_id:
        default_depot = db.query(Depot).first()
        depot_id = default_depot.id if default_depot else 1

    tracking = generate_tracking_number()
    order = Order(
        tracking_number=tracking,
        customer_name=order_in.customer_name,
        customer_phone=order_in.customer_phone,
        delivery_address=order_in.delivery_address,
        destination_lat=order_in.destination_lat,
        destination_lng=order_in.destination_lng,
        weight_kg=order_in.weight_kg,
        priority=order_in.priority,
        status=OrderStatus.PENDING,
        depot_id=depot_id
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order

@router.post("/batch-sample", response_model=List[OrderResponse])
def create_batch_sample_orders(count: int = 5, db: Session = Depends(get_db)):
    """Quickly spawn realistic sample orders around SF for demonstration and routing"""
    depot = db.query(Depot).first()
    depot_id = depot.id if depot else 1

    sample_locations = [
        ("Mission Dolores Park", "566 Dolores St, San Francisco", 37.7596, -122.4270),
        ("Civic Center Plaza", "335 McAllister St, San Francisco", 37.7793, -122.4172),
        ("Embarcadero Ferry Building", "1 Ferry Building, San Francisco", 37.7955, -122.3937),
        ("Presidio Main Post", "103 Montgomery St, San Francisco", 37.7997, -122.4580),
        ("Sunset District Hub", "1900 Irving St, San Francisco", 37.7638, -122.4770),
        ("Fisherman's Wharf", "2801 Leavenworth St, San Francisco", 37.8080, -122.4177),
        ("Castro Theatre", "429 Castro St, San Francisco", 37.7620, -122.4348),
        ("Oracle Park Logistics Gate", "24 Willie Mays Plaza, San Francisco", 37.7786, -122.3893),
        ("Potrero Hill Library", "1616 20th St, San Francisco", 37.7615, -122.3986),
        ("Financial District Tower", "555 California St, San Francisco", 37.7925, -122.4040),
    ]

    customer_names = [
        "TechCorp Inc.", "Apex BioLabs", "GreenEats Cafe", "BlueSky Robotics", 
        "Vertex Hardware", "Marina Groceries", "Soma Design Studio", "CloudPeak Networks"
    ]

    created = []
    for _ in range(min(count, len(sample_locations))):
        name, addr, lat, lng = random.choice(sample_locations)
        # Add slight jitter so orders don't exactly stack
        lat += random.uniform(-0.003, 0.003)
        lng += random.uniform(-0.003, 0.003)

        tracking = generate_tracking_number()
        order = Order(
            tracking_number=tracking,
            customer_name=f"{random.choice(customer_names)}",
            customer_phone=f"+1 415-555-{random.randint(1000, 9999)}",
            delivery_address=addr,
            destination_lat=round(lat, 6),
            destination_lng=round(lng, 6),
            weight_kg=round(random.uniform(2.0, 35.0), 1),
            priority=random.choice([OrderPriority.MEDIUM, OrderPriority.HIGH, OrderPriority.LOW]),
            status=OrderStatus.PENDING,
            depot_id=depot_id
        )
        db.add(order)
        created.append(order)

    db.commit()
    for o in created:
        db.refresh(o)
    return created

@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == OrderStatus.DELIVERED:
        raise HTTPException(status_code=400, detail="Cannot cancel an already delivered order")
    
    order.status = OrderStatus.CANCELLED
    db.commit()
    return None
