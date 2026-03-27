"""Generación de PDF de certificaciones de avance de trabajos."""
from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image

ASSETS_DIR = Path(__file__).resolve().parent.parent / "static" / "assets" / "presupuestos"


def _logo_path():
    for name in ("logo.png", "logo.jpg", "logo_hincado_directo.png"):
        p = ASSETS_DIR / name
        if p.exists():
            return p
    return None


def _img_proportional(img_path, max_width, max_height):
    try:
        img = ImageReader(str(img_path))
        iw, ih = img.getSize()
        ratio = min(max_width / iw, max_height / ih)
        return iw * ratio, ih * ratio
    except Exception:
        return max_width, max_height


def _fmt_eur(v):
    return f"{v:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


_DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"]


def generar_pdf_certificacion(certificacion: dict, proyecto: dict) -> bytes:
    """Genera PDF de certificación en landscape. Retorna bytes del PDF."""

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )

    styles = getSampleStyleSheet()
    elements: list = []

    # ─── CABECERA ───────────────────────────────────────────────────────
    logo = _logo_path()
    if logo:
        lw, lh = _img_proportional(logo, 120, 60)
        elements.append(Image(str(logo), width=lw, height=lh))
        elements.append(Spacer(1, 3 * mm))

    style_cliente = ParagraphStyle(
        "Cliente", parent=styles["Heading1"],
        fontSize=14, spaceAfter=2 * mm, textColor=colors.HexColor("#1E293B"),
    )
    style_proyecto = ParagraphStyle(
        "Proyecto", parent=styles["Normal"],
        fontSize=11, spaceAfter=1 * mm, textColor=colors.HexColor("#475569"),
    )
    style_cert = ParagraphStyle(
        "CertTitulo", parent=styles["Heading2"],
        fontSize=12, spaceAfter=1 * mm, textColor=colors.HexColor("#2563EB"),
    )
    style_periodo = ParagraphStyle(
        "Periodo", parent=styles["Normal"],
        fontSize=10, spaceAfter=4 * mm, textColor=colors.HexColor("#64748B"),
    )

    elements.append(Paragraph(proyecto.get("cliente_nombre") or "Cliente", style_cliente))
    elements.append(Paragraph(f"Proyecto {proyecto.get('nombre', '')}", style_proyecto))
    elements.append(Paragraph(
        f"Certificación de avance de trabajos #{certificacion.get('numero', 1)}", style_cert,
    ))
    elements.append(Paragraph(
        f"Periodo: {certificacion.get('fecha_desde', '')} — {certificacion.get('fecha_hasta', '')}",
        style_periodo,
    ))

    # ─── TABLA DE DETALLE DIARIO ────────────────────────────────────────
    detalle = certificacion.get("detalle", [])

    style_cell_small = ParagraphStyle(
        "CellSmall", parent=styles["Normal"],
        fontSize=7, leading=9, textColor=colors.HexColor("#475569"),
    )

    header = ["Descripción", "Día", "Fecha", "Hincas", "H. Admin"]
    data = [header]

    for d in detalle:
        fecha_str = d.get("fecha", "")
        try:
            dt = datetime.strptime(fecha_str[:10], "%Y-%m-%d")
            dia_semana = _DIAS_SEMANA[dt.weekday()]
            fecha_fmt = dt.strftime("%d.%b.%y").lower()
        except (ValueError, IndexError):
            dia_semana = ""
            fecha_fmt = fecha_str

        desc = d.get("descripcion", "") or ""
        if len(desc) > 80:
            desc = desc[:77] + "..."

        hincas = d.get("hincas", 0) or 0
        horas = d.get("horas_admin", 0) or 0

        data.append([
            Paragraph(desc, style_cell_small) if desc else "",
            dia_semana,
            fecha_fmt,
            str(hincas) if hincas > 0 else "",
            f"{horas:.1f}" if horas > 0 else "",
        ])

    if len(data) > 1:
        # landscape A4 = 297mm - 30mm margins = 267mm
        page_w = 267 * mm
        col_widths = [page_w - 97 * mm, 12 * mm, 35 * mm, 25 * mm, 25 * mm]

        detail_table = Table(data, colWidths=col_widths, repeatRows=1)
        detail_style = [
            # Header
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
            ("TOPPADDING", (0, 0), (-1, 0), 4),
            # Body
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 2),
            ("TOPPADDING", (0, 1), (-1, -1), 2),
            # Alignment
            ("ALIGN", (1, 0), (1, -1), "CENTER"),
            ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
            # Lines
            ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#1E293B")),
            ("LINEBELOW", (0, 1), (-1, -2), 0.5, colors.HexColor("#E2E8F0")),
            ("LINEBELOW", (0, -1), (-1, -1), 1, colors.HexColor("#1E293B")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        # Alternate row colors
        for i in range(2, len(data), 2):
            detail_style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F8FAFC")))
        detail_table.setStyle(TableStyle(detail_style))
        elements.append(detail_table)
    else:
        style_empty = ParagraphStyle(
            "Empty", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#94A3B8"),
        )
        elements.append(Paragraph("Sin partes de trabajo registrados en este periodo.", style_empty))

    elements.append(Spacer(1, 6 * mm))

    # ─── RESUMEN ECONÓMICO ──────────────────────────────────────────────
    total_hincas = certificacion.get("total_hincas", 0) or 0
    precio_hinca = certificacion.get("precio_hinca", 0) or 0
    importe_produccion = certificacion.get("importe_produccion", 0) or 0
    total_horas = certificacion.get("total_horas_admin", 0) or 0
    precio_hora = certificacion.get("precio_hora_admin", 0) or 0
    importe_admin = certificacion.get("importe_administracion", 0) or 0
    importe_transporte = certificacion.get("importe_transporte", 0) or 0
    importe_total = certificacion.get("importe_total", 0) or 0

    resumen_data = [["Concepto", "Cantidad", "Precio unitario", "Importe"]]

    if total_hincas > 0:
        resumen_data.append([
            "Total hincas hasta la fecha",
            f"{total_hincas:,}".replace(",", "."),
            _fmt_eur(precio_hinca),
            _fmt_eur(importe_produccion),
        ])

    if total_horas > 0:
        resumen_data.append([
            "Total horas de administración",
            f"{total_horas:.1f}".replace(".", ","),
            _fmt_eur(precio_hora),
            _fmt_eur(importe_admin),
        ])

    if importe_transporte > 0:
        resumen_data.append(["Transporte", "", "", _fmt_eur(importe_transporte)])

    resumen_data.append(["", "", "TOTAL CERTIFICACIÓN", _fmt_eur(importe_total)])

    resumen_widths = [120 * mm, 40 * mm, 50 * mm, 57 * mm]
    resumen_table = Table(resumen_data, colWidths=resumen_widths)
    resumen_table.setStyle(TableStyle([
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#475569")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
        ("TOPPADDING", (0, 0), (-1, 0), 4),
        # Body
        ("FONTNAME", (0, 1), (-1, -2), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -2), 9),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
        ("TOPPADDING", (0, 1), (-1, -1), 3),
        # Total row
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 11),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EFF6FF")),
        ("LINEABOVE", (0, -1), (-1, -1), 1.5, colors.HexColor("#2563EB")),
        # Alignment
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        # Lines
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#475569")),
        ("LINEBELOW", (0, 1), (-1, -2), 0.5, colors.HexColor("#E2E8F0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(resumen_table)

    # ─── PIE ────────────────────────────────────────────────────────────
    elements.append(Spacer(1, 8 * mm))
    style_pie = ParagraphStyle(
        "Pie", parent=styles["Normal"],
        fontSize=8, textColor=colors.HexColor("#94A3B8"),
    )
    elements.append(Paragraph(
        f"Hincado Directo S.L. — Certificación generada el {date.today().strftime('%d/%m/%Y')}",
        style_pie,
    ))

    doc.build(elements)
    buffer.seek(0)
    return buffer.read()
