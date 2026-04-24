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
        if "es_alquiler" not in v_cols:
            conn.execute("ALTER TABLE vehiculos ADD COLUMN es_alquiler INTEGER DEFAULT 0")
        if "fecha_alquiler_inicio" not in v_cols:
            conn.execute("ALTER TABLE vehiculos ADD COLUMN fecha_alquiler_inicio TEXT")
        if "fecha_alquiler_fin" not in v_cols:
            conn.execute("ALTER TABLE vehiculos ADD COLUMN fecha_alquiler_fin TEXT")
        if "proveedor_alquiler" not in v_cols:
            conn.execute("ALTER TABLE vehiculos ADD COLUMN proveedor_alquiler TEXT")

        # Vehiculos asignaciones (base + responsable historico)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS vehiculos_asignaciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vehiculo_id INTEGER NOT NULL,
                fecha_inicio TEXT NOT NULL,
                fecha_fin TEXT,
                base TEXT NOT NULL,
                responsable_id INTEGER,
                responsable_nombre TEXT,
                notas TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_veh_asig_vehiculo ON vehiculos_asignaciones(vehiculo_id)")

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
    # Diesel
    "DIESEL STAR": "diesel", "DIESEL OPTIMA": "diesel", "DIESEL E+": "diesel",
    "DIESEL E+ NEOTECH": "diesel", "GASOLEO": "diesel", "GASOLEOS": "diesel",
    "GASOLEO OPTIMA": "diesel", "GAS.OPT.STAR": "diesel", "GASÓLEO STAR": "diesel",
    # Gasolina
    "SIN PLOMO": "gasolina", "GASOLINA 95": "gasolina", "OPTIMA 95": "gasolina",
    "OPTIMA 98": "gasolina", "EFITEC 95 N (L)": "gasolina", "EFITEC 98 N (L)": "gasolina",
    "GNA.SEM PB 95": "gasolina", "GNA. SEM PB 95": "gasolina", "GNA. SEM PB 98": "gasolina",
    # AdBlue
    "ECOBLUE": "adblue", "ECOBLUE GRANEL": "adblue", "ECOBLUE 10 LT": "adblue",
    "ECOBLUE GARRAFA": "adblue",
    # Peajes
    "AUTOPISTAS DE PEAJE": "peaje", "PEAJES DE AUTOPISTAS/TUNELES": "peaje",
    # Lubricantes
    "LUBRICANTES": "lubricante", "ACEITES/LUBES": "lubricante",
    # Descuentos
    "APORTACION COMERCIAL": "descuento", "DESCUENTO": "descuento",
    "DESCUENTO FIJO": "descuento", "DESCUENTO % DESPUES IMPUESTOS": "descuento",
    "Descuento Extra SOLRED": "descuento", u"Promoción 5 cts./litro": "descuento",
    # Otros
    "OTRAS COMPRAS": "otros", "OTRAS COMPRAS REDUCIDO": "otros", "TIENDA": "otros",
}


def _tipo_producto(concepto):
    """Map concept to product type with fuzzy fallback for unknown concepts."""
    tp = _TIPO_PRODUCTO_MAP.get(concepto)
    if tp:
        return tp
    cu = concepto.upper()
    if "DIESEL" in cu or "GASOLEO" in cu:
        return "diesel"
    if "GASOLINA" in cu or "PLOMO" in cu or "EFITEC" in cu:
        return "gasolina"
    if "BLUE" in cu:
        return "adblue"
    if "PEAJE" in cu or "AUTOPISTA" in cu:
        return "peaje"
    if "DESCUENTO" in cu or "APORTACION" in cu or "PROMOCI" in cu:
        return "descuento"
    if "LUBRIC" in cu or "ACEITE" in cu:
        return "lubricante"
    return "otros"


def _detectar_header_row(filepath, sheet_name="data"):
    """Detect which row contains the header by looking for known column names."""
    import pandas as pd
    try:
        df_raw = pd.read_excel(filepath, sheet_name=sheet_name, header=None, nrows=5)
        for i, row in df_raw.iterrows():
            vals = [str(v).strip().lower() for v in row.values if pd.notna(v)]
            if any("card" in v for v in vals) and any("date" in v for v in vals):
                return i
    except Exception:
        pass
    return 0


def _generar_operation_no(row, idx, col_opno, col_date, col_reg, col_concept, col_liters):
    """Generate a stable operation number. Uses OpNo if real, else hash of key fields."""
    import hashlib
    import pandas as pd

    opno_raw = row[col_opno] if col_opno else None
    # Check if it's a real OpNo (not 0, NaN, empty)
    if opno_raw is not None and not (isinstance(opno_raw, float) and pd.isna(opno_raw)):
        opno_str = str(int(opno_raw) if isinstance(opno_raw, float) and opno_raw == int(opno_raw) else opno_raw).strip()
        if opno_str and opno_str not in ("0", "nan", "None", ""):
            return opno_str

    # Generate stable hash from key fields
    fecha = str(row.get(col_date, "") if col_date else "").strip()
    matricula = str(row.get(col_reg, "") if col_reg else "").strip()
    concepto = str(row.get(col_concept, "") if col_concept else "").strip()
    litros = str(row.get(col_liters, "") if col_liters else "").strip()
    key = f"{fecha}|{matricula}|{concepto}|{litros}"
    hash_id = hashlib.md5(key.encode()).hexdigest()[:12]
    return f"auto_{hash_id}"


def importar_excel_moeve(filepath):
    """Import Moeve XLSX. Idempotent via UNIQUE constraint. Returns stats dict."""
    import logging
    import pandas as pd
    logger = logging.getLogger("erp")

    init_combustible_db()

    # Auto-detect header row (supports both invoice Excel and web Excel)
    header_row = _detectar_header_row(filepath)
    logger.info("Moeve import: detected header at row %d", header_row)
    df = pd.read_excel(filepath, sheet_name="data", header=header_row)
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

                # Operation number — critical for dedup (stable across web + invoice Excels)
                operation_no = _generar_operation_no(row, idx, col_opno, col_date, col_reg, col_concept, col_liters)

                factura = str(row[col_bill] if col_bill else "").strip()
                if factura == "nan": factura = ""

                tipo_producto = _tipo_producto(concepto)

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

                # Extra dedup for auto-generated OpNos: check by actual field values
                if operation_no.startswith("auto_"):
                    existente = conn.execute(
                        "SELECT id FROM combustible_transacciones WHERE proveedor='moeve' AND fecha_operacion=? AND concepto_raw=? AND matricula_raw=? AND ABS(COALESCE(litros,0) - ?) < 0.01",
                        (fecha, concepto, matricula, litros),
                    ).fetchone()
                    if existente:
                        stats["duplicados"] += 1
                        continue

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


# ── Solred PDF parser ─────────────────────────────────────────────────────

import re as _re
import logging as _logging
_solred_logger = _logging.getLogger("erp")

_SOLRED_TIPO_MAP = {}
for _k in ("DIESEL E+ NEOTECH (L)", "DIESEL E+ NEO", "DIESEL E+", "GASOLEO", "DIESEL"):
    _SOLRED_TIPO_MAP[_k.upper()] = "diesel"
for _k in ("EFITEC 95 N (L)", "EFITEC 98 N (L)", "GASOLINA", "SIN PLOMO"):
    _SOLRED_TIPO_MAP[_k.upper()] = "gasolina"
for _k in ("ADBLUE",):
    _SOLRED_TIPO_MAP[_k.upper()] = "adblue"

_SOLRED_CONCEPTOS = [
    "DIESEL E+ NEOTECH (L)", "DIESEL E+ NEO", "DIESEL E+",
    "EFITEC 95 N (L)", "EFITEC 98 N (L)", "ADBLUE",
]


def _solred_to_float(v):
    if v is None or v == "":
        return None
    s = str(v).replace("%", "").strip()
    # Spanish format: 1.234,56 → remove dots, comma to period
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _solred_tipo_producto(concepto):
    c = (concepto or "").upper().strip()
    for k, v in _SOLRED_TIPO_MAP.items():
        if k in c:
            return v
    return "otros"


def _parse_row_solred(row, is_new_format):
    """Parse a table row when pdfplumber separates columns properly."""
    try:
        ref = str(row[0] or "").strip()
        if not ref or not ref.replace(".", "").isdigit():
            return None
        fecha_hora = str(row[1] or "").strip()
        m = _re.match(r"(\d{2}/\d{2})\s*(\d{2}:\d{2})", fecha_hora)
        if not m:
            return None
        concepto = str(row[2] or "").strip()
        establecimiento = str(row[3] or "").strip()
        if is_new_format:
            litros = _solred_to_float(row[5]) if len(row) > 5 else None
            precio = _solred_to_float(row[7]) if len(row) > 7 else None
            importe_op = _solred_to_float(row[10]) if len(row) > 10 else None
            bonif = _solred_to_float(row[13]) if len(row) > 13 else 0
            importe_total = _solred_to_float(row[14]) if len(row) > 14 else None
        else:
            litros = _solred_to_float(row[5]) if len(row) > 5 else None
            precio = _solred_to_float(row[6]) if len(row) > 6 else None
            importe_op = _solred_to_float(row[7]) if len(row) > 7 else None
            bonif = _solred_to_float(row[10]) if len(row) > 10 else 0
            importe_total = _solred_to_float(row[11]) if len(row) > 11 else None
        return {
            "ref": ref, "fecha_dia": m.group(1), "hora": m.group(2),
            "concepto": concepto, "establecimiento": establecimiento,
            "litros": litros, "precio": precio,
            "importe_operacion": importe_op or importe_total,
            "bonificacion": bonif or 0, "importe_total": importe_total or importe_op,
        }
    except Exception as e:
        _solred_logger.warning("_parse_row_solred error: %s row=%s", e, row)
        return None


def _parse_linea_solred(line):
    """Parse a text line when pdfplumber merges rows with newlines."""
    line = (line or "").strip()
    if not line:
        return None
    parts = line.split()
    if not parts or not parts[0].replace(".", "").isdigit():
        return None
    ref = parts[0]
    m = _re.search(r"(\d{2}/\d{2})\s*(\d{2}:\d{2})", line)
    if not m:
        return None
    after = line[m.end():].strip()
    # Extract all decimal numbers from the end
    nums = _re.findall(r"-?\d[\d.]*,\d+", after)
    if len(nums) < 3:
        return None
    importe_total = _solred_to_float(nums[-1])
    bonif = _solred_to_float(nums[-2]) if len(nums) >= 4 else 0
    litros = _solred_to_float(nums[0])
    precio = _solred_to_float(nums[1]) if len(nums) >= 2 else None
    # Text before first number = concepto + establecimiento
    first_num_pos = after.find(nums[0]) if nums else len(after)
    texto = after[:first_num_pos].strip()
    concepto = texto
    establecimiento = ""
    for c in _SOLRED_CONCEPTOS:
        if texto.upper().startswith(c.upper()):
            concepto = c
            establecimiento = texto[len(c):].strip()
            break
    return {
        "ref": ref, "fecha_dia": m.group(1), "hora": m.group(2),
        "concepto": concepto, "establecimiento": establecimiento,
        "litros": litros, "precio": precio,
        "importe_operacion": importe_total, "bonificacion": bonif or 0,
        "importe_total": importe_total,
    }


def importar_pdf_solred(filepath):
    """Import Solred PDF invoice. Idempotent. Returns stats dict."""
    import pdfplumber

    init_combustible_db()
    stats = {"creados": 0, "duplicados": 0, "errores": 0, "estaciones_nuevas": [], "errores_detalle": []}
    archivo = os.path.basename(filepath)

    conn = get_conn()
    try:
        with pdfplumber.open(filepath) as pdf:
            all_text = "\n".join((p.extract_text() or "") for p in pdf.pages)

            # Factura number
            m_fac = _re.search(r"N[uú]m\.?\s*Factura\s+([A-Z0-9]+)", all_text)
            numero_factura = m_fac.group(1) if m_fac else None

            # Year from periodo
            m_per = _re.search(r"(\d{2}/\d{2}/(\d{4}))\s+AL\s+\d{2}/\d{2}/\d{4}", all_text)
            anio = int(m_per.group(2)) if m_per else None
            if not anio:
                m_yr = _re.search(r"20\d{2}", archivo)
                anio = int(m_yr.group()) if m_yr else 2026

            # Tarjeta suffix
            m_tar = _re.search(r"\*{4}\s*\*{4}\s*\*{4}\s*(\d{4})", all_text)
            tarjeta_sufijo = m_tar.group(1) if m_tar else "0000"
            tarjeta_pan = f"solred-{tarjeta_sufijo}"
            tarjeta_id = get_or_create_tarjeta(conn, tarjeta_pan, "solred")

            # Extract transactions from tables on all pages
            txns = []
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in (tables or []):
                    if not table or len(table) < 2:
                        continue
                    header_text = " ".join(str(c or "") for c in table[0]).lower()
                    if "ref" not in header_text and "fecha" not in header_text:
                        continue
                    is_new = "cantidad" in header_text or "precio neto" in header_text
                    for row in table[1:]:
                        if not row or not row[0]:
                            continue
                        cell0 = str(row[0] or "")
                        if "\n" in cell0:
                            for line in cell0.split("\n"):
                                p = _parse_linea_solred(line)
                                if p:
                                    txns.append(p)
                        else:
                            p = _parse_row_solred(row, is_new)
                            if p:
                                txns.append(p)

                # Also try extracting from raw text (fallback for badly structured tables)
                page_text = page.extract_text() or ""
                for line in page_text.split("\n"):
                    line = line.strip()
                    if line and line[0].isdigit() and _re.match(r"\d{5,}", line.split()[0] if line.split() else ""):
                        p = _parse_linea_solred(line)
                        if p and not any(t["ref"] == p["ref"] for t in txns):
                            txns.append(p)

            _solred_logger.info("Solred PDF: %d transactions found in %s", len(txns), archivo)

            for t in txns:
                try:
                    fecha_str = f"{t['fecha_dia']}/{anio} {t['hora']}"
                    try:
                        from datetime import datetime as _dt
                        fecha_iso = _dt.strptime(fecha_str, "%d/%m/%Y %H:%M").strftime("%Y-%m-%d %H:%M:%S")
                    except ValueError:
                        stats["errores"] += 1
                        continue

                    estacion = (t.get("establecimiento") or "").strip()
                    estacion_id, e_new = get_or_create_estacion(conn, estacion, "repsol", "ES") if estacion else (None, False)
                    if e_new:
                        stats["estaciones_nuevas"].append(estacion)

                    tipo_prod = _solred_tipo_producto(t["concepto"])
                    bonif = abs(t.get("bonificacion") or 0)

                    cursor = conn.execute("""
                        INSERT OR IGNORE INTO combustible_transacciones (
                            proveedor, fuente_archivo, fecha_operacion, numero_operacion,
                            tarjeta_pan, tarjeta_id, pais,
                            estacion_raw, estacion_id,
                            concepto_raw, tipo_producto,
                            litros, precio_unitario, importe_operacion, descuento, importe_final,
                            iva_pct, moneda, numero_factura_raw
                        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, (
                        "solred", archivo, fecha_iso, t["ref"],
                        tarjeta_pan, tarjeta_id, "ES",
                        estacion, estacion_id,
                        t["concepto"], tipo_prod,
                        t.get("litros"), t.get("precio"),
                        t.get("importe_operacion"), -bonif, t.get("importe_total") or 0,
                        21.0, "EUR", numero_factura,
                    ))
                    if cursor.rowcount > 0:
                        stats["creados"] += 1
                    else:
                        stats["duplicados"] += 1
                except Exception as e:
                    stats["errores"] += 1
                    if len(stats["errores_detalle"]) < 10:
                        stats["errores_detalle"].append(f"{t.get('ref','?')}: {e}")
                    _solred_logger.warning("Solred import error: %s", e)

        conn.commit()
        _solred_logger.info("Solred import done: %d created, %d dupes, %d errors", stats["creados"], stats["duplicados"], stats["errores"])
    finally:
        conn.close()

    stats["estaciones_nuevas"] = list(set(stats["estaciones_nuevas"]))
    return stats
