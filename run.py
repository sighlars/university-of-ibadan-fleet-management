import sys
import uvicorn
from app.seed import seed_database

def main():
    print("=" * 70)
    print(" 🚚 UI-FleetFlow — Campus Fleet & Logistics Management System")
    print("    Academic School Project | Case Study: University of Ibadan")
    print("=" * 70)
    print("Initializing case study database & vehicle roster...")
    seed_database()
    print("Database ready.")
    print("Starting local server...")
    print(" • Web Dashboard:   http://localhost:8000")
    print(" • Interactive Docs: http://localhost:8000/docs")
    print(" • ReDoc Specs:     http://localhost:8000/redoc")
    print("=" * 70)


    
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    main()
