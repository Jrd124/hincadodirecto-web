"""Detección de partes de trabajo pendientes de registrar."""
import logging
from datetime import date, timedelta

from core.db import get_conn

logger = logging.getLogger("erp")

DIAS_MAP = {0: 'L', 1: 'M', 2: 'X', 3: 'J', 4: 'V', 5: 'S', 6: 'D'}
DIAS_NOMBRE = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']


def obtener_partes_pendientes(proyecto_id=None, desde=None, hasta=None):
    """Detect days with machine assignment but no parte registered."""
    conn = get_conn()
    try:
        if not desde:
            desde = (date.today() - timedelta(days=30)).isoformat()
        if not hasta:
            hasta = date.today().isoformat()

        if proyecto_id:
            proyectos = conn.execute(
                "SELECT id, codigo, nombre, dias_laborables FROM proyectos WHERE id = ?", (proyecto_id,)
            ).fetchall()
        else:
            proyectos = conn.execute(
                "SELECT id, codigo, nombre, dias_laborables FROM proyectos WHERE estado IN ('vivo','adjudicado')"
            ).fetchall()

        resultado = {'total_pendientes': 0, 'por_proyecto': []}

        for proy in proyectos:
            dias_lab = proy['dias_laborables'] or 'LMXJV'

            asignaciones = conn.execute("""
                SELECT DISTINCT pa.fecha, m.nombre as maquina_nombre
                FROM proyecto_asignaciones pa
                JOIN maquinas m ON pa.recurso_id = m.id
                WHERE pa.proyecto_id = ? AND pa.recurso_tipo = 'maquina'
                  AND pa.fecha >= ? AND pa.fecha <= ? AND pa.estado != 'averia'
                ORDER BY pa.fecha
            """, (proy['id'], desde, hasta)).fetchall()

            dias_con_asig = {}
            for a in asignaciones:
                dias_con_asig.setdefault(a['fecha'], []).append(a['maquina_nombre'])

            partes = conn.execute(
                "SELECT DISTINCT fecha FROM proyecto_partes WHERE proyecto_id = ? AND fecha >= ? AND fecha <= ?",
                (proy['id'], desde, hasta)
            ).fetchall()
            dias_con_parte = {p['fecha'] for p in partes}

            dias_pendientes = []
            for fecha_str, maquinas in sorted(dias_con_asig.items()):
                fecha_date = date.fromisoformat(fecha_str)
                if DIAS_MAP.get(fecha_date.weekday(), '?') not in dias_lab:
                    continue
                if fecha_str not in dias_con_parte:
                    dias_pendientes.append({
                        'fecha': fecha_str,
                        'dia_semana': DIAS_NOMBRE[fecha_date.weekday()],
                        'maquinas': maquinas,
                    })

            if dias_pendientes:
                resultado['por_proyecto'].append({
                    'proyecto_id': proy['id'],
                    'proyecto_codigo': proy['codigo'],
                    'proyecto_nombre': proy['nombre'],
                    'dias_pendientes': dias_pendientes,
                })
                resultado['total_pendientes'] += len(dias_pendientes)

        return resultado
    finally:
        conn.close()
