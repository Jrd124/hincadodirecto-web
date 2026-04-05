// ═══ SEGUROS — Pólizas, vencimientos, siniestros ════════════════════════════

var _segInit = false;
var _segPolizas = [];
var _segEditId = null;

function cargarSeguros() {
  _initSeguros();
  _cargarKPIs();
  _buscarPolizas();
}

function _initSeguros() {
  if (_segInit) return;
  _segInit = true;
  document.getElementById("seg-filtro-tipo").addEventListener("change", _buscarPolizas);
  document.getElementById("seg-filtro-estado").addEventListener("change", _buscarPolizas);
  document.getElementById("btn-nueva-poliza").addEventListener("click", function () { _abrirModalPoliza(null); });

  document.getElementById("tbody-polizas").addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("button");
    if (!btn) return;
    var id = parseInt(btn.dataset.id);
    if (btn.classList.contains("seg-btn-ver")) _verPoliza(id);
    else if (btn.classList.contains("seg-btn-editar")) _abrirModalPoliza(id);
    else if (btn.classList.contains("seg-btn-eliminar")) _eliminarPoliza(id);
  });
}

function _cargarKPIs() {
  fetch("/api/seguros/resumen?_t=" + Date.now(), { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var fmt = function (v) { return Number(v || 0).toLocaleString("es-ES", { minimumFractionDigits: 0 }) + " \u20AC"; };
      document.getElementById("seg-kpis").innerHTML =
        _kpiCard("P\u00f3lizas vigentes", d.vigentes, "#16A34A", "#DCFCE7") +
        _kpiCard("Vencen en 30d", d.por_vencer_30d, "#D97706", "#FEF3C7") +
        _kpiCard("Coste anual", fmt(d.coste_anual), "#2563EB", "#DBEAFE") +
        _kpiCard("Siniestros abiertos", d.siniestros_abiertos, "#DC2626", "#FEE2E2");
    }).catch(function () {});
}

function _kpiCard(label, value, color, bg) {
  return '<div style="padding:16px;background:' + bg + ';border-radius:12px;border:1px solid ' + color + '20;">' +
    '<div style="font-size:24px;font-weight:700;color:' + color + ';">' + value + '</div>' +
    '<div style="font-size:12px;color:' + color + ';opacity:0.8;">' + label + '</div></div>';
}

function _buscarPolizas() {
  var tipo = document.getElementById("seg-filtro-tipo").value;
  var estado = document.getElementById("seg-filtro-estado").value;
  var url = "/api/seguros/polizas?_t=" + Date.now();
  if (tipo) url += "&tipo=" + tipo;
  if (estado) url += "&estado=" + estado;
  fetch(url, { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      _segPolizas = data.polizas || [];
      _renderTabla();
    });
}

function _renderTabla() {
  var tbody = document.getElementById("tbody-polizas");
  var sinDatos = document.getElementById("seg-sin-datos");
  tbody.innerHTML = "";
  if (!_segPolizas.length) { sinDatos.style.display = "block"; return; }
  sinDatos.style.display = "none";
  var hoy = new Date().toISOString().slice(0, 10);
  var en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  var iconos = { maquinaria: "\uD83C\uDFD7\uFE0F", vehiculo: "\uD83D\uDE97", responsabilidad_civil: "\uD83C\uDFE2", accidentes_convenio: "\uD83D\uDC77", dyo: "\uD83D\uDC54", otro: "\uD83D\uDCCB" };
  var estadoPill = function (e, venc) {
    if (e === "vigente" && venc < hoy) return '<span style="padding:2px 8px;border-radius:10px;font-size:11px;background:#FEE2E2;color:#991B1B;">Vencida!</span>';
    if (e === "vigente" && venc <= en30) return '<span style="padding:2px 8px;border-radius:10px;font-size:11px;background:#FEF3C7;color:#92400E;">Pr\u00f3xima</span>';
    if (e === "vigente") return '<span style="padding:2px 8px;border-radius:10px;font-size:11px;background:#DCFCE7;color:#166534;">Vigente</span>';
    if (e === "vencida") return '<span style="padding:2px 8px;border-radius:10px;font-size:11px;background:#FEE2E2;color:#991B1B;">Vencida</span>';
    if (e === "en_renovacion") return '<span style="padding:2px 8px;border-radius:10px;font-size:11px;background:#FEF3C7;color:#92400E;">Renovando</span>';
    if (e === "cancelada") return '<span style="padding:2px 8px;border-radius:10px;font-size:11px;background:#F3F4F6;color:#6B7280;">Cancelada</span>';
    return "";
  };

  _segPolizas.forEach(function (p) {
    var tr = document.createElement("tr");
    var vencida = p.estado === "vigente" && p.fecha_vencimiento < hoy;
    var proxima = p.estado === "vigente" && !vencida && p.fecha_vencimiento <= en30;
    if (vencida) tr.style.background = "#FEF2F2";
    else if (proxima) tr.style.background = "#FFFBEB";
    var prima = p.prima_anual ? Number(p.prima_anual).toLocaleString("es-ES", { minimumFractionDigits: 2 }) + " \u20AC" : "\u2014";
    tr.innerHTML =
      '<td>' + (iconos[p.tipo] || "") + ' ' + (p.tipo || "").replace("_", " ") + '</td>' +
      '<td>' + (p.numero_poliza || "\u2014") + '</td>' +
      '<td>' + (p.aseguradora || "\u2014") + '</td>' +
      '<td>' + (p.recurso_nombre || "\u2014") + '</td>' +
      '<td>' + (p.fecha_vencimiento || "\u2014") + '</td>' +
      '<td class="numero">' + prima + '</td>' +
      '<td>' + estadoPill(p.estado, p.fecha_vencimiento) + '</td>' +
      '<td class="col-acciones">' +
        '<button class="btn-small seg-btn-ver" data-id="' + p.id + '">Ver</button> ' +
        '<button class="btn-small seg-btn-editar" data-id="' + p.id + '">Editar</button> ' +
        '<button class="btn-small danger seg-btn-eliminar" data-id="' + p.id + '">Eliminar</button>' +
      '</td>';
    tbody.appendChild(tr);
  });
}

// ── Modal nueva/editar póliza ────────────────────────────────────────────

function _abrirModalPoliza(id) {
  _segEditId = id;
  var existing = document.getElementById("modal-poliza");
  if (existing) existing.remove();
  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-poliza";
  modal.style.zIndex = "110";
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });

  function _build(p) {
    p = p || {};
    modal.innerHTML =
      '<div class="modal-editar modal-lg" role="dialog" style="max-height:90vh;overflow-y:auto;">' +
        '<h2 style="margin:0 0 16px;">' + (id ? "Editar p\u00f3liza" : "Nueva p\u00f3liza") + '</h2>' +
        '<form id="form-poliza">' +
        // Identificación
        '<div style="border-left:3px solid #3B82F6;padding-left:12px;margin-bottom:16px;">' +
          '<div style="font-size:13px;font-weight:600;color:#3B82F6;margin-bottom:8px;">Identificaci\u00f3n</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div><label style="font-size:12px;">Sociedad</label><select id="sp-sociedad" class="form-select" style="font-size:13px;width:100%;"><option value="hincado_directo"' + (p.sociedad === "hincado_directo" ? " selected" : "") + '>Hincado Directo</option><option value="global_nutria"' + (p.sociedad === "global_nutria" ? " selected" : "") + '>Global Nutria</option></select></div>' +
            '<div><label style="font-size:12px;">Tipo</label><select id="sp-tipo" class="form-select" style="font-size:13px;width:100%;"><option value="maquinaria"' + (p.tipo === "maquinaria" ? " selected" : "") + '>Maquinaria</option><option value="vehiculo"' + (p.tipo === "vehiculo" ? " selected" : "") + '>Veh\u00edculo</option><option value="responsabilidad_civil"' + (p.tipo === "responsabilidad_civil" ? " selected" : "") + '>Responsabilidad Civil</option><option value="accidentes_convenio"' + (p.tipo === "accidentes_convenio" ? " selected" : "") + '>Accidentes convenio</option><option value="dyo"' + (p.tipo === "dyo" ? " selected" : "") + '>D&O</option><option value="otro"' + (p.tipo === "otro" ? " selected" : "") + '>Otro</option></select></div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
            '<div><label style="font-size:12px;">N\u00BA P\u00f3liza</label><input id="sp-numero" class="form-input" style="font-size:13px;" value="' + (p.numero_poliza || "") + '"></div>' +
            '<div><label style="font-size:12px;">Aseguradora</label><input id="sp-aseguradora" class="form-input" style="font-size:13px;" value="' + (p.aseguradora || "") + '"></div>' +
          '</div>' +
          '<div style="margin-top:8px;"><label style="font-size:12px;">Descripci\u00f3n</label><input id="sp-descripcion" class="form-input" style="font-size:13px;" value="' + (p.descripcion || "") + '"></div>' +
          '<div style="margin-top:8px;"><label style="font-size:12px;">Recurso asegurado</label><input id="sp-recurso" class="form-input" style="font-size:13px;" placeholder="Ej: Nicoletta, Pickup 1..." value="' + (p.recurso_nombre || "") + '"></div>' +
        '</div>' +
        // Económico
        '<div style="border-left:3px solid #D97706;padding-left:12px;margin-bottom:16px;">' +
          '<div style="font-size:13px;font-weight:600;color:#D97706;margin-bottom:8px;">Econ\u00f3mico</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
            '<div><label style="font-size:12px;">Prima anual</label><input id="sp-prima-anual" type="number" step="0.01" class="form-input" style="font-size:13px;" value="' + (p.prima_anual || "") + '"></div>' +
            '<div><label style="font-size:12px;">Prima mensual</label><input id="sp-prima-mensual" type="number" step="0.01" class="form-input" style="font-size:13px;" value="' + (p.prima_mensual || "") + '"></div>' +
            '<div><label style="font-size:12px;">Franquicia</label><input id="sp-franquicia" type="number" step="0.01" class="form-input" style="font-size:13px;" value="' + (p.franquicia || "") + '"></div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
            '<div><label style="font-size:12px;">Forma de pago</label><select id="sp-forma-pago" class="form-select" style="font-size:13px;width:100%;"><option value="anual"' + (p.forma_pago === "anual" ? " selected" : "") + '>Anual</option><option value="semestral"' + (p.forma_pago === "semestral" ? " selected" : "") + '>Semestral</option><option value="trimestral"' + (p.forma_pago === "trimestral" ? " selected" : "") + '>Trimestral</option><option value="mensual"' + (p.forma_pago === "mensual" ? " selected" : "") + '>Mensual</option></select></div>' +
            '<div><label style="font-size:12px;">Cobertura</label><input id="sp-cobertura" class="form-input" style="font-size:13px;" value="' + (p.cobertura || "") + '"></div>' +
          '</div>' +
        '</div>' +
        // Vigencia
        '<div style="border-left:3px solid #94A3B8;padding-left:12px;margin-bottom:16px;">' +
          '<div style="font-size:13px;font-weight:600;color:#94A3B8;margin-bottom:8px;">Vigencia</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div><label style="font-size:12px;">Fecha inicio</label><input id="sp-inicio" type="date" class="form-input" style="font-size:13px;" value="' + (p.fecha_inicio || "") + '"></div>' +
            '<div><label style="font-size:12px;">Fecha vencimiento</label><input id="sp-vencimiento" type="date" class="form-input" style="font-size:13px;" value="' + (p.fecha_vencimiento || "") + '"></div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
            '<div><label style="font-size:12px;">Estado</label><select id="sp-estado" class="form-select" style="font-size:13px;width:100%;"><option value="vigente"' + (p.estado === "vigente" || !p.estado ? " selected" : "") + '>Vigente</option><option value="vencida"' + (p.estado === "vencida" ? " selected" : "") + '>Vencida</option><option value="en_renovacion"' + (p.estado === "en_renovacion" ? " selected" : "") + '>En renovaci\u00f3n</option><option value="cancelada"' + (p.estado === "cancelada" ? " selected" : "") + '>Cancelada</option></select></div>' +
            '<div style="display:flex;align-items:center;gap:8px;padding-top:20px;"><input type="checkbox" id="sp-renovacion"' + (p.renovacion_automatica !== 0 ? " checked" : "") + '><label for="sp-renovacion" style="font-size:12px;">Renovaci\u00f3n autom\u00e1tica</label></div>' +
          '</div>' +
          '<div style="margin-top:8px;"><label style="font-size:12px;">Notas</label><textarea id="sp-notas" class="form-input" style="font-size:13px;min-height:50px;">' + (p.notas || "") + '</textarea></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
          '<button type="button" class="secondary" onclick="document.getElementById(\'modal-poliza\').remove()">Cancelar</button>' +
          '<button type="submit" class="primary">Guardar</button>' +
        '</div></form></div>';
    document.body.appendChild(modal);
    document.getElementById("form-poliza").addEventListener("submit", function (e) {
      e.preventDefault();
      _guardarPoliza();
    });
  }

  if (id) {
    fetch("/api/seguros/polizas/" + id, { cache: "no-store" }).then(function (r) { return r.json(); }).then(_build);
  } else {
    _build({});
  }
}

function _guardarPoliza() {
  var data = {
    sociedad: document.getElementById("sp-sociedad").value,
    tipo: document.getElementById("sp-tipo").value,
    numero_poliza: document.getElementById("sp-numero").value,
    aseguradora: document.getElementById("sp-aseguradora").value,
    descripcion: document.getElementById("sp-descripcion").value,
    recurso_nombre: document.getElementById("sp-recurso").value,
    prima_anual: parseFloat(document.getElementById("sp-prima-anual").value) || 0,
    prima_mensual: parseFloat(document.getElementById("sp-prima-mensual").value) || 0,
    franquicia: parseFloat(document.getElementById("sp-franquicia").value) || 0,
    forma_pago: document.getElementById("sp-forma-pago").value,
    cobertura: document.getElementById("sp-cobertura").value,
    fecha_inicio: document.getElementById("sp-inicio").value,
    fecha_vencimiento: document.getElementById("sp-vencimiento").value,
    estado: document.getElementById("sp-estado").value,
    renovacion_automatica: document.getElementById("sp-renovacion").checked,
    notas: document.getElementById("sp-notas").value,
  };
  var url = _segEditId ? "/api/seguros/polizas/" + _segEditId : "/api/seguros/polizas";
  var method = _segEditId ? "PUT" : "POST";
  fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function () {
      var m = document.getElementById("modal-poliza"); if (m) m.remove();
      if (typeof mostrarToast === "function") mostrarToast("P\u00f3liza guardada.", "success");
      _cargarKPIs();
      _buscarPolizas();
    })
    .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error al guardar.", "error"); });
}

function _eliminarPoliza(id) {
  if (!confirm("\u00bfEliminar esta p\u00f3liza y todos sus siniestros/documentos?")) return;
  fetch("/api/seguros/polizas/" + id, { method: "DELETE" })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function () {
      if (typeof mostrarToast === "function") mostrarToast("P\u00f3liza eliminada.", "success");
      _cargarKPIs();
      _buscarPolizas();
    });
}

// ── Ver detalle póliza ───────────────────────────────────────────────────

function _verPoliza(id) {
  fetch("/api/seguros/polizas/" + id, { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (p) {
      if (p.error) { if (typeof mostrarToast === "function") mostrarToast(p.error, "error"); return; }
      var existing = document.getElementById("modal-poliza-ver");
      if (existing) existing.remove();
      var modal = document.createElement("div");
      modal.className = "modal-overlay visible";
      modal.id = "modal-poliza-ver";
      modal.style.zIndex = "110";
      modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });

      var fmt = function (v) { return v != null ? Number(v).toLocaleString("es-ES", { minimumFractionDigits: 2 }) + " \u20AC" : "\u2014"; };

      // Siniestros section
      var sinHtml = "";
      if (p.siniestros && p.siniestros.length) {
        sinHtml = '<table class="tabla-generica" style="font-size:12px;width:100%;"><thead><tr><th>Fecha</th><th>Expediente</th><th>Descripción</th><th class="numero">Reclamado</th><th>Estado</th></tr></thead><tbody>';
        p.siniestros.forEach(function (s) {
          var eBadge = s.estado === "resuelto" ? "background:#DCFCE7;color:#166534;" : s.estado === "rechazado" ? "background:#FEE2E2;color:#991B1B;" : "background:#FEF3C7;color:#92400E;";
          sinHtml += '<tr><td>' + (s.fecha_siniestro || "") + '</td><td>' + (s.numero_expediente || "\u2014") + '</td><td>' + (s.descripcion || "").substring(0, 40) + '</td><td class="numero">' + fmt(s.importe_reclamado) + '</td><td><span style="padding:2px 6px;border-radius:8px;font-size:10px;' + eBadge + '">' + s.estado + '</span></td></tr>';
        });
        sinHtml += '</tbody></table>';
      } else {
        sinHtml = '<p style="font-size:12px;color:var(--color-text-secondary);font-style:italic;">Sin siniestros registrados.</p>';
      }

      // Docs section
      var _docTipoPill = function (t) {
        var m = { poliza: "#DBEAFE;color:#1E40AF", recibo: "#DCFCE7;color:#166534", certificado: "#EDE9FE;color:#5B21B6", siniestro: "#FEE2E2;color:#991B1B", otro: "#F3F4F6;color:#4B5563" };
        var labels = { poliza: "P\u00f3liza", recibo: "Pago", certificado: "Certificado", siniestro: "Siniestro", otro: "Otro" };
        var s = m[t] || m.otro;
        return '<span style="padding:1px 6px;border-radius:8px;font-size:10px;font-weight:500;background:' + s + ';">' + (labels[t] || t) + '</span>';
      };
      var trashSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
      var docsHtml = "";
      if (p.documentos && p.documentos.length) {
        docsHtml = p.documentos.map(function (d) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid #F3F4F6;">' +
            '<a href="/api/archivo?ruta=' + encodeURIComponent(d.ruta_archivo || "") + '" target="_blank" style="flex:1;">' + (d.nombre_archivo || "doc") + '</a>' +
            _docTipoPill(d.tipo) +
            '<span style="color:var(--color-text-secondary);font-size:11px;">' + (d.fecha_subida || "") + '</span>' +
            '<button onclick="segurosEliminarDoc(' + d.id + ',' + p.id + ')" title="Eliminar" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--color-text-secondary);" onmouseover="this.style.color=\'#DC2626\'" onmouseout="this.style.color=\'var(--color-text-secondary)\'">' + trashSvg + '</button></div>';
        }).join("");
      } else {
        docsHtml = '<p style="font-size:12px;color:var(--color-text-secondary);font-style:italic;">Sin documentos.</p>';
      }

      modal.innerHTML =
        '<div class="modal-editar modal-lg" role="dialog" style="max-height:90vh;overflow-y:auto;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
            '<h2 style="margin:0;">P\u00f3liza ' + (p.numero_poliza || "#" + p.id) + '</h2>' +
            '<span style="font-size:13px;color:var(--color-text-secondary);">' + (p.aseguradora || "") + '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">' +
            '<div><div style="font-size:11px;color:var(--color-text-secondary);">Tipo</div><div style="font-weight:600;">' + (p.tipo || "").replace("_", " ") + '</div></div>' +
            '<div><div style="font-size:11px;color:var(--color-text-secondary);">Prima anual</div><div style="font-weight:600;">' + fmt(p.prima_anual) + '</div></div>' +
            '<div><div style="font-size:11px;color:var(--color-text-secondary);">Vencimiento</div><div style="font-weight:600;">' + (p.fecha_vencimiento || "\u2014") + '</div></div>' +
          '</div>' +
          '<div style="border-left:3px solid #DC2626;padding-left:12px;margin-bottom:16px;">' +
            '<div style="font-size:13px;font-weight:600;color:#DC2626;margin-bottom:8px;">Siniestros</div>' + sinHtml +
            '<button style="margin-top:8px;padding:4px 12px;font-size:12px;color:var(--color-primary);background:transparent;border:1px solid var(--color-primary);border-radius:6px;cursor:pointer;" onclick="_nuevoSiniestro(' + p.id + ')">+ Nuevo siniestro</button>' +
          '</div>' +
          '<div style="border-left:3px solid #7C3AED;padding-left:12px;margin-bottom:16px;">' +
            '<div style="font-size:13px;font-weight:600;color:#7C3AED;margin-bottom:8px;">Documentos</div>' + docsHtml +
            '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
              '<input type="file" id="seg-doc-file" style="font-size:12px;">' +
              '<select id="seg-doc-tipo" class="form-select" style="font-size:12px;padding:4px 8px;"><option value="poliza">P\u00f3liza</option><option value="recibo">Justificante de pago</option><option value="certificado">Certificado</option><option value="siniestro">Parte de siniestro</option><option value="otro">Otro</option></select>' +
              '<button style="padding:4px 12px;font-size:12px;color:var(--color-primary);background:transparent;border:1px solid var(--color-primary);border-radius:6px;cursor:pointer;" onclick="_subirDocSeguro(' + p.id + ')">Subir</button>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
            '<button class="secondary" onclick="document.getElementById(\'modal-poliza-ver\').remove()">Cerrar</button>' +
            '<button class="primary" onclick="document.getElementById(\'modal-poliza-ver\').remove();_abrirModalPoliza(' + p.id + ')">Editar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    });
}

window._abrirModalPoliza = _abrirModalPoliza;

window._nuevoSiniestro = function (polizaId) {
  var desc = prompt("Descripci\u00f3n del siniestro:");
  if (!desc) return;
  var fecha = prompt("Fecha del siniestro (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
  if (!fecha) return;
  fetch("/api/seguros/siniestros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poliza_id: polizaId, fecha_siniestro: fecha, descripcion: desc }),
  }).then(function (r) { return r.json(); }).then(function () {
    if (typeof mostrarToast === "function") mostrarToast("Siniestro registrado.", "success");
    var m = document.getElementById("modal-poliza-ver"); if (m) m.remove();
    _verPoliza(polizaId);
  });
};

window._subirDocSeguro = function (polizaId) {
  var fileInput = document.getElementById("seg-doc-file");
  if (!fileInput || !fileInput.files.length) return;
  var tipoSel = document.getElementById("seg-doc-tipo");
  var tipo = tipoSel ? tipoSel.value : "poliza";
  var fd = new FormData();
  fd.append("archivo", fileInput.files[0]);
  fd.append("tipo", tipo);
  fetch("/api/seguros/polizas/" + polizaId + "/documentos", { method: "POST", body: fd })
    .then(function (r) { return r.json(); })
    .then(function () {
      if (typeof mostrarToast === "function") mostrarToast("Documento subido.", "success");
      var m = document.getElementById("modal-poliza-ver"); if (m) m.remove();
      _verPoliza(polizaId);
    });
};

window.segurosEliminarDoc = function (docId, polizaId) {
  if (!confirm("\u00bfEliminar este documento?")) return;
  fetch("/api/seguros/documentos/" + docId, { method: "DELETE" })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function () {
      if (typeof mostrarToast === "function") mostrarToast("Documento eliminado.", "success");
      var m = document.getElementById("modal-poliza-ver"); if (m) m.remove();
      _verPoliza(polizaId);
    })
    .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error al eliminar.", "error"); });
};
