// ═══ EEFF — Estados Financieros (Motor v2) ════════════════════════════════

// Card click dispatcher — must be available immediately at parse time
window._eeffCard = function (tipo) {
  console.log("[EEFF] Card clicked:", tipo);
  if (tipo === "plan") window.eeffModalPlanCuentas();
  else if (tipo === "warning") window.eeffModalSinClasificar();
  else if (tipo === "periodos") window.eeffModalPeriodos();
  else if (tipo === "formulas") window.eeffModalFormulas();
};

var _eeffInit = false;
var _eeffPeriodos = [];
var _eeffInforme = null;
var _eeffPlanCuentas = [];

function cargarEEFF() {
  _initEEFF();
  _cargarPeriodosEEFF();
}

function _initEEFF() {
  if (_eeffInit) return;
  _eeffInit = true;

  // Tabs
  document.querySelectorAll(".eeff-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".eeff-tab").forEach(function (t) { t.classList.remove("active"); });
      document.querySelectorAll(".eeff-tab-content").forEach(function (c) { c.classList.remove("active"); });
      tab.classList.add("active");
      document.getElementById("eeff-tab-" + tab.dataset.tab).classList.add("active");
      if (tab.dataset.tab === "config") _cargarConfigResumen();
    });
  });

  // Selectors — cascading: sociedad → años → meses → informe
  document.getElementById("eeff-sociedad").addEventListener("change", function () { _actualizarAniosEEFF(); _actualizarMesesEEFF(); _cargarInformeEEFF(); });
  document.getElementById("eeff-anio").addEventListener("change", function () { _actualizarMesesEEFF(); _cargarInformeEEFF(); });
  document.getElementById("eeff-mes").addEventListener("change", function () { _cargarInformeEEFF(); });

  // Subir modal
  document.getElementById("btn-eeff-subir").addEventListener("click", function () { eeffImportarModal(); });

  // Sin clasificar guardar
  document.getElementById("btn-eeff-sc-guardar").addEventListener("click", _guardarMapeoSC);

  // Dropzone
  var dz = document.getElementById("eeff-dropzone");
  var fi = document.getElementById("eeff-file-input");
  dz.addEventListener("click", function () { fi.click(); });
  dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", function () { dz.classList.remove("dragover"); });
  dz.addEventListener("drop", function (e) { e.preventDefault(); dz.classList.remove("dragover"); if (e.dataTransfer.files.length) _subirFicherosEEFF(e.dataTransfer.files); });
  fi.addEventListener("change", function () { if (fi.files.length) _subirFicherosEEFF(fi.files); fi.value = ""; });

  // Plan filters
  document.getElementById("eeff-plan-filtro-n1").addEventListener("change", _filtrarPlanCuentas);
  document.getElementById("eeff-plan-filtro-n2").addEventListener("change", _filtrarPlanCuentas);
  document.getElementById("eeff-plan-buscar").addEventListener("input", _filtrarPlanCuentas);
}

// ── Import ──────────────────────────────────────────────────────────────────

window.eeffImportarModal = function () {
  document.getElementById("modal-eeff-subir").classList.add("visible");
  document.getElementById("eeff-import-status").style.display = "none";
};

function _subirFicherosEEFF(files) {
  var status = document.getElementById("eeff-import-status");
  var msg = document.getElementById("eeff-import-msg");
  status.style.display = "";
  msg.style.color = "";
  var fileList = Array.from(files);
  var total = fileList.length;
  var done = 0;
  var resultados = [];
  msg.textContent = "Importando " + total + " fichero" + (total > 1 ? "s" : "") + "...";

  function _procesarSiguiente() {
    if (done >= total) {
      // All done — show summary
      var txt = "Ficheros procesados: " + done + " de " + total;
      resultados.forEach(function (r) { txt += "\n" + r; });
      msg.textContent = txt;
      msg.style.color = "#16A34A";
      _cargarPeriodosEEFF();
      return;
    }
    var file = fileList[done];
    msg.textContent = "Importando " + (done + 1) + " de " + total + ": " + file.name + "...";
    var fd = new FormData();
    fd.append("file", file);
    fetch("/api/eeff/importar", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          resultados.push("\u2716 " + file.name + " \u2014 Error: " + data.error);
        } else {
          var detalles = (data.detalle || []).map(function (d) { return d.periodo; }).join(", ");
          resultados.push("\u2714 " + file.name + " \u2014 " + (data.importados || 0) + " periodos (" + detalles + ")");
        }
      })
      .catch(function (e) {
        resultados.push("\u2716 " + file.name + " \u2014 " + e);
      })
      .finally(function () {
        done++;
        _procesarSiguiente();
      });
  }
  _procesarSiguiente();
}

// ── Selectors ───────────────────────────────────────────────────────────────

function _cargarPeriodosEEFF() {
  fetch("/api/eeff/periodos?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      _eeffPeriodos = data || [];
      _actualizarSociedadesEEFF();
    });
}

function _actualizarSociedadesEEFF() {
  var sel = document.getElementById("eeff-sociedad");
  var cur = sel.value;
  var socs = [];
  _eeffPeriodos.forEach(function (p) { if (socs.indexOf(p.sociedad) === -1) socs.push(p.sociedad); });
  sel.innerHTML = '<option value="">Sociedad</option>';
  socs.forEach(function (s) { sel.innerHTML += '<option value="' + _escH(s) + '">' + _escH(s) + '</option>'; });
  if (socs.length === 1) sel.value = socs[0];
  else if (cur) sel.value = cur;
  _actualizarAniosEEFF();
  _actualizarMesesEEFF();
  _cargarInformeEEFF();
}

function _actualizarAniosEEFF() {
  var soc = document.getElementById("eeff-sociedad").value;
  var sel = document.getElementById("eeff-anio");
  var cur = sel.value;
  var anios = [];
  _eeffPeriodos.forEach(function (p) {
    if (soc && p.sociedad !== soc) return;
    if (anios.indexOf(p["año"]) === -1) anios.push(p["año"]);
  });
  anios.sort(function (a, b) { return b - a; });
  sel.innerHTML = "";
  anios.forEach(function (a) { sel.innerHTML += '<option value="' + a + '">' + a + '</option>'; });
  if (anios.length > 0 && !cur) sel.value = anios[0];
  else if (cur) sel.value = cur;
}

function _actualizarMesesEEFF() {
  var soc = document.getElementById("eeff-sociedad").value;
  var anio = document.getElementById("eeff-anio").value;
  var sel = document.getElementById("eeff-mes");
  var cur = sel.value;

  // Find which months have SS data for this sociedad+año
  var mesesConDatos = {};
  _eeffPeriodos.forEach(function (p) {
    if (p.tipo !== "sumas_saldos") return;
    if (soc && p.sociedad !== soc) return;
    if (anio && p["año"] !== parseInt(anio)) return;
    // Extract month from fecha_hasta
    var m = (p.fecha_hasta || "").substring(5, 7);
    if (m) mesesConDatos[m] = true;
  });

  var nombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  sel.innerHTML = '<option value="">Año completo</option>';
  for (var i = 1; i <= 12; i++) {
    var mm = (i < 10 ? "0" : "") + i;
    var tiene = mesesConDatos[mm];
    sel.innerHTML += '<option value="' + mm + '"' + (tiene ? '' : ' disabled style="color:#CBD5E1;"') + '>'
      + nombres[i - 1] + (tiene ? '' : '') + '</option>';
  }
  if (cur && !sel.querySelector('option[value="' + cur + '"]:not(:disabled)')) {
    sel.value = "";
  } else if (cur) {
    sel.value = cur;
  }
}

function _cargarInformeEEFF() {
  var soc = document.getElementById("eeff-sociedad").value;
  var anio = document.getElementById("eeff-anio").value;
  var mes = document.getElementById("eeff-mes").value;
  if (!soc || !anio) {
    _eeffInforme = null;
    _renderBalanceEEFF(); _renderPYGEEFF(); _renderMetricasEEFF();
    return;
  }
  var url = "/api/eeff/informe?sociedad=" + encodeURIComponent(soc) + "&anio=" + anio;
  if (mes) url += "&mes=" + mes;
  url += "&t=" + Date.now();
  fetch(url)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (data.error) { _eeffInforme = null; } else { _eeffInforme = data; }
      _renderBalanceEEFF(); _renderPYGEEFF(); _renderMetricasEEFF();
      if (data.sin_clasificar && data.sin_clasificar.length > 0) _mostrarModalSC(data.sin_clasificar);
    })
    .catch(function () { _eeffInforme = null; _renderBalanceEEFF(); _renderPYGEEFF(); _renderMetricasEEFF(); });
}

// ── Balance ─────────────────────────────────────────────────────────────────

function _renderBalanceEEFF() {
  var body = document.getElementById("eeff-balance-body");
  if (!_eeffInforme) { body.innerHTML = '<p class="sin-datos">Selecciona sociedad y año</p>'; return; }
  var bal = _eeffInforme.balance || {};
  var totals = _eeffInforme.balance_totals || [];
  var html = '<table class="tabla-generica eeff-tabla-jerarquica"><thead><tr><th>Concepto</th><th class="numero" style="width:150px;">Importe</th></tr></thead><tbody>';

  [{ key: "Activo", label: "ACTIVO", total: "Total Activo" },
   { key: "Pasivo y PN", label: "PASIVO Y PATRIMONIO NETO", total: "Total Pasivo y PN" }
  ].forEach(function (sec) {
    html += '<tr class="eeff-row-seccion"><td colspan="2">' + sec.label + '</td></tr>';
    var data = bal[sec.key] || {};
    for (var n2 in data) {
      html += '<tr class="eeff-row-grupo"><td style="padding-left:16px;">' + _escH(n2) + '</td><td class="numero">' + _fmtN(data[n2].total) + '</td></tr>';
      for (var n3 in data[n2].detalle) {
        var v = data[n2].detalle[n3];
        html += '<tr class="eeff-row-detalle"><td style="padding-left:32px;">' + _escH(n3) + '</td><td class="numero' + (v < 0 ? ' eeff-negativo' : '') + '">' + _fmtN(v) + '</td></tr>';
      }
    }
    var tf = totals.find(function (t) { return t.nombre === sec.total; });
    if (tf) html += '<tr class="eeff-row-total"><td style="padding-left:16px;">' + _escH(tf.nombre) + '</td><td class="numero">' + _fmtN(tf.valor) + '</td></tr>';
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}

// ── P&G ─────────────────────────────────────────────────────────────────────

function _renderPYGEEFF() {
  var body = document.getElementById("eeff-pyg-body");
  if (!_eeffInforme) { body.innerHTML = '<p class="sin-datos">Selecciona sociedad y año</p>'; return; }
  var lines = _eeffInforme.pyg || [];
  var ingresos = 1;
  lines.forEach(function (l) { if (l.nombre === "Ingresos") ingresos = Math.abs(l.valor) || 1; });

  var subtotals = ["Margen Bruto", "EBITDA", "EBIT", "Resultado Financiero", "Resultado Antes Impuestos", "Resultado Neto"];
  var html = '<table class="tabla-generica eeff-pyg-cascada"><thead><tr><th>Concepto</th><th class="numero" style="width:150px;">Importe</th><th class="numero" style="width:80px;">% Ing.</th><th style="width:120px;">Margen</th></tr></thead><tbody>';

  lines.forEach(function (l) {
    var pct = l.valor / ingresos * 100;
    var pctStr = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
    var isSub = subtotals.indexOf(l.nombre) >= 0;
    var cls = isSub ? (l.nombre === "Resultado Neto" ? ' class="eeff-pyg-resultado"' : ' class="eeff-pyg-subtotal"') : "";
    var barW = Math.min(Math.abs(pct), 100);
    var neg = l.valor < 0;
    html += '<tr' + cls + '><td>' + _escH(l.nombre) + '</td>' +
      '<td class="numero' + (neg ? ' eeff-negativo' : '') + '">' + _fmtN(l.valor) + '</td>' +
      '<td class="numero" style="font-size:11px;">' + pctStr + '</td>' +
      '<td><div class="eeff-margin-bar"><div class="eeff-margin-fill' + (neg ? ' eeff-margin-neg' : '') + '" style="width:' + barW + '%"></div></div></td></tr>';
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}

// ── Métricas ────────────────────────────────────────────────────────────────

function _renderMetricasEEFF() {
  var grid = document.getElementById("eeff-metricas-grid");
  if (!_eeffInforme) { grid.innerHTML = '<p class="sin-datos">Selecciona sociedad y año</p>'; return; }
  var metricas = _eeffInforme.metricas || [];
  if (!metricas.length) { grid.innerHTML = '<p class="sin-datos">Sin métricas</p>'; return; }
  var colors = { "Margen EBITDA %": "blue", "Working Capital": "teal", "Deuda Neta": "amber", "Deuda Neta / EBITDA": "gray", "ROE %": "green", "DSO": "coral" };
  grid.innerHTML = "";
  metricas.forEach(function (m) {
    var v;
    if (m.formato === "PCT") v = (m.valor || 0).toFixed(1) + "%";
    else if (m.formato === "RATIO") v = (m.valor || 0).toFixed(2) + "x";
    else if (m.formato === "DIAS") v = Math.round(m.valor || 0) + " dias";
    else v = _fmtN(m.valor);
    var div = document.createElement("div");
    div.className = "dir-kpi dir-kpi--" + (colors[m.nombre] || "blue");
    div.innerHTML = '<span class="dir-kpi__label">' + _escH(m.nombre) + '</span><span class="dir-kpi__value">' + v + '</span>';
    grid.appendChild(div);
  });
}

// ── Config resumen ──────────────────────────────────────────────────────────

function _cargarConfigResumen() {
  fetch("/api/eeff/config-resumen?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (d) {
      // Only update numbers — cards are static HTML in index.html
      var el;
      el = document.getElementById("eeff-cfg-mapeadas");
      if (el) el.textContent = d.cuentas_mapeadas || 0;
      el = document.getElementById("eeff-cfg-sin-mapear");
      if (el) el.textContent = d.cuentas_sin_mapear || 0;
      el = document.getElementById("eeff-cfg-periodos");
      if (el) el.textContent = d.periodos_importados || 0;
      el = document.getElementById("eeff-cfg-ultimo-periodo");
      if (el) el.textContent = "\u00daltimo: " + (d.ultimo_periodo || "\u2014");
      el = document.getElementById("eeff-cfg-formulas");
      if (el) el.textContent = d.formulas_activas || 0;

      // Warning card style
      var sinMapear = d.cuentas_sin_mapear || 0;
      var warnCard = document.getElementById("eeff-cfg-warning-card");
      var warnLabel = document.getElementById("eeff-cfg-warning-label");
      var warnSub = document.getElementById("eeff-cfg-warning-sub");
      if (warnCard) {
        if (sinMapear > 0) {
          warnCard.classList.add("eeff-cfg-card--warning");
          if (warnLabel) warnLabel.style.color = "#DC2626";
          if (warnSub) { warnSub.textContent = "requieren asignaci\u00f3n"; warnSub.style.color = ""; }
        } else {
          warnCard.classList.remove("eeff-cfg-card--warning");
          if (warnLabel) warnLabel.style.color = "";
          if (warnSub) { warnSub.textContent = "Todo mapeado"; warnSub.style.color = "var(--color-success)"; }
        }
      }
    })
    .catch(function (e) { console.error("[EEFF] Error cargando config-resumen:", e); });
}

// ── Modal: Plan de cuentas ──────────────────────────────────────────────────

window.eeffModalPlanCuentas = function () {
  document.getElementById("modal-eeff-plan").classList.add("visible");
  _cargarPlanCuentasModal();
};

function _cargarPlanCuentasModal() {
  fetch("/api/eeff/plan-cuentas?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      _eeffPlanCuentas = data || [];
      // Populate n2 filter from data
      var n1Filter = document.getElementById("eeff-plan-filtro-n1").value;
      var n2Set = {};
      _eeffPlanCuentas.forEach(function (c) {
        if (!n1Filter || c.nivel1 === n1Filter) n2Set[c.nivel2] = 1;
      });
      var selN2 = document.getElementById("eeff-plan-filtro-n2");
      var curN2 = selN2.value;
      selN2.innerHTML = '<option value="">Todos los subniveles</option>';
      Object.keys(n2Set).sort().forEach(function (n2) { selN2.innerHTML += '<option value="' + _escH(n2) + '">' + _escH(n2) + '</option>'; });
      if (curN2) selN2.value = curN2;
      _filtrarPlanCuentas();
    });
}

function _filtrarPlanCuentas() {
  var n1 = document.getElementById("eeff-plan-filtro-n1").value;
  var n2 = document.getElementById("eeff-plan-filtro-n2").value;
  var q = (document.getElementById("eeff-plan-buscar").value || "").toLowerCase();
  var tbody = document.getElementById("eeff-tbody-plan");
  tbody.innerHTML = "";

  _eeffPlanCuentas.forEach(function (c) {
    if (n1 && c.nivel1 !== n1) return;
    if (n2 && c.nivel2 !== n2) return;
    if (q && c.codigo.toLowerCase().indexOf(q) === -1 && c.nombre.toLowerCase().indexOf(q) === -1) return;
    var isSC = c.nivel1 === "Sin clasificar";
    var tr = document.createElement("tr");
    if (isSC) tr.className = "eeff-row-sin-clasificar";
    tr.innerHTML =
      '<td style="font-family:monospace;">' + _escH(c.codigo) + '</td>' +
      '<td>' + _escH(c.nombre) + '</td>' +
      '<td>' + _escH(c.nivel1) + '</td>' +
      '<td>' + _escH(c.nivel2) + '</td>' +
      '<td>' + _escH(c.nivel3) + '</td>' +
      '<td>' + (c.signo === -1 ? "Acr." : "Deu.") + '</td>' +
      '<td><button class="btn-small" onclick="_editarCuentaEEFF(' + c.id + ')">Editar</button></td>';
    tbody.appendChild(tr);
  });
  if (!tbody.children.length) tbody.innerHTML = '<tr><td colspan="7" class="sin-datos">Sin resultados</td></tr>';

  // Update n2 options when n1 changes
  if (document.activeElement === document.getElementById("eeff-plan-filtro-n1")) {
    var n2Set = {};
    _eeffPlanCuentas.forEach(function (c) { if (!n1 || c.nivel1 === n1) n2Set[c.nivel2] = 1; });
    var selN2 = document.getElementById("eeff-plan-filtro-n2");
    selN2.innerHTML = '<option value="">Todos los subniveles</option>';
    Object.keys(n2Set).sort().forEach(function (v) { selN2.innerHTML += '<option>' + _escH(v) + '</option>'; });
  }
}

window._editarCuentaEEFF = function (id) {
  var c = _eeffPlanCuentas.find(function (x) { return x.id === id; });
  if (!c) return;
  var n1 = prompt("Nivel 1 (Activo / Pasivo y PN / P&G):", c.nivel1);
  if (!n1) return;
  var n2 = prompt("Nivel 2:", c.nivel2);
  if (n2 === null) return;
  var n3 = prompt("Nivel 3:", c.nivel3);
  if (n3 === null) return;
  var signo = prompt("Signo (1=Deudor, -1=Acreedor):", c.signo);
  if (signo === null) return;
  fetch("/api/eeff/plan-cuentas/" + id, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nivel1: n1, nivel2: n2, nivel3: n3, signo: parseInt(signo) || 1 })
  }).then(function () { _cargarPlanCuentasModal(); _cargarInformeEEFF(); });
};

// ── Modal: Sin clasificar ───────────────────────────────────────────────────

window.eeffModalSinClasificar = function () {
  fetch("/api/eeff/plan-cuentas?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var sc = (data || []).filter(function (c) { return c.nivel1 === "Sin clasificar"; });
      if (!sc.length) { alert("No hay cuentas sin clasificar."); return; }
      _mostrarModalSC(sc.map(function (c) { return { codigo: c.codigo, nombre: c.nombre, saldo: 0 }; }));
    });
};

function _mostrarModalSC(cuentas) {
  var list = document.getElementById("eeff-sc-list");
  list.innerHTML = "";
  var niveles1 = ["Activo", "Pasivo y PN", "P&G"];
  cuentas.forEach(function (c) {
    var cod = parseInt(c.codigo);
    var sugN1 = "";
    if (cod >= 1000 && cod < 2000) sugN1 = "Pasivo y PN";
    else if (cod >= 2000 && cod < 6000) sugN1 = "Activo";
    else if (cod >= 6000 && cod < 8000) sugN1 = "P&G";

    var div = document.createElement("div");
    div.className = "eeff-sc-row";
    div.dataset.codigo = c.codigo;
    div.innerHTML =
      '<div class="eeff-sc-info"><strong>' + c.codigo + '</strong> \u2014 ' + _escH(c.nombre) +
      (c.saldo ? ' <span style="color:#94A3B8;">(saldo: ' + _fmtN(c.saldo) + ')</span>' : '') + '</div>' +
      '<div class="eeff-sc-selects">' +
        '<select class="eeff-sc-n1 select-empresa" style="min-width:110px;font-size:12px;"><option value="">Nivel 1</option>' +
        niveles1.map(function (n) { return '<option' + (n === sugN1 ? ' selected' : '') + '>' + n + '</option>'; }).join("") + '</select>' +
        '<input class="eeff-sc-n2" placeholder="Nivel 2" style="width:130px;padding:4px 8px;font-size:12px;border:1px solid var(--color-border);border-radius:var(--radius-sm);" />' +
        '<input class="eeff-sc-n3" placeholder="Nivel 3" style="width:110px;padding:4px 8px;font-size:12px;border:1px solid var(--color-border);border-radius:var(--radius-sm);" />' +
        '<select class="eeff-sc-signo select-empresa" style="min-width:80px;font-size:12px;"><option value="1">Deudor</option><option value="-1"' +
        (sugN1 === "Pasivo y PN" || sugN1 === "P&G" ? ' selected' : '') + '>Acreedor</option></select>' +
      '</div>';
    list.appendChild(div);
  });
  document.getElementById("modal-eeff-sin-clasificar").classList.add("visible");
}

function _guardarMapeoSC() {
  var rows = document.querySelectorAll(".eeff-sc-row");
  var promises = [];
  rows.forEach(function (row) {
    var n1 = row.querySelector(".eeff-sc-n1").value;
    if (!n1) return;
    var n2 = row.querySelector(".eeff-sc-n2").value || "Sin clasificar";
    var n3 = row.querySelector(".eeff-sc-n3").value || "Sin clasificar";
    var signo = parseInt(row.querySelector(".eeff-sc-signo").value) || 1;
    promises.push(fetch("/api/eeff/plan-cuentas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: row.dataset.codigo, nombre: row.dataset.codigo, nivel1: n1, nivel2: n2, nivel3: n3, signo: signo })
    }));
  });
  Promise.all(promises).then(function () {
    document.getElementById("modal-eeff-sin-clasificar").classList.remove("visible");
    _cargarInformeEEFF();
    _cargarConfigResumen();
  });
}

// ── Modal: Periodos ─────────────────────────────────────────────────────────

window.eeffModalPeriodos = function () {
  document.getElementById("modal-eeff-periodos").classList.add("visible");
  fetch("/api/eeff/periodos?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var tbody = document.getElementById("eeff-tbody-periodos");
      tbody.innerHTML = "";
      var tipoLabel = { balance: "Balance", pyg: "P&G", sumas_saldos: "SS" };

      // Detect imported months for gap detection
      var mesesImportados = {};
      (data || []).forEach(function (p) { if (p.tipo === "sumas_saldos") mesesImportados[p.fecha_hasta.substring(0, 7)] = true; });

      // Find gaps
      var mesesKeys = Object.keys(mesesImportados).sort();
      var faltantes = {};
      if (mesesKeys.length > 1) {
        var parts = mesesKeys[0].split("-");
        var y = parseInt(parts[0]), m = parseInt(parts[1]);
        var lastParts = mesesKeys[mesesKeys.length - 1].split("-");
        var ly = parseInt(lastParts[0]), lm = parseInt(lastParts[1]);
        while (y < ly || (y === ly && m <= lm)) {
          var key = y + "-" + (m < 10 ? "0" : "") + m;
          if (!mesesImportados[key]) faltantes[key] = true;
          m++; if (m > 12) { m = 1; y++; }
        }
      }

      // Render imported periods
      (data || []).sort(function (a, b) { return b.fecha_hasta.localeCompare(a.fecha_hasta); }).forEach(function (p) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td>' + _escH(p.periodo) + '</td>' +
          '<td>' + (tipoLabel[p.tipo] || p.tipo) + '</td>' +
          '<td>' + _escH(p.fecha_desde) + '</td>' +
          '<td>' + _escH(p.fecha_hasta) + '</td>' +
          '<td>' + _escH(p.fichero_origen || "") + '</td>' +
          '<td><span class="eeff-pill eeff-pill--ok">OK</span></td>' +
          '<td><button class="btn-small danger" onclick="_eliminarPeriodoEEFF(' + p.id + ')">Eliminar</button></td>';
        tbody.appendChild(tr);
      });

      // Render missing months
      Object.keys(faltantes).sort().reverse().forEach(function (key) {
        var meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        var parts = key.split("-");
        var label = meses[parseInt(parts[1]) - 1] + " " + parts[0];
        var tr = document.createElement("tr");
        tr.className = "eeff-row-faltante";
        tr.innerHTML =
          '<td>' + label + '</td><td>SS</td><td></td><td>' + key + '</td><td></td>' +
          '<td><span class="eeff-pill eeff-pill--warn">No cargado</span></td><td></td>';
        tbody.appendChild(tr);
      });
    });
};

window._eliminarPeriodoEEFF = function (pid) {
  if (!confirm("¿Eliminar este periodo?")) return;
  fetch("/api/eeff/periodos/" + pid, { method: "DELETE" })
    .then(function () { _cargarPeriodosEEFF(); eeffModalPeriodos(); _cargarConfigResumen(); });
};

// ── Modal: Fórmulas ─────────────────────────────────────────────────────────

window.eeffModalFormulas = function () {
  document.getElementById("modal-eeff-formulas").classList.add("visible");
  fetch("/api/eeff/formulas?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var tbody = document.getElementById("eeff-tbody-formulas");
      tbody.innerHTML = "";
      (data || []).forEach(function (f) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td><strong>' + _escH(f.nombre) + '</strong></td>' +
          '<td style="font-family:monospace;font-size:11px;max-width:350px;overflow:hidden;text-overflow:ellipsis;" title="' + _escH(f.formula) + '">' + _escH(f.formula) + '</td>' +
          '<td>' + _escH(f.formato) + '</td>' +
          '<td>' + _escH(f.grupo) + '</td>';
        tbody.appendChild(tr);
      });
    });
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function _fmtN(v) {
  if (v == null || isNaN(v)) return "\u2014";
  return Number(v).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
}
function _escH(s) {
  if (!s) return "";
  var d = document.createElement("div"); d.textContent = s; return d.innerHTML;
}
