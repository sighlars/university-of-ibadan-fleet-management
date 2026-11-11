import sys
import uvicorn
from app.seed import seed_database

def main():
    print("=" * 70)
    print(" 🏛️ UI-FleetFlow — University of Ibadan Fleet & Logistics Management")
    print("    Directorate of Works & Maintenance | Recte Sapere Fons")
    print("=" * 70)
    print("Initializing University of Ibadan database & transport pool...")
    seed_database()
    print("Database ready.")
    print("Starting server on campus network / localhost...")
    print(" • Web Dashboard:   http://localhost:8000")
    print(" • Interactive Docs: http://localhost:8000/docs")
    print(" • ReDoc Specs:     http://localhost:8000/redoc")
    print("=" * 70)

    
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    main()
