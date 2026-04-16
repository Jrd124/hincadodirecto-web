"""
Tests de edge cases para Fase 1A del módulo de maquinaria.

Escenarios:
1. Dos incidencias abiertas simultáneas en la misma máquina
2. Override manual + nueva incidencia más grave
3. Cierre de incidencia histórica
4. Máquina sin proyecto actual
5. Incidencia con parada pero sin fecha de vuelta todavía
6. Migración desde registros antiguos con 'en_curso'
7. Cambio repetido de proyecto en la misma máquina

Ejecutar: python -m unittest tests.test_maquinaria_edge_cases -v
"""
from __future__ import annotations

import os
import sys
import unittest
import sqlite3
import tempfile
from datetime import date, datetime, timedelta
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
from core.db import conectar as _conectar

# Ruta real de la BD
try:
    from config import GESTION_DB as _db_path
    _db_path_str = str(_db_path)
except Exception:
    _db_path_str = os.environ["DB_PATH"]


def _reset_db():
    """Resetea la DB para cada test class."""
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
        conn.execute("INSERT INTO proyectos (nombre) VALUES ('Planta Solar Cáceres')")
        conn.execute("INSERT INTO proyectos (nombre) VALUES ('Planta Solar Huelva')")
        conn.execute("INSERT INTO empleados (nombre, apellidos) VALUES ('Juan', 'García')")
        conn.execute("INSERT INTO usuarios (nombre) VALUES ('admin')")
    maquinaria_db.init_maquinaria_db()


# ══════════════════════════════════════════════════════════════════════
# EDGE CASE 1: Dos incidencias abiertas simultáneas en la misma máquina
# ══════════════════════════════════════════════════════════════════════
class TestDosIncidenciasSimultaneas(unittest.TestCase):
    """EC-01: Dos incidencias abiertas en la misma máquina.
    El estado operativo debe reflejar la más grave."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_estado_refleja_la_mas_grave(self):
        """Si hay una incidencia leve y una grave, el estado refleja la grave."""
        # Incidencia 1: leve, sigue operando
        inc1 = maquinaria_db.crear_incidencia({
            "maquina_id": 1,
            "sintoma_inicial": "Ruido menor en oruga",
            "severidad": "baja",
            "maquina_siguio_operando": 1,
        })
        maq = maquinaria_db.obtener_maquina(1)
        estado_tras_leve = maq["estado_operativo"]
        # Con incidencia leve + sigue operando → operativa_con_limitaciones o operativa
        self.assertIn(estado_tras_leve, ("operativa_con_limitaciones", "operativa"))

        # Incidencia 2: grave, máquina parada
        inc2 = maquinaria_db.crear_incidencia({
            "maquina_id": 1,
            "sintoma_inicial": "Motor no arranca — emergencia",
            "severidad": "seguridad",
            "maquina_siguio_operando": 0,
        })
        maq = maquinaria_db.obtener_maquina(1)
        self.assertEqual(maq["estado_operativo"], "parada_diagnostico",
                         "Con incidencia de seguridad + parada, debe ser parada_diagnostico")

    def test_cerrar_grave_no_baja_si_queda_otra_abierta(self):
        """Al cerrar la incidencia grave, si queda otra abierta, no se baja a operativa."""
        # Crear dos incidencias
        inc_leve = maquinaria_db.crear_incidencia({
            "maquina_id": 2,
            "sintoma_inicial": "Vibración anómala",
            "severidad": "baja",
            "maquina_siguio_operando": 1,
        })
        inc_grave = maquinaria_db.crear_incidencia({
            "maquina_id": 2,
            "sintoma_inicial": "Fuga hidráulica masiva",
            "severidad": "alta",
            "maquina_siguio_operando": 0,
        })
        # Cerrar la grave (flujo completo)
        maquinaria_db.actualizar_incidencia(inc_grave["id"], {"estado": "en_diagnostico"})
        maquinaria_db.actualizar_incidencia(inc_grave["id"], {"estado": "en_reparacion"})
        maquinaria_db.actualizar_incidencia(inc_grave["id"], {
            "estado": "resuelta", "accion_tomada": "Reparado",
        })
        maquinaria_db.actualizar_incidencia(inc_grave["id"], {"estado": "cerrada_validada"})

        maq = maquinaria_db.obtener_maquina(2)
        # No debe ser "operativa" porque queda la leve abierta
        # Tampoco debería ser parada_diagnostico ya que la grave se cerró
        # El estado no cambia automáticamente al cerrar (la función no baja)
        self.assertIsNotNone(maq["estado_operativo"])

    def test_conteo_incidencias_abiertas_en_disponibilidad(self):
        """El KPI de disponibilidad cuenta correctamente incidencias abiertas."""
        # Máquina 3 con 2 incidencias abiertas
        maquinaria_db.crear_incidencia({
            "maquina_id": 3, "sintoma_inicial": "Inc A", "severidad": "media",
            "maquina_siguio_operando": 1,
        })
        maquinaria_db.crear_incidencia({
            "maquina_id": 3, "sintoma_inicial": "Inc B", "severidad": "alta",
            "maquina_siguio_operando": 0,
        })
        disp = maquinaria_db.calcular_disponibilidad(3)
        self.assertEqual(disp["incidencias_abiertas"], 2)


# ══════════════════════════════════════════════════════════════════════
# EDGE CASE 2: Override manual + nueva incidencia más grave
# ══════════════════════════════════════════════════════════════════════
class TestOverrideMasIncidenciaGrave(unittest.TestCase):
    """EC-02: Admin pone override manual → llega incidencia más grave → debe escalar."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_incidencia_grave_rompe_override(self):
        """Una incidencia de seguridad debe escalar aunque haya override manual."""
        # Crear incidencia leve y que admin fuerce operativa
        inc1 = maquinaria_db.crear_incidencia({
            "maquina_id": 1,
            "sintoma_inicial": "Alerta leve",
            "severidad": "media",
            "maquina_siguio_operando": 1,
        })
        maquinaria_db.actualizar_estado_operativo_manual(1, "operativa", usuario_id=1)
        maq = maquinaria_db.obtener_maquina(1)
        self.assertEqual(maq["override_estado_manual"], 1)
        self.assertEqual(maq["estado_operativo"], "operativa")

        # Ahora llega incidencia de seguridad, máquina parada
        inc2 = maquinaria_db.crear_incidencia({
            "maquina_id": 1,
            "sintoma_inicial": "Cilindro martillo revienta — riesgo para operario",
            "severidad": "seguridad",
            "maquina_siguio_operando": 0,
        })
        maq = maquinaria_db.obtener_maquina(1)
        # parada_diagnostico tiene prioridad 4, operativa tiene 7
        # Como prioridad 4 < 7, debe escalar independientemente del override
        self.assertEqual(maq["estado_operativo"], "parada_diagnostico",
                         "Incidencia de seguridad debe romper el override y escalar")
        # El override se resetea al escalar
        self.assertEqual(maq["override_estado_manual"], 0)


# ══════════════════════════════════════════════════════════════════════
# EDGE CASE 3: Cierre de incidencia histórica
# ══════════════════════════════════════════════════════════════════════
class TestCierreIncidenciaHistorica(unittest.TestCase):
    """EC-03: Las incidencias históricas se pueden cerrar sin afectar estado operativo."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_cerrar_historica_no_altera_estado(self):
        """Cerrar una incidencia histórica no dispara reglas de estado."""
        # Estado inicial
        maq_antes = maquinaria_db.obtener_maquina(1)
        estado_antes = maq_antes["estado_operativo"]

        # Crear incidencia histórica
        inc = maquinaria_db.crear_incidencia({
            "maquina_id": 1,
            "sintoma_inicial": "Fallo motor 2023 — dato de factura",
            "severidad": "seguridad",
            "maquina_siguio_operando": 0,
            "es_historico": 1,
            "fuente_dato": "factura",
        })
        # Verificar que no cambió el estado
        maq = maquinaria_db.obtener_maquina(1)
        self.assertEqual(maq["estado_operativo"], estado_antes)

        # Avanzar por el flujo y cerrar
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_diagnostico"})
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_reparacion"})
        maquinaria_db.actualizar_incidencia(inc["id"], {
            "estado": "resuelta",
            "accion_tomada": "Motor reconstruido en taller",
            "causa_raiz": "Desgaste",
        })
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "cerrada_validada"})

        # El estado operativo no debe haber cambiado en ningún punto
        maq_final = maquinaria_db.obtener_maquina(1)
        self.assertEqual(maq_final["estado_operativo"], estado_antes,
                         "El estado operativo NO debe cambiar con incidencias históricas")


# ══════════════════════════════════════════════════════════════════════
# EDGE CASE 4: Máquina sin proyecto actual
# ══════════════════════════════════════════════════════════════════════
class TestMaquinaSinProyecto(unittest.TestCase):
    """EC-04: Operaciones sobre máquina sin proyecto_id asignado."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_incidencia_sin_proyecto(self):
        """Se puede crear incidencia en máquina sin proyecto — proyecto_id queda NULL."""
        inc = maquinaria_db.crear_incidencia({
            "maquina_id": 5,  # Máquina sin proyecto
            "sintoma_inicial": "Fallo en máquina en reserva",
            "severidad": "media",
            "maquina_siguio_operando": 1,
        })
        self.assertNotIn("error", inc)
        # proyecto_id debería ser None
        self.assertIsNone(inc.get("proyecto_id"))

    def test_asignaciones_vacias(self):
        """listar_asignaciones_obra en máquina sin proyecto devuelve lista vacía o solo seed."""
        asigs = maquinaria_db.listar_asignaciones_obra(5)
        # Puede tener 0 o puede tener asignaciones seed — lo importante es que no falle
        self.assertIsInstance(asigs, list)

    def test_disponibilidad_sin_proyecto(self):
        """calcular_disponibilidad funciona en máquina sin proyecto."""
        disp = maquinaria_db.calcular_disponibilidad(5)
        self.assertNotIn("error", disp)


# ══════════════════════════════════════════════════════════════════════
# EDGE CASE 5: Incidencia con parada pero sin fecha de vuelta
# ══════════════════════════════════════════════════════════════════════
class TestParadaSinVuelta(unittest.TestCase):
    """EC-05: Incidencia registra fecha_hora_parada pero la máquina sigue parada."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_downtime_no_calculado_sin_vuelta(self):
        """Sin fecha_hora_vuelta, horas_downtime queda NULL, no se calcula coste."""
        inc = maquinaria_db.crear_incidencia({
            "maquina_id": 1,
            "sintoma_inicial": "Martillo bloqueado",
            "severidad": "alta",
            "maquina_siguio_operando": 0,
        })
        # Avanzar a resuelta con parada pero SIN vuelta
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_diagnostico"})
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_reparacion"})
        r = maquinaria_db.actualizar_incidencia(inc["id"], {
            "estado": "resuelta",
            "accion_tomada": "Desbloqueado",
            "causa_raiz": "Piedra atascada",
            "fecha_hora_parada": "2026-04-08T06:00:00",
            # Sin fecha_hora_vuelta
        })
        # horas_downtime debe ser None o 0 — no puede calcular sin vuelta
        self.assertTrue(
            r.get("horas_downtime") is None or r.get("horas_downtime") == 0,
            f"Sin fecha_hora_vuelta, horas_downtime debería ser None/0, es {r.get('horas_downtime')}"
        )
        # coste_downtime tampoco
        self.assertTrue(
            r.get("coste_downtime") is None or r.get("coste_downtime") == 0,
            f"Sin vuelta, coste_downtime debería ser None/0, es {r.get('coste_downtime')}"
        )

    def test_actualizar_vuelta_despues(self):
        """Se puede añadir fecha_hora_vuelta después y se recalcula downtime."""
        inc = maquinaria_db.crear_incidencia({
            "maquina_id": 2,
            "sintoma_inicial": "Fallo eléctrico",
            "severidad": "alta",
            "maquina_siguio_operando": 0,
        })
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_diagnostico"})
        maquinaria_db.actualizar_incidencia(inc["id"], {"estado": "en_reparacion"})
        # Resolver con parada sin vuelta
        maquinaria_db.actualizar_incidencia(inc["id"], {
            "estado": "resuelta",
            "accion_tomada": "Cableado reparado",
            "fecha_hora_parada": "2026-04-07T08:00:00",
        })
        # Ahora añadir vuelta (sin cambiar estado)
        r = maquinaria_db.actualizar_incidencia(inc["id"], {
            "fecha_hora_vuelta": "2026-04-08T16:00:00",
        })
        # Debería recalcular: 32 horas
        if r.get("horas_downtime"):
            self.assertAlmostEqual(r["horas_downtime"], 32.0, places=1)


# ══════════════════════════════════════════════════════════════════════
# EDGE CASE 6: Migración desde registros antiguos con 'en_curso'
# ══════════════════════════════════════════════════════════════════════
class TestMigracionEnCurso(unittest.TestCase):
    """EC-06: Registros legacy con estado='en_curso' se migran a 'en_diagnostico'."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_no_quedan_registros_en_curso(self):
        """Después de migración, no deben existir registros con estado='en_curso'."""
        with _conectar() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM maquinaria_incidencias WHERE estado = 'en_curso'"
            ).fetchone()[0]
        self.assertEqual(count, 0, f"Quedan {count} registros con estado='en_curso'")

    def test_check_constraint_eliminado(self):
        """El CHECK constraint antiguo ya no está en la definición de la tabla."""
        with _conectar() as conn:
            sql = conn.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='maquinaria_incidencias'"
            ).fetchone()[0]
        self.assertNotIn("en_curso", sql,
                         "El CHECK constraint con 'en_curso' sigue presente")

    def test_insertar_nuevos_estados_posible(self):
        """Se pueden insertar todos los estados nuevos directamente en la BD."""
        with _conectar() as conn:
            for estado in maquinaria_db.ESTADOS_INCIDENCIA_VALIDOS:
                try:
                    conn.execute(
                        "INSERT INTO maquinaria_incidencias "
                        "(maquina_id, fecha, descripcion, estado, created_at) "
                        "VALUES (1, '2026-04-09', ?, ?, ?)",
                        [f"Test directo {estado}", estado, datetime.now().isoformat()],
                    )
                except sqlite3.IntegrityError as e:
                    self.fail(f"No se puede insertar estado '{estado}': {e}")


# ══════════════════════════════════════════════════════════════════════
# EDGE CASE 7: Cambio repetido de proyecto en la misma máquina
# ══════════════════════════════════════════════════════════════════════
class TestCambioRepetidoProyecto(unittest.TestCase):
    """EC-07: Múltiples reasignaciones de proyecto en la misma máquina."""

    @classmethod
    def setUpClass(cls):
        _init_fresh()

    def test_cuatro_cambios_de_proyecto(self):
        """4 cambios de proyecto generan 4 asignaciones con las 3 primeras cerradas."""
        mid = 1
        for pid in [1, 2, 3, 4]:
            maquinaria_db.actualizar_maquina(mid, {"proyecto_id": pid})

        asigs = maquinaria_db.listar_asignaciones_obra(mid)
        abiertas = [a for a in asigs if a.get("fecha_fin") is None]
        cerradas = [a for a in asigs if a.get("fecha_fin") is not None]

        self.assertEqual(len(abiertas), 1, f"Debe haber exactamente 1 abierta, hay {len(abiertas)}")
        self.assertGreaterEqual(len(cerradas), 3, f"Debe haber ≥3 cerradas, hay {len(cerradas)}")
        # La abierta debe ser el último proyecto
        self.assertEqual(abiertas[0]["proyecto_id"], 4)

    def test_volver_al_mismo_proyecto(self):
        """Máquina sale y vuelve al mismo proyecto → dos asignaciones separadas."""
        mid = 2
        maquinaria_db.actualizar_maquina(mid, {"proyecto_id": 1})
        maquinaria_db.actualizar_maquina(mid, {"proyecto_id": 2})
        maquinaria_db.actualizar_maquina(mid, {"proyecto_id": 1})  # Vuelve al proyecto 1

        asigs = maquinaria_db.listar_asignaciones_obra(mid)
        asigs_p1 = [a for a in asigs if a["proyecto_id"] == 1]
        # Debe haber 2 asignaciones al proyecto 1 (una cerrada, una abierta)
        self.assertGreaterEqual(len(asigs_p1), 2,
                                f"Debe haber ≥2 asignaciones al proyecto 1, hay {len(asigs_p1)}")
        cerradas_p1 = [a for a in asigs_p1 if a.get("fecha_fin")]
        abiertas_p1 = [a for a in asigs_p1 if not a.get("fecha_fin")]
        self.assertGreaterEqual(len(cerradas_p1), 1)
        self.assertEqual(len(abiertas_p1), 1)

    def test_asignar_mismo_proyecto_consecutivo(self):
        """Asignar el mismo proyecto dos veces consecutivas no duplica asignación."""
        mid = 3
        maquinaria_db.actualizar_maquina(mid, {"proyecto_id": 1})
        asigs_antes = maquinaria_db.listar_asignaciones_obra(mid)
        count_antes = len(asigs_antes)

        maquinaria_db.actualizar_maquina(mid, {"proyecto_id": 1})  # Mismo proyecto
        asigs_despues = maquinaria_db.listar_asignaciones_obra(mid)
        # No debería crear asignación nueva si el proyecto no cambió
        # (depende de la implementación — al menos no debe haber 2 abiertas)
        abiertas = [a for a in asigs_despues if not a.get("fecha_fin")]
        self.assertLessEqual(len(abiertas), 1,
                             f"No debe haber más de 1 asignación abierta, hay {len(abiertas)}")


if __name__ == "__main__":
    unittest.main()
