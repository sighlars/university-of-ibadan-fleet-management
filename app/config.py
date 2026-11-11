import os
from pydantic import BaseModel

class Settings(BaseModel):
    APP_NAME: str = "FleetFlow - Intelligent Fleet & Logistics Management"
    APP_VERSION: str = "1.0.0"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./fleet.db")
    
    # Default Central Depot (San Francisco Hub)
    DEFAULT_DEPOT_NAME: str = "SF Metro Central Logistics Hub"
    DEFAULT_DEPOT_LAT: float = 37.774929
    DEFAULT_DEPOT_LNG: float = -122.419416
    DEFAULT_DEPOT_ADDRESS: str = "500 Howard Street, San Francisco, CA 94105"

    # Simulation settings
    SIMULATION_TICK_SECONDS: float = 1.0  # background tick interval
    DEFAULT_SPEED_MULTIPLIER: float = 1.0

settings = Settings()
