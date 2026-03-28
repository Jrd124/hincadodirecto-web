// ═══ MAQUINARIA — máquinas, checks, incidencias ═══

function cargarMaquinaria() {
  var container = document.getElementById("maquinaria-content");
  if (!container) return;

  fetch("/api/maquinaria/maquinas")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var maq = data.maquinas || [];
      var nDisp = 0, nProy = 0, nTaller = 0, nBaja = 0;
      maq.forEach(function (m) {
        if (m.estado === "disponible") nDisp++;
        else if (m.estado === "en_proyecto") nProy++;
        else if (m.estado === "en_taller") nTaller++;
        else if (m.estado === "baja") nBaja++;
      });

      var estadoColors = { disponible: "#16A34A", en_proyecto: "#2563EB", en_taller: "#CA8A04", baja: "#DC2626" };
      var estadoLabels = { disponible: "Disponible", en_proyecto: "En proyecto", en_taller: "En taller", baja: "De baja" };

      function _kpi(label, n, color) {
        return '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid ' + color + ';border-radius:var(--radius-md);padding:12px 16px;">' +
          '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;">' + label + '</div>' +
          '<div style="font-size:22px;font-weight:700;color:' + color + ';">' + n + '</div></div>';
      }

      var cards = maq.map(function (m) {
        var c = estadoColors[m.estado] || "#64748B";
        var lbl = estadoLabels[m.estado] || m.estado;
        return '<div onclick="maqDetalle(' + m.id + ')" style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;cursor:pointer;transition:border-color 0.15s;border-top:3px solid ' + c + ';" ' +
          'onmouseover="this.style.borderColor=\'var(--color-primary)\'" onmouseout="this.style.borderColor=\'var(--color-border)\';this.style.borderTopColor=\'' + c + '\'">' +
          '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">' +
            '<div><div style="font-size:18px;font-weight:600;">' + _esc(m.nombre) + '</div>' +
              '<div style="font-size:12px;color:var(--color-text-secondary);">' + _esc(m.internal_id) + ' \u00b7 ' + _esc(m.modelo) + '</div></div>' +
            '<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:' + c + '15;color:' + c + ';font-weight:500;">' + lbl + '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div><div style="font-size:11px;color:var(--color-text-secondary);">Hor\u00f3metro</div>' +
              '<div style="font-size:16px;font-weight:600;">' + (m.horometro_actual || 0).toLocaleString("es-ES") + 'h</div></div>' +
            '<div><div style="font-size:11px;color:var(--color-text-secondary);">Proyecto</div>' +
              '<div style="font-size:13px;font-weight:500;">' + (m.proyecto_nombre ? _esc(m.proyecto_nombre) : '\u2014') + '</div></div>' +
          '</div></div>';
      }).join("");

      container.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
          '<div><h1 style="margin:0;font-size:22px;">Maquinaria</h1>' +
            '<p style="margin:4px 0 0;font-size:14px;color:var(--color-text-secondary);">' + maq.length + ' m\u00e1quinas registradas</p></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;" id="maq-kpis">' +
          _kpi("Disponibles", nDisp, "#16A34A") +
          _kpi("En proyecto", nProy, "#2563EB") +
          _kpi("En taller", nTaller, "#CA8A04") +
          _kpi("De baja", nBaja, "#DC2626") +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;">' + cards + '</div>';
    });
}
window.cargarMaquinaria = cargarMaquinaria;

window.maqDetalle = function (maqId) {
  fetch("/api/maquinaria/maquinas/" + maqId)
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (m) {
      var container = document.getElementById("maquinaria-detalle-content");
      var estadoColors = { disponible: "#16A34A", en_proyecto: "#2563EB", en_taller: "#CA8A04", baja: "#DC2626" };
      var color = estadoColors[m.estado] || "#64748B";

      // Revisiones pendientes badges
      var revPend = "";
      if (m.revisiones_pendientes && m.revisiones_pendientes.length) {
        revPend = '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          m.revisiones_pendientes.map(function (r) {
            var urg = r.urgente;
            return '<span style="padding:4px 10px;border-radius:99px;font-size:12px;font-weight:500;' +
              'background:' + (urg ? '#DC262615' : '#CA8A0415') + ';color:' + (urg ? '#DC2626' : '#CA8A04') + ';' +
              'border:1px solid ' + (urg ? '#DC262630' : '#CA8A0430') + ';">' +
              r.tipo + (urg ? ' (\u00a1atrasada!)' : '') + '</span>';
          }).join("") + '</div>';
      } else {
        revPend = '<span style="color:#16A34A;font-size:13px;">\u2713 Todas al d\u00eda</span>';
      }

      // Checks rows
      var checksHtml = "";
      if (m.checks && m.checks.length) {
        checksHtml = m.checks.map(function (c) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--color-border);">' +
            '<div><span style="font-size:13px;font-weight:500;">' + (c.fecha || "").substring(0, 10) + '</span>' +
              '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:8px;">' + (c.horometro || 0) + 'h</span>' +
              (c.usuario_nombre ? '<span style="font-size:11px;color:var(--color-text-secondary);margin-left:8px;">por ' + _esc(c.usuario_nombre) + '</span>' : '') +
            '</div>' +
            '<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + (c.estado === "cerrado" ? '#16A34A15' : '#CA8A0415') + ';color:' + (c.estado === "cerrado" ? '#16A34A' : '#CA8A04') + ';">' + c.estado + '</span>' +
          '</div>';
        }).join("");
      } else {
        checksHtml = '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:16px;">Sin checks registrados</p>';
      }

      // Revisiones rows
      var revsHtml = "";
      if (m.revisiones && m.revisiones.length) {
        revsHtml = m.revisiones.map(function (r) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--color-border);">' +
            '<div><span style="font-size:12px;padding:2px 8px;border-radius:99px;background:#2563EB15;color:#2563EB;font-weight:500;">' + r.tipo + '</span>' +
              '<span style="font-size:13px;margin-left:8px;">' + (r.fecha || "").substring(0, 10) + '</span>' +
              '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:6px;">' + (r.horometro_al_revision || 0) + 'h</span></div>' +
            '<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + (r.estado === "cerrado" ? '#16A34A15' : '#CA8A0415') + ';color:' + (r.estado === "cerrado" ? '#16A34A' : '#CA8A04') + ';">' + r.estado + '</span>' +
          '</div>';
        }).join("");
      } else {
        revsHtml = '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:16px;">Sin revisiones registradas</p>';
      }

      // Incidencias
      var incHtml = "";
      if (m.incidencias && m.incidencias.length) {
        var sevColors = { baja: "#64748B", media: "#CA8A04", alta: "#DC2626", seguridad: "#7C3AED" };
        incHtml = m.incidencias.map(function (i) {
          var sc = sevColors[i.severidad] || "#64748B";
          return '<div style="border:1px solid var(--color-border);border-left:3px solid ' + sc + ';border-radius:var(--radius-md);padding:12px;margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:start;">' +
              '<div><span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + sc + '15;color:' + sc + ';font-weight:500;text-transform:uppercase;">' + i.severidad + '</span>' +
                '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:8px;">' + (i.fecha || "").substring(0, 10) + '</span></div>' +
              '<button onclick="maqCerrarIncidencia(' + i.id + ',' + m.id + ')" class="btn-outline" style="font-size:11px;padding:2px 8px;">Cerrar</button>' +
            '</div>' +
            '<p style="font-size:13px;margin:8px 0 0;">' + _esc(i.descripcion) + '</p>' +
            (i.usuario_nombre ? '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">Reportada por ' + _esc(i.usuario_nombre) + '</div>' : '') +
          '</div>';
        }).join("");
      } else {
        incHtml = '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:16px;">Sin incidencias abiertas \u2713</p>';
      }

      container.innerHTML =
        // Header
        '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px;">' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
              '<button onclick="maqVolver()" style="background:none;border:none;cursor:pointer;font-size:18px;padding:0;color:var(--color-text-secondary);">\u2190</button>' +
              '<h1 style="margin:0;font-size:24px;">' + _esc(m.nombre) + '</h1>' +
              '<span style="font-size:12px;padding:3px 10px;border-radius:99px;background:' + color + '15;color:' + color + ';font-weight:500;">' + m.estado + '</span>' +
            '</div>' +
            '<div style="font-size:14px;color:var(--color-text-secondary);">' + _esc(m.internal_id) + ' \u00b7 ' + _esc(m.modelo) +
              (m.numero_serie ? ' \u00b7 S/N: ' + _esc(m.numero_serie) : '') +
              (m.proyecto_nombre ? ' \u00b7 \uD83D\uDCCD ' + _esc(m.proyecto_nombre) : '') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button class="btn-primary" style="width:auto;padding:8px 16px;" onclick="maqNuevoCheck(' + m.id + ')">\uD83D\uDCCB Check semanal</button>' +
            '<button class="btn-outline" style="padding:8px 16px;" onclick="maqNuevaIncidencia(' + m.id + ')">\u26A0\uFE0F Incidencia</button>' +
            '<button class="btn-outline" style="padding:8px 16px;" onclick="maqEditarModal(' + m.id + ')">Editar</button>' +
          '</div>' +
        '</div>' +

        // KPIs
        '<div style="display:grid;grid-template-columns:250px 1fr 180px;gap:14px;margin-bottom:20px;">' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
            '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:6px;">Hor\u00f3metro</div>' +
            '<div style="font-size:28px;font-weight:700;">' + (m.horometro_actual || 0).toLocaleString("es-ES") + 'h</div>' +
            '<div style="font-size:12px;color:var(--color-text-secondary);">Inicial: ' + (m.horometro_inicial || 0).toLocaleString("es-ES") + 'h \u00b7 Comisi\u00f3n: ' + (m.fecha_comision ? m.fecha_comision.substring(0, 4) : '\u2014') + '</div></div>' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
            '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:8px;">Revisiones pendientes</div>' + revPend + '</div>' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
            '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:6px;">Incidencias abiertas</div>' +
            '<div style="font-size:28px;font-weight:700;color:' + (m.incidencias && m.incidencias.length ? '#DC2626' : '#16A34A') + ';">' + (m.incidencias ? m.incidencias.length : 0) + '</div></div>' +
        '</div>' +

        // 2 columns
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
          '<div style="display:flex;flex-direction:column;gap:14px;">' +
            // Checks
            '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                '<span style="font-size:14px;font-weight:600;">\uD83D\uDCCB Checks semanales</span>' +
                '<span style="font-size:12px;color:var(--color-text-secondary);">' + (m.checks ? m.checks.length : 0) + ' registrados</span></div>' +
              '<div style="padding:12px;max-height:250px;overflow-y:auto;">' + checksHtml + '</div></div>' +
            // Revisiones
            '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                '<span style="font-size:14px;font-weight:600;">\uD83D\uDD27 Revisiones por hor\u00f3metro</span>' +
                '<span style="font-size:12px;color:var(--color-text-secondary);">' + (m.revisiones ? m.revisiones.length : 0) + ' realizadas</span></div>' +
              '<div style="padding:12px;max-height:250px;overflow-y:auto;">' + revsHtml + '</div></div>' +
          '</div>' +
          // Incidencias
          '<div>' +
            '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                '<span style="font-size:14px;font-weight:600;">\u26A0\uFE0F Incidencias abiertas</span>' +
                '<button class="btn-outline" style="font-size:12px;padding:3px 10px;" onclick="maqNuevaIncidencia(' + m.id + ')">+ Nueva</button></div>' +
              '<div style="padding:12px;max-height:500px;overflow-y:auto;">' + incHtml + '</div></div>' +
          '</div>' +
        '</div>';

      // Show detail panel, hide list
      document.getElementById("panel-maquinaria").classList.remove("visible");
      document.getElementById("panel-maquinaria-detalle").classList.add("visible");
    })
    .catch(function () { mostrarToast("Error al cargar m\u00e1quina", "error"); });
};

window.maqVolver = function () {
  document.getElementById("panel-maquinaria-detalle").classList.remove("visible");
  document.getElementById("panel-maquinaria").classList.add("visible");
  cargarMaquinaria();
};

// ── Check semanal ──

window.maqNuevoCheck = function (maqId) {
  fetch("/api/maquinaria/templates/semanal")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var templates = data.templates || [];
      var hoy = new Date().toISOString().substring(0, 10);

      var itemsHtml = templates.map(function (t) {
        return '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--color-border);cursor:pointer;">' +
          '<input type="checkbox" data-template-id="' + t.id + '" style="width:20px;height:20px;accent-color:#16A34A;cursor:pointer;">' +
          '<div style="flex:1;"><div style="font-size:14px;font-weight:500;">' + _esc(t.nombre) + '</div>' +
            (t.descripcion ? '<div style="font-size:12px;color:var(--color-text-secondary);">' + _esc(t.descripcion) + '</div>' : '') +
          '</div></label>';
      }).join("");

      var modal = document.createElement("div");
      modal.className = "modal-overlay visible";
      modal.id = "modal-maq-check";
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      modal.innerHTML =
        '<div class="modal-content" style="max-width:550px;">' +
          '<h2 style="margin:0 0 16px;">Check semanal</h2>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
            '<div><label class="form-label">Fecha</label><input type="date" id="maq-check-fecha" class="form-input" value="' + hoy + '"></div>' +
            '<div><label class="form-label">Hor\u00f3metro actual</label><input type="number" id="maq-check-horometro" class="form-input" step="any" placeholder="Horas"></div>' +
          '</div>' +
          '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;margin-bottom:16px;">' +
            '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);font-size:14px;font-weight:600;">Checklist ORTECO</div>' +
            '<div style="padding:8px;">' + itemsHtml + '</div></div>' +
          '<div style="margin-bottom:16px;"><label class="form-label">Observaciones</label>' +
            '<textarea id="maq-check-obs" class="form-input" rows="2" placeholder="Notas adicionales..."></textarea></div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-check\').remove()">Cancelar</button>' +
            '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="maqGuardarCheck(' + maqId + ')">Guardar y cerrar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    });
};

window.maqGuardarCheck = function (maqId) {
  var checklist = {};
  document.querySelectorAll("#modal-maq-check [data-template-id]").forEach(function (cb) {
    checklist[cb.dataset.templateId] = { ok: cb.checked, nota: "" };
  });
  var payload = {
    maquina_id: maqId,
    fecha: (document.getElementById("maq-check-fecha") || {}).value,
    horometro: parseFloat((document.getElementById("maq-check-horometro") || {}).value) || 0,
    checklist: checklist,
    observaciones: (document.getElementById("maq-check-obs") || {}).value
  };
  fetch("/api/maquinaria/checks", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  }).then(function (res) {
    if (res.ok) {
      return res.json().then(function (check) {
        return fetch("/api/maquinaria/checks/" + check.id + "/cerrar", { method: "PUT" });
      }).then(function () {
        var m = document.getElementById("modal-maq-check"); if (m) m.remove();
        mostrarToast("Check semanal registrado", "success");
        maqDetalle(maqId);
      });
    } else { mostrarToast("Error al guardar", "error"); }
  });
};

// ── Incidencias ──

window.maqNuevaIncidencia = function (maqId) {
  var hoy = new Date().toISOString().substring(0, 10);
  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-maq-incidencia";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:450px;">' +
      '<h2 style="margin:0 0 16px;">Nueva incidencia</h2>' +
      '<div style="display:grid;gap:12px;">' +
        '<div><label class="form-label">Descripci\u00f3n *</label><textarea id="maq-inc-desc" class="form-input" rows="3" placeholder="Describe la incidencia..."></textarea></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label class="form-label">Severidad</label><select id="maq-inc-sev" class="form-input"><option value="baja">Baja</option><option value="media" selected>Media</option><option value="alta">Alta</option><option value="seguridad">Seguridad</option></select></div>' +
          '<div><label class="form-label">Fecha</label><input type="date" id="maq-inc-fecha" class="form-input" value="' + hoy + '"></div>' +
        '</div></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-incidencia\').remove()">Cancelar</button>' +
        '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="maqGuardarIncidencia(' + maqId + ')">Reportar</button>' +
      '</div></div>';
  document.body.appendChild(modal);
};

window.maqGuardarIncidencia = function (maqId) {
  var desc = ((document.getElementById("maq-inc-desc") || {}).value || "").trim();
  if (!desc) { mostrarToast("La descripci\u00f3n es obligatoria", "error"); return; }
  fetch("/api/maquinaria/incidencias", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      maquina_id: maqId, descripcion: desc,
      severidad: (document.getElementById("maq-inc-sev") || {}).value || "media",
      fecha: (document.getElementById("maq-inc-fecha") || {}).value
    })
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-maq-incidencia"); if (m) m.remove();
      mostrarToast("Incidencia reportada", "success");
      maqDetalle(maqId);
    } else { mostrarToast("Error", "error"); }
  });
};

window.maqCerrarIncidencia = function (incId, maqId) {
  var resolucion = prompt("Resoluci\u00f3n de la incidencia:");
  if (resolucion === null) return;
  fetch("/api/maquinaria/incidencias/" + incId, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado: "cerrada", resolucion: resolucion })
  }).then(function () {
    mostrarToast("Incidencia cerrada", "success");
    maqDetalle(maqId);
  });
};

// ── Editar máquina ──

window.maqEditarModal = function (maqId) {
  fetch("/api/maquinaria/maquinas/" + maqId)
    .then(function (r) { return r.json(); })
    .then(function (m) {
      fetch("/api/proyectos")
        .then(function (r) { return r.json(); })
        .then(function (pData) {
          var proyectos = pData.proyectos || [];
          var proyOpts = '<option value="">Sin proyecto</option>' +
            proyectos.map(function (p) {
              return '<option value="' + p.id + '"' + (p.id === m.proyecto_id ? ' selected' : '') + '>' + _esc(p.nombre) + '</option>';
            }).join("");

          var modal = document.createElement("div");
          modal.className = "modal-overlay visible";
          modal.id = "modal-maq-editar";
          modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
          modal.innerHTML =
            '<div class="modal-content" style="max-width:500px;">' +
              '<h2 style="margin:0 0 16px;">Editar ' + _esc(m.nombre) + '</h2>' +
              '<div style="display:grid;gap:12px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                  '<div><label class="form-label">Nombre</label><input type="text" id="maq-ed-nombre" class="form-input" value="' + _esc(m.nombre) + '"></div>' +
                  '<div><label class="form-label">Modelo</label><input type="text" id="maq-ed-modelo" class="form-input" value="' + _esc(m.modelo) + '"></div></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                  '<div><label class="form-label">N\u00ba Serie</label><input type="text" id="maq-ed-serie" class="form-input" value="' + _esc(m.numero_serie || '') + '"></div>' +
                  '<div><label class="form-label">Hor\u00f3metro actual</label><input type="number" id="maq-ed-horometro" class="form-input" step="any" value="' + (m.horometro_actual || 0) + '"></div></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                  '<div><label class="form-label">Estado</label><select id="maq-ed-estado" class="form-input">' +
                    '<option value="disponible"' + (m.estado === 'disponible' ? ' selected' : '') + '>Disponible</option>' +
                    '<option value="en_proyecto"' + (m.estado === 'en_proyecto' ? ' selected' : '') + '>En proyecto</option>' +
                    '<option value="en_taller"' + (m.estado === 'en_taller' ? ' selected' : '') + '>En taller</option>' +
                    '<option value="baja"' + (m.estado === 'baja' ? ' selected' : '') + '>De baja</option></select></div>' +
                  '<div><label class="form-label">Proyecto</label><select id="maq-ed-proyecto" class="form-input">' + proyOpts + '</select></div></div>' +
                '<div><label class="form-label">Ubicaci\u00f3n</label><input type="text" id="maq-ed-ubicacion" class="form-input" value="' + _esc(m.ubicacion || '') + '" placeholder="Ej: Parque PV Cuenca"></div>' +
                '<div><label class="form-label">Notas</label><textarea id="maq-ed-notas" class="form-input" rows="2">' + _esc(m.notas || '') + '</textarea></div>' +
              '</div>' +
              '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
                '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-editar\').remove()">Cancelar</button>' +
                '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="maqGuardarEdicion(' + maqId + ')">Guardar</button>' +
              '</div></div>';
          document.body.appendChild(modal);
        });
    });
};

window.maqGuardarEdicion = function (maqId) {
  var data = {
    nombre: (document.getElementById("maq-ed-nombre") || {}).value,
    modelo: (document.getElementById("maq-ed-modelo") || {}).value,
    numero_serie: (document.getElementById("maq-ed-serie") || {}).value,
    horometro_actual: parseFloat((document.getElementById("maq-ed-horometro") || {}).value) || 0,
    estado: (document.getElementById("maq-ed-estado") || {}).value,
    proyecto_id: parseInt((document.getElementById("maq-ed-proyecto") || {}).value) || null,
    ubicacion: (document.getElementById("maq-ed-ubicacion") || {}).value,
    notas: (document.getElementById("maq-ed-notas") || {}).value
  };
  fetch("/api/maquinaria/maquinas/" + maqId, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-maq-editar"); if (m) m.remove();
      mostrarToast("M\u00e1quina actualizada", "success");
      maqDetalle(maqId);
    } else { mostrarToast("Error", "error"); }
  });
};
