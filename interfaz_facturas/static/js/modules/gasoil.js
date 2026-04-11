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
    fetch("/api/moeve/vehiculos")
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
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Cargando...</td></tr>';

  fetch("/api/moeve/estaciones")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var ests = d.estaciones || [];
      if (!ests.length) { tbody.innerHTML = '<tr><td colspan="6">Sin estaciones</td></tr>'; return; }
      var html = "";
      ests.forEach(function (e) {
        var geo = e.latitud ? '<span style="color:#22c55e;font-weight:600;">OK</span>' : '<span style="color:#ef4444;">Pendiente</span>';
        var coords = e.latitud ? e.latitud.toFixed(4) + ", " + e.longitud.toFixed(4) : "-";
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:6px 8px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (e.estacion || '') + '">' + (e.estacion || '') + '</td>' +
          '<td style="padding:6px 6px;">' + (e.localidad_extraida || '-') + '</td>' +
          '<td style="padding:6px 6px;font-size:0.78rem;">' + coords + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + (e.frecuencia || 0) + '</td>' +
          '<td style="padding:6px 6px;">' + (e.ultimo_uso || '-') + '</td>' +
          '<td style="padding:6px 6px;">' + geo + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function () { tbody.innerHTML = '<tr><td colspan="6" style="color:#dc3545;">Error</td></tr>'; });
}

function _gasoilGeocodificar() {
  if (!confirm("Geocodificar estaciones pendientes? Puede tardar varios minutos (1 seg por estaci\u00f3n).")) return;
  fetch("/api/moeve/geocodificar", { method: "POST" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) { alert("Error: " + d.error); return; }
      alert("Geocodificaci\u00f3n: " + d.ok + " OK, " + d.fail + " fallidas de " + d.total + " pendientes");
      _gasoilCargarEstaciones();
    })
    .catch(function (e) { alert("Error: " + e.message); });
}

// ═══ Vehículos ══════════════════════════════════════════════════════════════

function _gasoilCargarVehiculos() {
  var tbody = document.getElementById("gasoil-tbody-vehiculos-detail");
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">Cargando...</td></tr>';

  fetch("/api/moeve/vehiculos")
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

// ═══ Expose ��════════════════════════════════════════════════════════════════

window._gasoilOnPanelShow = _gasoilOnPanelShow;
window._gasoilFiltrar = _gasoilFiltrar;
window._gasoilPagNext = _gasoilPagNext;
window._gasoilPagPrev = _gasoilPagPrev;
window._gasoilGeocodificar = _gasoilGeocodificar;
window._gasoilCargarEstaciones = _gasoilCargarEstaciones;
window._gasoilCargarVehiculos = _gasoilCargarVehiculos;
