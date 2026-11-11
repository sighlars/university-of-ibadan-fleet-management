import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

from app.config import settings
from app.database import Base, engine, get_db
from app.seed import seed_database
from app.api import vehicles, orders, routes, analytics
from app.api.websocket import ws_manager
from app.engine.simulator import simulator

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables exist and seed demo data if empty
    Base.metadata.create_all(bind=engine)
    seed_database()
    yield
    # Shutdown: pause simulator
    simulator.pause()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Intelligent Campus Fleet Management & Logistics Routing System (Academic Case Study: University of Ibadan)",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)


# Static and Templates
base_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(base_dir, "static")
templates_dir = os.path.join(base_dir, "templates")

app.mount("/static", StaticFiles(directory=static_dir), name="static")
templates = Jinja2Templates(directory=templates_dir)

# Mount API Routers
app.include_router(vehicles.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(routes.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")

# WebSocket Endpoint for Live GPS & Telemetry Streaming
@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection open and accept any client control commands
            data = await websocket.receive_text()
            # Clients can send ping or simple control messages if needed
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

# HTML View Routes
@app.get("/", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"app_name": settings.APP_NAME, "active_tab": "dashboard"}
    )

@app.get("/vehicles", response_class=HTMLResponse)
async def vehicles_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="vehicles.html",
        context={"app_name": settings.APP_NAME, "active_tab": "vehicles"}
    )

@app.get("/orders", response_class=HTMLResponse)
async def orders_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="orders.html",
        context={"app_name": settings.APP_NAME, "active_tab": "orders"}
    )

@app.get("/analytics", response_class=HTMLResponse)
async def analytics_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="analytics.html",
        context={"app_name": settings.APP_NAME, "active_tab": "analytics"}
    )

