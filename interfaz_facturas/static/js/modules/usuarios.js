// ═══ USUARIOS — gestión de usuarios ═══

(function () {
  function _iniciales(nombre) {
    if (!nombre) return "??";
    var partes = nombre.trim().split(/\s+/);
    if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
    return nombre.substring(0, 2).toUpperCase();
  }

  // Cargar info del usuario logueado al iniciar
  fetch("/api/usuarios/me")
    .then(function (r) { return r.json(); })
    .then(function (u) {
      var nameEl = document.getElementById("sidebar-username");
      var avatarEl = document.getElementById("sidebar-avatar");
      var rolEl = document.getElementById("sidebar-user-rol");
      if (nameEl) nameEl.textContent = u.nombre || u.username || "Usuario";
      if (avatarEl) avatarEl.textContent = _iniciales(u.nombre || u.username);
      if (rolEl) rolEl.textContent = u.rol || "";
      // Mostrar link Usuarios solo para admin
      var grpUsuarios = document.getElementById("sidebar-group-usuarios");
      if (grpUsuarios) grpUsuarios.style.display = u.rol === "admin" ? "" : "none";
    })
    .catch(function () {});
})();

function cargarUsuarios() {
  var container = document.getElementById("usuarios-content");
  if (!container) return;

  fetch("/api/usuarios")
    .then(function (r) {
      if (r.status === 403) {
        container.innerHTML = '<p style="color:var(--color-danger);padding:40px;text-align:center;">No tienes permisos para gestionar usuarios.</p>';
        return null;
      }
      return r.json();
    })
    .then(function (data) {
      if (!data) return;
      var usuarios = data.usuarios || [];
      var rolColors = { admin: "#DC2626", operador: "#2563EB", solo_lectura: "#64748B" };

      var filas = usuarios.map(function (u) {
        var rc = rolColors[u.rol] || "#64748B";
        return '<tr style="border-bottom:1px solid var(--color-border);">' +
          '<td style="padding:10px 14px;font-weight:500;">' + _esc(u.username) + '</td>' +
          '<td style="padding:10px 14px;">' + _esc(u.nombre) + '</td>' +
          '<td style="padding:10px 14px;text-align:center;"><span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + rc + '15;color:' + rc + ';font-weight:500;">' + _esc(u.rol) + '</span></td>' +
          '<td style="padding:10px 14px;text-align:center;"><span style="width:8px;height:8px;border-radius:50%;display:inline-block;background:' + (u.activo ? '#16A34A' : '#DC2626') + ';"></span> ' + (u.activo ? 'Activo' : 'Inactivo') + '</td>' +
          '<td style="padding:10px 14px;font-size:12px;color:var(--color-text-secondary);">' + (u.ultimo_login ? u.ultimo_login.substring(0, 16).replace('T', ' ') : 'Nunca') + '</td>' +
          '<td style="padding:10px 14px;text-align:center;"><button onclick="usuarioEditarModal(' + u.id + ')" class="btn-outline" style="font-size:12px;padding:3px 10px;">Editar</button></td>' +
        '</tr>';
      }).join('');

      container.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
          '<h1 style="margin:0;font-size:22px;">Gesti\u00f3n de usuarios</h1>' +
          '<button class="btn-primary" style="width:auto;padding:8px 16px;" onclick="usuarioNuevoModal()">+ Nuevo usuario</button>' +
        '</div>' +
        '<table style="width:100%;font-size:13px;border-collapse:collapse;background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">' +
          '<thead><tr style="background:var(--color-bg-page);">' +
            '<th style="text-align:left;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Usuario</th>' +
            '<th style="text-align:left;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Nombre</th>' +
            '<th style="text-align:center;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Rol</th>' +
            '<th style="text-align:center;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Estado</th>' +
            '<th style="text-align:left;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">\u00DAltimo login</th>' +
            '<th style="text-align:center;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Acciones</th>' +
          '</tr></thead>' +
          '<tbody>' + filas + '</tbody>' +
        '</table>';
    });
}
window.cargarUsuarios = cargarUsuarios;

window.usuarioNuevoModal = function () {
  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-usuario";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:450px;">' +
      '<h2 style="margin:0 0 16px;">Nuevo usuario</h2>' +
      '<div style="display:grid;gap:12px;">' +
        '<div><label class="form-label">Nombre de usuario *</label><input type="text" id="usr-username" class="form-input" placeholder="ej: jromero"></div>' +
        '<div><label class="form-label">Nombre completo</label><input type="text" id="usr-nombre" class="form-input" placeholder="Javier Romero"></div>' +
        '<div><label class="form-label">Email (opcional)</label><input type="email" id="usr-email" class="form-input" placeholder="javier@hincadodirecto.com"></div>' +
        '<div><label class="form-label">Rol</label><select id="usr-rol" class="form-input"><option value="admin">Admin \u2014 acceso total</option><option value="operador" selected>Operador \u2014 partes y maquinaria</option><option value="solo_lectura">Solo lectura \u2014 ver sin modificar</option></select></div>' +
        '<div><label class="form-label">Contrase\u00f1a *</label><input type="password" id="usr-password" class="form-input" placeholder="M\u00ednimo 4 caracteres"></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="btn-outline" onclick="document.getElementById(\'modal-usuario\').remove()">Cancelar</button>' +
        '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="usuarioGuardar()">Crear usuario</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
};

window.usuarioGuardar = function () {
  var data = {
    username: (document.getElementById("usr-username") || {}).value || "",
    nombre: (document.getElementById("usr-nombre") || {}).value || "",
    email: (document.getElementById("usr-email") || {}).value || "",
    rol: (document.getElementById("usr-rol") || {}).value || "operador",
    password: (document.getElementById("usr-password") || {}).value || ""
  };
  data.username = data.username.trim();
  data.nombre = data.nombre.trim() || data.username;
  if (!data.username || !data.password) {
    mostrarToast("Usuario y contrase\u00f1a son obligatorios", "error");
    return;
  }
  fetch("/api/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-usuario");
      if (m) m.remove();
      mostrarToast("Usuario creado", "success");
      cargarUsuarios();
    } else {
      res.json().then(function (err) { mostrarToast(err.error || "Error", "error"); });
    }
  });
};

window.usuarioEditarModal = function (userId) {
  fetch("/api/usuarios")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var u = (data.usuarios || []).find(function (x) { return x.id === userId; });
      if (!u) return;

      var modal = document.createElement("div");
      modal.className = "modal-overlay visible";
      modal.id = "modal-usuario";
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      modal.innerHTML =
        '<div class="modal-content" style="max-width:450px;">' +
          '<h2 style="margin:0 0 16px;">Editar usuario: ' + _esc(u.username) + '</h2>' +
          '<div style="display:grid;gap:12px;">' +
            '<div><label class="form-label">Nombre completo</label><input type="text" id="usr-nombre" class="form-input" value="' + _esc(u.nombre) + '"></div>' +
            '<div><label class="form-label">Email</label><input type="email" id="usr-email" class="form-input" value="' + _esc(u.email || '') + '"></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
              '<div><label class="form-label">Rol</label><select id="usr-rol" class="form-input">' +
                '<option value="admin"' + (u.rol === "admin" ? " selected" : "") + '>Admin</option>' +
                '<option value="operador"' + (u.rol === "operador" ? " selected" : "") + '>Operador</option>' +
                '<option value="solo_lectura"' + (u.rol === "solo_lectura" ? " selected" : "") + '>Solo lectura</option>' +
              '</select></div>' +
              '<div><label class="form-label">Estado</label><select id="usr-activo" class="form-input">' +
                '<option value="1"' + (u.activo ? " selected" : "") + '>Activo</option>' +
                '<option value="0"' + (!u.activo ? " selected" : "") + '>Inactivo</option>' +
              '</select></div>' +
            '</div>' +
            '<div><label class="form-label">Nueva contrase\u00f1a (dejar vac\u00edo para no cambiar)</label><input type="password" id="usr-password" class="form-input" placeholder="Solo si quieres cambiarla"></div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
            '<button class="btn-outline" onclick="document.getElementById(\'modal-usuario\').remove()">Cancelar</button>' +
            '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="usuarioActualizar(' + userId + ')">Guardar cambios</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    });
};

window.usuarioActualizar = function (userId) {
  var data = {
    nombre: (document.getElementById("usr-nombre") || {}).value || "",
    email: (document.getElementById("usr-email") || {}).value || "",
    rol: (document.getElementById("usr-rol") || {}).value,
    activo: (document.getElementById("usr-activo") || {}).value === "1"
  };
  var pw = (document.getElementById("usr-password") || {}).value;
  if (pw) data.password = pw;

  fetch("/api/usuarios/" + userId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-usuario");
      if (m) m.remove();
      mostrarToast("Usuario actualizado", "success");
      cargarUsuarios();
    } else {
      res.json().then(function (err) { mostrarToast(err.error || "Error", "error"); });
    }
  });
};
