"""Modulo Usuarios: autenticacion multi-usuario con roles."""
from __future__ import annotations

import bcrypt
from datetime import datetime

from core.db import conectar as _conectar, now_iso as _now

_initialized = False


def init_usuarios_db() -> None:
    global _initialized
    if _initialized:
        return
    with _conectar() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                nombre TEXT NOT NULL,
                email TEXT,
                rol TEXT NOT NULL DEFAULT 'operador' CHECK(rol IN ('admin','operador','solo_lectura')),
                activo INTEGER NOT NULL DEFAULT 1,
                ultimo_login TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)
        # Crear usuario admin por defecto si no hay ninguno
        existe = conn.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]
        if existe == 0:
            hash_pw = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode("utf-8")
            conn.execute("""
                INSERT INTO usuarios (username, password_hash, nombre, rol, activo, created_at)
                VALUES ('admin', ?, 'Administrador', 'admin', 1, ?)
            """, [hash_pw, _now()])
    _initialized = True


def verificar_credenciales(username: str, password: str) -> dict | None:
    """Verifica username+password. Retorna dict del usuario si OK, None si falla."""
    init_usuarios_db()
    with _conectar() as conn:
        row = conn.execute(
            "SELECT * FROM usuarios WHERE username = ? AND activo = 1", [username],
        ).fetchone()
        if not row:
            return None
        if bcrypt.checkpw(password.encode("utf-8"), row["password_hash"].encode("utf-8")):
            conn.execute(
                "UPDATE usuarios SET ultimo_login = ? WHERE id = ?",
                [_now(), row["id"]],
            )
            return dict(row)
    return None


_CAMPOS_PUBLICOS = "id, username, nombre, email, rol, activo, ultimo_login, created_at"


def listar_usuarios() -> list:
    init_usuarios_db()
    with _conectar() as conn:
        return [dict(r) for r in conn.execute(
            f"SELECT {_CAMPOS_PUBLICOS} FROM usuarios ORDER BY rol, nombre"
        ).fetchall()]


def obtener_usuario(user_id: int) -> dict | None:
    init_usuarios_db()
    with _conectar() as conn:
        row = conn.execute(
            f"SELECT {_CAMPOS_PUBLICOS} FROM usuarios WHERE id = ?", [user_id],
        ).fetchone()
        return dict(row) if row else None


def crear_usuario(data: dict) -> dict:
    init_usuarios_db()
    password = data.get("password", "")
    if len(password) < 4:
        raise ValueError("La contrasena debe tener al menos 4 caracteres")

    hash_pw = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    with _conectar() as conn:
        try:
            conn.execute("""
                INSERT INTO usuarios (username, password_hash, nombre, email, rol, activo, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
            """, [data["username"], hash_pw, data.get("nombre", data["username"]),
                  data.get("email"), data.get("rol", "operador"), _now()])
            uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            return obtener_usuario(uid)
        except Exception as e:
            if "UNIQUE" in str(e):
                raise ValueError(f"El usuario '{data['username']}' ya existe")
            raise


def actualizar_usuario(user_id: int, data: dict) -> dict:
    init_usuarios_db()
    with _conectar() as conn:
        conn.execute("""
            UPDATE usuarios SET nombre = ?, email = ?, rol = ?, activo = ?, updated_at = ?
            WHERE id = ?
        """, [data.get("nombre"), data.get("email"), data.get("rol"),
              1 if data.get("activo", True) else 0, _now(), user_id])

        if data.get("password"):
            if len(data["password"]) < 4:
                raise ValueError("La contrasena debe tener al menos 4 caracteres")
            hash_pw = bcrypt.hashpw(data["password"].encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            conn.execute("UPDATE usuarios SET password_hash = ? WHERE id = ?", [hash_pw, user_id])

        return obtener_usuario(user_id)


def cambiar_password(user_id: int, password_actual: str, password_nueva: str) -> bool:
    init_usuarios_db()
    with _conectar() as conn:
        row = conn.execute("SELECT password_hash FROM usuarios WHERE id = ?", [user_id]).fetchone()
        if not row:
            return False
        if not bcrypt.checkpw(password_actual.encode("utf-8"), row["password_hash"].encode("utf-8")):
            return False
        if len(password_nueva) < 4:
            return False
        hash_pw = bcrypt.hashpw(password_nueva.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        conn.execute(
            "UPDATE usuarios SET password_hash = ?, updated_at = ? WHERE id = ?",
            [hash_pw, _now(), user_id],
        )
        return True
