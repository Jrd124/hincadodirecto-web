#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════╗
║  SCRIPT DE VALIDACIÓN MANUAL — FASE 1A                             ║
║  Módulo Maquinaria, Hincado Directo ERP                            ║
║                                                                     ║
║  Ejecutar sobre una COPIA de la BD real:                            ║
║    cp data/gestion.db data/gestion_backup_fase1a.db                ║
║    python scripts/validacion_manual_fase1a.py                       ║
║                                                                     ║
║  Cada paso imprime PASS/FAIL con explicación.                       ║
║  NO modifica la BD original — usa copia temporal.                   ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import os
import sys
import shutil
import sqlite3
import tempfile
from pathlib import Path
from datetime import datetime, timedelta

# ── Setup: copiar BD a temporal ──
_root = str(Path(__file__).resolve().parents[1])
if _root not in sys.path:
    sys.path.insert(0, _root)

# Buscar BD real
ORIG_DB = Path(_root) / "data" / "gestion.db"
if not ORIG_DB.exists():
    print(f"⚠  No se encuentra {ORIG_DB}")
    print("   Este script debe ejecutarse desde interfaz_facturas/")
    print("   con la BD real en data/gestion.db")
    print("   Usando BD temporal vacía para demo...")
    ORIG_DB = None

# Crear copia temporal
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
if ORIG_DB:
    shutil.copy2(ORIG_DB, _tmp.name)
    print(f"✓ Copia de BD creada: {_tmp.name}")
else:
    print(f"✓ BD temporal vacía: {_tmp.name}")

# Forzar usar copia temporal
os.environ["DB_PATH"] = _tmp.name

# Patch config si es necesario
try:
    from config import GESTION_DB
    import config
    config.GESTION_DB = Path(_tmp.name)
except ImportError:
    import types
    config = types.ModuleType('config')
    config.GESTION_DB = Path(_tmp.name)
    sys.modules['config'] = config

from core import maquinaria_db
from core.db import conectar

# ── Helpers ──
_pass = 0
_fail = 0
_step = 0

def step(desc):
    global _step
    _step += 1
    print(f"\n{'='*70}")
    print(f"  PASO {_step}: {desc}")
    print(f"{'='*70}")

def check(condition, msg_pass, msg_fail):
    global _pass, _fail
    if condition:
        _pass += 1
        print(f"  ✅ PASS: {msg_pass}")
    else:
        _fail += 1
        print(f"  ❌ FAIL: {msg_fail}")

def ensure_base_data():
    """Crea datos mínimos si la BD está vacía."""
    with conectar() as conn:
        # Proyectos
        if not conn.execute("SELECT 1 FROM sqlite_master WHERE name='proyectos'").fetchone():
            conn.execute("CREATE TABLE proyectos (id INTEGER PRIMARY KEY, nombre TEXT)")
        if not conn.execute("SELECT 1 FROM proyectos LIMIT 1").fetchone():
            conn.execute("INSERT INTO proyectos (id, nombre) VALUES (1, 'Planta Solar Albacete')")
            conn.execute("INSERT INTO proyectos (id, nombre) VALUES (2, 'Planta Solar Murcia')")
        # Empleados
        if not conn.execute("SELECT 1 FROM sqlite_master WHERE name='empleados'").fetchone():
            conn.execute("CREATE TABLE empleados (id INTEGER PRIMARY KEY, nombre TEXT, apellidos TEXT, telefono TEXT)")
        if not conn.execute("SELECT 1 FROM empleados LIMIT 1").fetchone():
            conn.execute("INSERT INTO empleados (id, nombre, apellidos) VALUES (1, 'Juan', 'García')")
        # Usuarios
        if not conn.execute("SELECT 1 FROM sqlite_master WHERE name='usuarios'").fetchone():
            conn.execute("CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT)")
        if not conn.execute("SELECT 1 FROM usuarios LIMIT 1").fetchone():
            conn.execute("INSERT INTO usuarios (id, nombre) VALUES (1, 'admin')")

# ══════════════════════════════════════════════════════════════════════
# EJECUCIÓN
# ══════════════════════════════════════════════════════════════════════
print("\n" + "▓"*70)
print("  VALIDACIÓN MANUAL — FASE 1A — MÓDULO MAQUINARIA")
print("▓"*70)

# Inicializar
ensure_base_data()
maquinaria_db.init_maquinaria_db()
print("\n✓ Migración ejecutada correctamente sobre la copia de BD")

# ── Verificar esquema ──
step("Verificar esquema migrado")
with conectar() as conn:
    maq_cols = [r[1] for r in conn.execute("PRAGMA table_info(maquinas)").fetchall()]
    inc_cols = [r[1] for r in conn.execute("PRAGMA table_info(maquinaria_incidencias)").fetchall()]

    check("estado_operativo" in maq_cols, "maquinas.estado_operativo existe", "FALTA maquinas.estado_operativo")
    check("operario_habitual_id" in maq_cols, "maquinas.operario_habitual_id existe", "FALTA maquinas.operario_habitual_id")
    check("override_estado_manual" in maq_cols, "maquinas.override_estado_manual existe", "FALTA override_estado_manual")
    check("sintoma_inicial" in inc_cols, "incidencias.sintoma_inicial existe", "FALTA sintoma_inicial")
    check("horas_downtime" in inc_cols, "incidencias.horas_downtime existe", "FALTA horas_downtime")
    check("es_historico" in inc_cols, "incidencias.es_historico existe", "FALTA es_historico")

    # Verificar que el CHECK viejo ya no está
    table_sql = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='maquinaria_incidencias'"
    ).fetchone()[0]
    check(
        "estado IN ('abierta','en_curso','cerrada')" not in table_sql,
        "CHECK constraint antiguo eliminado",
        "CHECK constraint antiguo SIGUE PRESENTE — la migración no se aplicó"
    )

    # Tablas nuevas
    asig_exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE name='maquinaria_asignaciones_obra'"
    ).fetchone()
    trans_exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE name='maquinaria_incidencia_transiciones'"
    ).fetchone()
    check(asig_exists, "Tabla maquinaria_asignaciones_obra existe", "FALTA tabla asignaciones")
    check(trans_exists, "Tabla maquinaria_incidencia_transiciones existe", "FALTA tabla transiciones")

# ── Obtener una máquina para tests ──
maquinas = maquinaria_db.listar_maquinas()
if not maquinas:
    print("\n⚠  No hay máquinas en la BD. Creando una de prueba...")
    maquinaria_db.crear_maquina({
        "internal_id": "TEST-001",
        "nombre": "Máquina Test Validación",
        "modelo": "ORTECO HD1000",
    })
    maquinas = maquinaria_db.listar_maquinas()

MID = maquinas[0]["id"]
print(f"\n  Máquina de prueba: id={MID}, nombre={maquinas[0].get('nombre', '?')}")

# ── P1: Crear incidencia nueva ──
step("Crear incidencia nueva")
inc = maquinaria_db.crear_incidencia({
    "maquina_id": MID,
    "sintoma_inicial": "[VALIDACION] Fuga de aceite en latiguillo principal",
    "tipo_incidencia": "averia",
    "severidad": "alta",
    "maquina_siguio_operando": 0,
})
check("id" in inc, f"Incidencia creada con id={inc.get('id')}", "Error al crear incidencia")
check(inc.get("estado") == "abierta", "Estado inicial = abierta", f"Estado incorrecto: {inc.get('estado')}")
check(inc.get("sintoma_inicial") is not None, "sintoma_inicial guardado", "sintoma_inicial perdido")
INC_ID = inc["id"]

# ── P2: Mover incidencia entre estados ──
step("Mover incidencia entre estados (flujo completo)")

# abierta → en_diagnostico
r = maquinaria_db.actualizar_incidencia(INC_ID, {"estado": "en_diagnostico"})
check(r.get("estado") == "en_diagnostico", "abierta → en_diagnostico OK", f"Transición falló: {r}")

# en_diagnostico → pendiente_pieza
r = maquinaria_db.actualizar_incidencia(INC_ID, {"estado": "pendiente_pieza"})
check(r.get("estado") == "pendiente_pieza", "en_diagnostico → pendiente_pieza OK", f"Transición falló: {r}")

# pendiente_pieza → en_reparacion
r = maquinaria_db.actualizar_incidencia(INC_ID, {"estado": "en_reparacion"})
check(r.get("estado") == "en_reparacion", "pendiente_pieza → en_reparacion OK", f"Transición falló: {r}")

# Transición inválida: en_reparacion → abierta
r_inv = maquinaria_db.actualizar_incidencia(INC_ID, {"estado": "abierta"})
check("error" in r_inv, "en_reparacion → abierta RECHAZADA correctamente", "Transición inválida NO fue rechazada")

# en_reparacion → resuelta
r = maquinaria_db.actualizar_incidencia(INC_ID, {
    "estado": "resuelta",
    "accion_tomada": "Latiguillo hidráulico sustituido",
    "causa_raiz": "Desgaste por fatiga",
})
check(r.get("estado") == "resuelta", "en_reparacion → resuelta OK", f"Transición falló: {r}")

# ── P3: Validar precedencia de estado operativo ──
step("Validar precedencia de estado operativo")
maq = maquinaria_db.obtener_maquina(MID)
print(f"  Estado operativo actual: {maq.get('estado_operativo')}")
# Con incidencia alta + no sigue operando, debe estar en parada_* o peor
estado_op = maq.get("estado_operativo")
estados_parada = {"parada_diagnostico", "parada_pendiente_pieza", "en_reparacion"}
check(
    estado_op in estados_parada or estado_op == "parada_diagnostico",
    f"Estado operativo escalado a {estado_op} (incidencia alta, máquina parada)",
    f"Estado operativo inesperado: {estado_op} — debería estar en parada"
)

# ── P4: Cerrar incidencia con downtime ──
step("Cerrar incidencia con downtime y verificar auto-cálculo")
parada = (datetime.now() - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%S")
vuelta = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

r = maquinaria_db.actualizar_incidencia(INC_ID, {
    "estado": "cerrada_validada",
    "fecha_hora_parada": parada,
    "fecha_hora_vuelta": vuelta,
    "motivo_downtime": "averia",
})
check(r.get("estado") == "cerrada_validada", "resuelta → cerrada_validada OK", f"Error: {r}")
check(
    r.get("horas_downtime") and r["horas_downtime"] > 40,
    f"horas_downtime auto-calculado = {r.get('horas_downtime'):.1f}h",
    f"horas_downtime incorrecto: {r.get('horas_downtime')}"
)
check(
    r.get("coste_downtime") and r["coste_downtime"] > 0,
    f"coste_downtime auto-calculado = {r.get('coste_downtime'):.0f} EUR",
    f"coste_downtime incorrecto: {r.get('coste_downtime')}"
)

# ── P5: Cambiar máquina de obra y verificar historial ──
step("Cambiar máquina de obra y comprobar historial de asignación")

maquinaria_db.actualizar_maquina(MID, {"proyecto_id": 1})
maquinaria_db.actualizar_maquina(MID, {"proyecto_id": 2})

asigs = maquinaria_db.listar_asignaciones_obra(MID)
check(len(asigs) >= 2, f"Hay {len(asigs)} asignaciones registradas", "Faltan asignaciones")
abiertas = [a for a in asigs if a.get("fecha_fin") is None]
cerradas = [a for a in asigs if a.get("fecha_fin") is not None]
check(len(abiertas) == 1, "Solo 1 asignación abierta (la actual)", f"Abiertas: {len(abiertas)}")
check(len(cerradas) >= 1, f"{len(cerradas)} asignación(es) cerrada(s)", "No hay asignaciones cerradas")
if abiertas:
    check(abiertas[0].get("proyecto_id") == 2, "Asignación actual = proyecto 2", f"Proyecto incorrecto: {abiertas[0].get('proyecto_id')}")

# ── P6: Comprobar KPIs de disponibilidad ──
step("Comprobar KPIs de disponibilidad")
disp = maquinaria_db.calcular_disponibilidad(MID)
check("error" not in disp, "Disponibilidad calculada sin error", f"Error: {disp}")
check(
    disp.get("30d", {}).get("horas_downtime", 0) > 0,
    f"30d downtime = {disp.get('30d', {}).get('horas_downtime', 0):.1f}h",
    "No se detectó downtime en últimos 30 días"
)
check(
    disp.get("30d", {}).get("coste_downtime", 0) > 0,
    f"30d coste = {disp.get('30d', {}).get('coste_downtime', 0):.0f} EUR",
    "No se detectó coste en últimos 30 días"
)

# ── P7: Incidencias históricas no contaminan estado ──
step("Incidencias históricas no contaminan estado operativo")
maq_antes = maquinaria_db.obtener_maquina(MID)
estado_antes = maq_antes.get("estado_operativo")
print(f"  Estado operativo antes: {estado_antes}")

inc_hist = maquinaria_db.crear_incidencia({
    "maquina_id": MID,
    "sintoma_inicial": "[HISTORICO] Motor fundido en 2024",
    "severidad": "seguridad",
    "maquina_siguio_operando": 0,
    "es_historico": 1,
    "fuente_dato": "factura_taller_2024",
})
check("id" in inc_hist, f"Incidencia histórica creada (id={inc_hist.get('id')})", "Error creando histórica")

maq_despues = maquinaria_db.obtener_maquina(MID)
estado_despues = maq_despues.get("estado_operativo")
print(f"  Estado operativo después: {estado_despues}")
check(
    estado_despues == estado_antes,
    "Estado operativo NO cambió con incidencia histórica (RN-06)",
    f"Estado CAMBIÓ de {estado_antes} a {estado_despues} — RN-06 FALLA"
)

# ── P8: Override manual del estado operativo ──
step("Override manual del estado operativo")
result = maquinaria_db.actualizar_estado_operativo_manual(MID, "operativa", usuario_id=1)
check(
    result.get("estado_operativo") == "operativa",
    "Override manual a 'operativa' aceptado",
    f"Override falló: {result}"
)
check(
    result.get("override_estado_manual") == 1,
    "Flag override_estado_manual = 1",
    f"Flag incorrecto: {result.get('override_estado_manual')}"
)

# Estado inválido rechazado
result_inv = maquinaria_db.actualizar_estado_operativo_manual(MID, "inventado")
check("error" in result_inv, "Estado inválido rechazado correctamente", "Estado inválido NO fue rechazado")

# ── Verificar log de transiciones ──
step("Verificar log de transiciones de incidencia")
with conectar() as conn:
    trans = conn.execute(
        "SELECT * FROM maquinaria_incidencia_transiciones WHERE incidencia_id = ? ORDER BY id",
        [INC_ID],
    ).fetchall()
print(f"  Transiciones registradas para incidencia {INC_ID}: {len(trans)}")
check(len(trans) >= 5, f"{len(trans)} transiciones registradas (esperadas ≥5)", f"Solo {len(trans)} transiciones")

# ── Retrocompat: 'cerrada' como alias ──
step("Retrocompatibilidad: 'cerrada' como alias de 'cerrada_validada'")
inc2 = maquinaria_db.crear_incidencia({
    "maquina_id": MID,
    "sintoma_inicial": "[VALIDACION] Test retrocompat",
    "severidad": "baja",
    "maquina_siguio_operando": 1,
})
maquinaria_db.actualizar_incidencia(inc2["id"], {"estado": "en_diagnostico"})
maquinaria_db.actualizar_incidencia(inc2["id"], {"estado": "en_reparacion"})
maquinaria_db.actualizar_incidencia(inc2["id"], {"estado": "resuelta", "accion_tomada": "Test"})
r_retro = maquinaria_db.actualizar_incidencia(inc2["id"], {"estado": "cerrada"})
check(
    r_retro.get("estado") == "cerrada_validada",
    "'cerrada' mapeada a 'cerrada_validada' correctamente",
    f"Estado resultante: {r_retro.get('estado')}"
)

# ══════════════════════════════════════════════════════════════════════
# RESUMEN
# ══════════════════════════════════════════════════════════════════════
print("\n" + "▓"*70)
print(f"  RESULTADO: {_pass} PASS / {_fail} FAIL de {_pass + _fail} verificaciones")
print("▓"*70)

if _fail == 0:
    print("\n  ✅ TODAS LAS VALIDACIONES SUPERADAS — Fase 1A lista para revisión")
else:
    print(f"\n  ⚠  HAY {_fail} FALLOS — revisar antes de continuar")

# Limpiar
print(f"\n  BD temporal: {_tmp.name}")
print("  (No se ha modificado la BD original)")

sys.exit(0 if _fail == 0 else 1)
