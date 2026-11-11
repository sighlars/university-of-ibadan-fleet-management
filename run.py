import os
import sys
import uvicorn
from app.seed import seed_database

def main():
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")

    print("=" * 70)
    print(" 🚚 Fleet Management System for a Delivery Company")
    print("    Sub-topic: Optimizing Logistics & Real-Time Tracking (UI Campus Case Study)")
    print("=" * 70)
    print("Initializing case study database & vehicle roster...")
    seed_database()
    print("Database ready.")
    print("Starting local server...")
    print(f" • Web Dashboard:   http://localhost:{port} (or http://127.0.0.1:{port})")
    print(f" • Interactive Docs: http://localhost:{port}/docs")
    print(f" • ReDoc Specs:     http://localhost:{port}/redoc")
    print("=" * 70)
    
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=True,
        proxy_headers=True,
        forwarded_allow_ips="*"
    )

if __name__ == "__main__":
    main()
