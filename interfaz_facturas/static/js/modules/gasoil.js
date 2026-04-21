// ═══ GASOIL / MOEVE — Gestión de combustible ════════════════════════════════

var _gasoilDashLoaded = false;
var _gasoilTxInit = false;
var _gasoilTxOffset = 0;
var _gasoilTxLimit = 200;
var _gasoilTabActivo = "dashboard";

function _gasoilOnPanelShow(panel) {
  // Called when Operaciones > Gasoil is activated
  _gasoilCambiarTab(panel || "dashboard");
}

function _gasoilFmtEur(n) {
  if (n == null) return "--";
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20ac";
}

function _gasoilFmtNum(n) {
  if (n == null) return "--";
  return n.toLocaleString("es-ES", { maximumFractionDigits: 1 });
}

// ═══ Tab system ═════════════════════════════════════════════════════════════

function _gasoilCambiarTab(tab) {
  _gasoilTabActivo = tab;
  // Update pill active states
  var pills = document.querySelectorAll(".gasoil-tab-pill");
  pills.forEach(function(p) {
    p.classList.toggle("active", p.getAttribute("data-gasoil-tab") === tab);
  });
  // Inject HTML for the tab
  var container = document.getElementById("gasoil-tab-content");
  if (!container) return;

  if (tab === "dashboard") {
    container.innerHTML = _gasoilHtmlDashboard();
    _gasoilCargarDashboard();
  } else if (tab === "transacciones") {
    container.innerHTML = _gasoilHtmlTransacciones();
    _gasoilTxInit = false; // re-init filters each time
    _gasoilInitTx();
  } else if (tab === "estaciones") {
    container.innerHTML = _gasoilHtmlEstaciones();
    _gasoilCargarEstaciones();
  } else if (tab === "vehiculos") {
    container.innerHTML = _gasoilHtmlVehiculos();
    _gasoilCargarVehiculos();
  } else if (tab === "imputacion") {
    container.innerHTML = _gasoilHtmlImputacion();
  }
}

// ═══ Tab HTML generators ════════════════════════════════════════════════════

function _gasoilHtmlDashboard() {
  return '<div id="gasoil-archivo-aviso" style="padding:10px 14px;background:#FFFBEB;border-radius:8px;font-size:12px;color:#854F0B;display:none;margin-bottom:12px;">' +
    '\uD83D\uDCC1 <span id="gasoil-archivo-count">0</span> registros del sistema antiguo archivados.</div>' +
    '<div id="gasoil-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:16px;">' +
      '<div class="tes-card tes-card-blue"><span class="tes-label">Total gastado</span><span class="tes-valor" id="gasoil-kpi-total">--</span></div>' +
      '<div class="tes-card"><span class="tes-label">Litros totales</span><span class="tes-valor" id="gasoil-kpi-litros">--</span></div>' +
      '<div class="tes-card"><span class="tes-label">Transacciones</span><span class="tes-valor" id="gasoil-kpi-txns">--</span></div>' +
      '<div class="tes-card tes-card-green"><span class="tes-label">% Imputado</span><span class="tes-valor" id="gasoil-kpi-pct">--</span></div>' +
      '<div class="tes-card"><span class="tes-label">Estaciones geo</span><span class="tes-valor" id="gasoil-kpi-geo">--</span></div>' +
    '</div>' +
    '<h4 style="margin:0 0 8px;font-size:0.95rem;font-weight:700;">Gasto mensual por tipo</h4>' +
    '<div class="card" style="overflow-x:auto;padding:0;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">' +
        '<thead><tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;">' +
          '<th style="padding:7px 8px;font-weight:700;">Mes</th>' +
          '<th style="padding:7px 6px;font-weight:700;text-align:right;">Diesel</th>' +
          '<th style="padding:7px 6px;font-weight:700;text-align:right;">Gasolina</th>' +
          '<th style="padding:7px 6px;font-weight:700;text-align:right;">Peajes</th>' +
          '<th style="padding:7px 6px;font-weight:700;text-align:right;">Otros</th>' +
          '<th style="padding:7px 6px;font-weight:700;text-align:right;">Total</th>' +
        '</tr></thead>' +
        '<tbody id="gasoil-tbody-mensual"><tr><td colspan="6" style="text-align:center;padding:2rem;">Cargando...</td></tr></tbody>' +
      '</table></div>' +
    '<h4 style="margin:16px 0 8px;font-size:0.95rem;font-weight:700;">Desglose por veh\u00edculo</h4>' +
    '<div class="card" style="overflow-x:auto;padding:0;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">' +
        '<thead><tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;">' +
          '<th style="padding:7px 8px;font-weight:700;">Matr\u00edcula</th>' +
          '<th style="padding:7px 6px;font-weight:700;">Tipo</th>' +
          '<th style="padding:7px 6px;font-weight:700;text-align:right;">Gasto total</th>' +
          '<th style="padding:7px 6px;font-weight:700;text-align:right;">Litros</th>' +
          '<th style="padding:7px 6px;font-weight:700;text-align:right;">\u00daltimo uso</th>' +
        '</tr></thead>' +
        '<tbody id="gasoil-tbody-vehiculos"><tr><td colspan="5" style="text-align:center;padding:2rem;">Cargando...</td></tr></tbody>' +
      '</table></div>';
}

function _gasoilHtmlTransacciones() {
  return '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:14px;margin-bottom:12px;">' +
    '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">' +
      '<div><div style="font-size:10px;color:#888780;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Desde</div><input type="date" id="gasoil-tx-desde" style="padding:6px 8px;border:0.5px solid #E5E5E5;border-radius:6px;font-size:13px;"></div>' +
      '<div><div style="font-size:10px;color:#888780;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Hasta</div><input type="date" id="gasoil-tx-hasta" style="padding:6px 8px;border:0.5px solid #E5E5E5;border-radius:6px;font-size:13px;"></div>' +
      '<div><div style="font-size:10px;color:#888780;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Proveedor</div><select id="gasoil-tx-proveedor" style="padding:6px 8px;border:0.5px solid #E5E5E5;border-radius:6px;font-size:13px;"><option value="">Todos</option><option value="moeve">Moeve</option><option value="solred">Solred</option></select></div>' +
      '<div><div style="font-size:10px;color:#888780;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Tipo</div><select id="gasoil-tx-tipo" style="padding:6px 8px;border:0.5px solid #E5E5E5;border-radius:6px;font-size:13px;"><option value="">Todos</option><option value="diesel">Diesel</option><option value="gasolina">Gasolina</option><option value="adblue">AdBlue</option><option value="peaje">Peaje</option><option value="otros">Otros</option></select></div>' +
      '<div><div style="font-size:10px;color:#888780;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Veh\u00edculo</div><select id="gasoil-tx-matricula" style="padding:6px 8px;border:0.5px solid #E5E5E5;border-radius:6px;font-size:13px;"><option value="">Todos</option></select></div>' +
      '<button onclick="_gasoilFiltrar()" style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Aplicar</button>' +
      '<button onclick="document.getElementById(\'gasoil-tx-proveedor\').value=\'\';document.getElementById(\'gasoil-tx-tipo\').value=\'\';document.getElementById(\'gasoil-tx-matricula\').value=\'\';_gasoilFiltrar()" style="padding:6px 14px;background:#fff;color:#666;border:0.5px solid #ccc;border-radius:6px;font-size:13px;cursor:pointer;">Limpiar</button>' +
    '</div></div>' +
    '<div id="gasoil-tx-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px;"></div>' +
    '<div class="card" style="overflow-x:auto;padding:0;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;">' +
        '<thead><tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;">' +
          '<th style="padding:6px 6px;font-weight:700;">Fecha</th>' +
          '<th style="padding:6px 6px;font-weight:700;">Hora</th>' +
          '<th style="padding:6px 6px;font-weight:700;">Matr\u00edcula</th>' +
          '<th style="padding:6px 6px;font-weight:700;">Estaci\u00f3n</th>' +
          '<th style="padding:6px 6px;font-weight:700;">Concepto</th>' +
          '<th style="padding:6px 6px;font-weight:700;text-align:right;">Litros</th>' +
          '<th style="padding:6px 6px;font-weight:700;text-align:right;">Importe</th>' +
          '<th style="padding:6px 6px;font-weight:700;">Proyecto</th>' +
        '</tr></thead>' +
        '<tbody id="gasoil-tbody-txns"><tr><td colspan="8" style="text-align:center;padding:2rem;">Usa los filtros para ver transacciones</td></tr></tbody>' +
      '</table></div>' +
    '<div id="gasoil-tx-paginacion" style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:0.85rem;"></div>';
}

function _gasoilHtmlEstaciones() {
  return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
    '<h4 style="margin:0;font-size:0.95rem;font-weight:700;">Estaciones de servicio</h4>' +
    '<div style="display:flex;gap:8px;align-items:center;">' +
      '<span id="gasoil-geo-status" style="font-size:12px;color:#666;display:none;"></span>' +
      '<button id="gasoil-btn-geocodificar" onclick="_gasoilGeocodificar()" class="btn-small" style="background:#DCFCE7;color:#166534;border:1px solid #86EFAC;">\uD83C\uDF0D Geocodificar pendientes</button>' +
      '<button onclick="_gasoilGeoCompleto()" class="btn-small" style="background:#EFF6FF;color:#1E40AF;border:1px solid #93C5FD;">\uD83D\uDD04 Geocodificaci\u00f3n completa</button>' +
    '</div></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">' +
      '<input id="filtro-estacion-busqueda" type="text" placeholder="Buscar nombre..." oninput="_gasoilFiltrarEstaciones()" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:0.8rem;width:160px;">' +
      '<select id="filtro-estacion-marca" onchange="_gasoilFiltrarEstaciones()" style="padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:0.8rem;"><option value="">Marca</option></select>' +
      '<select id="filtro-estacion-municipio" onchange="_gasoilFiltrarEstaciones()" style="padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:0.8rem;"><option value="">Municipio</option></select>' +
      '<select id="filtro-estacion-ccaa" onchange="_gasoilFiltrarEstaciones()" style="padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:0.8rem;"><option value="">CCAA</option></select>' +
      '<select id="filtro-estacion-pais" onchange="_gasoilFiltrarEstaciones()" style="padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:0.8rem;"><option value="">Pa\u00eds</option><option value="ES">\uD83C\uDDEA\uD83C\uDDF8 Espa\u00f1a</option><option value="PT">\uD83C\uDDF5\uD83C\uDDF9 Portugal</option></select>' +
      '<select id="filtro-estacion-geo" onchange="_gasoilFiltrarEstaciones()" style="padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:0.8rem;"><option value="">Estado Geo</option><option value="1">\u2705 Geocodificada</option><option value="0">\u23F3 Pendiente</option><option value="2">\u274C Fallida</option></select>' +
    '</div>' +
    '<div class="card" style="overflow-x:auto;padding:0;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">' +
        '<thead><tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;">' +
          '<th style="padding:7px 8px;font-weight:700;">Nombre</th>' +
          '<th style="padding:7px 4px;font-weight:700;">Marca</th>' +
          '<th style="padding:7px 4px;font-weight:700;text-align:center;">Pa\u00eds</th>' +
          '<th style="padding:7px 4px;font-weight:700;">Municipio</th>' +
          '<th style="padding:7px 4px;font-weight:700;">CCAA</th>' +
          '<th style="padding:7px 4px;font-weight:700;">Coordenadas</th>' +
          '<th style="padding:7px 4px;font-weight:700;text-align:right;">Transacc.</th>' +
          '<th style="padding:7px 4px;font-weight:700;text-align:center;">Geo</th>' +
        '</tr></thead>' +
        '<tbody id="gasoil-tbody-estaciones"><tr><td colspan="8" style="text-align:center;padding:2rem;">Cargando...</td></tr></tbody>' +
      '</table></div>';
}

function _gasoilHtmlVehiculos() {
  return '<h4 style="margin:0 0 12px;font-size:0.95rem;font-weight:700;">Veh\u00edculos</h4>' +
    '<div class="card" style="overflow-x:auto;padding:0;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">' +
        '<thead><tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;">' +
          '<th style="padding:7px 8px;font-weight:700;">Matr\u00edcula</th>' +
          '<th style="padding:7px 6px;font-weight:700;">Tipo</th>' +
          '<th style="padding:7px 6px;font-weight:700;">Marca</th>' +
          '<th style="padding:7px 6px;font-weight:700;">Modelo</th>' +
          '<th style="padding:7px 6px;font-weight:700;">Notas</th>' +
        '</tr></thead>' +
        '<tbody id="gasoil-tbody-vehiculos-detail"><tr><td colspan="5" style="text-align:center;padding:2rem;">Cargando...</td></tr></tbody>' +
      '</table></div>';
}

function _gasoilHtmlImputacion() {
  return '<div style="padding:40px;text-align:center;background:#F5F7FA;border-radius:12px;border:1px dashed #D3D1C7;">' +
    '<div style="font-size:48px;margin-bottom:12px;">\uD83D\uDCCD</div>' +
    '<h3 style="margin:0 0 8px;">Imputaci\u00f3n a proyectos</h3>' +
    '<p style="color:#888780;max-width:500px;margin:0 auto;">Sistema de auto-imputaci\u00f3n con validaci\u00f3n. Las transacciones se asignar\u00e1n autom\u00e1ticamente al proyecto m\u00e1s probable (por matr\u00edcula del veh\u00edculo asignado ese d\u00eda, o por geolocalizaci\u00f3n estaci\u00f3n \u2194 proyecto), y t\u00fa confirmar\u00e1s o cambiar\u00e1s las propuestas.</p>' +
    '<div style="margin-top:16px;"><span style="background:#FAEEDA;color:#854F0B;padding:4px 12px;border-radius:999px;font-size:12px;">\uD83D\uDEA7 Pr\u00f3ximamente</span></div>' +
  '</div>';
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
      var el;
      el = document.getElementById("gasoil-kpi-total"); if (el) el.textContent = _gasoilFmtEur(d.total_importe);
      el = document.getElementById("gasoil-kpi-litros"); if (el) el.textContent = _gasoilFmtNum(d.total_litros);
      el = document.getElementById("gasoil-kpi-txns"); if (el) el.textContent = d.total_transacciones;
      el = document.getElementById("gasoil-kpi-pct"); if (el) el.textContent = d.pct_imputado + "%";
      el = document.getElementById("gasoil-kpi-geo"); if (el) el.textContent = d.estaciones_geo + " / " + d.estaciones_total;

      // Monthly table
      var tbody = document.getElementById("gasoil-tbody-mensual");
      if (tbody) {
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
      }

      // Vehicles table
      var vbody = document.getElementById("gasoil-tbody-vehiculos");
      if (vbody) {
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
      }
    })
    .catch(function () {});
  _gasoilDashLoaded = true;
}

// ═══ Transacciones ═══════════════════════════════════════════════════════════

function _gasoilInitTx() {
  _gasoilTxInit = true;
  // Set default dates: last 3 months
  var hoy = new Date();
  var hace3m = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);
  var desdeEl = document.getElementById("gasoil-tx-desde");
  var hastaEl = document.getElementById("gasoil-tx-hasta");
  if (desdeEl) desdeEl.value = hace3m.toISOString().slice(0, 10);
  if (hastaEl) hastaEl.value = hoy.toISOString().slice(0, 10);

  // Load matriculas for filter
  fetch("/api/combustible/vehiculos")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var sel = document.getElementById("gasoil-tx-matricula");
      if (sel) {
        (d.vehiculos || []).forEach(function (v) {
          sel.innerHTML += '<option value="' + v.matricula + '">' + v.matricula + '</option>';
        });
      }
    });

  _gasoilFiltrar();
}

function _gasoilFiltrar() {
  _gasoilTxOffset = 0;
  _gasoilCargarTx();
}

function _gasoilCargarTx() {
  var desde = (document.getElementById("gasoil-tx-desde") || {}).value || "";
  var hasta = (document.getElementById("gasoil-tx-hasta") || {}).value || "";
  var proveedor = (document.getElementById("gasoil-tx-proveedor") || {}).value || "";
  var tipo = (document.getElementById("gasoil-tx-tipo") || {}).value || "";
  var matricula = (document.getElementById("gasoil-tx-matricula") || {}).value || "";

  var params = "limit=" + _gasoilTxLimit + "&offset=" + _gasoilTxOffset;
  if (desde) params += "&desde=" + desde;
  if (hasta) params += "&hasta=" + hasta;
  if (proveedor) params += "&proveedor=" + proveedor;
  if (tipo) params += "&tipo_producto=" + tipo;
  if (matricula) params += "&vehiculo_id=" + matricula;

  var tbody = document.getElementById("gasoil-tbody-txns");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Cargando...</td></tr>';

  fetch("/api/combustible/transacciones-v2?" + params)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var txns = d.transacciones || [];
      var total = d.total_count || 0;

      // Render KPIs
      var kpiEl = document.getElementById("gasoil-tx-kpis");
      if (kpiEl) {
        var kt = d.kpis_tipo || {};
        var kh = '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:12px;text-align:center;"><div style="font-size:10px;color:#888;text-transform:uppercase;">Transacciones</div><div style="font-size:20px;font-weight:500;">' + total + '</div></div>';
        kh += '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:12px;text-align:center;"><div style="font-size:10px;color:#888;text-transform:uppercase;">Importe total</div><div style="font-size:20px;font-weight:500;">' + _gasoilFmtEur(d.total_importe) + '</div></div>';
        kh += '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:12px;text-align:center;"><div style="font-size:10px;color:#888;text-transform:uppercase;">Litros totales</div><div style="font-size:20px;font-weight:500;">' + _gasoilFmtNum(d.total_litros) + ' L</div></div>';
        kh += '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:12px;text-align:center;"><div style="font-size:10px;color:#888;text-transform:uppercase;">Estaciones</div><div style="font-size:20px;font-weight:500;">' + (d.estaciones_usadas || 0) + '</div></div>';
        ["diesel","gasolina","adblue","peaje","otros"].forEach(function(tp) {
          var k = kt[tp]; if (!k || !k.importe) return;
          var icons = {diesel:"\uD83D\uDEE2\uFE0F",gasolina:"\u26FD",adblue:"\uD83E\uDDEA",peaje:"\uD83D\uDEE3\uFE0F",otros:"\uD83D\uDCE6"};
          kh += '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:8px 12px;text-align:center;"><div style="font-size:10px;color:#888;text-transform:uppercase;">' + (icons[tp]||"") + " " + tp + '</div><div style="font-size:14px;font-weight:500;">' + _gasoilFmtEur(k.importe) + '</div><div style="font-size:10px;color:#888;">' + _gasoilFmtNum(k.litros) + ' L</div></div>';
        });
        kpiEl.innerHTML = kh;
      }

      if (!txns.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin transacciones</td></tr>';
        var pagEl = document.getElementById("gasoil-tx-paginacion");
        if (pagEl) pagEl.innerHTML = "";
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
      if (pagDiv) {
        var desde_n = _gasoilTxOffset + 1;
        var hasta_n = Math.min(_gasoilTxOffset + txns.length, total);
        pagDiv.innerHTML = '<span>' + desde_n + '-' + hasta_n + ' de ' + total + '</span>' +
          '<div style="display:flex;gap:6px;">' +
          (_gasoilTxOffset > 0 ? '<button class="btn-small" onclick="_gasoilPagPrev()">Anterior</button>' : '') +
          (_gasoilTxOffset + _gasoilTxLimit < total ? '<button class="btn-small" onclick="_gasoilPagNext()">Siguiente</button>' : '') +
          '</div>';
      }
    })
    .catch(function () { if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#dc3545;">Error al cargar</td></tr>'; });
}

function _gasoilPagNext() { _gasoilTxOffset += _gasoilTxLimit; _gasoilCargarTx(); }
function _gasoilPagPrev() { _gasoilTxOffset = Math.max(0, _gasoilTxOffset - _gasoilTxLimit); _gasoilCargarTx(); }

// ═══ Estaciones ═════════════════════════════════════════════════════════════

var _gasoilEstacionesData = [];

function _gasoilCargarEstaciones() {
  var tbody = document.getElementById("gasoil-tbody-estaciones");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Cargando...</td></tr>';

  fetch("/api/combustible/estaciones")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var ests = d.estaciones || [];
      _gasoilEstacionesData = ests;
      var pendientes = d.pendientes_geo || 0;
      // Update geocode button
      var geoBtn = document.getElementById("gasoil-btn-geocodificar");
      if (geoBtn) geoBtn.textContent = "\uD83C\uDF0D Geocodificar pendientes (" + pendientes + ")";
      // Populate filter dropdowns
      _gasoilPoblarFiltrosEstaciones(ests);
      // Render with current filters
      _gasoilFiltrarEstaciones();
    })
    .catch(function (err) { console.error("Estaciones load error:", err); if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:#dc3545;">Error: ' + err.message + '</td></tr>'; });
}

function _gasoilPoblarFiltrosEstaciones(ests) {
  var marcas = {}, municipios = {}, ccaas = {};
  ests.forEach(function (e) {
    if (e.marca) marcas[e.marca] = 1;
    if (e.municipio) municipios[e.municipio] = 1;
    if (e.provincia) ccaas[e.provincia] = 1;
  });
  var selMarca = document.getElementById("filtro-estacion-marca");
  var selMuni = document.getElementById("filtro-estacion-municipio");
  var selCcaa = document.getElementById("filtro-estacion-ccaa");
  if (selMarca) {
    var vm = selMarca.value;
    selMarca.innerHTML = '<option value="">Marca</option>' + Object.keys(marcas).sort().map(function(m){ return '<option value="'+m+'">'+m+'</option>'; }).join('');
    selMarca.value = vm;
  }
  if (selMuni) {
    var vmu = selMuni.value;
    selMuni.innerHTML = '<option value="">Municipio</option>' + Object.keys(municipios).sort().map(function(m){ return '<option value="'+m+'">'+m+'</option>'; }).join('');
    selMuni.value = vmu;
  }
  if (selCcaa) {
    var vc = selCcaa.value;
    selCcaa.innerHTML = '<option value="">CCAA</option>' + Object.keys(ccaas).sort().map(function(m){ return '<option value="'+m+'">'+m+'</option>'; }).join('');
    selCcaa.value = vc;
  }
}

function _gasoilFiltrarEstaciones() {
  var tbody = document.getElementById("gasoil-tbody-estaciones");
  if (!tbody) return;
  var ests = _gasoilEstacionesData;
  var fBusq = (document.getElementById("filtro-estacion-busqueda") || {}).value || "";
  var fMarca = (document.getElementById("filtro-estacion-marca") || {}).value || "";
  var fMuni = (document.getElementById("filtro-estacion-municipio") || {}).value || "";
  var fCcaa = (document.getElementById("filtro-estacion-ccaa") || {}).value || "";
  var fPais = (document.getElementById("filtro-estacion-pais") || {}).value || "";
  var fGeo = (document.getElementById("filtro-estacion-geo") || {}).value || "";

  var busqLow = fBusq.toLowerCase();
  var filtered = ests.filter(function (e) {
    if (fBusq && (e.nombre || '').toLowerCase().indexOf(busqLow) === -1) return false;
    if (fMarca && e.marca !== fMarca) return false;
    if (fMuni && e.municipio !== fMuni) return false;
    if (fCcaa && e.provincia !== fCcaa) return false;
    if (fPais && e.pais !== fPais) return false;
    if (fGeo !== "" && String(e.geocoded) !== fGeo) return false;
    return true;
  });

  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:1.5rem;color:#64748b;">Sin resultados</td></tr>'; return; }
  var html = "";
  filtered.forEach(function (e) {
    var geoIcon = e.geocoded === 1 ? '\u2705' : (e.geocoded === 2 ? '\u274c' : '\u23f3');
    var coords = (e.latitud != null && e.longitud != null) ? Number(e.latitud).toFixed(4) + ", " + Number(e.longitud).toFixed(4) : "\u2014";
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

function _gasoilGeoCompleto() {
  var status = document.getElementById("gasoil-geo-status");
  if (status) { status.style.display = ""; status.textContent = "\u23f3 Ejecutando geocodificaci\u00f3n completa (puede tardar varios minutos)..."; }
  fetch("/api/combustible/geocodificar-completo", { method: "POST" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (d) {
      if (d.error) { if (status) status.textContent = "\u274c " + d.error; return; }
      var res = d.resumen || {};
      var msg = "\u2705 Completo: " + (d.manual || 0) + " manual, " + (d.nominatim || 0) + " Nominatim, " +
        (d.fallidas || 0) + " irrecuperables, " + (d.corregidos_fp || 0) + " FP corregidos, " +
        (d.peajes_marcados || 0) + " peajes. Resumen: ";
      Object.keys(res).forEach(function(k) { msg += "geo=" + k + ":" + res[k] + " "; });
      if (status) status.textContent = msg;
      _gasoilCargarEstaciones();
    })
    .catch(function (e) {
      if (status) status.textContent = "\u274c Error: " + e.message;
    });
}

// ═══ Vehículos ══════════════════════════════════════════════════════════════

function _gasoilCargarVehiculos() {
  var tbody = document.getElementById("gasoil-tbody-vehiculos-detail");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;">Cargando...</td></tr>';

  fetch("/api/combustible/vehiculos")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var vehs = d.vehiculos || [];
      if (!vehs.length) { tbody.innerHTML = '<tr><td colspan="5">Sin veh\u00edculos</td></tr>'; return; }
      var html = "";
      vehs.forEach(function (v) {
        var alqPill = '';
        if (v.es_alquiler) {
          var hoy = new Date().toISOString().slice(0,10);
          if (v.fecha_alquiler_fin && v.fecha_alquiler_fin < hoy) {
            alqPill = ' <span class="pill-alquiler" style="background:#FCEBEB;color:#A32D2D;font-size:10px;font-weight:500;padding:2px 8px;border-radius:999px;">EXPIRADO</span>';
          } else if (v.fecha_alquiler_fin) {
            var diasFin = Math.round((new Date(v.fecha_alquiler_fin) - new Date()) / 86400000);
            if (diasFin <= 30) alqPill = ' <span class="pill-alquiler" style="background:#FEDCBE;color:#A04400;font-size:10px;font-weight:500;padding:2px 8px;border-radius:999px;">EXPIRA ' + diasFin + 'd</span>';
            else alqPill = ' <span class="pill-alquiler" style="background:#FAEEDA;color:#854F0B;font-size:10px;font-weight:500;padding:2px 8px;border-radius:999px;">\uD83C\uDFF7 ALQUILER</span>';
          } else {
            alqPill = ' <span class="pill-alquiler" style="background:#FAEEDA;color:#854F0B;font-size:10px;font-weight:500;padding:2px 8px;border-radius:999px;">\uD83C\uDFF7 ALQUILER</span>';
          }
        }
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
    .catch(function () { tbody.innerHTML = '<tr><td colspan="5" style="color:#dc3545;">Error</td></tr>'; });
}

// ═══ Import Moeve XLSX ═══════════════════════════════════════════════════════

function _gasoilImportarMoeve(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var status = document.getElementById("gasoil-import-status");
  if (status) {
    status.style.display = "";
    status.style.background = "#EFF6FF";
    status.style.color = "#1E40AF";
    status.textContent = "\u23f3 Importando " + file.name + "...";
  }

  var fd = new FormData();
  fd.append("file", file);
  fetch("/api/combustible/importar-moeve", { method: "POST", body: fd })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!status) return;
      if (d.error) {
        status.style.background = "#FEF2F2"; status.style.color = "#dc2626";
        status.textContent = "\u274c Error: " + d.error;
      } else {
        status.style.background = "#F0FDF4"; status.style.color = "#166534";
        status.textContent = "\u2705 " + d.creados + " transacciones creadas, " + d.duplicados + " duplicadas, " + d.errores + " errores. " +
          (d.vehiculos_nuevos.length ? d.vehiculos_nuevos.length + " veh\u00edculos nuevos. " : "") +
          (d.estaciones_nuevas.length ? d.estaciones_nuevas.length + " estaciones nuevas." : "");
        _gasoilCambiarTab(_gasoilTabActivo); // Refresh current tab
      }
      input.value = "";
    })
    .catch(function(err) {
      if (status) {
        status.style.background = "#FEF2F2"; status.style.color = "#dc2626";
        status.textContent = "\u274c Error: " + err.message;
      }
      input.value = "";
    });
}

function _gasoilImportarSolred(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var status = document.getElementById("gasoil-import-status");
  if (status) {
    status.style.display = "";
    status.style.background = "#EFF6FF";
    status.style.color = "#1E40AF";
    status.textContent = "\u23f3 Importando Solred " + file.name + "...";
  }
  var fd = new FormData();
  fd.append("file", file);
  fetch("/api/combustible/importar-solred", { method: "POST", body: fd })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!status) return;
      if (d.error) {
        status.style.background = "#FEF2F2"; status.style.color = "#dc2626";
        status.textContent = "\u274c Error: " + d.error;
      } else {
        status.style.background = "#F0FDF4"; status.style.color = "#166534";
        status.textContent = "\u2705 Solred: " + d.creados + " creadas, " + d.duplicados + " duplicadas, " + d.errores + " errores." +
          (d.estaciones_nuevas && d.estaciones_nuevas.length ? " " + d.estaciones_nuevas.length + " estaciones nuevas." : "");
        _gasoilCambiarTab(_gasoilTabActivo);
      }
      input.value = "";
    })
    .catch(function(err) {
      if (status) {
        status.style.background = "#FEF2F2"; status.style.color = "#dc2626";
        status.textContent = "\u274c Error: " + err.message;
      }
      input.value = "";
    });
}

// ═══ Vehicle edit modal ═══════════════════════════════════════════════════

function _gasoilEditarVehiculo(vid) {
  fetch("/api/combustible/vehiculos").then(function(r){return r.json();}).then(function(d) {
    var v = (d.vehiculos||[]).find(function(x){return x.id===vid;});
    if (!v) return;
    var old = document.getElementById("modal-gasoil-edit"); if (old) old.remove();
    var m = document.createElement("div"); m.id = "modal-gasoil-edit";
    m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;display:flex;align-items:center;justify-content:center;";
    m.innerHTML = '<div style="background:#fff;border-radius:12px;width:520px;max-width:95%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,0.15);max-height:90vh;overflow-y:auto;">' +
      '<h3 style="margin:0 0 14px;">Editar veh\u00edculo ' + v.matricula + '</h3>' +
      '<div style="display:grid;gap:10px;">' +
        '<div><label style="font-size:11px;color:#888;">Tipo</label><select id="gv-tipo" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;"><option value="pickup">Pickup</option><option value="furgoneta">Furgoneta</option><option value="camion">Cami\u00f3n</option><option value="remolque">Remolque</option><option value="turismo">Turismo</option><option value="otro">Otro</option></select></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div><label style="font-size:11px;color:#888;">Marca</label><input id="gv-marca" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div><div><label style="font-size:11px;color:#888;">Modelo</label><input id="gv-modelo" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div></div>' +
        '<div><label style="font-size:11px;color:#888;">Notas</label><input id="gv-notas" style="width:100%;padding:6px;border:1px solid #E5E5E5;border-radius:6px;box-sizing:border-box;"></div>' +
        '<label style="display:flex;gap:6px;align-items:center;font-size:12px;"><input type="checkbox" id="gv-alquiler" onchange="document.getElementById(\'gv-alq-fields\').style.display=this.checked?\'\':\'none\'"> Es veh\u00edculo de alquiler</label>' +
        '<div id="gv-alq-fields" style="display:none;padding:8px;background:#FFFBEB;border-radius:6px;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">' +
            '<div><label style="font-size:10px;color:#888;">Proveedor</label><input id="gv-prov-alq" style="width:100%;padding:4px;border:1px solid #E5E5E5;border-radius:4px;box-sizing:border-box;font-size:12px;"></div>' +
            '<div><label style="font-size:10px;color:#888;">Inicio</label><input type="date" id="gv-alq-inicio" style="width:100%;padding:4px;border:1px solid #E5E5E5;border-radius:4px;box-sizing:border-box;font-size:12px;"></div>' +
            '<div><label style="font-size:10px;color:#888;">Fin</label><input type="date" id="gv-alq-fin" style="width:100%;padding:4px;border:1px solid #E5E5E5;border-radius:4px;box-sizing:border-box;font-size:12px;"></div></div></div>' +
        '<hr style="border:none;border-top:1px solid #E5E5E5;margin:6px 0;">' +
        '<div style="background:#F8FAFC;border-radius:8px;padding:10px;">' +
          '<h4 style="margin:0 0 8px;font-size:12px;font-weight:700;color:#475569;">Base / Responsable (vehiculos_asignaciones)</h4>' +
          '<div id="gv-asignaciones-list" style="font-size:12px;color:#64748b;">Cargando historial...</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px;">' +
            '<div><label style="font-size:10px;color:#888;">Base</label><input id="gv-asig-base" placeholder="Ej: Madrid" style="width:100%;padding:4px;border:1px solid #E5E5E5;border-radius:4px;box-sizing:border-box;font-size:12px;"></div>' +
            '<div><label style="font-size:10px;color:#888;">Responsable</label><input id="gv-asig-resp" placeholder="Nombre" style="width:100%;padding:4px;border:1px solid #E5E5E5;border-radius:4px;box-sizing:border-box;font-size:12px;"></div>' +
            '<div><label style="font-size:10px;color:#888;">Desde</label><input type="date" id="gv-asig-desde" style="width:100%;padding:4px;border:1px solid #E5E5E5;border-radius:4px;box-sizing:border-box;font-size:12px;"></div></div>' +
          '<button id="gv-asig-add" style="margin-top:6px;padding:4px 10px;font-size:11px;border:1px solid #2563eb;border-radius:4px;background:#EFF6FF;color:#2563eb;cursor:pointer;">+ Asignar base/responsable</button>' +
        '</div>' +
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
    if (v.es_alquiler) document.getElementById("gv-alq-fields").style.display = "";
    document.getElementById("gv-prov-alq").value = v.proveedor_alquiler || "";
    document.getElementById("gv-alq-inicio").value = v.fecha_alquiler_inicio || "";
    document.getElementById("gv-alq-fin").value = v.fecha_alquiler_fin || "";
    // Load vehiculos_asignaciones history
    _gasoilCargarAsignacionesVehiculo(vid);
    // Add base/responsable button — posts to vehiculos_asignaciones
    document.getElementById("gv-asig-add").addEventListener("click", function() {
      var base = document.getElementById("gv-asig-base").value;
      var resp = document.getElementById("gv-asig-resp").value;
      var desde = document.getElementById("gv-asig-desde").value;
      if (!base && !resp) return;
      fetch("/api/combustible/vehiculos/" + vid + "/asignaciones", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({base: base, responsable_nombre: resp, fecha_inicio: desde || new Date().toISOString().slice(0,10)})
      }).then(function() { _gasoilCargarAsignacionesVehiculo(vid); });
    });
    document.getElementById("gv-save").addEventListener("click", function() {
      var isAlq = document.getElementById("gv-alquiler").checked;
      fetch("/api/combustible/vehiculos/" + vid, {
        method: "PUT", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({tipo: document.getElementById("gv-tipo").value, marca: document.getElementById("gv-marca").value, modelo: document.getElementById("gv-modelo").value, notas: document.getElementById("gv-notas").value, es_alquiler: isAlq, proveedor_alquiler: isAlq ? document.getElementById("gv-prov-alq").value : null, fecha_alquiler_inicio: isAlq ? document.getElementById("gv-alq-inicio").value : null, fecha_alquiler_fin: isAlq ? document.getElementById("gv-alq-fin").value : null})
      }).then(function() { m.remove(); _gasoilCargarVehiculos(); });
    });
  });
}

// Fetch and render vehiculos_asignaciones history for a vehicle
function _gasoilCargarAsignacionesVehiculo(vid) {
  var container = document.getElementById("gv-asignaciones-list");
  if (!container) return;
  fetch("/api/combustible/vehiculos/" + vid + "/asignaciones")
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var asigs = d.asignaciones || []; // vehiculos_asignaciones rows
      if (!asigs.length) { container.innerHTML = '<span style="color:#94a3b8;font-size:11px;">Sin historial de vehiculos_asignaciones</span>'; return; }
      var html = '<table style="width:100%;font-size:11px;border-collapse:collapse;">' +
        '<tr style="color:#64748b;"><th style="text-align:left;padding:2px 4px;">Base</th><th style="text-align:left;padding:2px 4px;">Responsable</th><th style="padding:2px 4px;">Desde</th><th style="padding:2px 4px;">Hasta</th></tr>';
      asigs.forEach(function(a) {
        var activa = !a.fecha_fin;
        html += '<tr style="' + (activa ? 'background:#F0FDF4;' : '') + '">' +
          '<td style="padding:2px 4px;">' + (a.base || '\u2014') + (activa ? ' \u2705' : '') + '</td>' +
          '<td style="padding:2px 4px;">' + (a.responsable_nombre || '\u2014') + '</td>' +
          '<td style="padding:2px 4px;text-align:center;">' + (a.fecha_inicio || '\u2014') + '</td>' +
          '<td style="padding:2px 4px;text-align:center;">' + (a.fecha_fin || 'Activa') + '</td></tr>';
      });
      html += '</table>';
      container.innerHTML = html;
    })
    .catch(function() { container.innerHTML = '<span style="color:#dc3545;font-size:11px;">Error cargando vehiculos_asignaciones</span>'; });
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
window._gasoilCambiarTab = _gasoilCambiarTab;
window._gasoilImportarMoeve = _gasoilImportarMoeve;
window._gasoilImportarSolred = _gasoilImportarSolred;
window._gasoilEditarVehiculo = _gasoilEditarVehiculo;
window._gasoilEditarEstacion = _gasoilEditarEstacion;
window._gasoilFiltrar = _gasoilFiltrar;
window._gasoilFiltrarEstaciones = _gasoilFiltrarEstaciones;
window._gasoilPagNext = _gasoilPagNext;
window._gasoilPagPrev = _gasoilPagPrev;
window._gasoilGeocodificar = _gasoilGeocodificar;
window._gasoilGeoCompleto = _gasoilGeoCompleto;
window._gasoilCargarEstaciones = _gasoilCargarEstaciones;
window._gasoilCargarVehiculos = _gasoilCargarVehiculos;
