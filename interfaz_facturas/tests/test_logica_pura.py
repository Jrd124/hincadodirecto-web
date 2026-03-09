"""
Tests unitarios para lógica pura del backend:
normalización de texto, NIF/CIF, importes, similitud de nombres y reglas de revisión.
Ejecutar desde la carpeta interfaz_facturas: python -m unittest tests.test_logica_pura
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

# Permitir importar backend cuando se ejecuta desde raíz del proyecto
if str(Path(__file__).resolve().parents[1]) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend import (
    _normalizar_texto,
    _normalizar_importe_str,
    _extraer_ultimo_importe_linea,
    _normalizar_fecha_a_iso,
    _buscar_nif_cif,
    _normalizar_texto_proveedor,
    _normalizar_nif,
    _similitud_nombres,
    _revisor_basico,
    _revisor_basico_clientes,
)


class TestNormalizarTexto(unittest.TestCase):
    def test_vacio(self):
        self.assertEqual(_normalizar_texto(""), "")
        self.assertEqual(_normalizar_texto(None), "")

    def test_colapsa_espacios(self):
        self.assertEqual(_normalizar_texto("a   b\tc"), "a b c")

    def test_dobles_saltos(self):
        self.assertEqual(_normalizar_texto("a\n\n\nb"), "a\nb")

    def test_strip(self):
        self.assertEqual(_normalizar_texto("  hola  "), "hola")


class TestNormalizarImporte(unittest.TestCase):
    def test_vacio(self):
        self.assertIsNone(_normalizar_importe_str(""))
        self.assertIsNone(_normalizar_importe_str("   "))

    def test_entero(self):
        self.assertEqual(_normalizar_importe_str("100"), 100.0)
        self.assertEqual(_normalizar_importe_str("0"), 0.0)

    def test_decimal_punto(self):
        self.assertEqual(_normalizar_importe_str("52.15"), 52.15)
        self.assertEqual(_normalizar_importe_str("1234.56"), 1234.56)

    def test_decimal_coma(self):
        self.assertEqual(_normalizar_importe_str("52,15"), 52.15)
        self.assertEqual(_normalizar_importe_str("1.234,56"), 1234.56)

    def test_con_euro(self):
        self.assertEqual(_normalizar_importe_str("100 €"), 100.0)
        self.assertEqual(_normalizar_importe_str("€ 50,50"), 50.5)

    def test_espacios(self):
        self.assertEqual(_normalizar_importe_str("  1 234,56  "), 1234.56)

    def test_invalido(self):
        self.assertIsNone(_normalizar_importe_str("abc"))
        self.assertIsNone(_normalizar_importe_str("12.34.56"))


class TestExtraerUltimoImporteLinea(unittest.TestCase):
    def test_vacio(self):
        self.assertEqual(_extraer_ultimo_importe_linea(""), "")
        self.assertEqual(_extraer_ultimo_importe_linea("sin números"), "")

    def test_un_numero(self):
        # La función devuelve el número en forma normalizada (punto decimal)
        self.assertEqual(_extraer_ultimo_importe_linea("Total 1.234,56"), "1234.56")
        self.assertEqual(_extraer_ultimo_importe_linea("Base 100,00"), "100.00")

    def test_ultimo_gana(self):
        self.assertEqual(_extraer_ultimo_importe_linea("100 y 200"), "200")


class TestNormalizarFechaIso(unittest.TestCase):
    def test_vacio(self):
        self.assertEqual(_normalizar_fecha_a_iso(""), "")
        self.assertEqual(_normalizar_fecha_a_iso("   "), "")

    def test_ya_iso(self):
        self.assertEqual(_normalizar_fecha_a_iso("2024-01-15"), "2024-01-15")
        self.assertEqual(_normalizar_fecha_a_iso("2024-01-15T00:00:00"), "2024-01-15")

    def test_dd_mm_yyyy(self):
        self.assertEqual(_normalizar_fecha_a_iso("15/01/2024"), "2024-01-15")
        self.assertEqual(_normalizar_fecha_a_iso("1/2/2024"), "2024-02-01")
        self.assertEqual(_normalizar_fecha_a_iso("15-01-2024"), "2024-01-15")
        self.assertEqual(_normalizar_fecha_a_iso("15.01.2024"), "2024-01-15")

    def test_sin_match(self):
        self.assertEqual(_normalizar_fecha_a_iso("enero 2024"), "enero 2024")


class TestBuscarNifCif(unittest.TestCase):
    def test_etiqueta_cif_linea(self):
        texto = "CIF: B12345678\nOtro texto"
        # Tras etiqueta CIF puede devolver con o sin letra inicial según regex
        result = _buscar_nif_cif(texto)
        self.assertIn(result, ("B12345678", "12345678"), result)
        texto2 = "NIF 12345678Z"
        self.assertEqual(_buscar_nif_cif(texto2), "12345678Z")

    def test_patron_cif_texto(self):
        texto = "Factura con CIF B87654321 en el documento"
        self.assertEqual(_buscar_nif_cif(texto), "B87654321")

    def test_patron_dni(self):
        texto = "El NIF del cliente es 12345678A"
        self.assertEqual(_buscar_nif_cif(texto), "12345678A")

    def test_sin_nif(self):
        self.assertEqual(_buscar_nif_cif("Solo texto sin identificador"), "")


class TestNormalizarTextoProveedor(unittest.TestCase):
    def test_vacio(self):
        self.assertEqual(_normalizar_texto_proveedor(""), "")
        self.assertEqual(_normalizar_texto_proveedor(None), "")

    def test_minusculas(self):
        result = _normalizar_texto_proveedor("EMPRESA S.L.")
        self.assertTrue(result.islower())
        self.assertIn("sl", result)

    def test_variantes_sl_sa(self):
        result = _normalizar_texto_proveedor("Acme S.L.")
        self.assertIn("acme", result)
        self.assertIn("sl", result)
        result2 = _normalizar_texto_proveedor("Acme S.A.")
        self.assertIn("sl", result2)

    def test_espacios_colapsados(self):
        self.assertEqual(_normalizar_texto_proveedor("a   b"), "a b")

    def test_acentos(self):
        self.assertEqual(_normalizar_texto_proveedor("José García"), "jose garcia")


class TestNormalizarNif(unittest.TestCase):
    def test_vacio(self):
        self.assertEqual(_normalizar_nif(""), "")
        self.assertEqual(_normalizar_nif(None), "")

    def test_mayusculas_sin_espacios(self):
        self.assertEqual(_normalizar_nif("b 12345678"), "B12345678")
        self.assertEqual(_normalizar_nif("12345678-z"), "12345678Z")

    def test_quita_puntos_guiones(self):
        self.assertEqual(_normalizar_nif("B.12345678"), "B12345678")


class TestSimilitudNombres(unittest.TestCase):
    def test_identicos(self):
        self.assertEqual(_similitud_nombres("Acme S.L.", "Acme S.L."), 1.0)

    def test_normalizados_identicos(self):
        self.assertEqual(_similitud_nombres("ACME S.L.", "acme s.l."), 1.0)

    def test_distintos(self):
        self.assertLess(_similitud_nombres("Empresa A", "Empresa B"), 1.0)
        self.assertGreater(_similitud_nombres("Empresa A", "Empresa B"), 0.0)

    def test_similares(self):
        r = _similitud_nombres("José García S.L.", "Jose Garcia SL")
        self.assertGreaterEqual(r, 0.9)
        self.assertLessEqual(r, 1.0)

    def test_vacio(self):
        self.assertEqual(_similitud_nombres("", "algo"), 0.0)
        self.assertEqual(_similitud_nombres("algo", ""), 0.0)


class TestRevisorBasico(unittest.TestCase):
    def test_sin_fecha_marca_error(self):
        filas = [{"fecha_factura": "", "proveedor": "Acme", "base_imponible": "100", "iva": "21", "total_a_pagar": "121"}]
        _revisor_basico(filas)
        self.assertTrue(filas[0]["flag_error"])
        self.assertIn("Sin fecha", filas[0]["motivo_error"])

    def test_fecha_pasada_sin_error_fecha(self):
        filas = [{"fecha_factura": "2020-01-01", "proveedor": "Acme", "base_imponible": "100", "iva": "21", "retenciones_total": "0", "total_a_pagar": "121"}]
        _revisor_basico(filas)
        self.assertFalse(filas[0]["flag_error"])

    def test_descuadre_marca_error(self):
        filas = [{"fecha_factura": "2020-01-01", "proveedor": "Acme", "base_imponible": "100", "iva": "21", "retenciones_total": "0", "total_a_pagar": "999"}]
        _revisor_basico(filas)
        self.assertTrue(filas[0]["flag_error"])
        self.assertIn("Descuadre", filas[0]["motivo_error"])

    def test_cuadra_sin_error(self):
        filas = [{"fecha_factura": "2020-01-01", "proveedor": "Acme", "base_imponible": "100", "iva": "21", "retenciones_total": "0", "total_a_pagar": "121"}]
        _revisor_basico(filas)
        self.assertFalse(filas[0]["flag_error"])

    def test_setdefault_campos(self):
        filas = [{"fecha_factura": "2020-01-01", "proveedor": "Acme", "total_a_pagar": "121"}]
        _revisor_basico(filas)
        self.assertIn("flag_error", filas[0])
        self.assertIn("motivo_error", filas[0])


class TestRevisorBasicoClientes(unittest.TestCase):
    def test_sin_fecha_marca_error(self):
        filas = [{"fecha_factura": "", "cliente": "Cliente", "total_a_pagar": "121"}]
        _revisor_basico_clientes(filas)
        self.assertTrue(filas[0]["flag_error"])
        self.assertIn("Sin fecha", filas[0]["motivo_error"])

    def test_descuadre_pricing_iva_total(self):
        filas = [{"fecha_factura": "2020-01-01", "pricing_servicio": "100", "pricing_transporte": "0", "iva": "21", "total_a_pagar": "999"}]
        _revisor_basico_clientes(filas)
        self.assertTrue(filas[0]["flag_error"])
        self.assertIn("Descuadre", filas[0]["motivo_error"])

    def test_cuadra_sin_error(self):
        filas = [{"fecha_factura": "2020-01-01", "pricing_servicio": "100", "iva": "21", "total_a_pagar": "121"}]
        _revisor_basico_clientes(filas)
        self.assertFalse(filas[0]["flag_error"])


if __name__ == "__main__":
    unittest.main()
