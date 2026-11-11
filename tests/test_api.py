import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.seed import seed_database

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    seed_database()

client = TestClient(app)

def test_read_dashboard():
    response = client.get("/")
    assert response.status_code == 200
    assert "FleetFlow" in response.text

def test_read_vehicles():
    response = client.get("/api/vehicles")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0

def test_read_orders():
    response = client.get("/api/orders")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0

def test_create_order():
    payload = {
        "customer_name": "Test Hospital",
        "customer_phone": "+1 415-555-9999",
        "delivery_address": "505 Parnassus Ave, San Francisco",
        "destination_lat": 37.7631,
        "destination_lng": -122.4578,
        "weight_kg": 14.5,
        "priority": "urgent"
    }
    response = client.post("/api/orders", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["customer_name"] == "Test Hospital"
    assert data["tracking_number"].startswith("FLT-")
    assert data["status"] == "pending"

def test_analytics_kpis():
    response = client.get("/api/analytics/kpis")
    assert response.status_code == 200
    data = response.json()
    assert "total_vehicles" in data
    assert "active_vehicles" in data
    assert "total_orders" in data
    assert "on_time_rate_pct" in data

def test_optimize_and_dispatch():
    # Run optimization
    opt_res = client.post("/api/routes/optimize")
    # Might be 200 if pending orders exist or 400 if none pending
    if opt_res.status_code == 200:
        routes = opt_res.json()
        assert len(routes) > 0
        assert "polyline" in routes[0]

        # Dispatch
        disp_res = client.post("/api/routes/dispatch-all")
        assert disp_res.status_code == 200
