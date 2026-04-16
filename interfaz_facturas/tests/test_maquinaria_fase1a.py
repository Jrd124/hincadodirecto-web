"""
Tests unitarios para Fase 1A del módulo de maquinaria:
- Migración de esquema (columnas nuevas)
- Reglas de negocio (RN-01 a RN-07)
- Matriz de precedencia de estado operativo
- KPIs de disponibilidad
- Asignaciones máquina-obra
- Transiciones de estado de incidencia

Ejecutar: cd interfaz_facturas && python -m pytest tests/test_maquinaria_fase1a.py -v
  o bien: python -m unittest tests.test_maquinaria_fase1a -v
"""
from __future__ import annotations

import os
import sys
import unittest
import sqlite3
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

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
from core.db import conectar as _conectar

# Ruta real de la BD (puede venir del runner o del propio módulo)
try:
    from config import GESTION_DB as _db_path
    _db_path_str = str(_db_path)
except Exception:
    _db_path_str = os.environ["DB_PATH"]


def _reset_db():
    """Resetea la DB para cada test."""
    maquinaria_db._initialized = False
    conn = sqlite3.connect(_db_path_str)
    conn.execute("PRAGMA writable_schema = ON")
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'"
    ).fetchall()]
    for t in tables:
        conn.execute(f"DROP TABLE IF EXISTS {t}")
    conn.execute("DELETE FROM sqlite_sequence") if conn.execute(
        "SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'"
    ).fetchone() else None
    conn.execute("PRAGMA writable_schema = OFF")
    conn.commit()
    conn.close()


def _init_fresh():
    """Inicializa DB fresca con tablas base necesarias."""
    _reset_db()
    # Crear tablas mínimas que maquinaria_db espera (proyectos, empleados, usuarios)
    with _conectar() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS proyectos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL
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
        conn.execute("INSERT INTO proyectos (nombre) VALUES ('Planta Solar Murcia')")
        conn.execute("INSERT INTO empleados (nombre, apellidos) VALUES ('Juan', 'García')")
        conn.execute("INSERT INTO empleados (nombre, apellidos) VALUES ('Pedro', 'López')")
        conn.execute("INSERT INTO usuarios (nombre) VALUES ('admin')")
    maquinaria_db.init_maquinaria_db()


class TestEsquemaFase1A(unittest.TestCase):
    """Verifica que las migraciones del esquema se aplican correctamente."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def _get_columns(self, table):
        with _conectar() as conn:
            return [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]

    def test_maquinas_nuevas_columnas(self):
        cols = self._get_columns("maquinas")
        for expected in ("estado_operativo", "tipo_maquina", "ano_fabricacion",
                         "matricula", "criticidad", "operario_habitual_id",
                         "override_estado_manual", "fuente_dato"):
            self.assertIn(expected, cols, f"Falta columna {expected} en maquinas")

    def test_incidencias_nuevas_columnas(self):
        cols = self._get_columns("maquinaria_incidencias")
        for expected in ("hora_deteccion", "horometro_deteccion", "tipo_incidencia",
                         "subsistema", "sintoma_inicial", "maquina_siguio_operando",
                         "fecha_hora_parada", "fecha_hora_vuelta", "horas_downtime",
                         "motivo_downtime", "causa_raiz", "accion_tomada",
                         "coste_repuesto", "coste_servicio", "coste_downtime",
                         "es_repetida", "leccion_aprendida", "accion_preventiva",
                         "es_historico", "fuente_dato"):
            self.assertIn(expected, cols, f"Falta columna {expected} en incidencias")

    def test_tabla_asignaciones_obra_existe(self):
        cols = self._get_columns("maquinaria_asignaciones_obra")
        self.assertIn("maquina_id", cols)
        self.assertIn("proyecto_id", cols)
        self.assertIn("fecha_inicio", cols)
        self.assertIn("fecha_fin", cols)
        self.assertIn("operario_id", cols)

    def test_tabla_transiciones_existe(self):
        cols = self._get_columns("maquinaria_incidencia_transiciones")
        self.assertIn("incidencia_id", cols)
        self.assertIn("estado_anterior", cols)
        self.assertIn("estado_nuevo", cols)
        self.assertIn("automatico", cols)

    def test_constantes_estados(self):
        self.assertEqual(len(maquinaria_db.ESTADO_OPERATIVO_PRIORIDAD), 7)
        self.assertEqual(len(maquinaria_db.ESTADOS_INCIDENCIA_VALIDOS), 7)
        # decomisionada es la más grave (prioridad 1)
        self.assertEqual(maquinaria_db.ESTADO_OPERATIVO_PRIORIDAD["decomisionada"], 1)
        self.assertEqual(maquinaria_db.ESTADO_OPERATIVO_PRIORIDAD["operativa"], 7)


class TestTransicionesIncidencia(unittest.TestCase):
    """Verifica las transiciones de estado de incidencias."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def _crear_incidencia_test(self, **kwargs):
        defaults = {
            "maquina_id": 1,
            "sintoma_inicial": "Fuga de aceite en latiguillo",
            "tipo_incidencia": "averia",
            "severidad": "alta",
            "maquina_siguio_operando": 0,
        }
        defaults.update(kwargs)
        return maquinaria_db.crear_incidencia(defaults)

    def test_crear_incidencia_estado_abierta(self):
        inc = self._crear_incidencia_test()
        self.assertEqual(inc["estado"], "abierta")
        self.assertIsNotNone(inc["sintoma_inicial"])

    def test_transicion_abierta_a_en_diagnostico(self):
        inc = self._crear_incidencia_test()
        result = maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_diagnostico"})
        self.assertEqual(result["estado"], "en_diagnostico")

    def test_transicion_invalida_abierta_a_cerrada_validada(self):
        inc = self._crear_incidencia_test()
        result = maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "cerrada_validada"})
        self.assertIn("error", result)

    def test_flujo_completo(self):
        inc = self._crear_incidencia_test()
        iid = inc["id"]

        # abierta → en_diagnostico
        r = maquinaria_db.actualizar_incidencia(iid, {"estado": "en_diagnostico"})
        self.assertEqual(r["estado"], "en_diagnostico")

        # en_diagnostico → pendiente_pieza
        r = maquinaria_db.actualizar_incidencia(iid, {"estado": "pendiente_pieza"})
        self.assertEqual(r["estado"], "pendiente_pieza")

        # pendiente_pieza → en_reparacion
        r = maquinaria_db.actualizar_incidencia(iid, {"estado": "en_reparacion"})
        self.assertEqual(r["estado"], "en_reparacion")

        # en_reparacion → resuelta
        r = maquinaria_db.actualizar_incidencia(iid, {
            "estado": "resuelta",
            "accion_tomada": "Se cambió latiguillo hidráulico",
            "causa_raiz": "Desgaste por uso",
        })
        self.assertEqual(r["estado"], "resuelta")

        # resuelta → cerrada_validada
        r = maquinaria_db.actualizar_incidencia(iid, {
            "estado": "cerrada_validada",
            "fecha_hora_parada": "2026-04-01T08:00:00",
            "fecha_hora_vuelta": "2026-04-02T14:00:00",
            "motivo_downtime": "espera_pieza",
        })
        self.assertEqual(r["estado"], "cerrada_validada")
        self.assertIsNotNone(r["cerrada_at"])
        # Auto-cálculo de downtime: 30 horas
        self.assertAlmostEqual(r["horas_downtime"], 30.0, places=1)

    def test_retrocompat_cerrada_como_cerrada_validada(self):
        """'cerrada' se acepta como alias de 'cerrada_validada' para retrocompatibilidad."""
        inc = self._crear_incidencia_test()
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_diagnostico"})
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_reparacion"})
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "resuelta", "accion_tomada": "test"})
        r = maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "cerrada"})
        self.assertEqual(r["estado"], "cerrada_validada")

    def test_transiciones_se_registran(self):
        inc = self._crear_incidencia_test()
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_diagnostico"})
        with _conectar() as conn:
            transiciones = conn.execute(
                "SELECT * FROM maquinaria_incidencia_transiciones WHERE incidencia_id = ? ORDER BY id",
                [inc["id"]],
            ).fetchall()
        # Al menos 2: creación (→abierta) y abierta→en_diagnostico
        self.assertGreaterEqual(len(transiciones), 2)


class TestPrecedenciaEstadoOperativo(unittest.TestCase):
    """Verifica la matriz de precedencia del estado operativo."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_rn01_incidencia_grave_sube_a_parada(self):
        """RN-01: Incidencia alta + no sigue operando → parada_diagnostico."""
        # Verificar estado inicial
        maq = maquinaria_db.obtener_maquina(1)
        self.assertIn(maq["estado_operativo"], ("operativa", None))

        inc = maquinaria_db.crear_incidencia({
            "maquina_id": 1,
            "sintoma_inicial": "Motor no arranca",
            "tipo_incidencia": "averia",
            "severidad": "alta",
            "maquina_siguio_operando": 0,
        })

        maq = maquinaria_db.obtener_maquina(1)
        self.assertEqual(maq["estado_operativo"], "parada_diagnostico")

    def test_rn02_pendiente_pieza_sube_a_parada_pieza(self):
        """RN-02: Incidencia → pendiente_pieza → parada_pendiente_pieza."""
        inc = maquinaria_db.crear_incidencia({
            "maquina_id": 2,
            "sintoma_inicial": "Filtro roto",
            "tipo_incidencia": "averia",
            "severidad": "alta",
            "maquina_siguio_operando": 0,
        })
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_diagnostico"})
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "pendiente_pieza"})

        maq = maquinaria_db.obtener_maquina(2)
        self.assertEqual(maq["estado_operativo"], "parada_pendiente_pieza")

    def test_no_baja_gravedad_automaticamente(self):
        """Las reglas automáticas no bajan gravedad."""
        # Máquina 3 en parada_diagnostico por incidencia grave
        inc1 = maquinaria_db.crear_incidencia({
            "maquina_id": 3,
            "sintoma_inicial": "Fallo grave",
            "severidad": "seguridad",
            "maquina_siguio_operando": 0,
        })

        maq = maquinaria_db.obtener_maquina(3)
        self.assertEqual(maq["estado_operativo"], "parada_diagnostico")

        # Crear otra incidencia leve — no debe bajar gravedad
        inc2 = maquinaria_db.crear_incidencia({
            "maquina_id": 3,
            "sintoma_inicial": "Ruido menor",
            "severidad": "baja",
            "maquina_siguio_operando": 1,
        })

        maq = maquinaria_db.obtener_maquina(3)
        # Sigue en parada_diagnostico (más grave)
        self.assertEqual(maq["estado_operativo"], "parada_diagnostico")

    def test_override_manual(self):
        """El admin puede bajar gravedad manualmente con override."""
        result = maquinaria_db.actualizar_estado_operativo_manual(3, "operativa")
        self.assertEqual(result["estado_operativo"], "operativa")
        self.assertEqual(result["override_estado_manual"], 1)

    def test_estado_invalido_rechazado(self):
        result = maquinaria_db.actualizar_estado_operativo_manual(1, "estado_inventado")
        self.assertIn("error", result)


class TestAsignacionesObra(unittest.TestCase):
    """Verifica la lógica de asignaciones máquina-obra."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_asignacion_se_crea_al_asignar_proyecto(self):
        """RN-07: Al cambiar proyecto_id se crea asignación."""
        maquinaria_db.actualizar_maquina(1, {"proyecto_id": 1})
        asigs = maquinaria_db.listar_asignaciones_obra(1)
        # Puede haber la del seed + la nueva
        self.assertGreaterEqual(len(asigs), 1)
        # La más reciente debe tener proyecto_id=1 y sin fecha_fin
        ultima = asigs[0]  # ORDER BY fecha_inicio DESC
        self.assertEqual(ultima["proyecto_id"], 1)
        self.assertIsNone(ultima["fecha_fin"])

    def test_reasignar_cierra_anterior(self):
        """RN-07: Al reasignar a otra obra, cierra la anterior."""
        maquinaria_db.actualizar_maquina(4, {"proyecto_id": 1})
        maquinaria_db.actualizar_maquina(4, {"proyecto_id": 2})

        asigs = maquinaria_db.listar_asignaciones_obra(4)
        cerradas = [a for a in asigs if a["fecha_fin"] is not None]
        abiertas = [a for a in asigs if a["fecha_fin"] is None]

        self.assertGreaterEqual(len(cerradas), 1)
        self.assertEqual(len(abiertas), 1)
        self.assertEqual(abiertas[0]["proyecto_id"], 2)

    def test_crear_asignacion_historica(self):
        """Se pueden crear asignaciones retroactivas."""
        asig = maquinaria_db.crear_asignacion_obra({
            "maquina_id": 5,
            "proyecto_id": 1,
            "fecha_inicio": "2025-01-15",
            "fecha_fin": "2025-06-30",
            "notas": "Histórico reconstruido",
        })
        self.assertEqual(asig["fecha_fin"], "2025-06-30")


class TestDisponibilidad(unittest.TestCase):
    """Verifica cálculos de KPIs de disponibilidad."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_disponibilidad_maquina_sin_incidencias(self):
        result = maquinaria_db.calcular_disponibilidad(6)
        self.assertEqual(result["incidencias_abiertas"], 0)
        self.assertEqual(result["30d"]["incidencias"], 0)
        self.assertEqual(result["30d"]["horas_downtime"], 0)

    def test_disponibilidad_con_incidencia_cerrada(self):
        """Incidencia cerrada con downtime aparece en KPIs."""
        inc = maquinaria_db.crear_incidencia({
            "maquina_id": 7,
            "sintoma_inicial": "Oruga suelta",
            "severidad": "alta",
            "maquina_siguio_operando": 0,
        })
        # Avanzar por el flujo
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_diagnostico"})
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_reparacion"})
        maquinaria_db.actualizar_incidencia(inc["id"], {
            "estado": "resuelta",
            "accion_tomada": "Tensado oruga",
            "causa_raiz": "Desgaste",
            "fecha_hora_parada": (datetime.now() - timedelta(hours=16)).strftime("%Y-%m-%dT%H:%M:%S"),
            "fecha_hora_vuelta": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            "motivo_downtime": "averia",
        })
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "cerrada_validada"})

        result = maquinaria_db.calcular_disponibilidad(7)
        self.assertGreater(result["30d"]["horas_downtime"], 0)
        self.assertGreater(result["30d"]["coste_downtime"], 0)

    def test_disponibilidad_maquina_inexistente(self):
        result = maquinaria_db.calcular_disponibilidad(9999)
        self.assertIn("error", result)


class TestIncidenciaHistorica(unittest.TestCase):
    """Verifica que incidencias históricas no disparan reglas automáticas (RN-06)."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_incidencia_historica_no_cambia_estado(self):
        # Estado operativo antes
        maq_antes = maquinaria_db.obtener_maquina(8)
        estado_antes = maq_antes["estado_operativo"]

        inc = maquinaria_db.crear_incidencia({
            "maquina_id": 8,
            "sintoma_inicial": "Fallo histórico grave",
            "severidad": "seguridad",
            "maquina_siguio_operando": 0,
            "es_historico": 1,
            "fuente_dato": "factura",
        })

        maq_despues = maquinaria_db.obtener_maquina(8)
        self.assertEqual(maq_despues["estado_operativo"], estado_antes)


class TestAutoCalculoDowntime(unittest.TestCase):
    """Verifica RN-04 y RN-05: auto-cálculo de downtime y coste."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_calculo_downtime_al_cerrar(self):
        inc = maquinaria_db.crear_incidencia({
            "maquina_id": 1,
            "sintoma_inicial": "Test downtime",
            "severidad": "media",
            "maquina_siguio_operando": 0,
        })
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_diagnostico"})
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_reparacion"})

        r = maquinaria_db.actualizar_incidencia(inc["id"], {
            "estado": "resuelta",
            "accion_tomada": "Reparado",
            "causa_raiz": "Desgaste",
            "fecha_hora_parada": "2026-04-07T08:00:00",
            "fecha_hora_vuelta": "2026-04-08T08:00:00",
        })
        # 24 horas de downtime
        self.assertAlmostEqual(r["horas_downtime"], 24.0, places=1)
        # Coste: 24/8 * 900 = 2700
        self.assertAlmostEqual(r["coste_downtime"], 2700.0, places=0)


if __name__ == "__main__":
    unittest.main()
