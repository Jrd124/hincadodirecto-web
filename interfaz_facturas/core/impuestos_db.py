"""Modulo Impuestos: seguimiento de obligaciones fiscales."""
from __future__ import annotations

import logging
from typing import Any

from core.db import conectar as _conectar, now_iso as _now

logger = logging.getLogger(__name__)

_initialized = False

SOCIEDADES = [
    ("hincado_directo", "Hincado Directo, S.L."),
    ("global_nutria", "Global Nutria, S.L."),
    ("nutria_capital", "Nutria Capital, S.L."),
    ("summitbridge_capital", "Summitbridge Capital, S.L."),
]

NOMBRES_SOCIEDAD = {s[0]: s[1] for s in SOCIEDADES}


def init_impuestos_db() -> None:
    global _initialized
    if _initialized:
        return
    with _conectar() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS obligaciones_fiscales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sociedad TEXT NOT NULL,
                modelo TEXT NOT NULL,
                descripcion TEXT NOT NULL,
                periodo TEXT NOT NULL,
                año INTEGER NOT NULL,
                fecha_limite TEXT NOT NULL,
                estado TEXT DEFAULT 'pendiente'
                    CHECK(estado IN ('pendiente','en_preparacion','presentado','pagado')),
                importe_estimado REAL DEFAULT 0,
                importe_real REAL,
                fecha_presentacion TEXT,
                fecha_pago TEXT,
                numero_referencia TEXT,
                asesoria_notificada INTEGER DEFAULT 0,
                notas TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_oblig_sociedad ON obligaciones_fiscales(sociedad);
            CREATE INDEX IF NOT EXISTS ix_oblig_fecha ON obligaciones_fiscales(fecha_limite);
            CREATE INDEX IF NOT EXISTS ix_oblig_estado ON obligaciones_fiscales(estado);
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS impuestos_documentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                obligacion_id INTEGER NOT NULL REFERENCES obligaciones_fiscales(id) ON DELETE CASCADE,
                nombre_archivo TEXT NOT NULL,
                ruta_archivo TEXT,
                tipo TEXT DEFAULT 'modelo'
                    CHECK(tipo IN ('modelo','justificante','borrador','otro')),
                descripcion TEXT,
                subido_por TEXT,
                fecha_subida TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_imp_docs_oblig ON impuestos_documentos(obligacion_id)")
        # Seed if empty
        count = conn.execute("SELECT COUNT(*) FROM obligaciones_fiscales").fetchone()[0]
        if count == 0:
            _seed_obligaciones_2026(conn)
    _initialized = True


def _seed_obligaciones_2026(conn) -> None:
    """Genera las obligaciones fiscales de 2026 para las 4 sociedades."""
    modelos = [
        ("303", "IVA trimestral", [
            ("Q1", "2026-04-20"), ("Q2", "2026-07-20"), ("Q3", "2026-10-20"), ("Q4", "2027-01-30"),
        ]),
        ("111", "Retenciones IRPF", [
            ("Q1", "2026-04-20"), ("Q2", "2026-07-20"), ("Q3", "2026-10-20"), ("Q4", "2027-01-30"),
        ]),
        ("390", "Resumen anual IVA", [("Anual", "2027-01-30")]),
        ("190", "Resumen anual retenciones", [("Anual", "2027-01-31")]),
        ("200", "Impuesto de Sociedades", [("Anual", "2026-07-25")]),
        ("202", "Pagos fraccionados IS", [
            ("1P", "2026-04-20"), ("2P", "2026-10-20"), ("3P", "2026-12-20"),
        ]),
        ("347", "Declaracion informativa", [("Anual", "2027-02-28")]),
    ]
    ahora = _now()
    for soc_id, _ in SOCIEDADES:
        for modelo, desc, periodos in modelos:
            for periodo, fecha_limite in periodos:
                conn.execute("""
                    INSERT INTO obligaciones_fiscales
                    (sociedad, modelo, descripcion, periodo, año, fecha_limite, estado, created_at)
                    VALUES (?, ?, ?, ?, 2026, ?, 'pendiente', ?)
                """, [soc_id, modelo, f"Modelo {modelo} - {desc}", periodo, fecha_limite, ahora])


def listar_obligaciones(
    sociedad: str | None = None,
    año: int | None = None,
    estado: str | None = None,
) -> list[dict]:
    init_impuestos_db()
    where_parts: list[str] = []
    params: list[Any] = []
    if sociedad:
        where_parts.append("sociedad = ?")
        params.append(sociedad)
    if año:
        where_parts.append("año = ?")
        params.append(año)
    if estado:
        where_parts.append("estado = ?")
        params.append(estado)
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    with _conectar() as conn:
        rows = conn.execute(
            f"SELECT * FROM obligaciones_fiscales {where} ORDER BY fecha_limite ASC", params
        ).fetchall()
    return [dict(r) for r in rows]


def obtener_obligacion(obligacion_id: int) -> dict | None:
    init_impuestos_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT * FROM obligaciones_fiscales WHERE id = ?", (obligacion_id,)
        ).fetchone()
        return dict(row) if row else None


def actualizar_obligacion(obligacion_id: int, data: dict) -> dict | None:
    init_impuestos_db()
    ahora = _now()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT id FROM obligaciones_fiscales WHERE id = ?", (obligacion_id,)
        ).fetchone()
        if not row:
            return None
        conn.execute("""
            UPDATE obligaciones_fiscales SET
                estado=?, importe_estimado=?, importe_real=?,
                fecha_presentacion=?, fecha_pago=?, numero_referencia=?,
                asesoria_notificada=?, notas=?, updated_at=?
            WHERE id=?
        """, (
            (data.get("estado") or "pendiente").strip(),
            data.get("importe_estimado") or 0,
            data.get("importe_real"),
            (data.get("fecha_presentacion") or "").strip() or None,
            (data.get("fecha_pago") or "").strip() or None,
            (data.get("numero_referencia") or "").strip() or None,
            1 if data.get("asesoria_notificada") else 0,
            (data.get("notas") or "").strip() or None,
            ahora, obligacion_id,
        ))
        return dict(conn.execute(
            "SELECT * FROM obligaciones_fiscales WHERE id = ?", (obligacion_id,)
        ).fetchone())


def contar_por_estado(sociedad: str | None = None, año: int | None = None) -> dict:
    init_impuestos_db()
    where_parts: list[str] = []
    params: list[Any] = []
    if sociedad:
        where_parts.append("sociedad = ?")
        params.append(sociedad)
    if año:
        where_parts.append("año = ?")
        params.append(año)
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    with _conectar() as conn:
        rows = conn.execute(
            f"SELECT estado, COUNT(*) as cnt FROM obligaciones_fiscales {where} GROUP BY estado",
            params,
        ).fetchall()
        proxima = conn.execute(
            f"SELECT * FROM obligaciones_fiscales {where} {'AND' if where_parts else 'WHERE'} estado IN ('pendiente','en_preparacion') ORDER BY fecha_limite ASC LIMIT 5",
            params,
        ).fetchall()
    conteos = {r["estado"]: r["cnt"] for r in rows}
    return {
        "pendiente": conteos.get("pendiente", 0),
        "en_preparacion": conteos.get("en_preparacion", 0),
        "presentado": conteos.get("presentado", 0),
        "pagado": conteos.get("pagado", 0),
        "proximas": [dict(r) for r in proxima],
    }


# ── Documentos de obligaciones ───────────────────────────────────────────────

def listar_documentos_obligacion(obligacion_id: int) -> list[dict]:
    init_impuestos_db()
    with _conectar() as conn:
        rows = conn.execute(
            "SELECT * FROM impuestos_documentos WHERE obligacion_id = ? ORDER BY created_at DESC",
            (obligacion_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def crear_documento(data: dict) -> dict:
    init_impuestos_db()
    ahora = _now()
    with _conectar() as conn:
        conn.execute("""
            INSERT INTO impuestos_documentos
            (obligacion_id, nombre_archivo, ruta_archivo, tipo, descripcion, subido_por, fecha_subida, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data["obligacion_id"],
            data["nombre_archivo"],
            data.get("ruta_archivo") or None,
            data.get("tipo", "modelo"),
            (data.get("descripcion") or "").strip() or None,
            data.get("subido_por"),
            ahora[:10],
            ahora,
        ))
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return dict(conn.execute("SELECT * FROM impuestos_documentos WHERE id = ?", (new_id,)).fetchone())


def eliminar_documento(doc_id: int) -> bool:
    init_impuestos_db()
    with _conectar() as conn:
        row = conn.execute("SELECT id FROM impuestos_documentos WHERE id = ?", (doc_id,)).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM impuestos_documentos WHERE id = ?", (doc_id,))
    return True
