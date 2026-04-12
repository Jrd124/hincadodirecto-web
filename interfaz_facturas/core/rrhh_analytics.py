"""
RRHH Analytics — Dashboard, Verificador, SS, IRPF, Dietas, Adelantos, Coste Proyecto.
Todas las consultas de solo lectura sobre datos de nóminas.
"""
from __future__ import annotations

from datetime import date, timedelta
from core.db import get_conn


def dashboard():
    """KPIs + evolución mensual + distribución + top5 + alertas."""
    conn = get_conn()
    try:
        # Último periodo con nóminas
        ultimo = conn.execute("SELECT MAX(periodo) FROM nominas WHERE tipo='NOMINA'").fetchone()[0] or ""
        # Periodo anterior
        if ultimo:
            y, m = int(ultimo[:4]), int(ultimo[5:7])
            m -= 1
            if m < 1:
                m = 12; y -= 1
            anterior = f"{y}-{m:02d}"
        else:
            anterior = ""

        emp_activos = conn.execute("SELECT COUNT(*) FROM empleados WHERE estado='activo'").fetchone()[0]

        coste_mes = conn.execute(
            "SELECT SUM(coste_empresa) FROM nominas WHERE periodo=? AND tipo='NOMINA'", (ultimo,)
        ).fetchone()[0] or 0

        coste_ant = conn.execute(
            "SELECT SUM(coste_empresa) FROM nominas WHERE periodo=? AND tipo='NOMINA'", (anterior,)
        ).fetchone()[0] or 0

        variacion = round((coste_mes - coste_ant) / coste_ant * 100, 1) if coste_ant > 0 else 0

        coste_dia = conn.execute(
            "SELECT AVG(n.coste_dia) FROM nominas n JOIN empleados e ON e.id=n.empleado_id "
            "WHERE n.periodo=? AND n.tipo='NOMINA' AND e.estado='activo'", (ultimo,)
        ).fetchone()[0] or 0

        dietas_mes = conn.execute(
            "SELECT SUM(dietas) FROM nominas WHERE periodo=? AND tipo='NOMINA'", (ultimo,)
        ).fetchone()[0] or 0

        # Rotación 12m
        hace_12m = (date.today().replace(day=1) - timedelta(days=365)).strftime("%Y-%m")
        finiquitos = conn.execute(
            "SELECT COUNT(*) FROM nominas WHERE tipo='FINIQUITO' AND periodo>=?", (hace_12m,)
        ).fetchone()[0]
        plantilla_media = conn.execute(
            "SELECT AVG(c) FROM (SELECT COUNT(DISTINCT empleado_id) as c FROM nominas "
            "WHERE tipo='NOMINA' AND periodo>=? GROUP BY periodo)", (hace_12m,)
        ).fetchone()[0] or emp_activos
        rotacion = round(finiquitos / plantilla_media * 100, 1) if plantilla_media > 0 else 0

        # Evolución mensual
        evolucion = [dict(r) for r in conn.execute("""
            SELECT periodo, COUNT(DISTINCT empleado_id) as empleados,
                   ROUND(SUM(total_devengado - dietas),2) as salarios,
                   ROUND(SUM(ss_empresa),2) as ss_empresa,
                   ROUND(SUM(dietas),2) as dietas,
                   ROUND(SUM(coste_empresa),2) as coste_empresa
            FROM nominas WHERE tipo='NOMINA' GROUP BY periodo ORDER BY periodo
        """).fetchall()]

        # Distribución categoría
        categorias = [dict(r) for r in conn.execute("""
            SELECT e.categoria, COUNT(DISTINCT n.empleado_id) as empleados,
                   ROUND(AVG(n.coste_empresa),2) as coste_medio_mes
            FROM nominas n JOIN empleados e ON e.id=n.empleado_id
            WHERE n.periodo=? AND n.tipo='NOMINA'
            GROUP BY e.categoria ORDER BY coste_medio_mes DESC
        """, (ultimo,)).fetchall()]

        # Top 5
        top5 = [dict(r) for r in conn.execute("""
            SELECT e.id, e.nombre, e.apellidos, e.categoria, n.coste_dia, n.coste_empresa
            FROM nominas n JOIN empleados e ON e.id=n.empleado_id
            WHERE n.periodo=? AND n.tipo='NOMINA'
            ORDER BY n.coste_dia DESC LIMIT 5
        """, (ultimo,)).fetchall()]

        # Alertas
        alertas = []
        # Empleados activos sin nómina este mes
        sin_nomina = conn.execute("""
            SELECT COUNT(*) FROM empleados e WHERE e.estado='activo'
            AND e.id NOT IN (SELECT empleado_id FROM nominas WHERE periodo=? AND tipo='NOMINA')
        """, (ultimo,)).fetchone()[0]
        if sin_nomina > 0:
            alertas.append({"tipo": "warning", "texto": f"{sin_nomina} empleado(s) activo(s) sin nomina en {ultimo}"})

        adelantos_pend = conn.execute(
            "SELECT COUNT(*), SUM(importe) FROM adelantos WHERE estado='pendiente'"
        ).fetchone()
        if adelantos_pend[0]:
            alertas.append({"tipo": "info", "texto": f"{adelantos_pend[0]} adelantos pendientes ({adelantos_pend[1]:.2f} EUR)"})

        return {
            "kpis": {
                "emp_activos": emp_activos,
                "coste_mes": round(coste_mes, 2),
                "coste_dia": round(coste_dia, 2),
                "dietas_mes": round(dietas_mes, 2),
                "variacion": variacion,
                "rotacion": rotacion,
                "ultimo_periodo": ultimo,
            },
            "evolucion": evolucion,
            "categorias": categorias,
            "top5": top5,
            "alertas": alertas,
        }
    finally:
        conn.close()


def verificador(periodo):
    """Tabla comparativa para verificar nóminas vs transferencias."""
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT n.empleado_id, e.nombre, e.apellidos, e.categoria, e.dni,
                   n.dias, n.liquido, n.embargo, n.coste_empresa,
                   n.total_devengado, n.total_deducir, n.dietas,
                   n.salario_base, n.plus_asistencia, n.extra_mes,
                   n.mejora_voluntaria, n.a_cuenta_convenio,
                   n.cot_cc, n.cot_mei, n.cot_fp, n.cot_desempleo,
                   n.irpf_porcentaje, n.irpf_euros, n.tipo
            FROM nominas n JOIN empleados e ON e.id=n.empleado_id
            WHERE n.periodo=? ORDER BY e.apellidos, e.nombre
        """, (periodo,)).fetchall()

        lineas = []
        total_liquido = 0
        total_adelantos = 0
        total_embargo = 0
        total_transferir = 0

        for r in rows:
            emp_id = r["empleado_id"]
            liquido = r["liquido"] or 0
            embargo = r["embargo"] or 0

            # Adelantos pendientes del empleado
            adel = conn.execute(
                "SELECT SUM(importe) FROM adelantos WHERE empleado_id=? AND estado='pendiente'",
                (emp_id,)
            ).fetchone()[0] or 0

            a_transferir = round(liquido - adel - embargo, 2)
            nombre = (r["nombre"] or "") + " " + (r["apellidos"] or "")

            lineas.append({
                "empleado_id": emp_id,
                "nombre": nombre.strip(),
                "categoria": r["categoria"] or "",
                "dni": r["dni"] or "",
                "tipo": r["tipo"],
                "dias": r["dias"] or 0,
                "liquido": round(liquido, 2),
                "adelantos": round(adel, 2),
                "embargo": round(embargo, 2),
                "a_transferir": round(a_transferir, 2),
                "coste_empresa": round(r["coste_empresa"] or 0, 2),
                "total_devengado": round(r["total_devengado"] or 0, 2),
                "dietas": round(r["dietas"] or 0, 2),
            })

            total_liquido += liquido
            total_adelantos += adel
            total_embargo += embargo
            total_transferir += a_transferir

        return {
            "periodo": periodo,
            "lineas": lineas,
            "totales": {
                "liquido": round(total_liquido, 2),
                "adelantos": round(total_adelantos, 2),
                "embargo": round(total_embargo, 2),
                "transferir": round(total_transferir, 2),
                "nominas": len(lineas),
            },
        }
    finally:
        conn.close()


def seguridad_social():
    """Cotizaciones mensuales desglosadas."""
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT periodo, COUNT(DISTINCT empleado_id) as empleados,
                   ROUND(SUM(base_ss),2) as base_ss,
                   ROUND(SUM(ss_empresa),2) as ss_empresa,
                   ROUND(SUM(cot_cc + cot_mei + cot_fp + cot_desempleo),2) as ss_trabajador
            FROM nominas WHERE tipo='NOMINA'
            GROUP BY periodo ORDER BY periodo
        """).fetchall()

        meses = [dict(r) for r in rows]
        for m in meses:
            m["total_ss"] = round((m["ss_empresa"] or 0) + (m["ss_trabajador"] or 0), 2)

        ultimo = meses[-1] if meses else {}
        acumulado_anio = sum(m["total_ss"] for m in meses if m["periodo"][:4] == str(date.today().year))

        return {
            "kpis": {
                "ss_empresa_mes": ultimo.get("ss_empresa", 0),
                "ss_trabajador_mes": ultimo.get("ss_trabajador", 0),
                "acumulado_anio": round(acumulado_anio, 2),
                "ultimo_periodo": ultimo.get("periodo", ""),
            },
            "meses": meses,
        }
    finally:
        conn.close()


def irpf():
    """Retenciones IRPF agrupadas por trimestre."""
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT periodo, COUNT(*) as nominas,
                   ROUND(SUM(total_devengado),2) as base,
                   ROUND(SUM(irpf_euros),2) as retenido,
                   ROUND(AVG(irpf_porcentaje),1) as pct_medio
            FROM nominas WHERE tipo='NOMINA'
            GROUP BY periodo ORDER BY periodo
        """).fetchall()

        # Group into quarters
        trimestres = {}
        for r in rows:
            p = r["periodo"]
            y, m = int(p[:4]), int(p[5:7])
            q = (m - 1) // 3 + 1
            key = f"{y}-{q}T"
            if key not in trimestres:
                limites = {1: f"20 abr {y}", 2: f"20 jul {y}", 3: f"20 oct {y}", 4: f"20 ene {y+1}"}
                meses_label = {1: "Ene-Mar", 2: "Abr-Jun", 3: "Jul-Sep", 4: "Oct-Dic"}
                trimestres[key] = {"trimestre": key, "meses_label": meses_label[q], "nominas": 0, "base": 0, "retenido": 0, "fecha_limite": limites[q], "periodos": []}
            t = trimestres[key]
            t["nominas"] += r["nominas"]
            t["base"] += r["base"] or 0
            t["retenido"] += r["retenido"] or 0
            t["periodos"].append(r["periodo"])

        for t in trimestres.values():
            t["base"] = round(t["base"], 2)
            t["retenido"] = round(t["retenido"], 2)
            t["pct_medio"] = round(t["retenido"] / t["base"] * 100, 1) if t["base"] > 0 else 0

        total_anio = sum(t["retenido"] for t in trimestres.values() if t["trimestre"][:4] == str(date.today().year))

        return {
            "kpis": {
                "acumulado_anio": round(total_anio, 2),
                "pct_medio": round(total_anio / sum(t["base"] for t in trimestres.values() if t["trimestre"][:4] == str(date.today().year)) * 100, 1) if total_anio > 0 else 0,
            },
            "trimestres": list(trimestres.values()),
        }
    finally:
        conn.close()


def coste_proyecto():
    """Cruza asignaciones de operaciones con costes de nómina."""
    conn = get_conn()
    try:
        # Get all employee assignments to projects
        rows = conn.execute("""
            SELECT pa.proyecto_id, p.nombre as proyecto, p.codigo,
                   pa.recurso_id as empleado_id, pa.recurso_nombre,
                   COUNT(DISTINCT pa.fecha) as dias
            FROM proyecto_asignaciones pa
            JOIN proyectos p ON p.id = pa.proyecto_id
            WHERE pa.recurso_tipo = 'empleado' AND pa.estado != 'averia'
            GROUP BY pa.proyecto_id, pa.recurso_id
        """).fetchall()

        proyectos = {}
        for r in rows:
            pid = r["proyecto_id"]
            if pid not in proyectos:
                proyectos[pid] = {"proyecto_id": pid, "proyecto": r["proyecto"], "codigo": r["codigo"],
                                  "empleados": 0, "dias_hombre": 0, "coste_personal": 0, "dietas": 0}
            proy = proyectos[pid]

            emp_id = r["empleado_id"]
            dias = r["dias"]
            proy["empleados"] += 1
            proy["dias_hombre"] += dias

            # Get average coste_dia for this employee
            cd = conn.execute(
                "SELECT AVG(coste_dia) FROM nominas WHERE empleado_id=? AND tipo='NOMINA' AND coste_dia > 0",
                (emp_id,)
            ).fetchone()[0] or 0
            proy["coste_personal"] += round(cd * dias, 2)

            # Average daily dietas
            dd = conn.execute(
                "SELECT AVG(dietas/dias) FROM nominas WHERE empleado_id=? AND tipo='NOMINA' AND dias > 0",
                (emp_id,)
            ).fetchone()[0] or 0
            proy["dietas"] += round(dd * dias, 2)

        result = list(proyectos.values())
        for p in result:
            p["coste_personal"] = round(p["coste_personal"], 2)
            p["dietas"] = round(p["dietas"], 2)
            p["total_rrhh"] = round(p["coste_personal"] + p["dietas"], 2)

        return {"proyectos": sorted(result, key=lambda x: x["total_rrhh"], reverse=True)}
    finally:
        conn.close()


def dietas_dashboard():
    """Dashboard de dietas con resumen por empleado."""
    conn = get_conn()
    try:
        # Config
        config = [dict(r) for r in conn.execute("SELECT * FROM dietas_config ORDER BY tipo, subtipo").fetchall()]

        # Dietas por empleado (últimos 3 meses de datos)
        ultimo = conn.execute("SELECT MAX(periodo) FROM nominas WHERE tipo='NOMINA'").fetchone()[0] or ""
        y, m = int(ultimo[:4]), int(ultimo[5:7])
        periodos = []
        for i in range(3):
            periodos.append(f"{y}-{m:02d}")
            m -= 1
            if m < 1:
                m = 12; y -= 1
        periodos.reverse()

        emp_dietas = [dict(r) for r in conn.execute("""
            SELECT e.id, e.nombre, e.apellidos, n.periodo, ROUND(n.dietas,2) as dietas
            FROM nominas n JOIN empleados e ON e.id=n.empleado_id
            WHERE n.tipo='NOMINA' AND n.periodo IN (?,?,?)
            ORDER BY e.apellidos, e.nombre, n.periodo
        """, tuple(periodos)).fetchall()]

        return {"config": config, "emp_dietas": emp_dietas, "periodos": periodos}
    finally:
        conn.close()


def adelantos_list(empleado_id=None, estado=None):
    """Lista de adelantos con filtros."""
    conn = get_conn()
    try:
        where = ["1=1"]
        params = []
        if empleado_id:
            where.append("a.empleado_id = ?")
            params.append(int(empleado_id))
        if estado:
            where.append("a.estado = ?")
            params.append(estado)

        rows = conn.execute(
            "SELECT a.*, e.nombre, e.apellidos FROM adelantos a "
            "JOIN empleados e ON e.id = a.empleado_id "
            f"WHERE {' AND '.join(where)} ORDER BY a.fecha DESC", params
        ).fetchall()

        total_pend = conn.execute("SELECT COUNT(*), COALESCE(SUM(importe),0) FROM adelantos WHERE estado='pendiente'").fetchone()

        return {
            "adelantos": [dict(r) for r in rows],
            "kpis": {"pendientes": total_pend[0], "importe_pendiente": round(total_pend[1], 2)},
        }
    finally:
        conn.close()
