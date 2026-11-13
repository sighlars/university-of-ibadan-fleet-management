import os
from pydantic import BaseModel

class Settings(BaseModel):
    APP_NAME: str = "Fleet Management System for a Delivery Company: Optimizing Logistics & Real-Time Tracking"
    CASE_STUDY: str = "University of Ibadan Campus Delivery Network"
    APP_VERSION: str = "2.0.0"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./fleet.db")
    
    # Central Logistics Hub: Case Study Depot at UI Campus
    DEFAULT_DEPOT_NAME: str = "UI Central Campus Logistics Hub"
    DEFAULT_DEPOT_LAT: float = 7.445210
    DEFAULT_DEPOT_LNG: float = 3.899015
    DEFAULT_DEPOT_ADDRESS: str = "Central Logistics Area, University of Ibadan, Ibadan, Oyo State, Nigeria"

    # Simulation parameters (campus urban transit speed 25 km/h)
    SIMULATION_TICK_SECONDS: float = 1.0
    DEFAULT_SPEED_MULTIPLIER: float = 1.0

settings = Settings()
