import os
import urllib.request
from fastapi import APIRouter, HTTPException, Response

router = APIRouter(prefix="/tiles", tags=["Map Tiles"])

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cache", "tiles")
os.makedirs(CACHE_DIR, exist_ok=True)

@router.api_route("/{z}/{x}/{y}.png", methods=["GET", "HEAD"])
async def get_tile(z: int, x: int, y: int):
    """
    Caches and proxies standard OpenStreetMap tiles for University of Ibadan campus bounds.
    Ensures zero CORS issues and lightning-fast local loading for both 2D and 3D maps.
    """
    tile_filename = f"{z}_{x}_{y}.png"
    cached_path = os.path.join(CACHE_DIR, tile_filename)

    # 1. Return from disk cache if exists
    if os.path.exists(cached_path):
        with open(cached_path, "rb") as f:
            data = f.read()
        return Response(content=data, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})

    # 2. Fetch from OpenStreetMap standard tile server
    url = f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "UI-FleetFlow/2.0 (Academic Case Study; University of Ibadan Fleet Management)"}
    )

    try:
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            data = resp.read()
            # Save to disk cache
            with open(cached_path, "wb") as f:
                f.write(data)
            return Response(content=data, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching map tile: {e}")
