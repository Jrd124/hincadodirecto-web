// ═══════════════════════════════════════════════════════════════════════════
// ██  RRHH – Equipo (gestión de empleados / trabajadores)               ██
// ═══════════════════════════════════════════════════════════════════════════

var _rrhhEmpleadosCache = [];

function _rrhhOnPanelShow(panel) {
  if (panel === "equipo") _rrhhCargarEmpleados();
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

// ── Expose globally ─────────────────────────────────────────────────────
window._rrhhOnPanelShow = _rrhhOnPanelShow;
window._rrhhCargarEmpleados = _rrhhCargarEmpleados;
window._rrhhAbrirModalEmpleado = _rrhhAbrirModalEmpleado;
window._rrhhCerrarModalEmpleado = _rrhhCerrarModalEmpleado;
window._rrhhGuardarEmpleado = _rrhhGuardarEmpleado;
window._rrhhEditarEmpleado = _rrhhEditarEmpleado;
window._rrhhEliminarEmpleado = _rrhhEliminarEmpleado;
window._rrhhToggleInactivos = _rrhhToggleInactivos;
