"""
Conciliación bancaria RRHH — Enlaza pagos RRHH con movimientos bancarios.
4 tipos: adelantos, nóminas, seguridad social, IRPF.
Lee movimientos de data/bancos/movimientos.db (solo lectura).
"""
from __future__ import annotations

import logging
import sqlite3
from datetime import date, timedelta

from core.db import get_conn

logger = logging.getLogger("erp")


def _get_mov_conn():
    """Conexión a movimientos.db."""
    try:
        from config import MOVIMIENTOS_DB
    except ImportError:
        from interfaz_facturas.config import MOVIMIENTOS_DB
    conn = sqlite3.connect(str(MOVIMIENTOS_DB))
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_table():
    conn = get_conn()
    try:
        conn.execute("""CREATE TABLE IF NOT EXISTS rrhh_conciliacion (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            referencia_id INTEGER,
            periodo TEXT,
            empleado_id INTEGER,
            importe_esperado REAL,
            movimiento_banco_id INTEGER,
            movimiento_fecha TEXT,
            movimiento_importe REAL,
            movimiento_concepto TEXT,
            estado TEXT DEFAULT 'pendiente',
            conciliado_auto INTEGER DEFAULT 0,
            notas TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (empleado_id) REFERENCES empleados(id)
        )""")
        conn.commit()
    finally:
        conn.close()


def ejecutar_conciliacion(periodo, tipos=None):
    """Ejecuta conciliación automática para un periodo. Returns stats."""
    _ensure_table()
    if tipos is None:
        tipos = ["seguridad_social", "irpf", "nomina", "adelanto"]

    stats = {"conciliados": 0, "pendientes": 0, "detalle": {}}

    if "seguridad_social" in tipos:
        r = _conciliar_ss(periodo)
        stats["detalle"]["seguridad_social"] = r
        stats["conciliados"] += r.get("conciliados", 0)
        stats["pendientes"] += r.get("pendientes", 0)

    if "irpf" in tipos:
        r = _conciliar_irpf(periodo)
        stats["detalle"]["irpf"] = r
        stats["conciliados"] += r.get("conciliados", 0)
        stats["pendientes"] += r.get("pendientes", 0)

    if "nomina" in tipos:
        r = _conciliar_nominas(periodo)
        stats["detalle"]["nomina"] = r
        stats["conciliados"] += r.get("conciliados", 0)
        stats["pendientes"] += r.get("pendientes", 0)

    if "adelanto" in tipos:
        r = _conciliar_adelantos(periodo)
        stats["detalle"]["adelanto"] = r
        stats["conciliados"] += r.get("conciliados", 0)
        stats["pendientes"] += r.get("pendientes", 0)

    return stats


def _conciliar_ss(periodo):
    """Busca cargo TGSS para el mes."""
    conn = get_conn()
    mov_conn = _get_mov_conn()
    try:
        # Importe esperado: sum ss_empresa del mes
        row = conn.execute(
            "SELECT ROUND(SUM(ss_empresa),2) FROM nominas WHERE periodo=? AND tipo='NOMINA'",
            (periodo,),
        ).fetchone()
        importe_esp = row[0] if row else 0
        if not importe_esp:
            return {"conciliados": 0, "pendientes": 0}

        # Ya conciliado?
        existing = conn.execute(
            "SELECT id FROM rrhh_conciliacion WHERE tipo='seguridad_social' AND periodo=? AND estado='conciliado'",
            (periodo,),
        ).fetchone()
        if existing:
            return {"conciliados": 1, "pendientes": 0}

        # Buscar en movimientos: TGSS, cotización
        y, m = int(periodo[:4]), int(periodo[5:7])
        fecha_desde = date(y, m, 20).isoformat()
        m2 = m + 1
        y2 = y
        if m2 > 12:
            m2 = 1; y2 += 1
        fecha_hasta = date(y2, m2, 10).isoformat()

        candidates = mov_conn.execute(
            "SELECT id, fecha_operacion, concepto, importe FROM movimientos "
            "WHERE fecha_operacion >= ? AND fecha_operacion <= ? "
            "AND importe < 0 "
            "AND (LOWER(concepto) LIKE '%tgss%' OR LOWER(concepto) LIKE '%seguridad social%' OR LOWER(concepto) LIKE '%cotizacion%' OR LOWER(concepto) LIKE '%cotización%') "
            "ORDER BY ABS(importe + ?) ASC LIMIT 3",
            (fecha_desde, fecha_hasta, importe_esp),
        ).fetchall()

        if candidates:
            best = candidates[0]
            # Check importe within 10%
            if abs(abs(best["importe"]) - importe_esp) <= importe_esp * 0.15:
                # Auto-conciliar
                conn.execute(
                    "INSERT OR REPLACE INTO rrhh_conciliacion (tipo, periodo, importe_esperado, "
                    "movimiento_banco_id, movimiento_fecha, movimiento_importe, movimiento_concepto, "
                    "estado, conciliado_auto) VALUES ('seguridad_social',?,?,?,?,?,?,'conciliado',1)",
                    (periodo, importe_esp, best["id"], best["fecha_operacion"],
                     best["importe"], best["concepto"]),
                )
                conn.commit()
                return {"conciliados": 1, "pendientes": 0}

        # No match — crear pendiente
        conn.execute(
            "INSERT OR IGNORE INTO rrhh_conciliacion (tipo, periodo, importe_esperado, estado) "
            "VALUES ('seguridad_social',?,?,'pendiente')",
            (periodo, importe_esp),
        )
        conn.commit()
        return {"conciliados": 0, "pendientes": 1}
    finally:
        conn.close()
        mov_conn.close()


def _conciliar_irpf(periodo):
    """Busca cargo AEAT para el trimestre que incluye el periodo."""
    conn = get_conn()
    mov_conn = _get_mov_conn()
    try:
        y, m = int(periodo[:4]), int(periodo[5:7])
        q = (m - 1) // 3 + 1
        # Meses del trimestre
        meses_q = [f"{y}-{mm:02d}" for mm in range((q-1)*3+1, q*3+1)]
        trimestre_key = f"{q}T-{y}"

        # Importe esperado
        placeholders = ",".join(["?"] * len(meses_q))
        row = conn.execute(
            f"SELECT ROUND(SUM(irpf_euros),2) FROM nominas WHERE periodo IN ({placeholders}) AND tipo='NOMINA'",
            meses_q,
        ).fetchone()
        importe_esp = row[0] if row else 0
        if not importe_esp:
            return {"conciliados": 0, "pendientes": 0}

        # Ya conciliado?
        existing = conn.execute(
            "SELECT id FROM rrhh_conciliacion WHERE tipo='irpf' AND periodo=? AND estado='conciliado'",
            (trimestre_key,),
        ).fetchone()
        if existing:
            return {"conciliados": 1, "pendientes": 0}

        # Fecha pago: ~20 del mes siguiente al trimestre
        pago_m = q * 3 + 1
        pago_y = y
        if pago_m > 12:
            pago_m = 1; pago_y += 1
        fecha_desde = date(pago_y, pago_m, 10).isoformat() if pago_m <= 12 else date(pago_y, 1, 10).isoformat()
        fecha_hasta = date(pago_y, pago_m, 28).isoformat() if pago_m <= 12 else date(pago_y, 1, 28).isoformat()

        candidates = mov_conn.execute(
            "SELECT id, fecha_operacion, concepto, importe FROM movimientos "
            "WHERE fecha_operacion >= ? AND fecha_operacion <= ? "
            "AND importe < 0 "
            "AND (LOWER(concepto) LIKE '%aeat%' OR LOWER(concepto) LIKE '%hacienda%' "
            "OR LOWER(concepto) LIKE '%retencion%' OR LOWER(concepto) LIKE '%retención%' "
            "OR LOWER(concepto) LIKE '%impuesto%') "
            "ORDER BY ABS(importe + ?) ASC LIMIT 3",
            (fecha_desde, fecha_hasta, importe_esp),
        ).fetchall()

        if candidates:
            best = candidates[0]
            if abs(abs(best["importe"]) - importe_esp) <= importe_esp * 0.15:
                conn.execute(
                    "INSERT OR REPLACE INTO rrhh_conciliacion (tipo, periodo, importe_esperado, "
                    "movimiento_banco_id, movimiento_fecha, movimiento_importe, movimiento_concepto, "
                    "estado, conciliado_auto) VALUES ('irpf',?,?,?,?,?,?,'conciliado',1)",
                    (trimestre_key, importe_esp, best["id"], best["fecha_operacion"],
                     best["importe"], best["concepto"]),
                )
                conn.commit()
                return {"conciliados": 1, "pendientes": 0}

        conn.execute(
            "INSERT OR IGNORE INTO rrhh_conciliacion (tipo, periodo, importe_esperado, estado) "
            "VALUES ('irpf',?,?,'pendiente')",
            (trimestre_key, importe_esp),
        )
        conn.commit()
        return {"conciliados": 0, "pendientes": 1}
    finally:
        conn.close()
        mov_conn.close()


def _conciliar_nominas(periodo):
    """Busca transferencias de nómina para cada empleado del mes."""
    conn = get_conn()
    mov_conn = _get_mov_conn()
    try:
        nominas = conn.execute(
            "SELECT n.empleado_id, e.nombre, e.apellidos, n.liquido, n.embargo "
            "FROM nominas n JOIN empleados e ON e.id = n.empleado_id "
            "WHERE n.periodo=? AND n.tipo='NOMINA'", (periodo,)
        ).fetchall()

        y, m = int(periodo[:4]), int(periodo[5:7])
        fecha_desde = date(y, m, 20).isoformat()
        m2 = m + 1; y2 = y
        if m2 > 12: m2 = 1; y2 += 1
        fecha_hasta = date(y2, m2, 15).isoformat()

        conciliados = 0
        pendientes = 0

        for nom in nominas:
            emp_id = nom["empleado_id"]
            # Ya conciliado?
            if conn.execute(
                "SELECT id FROM rrhh_conciliacion WHERE tipo='nomina' AND periodo=? AND empleado_id=? AND estado='conciliado'",
                (periodo, emp_id)
            ).fetchone():
                conciliados += 1
                continue

            # Importe esperado
            adel = conn.execute(
                "SELECT COALESCE(SUM(importe),0) FROM adelantos WHERE empleado_id=? AND estado='pendiente'",
                (emp_id,)
            ).fetchone()[0]
            importe_esp = (nom["liquido"] or 0) - adel - (nom["embargo"] or 0)
            if importe_esp <= 0:
                continue

            # Search by name fragments
            nombre = ((nom["nombre"] or "") + " " + (nom["apellidos"] or "")).strip().upper()
            palabras = [w for w in nombre.split() if len(w) > 3]
            if not palabras:
                pendientes += 1
                continue

            # Build LIKE conditions for name
            like_conds = " AND ".join([f"UPPER(concepto) LIKE '%{w}%'" for w in palabras[:2]])
            candidates = mov_conn.execute(
                f"SELECT id, fecha_operacion, concepto, importe FROM movimientos "
                f"WHERE fecha_operacion >= ? AND fecha_operacion <= ? AND importe < 0 "
                f"AND ({like_conds}) ORDER BY ABS(importe + ?) ASC LIMIT 2",
                (fecha_desde, fecha_hasta, importe_esp),
            ).fetchall()

            if candidates and abs(abs(candidates[0]["importe"]) - importe_esp) <= 10:
                best = candidates[0]
                conn.execute(
                    "INSERT OR REPLACE INTO rrhh_conciliacion (tipo, periodo, empleado_id, importe_esperado, "
                    "movimiento_banco_id, movimiento_fecha, movimiento_importe, movimiento_concepto, "
                    "estado, conciliado_auto) VALUES ('nomina',?,?,?,?,?,?,?,'conciliado',1)",
                    (periodo, emp_id, importe_esp, best["id"], best["fecha_operacion"],
                     best["importe"], best["concepto"]),
                )
                conciliados += 1
            else:
                conn.execute(
                    "INSERT OR IGNORE INTO rrhh_conciliacion (tipo, periodo, empleado_id, importe_esperado, estado) "
                    "VALUES ('nomina',?,?,?,'pendiente')",
                    (periodo, emp_id, importe_esp),
                )
                pendientes += 1

        conn.commit()
        return {"conciliados": conciliados, "pendientes": pendientes}
    finally:
        conn.close()
        mov_conn.close()


def _conciliar_adelantos(periodo):
    """Busca transferencias de adelantos."""
    conn = get_conn()
    mov_conn = _get_mov_conn()
    try:
        y, m = int(periodo[:4]), int(periodo[5:7])
        fecha_desde = date(y, m, 1).isoformat()
        m2 = m + 1; y2 = y
        if m2 > 12: m2 = 1; y2 += 1
        fecha_hasta = date(y2, m2, 1).isoformat()

        adelantos = conn.execute(
            "SELECT a.id, a.empleado_id, a.importe, a.fecha, e.nombre, e.apellidos "
            "FROM adelantos a JOIN empleados e ON e.id = a.empleado_id "
            "WHERE a.fecha >= ? AND a.fecha < ?", (fecha_desde, fecha_hasta)
        ).fetchall()

        conciliados = 0
        pendientes = 0

        for adel in adelantos:
            if conn.execute(
                "SELECT id FROM rrhh_conciliacion WHERE tipo='adelanto' AND referencia_id=? AND estado='conciliado'",
                (adel["id"],)
            ).fetchone():
                conciliados += 1
                continue

            # Search by name + amount
            nombre = ((adel["nombre"] or "") + " " + (adel["apellidos"] or "")).strip().upper()
            palabras = [w for w in nombre.split() if len(w) > 3][:2]
            importe = adel["importe"]

            if palabras:
                like_conds = " AND ".join([f"UPPER(concepto) LIKE '%{w}%'" for w in palabras])
                f_desde = (date.fromisoformat(adel["fecha"]) - timedelta(days=3)).isoformat()
                f_hasta = (date.fromisoformat(adel["fecha"]) + timedelta(days=3)).isoformat()
                candidates = mov_conn.execute(
                    f"SELECT id, fecha_operacion, concepto, importe FROM movimientos "
                    f"WHERE fecha_operacion >= ? AND fecha_operacion <= ? AND importe < 0 "
                    f"AND ({like_conds}) AND ABS(importe + ?) < 5 LIMIT 1",
                    (f_desde, f_hasta, importe),
                ).fetchall()

                if candidates:
                    best = candidates[0]
                    conn.execute(
                        "INSERT OR REPLACE INTO rrhh_conciliacion (tipo, referencia_id, periodo, empleado_id, "
                        "importe_esperado, movimiento_banco_id, movimiento_fecha, movimiento_importe, "
                        "movimiento_concepto, estado, conciliado_auto) "
                        "VALUES ('adelanto',?,?,?,?,?,?,?,?,'conciliado',1)",
                        (adel["id"], periodo, adel["empleado_id"], importe,
                         best["id"], best["fecha_operacion"], best["importe"], best["concepto"]),
                    )
                    conciliados += 1
                    continue

            conn.execute(
                "INSERT OR IGNORE INTO rrhh_conciliacion (tipo, referencia_id, periodo, empleado_id, importe_esperado, estado) "
                "VALUES ('adelanto',?,?,?,?,'pendiente')",
                (adel["id"], periodo, adel["empleado_id"], importe),
            )
            pendientes += 1

        conn.commit()
        return {"conciliados": conciliados, "pendientes": pendientes}
    finally:
        conn.close()
        mov_conn.close()


def obtener_estado_conciliacion(periodo):
    """Estado de conciliación para un periodo completo."""
    _ensure_table()
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT rc.*, e.nombre, e.apellidos FROM rrhh_conciliacion rc "
            "LEFT JOIN empleados e ON e.id = rc.empleado_id "
            "WHERE rc.periodo = ? OR rc.periodo LIKE ? "
            "ORDER BY rc.tipo, rc.empleado_id",
            (periodo, f"%-{periodo[2:4]}"),  # Match quarter keys too
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def buscar_movimientos_candidatos(conciliacion_id):
    """Busca movimientos bancarios que podrían corresponder a un pago pendiente."""
    _ensure_table()
    conn = get_conn()
    mov_conn = _get_mov_conn()
    try:
        rc = conn.execute("SELECT * FROM rrhh_conciliacion WHERE id=?", (conciliacion_id,)).fetchone()
        if not rc:
            return []
        importe = rc["importe_esperado"] or 0
        periodo = rc["periodo"] or ""

        # Broad search: negative movements within ±30% of expected amount
        candidates = mov_conn.execute(
            "SELECT id, fecha_operacion, concepto, importe FROM movimientos "
            "WHERE importe < 0 AND ABS(importe + ?) < ? "
            "ORDER BY ABS(importe + ?) ASC LIMIT 10",
            (importe, importe * 0.3 + 50, importe),
        ).fetchall()
        return [dict(r) for r in candidates]
    finally:
        conn.close()
        mov_conn.close()


def vincular(conciliacion_id, movimiento_banco_id):
    """Vincula manualmente un pago con un movimiento bancario."""
    _ensure_table()
    conn = get_conn()
    mov_conn = _get_mov_conn()
    try:
        mov = mov_conn.execute(
            "SELECT id, fecha_operacion, importe, concepto FROM movimientos WHERE id=?",
            (movimiento_banco_id,),
        ).fetchone()
        if not mov:
            return False
        conn.execute(
            "UPDATE rrhh_conciliacion SET movimiento_banco_id=?, movimiento_fecha=?, "
            "movimiento_importe=?, movimiento_concepto=?, estado='conciliado', conciliado_auto=0 "
            "WHERE id=?",
            (mov["id"], mov["fecha_operacion"], mov["importe"], mov["concepto"], conciliacion_id),
        )
        conn.commit()
        return True
    finally:
        conn.close()
        mov_conn.close()


def desvincular(conciliacion_id):
    """Desvincula un pago de su movimiento bancario."""
    _ensure_table()
    conn = get_conn()
    try:
        conn.execute(
            "UPDATE rrhh_conciliacion SET movimiento_banco_id=NULL, movimiento_fecha=NULL, "
            "movimiento_importe=NULL, movimiento_concepto=NULL, estado='pendiente', conciliado_auto=0 "
            "WHERE id=?",
            (conciliacion_id,),
        )
        conn.commit()
        return True
    finally:
        conn.close()
