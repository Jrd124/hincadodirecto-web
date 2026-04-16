"""
Tests unitarios del motor de seguimiento CRM (v1.5 Fase 2, Bloque 2).

Ejecutar desde interfaz_facturas/:
    python -m unittest tests.test_crm_seguimiento

Cobertura de las 4 correcciones obligatorias:
  Corrección 1 — modelo consistente: se prueba implícitamente (los 9 campos).
  Corrección 2 — notas NO resetean aging (test_nota_no_resetea_aging).
  Corrección 3 — override manual NO caduca a 3 días (test_override_sticky_*).
  Corrección 4 — inbound empresa sólo cuenta con out reciente (test_inbound_empresa_*).
"""
from __future__ import annotations

import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

# Permitir import cuando se ejecuta desde raíz o desde interfaz_facturas/
if str(Path(__file__).resolve().parents[1]) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import crm_seguimiento as cs  # noqa: E402


HOY = date(2026, 4, 11)


def ddays(n: int) -> str:
    return (HOY - timedelta(days=n)).strftime("%Y-%m-%d")


def mk_opp(**kwargs):
    base = {
        "id": 1,
        "empresa_id": 10,
        "estado": "lead",
        "importe_estimado": None,
        "fecha_creacion": ddays(20),
        "fecha_entrada_etapa": ddays(20),
    }
    base.update(kwargs)
    return base


def mk_interaccion(_id: int, tipo: str, dias_atras: int, direccion: str = "none",
                   siguiente_accion: str | None = None,
                   fecha_siguiente_accion: str | None = None) -> dict:
    return {
        "id": _id,
        "tipo": tipo,
        "fecha": ddays(dias_atras),
        "direccion": direccion,
        "siguiente_accion": siguiente_accion,
        "fecha_siguiente_accion": fecha_siguiente_accion,
    }


class TestHelpers(unittest.TestCase):
    def test_es_interaccion_comercial_valida(self):
        for tipo in ("llamada", "email", "reunion", "whatsapp", "visita"):
            self.assertTrue(cs.es_interaccion_comercial_valida({"tipo": tipo}))
        self.assertFalse(cs.es_interaccion_comercial_valida({"tipo": "nota"}))
        self.assertFalse(cs.es_interaccion_comercial_valida({"tipo": ""}))
        self.assertFalse(cs.es_interaccion_comercial_valida({}))

    def test_parse_date_tolerancia(self):
        self.assertEqual(cs._parse_date("2026-04-11"), date(2026, 4, 11))
        self.assertEqual(cs._parse_date("2026-04-11T12:30:00Z"), date(2026, 4, 11))
        self.assertIsNone(cs._parse_date(None))
        self.assertIsNone(cs._parse_date(""))
        self.assertIsNone(cs._parse_date("pepe"))


class TestUltimaComercial(unittest.TestCase):
    def test_nota_no_resetea_aging(self):
        """Corrección 2: una nota de hoy no debe aparecer como última comercial."""
        interacciones = [
            mk_interaccion(2, "nota",    dias_atras=0),
            mk_interaccion(1, "llamada", dias_atras=10, direccion="out"),
        ]
        self.assertEqual(
            cs.calcular_ultima_interaccion_comercial(interacciones),
            ddays(10),
        )

    def test_sin_interacciones(self):
        self.assertIsNone(cs.calcular_ultima_interaccion_comercial([]))

    def test_elige_mas_reciente(self):
        interacciones = [
            mk_interaccion(1, "email",   dias_atras=15, direccion="out"),
            mk_interaccion(2, "reunion", dias_atras=2,  direccion="out"),
            mk_interaccion(3, "email",   dias_atras=5,  direccion="in"),
        ]
        self.assertEqual(
            cs.calcular_ultima_interaccion_comercial(interacciones),
            ddays(2),
        )


class TestEstadoRespuesta(unittest.TestCase):
    def test_na_sin_outbound(self):
        interacciones = [mk_interaccion(1, "nota", 3)]
        self.assertEqual(cs.calcular_estado_respuesta(interacciones, HOY), "na")

    def test_pendiente_solo_out(self):
        interacciones = [mk_interaccion(1, "email", 2, direccion="out")]
        self.assertEqual(cs.calcular_estado_respuesta(interacciones, HOY), "pendiente")

    def test_recibida(self):
        interacciones = [
            mk_interaccion(2, "email", 1, direccion="in"),
            mk_interaccion(1, "email", 3, direccion="out"),
        ]
        self.assertEqual(cs.calcular_estado_respuesta(interacciones, HOY), "recibida")

    def test_in_antes_de_out_es_pendiente(self):
        """Si el inbound es anterior al último outbound, seguimos esperando."""
        interacciones = [
            mk_interaccion(2, "email", 1, direccion="out"),
            mk_interaccion(1, "email", 5, direccion="in"),
        ]
        self.assertEqual(cs.calcular_estado_respuesta(interacciones, HOY), "pendiente")

    def test_inbound_empresa_out_reciente_cuenta(self):
        """Corrección 4: fallback empresa, out dentro de ventana → cuenta el in."""
        opp_inter: list[dict] = []
        emp_inter = [
            mk_interaccion(2, "email", 2, direccion="in"),
            mk_interaccion(1, "email", 10, direccion="out"),
        ]
        self.assertEqual(
            cs.calcular_estado_respuesta_empresa(opp_inter, emp_inter, HOY, window_days=30),
            "recibida",
        )

    def test_inbound_empresa_out_antiguo_no_cuenta(self):
        """Corrección 4: outbound más antiguo que la ventana → el inbound reciente se ignora."""
        opp_inter: list[dict] = []
        emp_inter = [
            mk_interaccion(2, "email", 2,  direccion="in"),
            mk_interaccion(1, "email", 90, direccion="out"),  # > 30 días
        ]
        self.assertEqual(
            cs.calcular_estado_respuesta_empresa(opp_inter, emp_inter, HOY, window_days=30),
            "na",
        )

    def test_opp_con_out_ignora_empresa(self):
        """Si la oportunidad tiene out propio, no se mira la empresa."""
        opp_inter = [mk_interaccion(5, "email", 1, direccion="out")]
        emp_inter = [mk_interaccion(6, "email", 0, direccion="in")]
        self.assertEqual(
            cs.calcular_estado_respuesta_empresa(opp_inter, emp_inter, HOY),
            "pendiente",
        )


class TestOverrideManual(unittest.TestCase):
    def test_override_actual_gana(self):
        """Corrección 3: override sticky, no caduca."""
        interacciones = [
            mk_interaccion(1, "email", 15, direccion="out",
                           siguiente_accion="Llamar a Juan",
                           fecha_siguiente_accion=(HOY + timedelta(days=5)).strftime("%Y-%m-%d")),
        ]
        res = cs.cargar_override_de_lista(interacciones)
        self.assertIsNotNone(res)
        fsa, etiqueta = res
        self.assertEqual(fsa, (HOY + timedelta(days=5)).strftime("%Y-%m-%d"))
        self.assertEqual(etiqueta, "Llamar a Juan")

    def test_override_persistente_aun_con_fecha_antigua(self):
        """Corrección 3: NO caduca a 3 días. Una interacción de hace 20 días con override sigue mandando."""
        interacciones = [
            mk_interaccion(1, "email", 20, direccion="out",
                           siguiente_accion="Enviar catálogo",
                           fecha_siguiente_accion=ddays(-2)),  # fecha en el futuro (pasado mañana)
        ]
        op = mk_opp(estado="contacto_inicial")
        res = cs.calcular_next_action(
            oportunidad=op,
            interacciones=interacciones,
            ultima_comercial_str=ddays(20),
            fecha_entrada_etapa_str=ddays(25),
            sla=cs.DEFAULT_SLAS["contacto_inicial"],
            hoy=HOY,
        )
        next_date, next_type, next_source = res
        self.assertEqual(next_source, "usuario")
        self.assertEqual(next_type, "Enviar catálogo")
        self.assertEqual(next_date, ddays(-2))

    def test_nueva_interaccion_reemplaza_override(self):
        """Un override nuevo (por (fecha,id) DESC) reemplaza al anterior."""
        interacciones = [
            mk_interaccion(2, "llamada", 1, direccion="out",
                           siguiente_accion="Call follow-up",
                           fecha_siguiente_accion=(HOY + timedelta(days=2)).strftime("%Y-%m-%d")),
            mk_interaccion(1, "email", 10, direccion="out",
                           siguiente_accion="Viejo",
                           fecha_siguiente_accion=(HOY + timedelta(days=20)).strftime("%Y-%m-%d")),
        ]
        fsa, etiqueta = cs.cargar_override_de_lista(interacciones)
        self.assertEqual(etiqueta, "Call follow-up")
        self.assertEqual(fsa, (HOY + timedelta(days=2)).strftime("%Y-%m-%d"))


class TestNextAction(unittest.TestCase):
    def test_primer_contacto_sin_interacciones(self):
        op = mk_opp(estado="lead", fecha_creacion=ddays(3), fecha_entrada_etapa=ddays(3))
        res = cs.calcular_next_action(
            oportunidad=op,
            interacciones=[],
            ultima_comercial_str=None,
            fecha_entrada_etapa_str=ddays(3),
            sla=cs.DEFAULT_SLAS["lead"],
            hoy=HOY,
        )
        next_date, next_type, next_source = res
        self.assertEqual(next_type, "primer_contacto")
        self.assertEqual(next_source, "motor")
        # SLA lead = 5 días desde entrada (ddays(3)) → HOY + 2
        self.assertEqual(next_date, (HOY + timedelta(days=2)).strftime("%Y-%m-%d"))

    def test_estancada_en_etapa(self):
        op = mk_opp(estado="lead", fecha_entrada_etapa=ddays(30))
        interacciones = [mk_interaccion(1, "llamada", 4, direccion="out")]
        res = cs.calcular_next_action(
            oportunidad=op,
            interacciones=interacciones,
            ultima_comercial_str=ddays(4),
            fecha_entrada_etapa_str=ddays(30),
            sla=cs.DEFAULT_SLAS["lead"],  # sla_dias_en_etapa=14
            hoy=HOY,
        )
        next_date, next_type, next_source = res
        self.assertEqual(next_type, "revisar_estancada")
        self.assertEqual(next_source, "motor")
        self.assertEqual(next_date, HOY.strftime("%Y-%m-%d"))

    def test_default_por_etapa_cotizacion(self):
        op = mk_opp(estado="cotizacion_enviada", fecha_entrada_etapa=ddays(3))
        interacciones = [mk_interaccion(1, "email", 2, direccion="out")]
        res = cs.calcular_next_action(
            oportunidad=op,
            interacciones=interacciones,
            ultima_comercial_str=ddays(2),
            fecha_entrada_etapa_str=ddays(3),
            sla=cs.DEFAULT_SLAS["cotizacion_enviada"],  # 5 días
            hoy=HOY,
        )
        next_date, next_type, next_source = res
        self.assertEqual(next_type, "recordar_presupuesto")
        # ddays(2) + 5 días = HOY + 3
        self.assertEqual(next_date, (HOY + timedelta(days=3)).strftime("%Y-%m-%d"))


class TestPriorityYRiesgo(unittest.TestCase):
    def test_score_base_y_vencido(self):
        op = mk_opp(estado="negociacion")
        # next_action_date fue hace 10 días → vencido * 2 = 20
        score = cs.calcular_priority_score(
            oportunidad=op,
            ultima_comercial_str=ddays(15),
            fecha_entrada_etapa_str=ddays(5),
            next_action_date_str=ddays(10),
            sla=cs.DEFAULT_SLAS["negociacion"],  # base 90
            hoy=HOY,
        )
        self.assertEqual(score, 90 + 20)
        self.assertEqual(cs.calcular_riesgo(score), "rojo")

    def test_importe_bonus(self):
        op = mk_opp(estado="lead", importe_estimado=60000)
        score = cs.calcular_priority_score(
            oportunidad=op,
            ultima_comercial_str=None,
            fecha_entrada_etapa_str=ddays(1),
            next_action_date_str=(HOY + timedelta(days=5)).strftime("%Y-%m-%d"),
            sla=cs.DEFAULT_SLAS["lead"],  # base 40
            hoy=HOY,
        )
        # base 40 + bonus 20 (importe >= 50k), sin vencido
        self.assertEqual(score, 60)

    def test_riesgo_umbrales(self):
        self.assertEqual(cs.calcular_riesgo(50), "verde")
        self.assertEqual(cs.calcular_riesgo(70), "ambar")
        self.assertEqual(cs.calcular_riesgo(99), "ambar")
        self.assertEqual(cs.calcular_riesgo(100), "rojo")
        self.assertEqual(cs.calcular_riesgo(150), "rojo")


class TestEvaluarOportunidadEndToEnd(unittest.TestCase):
    def test_lead_fresco_sin_interacciones(self):
        op = mk_opp(estado="lead", fecha_creacion=ddays(1), fecha_entrada_etapa=ddays(1))
        r = cs.evaluar_oportunidad(op, [], HOY)
        self.assertIsNone(r["ultima_interaccion_fecha"])
        self.assertEqual(r["next_action_type"], "primer_contacto")
        self.assertEqual(r["next_action_source"], "motor")
        self.assertEqual(r["estado_respuesta"], "na")
        self.assertIn(r["riesgo"], ("verde", "ambar", "rojo"))

    def test_nota_no_resetea_full_pipeline(self):
        """Corrección 2 end-to-end: nota reciente + llamada vieja → aging se calcula desde la llamada."""
        op = mk_opp(estado="contacto_inicial", fecha_entrada_etapa=ddays(8))
        interacciones = [
            mk_interaccion(2, "nota",    0),
            mk_interaccion(1, "llamada", 10, direccion="out"),
        ]
        r = cs.evaluar_oportunidad(op, interacciones, HOY)
        self.assertEqual(r["ultima_interaccion_fecha"], ddays(10))
        # SLA contacto_inicial = 7 → next_date = ddays(10)+7 = ddays(3)
        self.assertEqual(r["next_action_date"], ddays(3))

    def test_aplazada_usa_sla_laxo(self):
        op = mk_opp(estado="aplazada", fecha_entrada_etapa=ddays(10))
        interacciones = [mk_interaccion(1, "email", 20, direccion="out")]
        r = cs.evaluar_oportunidad(op, interacciones, HOY)
        self.assertEqual(r["next_action_type"], "reactivar")
        # ddays(20) + 30 = HOY + 10
        self.assertEqual(r["next_action_date"], (HOY + timedelta(days=10)).strftime("%Y-%m-%d"))

    def test_ganada_limpia_todo(self):
        op = mk_opp(estado="ganada")
        r = cs.evaluar_oportunidad(op, [], HOY)
        self.assertIsNone(r["next_action_date"])
        self.assertIsNone(r["next_action_type"])
        self.assertEqual(r["priority_score"], 0)
        self.assertEqual(r["estado_respuesta"], "na")

    def test_override_sticky_end_to_end(self):
        """Corrección 3 end-to-end: un override viejo sigue vigente."""
        op = mk_opp(estado="cotizacion_enviada", fecha_entrada_etapa=ddays(6))
        interacciones = [
            mk_interaccion(
                1, "email", 15, direccion="out",
                siguiente_accion="Recordar propuesta",
                fecha_siguiente_accion=(HOY + timedelta(days=3)).strftime("%Y-%m-%d"),
            ),
        ]
        r = cs.evaluar_oportunidad(op, interacciones, HOY)
        self.assertEqual(r["next_action_source"], "usuario")
        self.assertEqual(r["next_action_date"], (HOY + timedelta(days=3)).strftime("%Y-%m-%d"))
        self.assertEqual(r["next_action_type"], "Recordar propuesta")


class TestDBIntegracion(unittest.TestCase):
    """Smoke test con SQLite en memoria sobre el schema mínimo necesario.

    Verifica que el wrapper DB persiste los 9 campos correctamente sin
    depender del proyecto (no toca gestion.db real).
    """

    def _setup_db(self):
        import sqlite3
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.executescript("""
            CREATE TABLE crm_oportunidades (
                id INTEGER PRIMARY KEY,
                empresa_id INTEGER,
                estado TEXT,
                importe_estimado REAL,
                fecha_creacion TEXT,
                fecha_actualizacion TEXT,
                ultima_interaccion_fecha TEXT,
                fecha_entrada_etapa TEXT,
                next_action_date TEXT,
                next_action_type TEXT,
                next_action_source TEXT,
                priority_score INTEGER,
                riesgo TEXT,
                estado_respuesta TEXT,
                seguimiento_recalculado_en TEXT
            );
            CREATE TABLE crm_oportunidades_historial (
                id INTEGER PRIMARY KEY,
                oportunidad_id INTEGER,
                estado_anterior TEXT,
                estado_nuevo TEXT,
                fecha TEXT
            );
            CREATE TABLE crm_interacciones (
                id INTEGER PRIMARY KEY,
                oportunidad_id INTEGER,
                empresa_id INTEGER,
                tipo TEXT,
                fecha TEXT,
                direccion TEXT,
                siguiente_accion TEXT,
                fecha_siguiente_accion TEXT
            );
        """)
        return conn

    def test_recalcular_persiste_campos(self):
        conn = self._setup_db()
        conn.execute(
            "INSERT INTO crm_oportunidades (id, empresa_id, estado, importe_estimado, fecha_creacion) "
            "VALUES (1, 10, 'lead', 25000, ?)",
            (ddays(2),),
        )
        conn.execute(
            "INSERT INTO crm_interacciones (id, oportunidad_id, empresa_id, tipo, fecha, direccion) "
            "VALUES (1, 1, 10, 'llamada', ?, 'out')",
            (ddays(1),),
        )
        ok = cs.recalcular_seguimiento_oportunidad(1, conn, hoy=HOY)
        self.assertTrue(ok)
        row = conn.execute("SELECT * FROM crm_oportunidades WHERE id = 1").fetchone()
        self.assertEqual(row["ultima_interaccion_fecha"], ddays(1))
        self.assertEqual(row["next_action_type"], "primer_contacto")
        self.assertEqual(row["estado_respuesta"], "pendiente")
        self.assertIsNotNone(row["priority_score"])
        self.assertIn(row["riesgo"], ("verde", "ambar", "rojo"))
        self.assertIsNotNone(row["seguimiento_recalculado_en"])


if __name__ == "__main__":
    unittest.main()
