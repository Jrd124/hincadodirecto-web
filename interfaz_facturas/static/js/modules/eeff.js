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
window._eeffUnidad = "unidades";

function _fmtEEFF(n) {
  if (n == null || isNaN(n)) return "\u2014";
  var u = window._eeffUnidad || "unidades";
  var divisor = 1, decimales = 0;
  if (u === "miles") { divisor = 1000; decimales = 0; }
  if (u === "millones") { divisor = 1000000; decimales = 2; }
  var val = n / divisor;
  // Treat near-zero as dash
  if (decimales === 0 && Math.abs(val) < 0.5) return "\u2014";
  if (decimales === 2 && Math.abs(val) < 0.005) return "\u2014";
  var neg = val < 0;
  val = Math.abs(val);
  var str = val.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales, useGrouping: true });
  return neg ? "(" + str + ")" : str;
}

function _fmtEEFFHtml(n) {
  if (n == null || isNaN(n)) return "\u2014";
  var txt = _fmtEEFF(n);
  if (txt === "\u2014") return txt;
  return (n < 0) ? '<span class="eeff-negativo">' + txt + '</span>' : txt;
}

function cargarEEFF() {
  _initEEFF();
  _cargarPeriodosEEFF();
}

function _initEEFF() {
  if (_eeffInit) return;
  _eeffInit = true;

  // Tabs — re-render from cached data on switch (respects current unit)
  document.querySelectorAll(".eeff-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".eeff-tab").forEach(function (t) { t.classList.remove("active"); });
      document.querySelectorAll(".eeff-tab-content").forEach(function (c) { c.classList.remove("active"); });
      tab.classList.add("active");
      document.getElementById("eeff-tab-" + tab.dataset.tab).classList.add("active");
      var t = tab.dataset.tab;
      if (t === "config") _cargarConfigResumen();
      else if (t === "balance" && _eeffBalanceData) _pintarBalanceComparativo(document.getElementById("eeff-balance-body"));
      else if (t === "pyg" && _eeffPygData) _pintarPygComparativa();
      else if (t === "cashflow" && _eeffCfData) _pintarCfComparativo();
      else if (t === "metricas" && _eeffInforme) _renderMetricasEEFF();
    });
  });

  // Selectors — cascading: sociedad → años → meses → informe
  document.getElementById("eeff-sociedad").addEventListener("change", function () { _actualizarAniosEEFF(); _actualizarMesesEEFF(); _cargarInformeEEFF(); });
  document.getElementById("eeff-anio").addEventListener("change", function () { _actualizarMesesEEFF(); _cargarInformeEEFF(); });
  document.getElementById("eeff-mes").addEventListener("change", function () { _cargarInformeEEFF(); });

  // Unit selector
  var unidadSel = document.getElementById("eeff-unidad");
  if (unidadSel) {
    unidadSel.addEventListener("change", function () {
      window._eeffUnidad = this.value;
      // Re-render active tab without re-fetching
      var activeTab = document.querySelector(".eeff-tab.active");
      var tab = activeTab ? activeTab.dataset.tab : "";
      if (tab === "balance") { if (_eeffBalanceData) _pintarBalanceComparativo(document.getElementById("eeff-balance-body")); }
      else if (tab === "pyg" && _eeffPygData) _pintarPygComparativa();
      else if (tab === "cashflow" && _eeffCfData) _pintarCfComparativo();
      else if (tab === "metricas") _renderMetricasEEFF();
    });
  }

  // Subir modal (keep listener for non-onclick fallback)
  var btnSubir = document.getElementById("btn-eeff-subir");
  if (btnSubir && !btnSubir.hasAttribute("onclick")) {
    btnSubir.addEventListener("click", function () { eeffImportarModal(); });
  }

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
          var detalles = (data.detalle || []).map(function (d) {
            return d.periodo + (d.reemplazado ? " (reemplazado)" : "");
          }).join(", ");
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
    _renderBalanceEEFF(); _renderPYGEEFF(); _renderMetricasEEFF(); _renderCashFlowEEFF();
    return;
  }
  var url = "/api/eeff/informe?sociedad=" + encodeURIComponent(soc) + "&anio=" + anio;
  if (mes) url += "&mes=" + mes;
  url += "&t=" + Date.now();
  fetch(url)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (data.error) { _eeffInforme = null; } else { _eeffInforme = data; }
      _renderBalanceEEFF(); _renderPYGEEFF(); _renderMetricasEEFF(); _renderCashFlowEEFF();
      if (data.sin_clasificar && data.sin_clasificar.length > 0) _mostrarModalSC(data.sin_clasificar);
    })
    .catch(function () { _eeffInforme = null; _renderBalanceEEFF(); _renderPYGEEFF(); _renderMetricasEEFF(); _renderCashFlowEEFF(); });
}

// ── Balance Comparativo ─────────────────────────────────────────────────────

var _eeffBalanceData = null;

function _renderBalanceEEFF() {
  var body = document.getElementById("eeff-balance-body");
  var soc = document.getElementById("eeff-sociedad").value;
  var anio = document.getElementById("eeff-anio").value;
  var mes = document.getElementById("eeff-mes").value;
  if (!soc || !anio || !mes) {
    // Fallback: si no hay mes, mostrar el balance simple del informe
    if (_eeffInforme && _eeffInforme.balance) {
      _renderBalanceSimple(body);
    } else {
      body.innerHTML = '<p class="sin-datos">Selecciona sociedad, año y mes</p>';
    }
    return;
  }
  var url = "/api/eeff/balance-comparativo?sociedad=" + encodeURIComponent(soc) +
    "&anio=" + anio + "&mes=" + mes + "&t=" + Date.now();
  fetch(url)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (data.error) { body.innerHTML = '<p class="sin-datos">' + _escH(data.error) + '</p>'; return; }
      _eeffBalanceData = data;
      _pintarBalanceComparativo(body);
    })
    .catch(function (e) { console.error("[EEFF Balance]", e); body.innerHTML = '<p class="sin-datos">Error cargando balance</p>'; });
}

function _renderBalanceSimple(body) {
  var bal = _eeffInforme.balance || {};
  var totals = _eeffInforme.balance_totals || [];
  var html = '<table class="tabla-generica eeff-tabla-jerarquica"><thead><tr><th>Concepto</th><th class="numero" style="width:150px;">Importe</th></tr></thead><tbody>';
  [{ key: "Activo", label: "ACTIVO", total: "Total Activo" },
   { key: "Pasivo y PN", label: "PASIVO Y PATRIMONIO NETO", total: "Total Pasivo y PN" }
  ].forEach(function (sec) {
    html += '<tr class="eeff-row-seccion"><td colspan="2">' + sec.label + '</td></tr>';
    var data = bal[sec.key] || {};
    for (var n2 in data) {
      html += '<tr class="eeff-row-grupo"><td style="padding-left:16px;">' + _escH(n2) + '</td><td class="numero">' + _fmtEEFFHtml(data[n2].total) + '</td></tr>';
      for (var n3 in data[n2].detalle) {
        var v = data[n2].detalle[n3];
        html += '<tr class="eeff-row-detalle"><td style="padding-left:32px;">' + _escH(n3) + '</td><td class="numero">' + _fmtEEFFHtml(v) + '</td></tr>';
      }
    }
    var tf = totals.find(function (t) { return t.nombre === sec.total; });
    if (tf) html += '<tr class="eeff-row-total"><td style="padding-left:16px;">' + _escH(tf.nombre) + '</td><td class="numero">' + _fmtEEFFHtml(tf.valor) + '</td></tr>';
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}

function _colStyle(i, ncols, isHeader) {
  // Last column = current period = highlighted
  var isLast = (i === ncols - 1);
  if (isHeader) {
    return isLast
      ? 'text-align:right;padding:8px;font-size:13px;min-width:110px;background:#EFF6FF;color:#1E40AF;font-weight:600;'
      : 'text-align:right;padding:8px;font-size:13px;min-width:110px;color:var(--color-text-secondary);';
  }
  return isLast
    ? 'padding:4px 8px;background:#F8FAFC;'
    : 'padding:4px 8px;color:var(--color-text-secondary);';
}

function _pintarBalanceComparativo(body) {
  var d = _eeffBalanceData;
  var cols = d.columnas || [];
  var ncols = cols.length;

  var html = '<table class="tabla-generica eeff-tabla-jerarquica" style="width:100%;border-collapse:collapse;">';
  html += '<thead><tr><th style="text-align:left;padding:8px;font-size:13px;">Concepto</th>';
  for (var ci = 0; ci < ncols; ci++) {
    html += '<th style="' + _colStyle(ci, ncols, true) + '">' + _escH(cols[ci]) + '</th>';
  }
  html += '</tr></thead><tbody>';

  var ordenActivo = ["Activo No Corriente", "Activo Corriente"];
  var ordenPasivo = ["Patrimonio Neto", "Pasivo No Corriente", "Pasivo Corriente"];

  function renderSection(label, sectionData, totalArr, orden) {
    html += '<tr class="eeff-row-seccion"><td colspan="' + (ncols + 1) + '">' + label + '</td></tr>';
    // Use explicit order, then append any extra keys not in the list
    var keys = (orden || []).filter(function (k) { return sectionData[k]; });
    for (var k in sectionData) { if (keys.indexOf(k) === -1) keys.push(k); }
    keys.forEach(function (n2) {
      var group = sectionData[n2];
      for (var n3 in group.detalle) {
        var vals = group.detalle[n3];
        html += '<tr class="eeff-row-detalle"><td style="padding-left:32px;">' + _escH(n3) + '</td>';
        for (var i = 0; i < ncols; i++) {
          html += '<td class="numero" style="' + _colStyle(i, ncols, false) + '">' + _fmtEEFFHtml(vals[i] || 0) + '</td>';
        }
        html += '</tr>';
      }
      html += '<tr class="eeff-row-grupo"><td style="padding-left:16px;">' + _escH(n2) + '</td>';
      for (var i = 0; i < ncols; i++) {
        html += '<td class="numero" style="' + _colStyle(i, ncols, false) + 'font-weight:600;">' + _fmtEEFFHtml(group.total[i] || 0) + '</td>';
      }
      html += '</tr>';
    });
    html += '<tr class="eeff-row-total"><td style="padding-left:16px;font-weight:700;">TOTAL ' + label + '</td>';
    for (var i = 0; i < ncols; i++) {
      html += '<td class="numero" style="' + _colStyle(i, ncols, false) + 'font-weight:700;">' + _fmtEEFFHtml(totalArr[i] || 0) + '</td>';
    }
    html += '</tr>';
  }

  renderSection("ACTIVO", d.activo || {}, d.total_activo || [], ordenActivo);
  renderSection("PASIVO Y PATRIMONIO NETO", d.pasivo_pn || {}, d.total_pasivo_pn || [], ordenPasivo);

  var cuadre = d.cuadre || [];
  var hasMismatch = cuadre.some(function (c) { return Math.abs(c) > 0.01; });
  if (hasMismatch) {
    html += '<tr style="background:#FEF2F2;"><td style="padding:6px 8px;color:var(--color-danger);font-weight:600;">Descuadre</td>';
    for (var i = 0; i < ncols; i++) {
      html += '<td class="numero" style="padding:6px 8px;color:var(--color-danger);font-weight:600;">' + _fmtEEFF(cuadre[i] || 0) + '</td>';
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  body.innerHTML = html;
}

// ── P&G Comparativa ─────────────────────────────────────────────────────────

var _eeffPygVista = "mensual";
var _eeffPygData = null;

function _renderPYGEEFF() {
  var body = document.getElementById("eeff-pyg-body");
  var soc = document.getElementById("eeff-sociedad").value;
  var anio = document.getElementById("eeff-anio").value;
  var mes = document.getElementById("eeff-mes").value;
  if (!soc || !anio || !mes) {
    body.innerHTML = '<p class="sin-datos">Selecciona sociedad, año y mes para ver comparativas</p>';
    return;
  }
  _cargarPygComparativa();
}

function _cargarPygComparativa() {
  var soc = document.getElementById("eeff-sociedad").value;
  var anio = document.getElementById("eeff-anio").value;
  var mes = document.getElementById("eeff-mes").value;
  var body = document.getElementById("eeff-pyg-body");
  if (!soc || !anio || !mes) return;

  var url = "/api/eeff/pyg-comparativa?sociedad=" + encodeURIComponent(soc) +
    "&anio=" + anio + "&mes=" + mes + "&vista=" + _eeffPygVista + "&t=" + Date.now();

  fetch(url)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (data.error) { body.innerHTML = '<p class="sin-datos">' + _escH(data.error) + '</p>'; return; }
      _eeffPygData = data;
      _pintarPygComparativa();
    })
    .catch(function () { body.innerHTML = '<p class="sin-datos">Error cargando comparativa</p>'; });
}

window.eeffPygVista = function (vista) {
  _eeffPygVista = vista;
  document.querySelectorAll(".eeff-pyg-pill").forEach(function (b) {
    b.classList.toggle("active", b.dataset.vista === vista);
  });
  _cargarPygComparativa();
};

function _pintarPygComparativa() {
  var body = document.getElementById("eeff-pyg-body");
  var d = _eeffPygData;
  if (!d) { body.innerHTML = '<p class="sin-datos">Sin datos</p>'; return; }

  // Pills
  var html = '<div class="eeff-pyg-pills">' +
    '<button class="eeff-pyg-pill' + (_eeffPygVista === "mensual" ? " active" : "") + '" data-vista="mensual" onclick="eeffPygVista(\'mensual\')">Mensual</button>' +
    '<button class="eeff-pyg-pill' + (_eeffPygVista === "ytd" ? " active" : "") + '" data-vista="ytd" onclick="eeffPygVista(\'ytd\')">Acumulado YTD</button>' +
    '<button class="eeff-pyg-pill' + (_eeffPygVista === "ltm" ? " active" : "") + '" data-vista="ltm" onclick="eeffPygVista(\'ltm\')">Últimos 12 meses</button>' +
    '</div>';

  var pa = d.periodo_actual || {};
  var pn1 = d.periodo_n1 || {};
  var pn2 = d.periodo_n2 || {};
  var hasN1 = d.disponible_n1;
  var hasN2 = d.disponible_n2;

  var mapA = {}, mapN1 = {}, mapN2 = {};
  (pa.lineas || []).forEach(function (l) { mapA[l.nombre] = l.valor; });
  (pn1.lineas || []).forEach(function (l) { mapN1[l.nombre] = l.valor; });
  (pn2.lineas || []).forEach(function (l) { mapN2[l.nombre] = l.valor; });

  var subtotals = ["Margen Bruto", "EBITDA", "EBIT", "Resultado Financiero", "Resultado Antes Impuestos", "Resultado Neto"];
  var gastoKeys = ["Aprovisionamientos", "Gastos Personal", "Otros Gastos", "Amortización", "Deterioro",
    "Gastos Excepcionales", "Gastos Financieros", "Impuesto Sociedades"];

  function fmtVar(actual, anterior, nombre) {
    if (anterior == null || anterior === 0) {
      if (actual && actual !== 0) return '<span class="eeff-var-neutral">nuevo</span>';
      return '<span class="eeff-var-neutral">\u2014</span>';
    }
    var pct = ((actual - anterior) / Math.abs(anterior)) * 100;
    var isGasto = gastoKeys.indexOf(nombre) >= 0;
    var isPositive = isGasto ? (pct <= 0) : (pct >= 0);
    var cls = pct === 0 ? "eeff-var-neutral" : (isPositive ? "eeff-var-pos" : "eeff-var-neg");
    var sign = pct > 0 ? "+" : "";
    return '<span class="' + cls + '">' + sign + pct.toFixed(1).replace(".", ",") + '%</span>';
  }

  // Build column order: n-2, n-1, actual (oldest left, current right)
  // Each col: {nombre, map, isActual, varAgainst (map to compare for Var%)}
  var columns = [];
  if (hasN2) columns.push({ nombre: pn2.nombre, map: mapN2, isActual: false });
  if (hasN1) columns.push({ nombre: pn1.nombre, map: mapN1, isActual: false });
  columns.push({ nombre: pa.nombre, map: mapA, isActual: true });

  // Table header
  var thStyle = 'text-align:right;padding:8px;font-size:13px;min-width:100px;';
  var thActual = thStyle + 'background:#EFF6FF;color:#1E40AF;font-weight:600;';
  var thComp = thStyle + 'color:var(--color-text-secondary);';
  html += '<table class="tabla-generica eeff-pyg-cascada" style="width:100%;border-collapse:collapse;">' +
    '<thead><tr style="border-bottom:2px solid var(--color-border-tertiary, #E2E8F0);">' +
    '<th style="text-align:left;padding:8px;font-size:13px;">Concepto</th>';
  columns.forEach(function (col) {
    html += '<th style="' + (col.isActual ? thActual : thComp) + '">' + _escH(col.nombre || "") + '</th>';
    if (!col.isActual) html += '<th style="' + thComp + 'width:65px;">Var %</th>';
  });
  html += '</tr></thead><tbody>';

  var lineas = pa.lineas || [];
  if (!lineas.length && pn1.lineas) lineas = pn1.lineas;

  lineas.forEach(function (l) {
    var nombre = l.nombre;
    var valA = mapA[nombre] != null ? mapA[nombre] : null;
    var isSub = subtotals.indexOf(nombre) >= 0;
    var cls = isSub ? (nombre === "Resultado Neto" ? ' class="eeff-pyg-resultado"' : ' class="eeff-pyg-subtotal"') : "";

    html += '<tr' + cls + '><td style="padding:6px 8px;">' + _escH(nombre) + '</td>';
    columns.forEach(function (col) {
      var v = col.map[nombre] != null ? col.map[nombre] : null;
      var cellBg = col.isActual ? 'background:#F8FAFC;' : '';
      var cellColor = col.isActual ? '' : 'color:var(--color-text-secondary);';
      html += '<td class="numero" style="padding:6px 8px;' + cellBg + cellColor + '">' + _fmtEEFFHtml(v) + '</td>';
      if (!col.isActual) {
        html += '<td style="text-align:right;padding:6px 8px;font-size:12px;">' + fmtVar(valA, v, nombre) + '</td>';
      }
    });
    html += '</tr>';
  });
  html += '</tbody></table>';

  // EBITDA margin bar — order: oldest → current
  var barsHtml = '<div class="eeff-ebitda-bars"><strong style="white-space:nowrap;">Margen EBITDA:</strong>';
  function marginBar(label, ebitda, ingresos, color) {
    var ing = Math.abs(ingresos) || 1;
    var m = (ebitda / ing * 100);
    var w = Math.min(Math.max(Math.abs(m), 2), 100);
    return '<div class="eeff-ebitda-bar-item">' +
      '<div class="eeff-ebitda-bar-fill" style="width:' + w + 'px;background:' + color + ';"></div>' +
      '<span>' + m.toFixed(1).replace(".", ",") + '% (' + _escH(label) + ')</span></div>';
  }
  if (hasN2) barsHtml += marginBar(pn2.nombre || "", mapN2["EBITDA"] || 0, mapN2["Ingresos"] || 0, "#CBD5E1");
  if (hasN1) barsHtml += marginBar(pn1.nombre || "", mapN1["EBITDA"] || 0, mapN1["Ingresos"] || 0, "#94A3B8");
  barsHtml += marginBar(pa.nombre || "", mapA["EBITDA"] || 0, mapA["Ingresos"] || 0, "#3B82F6");
  barsHtml += '</div>';
  html += barsHtml;

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
    else v = _fmtEEFF(m.valor);
    var div = document.createElement("div");
    div.className = "dir-kpi dir-kpi--" + (colors[m.nombre] || "blue");
    div.innerHTML = '<span class="dir-kpi__label">' + _escH(m.nombre) + '</span><span class="dir-kpi__value">' + v + '</span>';
    grid.appendChild(div);
  });
}

// ── Cash Flow Comparativo ──────────────────────────────────────────────────

var _eeffCfVista = "ytd";
var _eeffCfData = null;

function _renderCashFlowEEFF() {
  var body = document.getElementById("eeff-cashflow-body");
  if (!body) return;
  var soc = document.getElementById("eeff-sociedad").value;
  var anio = document.getElementById("eeff-anio").value;
  var mes = document.getElementById("eeff-mes").value;
  if (!soc || !anio || !mes) {
    body.innerHTML = '<p class="sin-datos">Selecciona sociedad, año y mes</p>';
    return;
  }
  _cargarCfComparativo();
}

function _cargarCfComparativo() {
  var soc = document.getElementById("eeff-sociedad").value;
  var anio = document.getElementById("eeff-anio").value;
  var mes = document.getElementById("eeff-mes").value;
  var body = document.getElementById("eeff-cashflow-body");
  if (!soc || !anio || !mes) return;

  var url = "/api/eeff/cashflow-comparativo?sociedad=" + encodeURIComponent(soc) +
    "&anio=" + anio + "&mes=" + mes + "&vista=" + _eeffCfVista + "&t=" + Date.now();
  fetch(url)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (data.error) { body.innerHTML = '<p class="sin-datos">' + _escH(data.error) + '</p>'; return; }
      _eeffCfData = data;
      _pintarCfComparativo();
    })
    .catch(function () { body.innerHTML = '<p class="sin-datos">Error cargando cash flow</p>'; });
}

window.eeffCfVista = function (vista) {
  _eeffCfVista = vista;
  document.querySelectorAll(".eeff-cf-pill").forEach(function (b) {
    b.classList.toggle("active", b.dataset.vista === vista);
  });
  _cargarCfComparativo();
};

function _pintarCfComparativo() {
  var body = document.getElementById("eeff-cashflow-body");
  var d = _eeffCfData;
  if (!d) { body.innerHTML = '<p class="sin-datos">Sin datos</p>'; return; }

  // Pills
  var html = '<div class="eeff-pyg-pills">' +
    '<button class="eeff-cf-pill eeff-pyg-pill' + (_eeffCfVista === "mensual" ? " active" : "") + '" data-vista="mensual" onclick="eeffCfVista(\'mensual\')">Mensual</button>' +
    '<button class="eeff-cf-pill eeff-pyg-pill' + (_eeffCfVista === "ytd" ? " active" : "") + '" data-vista="ytd" onclick="eeffCfVista(\'ytd\')">Acumulado YTD</button>' +
    '<button class="eeff-cf-pill eeff-pyg-pill' + (_eeffCfVista === "ltm" ? " active" : "") + '" data-vista="ltm" onclick="eeffCfVista(\'ltm\')">Últimos 12 meses</button>' +
    '</div>';

  var pa = d.periodo_actual || {};
  var pn1 = d.periodo_n1 || {};
  var pn2 = d.periodo_n2 || {};
  var hasN1 = d.disponible_n1;
  var hasN2 = d.disponible_n2;

  // Build columns: oldest → current (right)
  var columns = [];
  if (hasN2) columns.push({ nombre: pn2.nombre, lineas: pn2.lineas || [], isActual: false });
  if (hasN1) columns.push({ nombre: pn1.nombre, lineas: pn1.lineas || [], isActual: false });
  columns.push({ nombre: pa.nombre, lineas: pa.lineas || [], isActual: true });
  var ncols = columns.length;

  // Build lookup maps by concepto for each column
  var maps = columns.map(function (col) {
    var m = {};
    col.lineas.forEach(function (l) { m[l.concepto] = l; });
    return m;
  });

  // Use actual period's lineas as canonical row list
  var rowDefs = pa.lineas || [];
  if (!rowDefs.length && pn1.lineas) rowDefs = pn1.lineas;

  var thComp = 'text-align:right;padding:8px;font-size:13px;min-width:100px;color:var(--color-text-secondary);';
  var thActual = 'text-align:right;padding:8px;font-size:13px;min-width:100px;background:#EFF6FF;color:#1E40AF;font-weight:600;';

  html += '<table class="tabla-generica eeff-tabla-jerarquica" style="width:100%;border-collapse:collapse;">';
  html += '<thead><tr><th style="text-align:left;padding:8px;font-size:13px;">Concepto</th>';
  columns.forEach(function (col) {
    html += '<th style="' + (col.isActual ? thActual : thComp) + '">' + _escH(col.nombre || "") + '</th>';
  });
  html += '</tr></thead><tbody>';

  var lastSeccion = "";
  rowDefs.forEach(function (row) {
    var concepto = row.concepto;
    var tipo = row.tipo;
    var seccion = row.seccion;

    // Section header
    if (seccion !== lastSeccion && seccion && seccion !== "caja") {
      html += '<tr class="eeff-row-seccion"><td colspan="' + (ncols + 1) + '">' + _escH(seccion) + '</td></tr>';
      lastSeccion = seccion;
    }

    var isTotal = (tipo === "total");
    var isGranTotal = (tipo === "gran_total");
    var rowCls = isGranTotal ? ' style="background:var(--color-bg-alt);border-top:2px solid var(--color-border-tertiary,#E2E8F0);"' :
                 isTotal ? ' class="eeff-row-total"' : ' class="eeff-row-detalle"';
    var tdPad = isTotal || isGranTotal ? 'padding:6px 8px;font-weight:700;' : 'padding:4px 8px;padding-left:24px;';

    html += '<tr' + rowCls + '><td style="' + tdPad + '">' + _escH(concepto) + '</td>';
    for (var ci = 0; ci < ncols; ci++) {
      var entry = maps[ci][concepto];
      var val = entry ? entry.importe : null;
      var cellBg = columns[ci].isActual ? 'background:#F8FAFC;' : '';
      var cellColor = columns[ci].isActual ? '' : 'color:var(--color-text-secondary);';
      var fw = isTotal || isGranTotal ? 'font-weight:700;' : '';
      html += '<td class="numero" style="padding:4px 8px;' + cellBg + cellColor + fw + '">' + _fmtEEFFHtml(val) + '</td>';
    }
    html += '</tr>';
  });

  html += '</tbody></table>';
  body.innerHTML = html;
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
