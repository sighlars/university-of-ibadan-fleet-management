import os
from pydantic import BaseModel

class Settings(BaseModel):
    APP_NAME: str = "UI-FleetFlow — University of Ibadan Fleet Management System"
    INSTITUTION: str = "University of Ibadan"
    MOTTO: str = "Recte Sapere Fons (To Think Straight is the Fountain of Knowledge)"
    APP_VERSION: str = "2.0.0"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./fleet.db")
    
    # Central Logistics Hub: Works & Maintenance Transport Pool, University of Ibadan
    DEFAULT_DEPOT_NAME: str = "UI Works & Transport Central Pool"
    DEFAULT_DEPOT_LAT: float = 7.445210
    DEFAULT_DEPOT_LNG: float = 3.899015
    DEFAULT_DEPOT_ADDRESS: str = "Works & Maintenance Dept, University of Ibadan, Ibadan, Oyo State, Nigeria"

    # Simulation parameters (campus urban transit speed 25 km/h)
    SIMULATION_TICK_SECONDS: float = 1.0
    DEFAULT_SPEED_MULTIPLIER: float = 1.0

settings = Settings()
