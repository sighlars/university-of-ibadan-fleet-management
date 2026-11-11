from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Vehicle, Driver, VehicleStatus
from app.schemas import VehicleCreate, VehicleUpdate, VehicleResponse, DriverResponse

router = APIRouter(prefix="/vehicles", tags=["Vehicles"])

@router.get("", response_model=List[VehicleResponse])
def get_vehicles(db: Session = Depends(get_db)):
    return db.query(Vehicle).all()

@router.post("", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
def create_vehicle(vehicle_in: VehicleCreate, db: Session = Depends(get_db)):
    existing = db.query(Vehicle).filter(Vehicle.plate_number == vehicle_in.plate_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Vehicle with this plate number already exists")
    
    vehicle = Vehicle(**vehicle_in.model_dump())
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle

@router.get("/{vehicle_id}", response_model=VehicleResponse)
def get_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle

@router.patch("/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(vehicle_id: int, vehicle_in: VehicleUpdate, db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    update_data = vehicle_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(vehicle, key, value)

    db.commit()
    db.refresh(vehicle)
    return vehicle

@router.post("/{vehicle_id}/maintenance", response_model=VehicleResponse)
def toggle_maintenance(vehicle_id: int, db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if vehicle.status == VehicleStatus.MAINTENANCE:
        vehicle.status = VehicleStatus.IDLE
    else:
        vehicle.status = VehicleStatus.MAINTENANCE

    db.commit()
    db.refresh(vehicle)
    return vehicle

# Drivers
@router.get("/drivers/list", response_model=List[DriverResponse])
def get_drivers(db: Session = Depends(get_db)):
    return db.query(Driver).all()
