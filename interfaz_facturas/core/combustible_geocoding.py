"""Geocoding for gas stations and project locations using Nominatim (OSM)."""
from __future__ import annotations

import logging
import time
import unicodedata

import requests

from core.db import get_conn

logger = logging.getLogger("erp")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "HincadoDirectoERP/1.0 (javier.romeroca@gmail.com)"


def _strip_diacritics(text):
    if not text:
        return ""
    return "".join(
        c for c in unicodedata.normalize("NFKD", str(text))
        if not unicodedata.category(c).startswith("M")
    )


def _normalizar_busqueda(nombre, pais="ES"):
    """Clean station name for geocoding search."""
    limpio = str(nombre or "").strip()
    for prefix in ["E.S.", "E.S", "ES ", "TJ CEPSA STAR", "TJ CEPSA", "CEPSA "]:
        if limpio.upper().startswith(prefix):
            limpio = limpio[len(prefix):].strip()
    # Deduplicate words: "SIMANCAS SIMANCAS" → "SIMANCAS"
    parts = limpio.split()
    if len(parts) >= 2 and parts[0].upper() == parts[1].upper():
        limpio = " ".join(parts[1:])
    # Remove "CTRA", "AUTOVIA", "KM" noise
    limpio = limpio.replace("CTRA", "").replace("AUTOVIA", "").replace("KM.", "").strip()
    return limpio


def geocodificar_estacion(nombre, pais="ES"):
    """Call Nominatim to get lat/lon for a gas station.
    Returns (lat, lon, municipio, provincia) or (None, None, None, None).
    """
    country_code = "pt" if pais == "PT" else "es"
    busqueda = _normalizar_busqueda(nombre, pais)

    queries = [
        f"gasolinera {busqueda}",
        f"estación de servicio {busqueda}",
        busqueda,
    ]

    for q in queries:
        try:
            resp = requests.get(NOMINATIM_URL, params={
                "q": q,
                "format": "json",
                "countrycodes": country_code,
                "limit": 1,
                "addressdetails": 1,
            }, headers={"User-Agent": USER_AGENT}, timeout=10)

            if resp.ok:
                data = resp.json()
                if data:
                    result = data[0]
                    addr = result.get("address", {})
                    lat = float(result["lat"])
                    lon = float(result["lon"])
                    municipio = (
                        addr.get("city") or addr.get("town")
                        or addr.get("village") or addr.get("municipality")
                    )
                    provincia = addr.get("state") or addr.get("province")
                    logger.info("Geocoded '%s' → %s,%s (%s, %s)", busqueda, lat, lon, municipio, provincia)
                    return lat, lon, municipio, provincia

            time.sleep(1.1)
        except Exception as e:
            logger.warning("Geocoding error for '%s': %s", busqueda, e)

    return None, None, None, None


def geocodificar_pendientes(limit=30):
    """Process stations with geocoded=0. Returns stats dict."""
    conn = get_conn()
    try:
        pendientes = conn.execute(
            "SELECT id, nombre, pais FROM estaciones_servicio WHERE geocoded = 0 ORDER BY id LIMIT ?",
            (limit,),
        ).fetchall()

        stats = {"total": len(pendientes), "geocoded": 0, "fallidas": 0, "restantes": 0}

        for est in pendientes:
            lat, lon, municipio, provincia = geocodificar_estacion(est["nombre"], est["pais"] or "ES")

            if lat is not None:
                conn.execute("""
                    UPDATE estaciones_servicio
                    SET latitud=?, longitud=?, municipio=?, provincia=?,
                        geocoded=1
                    WHERE id=?
                """, (lat, lon, municipio, provincia, est["id"]))
                stats["geocoded"] += 1
            else:
                conn.execute(
                    "UPDATE estaciones_servicio SET geocoded=2 WHERE id=?",
                    (est["id"],),
                )
                stats["fallidas"] += 1

            time.sleep(1.1)

        conn.commit()

        # Count remaining
        stats["restantes"] = conn.execute(
            "SELECT COUNT(*) FROM estaciones_servicio WHERE geocoded = 0"
        ).fetchone()[0]

        logger.info(
            "Geocoding batch done: %d geocoded, %d failed, %d remaining",
            stats["geocoded"], stats["fallidas"], stats["restantes"],
        )
        return stats
    finally:
        conn.close()
