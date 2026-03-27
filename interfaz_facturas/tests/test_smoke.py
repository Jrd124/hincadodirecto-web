"""Smoke tests: verifican que los endpoints principales responden sin crashear."""
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend import app, _parse_importe_es


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


# ── Endpoints ────────────────────────────────────────────────────────────────


def test_login_page(client):
    """La pagina de login debe responder."""
    rv = client.get("/login")
    assert rv.status_code in (200, 302)


def test_api_finanzas_resumen(client):
    """Resumen de finanzas debe responder."""
    rv = client.get("/api/finanzas/resumen")
    assert rv.status_code in (200, 401)


def test_api_finanzas_dashboard(client):
    """Dashboard de finanzas debe responder."""
    rv = client.get("/api/finanzas/dashboard")
    assert rv.status_code in (200, 401)


def test_api_proyectos(client):
    """Listado de proyectos debe responder."""
    rv = client.get("/api/proyectos")
    assert rv.status_code in (200, 401)


def test_api_presupuestos(client):
    """Listado de presupuestos debe responder."""
    rv = client.get("/api/presupuestos")
    assert rv.status_code in (200, 401)


def test_api_crm_empresas(client):
    """Listado de empresas CRM debe responder."""
    rv = client.get("/api/crm/empresas")
    assert rv.status_code in (200, 401)


# ── Parseo de importes ──────────────────────────────────────────────────────


class TestParseImporteEs:
    """Verifica el parseo robusto de importes en formato espanol/ingles mixto."""

    def test_formato_espanol_con_miles(self):
        assert _parse_importe_es("1.234,56") == pytest.approx(1234.56)

    def test_formato_espanol_sin_miles(self):
        assert _parse_importe_es("42,00") == pytest.approx(42.0)

    def test_formato_espanol_grande_sin_miles(self):
        assert _parse_importe_es("60500,00") == pytest.approx(60500.0)

    def test_formato_ingles_decimal(self):
        assert _parse_importe_es("5444.32") == pytest.approx(5444.32)

    def test_formato_ingles_dos_decimales(self):
        assert _parse_importe_es("630.00") == pytest.approx(630.0)

    def test_formato_ingles_pequeno(self):
        assert _parse_importe_es("8.10") == pytest.approx(8.10)

    def test_entero(self):
        assert _parse_importe_es("1234") == pytest.approx(1234.0)

    def test_con_simbolo_euro(self):
        assert _parse_importe_es("1.234,56 \u20ac") == pytest.approx(1234.56)

    def test_none(self):
        assert _parse_importe_es(None) == 0.0

    def test_vacio(self):
        assert _parse_importe_es("") == 0.0

    def test_texto_invalido(self):
        assert _parse_importe_es("abc") == 0.0

    def test_miles_espanol_sin_decimal(self):
        # "1.234" con 3 digitos tras el punto = separador de miles
        assert _parse_importe_es("1.234") == pytest.approx(1234.0)
