// ═══ ALBARANES — Registro y vinculación ═════════════════════════════════════

var _albInit = false;
var _albLista = [];
var _albEditId = null;

function cargarAlbaranes() {
  _initAlbaranes();
  _buscarAlbaranes();
}

function _initAlbaranes() {
  if (_albInit) return;
  _albInit = true;

  document.getElementById("alb-btn-buscar").addEventListener("click", _buscarAlbaranes);
  document.getElementById("btn-nuevo-albaran").addEventListener("click", function () { _abrirModalAlbaran(null); });
  document.getElementById("btn-procesar-albaran").addEventListener("click", function () {
    document.getElementById("modal-albaran-foto-overlay").classList.add("visible");
  });
  document.getElementById("btn-cancelar-albaran").addEventListener("click", _cerrarModalAlbaran);
  document.getElementById("form-albaran").addEventListener("submit", _guardarAlbaran);

  // Auto-calc total
  var impEl = document.getElementById("alb-importe");
  var ivaEl = document.getElementById("alb-iva");
  if (impEl && ivaEl) {
    var autoCalc = function () {
      var base = parseFloat(impEl.value) || 0;
      var iva = parseFloat(ivaEl.value) || 0;
      document.getElementById("alb-total").value = (base + iva).toFixed(2);
    };
    impEl.addEventListener("input", autoCalc);
    ivaEl.addEventListener("input", autoCalc);
  }

  // Foto dropzone
  var dz = document.getElementById("alb-foto-dropzone");
  var fi = document.getElementById("alb-foto-input");
  if (dz && fi) {
    dz.addEventListener("click", function () { fi.click(); });
    dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("dragover"); });
    dz.addEventListener("dragleave", function () { dz.classList.remove("dragover"); });
    dz.addEventListener("drop", function (e) { e.preventDefault(); dz.classList.remove("dragover"); if (e.dataTransfer.files.length) _procesarFotoAlbaran(e.dataTransfer.files[0]); });
    fi.addEventListener("change", function () { if (fi.files.length) _procesarFotoAlbaran(fi.files[0]); });
  }

  // Table actions delegation
  document.getElementById("tbody-albaranes").addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("button");
    if (!btn) return;
    var id = parseInt(btn.dataset.id);
    if (btn.classList.contains("alb-btn-editar")) _abrirModalAlbaran(id);
    else if (btn.classList.contains("alb-btn-eliminar")) _eliminarAlbaran(id);
  });

  // Load proyectos for selector
  fetch("/api/proyectos").then(function (r) { return r.json(); }).then(function (data) {
    var sel = document.getElementById("alb-proyecto");
    (data.proyectos || []).forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.nombre;
      sel.appendChild(opt);
    });
  }).catch(function () {});
}

function _buscarAlbaranes() {
  var proveedor = document.getElementById("alb-filtro-proveedor").value.trim();
  var estado = document.getElementById("alb-filtro-estado").value;
  var desde = document.getElementById("alb-filtro-desde").value;
  var hasta = document.getElementById("alb-filtro-hasta").value;
  var url = "/api/albaranes?";
  if (proveedor) url += "proveedor=" + encodeURIComponent(proveedor) + "&";
  if (estado) url += "estado=" + estado + "&";
  if (desde) url += "fecha_desde=" + desde + "&";
  if (hasta) url += "fecha_hasta=" + hasta + "&";
  url += "_t=" + Date.now();

  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      _albLista = data.albaranes || [];
      _renderTablaAlbaranes();
    })
    .catch(function () {
      document.getElementById("alb-sin-datos").textContent = "Error al cargar albaranes.";
      document.getElementById("alb-sin-datos").style.display = "block";
    });
}

function _renderTablaAlbaranes() {
  var tbody = document.getElementById("tbody-albaranes");
  var sinDatos = document.getElementById("alb-sin-datos");
  tbody.innerHTML = "";
  if (!_albLista.length) { sinDatos.style.display = "block"; return; }
  sinDatos.style.display = "none";

  var metodoPago = { tarjeta: "Tarjeta", transferencia: "Transfer.", efectivo: "Efectivo", pendiente: "Pendiente" };

  _albLista.forEach(function (a) {
    var tr = document.createElement("tr");
    var metodo = metodoPago[a.metodo_pago] || a.metodo_pago || "\u2014";
    if (a.metodo_pago === "tarjeta" && a.tarjeta_persona) metodo += " (" + a.tarjeta_persona + ")";
    var proy = a.proyecto_nombre || "\u2014";
    var total = a.total != null ? Number(a.total).toLocaleString("es-ES", { minimumFractionDigits: 2 }) + " \u20AC" : "\u2014";
    // Estado: conciliado > facturado > pendiente > anulado
    var estadoLabel, estadoClass;
    if (a.estado === "anulado") { estadoLabel = "Anulado"; estadoClass = "badge-muted"; }
    else if (a.conciliado) { estadoLabel = "Conciliado"; estadoClass = "badge-success"; }
    else if (a.estado === "facturado") { estadoLabel = "Facturado"; estadoClass = "badge-info"; }
    else if (a.metodo_pago && a.metodo_pago !== "pendiente") { estadoLabel = "Pagado"; estadoClass = "badge-warning"; }
    else { estadoLabel = "Pendiente"; estadoClass = "badge-warning"; }

    tr.innerHTML =
      '<td class="col-fecha">' + (a.fecha || "\u2014") + '</td>' +
      '<td>' + (a.numero_albaran || "\u2014") + '</td>' +
      '<td>' + (a.proveedor || "\u2014") + '</td>' +
      '<td class="numero">' + total + '</td>' +
      '<td>' + metodo + '</td>' +
      '<td>' + proy + '</td>' +
      '<td><span class="badge ' + estadoClass + '">' + estadoLabel + '</span></td>' +
      '<td class="col-acciones">' +
        '<button class="btn-small alb-btn-editar" data-id="' + a.id + '" title="Editar">Editar</button> ' +
        '<button class="btn-small danger alb-btn-eliminar" data-id="' + a.id + '" title="Eliminar">Eliminar</button>' +
      '</td>';
    tbody.appendChild(tr);
  });
}

function _abrirModalAlbaran(id) {
  _albEditId = id;
  var modal = document.getElementById("modal-albaran-overlay");
  document.getElementById("modal-albaran-titulo").textContent = id ? "Editar albarán" : "Nuevo albarán";

  if (id) {
    fetch("/api/albaranes/" + id)
      .then(function (r) { return r.json(); })
      .then(function (a) {
        document.getElementById("alb-numero").value = a.numero_albaran || "";
        document.getElementById("alb-fecha").value = a.fecha || "";
        document.getElementById("alb-proveedor").value = a.proveedor || "";
        document.getElementById("alb-importe").value = a.importe || "";
        document.getElementById("alb-iva").value = a.iva || "";
        document.getElementById("alb-total").value = a.total || "";
        document.getElementById("alb-metodo-pago").value = a.metodo_pago || "pendiente";
        document.getElementById("alb-tarjeta-persona").value = a.tarjeta_persona || "";
        document.getElementById("alb-proyecto").value = a.proyecto_id || "";
        document.getElementById("alb-notas").value = a.notas || "";
        modal.classList.add("visible");
      });
  } else {
    document.getElementById("form-albaran").reset();
    document.getElementById("alb-fecha").value = new Date().toISOString().slice(0, 10);
    modal.classList.add("visible");
  }
}

function _cerrarModalAlbaran() {
  document.getElementById("modal-albaran-overlay").classList.remove("visible");
  _albEditId = null;
}

function _guardarAlbaran(e) {
  e.preventDefault();
  var data = {
    numero_albaran: document.getElementById("alb-numero").value,
    fecha: document.getElementById("alb-fecha").value,
    proveedor: document.getElementById("alb-proveedor").value,
    importe: parseFloat(document.getElementById("alb-importe").value) || 0,
    iva: parseFloat(document.getElementById("alb-iva").value) || 0,
    total: parseFloat(document.getElementById("alb-total").value) || 0,
    metodo_pago: document.getElementById("alb-metodo-pago").value,
    tarjeta_persona: document.getElementById("alb-tarjeta-persona").value,
    proyecto_id: document.getElementById("alb-proyecto").value || null,
    notas: document.getElementById("alb-notas").value,
  };

  var url = _albEditId ? "/api/albaranes/" + _albEditId : "/api/albaranes";
  var method = _albEditId ? "PUT" : "POST";

  fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then(function (r) { if (!r.ok) throw new Error("Error"); return r.json(); })
    .then(function () {
      _cerrarModalAlbaran();
      _buscarAlbaranes();
      if (typeof mostrarToast === "function") mostrarToast("Albarán guardado.", "success");
    })
    .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error al guardar.", "error"); });
}

function _eliminarAlbaran(id) {
  if (!confirm("¿Eliminar este albarán?")) return;
  fetch("/api/albaranes/" + id, { method: "DELETE" })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function () {
      _buscarAlbaranes();
      if (typeof mostrarToast === "function") mostrarToast("Albarán eliminado.", "success");
    })
    .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error al eliminar.", "error"); });
}

// ── Foto OCR ────────────────────────────────────────────────────────────────

function _procesarFotoAlbaran(file) {
  var resultado = document.getElementById("alb-foto-resultado");
  resultado.style.display = "block";
  resultado.innerHTML = '<p style="color:var(--color-text-secondary);">Procesando imagen...</p>';

  var fd = new FormData();
  fd.append("imagen", file);

  fetch("/api/albaranes/procesar-imagen", { method: "POST", body: fd })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) { resultado.innerHTML = '<p style="color:var(--color-danger);">' + data.error + '</p>'; return; }
      // Show extracted data and offer to save
      var html = '<div style="background:#F0FDF4;border:1px solid #16A34A;border-radius:8px;padding:12px;margin-bottom:12px;">';
      html += '<strong>Datos extraídos:</strong><br>';
      html += 'Nº: ' + (data.numero_albaran || "?") + ' · Fecha: ' + (data.fecha || "?") + '<br>';
      html += 'Proveedor: ' + (data.proveedor || "?") + ' · Total: ' + (data.total || "?") + ' €';
      html += '</div>';
      html += '<button type="button" id="alb-foto-guardar" class="primary" style="width:100%;">Guardar albarán</button>';
      resultado.innerHTML = html;

      document.getElementById("alb-foto-guardar").addEventListener("click", function () {
        // Close foto modal and open edit modal with data
        document.getElementById("modal-albaran-foto-overlay").classList.remove("visible");
        _albEditId = null;
        document.getElementById("alb-numero").value = data.numero_albaran || "";
        document.getElementById("alb-fecha").value = data.fecha || "";
        document.getElementById("alb-proveedor").value = data.proveedor || "";
        document.getElementById("alb-importe").value = data.base_imponible || "";
        document.getElementById("alb-iva").value = data.iva || "";
        document.getElementById("alb-total").value = data.total || "";
        document.getElementById("modal-albaran-overlay").classList.add("visible");
      });
    })
    .catch(function () { resultado.innerHTML = '<p style="color:var(--color-danger);">Error procesando imagen.</p>'; });
}

// ── Vinculación albaranes ↔ factura proveedor ────────────────────────────────

window._cargarAlbaranesFactura = function (proveedor, facturaId) {
  var banner = document.getElementById("ed-albaranes-banner");
  var lista = document.getElementById("ed-albaranes-lista");
  var btnVincular = document.getElementById("btn-vincular-albaranes");
  if (!lista) return;
  lista.innerHTML = "";
  if (banner) banner.style.display = "none";

  // Show already linked
  fetch("/api/albaranes?factura_id=" + facturaId + "&_t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var vinculados = data.albaranes || [];
      if (vinculados.length) {
        var html = '<table class="tabla-generica" style="font-size:12px;"><thead><tr><th>Nº</th><th>Fecha</th><th class="numero">Total</th><th>Pago</th></tr></thead><tbody>';
        vinculados.forEach(function (a) {
          html += '<tr><td>' + (a.numero_albaran || "—") + '</td><td>' + (a.fecha || "") + '</td>';
          html += '<td class="numero">' + (a.total || 0).toLocaleString("es-ES", { minimumFractionDigits: 2 }) + ' €</td>';
          html += '<td>' + (a.metodo_pago || "—") + (a.tarjeta_persona ? " (" + a.tarjeta_persona + ")" : "") + '</td></tr>';
        });
        html += '</tbody></table>';
        lista.innerHTML = html;
      }
    }).catch(function () {});

  // Check pending albaranes for this proveedor
  if (proveedor) {
    fetch("/api/albaranes/sin-factura?proveedor=" + encodeURIComponent(proveedor) + "&_t=" + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var pendientes = data.albaranes || [];
        if (pendientes.length && banner) {
          banner.textContent = "Hay " + pendientes.length + " albarán(es) pendiente(s) de este proveedor.";
          banner.style.display = "block";
        }
        // Store for vincular modal
        window._albPendientesFactura = pendientes;
        window._albFacturaIdActual = facturaId;
      }).catch(function () {});
  }

  // Vincular button
  if (btnVincular) {
    btnVincular.onclick = function () { _abrirModalVincularAlbaranes(); };
  }
};

function _abrirModalVincularAlbaranes() {
  var pendientes = window._albPendientesFactura || [];
  var facturaId = window._albFacturaIdActual;
  if (!pendientes.length) { if (typeof mostrarToast === "function") mostrarToast("No hay albaranes pendientes de este proveedor.", "info"); return; }

  var overlay = document.getElementById("modal-vincular-alb-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "modal-vincular-alb-overlay";
    overlay.className = "modal-overlay";
    overlay.innerHTML = '<div class="modal-editar" role="dialog" id="modal-vincular-alb-body"></div>';
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.classList.remove("visible"); });
    document.body.appendChild(overlay);
  }

  var html = '<h3 style="margin:0 0 12px;">Vincular albaranes a factura</h3>';
  html += '<table class="tabla-generica" style="font-size:12px;width:100%;"><thead><tr><th style="width:30px;"></th><th>Nº</th><th>Fecha</th><th class="numero">Total</th><th>Pago</th></tr></thead><tbody>';
  pendientes.forEach(function (a) {
    html += '<tr><td><input type="checkbox" class="alb-vinc-check" data-id="' + a.id + '" checked></td>';
    html += '<td>' + (a.numero_albaran || "—") + '</td><td>' + (a.fecha || "") + '</td>';
    html += '<td class="numero">' + (a.total || 0).toLocaleString("es-ES", { minimumFractionDigits: 2 }) + ' €</td>';
    html += '<td>' + (a.metodo_pago || "—") + '</td></tr>';
  });
  html += '</tbody></table>';
  html += '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">';
  html += '<button class="secondary" onclick="document.getElementById(\'modal-vincular-alb-overlay\').classList.remove(\'visible\')">Cancelar</button>';
  html += '<button class="primary" id="btn-confirmar-vincular-alb">Vincular seleccionados</button>';
  html += '</div>';

  document.getElementById("modal-vincular-alb-body").innerHTML = html;
  overlay.classList.add("visible");

  document.getElementById("btn-confirmar-vincular-alb").addEventListener("click", function () {
    var ids = [];
    overlay.querySelectorAll(".alb-vinc-check:checked").forEach(function (cb) { ids.push(parseInt(cb.dataset.id)); });
    if (!ids.length) return;

    fetch("/api/albaranes/vincular-factura", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factura_id: facturaId, albaran_ids: ids }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        overlay.classList.remove("visible");
        if (data.error) { if (typeof mostrarToast === "function") mostrarToast(data.error, "error"); return; }
        if (typeof mostrarToast === "function") mostrarToast(data.mensaje || "Albaranes vinculados.", "success");
        // Refresh the albaranes section in the factura modal
        var prov = document.getElementById("ed-proveedor") ? document.getElementById("ed-proveedor").value : "";
        if (window._albFacturaIdActual) window._cargarAlbaranesFactura(prov, window._albFacturaIdActual);
      })
      .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error al vincular.", "error"); });
  });
}
