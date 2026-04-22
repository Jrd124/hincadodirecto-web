/* ═══ Operario page JS — loaded as separate file to avoid f-string escaping ═══ */
/* Globals expected: TOKEN, HORO_MIN, ZONAS_LABELS, INC_DATA (set by inline script) */

var incFiles = [];

/* ── Tab navigation ── */
function switchTab(tab) {
  var tabs = ["incidencias", "check", "estado"];
  tabs.forEach(function(t) {
    var panel = document.getElementById("tab-" + t);
    var btn = document.getElementById("tab-btn-" + t);
    if (t === tab) {
      panel.classList.add("active");
      btn.classList.add("active");
    } else {
      panel.classList.remove("active");
      btn.classList.remove("active");
    }
  });
}

/* ── Detalle incidencia ── */
var _updateFiles = [];

function _buildGallery(fotos) {
  if (!fotos || fotos.length === 0) return '';
  var html = '<div class="detail-gallery">';
  fotos.forEach(function(f) {
    var src = "/api/maquinaria/fotos/file/" + (f.nombre_archivo || f.filepath || f.filename || "");
    var isVideo = (f.nombre_original || f.filename || "").match(/\.(mp4|mov|avi|webm)$/i);
    if (isVideo) {
      html += '<div class="detail-gallery-item"><video src="' + src + '" controls preload="metadata" style="width:100%;max-height:300px;border-radius:8px;border:1px solid #e9ecef;"></video></div>';
    } else {
      html += '<div class="detail-gallery-item"><img src="' + src + '" onclick="event.stopPropagation();abrirLightbox(\'' + src + '\',false)"></div>';
    }
  });
  html += '</div>';
  return html;
}

function _buildUpdatesTimeline(updates) {
  if (!updates || updates.length === 0) return '';
  var html = '<div style="font-weight:600;font-size:.85rem;margin-top:1rem;margin-bottom:.5rem;border-top:1px solid #e9ecef;padding-top:.8rem;">Actualizaciones (' + updates.length + ')</div>';
  updates.forEach(function(u) {
    var fecha = (u.created_at || "").replace("T", " ").substring(0, 16);
    html += '<div style="background:#f8f9fa;border-radius:8px;padding:.6rem .8rem;margin-bottom:.5rem;border-left:3px solid #3b82f6;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem;">' +
        '<span style="font-size:.78rem;font-weight:600;color:#1e3a5f;">' + (u.autor_nombre || "Operario") + '</span>' +
        '<span style="font-size:.72rem;color:#6c757d;">' + fecha + '</span>' +
      '</div>' +
      '<div style="font-size:.88rem;line-height:1.4;white-space:pre-wrap;">' + (u.texto || "") + '</div>';
    if (u.fotos && u.fotos.length > 0) {
      html += _buildGallery(u.fotos);
    }
    html += '</div>';
  });
  return html;
}

function verDetalleInc(incId) {
  var inc = INC_DATA.find(function(i) { return i.id === incId; });
  if (!inc) return;

  var sevColors = { baja: "#22c55e", media: "#f59e0b", alta: "#ef4444", seguridad: "#dc2626" };
  var sevColor = sevColors[inc.severidad || "media"] || "#6c757d";
  var zonaLabel = ZONAS_LABELS[inc.zona] || "";
  var reporter = inc.operario_nombre || inc.usuario_nombre || "\u2014";
  var fotos = inc.fotos || [];
  var updates = inc.updates || [];

  var galleryHtml = "";
  if (fotos.length > 0) {
    galleryHtml = '<div style="font-weight:600;font-size:.85rem;margin-bottom:.4rem;">Fotos / V\u00eddeos (' + fotos.length + ')</div>' + _buildGallery(fotos);
  } else {
    galleryHtml = '<p style="font-size:.82rem;color:#6c757d;">Sin archivos adjuntos</p>';
  }

  var updatesHtml = _buildUpdatesTimeline(updates);

  // Formulario para añadir actualización (solo si incidencia abierta)
  var updateFormHtml = '';
  if (inc.estado !== "cerrada") {
    updateFormHtml =
      '<div style="border-top:1px solid #e9ecef;margin-top:1rem;padding-top:.8rem;">' +
        '<div style="font-weight:600;font-size:.85rem;margin-bottom:.5rem;">A\u00f1adir actualizaci\u00f3n</div>' +
        '<textarea id="update-texto" rows="2" placeholder="Ej: Latiguillos pedidos a empresa X, llegan ma\u00f1ana..." style="width:100%;border:1px solid #dee2e6;border-radius:6px;padding:.5rem;font-size:.88rem;resize:vertical;min-height:50px;box-sizing:border-box;"></textarea>' +
        '<div style="display:flex;gap:.5rem;margin-top:.4rem;align-items:center;">' +
          '<label style="font-size:.8rem;color:#6c757d;cursor:pointer;display:flex;align-items:center;gap:.3rem;" onclick="document.getElementById(\'update-foto-input\').click()">' +
            '&#128247; Adjuntar foto' +
          '</label>' +
          '<input type="file" id="update-foto-input" accept="image/*,video/*" capture="environment" style="display:none;" onchange="previewUpdateFoto(this)">' +
          '<div id="update-foto-preview" style="flex:1;font-size:.78rem;color:#495057;"></div>' +
        '</div>' +
        '<button type="button" class="btn btn-primary" style="margin-top:.5rem;font-size:.88rem;padding:.6rem;" onclick="enviarUpdate(' + inc.id + ')">Enviar actualizaci\u00f3n</button>' +
      '</div>';
  }

  var html =
    '<button type="button" class="modal-close" onclick="cerrarDetalleInc()">&times;</button>' +
    '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<span class="badge-sev" style="background:' + sevColor + ';font-size:.78rem;">' + (inc.severidad || "media").toUpperCase() + '</span>' +
      (zonaLabel ? '<span class="badge-zona">' + zonaLabel + '</span>' : '') +
      '<span style="font-size:.78rem;color:#6c757d;margin-left:auto;">#' + inc.id + '</span>' +
    '</div>' +
    '<div class="detail-row"><span class="detail-label">Fecha</span><span class="detail-val">' + (inc.fecha || "\u2014") + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">Reportado por</span><span class="detail-val">' + reporter + '</span></div>' +
    (inc.estado === "cerrada" ?
      '<div class="detail-row"><span class="detail-label">Estado</span><span class="detail-val" style="color:#16a34a;font-weight:600;">Cerrada</span></div>' +
      '<div class="detail-row"><span class="detail-label">Cerrada</span><span class="detail-val">' + (inc.cerrada_at || "\u2014") + '</span></div>' +
      (inc.resolucion ? '<div style="font-weight:600;font-size:.85rem;margin-top:.6rem;">Resoluci\u00f3n</div><div class="detail-desc">' + inc.resolucion + '</div>' : '')
    :
      '<div class="detail-row"><span class="detail-label">Estado</span><span class="detail-val" style="color:' + sevColor + ';font-weight:600;">Abierta</span></div>'
    ) +
    '<div style="font-weight:600;font-size:.85rem;margin-top:.6rem;">Descripci\u00f3n</div>' +
    '<div class="detail-desc">' + (inc.descripcion || "") + '</div>' +
    galleryHtml +
    updatesHtml +
    updateFormHtml +
    (inc.estado !== "cerrada" ?
      '<button type="button" class="btn btn-danger" style="margin-top:.8rem;" onclick="cerrarDetalleInc();abrirCerrarInc(' + inc.id + ')">Cerrar esta incidencia</button>'
    : '');

  _updateFiles = [];
  document.getElementById("detalle-inc-content").innerHTML = html;
  document.getElementById("modal-detalle-inc").classList.add("show");
}

function previewUpdateFoto(input) {
  if (input.files && input.files[0]) {
    _updateFiles = [input.files[0]];
    var f = input.files[0];
    var size = (f.size / 1024).toFixed(0) + " KB";
    if (f.size > 1048576) size = (f.size / 1048576).toFixed(1) + " MB";
    document.getElementById("update-foto-preview").textContent = f.name + " (" + size + ")";
  }
}

function enviarUpdate(incId) {
  var texto = document.getElementById("update-texto").value.trim();
  if (!texto) { toast("Escribe la actualizaci\u00f3n", false); return; }

  fetch("/api/m/" + TOKEN + "/incidencia/" + incId + "/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto: texto })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.error) { toast(d.error, false); return; }

    // Subir foto si hay
    if (_updateFiles.length > 0) {
      var fd = new FormData();
      fd.append("foto", _updateFiles[0]);
      fd.append("entidad_tipo", "inc_update");
      fd.append("entidad_id", d.id);
      fetch("/api/m/" + TOKEN + "/foto", { method: "POST", body: fd })
      .then(function() {
        toast("Actualizaci\u00f3n a\u00f1adida con foto", true);
        setTimeout(function() { location.reload(); }, 1200);
      })
      .catch(function() {
        toast("Actualizaci\u00f3n a\u00f1adida (fallo al subir foto)", false);
        setTimeout(function() { location.reload(); }, 1200);
      });
    } else {
      toast("Actualizaci\u00f3n a\u00f1adida", true);
      setTimeout(function() { location.reload(); }, 1200);
    }
  })
  .catch(function(err) { toast("Error: " + err.message, false); });
}

function cerrarDetalleInc() {
  document.getElementById("modal-detalle-inc").classList.remove("show");
}

/* ── Lightbox ── */
function abrirLightbox(src, isVideo) {
  var content = document.getElementById("lightbox-content");
  if (isVideo) {
    content.innerHTML = '<video src="' + src + '" controls autoplay style="max-width:95%;max-height:90vh;border-radius:4px;"></video>';
  } else {
    content.innerHTML = '<img src="' + src + '" style="max-width:95%;max-height:90vh;object-fit:contain;border-radius:4px;">';
  }
  document.getElementById("lightbox").classList.add("show");
}

function cerrarLightbox() {
  document.getElementById("lightbox").classList.remove("show");
  document.getElementById("lightbox-content").innerHTML = "";
}

function toast(msg, ok) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast " + (ok ? "ok" : "err");
  t.style.display = "block";
  setTimeout(function() { t.style.display = "none"; }, 3500);
}

/* ── Validación horómetro ── */
var horoInput = document.getElementById("check-horometro");
if (horoInput) {
  horoInput.addEventListener("input", function() {
    var val = parseFloat(this.value);
    var errDiv = document.getElementById("horo-error");
    if (val && val < HORO_MIN) {
      errDiv.textContent = "El hor\u00f3metro no puede ser menor a " + HORO_MIN.toFixed(1) + "h. Las horas no van hacia atr\u00e1s.";
      errDiv.style.display = "block";
      this.style.borderColor = "#dc3545";
    } else {
      errDiv.style.display = "none";
      this.style.borderColor = "#dee2e6";
    }
  });
}

/* ── Preview foto horómetro ── */
function previewFotoHoro(input) {
  var area = document.getElementById("area-foto-horo");
  if (input.files && input.files[0]) {
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
      area.innerHTML = '<img src="' + e.target.result + '" style="max-width:100%;max-height:200px;border-radius:6px;margin-bottom:.3rem;">' +
        '<div class="file-upload-name">' + file.name + '</div>' +
        '<div style="font-size:.75rem;color:#16a34a;font-weight:600;">Foto cargada</div>';
      area.style.borderColor = "#16a34a";
    };
    reader.readAsDataURL(file);
  }
}

/* ── Preview foto/vídeo incidencia ── */
function previewFotoInc(input) {
  if (input.files && input.files[0]) {
    incFiles.push(input.files[0]);
    renderIncFiles();
  }
}

function addExtraFotoInc(input) {
  if (input.files && input.files[0]) {
    incFiles.push(input.files[0]);
    renderIncFiles();
    input.value = "";
  }
}

function removeIncFile(idx) {
  incFiles.splice(idx, 1);
  renderIncFiles();
}

function renderIncFiles() {
  var list = document.getElementById("inc-adjuntos-list");
  var area = document.getElementById("area-foto-inc");
  var addBtn = document.getElementById("btn-add-more-inc");
  if (incFiles.length === 0) {
    list.innerHTML = "";
    area.style.display = "block";
    addBtn.style.display = "none";
    return;
  }
  area.style.display = "none";
  addBtn.style.display = "block";
  var html = "";
  incFiles.forEach(function(f, i) {
    var isVideo = f.type.startsWith("video");
    var icon = isVideo ? "&#127909;" : "&#128247;";
    var size = (f.size / 1024).toFixed(0) + " KB";
    if (f.size > 1048576) size = (f.size / 1048576).toFixed(1) + " MB";
    html += '<div class="adjunto-item">' +
      '<span>' + icon + ' ' + f.name + ' <small>(' + size + ')</small></span>' +
      '<button type="button" onclick="removeIncFile(' + i + ')" class="adjunto-remove">&times;</button></div>';
  });
  list.innerHTML = html;
}

/* ── Enviar check ── */
function enviarCheck(e) {
  e.preventDefault();
  var btn = document.getElementById("btn-check");
  var horoVal = parseFloat(document.getElementById("check-horometro").value) || 0;

  if (horoVal < HORO_MIN) {
    toast("El hor\u00f3metro no puede ser menor a " + HORO_MIN.toFixed(1) + "h", false);
    return false;
  }

  var fotoHoro = document.getElementById("foto-horometro");
  if (!fotoHoro.files || !fotoHoro.files[0]) {
    toast("La foto del hor\u00f3metro es obligatoria", false);
    document.getElementById("area-foto-horo").style.borderColor = "#dc3545";
    return false;
  }

  btn.disabled = true;
  btn.textContent = "Enviando...";

  var checklist = {};
  var items = document.querySelectorAll('#form-check input[type="checkbox"]');
  items.forEach(function(cb) {
    var id = cb.name.replace("item_", "");
    var nota = document.querySelector('input[name="nota_' + id + '"]');
    checklist[id] = { ok: cb.checked, nota: nota ? nota.value : "" };
  });

  var body = {
    horometro: horoVal,
    checklist: checklist,
    observaciones: document.getElementById("check-obs").value
  };

  fetch("/api/m/" + TOKEN + "/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.error) { toast(d.error, false); btn.disabled = false; btn.textContent = "Enviar check semanal"; return; }
    var formData = new FormData();
    formData.append("foto", fotoHoro.files[0]);
    formData.append("entidad_tipo", "check");
    formData.append("entidad_id", d.id);
    return fetch("/api/m/" + TOKEN + "/foto", {
      method: "POST",
      body: formData
    }).then(function() {
      toast("Check enviado correctamente", true);
      btn.disabled = false;
      btn.textContent = "Enviar check semanal";
      document.getElementById("form-check").reset();
      var area = document.getElementById("area-foto-horo");
      area.innerHTML = '<div class="file-upload-icon">&#128247;</div><div class="file-upload-text">Pulsa para hacer foto</div><div id="foto-horo-name" class="file-upload-name"></div>';
      area.style.borderColor = "#dee2e6";
    });
  })
  .catch(function(err) { toast("Error: " + err.message, false); btn.disabled = false; btn.textContent = "Enviar check semanal"; });
  return false;
}

/* ── Enviar incidencia ── */
function enviarIncidencia(e) {
  e.preventDefault();
  var btn = document.getElementById("btn-inc");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  var zonaVal = document.getElementById("inc-zona").value;
  var body = {
    descripcion: document.getElementById("inc-desc").value,
    severidad: document.getElementById("inc-sev").value,
    zona: zonaVal || null
  };

  fetch("/api/m/" + TOKEN + "/incidencia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.error) { toast(d.error, false); btn.disabled = false; btn.textContent = "Reportar incidencia"; return; }

    if (incFiles.length === 0) {
      toast("Incidencia reportada", true);
      resetIncForm();
      return;
    }

    var uploads = incFiles.map(function(file) {
      var fd = new FormData();
      fd.append("foto", file);
      fd.append("entidad_tipo", "incidencia");
      fd.append("entidad_id", d.id);
      return fetch("/api/m/" + TOKEN + "/foto", { method: "POST", body: fd });
    });

    Promise.all(uploads).then(function() {
      toast("Incidencia reportada con " + incFiles.length + " adjunto(s)", true);
      resetIncForm();
    }).catch(function() {
      toast("Incidencia creada pero fallo al subir adjuntos", false);
      resetIncForm();
    });
  })
  .catch(function(err) { toast("Error: " + err.message, false); btn.disabled = false; btn.textContent = "Reportar incidencia"; });
  return false;
}

function resetIncForm() {
  document.getElementById("form-inc").reset();
  document.getElementById("btn-inc").disabled = false;
  document.getElementById("btn-inc").textContent = "Reportar incidencia";
  incFiles = [];
  renderIncFiles();
  var area = document.getElementById("area-foto-inc");
  area.innerHTML = '<div class="file-upload-icon">&#128247; &#127909;</div><div class="file-upload-text">Pulsa para adjuntar foto o v\u00eddeo</div><div id="foto-inc-preview"></div>';
  area.style.display = "block";
}

/* ── Cerrar incidencia ── */
function abrirCerrarInc(incId) {
  document.getElementById("cerrar-inc-id").value = incId;
  document.getElementById("cerrar-inc-resolucion").value = "";
  document.getElementById("foto-cerrar-inc").value = "";
  var area = document.getElementById("area-foto-cerrar");
  area.innerHTML = '<div class="file-upload-icon">&#128247;</div><div class="file-upload-text">Pulsa para adjuntar foto</div><div id="foto-cerrar-preview"></div>';
  area.style.borderColor = "#dee2e6";
  document.getElementById("modal-cerrar-inc").classList.add("show");
}

function cerrarModalInc() {
  document.getElementById("modal-cerrar-inc").classList.remove("show");
}

function previewFotoCerrar(input) {
  var area = document.getElementById("area-foto-cerrar");
  if (input.files && input.files[0]) {
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
      area.innerHTML = '<img src="' + e.target.result + '" style="max-width:100%;max-height:200px;border-radius:6px;margin-bottom:.3rem;">' +
        '<div class="file-upload-name">' + file.name + '</div>' +
        '<div style="font-size:.75rem;color:#16a34a;font-weight:600;">Foto cargada</div>';
      area.style.borderColor = "#16a34a";
    };
    reader.readAsDataURL(file);
  }
}

function confirmarCerrarInc(e) {
  e.preventDefault();
  var incId = document.getElementById("cerrar-inc-id").value;
  var resolucion = document.getElementById("cerrar-inc-resolucion").value.trim();
  if (!resolucion) { toast("Escribe la resoluci\u00f3n", false); return false; }

  var btn = document.getElementById("btn-confirmar-cerrar");
  btn.disabled = true;
  btn.textContent = "Cerrando...";

  fetch("/api/m/" + TOKEN + "/incidencia/" + incId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolucion: resolucion })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.error) { toast(d.error, false); btn.disabled = false; btn.textContent = "Cerrar incidencia"; return; }

    var fotoInput = document.getElementById("foto-cerrar-inc");
    if (fotoInput.files && fotoInput.files[0]) {
      var fd = new FormData();
      fd.append("foto", fotoInput.files[0]);
      fd.append("entidad_tipo", "incidencia");
      fd.append("entidad_id", incId);
      fetch("/api/m/" + TOKEN + "/foto", { method: "POST", body: fd })
      .then(function() {
        toast("Incidencia cerrada", true);
        cerrarModalInc();
        setTimeout(function() { location.reload(); }, 1200);
      })
      .catch(function() {
        toast("Cerrada pero fallo al subir foto", false);
        cerrarModalInc();
        setTimeout(function() { location.reload(); }, 1200);
      });
    } else {
      toast("Incidencia cerrada", true);
      cerrarModalInc();
      setTimeout(function() { location.reload(); }, 1200);
    }
  })
  .catch(function(err) { toast("Error: " + err.message, false); btn.disabled = false; btn.textContent = "Cerrar incidencia"; });
  return false;
}
