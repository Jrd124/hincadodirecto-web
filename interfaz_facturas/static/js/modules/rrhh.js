// ===============================================================================
// ==  RRHH MODULE - Complete frontend for HR management                       ==
// ===============================================================================

var _rrhhEmpleadosCache = [];
var _rrhhPeriodos = [];
var _rrhhPeriodoIdx = -1;
var _rrhhNominasInit = false;
var _rrhhVerifInit = false;
var _rrhhImportInit = false;
var _rrhhInactivosAbierto = false;
var _rrhhOCRData = [];
var _rrhhDashChartEvo = null;
var _rrhhFichaChart = null;
var _rrhhDashChartCat = null;
var _rrhhSSChart = null;
var _rrhhExpandedRow = null;

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

      // -- Chart.js: Donut (categorias) --
      var cats = d.categorias || [];
      var canvasCat = document.getElementById("rrhh-chart-categorias");
      if (canvasCat && cats.length) {
        if (_rrhhDashChartCat) _rrhhDashChartCat.destroy();
        var catLabels = cats.map(function (c) { return c.categoria || "Sin cat."; });
        var catData = cats.map(function (c) { return c.coste || 0; });
        var catColors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];
        _rrhhDashChartCat = new Chart(canvasCat.getContext("2d"), {
          type: "doughnut",
          data: {
            labels: catLabels,
            datasets: [{ data: catData, backgroundColor: catColors.slice(0, catLabels.length) }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: "bottom" },
              tooltip: { callbacks: { label: function (ctx) { return ctx.label + ": " + fmtEurFull(ctx.raw); } } }
            }
          }
        });
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
            ah += '<div style="padding:8px 12px;background:' + bg + ';color:' + col + ';border-radius:6px;font-size:0.85rem;margin-bottom:6px;">' + a.texto + '</div>';
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

function _rrhhCargarEmpleados() {
  var tbodyActivos = document.getElementById("tbody-empleados-activos");
  if (!tbodyActivos) return;
  tbodyActivos.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-secondary);">Cargando\u2026</td></tr>';

  fetch("/api/empleados?solo_activos=0")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      _rrhhEmpleadosCache = d.empleados || [];
      _rrhhRenderVistas(_rrhhEmpleadosCache);
    })
    .catch(function (err) {
      tbodyActivos.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#dc3545;">Error al cargar empleados: ' + err.message + '</td></tr>';
    });
}

function _rrhhRenderVistas(lista) {
  var activos = lista.filter(function (e) { return e.estado === "activo" || e.estado === "vacaciones"; });
  var inactivos = lista.filter(function (e) { return e.estado !== "activo" && e.estado !== "vacaciones"; });

  _rrhhRenderTabla(document.getElementById("tbody-empleados-activos"), activos, true);
  _rrhhRenderTabla(document.getElementById("tbody-empleados-inactivos"), inactivos, false);

  var wrapper = document.getElementById("rrhh-inactivos-wrapper");
  if (wrapper) {
    wrapper.style.display = inactivos.length > 0 ? "" : "none";
    var countEl = document.getElementById("count-inactivos");
    if (countEl) countEl.textContent = inactivos.length;
  }
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

    html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_rrhhEditarEmpleado(' + e.id + ')">' +
      '<td style="padding:0.6rem 1rem;font-weight:600;white-space:nowrap;">' + nombreCompleto + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + (e.dni || "\u2014") + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + (e.puesto || "\u2014") + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + (e.telefono || "\u2014") + '</td>' +
      '<td style="padding:0.6rem 0.75rem;"><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:' + estadoColor + '20;color:' + estadoColor + ';">' + estadoLabel + '</span></td>' +
      '<td style="padding:0.6rem 0.75rem;">' + prlBadge + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + aptoBadge + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + carnet + '</td>' +
      '<td style="padding:0.6rem 0.75rem;text-align:center;">' +
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
   "emp-carnet-maquinaria","emp-carnet-maquinaria-cad","emp-formacion-especifica","emp-notas"
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
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-secondary);">Cargando...</td></tr>';
  if (tfoot) tfoot.innerHTML = "";

  fetch("/api/rrhh/nominas/resumen-mensual/" + periodo)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.nominas || !d.nominas.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin n\u00f3minas para ' + _rrhhPeriodoToLabel(periodo) + '</td></tr>';
        return;
      }
      // Sort descending by coste_empresa
      var nominas = d.nominas.slice().sort(function (a, b) { return (b.coste_empresa || 0) - (a.coste_empresa || 0); });
      var html = "";
      var totDev = 0, totDed = 0, totLiq = 0, totCE = 0, totDietas = 0;
      nominas.forEach(function (n, i) {
        var esFin = n.tipo === "FINIQUITO";
        var rowBg = esFin ? "background:#FEF2F2;" : "";
        var nombre = (n.nombre || "") + (n.apellidos ? " " + n.apellidos : "");
        totDev += n.total_devengado || 0;
        totDed += n.total_deducir || 0;
        totLiq += n.liquido || 0;
        totCE += n.coste_empresa || 0;
        totDietas += n.dietas || 0;
        html += '<tr data-nomina-idx="' + i + '" style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;' + rowBg + '" onclick="_rrhhToggleNominaDetail(this,' + i + ')">' +
          '<td style="padding:6px 8px;">' + (i + 1) + '</td>' +
          '<td style="padding:6px 8px;font-weight:500;white-space:nowrap;">' + nombre + '</td>' +
          '<td style="padding:6px 6px;">' + (n.dni || "\u2014") + '</td>' +
          '<td style="padding:6px 6px;">' + (esFin ? '<span style="color:#dc2626;font-weight:600;">FINIQ</span>' : 'NOM') + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.total_devengado) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.total_deducir) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.liquido) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.dietas) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;font-weight:600;">' + fmtEur(n.coste_empresa) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(n.coste_dia) + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
      // Store data for inline expand
      tbody._nominasData = nominas;

      if (tfoot) {
        tfoot.innerHTML = '<tr style="font-weight:700;background:var(--bg-secondary,#f8f9fa);">' +
          '<td colspan="4" style="padding:8px 6px;text-align:right;">TOTALES</td>' +
          '<td style="padding:8px 6px;text-align:right;">' + fmtEur(totDev) + '</td>' +
          '<td style="padding:8px 6px;text-align:right;">' + fmtEur(totDed) + '</td>' +
          '<td style="padding:8px 6px;text-align:right;">' + fmtEur(totLiq) + '</td>' +
          '<td style="padding:8px 6px;text-align:right;">' + fmtEur(totDietas) + '</td>' +
          '<td style="padding:8px 6px;text-align:right;">' + fmtEur(totCE) + '</td>' +
          '<td></td></tr>';
      }
    })
    .catch(function () {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:#dc3545;">Error al cargar</td></tr>';
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
    '<td colspan="10" style="padding:0;background:#f8fafc;">' +
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
function _rrhhVerFichaEmpleado(empId) {
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

    var html = '';
    // Header
    html += '<div class="card" style="padding:16px;margin-bottom:12px;">';
    html += '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">';
    html += '<h3 style="margin:0;font-size:1.1rem;">' + nombreCompleto + '</h3>';
    html += '<span style="padding:2px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:' + estadoColor + '20;color:' + estadoColor + ';">' + estadoLabel + '</span>';
    html += '</div>';
    html += '<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">DNI: ' + (emp.dni || "\u2014") + ' &middot; Categor\u00eda: ' + (emp.categoria || "\u2014") + ' &middot; Antig\u00fcedad: ' + (emp.fecha_antiguedad || "\u2014") + '</div>';
    html += '</div>';

    // Personal KPIs
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">';
    html += _rrhhKpiCard("Coste total", fmtEurFull(res.coste_total), "", "0.95rem");
    html += _rrhhKpiCard("Coste medio/mes", fmtEurFull(res.coste_medio_mes), "", "0.95rem");
    html += _rrhhKpiCard("\u00daltimo coste/d\u00eda", fmtEurFull(res.ultimo_coste_dia), "", "0.95rem");
    html += _rrhhKpiCard("Total dietas", fmtEurFull(res.total_dietas), "", "0.95rem");
    html += _rrhhKpiCard("Total l\u00edquido", fmtEurFull(res.total_liquido), " tes-card-blue", "0.95rem");
    html += _rrhhKpiCard("Meses activos", (res.meses_activos || 0), "", "0.95rem");
    html += '</div>';

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
  var fichaDiv = document.getElementById("rrhh-ficha-empleado");
  if (fichaDiv) fichaDiv.style.display = "none";
  var wrapper = document.getElementById("rrhh-nominas-tabla-wrapper");
  if (wrapper) wrapper.style.display = "";
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
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;">Cargando...</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;">Sin datos</td></tr>';
        return;
      }
      var html = "";
      lineas.forEach(function (l) {
        var esFin = l.tipo === "FINIQUITO";
        var bg = esFin ? "background:#FEF2F2;" : "";
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;' + bg + '" onclick="_rrhhVerFichaEmpleado(' + l.empleado_id + ')">' +
          '<td style="padding:5px 6px;font-weight:500;">' + (l.nombre || "") + '</td>' +
          '<td style="padding:5px 4px;font-size:0.75rem;">' + (l.categoria || "") + '</td>' +
          '<td style="padding:5px 4px;">' + (l.dni || "\u2014") + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (l.dias || "\u2014") + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + fmtEur(l.liquido) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (l.adelantos > 0 ? '<span style="color:#dc2626;">(' + fmtEur(l.adelantos) + ')</span>' : '\u2014') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (l.embargo > 0 ? '<span style="color:#dc2626;">(' + fmtEur(l.embargo) + ')</span>' : '\u2014') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;font-weight:700;">' + fmtEur(l.a_transferir) + '</td>' +
          '<td style="padding:5px 4px;">' + (esFin ? '<span style="color:#dc2626;">FINIQ</span>' : '<span style="color:#22c55e;">\u2713</span>') + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;

      if (tfoot) {
        tfoot.innerHTML = '<tr style="font-weight:700;background:var(--bg-secondary,#f8f9fa);">' +
          '<td colspan="4" style="padding:6px;">TOTALES</td>' +
          '<td style="padding:6px;text-align:right;">' + fmtEur(tot.liquido) + '</td>' +
          '<td style="padding:6px;text-align:right;">' + fmtEur(tot.adelantos) + '</td>' +
          '<td style="padding:6px;text-align:right;">' + fmtEur(tot.embargo) + '</td>' +
          '<td style="padding:6px;text-align:right;font-weight:800;">' + fmtEur(tot.transferir) + '</td>' +
          '<td></td></tr>';
      }
    })
    .catch(function () {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#dc3545;">Error al cargar</td></tr>';
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

// ===============================================================================
// ==  5. DIETAS                                                                ==
// ===============================================================================

function _rrhhCargarDietas() {
  fetch("/api/rrhh/dietas/dashboard")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      // Config table
      var cfgBody = document.getElementById("rrhh-dietas-tbody");
      var cfg = (d.config || []).slice().reverse();
      if (cfgBody) {
        if (!cfg.length) {
          cfgBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1.5rem;">Sin tarifas configuradas. Pulsa \"+ Nueva tarifa\".</td></tr>';
        } else {
          var html = "";
          cfg.forEach(function (c) {
            html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
              '<td style="padding:6px 8px;">' + (c.tipo || '') + '</td>' +
              '<td style="padding:6px 6px;">' + (c.subtipo || '') + '</td>' +
              '<td style="padding:6px 6px;">' + (c.categoria || 'Todas') + '</td>' +
              '<td style="padding:6px 6px;text-align:right;">' + fmtEur(c.importe) + '</td>' +
              '<td style="padding:6px 6px;">' + (c.fecha_vigencia_desde || '') + '</td>' +
              '<td style="padding:6px 6px;">' + (c.fecha_vigencia_hasta || '\u2014') + '</td>' +
              '<td style="padding:6px 6px;text-align:center;"><button onclick="_rrhhBorrarDieta(' + c.id + ')" class="btn-small danger" style="font-size:0.75rem;padding:2px 8px;">Borrar</button></td></tr>';
          });
          cfgBody.innerHTML = html;
        }
      }

      // Employee dietas table — dynamic headers
      var empThead = document.getElementById("rrhh-dietas-emp-thead");
      var empBody = document.getElementById("rrhh-dietas-emp-tbody");
      if (!empBody) return;
      var periodos = (d.periodos || []).slice().reverse();

      // Build thead dynamically
      if (empThead) {
        var th = '<tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;"><th style="padding:6px 8px;font-weight:700;white-space:nowrap;">Empleado</th>';
        periodos.forEach(function (p) {
          th += '<th style="padding:6px 4px;font-weight:700;text-align:right;font-size:0.75rem;white-space:nowrap;">' + p.substring(2) + '</th>';
        });
        th += '<th style="padding:6px 6px;font-weight:700;text-align:right;">Total</th></tr>';
        empThead.innerHTML = th;
      }
      var emps = d.emp_dietas || [];

      // Group by employee
      var byEmp = {};
      emps.forEach(function (e) {
        var key = e.id;
        if (!byEmp[key]) byEmp[key] = { id: e.id, nombre: (e.nombre || "") + ' ' + (e.apellidos || ''), periodos: {} };
        byEmp[key].periodos[e.periodo] = e.dietas;
      });
      if (!Object.keys(byEmp).length) {
        empBody.innerHTML = '<tr><td colspan="' + (periodos.length + 2) + '">Sin datos</td></tr>';
        return;
      }
      var hh = "";
      Object.values(byEmp).forEach(function (e) {
        var total = 0;
        hh += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_rrhhVerFichaEmpleado(' + e.id + ')">' +
          '<td style="padding:5px 8px;font-weight:500;">' + e.nombre + '</td>';
        periodos.forEach(function (p) {
          var v = e.periodos[p] || 0;
          total += v;
          hh += '<td style="padding:5px 6px;text-align:right;">' + (v > 0 ? fmtEur(v) : '\u2014') + '</td>';
        });
        hh += '<td style="padding:5px 6px;text-align:right;font-weight:600;">' + fmtEur(total) + '</td></tr>';
      });
      empBody.innerHTML = hh;
    })
    .catch(function () {});
}

function _rrhhNuevaDieta() {
  var tipo = prompt("Tipo (nacional/internacional):", "nacional");
  if (!tipo) return;
  var subtipo = prompt("Subtipo (completa/media):", "completa");
  var categoria = prompt("Categor\u00eda (dejar vac\u00edo = todas):", "");
  var importe = parseFloat(prompt("Importe EUR/d\u00eda:", "8.03"));
  if (isNaN(importe)) return;
  var desde = prompt("Vigencia desde (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
  var data = { tipo: tipo, subtipo: subtipo, importe: importe, fecha_vigencia_desde: desde };
  if (categoria) data.categoria = categoria;
  fetch("/api/rrhh/dietas/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(function () { _rrhhCargarDietas(); });
}

function _rrhhBorrarDieta(id) {
  if (!confirm("Eliminar tarifa?")) return;
  fetch("/api/rrhh/dietas/config/" + id, { method: "DELETE" }).then(function () { _rrhhCargarDietas(); });
}

// ===============================================================================
// ==  6. ADELANTOS                                                             ==
// ===============================================================================

function _rrhhCargarAdelantos() {
  var empSel = document.getElementById("rrhh-adel-empleado");
  var estadoSel = document.getElementById("rrhh-adel-estado");
  var empId = empSel ? empSel.value : "";
  var estado = estadoSel ? estadoSel.value : "";
  var params = [];
  if (empId) params.push("empleado_id=" + empId);
  if (estado) params.push("estado=" + estado);
  var url = "/api/rrhh/adelantos" + (params.length ? "?" + params.join("&") : "");

  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var k = d.kpis || {};
      var kpis = document.getElementById("rrhh-adel-kpis");
      if (kpis) {
        kpis.innerHTML =
          _rrhhKpiCard("Pendientes", k.pendientes || 0, "") +
          _rrhhKpiCard("Importe pendiente", fmtEurFull(k.importe_pendiente), " tes-card-blue", "0.9rem");
      }

      var tbody = document.getElementById("rrhh-adel-tbody");
      // Sort descending by fecha
      var items = (d.adelantos || []).slice().sort(function (a, b) {
        return (b.fecha || "") > (a.fecha || "") ? 1 : (b.fecha || "") < (a.fecha || "") ? -1 : 0;
      });
      if (!tbody) return;
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Sin adelantos</td></tr>';
        return;
      }
      var html = "";
      items.forEach(function (a) {
        var nombre = ((a.nombre || '') + ' ' + (a.apellidos || '')).trim();
        var estadoHtml = a.estado === 'pendiente'
          ? '<span style="color:#f59e0b;font-weight:500;">Pendiente</span>'
          : '<span style="color:#22c55e;font-weight:500;">Descontado</span>';
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:6px 8px;">' + (a.fecha || '') + '</td>' +
          '<td style="padding:6px 6px;font-weight:500;">' + nombre + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + fmtEur(a.importe) + '</td>' +
          '<td style="padding:6px 6px;">' + (a.concepto || '\u2014') + '</td>' +
          '<td style="padding:6px 6px;">' + estadoHtml + '</td>' +
          '<td style="padding:6px 6px;text-align:center;">' +
            '<button onclick="_rrhhBorrarAdelanto(' + a.id + ')" class="btn-small danger" style="font-size:0.75rem;padding:2px 8px;">X</button>' +
          '</td></tr>';
      });
      tbody.innerHTML = html;

      // Populate employee dropdown if needed
      if (empSel && empSel.options.length <= 1) {
        fetch("/api/rrhh/empleados?estado=todos")
          .then(function (r) { return r.json(); })
          .then(function (ed) {
            (ed.empleados || []).forEach(function (e) {
              var opt = document.createElement("option");
              opt.value = e.id;
              opt.textContent = (e.nombre || '') + ' ' + (e.apellidos || '');
              empSel.appendChild(opt);
            });
          });
      }
    })
    .catch(function () {});
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
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_rrhhVerMes(\'' + m.periodo + '\')">' +
          '<td style="padding:6px 8px;font-weight:500;">' + _rrhhPeriodoToLabel(m.periodo) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + (m.empleados || 0) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + fmtEur(m.base_ss) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + fmtEur(m.ss_empresa) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + fmtEur(m.ss_trabajador) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;font-weight:600;">' + fmtEur(m.total_ss) + '</td></tr>';
      });
      tbody.innerHTML = html;

      // Chart.js bar chart
      var canvasSS = document.getElementById("rrhh-chart-ss");
      if (canvasSS && meses.length) {
        if (_rrhhSSChart) _rrhhSSChart.destroy();
        // Show in chronological order for chart
        var chronoMeses = meses.slice().reverse();
        _rrhhSSChart = new Chart(canvasSS.getContext("2d"), {
          type: "bar",
          data: {
            labels: chronoMeses.map(function (m) { return m.periodo; }),
            datasets: [
              { label: "SS Empresa", data: chronoMeses.map(function (m) { return m.ss_empresa || 0; }), backgroundColor: "#3B82F6" },
              { label: "SS Trabajador", data: chronoMeses.map(function (m) { return m.ss_trabajador || 0; }), backgroundColor: "#10B981" }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
            scales: { y: { ticks: { callback: function (v) { return fmtEur(v); } } } }
          }
        });
      }
    })
    .catch(function () {});
}

// ===============================================================================
// ==  8. IRPF                                                                  ==
// ===============================================================================

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
window._rrhhAbrirModalEmpleado = _rrhhAbrirModalEmpleado;
window._rrhhCerrarModalEmpleado = _rrhhCerrarModalEmpleado;
window._rrhhGuardarEmpleado = _rrhhGuardarEmpleado;
window._rrhhEditarEmpleado = _rrhhEditarEmpleado;
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
window._rrhhNuevaDieta = _rrhhNuevaDieta;
window._rrhhBorrarDieta = _rrhhBorrarDieta;
window._rrhhCargarAdelantos = _rrhhCargarAdelantos;
window._rrhhNuevoAdelanto = _rrhhNuevoAdelanto;
window._rrhhBorrarAdelanto = _rrhhBorrarAdelanto;
window._rrhhCargarSS = _rrhhCargarSS;
window._rrhhCargarIRPF = _rrhhCargarIRPF;
window._rrhhCargarCosteProyecto = _rrhhCargarCosteProyecto;
window._rrhhRenderOCRPreview = _rrhhRenderOCRPreview;
window.fmtEur = fmtEur;
window.fmtEurFull = fmtEurFull;
