"""Fase 2A — Repuestos críticos, proveedores/talleres y análisis base.

Módulo único que concentra:
  • Catálogo de repuestos (criticidad A/B/C, stock, equivalencias)
  • Consumo de repuestos ligado a incidencias
  • Proveedores/talleres de maquinaria
  • Criticidad sugerida de máquina
  • Resumen de flota
"""
from __future__ import annotations

from datetime import date, timedelta

from core.db import conectar as _conectar, now_iso as _now


# ═══════════════════════════════════════════════════════════════════════════════
# ██  Inicialización de tablas                                                ██
# ═══════════════════════════════════════════════════════════════════════════════

_initialized = False


def init_fase2a_db() -> None:
    """Crea tablas de Fase 2A si no existen. Idempotente."""
    global _initialized
    if _initialized:
        return
    with _conectar() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_proveedores (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre                  TEXT NOT NULL,
                tipo                    TEXT DEFAULT 'taller'
                                        CHECK(tipo IN ('taller','proveedor','ambos')),
                zona                    TEXT,
                contacto                TEXT,
                telefono                TEXT,
                email                   TEXT,
                direccion               TEXT,
                salida_a_obra           INTEGER DEFAULT 0,
                tiempo_respuesta_dias   REAL,
                valoracion_interna      INTEGER
                                        CHECK(valoracion_interna IS NULL OR
                                              (valoracion_interna BETWEEN 1 AND 5)),
                notas                   TEXT,
                activo                  INTEGER DEFAULT 1,
                created_at              TEXT NOT NULL,
                updated_at              TEXT
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_proveedor_compatibilidad (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                proveedor_id INTEGER NOT NULL
                             REFERENCES maquinaria_proveedores(id) ON DELETE CASCADE,
                marca       TEXT,
                modelo      TEXT,
                subsistema  TEXT,
                notas       TEXT,
                UNIQUE(proveedor_id, marca, modelo, subsistema)
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_repuestos (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo              TEXT NOT NULL UNIQUE,
                descripcion         TEXT NOT NULL,
                criticidad          TEXT DEFAULT 'C'
                                    CHECK(criticidad IN ('A','B','C')),
                stock_actual        REAL DEFAULT 0,
                stock_minimo        REAL DEFAULT 0,
                unidad              TEXT DEFAULT 'ud',
                ubicacion_fisica    TEXT,
                equivalente_id      INTEGER
                                    REFERENCES maquinaria_repuestos(id),
                notas_equivalencia  TEXT,
                proveedor_habitual_id INTEGER
                                    REFERENCES maquinaria_proveedores(id),
                lead_time_dias      INTEGER,
                precio_unitario     REAL,
                activo              INTEGER DEFAULT 1,
                created_at          TEXT NOT NULL,
                updated_at          TEXT
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_repuesto_maquina (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                repuesto_id             INTEGER NOT NULL
                                        REFERENCES maquinaria_repuestos(id) ON DELETE CASCADE,
                maquina_id              INTEGER
                                        REFERENCES maquinas(id) ON DELETE CASCADE,
                marca                   TEXT,
                modelo                  TEXT,
                subsistema              TEXT,
                cantidad_recomendada    REAL DEFAULT 1,
                notas                   TEXT,
                CHECK (
                    (maquina_id IS NOT NULL AND marca IS NULL AND modelo IS NULL)
                    OR
                    (maquina_id IS NULL AND (marca IS NOT NULL OR modelo IS NOT NULL))
                )
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS maquinaria_consumo_repuesto (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                repuesto_id     INTEGER NOT NULL
                                REFERENCES maquinaria_repuestos(id),
                incidencia_id   INTEGER
                                REFERENCES maquinaria_incidencias(id),
                maquina_id      INTEGER NOT NULL
                                REFERENCES maquinas(id),
                cantidad        REAL NOT NULL DEFAULT 1,
                precio_unitario REAL,
                coste_total     REAL,
                fecha           TEXT NOT NULL,
                registrado_por  INTEGER REFERENCES usuarios(id),
                notas           TEXT,
                created_at      TEXT NOT NULL
            )
        """)

    _initialized = True


# ═══════════════════════════════════════════════════════════════════════════════
# ██  REPUESTOS — CRUD                                                        ██
# ═══════════════════════════════════════════════════════════════════════════════

def crear_repuesto(data: dict) -> dict:
    """Crea un repuesto en el catálogo."""
    init_fase2a_db()
    codigo = (data.get("codigo") or "").strip()
    descripcion = (data.get("descripcion") or "").strip()
    if not codigo or not descripcion:
        return {"error": "codigo y descripcion son obligatorios"}

    now = _now()
    with _conectar() as conn:
        # Unicidad de código
        existe = conn.execute(
            "SELECT id FROM maquinaria_repuestos WHERE codigo = ?", [codigo]
        ).fetchone()
        if existe:
            return {"error": f"Ya existe un repuesto con código '{codigo}'"}

        conn.execute(
            "INSERT INTO maquinaria_repuestos "
            "(codigo, descripcion, criticidad, stock_actual, stock_minimo, unidad, "
            " ubicacion_fisica, equivalente_id, notas_equivalencia, "
            " proveedor_habitual_id, lead_time_dias, precio_unitario, activo, "
            " created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
                codigo,
                descripcion,
                data.get("criticidad", "C"),
                data.get("stock_actual", 0),
                data.get("stock_minimo", 0),
                data.get("unidad", "ud"),
                data.get("ubicacion_fisica"),
                data.get("equivalente_id"),
                data.get("notas_equivalencia"),
                data.get("proveedor_habitual_id"),
                data.get("lead_time_dias"),
                data.get("precio_unitario"),
                1,
                now,
                now,
            ],
        )
        rid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return obtener_repuesto_by_id(rid, conn=conn)


def obtener_repuesto_by_id(repuesto_id: int, *, conn=None) -> dict | None:
    """Obtiene un repuesto por ID, opcionalmente reutilizando conexión."""
    init_fase2a_db()

    def _fetch(c):
        row = c.execute(
            "SELECT * FROM maquinaria_repuestos WHERE id = ?", [repuesto_id]
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        # Equivalente
        if d.get("equivalente_id"):
            eq = c.execute(
                "SELECT codigo, descripcion FROM maquinaria_repuestos WHERE id = ?",
                [d["equivalente_id"]],
            ).fetchone()
            d["equivalente_codigo"] = eq["codigo"] if eq else None
            d["equivalente_descripcion"] = eq["descripcion"] if eq else None
        # Proveedor habitual
        if d.get("proveedor_habitual_id"):
            prov = c.execute(
                "SELECT nombre FROM maquinaria_proveedores WHERE id = ?",
                [d["proveedor_habitual_id"]],
            ).fetchone()
            d["proveedor_habitual_nombre"] = prov["nombre"] if prov else None
        return d

    if conn:
        return _fetch(conn)
    with _conectar() as c:
        return _fetch(c)


def actualizar_repuesto(repuesto_id: int, data: dict) -> dict:
    """Actualiza campos de un repuesto."""
    init_fase2a_db()
    campos_editables = (
        "codigo", "descripcion", "criticidad", "stock_actual", "stock_minimo",
        "unidad", "ubicacion_fisica", "equivalente_id", "notas_equivalencia",
        "proveedor_habitual_id", "lead_time_dias", "precio_unitario", "activo",
    )
    sets = []
    vals = []
    for campo in campos_editables:
        if campo in data:
            sets.append(f"{campo} = ?")
            vals.append(data[campo])
    if not sets:
        return {"error": "No hay campos para actualizar"}

    sets.append("updated_at = ?")
    vals.append(_now())
    vals.append(repuesto_id)

    with _conectar() as conn:
        conn.execute(
            f"UPDATE maquinaria_repuestos SET {', '.join(sets)} WHERE id = ?", vals
        )
        return obtener_repuesto_by_id(repuesto_id, conn=conn) or {"error": "No encontrado"}


def listar_repuestos(
    criticidad: str | None = None,
    activo: bool | None = True,
    busqueda: str | None = None,
    limit: int = 200,
) -> list[dict]:
    """Lista repuestos con filtros opcionales."""
    init_fase2a_db()
    with _conectar() as conn:
        q = "SELECT r.*, p.nombre AS proveedor_habitual_nombre FROM maquinaria_repuestos r "
        q += "LEFT JOIN maquinaria_proveedores p ON p.id = r.proveedor_habitual_id WHERE 1=1"
        params: list = []
        if criticidad:
            q += " AND r.criticidad = ?"
            params.append(criticidad)
        if activo is not None:
            q += " AND r.activo = ?"
            params.append(1 if activo else 0)
        if busqueda:
            q += " AND (r.codigo LIKE ? OR r.descripcion LIKE ?)"
            params.extend([f"%{busqueda}%", f"%{busqueda}%"])
        q += f" ORDER BY r.criticidad, r.codigo LIMIT {limit}"
        return [dict(r) for r in conn.execute(q, params).fetchall()]


# ═══════════════════════════════════════════════════════════════════════════════
# ██  VINCULACIÓN REPUESTO ↔ MÁQUINA / MODELO                                ██
# ═══════════════════════════════════════════════════════════════════════════════

def vincular_repuesto_maquina(data: dict) -> dict:
    """Vincula un repuesto a una máquina concreta O a una marca/modelo."""
    init_fase2a_db()
    repuesto_id = data.get("repuesto_id")
    maquina_id = data.get("maquina_id")
    marca = data.get("marca")
    modelo = data.get("modelo")

    if not repuesto_id:
        return {"error": "repuesto_id es obligatorio"}

    # Validar modo: máquina concreta XOR marca/modelo
    if maquina_id and (marca or modelo):
        return {"error": "Usar maquina_id O marca/modelo, no ambos"}
    if not maquina_id and not marca and not modelo:
        return {"error": "Debe indicar maquina_id o al menos marca o modelo"}

    with _conectar() as conn:
        # Verificar duplicado lógico
        if maquina_id:
            dup = conn.execute(
                "SELECT id FROM maquinaria_repuesto_maquina "
                "WHERE repuesto_id = ? AND maquina_id = ? AND subsistema IS ?",
                [repuesto_id, maquina_id, data.get("subsistema")],
            ).fetchone()
        else:
            dup = conn.execute(
                "SELECT id FROM maquinaria_repuesto_maquina "
                "WHERE repuesto_id = ? AND maquina_id IS NULL "
                "AND marca IS ? AND modelo IS ? AND subsistema IS ?",
                [repuesto_id, marca, modelo, data.get("subsistema")],
            ).fetchone()
        if dup:
            return {"error": "Vinculación ya existe"}

        conn.execute(
            "INSERT INTO maquinaria_repuesto_maquina "
            "(repuesto_id, maquina_id, marca, modelo, subsistema, "
            " cantidad_recomendada, notas) VALUES (?,?,?,?,?,?,?)",
            [
                repuesto_id,
                maquina_id if maquina_id else None,
                marca if not maquina_id else None,
                modelo if not maquina_id else None,
                data.get("subsistema"),
                data.get("cantidad_recomendada", 1),
                data.get("notas"),
            ],
        )
        vid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return {"ok": True, "id": vid}


def desvincular_repuesto_maquina(vinculo_id: int) -> dict:
    """Elimina una vinculación repuesto-máquina."""
    init_fase2a_db()
    with _conectar() as conn:
        deleted = conn.execute(
            "DELETE FROM maquinaria_repuesto_maquina WHERE id = ?", [vinculo_id]
        ).rowcount
        return {"ok": deleted > 0}


def listar_repuestos_para_maquina(maquina_id: int) -> list[dict]:
    """Repuestos vinculados a una máquina concreta o a su marca/modelo."""
    init_fase2a_db()
    with _conectar() as conn:
        maq = conn.execute(
            "SELECT marca, modelo FROM maquinas WHERE id = ?", [maquina_id]
        ).fetchone()
        if not maq:
            return []
        marca = maq["marca"]
        modelo = maq["modelo"]

        rows = conn.execute(
            "SELECT rm.*, r.codigo, r.descripcion, r.criticidad, r.stock_actual, "
            "       r.stock_minimo, r.unidad, r.precio_unitario "
            "FROM maquinaria_repuesto_maquina rm "
            "JOIN maquinaria_repuestos r ON r.id = rm.repuesto_id "
            "WHERE r.activo = 1 AND ("
            "  rm.maquina_id = ? "
            "  OR (rm.maquina_id IS NULL AND ("
            "       (rm.marca = ? AND (rm.modelo IS NULL OR rm.modelo = ?)) "
            "       OR (rm.marca IS NULL AND rm.modelo = ?)"
            "  ))"
            ") ORDER BY r.criticidad, r.codigo",
            [maquina_id, marca, modelo, modelo],
        ).fetchall()
        return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════════════════════════════════
# ██  CONSUMO DE REPUESTOS                                                    ██
# ═══════════════════════════════════════════════════════════════════════════════

def registrar_consumo(data: dict) -> dict:
    """Registra consumo de repuesto. Fuente de verdad para stock y coste.

    - Decrementa stock_actual (permite negativo con alerta).
    - Si incidencia_id, recalcula coste_repuesto en la incidencia.
    - Devuelve alerta graduada si stock bajo o negativo.
    """
    init_fase2a_db()
    repuesto_id = data.get("repuesto_id")
    maquina_id = data.get("maquina_id")
    cantidad = data.get("cantidad", 1)
    if not repuesto_id or not maquina_id:
        return {"error": "repuesto_id y maquina_id son obligatorios"}
    if cantidad <= 0:
        return {"error": "cantidad debe ser > 0"}

    incidencia_id = data.get("incidencia_id")
    now = _now()

    with _conectar() as conn:
        # Obtener repuesto
        rep = conn.execute(
            "SELECT * FROM maquinaria_repuestos WHERE id = ?", [repuesto_id]
        ).fetchone()
        if not rep:
            return {"error": "Repuesto no encontrado"}

        # Precio: usar el proporcionado o el del catálogo
        precio = data.get("precio_unitario")
        if precio is None:
            precio = rep["precio_unitario"]
        coste_total = round(cantidad * precio, 2) if precio is not None else None

        # INSERT consumo
        conn.execute(
            "INSERT INTO maquinaria_consumo_repuesto "
            "(repuesto_id, incidencia_id, maquina_id, cantidad, precio_unitario, "
            " coste_total, fecha, registrado_por, notas, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            [
                repuesto_id,
                incidencia_id,
                maquina_id,
                cantidad,
                precio,
                coste_total,
                data.get("fecha") or date.today().isoformat(),
                data.get("registrado_por"),
                data.get("notas"),
                now,
            ],
        )
        consumo_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        # Decrementar stock (permite negativo)
        conn.execute(
            "UPDATE maquinaria_repuestos SET stock_actual = stock_actual - ?, updated_at = ? "
            "WHERE id = ?",
            [cantidad, now, repuesto_id],
        )

        # Leer stock actualizado
        nuevo_stock = conn.execute(
            "SELECT stock_actual, stock_minimo, criticidad, codigo "
            "FROM maquinaria_repuestos WHERE id = ?", [repuesto_id]
        ).fetchone()

        # Recalcular coste_repuesto en incidencia (fuente de verdad)
        if incidencia_id:
            _recalcular_coste_incidencia(conn, incidencia_id)

        # Generar alerta
        alerta = _evaluar_alerta_stock(
            nuevo_stock["stock_actual"],
            nuevo_stock["stock_minimo"],
            nuevo_stock["criticidad"],
            nuevo_stock["codigo"],
        )

        return {
            "ok": True,
            "id": consumo_id,
            "stock_actual": nuevo_stock["stock_actual"],
            "alerta": alerta,
        }


def _recalcular_coste_incidencia(conn, incidencia_id: int) -> None:
    """Recalcula coste_repuesto en la incidencia desde la suma real de consumos."""
    total = conn.execute(
        "SELECT COALESCE(SUM(coste_total), 0) AS total "
        "FROM maquinaria_consumo_repuesto WHERE incidencia_id = ?",
        [incidencia_id],
    ).fetchone()["total"]
    conn.execute(
        "UPDATE maquinaria_incidencias SET coste_repuesto = ? WHERE id = ?",
        [round(total, 2), incidencia_id],
    )


def _evaluar_alerta_stock(stock_actual, stock_minimo, criticidad, codigo):
    """Evalúa si hay alerta de stock y su urgencia."""
    if stock_actual < 0:
        return {
            "tipo": "stock_negativo",
            "urgente": True,
            "stock_actual": stock_actual,
            "stock_minimo": stock_minimo,
            "repuesto": codigo,
        }
    if stock_actual < stock_minimo:
        return {
            "tipo": "stock_bajo",
            "urgente": criticidad == "A",
            "stock_actual": stock_actual,
            "stock_minimo": stock_minimo,
            "repuesto": codigo,
        }
    return None


def eliminar_consumo(consumo_id: int) -> dict:
    """Elimina un consumo y restaura stock. Recalcula coste de incidencia."""
    init_fase2a_db()
    with _conectar() as conn:
        consumo = conn.execute(
            "SELECT * FROM maquinaria_consumo_repuesto WHERE id = ?", [consumo_id]
        ).fetchone()
        if not consumo:
            return {"error": "Consumo no encontrado"}

        # Restaurar stock
        conn.execute(
            "UPDATE maquinaria_repuestos SET stock_actual = stock_actual + ?, updated_at = ? "
            "WHERE id = ?",
            [consumo["cantidad"], _now(), consumo["repuesto_id"]],
        )

        # Eliminar
        conn.execute(
            "DELETE FROM maquinaria_consumo_repuesto WHERE id = ?", [consumo_id]
        )

        # Recalcular coste incidencia si aplica
        if consumo["incidencia_id"]:
            _recalcular_coste_incidencia(conn, consumo["incidencia_id"])

        return {"ok": True}


def listar_consumos(
    maquina_id: int | None = None,
    incidencia_id: int | None = None,
    repuesto_id: int | None = None,
    desde: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """Lista consumos con filtros opcionales."""
    init_fase2a_db()
    with _conectar() as conn:
        q = (
            "SELECT c.*, r.codigo AS repuesto_codigo, r.descripcion AS repuesto_descripcion, "
            "       r.unidad, m.nombre AS maquina_nombre "
            "FROM maquinaria_consumo_repuesto c "
            "JOIN maquinaria_repuestos r ON r.id = c.repuesto_id "
            "JOIN maquinas m ON m.id = c.maquina_id "
            "WHERE 1=1"
        )
        params: list = []
        if maquina_id:
            q += " AND c.maquina_id = ?"
            params.append(maquina_id)
        if incidencia_id:
            q += " AND c.incidencia_id = ?"
            params.append(incidencia_id)
        if repuesto_id:
            q += " AND c.repuesto_id = ?"
            params.append(repuesto_id)
        if desde:
            q += " AND c.fecha >= ?"
            params.append(desde)
        q += f" ORDER BY c.created_at DESC LIMIT {limit}"
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def listar_alertas_stock() -> list[dict]:
    """Repuestos activos con stock por debajo de mínimo.

    Orden: negativos primero, luego criticidad A > B > C, luego ratio ascendente.
    """
    init_fase2a_db()
    with _conectar() as conn:
        rows = conn.execute(
            "SELECT id, codigo, descripcion, criticidad, stock_actual, stock_minimo, "
            "       unidad, proveedor_habitual_id, lead_time_dias "
            "FROM maquinaria_repuestos "
            "WHERE activo = 1 AND stock_actual < stock_minimo "
            "ORDER BY "
            "  CASE WHEN stock_actual < 0 THEN 0 ELSE 1 END, "
            "  CASE criticidad WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END, "
            "  CASE WHEN stock_minimo > 0 THEN stock_actual * 1.0 / stock_minimo ELSE stock_actual END"
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["alerta"] = _evaluar_alerta_stock(
                d["stock_actual"], d["stock_minimo"], d["criticidad"], d["codigo"]
            )
            result.append(d)
        return result


# ═══════════════════════════════════════════════════════════════════════════════
# ██  PROVEEDORES / TALLERES — CRUD                                           ██
# ═══════════════════════════════════════════════════════════════════════════════

def crear_proveedor(data: dict) -> dict:
    """Crea un proveedor/taller de maquinaria."""
    init_fase2a_db()
    nombre = (data.get("nombre") or "").strip()
    if not nombre:
        return {"error": "nombre es obligatorio"}

    now = _now()
    with _conectar() as conn:
        conn.execute(
            "INSERT INTO maquinaria_proveedores "
            "(nombre, tipo, zona, contacto, telefono, email, direccion, "
            " salida_a_obra, tiempo_respuesta_dias, valoracion_interna, notas, "
            " activo, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
                nombre,
                data.get("tipo", "taller"),
                data.get("zona"),
                data.get("contacto"),
                data.get("telefono"),
                data.get("email"),
                data.get("direccion"),
                data.get("salida_a_obra", 0),
                data.get("tiempo_respuesta_dias"),
                data.get("valoracion_interna"),
                data.get("notas"),
                1,
                now,
                now,
            ],
        )
        pid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return obtener_proveedor(pid, conn=conn)


def obtener_proveedor(proveedor_id: int, *, conn=None) -> dict | None:
    """Obtiene un proveedor con sus compatibilidades."""
    init_fase2a_db()

    def _fetch(c):
        row = c.execute(
            "SELECT * FROM maquinaria_proveedores WHERE id = ?", [proveedor_id]
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        compat = c.execute(
            "SELECT * FROM maquinaria_proveedor_compatibilidad WHERE proveedor_id = ?",
            [proveedor_id],
        ).fetchall()
        d["compatibilidades"] = [dict(r) for r in compat]
        return d

    if conn:
        return _fetch(conn)
    with _conectar() as c:
        return _fetch(c)


def actualizar_proveedor(proveedor_id: int, data: dict) -> dict:
    """Actualiza campos de un proveedor/taller."""
    init_fase2a_db()
    campos_editables = (
        "nombre", "tipo", "zona", "contacto", "telefono", "email", "direccion",
        "salida_a_obra", "tiempo_respuesta_dias", "valoracion_interna", "notas", "activo",
    )
    sets = []
    vals = []
    for campo in campos_editables:
        if campo in data:
            sets.append(f"{campo} = ?")
            vals.append(data[campo])
    if not sets:
        return {"error": "No hay campos para actualizar"}

    sets.append("updated_at = ?")
    vals.append(_now())
    vals.append(proveedor_id)

    with _conectar() as conn:
        conn.execute(
            f"UPDATE maquinaria_proveedores SET {', '.join(sets)} WHERE id = ?", vals
        )
        return obtener_proveedor(proveedor_id, conn=conn) or {"error": "No encontrado"}


def listar_proveedores(
    tipo: str | None = None,
    activo: bool | None = True,
    busqueda: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """Lista proveedores/talleres con filtros."""
    init_fase2a_db()
    with _conectar() as conn:
        q = "SELECT * FROM maquinaria_proveedores WHERE 1=1"
        params: list = []
        if tipo:
            q += " AND tipo = ?"
            params.append(tipo)
        if activo is not None:
            q += " AND activo = ?"
            params.append(1 if activo else 0)
        if busqueda:
            q += " AND (nombre LIKE ? OR zona LIKE ? OR contacto LIKE ?)"
            params.extend([f"%{busqueda}%"] * 3)
        q += f" ORDER BY nombre LIMIT {limit}"
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def agregar_compatibilidad(data: dict) -> dict:
    """Agrega compatibilidad marca/modelo/subsistema a un proveedor."""
    init_fase2a_db()
    proveedor_id = data.get("proveedor_id")
    if not proveedor_id:
        return {"error": "proveedor_id es obligatorio"}
    if not data.get("marca") and not data.get("modelo") and not data.get("subsistema"):
        return {"error": "Debe indicar al menos marca, modelo o subsistema"}

    with _conectar() as conn:
        # SQLite UNIQUE no detecta duplicados con NULLs → check manual
        dup = conn.execute(
            "SELECT id FROM maquinaria_proveedor_compatibilidad "
            "WHERE proveedor_id = ? AND marca IS ? AND modelo IS ? AND subsistema IS ?",
            [proveedor_id, data.get("marca"), data.get("modelo"), data.get("subsistema")],
        ).fetchone()
        if dup:
            return {"error": "Compatibilidad duplicada"}

        conn.execute(
            "INSERT INTO maquinaria_proveedor_compatibilidad "
            "(proveedor_id, marca, modelo, subsistema, notas) VALUES (?,?,?,?,?)",
            [
                proveedor_id,
                data.get("marca"),
                data.get("modelo"),
                data.get("subsistema"),
                data.get("notas"),
            ],
        )
        cid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return {"ok": True, "id": cid}


def eliminar_compatibilidad(compat_id: int) -> dict:
    """Elimina una compatibilidad."""
    init_fase2a_db()
    with _conectar() as conn:
        deleted = conn.execute(
            "DELETE FROM maquinaria_proveedor_compatibilidad WHERE id = ?", [compat_id]
        ).rowcount
        return {"ok": deleted > 0}


def listar_proveedores_para_maquina(
    maquina_id: int,
    subsistema: str | None = None,
    solo_activos: bool = True,
) -> list[dict]:
    """Proveedores compatibles con una máquina, por marca/modelo."""
    init_fase2a_db()
    with _conectar() as conn:
        maq = conn.execute(
            "SELECT marca, modelo FROM maquinas WHERE id = ?", [maquina_id]
        ).fetchone()
        if not maq:
            return []
        marca = maq["marca"]
        modelo = maq["modelo"]

        q = (
            "SELECT DISTINCT p.* "
            "FROM maquinaria_proveedores p "
            "JOIN maquinaria_proveedor_compatibilidad pc ON pc.proveedor_id = p.id "
            "WHERE ("
            "  (pc.marca IS NULL OR pc.marca = ?) "
            "  AND (pc.modelo IS NULL OR pc.modelo = ?)"
            ")"
        )
        params: list = [marca, modelo]

        if subsistema:
            q += " AND (pc.subsistema IS NULL OR pc.subsistema = ?)"
            params.append(subsistema)
        if solo_activos:
            q += " AND p.activo = 1"
        q += " ORDER BY p.valoracion_interna DESC, p.tiempo_respuesta_dias ASC"

        return [dict(r) for r in conn.execute(q, params).fetchall()]


# ═══════════════════════════════════════════════════════════════════════════════
# ██  CRITICIDAD SUGERIDA DE MÁQUINA                                          ██
# ═══════════════════════════════════════════════════════════════════════════════

def calcular_criticidad_sugerida(maquina_id: int) -> dict:
    """Calcula criticidad sugerida basada en incidencias, downtime, consumos y edad.

    Fórmula:
      score = inc_90d×2 + inc_365d×0.5 + (dt_90d/24)×1 + consumos_A×3 + max(0, edad-5)×0.5
    Umbrales: >= 15 → alta, >= 5 → media, < 5 → baja.
    """
    init_fase2a_db()
    hoy = date.today()
    d90 = (hoy - timedelta(days=90)).isoformat()
    d365 = (hoy - timedelta(days=365)).isoformat()

    with _conectar() as conn:
        maq = conn.execute(
            "SELECT criticidad, ano_fabricacion FROM maquinas WHERE id = ?",
            [maquina_id],
        ).fetchone()
        if not maq:
            return {"error": "Máquina no encontrada"}

        # Incidencias 90d
        inc_90d = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_incidencias "
            "WHERE maquina_id = ? AND fecha >= ?",
            [maquina_id, d90],
        ).fetchone()[0]

        # Incidencias 365d
        inc_365d = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_incidencias "
            "WHERE maquina_id = ? AND fecha >= ?",
            [maquina_id, d365],
        ).fetchone()[0]

        # Downtime 90d
        dt_row = conn.execute(
            "SELECT COALESCE(SUM(horas_downtime), 0) AS dt "
            "FROM maquinaria_incidencias "
            "WHERE maquina_id = ? AND fecha >= ? AND horas_downtime IS NOT NULL",
            [maquina_id, d90],
        ).fetchone()
        dt_90d = dt_row["dt"] or 0

        # Consumos de repuestos criticidad A (365d)
        consumos_A = conn.execute(
            "SELECT COUNT(*) FROM maquinaria_consumo_repuesto c "
            "JOIN maquinaria_repuestos r ON r.id = c.repuesto_id "
            "WHERE c.maquina_id = ? AND c.fecha >= ? AND r.criticidad = 'A'",
            [maquina_id, d365],
        ).fetchone()[0]

        # Edad
        ano = maq["ano_fabricacion"]
        edad_anos = (hoy.year - ano) if ano else 0

        # Cálculo
        score = (
            inc_90d * 2.0
            + inc_365d * 0.5
            + (dt_90d / 24) * 1.0
            + consumos_A * 3.0
            + max(0, edad_anos - 5) * 0.5
        )

        if score >= 15:
            sugerida = "alta"
        elif score >= 5:
            sugerida = "media"
        else:
            sugerida = "baja"

        return {
            "criticidad_sugerida": sugerida,
            "score": round(score, 1),
            "detalle": {
                "incidencias_90d": inc_90d,
                "incidencias_365d": inc_365d,
                "horas_downtime_90d": round(dt_90d, 1),
                "consumos_repuesto_A_365d": consumos_A,
                "edad_anos": edad_anos,
            },
            "criticidad_actual": maq["criticidad"] or "media",
            "cambio_sugerido": sugerida != (maq["criticidad"] or "media"),
        }


# ═══════════════════════════════════════════════════════════════════════════════
# ██  RESUMEN DE FLOTA                                                        ██
# ═══════════════════════════════════════════════════════════════════════════════

def resumen_flota() -> dict:
    """Resumen de indicadores base de toda la flota."""
    init_fase2a_db()
    hoy = date.today()
    d30 = (hoy - timedelta(days=30)).isoformat()
    d90 = (hoy - timedelta(days=90)).isoformat()

    with _conectar() as conn:
        # Total máquinas activas
        total = conn.execute(
            "SELECT COUNT(*) FROM maquinas WHERE activa = 1"
        ).fetchone()[0]

        # Desglose por criticidad
        crit_rows = conn.execute(
            "SELECT COALESCE(criticidad, 'media') AS crit, COUNT(*) AS n "
            "FROM maquinas WHERE activa = 1 GROUP BY crit"
        ).fetchall()
        por_criticidad = {r["crit"]: r["n"] for r in crit_rows}

        # Desglose por estado_operativo
        eop_rows = conn.execute(
            "SELECT COALESCE(estado_operativo, 'operativa') AS eop, COUNT(*) AS n "
            "FROM maquinas WHERE activa = 1 GROUP BY eop"
        ).fetchall()
        por_estado_operativo = {r["eop"]: r["n"] for r in eop_rows}

        # Top 5 máquinas por coste total 90d
        top_maq = conn.execute(
            "SELECT m.id, m.nombre, "
            "  COALESCE(SUM(i.coste_downtime), 0) + "
            "  COALESCE(SUM(i.coste_repuesto), 0) + "
            "  COALESCE(SUM(i.coste_servicio), 0) AS coste_total "
            "FROM maquinas m "
            "LEFT JOIN maquinaria_incidencias i ON i.maquina_id = m.id AND i.fecha >= ? "
            "WHERE m.activa = 1 "
            "GROUP BY m.id ORDER BY coste_total DESC LIMIT 5",
            [d90],
        ).fetchall()
        top_maquinas_coste = [
            {"id": r["id"], "nombre": r["nombre"], "coste_total_90d": round(r["coste_total"], 2)}
            for r in top_maq
        ]

        # Top 5 repuestos por cantidad consumida 90d
        top_rep_cant = conn.execute(
            "SELECT r.id, r.codigo, r.descripcion, "
            "  SUM(c.cantidad) AS total_cantidad "
            "FROM maquinaria_consumo_repuesto c "
            "JOIN maquinaria_repuestos r ON r.id = c.repuesto_id "
            "WHERE c.fecha >= ? "
            "GROUP BY r.id ORDER BY total_cantidad DESC LIMIT 5",
            [d90],
        ).fetchall()
        top_repuestos_cantidad = [
            {"id": r["id"], "codigo": r["codigo"], "descripcion": r["descripcion"],
             "cantidad_90d": r["total_cantidad"]}
            for r in top_rep_cant
        ]

        # Top 5 repuestos por coste consumido 90d
        top_rep_coste = conn.execute(
            "SELECT r.id, r.codigo, r.descripcion, "
            "  COALESCE(SUM(c.coste_total), 0) AS total_coste "
            "FROM maquinaria_consumo_repuesto c "
            "JOIN maquinaria_repuestos r ON r.id = c.repuesto_id "
            "WHERE c.fecha >= ? "
            "GROUP BY r.id ORDER BY total_coste DESC LIMIT 5",
            [d90],
        ).fetchall()
        top_repuestos_coste = [
            {"id": r["id"], "codigo": r["codigo"], "descripcion": r["descripcion"],
             "coste_90d": round(r["total_coste"], 2)}
            for r in top_rep_coste
        ]

        # Alertas de stock (criticidad A)
        alertas_a = conn.execute(
            "SELECT id, codigo, descripcion, stock_actual, stock_minimo "
            "FROM maquinaria_repuestos "
            "WHERE activo = 1 AND criticidad = 'A' AND stock_actual < stock_minimo"
        ).fetchall()
        alertas_stock_a = [dict(r) for r in alertas_a]

        # Coste total flota 30d y 90d
        def _coste_periodo(desde):
            row = conn.execute(
                "SELECT COALESCE(SUM(coste_downtime), 0) AS dt, "
                "       COALESCE(SUM(coste_repuesto), 0) AS rep, "
                "       COALESCE(SUM(coste_servicio), 0) AS srv "
                "FROM maquinaria_incidencias WHERE fecha >= ?",
                [desde],
            ).fetchone()
            return {
                "coste_downtime": round(row["dt"], 2),
                "coste_repuesto": round(row["rep"], 2),
                "coste_servicio": round(row["srv"], 2),
                "coste_total": round(row["dt"] + row["rep"] + row["srv"], 2),
            }

        return {
            "total_maquinas_activas": total,
            "por_criticidad": por_criticidad,
            "por_estado_operativo": por_estado_operativo,
            "top_maquinas_coste_90d": top_maquinas_coste,
            "top_repuestos_cantidad_90d": top_repuestos_cantidad,
            "top_repuestos_coste_90d": top_repuestos_coste,
            "alertas_stock_criticidad_A": alertas_stock_a,
            "costes_flota_30d": _coste_periodo(d30),
            "costes_flota_90d": _coste_periodo(d90),
        }
