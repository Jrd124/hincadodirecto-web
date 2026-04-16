// ===============================================================================
// ==  RRHH MODULE - Complete frontend for HR management                       ==
// ===============================================================================

var _rrhhEmpleadosCache = [];
var _rrhhPeriodos = [];
var _rrhhPeriodoIdx = -1;
var _rrhhNominasInit = false;
var _rrhhVerifInit = false;
var _rrhhVerifVista = "check"; // current verificador sub-view: "check" | "estimacion"
var _rrhhEstimInit = false;
var _rrhhImportInit = false;
var _rrhhInactivosAbierto = false;
var _rrhhOCRData = [];
var _rrhhDashChartEvo = null;
var _rrhhFichaChart = null;
var _rrhhDashChartCat = null; // unused, kept for compat
var _rrhhSSChart = null;
var _rrhhExpandedRow = null;
var _rrhhFichaOrigen = "nominas"; // track which section opened the ficha
var _rrhhDietasVista = "calendario"; // current dietas sub-view

// ===============================================================================
// ==  Formatting helpers                                                       ==
// ===============================================================================

function fmtEur(n) {
  if (n == null || isNaN(n)) return "\u2014";
  if (n === 0) return "\u2014";
  var neg = n < 0;
  var abs = Math.abs(n);
  var f = abs.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return neg ? "(" + f + ")" : f;
}

function fmtEurFull(n) {
  var v = fmtEur(n);
  return v === "\u2014" ? v : v + " \u20ac";
}

function _rrhhKpiCard(label, value, extra, fontSize) {
  return '<div class="tes-card' + (extra || '') + '"><span class="tes-label">' + label + '</span><span class="tes-valor" style="font-size:' + (fontSize || '1.1rem') + ';">' + value + '</span></div>';
}

function _rrhhPeriodoToLabel(periodo) {
  if (!periodo) return "";
  var parts = periodo.split("-");
  if (parts.length < 2) return periodo;
  var meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  var m = parseInt(parts[1], 10) - 1;
  return (meses[m] || parts[1]) + " " + parts[0];
}

// ===============================================================================
// ==  Panel dispatcher                                                         ==
// ===============================================================================

function _rrhhOnPanelShow(panel) {
  if (panel === "inicio") _rrhhCargarDashboard();
  else if (panel === "equipo") _rrhhCargarEmpleados();
  else if (panel === "nominas") _rrhhCargarNominas();
  else if (panel === "verificador") _rrhhCargarVerificador();
  else if (panel === "dietas") _rrhhCargarDietas();
  else if (panel === "adelantos") _rrhhCargarAdelantos();
  else if (panel === "ss") _rrhhCargarSS();
  else if (panel === "irpf") _rrhhCargarIRPF();
  else if (panel === "costeproyecto") _rrhhCargarCosteProyecto();
}

// ===============================================================================
// ==  1. DASHBOARD (inicio)                                                    ==
// ===============================================================================

function _rrhhCargarDashboard() {
  fetch("/api/rrhh/dashboard")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var k = d.kpis || {};

      // -- KPIs --
      var kpiDiv = document.getElementById("rrhh-kpis");
      if (kpiDiv) {
        var varVal = k.variacion || 0;
        var varArrow = varVal > 0 ? "\u2191" : varVal < 0 ? "\u2193" : "";
        var varColor = varVal > 0 ? "color:#dc2626;" : varVal < 0 ? "color:#16a34a;" : "";
        var varHtml = '<span style="' + varColor + '">' + varArrow + ' ' + Math.abs(varVal) + '%</span>';

        kpiDiv.innerHTML =
          _rrhhKpiCard("Empleados activos", k.emp_activos || 0, "") +
          _rrhhKpiCard("Coste empresa / mes", fmtEurFull(k.coste_mes), " tes-card-blue", "1rem") +
          _rrhhKpiCard("Coste / d\u00eda", fmtEurFull(k.coste_dia), "", "1rem") +
          _rrhhKpiCard("Dietas / mes", fmtEurFull(k.dietas_mes), "", "1rem") +
          _rrhhKpiCard("Variaci\u00f3n", varHtml, "", "1rem") +
          _rrhhKpiCard("Rotaci\u00f3n", (k.rotacion || 0) + "%", "", "1rem");
      }

      // -- Chart.js: Stacked bar (evolucion) --
      var evo = (d.evolucion || []).slice();
      var canvasEvo = document.getElementById("rrhh-chart-evolucion");
      if (canvasEvo && evo.length) {
        if (_rrhhDashChartEvo) _rrhhDashChartEvo.destroy();
        var labels = evo.map(function (m) { return m.periodo; });
        var dsSalarios = evo.map(function (m) { return m.salarios || 0; });
        var dsSS = evo.map(function (m) { return m.ss_empresa || 0; });
        var dsDietas = evo.map(function (m) { return m.dietas || 0; });
        _rrhhDashChartEvo = new Chart(canvasEvo.getContext("2d"), {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              { label: "Salarios", data: dsSalarios, backgroundColor: "#3B82F6", stack: "a" },
              { label: "SS Empresa", data: dsSS, backgroundColor: "#10B981", stack: "a" },
              { label: "Dietas", data: dsDietas, backgroundColor: "#F59E0B", stack: "a" }
            ]
          },
          plugins: [{
            id: "evoTotalLabel",
            afterDatasetsDraw: function (chart) {
              var ctx = chart.ctx;
              var meta = chart.getDatasetMeta(2); // topmost dataset (Dietas)
              ctx.save();
              ctx.font = "bold 11px sans-serif";
              ctx.fillStyle = "#374151";
              ctx.textAlign = "center";
              for (var i = 0; i < meta.data.length; i++) {
                var total = (dsSalarios[i] || 0) + (dsSS[i] || 0) + (dsDietas[i] || 0);
                var bar = meta.data[i];
                var lbl = total >= 1000 ? Math.round(total / 1000) + "K" : Math.round(total) + "";
                ctx.fillText(lbl, bar.x, bar.y - 6);
              }
              ctx.restore();
            }
          }],
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
            scales: {
              x: { stacked: true },
              y: { stacked: true, ticks: { callback: function (v) { return fmtEur(v); } } }
            },
            onClick: function (evt, elems) {
              if (elems.length) {
                var idx = elems[0].index;
                _rrhhVerMes(labels[idx]);
              }
            }
          }
        });
      }

      // -- Asignación de empleados a proyectos --
      var asig = d.asignacion_empleados || {};
      var asigDiv = document.getElementById("rrhh-dash-asignacion");
      if (asigDiv) {
        var proys = asig.proyectos || [];
        var th = "padding:5px 6px;font-weight:700;";
        var ah = '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">';
        ah += '<thead><tr style="border-bottom:2px solid var(--border,#e9ecef);">' +
          '<th style="' + th + 'text-align:left;">Proyecto</th>' +
          '<th style="' + th + 'text-align:right;">Operadores</th>' +
          '<th style="' + th + 'text-align:right;">Ayudantes</th>' +
          '<th style="' + th + 'text-align:right;">Total</th></tr></thead><tbody>';
        proys.forEach(function (p) {
          ah += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="if(typeof _navToProyecto===\'function\')_navToProyecto(' + p.proyecto_id + ')">' +
            '<td style="padding:5px 6px;">' + (p.proyecto_nombre || "") + '</td>' +
            '<td style="padding:5px 6px;text-align:right;font-weight:600;">' + p.operadores + '</td>' +
            '<td style="padding:5px 6px;text-align:right;font-weight:600;">' + p.ayudantes + '</td>' +
            '<td style="padding:5px 6px;text-align:right;font-weight:600;">' + p.total + '</td></tr>';
        });
        ah += '<tr style="border-bottom:1px solid var(--border,#e9ecef);background:#FFFBEB;">' +
          '<td style="padding:5px 6px;color:#92400E;">Sin asignar</td>' +
          '<td style="padding:5px 6px;text-align:right;color:#92400E;">\u2014</td>' +
          '<td style="padding:5px 6px;text-align:right;color:#92400E;">\u2014</td>' +
          '<td style="padding:5px 6px;text-align:right;font-weight:600;color:#92400E;">' + (asig.sin_asignar || 0) + '</td></tr>';
        if (asig.baja_vacaciones) {
          ah += '<tr style="border-bottom:1px solid var(--border,#e9ecef);background:#F3F4F6;">' +
            '<td style="padding:5px 6px;color:#6B7280;">Baja / Vacaciones</td>' +
            '<td style="padding:5px 6px;text-align:right;color:#6B7280;">\u2014</td>' +
            '<td style="padding:5px 6px;text-align:right;color:#6B7280;">\u2014</td>' +
            '<td style="padding:5px 6px;text-align:right;font-weight:600;color:#6B7280;">' + asig.baja_vacaciones + '</td></tr>';
        }
        ah += '</tbody><tfoot><tr style="border-top:2px solid var(--border,#e9ecef);">' +
          '<td style="padding:6px 6px;font-weight:700;">TOTAL</td>' +
          '<td style="padding:6px 6px;text-align:right;font-weight:800;">' + (asig.total_operadores || 0) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;font-weight:800;">' + (asig.total_ayudantes || 0) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;font-weight:800;">' + (asig.total || 0) + '</td></tr></tfoot></table>';
        asigDiv.innerHTML = ah;
      }

      // -- Top 5 coste/dia --
      var top5 = d.top5 || [];
      var topDiv = document.getElementById("rrhh-top5");
      if (topDiv) {
        if (!top5.length) {
          topDiv.innerHTML = "";
        } else {
          var h = '<h4 style="margin:12px 0 6px;font-size:0.9rem;font-weight:700;">Top 5 coste/d\u00eda</h4>';
          h += '<div class="card" style="padding:0;overflow:hidden;"><table style="width:100%;border-collapse:collapse;font-size:0.82rem;">';
          top5.forEach(function (t) {
            h += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_rrhhVerFichaEmpleado(' + t.id + ')">' +
              '<td style="padding:5px 8px;font-weight:500;">' + t.nombre + ' ' + (t.apellidos || '') + '</td>' +
              '<td style="padding:5px 6px;">' + (t.categoria || '') + '</td>' +
              '<td style="padding:5px 6px;text-align:right;">' + fmtEur(t.coste_dia) + '/d</td>' +
              '<td style="padding:5px 6px;text-align:right;">' + fmtEurFull(t.coste_empresa) + '</td></tr>';
          });
          h += '</table></div>';
          topDiv.innerHTML = h;
        }
      }

      // -- Alertas --
      var alertas = d.alertas || [];
      var alertDiv = document.getElementById("rrhh-alertas");
      if (alertDiv) {
        if (!alertas.length) {
          alertDiv.innerHTML = "";
        } else {
          var ah = "";
          alertas.forEach(function (a) {
            var bg = a.tipo === "warning" ? "#FEF3C7" : a.tipo === "danger" ? "#FEE2E2" : "#EFF6FF";
            var col = a.tipo === "warning" ? "#92400E" : a.tipo === "danger" ? "#991B1B" : "#1E40AF";
            var nombresHtml = "";
            if (a.nombres && a.nombres.length) {
              nombresHtml = '<ul style="margin:4px 0 0 16px;padding:0;font-size:0.8rem;">';
              a.nombres.forEach(function (n) { nombresHtml += '<li>' + n + '</li>'; });
              nombresHtml += '</ul>';
            }
            ah += '<div style="padding:8px 12px;background:' + bg + ';color:' + col + ';border-radius:6px;font-size:0.85rem;margin-bottom:6px;">' + a.texto + nombresHtml + '</div>';
          });
          alertDiv.innerHTML = ah;
        }
      }
    })
    .catch(function (err) {
      var kpiDiv = document.getElementById("rrhh-kpis");
      if (kpiDiv) kpiDiv.innerHTML = '<div style="padding:1rem;color:#dc3545;">Error al cargar dashboard: ' + err.message + '</div>';
    });
}

// ===============================================================================
// ==  2. EQUIPO (employee directory + CRUD)                                    ==
// ===============================================================================

var _rrhhEquipoColapsados = { baja: true, vacaciones: true, reserva: true, exempleado: true };
var _rrhhEquipoWrapper = null; // cached reference to the rendering container

function _rrhhCargarEmpleados() {
  // Find the wrapper once and cache it
  if (!_rrhhEquipoWrapper) {
    var container = document.getElementById("tbody-empleados-activos");
    if (!container) return;
    _rrhhEquipoWrapper = container.closest(".card") || container.parentNode;
  }
  _rrhhEquipoWrapper.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text-secondary);">Cargando\u2026</p>';

  fetch("/api/rrhh/empleados?estado=todos")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      _rrhhEmpleadosCache = d.empleados || [];
      _rrhhRenderVistas(_rrhhEmpleadosCache);
    })
    .catch(function (err) {
      _rrhhEquipoWrapper.innerHTML = '<p style="text-align:center;padding:2rem;color:#dc3545;">Error: ' + err.message + '</p>';
    });
}

function _rrhhRenderVistas(lista) {
  var grupos = [
    { key: "activo", label: "Activos", color: "#22c55e" },
    { key: "baja", label: "Baja", color: "#f59e0b" },
    { key: "vacaciones", label: "Vacaciones", color: "#3B82F6" },
    { key: "reserva", label: "Reserva", color: "#6B7280" },
    { key: "exempleado", label: "Exempleados", color: "#ef4444" }
  ];
  var wrapper = _rrhhEquipoWrapper;
  if (!wrapper) return;

  var html = "";
  grupos.forEach(function (g) {
    var emps = lista.filter(function (e) { return e.estado === g.key; });
    if (!emps.length) return;
    var collapsed = _rrhhEquipoColapsados[g.key];
    var chevron = collapsed ? "\u25B6" : "\u25BC";

    // Group header (clickable)
    html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border,#e9ecef);background:var(--bg-secondary,#f8f9fa);user-select:none;" onclick="_rrhhToggleGrupoEquipo(\'' + g.key + '\')">';
    html += '<span style="font-size:0.75rem;width:12px;display:inline-block;">' + chevron + '</span>';
    html += '<span style="font-weight:700;font-size:0.88rem;">' + g.label + '</span>';
    html += '<span style="display:inline-block;padding:1px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:' + g.color + '20;color:' + g.color + ';">' + emps.length + '</span>';
    html += '</div>';

    // Table (hidden if collapsed)
    html += '<table data-equipo-grupo="' + g.key + '" style="width:100%;border-collapse:collapse;font-size:0.82rem;' + (collapsed ? 'display:none;' : '') + '">';
    // Header
    html += '<thead><tr style="background:var(--bg-secondary,#f8f9fa);">' +
      '<th style="padding:6px 10px;text-align:left;font-weight:700;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;color:#666;">Nombre</th>' +
      '<th style="padding:6px 6px;text-align:left;font-weight:700;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;color:#666;width:110px;">DNI</th>' +
      '<th style="padding:6px 6px;text-align:left;font-weight:700;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;color:#666;width:130px;">Categor\u00eda</th>' +
      '<th style="padding:6px 6px;text-align:left;font-weight:700;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;color:#666;width:130px;">Tel\u00e9fono</th>' +
      '<th style="padding:6px 6px;text-align:right;font-weight:700;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;color:#666;width:95px;">Coste/D\u00eda</th>' +
      '<th style="padding:6px 6px;text-align:center;font-weight:700;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;color:#666;width:90px;">Estado</th>' +
      '<th style="padding:6px 6px;text-align:center;font-weight:700;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;color:#666;width:90px;">Acciones</th>' +
      '</tr></thead><tbody>';

    emps.forEach(function (e, i) {
      var nombreCompleto = (e.nombre || "") + (e.apellidos ? " " + e.apellidos : "");
      var estadoColor = { activo: "#22c55e", baja: "#f59e0b", vacaciones: "#3B82F6", reserva: "#6B7280", exempleado: "#ef4444" }[e.estado] || "#6B7280";
      var estadoLabel = e.estado ? e.estado.charAt(0).toUpperCase() + e.estado.slice(1) : "\u2014";
      var costeDia = e.coste_dia_actual || e.ultimo_coste_empresa ? (e.coste_dia_actual || 0) : null;
      var zebra = i % 2 === 1 ? "background:rgba(0,0,0,0.015);" : "";

      html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;' + zebra + '" onclick="_rrhhAbrirFichaDesdeEquipo(' + e.id + ')" onmouseover="this.style.background=\'rgba(59,130,246,0.06)\'" onmouseout="this.style.background=\'' + (i % 2 === 1 ? 'rgba(0,0,0,0.015)' : '') + '\'">' +
        '<td style="padding:7px 10px;font-weight:600;white-space:nowrap;">' + nombreCompleto + '</td>' +
        '<td style="padding:7px 6px;font-family:monospace;font-size:0.8rem;">' + (e.dni || "\u2014") + '</td>' +
        '<td style="padding:7px 6px;">' + (e.categoria || e.puesto || "\u2014") + '</td>' +
        '<td style="padding:7px 6px;">' + (e.telefono || "\u2014") + '</td>' +
        '<td style="padding:7px 6px;text-align:right;">' + (costeDia !== null ? fmtEur(costeDia) + ' \u20ac/d' : '\u2014') + '</td>' +
        '<td style="padding:7px 6px;text-align:center;"><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.7rem;font-weight:600;background:' + estadoColor + '18;color:' + estadoColor + ';">' + estadoLabel + '</span></td>' +
        '<td style="padding:7px 6px;text-align:center;white-space:nowrap;">' +
          '<button onclick="event.stopPropagation();_rrhhAbrirFichaDesdeEquipo(' + e.id + ')" title="Ver ficha" style="background:none;border:none;cursor:pointer;color:#3B82F6;font-size:0.85rem;">&#x1F464;</button> ' +
          '<button onclick="event.stopPropagation();_rrhhEditarEmpleado(' + e.id + ')" title="Editar" style="background:none;border:none;cursor:pointer;color:#6B7280;font-size:0.85rem;">&#x270E;</button> ' +
          '<button onclick="event.stopPropagation();_rrhhEliminarEmpleado(' + e.id + ',\'' + nombreCompleto.replace(/'/g, "\\'") + '\')" title="Dar de baja" style="background:none;border:none;cursor:pointer;color:#dc3545;font-size:0.85rem;">&#x2716;</button>' +
        '</td></tr>';
    });
    html += '</tbody></table>';
  });

  if (!html) html = '<p style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin empleados</p>';
  wrapper.innerHTML = html;

  // Hide old inactivos wrapper
  var inacWrapper = document.getElementById("rrhh-inactivos-wrapper");
  if (inacWrapper) inacWrapper.style.display = "none";
}

function _rrhhToggleGrupoEquipo(key) {
  _rrhhEquipoColapsados[key] = !_rrhhEquipoColapsados[key];
  _rrhhRenderVistas(_rrhhEmpleadosCache);
}

function _rrhhRenderTabla(tbody, lista, esActivos) {
  if (!tbody) return;
  if (!lista.length) {
    tbody.innerHTML = esActivos
      ? '<tr><td colspan="9" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">' +
        '<p style="font-size:1.1rem;margin-bottom:0.5rem;">Sin empleados activos</p>' +
        '<p style="font-size:0.85rem;">Pulsa <strong>Nuevo trabajador</strong> para a\u00f1adir el primero.</p></td></tr>'
      : '';
    return;
  }
  var hoy = new Date().toISOString().slice(0, 10);
  var html = "";
  lista.forEach(function (e) {
    var nombreCompleto = (e.nombre || "") + (e.apellidos ? " " + e.apellidos : "");
    var estadoColor = e.estado === "activo" ? "#22c55e" : e.estado === "vacaciones" ? "#f59e0b" : "#ef4444";
    var estadoLabel = e.estado ? e.estado.charAt(0).toUpperCase() + e.estado.slice(1) : "\u2014";
    var prlOk = e.prl_basico === 1 || e.prl_basico === "1";
    var prlCad = e.prl_basico_caducidad || "";
    var prlVencido = prlCad && prlCad < hoy;
    var prlBadge = prlOk
      ? (prlVencido
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:#fef2f2;color:#dc2626;">Vencido</span>'
        : '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:#f0fdf4;color:#16a34a;">S\u00ed</span>')
      : '<span style="color:var(--text-secondary);font-size:0.8rem;">No</span>';
    var aptoOk = e.apto_medico === 1 || e.apto_medico === "1";
    var aptoCad = e.apto_medico_caducidad || "";
    var aptoVencido = aptoCad && aptoCad < hoy;
    var aptoBadge = aptoOk
      ? (aptoVencido
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:#fef2f2;color:#dc2626;">Vencido</span>'
        : '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:#f0fdf4;color:#16a34a;">S\u00ed</span>')
      : '<span style="color:var(--text-secondary);font-size:0.8rem;">No</span>';
    var carnet = e.carnet_conducir || "\u2014";

    html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_rrhhAbrirFichaDesdeEquipo(' + e.id + ')">' +
      '<td style="padding:0.6rem 1rem;font-weight:600;white-space:nowrap;">' + nombreCompleto + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + (e.dni || "\u2014") + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + (e.puesto ? e.puesto.charAt(0).toUpperCase() + e.puesto.slice(1) : "\u2014") + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + (e.telefono || "\u2014") + '</td>' +
      '<td style="padding:0.6rem 0.75rem;"><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:' + estadoColor + '20;color:' + estadoColor + ';">' + estadoLabel + '</span></td>' +
      '<td style="padding:0.6rem 0.75rem;">' + prlBadge + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + aptoBadge + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + carnet + '</td>' +
      '<td style="padding:0.6rem 0.75rem;text-align:center;">' +
        '<button onclick="event.stopPropagation();_rrhhEditarEmpleado(' + e.id + ')" title="Editar" style="background:none;border:none;cursor:pointer;color:#3B82F6;font-size:0.9rem;margin-right:4px;">&#x270E;</button>' +
        '<button onclick="event.stopPropagation();_rrhhEliminarEmpleado(' + e.id + ',\'' + nombreCompleto.replace(/'/g, "\\'") + '\')" title="Dar de baja" style="background:none;border:none;cursor:pointer;color:#dc3545;font-size:1rem;">&#x2716;</button>' +
      '</td></tr>';
  });
  tbody.innerHTML = html;
}

function _rrhhToggleInactivos() {
  _rrhhInactivosAbierto = !_rrhhInactivosAbierto;
  var panel = document.getElementById("rrhh-inactivos-panel");
  var icono = document.getElementById("icono-toggle-inactivos");
  if (panel) panel.style.display = _rrhhInactivosAbierto ? "" : "none";
  if (icono) icono.style.transform = _rrhhInactivosAbierto ? "rotate(180deg)" : "";
}

// -- Search handler --
(function () {
  var input = document.getElementById("rrhh-equipo-buscar");
  if (!input) return;
  input.addEventListener("input", function () {
    var q = this.value.toLowerCase().trim();
    if (!q) { _rrhhRenderVistas(_rrhhEmpleadosCache); return; }
    var filtered = _rrhhEmpleadosCache.filter(function (e) {
      var hay = (e.nombre || "").toLowerCase() + " " + (e.apellidos || "").toLowerCase() + " " + (e.dni || "").toLowerCase() + " " + (e.puesto || "").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    _rrhhRenderVistas(filtered);
  });
})();

// -- Modal: open / close --
function _rrhhAbrirModalEmpleado(id) {
  var modal = document.getElementById("modal-rrhh-empleado");
  document.getElementById("modal-emp-titulo").textContent = id ? "Editar trabajador" : "Nuevo trabajador";
  _rrhhLimpiarFormEmpleado();
  if (id) {
    fetch("/api/empleados/" + id)
      .then(function (r) { return r.json(); })
      .then(function (e) {
        if (e.error) { alert(e.error); return; }
        _rrhhRellenarFormEmpleado(e);
        modal.style.display = "flex";
        modal.classList.add("visible");
      });
  } else {
    modal.style.display = "flex";
    modal.classList.add("visible");
  }
}

function _rrhhCerrarModalEmpleado() {
  var modal = document.getElementById("modal-rrhh-empleado");
  modal.classList.remove("visible");
  setTimeout(function () { modal.style.display = "none"; }, 250);
}

// -- Form helpers --
function _rrhhLimpiarFormEmpleado() {
  document.getElementById("emp-id").value = "";
  ["emp-nombre","emp-apellidos","emp-dni","emp-nss","emp-telefono","emp-email",
   "emp-puesto","emp-categoria","emp-fecha-alta",
   "emp-prl-especifico","emp-prl-basico-cad","emp-prl-especifico-cad",
   "emp-apto-medico-cad","emp-carnet-conducir","emp-carnet-conducir-cad",
   "emp-carnet-maquinaria","emp-carnet-maquinaria-cad","emp-formacion-especifica","emp-notas",
   "emp-iban","emp-direccion","emp-neto-pactado"
  ].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("emp-estado").value = "activo";
  document.getElementById("emp-prl-horas").value = "";
  document.getElementById("emp-prl-basico").checked = false;
  document.getElementById("emp-apto-medico").checked = false;
}

function _rrhhRellenarFormEmpleado(e) {
  document.getElementById("emp-id").value = e.id || "";
  document.getElementById("emp-nombre").value = e.nombre || "";
  document.getElementById("emp-apellidos").value = e.apellidos || "";
  document.getElementById("emp-dni").value = e.dni || "";
  document.getElementById("emp-nss").value = e.nss || "";
  document.getElementById("emp-telefono").value = e.telefono || "";
  document.getElementById("emp-email").value = e.email || "";
  document.getElementById("emp-puesto").value = e.puesto || "";
  document.getElementById("emp-categoria").value = e.categoria || "";
  document.getElementById("emp-fecha-alta").value = e.fecha_alta || "";
  document.getElementById("emp-estado").value = e.estado || "activo";
  document.getElementById("emp-prl-basico").checked = e.prl_basico == 1;
  document.getElementById("emp-prl-horas").value = e.prl_basico_horas || "";
  document.getElementById("emp-prl-basico-cad").value = e.prl_basico_caducidad || "";
  document.getElementById("emp-prl-especifico").value = e.prl_especifico || "";
  document.getElementById("emp-prl-especifico-cad").value = e.prl_especifico_caducidad || "";
  document.getElementById("emp-apto-medico").checked = e.apto_medico == 1;
  document.getElementById("emp-apto-medico-cad").value = e.apto_medico_caducidad || "";
  document.getElementById("emp-carnet-conducir").value = e.carnet_conducir || "";
  document.getElementById("emp-carnet-conducir-cad").value = e.carnet_conducir_caducidad || "";
  document.getElementById("emp-carnet-maquinaria").value = e.carnet_maquinaria || "";
  document.getElementById("emp-carnet-maquinaria-cad").value = e.carnet_maquinaria_caducidad || "";
  document.getElementById("emp-formacion-especifica").value = e.formacion_especifica || "";
  document.getElementById("emp-notas").value = e.notas || "";
  var ibanEl = document.getElementById("emp-iban");
  if (ibanEl) ibanEl.value = e.iban || "";
  var dirEl = document.getElementById("emp-direccion");
  if (dirEl) dirEl.value = e.direccion || "";
  var netoEl = document.getElementById("emp-neto-pactado");
  if (netoEl) netoEl.value = e.neto_pactado || "";
}

function _rrhhRecogerFormEmpleado() {
  return {
    nombre: document.getElementById("emp-nombre").value.trim(),
    apellidos: document.getElementById("emp-apellidos").value.trim(),
    dni: document.getElementById("emp-dni").value.trim(),
    nss: document.getElementById("emp-nss").value.trim(),
    telefono: document.getElementById("emp-telefono").value.trim(),
    email: document.getElementById("emp-email").value.trim(),
    puesto: document.getElementById("emp-puesto").value.trim(),
    categoria: document.getElementById("emp-categoria").value.trim(),
    fecha_alta: document.getElementById("emp-fecha-alta").value,
    estado: document.getElementById("emp-estado").value,
    iban: (document.getElementById("emp-iban") || {}).value || "",
    direccion: (document.getElementById("emp-direccion") || {}).value || "",
    neto_pactado: parseFloat((document.getElementById("emp-neto-pactado") || {}).value) || 0,
    prl_basico: document.getElementById("emp-prl-basico").checked ? 1 : 0,
    prl_basico_horas: parseInt(document.getElementById("emp-prl-horas").value) || null,
    prl_basico_caducidad: document.getElementById("emp-prl-basico-cad").value,
    prl_especifico: document.getElementById("emp-prl-especifico").value.trim(),
    prl_especifico_caducidad: document.getElementById("emp-prl-especifico-cad").value,
    apto_medico: document.getElementById("emp-apto-medico").checked ? 1 : 0,
    apto_medico_caducidad: document.getElementById("emp-apto-medico-cad").value,
    carnet_conducir: document.getElementById("emp-carnet-conducir").value.trim(),
    carnet_conducir_caducidad: document.getElementById("emp-carnet-conducir-cad").value,
    carnet_maquinaria: document.getElementById("emp-carnet-maquinaria").value.trim(),
    carnet_maquinaria_caducidad: document.getElementById("emp-carnet-maquinaria-cad").value,
    formacion_especifica: document.getElementById("emp-formacion-especifica").value.trim(),
    notas: document.getElementById("emp-notas").value.trim()
  };
}

function _rrhhGuardarEmpleado() {
  var data = _rrhhRecogerFormEmpleado();
  if (!data.nombre) { alert("El nombre es obligatorio."); return; }
  var id = document.getElementById("emp-id").value;
  var url = id ? "/api/empleados/" + id : "/api/empleados";
  var method = id ? "PUT" : "POST";

  fetch(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
    .then(function (res) {
      if (!res.ok) { alert(res.data.error || "Error al guardar"); return; }
      _rrhhCerrarModalEmpleado();
      _rrhhCargarEmpleados();
    })
    .catch(function (err) { alert("Error de red: " + err.message); });
}

function _rrhhEditarEmpleado(id) {
  _rrhhAbrirModalEmpleado(id);
}

function _rrhhAbrirFichaDesdeEquipo(empId) {
  _rrhhFichaOrigen = "equipo";
  // Navigate to Nóminas subpanel and open ficha
  if (typeof activarSubpanel === "function") activarSubpanel("rrhh", "nominas");
  _rrhhCargarNominas();
  setTimeout(function () { _rrhhVerFichaEmpleado(empId, "equipo"); }, 150);
}

function _rrhhEliminarEmpleado(id, nombre) {
  if (!confirm("\u00bfDar de baja a " + nombre + "?")) return;
  fetch("/api/empleados/" + id, { method: "DELETE" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) { alert(d.error); return; }
      _rrhhCargarEmpleados();
    })
    .catch(function (err) { alert("Error: " + err.message); });
}

// ===============================================================================
// ==  3. NOMINAS (monthly payroll)                                             ==
// ===============================================================================

function _rrhhCargarNominas() {
  if (!_rrhhNominasInit) {
    _rrhhNominasInit = true;
    _rrhhInitImportHandlers();
    fetch("/api/rrhh/nominas/resumen-mensual")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var meses = d.meses || [];
        // Extract periodos sorted ascending, store them
        _rrhhPeriodos = meses.map(function (m) { return m.periodo; }).sort();
        var sel = document.getElementById("rrhh-nominas-periodo");
        if (sel) {
          sel.innerHTML = "";
          // Dropdown shows descending
          _rrhhPeriodos.slice().reverse().forEach(function (p) {
            sel.innerHTML += '<option value="' + p + '">' + _rrhhPeriodoToLabel(p) + '</option>';
          });
        }
        if (_rrhhPeriodos.length) {
          _rrhhPeriodoIdx = _rrhhPeriodos.length - 1; // most recent
          _rrhhSyncPeriodoUI();
          _rrhhCargarMes(_rrhhPeriodos[_rrhhPeriodoIdx]);
          _rrhhRenderNominasKpis(meses);
        }
      });
    var sel = document.getElementById("rrhh-nominas-periodo");
    if (sel) {
      sel.addEventListener("change", function () {
        var p = this.value;
        _rrhhPeriodoIdx = _rrhhPeriodos.indexOf(p);
        _rrhhSyncPeriodoUI();
        _rrhhCargarMes(p);
        _rrhhCerrarFicha();
      });
    }
  } else {
    if (_rrhhPeriodos.length && _rrhhPeriodoIdx >= 0) {
      _rrhhCargarMes(_rrhhPeriodos[_rrhhPeriodoIdx]);
    }
  }
}

function _rrhhRenderNominasKpis(meses) {
  var kpiDiv = document.getElementById("rrhh-nominas-kpis");
  if (!kpiDiv || !meses.length) return;
  // Show KPIs for the most recent month
  var last = meses[meses.length - 1];
  kpiDiv.innerHTML =
    _rrhhKpiCard("Empleados", last.num_empleados || 0, "") +
    _rrhhKpiCard("N\u00f3minas", last.num_nominas || 0, "") +
    _rrhhKpiCard("Finiquitos", last.num_finiquitos || 0, last.num_finiquitos > 0 ? " tes-card-red" : "") +
    _rrhhKpiCard("Total l\u00edquido", fmtEurFull(last.total_liquido), " tes-card-blue", "0.95rem") +
    _rrhhKpiCard("Coste empresa", fmtEurFull(last.total_coste_empresa), " tes-card-green", "0.95rem");
}

function _rrhhSyncPeriodoUI() {
  var sel = document.getElementById("rrhh-nominas-periodo");
  var label = document.getElementById("rrhh-nominas-label");
  if (_rrhhPeriodoIdx >= 0 && _rrhhPeriodoIdx < _rrhhPeriodos.length) {
    var p = _rrhhPeriodos[_rrhhPeriodoIdx];
    if (sel) sel.value = p;
    if (label) label.textContent = _rrhhPeriodoToLabel(p);
  }
}

function _rrhhMesPrev() {
  if (_rrhhPeriodoIdx > 0) {
    _rrhhPeriodoIdx--;
    _rrhhSyncPeriodoUI();
    _rrhhCargarMes(_rrhhPeriodos[_rrhhPeriodoIdx]);
    _rrhhCerrarFicha();
  }
}

function _rrhhMesNext() {
  if (_rrhhPeriodoIdx < _rrhhPeriodos.length - 1) {
    _rrhhPeriodoIdx++;
    _rrhhSyncPeriodoUI();
    _rrhhCargarMes(_rrhhPeriodos[_rrhhPeriodoIdx]);
    _rrhhCerrarFicha();
  }
}

function _rrhhCargarMes(periodo) {
  var tbody = document.getElementById("rrhh-tbody-nominas-mes");
  var tfoot = document.getElementById("rrhh-tfoot-nominas-mes");
  if (!tbody) return;
  _rrhhExpandedRow = null;
  tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;color:var(--text-secondary);">Cargando...</td></tr>';
  if (tfoot) tfoot.innerHTML = "";

  fetch("/api/rrhh/nominas/resumen-mensual/" + periodo)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.nominas || !d.nominas.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin n\u00f3minas para ' + _rrhhPeriodoToLabel(periodo) + '</td></tr>';
        return;
      }
      // Sort descending by coste_empresa
      var nominas = d.nominas.slice().sort(function (a, b) { return (b.coste_empresa || 0) - (a.coste_empresa || 0); });
      var html = "";
      var totCE = 0, totIrpf = 0, totSSEmp = 0, totLiqSinDietas = 0, totDietas = 0, totLiq = 0;
      nominas.forEach(function (n, i) {
        var esFin = n.tipo === "FINIQUITO";
        var rowBg = esFin ? "background:#FEF2F2;" : "";
        var nombre = (n.nombre || "") + (n.apellidos ? " " + n.apellidos : "");
        var liqSinDietas = (n.liquido || 0) - (n.dietas || 0);
        totCE += n.coste_empresa || 0;
        totIrpf += n.irpf_euros || 0;
        totSSEmp += n.ss_empresa || 0;
        totLiqSinDietas += liqSinDietas;
        totDietas += n.dietas || 0;
        totLiq += n.liquido || 0;
        html += '<tr data-nomina-idx="' + i + '" style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;' + rowBg + '" onclick="_rrhhToggleNominaDetail(this,' + i + ')">' +
          '<td style="padding:6px 8px;">' + (i + 1) + '</td>' +
          '<td style="padding:6px 8px;font-weight:500;white-space:nowrap;">' + nombre + '</td>' +
          '<td style="padding:6px 3px;"><a href="#" onclick="event.preventDefault();event.stopPropagation();_rrhhVerFichaEmpleado(' + n.empleado_id + ')" style="color:#3B82F6;font-size:0.75rem;">Ficha</a></td>' +
          '<td style="padding:6px 6px;">' + (n.dni || "\u2014") + '</td>' +
          '<td style="padding:6px 6px;">' + (esFin ? '<span style="color:#dc2626;font-weight:600;">FINIQ</span>' : 'NOM') + '</td>' +
          '<td style="padding:6px 6px;text-align:right;font-weight:600;">' + fmtEur(n.coste_empresa) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.irpf_euros) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.ss_empresa) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(liqSinDietas) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.dietas) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.liquido) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.coste_dia) + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
      // Store data for inline expand
      tbody._nominasData = nominas;

      if (tfoot) {
        tfoot.innerHTML = '<tr style="font-weight:700;background:var(--bg-secondary,#f8f9fa);">' +
          '<td colspan="5" style="padding:8px 6px;text-align:right;">TOTALES</td>' +
          '<td style="padding:8px 6px;text-align:right;">' + fmtEur(totCE) + '</td>' +
          '<td style="padding:8px 6px;text-align:right;">' + fmtEur(totIrpf) + '</td>' +
          '<td style="padding:8px 6px;text-align:right;">' + fmtEur(totSSEmp) + '</td>' +
          '<td style="padding:8px 6px;text-align:right;">' + fmtEur(totLiqSinDietas) + '</td>' +
          '<td style="padding:8px 6px;text-align:right;">' + fmtEur(totDietas) + '</td>' +
          '<td style="padding:8px 6px;text-align:right;">' + fmtEur(totLiq) + '</td>' +
          '<td></td></tr>';
      }
    })
    .catch(function () {
      tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;color:#dc3545;">Error al cargar</td></tr>';
    });
}

// -- Inline expand for nomina detail --
function _rrhhToggleNominaDetail(row, idx) {
  var tbody = row.parentNode;
  var existing = tbody.querySelector('tr.rrhh-nomina-detail[data-detail-for="' + idx + '"]');
  if (existing) {
    existing.remove();
    _rrhhExpandedRow = null;
    return;
  }
  // Close any other open detail
  var prev = tbody.querySelector("tr.rrhh-nomina-detail");
  if (prev) prev.remove();

  var nominas = tbody._nominasData;
  if (!nominas || !nominas[idx]) return;
  var n = nominas[idx];
  _rrhhExpandedRow = idx;

  var detailHtml = '<tr class="rrhh-nomina-detail" data-detail-for="' + idx + '">' +
    '<td colspan="12" style="padding:0;background:#f8fafc;">' +
    '<div style="padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:0.82rem;">';

  // Left: Devengos
  detailHtml += '<div>' +
    '<h4 style="margin:0 0 8px;font-size:0.85rem;color:#3B82F6;">Devengos</h4>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    _rrhhDetailLine("Salario base", n.salario_base) +
    _rrhhDetailLine("Plus asistencia", n.plus_asistencia) +
    _rrhhDetailLine("Extra mes", n.extra_mes) +
    _rrhhDetailLine("Mejora voluntaria", n.mejora_voluntaria) +
    _rrhhDetailLine("A cuenta convenio", n.a_cuenta_convenio) +
    _rrhhDetailLine("Dietas", n.dietas) +
    '<tr style="border-top:2px solid var(--border,#e9ecef);font-weight:700;">' +
      '<td style="padding:4px 0;">Total devengado</td>' +
      '<td style="padding:4px 0;text-align:right;">' + fmtEur(n.total_devengado) + '</td></tr>' +
    '</table></div>';

  // Right: Deducciones
  var irpfLabel = n.irpf_porcentaje ? "IRPF (" + n.irpf_porcentaje + "%)" : "IRPF";
  detailHtml += '<div>' +
    '<h4 style="margin:0 0 8px;font-size:0.85rem;color:#EF4444;">Deducciones</h4>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    _rrhhDetailLine("Cot. CC", n.cot_cc) +
    _rrhhDetailLine("Cot. MEI", n.cot_mei) +
    _rrhhDetailLine("Cot. FP", n.cot_fp) +
    _rrhhDetailLine("Cot. Desempleo", n.cot_desempleo) +
    _rrhhDetailLine(irpfLabel, n.irpf_euros) +
    _rrhhDetailLine("Embargo", n.embargo) +
    '<tr style="border-top:2px solid var(--border,#e9ecef);font-weight:700;">' +
      '<td style="padding:4px 0;">Total deducir</td>' +
      '<td style="padding:4px 0;text-align:right;">' + fmtEur(n.total_deducir) + '</td></tr>' +
    '</table></div>';

  detailHtml += '</div>';

  // Bottom summary bar
  detailHtml += '<div style="padding:8px 16px;background:#EFF6FF;border-top:1px solid var(--border,#e9ecef);display:flex;gap:24px;font-size:0.82rem;flex-wrap:wrap;">' +
    '<span><b>L\u00edquido:</b> ' + fmtEurFull(n.liquido) + '</span>' +
    '<span><b>D\u00edas:</b> ' + (n.dias || "\u2014") + '</span>' +
    '<span><b>SS Empresa:</b> ' + fmtEurFull(n.ss_empresa) + '</span>' +
    '<span><b>Coste empresa:</b> ' + fmtEurFull(n.coste_empresa) + '</span>' +
    '<span><b>Coste/d\u00eda:</b> ' + fmtEurFull(n.coste_dia) + '</span>' +
    '<a href="#" onclick="event.preventDefault();_rrhhVerFichaEmpleado(' + n.empleado_id + ')" style="color:#3B82F6;text-decoration:underline;margin-left:auto;">Ver ficha empleado \u2192</a>' +
    '</div>';

  detailHtml += '</td></tr>';

  // Insert after current row
  row.insertAdjacentHTML("afterend", detailHtml);
}

function _rrhhDetailLine(label, value) {
  if (value == null || value === 0) return "";
  return '<tr><td style="padding:3px 0;color:var(--text-secondary);">' + label + '</td>' +
    '<td style="padding:3px 0;text-align:right;">' + fmtEur(value) + '</td></tr>';
}

// -- Employee detail sheet (ficha) --
function _rrhhVerFichaEmpleado(empId, origen) {
  _rrhhFichaOrigen = origen || "nominas";
  var wrapper = document.getElementById("rrhh-nominas-tabla-wrapper");
  if (wrapper) wrapper.style.display = "none";
  var fichaDiv = document.getElementById("rrhh-ficha-empleado");
  var contenido = document.getElementById("rrhh-ficha-contenido");
  if (fichaDiv) fichaDiv.style.display = "block";
  if (contenido) contenido.innerHTML = '<p style="padding:1rem;color:var(--text-secondary);">Cargando ficha...</p>';

  Promise.all([
    fetch("/api/rrhh/empleados/" + empId).then(function (r) { return r.json(); }),
    fetch("/api/rrhh/empleados/" + empId + "/nominas").then(function (r) { return r.json(); })
  ]).then(function (results) {
    var emp = results[0];
    var nominas = (results[1].nominas || []).slice().sort(function (a, b) {
      return b.periodo > a.periodo ? 1 : b.periodo < a.periodo ? -1 : 0;
    });
    if (emp.error) { contenido.innerHTML = '<p style="color:#dc3545;">' + emp.error + '</p>'; return; }
    var res = emp.resumen || {};
    var nombreCompleto = (emp.nombre || "") + (emp.apellidos ? " " + emp.apellidos : "");
    var estadoColor = emp.estado === "activo" ? "#22c55e" : emp.estado === "exempleado" ? "#ef4444" : "#f59e0b";
    var estadoLabel = emp.estado ? emp.estado.charAt(0).toUpperCase() + emp.estado.slice(1) : "";

    // Calculate salary averages from last 3 nominas
    var last3 = nominas.filter(function (n) { return n.tipo === "NOMINA"; }).slice(0, 3);
    var salMes = 0, costeMes = 0;
    if (last3.length) {
      var sumDev = 0, sumCE = 0, sumDiet = 0;
      last3.forEach(function (n) { sumDev += (n.total_devengado || 0); sumCE += (n.coste_empresa || 0); sumDiet += (n.dietas || 0); });
      salMes = Math.round((sumDev - sumDiet) / last3.length);
      costeMes = Math.round((sumCE - sumDiet) / last3.length);
    }

    var html = '';
    // Card 1: Información General (borde azul)
    html += '<div class="card" style="border-left:4px solid #3B82F6;padding:14px 16px;margin-bottom:12px;">';
    html += '<h4 style="margin:0 0 8px;font-size:0.85rem;color:#3B82F6;text-transform:uppercase;letter-spacing:0.5px;">Informaci\u00f3n General</h4>';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">';
    html += '<h3 style="margin:0;font-size:1.05rem;">' + nombreCompleto + '</h3>';
    html += '<span style="padding:2px 10px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:' + estadoColor + '20;color:' + estadoColor + ';">' + estadoLabel + '</span>';
    html += '</div>';
    html += '<div style="font-size:0.82rem;color:var(--text-secondary);display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">';
    html += '<span><b>DNI:</b> ' + (emp.dni || "\u2014") + '</span>';
    html += '<span><b>M\u00f3vil:</b> ' + (emp.telefono || "\u2014") + '</span>';
    html += '<span><b>Email:</b> ' + (emp.email || "\u2014") + '</span>';
    html += '<span><b>Cuenta:</b> ' + (emp.iban || "\u2014") + '</span>';
    html += '</div></div>';

    // Card 2: Información Operativa (borde verde)
    html += '<div class="card" style="border-left:4px solid #10B981;padding:14px 16px;margin-bottom:12px;">';
    html += '<h4 style="margin:0 0 8px;font-size:0.85rem;color:#10B981;text-transform:uppercase;letter-spacing:0.5px;">Informaci\u00f3n Operativa</h4>';
    html += '<div style="font-size:0.82rem;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">';
    html += '<span><b>Categor\u00eda:</b> ' + (emp.categoria || "\u2014") + '</span>';
    html += '<span><b>Antig\u00fcedad:</b> ' + (emp.fecha_antiguedad || "\u2014") + '</span>';
    html += '<span><b>Salario mensual (s/dietas):</b> ' + fmtEurFull(salMes) + '</span>';
    html += '<span><b>Coste empresa mensual (s/dietas):</b> ' + fmtEurFull(costeMes) + '</span>';
    html += '<span><b>Salario anual (s/dietas):</b> ' + fmtEurFull(salMes * 12) + '</span>';
    html += '<span><b>Coste empresa anual (s/dietas):</b> ' + fmtEurFull(costeMes * 12) + '</span>';
    html += '<span><b>Meses activos:</b> ' + (res.meses_activos || 0) + '</span>';
    html += '<span><b>\u00daltimo coste/d\u00eda:</b> ' + fmtEurFull(res.ultimo_coste_dia) + '</span>';
    html += '</div></div>';

    // Mini chart: evolución coste_empresa
    if (nominas.length >= 2) {
      html += '<div class="card" style="padding:12px;margin-bottom:12px;">';
      html += '<h4 style="margin:0 0 8px;font-size:0.85rem;font-weight:700;">Evoluci\u00f3n coste empresa</h4>';
      html += '<div style="position:relative;height:180px;"><canvas id="rrhh-ficha-chart"></canvas></div>';
      html += '</div>';
    }

    // Nominas table (descending)
    html += '<div class="card" style="overflow-x:auto;padding:0;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">';
    html += '<thead><tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;">';
    html += '<th style="padding:7px 8px;font-weight:700;">Periodo</th>';
    html += '<th style="padding:7px 6px;font-weight:700;">Tipo</th>';
    html += '<th style="padding:7px 6px;font-weight:700;text-align:right;">D\u00edas</th>';
    html += '<th style="padding:7px 6px;font-weight:700;text-align:right;">Sal. Base</th>';
    html += '<th style="padding:7px 6px;font-weight:700;text-align:right;">Dietas</th>';
    html += '<th style="padding:7px 6px;font-weight:700;text-align:right;">L\u00edquido</th>';
    html += '<th style="padding:7px 6px;font-weight:700;text-align:right;">Coste Empresa</th>';
    html += '<th style="padding:7px 6px;font-weight:700;text-align:right;">Coste/D\u00eda</th>';
    html += '</tr></thead><tbody>';
    if (!nominas.length) {
      html += '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin n\u00f3minas</td></tr>';
    } else {
      nominas.forEach(function (n) {
        var esFin = n.tipo === "FINIQUITO";
        var rowBg = esFin ? "background:#FEF2F2;" : "";
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);' + rowBg + '">';
        html += '<td style="padding:6px 8px;font-weight:500;">' + n.periodo + '</td>';
        html += '<td style="padding:6px 6px;">' + (esFin ? '<span style="color:#dc2626;font-weight:600;">FINIQ</span>' : 'NOM') + '</td>';
        html += '<td style="padding:6px 6px;text-align:right;">' + (n.dias || "\u2014") + '</td>';
        html += '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.salario_base) + '</td>';
        html += '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.dietas) + '</td>';
        html += '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.liquido) + '</td>';
        html += '<td style="padding:6px 6px;text-align:right;font-weight:600;">' + fmtEur(n.coste_empresa) + '</td>';
        html += '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.coste_dia) + '</td>';
        html += '</tr>';
      });
    }
    html += '</tbody></table></div>';

    contenido.innerHTML = html;

    // Render mini chart if available
    var fichaCanvas = document.getElementById("rrhh-ficha-chart");
    if (fichaCanvas && nominas.length >= 2) {
      var chronological = nominas.slice().sort(function (a, b) { return a.periodo > b.periodo ? 1 : -1; });
      if (_rrhhFichaChart) _rrhhFichaChart.destroy();
      _rrhhFichaChart = new Chart(fichaCanvas.getContext("2d"), {
        type: "line",
        data: {
          labels: chronological.map(function (n) { return n.periodo; }),
          datasets: [{
            label: "Coste empresa",
            data: chronological.map(function (n) { return n.coste_empresa || 0; }),
            borderColor: "#3B82F6",
            backgroundColor: "rgba(59,130,246,0.1)",
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { ticks: { callback: function (v) { return fmtEur(v); } } } }
        }
      });
    }
  }).catch(function (err) {
    contenido.innerHTML = '<p style="color:#dc3545;">Error: ' + err.message + '</p>';
  });
}

function _rrhhCerrarFicha() {
  document.getElementById("rrhh-ficha-empleado").style.display = "none";
  document.getElementById("rrhh-nominas-tabla-wrapper").style.display = "";
  if (_rrhhFichaOrigen && _rrhhFichaOrigen !== "nominas") {
    if (typeof activarSubpanel === "function") activarSubpanel("rrhh", _rrhhFichaOrigen);
  }
}

// -- Navigate from dashboard --
function _rrhhVerMes(periodo) {
  if (typeof activarSubpanel === "function") activarSubpanel("rrhh", "nominas");
  _rrhhCargarNominas();
  setTimeout(function () {
    var idx = _rrhhPeriodos.indexOf(periodo);
    if (idx >= 0) {
      _rrhhPeriodoIdx = idx;
      _rrhhSyncPeriodoUI();
      _rrhhCargarMes(periodo);
    }
  }, 150);
}

// ===============================================================================
// ==  3b. NOMINAS - Import handlers (Excel + PDF OCR)                          ==
// ===============================================================================

function _rrhhInitImportHandlers() {
  if (_rrhhImportInit) return;
  _rrhhImportInit = true;

  // Excel import
  var fileInput = document.getElementById("rrhh-import-file");
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      if (!this.files.length) return;
      var fd = new FormData();
      fd.append("archivo", this.files[0]);
      fetch("/api/rrhh/importar-nominas", { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { alert("Error: " + d.error); return; }
          alert("Importaci\u00f3n: " + (d.empleados_creados || 0) + " creados, " + (d.empleados_actualizados || 0) + " actualizados, " + (d.nominas_importadas || 0) + " n\u00f3minas, " + (d.finiquitos_importados || 0) + " finiquitos");
          _rrhhNominasInit = false;
          _rrhhCargarNominas();
        })
        .catch(function (err) { alert("Error: " + err.message); });
      this.value = "";
    });
  }

  // PDF OCR import
  var pdfInput = document.getElementById("rrhh-import-pdf");
  if (pdfInput) {
    pdfInput.addEventListener("change", function () {
      if (!this.files.length) return;
      var fd = new FormData();
      for (var i = 0; i < this.files.length; i++) fd.append("archivos", this.files[i]);
      var progress = document.getElementById("rrhh-ocr-progress");
      var preview = document.getElementById("rrhh-ocr-preview");
      if (preview) preview.style.display = "block";
      if (progress) {
        progress.style.display = "block";
        progress.textContent = "Procesando " + this.files.length + " archivo(s) con OCR...";
        progress.style.background = "";
      }
      var ocrTbody = document.getElementById("rrhh-ocr-tbody");
      if (ocrTbody) ocrTbody.innerHTML = "";
      var confirmBtn = document.getElementById("rrhh-ocr-confirmar");
      if (confirmBtn) confirmBtn.disabled = true;

      fetch("/api/rrhh/procesar-nominas-pdf", { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (progress) progress.style.display = "none";
          if (d.error) {
            if (progress) { progress.style.display = "block"; progress.textContent = "Error: " + d.error; }
            return;
          }
          _rrhhOCRData = d.nominas || [];
          _rrhhRenderOCRPreview(_rrhhOCRData);
          if (_rrhhOCRData.length && confirmBtn) confirmBtn.disabled = false;
        })
        .catch(function (err) {
          if (progress) { progress.textContent = "Error: " + err.message; progress.style.background = "#FEE2E2"; }
        });
      this.value = "";
    });
  }
}

function _rrhhRenderOCRPreview(nominas) {
  var tbody = document.getElementById("rrhh-ocr-tbody");
  if (!tbody) return;
  if (!nominas.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;">No se extrajeron n\u00f3minas</td></tr>';
    return;
  }
  var html = "";
  nominas.forEach(function (n) {
    var esFin = n.tipo === "FINIQUITO";
    var rowBg = esFin ? "background:#FEF2F2;" : "";
    var estado = n._estado || "?";
    var estadoHtml = estado === "match"
      ? '<span style="color:#22c55e;font-weight:600;" title="' + (n._emp_nombre || '') + '">Match</span>'
      : estado === "nuevo"
        ? '<span style="color:#f59e0b;font-weight:600;">Nuevo</span>'
        : '<span style="color:#ef4444;font-weight:600;">Error</span>';
    html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);' + rowBg + '">' +
      '<td style="padding:5px 6px;font-weight:500;" title="' + (n._archivo || '') + '">' + (n.nombre || '-') + '</td>' +
      '<td style="padding:5px 6px;">' + (n.dni || '-') + '</td>' +
      '<td style="padding:5px 6px;">' + (n.periodo || '-') + '</td>' +
      '<td style="padding:5px 6px;">' + (esFin ? '<span style="color:#dc2626;">FINIQ</span>' : 'NOM') + '</td>' +
      '<td style="padding:5px 6px;text-align:right;">' + (n.dias || '-') + '</td>' +
      '<td style="padding:5px 6px;text-align:right;">' + fmtEur(n.total_devengado) + '</td>' +
      '<td style="padding:5px 6px;text-align:right;">' + fmtEur(n.total_deducir) + '</td>' +
      '<td style="padding:5px 6px;text-align:right;">' + fmtEur(n.liquido) + '</td>' +
      '<td style="padding:5px 6px;text-align:right;font-weight:600;">' + fmtEur(n.coste_empresa) + '</td>' +
      '<td style="padding:5px 6px;">' + estadoHtml + '</td>' +
      '</tr>';
  });
  tbody.innerHTML = html;
}

function _rrhhConfirmarOCR() {
  if (!_rrhhOCRData.length) return;
  if (!confirm("Importar " + _rrhhOCRData.length + " n\u00f3mina(s) a la base de datos?")) return;
  var btn = document.getElementById("rrhh-ocr-confirmar");
  if (btn) btn.disabled = true;
  fetch("/api/rrhh/confirmar-nominas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nominas: _rrhhOCRData })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (d.error) { alert("Error: " + d.error); return; }
    var msg = "Importaci\u00f3n completada:\n" +
      (d.insertadas || 0) + " n\u00f3minas insertadas\n" +
      (d.actualizadas || 0) + " n\u00f3minas actualizadas\n" +
      (d.empleados_creados || 0) + " empleados creados";
    if (d.errores && d.errores.length) msg += "\n\nErrores: " + d.errores.join("; ");
    alert(msg);
    _rrhhCerrarOCR();
    _rrhhNominasInit = false;
    _rrhhImportInit = false;
    _rrhhCargarNominas();
  })
  .catch(function (err) { alert("Error: " + err.message); });
}

function _rrhhCerrarOCR() {
  var preview = document.getElementById("rrhh-ocr-preview");
  if (preview) preview.style.display = "none";
  _rrhhOCRData = [];
}

// ===============================================================================
// ==  4. VERIFICADOR                                                           ==
// ===============================================================================

function _rrhhCargarVerificador() {
  var container = document.getElementById("rrhh-verificador-contenido");
  if (!container) return;

  // Render pills
  var pillsHtml = '<div style="display:flex;gap:6px;margin-bottom:12px;">';
  [["check","Check N\u00f3minas"],["estimacion","Estimaci\u00f3n N\u00f3minas"]].forEach(function (v) {
    var active = _rrhhVerifVista === v[0];
    pillsHtml += '<button onclick="_rrhhVerifVista=\'' + v[0] + '\';_rrhhVerifInit=false;_rrhhEstimInit=false;_rrhhCargarVerificador()" style="padding:5px 14px;border-radius:9999px;font-size:0.82rem;font-weight:' + (active ? '700' : '400') + ';border:1px solid ' + (active ? '#3B82F6' : 'var(--border,#ccc)') + ';background:' + (active ? '#EFF6FF' : 'transparent') + ';color:' + (active ? '#3B82F6' : 'inherit') + ';cursor:pointer;">' + v[1] + '</button>';
  });
  pillsHtml += '</div><div id="rrhh-verif-vista-body"></div>';
  container.innerHTML = pillsHtml;

  var body = document.getElementById("rrhh-verif-vista-body");
  if (_rrhhVerifVista === "check") {
    _rrhhVerifCheckView(body);
  } else {
    _rrhhVerifEstimacionView(body);
  }
}

function _rrhhVerifCheckView(body) {
  body.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<label style="font-weight:600;font-size:0.9rem;">Mes:</label>' +
        '<select id="rrhh-verif-periodo" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:0.88rem;"></select>' +
      '</div>' +
      '<button onclick="_rrhhGenerarRemesa()" class="btn-small" style="background:#DCFCE7;color:#166534;border:1px solid #86EFAC;">Generar remesa CSV</button>' +
    '</div>' +
    '<div id="rrhh-verif-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;"></div>' +
    '<div class="card" style="overflow-x:auto;padding:0;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">' +
        '<thead><tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;">' +
          '<th style="padding:6px 6px;font-weight:700;">Nombre</th>' +
          '<th style="padding:6px 3px;font-weight:700;"></th>' +
          '<th style="padding:6px 4px;font-weight:700;">DNI</th>' +
          '<th style="padding:6px 4px;font-weight:700;">Cat.</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">D\u00edas</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">Neto pactado</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">Dietas</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">Estimado</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;border-left:2px solid var(--border,#e9ecef);">L\u00edquido</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">Diferencia</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;border-left:2px solid var(--border,#e9ecef);">Adelantos</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;font-weight:800;">A TRANSFERIR</th>' +
        '</tr></thead>' +
        '<tbody id="rrhh-verif-tbody"><tr><td colspan="12" style="text-align:center;padding:2rem;">Selecciona un mes</td></tr></tbody>' +
        '<tfoot id="rrhh-verif-tfoot" style="font-weight:700;background:var(--bg-secondary,#f8f9fa);"></tfoot>' +
      '</table>' +
    '</div>';

  if (!_rrhhVerifInit) {
    _rrhhVerifInit = true;
    fetch("/api/rrhh/estadisticas")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var periodos = d.periodos || [];
        var sel = document.getElementById("rrhh-verif-periodo");
        if (!sel) return;
        sel.innerHTML = "";
        periodos.slice().reverse().forEach(function (p) {
          sel.innerHTML += '<option value="' + p + '">' + _rrhhPeriodoToLabel(p) + '</option>';
        });
        if (periodos.length) {
          sel.value = periodos[periodos.length - 1];
          _rrhhLoadVerif(sel.value);
        }
      });
    var sel = document.getElementById("rrhh-verif-periodo");
    if (sel) sel.addEventListener("change", function () { _rrhhLoadVerif(this.value); });
  }
}

function _rrhhLoadVerif(periodo) {
  var tbody = document.getElementById("rrhh-verif-tbody");
  var tfoot = document.getElementById("rrhh-verif-tfoot");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;">Cargando...</td></tr>';
  if (tfoot) tfoot.innerHTML = "";

  fetch("/api/rrhh/verificador/" + periodo)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var tot = d.totales || {};

      // KPIs
      var kpis = document.getElementById("rrhh-verif-kpis");
      if (kpis) {
        kpis.innerHTML =
          _rrhhKpiCard("N\u00f3minas", tot.nominas || 0, "") +
          _rrhhKpiCard("Total l\u00edquido", fmtEurFull(tot.liquido), " tes-card-blue", "0.9rem") +
          _rrhhKpiCard("Adelantos", fmtEurFull(tot.adelantos), "", "0.9rem") +
          _rrhhKpiCard("Embargos", fmtEurFull(tot.embargo), "", "0.9rem") +
          _rrhhKpiCard("A TRANSFERIR", fmtEurFull(tot.transferir), " tes-card-green", "0.9rem");
      }

      var lineas = (d.lineas || []).slice().sort(function (a, b) {
        return (b.a_transferir || 0) - (a.a_transferir || 0);
      });
      if (!lineas.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;">Sin datos</td></tr>';
        return;
      }
      var html = "";
      lineas.forEach(function (l) {
        var esFin = l.tipo === "FINIQUITO";
        var bg = esFin ? "background:#FEF2F2;" : "";
        // Verificador: 3 visual blocks
        // Block 1 (Estimacion): Nombre | Ficha | DNI | Cat | Dias | Neto pactado | Dietas | Estimado
        // Block 2 (Nomina real): Liquido | Diferencia
        // Block 3 (Transferencia): Adelantos | A Transferir
        var difVal = l.diferencia != null ? l.diferencia : ((l.liquido || 0) - (l.estimado || l.liquido || 0));
        var absDif = Math.abs(difVal);
        var difColor = absDif < 5 ? "#16a34a" : absDif <= 50 ? "#ca8a04" : "#dc2626";
        var difBg = absDif < 5 ? "#f0fdf4" : absDif <= 50 ? "#fefce8" : "#fef2f2";
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);' + bg + '">' +
          '<td style="padding:5px 6px;font-weight:500;">' + (l.nombre || "") + '</td>' +
          '<td style="padding:5px 3px;"><a href="#" onclick="event.preventDefault();event.stopPropagation();_rrhhVerFichaEmpleado(' + l.empleado_id + ',\'verificador\')" style="color:#3B82F6;font-size:0.75rem;">Ficha</a></td>' +
          '<td style="padding:5px 4px;">' + (l.dni || "\u2014") + '</td>' +
          '<td style="padding:5px 4px;font-size:0.75rem;">' + (l.categoria || "") + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (l.dias || "\u2014") + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + fmtEur(l.neto_proporcional || l.neto_pactado) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + fmtEur(l.dietas) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + fmtEur(l.estimado) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;border-left:2px solid var(--border,#e9ecef);">' + fmtEur(l.liquido) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;background:' + difBg + ';color:' + difColor + ';font-weight:600;">' + fmtEur(difVal) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;border-left:2px solid var(--border,#e9ecef);">' + (l.adelantos > 0 ? '<span style="color:#dc2626;">(' + fmtEur(l.adelantos) + ')</span>' : '\u2014') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;font-weight:700;">' + fmtEur(l.a_transferir) + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;

      if (tfoot) {
        tfoot.innerHTML = '<tr style="font-weight:700;background:var(--bg-secondary,#f8f9fa);">' +
          '<td colspan="5" style="padding:6px;">TOTALES</td>' +
          '<td style="padding:6px;text-align:right;">' + fmtEur(tot.neto_proporcional) + '</td>' +
          '<td style="padding:6px;text-align:right;">' + fmtEur(tot.dietas) + '</td>' +
          '<td style="padding:6px;text-align:right;">' + fmtEur(tot.estimado) + '</td>' +
          '<td style="padding:6px;text-align:right;border-left:2px solid var(--border,#e9ecef);">' + fmtEur(tot.liquido) + '</td>' +
          '<td style="padding:6px;text-align:right;">' + fmtEur(tot.diferencia) + '</td>' +
          '<td style="padding:6px;text-align:right;border-left:2px solid var(--border,#e9ecef);">' + fmtEur(tot.adelantos) + '</td>' +
          '<td style="padding:6px;text-align:right;font-weight:800;">' + fmtEur(tot.transferir) + '</td>' +
          '</tr>';
      }
    })
    .catch(function () {
      tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;color:#dc3545;">Error al cargar</td></tr>';
    });
}

function _rrhhGenerarRemesa() {
  var sel = document.getElementById("rrhh-verif-periodo");
  var periodo = sel ? sel.value : "";
  if (!periodo) { alert("Selecciona un periodo"); return; }
  fetch("/api/rrhh/verificador/" + periodo + "/generar-remesa", { method: "POST" })
    .then(function (r) {
      if (!r.ok) throw new Error("Error al generar remesa");
      return r.blob();
    })
    .then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "remesa_" + periodo + ".csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    })
    .catch(function (err) { alert(err.message); });
}

// ── Estimación Nóminas sub-view ──

function _rrhhVerifEstimacionView(body) {
  var now = new Date();
  var curY = now.getFullYear();
  var curM = now.getMonth() + 1;

  body.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
      '<label style="font-weight:600;font-size:0.9rem;">A\u00f1o:</label>' +
      '<select id="rrhh-estim-anio" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:0.88rem;"></select>' +
      '<label style="font-weight:600;font-size:0.9rem;margin-left:8px;">Mes:</label>' +
      '<select id="rrhh-estim-mes" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:0.88rem;"></select>' +
    '</div>' +
    '<div id="rrhh-estim-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px;"></div>' +
    '<div class="card" style="overflow-x:auto;padding:0;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">' +
        '<thead><tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;">' +
          '<th style="padding:6px 6px;font-weight:700;">Empleado</th>' +
          '<th style="padding:6px 3px;font-weight:700;"></th>' +
          '<th style="padding:6px 4px;font-weight:700;">Cat.</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">D\u00edas planif.</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">Neto pactado</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">% IRPF hist.</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">% SS hist.</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;font-weight:800;">Coste empresa</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">Dietas estim.</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">Total devengado</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;">Adelantos</th>' +
          '<th style="padding:6px 4px;font-weight:700;text-align:right;font-weight:800;background:#F0FDF4;">L\u00edquido pendiente</th>' +
        '</tr></thead>' +
        '<tbody id="rrhh-estim-tbody"><tr><td colspan="12" style="text-align:center;padding:2rem;">Cargando...</td></tr></tbody>' +
        '<tfoot id="rrhh-estim-tfoot" style="font-weight:700;background:var(--bg-secondary,#f8f9fa);"></tfoot>' +
      '</table>' +
    '</div>';

  // Populate year/month selectors
  var selY = document.getElementById("rrhh-estim-anio");
  var selM = document.getElementById("rrhh-estim-mes");
  for (var yi = curY - 2; yi <= curY + 1; yi++) {
    selY.innerHTML += '<option value="' + yi + '"' + (yi === curY ? ' selected' : '') + '>' + yi + '</option>';
  }
  var meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  for (var mi = 1; mi <= 12; mi++) {
    selM.innerHTML += '<option value="' + mi + '"' + (mi === curM ? ' selected' : '') + '>' + meses[mi - 1] + '</option>';
  }
  selY.addEventListener("change", function () { _rrhhLoadEstimacion(); });
  selM.addEventListener("change", function () { _rrhhLoadEstimacion(); });

  _rrhhLoadEstimacion();
}

function _rrhhLoadEstimacion() {
  var selY = document.getElementById("rrhh-estim-anio");
  var selM = document.getElementById("rrhh-estim-mes");
  if (!selY || !selM) return;
  var periodo = selY.value + "-" + (selM.value < 10 ? "0" : "") + selM.value;

  var tbody = document.getElementById("rrhh-estim-tbody");
  var tfoot = document.getElementById("rrhh-estim-tfoot");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;">Cargando...</td></tr>';
  if (tfoot) tfoot.innerHTML = "";

  fetch("/api/rrhh/verificador/estimacion/" + periodo)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var tot = d.totales || {};

      // KPIs
      var kpis = document.getElementById("rrhh-estim-kpis");
      if (kpis) {
        kpis.innerHTML =
          _rrhhKpiCard("Empleados", tot.empleados || 0, "") +
          _rrhhKpiCard("Coste empresa total", fmtEurFull(tot.coste_total), " tes-card-blue", "0.9rem") +
          _rrhhKpiCard("Dietas estimadas", fmtEurFull(tot.dietas), "", "0.9rem") +
          _rrhhKpiCard("Adelantos", fmtEurFull(tot.adelantos), "", "0.9rem") +
          _rrhhKpiCard("L\u00edquido pendiente", fmtEurFull(tot.liquido_pendiente), " tes-card-green", "0.9rem");
      }

      var lineas = d.lineas || [];
      if (!lineas.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;">Sin empleados activos</td></tr>';
        return;
      }
      var html = "";
      lineas.forEach(function (l) {
        var warn = l.fallback ? ' title="Ratios estimados por defecto (sin hist\u00f3rico)" style="color:#ca8a04;"' : '';
        var rowBg = l.fallback ? "background:#FFFBEB;" : "";
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);' + rowBg + '">' +
          '<td style="padding:5px 6px;font-weight:500;">' + (l.fallback ? '\u26a0\ufe0f ' : '') + (l.nombre || "") + '</td>' +
          '<td style="padding:5px 3px;"><a href="#" onclick="event.preventDefault();event.stopPropagation();_rrhhVerFichaEmpleado(' + l.empleado_id + ',\'verificador\')" style="color:#3B82F6;font-size:0.75rem;">Ficha</a></td>' +
          '<td style="padding:5px 4px;font-size:0.75rem;">' + (l.categoria || "") + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (l.dias_planif || 0) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + fmtEur(l.neto_pactado) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;"' + warn + '>' + (l.pct_irpf != null ? l.pct_irpf.toFixed(2) + '%' : '\u2014') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;"' + warn + '>' + (l.pct_ss != null ? l.pct_ss.toFixed(2) + '%' : '\u2014') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;font-weight:700;">' + fmtEur(l.coste_total) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + fmtEur(l.dietas) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + fmtEur(l.total_devengado) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (l.adelantos > 0 ? '<span style="color:#dc2626;">(' + fmtEur(l.adelantos) + ')</span>' : '\u2014') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;font-weight:700;background:#F0FDF4;">' + fmtEur(l.liquido_pendiente) + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;

      if (tfoot) {
        tfoot.innerHTML = '<tr style="font-weight:700;background:var(--bg-secondary,#f8f9fa);">' +
          '<td colspan="4" style="padding:6px;">TOTALES</td>' +
          '<td style="padding:6px;text-align:right;">' + fmtEur(tot.neto_proporcional) + '</td>' +
          '<td colspan="2"></td>' +
          '<td style="padding:6px;text-align:right;font-weight:800;">' + fmtEur(tot.coste_total) + '</td>' +
          '<td style="padding:6px;text-align:right;">' + fmtEur(tot.dietas) + '</td>' +
          '<td style="padding:6px;text-align:right;">' + fmtEur(tot.total_devengado) + '</td>' +
          '<td style="padding:6px;text-align:right;">' + fmtEur(tot.adelantos) + '</td>' +
          '<td style="padding:6px;text-align:right;font-weight:800;background:#F0FDF4;">' + fmtEur(tot.liquido_pendiente) + '</td>' +
          '</tr>';
      }
    })
    .catch(function () {
      tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;color:#dc3545;">Error al cargar</td></tr>';
    });
}

// ===============================================================================
// ==  5. DIETAS                                                                ==
// ===============================================================================

function _rrhhCargarDietas() {
  var container = document.getElementById("rrhh-dietas-contenido");
  if (!container) return;

  // Render pills
  var pillsHtml = '<div style="display:flex;gap:6px;margin-bottom:12px;">';
  [["calendario","Calendario"],["resumen","Resumen"],["empleado","Por empleado"],["config","Tarifas"]].forEach(function (v) {
    var active = _rrhhDietasVista === v[0];
    pillsHtml += '<button onclick="_rrhhDietasVista=\'' + v[0] + '\';_rrhhCargarDietas()" style="padding:5px 14px;border-radius:9999px;font-size:0.82rem;font-weight:' + (active ? '700' : '400') + ';border:1px solid ' + (active ? '#3B82F6' : 'var(--border,#ccc)') + ';background:' + (active ? '#EFF6FF' : 'transparent') + ';color:' + (active ? '#3B82F6' : 'inherit') + ';cursor:pointer;">' + v[1] + '</button>';
  });
  pillsHtml += '</div><div id="rrhh-dietas-vista-body"></div>';
  container.innerHTML = pillsHtml;

  var body = document.getElementById("rrhh-dietas-vista-body");
  if (_rrhhDietasVista === "calendario") {
    _rrhhDietasCalendario(body);
  } else if (_rrhhDietasVista === "resumen") {
    _rrhhDietasResumen(body);
  } else if (_rrhhDietasVista === "config") {
    _rrhhDietasConfigView(body);
  } else {
    _rrhhDietasEmpleado(body);
  }
}

function _rrhhDietasCalendario(body) {
  var now = new Date();
  var anio = now.getFullYear(), mes = now.getMonth() + 1;
  body.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">' +
    '<label style="font-size:0.82rem;font-weight:600;">A\u00f1o:</label>' +
    '<select id="rrhh-dietas-cal-anio" style="width:75px;padding:4px 6px;border:1px solid var(--border,#ccc);border-radius:5px;font-size:0.82rem;" onchange="_rrhhDietasCalReload()">' +
    '<option value="2025"' + (anio===2025?' selected':'') + '>2025</option><option value="2026"' + (anio===2026?' selected':'') + '>2026</option><option value="2027">2027</option></select>' +
    '<label style="font-size:0.82rem;font-weight:600;">Mes:</label>' +
    '<select id="rrhh-dietas-cal-mesn" style="width:115px;padding:4px 6px;border:1px solid var(--border,#ccc);border-radius:5px;font-size:0.82rem;" onchange="_rrhhDietasCalReload()">' +
    _MESES_NOMBRE.map(function(n,i){return '<option value="'+(i+1)+'"'+(i+1===mes?' selected':'')+'>'+n+'</option>';}).join('') +
    '</select>' +
    '<label style="font-size:0.82rem;font-weight:600;margin-left:8px;">Proyecto:</label>' +
    '<select id="rrhh-dietas-cal-proy" style="max-width:200px;padding:4px 6px;border:1px solid var(--border,#ccc);border-radius:5px;font-size:0.82rem;" onchange="_rrhhDietasCalReload()">' +
    '<option value="">Todos</option></select>' +
    '</div><div id="rrhh-dietas-cal-grid" style="overflow-x:auto;"><p style="color:var(--text-secondary);padding:1rem;">Cargando...</p></div>';
  // Load projects
  fetch("/api/proyectos?estado=vivo").then(function(r){return r.json();}).then(function(d){
    var sel = document.getElementById("rrhh-dietas-cal-proy");
    if (!sel) return;
    (d.proyectos || []).forEach(function(p){ sel.innerHTML += '<option value="'+p.id+'">'+((p.nombre||p.codigo||'').substring(0,30))+'</option>'; });
  }).catch(function(){});
  _rrhhDietasCalReload();
}

// Festivos (reutilizar lista de Operaciones)
var _RRHH_FESTIVOS = [
  '2025-01-01','2025-01-06','2025-04-17','2025-04-18','2025-05-01','2025-08-15','2025-10-12','2025-11-01','2025-12-06','2025-12-08','2025-12-25',
  '2026-01-01','2026-01-06','2026-04-02','2026-04-03','2026-05-01','2026-08-15','2026-10-12','2026-11-02','2026-12-07','2026-12-08','2026-12-25',
  '2027-01-01','2027-01-06','2027-03-25','2027-03-26','2027-05-01','2027-08-15','2027-10-12','2027-11-01','2027-12-06','2027-12-08','2027-12-25'
];
var _DIAS_SEMANA = ["D","L","M","X","J","V","S"];

function _rrhhDietasCalReload() {
  var a = document.getElementById("rrhh-dietas-cal-anio");
  var m = document.getElementById("rrhh-dietas-cal-mesn");
  if (!a || !m) return;
  var periodo = a.value + "-" + String(m.value).padStart(2, "0");
  _rrhhDietasCalLoad(periodo);
}

function _rrhhDietasCalLoad(periodo) {
  var grid = document.getElementById("rrhh-dietas-cal-grid");
  if (!grid) return;
  var proyFiltro = (document.getElementById("rrhh-dietas-cal-proy") || {}).value || "";
  grid.innerHTML = '<p style="color:var(--text-secondary);padding:1rem;">Cargando...</p>';
  fetch("/api/rrhh/dietas/calendario/" + periodo)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var empleados = d.empleados || [];
      var diasArr = d.dias || [];
      var dietasMap = d.dietas || {};
      var proyMapCal = d.proyectos || {};
      _rrhhDietasFuncionesMap = d.funciones || {};

      // Filter by project if selected
      if (proyFiltro) {
        var empIdsConProy = {};
        Object.keys(proyMapCal).forEach(function(k) {
          // k = "empId_fecha", value = "CODIGO"
          // Need to check if this project matches. But proyectos dict has codigo as value.
          // We filter by checking if ANY day for the employee has this project assigned
          // For now, filter by checking proyecto_asignaciones (the proyMapCal has empId_fecha -> codigo)
        });
        // Simpler: only show employees that have at least one assignment to this project
        empleados = empleados.filter(function(emp) {
          for (var i = 0; i < diasArr.length; i++) {
            var k = emp.id + "_" + diasArr[i];
            if (proyMapCal[k]) return true;
          }
          return false;
        });
      }

      if (!empleados.length) { grid.innerHTML = '<p style="padding:1rem;color:var(--text-secondary);">Sin empleados' + (proyFiltro ? ' asignados a este proyecto' : ' activos') + '</p>'; return; }

      // Build day info
      var dayInfos = diasArr.map(function (fecha) {
        var dt = new Date(fecha + "T12:00:00");
        var dow = dt.getDay(); // 0=Sun
        var esFestivo = _RRHH_FESTIVOS.indexOf(fecha) >= 0;
        var esFinSemana = dow === 0 || dow === 6;
        return { fecha: fecha, num: dt.getDate(), dowLabel: _DIAS_SEMANA[dow], noLab: esFinSemana || esFestivo };
      });

      var colorMap = { nacional_completa: "#3B82F6", nacional_media: "#93C5FD", internacional_completa: "#F59E0B", internacional_media: "#FDE68A", NC: "#3B82F6", NM: "#93C5FD", IC: "#F59E0B", IM: "#FDE68A" };
      var abrevMap = { nacional_completa: "NC", nacional_media: "NM", internacional_completa: "IC", internacional_media: "IM", NC: "NC", NM: "NM", IC: "IC", IM: "IM" };

      var h = '<div style="overflow-x:auto;"><table style="border-collapse:collapse;font-size:0.72rem;">';
      // Header row 1: day of week
      h += '<tr style="background:var(--bg-secondary,#f8f9fa);"><th style="padding:2px 6px;min-width:120px;position:sticky;left:0;background:var(--bg-secondary,#f8f9fa);z-index:2;"></th>';
      dayInfos.forEach(function (di) {
        var bg = di.noLab ? "background:#E5E7EB;" : "";
        h += '<th style="padding:2px 1px;text-align:center;min-width:26px;font-weight:400;font-size:0.65rem;color:#888;' + bg + '">' + di.dowLabel + '</th>';
      });
      h += '<th style="padding:2px 4px;"></th></tr>';
      // Header row 2: day number
      h += '<tr style="background:var(--bg-secondary,#f8f9fa);"><th style="padding:2px 6px;font-weight:700;position:sticky;left:0;background:var(--bg-secondary,#f8f9fa);z-index:2;">Empleado</th>';
      dayInfos.forEach(function (di) {
        var bg = di.noLab ? "background:#E5E7EB;" : "";
        h += '<th style="padding:2px 1px;text-align:center;font-weight:600;' + bg + '">' + di.num + '</th>';
      });
      h += '<th style="padding:2px 4px;text-align:right;font-weight:700;">Total</th></tr>';

      // Employee rows
      var proyMap = d.proyectos || {}; // "empId_fecha" -> "CODIGO" or object
      empleados.forEach(function (emp) {
        var nombre = (emp.nombre || "") + " " + (emp.apellidos || "");
        h += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">';
        h += '<td style="padding:3px 6px;font-weight:500;white-space:nowrap;position:sticky;left:0;background:#fff;z-index:1;font-size:0.72rem;">' + nombre.trim() + '</td>';
        var total = 0;
        dayInfos.forEach(function (di) {
          var key = emp.id + "_" + di.fecha;
          var dieta = dietasMap[key];
          var proy = proyMap[key]; // string (codigo) or null
          var proyCodigo = typeof proy === "string" ? proy : (proy && proy.codigo ? proy.codigo : "");
          var tipo = dieta ? dieta.tipo : "";
          var abrev = abrevMap[tipo] || "";
          var bg = colorMap[tipo] || "";
          var noLabBg = di.noLab ? "#E5E7EB" : "";
          var tieneProyecto = !!proyCodigo;
          var sinDieta = !tipo;
          // Alert: proyecto asignado pero sin dieta
          var alertBorder = (tieneProyecto && sinDieta && !di.noLab) ? "border:2px solid #F59E0B;" : "";
          var cellBg = bg || noLabBg;
          if (tieneProyecto && sinDieta && !di.noLab && !cellBg) cellBg = "#FFFBEB"; // yellow hint
          var style = "padding:0px 1px;text-align:center;cursor:pointer;min-width:28px;vertical-align:top;line-height:1.1;" + (cellBg ? "background:" + cellBg + ";" : "") + alertBorder + (bg ? "color:#fff;font-weight:600;" : "");
          var proyLabel = tieneProyecto ? '<div style="font-size:7px;color:#888;overflow:hidden;white-space:nowrap;max-width:28px;">' + proyCodigo.substring(0, 4) + '</div>' : '';
          var dietaLabel = abrev ? '<div style="font-size:9px;font-weight:700;' + (bg ? 'color:#fff;' : '') + '">' + abrev + '</div>' : (tieneProyecto && !di.noLab ? '<div style="font-size:8px;color:#F59E0B;">\u26a0</div>' : (di.noLab ? '' : ''));
          var title = (proyCodigo ? 'Proy: ' + proyCodigo + ' | ' : '') + (tipo || 'Sin dieta');
          var proyEsc = proyCodigo.replace(/'/g, "\\'");
          h += '<td style="' + style + '" onclick="_rrhhDietaCellClick(this,' + emp.id + ',\'' + di.fecha + '\',\'' + periodo + '\',\'' + nombre.replace(/'/g, "\\'") + '\',\'' + proyEsc + '\')" title="' + title + '">' + proyLabel + dietaLabel + '</td>';
          if (dieta && dieta.importe) total += dieta.importe;
        });
        h += '<td style="padding:3px 4px;text-align:right;font-weight:600;">' + (total > 0 ? fmtEur(total) : '\u2014') + '</td>';
        h += '</tr>';
      });
      h += '</table></div>';
      grid.innerHTML = h;
    })
    .catch(function (err) { grid.innerHTML = '<p style="color:#dc3545;">Error: ' + err.message + '</p>'; });
}

var _rrhhDietaFuncion = "operador"; // current function selection in popup
var _rrhhDietasFuncionesMap = {}; // {empId_fecha: "operador"|"ayudante"} from calendar endpoint

function _rrhhDietaCellClick(td, empId, fecha, periodo, empNombre, proyCodigo) {
  var old = document.getElementById("rrhh-dieta-popup");
  if (old) old.remove();

  // Default function: funcion_dia (assignment) > puesto habitual (employee)
  _rrhhDietaFuncion = "operador";
  var fnKey = empId + "_" + fecha;
  if (_rrhhDietasFuncionesMap[fnKey]) {
    _rrhhDietaFuncion = _rrhhDietasFuncionesMap[fnKey];
  } else {
    var empCache = (_rrhhEmpleadosCache || []).find(function (e) { return e.id === empId; });
    if (empCache && (empCache.puesto || "").toLowerCase() === "ayudante") {
      _rrhhDietaFuncion = "ayudante";
    }
  }

  var opciones = [
    { tipo: "nacional_completa", label: "Nacional completa", abrev: "NC", bg: "#3B82F6", color: "#fff" },
    { tipo: "nacional_media", label: "Nacional media", abrev: "NM", bg: "#93C5FD", color: "#1E3A5F" },
    { tipo: "internacional_completa", label: "Internacional completa", abrev: "IC", bg: "#F59E0B", color: "#fff" },
    { tipo: "internacional_media", label: "Internacional media", abrev: "IM", bg: "#FDE68A", color: "#78350F" },
    { tipo: "", label: "Sin dieta", abrev: "\u2014", bg: "#E5E7EB", color: "#666" }
  ];

  var popup = document.createElement("div");
  popup.id = "rrhh-dieta-popup";
  popup.style.cssText = "position:fixed;z-index:1000;background:#fff;border:1px solid var(--color-border,#e2e8f0);border-radius:8px;padding:10px;box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:200px;font-size:13px;";

  var html = '<div style="font-weight:600;margin-bottom:2px;font-size:12px;">' + (empNombre || '') + '</div>';
  html += '<div style="font-size:11px;color:#888;margin-bottom:4px;">' + fecha + '</div>';
  if (proyCodigo) {
    html += '<div style="font-size:10px;margin-bottom:6px;padding:2px 6px;background:#EFF6FF;color:#1E40AF;border-radius:4px;display:inline-block;">Proy: <b>' + proyCodigo + '</b></div>';
  }
  // Function toggle
  html += '<div style="display:flex;gap:4px;margin-bottom:8px;">';
  html += '<button type="button" id="rrhh-fn-op" onclick="_rrhhDietaSetFn(\'operador\')" style="flex:1;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ' + (_rrhhDietaFuncion === "operador" ? '#3B82F6' : '#ccc') + ';background:' + (_rrhhDietaFuncion === "operador" ? '#EFF6FF' : 'transparent') + ';color:' + (_rrhhDietaFuncion === "operador" ? '#3B82F6' : '#666') + ';">Operador</button>';
  html += '<button type="button" id="rrhh-fn-ay" onclick="_rrhhDietaSetFn(\'ayudante\')" style="flex:1;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ' + (_rrhhDietaFuncion === "ayudante" ? '#10B981' : '#ccc') + ';background:' + (_rrhhDietaFuncion === "ayudante" ? '#ECFDF5' : 'transparent') + ';color:' + (_rrhhDietaFuncion === "ayudante" ? '#10B981' : '#666') + ';">Ayudante</button>';
  html += '</div>';
  // Options
  opciones.forEach(function (o) {
    html += '<button type="button" onclick="_rrhhDietaSeleccionar(' + empId + ',\'' + fecha + '\',\'' + periodo + '\',\'' + o.tipo + '\')" style="display:flex;align-items:center;gap:8px;width:100%;padding:5px 8px;margin-bottom:2px;border:none;border-radius:5px;cursor:pointer;background:transparent;font-size:12px;text-align:left;" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'transparent\'">';
    html += '<span style="display:inline-block;width:24px;height:18px;border-radius:3px;background:' + o.bg + ';color:' + o.color + ';font-size:9px;font-weight:700;text-align:center;line-height:18px;">' + o.abrev + '</span>';
    html += '<span>' + o.label + '</span>';
    html += '</button>';
  });
  popup.innerHTML = html;

  document.body.appendChild(popup);

  // Position near the cell (same pattern as Operaciones)
  var rect = td.getBoundingClientRect();
  var top = rect.bottom + 4;
  var left = rect.left;
  if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
  if (top + 200 > window.innerHeight) top = rect.top - popup.offsetHeight - 4;
  if (left < 10) left = 10;
  popup.style.top = top + "px";
  popup.style.left = left + "px";

  // Close on outside click
  setTimeout(function () {
    document.addEventListener("click", function _closePopup(e) {
      if (!popup.contains(e.target) && e.target !== td) {
        popup.remove();
        document.removeEventListener("click", _closePopup);
      }
    });
  }, 10);
}

function _rrhhDietaSetFn(fn) {
  _rrhhDietaFuncion = fn;
  var opBtn = document.getElementById("rrhh-fn-op");
  var ayBtn = document.getElementById("rrhh-fn-ay");
  if (opBtn) { opBtn.style.borderColor = fn === "operador" ? "#3B82F6" : "#ccc"; opBtn.style.background = fn === "operador" ? "#EFF6FF" : "transparent"; opBtn.style.color = fn === "operador" ? "#3B82F6" : "#666"; }
  if (ayBtn) { ayBtn.style.borderColor = fn === "ayudante" ? "#10B981" : "#ccc"; ayBtn.style.background = fn === "ayudante" ? "#ECFDF5" : "transparent"; ayBtn.style.color = fn === "ayudante" ? "#10B981" : "#666"; }
}

function _rrhhDietaSeleccionar(empId, fecha, periodo, tipo) {
  var popup = document.getElementById("rrhh-dieta-popup");
  if (popup) popup.remove();
  fetch("/api/rrhh/dietas/diaria", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ empleado_id: empId, fecha: fecha, tipo: tipo, importe: 0, funcion: _rrhhDietaFuncion })
  }).then(function () {
    if (_rrhhDietasVista === "empleado") {
      _rrhhDietasEmpLoad();
    } else {
      _rrhhDietasCalLoad(periodo);
    }
  });
}

function _rrhhDietasResumen(body) {
  var now = new Date();
  var anio = now.getFullYear(), mes = now.getMonth() + 1;
  body.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
    '<label style="font-size:0.82rem;font-weight:600;">A\u00f1o:</label>' +
    '<select id="rrhh-dietas-res-anio" style="width:75px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:0.82rem;" onchange="_rrhhDietasResLoad()">' +
    '<option value="2025"' + (anio===2025?' selected':'') + '>2025</option><option value="2026"' + (anio===2026?' selected':'') + '>2026</option><option value="2027">2027</option></select>' +
    '<label style="font-size:0.82rem;font-weight:600;">Mes:</label>' +
    '<select id="rrhh-dietas-res-mesn" style="width:115px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:0.82rem;" onchange="_rrhhDietasResLoad()">' +
    _MESES_NOMBRE.map(function(n,i){return '<option value="'+(i+1)+'"'+(i+1===mes?' selected':'')+'>'+n+'</option>';}).join('') +
    '</select></div><div id="rrhh-dietas-res-body"></div>';
  _rrhhDietasResLoad();
}

function _rrhhDietasResLoad() {
  var a = document.getElementById("rrhh-dietas-res-anio");
  var m = document.getElementById("rrhh-dietas-res-mesn");
  var body = document.getElementById("rrhh-dietas-res-body");
  if (!a || !m || !body) return;
  var periodo = a.value + "-" + String(m.value).padStart(2, "0");
  body.innerHTML = '<p style="color:var(--text-secondary);padding:1rem;">Cargando...</p>';

  fetch("/api/rrhh/dietas/calendario/" + periodo)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var empleados = d.empleados || [];
      var dietasMap = d.dietas || {};
      // Aggregate by employee
      var agg = {};
      Object.keys(dietasMap).forEach(function (k) {
        var parts = k.split("_");
        var empId = parseInt(parts[0]);
        var dieta = dietasMap[k];
        if (!dieta.tipo) return;
        if (!agg[empId]) agg[empId] = { NC: 0, NM: 0, IC: 0, IM: 0, total: 0, totalEur: 0 };
        var abrevMap2 = { nacional_completa: "NC", nacional_media: "NM", internacional_completa: "IC", internacional_media: "IM" };
        var ab = abrevMap2[dieta.tipo] || "";
        if (ab && agg[empId][ab] !== undefined) agg[empId][ab]++;
        agg[empId].total++;
        agg[empId].totalEur += (dieta.importe || 0);
      });

      var rows = [];
      empleados.forEach(function (emp) {
        if (agg[emp.id]) rows.push({ id: emp.id, nombre: (emp.nombre || "") + " " + (emp.apellidos || ""), data: agg[emp.id] });
      });
      rows.sort(function (a, b) { return b.data.totalEur - a.data.totalEur; });

      if (!rows.length) { body.innerHTML = '<p style="padding:1rem;color:var(--text-secondary);">Sin dietas asignadas en este mes</p>'; return; }

      var h = '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">';
      h += '<thead><tr style="background:var(--bg-secondary,#f8f9fa);">' +
        '<th style="padding:6px 8px;font-weight:700;">Empleado</th><th style="padding:6px 3px;"></th>' +
        '<th style="padding:6px 4px;font-weight:700;text-align:right;">NC</th>' +
        '<th style="padding:6px 4px;font-weight:700;text-align:right;">NM</th>' +
        '<th style="padding:6px 4px;font-weight:700;text-align:right;">IC</th>' +
        '<th style="padding:6px 4px;font-weight:700;text-align:right;">IM</th>' +
        '<th style="padding:6px 4px;font-weight:700;text-align:right;">Total d\u00edas</th>' +
        '<th style="padding:6px 6px;font-weight:700;text-align:right;">Total \u20ac</th>' +
        '</tr></thead><tbody>';
      var totNC=0, totNM=0, totIC=0, totIM=0, totDias=0, totEur=0;
      rows.forEach(function (r) {
        var dd = r.data;
        totNC += dd.NC; totNM += dd.NM; totIC += dd.IC; totIM += dd.IM; totDias += dd.total; totEur += dd.totalEur;
        h += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_rrhhDietasVista=\'empleado\';_rrhhCargarDietas()">' +
          '<td style="padding:5px 8px;font-weight:500;">' + r.nombre.trim() + '</td>' +
          '<td style="padding:5px 3px;"><a href="#" onclick="event.preventDefault();event.stopPropagation();_rrhhVerFichaEmpleado(' + r.id + ',\'dietas\')" style="color:#3B82F6;font-size:0.75rem;">Ficha</a></td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (dd.NC || '\u2014') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (dd.NM || '\u2014') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (dd.IC || '\u2014') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (dd.IM || '\u2014') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;font-weight:600;">' + dd.total + '</td>' +
          '<td style="padding:5px 6px;text-align:right;font-weight:600;">' + fmtEur(dd.totalEur) + '</td></tr>';
      });
      h += '</tbody><tfoot><tr style="font-weight:700;background:var(--bg-secondary,#f8f9fa);">' +
        '<td colspan="2" style="padding:6px 8px;">TOTAL</td>' +
        '<td style="padding:6px 4px;text-align:right;">' + (totNC||'\u2014') + '</td>' +
        '<td style="padding:6px 4px;text-align:right;">' + (totNM||'\u2014') + '</td>' +
        '<td style="padding:6px 4px;text-align:right;">' + (totIC||'\u2014') + '</td>' +
        '<td style="padding:6px 4px;text-align:right;">' + (totIM||'\u2014') + '</td>' +
        '<td style="padding:6px 4px;text-align:right;">' + totDias + '</td>' +
        '<td style="padding:6px 6px;text-align:right;">' + fmtEurFull(totEur) + '</td></tr></tfoot></table>';
      body.innerHTML = h;
    })
    .catch(function (err) { body.innerHTML = '<p style="color:#dc3545;">Error: ' + err.message + '</p>'; });
}

var _MESES_NOMBRE = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function _rrhhDietasEmpleado(body) {
  var now = new Date();
  var anioDefault = now.getFullYear();
  var mesDefault = now.getMonth() + 1;
  body.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">' +
    '<label style="font-size:0.82rem;font-weight:600;">Empleado:</label>' +
    '<select id="rrhh-dietas-emp-sel" style="max-width:280px;padding:5px 8px;border:1px solid var(--border,#ccc);border-radius:5px;font-size:0.82rem;text-overflow:ellipsis;" onchange="_rrhhDietasEmpLoad()"><option value="">Seleccionar...</option></select>' +
    '<label style="font-size:0.82rem;font-weight:600;margin-left:8px;">A\u00f1o:</label>' +
    '<select id="rrhh-dietas-emp-anio" style="width:75px;padding:5px 6px;border:1px solid var(--border,#ccc);border-radius:5px;font-size:0.82rem;" onchange="_rrhhDietasEmpLoad()">' +
    '<option value="2025">2025</option><option value="2026"' + (anioDefault === 2026 ? ' selected' : '') + '>2026</option><option value="2027">2027</option></select>' +
    '<label style="font-size:0.82rem;font-weight:600;margin-left:4px;">Mes:</label>' +
    '<select id="rrhh-dietas-emp-mesn" style="width:115px;padding:5px 6px;border:1px solid var(--border,#ccc);border-radius:5px;font-size:0.82rem;" onchange="_rrhhDietasEmpLoad()">' +
    _MESES_NOMBRE.map(function (n, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === mesDefault ? ' selected' : '') + '>' + n + '</option>'; }).join("") +
    '</select>' +
    '</div><div id="rrhh-dietas-emp-body"></div>';
  // Hidden month input for compatibility
  var sel = document.getElementById("rrhh-dietas-emp-sel");
  fetch("/api/empleados?solo_activos=1")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      (d.empleados || []).forEach(function (e) {
        var opt = document.createElement("option");
        opt.value = e.id;
        opt.textContent = (e.nombre || '') + ' ' + (e.apellidos || '');
        sel.appendChild(opt);
      });
    });
}

function _rrhhDietasEmpLoad() {
  var empId = document.getElementById("rrhh-dietas-emp-sel").value;
  var anioSel = document.getElementById("rrhh-dietas-emp-anio");
  var mesSel = document.getElementById("rrhh-dietas-emp-mesn");
  var mes = anioSel && mesSel ? anioSel.value + "-" + String(mesSel.value).padStart(2, "0") : "";
  var body = document.getElementById("rrhh-dietas-emp-body");
  if (!empId || !mes || !body) return;
  body.innerHTML = '<p style="color:var(--text-secondary);padding:1rem;">Cargando...</p>';
  fetch("/api/rrhh/dietas/empleado/" + empId + "/" + mes)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var dias = d.dias || [];
      var dietasMap = d.dietas || {};
      var proyMap = d.proyectos || {};
      if (!dias.length) { body.innerHTML = '<p style="padding:1rem;color:var(--text-secondary);">Sin datos</p>'; return; }

      var abrevMap = { nacional_completa: "NC", nacional_media: "NM", internacional_completa: "IC", internacional_media: "IM" };
      var colorMap = { NC: "#3B82F6", NM: "#93C5FD", IC: "#F59E0B", IM: "#FDE68A" };

      var h = '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;">';
      h += '<thead><tr style="background:var(--bg-secondary,#f8f9fa);">' +
        '<th style="padding:6px 6px;font-weight:700;width:30px;">D\u00eda</th>' +
        '<th style="padding:6px 4px;font-weight:700;width:25px;">DS</th>' +
        '<th style="padding:6px 6px;font-weight:700;">Proyecto</th>' +
        '<th style="padding:6px 4px;font-weight:700;width:45px;">Funci\u00f3n</th>' +
        '<th style="padding:6px 6px;font-weight:700;width:65px;">Dieta</th>' +
        '<th style="padding:6px 6px;font-weight:700;text-align:right;width:65px;">Importe</th>' +
        '<th style="padding:6px 6px;font-weight:700;">Comentario</th>' +
        '</tr></thead><tbody>';

      var totalImporte = 0, diasProy = 0, diasDieta = 0;
      var conteo = { NC: 0, NM: 0, IC: 0, IM: 0 };

      dias.forEach(function (dd) {
        var dieta = dietasMap[dd.fecha];
        var proy = proyMap[dd.fecha];
        var tipo = dieta ? dieta.tipo : "";
        var abrev = abrevMap[tipo] || "";
        var imp = dieta ? (dieta.importe || 0) : 0;
        var notas = dieta ? (dieta.notas || "") : "";
        var proyCodigo = proy ? (proy.nombre || proy.codigo || "") : "";
        var tieneProyecto = !!proyCodigo;
        var sinDieta = !tipo;
        var esFestivo = _RRHH_FESTIVOS.indexOf(dd.fecha) >= 0;
        var esFinSemana = dd.dia_semana === "S" || dd.dia_semana === "D";
        var noLab = esFinSemana || esFestivo;

        if (tieneProyecto) diasProy++;
        if (abrev) { diasDieta++; conteo[abrev] = (conteo[abrev] || 0) + 1; }
        totalImporte += imp;

        var rowBg = noLab ? "background:#E5E7EB;" : (tieneProyecto && sinDieta ? "background:#FFFBEB;" : "");
        var rowBorder = (tieneProyecto && sinDieta && !noLab) ? "border-left:3px solid #F59E0B;" : "";
        var pillColor = colorMap[abrev] || "";
        var pillHtml = abrev ? '<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:' + pillColor + ';color:#fff;font-size:10px;font-weight:700;">' + abrev + '</span>' : (tieneProyecto && !noLab ? '<span style="color:#F59E0B;">\u26a0</span>' : '\u2014');

        var fn = dieta ? (dieta.funcion || "operador") : "";
        var fnPill = fn === "ayudante" ? '<span style="padding:1px 4px;border-radius:3px;background:#ECFDF5;color:#10B981;font-size:9px;font-weight:600;">Ay.</span>' : (fn === "operador" && tipo ? '<span style="padding:1px 4px;border-radius:3px;background:#EFF6FF;color:#3B82F6;font-size:9px;font-weight:600;">Op.</span>' : '\u2014');

        h += '<tr style="border-bottom:1px solid var(--border,#e9ecef);' + rowBg + rowBorder + '">' +
          '<td style="padding:4px 6px;font-weight:600;">' + dd.num + '</td>' +
          '<td style="padding:4px 4px;color:' + (noLab ? '#9ca3af' : 'inherit') + ';">' + dd.dia_semana + '</td>' +
          '<td style="padding:4px 6px;">' + (proyCodigo || '\u2014') + '</td>' +
          '<td style="padding:4px 4px;">' + fnPill + '</td>' +
          '<td style="padding:4px 6px;cursor:pointer;" onclick="_rrhhDietaEmpCellClick(this,' + empId + ',\'' + dd.fecha + '\',\'' + mes + '\')">' + pillHtml + '</td>' +
          '<td style="padding:4px 6px;text-align:right;">' + (imp > 0 ? fmtEur(imp) : '\u2014') + '</td>' +
          '<td style="padding:2px 4px;"><input type="text" value="' + notas.replace(/"/g, '&quot;') + '" data-emp="' + empId + '" data-fecha="' + dd.fecha + '" style="width:100%;padding:2px 4px;border:1px solid transparent;border-radius:3px;font-size:0.78rem;background:transparent;" onfocus="this.style.borderColor=\'var(--border)\';this.style.background=\'#fff\'" onblur="_rrhhDietaGuardarNota(this)"></td>' +
          '</tr>';
      });

      // Totals
      var desglose = [];
      if (conteo.NC) desglose.push(conteo.NC + " NC");
      if (conteo.NM) desglose.push(conteo.NM + " NM");
      if (conteo.IC) desglose.push(conteo.IC + " IC");
      if (conteo.IM) desglose.push(conteo.IM + " IM");

      h += '</tbody><tfoot><tr style="font-weight:700;background:var(--bg-secondary,#f8f9fa);">' +
        '<td colspan="2" style="padding:6px 6px;">TOTAL</td>' +
        '<td style="padding:6px 6px;">' + diasProy + ' d\u00edas</td>' +
        '<td></td>' +
        '<td style="padding:6px 6px;">' + diasDieta + ' d\u00edas' + (desglose.length ? ' (' + desglose.join(', ') + ')' : '') + '</td>' +
        '<td style="padding:6px 6px;text-align:right;">' + fmtEurFull(totalImporte) + '</td>' +
        '<td></td></tr></tfoot></table>';

      body.innerHTML = h;
    })
    .catch(function (err) { body.innerHTML = '<p style="color:#dc3545;">Error: ' + err.message + '</p>'; });
}

function _rrhhDietaEmpCellClick(td, empId, fecha, periodo) {
  // Reuse the same popup as calendar
  _rrhhDietaCellClick(td, empId, fecha, periodo, '', '');
}

function _rrhhDietaGuardarNota(input) {
  input.style.borderColor = "transparent";
  input.style.background = "transparent";
  var empId = input.getAttribute("data-emp");
  var fecha = input.getAttribute("data-fecha");
  var notas = input.value;
  fetch("/api/rrhh/dietas/diaria", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ empleado_id: parseInt(empId), fecha: fecha, notas: notas, _only_notas: true })
  });
}

// ── Config view for tarifas ──
function _rrhhDietasConfigView(body) {
  body.innerHTML = '<p style="color:var(--text-secondary);padding:1rem;">Cargando tarifas...</p>';
  fetch("/api/rrhh/dietas/config")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var cfg = d.config || [];
      var vigentes = cfg.filter(function (c) { return !c.fecha_vigencia_hasta; });
      var historial = cfg.filter(function (c) { return !!c.fecha_vigencia_hasta; });
      var _lbl = function (t) { return { nacional: "Nacional", internacional: "Internacional" }[t] || t || "\u2014"; };
      var _slbl = function (s) { return { completa: "Completa", media: "Media" }[s] || s || "\u2014"; };
      var _clbl = function (c) { return c ? ({"operador":"Operador","ayudante":"Ayudante","peon":"Pe\u00f3n","hincador":"Hincador","oficial":"Oficial"}[c] || c) : "Todas"; };
      var _fmtFecha = function (f) { if (!f) return "\u2014"; var p = f.split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : f; };

      var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
      h += '<h4 style="margin:0;font-size:0.9rem;font-weight:700;">Tarifas vigentes</h4>';
      h += '<button onclick="_rrhhNuevaTarifaModal()" class="btn-small" style="background:#EFF6FF;color:#1E40AF;border:1px solid #93C5FD;">+ Nueva tarifa</button>';
      h += '</div>';

      if (!vigentes.length) {
        h += '<p style="padding:1rem;color:var(--text-secondary);font-size:0.85rem;">Sin tarifas configuradas. Pulsa "+ Nueva tarifa" para crear la primera.</p>';
      } else {
        h += '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">';
        h += '<thead><tr style="background:var(--bg-secondary,#f8f9fa);">' +
          '<th style="padding:6px 8px;font-weight:700;">Geograf\u00eda</th>' +
          '<th style="padding:6px 6px;font-weight:700;">Tipo</th>' +
          '<th style="padding:6px 6px;font-weight:700;">Funci\u00f3n</th>' +
          '<th style="padding:6px 6px;font-weight:700;text-align:right;">Importe/d\u00eda</th>' +
          '<th style="padding:6px 6px;font-weight:700;">Desde</th>' +
          '<th style="padding:6px 6px;font-weight:700;text-align:center;">Acciones</th>' +
          '</tr></thead><tbody>';
        var lastTipo = "";
        vigentes.forEach(function (c) {
          if (c.tipo !== lastTipo && lastTipo) h += '<tr><td colspan="6" style="border-top:2px solid var(--border,#e9ecef);"></td></tr>';
          lastTipo = c.tipo;
          h += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
            '<td style="padding:5px 8px;font-weight:500;">' + _lbl(c.tipo) + '</td>' +
            '<td style="padding:5px 6px;">' + _slbl(c.subtipo) + '</td>' +
            '<td style="padding:5px 6px;">' + _clbl(c.categoria) + '</td>' +
            '<td style="padding:5px 6px;text-align:right;font-weight:600;">' + fmtEur(c.importe) + ' \u20ac</td>' +
            '<td style="padding:5px 6px;">' + _fmtFecha(c.fecha_vigencia_desde) + '</td>' +
            '<td style="padding:5px 6px;text-align:center;"><button onclick="_rrhhEditarTarifa(' + c.id + ',' + c.importe + ')" style="background:none;border:none;cursor:pointer;color:#3B82F6;font-size:0.9rem;" title="Editar importe">&#x270E;</button></td>' +
            '</tr>';
        });
        h += '</tbody></table>';
      }

      if (historial.length) {
        h += '<details style="margin-top:16px;"><summary style="cursor:pointer;font-size:0.85rem;font-weight:600;color:var(--text-secondary);padding:6px 0;">Historial de tarifas (' + historial.length + ')</summary>';
        h += '<table style="width:100%;border-collapse:collapse;font-size:0.78rem;opacity:0.7;margin-top:6px;">';
        h += '<thead><tr style="background:var(--bg-secondary,#f8f9fa);"><th style="padding:4px 6px;">Geograf\u00eda</th><th style="padding:4px 4px;">Tipo</th><th style="padding:4px 4px;">Cat.</th><th style="padding:4px 4px;text-align:right;">Importe</th><th style="padding:4px 4px;">Desde</th><th style="padding:4px 4px;">Hasta</th></tr></thead><tbody>';
        historial.sort(function (a, b) { return (b.fecha_vigencia_hasta || "").localeCompare(a.fecha_vigencia_hasta || ""); });
        historial.forEach(function (c) {
          h += '<tr style="border-bottom:1px solid var(--border,#e9ecef);"><td style="padding:3px 6px;">' + _lbl(c.tipo) + '</td><td style="padding:3px 4px;">' + _slbl(c.subtipo) + '</td><td style="padding:3px 4px;">' + _clbl(c.categoria) + '</td><td style="padding:3px 4px;text-align:right;">' + fmtEur(c.importe) + ' \u20ac</td><td style="padding:3px 4px;">' + _fmtFecha(c.fecha_vigencia_desde) + '</td><td style="padding:3px 4px;">' + _fmtFecha(c.fecha_vigencia_hasta) + '</td></tr>';
        });
        h += '</tbody></table></details>';
      }

      body.innerHTML = h;
    });
}

function _rrhhNuevaTarifaModal() {
  var old = document.getElementById("rrhh-tarifa-modal");
  if (old) old.remove();
  var modal = document.createElement("div");
  modal.id = "rrhh-tarifa-modal";
  modal.className = "modal-overlay visible";
  modal.style.zIndex = "120";
  modal.innerHTML = '<div class="modal-editar" style="max-width:380px;">' +
    '<div style="font-weight:700;font-size:1rem;margin-bottom:14px;">Nueva tarifa de dieta</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
    '<div><label style="font-size:11px;color:#888;text-transform:uppercase;">Geograf\u00eda</label><select id="nt-tipo" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:5px;"><option value="nacional">Nacional</option><option value="internacional">Internacional</option></select></div>' +
    '<div><label style="font-size:11px;color:#888;text-transform:uppercase;">Tipo</label><select id="nt-subtipo" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:5px;"><option value="completa">Completa</option><option value="media">Media</option></select></div>' +
    '<div><label style="font-size:11px;color:#888;text-transform:uppercase;">Funci\u00f3n</label><select id="nt-cat" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:5px;"><option value="operador">Operador</option><option value="ayudante">Ayudante</option></select></div>' +
    '<div><label style="font-size:11px;color:#888;text-transform:uppercase;">Importe/d\u00eda \u20ac</label><input id="nt-importe" type="number" step="0.01" min="0" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:5px;"></div>' +
    '</div>' +
    '<div style="margin-bottom:12px;"><label style="font-size:11px;color:#888;text-transform:uppercase;">Vigencia desde</label><input id="nt-desde" type="date" value="' + new Date().toISOString().slice(0, 10) + '" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:5px;"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
    '<button class="secondary" onclick="document.getElementById(\'rrhh-tarifa-modal\').remove()">Cancelar</button>' +
    '<button class="primary" onclick="_rrhhGuardarNuevaTarifa()">Guardar</button>' +
    '</div></div>';
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

function _rrhhGuardarNuevaTarifa() {
  var data = {
    tipo: document.getElementById("nt-tipo").value,
    subtipo: document.getElementById("nt-subtipo").value,
    categoria: document.getElementById("nt-cat").value || null,
    importe: parseFloat(document.getElementById("nt-importe").value) || 0,
    fecha_vigencia_desde: document.getElementById("nt-desde").value
  };
  if (!data.importe) { alert("Introduce un importe"); return; }
  fetch("/api/rrhh/dietas/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(function () {
    document.getElementById("rrhh-tarifa-modal").remove();
    _rrhhDietasVista = "config";
    _rrhhCargarDietas();
  });
}

function _rrhhEditarTarifa(id, importeActual) {
  var nuevo = prompt("Nuevo importe EUR/d\u00eda (actual: " + importeActual + "):", importeActual);
  if (nuevo === null) return;
  nuevo = parseFloat(nuevo);
  if (isNaN(nuevo) || nuevo <= 0) return;
  if (nuevo === importeActual) return;
  // Close current tarifa and create new one with updated importe
  // For simplicity: delete old + create new (the endpoint handles it)
  fetch("/api/rrhh/dietas/config/" + id, { method: "DELETE" })
    .then(function () {
      // The old tarifa is deleted; we don't have its details here
      // Reload to reflect
      _rrhhDietasVista = "config";
      _rrhhCargarDietas();
      alert("Tarifa eliminada. Crea una nueva con el importe actualizado.");
    });
}

function _rrhhNuevaDieta() { _rrhhNuevaTarifaModal(); }
function _rrhhBorrarDieta(id) { _rrhhEditarTarifa(id, 0); }

// ===============================================================================
// ==  6. ADELANTOS                                                             ==
// ===============================================================================

var _rrhhAdelPeriodo = "";
function _rrhhCargarAdelantos() {
  if (!_rrhhAdelPeriodo) {
    var hoy = new Date();
    _rrhhAdelPeriodo = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0");
  }
  _rrhhLoadAdelantosMes(_rrhhAdelPeriodo);
}

function _rrhhAdelMesPrev() {
  var p = _rrhhAdelPeriodo.split("-");
  var y = parseInt(p[0]), m = parseInt(p[1]) - 1;
  if (m < 1) { m = 12; y--; }
  _rrhhAdelPeriodo = y + "-" + String(m).padStart(2, "0");
  _rrhhLoadAdelantosMes(_rrhhAdelPeriodo);
}
function _rrhhAdelMesNext() {
  var p = _rrhhAdelPeriodo.split("-");
  var y = parseInt(p[0]), m = parseInt(p[1]) + 1;
  if (m > 12) { m = 1; y++; }
  _rrhhAdelPeriodo = y + "-" + String(m).padStart(2, "0");
  _rrhhLoadAdelantosMes(_rrhhAdelPeriodo);
}

function _rrhhLoadAdelantosMes(periodo) {
  var kpis = document.getElementById("rrhh-adel-kpis");
  var tbody = document.getElementById("rrhh-adel-tbody");
  if (!tbody) return;

  var labelEl = document.querySelector("#panel-rrhh-adelantos h4");
  if (labelEl) labelEl.innerHTML = '<button onclick="_rrhhAdelMesPrev()" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;padding:2px 6px;margin-right:6px;">&laquo;</button>' + _rrhhPeriodoToLabel(periodo) + '<button onclick="_rrhhAdelMesNext()" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;padding:2px 6px;margin-left:6px;">&raquo;</button>';

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Cargando...</td></tr>';

  fetch("/api/rrhh/adelantos-banco/" + periodo)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var items = d.adelantos || [];
      var totalMes = 0;
      var empsSet = {};
      items.forEach(function(a){ totalMes += a.importe || 0; empsSet[a.empleado_id] = true; });
      var numEmps = Object.keys(empsSet).length;
      if (kpis) {
        kpis.innerHTML =
          _rrhhKpiCard("Total adelantos", fmtEurFull(totalMes), " tes-card-blue", "0.9rem") +
          _rrhhKpiCard("Empleados", numEmps, "") +
          _rrhhKpiCard("Media/empleado", numEmps > 0 ? fmtEurFull(totalMes / numEmps) : "\u2014", "", "0.9rem");
      }

      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-secondary);">No hay adelantos en ' + _rrhhPeriodoToLabel(periodo) + '.<br><span style="font-size:0.8rem;">Se registran desde Finanzas &gt; Bancos clasificando movimientos como "Adelanto empleado".</span></td></tr>';
        return;
      }

      // Pivot: group by employee, each adelanto as a column
      var byEmp = {};
      var allDates = [];
      items.forEach(function (a) {
        if (!byEmp[a.empleado_id]) byEmp[a.empleado_id] = { nombre: a.nombre, id: a.empleado_id, adels: [], total: 0 };
        byEmp[a.empleado_id].adels.push(a);
        byEmp[a.empleado_id].total += a.importe || 0;
      });
      // Find max columns needed
      var maxCols = 0;
      Object.values(byEmp).forEach(function (e) { if (e.adels.length > maxCols) maxCols = e.adels.length; });

      var empRows = Object.values(byEmp).sort(function (a, b) { return b.total - a.total; });

      // Header
      var h = '<tr style="background:var(--bg-secondary,#f8f9fa);">';
      h += '<th style="padding:6px 8px;font-weight:700;">Empleado</th><th style="padding:6px 3px;"></th>';
      for (var ci = 0; ci < maxCols; ci++) h += '<th style="padding:6px 4px;font-weight:700;text-align:right;">Adel. ' + (ci + 1) + '</th>';
      h += '<th style="padding:6px 6px;font-weight:700;text-align:right;">TOTAL</th></tr>';

      // Find the parent thead
      var theadEl = tbody.parentNode.querySelector("thead");
      if (theadEl) theadEl.innerHTML = h;

      // Body rows
      var html = "";
      var colTotals = new Array(maxCols).fill(0);
      empRows.forEach(function (e) {
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">';
        html += '<td style="padding:5px 8px;font-weight:500;">' + (e.nombre || '\u2014') + '</td>';
        html += '<td style="padding:5px 3px;"><a href="#" onclick="event.preventDefault();_rrhhVerFichaEmpleado(' + e.id + ',\'adelantos\')" style="color:#3B82F6;font-size:0.75rem;">Ficha</a></td>';
        for (var ci2 = 0; ci2 < maxCols; ci2++) {
          var adel = e.adels[ci2];
          if (adel) {
            var fParts = (adel.fecha || "").split("-");
            var fShort = fParts.length === 3 ? fParts[2] + "/" + fParts[1] : adel.fecha;
            html += '<td style="padding:4px 4px;text-align:right;"><div style="font-weight:600;font-size:0.85rem;">' + fmtEur(adel.importe) + '</div><div style="font-size:0.7rem;color:#9ca3af;">' + fShort + '</div></td>';
            colTotals[ci2] += adel.importe || 0;
          } else {
            html += '<td></td>';
          }
        }
        html += '<td style="padding:5px 6px;text-align:right;font-weight:700;">' + fmtEur(e.total) + '</td></tr>';
      });
      // Totals row
      html += '<tr style="font-weight:700;background:var(--bg-secondary,#f8f9fa);"><td colspan="2" style="padding:6px 8px;">TOTAL</td>';
      for (var ci3 = 0; ci3 < maxCols; ci3++) {
        html += '<td style="padding:6px 4px;text-align:right;">' + (colTotals[ci3] > 0 ? fmtEur(colTotals[ci3]) : '') + '</td>';
      }
      html += '<td style="padding:6px 6px;text-align:right;font-weight:800;">' + fmtEurFull(totalMes) + '</td></tr>';
      tbody.innerHTML = html;
    })
    .catch(function () { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#dc3545;">Error al cargar</td></tr>'; });
}

function _rrhhNuevoAdelanto() {
  var empId = prompt("ID empleado:");
  if (!empId) return;
  var fecha = prompt("Fecha (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
  var importe = parseFloat(prompt("Importe EUR:", "200"));
  if (isNaN(importe)) return;
  var concepto = prompt("Concepto:", "Adelanto n\u00f3mina");
  fetch("/api/rrhh/adelantos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ empleado_id: parseInt(empId), fecha: fecha, importe: importe, concepto: concepto })
  }).then(function () { _rrhhCargarAdelantos(); });
}

function _rrhhBorrarAdelanto(id) {
  if (!confirm("Eliminar adelanto?")) return;
  fetch("/api/rrhh/adelantos/" + id, { method: "DELETE" }).then(function () { _rrhhCargarAdelantos(); });
}

// ===============================================================================
// ==  7. SEGURIDAD SOCIAL                                                      ==
// ===============================================================================

function _rrhhCargarSS() {
  fetch("/api/rrhh/seguridad-social")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var k = d.kpis || {};

      // KPIs
      var kpis = document.getElementById("rrhh-ss-kpis");
      if (kpis) {
        kpis.innerHTML =
          _rrhhKpiCard("SS Empresa/mes", fmtEurFull(k.ss_empresa_mes), " tes-card-blue", "0.9rem") +
          _rrhhKpiCard("SS Trabajador/mes", fmtEurFull(k.ss_trabajador_mes), "", "0.9rem") +
          _rrhhKpiCard("Acumulado a\u00f1o", fmtEurFull(k.acumulado_anio), " tes-card-green", "0.9rem") +
          _rrhhKpiCard("\u00daltimo periodo", k.ultimo_periodo || "\u2014", "", "0.9rem");
      }

      // Table (descending)
      var meses = (d.meses || []).slice().sort(function (a, b) {
        return b.periodo > a.periodo ? 1 : b.periodo < a.periodo ? -1 : 0;
      });
      var tbody = document.getElementById("rrhh-ss-tbody");
      if (!tbody) return;
      if (!meses.length) {
        tbody.innerHTML = '<tr><td colspan="6">Sin datos</td></tr>';
        return;
      }
      var html = "";
      meses.forEach(function (m) {
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:6px 8px;font-weight:500;">' + _rrhhPeriodoToLabel(m.periodo) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + (m.empleados || 0) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + fmtEur(m.base_ss) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + fmtEur(m.ss_empresa) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + fmtEur(m.ss_trabajador) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;font-weight:600;">' + fmtEur(m.total_ss) + '</td>' +
          '<td style="padding:6px 4px;" id="rrhh-ss-banco-' + m.periodo + '"><span style="color:#9ca3af;">\u23f3</span></td></tr>';
      });
      tbody.innerHTML = html;

      // Load conciliation status for each month
      meses.forEach(function (m) {
        fetch("/api/rrhh/banco/conciliacion-ss/" + m.periodo)
          .then(function (r) { return r.json(); })
          .then(function (c) {
            var el = document.getElementById("rrhh-ss-banco-" + m.periodo);
            if (!el) return;
            var comparBtn = ' <button onclick="_rrhhSSComparar(\'' + m.periodo + '\',this)" style="background:none;border:none;cursor:pointer;font-size:0.85rem;" title="Comparar estimado vs banco">\uD83D\uDD0D</button>';
            if (c.estado === "conciliado" && c.movimiento) {
              el.innerHTML = '<span style="padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:600;background:#DCFCE7;color:#166534;" title="' + (c.movimiento.fecha_operacion || '') + ' | ' + (c.movimiento.importe || '') + ' EUR">\u2705</span>' + comparBtn;
            } else {
              el.innerHTML = '<span style="padding:2px 8px;border-radius:99px;font-size:0.7rem;font-weight:600;background:#FEE2E2;color:#991B1B;">Pend.</span>' + comparBtn;
            }
          })
          .catch(function () {});
      });

      // Chart.js bar chart
      var canvasSS = document.getElementById("rrhh-chart-ss");
      if (canvasSS && meses.length) {
        if (_rrhhSSChart) _rrhhSSChart.destroy();
        // Show in chronological order for chart
        var chronoMeses = meses.slice().reverse();
        var ssTrabData = chronoMeses.map(function (m) { return m.ss_trabajador || 0; });
        var ssEmpData = chronoMeses.map(function (m) { return m.ss_empresa || 0; });
        _rrhhSSChart = new Chart(canvasSS.getContext("2d"), {
          type: "bar",
          data: {
            labels: chronoMeses.map(function (m) { return m.periodo; }),
            datasets: [
              { label: "SS Trabajador", data: ssTrabData, backgroundColor: "#93C5FD", stack: "a" },
              { label: "SS Empresa", data: ssEmpData, backgroundColor: "#1E40AF", stack: "a" }
            ]
          },
          plugins: [{
            id: "ssTotalLabel",
            afterDatasetsDraw: function (chart) {
              var ctx = chart.ctx;
              var meta0 = chart.getDatasetMeta(0);
              var meta1 = chart.getDatasetMeta(1);
              ctx.save();
              ctx.font = "bold 11px sans-serif";
              ctx.fillStyle = "#1E40AF";
              ctx.textAlign = "center";
              for (var i = 0; i < meta1.data.length; i++) {
                var total = (ssTrabData[i] || 0) + (ssEmpData[i] || 0);
                var bar = meta1.data[i];
                var lbl = total >= 1000 ? Math.round(total / 1000) + "K" : fmtEur(total);
                ctx.fillText(lbl, bar.x, bar.y - 6);
              }
              ctx.restore();
            }
          }],
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
            scales: {
              x: { stacked: true },
              y: { stacked: true, ticks: { callback: function (v) { return fmtEur(v); } } }
            }
          }
        });
      }
    })
    .catch(function () {});
}

// ===============================================================================
// ==  8. IRPF                                                                  ==
// ===============================================================================

function _rrhhSSComparar(periodo, btn) {
  // Remove any existing comparison card
  var old = document.getElementById("rrhh-ss-comparar-card");
  if (old) { old.remove(); return; } // toggle off

  fetch("/api/rrhh/seguridad-social/comparar/" + periodo)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var card = document.createElement("tr");
      card.id = "rrhh-ss-comparar-card";
      var difVal = d.diferencia;
      var difColor = difVal === null ? "#9ca3af" : Math.abs(difVal) < 50 ? "#16a34a" : Math.abs(difVal) < 200 ? "#ca8a04" : "#dc2626";
      var difBg = difVal === null ? "" : Math.abs(difVal) < 50 ? "background:#f0fdf4;" : Math.abs(difVal) < 200 ? "background:#fefce8;" : "background:#fef2f2;";
      var bancoStr = d.banco !== null ? fmtEurFull(d.banco) : '<span style="color:#9ca3af;">Sin conciliar</span>';
      var difStr = difVal !== null ? '<span style="color:' + difColor + ';font-weight:700;">' + fmtEurFull(difVal) + '</span>' : '<span style="color:#9ca3af;">\u2014</span>';
      card.innerHTML = '<td colspan="7" style="padding:0;">' +
        '<div style="padding:10px 16px;background:#f8fafc;border-left:3px solid #3B82F6;margin:2px 0;border-radius:0 6px 6px 0;' + difBg + '">' +
        '<div style="font-size:0.82rem;font-weight:600;margin-bottom:6px;">Comparaci\u00f3n SS \u2014 ' + periodo + '</div>' +
        '<table style="font-size:0.8rem;border-collapse:collapse;">' +
        '<tr><td style="padding:3px 12px 3px 0;color:#666;">Estimado (n\u00f3minas)</td><td style="padding:3px 0;font-weight:600;">' + fmtEurFull(d.estimado) + '</td></tr>' +
        '<tr><td style="padding:3px 12px 3px 0;color:#666;">Banco (movimiento)</td><td style="padding:3px 0;font-weight:600;">' + bancoStr + '</td></tr>' +
        '<tr style="border-top:1px solid var(--border,#e9ecef);"><td style="padding:5px 12px 3px 0;font-weight:600;">Diferencia</td><td style="padding:5px 0;">' + difStr + '</td></tr>' +
        '</table>' +
        (d.banco_fecha ? '<div style="font-size:0.72rem;color:#9ca3af;margin-top:4px;">Mov: ' + d.banco_fecha + ' \u2014 ' + (d.banco_concepto || '').substring(0, 60) + '</div>' : '') +
        '</div></td>';
      // Insert after the current row
      var tr = btn.closest("tr");
      if (tr && tr.parentNode) tr.parentNode.insertBefore(card, tr.nextSibling);
    })
    .catch(function (e) { alert("Error: " + e.message); });
}

function _rrhhCargarIRPF() {
  fetch("/api/rrhh/irpf")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var k = d.kpis || {};

      // KPIs
      var kpis = document.getElementById("rrhh-irpf-kpis");
      if (kpis) {
        kpis.innerHTML =
          _rrhhKpiCard("Acumulado a\u00f1o", fmtEurFull(k.acumulado_anio), " tes-card-blue", "0.9rem") +
          _rrhhKpiCard("% Retenci\u00f3n medio", (k.pct_medio || 0) + "%", "", "0.9rem");
      }

      // Table (descending by trimestre)
      var trs = (d.trimestres || []).slice().sort(function (a, b) {
        return b.trimestre > a.trimestre ? 1 : b.trimestre < a.trimestre ? -1 : 0;
      });
      var tbody = document.getElementById("rrhh-irpf-tbody");
      if (!tbody) return;
      if (!trs.length) {
        tbody.innerHTML = '<tr><td colspan="7">Sin datos</td></tr>';
        return;
      }
      var hoyStr = new Date().toISOString().slice(0, 10);
      var html = "";
      trs.forEach(function (t) {
        // Parse fecha_limite "20 abr 2026" to comparable
        var meses_map = {ene:"01",feb:"02",mar:"03",abr:"04",may:"05",jun:"06",jul:"07",ago:"08",sep:"09",oct:"10",nov:"11",dic:"12"};
        var esFuturo = false, esPasado = false;
        if (t.fecha_limite) {
          var parts = t.fecha_limite.split(" ");
          if (parts.length >= 3) {
            var isoDate = parts[2] + "-" + (meses_map[parts[1]] || "01") + "-" + parts[0].padStart(2, "0");
            esFuturo = isoDate > hoyStr;
            esPasado = !esFuturo;
          }
        }
        var rowBg = esFuturo ? "background:#FEFCE8;" : "";
        var pill = "";
        if (esFuturo) {
          pill = '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.7rem;font-weight:600;background:#FEF3C7;color:#92400E;">Pr\u00f3ximo \u23f3</span>';
        } else if (esPasado) {
          // Assume paid if past (no bank reconciliation data yet)
          pill = '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.7rem;font-weight:600;background:#DCFCE7;color:#166534;">Pagado \u2705</span>';
        }
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);' + rowBg + '">' +
          '<td style="padding:6px 8px;font-weight:600;">' + t.trimestre + '</td>' +
          '<td style="padding:6px 6px;">' + (t.meses_label || '') + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + (t.nominas || 0) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(t.base) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;font-weight:600;">' + fmtEur(t.retenido) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + (t.pct_medio || 0) + '%</td>' +
          '<td style="padding:6px 6px;">' + (t.fecha_limite || '\u2014') + ' ' + pill + '</td></tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function () {});
}

// ===============================================================================
// ==  9. COSTE PROYECTO                                                        ==
// ===============================================================================

function _rrhhCargarCosteProyecto() {
  fetch("/api/rrhh/coste-proyecto")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var tbody = document.getElementById("rrhh-costeproy-tbody");
      if (!tbody) return;
      // Sort descending by total_rrhh
      var proys = (d.proyectos || []).slice().sort(function (a, b) {
        return (b.total_rrhh || 0) - (a.total_rrhh || 0);
      });
      if (!proys.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Sin datos de asignaciones empleado-proyecto</td></tr>';
        return;
      }
      var html = "";
      proys.forEach(function (p) {
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:6px 8px;font-weight:500;">' + (p.codigo || '') + ' ' + (p.proyecto || '') + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + (p.empleados || 0) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + (p.dias_hombre || 0) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(p.coste_personal) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(p.dietas) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;font-weight:700;">' + fmtEur(p.total_rrhh) + '</td></tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function () {});
}

// ===============================================================================
// ==  Expose globally (for HTML onclick handlers)                              ==
// ===============================================================================

window._rrhhOnPanelShow = _rrhhOnPanelShow;
window._rrhhCargarEmpleados = _rrhhCargarEmpleados;
window._rrhhRenderVistas = _rrhhRenderVistas;
window._rrhhRenderTabla = _rrhhRenderTabla;
window._rrhhToggleInactivos = _rrhhToggleInactivos;
window._rrhhToggleGrupoEquipo = _rrhhToggleGrupoEquipo;
window._rrhhAbrirModalEmpleado = _rrhhAbrirModalEmpleado;
window._rrhhCerrarModalEmpleado = _rrhhCerrarModalEmpleado;
window._rrhhGuardarEmpleado = _rrhhGuardarEmpleado;
window._rrhhEditarEmpleado = _rrhhEditarEmpleado;
window._rrhhAbrirFichaDesdeEquipo = _rrhhAbrirFichaDesdeEquipo;
window._rrhhEliminarEmpleado = _rrhhEliminarEmpleado;
window._rrhhLimpiarFormEmpleado = _rrhhLimpiarFormEmpleado;
window._rrhhRellenarFormEmpleado = _rrhhRellenarFormEmpleado;
window._rrhhRecogerFormEmpleado = _rrhhRecogerFormEmpleado;
window._rrhhCargarDashboard = _rrhhCargarDashboard;
window._rrhhCargarNominas = _rrhhCargarNominas;
window._rrhhMesPrev = _rrhhMesPrev;
window._rrhhMesNext = _rrhhMesNext;
window._rrhhCargarMes = _rrhhCargarMes;
window._rrhhToggleNominaDetail = _rrhhToggleNominaDetail;
window._rrhhVerFichaEmpleado = _rrhhVerFichaEmpleado;
window._rrhhCerrarFicha = _rrhhCerrarFicha;
window._rrhhVerMes = _rrhhVerMes;
window._rrhhConfirmarOCR = _rrhhConfirmarOCR;
window._rrhhCerrarOCR = _rrhhCerrarOCR;
window._rrhhCargarVerificador = _rrhhCargarVerificador;
window._rrhhLoadVerif = _rrhhLoadVerif;
window._rrhhGenerarRemesa = _rrhhGenerarRemesa;
window._rrhhCargarDietas = _rrhhCargarDietas;
window._rrhhDietasCalLoad = _rrhhDietasCalLoad;
window._rrhhDietasCalReload = _rrhhDietasCalReload;
window._rrhhDietasResLoad = _rrhhDietasResLoad;
window._rrhhDietaCellClick = _rrhhDietaCellClick;
window._rrhhDietaSeleccionar = _rrhhDietaSeleccionar;
window._rrhhDietaSetFn = _rrhhDietaSetFn;
window._rrhhDietasEmpLoad = _rrhhDietasEmpLoad;
window._rrhhDietaEmpCellClick = _rrhhDietaEmpCellClick;
window._rrhhDietaGuardarNota = _rrhhDietaGuardarNota;
window._rrhhNuevaDieta = _rrhhNuevaDieta;
window._rrhhBorrarDieta = _rrhhBorrarDieta;
window._rrhhNuevaTarifaModal = _rrhhNuevaTarifaModal;
window._rrhhGuardarNuevaTarifa = _rrhhGuardarNuevaTarifa;
window._rrhhEditarTarifa = _rrhhEditarTarifa;
window._rrhhCargarAdelantos = _rrhhCargarAdelantos;
window._rrhhAdelMesPrev = _rrhhAdelMesPrev;
window._rrhhAdelMesNext = _rrhhAdelMesNext;
window._rrhhNuevoAdelanto = _rrhhNuevoAdelanto;
window._rrhhBorrarAdelanto = _rrhhBorrarAdelanto;
window._rrhhCargarSS = _rrhhCargarSS;
window._rrhhSSComparar = _rrhhSSComparar;
window._rrhhCargarIRPF = _rrhhCargarIRPF;
window._rrhhCargarCosteProyecto = _rrhhCargarCosteProyecto;
window._rrhhRenderOCRPreview = _rrhhRenderOCRPreview;
window.fmtEur = fmtEur;
window.fmtEurFull = fmtEurFull;
