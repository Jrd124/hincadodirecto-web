"""
Alojamiento — Gestión de estancias de equipos en hoteles/apartamentos.
Blueprint: /api/alojamientos/*
"""

from flask import Blueprint, jsonify, request
from core.db import get_conn

alojamiento_bp = Blueprint("alojamiento", __name__)

_tables_ok = False


def _init_alojamiento_tables():
    global _tables_ok
    if _tables_ok:
        return
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS alojamientos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hotel_nombre TEXT NOT NULL,
            localidad TEXT,
            proyecto_id INTEGER,
            fecha_entrada TEXT NOT NULL,
            fecha_salida TEXT NOT NULL,
            num_noches INTEGER,
            coste_total REAL,
            num_personas INTEGER DEFAULT 1,
            comentario TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
        );
        CREATE INDEX IF NOT EXISTS idx_aloj_proyecto ON alojamientos(proyecto_id);
        CREATE INDEX IF NOT EXISTS idx_aloj_fecha ON alojamientos(fecha_entrada);
        CREATE INDEX IF NOT EXISTS idx_aloj_hotel ON alojamientos(hotel_nombre);
    """)
    conn.commit()
    _tables_ok = True


@alojamiento_bp.before_request
def _ensure_tables():
    _init_alojamiento_tables()


@alojamiento_bp.get("/api/alojamientos")
def api_alojamientos_list():
    conn = get_conn()
    clauses = []
    params = []
    proyecto_id = request.args.get("proyecto_id")
    if proyecto_id:
        clauses.append("a.proyecto_id = ?")
        params.append(int(proyecto_id))
    desde = request.args.get("desde")
    if desde:
        clauses.append("a.fecha_entrada >= ?")
        params.append(desde)
    hasta = request.args.get("hasta")
    if hasta:
        clauses.append("a.fecha_salida <= ?")
        params.append(hasta)
    hotel = request.args.get("hotel")
    if hotel:
        clauses.append("a.hotel_nombre = ?")
        params.append(hotel)
    localidad = request.args.get("localidad")
    if localidad:
        clauses.append("a.localidad = ?")
        params.append(localidad)

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = """
        SELECT a.*, p.nombre AS proyecto_nombre
        FROM alojamientos a
        LEFT JOIN proyectos p ON p.id = a.proyecto_id
    """ + where + " ORDER BY a.fecha_entrada DESC"
    rows = conn.execute(sql, params).fetchall()
    return jsonify({"alojamientos": [dict(r) for r in rows]})


@alojamiento_bp.post("/api/alojamientos")
def api_alojamientos_create():
    data = request.get_json(force=True)
    hotel = (data.get("hotel_nombre") or "").strip()
    if not hotel:
        return jsonify({"error": "hotel_nombre requerido"}), 400
    fe = data.get("fecha_entrada", "")
    fs = data.get("fecha_salida", "")
    if not fe or not fs:
        return jsonify({"error": "fechas requeridas"}), 400
    # Calculate nights
    from datetime import datetime
    try:
        d1 = datetime.strptime(fe, "%Y-%m-%d")
        d2 = datetime.strptime(fs, "%Y-%m-%d")
        noches = max(0, (d2 - d1).days)
    except Exception:
        noches = 0
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO alojamientos (hotel_nombre, localidad, proyecto_id, fecha_entrada, fecha_salida, num_noches, coste_total, num_personas, comentario) VALUES (?,?,?,?,?,?,?,?,?)",
        (hotel, data.get("localidad"), data.get("proyecto_id") or None, fe, fs, noches,
         data.get("coste_total"), data.get("num_personas", 1), data.get("comentario"))
    )
    conn.commit()
    return jsonify({"ok": True, "id": cur.lastrowid, "num_noches": noches})


@alojamiento_bp.put("/api/alojamientos/<int:aid>")
def api_alojamientos_update(aid):
    data = request.get_json(force=True)
    fe = data.get("fecha_entrada", "")
    fs = data.get("fecha_salida", "")
    noches = 0
    if fe and fs:
        from datetime import datetime
        try:
            noches = max(0, (datetime.strptime(fs, "%Y-%m-%d") - datetime.strptime(fe, "%Y-%m-%d")).days)
        except Exception:
            pass
    conn = get_conn()
    conn.execute(
        "UPDATE alojamientos SET hotel_nombre=?, localidad=?, proyecto_id=?, fecha_entrada=?, fecha_salida=?, num_noches=?, coste_total=?, num_personas=?, comentario=? WHERE id=?",
        (data.get("hotel_nombre"), data.get("localidad"), data.get("proyecto_id") or None,
         fe, fs, noches, data.get("coste_total"), data.get("num_personas", 1), data.get("comentario"), aid)
    )
    conn.commit()
    return jsonify({"ok": True})


@alojamiento_bp.delete("/api/alojamientos/<int:aid>")
def api_alojamientos_delete(aid):
    conn = get_conn()
    conn.execute("DELETE FROM alojamientos WHERE id=?", (aid,))
    conn.commit()
    return jsonify({"ok": True})


@alojamiento_bp.get("/api/alojamientos/historico-hoteles")
def api_alojamientos_historico():
    conn = get_conn()
    rows = conn.execute("""
        SELECT
            hotel_nombre,
            localidad,
            COUNT(*) AS num_estancias,
            MAX(fecha_entrada) AS ultima_estancia,
            CASE WHEN SUM(num_noches * num_personas) > 0
                 THEN ROUND(SUM(coste_total) / SUM(num_noches * num_personas), 2)
                 ELSE 0 END AS coste_medio_noche_persona,
            SUM(coste_total) AS coste_total,
            GROUP_CONCAT(DISTINCT proyecto_id) AS proyecto_ids
        FROM alojamientos
        GROUP BY hotel_nombre, localidad
        ORDER BY ultima_estancia DESC
    """).fetchall()

    # Resolve project names
    result = []
    for r in rows:
        d = dict(r)
        pids = [p for p in (d.get("proyecto_ids") or "").split(",") if p]
        if pids:
            names = conn.execute(
                "SELECT id, nombre FROM proyectos WHERE id IN ({})".format(",".join("?" * len(pids))),
                pids
            ).fetchall()
            d["proyectos"] = [{"id": n["id"], "nombre": n["nombre"]} for n in names]
        else:
            d["proyectos"] = []
        del d["proyecto_ids"]
        result.append(d)
    return jsonify({"hoteles": result})


@alojamiento_bp.get("/api/alojamientos/hotel-estancias")
def api_alojamientos_hotel_estancias():
    """Get all stays for a specific hotel (for the detail modal)."""
    hotel = request.args.get("hotel", "")
    if not hotel:
        return jsonify({"estancias": []})
    conn = get_conn()
    rows = conn.execute("""
        SELECT a.*, p.nombre AS proyecto_nombre
        FROM alojamientos a
        LEFT JOIN proyectos p ON p.id = a.proyecto_id
        WHERE a.hotel_nombre = ?
        ORDER BY a.fecha_entrada DESC
    """, (hotel,)).fetchall()
    return jsonify({"estancias": [dict(r) for r in rows]})
