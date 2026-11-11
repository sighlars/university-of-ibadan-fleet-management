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
    suffix = ''.join(random.choices(chars, k=5))
    return f"UI-LOG-{suffix}"

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
    """Spawns realistic campus logistics dispatch orders across University of Ibadan facilities."""
    depot = db.query(Depot).first()
    depot_id = depot.id if depot else 1

    sample_locations = [
        ("Faculty of Veterinary Medicine", "Vet Medicine Clinical Complex, UI", 7.4475, 3.9042),
        ("Department of Computer Science", "Computer Science Annex, Faculty of Science, UI", 7.4502, 3.9025),
        ("Faculty of Law Auditorium", "Faculty of Law, Off Tech Road, UI", 7.4515, 3.8995),
        ("Abdulsalami Abubakar PG Hall", "Abubakar Hall, UI Postgraduate Village", 7.4510, 3.8955),
        ("UI Botanical Gardens & Zoological Garden", "Zoological Gardens Boulevard, UI", 7.4430, 3.9005),
        ("Faculty of Education Complex", "Education Building, UI Campus", 7.4485, 3.8970),
        ("Sub-Deanery / Student Affairs Division", "Student Affairs Complex, UI", 7.4472, 3.8988),
        ("Distance Learning Centre (DLC) Resource Hub", "DLC Administrative Complex, UI", 7.4418, 3.8982),
        ("UI Water Treatment Plant", "Works Water Division, Barth Road, UI", 7.4438, 3.9030),
        ("Trenchard Hall Central Examinations Desk", "Trenchard Hall, University of Ibadan", 7.4482, 3.9001),
    ]

    department_units = [
        "Registry Examinations Unit", "Faculty Stores Division", "Laboratory Diagnostics Center",
        "Student Affairs Logistics", "University Health Board", "Works Maintenance Dispatch",
        "PG College Records Desk", "Distance Learning Delivery Hub"
    ]

    created = []
    for _ in range(min(count, len(sample_locations))):
        name, addr, lat, lng = random.choice(sample_locations)
        # Slight jitter
        lat += random.uniform(-0.0005, 0.0005)
        lng += random.uniform(-0.0005, 0.0005)

        tracking = generate_tracking_number()
        order = Order(
            tracking_number=tracking,
            customer_name=f"{random.choice(department_units)} ({name})",
            customer_phone=f"+234 {random.choice(['803', '802', '813', '805', '816'])}-{random.randint(100, 999)}-{random.randint(1000, 9999)}",
            delivery_address=addr,
            destination_lat=round(lat, 6),
            destination_lng=round(lng, 6),
            weight_kg=round(random.uniform(5.0, 75.0), 1),
            priority=random.choice([OrderPriority.MEDIUM, OrderPriority.HIGH, OrderPriority.URGENT]),
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
