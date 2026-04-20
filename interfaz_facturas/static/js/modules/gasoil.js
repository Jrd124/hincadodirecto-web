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

  fetch("/api/combustible/transacciones-v2?" + params)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var txns = d.transacciones || [];
      var total = d.total_count || 0;

      if (!txns.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin transacciones</td></tr>';
        document.getElementById("gasoil-tx-paginacion").innerHTML = "";
        return;
      }

      var html = "";
      txns.forEach(function (t) {
        var proyLabel = t.proyecto_id ? '<span style="color:#22c55e;">' + (t.proyecto_id || '') + '</span>' : '<span style="color:#9ca3af;">-</span>';
        var estCorta = (t.estacion_raw || t.estacion_nombre || "").length > 25 ? (t.estacion_raw || t.estacion_nombre || "").substring(0, 25) + "\u2026" : (t.estacion_raw || t.estacion_nombre || "-");

        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:5px 6px;">' + (t.fecha_operacion || '').substring(0, 10) + '</td>' +
          '<td style="padding:5px 6px;">' + (t.fecha_operacion || '').substring(11, 16) + '</td>' +
          '<td style="padding:5px 6px;font-weight:500;">' + (t.matricula_raw || t.vehiculo_matricula || '-') + '</td>' +
          '<td style="padding:5px 6px;" title="' + (t.estacion_raw || '') + '">' + estCorta + '</td>' +
          '<td style="padding:5px 6px;">' + (t.concepto_raw || '') + '</td>' +
          '<td style="padding:5px 6px;text-align:right;">' + (t.litros ? t.litros.toFixed(1) : '-') + '</td>' +
          '<td style="padding:5px 6px;text-align:right;font-weight:500;">' + _gasoilFmtEur(t.importe_final) + '</td>' +
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
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_gasoilEditarEstacion(' + e.id + ')">' +
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
    .catch(function (err) { console.error("Estaciones load error:", err); tbody.innerHTML = '<tr><td colspan="8" style="color:#dc3545;">Error: ' + err.message + '</td></tr>'; });
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
        var alqPill = v.es_alquiler ? ' <span style="background:#FAEEDA;color:#854F0B;font-size:9px;padding:1px 5px;border-radius:999px;">Alquiler</span>' : '';
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_gasoilEditarVehiculo(' + v.id + ')">' +
          '<td style="padding:6px 8px;font-weight:600;">' + (v.matricula || '') + alqPill + '</td>' +
          '<td style="padding:6px 6px;">' + (v.tipo || '-') + '</td>' +
          '<td style="padding:6px 6px;">' + (v.marca || '-') + '</td>' +
          '<td style="padding:6px 6px;">' + (v.modelo || '-') + '</td>' +
          '<td style="padding:6px 6px;">' + (v.notas || '-') + '</td>' +
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

// ═══ Vehicle edit modal ═══════════════════════════════════════════════════

function _gasoilEditarVehiculo(vid) {
  fetch("/api/combustible/vehiculos").then(function(r){return r.json();}).then(function(d) {
    var v = (d.vehiculos||[]).find(function(x){return x.id===vid;});
    if (!v) return;
    var old = document.getElementById("modal-gasoil-edit"); if (old) old.remove();
    var m = document.createElement("div"); m.id = "modal-gasoil-edit";
    m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;display:flex;align-items:center;justify-content:center;";
    m.innerHTML = '<div style="background:#fff;border-radius:12px;width:440px;max-width:95%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,0.15);">' +
      '<h3 style="margin:0 0 14px;">Editar veh\u00edculo ' + v.matricula + '</h3>' +
      '<div style="display:grid;gap:10px;">' +
        '<div><label style="font-size:11px;color:#888;">Tipo</label><select id="gv-tipo" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;"><option value="pickup">Pickup</option><option value="furgoneta">Furgoneta</option><option value="camion">Cami\u00f3n</option><option value="remolque">Remolque</option><option value="turismo">Turismo</option><option value="otro">Otro</option></select></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div><label style="font-size:11px;color:#888;">Marca</label><input id="gv-marca" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div><div><label style="font-size:11px;color:#888;">Modelo</label><input id="gv-modelo" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div></div>' +
        '<div><label style="font-size:11px;color:#888;">Notas</label><input id="gv-notas" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div>' +
        '<label style="display:flex;gap:6px;align-items:center;font-size:12px;"><input type="checkbox" id="gv-alquiler"> Es veh\u00edculo de alquiler</label>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
        '<button onclick="document.getElementById(\'modal-gasoil-edit\').remove()" style="padding:6px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">Cancelar</button>' +
        '<button id="gv-save" style="padding:6px 14px;border:none;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;">Guardar</button></div></div>';
    m.addEventListener("click", function(e) { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
    document.getElementById("gv-tipo").value = v.tipo || "otro";
    document.getElementById("gv-marca").value = v.marca || "";
    document.getElementById("gv-modelo").value = v.modelo || "";
    document.getElementById("gv-notas").value = v.notas || "";
    document.getElementById("gv-alquiler").checked = !!v.es_alquiler;
    document.getElementById("gv-save").addEventListener("click", function() {
      fetch("/api/combustible/vehiculos/" + vid, {
        method: "PUT", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({tipo: document.getElementById("gv-tipo").value, marca: document.getElementById("gv-marca").value, modelo: document.getElementById("gv-modelo").value, notas: document.getElementById("gv-notas").value, es_alquiler: document.getElementById("gv-alquiler").checked})
      }).then(function() { m.remove(); _gasoilCargarVehiculos(); });
    });
  });
}

// ═══ Station edit modal ══════════════════════════════════════════════════

function _gasoilEditarEstacion(eid) {
  fetch("/api/combustible/estaciones").then(function(r){return r.json();}).then(function(d) {
    var e = (d.estaciones||[]).find(function(x){return x.id===eid;});
    if (!e) return;
    var old = document.getElementById("modal-gasoil-edit"); if (old) old.remove();
    var m = document.createElement("div"); m.id = "modal-gasoil-edit";
    m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;display:flex;align-items:center;justify-content:center;";
    var mapHtml = e.latitud ? '<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=' + (e.longitud-0.01) + '%2C' + (e.latitud-0.01) + '%2C' + (e.longitud+0.01) + '%2C' + (e.latitud+0.01) + '&layer=mapnik&marker=' + e.latitud + '%2C' + e.longitud + '" style="width:100%;height:200px;border:1px solid #E5E5E5;border-radius:6px;"></iframe>' : '';
    m.innerHTML = '<div style="background:#fff;border-radius:12px;width:500px;max-width:95%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,0.15);max-height:90vh;overflow-y:auto;">' +
      '<h3 style="margin:0 0 14px;">Editar estaci\u00f3n</h3>' +
      '<div style="display:grid;gap:10px;">' +
        '<div><label style="font-size:11px;color:#888;">Nombre</label><input id="ge-nombre" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<div><label style="font-size:11px;color:#888;">Marca</label><select id="ge-marca" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;"><option value="cepsa">Cepsa</option><option value="moeve">Moeve</option><option value="repsol">Repsol</option><option value="galp">Galp</option><option value="">Otra</option></select></div>' +
          '<div><label style="font-size:11px;color:#888;">Pa\u00eds</label><select id="ge-pais" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;"><option value="ES">Espa\u00f1a</option><option value="PT">Portugal</option></select></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<div><label style="font-size:11px;color:#888;">Municipio</label><input id="ge-municipio" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div>' +
          '<div><label style="font-size:11px;color:#888;">Provincia</label><input id="ge-provincia" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<div><label style="font-size:11px;color:#888;">Latitud</label><input id="ge-lat" type="number" step="0.000001" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div>' +
          '<div><label style="font-size:11px;color:#888;">Longitud</label><input id="ge-lon" type="number" step="0.000001" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div></div>' +
        '<a href="https://www.google.com/maps/search/' + encodeURIComponent((e.nombre||'') + ' ' + (e.municipio||'') + ' ' + (e.provincia||'')) + '" target="_blank" style="font-size:12px;color:#2563eb;">\uD83D\uDD17 Abrir en Google Maps</a>' +
        mapHtml +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
        '<button onclick="document.getElementById(\'modal-gasoil-edit\').remove()" style="padding:6px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">Cancelar</button>' +
        '<button id="ge-save" style="padding:6px 14px;border:none;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;">Guardar</button></div></div>';
    m.addEventListener("click", function(ev) { if (ev.target === m) m.remove(); });
    document.body.appendChild(m);
    document.getElementById("ge-nombre").value = e.nombre || "";
    document.getElementById("ge-marca").value = e.marca || "";
    document.getElementById("ge-pais").value = e.pais || "ES";
    document.getElementById("ge-municipio").value = e.municipio || "";
    document.getElementById("ge-provincia").value = e.provincia || "";
    document.getElementById("ge-lat").value = e.latitud || "";
    document.getElementById("ge-lon").value = e.longitud || "";
    document.getElementById("ge-save").addEventListener("click", function() {
      fetch("/api/combustible/estaciones/" + eid, {
        method: "PUT", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({nombre: document.getElementById("ge-nombre").value, marca: document.getElementById("ge-marca").value, pais: document.getElementById("ge-pais").value, municipio: document.getElementById("ge-municipio").value, provincia: document.getElementById("ge-provincia").value, latitud: document.getElementById("ge-lat").value || null, longitud: document.getElementById("ge-lon").value || null})
      }).then(function() { m.remove(); _gasoilCargarEstaciones(); });
    });
  });
}

// ═══ Expose ═══════════════════════════════════════════════════════════════════

window._gasoilOnPanelShow = _gasoilOnPanelShow;
window._gasoilImportarMoeve = _gasoilImportarMoeve;
window._gasoilImportarSolred = _gasoilImportarSolred;
window._gasoilEditarVehiculo = _gasoilEditarVehiculo;
window._gasoilEditarEstacion = _gasoilEditarEstacion;
window._gasoilFiltrar = _gasoilFiltrar;
window._gasoilPagNext = _gasoilPagNext;
window._gasoilPagPrev = _gasoilPagPrev;
window._gasoilGeocodificar = _gasoilGeocodificar;
window._gasoilCargarEstaciones = _gasoilCargarEstaciones;
window._gasoilCargarVehiculos = _gasoilCargarVehiculos;
