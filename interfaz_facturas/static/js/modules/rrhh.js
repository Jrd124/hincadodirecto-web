// ═══════════════════════════════════════════════════════════════════════════
// ██  RRHH – Equipo (gestión de empleados / trabajadores)               ██
// ═══════════════════════════════════════════════════════════════════════════

var _rrhhEmpleadosCache = [];

function _rrhhOnPanelShow(panel) {
  if (panel === "equipo") _rrhhCargarEmpleados();
  else if (panel === "inicio") _rrhhCargarDashboard();
  else if (panel === "nominas") _rrhhCargarNominas();
}

// ── Cargar lista ─────────────────────────────────────────────────────────
function _rrhhCargarEmpleados() {
  var tbodyActivos = document.getElementById("tbody-empleados-activos");
  if (!tbodyActivos) return;
  tbodyActivos.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-secondary);">Cargando…</td></tr>';

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

// ── Separar activos / inactivos y renderizar ─────────────────────────────
function _rrhhRenderVistas(lista) {
  var activos = lista.filter(function (e) { return e.estado === "activo" || e.estado === "vacaciones"; });
  var inactivos = lista.filter(function (e) { return e.estado !== "activo" && e.estado !== "vacaciones"; });

  _rrhhRenderTabla(document.getElementById("tbody-empleados-activos"), activos, true);
  _rrhhRenderTabla(document.getElementById("tbody-empleados-inactivos"), inactivos, false);

  // Mostrar/ocultar wrapper de inactivos
  var wrapper = document.getElementById("rrhh-inactivos-wrapper");
  if (wrapper) {
    wrapper.style.display = inactivos.length > 0 ? "" : "none";
    var countEl = document.getElementById("count-inactivos");
    if (countEl) countEl.textContent = inactivos.length;
  }
}

// ── Render tabla genérica ────────────────────────────────────────────────
function _rrhhRenderTabla(tbody, lista, esActivos) {
  if (!tbody) return;
  if (!lista.length) {
    tbody.innerHTML = esActivos
      ? '<tr><td colspan="9" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">' +
        '<p style="font-size:1.1rem;margin-bottom:0.5rem;">Sin empleados activos</p>' +
        '<p style="font-size:0.85rem;">Pulsa <strong>Nuevo trabajador</strong> para añadir el primero.</p></td></tr>'
      : '';
    return;
  }
  var hoy = new Date().toISOString().slice(0, 10);
  var html = "";
  lista.forEach(function (e) {
    var nombreCompleto = (e.nombre || "") + (e.apellidos ? " " + e.apellidos : "");
    // Estado badge
    var estadoColor = e.estado === "activo" ? "#22c55e" : e.estado === "vacaciones" ? "#f59e0b" : "#ef4444";
    var estadoLabel = e.estado ? e.estado.charAt(0).toUpperCase() + e.estado.slice(1) : "—";
    // PRL badge
    var prlOk = e.prl_basico === 1 || e.prl_basico === "1";
    var prlCad = e.prl_basico_caducidad || "";
    var prlVencido = prlCad && prlCad < hoy;
    var prlBadge = prlOk
      ? (prlVencido
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:#fef2f2;color:#dc2626;">Vencido</span>'
        : '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:#f0fdf4;color:#16a34a;">Sí</span>')
      : '<span style="color:var(--text-secondary);font-size:0.8rem;">No</span>';
    // Apto médico
    var aptoOk = e.apto_medico === 1 || e.apto_medico === "1";
    var aptoCad = e.apto_medico_caducidad || "";
    var aptoVencido = aptoCad && aptoCad < hoy;
    var aptoBadge = aptoOk
      ? (aptoVencido
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:#fef2f2;color:#dc2626;">Vencido</span>'
        : '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:#f0fdf4;color:#16a34a;">Sí</span>')
      : '<span style="color:var(--text-secondary);font-size:0.8rem;">No</span>';
    // Carnet
    var carnet = e.carnet_conducir || "—";

    html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_rrhhEditarEmpleado(' + e.id + ')">' +
      '<td style="padding:0.6rem 1rem;font-weight:600;white-space:nowrap;">' + nombreCompleto + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + (e.dni || "—") + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + (e.puesto || "—") + '</td>' +
      '<td style="padding:0.6rem 0.75rem;">' + (e.telefono || "—") + '</td>' +
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

// ── Toggle desplegable inactivos ─────────────────────────────────────────
var _rrhhInactivosAbierto = false;
function _rrhhToggleInactivos() {
  _rrhhInactivosAbierto = !_rrhhInactivosAbierto;
  var panel = document.getElementById("rrhh-inactivos-panel");
  var icono = document.getElementById("icono-toggle-inactivos");
  if (panel) panel.style.display = _rrhhInactivosAbierto ? "" : "none";
  if (icono) icono.style.transform = _rrhhInactivosAbierto ? "rotate(180deg)" : "";
}

// ── Búsqueda libre ───────────────────────────────────────────────────────
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

// ── Modal: abrir / cerrar ────────────────────────────────────────────────
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

// ── Form helpers ─────────────────────────────────────────────────────────
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

// ── Guardar (crear / actualizar) ─────────────────────────────────────────
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

// ── Editar (abrir modal con datos) ──────────────────────────────────────
function _rrhhEditarEmpleado(id) {
  _rrhhAbrirModalEmpleado(id);
}

// ── Eliminar ────────────────────────────────────────────────────────────
function _rrhhEliminarEmpleado(id, nombre) {
  if (!confirm("¿Dar de baja a " + nombre + "?")) return;
  fetch("/api/empleados/" + id, { method: "DELETE" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) { alert(d.error); return; }
      _rrhhCargarEmpleados();
    })
    .catch(function (err) { alert("Error: " + err.message); });
}

// ═══════════════════════════════════════════════════════════════════════════
// ██  RRHH — Dashboard                                                    ██
// ═══════════════════════════════════════════════════════════════════════════

function _rrhhFmtEur(n) {
  if (n == null) return "—";
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20ac";
}

var _rrhhDashCargado = false;

function _rrhhCargarDashboard() {
  // KPIs
  fetch("/api/rrhh/estadisticas")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      document.getElementById("rrhh-kpi-activos").textContent = d.emp_activos;
      document.getElementById("rrhh-kpi-coste-mes").textContent = _rrhhFmtEur(d.coste_mes);
      document.getElementById("rrhh-kpi-coste-dia").textContent = _rrhhFmtEur(d.coste_medio_dia);
      document.getElementById("rrhh-kpi-dietas").textContent = _rrhhFmtEur(d.dietas_mes);
      document.getElementById("rrhh-kpi-nominas").textContent = d.total_nominas;
      document.getElementById("rrhh-kpi-rotacion").textContent = d.finiquitos_12m;
    })
    .catch(function () {});

  // Resumen mensual
  fetch("/api/rrhh/nominas/resumen-mensual")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var tbody = document.getElementById("rrhh-tbody-resumen-mensual");
      if (!d.meses || !d.meses.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin datos de n\u00f3minas</td></tr>';
        return;
      }
      var html = "";
      d.meses.forEach(function (m) {
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_rrhhVerMes(\'' + m.periodo + '\')">' +
          '<td style="padding:7px 10px;font-weight:600;">' + m.periodo + '</td>' +
          '<td style="padding:7px 10px;text-align:right;">' + m.num_empleados + '</td>' +
          '<td style="padding:7px 10px;text-align:right;">' + _rrhhFmtEur(m.total_coste_empresa) + '</td>' +
          '<td style="padding:7px 10px;text-align:right;">' + _rrhhFmtEur(m.total_liquido) + '</td>' +
          '<td style="padding:7px 10px;text-align:right;">' + _rrhhFmtEur(m.total_dietas) + '</td>' +
          '<td style="padding:7px 10px;text-align:right;">' + (m.num_finiquitos > 0 ? '<span style="color:#dc2626;">' + m.num_finiquitos + '</span>' : '0') + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function () {});
  _rrhhDashCargado = true;
}

// ═══════════════════════════════════════════════════════════════════════════
// ██  RRHH — Nóminas mensuales                                            ██
// ═══════════════════════════════════════════════════════════════════════════

var _rrhhNominasInit = false;
var _rrhhPeriodos = [];

function _rrhhCargarNominas() {
  if (!_rrhhNominasInit) {
    _rrhhNominasInit = true;
    // Cargar periodos
    fetch("/api/rrhh/estadisticas")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        _rrhhPeriodos = d.periodos || [];
        var sel = document.getElementById("rrhh-nominas-periodo");
        sel.innerHTML = "";
        _rrhhPeriodos.slice().reverse().forEach(function (p) {
          sel.innerHTML += '<option value="' + p + '">' + p + '</option>';
        });
        if (_rrhhPeriodos.length) {
          sel.value = _rrhhPeriodos[_rrhhPeriodos.length - 1];
          _rrhhCargarMes(sel.value);
        }
      });
    document.getElementById("rrhh-nominas-periodo").addEventListener("change", function () {
      _rrhhCargarMes(this.value);
      // Ocultar ficha si estaba abierta
      _rrhhCerrarFicha();
    });
    // Import handler
    document.getElementById("rrhh-import-file").addEventListener("change", function () {
      if (!this.files.length) return;
      var fd = new FormData();
      fd.append("archivo", this.files[0]);
      fetch("/api/rrhh/importar-nominas", { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { alert("Error: " + d.error); return; }
          var msg = "Importaci\u00f3n completada:\n" +
            d.empleados_creados + " empleados creados\n" +
            d.empleados_actualizados + " empleados actualizados\n" +
            d.nominas_importadas + " n\u00f3minas importadas\n" +
            d.finiquitos_importados + " finiquitos importados";
          if (d.errores && d.errores.length) msg += "\n\nErrores: " + d.errores.join("; ");
          alert(msg);
          // Reload
          _rrhhNominasInit = false;
          _rrhhCargarNominas();
        })
        .catch(function (err) { alert("Error: " + err.message); });
      this.value = "";
    });
  } else {
    // Reload current month
    var sel = document.getElementById("rrhh-nominas-periodo");
    if (sel.value) _rrhhCargarMes(sel.value);
  }
}

function _rrhhCargarMes(periodo) {
  var tbody = document.getElementById("rrhh-tbody-nominas-mes");
  var tfoot = document.getElementById("rrhh-tfoot-nominas-mes");
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-secondary);">Cargando...</td></tr>';
  tfoot.innerHTML = "";

  fetch("/api/rrhh/nominas/resumen-mensual/" + periodo)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.nominas || !d.nominas.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin n\u00f3minas para ' + periodo + '</td></tr>';
        return;
      }
      var html = "";
      var totDev = 0, totDed = 0, totLiq = 0, totCE = 0, totDietas = 0;
      d.nominas.forEach(function (n, i) {
        var esFin = n.tipo === "FINIQUITO";
        var rowBg = esFin ? "background:#FEF2F2;" : "";
        var nombre = (n.nombre || "") + (n.apellidos ? " " + n.apellidos : "");
        totDev += n.total_devengado || 0;
        totDed += n.total_deducir || 0;
        totLiq += n.liquido || 0;
        totCE += n.coste_empresa || 0;
        totDietas += n.dietas || 0;
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;' + rowBg + '" onclick="_rrhhVerFichaEmpleado(' + n.empleado_id + ')">' +
          '<td style="padding:6px 8px;">' + (i + 1) + '</td>' +
          '<td style="padding:6px 8px;font-weight:500;white-space:nowrap;">' + nombre + '</td>' +
          '<td style="padding:6px 6px;">' + (esFin ? '<span style="color:#dc2626;font-weight:600;">FINIQ</span>' : 'NOM') + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(n.salario_base) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(n.dietas) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(n.total_devengado) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(n.total_deducir) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(n.liquido) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;font-weight:600;">' + _rrhhFmtEur(n.coste_empresa) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(n.coste_dia) + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
      tfoot.innerHTML = '<tr>' +
        '<td colspan="5" style="padding:8px 8px;text-align:right;">TOTALES</td>' +
        '<td style="padding:8px 6px;text-align:right;">' + _rrhhFmtEur(totDev) + '</td>' +
        '<td style="padding:8px 6px;text-align:right;">' + _rrhhFmtEur(totDed) + '</td>' +
        '<td style="padding:8px 6px;text-align:right;">' + _rrhhFmtEur(totLiq) + '</td>' +
        '<td style="padding:8px 6px;text-align:right;">' + _rrhhFmtEur(totCE) + '</td>' +
        '<td></td></tr>';
    })
    .catch(function () { tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:#dc3545;">Error al cargar</td></tr>'; });
}

// ═══════════════════════════════════════════════════════════════════════════
// ██  RRHH — Ficha individual de empleado                                 ██
// ═══════════════════════════════════════════════════════════════════════════

function _rrhhVerFichaEmpleado(empId) {
  document.getElementById("rrhh-nominas-tabla-wrapper").style.display = "none";
  var fichaDiv = document.getElementById("rrhh-ficha-empleado");
  var contenido = document.getElementById("rrhh-ficha-contenido");
  fichaDiv.style.display = "block";
  contenido.innerHTML = '<p style="padding:1rem;color:var(--text-secondary);">Cargando ficha...</p>';

  // Fetch both in parallel
  Promise.all([
    fetch("/api/rrhh/empleados/" + empId).then(function (r) { return r.json(); }),
    fetch("/api/rrhh/empleados/" + empId + "/nominas").then(function (r) { return r.json(); })
  ]).then(function (results) {
    var emp = results[0];
    var nominas = results[1].nominas || [];
    if (emp.error) { contenido.innerHTML = '<p style="color:#dc3545;">' + emp.error + '</p>'; return; }
    var res = emp.resumen || {};
    var nombreCompleto = (emp.nombre || "") + (emp.apellidos ? " " + emp.apellidos : "");

    // Estado badge
    var estadoColor = emp.estado === "activo" ? "#22c55e" : emp.estado === "exempleado" ? "#ef4444" : "#f59e0b";
    var estadoLabel = emp.estado ? emp.estado.charAt(0).toUpperCase() + emp.estado.slice(1) : "";

    var html = '';
    // Cabecera
    html += '<div class="card" style="padding:16px;margin-bottom:12px;">';
    html += '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">';
    html += '<h3 style="margin:0;font-size:1.1rem;">' + nombreCompleto + '</h3>';
    html += '<span style="padding:2px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:' + estadoColor + '20;color:' + estadoColor + ';">' + estadoLabel + '</span>';
    html += '</div>';
    html += '<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">DNI: ' + (emp.dni || "\u2014") + ' &middot; Categor\u00eda: ' + (emp.categoria || "\u2014") + ' &middot; Antig\u00fcedad: ' + (emp.fecha_antiguedad || "\u2014") + '</div>';
    html += '</div>';

    // KPIs personales
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">';
    html += '<div class="tes-card"><span class="tes-label">Coste total</span><span class="tes-valor" style="font-size:0.95rem;">' + _rrhhFmtEur(res.coste_total) + '</span></div>';
    html += '<div class="tes-card"><span class="tes-label">Coste medio/mes</span><span class="tes-valor" style="font-size:0.95rem;">' + _rrhhFmtEur(res.coste_medio_mes) + '</span></div>';
    html += '<div class="tes-card"><span class="tes-label">\u00daltimo coste/d\u00eda</span><span class="tes-valor" style="font-size:0.95rem;">' + _rrhhFmtEur(res.ultimo_coste_dia) + '</span></div>';
    html += '<div class="tes-card"><span class="tes-label">Total dietas</span><span class="tes-valor" style="font-size:0.95rem;">' + _rrhhFmtEur(res.total_dietas) + '</span></div>';
    html += '<div class="tes-card"><span class="tes-label">Meses activos</span><span class="tes-valor" style="font-size:0.95rem;">' + (res.meses_activos || 0) + '</span></div>';
    html += '</div>';

    // Tabla evolución mensual
    html += '<div class="card" style="overflow-x:auto;padding:0;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">';
    html += '<thead><tr style="background:var(--bg-secondary,#f8f9fa);text-align:left;">';
    html += '<th style="padding:7px 8px;font-weight:700;">Periodo</th>';
    html += '<th style="padding:7px 6px;font-weight:700;">Tipo</th>';
    html += '<th style="padding:7px 6px;font-weight:700;text-align:right;">Sal. Base</th>';
    html += '<th style="padding:7px 6px;font-weight:700;text-align:right;">Dietas</th>';
    html += '<th style="padding:7px 6px;font-weight:700;text-align:right;">L\u00edquido</th>';
    html += '<th style="padding:7px 6px;font-weight:700;text-align:right;">Coste Empresa</th>';
    html += '<th style="padding:7px 6px;font-weight:700;text-align:right;">Coste/D\u00eda</th>';
    html += '</tr></thead><tbody>';
    if (!nominas.length) {
      html += '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary);">Sin n\u00f3minas</td></tr>';
    } else {
      nominas.forEach(function (n) {
        var esFin = n.tipo === "FINIQUITO";
        var rowBg = esFin ? "background:#FEF2F2;" : "";
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);' + rowBg + '">';
        html += '<td style="padding:6px 8px;font-weight:500;">' + n.periodo + '</td>';
        html += '<td style="padding:6px 6px;">' + (esFin ? '<span style="color:#dc2626;font-weight:600;">FINIQ</span>' : 'NOM') + '</td>';
        html += '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(n.salario_base) + '</td>';
        html += '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(n.dietas) + '</td>';
        html += '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(n.liquido) + '</td>';
        html += '<td style="padding:6px 6px;text-align:right;font-weight:600;">' + _rrhhFmtEur(n.coste_empresa) + '</td>';
        html += '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(n.coste_dia) + '</td>';
        html += '</tr>';
      });
    }
    html += '</tbody></table></div>';

    contenido.innerHTML = html;
  }).catch(function (err) {
    contenido.innerHTML = '<p style="color:#dc3545;">Error: ' + err.message + '</p>';
  });
}

function _rrhhCerrarFicha() {
  document.getElementById("rrhh-ficha-empleado").style.display = "none";
  document.getElementById("rrhh-nominas-tabla-wrapper").style.display = "";
}

// Click desde dashboard "Ver mes"
function _rrhhVerMes(periodo) {
  // Navigate to nominas subpanel with that month
  if (typeof activarSubpanel === "function") activarSubpanel("rrhh", "nominas");
  _rrhhCargarNominas();
  setTimeout(function () {
    var sel = document.getElementById("rrhh-nominas-periodo");
    if (sel) { sel.value = periodo; _rrhhCargarMes(periodo); }
  }, 100);
}

// ── Expose globally ─────────────────────────────────────────────────────
window._rrhhOnPanelShow = _rrhhOnPanelShow;
window._rrhhCargarEmpleados = _rrhhCargarEmpleados;
window._rrhhAbrirModalEmpleado = _rrhhAbrirModalEmpleado;
window._rrhhCerrarModalEmpleado = _rrhhCerrarModalEmpleado;
window._rrhhGuardarEmpleado = _rrhhGuardarEmpleado;
window._rrhhEditarEmpleado = _rrhhEditarEmpleado;
window._rrhhEliminarEmpleado = _rrhhEliminarEmpleado;
window._rrhhToggleInactivos = _rrhhToggleInactivos;
window._rrhhVerMes = _rrhhVerMes;
window._rrhhVerFichaEmpleado = _rrhhVerFichaEmpleado;
window._rrhhCerrarFicha = _rrhhCerrarFicha;
window._rrhhCargarDashboard = _rrhhCargarDashboard;
