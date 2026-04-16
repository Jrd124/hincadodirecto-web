"""
Tests unitarios para Fase 2A del módulo de maquinaria:
- Repuestos: CRUD, stock, equivalencias
- Consumo: decremento stock, stock negativo, recalculo coste incidencia
- Proveedores: CRUD, compatibilidad, búsqueda por máquina
- Vinculación repuesto-máquina: modos y validación
- Criticidad sugerida
- Resumen de flota

Ejecutar: cd interfaz_facturas && python -m unittest tests.test_maquinaria_fase2a -v
"""
from __future__ import annotations

import os
import sys
import unittest
import sqlite3
import tempfile
from datetime import date, timedelta
from pathlib import Path

# Permitir importar módulos del proyecto
_root = str(Path(__file__).resolve().parents[1])
if _root not in sys.path:
    sys.path.insert(0, _root)

# Usar base de datos temporal para tests
if "DB_PATH" not in os.environ:
    _tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    _tmp_db.close()
    os.environ["DB_PATH"] = _tmp_db.name

from core import maquinaria_db
from core import maquinaria_fase2a_db as f2a
from core.db import conectar as _conectar

try:
    from config import GESTION_DB as _db_path
    _db_path_str = str(_db_path)
except Exception:
    _db_path_str = os.environ["DB_PATH"]


def _reset_db():
    """Resetea la DB para cada test."""
    maquinaria_db._initialized = False
    f2a._initialized = False
    conn = sqlite3.connect(_db_path_str)
    conn.execute("PRAGMA writable_schema = ON")
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'"
    ).fetchall()]
    for t in tables:
        conn.execute(f"DROP TABLE IF EXISTS {t}")
    try:
        conn.execute("DELETE FROM sqlite_sequence")
    except Exception:
        pass
    conn.execute("PRAGMA writable_schema = OFF")
    conn.commit()
    conn.close()


def _init_fresh():
    """Inicializa DB fresca con tablas base + Fase 1A + Fase 2A."""
    _reset_db()
    with _conectar() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS proyectos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                codigo TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS empleados (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                apellidos TEXT,
                telefono TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL
            )
        """)
        conn.execute("INSERT INTO proyectos (nombre) VALUES ('Planta Solar Albacete')")
        conn.execute("INSERT INTO empleados (nombre, apellidos) VALUES ('Juan', 'García')")
        conn.execute("INSERT INTO usuarios (nombre) VALUES ('admin')")
    maquinaria_db.init_maquinaria_db()
    f2a.init_fase2a_db()


def _crear_maquina(nombre="HD-01", modelo="HD-60", marca="ORTECO",
                   ano=2019, criticidad="media"):
    """Helper: crea una máquina y devuelve su ID.

    crear_maquina() no incluye campos Fase 1A en el INSERT (marca, ano, criticidad),
    así que los seteamos directamente vía SQL + actualizar_maquina donde sea posible.
    """
    maq = maquinaria_db.crear_maquina({
        "nombre": nombre, "modelo": modelo,
        "internal_id": nombre, "horometro_actual": 1000,
        "horometro_inicial": 0,
    })
    mid = maq["id"]
    # actualizar_maquina soporta ano_fabricacion y criticidad pero NO marca
    update = {}
    if ano is not None:
        update["ano_fabricacion"] = ano
    if criticidad:
        update["criticidad"] = criticidad
    if update:
        maquinaria_db.actualizar_maquina(mid, update)
    # marca no está en CAMPOS_EDITABLES → SQL directo
    if marca:
        with _conectar() as conn:
            conn.execute("UPDATE maquinas SET marca = ? WHERE id = ?", [marca, mid])
    return mid


def _crear_incidencia(maquina_id, severidad="media", fecha=None):
    """Helper: crea una incidencia y devuelve su ID."""
    if not fecha:
        fecha = date.today().isoformat()
    return maquinaria_db.crear_incidencia({
        "maquina_id": maquina_id,
        "descripcion": "Fallo de prueba",
        "sintoma_inicial": "Ruido anormal",
        "severidad": severidad,
        "fecha": fecha,
        "tipo_incidencia": "averia",
    })["id"]


# ═══════════════════════════════════════════════════════════════════════════════
# ██  REPUESTOS                                                               ██
# ═══════════════════════════════════════════════════════════════════════════════

class TestRepuestosCRUD(unittest.TestCase):
    """CRUD básico de repuestos."""

    def setUp(self):
        _init_fresh()

    def test_crear_repuesto_basico(self):
        r = f2a.crear_repuesto({
            "codigo": "FH-001", "descripcion": "Filtro hidráulico",
            "criticidad": "A", "stock_actual": 5, "stock_minimo": 2,
            "precio_unitario": 85.50,
        })
        self.assertNotIn("error", r)
        self.assertEqual(r["codigo"], "FH-001")
        self.assertEqual(r["criticidad"], "A")
        self.assertEqual(r["stock_actual"], 5)
        self.assertEqual(r["precio_unitario"], 85.50)

    def test_crear_repuesto_codigo_duplicado(self):
        f2a.crear_repuesto({"codigo": "FH-001", "descripcion": "Filtro 1"})
        r2 = f2a.crear_repuesto({"codigo": "FH-001", "descripcion": "Filtro 2"})
        self.assertIn("error", r2)

    def test_crear_repuesto_sin_campos_obligatorios(self):
        r = f2a.crear_repuesto({"descripcion": "Sin código"})
        self.assertIn("error", r)
        r2 = f2a.crear_repuesto({"codigo": "X"})
        self.assertIn("error", r2)

    def test_actualizar_repuesto(self):
        r = f2a.crear_repuesto({"codigo": "FH-001", "descripcion": "Filtro"})
        updated = f2a.actualizar_repuesto(r["id"], {"precio_unitario": 90.0, "criticidad": "B"})
        self.assertEqual(updated["precio_unitario"], 90.0)
        self.assertEqual(updated["criticidad"], "B")

    def test_listar_repuestos_filtros(self):
        f2a.crear_repuesto({"codigo": "A-01", "descripcion": "Critico", "criticidad": "A"})
        f2a.crear_repuesto({"codigo": "C-01", "descripcion": "Normal", "criticidad": "C"})
        r3 = f2a.crear_repuesto({"codigo": "A-02", "descripcion": "Critico2", "criticidad": "A"})
        f2a.actualizar_repuesto(r3["id"], {"activo": 0})  # desactivar después

        todos = f2a.listar_repuestos(activo=None)
        self.assertEqual(len(todos), 3)

        solo_a = f2a.listar_repuestos(criticidad="A")
        self.assertEqual(len(solo_a), 1)  # solo el activo

        busq = f2a.listar_repuestos(busqueda="Critico", activo=None)
        self.assertEqual(len(busq), 2)


class TestRepuestosEquivalencias(unittest.TestCase):
    """Equivalencias entre repuestos."""

    def setUp(self):
        _init_fresh()

    def test_equivalencia(self):
        r1 = f2a.crear_repuesto({"codigo": "FH-001", "descripcion": "Filtro original"})
        r2 = f2a.crear_repuesto({
            "codigo": "FH-001-ALT", "descripcion": "Filtro alternativo",
            "equivalente_id": r1["id"], "notas_equivalencia": "Compatible con adaptador",
        })
        self.assertEqual(r2["equivalente_id"], r1["id"])
        self.assertEqual(r2["equivalente_codigo"], "FH-001")


# ═══════════════════════════════════════════════════════════════════════════════
# ██  VINCULACIÓN REPUESTO ↔ MÁQUINA                                         ██
# ═══════════════════════════════════════════════════════════════════════════════

class TestVinculacion(unittest.TestCase):
    """Vinculación repuesto-máquina con validación estricta."""

    def setUp(self):
        _init_fresh()
        self.maq_id = _crear_maquina()
        self.rep = f2a.crear_repuesto({"codigo": "FH-001", "descripcion": "Filtro"})

    def test_vincular_a_maquina_concreta(self):
        v = f2a.vincular_repuesto_maquina({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
        })
        self.assertTrue(v.get("ok"))

    def test_vincular_a_marca_modelo(self):
        v = f2a.vincular_repuesto_maquina({
            "repuesto_id": self.rep["id"], "marca": "ORTECO", "modelo": "HD-60",
        })
        self.assertTrue(v.get("ok"))

    def test_vincular_solo_marca(self):
        v = f2a.vincular_repuesto_maquina({
            "repuesto_id": self.rep["id"], "marca": "ORTECO",
        })
        self.assertTrue(v.get("ok"))

    def test_rechazar_mezcla_maquina_y_marca(self):
        v = f2a.vincular_repuesto_maquina({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "marca": "ORTECO",
        })
        self.assertIn("error", v)

    def test_rechazar_sin_maquina_ni_marca(self):
        v = f2a.vincular_repuesto_maquina({"repuesto_id": self.rep["id"]})
        self.assertIn("error", v)

    def test_rechazar_duplicado(self):
        f2a.vincular_repuesto_maquina({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
        })
        v2 = f2a.vincular_repuesto_maquina({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
        })
        self.assertIn("error", v2)

    def test_listar_repuestos_para_maquina(self):
        # Vínculo directo
        f2a.vincular_repuesto_maquina({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
        })
        # Vínculo por marca/modelo
        rep2 = f2a.crear_repuesto({"codigo": "AC-001", "descripcion": "Aceite"})
        f2a.vincular_repuesto_maquina({
            "repuesto_id": rep2["id"], "marca": "ORTECO", "modelo": "HD-60",
        })
        # Vínculo a otra marca (no debe aparecer)
        rep3 = f2a.crear_repuesto({"codigo": "XX-001", "descripcion": "Otro"})
        f2a.vincular_repuesto_maquina({
            "repuesto_id": rep3["id"], "marca": "LIEBHERR",
        })

        result = f2a.listar_repuestos_para_maquina(self.maq_id)
        codigos = [r["codigo"] for r in result]
        self.assertIn("FH-001", codigos)
        self.assertIn("AC-001", codigos)
        self.assertNotIn("XX-001", codigos)

    def test_desvincular(self):
        v = f2a.vincular_repuesto_maquina({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
        })
        f2a.desvincular_repuesto_maquina(v["id"])
        result = f2a.listar_repuestos_para_maquina(self.maq_id)
        self.assertEqual(len(result), 0)


# ═══════════════════════════════════════════════════════════════════════════════
# ██  CONSUMO DE REPUESTOS                                                    ██
# ═══════════════════════════════════════════════════════════════════════════════

class TestConsumoStock(unittest.TestCase):
    """Consumo de repuestos: decremento de stock y alertas."""

    def setUp(self):
        _init_fresh()
        self.maq_id = _crear_maquina()
        self.rep = f2a.crear_repuesto({
            "codigo": "FH-001", "descripcion": "Filtro",
            "criticidad": "A", "stock_actual": 3, "stock_minimo": 2,
            "precio_unitario": 100.0,
        })

    def test_consumo_basico(self):
        r = f2a.registrar_consumo({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "cantidad": 1,
        })
        self.assertTrue(r.get("ok"))
        self.assertEqual(r["stock_actual"], 2)
        self.assertIsNone(r["alerta"])  # stock 2 == stock_minimo, no alerta

    def test_consumo_precio_catalogo(self):
        """El precio se toma del catálogo si no se proporciona."""
        r = f2a.registrar_consumo({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "cantidad": 1,
        })
        consumos = f2a.listar_consumos(repuesto_id=self.rep["id"])
        self.assertEqual(consumos[0]["precio_unitario"], 100.0)
        self.assertEqual(consumos[0]["coste_total"], 100.0)

    def test_consumo_precio_override(self):
        """Se puede pasar un precio diferente al del catálogo."""
        r = f2a.registrar_consumo({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "cantidad": 2, "precio_unitario": 120.0,
        })
        consumos = f2a.listar_consumos(repuesto_id=self.rep["id"])
        self.assertEqual(consumos[0]["coste_total"], 240.0)

    def test_alerta_stock_bajo_criticidad_a(self):
        """Alerta urgente cuando stock < minimo en repuesto criticidad A."""
        r = f2a.registrar_consumo({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "cantidad": 2,  # stock queda 1, por debajo de minimo 2
        })
        self.assertIsNotNone(r["alerta"])
        self.assertEqual(r["alerta"]["tipo"], "stock_bajo")
        self.assertTrue(r["alerta"]["urgente"])  # Criticidad A

    def test_stock_negativo_permitido(self):
        """Stock negativo se permite pero genera alerta urgente."""
        r = f2a.registrar_consumo({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "cantidad": 5,  # stock queda -2
        })
        self.assertTrue(r.get("ok"))
        self.assertEqual(r["stock_actual"], -2)
        self.assertIsNotNone(r["alerta"])
        self.assertEqual(r["alerta"]["tipo"], "stock_negativo")
        self.assertTrue(r["alerta"]["urgente"])

    def test_alerta_stock_bajo_criticidad_c_no_urgente(self):
        """Para criticidad C, alerta stock_bajo no es urgente."""
        rep_c = f2a.crear_repuesto({
            "codigo": "GEN-01", "descripcion": "Genérico",
            "criticidad": "C", "stock_actual": 3, "stock_minimo": 2,
        })
        r = f2a.registrar_consumo({
            "repuesto_id": rep_c["id"], "maquina_id": self.maq_id,
            "cantidad": 2,
        })
        self.assertIsNotNone(r["alerta"])
        self.assertFalse(r["alerta"]["urgente"])

    def test_rechazar_cantidad_cero(self):
        r = f2a.registrar_consumo({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "cantidad": 0,
        })
        self.assertIn("error", r)

    def test_eliminar_consumo_restaura_stock(self):
        """Eliminar un consumo restaura el stock."""
        c = f2a.registrar_consumo({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "cantidad": 2,
        })
        # Stock ahora: 1
        f2a.eliminar_consumo(c["id"])
        rep_actual = f2a.obtener_repuesto_by_id(self.rep["id"])
        self.assertEqual(rep_actual["stock_actual"], 3)  # restaurado


class TestConsumoIncidencia(unittest.TestCase):
    """Consumo vinculado a incidencia: recalcula coste_repuesto."""

    def setUp(self):
        _init_fresh()
        self.maq_id = _crear_maquina()
        self.inc_id = _crear_incidencia(self.maq_id)
        self.rep = f2a.crear_repuesto({
            "codigo": "FH-001", "descripcion": "Filtro",
            "stock_actual": 10, "precio_unitario": 100.0,
        })

    def test_consumo_recalcula_coste_incidencia(self):
        """El coste_repuesto en la incidencia se recalcula desde consumos."""
        f2a.registrar_consumo({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "incidencia_id": self.inc_id, "cantidad": 1,
        })
        with _conectar() as conn:
            inc = conn.execute(
                "SELECT coste_repuesto FROM maquinaria_incidencias WHERE id = ?",
                [self.inc_id],
            ).fetchone()
        self.assertEqual(inc["coste_repuesto"], 100.0)

    def test_multiples_consumos_acumulan_coste(self):
        """Múltiples consumos suman correctamente en la incidencia."""
        f2a.registrar_consumo({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "incidencia_id": self.inc_id, "cantidad": 1,
        })
        rep2 = f2a.crear_repuesto({
            "codigo": "AC-001", "descripcion": "Aceite",
            "stock_actual": 50, "precio_unitario": 25.0,
        })
        f2a.registrar_consumo({
            "repuesto_id": rep2["id"], "maquina_id": self.maq_id,
            "incidencia_id": self.inc_id, "cantidad": 4,
        })
        with _conectar() as conn:
            inc = conn.execute(
                "SELECT coste_repuesto FROM maquinaria_incidencias WHERE id = ?",
                [self.inc_id],
            ).fetchone()
        self.assertEqual(inc["coste_repuesto"], 200.0)  # 100 + 4*25

    def test_eliminar_consumo_recalcula_coste(self):
        """Eliminar consumo recalcula el coste en la incidencia."""
        c1 = f2a.registrar_consumo({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "incidencia_id": self.inc_id, "cantidad": 2,
        })
        f2a.eliminar_consumo(c1["id"])
        with _conectar() as conn:
            inc = conn.execute(
                "SELECT coste_repuesto FROM maquinaria_incidencias WHERE id = ?",
                [self.inc_id],
            ).fetchone()
        self.assertEqual(inc["coste_repuesto"], 0)

    def test_consumo_sin_incidencia(self):
        """Consumo sin incidencia funciona (mantenimiento preventivo)."""
        r = f2a.registrar_consumo({
            "repuesto_id": self.rep["id"], "maquina_id": self.maq_id,
            "cantidad": 1,
        })
        self.assertTrue(r.get("ok"))


class TestAlertasStock(unittest.TestCase):
    """Listado de alertas de stock."""

    def setUp(self):
        _init_fresh()

    def test_listar_alertas_orden(self):
        """Negativos primero, luego criticidad A > B > C."""
        self.maq_id = _crear_maquina()
        r_a = f2a.crear_repuesto({
            "codigo": "A-01", "descripcion": "Crítico A",
            "criticidad": "A", "stock_actual": 1, "stock_minimo": 3,
        })
        r_c = f2a.crear_repuesto({
            "codigo": "C-01", "descripcion": "Normal C",
            "criticidad": "C", "stock_actual": 0, "stock_minimo": 1,
        })
        r_neg = f2a.crear_repuesto({
            "codigo": "NEG-01", "descripcion": "Negativo",
            "criticidad": "B", "stock_actual": -1, "stock_minimo": 2,
        })

        alertas = f2a.listar_alertas_stock()
        self.assertEqual(len(alertas), 3)
        # Negativo primero
        self.assertEqual(alertas[0]["codigo"], "NEG-01")
        # Luego criticidad A
        self.assertEqual(alertas[1]["codigo"], "A-01")
        # Luego C
        self.assertEqual(alertas[2]["codigo"], "C-01")


# ═══════════════════════════════════════════════════════════════════════════════
# ██  PROVEEDORES / TALLERES                                                  ██
# ═══════════════════════════════════════════════════════════════════════════════

class TestProveedoresCRUD(unittest.TestCase):
    """CRUD de proveedores/talleres."""

    def setUp(self):
        _init_fresh()

    def test_crear_proveedor(self):
        p = f2a.crear_proveedor({
            "nombre": "Taller Cuenca", "tipo": "taller",
            "zona": "Levante", "telefono": "969123456",
            "valoracion_interna": 4, "salida_a_obra": 1,
        })
        self.assertNotIn("error", p)
        self.assertEqual(p["tipo"], "taller")
        self.assertEqual(p["valoracion_interna"], 4)

    def test_crear_sin_nombre(self):
        p = f2a.crear_proveedor({"tipo": "proveedor"})
        self.assertIn("error", p)

    def test_actualizar_proveedor(self):
        p = f2a.crear_proveedor({"nombre": "Test", "tipo": "proveedor"})
        u = f2a.actualizar_proveedor(p["id"], {"valoracion_interna": 5, "zona": "Centro"})
        self.assertEqual(u["valoracion_interna"], 5)
        self.assertEqual(u["zona"], "Centro")

    def test_listar_proveedores_filtros(self):
        f2a.crear_proveedor({"nombre": "Taller A", "tipo": "taller"})
        f2a.crear_proveedor({"nombre": "Proveedor B", "tipo": "proveedor"})
        p3 = f2a.crear_proveedor({"nombre": "Inactivo", "tipo": "ambos"})
        f2a.actualizar_proveedor(p3["id"], {"activo": 0})  # desactivar después

        talleres = f2a.listar_proveedores(tipo="taller")
        self.assertEqual(len(talleres), 1)

        activos = f2a.listar_proveedores()
        self.assertEqual(len(activos), 2)

        todos = f2a.listar_proveedores(activo=None)
        self.assertEqual(len(todos), 3)


class TestProveedorCompatibilidad(unittest.TestCase):
    """Compatibilidad de proveedores con marcas/modelos."""

    def setUp(self):
        _init_fresh()
        self.maq_id = _crear_maquina(marca="ORTECO", modelo="HD-60")
        self.prov = f2a.crear_proveedor({"nombre": "Taller Hidráulicos", "tipo": "taller"})

    def test_agregar_compatibilidad(self):
        r = f2a.agregar_compatibilidad({
            "proveedor_id": self.prov["id"], "marca": "ORTECO",
        })
        self.assertTrue(r.get("ok"))

    def test_compatibilidad_duplicada(self):
        f2a.agregar_compatibilidad({
            "proveedor_id": self.prov["id"], "marca": "ORTECO",
        })
        r2 = f2a.agregar_compatibilidad({
            "proveedor_id": self.prov["id"], "marca": "ORTECO",
        })
        self.assertIn("error", r2)

    def test_listar_proveedores_para_maquina(self):
        f2a.agregar_compatibilidad({
            "proveedor_id": self.prov["id"], "marca": "ORTECO",
        })
        # Proveedor para otra marca
        prov2 = f2a.crear_proveedor({"nombre": "Taller Liebherr"})
        f2a.agregar_compatibilidad({
            "proveedor_id": prov2["id"], "marca": "LIEBHERR",
        })

        result = f2a.listar_proveedores_para_maquina(self.maq_id)
        nombres = [r["nombre"] for r in result]
        self.assertIn("Taller Hidráulicos", nombres)
        self.assertNotIn("Taller Liebherr", nombres)

    def test_compatibilidad_por_subsistema(self):
        f2a.agregar_compatibilidad({
            "proveedor_id": self.prov["id"], "marca": "ORTECO", "subsistema": "hidraulico",
        })
        # Sin filtro de subsistema: debe aparecer
        r1 = f2a.listar_proveedores_para_maquina(self.maq_id)
        self.assertEqual(len(r1), 1)

        # Con subsistema que coincide
        r2 = f2a.listar_proveedores_para_maquina(self.maq_id, subsistema="hidraulico")
        self.assertEqual(len(r2), 1)

        # Con subsistema que no coincide
        r3 = f2a.listar_proveedores_para_maquina(self.maq_id, subsistema="motor")
        self.assertEqual(len(r3), 0)

    def test_eliminar_compatibilidad(self):
        c = f2a.agregar_compatibilidad({
            "proveedor_id": self.prov["id"], "marca": "ORTECO",
        })
        f2a.eliminar_compatibilidad(c["id"])
        result = f2a.listar_proveedores_para_maquina(self.maq_id)
        self.assertEqual(len(result), 0)


# ═══════════════════════════════════════════════════════════════════════════════
# ██  CRITICIDAD SUGERIDA                                                     ██
# ═══════════════════════════════════════════════════════════════════════════════

class TestCriticidadSugerida(unittest.TestCase):
    """Cálculo de criticidad sugerida de máquina."""

    def setUp(self):
        _init_fresh()

    def test_maquina_sin_historial(self):
        """Máquina nueva sin incidencias → criticidad baja."""
        maq_id = _crear_maquina(ano=2024)
        r = f2a.calcular_criticidad_sugerida(maq_id)
        self.assertEqual(r["criticidad_sugerida"], "baja")
        self.assertEqual(r["detalle"]["edad_anos"], 2)  # 2026-2024

    def test_maquina_vieja_sin_incidencias(self):
        """Máquina de 15 años sin incidencias → edad aporta (15-5)*0.5 = 5 → media."""
        maq_id = _crear_maquina(ano=2011)
        r = f2a.calcular_criticidad_sugerida(maq_id)
        self.assertEqual(r["criticidad_sugerida"], "media")
        self.assertEqual(r["detalle"]["edad_anos"], 15)
        self.assertAlmostEqual(r["score"], 5.0)

    def test_maquina_con_muchas_incidencias(self):
        """Máquina con muchas incidencias recientes → alta."""
        maq_id = _crear_maquina(ano=2020)
        hoy = date.today().isoformat()
        for _ in range(8):
            _crear_incidencia(maq_id, fecha=hoy)  # 8 inc 90d
        r = f2a.calcular_criticidad_sugerida(maq_id)
        # score = 8*2 + 8*0.5 + 0 + 0 + (6-5)*0.5 = 16+4+0+0+0.5 = 20.5
        self.assertEqual(r["criticidad_sugerida"], "alta")

    def test_cambio_sugerido(self):
        """Campo cambio_sugerido indica si difiere de la actual."""
        maq_id = _crear_maquina(ano=2024, criticidad="alta")
        r = f2a.calcular_criticidad_sugerida(maq_id)
        # Score bajo, sugerida "baja", actual "alta" → cambio
        self.assertTrue(r["cambio_sugerido"])

    def test_maquina_sin_ano(self):
        """Si no hay año de fabricación, edad = 0."""
        maq_id = _crear_maquina(ano=None)
        r = f2a.calcular_criticidad_sugerida(maq_id)
        self.assertEqual(r["detalle"]["edad_anos"], 0)

    def test_consumos_repuesto_A_pesan(self):
        """Consumos de repuestos criticidad A aportan al score."""
        maq_id = _crear_maquina(ano=2024)
        rep_a = f2a.crear_repuesto({
            "codigo": "CRIT-A", "descripcion": "Crítico",
            "criticidad": "A", "stock_actual": 20,
        })
        for _ in range(3):
            f2a.registrar_consumo({
                "repuesto_id": rep_a["id"], "maquina_id": maq_id, "cantidad": 1,
            })
        r = f2a.calcular_criticidad_sugerida(maq_id)
        # 3 consumos A × 3.0 = 9 + edad (2-5)→0 = 9 → media
        self.assertEqual(r["detalle"]["consumos_repuesto_A_365d"], 3)
        self.assertGreaterEqual(r["score"], 9.0)


# ═══════════════════════════════════════════════════════════════════════════════
# ██  RESUMEN DE FLOTA                                                        ██
# ═══════════════════════════════════════════════════════════════════════════════

class TestResumenFlota(unittest.TestCase):
    """Resumen de indicadores base de la flota."""

    def setUp(self):
        _init_fresh()
        # init_maquinaria_db() seeds 8 default machines (all media criticidad)
        self.maq1 = _crear_maquina("TEST-01", criticidad="alta")
        self.maq2 = _crear_maquina("TEST-02", criticidad="media")

    def test_estructura_basica(self):
        r = f2a.resumen_flota()
        # 8 seeded + 2 created = 10
        self.assertEqual(r["total_maquinas_activas"], 10)
        self.assertIn("por_criticidad", r)
        self.assertIn("por_estado_operativo", r)
        self.assertIn("top_maquinas_coste_90d", r)
        self.assertIn("top_repuestos_cantidad_90d", r)
        self.assertIn("top_repuestos_coste_90d", r)
        self.assertIn("alertas_stock_criticidad_A", r)
        self.assertIn("costes_flota_30d", r)
        self.assertIn("costes_flota_90d", r)

    def test_desglose_criticidad(self):
        r = f2a.resumen_flota()
        # 8 seeded (media default) + 1 alta + 1 media = 9 media, 1 alta
        self.assertEqual(r["por_criticidad"].get("alta", 0), 1)
        self.assertEqual(r["por_criticidad"].get("media", 0), 9)

    def test_top_repuestos_cantidad_y_coste(self):
        rep = f2a.crear_repuesto({
            "codigo": "FH-001", "descripcion": "Filtro",
            "stock_actual": 50, "precio_unitario": 100.0,
        })
        f2a.registrar_consumo({
            "repuesto_id": rep["id"], "maquina_id": self.maq1, "cantidad": 5,
        })
        r = f2a.resumen_flota()
        self.assertEqual(len(r["top_repuestos_cantidad_90d"]), 1)
        self.assertEqual(r["top_repuestos_cantidad_90d"][0]["codigo"], "FH-001")
        self.assertEqual(len(r["top_repuestos_coste_90d"]), 1)
        self.assertEqual(r["top_repuestos_coste_90d"][0]["coste_90d"], 500.0)


if __name__ == "__main__":
    unittest.main()
