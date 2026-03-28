"""Rutas de autenticación y gestión de usuarios."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, redirect, request, send_from_directory, url_for
from flask_login import current_user, login_user, logout_user

from routes.helpers import _bad_request, requiere_rol

logger = logging.getLogger("erp")

usuarios_bp = Blueprint("usuarios", __name__)


@usuarios_bp.get("/login")
def login_page():
  if current_user.is_authenticated:
    return redirect("/")
  from flask import current_app
  return send_from_directory(current_app.static_folder, "login.html")


@usuarios_bp.post("/login")
def login_post():
  from core.usuarios_db import verificar_credenciales
  from config import ADMIN_USER, ADMIN_PASSWORD
  # Import _User from the app module to avoid circular imports
  from backend import _User

  username = (request.form.get("username") or "").strip()
  password = (request.form.get("password") or "")
  usuario = verificar_credenciales(username, password)
  if usuario:
    login_user(_User(usuario["id"], usuario["username"], usuario["nombre"], usuario["rol"]))
    logger.info("Login OK: %s (rol=%s)", username, usuario["rol"])
    return redirect("/")
  if username == ADMIN_USER and password == ADMIN_PASSWORD:
    login_user(_User(0, username, "Admin (.env)", "admin"))
    logger.info("Login OK (fallback .env): %s", username)
    return redirect("/")
  logger.warning("Login fallido: %s", username)
  return redirect("/login?error=1")


@usuarios_bp.get("/logout")
def logout():
  logout_user()
  return redirect("/login")


@usuarios_bp.get("/api/usuarios")
@requiere_rol("admin")
def api_listar_usuarios():
  from core.usuarios_db import listar_usuarios
  return jsonify({"usuarios": listar_usuarios()})


@usuarios_bp.post("/api/usuarios")
@requiere_rol("admin")
def api_crear_usuario():
  from core.usuarios_db import crear_usuario
  data = request.get_json(silent=True) or {}
  try:
    user = crear_usuario(data)
    return jsonify(user), 201
  except ValueError as e:
    return jsonify({"error": str(e)}), 400


@usuarios_bp.put("/api/usuarios/<int:uid>")
@requiere_rol("admin")
def api_actualizar_usuario(uid):
  from core.usuarios_db import actualizar_usuario
  data = request.get_json(silent=True) or {}
  try:
    user = actualizar_usuario(uid, data)
    return jsonify(user)
  except ValueError as e:
    return jsonify({"error": str(e)}), 400


@usuarios_bp.get("/api/usuarios/me")
def api_usuario_actual():
  """El usuario actual puede ver sus datos."""
  return jsonify({
    "id": int(current_user.id) if current_user.id != "0" else 0,
    "username": current_user.username,
    "nombre": current_user.nombre,
    "rol": current_user.rol,
  })


@usuarios_bp.put("/api/usuarios/me/password")
def api_cambiar_mi_password():
  """El usuario actual puede cambiar su propia contrasena."""
  from core.usuarios_db import cambiar_password
  data = request.get_json(silent=True) or {}
  uid = int(current_user.id) if current_user.id != "0" else 0
  if not uid:
    return jsonify({"error": "Usuario legacy (.env), no se puede cambiar"}), 400
  ok = cambiar_password(uid, data.get("password_actual", ""), data.get("password_nueva", ""))
  if ok:
    return jsonify({"ok": True})
  return jsonify({"error": "Contrasena actual incorrecta o nueva muy corta"}), 400
