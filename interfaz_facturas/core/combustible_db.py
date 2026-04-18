"""Combustible module: schema, helpers, import logic."""
from __future__ import annotations

import os
import unicodedata
from core.db import conectar, get_conn

_initialized = False


def _normalize_name(text):
    """Strip diacritics, lowercase, strip whitespace for dedup keys."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(text))
    return "".join(c for c in nfkd if not unicodedata.category(c).startswith("M")).lower().strip()


def init_combustible_db():
    global _initialized
    if _initialized:
        return
    with conectar() as conn:
        # Vehiculos: add missing columns if needed
        v_cols = {r[1] for r in conn.execute("PRAGMA table_info(vehiculos)").fetchall()}
        if "empleado_asignado_id" not in v_cols:
            conn.execute("ALTER TABLE vehiculos ADD COLUMN empleado_asignado_id INTEGER")
        if "activa" not in v_cols:
            conn.execute("ALTER TABLE vehiculos ADD COLUMN activa INTEGER DEFAULT 1")

        # Tarjetas de combustible
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tarjetas_combustible (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pan TEXT UNIQUE NOT NULL,
                proveedor TEXT NOT NULL,
                matricula_default TEXT,
                vehiculo_id INTEGER,
                empleado_id INTEGER,
                activa INTEGER DEFAULT 1,
                notas TEXT
            )
        """)

        # Estaciones de servicio
        conn.execute("""
            CREATE TABLE IF NOT EXISTS estaciones_servicio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                nombre_normalizado TEXT UNIQUE NOT NULL,
                marca TEXT,
                direccion TEXT,
                municipio TEXT,
                provincia TEXT,
                pais TEXT DEFAULT 'ES',
                latitud REAL,
                longitud REAL,
                geocoded INTEGER DEFAULT 0,
                notas TEXT
            )
        """)

        # Backup old table if it has the old schema
        old_cols = {r[1] for r in conn.execute("PRAGMA table_info(combustible_transacciones)").fetchall()}
        if "origen" in old_cols and "proveedor" not in old_cols:
            conn.execute("ALTER TABLE combustible_transacciones RENAME TO combustible_transacciones_old_backup")

        # New transactions table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS combustible_transacciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proveedor TEXT NOT NULL,
                fuente_archivo TEXT,
                fecha_operacion TEXT NOT NULL,
                numero_operacion TEXT,
                tarjeta_pan TEXT,
                tarjeta_id INTEGER,
                matricula_raw TEXT,
                vehiculo_id INTEGER,
                empleado_id INTEGER,
                estacion_raw TEXT,
                estacion_id INTEGER,
                pais TEXT,
                concepto_raw TEXT,
                tipo_producto TEXT,
                litros REAL,
                precio_unitario REAL,
                importe_operacion REAL,
                descuento REAL DEFAULT 0,
                importe_final REAL NOT NULL,
                iva_pct REAL,
                moneda TEXT DEFAULT 'EUR',
                numero_factura_raw TEXT,
                factura_proveedor_id INTEGER,
                proyecto_id INTEGER,
                proyecto_metodo_asig TEXT,
                proyecto_confianza REAL,
                proyecto_revisar INTEGER DEFAULT 0,
                notas TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(proveedor, numero_operacion, fecha_operacion, concepto_raw)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ct_fecha ON combustible_transacciones(fecha_operacion)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ct_matricula ON combustible_transacciones(matricula_raw)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ct_vehiculo ON combustible_transacciones(vehiculo_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ct_proyecto ON combustible_transacciones(proyecto_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ct_estacion ON combustible_transacciones(estacion_id)")

    _initialized = True


def get_or_create_vehiculo(conn, matricula):
    """Get or create vehicle by matricula. Returns (vehiculo_id, is_new)."""
    if not matricula:
        return None, False
    mat = matricula.strip().upper().replace("-", "").replace(" ", "")
    row = conn.execute("SELECT id FROM vehiculos WHERE REPLACE(REPLACE(matricula,'-',''),' ','') = ?", (mat,)).fetchone()
    if row:
        return row[0], False
    conn.execute("INSERT INTO vehiculos (matricula, tipo, created_at) VALUES (?, 'desconocido', datetime('now'))", (matricula.strip(),))
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0], True


def get_or_create_tarjeta(conn, pan, proveedor, matricula=None, vehiculo_id=None):
    """Get or create fuel card by PAN."""
    if not pan:
        return None
    row = conn.execute("SELECT id FROM tarjetas_combustible WHERE pan=?", (pan.strip(),)).fetchone()
    if row:
        return row[0]
    conn.execute(
        "INSERT INTO tarjetas_combustible (pan, proveedor, matricula_default, vehiculo_id) VALUES (?,?,?,?)",
        (pan.strip(), proveedor, matricula, vehiculo_id),
    )
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_or_create_estacion(conn, nombre, marca=None, pais="ES"):
    """Get or create gas station by normalized name. Returns (id, is_new)."""
    if not nombre:
        return None, False
    norm = _normalize_name(nombre)
    row = conn.execute("SELECT id FROM estaciones_servicio WHERE nombre_normalizado=?", (norm,)).fetchone()
    if row:
        return row[0], False
    conn.execute(
        "INSERT INTO estaciones_servicio (nombre, nombre_normalizado, marca, pais) VALUES (?,?,?,?)",
        (nombre.strip(), norm, marca, pais),
    )
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0], True


# ── Moeve Excel parser ──

_TIPO_PRODUCTO_MAP = {
    "DIESEL STAR": "diesel", "DIESEL OPTIMA": "diesel", "GASOLEO": "diesel", "GASOLEOS": "diesel",
    "GASOLEO OPTIMA": "diesel", "GAS.OPT.STAR": "diesel", "GASÓLEO STAR": "diesel",
    "SIN PLOMO": "gasolina", "OPTIMA 95": "gasolina", "OPTIMA 98": "gasolina",
    "GNA.SEM PB 95": "gasolina", "GNA. SEM PB 95": "gasolina", "GNA. SEM PB 98": "gasolina",
    "ECOBLUE GRANEL": "adblue", "ECOBLUE 10 LT": "adblue", "ECOBLUE GARRAFA": "adblue",
    "AUTOPISTAS DE PEAJE": "peaje", "PEAJES DE AUTOPISTAS/TUNELES": "peaje",
    "LUBRICANTES": "lubricante", "ACEITES/LUBES": "lubricante",
    "OTRAS COMPRAS": "otros", "OTRAS COMPRAS REDUCIDO": "otros",
    "APORTACION COMERCIAL": "descuento", "DESCUENTO": "descuento",
}


def importar_excel_moeve(filepath):
    """Import Moeve XLSX. Idempotent via UNIQUE constraint. Returns stats dict."""
    import pandas as pd

    init_combustible_db()
    df = pd.read_excel(filepath, sheet_name="data")
    stats = {"creados": 0, "duplicados": 0, "errores": 0, "vehiculos_nuevos": [], "estaciones_nuevas": []}
    archivo = os.path.basename(filepath)

    conn = get_conn()
    try:
        for idx, row in df.iterrows():
            try:
                # Parse fecha
                fecha_raw = row.get("Date and time") or row.get("Date  and time")
                if pd.isna(fecha_raw):
                    stats["errores"] += 1
                    continue
                if isinstance(fecha_raw, str):
                    fecha = pd.to_datetime(fecha_raw, format="%d/%m/%Y %H:%M:%S", dayfirst=True).strftime("%Y-%m-%d %H:%M:%S")
                else:
                    fecha = pd.to_datetime(fecha_raw).strftime("%Y-%m-%d %H:%M:%S")

                reg = str(row.get("Registratio") or row.get("Registration") or "").strip()
                matricula = reg if reg and reg != "-" else None
                pan = str(row.get("Card") or "").strip()
                estacion_nombre = str(row.get("Location") or "").strip()
                pais_raw = str(row.get("Country") or "").strip().upper()
                pais = "PT" if "PORTUGAL" in pais_raw else "ES"
                concepto = str(row.get("Concept") or "").strip()
                operation_no = str(row.get("Operation No.") or row.get("Operation No") or "").strip()
                factura = str(row.get("Bill") or "").strip()

                tipo_producto = _TIPO_PRODUCTO_MAP.get(concepto, "otros")

                litros = float(row.get("Liters") or 0) if not pd.isna(row.get("Liters")) else 0
                transac = float(row.get("Transac") or 0) if not pd.isna(row.get("Transac")) else 0
                iva = float(row.get("% TAX") or 0) if not pd.isna(row.get("% TAX")) else 0
                moneda = str(row.get("Currency") or "EUR")[:10]
                descuento_raw = row.get("Discount")
                descuento = float(descuento_raw) if descuento_raw and str(descuento_raw).strip() not in ("-", "", "nan") else 0

                # Get or create related entities
                vehiculo_id, v_new = get_or_create_vehiculo(conn, matricula)
                if v_new and matricula:
                    stats["vehiculos_nuevos"].append(matricula)

                tarjeta_id = get_or_create_tarjeta(conn, pan, "moeve", matricula, vehiculo_id) if pan else None

                estacion_id, e_new = get_or_create_estacion(conn, estacion_nombre, "cepsa", pais) if estacion_nombre else (None, False)
                if e_new and estacion_nombre:
                    stats["estaciones_nuevas"].append(estacion_nombre)

                precio_unit = round(transac / litros, 4) if litros > 0 else None
                importe_final = transac + descuento  # descuento is negative when it's a discount

                cursor = conn.execute("""
                    INSERT OR IGNORE INTO combustible_transacciones (
                        proveedor, fuente_archivo, fecha_operacion, numero_operacion,
                        tarjeta_pan, tarjeta_id, matricula_raw, vehiculo_id,
                        estacion_raw, estacion_id, pais,
                        concepto_raw, tipo_producto,
                        litros, precio_unitario, importe_operacion, descuento, importe_final,
                        iva_pct, moneda, numero_factura_raw
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    "moeve", archivo, fecha, operation_no,
                    pan, tarjeta_id, matricula, vehiculo_id,
                    estacion_nombre, estacion_id, pais,
                    concepto, tipo_producto,
                    litros, precio_unit, transac, descuento, importe_final,
                    iva, moneda, factura,
                ))
                if cursor.rowcount > 0:
                    stats["creados"] += 1
                else:
                    stats["duplicados"] += 1

            except Exception as e:
                stats["errores"] += 1

        conn.commit()

        # Deduplicate vehicle/station lists
        stats["vehiculos_nuevos"] = list(set(stats["vehiculos_nuevos"]))
        stats["estaciones_nuevas"] = list(set(stats["estaciones_nuevas"]))

    finally:
        conn.close()

    return stats


def migrar_datos_legacy():
    """Migrate old combustible_transacciones_old_backup to new schema."""
    init_combustible_db()
    conn = get_conn()
    try:
        # Check if backup exists
        tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if "combustible_transacciones_old_backup" not in tables:
            return {"migrados": 0, "mensaje": "No hay datos legacy para migrar"}

        rows = conn.execute("SELECT * FROM combustible_transacciones_old_backup").fetchall()
        migrados = 0
        for r in rows:
            try:
                rd = dict(r)
                fecha = rd.get("fecha") or ""
                hora = rd.get("hora") or ""
                fecha_op = f"{fecha} {hora}".strip() if fecha else None
                if not fecha_op:
                    continue

                matricula = rd.get("matricula")
                vehiculo_id, _ = get_or_create_vehiculo(conn, matricula) if matricula else (None, False)
                estacion = rd.get("estacion") or ""
                estacion_id, _ = get_or_create_estacion(conn, estacion) if estacion else (None, False)

                conn.execute("""
                    INSERT OR IGNORE INTO combustible_transacciones (
                        proveedor, fuente_archivo, fecha_operacion, numero_operacion,
                        matricula_raw, vehiculo_id, estacion_raw, estacion_id, pais,
                        concepto_raw, tipo_producto, litros, importe_final,
                        iva_pct, numero_factura_raw, proyecto_id
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    "legacy", "migracion_legacy", fecha_op, rd.get("operacion") or str(rd.get("id", "")),
                    matricula, vehiculo_id, estacion, estacion_id, rd.get("pais") or "ES",
                    rd.get("concepto") or "", "diesel",
                    rd.get("litros") or 0, rd.get("importe") or 0,
                    rd.get("iva_porcentaje"), rd.get("factura"),
                    rd.get("proyecto_id"),
                ))
                if conn.total_changes:
                    migrados += 1
            except Exception:
                pass

        conn.commit()
        return {"migrados": migrados}
    finally:
        conn.close()
