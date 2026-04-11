"""
Imputación automática de transacciones de combustible a proyectos por geolocalización.
"""
from __future__ import annotations

import logging
from math import radians, sin, cos, sqrt, atan2

from core.db import get_conn

logger = logging.getLogger("erp")


def distancia_haversine(lat1, lon1, lat2, lon2):
    """Distancia en km entre dos puntos GPS."""
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def imputar_transacciones():
    """Imputa transacciones sin proyecto asignado usando geolocalización.
    Returns stats dict.
    """
    conn = get_conn()
    try:
        # Proyectos con coordenadas
        proyectos = conn.execute(
            "SELECT id, nombre, codigo, ubicacion_lat, ubicacion_lon, fecha_inicio_real, fecha_fin_real, estado "
            "FROM proyectos WHERE ubicacion_lat IS NOT NULL AND ubicacion_lat != '' "
            "AND ubicacion_lon IS NOT NULL AND ubicacion_lon != ''"
        ).fetchall()
        proyectos = [dict(p) for p in proyectos]

        if not proyectos:
            return {"error": "No hay proyectos con coordenadas", "auto": 0, "sugeridas": 0, "sin_asignar": 0}

        # Estaciones geocodificadas (cache lookup)
        estaciones = {}
        for r in conn.execute(
            "SELECT estacion, latitud, longitud FROM moeve_estaciones_geo WHERE latitud IS NOT NULL"
        ).fetchall():
            estaciones[r["estacion"]] = (r["latitud"], r["longitud"])

        # Transacciones sin proyecto
        pendientes = conn.execute(
            "SELECT id, estacion, fecha, concepto, matricula FROM combustible_transacciones "
            "WHERE proyecto_id IS NULL"
        ).fetchall()

        stats = {"auto": 0, "sugeridas": 0, "sin_asignar": 0, "por_fecha": 0}

        for tx in pendientes:
            tx_id = tx["id"]
            est = tx["estacion"]
            fecha = tx["fecha"]
            concepto = tx["concepto"] or ""
            matricula = tx["matricula"] or ""

            # Si la estación tiene coordenadas → buscar proyecto más cercano
            if est in estaciones:
                lat, lon = estaciones[est]
                mejor = None
                mejor_dist = 999999
                for p in proyectos:
                    try:
                        plat = float(p["ubicacion_lat"])
                        plon = float(p["ubicacion_lon"])
                    except (ValueError, TypeError):
                        continue
                    d = distancia_haversine(lat, lon, plat, plon)
                    if d < mejor_dist:
                        mejor_dist = d
                        mejor = p

                if mejor and mejor_dist < 30:
                    conn.execute(
                        "UPDATE combustible_transacciones SET proyecto_id=?, imputacion_tipo='auto_geo', "
                        "imputacion_confianza='alta', imputacion_notas=? WHERE id=?",
                        (mejor["id"], f"Estacion a {mejor_dist:.1f}km de {mejor['nombre']}", tx_id),
                    )
                    stats["auto"] += 1
                elif mejor and mejor_dist < 80:
                    conn.execute(
                        "UPDATE combustible_transacciones SET proyecto_id=?, imputacion_tipo='auto_geo', "
                        "imputacion_confianza='media', imputacion_notas=? WHERE id=?",
                        (mejor["id"], f"Estacion a {mejor_dist:.1f}km de {mejor['nombre']} (revisar)", tx_id),
                    )
                    stats["sugeridas"] += 1
                else:
                    stats["sin_asignar"] += 1
            else:
                # Sin coordenadas: intentar por vehículo+fecha
                # Si ese día el vehículo tiene otros repostajes asignados, usar ese proyecto
                if matricula:
                    row = conn.execute(
                        "SELECT proyecto_id FROM combustible_transacciones "
                        "WHERE matricula = ? AND fecha = ? AND proyecto_id IS NOT NULL LIMIT 1",
                        (matricula, fecha),
                    ).fetchone()
                    if row:
                        conn.execute(
                            "UPDATE combustible_transacciones SET proyecto_id=?, imputacion_tipo='auto_vehiculo', "
                            "imputacion_confianza='media', imputacion_notas='Mismo vehiculo y dia' WHERE id=?",
                            (row["proyecto_id"], tx_id),
                        )
                        stats["por_fecha"] += 1
                        continue
                stats["sin_asignar"] += 1

        conn.commit()
        return stats
    finally:
        conn.close()
