// ═══ ALOJAMIENTO — Gestión de estancias en hoteles ══════════════════════════

var _alojTabActivo = "estancias";
var _alojEstancias = [];
var _alojProyectosLoaded = false;

function _alojamientoInit() {
  if (!_alojProyectosLoaded) {
    _alojProyectosLoaded = true;
    // Load projects for filter dropdown
    fetch("/api/proyectos/lista?estado=vivo").then(function(r){return r.json();}).then(function(d) {
      var sel = document.getElementById("aloj-filtro-proyecto");
      if (!sel) return;
      (d.proyectos || d || []).forEach(function(p) {
        sel.innerHTML += '<option value="' + p.id + '">' + (p.codigo || '') + ' ' + (p.nombre || '') + '</option>';
      });
    }).catch(function(){});
  }
  _alojCambiarTab(_alojTabActivo);
}

function _alojCambiarTab(tab) {
  _alojTabActivo = tab;
  document.querySelectorAll(".aloj-tab").forEach(function(t) {
    var isActive = t.getAttribute("data-aloj-tab") === tab;
    t.classList.toggle("active", isActive);
    t.style.borderBottomColor = isActive ? "#1D9E75" : "transparent";
    t.style.color = isActive ? "#2C2C2A" : "#888780";
  });
  var filtros = document.getElementById("aloj-filtros");
  if (filtros) filtros.style.display = tab === "estancias" ? "flex" : "none";
  if (tab === "estancias") _alojCargarEstancias();
  else _alojCargarHoteles();
}

// ═══ Estancias ══════════════════════════════════════════════════════════════

function _alojCargarEstancias() {
  var container = document.getElementById("aloj-content");
  if (!container) return;
  container.innerHTML = '<p style="color:#94a3b8;padding:20px;text-align:center;">Cargando...</p>';

  var params = [];
  var proy = (document.getElementById("aloj-filtro-proyecto") || {}).value;
  if (proy) params.push("proyecto_id=" + proy);
  var desde = (document.getElementById("aloj-filtro-desde") || {}).value;
  if (desde) params.push("desde=" + desde);
  var hasta = (document.getElementById("aloj-filtro-hasta") || {}).value;
  if (hasta) params.push("hasta=" + hasta);

  fetch("/api/alojamientos" + (params.length ? "?" + params.join("&") : ""))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      _alojEstancias = d.alojamientos || [];
      _alojRenderEstancias(_alojEstancias);
    })
    .catch(function(err) { container.innerHTML = '<p style="color:#dc3545;padding:20px;text-align:center;">Error: ' + err.message + '</p>'; });
}

function _alojFiltrarLocal() {
  var busq = ((document.getElementById("aloj-filtro-hotel") || {}).value || "").toLowerCase();
  if (!busq) { _alojRenderEstancias(_alojEstancias); return; }
  var filtered = _alojEstancias.filter(function(e) {
    return (e.hotel_nombre || "").toLowerCase().indexOf(busq) !== -1;
  });
  _alojRenderEstancias(filtered);
}

function _alojRenderEstancias(estancias) {
  var container = document.getElementById("aloj-content");
  if (!container) return;
  if (!estancias.length) {
    container.innerHTML = '<p style="color:#94a3b8;padding:30px;text-align:center;">Sin estancias registradas</p>';
    return;
  }
  var html = '<div class="card" style="overflow-x:auto;padding:0;">' +
    '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">' +
    '<thead><tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;">' +
      '<th style="padding:7px 8px;font-weight:700;">Hotel</th>' +
      '<th style="padding:7px 6px;font-weight:700;">Localidad</th>' +
      '<th style="padding:7px 6px;font-weight:700;">Proyecto</th>' +
      '<th style="padding:7px 6px;font-weight:700;">Entrada</th>' +
      '<th style="padding:7px 6px;font-weight:700;">Salida</th>' +
      '<th style="padding:7px 4px;font-weight:700;text-align:right;">Noches</th>' +
      '<th style="padding:7px 4px;font-weight:700;text-align:right;">Pers.</th>' +
      '<th style="padding:7px 6px;font-weight:700;text-align:right;">Coste total</th>' +
      '<th style="padding:7px 6px;font-weight:700;text-align:right;">\u20ac/noche/pers</th>' +
      '<th style="padding:7px 4px;font-weight:700;text-align:center;">Acciones</th>' +
    '</tr></thead><tbody>';

  estancias.forEach(function(e) {
    var costePP = (e.num_noches && e.num_personas && e.coste_total)
      ? (e.coste_total / (e.num_noches * e.num_personas)).toFixed(2) + " \u20ac"
      : "\u2014";
    html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
      '<td style="padding:6px 8px;font-weight:600;">' + (e.hotel_nombre || '') + '</td>' +
      '<td style="padding:6px 6px;">' + (e.localidad || '\u2014') + '</td>' +
      '<td style="padding:6px 6px;font-size:0.78rem;">' + (e.proyecto_nombre || '\u2014') + '</td>' +
      '<td style="padding:6px 6px;">' + (e.fecha_entrada || '') + '</td>' +
      '<td style="padding:6px 6px;">' + (e.fecha_salida || '') + '</td>' +
      '<td style="padding:6px 4px;text-align:right;">' + (e.num_noches || 0) + '</td>' +
      '<td style="padding:6px 4px;text-align:right;">' + (e.num_personas || 1) + '</td>' +
      '<td style="padding:6px 6px;text-align:right;font-weight:500;">' + (e.coste_total != null ? e.coste_total.toFixed(2) + " \u20ac" : '\u2014') + '</td>' +
      '<td style="padding:6px 6px;text-align:right;">' + costePP + '</td>' +
      '<td style="padding:6px 4px;text-align:center;">' +
        '<button onclick="_alojEditarEstancia(' + e.id + ')" style="background:none;border:none;cursor:pointer;font-size:14px;" title="Editar">\u270F\uFE0F</button>' +
        '<button onclick="_alojEliminarEstancia(' + e.id + ')" style="background:none;border:none;cursor:pointer;font-size:14px;" title="Eliminar">\uD83D\uDDD1\uFE0F</button>' +
      '</td></tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ═══ Histórico hoteles ══════════════════════════════════════════════════════

function _alojCargarHoteles() {
  var container = document.getElementById("aloj-content");
  if (!container) return;
  container.innerHTML = '<p style="color:#94a3b8;padding:20px;text-align:center;">Cargando...</p>';

  fetch("/api/alojamientos/historico-hoteles")
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var hoteles = d.hoteles || [];
      if (!hoteles.length) {
        container.innerHTML = '<p style="color:#94a3b8;padding:30px;text-align:center;">Sin hoteles registrados</p>';
        return;
      }
      var html = '<div class="card" style="overflow-x:auto;padding:0;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">' +
        '<thead><tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;">' +
          '<th style="padding:7px 8px;font-weight:700;">Hotel</th>' +
          '<th style="padding:7px 6px;font-weight:700;">Localidad</th>' +
          '<th style="padding:7px 4px;font-weight:700;text-align:right;">Estancias</th>' +
          '<th style="padding:7px 6px;font-weight:700;">\u00daltima</th>' +
          '<th style="padding:7px 6px;font-weight:700;text-align:right;">\u20ac medio/noche/pers</th>' +
          '<th style="padding:7px 6px;font-weight:700;text-align:right;">Coste total</th>' +
          '<th style="padding:7px 6px;font-weight:700;">Proyectos</th>' +
        '</tr></thead><tbody>';

      hoteles.forEach(function(h) {
        var proys = (h.proyectos || []).map(function(p) { return p.nombre || ''; }).join(", ") || "\u2014";
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_alojVerHotel(\'' + (h.hotel_nombre || '').replace(/'/g, "\\'") + '\')">' +
          '<td style="padding:6px 8px;font-weight:600;">' + (h.hotel_nombre || '') + '</td>' +
          '<td style="padding:6px 6px;">' + (h.localidad || '\u2014') + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + h.num_estancias + '</td>' +
          '<td style="padding:6px 6px;">' + (h.ultima_estancia || '\u2014') + '</td>' +
          '<td style="padding:6px 6px;text-align:right;font-weight:500;">' + (h.coste_medio_noche_persona || 0).toFixed(2) + ' \u20ac</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + (h.coste_total || 0).toFixed(2) + ' \u20ac</td>' +
          '<td style="padding:6px 6px;font-size:0.78rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + proys + '">' + proys + '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    })
    .catch(function(err) { container.innerHTML = '<p style="color:#dc3545;">Error: ' + err.message + '</p>'; });
}

function _alojVerHotel(nombre) {
  fetch("/api/alojamientos/hotel-estancias?hotel=" + encodeURIComponent(nombre))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var estancias = d.estancias || [];
      var old = document.getElementById("modal-aloj"); if (old) old.remove();
      var m = document.createElement("div"); m.id = "modal-aloj";
      m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;display:flex;align-items:center;justify-content:center;";
      var html = '<div style="background:#fff;border-radius:12px;width:600px;max-width:95%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,0.15);max-height:80vh;overflow-y:auto;">' +
        '<h3 style="margin:0 0 14px;">\uD83C\uDFE8 ' + nombre + '</h3>';
      if (!estancias.length) {
        html += '<p style="color:#94a3b8;">Sin estancias</p>';
      } else {
        html += '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">' +
          '<thead><tr style="background:#f8f9fa;"><th style="padding:6px;">Proyecto</th><th style="padding:6px;">Entrada</th><th style="padding:6px;">Salida</th><th style="padding:6px;text-align:right;">Noches</th><th style="padding:6px;text-align:right;">Pers.</th><th style="padding:6px;text-align:right;">Coste</th><th style="padding:6px;">Comentario</th></tr></thead><tbody>';
        estancias.forEach(function(e) {
          html += '<tr style="border-bottom:1px solid #e9ecef;">' +
            '<td style="padding:5px 6px;">' + (e.proyecto_nombre || '\u2014') + '</td>' +
            '<td style="padding:5px 6px;">' + (e.fecha_entrada || '') + '</td>' +
            '<td style="padding:5px 6px;">' + (e.fecha_salida || '') + '</td>' +
            '<td style="padding:5px 6px;text-align:right;">' + (e.num_noches || 0) + '</td>' +
            '<td style="padding:5px 6px;text-align:right;">' + (e.num_personas || 1) + '</td>' +
            '<td style="padding:5px 6px;text-align:right;">' + (e.coste_total != null ? e.coste_total.toFixed(2) + ' \u20ac' : '\u2014') + '</td>' +
            '<td style="padding:5px 6px;font-size:0.75rem;color:#666;">' + (e.comentario || '') + '</td></tr>';
        });
        html += '</tbody></table>';
      }
      html += '<div style="text-align:right;margin-top:14px;"><button onclick="document.getElementById(\'modal-aloj\').remove()" style="padding:6px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">Cerrar</button></div></div>';
      m.innerHTML = html;
      m.addEventListener("click", function(ev) { if (ev.target === m) m.remove(); });
      document.body.appendChild(m);
    });
}

// ═══ CRUD modals ════════════════════════════════════════════════════════════

function _alojNuevaEstancia() {
  _alojMostrarFormulario(null);
}

function _alojEditarEstancia(id) {
  fetch("/api/alojamientos").then(function(r){return r.json();}).then(function(d) {
    var est = (d.alojamientos || []).find(function(e){return e.id === id;});
    if (est) _alojMostrarFormulario(est);
  });
}

function _alojMostrarFormulario(est) {
  var old = document.getElementById("modal-aloj"); if (old) old.remove();
  var m = document.createElement("div"); m.id = "modal-aloj";
  m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;display:flex;align-items:center;justify-content:center;";
  var isEdit = !!est;
  m.innerHTML = '<div style="background:#fff;border-radius:12px;width:480px;max-width:95%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,0.15);">' +
    '<h3 style="margin:0 0 14px;">' + (isEdit ? 'Editar estancia' : 'Nueva estancia') + '</h3>' +
    '<div style="display:grid;gap:10px;">' +
      '<div><label style="font-size:11px;color:#888;">Hotel</label><input id="aloj-f-hotel" list="aloj-hotels-list" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div>' +
      '<datalist id="aloj-hotels-list"></datalist>' +
      '<div><label style="font-size:11px;color:#888;">Localidad</label><input id="aloj-f-localidad" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div>' +
      '<div><label style="font-size:11px;color:#888;">Proyecto</label><select id="aloj-f-proyecto" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;"><option value="">Sin proyecto</option></select></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div><label style="font-size:11px;color:#888;">Fecha entrada</label><input type="date" id="aloj-f-entrada" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div>' +
        '<div><label style="font-size:11px;color:#888;">Fecha salida</label><input type="date" id="aloj-f-salida" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div><label style="font-size:11px;color:#888;">N\u00ba personas</label><input type="number" id="aloj-f-personas" min="1" value="1" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div>' +
        '<div><label style="font-size:11px;color:#888;">Coste total \u20ac</label><input type="number" id="aloj-f-coste" step="0.01" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div></div>' +
      '<div><label style="font-size:11px;color:#888;">Comentario</label><textarea id="aloj-f-comentario" rows="2" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;font-family:inherit;resize:vertical;"></textarea></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
      '<button onclick="document.getElementById(\'modal-aloj\').remove()" style="padding:6px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">Cancelar</button>' +
      '<button id="aloj-f-save" style="padding:6px 14px;border:none;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;">Guardar</button></div></div>';
  m.addEventListener("click", function(ev) { if (ev.target === m) m.remove(); });
  document.body.appendChild(m);

  // Populate hotel autocomplete
  fetch("/api/alojamientos/historico-hoteles").then(function(r){return r.json();}).then(function(d) {
    var dl = document.getElementById("aloj-hotels-list");
    if (dl) (d.hoteles || []).forEach(function(h) { dl.innerHTML += '<option value="' + (h.hotel_nombre||'') + '">'; });
  }).catch(function(){});

  // Populate project dropdown
  fetch("/api/proyectos/lista?estado=vivo").then(function(r){return r.json();}).then(function(d) {
    var sel = document.getElementById("aloj-f-proyecto");
    if (sel) (d.proyectos || d || []).forEach(function(p) {
      sel.innerHTML += '<option value="' + p.id + '">' + (p.codigo || '') + ' ' + (p.nombre || '') + '</option>';
    });
    if (est && est.proyecto_id) sel.value = est.proyecto_id;
  }).catch(function(){});

  // Pre-fill if editing
  if (est) {
    document.getElementById("aloj-f-hotel").value = est.hotel_nombre || "";
    document.getElementById("aloj-f-localidad").value = est.localidad || "";
    document.getElementById("aloj-f-entrada").value = est.fecha_entrada || "";
    document.getElementById("aloj-f-salida").value = est.fecha_salida || "";
    document.getElementById("aloj-f-personas").value = est.num_personas || 1;
    document.getElementById("aloj-f-coste").value = est.coste_total || "";
    document.getElementById("aloj-f-comentario").value = est.comentario || "";
  }

  document.getElementById("aloj-f-save").addEventListener("click", function() {
    var payload = {
      hotel_nombre: document.getElementById("aloj-f-hotel").value,
      localidad: document.getElementById("aloj-f-localidad").value,
      proyecto_id: document.getElementById("aloj-f-proyecto").value || null,
      fecha_entrada: document.getElementById("aloj-f-entrada").value,
      fecha_salida: document.getElementById("aloj-f-salida").value,
      num_personas: parseInt(document.getElementById("aloj-f-personas").value) || 1,
      coste_total: parseFloat(document.getElementById("aloj-f-coste").value) || null,
      comentario: document.getElementById("aloj-f-comentario").value
    };
    var url = isEdit ? "/api/alojamientos/" + est.id : "/api/alojamientos";
    var method = isEdit ? "PUT" : "POST";
    fetch(url, { method: method, headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload) })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.error) { alert("Error: " + d.error); return; }
        m.remove();
        _alojCargarEstancias();
      })
      .catch(function(err) { alert("Error: " + err.message); });
  });
}

function _alojEliminarEstancia(id) {
  if (!confirm("\u00bfEliminar esta estancia?")) return;
  fetch("/api/alojamientos/" + id, { method: "DELETE" })
    .then(function() { _alojCargarEstancias(); });
}

// ═══ Expose ═════════════════════════════════════════════════════════════════

window._alojamientoInit = _alojamientoInit;
window._alojCambiarTab = _alojCambiarTab;
window._alojCargarEstancias = _alojCargarEstancias;
window._alojFiltrarLocal = _alojFiltrarLocal;
window._alojNuevaEstancia = _alojNuevaEstancia;
window._alojEditarEstancia = _alojEditarEstancia;
window._alojEliminarEstancia = _alojEliminarEstancia;
window._alojVerHotel = _alojVerHotel;
