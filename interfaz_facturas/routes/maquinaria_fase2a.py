"""Rutas API — Fase 2A: Repuestos, proveedores/talleres, consumos y análisis."""
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from core import maquinaria_fase2a_db as f2a

fase2a_bp = Blueprint("maquinaria_fase2a", __name__)


# ═══════════════════════════════════════════════════════════════════════════════
# ██  REPUESTOS                                                               ██
# ═══════════════════════════════════════════════════════════════════════════════

@fase2a_bp.get("/api/maquinaria/repuestos")
def api_listar_repuestos():
    criticidad = request.args.get("criticidad")
    activo_str = request.args.get("activo")
    activo = None if activo_str is None else (activo_str == "1")
    busqueda = request.args.get("q")
    limit = request.args.get("limit", 200, type=int)
    return jsonify({"repuestos": f2a.listar_repuestos(
        criticidad=criticidad, activo=activo, busqueda=busqueda, limit=limit)})


@fase2a_bp.get("/api/maquinaria/repuestos/<int:rid>")
def api_obtener_repuesto(rid):
    rep = f2a.obtener_repuesto_by_id(rid)
    if not rep:
        return jsonify({"error": "Repuesto no encontrado"}), 404
    return jsonify(rep)


@fase2a_bp.post("/api/maquinaria/repuestos")
@login_required
def api_crear_repuesto():
    data = request.get_json(silent=True) or {}
    result = f2a.crear_repuesto(data)
    if result.get("error"):
        return jsonify(result), 400
    return jsonify(result), 201


@fase2a_bp.put("/api/maquinaria/repuestos/<int:rid>")
@login_required
def api_actualizar_repuesto(rid):
    data = request.get_json(silent=True) or {}
    result = f2a.actualizar_repuesto(rid, data)
    if result.get("error"):
        return jsonify(result), 400
    return jsonify(result)


# ═══════════════════════════════════════════════════════════════════════════════
# ██  VINCULACIÓN REPUESTO ↔ MÁQUINA                                         ██
# ═══════════════════════════════════════════════════════════════════════════════

@fase2a_bp.get("/api/maquinaria/maquinas/<int:mid>/repuestos")
def api_repuestos_maquina(mid):
    return jsonify({"repuestos": f2a.listar_repuestos_para_maquina(mid)})


@fase2a_bp.post("/api/maquinaria/repuestos/vincular")
@login_required
def api_vincular_repuesto():
    data = request.get_json(silent=True) or {}
    result = f2a.vincular_repuesto_maquina(data)
    if result.get("error"):
        return jsonify(result), 400
    return jsonify(result), 201


@fase2a_bp.delete("/api/maquinaria/repuestos/vincular/<int:vid>")
@login_required
def api_desvincular_repuesto(vid):
    return jsonify(f2a.desvincular_repuesto_maquina(vid))


# ═══════════════════════════════════════════════════════════════════════════════
# ██  CONSUMO DE REPUESTOS                                                    ██
# ═══════════════════════════════════════════════════════════════════════════════

@fase2a_bp.post("/api/maquinaria/consumos")
@login_required
def api_registrar_consumo():
    data = request.get_json(silent=True) or {}
    uid = int(current_user.id) if current_user.is_authenticated and current_user.id != "0" else None
    data["registrado_por"] = uid
    result = f2a.registrar_consumo(data)
    if result.get("error"):
        return jsonify(result), 400
    return jsonify(result), 201


@fase2a_bp.get("/api/maquinaria/consumos")
def api_listar_consumos():
    return jsonify({"consumos": f2a.listar_consumos(
        maquina_id=request.args.get("maquina_id", type=int),
        incidencia_id=request.args.get("incidencia_id", type=int),
        repuesto_id=request.args.get("repuesto_id", type=int),
        desde=request.args.get("desde"),
        limit=request.args.get("limit", 100, type=int),
    )})


@fase2a_bp.delete("/api/maquinaria/consumos/<int:cid>")
@login_required
def api_eliminar_consumo(cid):
    result = f2a.eliminar_consumo(cid)
    if result.get("error"):
        return jsonify(result), 400
    return jsonify(result)


@fase2a_bp.get("/api/maquinaria/alertas-stock")
def api_alertas_stock():
    return jsonify({"alertas": f2a.listar_alertas_stock()})


# ═══════════════════════════════════════════════════════════════════════════════
# ██  PROVEEDORES / TALLERES                                                  ██
# ═══════════════════════════════════════════════════════════════════════════════

@fase2a_bp.get("/api/maquinaria/proveedores")
def api_listar_proveedores():
    tipo = request.args.get("tipo")
    activo_str = request.args.get("activo")
    activo = None if activo_str is None else (activo_str == "1")
    busqueda = request.args.get("q")
    return jsonify({"proveedores": f2a.listar_proveedores(
        tipo=tipo, activo=activo, busqueda=busqueda)})


@fase2a_bp.get("/api/maquinaria/proveedores/<int:pid>")
def api_obtener_proveedor(pid):
    prov = f2a.obtener_proveedor(pid)
    if not prov:
        return jsonify({"error": "Proveedor no encontrado"}), 404
    return jsonify(prov)


@fase2a_bp.post("/api/maquinaria/proveedores")
@login_required
def api_crear_proveedor():
    data = request.get_json(silent=True) or {}
    result = f2a.crear_proveedor(data)
    if result.get("error"):
        return jsonify(result), 400
    return jsonify(result), 201


@fase2a_bp.put("/api/maquinaria/proveedores/<int:pid>")
@login_required
def api_actualizar_proveedor(pid):
    data = request.get_json(silent=True) or {}
    result = f2a.actualizar_proveedor(pid, data)
    if result.get("error"):
        return jsonify(result), 400
    return jsonify(result)


@fase2a_bp.post("/api/maquinaria/proveedores/compatibilidad")
@login_required
def api_agregar_compatibilidad():
    data = request.get_json(silent=True) or {}
    result = f2a.agregar_compatibilidad(data)
    if result.get("error"):
        return jsonify(result), 400
    return jsonify(result), 201


@fase2a_bp.delete("/api/maquinaria/proveedores/compatibilidad/<int:cid>")
@login_required
def api_eliminar_compatibilidad(cid):
    return jsonify(f2a.eliminar_compatibilidad(cid))


@fase2a_bp.get("/api/maquinaria/maquinas/<int:mid>/proveedores")
def api_proveedores_maquina(mid):
    subsistema = request.args.get("subsistema")
    return jsonify({"proveedores": f2a.listar_proveedores_para_maquina(
        mid, subsistema=subsistema)})


# ═══════════════════════════════════════════════════════════════════════════════
# ██  ANÁLISIS                                                                ██
# ═══════════════════════════════════════════════════════════════════════════════

@fase2a_bp.get("/api/maquinaria/maquinas/<int:mid>/criticidad-sugerida")
def api_criticidad_sugerida(mid):
    result = f2a.calcular_criticidad_sugerida(mid)
    if result.get("error"):
        return jsonify(result), 404
    return jsonify(result)


@fase2a_bp.get("/api/maquinaria/resumen-flota")
def api_resumen_flota():
    return jsonify(f2a.resumen_flota())
