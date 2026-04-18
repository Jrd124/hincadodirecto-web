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

        # Archive old table if it has old schema (origen column = old, proveedor = new)
        ct_cols = {r[1] for r in conn.execute("PRAGMA table_info(combustible_transacciones)").fetchall()}
        if "origen" in ct_cols and "proveedor" not in ct_cols:
            # Old schema still active — rename to archive
            arch_name = "combustible_transacciones_archivo_20260419"
            existing_arch = conn.execute("SELECT name FROM sqlite_master WHERE name=?", (arch_name,)).fetchone()
            if not existing_arch:
                conn.execute(f"ALTER TABLE combustible_transacciones RENAME TO {arch_name}")
            else:
                conn.execute("DROP TABLE combustible_transacciones")

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
    conn.execute("INSERT INTO vehiculos (matricula, tipo, activa, created_at) VALUES (?, 'otro', 1, datetime('now'))", (matricula.strip(),))
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
    import logging
    import pandas as pd
    logger = logging.getLogger("erp")

    init_combustible_db()
    df = pd.read_excel(filepath, sheet_name="data")
    # Normalize column names: strip whitespace
    df.columns = [str(c).strip() for c in df.columns]
    logger.info("Moeve import: %d rows from %s. Columns: %s", len(df), os.path.basename(filepath), list(df.columns))

    stats = {"creados": 0, "duplicados": 0, "errores": 0, "errores_detalle": [], "vehiculos_nuevos": [], "estaciones_nuevas": []}
    archivo = os.path.basename(filepath)

    # Find column names flexibly
    def _col(df, *candidates):
        for c in candidates:
            if c in df.columns:
                return c
            for dc in df.columns:
                if dc.lower().replace(" ", "") == c.lower().replace(" ", ""):
                    return dc
        return None

    col_date = _col(df, "Date and time", "Date  and time", "Date and Time")
    col_card = _col(df, "Card")
    col_reg = _col(df, "Registratio", "Registration")
    col_loc = _col(df, "Location")
    col_country = _col(df, "Country")
    col_concept = _col(df, "Concept")
    col_opno = _col(df, "Operation No.", "Operation No", "OperationNo.")
    col_bill = _col(df, "Bill")
    col_liters = _col(df, "Liters")
    col_transac = _col(df, "Transac")
    col_tax = _col(df, "% TAX", "%TAX")
    col_currency = _col(df, "Currency")
    col_discount = _col(df, "Discount")

    logger.info("Moeve columns mapped: date=%s opno=%s reg=%s concept=%s", col_date, col_opno, col_reg, col_concept)

    conn = get_conn()
    try:
        for idx, row in df.iterrows():
            try:
                # Parse fecha
                fecha_raw = row[col_date] if col_date else None
                if fecha_raw is None or (isinstance(fecha_raw, float) and pd.isna(fecha_raw)):
                    stats["errores"] += 1
                    continue
                try:
                    if isinstance(fecha_raw, str):
                        fecha = pd.to_datetime(fecha_raw, dayfirst=True).strftime("%Y-%m-%d %H:%M:%S")
                    else:
                        fecha = pd.to_datetime(fecha_raw).strftime("%Y-%m-%d %H:%M:%S")
                except Exception:
                    stats["errores"] += 1
                    continue

                reg = str(row[col_reg] if col_reg else "").strip() if col_reg else ""
                matricula = reg if reg and reg != "-" and reg != "nan" else None
                pan = str(row[col_card] if col_card else "").strip()
                if pan == "nan": pan = ""
                estacion_nombre = str(row[col_loc] if col_loc else "").strip()
                if estacion_nombre == "nan": estacion_nombre = ""
                pais_raw = str(row[col_country] if col_country else "").strip().upper()
                pais = "PT" if "PORTUGAL" in pais_raw else "ES"
                concepto = str(row[col_concept] if col_concept else "").strip()
                if concepto == "nan": concepto = ""

                # Operation number — critical for dedup
                opno_raw = row[col_opno] if col_opno else None
                if opno_raw is None or (isinstance(opno_raw, float) and pd.isna(opno_raw)):
                    operation_no = f"row_{idx}"  # fallback: use row index
                else:
                    operation_no = str(int(opno_raw) if isinstance(opno_raw, float) and opno_raw == int(opno_raw) else opno_raw).strip()

                factura = str(row[col_bill] if col_bill else "").strip()
                if factura == "nan": factura = ""

                tipo_producto = _TIPO_PRODUCTO_MAP.get(concepto, "otros")

                def _safe_float(v):
                    if v is None: return 0.0
                    if isinstance(v, (int, float)) and not pd.isna(v): return float(v)
                    try: return float(str(v).replace(",", "."))
                    except (ValueError, TypeError): return 0.0

                litros = _safe_float(row[col_liters] if col_liters else 0)
                transac = _safe_float(row[col_transac] if col_transac else 0)
                iva = _safe_float(row[col_tax] if col_tax else 0)
                moneda = str(row[col_currency] if col_currency else "EUR")[:10]
                if moneda == "nan": moneda = "EUR"
                descuento_raw = row[col_discount] if col_discount else None
                descuento = _safe_float(descuento_raw) if descuento_raw is not None and str(descuento_raw).strip() not in ("-", "", "nan") else 0

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
                err_msg = f"Fila {idx}: {e}"
                stats["errores_detalle"].append(err_msg)
                logger.warning("Moeve import error: %s", err_msg)

        conn.commit()
        logger.info("Moeve import done: %d created, %d dupes, %d errors", stats["creados"], stats["duplicados"], stats["errores"])

        # Deduplicate vehicle/station lists
        stats["vehiculos_nuevos"] = list(set(stats["vehiculos_nuevos"]))
        stats["estaciones_nuevas"] = list(set(stats["estaciones_nuevas"]))

    finally:
        conn.close()

    return stats


def get_archivo_legacy_count():
    """Returns count of archived legacy records."""
    conn = get_conn()
    try:
        tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if "combustible_transacciones_archivo_20260419" in tables:
            return conn.execute("SELECT COUNT(*) FROM combustible_transacciones_archivo_20260419").fetchone()[0]
        return 0
    finally:
        conn.close()
