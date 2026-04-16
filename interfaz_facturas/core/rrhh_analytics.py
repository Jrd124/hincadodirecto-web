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

        # Asignación de empleados a proyectos (hoy)
        hoy = date.today().isoformat()
        asig_proy = [dict(r) for r in conn.execute("""
            SELECT pa.proyecto_id, p.nombre as proyecto_nombre,
                   COUNT(DISTINCT pa.recurso_id) as empleados
            FROM proyecto_asignaciones pa
            JOIN proyectos p ON p.id = pa.proyecto_id
            WHERE pa.recurso_tipo IN ('hincador','ayudante','operador','empleado')
              AND pa.fecha = ?
            GROUP BY pa.proyecto_id
            ORDER BY empleados DESC
        """, (hoy,)).fetchall()]
        ids_asignados = set()
        for r in conn.execute(
            "SELECT DISTINCT recurso_id FROM proyecto_asignaciones "
            "WHERE recurso_tipo IN ('hincador','ayudante','operador','empleado') AND fecha=?",
            (hoy,)
        ).fetchall():
            ids_asignados.add(r["recurso_id"])
        sin_asignar = conn.execute(
            "SELECT COUNT(*) FROM empleados WHERE estado='activo' AND id NOT IN ({})".format(
                ",".join(str(i) for i in ids_asignados) if ids_asignados else "0"
            )
        ).fetchone()[0]
        baja_vac = conn.execute(
            "SELECT COUNT(*) FROM empleados WHERE estado IN ('baja','vacaciones')"
        ).fetchone()[0]
        total_asig = sum(r["empleados"] for r in asig_proy) + sin_asignar + baja_vac
        asignacion_empleados = {
            "proyectos": asig_proy,
            "sin_asignar": sin_asignar,
            "baja_vacaciones": baja_vac,
            "total": total_asig,
        }

        # Top 5
        top5 = [dict(r) for r in conn.execute("""
            SELECT e.id, e.nombre, e.apellidos, e.categoria, n.coste_dia, n.coste_empresa
            FROM nominas n JOIN empleados e ON e.id=n.empleado_id
            WHERE n.periodo=? AND n.tipo='NOMINA'
            ORDER BY n.coste_dia DESC LIMIT 5
        """, (ultimo,)).fetchall()]

        # Alertas
        alertas = []
        # Empleados activos sin nómina este mes — listar nombres
        sin_nomina_rows = conn.execute("""
            SELECT e.nombre, e.apellidos FROM empleados e WHERE e.estado='activo'
            AND e.id NOT IN (SELECT empleado_id FROM nominas WHERE periodo=? AND tipo='NOMINA')
            ORDER BY e.apellidos, e.nombre
        """, (ultimo,)).fetchall()
        if sin_nomina_rows:
            nombres = [f"{r['nombre']} {r['apellidos'] or ''}".strip() for r in sin_nomina_rows]
            alertas.append({"tipo": "warning", "texto": f"{len(nombres)} empleado(s) activo(s) sin nomina en {ultimo}:", "nombres": nombres})

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
            "asignacion_empleados": asignacion_empleados,
            "top5": top5,
            "alertas": alertas,
        }
    finally:
        conn.close()


def verificador(periodo):
    """Tabla comparativa para verificar nóminas vs transferencias."""
    conn = get_conn()
    try:
        # Pre-load adelantos from banco for this month
        y, m = int(periodo[:4]), int(periodo[5:7])
        m2 = m + 1; y2 = y
        if m2 > 12: m2 = 1; y2 += 1
        fecha_ini = f"{periodo}-01"
        fecha_fin = f"{y2}-{m2:02d}-01"
        adelantos_banco = {}
        try:
            import sqlite3 as _sql
            try:
                from config import MOVIMIENTOS_DB
            except ImportError:
                from interfaz_facturas.config import MOVIMIENTOS_DB
            bconn = _sql.connect(str(MOVIMIENTOS_DB))
            for r in bconn.execute(
                "SELECT rrhh_empleado_id, COALESCE(SUM(ABS(importe)),0) as total "
                "FROM movimientos WHERE rrhh_tipo='adelanto' "
                "AND fecha_operacion >= ? AND fecha_operacion < ? "
                "GROUP BY rrhh_empleado_id", (fecha_ini, fecha_fin)
            ).fetchall():
                adelantos_banco[r[0]] = r[1]
            bconn.close()
        except Exception:
            pass  # columns may not exist yet
        rows = conn.execute("""
            SELECT n.empleado_id, e.nombre, e.apellidos, e.categoria, e.dni,
                   e.neto_pactado,
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
        total_estimado = 0

        for r in rows:
            emp_id = r["empleado_id"]
            liquido = r["liquido"] or 0
            embargo = r["embargo"] or 0
            dias = r["dias"] or 30
            dietas = r["dietas"] or 0
            neto_pactado = r["neto_pactado"] or 0

            # Estimación: neto pactado proporcional a días + dietas
            neto_proporcional = round(neto_pactado * dias / 30, 2) if neto_pactado > 0 else 0
            estimado = round(neto_proporcional + dietas, 2)
            diferencia = round(estimado - liquido, 2) if estimado > 0 else 0

            # Adelantos del empleado desde banco (pre-loaded)
            adel = adelantos_banco.get(emp_id, 0)

            a_transferir = round(liquido - adel - embargo, 2)
            nombre = (r["nombre"] or "") + " " + (r["apellidos"] or "")

            lineas.append({
                "empleado_id": emp_id,
                "nombre": nombre.strip(),
                "categoria": r["categoria"] or "",
                "dni": r["dni"] or "",
                "tipo": r["tipo"],
                "dias": dias,
                "neto_pactado": neto_pactado,
                "neto_proporcional": neto_proporcional,
                "dietas": round(dietas, 2),
                "estimado": estimado,
                "liquido": round(liquido, 2),
                "diferencia": diferencia,
                "adelantos": round(adel, 2),
                "embargo": round(embargo, 2),
                "a_transferir": round(a_transferir, 2),
                "coste_empresa": round(r["coste_empresa"] or 0, 2),
                "total_devengado": round(r["total_devengado"] or 0, 2),
            })

            total_liquido += liquido
            total_adelantos += adel
            total_embargo += embargo
            total_transferir += a_transferir
            total_estimado += estimado

        return {
            "periodo": periodo,
            "lineas": lineas,
            "totales": {
                "estimado": round(total_estimado, 2),
                "liquido": round(total_liquido, 2),
                "adelantos": round(total_adelantos, 2),
                "embargo": round(total_embargo, 2),
                "transferir": round(total_transferir, 2),
                "nominas": len(lineas),
            },
        }
    finally:
        conn.close()


def estimacion_nominas(periodo):
    """Proyección de coste nóminas del mes usando gross-up desde neto pactado."""
    import calendar
    conn = get_conn()
    try:
        y, m = int(periodo[:4]), int(periodo[5:7])
        dias_mes = calendar.monthrange(y, m)[1]
        fecha_ini = f"{periodo}-01"
        m2 = m + 1; y2 = y
        if m2 > 12: m2 = 1; y2 += 1
        fecha_fin = f"{y2}-{m2:02d}-01"

        # -- 1. Empleados activos --
        emps = conn.execute(
            "SELECT id, nombre, apellidos, categoria, dni, neto_pactado "
            "FROM empleados WHERE estado='activo' ORDER BY apellidos, nombre"
        ).fetchall()

        # -- 2. Ratios históricos de las últimas 3 nóminas por empleado --
        ratios = {}
        for e in emps:
            eid = e["id"]
            noms = conn.execute(
                "SELECT total_devengado, irpf_euros, "
                "       cot_cc, cot_mei, cot_fp, cot_desempleo, "
                "       ss_empresa, liquido, coste_empresa "
                "FROM nominas WHERE empleado_id=? AND tipo='NOMINA' "
                "AND total_devengado > 0 "
                "ORDER BY periodo DESC LIMIT 3", (eid,)
            ).fetchall()
            if noms:
                pct_irpf_list = []
                pct_ss_list = []
                ratio_ss_emp_list = []
                for n in noms:
                    td = n["total_devengado"]
                    if td <= 0:
                        continue
                    irpf_e = n["irpf_euros"] or 0
                    ss_trab = (n["cot_cc"] or 0) + (n["cot_mei"] or 0) + (n["cot_fp"] or 0) + (n["cot_desempleo"] or 0)
                    ss_emp = n["ss_empresa"] or 0
                    pct_irpf_list.append(irpf_e / td * 100)
                    pct_ss_list.append(ss_trab / td * 100)
                    ratio_ss_emp_list.append(ss_emp / td)
                if pct_irpf_list:
                    ratios[eid] = {
                        "pct_irpf": sum(pct_irpf_list) / len(pct_irpf_list),
                        "pct_ss": sum(pct_ss_list) / len(pct_ss_list),
                        "ratio_ss_emp": sum(ratio_ss_emp_list) / len(ratio_ss_emp_list),
                        "fallback": False,
                    }
            if eid not in ratios:
                ratios[eid] = {
                    "pct_irpf": 15.0,
                    "pct_ss": 6.35,
                    "ratio_ss_emp": 0.32,
                    "fallback": True,
                }

        # -- 3. Días planificados por empleado (asignaciones + dietas) --
        dias_plan = {}
        for r in conn.execute(
            "SELECT recurso_id, COUNT(DISTINCT fecha) as cnt "
            "FROM proyecto_asignaciones "
            "WHERE recurso_tipo='empleado' AND fecha >= ? AND fecha < ? "
            "GROUP BY recurso_id", (fecha_ini, fecha_fin)
        ).fetchall():
            dias_plan[r["recurso_id"]] = r["cnt"]
        # Also count distinct dieta days not already counted
        for r in conn.execute(
            "SELECT empleado_id, GROUP_CONCAT(DISTINCT fecha) as fechas "
            "FROM dietas_diarias WHERE fecha >= ? AND fecha < ? "
            "GROUP BY empleado_id", (fecha_ini, fecha_fin)
        ).fetchall():
            eid = r["empleado_id"]
            fechas_dieta = set(r["fechas"].split(",")) if r["fechas"] else set()
            # Get assignment dates for this employee to avoid double-counting
            asig_fechas = set()
            for a in conn.execute(
                "SELECT DISTINCT fecha FROM proyecto_asignaciones "
                "WHERE recurso_tipo='empleado' AND recurso_id=? AND fecha >= ? AND fecha < ?",
                (eid, fecha_ini, fecha_fin)
            ).fetchall():
                asig_fechas.add(a["fecha"])
            extra = len(fechas_dieta - asig_fechas)
            dias_plan[eid] = dias_plan.get(eid, 0) + extra

        # -- 4. Dietas estimadas del mes (from dietas_diarias with tarifa calc) --
        try:
            tarifas_all = conn.execute(
                "SELECT * FROM dietas_config ORDER BY fecha_vigencia_desde DESC"
            ).fetchall()
        except Exception:
            tarifas_all = []

        def _calc_imp(tipo_dieta, fecha, funcion="operador"):
            parts = tipo_dieta.split("_", 1) if tipo_dieta else []
            if len(parts) != 2:
                return 0
            geo, sub = parts
            fn = (funcion or "operador").lower().strip()
            for t in tarifas_all:
                if t["tipo"] != geo or t["subtipo"] != sub:
                    continue
                if t["fecha_vigencia_desde"] and t["fecha_vigencia_desde"] > fecha:
                    continue
                if t["fecha_vigencia_hasta"] and t["fecha_vigencia_hasta"] < fecha:
                    continue
                tc = (t["categoria"] or "").lower().strip()
                if tc == fn:
                    return t["importe"] or 0
            for t in tarifas_all:
                if t["tipo"] != geo or t["subtipo"] != sub:
                    continue
                if t["fecha_vigencia_desde"] and t["fecha_vigencia_desde"] > fecha:
                    continue
                if t["fecha_vigencia_hasta"] and t["fecha_vigencia_hasta"] < fecha:
                    continue
                if not (t["categoria"] or "").strip():
                    return t["importe"] or 0
            return 0

        dietas_emp = {}
        for r in conn.execute(
            "SELECT empleado_id, fecha, tipo, importe, funcion "
            "FROM dietas_diarias WHERE fecha >= ? AND fecha < ?",
            (fecha_ini, fecha_fin)
        ).fetchall():
            imp = r["importe"] or 0
            if imp == 0 and r["tipo"]:
                imp = _calc_imp(r["tipo"], r["fecha"], r["funcion"] or "operador")
            eid = r["empleado_id"]
            dietas_emp[eid] = dietas_emp.get(eid, 0) + imp

        # -- 5. Adelantos del mes (from movimientos.db) --
        adelantos_banco = {}
        try:
            import sqlite3 as _sql
            try:
                from config import MOVIMIENTOS_DB
            except ImportError:
                from interfaz_facturas.config import MOVIMIENTOS_DB
            bconn = _sql.connect(str(MOVIMIENTOS_DB))
            for r in bconn.execute(
                "SELECT rrhh_empleado_id, COALESCE(SUM(ABS(importe)),0) as total "
                "FROM movimientos WHERE rrhh_tipo='adelanto' "
                "AND fecha_operacion >= ? AND fecha_operacion < ? "
                "GROUP BY rrhh_empleado_id", (fecha_ini, fecha_fin)
            ).fetchall():
                adelantos_banco[r[0]] = r[1]
            bconn.close()
        except Exception:
            pass

        # -- 6. Build result per employee --
        lineas = []
        t_neto = 0; t_devengado = 0; t_coste = 0; t_dietas = 0; t_adelantos = 0; t_liquido_pend = 0

        for e in emps:
            eid = e["id"]
            nombre = ((e["nombre"] or "") + " " + (e["apellidos"] or "")).strip()
            neto_pactado = e["neto_pactado"] or 0
            r = ratios[eid]
            dp = dias_plan.get(eid, 0)
            dietas = round(dietas_emp.get(eid, 0), 2)
            adel = round(adelantos_banco.get(eid, 0), 2)

            # Proporción del mes
            proporcion = dp / dias_mes if dp > 0 and dias_mes > 0 else 1.0
            neto_proporcional = round(neto_pactado * proporcion, 2)

            # Gross-up
            divisor = 1 - r["pct_irpf"] / 100 - r["pct_ss"] / 100
            if divisor <= 0:
                divisor = 0.7865  # safe fallback
            total_devengado = round(neto_proporcional / divisor, 2)
            ss_empresa = round(total_devengado * r["ratio_ss_emp"], 2)
            coste_empresa = round(total_devengado + ss_empresa, 2)
            coste_total = round(coste_empresa + dietas, 2)

            liquido_total = round(neto_proporcional + dietas, 2)
            liquido_pendiente = round(liquido_total - adel, 2)

            lineas.append({
                "empleado_id": eid,
                "nombre": nombre,
                "categoria": e["categoria"] or "",
                "dni": e["dni"] or "",
                "dias_planif": dp,
                "neto_pactado": neto_pactado,
                "pct_irpf": round(r["pct_irpf"], 2),
                "pct_ss": round(r["pct_ss"], 2),
                "ratio_ss_emp": round(r["ratio_ss_emp"] * 100, 2),
                "fallback": r["fallback"],
                "neto_proporcional": neto_proporcional,
                "total_devengado": total_devengado,
                "coste_empresa": coste_empresa,
                "coste_total": coste_total,
                "dietas": dietas,
                "adelantos": adel,
                "liquido_total": liquido_total,
                "liquido_pendiente": liquido_pendiente,
            })

            t_neto += neto_proporcional
            t_devengado += total_devengado
            t_coste += coste_total
            t_dietas += dietas
            t_adelantos += adel
            t_liquido_pend += liquido_pendiente

        return {
            "periodo": periodo,
            "dias_mes": dias_mes,
            "lineas": lineas,
            "totales": {
                "empleados": len(lineas),
                "neto_proporcional": round(t_neto, 2),
                "total_devengado": round(t_devengado, 2),
                "coste_total": round(t_coste, 2),
                "dietas": round(t_dietas, 2),
                "adelantos": round(t_adelantos, 2),
                "liquido_pendiente": round(t_liquido_pend, 2),
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

        # Dietas por empleado — todos los meses con datos
        periodos = [r[0] for r in conn.execute(
            "SELECT DISTINCT periodo FROM nominas WHERE tipo='NOMINA' AND dietas > 0 ORDER BY periodo"
        ).fetchall()]

        emp_dietas = [dict(r) for r in conn.execute("""
            SELECT e.id, e.nombre, e.apellidos, n.periodo, ROUND(n.dietas,2) as dietas
            FROM nominas n JOIN empleados e ON e.id=n.empleado_id
            WHERE n.tipo='NOMINA' AND n.dietas > 0
            ORDER BY e.apellidos, e.nombre, n.periodo
        """).fetchall()]

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
