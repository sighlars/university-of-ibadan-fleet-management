import sys
import uvicorn
from app.seed import seed_database

def main():
    print("=" * 65)
    print(" 🚚 FleetFlow - Intelligent Fleet & Logistics Management System")
    print("=" * 65)
    print("Initializing database...")
    seed_database()
    print("Database ready.")
    print("Starting server...")
    print(" • Web Dashboard:   http://localhost:8000")
    print(" • Interactive Docs: http://localhost:8000/docs")
    print(" • ReDoc Specs:     http://localhost:8000/redoc")
    print("=" * 65)
    
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    main()
