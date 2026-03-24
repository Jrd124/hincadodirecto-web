"""Modulo Tesoreria: flujo de caja, vencimientos, aging report."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from core.db import conectar as _conectar


def _hoy() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def _fecha_plus(dias: int) -> str:
    return (datetime.utcnow() + timedelta(days=dias)).strftime("%Y-%m-%d")


def resumen(empresa_id: str | None = None) -> dict[str, Any]:
    """Resumen de tesoreria: saldo, cobros/pagos pendientes, previsiones."""
    hoy = _hoy()
    d30 = _fecha_plus(30)
    d60 = _fecha_plus(60)
    d90 = _fecha_plus(90)

    with _conectar() as conn:
        # Saldo actual: ultimo saldo de movimientos bancarios
        saldo_actual = 0.0
        try:
            from core.db import get_conn
            bconn = get_conn()
            try:
                row = bconn.execute("""
                    SELECT saldo FROM movimientos
                    WHERE saldo IS NOT NULL AND saldo != ''
                    ORDER BY fecha_operacion DESC, id DESC LIMIT 1
                """).fetchone()
                if row:
                    try:
                        saldo_actual = float(str(row["saldo"]).replace(",", "."))
                    except (ValueError, TypeError):
                        pass
            finally:
                bconn.close()
        except Exception:
            pass

        emp_filter_prov = " AND empresa_id = ?" if empresa_id else ""
        emp_filter_cli = " AND empresa_id = ?" if empresa_id else ""
        params_prov = [empresa_id] if empresa_id else []
        params_cli = [empresa_id] if empresa_id else []

        # Por cobrar total (facturas cliente pendientes)
        por_cobrar = conn.execute(f"""
            SELECT COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar, '.', ''), ',', '.') AS REAL)), 0)
            FROM facturas_cliente
            WHERE (estado_cobro IS NULL OR estado_cobro = '' OR estado_cobro = 'pendiente')
            {emp_filter_cli}
        """, params_cli).fetchone()[0]

        # Por pagar total (facturas proveedor pendientes)
        por_pagar = conn.execute(f"""
            SELECT COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar, '.', ''), ',', '.') AS REAL)), 0)
            FROM facturas_proveedor
            WHERE (estado_pago IS NULL OR estado_pago = '' OR estado_pago = 'pendiente')
            {emp_filter_prov}
        """, params_prov).fetchone()[0]

        def _sum_vencimiento(tabla, campo_estado, estado_val, fecha_hasta, params_extra):
            return conn.execute(f"""
                SELECT COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar, '.', ''), ',', '.') AS REAL)), 0)
                FROM {tabla}
                WHERE ({campo_estado} IS NULL OR {campo_estado} = '' OR {campo_estado} = '{estado_val}')
                  AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento <= ?
                  {emp_filter_prov if tabla == 'facturas_proveedor' else emp_filter_cli}
            """, [fecha_hasta] + params_extra).fetchone()[0]

        cobrar_30 = _sum_vencimiento("facturas_cliente", "estado_cobro", "pendiente", d30, params_cli)
        pagar_30 = _sum_vencimiento("facturas_proveedor", "estado_pago", "pendiente", d30, params_prov)
        cobrar_60 = _sum_vencimiento("facturas_cliente", "estado_cobro", "pendiente", d60, params_cli)
        pagar_60 = _sum_vencimiento("facturas_proveedor", "estado_pago", "pendiente", d60, params_prov)
        cobrar_90 = _sum_vencimiento("facturas_cliente", "estado_cobro", "pendiente", d90, params_cli)
        pagar_90 = _sum_vencimiento("facturas_proveedor", "estado_pago", "pendiente", d90, params_prov)

    return {
        "saldo_actual": round(saldo_actual, 2),
        "por_cobrar_total": round(por_cobrar, 2),
        "por_pagar_total": round(por_pagar, 2),
        "por_cobrar_30d": round(cobrar_30, 2),
        "por_pagar_30d": round(pagar_30, 2),
        "prevision_30d": round(saldo_actual + cobrar_30 - pagar_30, 2),
        "prevision_60d": round(saldo_actual + cobrar_60 - pagar_60, 2),
        "prevision_90d": round(saldo_actual + cobrar_90 - pagar_90, 2),
    }


def calendario(fecha_desde: str | None = None, fecha_hasta: str | None = None,
               tipo: str | None = None, empresa_id: str | None = None) -> list[dict]:
    """Calendario de vencimientos: cobros y pagos pendientes."""
    hoy = _hoy()
    if not fecha_desde:
        fecha_desde = hoy
    if not fecha_hasta:
        fecha_hasta = _fecha_plus(90)

    eventos: list[dict] = []
    with _conectar() as conn:
        emp_f = " AND empresa_id = ?" if empresa_id else ""
        emp_p = [empresa_id] if empresa_id else []

        if tipo != "pagos":
            rows = conn.execute(f"""
                SELECT id, fecha_vencimiento, cliente AS empresa, total_a_pagar, 'cobro' AS tipo
                FROM facturas_cliente
                WHERE (estado_cobro IS NULL OR estado_cobro = '' OR estado_cobro = 'pendiente')
                  AND fecha_vencimiento IS NOT NULL
                  AND fecha_vencimiento >= ? AND fecha_vencimiento <= ?
                  {emp_f}
                ORDER BY fecha_vencimiento
            """, [fecha_desde, fecha_hasta] + emp_p).fetchall()
            for r in rows:
                eventos.append({
                    "fecha": r["fecha_vencimiento"], "tipo": "cobro",
                    "empresa": r["empresa"] or "", "importe": _parse_importe(r["total_a_pagar"]),
                    "factura_id": r["id"], "vencida": r["fecha_vencimiento"] < hoy,
                })

        if tipo != "cobros":
            rows = conn.execute(f"""
                SELECT id, fecha_vencimiento, proveedor AS empresa, total_a_pagar, 'pago' AS tipo
                FROM facturas_proveedor
                WHERE (estado_pago IS NULL OR estado_pago = '' OR estado_pago = 'pendiente')
                  AND fecha_vencimiento IS NOT NULL
                  AND fecha_vencimiento >= ? AND fecha_vencimiento <= ?
                  {emp_f}
                ORDER BY fecha_vencimiento
            """, [fecha_desde, fecha_hasta] + emp_p).fetchall()
            for r in rows:
                eventos.append({
                    "fecha": r["fecha_vencimiento"], "tipo": "pago",
                    "empresa": r["empresa"] or "", "importe": _parse_importe(r["total_a_pagar"]),
                    "factura_id": r["id"], "vencida": r["fecha_vencimiento"] < hoy,
                })

    # Also include overdue (fecha < fecha_desde)
    with _conectar() as conn:
        if tipo != "pagos":
            overdue = conn.execute(f"""
                SELECT id, fecha_vencimiento, cliente AS empresa, total_a_pagar
                FROM facturas_cliente
                WHERE (estado_cobro IS NULL OR estado_cobro = '' OR estado_cobro = 'pendiente')
                  AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < ?
                  {emp_f}
            """, [fecha_desde] + emp_p).fetchall()
            for r in overdue:
                eventos.append({
                    "fecha": r["fecha_vencimiento"], "tipo": "cobro",
                    "empresa": r["empresa"] or "", "importe": _parse_importe(r["total_a_pagar"]),
                    "factura_id": r["id"], "vencida": True,
                })
        if tipo != "cobros":
            overdue = conn.execute(f"""
                SELECT id, fecha_vencimiento, proveedor AS empresa, total_a_pagar
                FROM facturas_proveedor
                WHERE (estado_pago IS NULL OR estado_pago = '' OR estado_pago = 'pendiente')
                  AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < ?
                  {emp_f}
            """, [fecha_desde] + emp_p).fetchall()
            for r in overdue:
                eventos.append({
                    "fecha": r["fecha_vencimiento"], "tipo": "pago",
                    "empresa": r["empresa"] or "", "importe": _parse_importe(r["total_a_pagar"]),
                    "factura_id": r["id"], "vencida": True,
                })

    eventos.sort(key=lambda e: e["fecha"])
    return eventos


def aging(tipo: str = "proveedores", empresa_id: str | None = None) -> list[dict]:
    """Aging report: facturas pendientes agrupadas por antiguedad."""
    hoy = _hoy()
    tabla = "facturas_proveedor" if tipo == "proveedores" else "facturas_cliente"
    campo_empresa = "proveedor" if tipo == "proveedores" else "cliente"
    campo_estado = "estado_pago" if tipo == "proveedores" else "estado_cobro"

    emp_f = " AND empresa_id = ?" if empresa_id else ""
    emp_p = [empresa_id] if empresa_id else []

    with _conectar() as conn:
        rows = conn.execute(f"""
            SELECT {campo_empresa} AS empresa, fecha_factura, total_a_pagar
            FROM {tabla}
            WHERE ({campo_estado} IS NULL OR {campo_estado} = '' OR {campo_estado} = 'pendiente')
              AND fecha_factura IS NOT NULL AND fecha_factura != ''
              {emp_f}
        """, emp_p).fetchall()

    por_empresa: dict[str, dict] = {}
    for r in rows:
        emp = (r["empresa"] or "Sin nombre").strip()
        importe = _parse_importe(r["total_a_pagar"])
        fecha = r["fecha_factura"][:10] if r["fecha_factura"] else ""
        try:
            dias = (datetime.strptime(hoy, "%Y-%m-%d") - datetime.strptime(fecha, "%Y-%m-%d")).days
        except (ValueError, TypeError):
            dias = 0

        if emp not in por_empresa:
            por_empresa[emp] = {"empresa": emp, "total": 0, "count": 0,
                                "t_0_30": 0, "t_31_60": 0, "t_61_90": 0, "t_90_plus": 0}
        e = por_empresa[emp]
        e["total"] += importe
        e["count"] += 1
        if dias <= 30:
            e["t_0_30"] += importe
        elif dias <= 60:
            e["t_31_60"] += importe
        elif dias <= 90:
            e["t_61_90"] += importe
        else:
            e["t_90_plus"] += importe

    result = sorted(por_empresa.values(), key=lambda x: -x["total"])
    for r in result:
        for k in ("total", "t_0_30", "t_31_60", "t_61_90", "t_90_plus"):
            r[k] = round(r[k], 2)
    return result


def flujo_caja(empresa_id: str | None = None) -> list[dict]:
    """Flujo de caja proyectado dia a dia para los proximos 90 dias."""
    res = resumen(empresa_id)
    saldo = res["saldo_actual"]
    hoy = _hoy()
    d90 = _fecha_plus(90)

    with _conectar() as conn:
        emp_f = " AND empresa_id = ?" if empresa_id else ""
        emp_p = [empresa_id] if empresa_id else []

        cobros_rows = conn.execute(f"""
            SELECT fecha_vencimiento AS fecha, SUM(CAST(REPLACE(REPLACE(total_a_pagar, '.', ''), ',', '.') AS REAL)) AS total
            FROM facturas_cliente
            WHERE (estado_cobro IS NULL OR estado_cobro = '' OR estado_cobro = 'pendiente')
              AND fecha_vencimiento IS NOT NULL
              AND fecha_vencimiento >= ? AND fecha_vencimiento <= ?
              {emp_f}
            GROUP BY fecha_vencimiento
        """, [hoy, d90] + emp_p).fetchall()
        cobros = {r["fecha"]: round(r["total"], 2) for r in cobros_rows}

        pagos_rows = conn.execute(f"""
            SELECT fecha_vencimiento AS fecha, SUM(CAST(REPLACE(REPLACE(total_a_pagar, '.', ''), ',', '.') AS REAL)) AS total
            FROM facturas_proveedor
            WHERE (estado_pago IS NULL OR estado_pago = '' OR estado_pago = 'pendiente')
              AND fecha_vencimiento IS NOT NULL
              AND fecha_vencimiento >= ? AND fecha_vencimiento <= ?
              {emp_f}
            GROUP BY fecha_vencimiento
        """, [hoy, d90] + emp_p).fetchall()
        pagos = {r["fecha"]: round(r["total"], 2) for r in pagos_rows}

    result = []
    current = datetime.strptime(hoy, "%Y-%m-%d")
    end = datetime.strptime(d90, "%Y-%m-%d")
    while current <= end:
        fecha_str = current.strftime("%Y-%m-%d")
        c = cobros.get(fecha_str, 0)
        p = pagos.get(fecha_str, 0)
        saldo += c - p
        result.append({
            "fecha": fecha_str,
            "cobros": c,
            "pagos": p,
            "saldo": round(saldo, 2),
        })
        current += timedelta(days=1)
    return result


def get_condiciones(tercero_id: int) -> dict | None:
    with _conectar() as conn:
        row = conn.execute("SELECT * FROM tesoreria_condiciones_pago WHERE tercero_id = ?", (tercero_id,)).fetchone()
    return dict(row) if row else None


def set_condiciones(tercero_id: int, dias_pago: int, notas: str | None = None) -> dict:
    with _conectar() as conn:
        existing = conn.execute("SELECT id FROM tesoreria_condiciones_pago WHERE tercero_id = ?", (tercero_id,)).fetchone()
        if existing:
            conn.execute("UPDATE tesoreria_condiciones_pago SET dias_pago = ?, notas = ? WHERE tercero_id = ?",
                         (dias_pago, notas, tercero_id))
        else:
            conn.execute("INSERT INTO tesoreria_condiciones_pago (tercero_id, dias_pago, notas) VALUES (?, ?, ?)",
                         (tercero_id, dias_pago, notas))
    return get_condiciones(tercero_id)


def alertas_vencidas(empresa_id: str | None = None) -> dict:
    """Facturas vencidas pendientes."""
    hoy = _hoy()
    emp_f = " AND empresa_id = ?" if empresa_id else ""
    emp_p = [empresa_id] if empresa_id else []
    with _conectar() as conn:
        prov = conn.execute(f"""
            SELECT COUNT(*) as cnt,
                   COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar, '.', ''), ',', '.') AS REAL)), 0) as total
            FROM facturas_proveedor
            WHERE (estado_pago IS NULL OR estado_pago = '' OR estado_pago = 'pendiente')
              AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < ?
              {emp_f}
        """, [hoy] + emp_p).fetchone()
        cli = conn.execute(f"""
            SELECT COUNT(*) as cnt,
                   COALESCE(SUM(CAST(REPLACE(REPLACE(total_a_pagar, '.', ''), ',', '.') AS REAL)), 0) as total
            FROM facturas_cliente
            WHERE (estado_cobro IS NULL OR estado_cobro = '' OR estado_cobro = 'pendiente')
              AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < ?
              {emp_f}
        """, [hoy] + emp_p).fetchone()
    return {
        "facturas_vencidas": prov["cnt"] + cli["cnt"],
        "importe_vencido": round(prov["total"] + cli["total"], 2),
        "pagos_vencidos": prov["cnt"],
        "cobros_vencidos": cli["cnt"],
    }


def _parse_importe(val) -> float:
    if not val:
        return 0.0
    s = str(val).strip()
    # Handle European format: 1.234,56
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0
