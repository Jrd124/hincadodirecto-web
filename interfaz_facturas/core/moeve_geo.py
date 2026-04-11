"""
Geocodificador de estaciones Moeve/Cepsa usando Nominatim (OpenStreetMap).
Rate limited: 1 request/seg. Cache en tabla moeve_estaciones_geo.
"""
from __future__ import annotations

import logging
import time

import requests

from core.db import get_conn

logger = logging.getLogger("erp")

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_HEADERS = {"User-Agent": "HincadoDirectoERP/1.0"}


def geocodificar_localidad(localidad, pais="España"):
    """Geocodifica una localidad. Returns dict con lat/lon/municipio/provincia o None."""
    if not localidad or not localidad.strip():
        return None
    try:
        resp = requests.get(
            _NOMINATIM_URL,
            params={"q": f"{localidad}, {pais}", "format": "json", "limit": 1, "addressdetails": 1},
            headers=_HEADERS,
            timeout=10,
        )
        if resp.ok and resp.json():
            r = resp.json()[0]
            addr = r.get("address", {})
            return {
                "lat": float(r["lat"]),
                "lon": float(r["lon"]),
                "municipio": addr.get("town") or addr.get("city") or addr.get("village", ""),
                "provincia": addr.get("province") or addr.get("state", ""),
            }
    except Exception as e:
        logger.debug("Geocoding error for %s: %s", localidad, e)
    return None


def geocodificar_estaciones_pendientes():
    """Geocodifica estaciones sin coordenadas. Returns stats dict."""
    conn = get_conn()
    try:
        pendientes = conn.execute(
            "SELECT id, estacion, localidad_extraida FROM moeve_estaciones_geo "
            "WHERE latitud IS NULL AND localidad_extraida IS NOT NULL AND localidad_extraida != ''"
        ).fetchall()

        stats = {"total": len(pendientes), "ok": 0, "fail": 0}

        for row in pendientes:
            eid, estacion, localidad = row["id"], row["estacion"], row["localidad_extraida"]
            result = geocodificar_localidad(localidad)
            if result:
                conn.execute(
                    "UPDATE moeve_estaciones_geo SET latitud=?, longitud=?, municipio=?, provincia=?, geo_source='nominatim' WHERE id=?",
                    (result["lat"], result["lon"], result["municipio"], result["provincia"], eid),
                )
                stats["ok"] += 1
            else:
                stats["fail"] += 1
            conn.commit()
            time.sleep(1.1)  # Rate limit

        return stats
    finally:
        conn.close()
