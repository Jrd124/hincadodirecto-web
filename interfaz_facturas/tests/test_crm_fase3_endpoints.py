"""
Tests de endpoints del CRM v1.5 — Fase 3 (seguimiento + analítica + filtros).

Ejecutar desde interfaz_facturas/:
    python -m unittest tests.test_crm_fase3_endpoints

Estos tests:
  - Arrancan un GESTION_DB efímero en un tempdir via APP_BASE_DIR.
  - Construyen una mini-app Flask que registra únicamente `crm_bp`, para no
    cargar el backend entero (más rápido y con menos dependencias externas).
  - Siembran oportunidades con los 9 campos persistidos por el motor
    directamente (no reinventamos el motor aquí; los tests unitarios del
    motor viven en test_crm_seguimiento.py).
  - Validan: GET /api/crm/seguimiento/hoy,
             GET /api/crm/seguimiento/riesgo,
             GET /api/crm/analitica/pipeline,
             GET /api/crm/oportunidades con filtros nuevos,
             Compat del contrato existente de /api/crm/oportunidades.
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

# APP_BASE_DIR debe estar seteado ANTES de importar core.db / routes.crm,
# porque config.GESTION_DB se resuelve a import-time.
_TMPDIR = Path(tempfile.mkdtemp(prefix="crm_fase3_"))
(_TMPDIR / "data").mkdir(parents=True, exist_ok=True)
os.environ["APP_BASE_DIR"] = str(_TMPDIR)

# Importar paths del proyecto
if str(Path(__file__).resolve().parents[1]) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from flask import Flask  # noqa: E402

from core import crm_db, terceros_db, presupuestos_db, proyectos_db  # noqa: E402
from core.db import conectar as _conectar  # noqa: E402
from routes.crm import crm_bp  # noqa: E402


# ── Helpers ──────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def _ddays(n: int) -> str:
    return (datetime.utcnow() - timedelta(days=n)).strftime("%Y-%m-%d")


def _reset_db() -> None:
    """Borra todas las oportunidades/interacciones entre tests.

    Orden de init idéntico al de backend.py: primero las tablas padres que
    crm_db necesita en su backfill o en sus LEFT JOINs, luego crm_db:
      - terceros_db         → tabla 'terceros' (backfill de FUSIONADO→ en init_crm_db)
      - presupuestos_db     → tabla 'presupuestos' (LEFT JOIN en _OPORT_SELECT)
      - proyectos_db        → tabla 'proyectos'    (LEFT JOIN en _OPORT_SELECT)
    Todos los init_*_db son idempotentes (IF NOT EXISTS).
    """
    terceros_db.init_terceros_db()
    presupuestos_db.init_presupuestos_db()
    proyectos_db.init_proyectos_db()
    crm_db.init_crm_db()
    with _conectar() as conn:
        conn.execute("DELETE FROM crm_interacciones")
        conn.execute("DELETE FROM crm_oportunidades_historial")
        conn.execute("DELETE FROM crm_oportunidades")
        conn.execute("DELETE FROM crm_empresas")


def _crear_empresa(nombre: str = "ACME SL") -> int:
    with _conectar() as conn:
        cur = conn.execute(
            "INSERT INTO crm_empresas (nombre, tipo, fecha_creacion, activo) VALUES (?, 'lead', ?, 1)",
            (nombre, _now_iso()),
        )
        return int(cur.lastrowid)


def _crear_opp(
    *,
    empresa_id: int,
    nombre: str,
    estado: str = "lead",
    importe: float | None = None,
    next_action_date: str | None = None,
    next_action_type: str | None = None,
    next_action_source: str = "motor",
    priority_score: int | None = None,
    riesgo: str | None = None,
    estado_respuesta: str = "pendiente",
    ultima_interaccion_fecha: str | None = None,
    fecha_entrada_etapa: str | None = None,
) -> int:
    """Inserta una oportunidad con los 9 campos del motor ya fijados.
    Evita depender del engine aquí (tests del engine ya existen)."""
    ahora = _now_iso()
    with _conectar() as conn:
        cur = conn.execute(
            """
            INSERT INTO crm_oportunidades
                (empresa_id, nombre, estado, importe_estimado, fecha_creacion, fecha_actualizacion,
                 ultima_interaccion_fecha, fecha_entrada_etapa, next_action_date, next_action_type,
                 next_action_source, priority_score, riesgo, estado_respuesta,
                 seguimiento_recalculado_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                empresa_id, nombre, estado, importe, ahora, ahora,
                ultima_interaccion_fecha, fecha_entrada_etapa or _ddays(10),
                next_action_date, next_action_type, next_action_source,
                priority_score, riesgo, estado_respuesta, ahora,
            ),
        )
        return int(cur.lastrowid)


def _make_app() -> Flask:
    """Mini-app Flask que sólo registra crm_bp (no carga backend.py completo)."""
    app = Flask(__name__)
    app.register_blueprint(crm_bp)
    app.testing = True
    return app


# ── Fixture base ─────────────────────────────────────────────────────────────

class _BaseCRMFase3(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = _make_app()
        cls.client = cls.app.test_client()

    def setUp(self):
        _reset_db()
        self.empresa_id = _crear_empresa("ACME SL")

    def _seed_escenario_basico(self):
        """Crea una mezcla razonable de oportunidades para los tests agregados."""
        # Vencida roja, alta prioridad → debe encabezar /hoy
        self.op_vencida_roja = _crear_opp(
            empresa_id=self.empresa_id, nombre="Vencida roja",
            estado="negociacion", importe=80000,
            next_action_date=_ddays(5), next_action_type="cerrar",
            priority_score=120, riesgo="rojo",
            ultima_interaccion_fecha=_ddays(6),
        )
        # Ámbar hoy, prioridad media
        self.op_ambar_hoy = _crear_opp(
            empresa_id=self.empresa_id, nombre="Ámbar hoy",
            estado="cotizacion_enviada", importe=20000,
            next_action_date=_ddays(0), next_action_type="recordar_presupuesto",
            priority_score=75, riesgo="ambar",
            ultima_interaccion_fecha=_ddays(5),
        )
        # Verde hoy, baja prioridad — filtrada por defecto, sólo aparece con incluir_verdes
        self.op_verde_hoy = _crear_opp(
            empresa_id=self.empresa_id, nombre="Verde hoy",
            estado="lead", importe=3000,
            next_action_date=_ddays(0), next_action_type="primer_contacto",
            priority_score=45, riesgo="verde",
            ultima_interaccion_fecha=_ddays(2),
        )
        # Abierta sin next_action_date (sin clasificar)
        self.op_sin_next = _crear_opp(
            empresa_id=self.empresa_id, nombre="Sin próxima acción",
            estado="lead", importe=None,
            next_action_date=None, next_action_type=None,
            priority_score=None, riesgo=None,
            ultima_interaccion_fecha=None,
        )
        # Ganada cerrada — debe quedar fuera de /hoy y /riesgo
        self.op_ganada = _crear_opp(
            empresa_id=self.empresa_id, nombre="Ganada cerrada",
            estado="ganada", importe=100000,
            next_action_date=None, next_action_type=None,
            priority_score=0, riesgo="verde", estado_respuesta="na",
        )
        # Sin actividad > 14 días, next_action vencida hace 2 días
        self.op_fria = _crear_opp(
            empresa_id=self.empresa_id, nombre="Fría 30 días",
            estado="contacto_inicial", importe=10000,
            next_action_date=_ddays(2), next_action_type="perseguir_respuesta",
            priority_score=60, riesgo="ambar",
            ultima_interaccion_fecha=_ddays(30),
        )


# ── Tests ────────────────────────────────────────────────────────────────────

class TestSeguimientoHoy(_BaseCRMFase3):
    def test_por_defecto_excluye_verdes_y_cerradas(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/seguimiento/hoy")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        nombres = [o["nombre"] for o in data["oportunidades"]]
        # Debe incluir: vencida roja, ámbar hoy, fría. NO: verde, sin next, ganada.
        self.assertIn("Vencida roja", nombres)
        self.assertIn("Ámbar hoy", nombres)
        self.assertIn("Fría 30 días", nombres)
        self.assertNotIn("Verde hoy", nombres)
        self.assertNotIn("Sin próxima acción", nombres)
        self.assertNotIn("Ganada cerrada", nombres)

    def test_orden_por_priority_score_desc(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/seguimiento/hoy")
        scores = [o["priority_score"] for o in resp.get_json()["oportunidades"]]
        self.assertEqual(scores, sorted(scores, reverse=True))
        # Vencida roja (120) debe ser la primera
        self.assertEqual(resp.get_json()["oportunidades"][0]["nombre"], "Vencida roja")

    def test_incluir_verdes_true_añade_verde(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/seguimiento/hoy?incluir_verdes=1")
        nombres = [o["nombre"] for o in resp.get_json()["oportunidades"]]
        self.assertIn("Verde hoy", nombres)

    def test_limit_respetado(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/seguimiento/hoy?limit=2")
        self.assertEqual(len(resp.get_json()["oportunidades"]), 2)

    def test_expone_campos_derivados_dias(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/seguimiento/hoy")
        op = resp.get_json()["oportunidades"][0]
        # Campos del motor presentes
        for k in ("next_action_date", "next_action_type", "priority_score",
                  "riesgo", "estado_respuesta", "ultima_interaccion_fecha",
                  "fecha_entrada_etapa", "dias_sin_contacto", "dias_en_etapa_actual"):
            self.assertIn(k, op)


class TestSeguimientoRiesgo(_BaseCRMFase3):
    def test_default_ambar_mas_rojo(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/seguimiento/riesgo")
        data = resp.get_json()
        self.assertEqual(data["nivel"], "ambar+rojo")
        niveles = {o["riesgo"] for o in data["oportunidades"]}
        self.assertTrue(niveles.issubset({"ambar", "rojo"}))
        nombres = [o["nombre"] for o in data["oportunidades"]]
        self.assertNotIn("Verde hoy", nombres)
        self.assertNotIn("Ganada cerrada", nombres)  # cerrada excluida

    def test_filtro_rojo_strict(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/seguimiento/riesgo?nivel=rojo")
        niveles = {o["riesgo"] for o in resp.get_json()["oportunidades"]}
        self.assertEqual(niveles, {"rojo"})

    def test_orden_rojo_antes_que_ambar(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/seguimiento/riesgo")
        riesgos = [o["riesgo"] for o in resp.get_json()["oportunidades"]]
        # Todos los rojos deben aparecer antes que cualquier ámbar
        ultimo_rojo = max((i for i, r in enumerate(riesgos) if r == "rojo"), default=-1)
        primer_ambar = min((i for i, r in enumerate(riesgos) if r == "ambar"), default=len(riesgos))
        self.assertLess(ultimo_rojo, primer_ambar)

    def test_nivel_invalido_400(self):
        resp = self.client.get("/api/crm/seguimiento/riesgo?nivel=azul")
        self.assertEqual(resp.status_code, 400)


class TestAnaliticaPipeline(_BaseCRMFase3):
    def test_estructura_y_agregados(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/analitica/pipeline")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        # Claves top-level
        for k in ("pipeline", "riesgo", "importe_rojo", "disciplina",
                  "tiempos_medios", "nota_conversion"):
            self.assertIn(k, data)
        # Pipeline cubre todas las etapas conocidas
        etapas = {row["estado"] for row in data["pipeline"]}
        self.assertEqual(etapas, {
            "lead", "contacto_inicial", "cotizacion_enviada",
            "negociacion", "ganada", "perdida", "aplazada",
        })
        # Ganada tiene 1 oportunidad con 100_000
        ganada = next(row for row in data["pipeline"] if row["estado"] == "ganada")
        self.assertEqual(ganada["count"], 1)
        self.assertEqual(ganada["importe_total"], 100000.0)

    def test_riesgo_solo_abiertas(self):
        self._seed_escenario_basico()
        data = self.client.get("/api/crm/analitica/pipeline").get_json()
        # Hay 5 abiertas: rojo(1), ambar(2), verde(1), sin_clasificar(1)
        self.assertEqual(data["riesgo"]["rojo"], 1)
        self.assertEqual(data["riesgo"]["ambar"], 2)
        self.assertEqual(data["riesgo"]["verde"], 1)
        self.assertEqual(data["riesgo"]["sin_clasificar"], 1)

    def test_importe_rojo(self):
        self._seed_escenario_basico()
        data = self.client.get("/api/crm/analitica/pipeline").get_json()
        self.assertEqual(data["importe_rojo"], 80000.0)

    def test_disciplina_cobertura(self):
        self._seed_escenario_basico()
        data = self.client.get("/api/crm/analitica/pipeline").get_json()
        disc = data["disciplina"]
        # 5 abiertas: 4 con next_action_date (vencida/ámbar/verde/fría), 1 sin (sin_next)
        self.assertEqual(disc["total_abiertas"], 5)
        self.assertEqual(disc["con_next_action"], 4)
        self.assertEqual(disc["sin_next_action"], 1)
        # Cobertura = 4/5 = 80.0
        self.assertEqual(disc["cobertura_pct"], 80.0)

    def test_disciplina_vencidas(self):
        self._seed_escenario_basico()
        data = self.client.get("/api/crm/analitica/pipeline").get_json()
        # Recordar: _ddays(n) = hoy - n días.
        # Vencida roja: _ddays(5) = hace 5 días → vencida.
        # Ámbar hoy: _ddays(0) = hoy → NO vencida (estricto <).
        # Fría: _ddays(2) = hace 2 días → vencida.
        # Sin next: NULL → no cuenta.
        self.assertEqual(data["disciplina"]["vencidas"], 2)


class TestOportunidadesFiltros(_BaseCRMFase3):
    def test_filtro_riesgo_rojo(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/oportunidades?riesgo=rojo")
        nombres = [o["nombre"] for o in resp.get_json()["oportunidades"]]
        self.assertEqual(nombres, ["Vencida roja"])

    def test_filtro_riesgo_ambar_mas_rojo(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/oportunidades?riesgo=ambar+rojo")
        riesgos = {o["riesgo"] for o in resp.get_json()["oportunidades"]}
        self.assertTrue(riesgos.issubset({"ambar", "rojo"}))
        self.assertTrue({"ambar", "rojo"}.issubset(riesgos))

    def test_filtro_vencidas(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/oportunidades?vencidas=1")
        nombres = [o["nombre"] for o in resp.get_json()["oportunidades"]]
        # _ddays(n) = hoy - n días → positivos son fechas pasadas.
        # Vencida roja: _ddays(5) → hace 5 días → vencida.
        # Fría: _ddays(2) → hace 2 días → vencida.
        # Verde hoy: _ddays(0) → hoy → NO vencida (estricto <).
        self.assertIn("Vencida roja", nombres)
        self.assertIn("Fría 30 días", nombres)
        self.assertNotIn("Verde hoy", nombres)
        self.assertNotIn("Sin próxima acción", nombres)  # NULL excluido

    def test_filtro_sin_proxima_accion(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/oportunidades?sin_proxima_accion=1")
        nombres = [o["nombre"] for o in resp.get_json()["oportunidades"]]
        self.assertEqual(nombres, ["Sin próxima acción"])

    def test_filtro_sin_actividad_14_dias(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/oportunidades?sin_actividad_dias=14")
        nombres = [o["nombre"] for o in resp.get_json()["oportunidades"]]
        # Fría (30d) ✓; Sin próxima acción (NULL) ✓; resto < 14d.
        self.assertIn("Fría 30 días", nombres)
        self.assertIn("Sin próxima acción", nombres)
        self.assertNotIn("Ámbar hoy", nombres)

    def test_orden_motor(self):
        self._seed_escenario_basico()
        # Nota: 'ambar+rojo' en una query string se URL-decodifica a 'ambar rojo'.
        # crm_db.listar_oportunidades normaliza ambas formas. Pasamos la forma
        # textual directa para reflejar cómo llega desde un cliente HTTP real.
        resp = self.client.get("/api/crm/oportunidades?ordenar=motor&riesgo=ambar+rojo")
        scores = [o["priority_score"] for o in resp.get_json()["oportunidades"]]
        # El SQL ordena con COALESCE(priority_score, 0); replicamos esa semántica
        # en el test para no pelearnos con comparaciones None<int si el seed cambia.
        clave = lambda s: s if s is not None else 0  # noqa: E731
        self.assertEqual(scores, sorted(scores, key=clave, reverse=True))


class TestOportunidadesCompatibilidad(_BaseCRMFase3):
    def test_contrato_existente_sin_filtros_nuevos(self):
        """El endpoint existente sigue respondiendo igual si no se pasan filtros nuevos."""
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/oportunidades")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("oportunidades", data)
        self.assertIn("total", data)
        self.assertEqual(data["total"], 6)
        # Orden por defecto sigue siendo fecha_creacion DESC (no motor)
        # — verificamos que los campos clásicos siguen presentes
        op0 = data["oportunidades"][0]
        for clasicos in ("id", "empresa_id", "nombre", "estado", "fecha_creacion"):
            self.assertIn(clasicos, op0)
        # Y los nuevos campos del motor también (serialización extendida)
        for nuevo in ("next_action_date", "priority_score", "riesgo",
                      "dias_sin_contacto", "dias_en_etapa_actual"):
            self.assertIn(nuevo, op0)

    def test_filtro_estado_clasico(self):
        self._seed_escenario_basico()
        resp = self.client.get("/api/crm/oportunidades?estado=lead")
        nombres = {o["nombre"] for o in resp.get_json()["oportunidades"]}
        self.assertEqual(nombres, {"Verde hoy", "Sin próxima acción"})

    def test_filtro_empresa_id_clasico(self):
        self._seed_escenario_basico()
        otra = _crear_empresa("OtraCorp")
        _crear_opp(empresa_id=otra, nombre="Otra opp", estado="lead")
        resp = self.client.get(f"/api/crm/oportunidades?empresa_id={otra}")
        nombres = [o["nombre"] for o in resp.get_json()["oportunidades"]]
        self.assertEqual(nombres, ["Otra opp"])


if __name__ == "__main__":
    unittest.main()
