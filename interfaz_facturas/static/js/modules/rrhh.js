// ═══════════════════════════════════════════════════════════════════════════
// ██  RRHH – Equipo (gestión de empleados / trabajadores)               ██
// ═══════════════════════════════════════════════════════════════════════════

var _rrhhEmpleadosCache = [];

function _rrhhOnPanelShow(panel) {
  if (panel === "equipo") _rrhhCargarEmpleados();
  else if (panel === "inicio") _rrhhCargarDashboard();
  else if (panel === "nominas") _rrhhCargarNominas();
  else if (panel === "verificador") _rrhhCargarVerificador();
  else if (panel === "dietas") _rrhhCargarDietas();
  else if (panel === "adelantos") _rrhhCargarAdelantos();
  else if (panel === "ss") _rrhhCargarSS();
  else if (panel === "irpf") _rrhhCargarIRPF();
  else if (panel === "costeproyecto") _rrhhCargarCosteProyecto();
  else if (panel === "importar") _rrhhInitImportar();
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
  fetch("/api/rrhh/dashboard")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var k = d.kpis || {};
      document.getElementById("rrhh-kpi-activos").textContent = k.emp_activos || 0;
      document.getElementById("rrhh-kpi-coste-mes").textContent = _rrhhFmtEur(k.coste_mes);
      document.getElementById("rrhh-kpi-coste-dia").textContent = _rrhhFmtEur(k.coste_dia);
      document.getElementById("rrhh-kpi-dietas").textContent = _rrhhFmtEur(k.dietas_mes);
      var varEl = document.getElementById("rrhh-kpi-variacion");
      if (varEl) {
        var v = k.variacion || 0;
        var arrow = v > 0 ? "\u2191" : v < 0 ? "\u2193" : "";
        varEl.textContent = arrow + " " + Math.abs(v) + "%";
        varEl.style.color = v > 0 ? "#dc2626" : v < 0 ? "#16a34a" : "inherit";
      }
      var rotEl = document.getElementById("rrhh-kpi-rotacion");
      if (rotEl) rotEl.textContent = (k.rotacion || 0) + "%";

      // Evolución mensual
      var tbody = document.getElementById("rrhh-tbody-resumen-mensual");
      var evo = d.evolucion || [];
      if (!evo.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Sin datos</td></tr>';
      } else {
        var html = "";
        evo.forEach(function (m) {
          html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_rrhhVerMes(\'' + m.periodo + '\')">' +
            '<td style="padding:7px 10px;font-weight:600;">' + m.periodo + '</td>' +
            '<td style="padding:7px 10px;text-align:right;">' + m.empleados + '</td>' +
            '<td style="padding:7px 10px;text-align:right;">' + _rrhhFmtEur(m.coste_empresa) + '</td>' +
            '<td style="padding:7px 10px;text-align:right;">' + _rrhhFmtEur(m.salarios) + '</td>' +
            '<td style="padding:7px 10px;text-align:right;">' + _rrhhFmtEur(m.dietas) + '</td>' +
            '<td style="padding:7px 10px;text-align:right;">' + _rrhhFmtEur(m.ss_empresa) + '</td>' +
            '</tr>';
        });
        tbody.innerHTML = html;
      }

      // Top 5
      var top5 = d.top5 || [];
      var topDiv = document.getElementById("rrhh-top5");
      if (topDiv && top5.length) {
        var h = '<h4 style="margin:12px 0 6px;font-size:0.9rem;font-weight:700;">Top 5 coste/d\u00eda</h4><div class="card" style="padding:0;overflow:hidden;"><table style="width:100%;border-collapse:collapse;font-size:0.82rem;">';
        top5.forEach(function (t) {
          h += '<tr style="border-bottom:1px solid var(--border,#e9ecef);cursor:pointer;" onclick="_rrhhVerFichaEmpleado(' + t.id + ')">' +
            '<td style="padding:5px 8px;font-weight:500;">' + t.nombre + ' ' + (t.apellidos || '') + '</td>' +
            '<td style="padding:5px 6px;">' + (t.categoria || '') + '</td>' +
            '<td style="padding:5px 6px;text-align:right;">' + _rrhhFmtEur(t.coste_dia) + '/d</td>' +
            '<td style="padding:5px 6px;text-align:right;">' + _rrhhFmtEur(t.coste_empresa) + '</td></tr>';
        });
        h += '</table></div>';
        topDiv.innerHTML = h;
      }

      // Alertas
      var alertas = d.alertas || [];
      var alertDiv = document.getElementById("rrhh-alertas");
      if (alertDiv) {
        if (!alertas.length) { alertDiv.innerHTML = ""; }
        else {
          var ah = '';
          alertas.forEach(function (a) {
            var bg = a.tipo === "warning" ? "#FEF3C7" : "#EFF6FF";
            var col = a.tipo === "warning" ? "#92400E" : "#1E40AF";
            ah += '<div style="padding:8px 12px;background:' + bg + ';color:' + col + ';border-radius:6px;font-size:0.85rem;margin-bottom:6px;">' + a.texto + '</div>';
          });
          alertDiv.innerHTML = ah;
        }
      }
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
      _rrhhCerrarFicha();
    });
  } else {
    // Reload current month
    var sel = document.getElementById("rrhh-nominas-periodo");
    if (sel.value) _rrhhCargarMes(sel.value);
  }
}

// ═══ OCR Preview / Confirm ═══════════════════════════════════════════════

var _rrhhOCRData = [];

function _rrhhRenderOCRPreview(nominas) {
  var tbody = document.getElementById("rrhh-ocr-tbody");
  if (!nominas.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;">No se extrajeron n\u00f3minas</td></tr>';
    return;
  }
  var html = "";
  nominas.forEach(function (n, i) {
    var esFin = n.tipo === "FINIQUITO";
    var rowBg = esFin ? "background:#FEF2F2;" : "";
    var estado = n._estado || "?";
    var estadoHtml = estado === "match"
      ? '<span style="color:#22c55e;font-weight:600;" title="' + (n._emp_nombre || '') + '">\u2705 Match</span>'
      : estado === "nuevo"
        ? '<span style="color:#f59e0b;font-weight:600;">\u26a0\ufe0f Nuevo</span>'
        : '<span style="color:#ef4444;font-weight:600;">\u274c Error</span>';
    html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);' + rowBg + '">' +
      '<td style="padding:5px 6px;font-weight:500;" title="' + (n._archivo || '') + '">' + (n.nombre || '-') + '</td>' +
      '<td style="padding:5px 6px;">' + (n.dni || '-') + '</td>' +
      '<td style="padding:5px 6px;">' + (n.periodo || '-') + '</td>' +
      '<td style="padding:5px 6px;">' + (esFin ? '<span style="color:#dc2626;">FINIQ</span>' : 'NOM') + '</td>' +
      '<td style="padding:5px 6px;text-align:right;">' + (n.dias || '-') + '</td>' +
      '<td style="padding:5px 6px;text-align:right;">' + _rrhhFmtEur(n.total_devengado) + '</td>' +
      '<td style="padding:5px 6px;text-align:right;">' + _rrhhFmtEur(n.total_deducir) + '</td>' +
      '<td style="padding:5px 6px;text-align:right;">' + _rrhhFmtEur(n.liquido) + '</td>' +
      '<td style="padding:5px 6px;text-align:right;font-weight:600;">' + _rrhhFmtEur(n.coste_empresa) + '</td>' +
      '<td style="padding:5px 6px;">' + estadoHtml + '</td>' +
      '</tr>';
  });
  tbody.innerHTML = html;
}

function _rrhhConfirmarOCR() {
  if (!_rrhhOCRData.length) return;
  if (!confirm("Importar " + _rrhhOCRData.length + " n\u00f3mina(s) a la base de datos?")) return;
  document.getElementById("rrhh-ocr-confirmar").disabled = true;
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
    _rrhhCargarNominas();
  })
  .catch(function (err) { alert("Error: " + err.message); });
}

function _rrhhCerrarOCR() {
  document.getElementById("rrhh-ocr-preview").style.display = "none";
  _rrhhOCRData = [];
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

// ═══ Verificador ═════════════════════════════════════════════════════════

var _rrhhVerifInit = false;

function _rrhhCargarVerificador() {
  if (!_rrhhVerifInit) {
    _rrhhVerifInit = true;
    fetch("/api/rrhh/estadisticas").then(function(r){return r.json();}).then(function(d){
      var sel = document.getElementById("rrhh-verif-periodo");
      sel.innerHTML = "";
      (d.periodos || []).slice().reverse().forEach(function(p){ sel.innerHTML += '<option value="'+p+'">'+p+'</option>'; });
      if (d.periodos && d.periodos.length) { sel.value = d.periodos[d.periodos.length-1]; _rrhhLoadVerif(sel.value); }
    });
    document.getElementById("rrhh-verif-periodo").addEventListener("change", function(){ _rrhhLoadVerif(this.value); });
  }
}

function _rrhhLoadVerif(periodo) {
  var tbody = document.getElementById("rrhh-verif-tbody");
  var tfoot = document.getElementById("rrhh-verif-tfoot");
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Cargando...</td></tr>';
  tfoot.innerHTML = "";

  fetch("/api/rrhh/verificador/" + periodo)
    .then(function(r){return r.json();})
    .then(function(d){
      var tot = d.totales || {};
      var kpis = document.getElementById("rrhh-verif-kpis");
      kpis.innerHTML =
        '<div class="tes-card"><span class="tes-label">N\u00f3minas</span><span class="tes-valor" style="font-size:1rem;">' + (tot.nominas||0) + '</span></div>' +
        '<div class="tes-card tes-card-blue"><span class="tes-label">Total l\u00edquido</span><span class="tes-valor" style="font-size:0.9rem;">' + _rrhhFmtEur(tot.liquido) + '</span></div>' +
        '<div class="tes-card"><span class="tes-label">Adelantos</span><span class="tes-valor" style="font-size:0.9rem;">' + _rrhhFmtEur(tot.adelantos) + '</span></div>' +
        '<div class="tes-card"><span class="tes-label">Embargos</span><span class="tes-valor" style="font-size:0.9rem;">' + _rrhhFmtEur(tot.embargo) + '</span></div>' +
        '<div class="tes-card tes-card-green"><span class="tes-label"><b>A TRANSFERIR</b></span><span class="tes-valor" style="font-size:0.9rem;">' + _rrhhFmtEur(tot.transferir) + '</span></div>';

      var lineas = d.lineas || [];
      if (!lineas.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Sin datos</td></tr>'; return; }
      var html = "";
      lineas.forEach(function(l){
        var esFin = l.tipo === "FINIQUITO";
        var bg = esFin ? "background:#FEF2F2;" : "";
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);'+bg+'">' +
          '<td style="padding:5px 6px;font-weight:500;">' + l.nombre + '</td>' +
          '<td style="padding:5px 4px;font-size:0.75rem;">' + l.categoria + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + l.dias + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + _rrhhFmtEur(l.liquido) + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (l.adelantos > 0 ? '<span style="color:#dc2626;">-'+_rrhhFmtEur(l.adelantos)+'</span>' : '-') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;">' + (l.embargo > 0 ? '<span style="color:#dc2626;">-'+_rrhhFmtEur(l.embargo)+'</span>' : '-') + '</td>' +
          '<td style="padding:5px 4px;text-align:right;font-weight:700;">' + _rrhhFmtEur(l.a_transferir) + '</td>' +
          '<td style="padding:5px 4px;">' + (esFin ? '<span style="color:#dc2626;">FINIQ</span>' : '<span style="color:#22c55e;">\u2713</span>') + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
      tfoot.innerHTML = '<tr><td colspan="3" style="padding:6px;">TOTALES</td><td style="padding:6px;text-align:right;">'+_rrhhFmtEur(tot.liquido)+'</td><td style="padding:6px;text-align:right;">'+_rrhhFmtEur(tot.adelantos)+'</td><td style="padding:6px;text-align:right;">'+_rrhhFmtEur(tot.embargo)+'</td><td style="padding:6px;text-align:right;font-weight:800;">'+_rrhhFmtEur(tot.transferir)+'</td><td></td></tr>';
    });
}

function _rrhhGenerarRemesa() {
  var periodo = document.getElementById("rrhh-verif-periodo").value;
  if (!periodo) { alert("Selecciona un periodo"); return; }
  window.open("/api/rrhh/verificador/" + periodo + "/generar-remesa", "_blank");
}

// ═══ Seguridad Social ═══════════════════════════════════════════════════

function _rrhhCargarSS() {
  fetch("/api/rrhh/seguridad-social")
    .then(function(r){return r.json();})
    .then(function(d){
      var k = d.kpis || {};
      var kpis = document.getElementById("rrhh-ss-kpis");
      kpis.innerHTML =
        '<div class="tes-card tes-card-blue"><span class="tes-label">SS Empresa/mes</span><span class="tes-valor" style="font-size:0.9rem;">' + _rrhhFmtEur(k.ss_empresa_mes) + '</span></div>' +
        '<div class="tes-card"><span class="tes-label">SS Trabajador/mes</span><span class="tes-valor" style="font-size:0.9rem;">' + _rrhhFmtEur(k.ss_trabajador_mes) + '</span></div>' +
        '<div class="tes-card tes-card-green"><span class="tes-label">Acumulado a\u00f1o</span><span class="tes-valor" style="font-size:0.9rem;">' + _rrhhFmtEur(k.acumulado_anio) + '</span></div>';

      var meses = d.meses || [];
      var tbody = document.getElementById("rrhh-ss-tbody");
      if (!meses.length) { tbody.innerHTML = '<tr><td colspan="6">Sin datos</td></tr>'; return; }
      var html = "";
      meses.forEach(function(m){
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:6px 8px;font-weight:500;">' + m.periodo + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + m.empleados + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + _rrhhFmtEur(m.base_ss) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + _rrhhFmtEur(m.ss_empresa) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;">' + _rrhhFmtEur(m.ss_trabajador) + '</td>' +
          '<td style="padding:6px 4px;text-align:right;font-weight:600;">' + _rrhhFmtEur(m.total_ss) + '</td></tr>';
      });
      tbody.innerHTML = html;
    });
}

// ═══ IRPF ════════════════════════════════════════════════════════════════

function _rrhhCargarIRPF() {
  fetch("/api/rrhh/irpf")
    .then(function(r){return r.json();})
    .then(function(d){
      var k = d.kpis || {};
      var kpis = document.getElementById("rrhh-irpf-kpis");
      kpis.innerHTML =
        '<div class="tes-card tes-card-blue"><span class="tes-label">Acumulado a\u00f1o</span><span class="tes-valor" style="font-size:0.9rem;">' + _rrhhFmtEur(k.acumulado_anio) + '</span></div>' +
        '<div class="tes-card"><span class="tes-label">% Retenci\u00f3n medio</span><span class="tes-valor" style="font-size:0.9rem;">' + (k.pct_medio||0) + '%</span></div>';

      var trs = d.trimestres || [];
      var tbody = document.getElementById("rrhh-irpf-tbody");
      if (!trs.length) { tbody.innerHTML = '<tr><td colspan="7">Sin datos</td></tr>'; return; }
      var html = "";
      trs.forEach(function(t){
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:6px 8px;font-weight:600;">' + t.trimestre + '</td>' +
          '<td style="padding:6px 6px;">' + t.meses_label + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + t.nominas + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(t.base) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;font-weight:600;">' + _rrhhFmtEur(t.retenido) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + t.pct_medio + '%</td>' +
          '<td style="padding:6px 6px;">' + t.fecha_limite + '</td></tr>';
      });
      tbody.innerHTML = html;
    });
}

// ═══ Coste Proyecto ══════════════════════════════════════════════════════

function _rrhhCargarCosteProyecto() {
  fetch("/api/rrhh/coste-proyecto")
    .then(function(r){return r.json();})
    .then(function(d){
      var tbody = document.getElementById("rrhh-costeproy-tbody");
      var proys = d.proyectos || [];
      if (!proys.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Sin datos de asignaciones empleado-proyecto</td></tr>'; return; }
      var html = "";
      proys.forEach(function(p){
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:6px 8px;font-weight:500;">' + (p.codigo||'') + ' ' + (p.proyecto||'') + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + p.empleados + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + p.dias_hombre + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(p.coste_personal) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(p.dietas) + '</td>' +
          '<td style="padding:6px 6px;text-align:right;font-weight:700;">' + _rrhhFmtEur(p.total_rrhh) + '</td></tr>';
      });
      tbody.innerHTML = html;
    });
}

// ═══ Dietas ══════════════════════════════════════════════════════════════

function _rrhhCargarDietas() {
  fetch("/api/rrhh/dietas/dashboard")
    .then(function(r){return r.json();})
    .then(function(d){
      // Config table
      var cfgBody = document.getElementById("rrhh-dietas-tbody");
      var cfg = d.config || [];
      if (!cfg.length) {
        cfgBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1.5rem;">Sin tarifas configuradas. Pulsa \"+ Nueva tarifa\".</td></tr>';
      } else {
        var html = "";
        cfg.forEach(function(c){
          html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
            '<td style="padding:6px 8px;">' + (c.tipo||'') + '</td>' +
            '<td style="padding:6px 6px;">' + (c.subtipo||'') + '</td>' +
            '<td style="padding:6px 6px;">' + (c.categoria||'Todas') + '</td>' +
            '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(c.importe) + '</td>' +
            '<td style="padding:6px 6px;">' + (c.fecha_vigencia_desde||'') + '</td>' +
            '<td style="padding:6px 6px;">' + (c.fecha_vigencia_hasta||'-') + '</td>' +
            '<td style="padding:6px 6px;text-align:center;"><button onclick="_rrhhBorrarDieta('+c.id+')" class="btn-small danger" style="font-size:0.75rem;padding:2px 8px;">Borrar</button></td></tr>';
        });
        cfgBody.innerHTML = html;
      }
      // Employee dietas
      var empBody = document.getElementById("rrhh-dietas-emp-tbody");
      var periodos = d.periodos || [];
      var emps = d.emp_dietas || [];
      // Group by employee
      var byEmp = {};
      emps.forEach(function(e){
        var key = e.id;
        if (!byEmp[key]) byEmp[key] = { nombre: e.nombre + ' ' + (e.apellidos||''), periodos: {} };
        byEmp[key].periodos[e.periodo] = e.dietas;
      });
      if (!Object.keys(byEmp).length) { empBody.innerHTML = '<tr><td colspan="5">Sin datos</td></tr>'; return; }
      var hh = "";
      Object.values(byEmp).forEach(function(e){
        var total = 0;
        hh += '<tr style="border-bottom:1px solid var(--border,#e9ecef);"><td style="padding:5px 8px;font-weight:500;">' + e.nombre + '</td>';
        periodos.forEach(function(p){
          var v = e.periodos[p] || 0; total += v;
          hh += '<td style="padding:5px 6px;text-align:right;">' + (v > 0 ? _rrhhFmtEur(v) : '-') + '</td>';
        });
        hh += '<td style="padding:5px 6px;text-align:right;font-weight:600;">' + _rrhhFmtEur(total) + '</td></tr>';
      });
      empBody.innerHTML = hh;
    });
}

function _rrhhNuevaDieta() {
  var tipo = prompt("Tipo (nacional/internacional):", "nacional");
  if (!tipo) return;
  var subtipo = prompt("Subtipo (completa/media):", "completa");
  var importe = parseFloat(prompt("Importe EUR/d\u00eda:", "8.03"));
  if (isNaN(importe)) return;
  var desde = prompt("Vigencia desde (YYYY-MM-DD):", new Date().toISOString().slice(0,10));
  fetch("/api/rrhh/dietas/config", {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({tipo:tipo, subtipo:subtipo, importe:importe, fecha_vigencia_desde:desde})
  }).then(function(){_rrhhCargarDietas();});
}

function _rrhhBorrarDieta(id) {
  if (!confirm("Eliminar tarifa?")) return;
  fetch("/api/rrhh/dietas/config/"+id, {method:"DELETE"}).then(function(){_rrhhCargarDietas();});
}

// ═══ Adelantos ═══════════════════════════════════════════════════════════

function _rrhhCargarAdelantos() {
  var empId = document.getElementById("rrhh-adel-empleado").value;
  var estado = document.getElementById("rrhh-adel-estado").value;
  var params = [];
  if (empId) params.push("empleado_id="+empId);
  if (estado) params.push("estado="+estado);
  var url = "/api/rrhh/adelantos" + (params.length ? "?" + params.join("&") : "");

  fetch(url)
    .then(function(r){return r.json();})
    .then(function(d){
      var k = d.kpis || {};
      var kpis = document.getElementById("rrhh-adel-kpis");
      kpis.innerHTML =
        '<div class="tes-card"><span class="tes-label">Pendientes</span><span class="tes-valor" style="font-size:1rem;">' + (k.pendientes||0) + '</span></div>' +
        '<div class="tes-card tes-card-blue"><span class="tes-label">Importe pendiente</span><span class="tes-valor" style="font-size:0.9rem;">' + _rrhhFmtEur(k.importe_pendiente) + '</span></div>';

      var tbody = document.getElementById("rrhh-adel-tbody");
      var items = d.adelantos || [];
      if (!items.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Sin adelantos</td></tr>'; return; }
      var html = "";
      items.forEach(function(a){
        var nombre = (a.nombre||'') + ' ' + (a.apellidos||'');
        var estadoHtml = a.estado === 'pendiente' ? '<span style="color:#f59e0b;">Pendiente</span>' : '<span style="color:#22c55e;">Descontado</span>';
        html += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
          '<td style="padding:6px 8px;">' + (a.fecha||'') + '</td>' +
          '<td style="padding:6px 6px;font-weight:500;">' + nombre.trim() + '</td>' +
          '<td style="padding:6px 6px;text-align:right;">' + _rrhhFmtEur(a.importe) + '</td>' +
          '<td style="padding:6px 6px;">' + (a.concepto||'-') + '</td>' +
          '<td style="padding:6px 6px;">' + estadoHtml + '</td>' +
          '<td style="padding:6px 6px;text-align:center;"><button onclick="_rrhhBorrarAdelanto('+a.id+')" class="btn-small danger" style="font-size:0.75rem;padding:2px 8px;">X</button></td></tr>';
      });
      tbody.innerHTML = html;

      // Populate employee dropdown if not done
      var sel = document.getElementById("rrhh-adel-empleado");
      if (sel.options.length <= 1) {
        fetch("/api/rrhh/empleados?estado=todos").then(function(r){return r.json();}).then(function(ed){
          (ed.empleados||[]).forEach(function(e){
            sel.innerHTML += '<option value="'+e.id+'">'+(e.nombre||'')+' '+(e.apellidos||'')+'</option>';
          });
        });
      }
    });
}

function _rrhhNuevoAdelanto() {
  var empId = prompt("ID empleado:");
  if (!empId) return;
  var fecha = prompt("Fecha (YYYY-MM-DD):", new Date().toISOString().slice(0,10));
  var importe = parseFloat(prompt("Importe EUR:", "200"));
  if (isNaN(importe)) return;
  var concepto = prompt("Concepto:", "Adelanto n\u00f3mina");
  fetch("/api/rrhh/adelantos", {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({empleado_id:parseInt(empId), fecha:fecha, importe:importe, concepto:concepto})
  }).then(function(){_rrhhCargarAdelantos();});
}

function _rrhhBorrarAdelanto(id) {
  if (!confirm("Eliminar adelanto?")) return;
  fetch("/api/rrhh/adelantos/"+id, {method:"DELETE"}).then(function(){_rrhhCargarAdelantos();});
}

// ═══ Importar (init OCR/Excel handlers) ═════════════════════════════════

var _rrhhImportInit = false;

function _rrhhInitImportar() {
  if (_rrhhImportInit) return;
  _rrhhImportInit = true;

  // Excel handler
  document.getElementById("rrhh-import-file").addEventListener("change", function () {
    if (!this.files.length) return;
    var fd = new FormData();
    fd.append("archivo", this.files[0]);
    fetch("/api/rrhh/importar-nominas", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { alert("Error: " + d.error); return; }
        alert("Importaci\u00f3n: " + d.empleados_creados + " creados, " + d.empleados_actualizados + " actualizados, " + d.nominas_importadas + " n\u00f3minas, " + d.finiquitos_importados + " finiquitos");
      })
      .catch(function (err) { alert("Error: " + err.message); });
    this.value = "";
  });

  // PDF OCR handler
  document.getElementById("rrhh-import-pdf").addEventListener("change", function () {
    if (!this.files.length) return;
    var fd = new FormData();
    for (var i = 0; i < this.files.length; i++) fd.append("archivos", this.files[i]);
    var progress = document.getElementById("rrhh-ocr-progress");
    var preview = document.getElementById("rrhh-ocr-preview");
    preview.style.display = "block";
    progress.style.display = "block";
    progress.textContent = "Procesando " + this.files.length + " archivo(s) con OCR...";
    document.getElementById("rrhh-ocr-tbody").innerHTML = "";
    document.getElementById("rrhh-ocr-confirmar").disabled = true;

    fetch("/api/rrhh/procesar-nominas-pdf", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        progress.style.display = "none";
        if (d.error) { progress.style.display = "block"; progress.textContent = "Error: " + d.error; return; }
        _rrhhOCRData = d.nominas || [];
        _rrhhRenderOCRPreview(_rrhhOCRData);
        if (_rrhhOCRData.length) document.getElementById("rrhh-ocr-confirmar").disabled = false;
      })
      .catch(function (err) { progress.textContent = "Error: " + err.message; progress.style.background = "#FEE2E2"; });
    this.value = "";
  });
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
window._rrhhConfirmarOCR = _rrhhConfirmarOCR;
window._rrhhCerrarOCR = _rrhhCerrarOCR;
window._rrhhCargarVerificador = _rrhhCargarVerificador;
window._rrhhGenerarRemesa = _rrhhGenerarRemesa;
window._rrhhCargarSS = _rrhhCargarSS;
window._rrhhCargarIRPF = _rrhhCargarIRPF;
window._rrhhCargarCosteProyecto = _rrhhCargarCosteProyecto;
window._rrhhCargarDietas = _rrhhCargarDietas;
window._rrhhNuevaDieta = _rrhhNuevaDieta;
window._rrhhBorrarDieta = _rrhhBorrarDieta;
window._rrhhCargarAdelantos = _rrhhCargarAdelantos;
window._rrhhNuevoAdelanto = _rrhhNuevoAdelanto;
window._rrhhBorrarAdelanto = _rrhhBorrarAdelanto;
window._rrhhInitImportar = _rrhhInitImportar;
