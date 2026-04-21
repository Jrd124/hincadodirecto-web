"""Auto-imputación de transacciones de combustible a proyectos."""
import logging
import math

from core.db import get_conn

logger = logging.getLogger("erp")


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(min(a, 1.0)))


def ejecutar_auto_imputacion(solo_pendientes=True):
    conn = get_conn()
    try:
        stats = {
            'total_procesadas': 0, 'imputadas_matricula': 0, 'imputadas_geo': 0,
            'propuestas_revisar': 0, 'sin_match': 0, 'ya_asignadas': 0,
        }

        proyectos = conn.execute("""
            SELECT id, codigo, nombre, ubicacion_lat, ubicacion_lon, estado,
                   fecha_inicio_real, fecha_fin_real, fecha_inicio_estimada, fecha_fin_estimada
            FROM proyectos
            WHERE ubicacion_lat IS NOT NULL AND ubicacion_lon IS NOT NULL
              AND estado IN ('vivo','adjudicado','terminado','pausado')
        """).fetchall()
        proyectos = [dict(p) for p in proyectos]

        where = "WHERE ct.proyecto_id IS NULL" if solo_pendientes else "WHERE 1=1"
        transacciones = conn.execute(f"""
            SELECT ct.id, ct.fecha_operacion, ct.matricula_raw, ct.vehiculo_id,
                   ct.estacion_id, ct.proyecto_id, ct.tipo_producto,
                   es.latitud as est_lat, es.longitud as est_lon
            FROM combustible_transacciones ct
            LEFT JOIN estaciones_servicio es ON ct.estacion_id = es.id
            {where}
              AND COALESCE(ct.tipo_producto,'') NOT IN ('descuento','peaje')
            ORDER BY ct.fecha_operacion
        """).fetchall()

        for tx in transacciones:
            stats['total_procesadas'] += 1
            fecha_tx = (tx['fecha_operacion'] or '')[:10]

            # Strategy 1: vehicle assigned to project that day
            if tx['vehiculo_id']:
                asig = conn.execute("""
                    SELECT proyecto_id FROM proyecto_asignaciones
                    WHERE recurso_tipo='vehiculo' AND recurso_id=? AND fecha=?
                    LIMIT 1
                """, (tx['vehiculo_id'], fecha_tx)).fetchone()
                if asig:
                    conn.execute(
                        "UPDATE combustible_transacciones SET proyecto_id=?, proyecto_metodo_asig='matricula', proyecto_confianza=0.95, proyecto_revisar=0 WHERE id=?",
                        (asig['proyecto_id'], tx['id']))
                    stats['imputadas_matricula'] += 1
                    continue

            # Strategy 2: geolocation
            if tx['est_lat'] and tx['est_lon']:
                cercanos = []
                for proy in proyectos:
                    fi = proy['fecha_inicio_real'] or proy['fecha_inicio_estimada'] or ''
                    ff = proy['fecha_fin_real'] or proy['fecha_fin_estimada'] or ''
                    if fi and fecha_tx < fi[:10]:
                        continue
                    if ff and fecha_tx > ff[:10]:
                        continue
                    dist = haversine_km(tx['est_lat'], tx['est_lon'], proy['ubicacion_lat'], proy['ubicacion_lon'])
                    if dist <= 30:
                        cercanos.append((proy, dist))

                if cercanos:
                    cercanos.sort(key=lambda x: x[1])
                    mejor_proy, mejor_dist = cercanos[0]
                    if mejor_dist < 5:
                        conf = 0.9
                    elif mejor_dist < 15:
                        conf = 0.8
                    else:
                        conf = 0.7

                    if len(cercanos) > 1:
                        conn.execute(
                            "UPDATE combustible_transacciones SET proyecto_id=?, proyecto_metodo_asig='geo', proyecto_confianza=?, proyecto_revisar=1 WHERE id=?",
                            (mejor_proy['id'], round(conf * 0.8, 2), tx['id']))
                        stats['propuestas_revisar'] += 1
                    else:
                        conn.execute(
                            "UPDATE combustible_transacciones SET proyecto_id=?, proyecto_metodo_asig='geo', proyecto_confianza=?, proyecto_revisar=0 WHERE id=?",
                            (mejor_proy['id'], round(conf, 2), tx['id']))
                        stats['imputadas_geo'] += 1
                    continue

            # No match
            conn.execute(
                "UPDATE combustible_transacciones SET proyecto_revisar=1, proyecto_metodo_asig='pendiente' WHERE id=?",
                (tx['id'],))
            stats['sin_match'] += 1

        conn.commit()

        # Summary counts
        counts = conn.execute("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN proyecto_id IS NOT NULL AND proyecto_revisar=0 THEN 1 ELSE 0 END) as imputadas,
                SUM(CASE WHEN proyecto_revisar=1 THEN 1 ELSE 0 END) as revisar,
                SUM(CASE WHEN proyecto_id IS NULL AND COALESCE(proyecto_metodo_asig,'') NOT IN ('pendiente','descartado') AND COALESCE(tipo_producto,'') NOT IN ('descuento','peaje') THEN 1 ELSE 0 END) as sin_asignar
            FROM combustible_transacciones
            WHERE COALESCE(tipo_producto,'') NOT IN ('descuento','peaje')
        """).fetchone()
        stats['resumen'] = dict(counts) if counts else {}
        return stats
    finally:
        conn.close()


def resumen_imputacion():
    conn = get_conn()
    try:
        r = conn.execute("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN proyecto_id IS NOT NULL AND proyecto_revisar=0 THEN 1 ELSE 0 END) as imputadas,
                SUM(CASE WHEN proyecto_metodo_asig='matricula' AND proyecto_revisar=0 THEN 1 ELSE 0 END) as imputadas_matricula,
                SUM(CASE WHEN proyecto_metodo_asig='geo' AND proyecto_revisar=0 THEN 1 ELSE 0 END) as imputadas_geo,
                SUM(CASE WHEN proyecto_metodo_asig='manual' AND proyecto_revisar=0 THEN 1 ELSE 0 END) as imputadas_manual,
                SUM(CASE WHEN proyecto_revisar=1 THEN 1 ELSE 0 END) as pendientes_revisar,
                SUM(CASE WHEN proyecto_id IS NULL AND COALESCE(proyecto_metodo_asig,'') NOT IN ('descartado') THEN 1 ELSE 0 END) as sin_asignar
            FROM combustible_transacciones
            WHERE COALESCE(tipo_producto,'') NOT IN ('descuento','peaje')
        """).fetchone()
        d = dict(r)
        d['pct_imputado'] = round(d['imputadas'] * 100.0 / d['total'], 1) if d['total'] else 0

        excl = conn.execute("""
            SELECT
                SUM(CASE WHEN tipo_producto='peaje' THEN 1 ELSE 0 END) as peajes_count,
                SUM(CASE WHEN tipo_producto='peaje' THEN COALESCE(importe_final,0) ELSE 0 END) as peajes_eur,
                SUM(CASE WHEN tipo_producto='descuento' THEN 1 ELSE 0 END) as descuentos_count,
                SUM(CASE WHEN tipo_producto='descuento' THEN COALESCE(importe_final,0) ELSE 0 END) as descuentos_eur
            FROM combustible_transacciones
            WHERE tipo_producto IN ('peaje','descuento')
        """).fetchone()
        d['excluidos'] = dict(excl) if excl else {}
        return d
    finally:
        conn.close()


def listar_pendientes_revision(limit=50, offset=0):
    conn = get_conn()
    try:
        total = conn.execute(
            "SELECT COUNT(*) FROM combustible_transacciones WHERE proyecto_revisar=1 AND COALESCE(tipo_producto,'') NOT IN ('descuento','peaje')"
        ).fetchone()[0]

        rows = conn.execute("""
            SELECT ct.id, ct.fecha_operacion, ct.matricula_raw, ct.importe_final, ct.litros,
                   ct.concepto_raw, ct.tipo_producto, ct.proyecto_id,
                   ct.proyecto_metodo_asig, ct.proyecto_confianza,
                   es.nombre as estacion_nombre, es.latitud as est_lat, es.longitud as est_lon,
                   p.codigo as proy_codigo, p.nombre as proy_nombre
            FROM combustible_transacciones ct
            LEFT JOIN estaciones_servicio es ON ct.estacion_id = es.id
            LEFT JOIN proyectos p ON ct.proyecto_id = p.id
            WHERE ct.proyecto_revisar=1
              AND COALESCE(ct.tipo_producto,'') NOT IN ('descuento','peaje')
            ORDER BY ct.proyecto_confianza DESC, ct.fecha_operacion DESC
            LIMIT ? OFFSET ?
        """, (limit, offset)).fetchall()

        # For each, get nearby project alternatives
        proyectos = conn.execute("""
            SELECT id, codigo, nombre, ubicacion_lat, ubicacion_lon
            FROM proyectos WHERE ubicacion_lat IS NOT NULL AND estado IN ('vivo','adjudicado','terminado')
        """).fetchall()

        result = []
        for r in rows:
            d = dict(r)
            d['alternativas'] = []
            if r['est_lat'] and r['est_lon']:
                alts = []
                for proy in proyectos:
                    dist = haversine_km(r['est_lat'], r['est_lon'], proy['ubicacion_lat'], proy['ubicacion_lon'])
                    if dist <= 50 and proy['id'] != r['proyecto_id']:
                        alts.append({'id': proy['id'], 'codigo': proy['codigo'], 'nombre': proy['nombre'], 'distancia_km': round(dist, 1)})
                alts.sort(key=lambda x: x['distancia_km'])
                d['alternativas'] = alts[:5]
                # Add distance for proposed project
                if r['proyecto_id']:
                    for proy in proyectos:
                        if proy['id'] == r['proyecto_id']:
                            d['distancia_km'] = round(haversine_km(r['est_lat'], r['est_lon'], proy['ubicacion_lat'], proy['ubicacion_lon']), 1)
                            break
            result.append(d)

        return {'total': total, 'transacciones': result}
    finally:
        conn.close()


def listar_sin_asignar(limit=50, offset=0, matricula=None, mes=None):
    conn = get_conn()
    try:
        where = "WHERE ct.proyecto_id IS NULL AND COALESCE(ct.proyecto_metodo_asig,'') NOT IN ('descartado') AND ct.proyecto_revisar=0 AND COALESCE(ct.tipo_producto,'') NOT IN ('descuento','peaje')"
        params = []
        if matricula:
            where += " AND ct.matricula_raw=?"
            params.append(matricula)
        if mes:
            where += " AND ct.fecha_operacion LIKE ?"
            params.append(mes + '%')

        total = conn.execute(f"SELECT COUNT(*) FROM combustible_transacciones ct {where}", params).fetchone()[0]
        rows = conn.execute(f"""
            SELECT ct.id, ct.fecha_operacion, ct.matricula_raw, ct.importe_final, ct.litros,
                   ct.concepto_raw, ct.tipo_producto, es.nombre as estacion_nombre
            FROM combustible_transacciones ct
            LEFT JOIN estaciones_servicio es ON ct.estacion_id = es.id
            {where}
            ORDER BY ct.fecha_operacion DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()

        return {'total': total, 'transacciones': [dict(r) for r in rows]}
    finally:
        conn.close()


def resolver_propuesta(transaccion_id, accion, proyecto_id=None):
    conn = get_conn()
    try:
        if accion == 'confirmar':
            conn.execute("UPDATE combustible_transacciones SET proyecto_revisar=0 WHERE id=?", (transaccion_id,))
        elif accion == 'cambiar':
            conn.execute(
                "UPDATE combustible_transacciones SET proyecto_id=?, proyecto_metodo_asig='manual', proyecto_confianza=1.0, proyecto_revisar=0 WHERE id=?",
                (proyecto_id, transaccion_id))
        elif accion == 'sin_proyecto':
            conn.execute(
                "UPDATE combustible_transacciones SET proyecto_id=NULL, proyecto_metodo_asig='descartado', proyecto_confianza=NULL, proyecto_revisar=0 WHERE id=?",
                (transaccion_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def asignar_bulk(transaccion_ids, proyecto_id):
    conn = get_conn()
    try:
        placeholders = ','.join('?' * len(transaccion_ids))
        conn.execute(
            f"UPDATE combustible_transacciones SET proyecto_id=?, proyecto_metodo_asig='manual', proyecto_confianza=1.0, proyecto_revisar=0 WHERE id IN ({placeholders})",
            [proyecto_id] + list(transaccion_ids))
        conn.commit()
        return len(transaccion_ids)
    finally:
        conn.close()


def confirmar_alta_confianza(umbral=0.8):
    conn = get_conn()
    try:
        cur = conn.execute(
            "UPDATE combustible_transacciones SET proyecto_revisar=0 WHERE proyecto_revisar=1 AND proyecto_confianza>=? AND COALESCE(tipo_producto,'') NOT IN ('descuento','peaje')",
            (umbral,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()
