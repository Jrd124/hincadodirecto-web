"""Generacion de PDF profesional para presupuestos de Hincado Directo."""
from __future__ import annotations

import io
import logging
from pathlib import Path
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image,
    PageBreak, KeepTogether,
)
from reportlab.lib.utils import ImageReader

from core import presupuestos_db

logger = logging.getLogger(__name__)

# ── Paths ──
_ASSETS_DIR = Path(__file__).resolve().parent.parent / "static" / "assets" / "presupuestos"


def _find_logo():
    """Find the best logo file: prefer real logo (jpg/png), fallback to placeholder."""
    for name in ("logo.png", "logo.jpg", "logo_hincado_directo.png"):
        p = _ASSETS_DIR / name
        if p.exists():
            return p
    return _ASSETS_DIR / "logo_hincado_directo.png"


def _find_foto():
    """Find foto_maquinaria — check for real file by size (placeholder < 50KB)."""
    p = _ASSETS_DIR / "foto_maquinaria.png"
    # If a higher-quality version exists alongside, prefer it
    real = _ASSETS_DIR / "foto_maquinaria_real.png"
    if real.exists():
        return real
    if p.exists():
        return p
    return p


_LOGO_PATH = _find_logo()
_FOTO_PATH = _find_foto()

# ── Colors ──
_DARK = HexColor("#1E293B")
_GREY_HEADER = HexColor("#E8E8E8")
_GREY_TEXT = HexColor("#444444")
_YELLOW_TOTAL = HexColor("#FFF9C4")
_LIGHT_GREY = HexColor("#F5F5F5")
_BORDER_GREY = HexColor("#CCCCCC")

# ── Page dims ──
_PAGE_W, _PAGE_H = A4  # 595.27 x 841.89
_MARGIN_LEFT = 50
_MARGIN_RIGHT = 50
_MARGIN_TOP = 60
_MARGIN_BOTTOM = 60
_CONTENT_W = _PAGE_W - _MARGIN_LEFT - _MARGIN_RIGHT


def _build_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        "CellNormal", parent=styles["Normal"], fontSize=8, leading=10,
        textColor=black, wordWrap="CJK",
    ))
    styles.add(ParagraphStyle(
        "CellDesc", parent=styles["Normal"], fontSize=7.5, leading=9,
        textColor=_GREY_TEXT, wordWrap="CJK",
    ))
    styles.add(ParagraphStyle(
        "CellHeader", parent=styles["Normal"], fontSize=8, leading=10,
        textColor=white, fontName="Helvetica-Bold", wordWrap="CJK",
    ))
    styles.add(ParagraphStyle(
        "CellRight", parent=styles["Normal"], fontSize=8, leading=10,
        textColor=black, alignment=TA_RIGHT, wordWrap="CJK",
    ))
    styles.add(ParagraphStyle(
        "CellRightBold", parent=styles["Normal"], fontSize=8, leading=10,
        textColor=black, alignment=TA_RIGHT, fontName="Helvetica-Bold", wordWrap="CJK",
    ))
    styles.add(ParagraphStyle(
        "CellCenter", parent=styles["Normal"], fontSize=8, leading=10,
        textColor=black, alignment=TA_CENTER, wordWrap="CJK",
    ))
    styles.add(ParagraphStyle(
        "TCText", parent=styles["Normal"], fontSize=9, leading=12,
        textColor=black, wordWrap="CJK",
    ))
    styles.add(ParagraphStyle(
        "TCTitle", parent=styles["Normal"], fontSize=11, leading=14,
        textColor=_DARK, fontName="Helvetica-Bold", spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        "SectionTitle", parent=styles["Normal"], fontSize=12, leading=15,
        textColor=_DARK, fontName="Helvetica-Bold", spaceAfter=8,
    ))
    return styles


def _fmt_eur(n):
    if n is None:
        return ""
    try:
        v = float(n)
        # Format with dots for thousands, comma for decimals
        if v == int(v):
            return f"{int(v):,}".replace(",", ".") + ",00 \u20AC"
        return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " \u20AC"
    except (TypeError, ValueError):
        return ""


def _fmt_qty(n):
    if n is None:
        return ""
    try:
        v = float(n)
        if v == int(v):
            return str(int(v))
        return f"{v:.2f}".replace(".", ",")
    except (TypeError, ValueError):
        return ""


def _img_proportional(img_path, max_width, max_height):
    """Return (width, height) respecting aspect ratio within the given limits."""
    try:
        reader = ImageReader(str(img_path))
        iw, ih = reader.getSize()
        ratio = min(max_width / iw, max_height / ih)
        return iw * ratio, ih * ratio
    except Exception:
        return max_width, max_height


def _safe_img(path, max_width, max_height=None):
    """Return a proportionally-sized Image if file exists, otherwise a placeholder."""
    if path and Path(path).exists():
        if max_height:
            w, h = _img_proportional(path, max_width, max_height)
        else:
            # Only width constraint — let ReportLab compute height from ratio
            try:
                reader = ImageReader(str(path))
                iw, ih = reader.getSize()
                w = max_width
                h = max_width * (ih / iw)
            except Exception:
                w, h = max_width, max_width * 0.5
        return Image(str(path), width=w, height=h)
    return Paragraph(f"[imagen: {Path(path).name if path else '?'}]",
                     getSampleStyleSheet()["Normal"])


class _FooterCanvas:
    """Wrapper to draw footer on every page."""

    def __init__(self, empresa, fecha, revision):
        self.empresa = empresa
        self.fecha = fecha
        self.revision = revision
        self.pages = []

    def on_page(self, canvas, doc):
        self.pages.append(doc.page)
        canvas.saveState()
        # Footer line
        y = _MARGIN_BOTTOM - 25
        canvas.setStrokeColor(_BORDER_GREY)
        canvas.setLineWidth(0.5)
        canvas.line(_MARGIN_LEFT, y + 12, _PAGE_W - _MARGIN_RIGHT, y + 12)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(_GREY_TEXT)
        canvas.drawString(_MARGIN_LEFT, y, self.empresa)
        canvas.drawRightString(_PAGE_W - _MARGIN_RIGHT, y,
                               f"{self.fecha}  |  {self.revision}")
        # Page number (will be overwritten in on_last_page)
        canvas.drawCentredString(_PAGE_W / 2, y, f"- {doc.page} -")
        canvas.restoreState()

    def on_later_page(self, canvas, doc):
        self.on_page(canvas, doc)


def generar_pdf_presupuesto(version_id: int) -> bytes:
    """Genera el PDF completo de un presupuesto y retorna los bytes."""
    presupuestos_db.init_presupuestos_db()

    # Obtener datos
    version = presupuestos_db.obtener_version(version_id)
    if not version:
        raise ValueError(f"Version {version_id} no encontrada")

    presupuesto = presupuestos_db.obtener_presupuesto(version["presupuesto_id"])
    if not presupuesto:
        raise ValueError("Presupuesto no encontrado")

    # Plantilla T&C
    plantilla = None
    if version.get("plantilla_tc_id"):
        plantilla = presupuestos_db.obtener_plantilla_tc(version["plantilla_tc_id"])

    # Datos para el PDF
    nombre_cliente = (presupuesto.get("nombre_cliente_display")
                      or presupuesto.get("nombre_cliente")
                      or "CLIENTE")
    nombre_proyecto = presupuesto.get("nombre_proyecto") or "PROYECTO"
    referencia = presupuesto.get("referencia") or ""
    revision = version.get("revision") or "R00"
    fecha = version.get("fecha") or datetime.utcnow().strftime("%Y-%m-%d")
    validez = version.get("validez_dias") or 30

    lineas = version.get("lineas") or []
    lineas_principales = [l for l in lineas if l.get("seccion") == "principal"]
    lineas_adicionales = [l for l in lineas if l.get("seccion") == "adicionales"]

    styles = _build_styles()
    buf = io.BytesIO()

    footer = _FooterCanvas("HINCADO DIRECTO S.L.", fecha, revision)

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=_MARGIN_LEFT, rightMargin=_MARGIN_RIGHT,
        topMargin=_MARGIN_TOP, bottomMargin=_MARGIN_BOTTOM,
        title=f"Presupuesto {referencia} {revision}",
        author="Hincado Directo S.L.",
    )

    story = []

    # ═══════════════════════════════════════════
    # PORTADA
    # ═══════════════════════════════════════════

    story.append(Spacer(1, 30))

    # Logo
    story.append(_safe_img(_LOGO_PATH, max_width=200, max_height=120))
    story.append(Spacer(1, 8))
    story.append(Paragraph("www.hincadodirecto.com",
                           ParagraphStyle("url", parent=styles["Normal"],
                                          fontSize=9, textColor=_GREY_TEXT,
                                          alignment=TA_CENTER)))
    story.append(Spacer(1, 50))

    # Titulo
    story.append(Paragraph(
        "OFERTA T\u00c9CNICO - ECON\u00d3MICA",
        ParagraphStyle("titulo", parent=styles["Normal"],
                       fontSize=24, fontName="Helvetica-Bold",
                       textColor=_DARK, alignment=TA_CENTER, spaceAfter=16),
    ))

    # Subtitulo
    story.append(Paragraph(
        f"{nombre_cliente.upper()} - {nombre_proyecto.upper()}",
        ParagraphStyle("subtitulo", parent=styles["Normal"],
                       fontSize=14, fontName="Helvetica",
                       textColor=_GREY_TEXT, alignment=TA_CENTER, spaceAfter=8),
    ))

    story.append(Spacer(1, 12))
    story.append(Paragraph(
        f"Ref: {referencia} &nbsp;&nbsp;|&nbsp;&nbsp; {revision}",
        ParagraphStyle("ref", parent=styles["Normal"],
                       fontSize=10, textColor=_GREY_TEXT, alignment=TA_CENTER),
    ))

    story.append(Spacer(1, 40))

    # Foto maquinaria
    story.append(_safe_img(_FOTO_PATH, max_width=_CONTENT_W * 0.85, max_height=250))

    story.append(Spacer(1, 40))

    # Fecha
    story.append(Paragraph(
        f"Fecha: {fecha}",
        ParagraphStyle("fecha", parent=styles["Normal"],
                       fontSize=10, textColor=_GREY_TEXT, alignment=TA_CENTER),
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # PARTIDAS PRINCIPALES
    # ═══════════════════════════════════════════

    if lineas_principales:
        story.append(Paragraph("PARTIDAS PRINCIPALES", styles["SectionTitle"]))
        story.append(Spacer(1, 6))
        story.extend(_build_tabla_partidas(lineas_principales, styles, show_total=True))
        story.append(Spacer(1, 20))

    # ═══════════════════════════════════════════
    # ADICIONALES
    # ═══════════════════════════════════════════

    if lineas_adicionales:
        story.append(Paragraph("ADICIONALES / OPCIONALES", styles["SectionTitle"]))
        story.append(Spacer(1, 6))
        story.extend(_build_tabla_partidas(lineas_adicionales, styles, show_total=False))
        story.append(Spacer(1, 20))

    # ═══════════════════════════════════════════
    # TERMINOS Y CONDICIONES
    # ═══════════════════════════════════════════

    story.append(Spacer(1, 10))
    story.append(Paragraph("T\u00c9RMINOS Y CONDICIONES", styles["SectionTitle"]))
    story.append(Spacer(1, 6))

    # Capacidad
    if version.get("notas_capacidad"):
        story.append(Paragraph(
            f"<b>{version['notas_capacidad']}</b>",
            styles["TCText"],
        ))
        story.append(Spacer(1, 10))

    # Contenido T&C
    if plantilla:
        if plantilla.get("contenido"):
            for parr in (plantilla["contenido"] or "").split("\n"):
                parr = parr.strip()
                if parr:
                    story.append(Paragraph(parr, styles["TCText"]))
                    story.append(Spacer(1, 4))
            story.append(Spacer(1, 8))

        # Exclusiones
        if plantilla.get("exclusiones"):
            story.append(Paragraph("<b>EXCLUSIONES:</b>", styles["TCText"]))
            story.append(Spacer(1, 4))
            for parr in (plantilla["exclusiones"] or "").split("\n"):
                parr = parr.strip()
                if parr:
                    story.append(Paragraph(parr, styles["TCText"]))
                    story.append(Spacer(1, 4))
            story.append(Spacer(1, 8))

    # Notas finales
    story.append(Spacer(1, 12))
    story.append(Paragraph("Oferta en EUROS (\u20AC)", styles["TCText"]))
    story.append(Paragraph("I.V.A. no incluido", styles["TCText"]))
    story.append(Paragraph(f"Validez: {validez} d\u00edas desde {fecha}", styles["TCText"]))

    # Forma de pago
    if version.get("forma_pago"):
        story.append(Spacer(1, 12))
        story.append(Paragraph("<b>FORMA DE PAGO:</b>", styles["TCText"]))
        story.append(Spacer(1, 4))
        story.append(Paragraph(version["forma_pago"], styles["TCText"]))

    # Build PDF
    doc.build(story, onFirstPage=footer.on_page, onLaterPages=footer.on_later_page)
    return buf.getvalue()


def _build_tabla_partidas(lineas, styles, show_total=True):
    """Construye la tabla de partidas como lista de flowables."""
    elements = []

    # Column widths: Item(55) | Ud(35) | Contents(flex) | Qty(55) | UnitPrice(75) | Total(80)
    col_widths = [55, 35, _CONTENT_W - 55 - 35 - 55 - 75 - 80, 55, 75, 80]

    # Header
    header = [
        Paragraph("Item", styles["CellHeader"]),
        Paragraph("Ud", styles["CellHeader"]),
        Paragraph("Descripci\u00f3n", styles["CellHeader"]),
        Paragraph("Ctd.", styles["CellHeader"]),
        Paragraph("Precio Ud.", styles["CellHeader"]),
        Paragraph("Total", styles["CellHeader"]),
    ]

    data = [header]
    total_general = 0.0

    for l in lineas:
        total_linea = float(l.get("total") or 0)
        total_general += total_linea

        # Main row
        row = [
            Paragraph(l.get("codigo") or "", styles["CellNormal"]),
            Paragraph(l.get("unidad") or "Ud", styles["CellCenter"]),
            Paragraph(f"<b>{l.get('titulo') or ''}</b>", styles["CellNormal"]),
            Paragraph(_fmt_qty(l.get("cantidad")), styles["CellRight"]),
            Paragraph(_fmt_eur(l.get("precio_unitario")), styles["CellRight"]),
            Paragraph(_fmt_eur(total_linea), styles["CellRight"]),
        ]
        data.append(row)

        # Description row (if present)
        desc = (l.get("descripcion") or "").strip()
        if desc:
            desc_row = [
                "",
                "",
                Paragraph(desc, styles["CellDesc"]),
                "", "", "",
            ]
            data.append(desc_row)

    # Total row
    if show_total:
        total_row = [
            "", "", "",
            Paragraph("<b>TOTAL</b>", styles["CellRightBold"]),
            "",
            Paragraph(f"<b>{_fmt_eur(total_general)}</b>", styles["CellRightBold"]),
        ]
        data.append(total_row)

    # Build table
    table = Table(data, colWidths=col_widths, repeatRows=1)

    style_cmds = [
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), _DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        # All cells
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        # Grid
        ("GRID", (0, 0), (-1, -1), 0.5, _BORDER_GREY),
        # Alternating row colors (skip header)
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, _LIGHT_GREY]),
    ]

    # Total row highlight
    if show_total and len(data) > 1:
        last = len(data) - 1
        style_cmds.append(("BACKGROUND", (0, last), (-1, last), _YELLOW_TOTAL))
        style_cmds.append(("FONTNAME", (0, last), (-1, last), "Helvetica-Bold"))

    table.setStyle(TableStyle(style_cmds))
    elements.append(table)
    return elements
