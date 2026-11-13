import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.seed import reset_and_reseed

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    reset_and_reseed()

client = TestClient(app)

def test_read_dashboard():
    response = client.get("/")
    assert response.status_code == 200
    assert "University of Ibadan" in response.text or "UI-FleetFlow" in response.text

def test_read_vehicles():
    response = client.get("/api/vehicles")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 5
    # Verify vehicle plate format matches UI institutional plates
    plates = [v["plate_number"] for v in data]
    assert any("UI-" in p for p in plates)

def test_read_orders():
    response = client.get("/api/orders")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 10
    # Verify tracking number format matches UI
    tracking_nums = [o["tracking_number"] for o in data]
    assert any("UI-LOG-" in t for t in tracking_nums)

def test_create_order():
    payload = {
        "customer_name": "Faculty of Technology Mechanical Labs",
        "customer_phone": "+234 803 555 8899",
        "delivery_address": "Tech Complex, University of Ibadan",
        "destination_lat": 7.4520,
        "destination_lng": 3.8985,
        "weight_kg": 25.0,
        "priority": "urgent"
    }
    response = client.post("/api/orders", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["customer_name"] == "Faculty of Technology Mechanical Labs"
    assert data["tracking_number"].startswith("UI-LOG-")
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
    opt_res = client.post("/api/routes/optimize")
    if opt_res.status_code == 200:
        routes = opt_res.json()
        assert len(routes) > 0
        assert "polyline" in routes[0]

        disp_res = client.post("/api/routes/dispatch-all")
        assert disp_res.status_code == 200

def test_research_report_endpoints():
    rep_res = client.get("/report")
    assert rep_res.status_code == 200
    assert "CSC 476 Research Paper" in rep_res.text or "Group 25" in rep_res.text

    pdf_res = client.get("/report.pdf")
    assert pdf_res.status_code == 200
    assert pdf_res.headers.get("content-type") == "application/pdf"

    docx_res = client.get("/report.docx")
    assert docx_res.status_code == 200
    assert "wordprocessingml" in docx_res.headers.get("content-type", "")
