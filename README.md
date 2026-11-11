# 🚚 UI-FleetFlow — Campus Fleet & Logistics Management System

<div align="center">
  <img src="app/static/images/ui_logo.png" alt="University of Ibadan Logo" width="340"/>
  <br/>
  <h3><b>An Open-Source Logistics & Fleet Optimization Research Project</b></h3>
  <p><b>Academic Case Study: University of Ibadan (UI), Ibadan, Nigeria</b></p>
  <p><i>Real-time telematics, vehicle routing problem (CVRP) heuristics, and live campus dispatch.</i></p>
</div>

---

> [!IMPORTANT]
> **Academic Project Disclaimer**: This software is an independent student academic school project and open-source demonstration built for educational and research purposes. It is **not** an officially commissioned, endorsed, or affiliated platform of the University of Ibadan administration or any university directorate. All campus landmarks and facilities are referenced solely as an academic case study for urban/campus logistics modeling.

---

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL%203D-049EF4.svg?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-Components-000000.svg?logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57.svg?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Leaflet.js](https://img.shields.io/badge/GIS%20Maps-Leaflet.js-199900.svg?logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![Tests](https://img.shields.io/badge/Tests-12%20Passing-brightgreen.svg)]()

---

## 📸 User Interface Showcase

| View | Live UI Preview |
|---|---|
| **Live 3D Digital Twin Viewport**<br>• Real OpenStreetMap Satellite & Street Layouts<br>• Flat Dynamic Highway Navigation Ribbons<br>• Authentic Campus Fleet (Bajaj, TVS, Piaggio, Carry, HiAce)<br>• Live Telematics Sidebar Drawer | ![Live 3D Digital Twin](docs/screenshots/ui_campus_3d_viewport.png) |
| **Analytics & SLA KPIs Dashboard**<br>• Authentic shadcn/ui Dashboard block<br>• 4-card metric block (Deliveries, Fleet Utilization, Odometer, CO₂ Conserved)<br>• Campus Delivery Velocity & Throughput Area Chart<br>• Real-time dispatches stream | ![shadcn Analytics Dashboard](docs/screenshots/analytics_dashboard_shadcn.png) |
| **Fleet & Drivers Management Roster**<br>• Authentic shadcn/ui Data Table block<br>• Monospace plate tags, battery/fuel progress bars, driver ratings<br>• Real-time asset filtering & modal registration | ![shadcn Fleet & Drivers Table](docs/screenshots/fleet_drivers_shadcn.png) |
| **Campus Consignments & Orders Ledger**<br>• Capacitated Vehicle Routing Problem (CVRP) queue<br>• Priority badges (Urgent, High, Medium, Low)<br>• Consignment ledger with 1-click batch solver | ![shadcn Orders & Logistics Table](docs/screenshots/orders_logistics_shadcn.png) |

---

## 📌 Project Overview

**UI-FleetFlow** was developed as a school project exploring computational logistics and real-time telematics. It models multi-vehicle parcel distribution and shuttle routing across a university campus, using the **University of Ibadan (UI)**—Nigeria's premier university—as a practical real-world case study.

The platform addresses common university and institutional logistics scenarios:
1. **Inter-Faculty Consignments & Material Logistics**: Document, parcel, and examination logistics between academic departments, libraries, and administrative units.
2. **Medical & Laboratory Logistics**: Cold-chain specimen and supply routing connecting the University Health Services (Jaja Clinic), Faculty of Pharmacy, and the College of Medicine / UCH axis.
3. **Campus Facilities & Maintenance Fleet**: Dispatching utility pickups, trucks, and courier bikes with load and capacity constraints.
4. **Real-Time GPS Tracking**: Simulated high-frequency vehicle telemetry broadcast over WebSockets to an interactive Leaflet.js operations dashboard.

---

## 🗺️ Case Study Campus Landmarks

The simulation incorporates real geographic coordinates across the University of Ibadan campus to test routing heuristics against real distances:

| Campus Location / Landmark | Case Study Role | Latitude | Longitude |
|---|---|---|---|
| **Central Campus Logistics Depot** | Central Hub / Start & End Depot | `7.445210` | `3.899015` |
| **Kenneth Dike Library (KDL)** | Archival & Book Delivery | `7.447800` | `3.900800` |
| **Tekena Tamuno Senate Building** | Administration & Registry | `7.448500` | `3.899800` |
| **Trenchard Hall** | Examinations & Events Desk | `7.448200` | `3.900100` |
| **Faculty of Technology** | Engineering Laboratories | `7.452000` | `3.898500` |
| **Faculty of Science** | Physical & Chemical Stores | `7.449500` | `3.902000` |
| **Jaja Clinic** | Health Services Delivery | `7.446200` | `3.897000` |
| **College of Medicine Complex** | Medical Liaison | `7.447000` | `3.901500` |
| **Faculty of Pharmacy** | Research & Pharmacology Labs | `7.449000` | `3.903500` |
| **Postgraduate College** | Academic Records & Transcripts | `7.450500` | `3.896000` |
| **International Conference Centre (ICC)** | Second Gate Facilities Hub | `7.456000` | `3.892000` |
| **UI Ventures (Commercial Area)** | University Commercial Stores | `7.443500` | `3.902500` |
| **Teaching & Research Farm** | Agricultural Produce Transit | `7.444500` | `3.905500` |
| **Zik & Independence Halls** | Student Residential Logistics | `7.454500` | `3.895500` |

---

## 🧠 Logistics & Optimization Engine (VRP)

The solver models the **Capacitated Vehicle Routing Problem (CVRP)**:

### 1. Clarke-Wright Savings Heuristic
Given a central logistics depot $D$ and delivery points $i, j$:
- Combines separate round-trips into consolidated vehicle tours based on travel savings:
  
  $$S_{ij} = d(D, i) + d(D, j) - d(i, j)$$

- Merges stops sequentially while respecting each vehicle's maximum payload capacity:
  
  $$\sum_{i \in \text{Tour}_k} w_i \le Q_k$$

### 2. 2-Opt TSP Local Search
- Iteratively tests edge-exchange operations on each route to eliminate crossing segments and minimize total travel distance:
  
  $$\text{Route}' = R[1 \dots i-1] + R[i \dots j]^{-1} + R[j+1 \dots n]$$

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Frontend["Frontend Client (Browser)"]
        UI["Operations Dashboard (Tailwind CSS)"]
        Map["Leaflet.js Interactive Map"]
        WS["WebSocket Telemetry Client (websocket.js)"]
        Charts["Performance Charts (Chart.js)"]
    end

    subgraph Backend["FastAPI Backend Server"]
        App["FastAPI Application (app.main)"]
        REST["REST API Endpoints (/api/vehicles, /orders, /routes, /analytics)"]
        WSMgr["WebSocket Hub (app.api.websocket)"]
        
        subgraph Engine["Simulation & Routing Core"]
            CVRP["CVRP Solver (Clarke-Wright + 2-Opt)"]
            Geo["Geodesic Haversine & Waypoints"]
            Sim["Async Telematics Simulator"]
        end
    end

    subgraph Database["Persistence"]
        DB[(SQLite - fleet.db)]
        ORM["SQLAlchemy Models"]
    end

    UI -->|HTTP Requests| REST
    REST -->|Queries & Updates| ORM
    ORM --> DB
    CVRP -->|Optimized Routes| REST
    Sim -->|Telemetry Ticks| ORM
    Sim -->|Broadcasts Data| WSMgr
    WSMgr -->|Live JSON Packets| WS
    WS -->|Live Vehicle Markers| Map
    WS -->|Metrics Feed| Charts
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.10+
- Git

### 2. Setup

```bash
# Clone the repository
git clone <YOUR_REPO_URL>
cd <YOUR_REPO_FOLDER>

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate       # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Run the Application

```bash
python run.py
```

The database (`fleet.db`) will automatically initialize with sample case study data.

Open your browser to:
- **Operations Dashboard**: [http://localhost:8000](http://localhost:8000) (or [http://127.0.0.1:8000](http://127.0.0.1:8000))
- **Fleet & Drivers Registry**: [http://localhost:8000/vehicles](http://localhost:8000/vehicles)
- **Logistics Dispatch Desk**: [http://localhost:8000/orders](http://localhost:8000/orders)
- **Analytics & SLA KPIs**: [http://localhost:8000/analytics](http://localhost:8000/analytics)
- **Interactive API Documentation (Docs)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc Specification**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### 4. Remote Tunneling with ngrok

To expose the application over the internet to mobile or external devices:

```bash
# Point ngrok directly to the local port:
ngrok http 127.0.0.1:8000
```

> [!TIP]
> - Always point ngrok to the same port as FastAPI (`8000` by default).
> - If you want FastAPI to run on port `8080` instead, set `PORT=8080 python run.py` and run `ngrok http 127.0.0.1:8080`.
> - CORS and proxy headers are pre-configured so WebSockets and tile streams work through ngrok without restrictions.

---

## 🧪 Testing

The automated test suite validates routing optimization, geodesic formulas, and API endpoints:

```bash
source venv/bin/activate
pytest -v
```

All 12 unit and integration tests will execute.

---

## 🌐 Deployment Guide & Cloud Architecture

### Can You Deploy on Cloudflare?

| Layer | Cloudflare Suitability | Recommendation |
|---|---|---|
| **Cloudflare Workers (Edge Serverless)** | ❌ **Not Recommended for Backend** | Workers is an ephemeral V8 JS runtime. FastAPI with persistent background tasks (`telemetry_publisher_loop` running every second), WebSockets, and SQLite writes cannot run reliably in serverless functions without major rewrites. |
| **Cloudflare Tunnel (`cloudflared`)** |  **Excellent** | Securely expose your local machine or a $4/mo VPS directly to a public domain without opening any router ports or configuring SSL certificates. |
| **Cloudflare CDN & DNS Proxy** |  **Recommended** | Put Cloudflare's free proxy in front of Render, Railway, or a VPS for instant global edge caching of 3D tiles, DDoS protection, and free SSL. |

---

### Top Recommended Platforms for FastAPI + WebSockets

#### 1. Render.com (Easiest — Recommended)
Render supports Python web services with WebSockets and persistent disks out of the box:
1. Fork or push this repository to GitHub.
2. Sign in to [Render.com](https://render.com) and click **New + > Web Service**.
3. Connect your repository and configure:
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. *(Optional)* Under **Disks**, attach a persistent disk mounted at `/app/data` if you wish to persist `fleet.db` across re-deploys.
5. Click **Create Web Service**. Render provisions a free SSL URL (`https://your-app.onrender.com`) with full WebSocket support (`wss://`).

#### 2. Railway.app (Fastest 1-Click Deploy)
1. Go to [Railway.app](https://railway.app) and create a **New Project > Deploy from GitHub repo**.
2. Railway detects Python and automatically launches Uvicorn.
3. In **Settings > Networking**, click **Generate Domain**.
4. Full background asyncio simulation loops and WebSockets are enabled by default.

#### 3. Fly.io (Best Global Performance)
Run lightweight microVMs close to users with persistent storage:
```bash
# Install flyctl & authenticate
fly auth login

# Launch configuration (generates fly.toml)
fly launch --name ui-fleetflow

# Attach persistent storage volume for SQLite
fly volumes create fleet_data --size 1

# Deploy
fly deploy
```

#### 4. Docker Container (Self-Hosted / VPS)
```bash
# Build the Docker image
docker build -t ui-fleetflow:latest .

# Run with persistent volume
docker run -d -p 8000:8000 -v $(pwd)/data:/app/data --name fleet-app ui-fleetflow:latest
```

---

## 📄 Open-Source License

This project is licensed under the [MIT License](LICENSE) — free and open for educational, academic, and research use.
