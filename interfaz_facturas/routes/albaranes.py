# -*- coding: utf-8 -*-
"""Rutas API para el módulo de Albaranes."""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import time

from flask import Blueprint, jsonify, request
from flask_login import login_required

from core import albaranes_db

logger = logging.getLogger("erp")
albaranes_bp = Blueprint("albaranes", __name__)


@albaranes_bp.get("/api/albaranes")
@login_required
def api_listar_albaranes():
    albaranes_db.init_albaranes_db()
    proveedor = request.args.get("proveedor", "").strip() or None
    estado = request.args.get("estado", "").strip() or None
    fecha_desde = request.args.get("fecha_desde", "").strip() or None
    fecha_hasta = request.args.get("fecha_hasta", "").strip() or None
    proyecto_id = request.args.get("proyecto_id", type=int)
    rows = albaranes_db.listar_albaranes(
        proveedor=proveedor, estado=estado,
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
        proyecto_id=proyecto_id,
    )
    return jsonify({"albaranes": rows})


@albaranes_bp.get("/api/albaranes/<int:albaran_id>")
@login_required
def api_obtener_albaran(albaran_id):
    row = albaranes_db.obtener_albaran(albaran_id)
    if not row:
        return jsonify({"error": "Albarán no encontrado"}), 404
    return jsonify(row)


@albaranes_bp.post("/api/albaranes")
@login_required
def api_crear_albaran():
    data = request.get_json(silent=True) or {}
    if not data.get("numero_albaran") and not data.get("proveedor"):
        return jsonify({"error": "Se requiere al menos número o proveedor"}), 400
    row = albaranes_db.crear_albaran(data)
    return jsonify(row), 201


@albaranes_bp.put("/api/albaranes/<int:albaran_id>")
@login_required
def api_actualizar_albaran(albaran_id):
    data = request.get_json(silent=True) or {}
    row = albaranes_db.actualizar_albaran(albaran_id, data)
    if not row:
        return jsonify({"error": "Albarán no encontrado"}), 404
    return jsonify(row)


@albaranes_bp.delete("/api/albaranes/<int:albaran_id>")
@login_required
def api_eliminar_albaran(albaran_id):
    ok = albaranes_db.eliminar_albaran(albaran_id)
    if not ok:
        return jsonify({"error": "No encontrado"}), 404
    return jsonify({"ok": True})


@albaranes_bp.get("/api/albaranes/sin-factura")
@login_required
def api_albaranes_sin_factura():
    proveedor = request.args.get("proveedor", "").strip() or None
    rows = albaranes_db.albaranes_sin_factura(proveedor=proveedor)
    return jsonify({"albaranes": rows})


@albaranes_bp.post("/api/albaranes/vincular-factura")
@login_required
def api_vincular_factura():
    """Vincula albaranes a una factura y marca la factura como pagada si corresponde."""
    data = request.get_json(silent=True) or {}
    factura_id = data.get("factura_id")
    albaran_ids = data.get("albaran_ids") or []
    if not factura_id or not albaran_ids:
        return jsonify({"error": "factura_id y albaran_ids requeridos"}), 400

    n = albaranes_db.vincular_a_factura([int(i) for i in albaran_ids], int(factura_id))

    # Check if albaranes cover the invoice total → auto-mark as pagada
    from routes.helpers import _parse_importe_es
    from core.db import get_conn
    conn = get_conn()
    try:
        fac = conn.execute("SELECT total_a_pagar FROM facturas_proveedor WHERE id = ?", (factura_id,)).fetchone()
        total_fac = _parse_importe_es(fac["total_a_pagar"]) if fac else 0
        albs = conn.execute(
            "SELECT COALESCE(SUM(total), 0) as t FROM albaranes WHERE factura_id = ?", (factura_id,)
        ).fetchone()
        total_albs = float(albs["t"] or 0)
    finally:
        conn.close()

    estado_pago = None
    if total_fac > 0 and total_albs >= total_fac - 1.0:
        estado_pago = "pagada"
    elif total_albs > 0.01:
        estado_pago = "parcial"

    if estado_pago:
        from core.db import conectar
        with conectar() as conn:
            conn.execute(
                "UPDATE facturas_proveedor SET estado_pago = ? WHERE id = ?",
                (estado_pago, factura_id),
            )

    return jsonify({
        "ok": True,
        "vinculados": n,
        "estado_pago": estado_pago,
        "mensaje": f"{n} albaranes vinculados" + (f". Factura marcada como {estado_pago}." if estado_pago else "."),
    })


@albaranes_bp.get("/api/albaranes/sin-conciliar")
@login_required
def api_albaranes_sin_conciliar():
    rows = albaranes_db.albaranes_sin_conciliar()
    return jsonify({"albaranes": rows})


@albaranes_bp.post("/api/albaranes/conciliar-banco")
@login_required
def api_conciliar_albaran_banco():
    """Concilia albaranes con un movimiento bancario."""
    data = request.get_json(silent=True) or {}
    movimiento_id = data.get("movimiento_id")
    albaranes_data = data.get("albaranes", [])
    if movimiento_id is None or not albaranes_data:
        return jsonify({"error": "movimiento_id y albaranes requeridos"}), 400

    albaran_ids = [int(a.get("albaran_id") or a) for a in albaranes_data if a]
    n = albaranes_db.conciliar_albaranes(albaran_ids, str(movimiento_id))

    # Mark movement as conciliado in movimientos.db
    try:
        import sqlite3
        from config import MOVIMIENTOS_DB
        from datetime import datetime
        conn = sqlite3.connect(str(MOVIMIENTOS_DB))
        try:
            cols = {r[1] for r in conn.execute("PRAGMA table_info(movimientos)").fetchall()}
            if "albaran_ids" not in cols:
                conn.execute("ALTER TABLE movimientos ADD COLUMN albaran_ids TEXT")
            now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            import json as _json
            conn.execute(
                "UPDATE movimientos SET albaran_ids = ?, conciliado_at = ? WHERE id = ?",
                (_json.dumps(albaran_ids), now, int(movimiento_id)),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("No se pudo marcar movimiento %s: %s", movimiento_id, exc)

    # Recalculate invoice payment status if any albarán is linked to an invoice
    _recalcular_facturas_de_albaranes(albaran_ids)

    return jsonify({"ok": True, "conciliados": n, "mensaje": f"{n} albarán(es) conciliado(s)."})


@albaranes_bp.post("/api/albaranes/desconciliar-banco")
@login_required
def api_desconciliar_albaran_banco():
    """Desconcilia albaranes de un movimiento bancario."""
    data = request.get_json(silent=True) or {}
    movimiento_id = data.get("movimiento_id")
    if movimiento_id is None:
        return jsonify({"error": "movimiento_id requerido"}), 400

    n = albaranes_db.desconciliar_albaranes_por_movimiento(str(movimiento_id))

    # Clear movement conciliation
    try:
        import sqlite3
        from config import MOVIMIENTOS_DB
        conn = sqlite3.connect(str(MOVIMIENTOS_DB))
        try:
            conn.execute(
                "UPDATE movimientos SET albaran_ids = NULL, conciliado_at = NULL WHERE id = ?",
                (int(movimiento_id),),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("No se pudo limpiar movimiento %s: %s", movimiento_id, exc)

    return jsonify({"ok": True, "desconciliados": n, "mensaje": "Albaranes desvinculados."})


def _recalcular_facturas_de_albaranes(albaran_ids: list[int]):
    """Recalcula estado_pago de facturas vinculadas a los albaranes dados."""
    from routes.helpers import _parse_importe_es
    from core.db import get_conn, conectar
    conn = get_conn()
    try:
        placeholders = ",".join("?" for _ in albaran_ids)
        factura_ids = conn.execute(
            f"SELECT DISTINCT factura_id FROM albaranes WHERE factura_id IS NOT NULL AND id IN ({placeholders})",
            albaran_ids,
        ).fetchall()
    finally:
        conn.close()
    for row in factura_ids:
        fid = row[0]
        conn = get_conn()
        try:
            fac = conn.execute("SELECT total_a_pagar FROM facturas_proveedor WHERE id = ?", (fid,)).fetchone()
            total_fac = _parse_importe_es(fac["total_a_pagar"]) if fac else 0
            albs = conn.execute(
                "SELECT COALESCE(SUM(total), 0) as t FROM albaranes WHERE factura_id = ?"
                " AND (metodo_pago IN ('tarjeta','transferencia','efectivo') OR conciliado = 1)",
                (fid,),
            ).fetchone()
            total_pagado = float(albs["t"] or 0)
        finally:
            conn.close()
        if total_fac > 0 and total_pagado >= total_fac - 1.0:
            estado = "pagada"
        elif total_pagado > 0.01:
            estado = "parcial"
        else:
            estado = "pendiente"
        with conectar() as conn2:
            conn2.execute("UPDATE facturas_proveedor SET estado_pago = ? WHERE id = ?", (estado, fid))


@albaranes_bp.post("/api/albaranes/procesar-imagen")
@login_required
def api_procesar_imagen_albaran():
    """Procesa una foto de albarán con GPT-4 Vision."""
    from config import client as openai_client, DATOS_DIR

    if not openai_client:
        return jsonify({"error": "OpenAI no configurado"}), 500

    archivo = request.files.get("imagen")
    if not archivo or not archivo.filename:
        return jsonify({"error": "No se envió imagen"}), 400

    contenido = archivo.read()
    b64 = base64.b64encode(contenido).decode("utf-8")
    ext = archivo.filename.rsplit(".", 1)[-1].lower() if "." in archivo.filename else "jpeg"
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg")

    prompt = """Eres un experto en leer albaranes de compra de materiales de construcción y suministros industriales.
Extrae los siguientes campos del albarán fotografiado. Devuelve SOLO JSON válido sin markdown:
{
    "numero_albaran": "nº del albarán o ticket",
    "fecha": "YYYY-MM-DD",
    "proveedor": "nombre del proveedor/tienda",
    "lineas": [
        {"descripcion": "material/producto", "cantidad": 1, "precio_unitario": 10.50, "total_linea": 10.50}
    ],
    "base_imponible": 100.00,
    "iva": 21.00,
    "total": 121.00,
    "confianza": "alta|media|baja"
}
Notas:
- Si no puedes leer un campo, pon null
- El total debe incluir IVA
- Si hay múltiples líneas, listarlas todas
- La fecha puede estar en cualquier formato, conviértela a YYYY-MM-DD"""

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "high"}},
                ],
            }],
            max_tokens=1000,
            temperature=0,
        )
        texto = response.choices[0].message.content.strip()
        from core.llm import limpiar_json_respuesta
        texto = limpiar_json_respuesta(texto)
        datos = json.loads(texto)

        # Save image
        nombre = f"albaran_{int(time.time())}_{hashlib.md5(contenido).hexdigest()[:8]}.{ext}"
        ruta_subidas = DATOS_DIR / "subidas"
        ruta_subidas.mkdir(parents=True, exist_ok=True)
        (ruta_subidas / nombre).write_bytes(contenido)
        datos["imagen_archivo"] = "subidas/" + nombre

        return jsonify(datos)
    except json.JSONDecodeError:
        return jsonify({"error": "No se pudo interpretar el albarán"}), 422
    except Exception as e:
        logger.exception("Error OCR albarán: %s", e)
        return jsonify({"error": str(e)}), 500
