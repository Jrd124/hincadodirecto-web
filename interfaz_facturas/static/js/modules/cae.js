// ═══ CAE — coordinación actividades empresariales ═══

// === MODULO CAE ===================================================================

var _caeConstantes = null;
var _caeExpDetalleId = null;
var _caeFolderState = { driveId: null, folderId: null, path: [] };

// ── Helpers ──

function _caeFetch(url, opts) {
  return fetch(url, opts).then(function (r) { return r.json(); });
}

function _caeBadge(status) {
  var colors = { READY: "#28a745", MISSING: "#dc3545", EXPIRED: "#fd7e14", DOUBTFUL: "#ffc107" };
  var labels = { READY: "OK", MISSING: "Falta", EXPIRED: "Caducado", DOUBTFUL: "Dudoso" };
  var estadoColors = { ABIERTO: "#17a2b8", EN_REVISION: "#ffc107", COMPLETO: "#28a745", CERRADO: "#6c757d" };
  var c = colors[status] || estadoColors[status] || "#6c757d";
  var l = labels[status] || status;
  return '<span style="background:' + c + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:0.8rem;font-weight:600;">' + l + '</span>';
}

function _caePrioridad(p) {
  var c = { HIGH: "#dc3545", MEDIUM: "#ffc107", LOW: "#6c757d" };
  var l = { HIGH: "Alta", MEDIUM: "Media", LOW: "Baja" };
  return '<span style="color:' + (c[p] || "#6c757d") + ';font-weight:600;">' + (l[p] || p) + '</span>';
}

function _caeLoadConstantes() {
  if (_caeConstantes) return Promise.resolve(_caeConstantes);
  return _caeFetch("/api/cae/constantes").then(function (d) { _caeConstantes = d; return d; });
}

// ── Dashboard CAE ──

function caeCargarInicio() {
  _caeFetch("/api/cae/dashboard").then(function (d) {
    document.getElementById("cae-stat-expedientes").textContent = d.expedientes_activos || 0;
    document.getElementById("cae-stat-docs").textContent = d.documentos_total || 0;
    document.getElementById("cae-stat-caducados").textContent = d.documentos_caducados || 0;
    document.getElementById("cae-stat-tareas").textContent = d.tareas_pendientes || 0;
  });
  _caeFetch("/api/cae/expedientes").then(function (d) {
    var tb = document.getElementById("cae-expedientes-recientes");
    if (!tb) return;
    var exps = (d.expedientes || []).slice(0, 5);
    tb.innerHTML = exps.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);">Sin expedientes a&uacute;n</td></tr>' :
      exps.map(function (e) {
        return '<tr><td>' + (e.proyecto_nombre || '-') + '</td><td>' + (e.plantilla_nombre || '-') + '</td><td>' + _caeBadge(e.estado) + '</td><td>' + (e.last_analysis_at || 'Nunca') + '</td><td><button class="btn-link" onclick="caeVerExpediente(' + e.id + ')">Ver</button></td></tr>';
      }).join('');
  });
}

// ── Documentos CAE ──

function caeCargarDocumentos() {
  var q = (document.getElementById("cae-doc-busqueda") || {}).value || "";
  var dt = (document.getElementById("cae-doc-filter-type") || {}).value || "";
  var et = (document.getElementById("cae-doc-filter-entity") || {}).value || "";
  var cf = (document.getElementById("cae-doc-filter-confidence") || {}).value || "";
  var params = "?limit=100" + (q ? "&q=" + encodeURIComponent(q) : "") + (dt ? "&doc_type=" + dt : "") + (et ? "&entity_type=" + et : "") + (cf ? "&confidence=" + cf : "");
  _caeFetch("/api/cae/documentos" + params).then(function (d) {
    var tb = document.getElementById("cae-documentos-tabla");
    if (!tb) return;
    var docs = d.documentos || [];
    tb.innerHTML = docs.length === 0 ? '<tr><td colspan="6" style="text-align:center;">Sin documentos. Configura carpetas y sincroniza.</td></tr>' :
      docs.map(function (doc) {
        return '<tr><td title="' + (doc.ruta || '') + '">' + (doc.nombre || '-') + '</td><td>' + (doc.doc_type || '-') + '</td><td>' + (doc.entity_type || '-') + '</td><td>' + _caeBadge(doc.confidence || 'UNKNOWN') + '</td><td>' + (doc.fecha_caducidad || '-') + '</td><td><button class="btn-link" onclick="caeConfirmarDoc(' + doc.id + ')">Confirmar</button></td></tr>';
      }).join('');
  });
  // Populate doc type filter
  _caeLoadConstantes().then(function (c) {
    var sel = document.getElementById("cae-doc-filter-type");
    if (sel && sel.options.length <= 1) {
      (c.doc_types || []).forEach(function (t) {
        var o = document.createElement("option"); o.value = t; o.textContent = t; sel.appendChild(o);
      });
    }
  });
}

window.caeConfirmarDoc = function (docId) {
  if (confirm("Confirmar clasificacion de este documento?")) {
    fetch("/api/cae/documentos/" + docId, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confidence: "CONFIRMED" })
    }).then(function () { caeCargarDocumentos(); mostrarToast("Documento confirmado", "success"); });
  }
};

// ── Expedientes CAE ──

function caeCargarExpedientes() {
  _caeFetch("/api/cae/expedientes").then(function (d) {
    var tb = document.getElementById("cae-expedientes-tabla");
    if (!tb) return;
    var exps = d.expedientes || [];
    tb.innerHTML = exps.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Sin expedientes. Crea uno vinculado a un proyecto.</td></tr>' :
      exps.map(function (e) {
        return '<tr><td>' + (e.proyecto_nombre || '-') + '</td><td>' + (e.plantilla_nombre || '-') + '</td><td>' + _caeBadge(e.estado) + '</td><td>' + (e.last_analysis_at || 'Nunca') + '</td><td><button class="btn-link" onclick="caeVerExpediente(' + e.id + ')">Ver</button></td></tr>';
      }).join('');
  });
}

window.caeVerExpediente = function (eid) {
  _caeExpDetalleId = eid;
  caeSubpanel = "expediente_detalle";
  mostrarSubpanel("cae", "expediente_detalle");
  caeCargarExpedienteDetalle(eid);
};

function caeCargarExpedienteDetalle(eid) {
  _caeFetch("/api/cae/expedientes/" + eid).then(function (e) {
    document.getElementById("cae-exp-det-nombre").textContent = e.proyecto_nombre || "Expediente";
    document.getElementById("cae-exp-det-titulo").textContent = (e.proyecto_nombre || "Expediente") + " — " + (e.plantilla_nombre || "");

    // Stats
    var res = e.resultados || [];
    var counts = { READY: 0, MISSING: 0, EXPIRED: 0, DOUBTFUL: 0 };
    res.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; });
    var total = res.length;
    var pct = total > 0 ? Math.round(counts.READY / total * 100) : 0;
    document.getElementById("cae-exp-det-stats").innerHTML =
      '<div class="stat-card"><div class="stat-value">' + pct + '%</div><div class="stat-label">Completo</div></div>' +
      '<div class="stat-card"><div class="stat-value" style="color:#28a745;">' + counts.READY + '</div><div class="stat-label">OK</div></div>' +
      '<div class="stat-card"><div class="stat-value" style="color:#dc3545;">' + counts.MISSING + '</div><div class="stat-label">Faltan</div></div>' +
      '<div class="stat-card"><div class="stat-value" style="color:#fd7e14;">' + counts.EXPIRED + '</div><div class="stat-label">Caducados</div></div>' +
      '<div class="stat-card"><div class="stat-value" style="color:#ffc107;">' + counts.DOUBTFUL + '</div><div class="stat-label">Dudosos</div></div>';

    // Entidades
    var entDiv = document.getElementById("cae-exp-entidades");
    var ents = e.entidades || [];
    entDiv.innerHTML = ents.length === 0 ? '<p style="color:var(--text-secondary);">Sin entidades asignadas.</p>' :
      ents.map(function (en) {
        return '<span style="display:inline-block;background:var(--bg-hover);padding:4px 10px;border-radius:6px;margin:2px;font-size:0.85rem;">' +
          en.entity_type + ' #' + en.entity_id +
          ' <button style="border:none;background:none;color:#dc3545;cursor:pointer;font-weight:bold;" onclick="caeDesasignarEntidad(' + eid + ',\'' + en.entity_type + '\',' + en.entity_id + ')">&times;</button></span>';
      }).join('');

    // Radar documental (matrix)
    _caeRenderRadar(e);

    // Tareas
    var tarTb = document.getElementById("cae-exp-tareas");
    var tareas = e.tareas || [];
    tarTb.innerHTML = tareas.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Sin tareas</td></tr>' :
      tareas.map(function (t) {
        return '<tr><td>' + _caePrioridad(t.prioridad) + '</td><td>' + t.titulo + '</td><td>' + t.tipo + '</td><td>' + _caeBadge(t.estado) + '</td><td>' +
          (t.estado === 'PENDIENTE' ? '<button class="btn-link" onclick="caeCambiarTarea(' + t.id + ',\'EN_CURSO\')">Iniciar</button>' :
           t.estado === 'EN_CURSO' ? '<button class="btn-link" onclick="caeCambiarTarea(' + t.id + ',\'COMPLETADA\')">Completar</button>' : '') + '</td></tr>';
      }).join('');
  });
}

function _caeRenderRadar(exp) {
  var container = document.getElementById("cae-radar-container");
  if (!container) return;
  var resultados = exp.resultados || [];
  if (resultados.length === 0) { container.innerHTML = '<p style="color:var(--text-secondary);">Ejecuta el analisis para ver el radar.</p>'; return; }

  // Group by item name
  var items = {};
  var entities = {};
  resultados.forEach(function (r) {
    var key = r.item_nombre || r.plantilla_item_id;
    if (!items[key]) items[key] = {};
    var eKey = (r.entity_type || '') + (r.entity_id ? '#' + r.entity_id : '');
    items[key][eKey] = r.status;
    entities[eKey] = true;
  });

  var entKeys = Object.keys(entities);
  var html = '<table class="tabla-generica" style="font-size:0.8rem;"><thead><tr><th>Requisito</th>';
  entKeys.forEach(function (ek) { html += '<th style="text-align:center;">' + ek + '</th>'; });
  html += '</tr></thead><tbody>';
  Object.keys(items).forEach(function (itemName) {
    html += '<tr><td>' + itemName + '</td>';
    entKeys.forEach(function (ek) {
      var s = items[itemName][ek];
      var colors = { READY: "#28a745", MISSING: "#dc3545", EXPIRED: "#fd7e14", DOUBTFUL: "#ffc107" };
      var c = colors[s] || "#e9ecef";
      html += '<td style="text-align:center;"><span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:' + c + ';" title="' + (s || 'N/A') + '"></span></td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Acciones expediente ──

window.caeDesasignarEntidad = function (eid, etype, entityId) {
  fetch("/api/cae/expedientes/" + eid + "/entidades", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_type: etype, entity_id: entityId })
  }).then(function () { caeCargarExpedienteDetalle(eid); });
};

window.caeCambiarTarea = function (tid, estado) {
  fetch("/api/cae/tareas/" + tid, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado: estado })
  }).then(function () {
    if (_caeExpDetalleId) caeCargarExpedienteDetalle(_caeExpDetalleId);
    mostrarToast("Tarea actualizada", "success");
  });
};

// ── Plantillas CAE ──

function caeCargarPlantillas() {
  _caeFetch("/api/cae/plantillas").then(function (d) {
    var div = document.getElementById("cae-plantillas-lista");
    if (!div) return;
    var pls = d.plantillas || [];
    if (pls.length === 0) { div.innerHTML = '<div class="card"><p style="text-align:center;">Sin plantillas. Crea una para definir requisitos documentales.</p></div>'; return; }
    div.innerHTML = pls.map(function (p) {
      var itemsHtml = (p.items || []).map(function (i) {
        return '<tr><td>' + i.nombre + '</td><td>' + i.target_entity_type + '</td><td>' + i.doc_type + '</td><td>' + (i.is_mandatory ? 'Si' : 'No') + '</td></tr>';
      }).join('');
      return '<div class="card" style="margin-bottom:1rem;"><div style="display:flex;justify-content:space-between;align-items:center;"><h3>' + p.nombre + '</h3><div><button class="btn-link" onclick="caeEditarPlantilla(' + p.id + ')">Editar</button> <button class="btn-link" style="color:#dc3545;" onclick="caeEliminarPlantilla(' + p.id + ')">Eliminar</button></div></div>' +
        '<p style="color:var(--text-secondary);font-size:0.9rem;">' + (p.cliente_nombre || 'Sin cliente') + (p.descripcion ? ' — ' + p.descripcion : '') + '</p>' +
        '<table class="tabla-generica" style="margin-top:0.5rem;"><thead><tr><th>Requisito</th><th>Entidad</th><th>Tipo doc</th><th>Obligatorio</th></tr></thead><tbody>' + itemsHtml + '</tbody></table></div>';
    }).join('');
  });
}

window.caeEliminarPlantilla = function (pid) {
  if (confirm("Eliminar plantilla?")) {
    fetch("/api/cae/plantillas/" + pid, { method: "DELETE" }).then(function () {
      caeCargarPlantillas(); mostrarToast("Plantilla eliminada", "success");
    });
  }
};

window.caeEditarPlantilla = function (pid) {
  // Simplified: open modal, load data
  _caeAbrirModalPlantilla(pid);
};

// ── Tareas CAE ──

function caeCargarTareas() {
  var est = (document.getElementById("cae-tarea-filter-estado") || {}).value || "";
  var pri = (document.getElementById("cae-tarea-filter-prioridad") || {}).value || "";
  var params = "?" + (est ? "estado=" + est + "&" : "") + (pri ? "prioridad=" + pri : "");
  _caeFetch("/api/cae/tareas" + params).then(function (d) {
    var tb = document.getElementById("cae-tareas-tabla");
    if (!tb) return;
    var tareas = d.tareas || [];
    tb.innerHTML = tareas.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Sin tareas</td></tr>' :
      tareas.map(function (t) {
        return '<tr><td>' + _caePrioridad(t.prioridad) + '</td><td>' + t.titulo + '</td><td>' + t.tipo + '</td><td>' + _caeBadge(t.estado) + '</td><td>' +
          (t.estado === 'PENDIENTE' ? '<button class="btn-link" onclick="caeCambiarTarea(' + t.id + ',\'EN_CURSO\')">Iniciar</button>' :
           t.estado === 'EN_CURSO' ? '<button class="btn-link" onclick="caeCambiarTarea(' + t.id + ',\'COMPLETADA\')">Completar</button>' : '') + '</td></tr>';
      }).join('');
  });
}

// ── Config CAE ──

function caeCargarConfig() {
  _caeFetch("/api/cae/sync/carpetas").then(function (d) {
    var div = document.getElementById("cae-carpetas-lista");
    if (!div) return;
    var cs = d.carpetas || [];
    div.innerHTML = cs.length === 0 ? '<p style="color:var(--text-secondary);">Sin carpetas configuradas.</p>' :
      cs.map(function (c) {
        return '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;background:var(--bg-hover);border-radius:6px;margin-bottom:0.25rem;">' +
          '<span style="flex:1;">' + (c.label || c.folder_path || 'Carpeta') + '</span>' +
          '<span style="color:var(--text-secondary);font-size:0.8rem;">Sync: ' + (c.last_synced_at || 'Nunca') + '</span>' +
          '<button class="btn-link" style="color:#dc3545;" onclick="caeEliminarCarpeta(' + c.id + ')">Quitar</button></div>';
      }).join('');
  });
  _caeFetch("/api/cae/sync/runs?limit=10").then(function (d) {
    var tb = document.getElementById("cae-sync-runs-tabla");
    if (!tb) return;
    var runs = d.runs || [];
    tb.innerHTML = runs.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Sin historial</td></tr>' :
      runs.map(function (r) {
        return '<tr><td>' + (r.carpeta_label || '-') + '</td><td>' + (r.started_at || '-') + '</td><td>' + (r.items_found || 0) + '</td><td>' + (r.items_new || 0) + '</td><td>' + _caeBadge(r.status || 'OK') + '</td></tr>';
      }).join('');
  });
}

window.caeEliminarCarpeta = function (cid) {
  if (confirm("Quitar esta carpeta de la indexacion?")) {
    fetch("/api/cae/sync/carpetas/" + cid, { method: "DELETE" }).then(function () {
      caeCargarConfig(); mostrarToast("Carpeta eliminada", "success");
    });
  }
};

// ── Modal nuevo expediente ──

function _caeAbrirModalExpediente() {
  var modal = document.getElementById("modal-cae-nuevo-expediente");
  modal.style.display = "";
  modal.classList.add("visible");
  // Load projects
  _caeFetch("/api/proyectos/").then(function (d) {
    var sel = document.getElementById("cae-exp-proyecto-select");
    sel.innerHTML = '<option value="">Seleccionar...</option>';
    (d.proyectos || d || []).forEach(function (p) {
      sel.innerHTML += '<option value="' + p.id + '">' + (p.codigo || '') + ' — ' + p.nombre + '</option>';
    });
  });
  // Load templates
  _caeFetch("/api/cae/plantillas").then(function (d) {
    var sel = document.getElementById("cae-exp-plantilla-select");
    sel.innerHTML = '<option value="">Seleccionar...</option>';
    (d.plantillas || []).forEach(function (p) {
      sel.innerHTML += '<option value="' + p.id + '">' + p.nombre + '</option>';
    });
  });
}

// ── Modal nueva/editar plantilla ──

function _caeAbrirModalPlantilla(pid) {
  var modal = document.getElementById("modal-cae-nueva-plantilla");
  modal.style.display = "";
  modal.classList.add("visible");
  document.getElementById("cae-plantilla-modal-titulo").textContent = pid ? "Editar plantilla" : "Nueva plantilla";
  modal.dataset.editId = pid || "";

  // Load empresas CRM
  _caeFetch("/api/crm/empresas").then(function (d) {
    var sel = document.getElementById("cae-plantilla-cliente");
    sel.innerHTML = '<option value="">Sin cliente especifico</option>';
    (d.empresas || []).forEach(function (e) {
      sel.innerHTML += '<option value="' + e.id + '">' + e.nombre + '</option>';
    });
  });

  if (pid) {
    _caeFetch("/api/cae/plantillas/" + pid).then(function (p) {
      document.getElementById("cae-plantilla-nombre").value = p.nombre || "";
      document.getElementById("cae-plantilla-desc").value = p.descripcion || "";
      if (p.cliente_empresa_id) document.getElementById("cae-plantilla-cliente").value = p.cliente_empresa_id;
      _caeRenderPlantillaItems(p.items || []);
    });
  } else {
    document.getElementById("cae-plantilla-nombre").value = "";
    document.getElementById("cae-plantilla-desc").value = "";
    _caeRenderPlantillaItems([]);
  }
}

function _caeRenderPlantillaItems(items) {
  var div = document.getElementById("cae-plantilla-items-lista");
  div.innerHTML = "";
  items.forEach(function (item, i) { _caeAddPlantillaItemRow(div, item, i); });
}

function _caeAddPlantillaItemRow(container, item, idx) {
  _caeLoadConstantes().then(function (c) {
    var row = document.createElement("div");
    row.className = "cae-plantilla-item-row";
    row.style.cssText = "display:flex;gap:0.5rem;align-items:center;margin-bottom:0.5rem;flex-wrap:wrap;";
    row.dataset.idx = idx;

    var dtOptions = (c.doc_types || []).map(function (t) {
      return '<option value="' + t + '"' + (t === (item.doc_type || '') ? ' selected' : '') + '>' + t + '</option>';
    }).join('');

    row.innerHTML =
      '<input type="text" placeholder="Nombre" value="' + (item.nombre || '') + '" class="cae-pi-nombre" style="flex:2;min-width:150px;" />' +
      '<select class="cae-pi-entity-type" style="width:auto;"><option value="EMPRESA"' + ((item.target_entity_type || '') === 'EMPRESA' ? ' selected' : '') + '>Empresa</option><option value="OPERARIO"' + ((item.target_entity_type || '') === 'OPERARIO' ? ' selected' : '') + '>Operario</option><option value="MAQUINA"' + ((item.target_entity_type || '') === 'MAQUINA' ? ' selected' : '') + '>Maquina</option><option value="VEHICULO"' + ((item.target_entity_type || '') === 'VEHICULO' ? ' selected' : '') + '>Vehiculo</option></select>' +
      '<select class="cae-pi-doc-type" style="width:auto;">' + dtOptions + '</select>' +
      '<label style="font-size:0.85rem;"><input type="checkbox" class="cae-pi-mandatory"' + (item.is_mandatory !== 0 ? ' checked' : '') + ' /> Oblig.</label>' +
      '<button type="button" style="border:none;background:none;color:#dc3545;cursor:pointer;font-size:1.2rem;" onclick="this.parentElement.remove()">&times;</button>';

    container.appendChild(row);
  });
}

// ── Folder explorer ──

function _caeAbrirFolderExplorer() {
  var modal = document.getElementById("modal-cae-folder-explorer");
  modal.style.display = "";
  modal.classList.add("visible");
  _caeFolderState = { driveId: null, folderId: null, path: [{ name: "Drives", driveId: null, folderId: null }] };
  // First: list drives
  _caeFetch("/api/cae/onedrive/drives").then(function (d) {
    var list = document.getElementById("cae-folder-list");
    list.innerHTML = (d.drives || []).map(function (dr) {
      return '<div class="cae-folder-item" style="padding:8px;cursor:pointer;border-bottom:1px solid var(--border);" onclick="caeSelectDrive(\'' + dr.id + '\',\'' + (dr.name || '').replace(/'/g, "\\'") + '\')">' +
        '<strong>' + (dr.name || 'Drive') + '</strong></div>';
    }).join('') || '<p>No se encontraron drives.</p>';
    _caeUpdateFolderBreadcrumb();
  });
}

window.caeSelectDrive = function (driveId, name) {
  _caeFolderState.driveId = driveId;
  _caeFolderState.folderId = null;
  _caeFolderState.path = [{ name: "Drives", driveId: null, folderId: null }, { name: name, driveId: driveId, folderId: null }];
  _caeLoadFolderContents();
};

window.caeNavigateFolder = function (folderId, name) {
  _caeFolderState.folderId = folderId;
  _caeFolderState.path.push({ name: name, driveId: _caeFolderState.driveId, folderId: folderId });
  _caeLoadFolderContents();
};

function _caeLoadFolderContents() {
  var params = "?drive_id=" + _caeFolderState.driveId;
  if (_caeFolderState.folderId) params += "&folder_id=" + _caeFolderState.folderId;
  _caeFetch("/api/cae/onedrive/carpetas" + params).then(function (d) {
    var list = document.getElementById("cae-folder-list");
    var items = (d.items || []).filter(function (i) { return i.is_folder; });
    list.innerHTML = items.map(function (i) {
      return '<div class="cae-folder-item" style="padding:8px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;" onclick="caeNavigateFolder(\'' + i.id + '\',\'' + (i.name || '').replace(/'/g, "\\'") + '\')">' +
        '<span>&#128193; ' + i.name + '</span><span style="color:var(--text-secondary);font-size:0.8rem;">' + (i.child_count || 0) + ' items</span></div>';
    }).join('') || '<p style="padding:8px;color:var(--text-secondary);">Carpeta vacia</p>';
    _caeUpdateFolderBreadcrumb();
  });
}

function _caeUpdateFolderBreadcrumb() {
  var bc = document.getElementById("cae-folder-breadcrumb");
  bc.innerHTML = _caeFolderState.path.map(function (p, i) {
    return '<span style="cursor:pointer;text-decoration:underline;" onclick="caeNavBreadcrumb(' + i + ')">' + p.name + '</span>';
  }).join(' &rsaquo; ');
}

window.caeNavBreadcrumb = function (idx) {
  var p = _caeFolderState.path[idx];
  _caeFolderState.driveId = p.driveId;
  _caeFolderState.folderId = p.folderId;
  _caeFolderState.path = _caeFolderState.path.slice(0, idx + 1);
  if (!p.driveId) {
    // Back to drives
    _caeFetch("/api/cae/onedrive/drives").then(function (d) {
      document.getElementById("cae-folder-list").innerHTML = (d.drives || []).map(function (dr) {
        return '<div class="cae-folder-item" style="padding:8px;cursor:pointer;border-bottom:1px solid var(--border);" onclick="caeSelectDrive(\'' + dr.id + '\',\'' + (dr.name || '').replace(/'/g, "\\'") + '\')">' +
          '<strong>' + (dr.name || 'Drive') + '</strong></div>';
      }).join('');
      _caeUpdateFolderBreadcrumb();
    });
  } else {
    _caeLoadFolderContents();
  }
};

// ── Event listeners (CAE) ──

document.addEventListener("DOMContentLoaded", function () {
  // Navigation hooks
  var caeNavLinks = {
    "nav-cae-inicio": "inicio", "nav-cae-documentos": "documentos",
    "nav-cae-expedientes": "expedientes", "nav-cae-plantillas": "plantillas",
    "nav-cae-tareas": "tareas", "nav-cae-config": "config"
  };
  Object.keys(caeNavLinks).forEach(function (linkId) {
    var el = document.getElementById(linkId);
    if (el) el.addEventListener("click", function (ev) {
      ev.preventDefault();
      caeSubpanel = caeNavLinks[linkId];
      mostrarSubpanel("cae", caeSubpanel);
      _caeOnPanelShow(caeSubpanel);
    });
  });

  // Buttons
  var btnNuevoExp = document.getElementById("btn-nuevo-expediente");
  if (btnNuevoExp) btnNuevoExp.addEventListener("click", _caeAbrirModalExpediente);

  var btnExpVolver = document.getElementById("btn-cae-exp-volver");
  if (btnExpVolver) btnExpVolver.addEventListener("click", function () {
    caeSubpanel = "expedientes";
    mostrarSubpanel("cae", "expedientes");
    caeCargarExpedientes();
  });

  var btnAnalizar = document.getElementById("btn-cae-exp-analizar");
  if (btnAnalizar) btnAnalizar.addEventListener("click", function () {
    if (!_caeExpDetalleId) return;
    fetch("/api/cae/expedientes/" + _caeExpDetalleId + "/analizar", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { mostrarToast(d.error, "error"); return; }
        mostrarToast("Analisis completado: " + d.porcentaje_completo + "% completo", "success");
        caeCargarExpedienteDetalle(_caeExpDetalleId);
      });
  });

  // Asignar entidad
  var btnAsignar = document.getElementById("btn-cae-exp-asignar");
  if (btnAsignar) btnAsignar.addEventListener("click", function () {
    var etype = document.getElementById("cae-exp-ent-type").value;
    var eid = document.getElementById("cae-exp-ent-id").value;
    if (!eid || !_caeExpDetalleId) return;
    fetch("/api/cae/expedientes/" + _caeExpDetalleId + "/entidades", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: etype, entity_id: parseInt(eid) })
    }).then(function () { caeCargarExpedienteDetalle(_caeExpDetalleId); mostrarToast("Entidad asignada", "success"); });
  });

  // Load entity options when type changes
  var entTypeSelect = document.getElementById("cae-exp-ent-type");
  if (entTypeSelect) entTypeSelect.addEventListener("change", function () { _caeLoadEntityOptions(this.value); });

  // Doc filters
  var btnDocFiltrar = document.getElementById("cae-doc-filtrar");
  if (btnDocFiltrar) btnDocFiltrar.addEventListener("click", caeCargarDocumentos);

  // Tareas filters
  var btnTareasFiltrar = document.getElementById("cae-tareas-filtrar");
  if (btnTareasFiltrar) btnTareasFiltrar.addEventListener("click", caeCargarTareas);

  // Nueva plantilla
  var btnNuevaPlantilla = document.getElementById("btn-nueva-plantilla");
  if (btnNuevaPlantilla) btnNuevaPlantilla.addEventListener("click", function () { _caeAbrirModalPlantilla(null); });

  var btnPlantillaClose = document.getElementById("btn-cae-plantilla-modal-close");
  if (btnPlantillaClose) btnPlantillaClose.addEventListener("click", function () {
    document.getElementById("modal-cae-nueva-plantilla").classList.remove("visible");
  });

  var btnAddItem = document.getElementById("btn-cae-plantilla-add-item");
  if (btnAddItem) btnAddItem.addEventListener("click", function () {
    var container = document.getElementById("cae-plantilla-items-lista");
    _caeAddPlantillaItemRow(container, {}, container.children.length);
  });

  var btnGuardarPlantilla = document.getElementById("btn-cae-plantilla-guardar");
  if (btnGuardarPlantilla) btnGuardarPlantilla.addEventListener("click", function () {
    var modal = document.getElementById("modal-cae-nueva-plantilla");
    var editId = modal.dataset.editId;
    var items = [];
    document.querySelectorAll(".cae-plantilla-item-row").forEach(function (row, i) {
      items.push({
        nombre: row.querySelector(".cae-pi-nombre").value,
        target_entity_type: row.querySelector(".cae-pi-entity-type").value,
        doc_type: row.querySelector(".cae-pi-doc-type").value,
        is_mandatory: row.querySelector(".cae-pi-mandatory").checked ? 1 : 0,
        sort_order: i,
      });
    });
    var data = {
      nombre: document.getElementById("cae-plantilla-nombre").value,
      descripcion: document.getElementById("cae-plantilla-desc").value,
      cliente_empresa_id: document.getElementById("cae-plantilla-cliente").value || null,
      items: items,
    };
    var url = editId ? "/api/cae/plantillas/" + editId : "/api/cae/plantillas";
    var method = editId ? "PUT" : "POST";
    fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function () { modal.classList.remove("visible"); caeCargarPlantillas(); mostrarToast("Plantilla guardada", "success"); });
  });

  // Expediente modal
  var btnExpClose = document.getElementById("btn-cae-exp-modal-close");
  if (btnExpClose) btnExpClose.addEventListener("click", function () {
    document.getElementById("modal-cae-nuevo-expediente").classList.remove("visible");
  });

  var btnExpCrear = document.getElementById("btn-cae-exp-crear");
  if (btnExpCrear) btnExpCrear.addEventListener("click", function () {
    var pid = document.getElementById("cae-exp-proyecto-select").value;
    var tid = document.getElementById("cae-exp-plantilla-select").value;
    if (!pid) { mostrarToast("Selecciona un proyecto", "error"); return; }
    fetch("/api/cae/expedientes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proyecto_id: parseInt(pid), plantilla_id: tid ? parseInt(tid) : null })
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        document.getElementById("modal-cae-nuevo-expediente").classList.remove("visible");
        if (d.error) { mostrarToast(d.error, "error"); return; }
        mostrarToast("Expediente creado", "success");
        caeVerExpediente(d.id);
      });
  });

  // Folder explorer
  var btnAddCarpeta = document.getElementById("btn-cae-add-carpeta");
  if (btnAddCarpeta) btnAddCarpeta.addEventListener("click", _caeAbrirFolderExplorer);

  var btnFolderClose = document.getElementById("btn-cae-folder-close");
  if (btnFolderClose) btnFolderClose.addEventListener("click", function () {
    document.getElementById("modal-cae-folder-explorer").classList.remove("visible");
  });

  var btnFolderSelect = document.getElementById("btn-cae-folder-select");
  if (btnFolderSelect) btnFolderSelect.addEventListener("click", function () {
    if (!_caeFolderState.driveId) { mostrarToast("Navega hasta una carpeta", "error"); return; }
    var label = document.getElementById("cae-folder-label").value || null;
    var pathStr = _caeFolderState.path.map(function (p) { return p.name; }).join("/");
    fetch("/api/cae/sync/carpetas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        drive_id: _caeFolderState.driveId,
        folder_id: _caeFolderState.folderId || "root",
        folder_path: pathStr,
        label: label,
      })
    }).then(function () {
      document.getElementById("modal-cae-folder-explorer").classList.remove("visible");
      document.getElementById("cae-folder-label").value = "";
      caeCargarConfig();
      mostrarToast("Carpeta anadida", "success");
    });
  });

  // Sync button
  var btnSync = document.getElementById("btn-cae-sync-ahora");
  if (btnSync) btnSync.addEventListener("click", function () {
    var status = document.getElementById("cae-sync-status");
    status.innerHTML = '<span style="color:var(--text-secondary);">Sincronizando...</span>';
    btnSync.disabled = true;
    fetch("/api/cae/sync/ejecutar", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        btnSync.disabled = false;
        var results = d.resultados || [];
        var totalNew = results.reduce(function (a, r) { return a + (r.items_new || 0); }, 0);
        status.innerHTML = '<span style="color:#28a745;">Completado. ' + totalNew + ' documentos nuevos.</span>';
        caeCargarConfig();
      })
      .catch(function () {
        btnSync.disabled = false;
        status.innerHTML = '<span style="color:#dc3545;">Error al sincronizar.</span>';
      });
  });
});

function _caeLoadEntityOptions(entityType) {
  var sel = document.getElementById("cae-exp-ent-id");
  if (!sel) return;
  sel.innerHTML = '<option value="">Cargando...</option>';
  var url = entityType === "OPERARIO" ? "/api/empleados" : entityType === "MAQUINA" ? "/api/maquinaria/maquinas" : "/api/vehiculos";
  _caeFetch(url).then(function (d) {
    var items = d.empleados || d.maquinas || d.vehiculos || [];
    sel.innerHTML = '<option value="">Seleccionar...</option>' +
      items.map(function (i) {
        var label = i.nombre || i.internal_id || i.matricula || "?";
        if (i.apellidos) label += " " + i.apellidos;
        return '<option value="' + i.id + '">' + label + '</option>';
      }).join('');
  });
}

function _caeOnPanelShow(panel) {
  if (panel === "inicio") caeCargarInicio();
  if (panel === "documentos") caeCargarDocumentos();
  if (panel === "expedientes") caeCargarExpedientes();
  if (panel === "plantillas") caeCargarPlantillas();
  if (panel === "tareas") caeCargarTareas();
  if (panel === "config") caeCargarConfig();
}

// Bridge: expose mostrarSubpanel globally so CAE event listeners can call it
// It delegates to the existing activarSubpanel + triggers CAE data loading
window.mostrarSubpanel = function (mod, sub) {
  activarSubpanel(mod, sub);
  if (mod === "cae") _caeOnPanelShow(sub);
  if (mod === "rrhh" && typeof window._rrhhOnPanelShow === "function") window._rrhhOnPanelShow(sub);
};

// ── Expose functions globally for onclick handlers and external callers ──
window.caeCargarInicio = caeCargarInicio;
window._caeOnPanelShow = _caeOnPanelShow;
window.caeCargarDocumentos = caeCargarDocumentos;
window.caeCargarExpedientes = caeCargarExpedientes;
window.caeCargarPlantillas = caeCargarPlantillas;
window.caeCargarTareas = caeCargarTareas;
window.caeCargarConfig = caeCargarConfig;
window.caeVerExpediente = window.caeVerExpediente; // already on window, kept for clarity
window.caeCargarExpedienteDetalle = caeCargarExpedienteDetalle;
