// ═══ GASOIL / MOEVE — Gestión de combustible ════════════════════════════════

var _gasoilDashLoaded = false;
var _gasoilTxInit = false;
var _gasoilTxOffset = 0;
var _gasoilTxLimit = 200;

function _gasoilOnPanelShow(panel) {
  if (panel === "inicio") _gasoilCargarDashboard();
  else if (panel === "transacciones") _gasoilInitTx();
  else if (panel === "estaciones") _gasoilCargarEstaciones();
  else if (panel === "vehiculos") _gasoilCargarVehiculos();
}

function _gasoilFmtEur(n) {
  if (n == null) return "--";
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20ac";
}

function _gasoilFmtNum(n) {
  if (n == null) return "--";
  return n.toLocaleString("es-ES", { maximumFractionDigits: 1 });
}

// ═══ Dashboard ═══════════════════════════════════════════════════════════════

function _gasoilCargarDashboard() {
  // Check for archived legacy data
  fetch("/api/combustible/archivo-legacy").then(function(r){return r.json();}).then(function(d) {
    var el = document.getElementById("gasoil-archivo-aviso");
    if (el && d.count > 0) { el.style.display = ""; document.getElementById("gasoil-archivo-count").textContent = d.count; }
  }).catch(function(){});

  fetch("/api/moeve/resumen")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      document.getElementById("gasoil-kpi-total").textContent = _gasoilFmtEur(d.total_importe);
      document.getElementById("gasoil-kpi-litros").textContent = _gasoilFmtNum(d.total_litros);
      document.getElementById("gasoil-kpi-txns").textContent = d.total_transacciones;
      document.getElementById("gasoil-kpi-pct").textContent = d.pct_imputado + "%";
      document.getElementById("gasoil-kpi-geo").textContent = d.estaciones_geo + " / " + d.estaciones_total;

      // Monthly table
      var tbody = document.getElementById("gasoil-tbody-mensual");
      if (!d.mensual || !d.mensual.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Sin datos</td></tr>';
      } else {
        var html = "";
        d.mensual.forEach(function (m) {
          html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
            '<td style="padding:6px 8px;font-weight:500;">' + m.mes + '</td>' +
            '<td style="padding:6px 6px;text-align:right;">' + _gasoilFmtEur(m.diesel) + '</td>' +
            '<td style="padding:6px 6px;text-align:right;">' + _gasoilFmtEur(m.gasolina) + '</td>' +
            '<td style="padding:6px 6px;text-align:right;">' + _gasoilFmtEur(m.peajes) + '</td>' +
            '<td style="padding:6px 6px;text-align:right;">' + _gasoilFmtEur(m.otros) + '</td>' +
            '<td style="padding:6px 6px;text-align:right;font-weight:600;">' + _gasoilFmtEur(m.total) + '</td>' +
            '</tr>';
        });
        tbody.innerHTML = html;
      }

      // Vehicles table
      var vbody = document.getElementById("gasoil-tbody-vehiculos");
      if (!d.por_vehiculo || !d.por_vehiculo.length) {
        vbody.innerHTML = '<tr><td colspan="5">Sin datos</td></tr>';
      } else {
        var html2 = "";
        d.por_vehiculo.forEach(function (v) {
          html2 += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
            '<td style="padding:6px 8px;font-weight:600;">' + v.matricula + '</td>' +
            '<td style="padding:6px 6px;">-</td>' +
            '<td style="padding:6px 6px;text-align:right;">' + _gasoilFmtEur(v.total) + '</td>' +
            '<td style="padding:6px 6px;text-align:right;">' + _gasoilFmtNum(v.litros) + '</td>' +
            '<td style="padding:6px 6px;text-align:right;">' + (v.ultimo || '-') + '</td>' +
            '</tr>';
        });
        vbody.innerHTML = html2;
      }
    })
    .catch(function () {});
  _gasoilDashLoaded = true;
}

// ═══ Transacciones ═══════════════════════════════════════════════════════════

function _gasoilInitTx() {
  if (!_gasoilTxInit) {
    _gasoilTxInit = true;
    // Set default dates: last 3 months
    var hoy = new Date();
    var hace3m = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);
    document.getElementById("gasoil-tx-desde").value = hace3m.toISOString().slice(0, 10);
    document.getElementById("gasoil-tx-hasta").value = hoy.toISOString().slice(0, 10);

    // Load matriculas for filter
    fetch("/api/combustible/vehiculos")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var sel = document.getElementById("gasoil-tx-matricula");
        (d.vehiculos || []).forEach(function (v) {
          sel.innerHTML += '<option value="' + v.matricula + '">' + v.matricula + '</option>';
        });
      });

    // Import handler
    document.getElementById("gasoil-import-file").addEventListener("change", function () {
      if (!this.files.length) return;
      var fd = new FormData();
      fd.append("archivo", this.files[0]);
      fetch("/api/moeve/importar", { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { alert("Error: " + d.error); return; }
          alert("Importaci\u00f3n: " + d.insertados + " registros, " + d.pares_neteados + " descuentos neteados, " + d.vehiculos_creados + " veh\u00edculos, " + d.estaciones_creadas + " estaciones");
          _gasoilFiltrar();
        })
        .catch(function (e) { alert("Error: " + e.message); });
      this.value = "";
    });

    _gasoilFiltrar();
  }
}

function _gasoilFiltrar() {
  _gasoilTxOffset = 0;
  _gasoilCargarTx();
}

function _gasoilCargarTx() {
  var desde = document.getElementById("gasoil-tx-desde").value;
  var hasta = document.getElementById("gasoil-tx-hasta").value;
  var matricula = document.getElementById("gasoil-tx-matricula").value;
  var estado = document.getElementById("gasoil-tx-estado").value;

  var params = "desde=" + desde + "&hasta=" + hasta + "&limit=" + _gasoilTxLimit + "&offset=" + _gasoilTxOffset;
  if (matricula) params += "&matricula=" + matricula;
  if (estado === "1") params += "&sin_asignar=1";

  var tbody = document.getElementById("gasoil-tbody-txns");
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Cargando...</td></tr>';

  fetch("/api/moeve/transacciones?" + params)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var txns = d.transacciones || [];
      var total = d.total || 0;

      if (!txns.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin transacciones</td></tr>';
        document.getElementById("gasoil-tx-paginacion").innerHTML = "";
        return;
      }

      var html = "";
      txns.forEach(function (t) {
        var confColor = t.imputacion_confianza === "alta" ? "#22c55e" : t.imputacion_confianza === "media" ? "#f59e0b" : "#ef4444";
        var proyLabel = t.proyecto_nombre ? '<span style="color:' + confColor + ';" title="' + (t.imputacion_notas || '') + '">' + (t.proyecto_codigo || '') + '</span>' : '<span style="color:#9ca3af;">-</span>';
        var estCorta = (t.estacion || "").length > 25 ? (t.estacion || "").substring(0, 25) + "\u2026" : (t.estacion || "-");

        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:5px 6px;">' + (t.fecha || '') + '</td>' +
          '<td style="padding:5px 6px;">' + (t.hora || '').substring(0, 5) + '</td>' +
          '<td style="padding:5px 6px;font-weight:500;">' + (t.matricula || '-') + '</td>' +
          '<td style="padding:5px 6px;" title="' + (t.estacion || '') + '">' + estCorta + '</td>' +
          '<td style="padding:5px 6px;">' + (t.concepto || '') + '</td>' +
          '<td style="padding:5px 6px;text-align:right;">' + (t.litros ? t.litros.toFixed(1) : '-') + '</td>' +
          '<td style="padding:5px 6px;text-align:right;font-weight:500;">' + _gasoilFmtEur(t.importe) + '</td>' +
          '<td style="padding:5px 6px;">' + proyLabel + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;

      // Paginación
      var pagDiv = document.getElementById("gasoil-tx-paginacion");
      var desde_n = _gasoilTxOffset + 1;
      var hasta_n = Math.min(_gasoilTxOffset + txns.length, total);
      pagDiv.innerHTML = '<span>' + desde_n + '-' + hasta_n + ' de ' + total + '</span>' +
        '<div style="display:flex;gap:6px;">' +
        (_gasoilTxOffset > 0 ? '<button class="btn-small" onclick="_gasoilPagPrev()">Anterior</button>' : '') +
        (_gasoilTxOffset + _gasoilTxLimit < total ? '<button class="btn-small" onclick="_gasoilPagNext()">Siguiente</button>' : '') +
        '</div>';
    })
    .catch(function () { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#dc3545;">Error al cargar</td></tr>'; });
}

function _gasoilPagNext() { _gasoilTxOffset += _gasoilTxLimit; _gasoilCargarTx(); }
function _gasoilPagPrev() { _gasoilTxOffset = Math.max(0, _gasoilTxOffset - _gasoilTxLimit); _gasoilCargarTx(); }

// ═══ Estaciones ═════════════════════════════════════════════════════════════

function _gasoilCargarEstaciones() {
  var tbody = document.getElementById("gasoil-tbody-estaciones");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Cargando...</td></tr>';

  fetch("/api/combustible/estaciones")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var ests = d.estaciones || [];
      var pendientes = d.pendientes_geo || 0;
      // Update geocode button
      var geoBtn = document.getElementById("gasoil-btn-geocodificar");
      if (geoBtn) geoBtn.textContent = "\uD83C\uDF0D Geocodificar pendientes (" + pendientes + ")";
      if (!ests.length) { tbody.innerHTML = '<tr><td colspan="8">Sin estaciones</td></tr>'; return; }
      var html = "";
      ests.forEach(function (e) {
        var geoIcon = e.geocoded === 1 ? '\u2705' : (e.geocoded === 2 ? '\u274c' : '\u23f3');
        var coords = e.latitud ? e.latitud.toFixed(4) + ", " + e.longitud.toFixed(4) : "\u2014";
        var pais = e.pais === "PT" ? "\uD83C\uDDF5\uD83C\uDDF9" : "\uD83C\uDDEA\uD83C\uDDF8";
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:6px 8px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (e.nombre||'') + '">' + (e.nombre || '') + '</td>' +
          '<td style="padding:6px 4px;font-size:0.78rem;">' + (e.marca || '\u2014') + '</td>' +
          '<td style="padding:6px 4px;text-align:center;">' + pais + '</td>' +
          '<td style="padding:6px 4px;font-size:0.78rem;">' + (e.municipio || '\u2014') + '</td>' +
          '<td style="padding:6px 4px;font-size:0.78rem;">' + (e.provincia || '\u2014') + '</td>' +
          '<td style="padding:6px 4px;font-size:0.78rem;">' + coords + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + (e.transacciones || 0) + '</td>' +
          '<td style="padding:6px 4px;text-align:center;">' + geoIcon + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function () { tbody.innerHTML = '<tr><td colspan="8" style="color:#dc3545;">Error</td></tr>'; });
}

function _gasoilGeocodificar() {
  var status = document.getElementById("gasoil-geo-status");
  if (status) { status.style.display = ""; status.textContent = "\u23f3 Geocodificando lote..."; }
  var retries = 0;
  function _lote() {
    fetch("/api/combustible/geocodificar-estaciones?limit=10", { method: "POST" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        retries = 0;
        if (d.error) { if (status) status.textContent = "\u274c " + d.error; return; }
        if (status) status.textContent = "\u2705 Lote: " + d.geocoded + " OK, " + d.fallidas + " fallidas. " + d.restantes + " restantes.";
        _gasoilCargarEstaciones();
        if (d.restantes > 0) {
          setTimeout(_lote, 3000);
        } else {
          if (status) status.textContent = "\u2705 Geocodificaci\u00f3n completa.";
        }
      })
      .catch(function (e) {
        retries++;
        if (retries <= 2) {
          if (status) status.textContent = "\u26a0 Error en lote, reintentando en 5s... (" + e.message + ")";
          setTimeout(_lote, 5000);
        } else {
          if (status) status.textContent = "\u274c Error tras 3 intentos: " + e.message;
        }
      });
  }
  _lote();
}

// ═══ Vehículos ══════════════════════════════════════════════════════════════

function _gasoilCargarVehiculos() {
  var tbody = document.getElementById("gasoil-tbody-vehiculos-detail");
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">Cargando...</td></tr>';

  fetch("/api/combustible/vehiculos")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var vehs = d.vehiculos || [];
      if (!vehs.length) { tbody.innerHTML = '<tr><td colspan="7">Sin veh\u00edculos</td></tr>'; return; }
      var html = "";
      vehs.forEach(function (v) {
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:6px 8px;font-weight:600;">' + (v.matricula || '') + '</td>' +
          '<td style="padding:6px 6px;">' + (v.tipo || '-') + '</td>' +
          '<td style="padding:6px 6px;">' + (v.descripcion || '-') + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _gasoilFmtEur(v.gasto_total) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _gasoilFmtNum(v.litros_total) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + (v.num_transacciones || 0) + '</td>' +
          '<td style="padding:6px 6px;">' + (v.ultimo_uso || '-') + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function () { tbody.innerHTML = '<tr><td colspan="7" style="color:#dc3545;">Error</td></tr>'; });
}

// ═══ Import Moeve XLSX ═══════════════════════════════════════════════════════

function _gasoilImportarMoeve(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var status = document.getElementById("gasoil-import-status");
  status.style.display = "";
  status.style.background = "#EFF6FF";
  status.style.color = "#1E40AF";
  status.textContent = "\u23f3 Importando " + file.name + "...";

  var fd = new FormData();
  fd.append("file", file);
  fetch("/api/combustible/importar-moeve", { method: "POST", body: fd })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) {
        status.style.background = "#FEF2F2"; status.style.color = "#dc2626";
        status.textContent = "\u274c Error: " + d.error;
      } else {
        status.style.background = "#F0FDF4"; status.style.color = "#166534";
        status.textContent = "\u2705 " + d.creados + " transacciones creadas, " + d.duplicados + " duplicadas, " + d.errores + " errores. " +
          (d.vehiculos_nuevos.length ? d.vehiculos_nuevos.length + " veh\u00edculos nuevos. " : "") +
          (d.estaciones_nuevas.length ? d.estaciones_nuevas.length + " estaciones nuevas." : "");
        _gasoilCargarDashboard(); // Refresh
      }
      input.value = ""; // Reset file input
    })
    .catch(function(err) {
      status.style.background = "#FEF2F2"; status.style.color = "#dc2626";
      status.textContent = "\u274c Error: " + err.message;
      input.value = "";
    });
}

function _gasoilImportarSolred(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var status = document.getElementById("gasoil-import-status");
  status.style.display = "";
  status.style.background = "#EFF6FF";
  status.style.color = "#1E40AF";
  status.textContent = "\u23f3 Importando Solred " + file.name + "...";
  var fd = new FormData();
  fd.append("file", file);
  fetch("/api/combustible/importar-solred", { method: "POST", body: fd })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) {
        status.style.background = "#FEF2F2"; status.style.color = "#dc2626";
        status.textContent = "\u274c Error: " + d.error;
      } else {
        status.style.background = "#F0FDF4"; status.style.color = "#166534";
        status.textContent = "\u2705 Solred: " + d.creados + " creadas, " + d.duplicados + " duplicadas, " + d.errores + " errores." +
          (d.estaciones_nuevas && d.estaciones_nuevas.length ? " " + d.estaciones_nuevas.length + " estaciones nuevas." : "");
        _gasoilCargarDashboard();
      }
      input.value = "";
    })
    .catch(function(err) {
      status.style.background = "#FEF2F2"; status.style.color = "#dc2626";
      status.textContent = "\u274c Error: " + err.message;
      input.value = "";
    });
}

// ═══ Expose ═══════════════════════════════════════════════════════════════════

window._gasoilOnPanelShow = _gasoilOnPanelShow;
window._gasoilImportarMoeve = _gasoilImportarMoeve;
window._gasoilImportarSolred = _gasoilImportarSolred;
window._gasoilFiltrar = _gasoilFiltrar;
window._gasoilPagNext = _gasoilPagNext;
window._gasoilPagPrev = _gasoilPagPrev;
window._gasoilGeocodificar = _gasoilGeocodificar;
window._gasoilCargarEstaciones = _gasoilCargarEstaciones;
window._gasoilCargarVehiculos = _gasoilCargarVehiculos;
