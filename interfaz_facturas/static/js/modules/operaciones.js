// ═══ OPERACIONES — Planificador de recursos ═════════════════════════════════

var _operInit = false;
var _operAnio, _operMes;
var _operData = null; // {dias, empleados, maquinas, proyectos, asignaciones}
var _operFiltro = "todos";
var _operFiltroProyecto = "";
var _operGruposColapsados = {};

var GRUPO_ESTILOS = {
  maquinas:   { border: '#3B82F6', bg: '#EFF6FF' },
  hincadores: { border: '#16A34A', bg: '#F0FDF4' },
  ayudantes:  { border: '#D97706', bg: '#FFFBEB' },
  vehiculos:  { border: '#7C3AED', bg: '#F5F3FF' },
  otros:      { border: '#6B7280', bg: '#F9FAFB' },
};

var FESTIVOS = [
  // 2025
  '2025-01-01','2025-01-06','2025-04-17','2025-04-18',
  '2025-05-01','2025-08-15','2025-10-12','2025-11-01',
  '2025-12-06','2025-12-08','2025-12-25',
  // 2026
  '2026-01-01','2026-01-06','2026-04-02','2026-04-03',
  '2026-05-01','2026-08-15','2026-10-12','2026-11-02',
  '2026-12-07','2026-12-08','2026-12-25',
  // 2027
  '2027-01-01','2027-01-06','2027-03-25','2027-03-26',
  '2027-05-01','2027-08-15','2027-10-12','2027-11-01',
  '2027-12-06','2027-12-08','2027-12-25',
];
function _esFestivo(fecha) { return FESTIVOS.indexOf(fecha) >= 0; }

var COLORES_PROYECTO = [
  {bg:'#DBEAFE',text:'#1E40AF',border:'#93C5FD'},
  {bg:'#DCFCE7',text:'#166534',border:'#86EFAC'},
  {bg:'#FEF3C7',text:'#92400E',border:'#FCD34D'},
  {bg:'#EDE9FE',text:'#5B21B6',border:'#C4B5FD'},
  {bg:'#FCE7F3',text:'#9D174D',border:'#F9A8D4'},
  {bg:'#FFEDD5',text:'#9A3412',border:'#FDBA74'},
  {bg:'#CCFBF1',text:'#115E59',border:'#5EEAD4'},
  {bg:'#FEE2E2',text:'#991B1B',border:'#FCA5A5'},
  {bg:'#F0F9FF',text:'#0C4A6E',border:'#7DD3FC'},
  {bg:'#ECFDF5',text:'#064E3B',border:'#6EE7B7'},
];

var MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Drag state ──────────────────────────────────────────────────────────────
var _dragStart = null; // {tipo, id, col}
var _dragEnd = null;
var _dragging = false;

function cargarOperaciones() {
  _initOperaciones();
  _fetchCuadrante();
}

function _initOperaciones() {
  if (_operInit) return;
  _operInit = true;

  var hoy = new Date();
  _operAnio = hoy.getFullYear();
  _operMes = hoy.getMonth() + 1;

  document.getElementById("oper-mes-prev").addEventListener("click", function () {
    _operMes--;
    if (_operMes < 1) { _operMes = 12; _operAnio--; }
    _fetchCuadrante();
  });
  document.getElementById("oper-mes-next").addEventListener("click", function () {
    _operMes++;
    if (_operMes > 12) { _operMes = 1; _operAnio++; }
    _fetchCuadrante();
  });

  // Pills filter
  document.getElementById("oper-filtros").addEventListener("click", function (e) {
    var pill = e.target.closest(".oper-filtro-pill");
    if (!pill) return;
    document.querySelectorAll(".oper-filtro-pill").forEach(function (p) { p.classList.remove("active"); });
    pill.classList.add("active");
    _operFiltro = pill.dataset.filtro;
    _aplicarFiltro();
  });

  // Project filter
  document.getElementById("oper-filtro-proyecto").addEventListener("change", function () {
    _operFiltroProyecto = this.value;
    _aplicarFiltro();
    _aplicarResaltadoProyecto();
  });

  // Mass assign modal
  document.getElementById("oper-btn-masivo").addEventListener("click", _abrirModalMasivo);
  document.getElementById("oper-masivo-cerrar").addEventListener("click", function () {
    document.getElementById("modal-oper-masivo-overlay").classList.remove("visible");
  });
  document.getElementById("oper-masivo-confirmar").addEventListener("click", _ejecutarAsignacionMasiva);

  // Delegate clicks on cuadrante
  document.getElementById("oper-cuadrante").addEventListener("click", function (e) {
    var celda = e.target.closest("[data-oper-celda]");
    if (celda) _clickCelda(celda);
  });

  // Drag selection
  var cuad = document.getElementById("oper-cuadrante");
  cuad.addEventListener("mousedown", function (e) {
    var celda = e.target.closest("[data-oper-celda]");
    if (!celda) return;
    // No iniciar drag en celdas con avería
    if (celda.querySelector("[data-celda-averia]")) return;
    e.preventDefault();
    _dragStart = { tipo: celda.dataset.tipo, id: celda.dataset.rid, col: parseInt(celda.dataset.col) };
    _dragEnd = _dragStart;
    _dragging = true;
    _highlightDrag();
  });
  cuad.addEventListener("mousemove", function (e) {
    if (!_dragging) return;
    var celda = e.target.closest("[data-oper-celda]");
    if (!celda || celda.dataset.tipo !== _dragStart.tipo || celda.dataset.rid !== _dragStart.id) return;
    _dragEnd = { tipo: celda.dataset.tipo, id: celda.dataset.rid, col: parseInt(celda.dataset.col) };
    _highlightDrag();
  });
  document.addEventListener("mouseup", function () {
    if (!_dragging) return;
    _dragging = false;
    _clearDragHighlight();
    if (_dragStart && _dragEnd && _dragStart.col !== _dragEnd.col) {
      _mostrarPopupRango();
    }
    // If same cell, handled by click
  });
}

function _mesStr() {
  return _operAnio + "-" + String(_operMes).padStart(2, "0");
}

function _fetchCuadrante() {
  document.getElementById("oper-mes-titulo").textContent = MESES_ES[_operMes - 1] + " " + _operAnio;
  fetch("/api/operaciones/cuadrante?mes=" + _mesStr())
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      // Mark festivos as non-laborable
      data.dias.forEach(function (d) {
        if (_esFestivo(d.fecha)) { d.laborable = false; d.festivo = true; }
      });
      _operData = data;
      _renderCuadrante();
      _renderLeyenda();
    })
    .catch(function (err) {
      console.error("Operaciones cuadrante error:", err);
      document.getElementById("oper-cuadrante").innerHTML = '<p style="padding:20px;color:var(--color-text-secondary);">Error al cargar el cuadrante. Verifica que el servidor est&aacute; activo.</p>';
    });
  fetch("/api/operaciones/resumen?mes=" + _mesStr())
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      document.getElementById("oper-kpi-emp").textContent = d.emp_hoy + " / " + d.emp_total;
      document.getElementById("oper-kpi-maq").textContent = d.maq_hoy + " / " + d.maq_total;
      var kpiAveria = document.getElementById("oper-kpi-maq-averia");
      if (kpiAveria) kpiAveria.textContent = (d.maq_averia || 0) + " / " + d.maq_total;
      document.getElementById("oper-kpi-proy").textContent = d.proy_activos;
      var ocEl = document.getElementById("oper-kpi-ocup");
      ocEl.textContent = d.ocupacion + "%";
      var od = d.ocupacion_detalle || {};
      if (od.dias_asignados != null) {
        ocEl.title = od.dias_asignados + " asignadas / " + od.dias_disponibles + " efectivas (" + od.dias_averia + " avería)";
        var sub = ocEl.parentNode.querySelector(".tes-sub");
        if (!sub) { sub = document.createElement("span"); sub.className = "tes-sub"; sub.style.cssText = "display:block;font-size:10px;color:#888;margin-top:2px;"; ocEl.parentNode.appendChild(sub); }
        sub.textContent = od.dias_asignados + " / " + od.dias_disponibles + " m\u00b7d\u00eda";
      }
    })
    .catch(function (err) { console.error("Operaciones resumen error:", err); });
}

// ── Cargo → grupo mapping ────────────────────────────────────────────────────

function _grupoEmpleado(puesto) {
  var p = (puesto || "").toLowerCase();
  if (p.indexOf("hincador") >= 0 || p.indexOf("perforador") >= 0 || p.indexOf("operador") >= 0 || p.indexOf("maquinista") >= 0) return "hincadores";
  if (p.indexOf("ayudante") >= 0 || p.indexOf("peon") >= 0 || p.indexOf("peón") >= 0 || p.indexOf("auxiliar") >= 0) return "ayudantes";
  return "otros";
}

// ── Render cuadrante ────────────────────────────────────────────────────────

function _renderCuadrante() {
  var d = _operData;
  if (!d) return;
  var dias = d.dias;
  var proyMap = {};
  d.proyectos.forEach(function (p) { proyMap[p.id] = p; });
  var colSpan = dias.length + 1;

  // Classify empleados into groups
  var hincadores = [], ayudantes = [], otros = [];
  d.empleados.forEach(function (emp) {
    var g = _grupoEmpleado(emp.puesto);
    if (g === "hincadores") hincadores.push(emp);
    else if (g === "ayudantes") ayudantes.push(emp);
    else otros.push(emp);
  });

  var html = '<table class="oper-tabla" style="border-collapse:collapse;min-width:100%;user-select:none;">';

  // Header
  html += '<thead><tr>';
  html += '<th style="position:sticky;left:0;z-index:2;background:var(--color-bg-page,#fff);min-width:180px;text-align:left;padding:8px 10px;font-size:13px;font-weight:600;border-bottom:2px solid var(--color-border);">Recurso</th>';
  dias.forEach(function (dia) {
    var esHoy = dia.es_hoy;
    var noLab = !dia.laborable;
    var bg = esHoy ? '#EFF6FF' : (noLab ? '#D1D5DB' : '');
    var borderBot = esHoy ? '2px solid #3B82F6' : '1px solid var(--color-border)';
    var col = noLab ? '#6B7280' : (esHoy ? '#2563EB' : 'inherit');
    var numLabel = dia.num + (dia.festivo ? '\u2605' : '');
    html += '<th style="min-width:36px;max-width:36px;text-align:center;font-size:10px;padding:4px 2px;font-weight:' + (esHoy ? '700' : '400') + ';border-bottom:' + borderBot + ';background:' + bg + ';color:' + col + ';">' + dia.dia_semana + '<br>' + numLabel + '</th>';
  });
  html += '</tr></thead><tbody>';

  // 1. Máquinas
  html += _renderGrupoHeader("maquinas", "M\u00e1quinas", d.maquinas.length, colSpan);
  d.maquinas.forEach(function (maq) {
    html += _renderFila("maquina", maq.id, maq.nombre, maq.modelo || "", dias, d.asignaciones, proyMap, "maquinas");
  });

  // 2. Hincadores
  html += _renderGrupoHeader("hincadores", "Hincadores / Perforadores", hincadores.length, colSpan);
  hincadores.forEach(function (emp) {
    html += _renderFila("empleado", emp.id, emp.nombre + (emp.apellidos ? " " + emp.apellidos.split(" ")[0] : ""), emp.puesto || "", dias, d.asignaciones, proyMap, "hincadores");
  });

  // 3. Ayudantes
  html += _renderGrupoHeader("ayudantes", "Ayudantes", ayudantes.length, colSpan);
  ayudantes.forEach(function (emp) {
    html += _renderFila("empleado", emp.id, emp.nombre + (emp.apellidos ? " " + emp.apellidos.split(" ")[0] : ""), emp.puesto || "", dias, d.asignaciones, proyMap, "ayudantes");
  });

  // 4. Vehículos (empty placeholder)
  html += _renderGrupoHeader("vehiculos", "Veh\u00edculos", 0, colSpan);

  // 5. Otros (if any)
  if (otros.length) {
    html += _renderGrupoHeader("otros", "Otros", otros.length, colSpan);
    otros.forEach(function (emp) {
      html += _renderFila("empleado", emp.id, emp.nombre + (emp.apellidos ? " " + emp.apellidos.split(" ")[0] : ""), emp.puesto || "", dias, d.asignaciones, proyMap, "otros");
    });
  }

  html += '</tbody></table>';
  document.getElementById("oper-cuadrante").innerHTML = html;

  // Populate project select (preserve current selection)
  var sel = document.getElementById("oper-filtro-proyecto");
  var prev = _operFiltroProyecto;
  sel.innerHTML = '<option value="">Todos los proyectos</option>';
  d.proyectos.forEach(function (p) {
    var c = COLORES_PROYECTO[p.color_idx] || COLORES_PROYECTO[0];
    sel.innerHTML += '<option value="' + p.id + '">' + p.abreviatura + ' — ' + p.nombre + '</option>';
  });
  sel.value = prev;
  _operFiltroProyecto = sel.value;

  _aplicarFiltro();
  _aplicarResaltadoProyecto();
}

function _renderGrupoHeader(grupo, label, count, colSpan) {
  var collapsed = _operGruposColapsados[grupo];
  var chevron = collapsed ? '\u25B6' : '\u25BC';
  var est = GRUPO_ESTILOS[grupo] || GRUPO_ESTILOS.otros;
  return '<tr class="oper-grupo-header" data-grupo="' + grupo + '" style="cursor:pointer;" onclick="window._toggleGrupoOper(\'' + grupo + '\')">' +
    '<td colspan="' + colSpan + '" style="font-size:13px;font-weight:500;padding:8px 10px 8px 12px;border-left:4px solid ' + est.border + ';background:' + est.bg + ';border-bottom:1px solid var(--color-border);user-select:none;">' +
    '<span id="chevron-' + grupo + '" style="display:inline-block;width:14px;font-size:10px;">' + chevron + '</span> ' +
    label + ' (' + count + ')' +
    '</td></tr>';
}

function _renderFila(tipo, id, nombre, subtitulo, dias, asignaciones, proyMap, grupo) {
  var key = tipo + "_" + id;
  var asig = asignaciones[key] || {};
  var collapsed = _operGruposColapsados[grupo];
  var est = GRUPO_ESTILOS[grupo] || GRUPO_ESTILOS.otros;
  var html = '<tr class="oper-fila-' + grupo + '" data-grupo-fila="' + grupo + '" data-recurso-key="' + key + '"' + (collapsed ? ' style="display:none;"' : '') + '>';
  html += '<td style="position:sticky;left:0;z-index:1;border-left:4px solid ' + est.border + ';background:' + est.bg + ';padding:6px 8px 6px 12px;font-size:13px;border-bottom:1px solid var(--color-border);white-space:nowrap;">';
  var _empEstado = "";
  if (tipo === "empleado" && _operData && _operData.empleados) {
    for (var _ei = 0; _ei < _operData.empleados.length; _ei++) {
      if (_operData.empleados[_ei].id === id) { _empEstado = _operData.empleados[_ei].estado || ""; break; }
    }
  }
  var _estadoPill = "";
  if (_empEstado === "baja") _estadoPill = ' <span style="padding:1px 5px;border-radius:9999px;font-size:9px;font-weight:600;background:#FCEBEB;color:#A32D2D;">Baja</span>';
  else if (_empEstado === "vacaciones") _estadoPill = ' <span style="padding:1px 5px;border-radius:9999px;font-size:9px;font-weight:600;background:#E6F1FB;color:#1E40AF;">Vac.</span>';
  var _nameStyle = _empEstado === "baja" ? "color:#999;" : "";
  html += '<div style="font-weight:500;line-height:1.3;' + _nameStyle + '">' + nombre + _estadoPill + '</div>';
  if (subtitulo) html += '<div style="font-size:10px;color:var(--color-text-secondary);line-height:1.2;">' + subtitulo + '</div>';
  html += '</td>';

  var vacSet = (_operData && _operData.vacaciones) || [];
  // Check if employee is on baja
  var bajaInicio = null, bajaFin = null;
  if (tipo === "empleado" && _operData && _operData.empleados) {
    for (var _bi = 0; _bi < _operData.empleados.length; _bi++) {
      if (_operData.empleados[_bi].id === id) {
        bajaInicio = _operData.empleados[_bi].fecha_baja_inicio || null;
        bajaFin = _operData.empleados[_bi].fecha_baja_fin || null;
        break;
      }
    }
  }
  dias.forEach(function (dia, colIdx) {
    var a = asig[dia.fecha];
    var noLab = !dia.laborable;
    var esHoy = dia.es_hoy;
    var esVac = (tipo === "empleado" && vacSet.indexOf(id + "_" + dia.fecha) >= 0);
    var esBaja = (bajaInicio && dia.fecha >= bajaInicio && (!bajaFin || dia.fecha <= bajaFin));
    var bgCol = noLab ? '#E5E7EB' : (esBaja ? '' : (esVac && !a ? '#FEF3C7' : (esHoy ? '#F0F7FF' : '')));
    var bgPattern = esBaja ? 'background:repeating-linear-gradient(45deg,#FCEBEB,#FCEBEB 4px,#fff 4px,#fff 8px);' : '';
    var cursor = 'pointer';

    var cellTitle = esBaja ? 'title="Baja laboral' + (bajaInicio ? ': ' + bajaInicio + (bajaFin ? ' a ' + bajaFin : '') : '') + '"' : '';
    html += '<td data-oper-celda data-tipo="' + tipo + '" data-rid="' + id + '" data-fecha="' + dia.fecha + '" data-col="' + colIdx + '" data-lab="' + (dia.laborable ? 1 : 0) + '" ' + cellTitle + ' style="padding:1px;border-bottom:1px solid var(--color-border);' + (bgPattern || 'background:' + bgCol + ';') + 'cursor:' + cursor + ';">';

    if (a && a.estado === "averia") {
      var tooltipAvr = 'Avería' + (a.notas ? ': ' + a.notas.replace(/"/g, '&quot;') : '');
      html += '<div data-celda-averia="1" style="position:relative;background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;border-radius:4px;height:26px;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;min-width:32px;" title="' + tooltipAvr + '">\ud83d\udd27</div>';
    } else if (a && proyMap[a.proyecto_id]) {
      var p = proyMap[a.proyecto_id];
      var c = COLORES_PROYECTO[p.color_idx] || COLORES_PROYECTO[0];
      var indicador = a.estado === "confirmado" ? '<span style="position:absolute;top:1px;right:2px;font-size:7px;">&#10003;</span>' : (a.estado === "incidencia" ? '<span style="position:absolute;top:1px;right:2px;font-size:7px;">&#9888;</span>' : '');
      var vacWarn = esVac ? '<span style="position:absolute;bottom:0;left:1px;font-size:7px;" title="Tiene vacaciones">\u26a0</span>' : '';
      var vacBorder = esVac ? 'border:2px solid #F59E0B;' : 'border:1px solid ' + c.border + ';';
      html += '<div data-celda-proy="' + p.id + '" style="position:relative;background:' + c.bg + ';color:' + c.text + ';' + vacBorder + 'border-radius:4px;height:26px;font-size:9px;font-weight:600;display:flex;align-items:center;justify-content:center;min-width:32px;" title="' + (p.nombre || '') + (esVac ? ' \u26a0 VACACIONES' : '') + '">' + p.abreviatura + indicador + vacWarn + '</div>';
    } else if (esVac) {
      html += '<div style="height:26px;border:1px dashed #F59E0B;border-radius:4px;background:#FEF3C7;display:flex;align-items:center;justify-content:center;font-size:9px;color:#92400E;font-weight:600;" title="Vacaciones">\ud83c\udfd6</div>';
    } else {
      html += '<div style="height:26px;border:1px dashed transparent;border-radius:4px;" onmouseenter="this.style.borderColor=\'#CBD5E1\'" onmouseleave="this.style.borderColor=\'transparent\'"></div>';
    }

    html += '</td>';
  });
  html += '</tr>';
  return html;
}

// ── Leyenda ─────────────────────────────────────────────────────────────────

function _renderLeyenda() {
  var el = document.getElementById("oper-leyenda");
  if (!_operData || !_operData.proyectos.length) { el.innerHTML = ''; return; }
  var html = '';
  _operData.proyectos.forEach(function (p) {
    var c = COLORES_PROYECTO[p.color_idx] || COLORES_PROYECTO[0];
    html += '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;background:' + c.bg + ';color:' + c.text + ';border:1px solid ' + c.border + ';font-weight:500;">' + p.abreviatura + ' ' + p.nombre + '</span>';
  });
  html += '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;font-weight:500;">\ud83d\udd27 Aver\u00eda</span>';
  el.innerHTML = html;
}

// ── Toggle grupo colapsable ─────────────────────────────────────────────────

window._toggleGrupoOper = function (grupo) {
  var collapsed = !_operGruposColapsados[grupo];
  _operGruposColapsados[grupo] = collapsed;
  var filas = document.querySelectorAll(".oper-fila-" + grupo);
  filas.forEach(function (f) { f.style.display = collapsed ? "none" : ""; });
  var chevron = document.getElementById("chevron-" + grupo);
  if (chevron) chevron.textContent = collapsed ? "\u25B6" : "\u25BC";
};

// ── Filtro pills ────────────────────────────────────────────────────────────

function _aplicarFiltro() {
  // Build set of resource keys that have at least one assignment to the selected project
  var recursosFiltrados = null; // null = show all
  if (_operFiltroProyecto && _operData) {
    recursosFiltrados = {};
    var pid = parseInt(_operFiltroProyecto);
    var asig = _operData.asignaciones;
    Object.keys(asig).forEach(function (key) {
      var dias = asig[key];
      Object.keys(dias).forEach(function (fecha) {
        if (dias[fecha].proyecto_id === pid) recursosFiltrados[key] = true;
      });
    });
  }

  var grupos = ["maquinas", "hincadores", "ayudantes", "vehiculos", "otros"];
  grupos.forEach(function (g) {
    var grupoActivo = (_operFiltro === "todos" || _operFiltro === g);
    var filas = document.querySelectorAll(".oper-fila-" + g);
    var visiblesEnGrupo = 0;
    var totalEnGrupo = filas.length;

    filas.forEach(function (f) {
      if (!grupoActivo) {
        f.style.display = "none";
        return;
      }
      // Check project filter
      var recursoKey = f.dataset.recursoKey;
      var pasaProyecto = !recursosFiltrados || recursosFiltrados[recursoKey];
      if (!pasaProyecto) {
        f.style.display = "none";
      } else {
        f.style.display = _operGruposColapsados[g] ? "none" : "";
        visiblesEnGrupo++;
      }
    });

    // Update group header visibility + counter
    var headers = document.querySelectorAll('.oper-grupo-header[data-grupo="' + g + '"]');
    headers.forEach(function (h) {
      if (!grupoActivo) {
        h.style.display = "none";
      } else if (recursosFiltrados && visiblesEnGrupo === 0) {
        h.style.display = "none";
      } else {
        h.style.display = "";
        // Update count text
        var td = h.querySelector("td");
        if (td && recursosFiltrados) {
          var txt = td.textContent;
          var match = txt.match(/^(.+?)\(\d+.*?\)$/);
          if (match) td.innerHTML = td.innerHTML.replace(/\(\d+.*?\)/, "(" + visiblesEnGrupo + " de " + totalEnGrupo + ")");
        }
      }
    });
  });
}

function _aplicarResaltadoProyecto() {
  var celdas = document.querySelectorAll("[data-celda-proy]");
  if (!_operFiltroProyecto) {
    // No project filter — reset all
    celdas.forEach(function (c) {
      c.style.opacity = "";
      c.style.borderWidth = "";
    });
    return;
  }
  var pid = _operFiltroProyecto;
  celdas.forEach(function (c) {
    if (c.dataset.celdaProy === pid) {
      c.style.opacity = "1";
      c.style.borderWidth = "2px";
    } else {
      c.style.opacity = "0.35";
      c.style.borderWidth = "";
    }
  });
}

// ── Click celda — popup ─────────────────────────────────────────────────────

function _clickCelda(td) {
  // All days are assignable (weekends/holidays too)
  // Remove existing popup
  _cerrarPopup();

  var tipo = td.dataset.tipo;
  var rid = td.dataset.rid;
  var fecha = td.dataset.fecha;
  var key = tipo + "_" + rid;
  var asig = _operData.asignaciones[key] && _operData.asignaciones[key][fecha];

  var popup = document.createElement("div");
  popup.id = "oper-popup";
  popup.style.cssText = "position:fixed;z-index:1000;background:#fff;border:1px solid var(--color-border);border-radius:8px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:200px;max-width:280px;font-size:13px;";

  if (asig && asig.estado === "averia") {
    // Celda con avería
    var nombreRec = _getNombreRecurso(tipo, rid);
    var notaHtml = asig.notas ? '<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:10px;"><b>Nota:</b> ' + (asig.notas || '').replace(/</g, '&lt;') + '</div>' : '';
    popup.innerHTML = '<div style="font-weight:600;margin-bottom:4px;">\ud83d\udd27 ' + nombreRec + ' &mdash; Aver\u00eda</div>' +
      '<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:8px;">' + fecha + '</div>' +
      notaHtml +
      '<div id="oper-averia-edit" style="display:none;margin-bottom:8px;"><textarea id="oper-averia-nota-input" style="width:100%;height:50px;font-size:12px;border:1px solid var(--color-border);border-radius:4px;padding:4px;resize:vertical;">' + (asig.notas || '').replace(/</g, '&lt;') + '</textarea><button type="button" class="btn-small" id="oper-averia-guardar-nota" style="margin-top:4px;">Guardar nota</button></div>' +
      '<div style="display:flex;gap:6px;">' +
      '<button type="button" class="btn-small" id="oper-popup-editar-nota">\u270f\ufe0f Editar nota</button>' +
      '<button type="button" class="btn-small" id="oper-popup-resolver" style="background:#DCFCE7;color:#166534;border:1px solid #86EFAC;">\u2705 Resolver</button>' +
      '<button type="button" class="btn-small secondary" id="oper-popup-cerrar">\u274c Cerrar</button>' +
      '</div>';

    document.body.appendChild(popup);
    _posicionarPopup(popup, td);

    document.getElementById("oper-popup-cerrar").addEventListener("click", _cerrarPopup);
    document.getElementById("oper-popup-resolver").addEventListener("click", function () {
      _desasignar(tipo, rid, fecha);
    });
    document.getElementById("oper-popup-editar-nota").addEventListener("click", function () {
      document.getElementById("oper-averia-edit").style.display = "block";
    });
    document.getElementById("oper-averia-guardar-nota").addEventListener("click", function () {
      var nuevaNota = document.getElementById("oper-averia-nota-input").value;
      _cerrarPopup();
      fetch("/api/operaciones/averia-nota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recurso_tipo: tipo, recurso_id: parseInt(rid), fecha: fecha, notas: nuevaNota }),
      })
      .then(function (r) { return r.json(); })
      .then(function () { _fetchCuadrante(); })
      .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error al guardar nota", "error"); });
    });
  } else if (asig) {
    // Cell has assignment (proyecto)
    var p = null;
    _operData.proyectos.forEach(function (pr) { if (pr.id === asig.proyecto_id) p = pr; });
    var nombreRec = _getNombreRecurso(tipo, rid);
    popup.innerHTML = '<div style="font-weight:600;margin-bottom:8px;">' + nombreRec + ' &rarr; ' + (p ? p.nombre : '?') + '</div>' +
      '<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:10px;">' + fecha + '</div>' +
      '<div style="display:flex;gap:6px;">' +
      '<button type="button" class="btn-small" id="oper-popup-cambiar">Cambiar</button>' +
      '<button type="button" class="btn-small danger" id="oper-popup-desasignar">Desasignar</button>' +
      '<button type="button" class="btn-small secondary" id="oper-popup-cerrar">Cerrar</button>' +
      '</div>' +
      '<div id="oper-popup-proyectos" style="display:none;margin-top:8px;"></div>';

    document.body.appendChild(popup);
    _posicionarPopup(popup, td);

    document.getElementById("oper-popup-cerrar").addEventListener("click", _cerrarPopup);
    document.getElementById("oper-popup-desasignar").addEventListener("click", function () {
      _desasignar(tipo, rid, fecha);
    });
    document.getElementById("oper-popup-cambiar").addEventListener("click", function () {
      var div = document.getElementById("oper-popup-proyectos");
      div.style.display = "block";
      div.innerHTML = _htmlProyectosBotones(tipo, rid, fecha);
    });
  } else {
    // Empty cell — show project picker + botón avería solo para máquinas
    var botonAveria = '';
    if (tipo === 'maquina') {
      botonAveria = '<div style="border-top:1px solid var(--color-border-tertiary,#E5E7EB);margin-top:6px;padding-top:6px;">' +
        '<button type="button" id="oper-btn-averia" style="width:100%;padding:6px;font-size:12px;background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;border-radius:6px;cursor:pointer;">\ud83d\udd27 Aver\u00eda / Taller</button>' +
        '</div>';
    }
    popup.innerHTML = '<div style="font-weight:600;margin-bottom:8px;">Asignar ' + _getNombreRecurso(tipo, rid) + '</div>' +
      '<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:8px;">' + fecha + '</div>' +
      _htmlProyectosBotones(tipo, rid, fecha) +
      botonAveria +
      '<button type="button" class="btn-small secondary" id="oper-popup-cerrar" style="margin-top:8px;width:100%;">Cerrar</button>';
    document.body.appendChild(popup);
    _posicionarPopup(popup, td);
    document.getElementById("oper-popup-cerrar").addEventListener("click", _cerrarPopup);

    // Botón avería → mini-modal para nota
    var btnAveria = document.getElementById("oper-btn-averia");
    if (btnAveria) {
      btnAveria.addEventListener("click", function () {
        _mostrarModalAveria(tipo, rid, fecha);
      });
    }
  }
}

function _htmlProyectosBotones(tipo, rid, fecha) {
  var html = '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
  _operData.proyectos.forEach(function (p) {
    var c = COLORES_PROYECTO[p.color_idx] || COLORES_PROYECTO[0];
    html += '<button type="button" onclick="_asignarDesdePopup(\'' + tipo + '\',' + rid + ',' + p.id + ',\'' + fecha + '\')" style="padding:4px 8px;border-radius:4px;border:1px solid ' + c.border + ';background:' + c.bg + ';color:' + c.text + ';font-size:11px;font-weight:600;cursor:pointer;">' + p.abreviatura + '</button>';
  });
  html += '</div>';
  return html;
}

function _posicionarPopup(popup, td) {
  var rect = td.getBoundingClientRect();
  var top = rect.bottom + 4;
  var left = rect.left;
  if (left + 280 > window.innerWidth) left = window.innerWidth - 290;
  if (top + 200 > window.innerHeight) top = rect.top - popup.offsetHeight - 4;
  if (left < 10) left = 10;
  popup.style.top = top + "px";
  popup.style.left = left + "px";
}

function _cerrarPopup() {
  var p = document.getElementById("oper-popup");
  if (p) p.remove();
}

function _getNombreRecurso(tipo, rid) {
  if (!_operData) return "?";
  var lista = tipo === "empleado" ? _operData.empleados : _operData.maquinas;
  var rec = null;
  lista.forEach(function (r) { if (r.id === parseInt(rid)) rec = r; });
  if (!rec) return "?";
  if (tipo === "empleado") return rec.nombre + (rec.apellidos ? " " + rec.apellidos.split(" ")[0] : "");
  return rec.nombre;
}

// ── Asignar / Desasignar ────────────────────────────────────────────────────

window._asignarDesdePopup = function (tipo, rid, proyId, fecha) {
  // Check vacation conflict
  var vacSet = (_operData && _operData.vacaciones) || [];
  if (tipo === "empleado" && vacSet.indexOf(rid + "_" + fecha) >= 0) {
    var empNombre = _getNombreRecurso(tipo, rid);
    if (!confirm("\u26a0\ufe0f " + empNombre + " tiene vacaciones aprobadas para el " + fecha + ".\n\u00bfAsignar igualmente?")) return;
  }
  _cerrarPopup();
  fetch("/api/operaciones/asignar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recurso_tipo: tipo, recurso_id: rid, proyecto_id: proyId, fecha: fecha }),
  })
  .then(function (r) { return r.json(); })
  .then(function () { _fetchCuadrante(); })
  .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error al asignar", "error"); });
};

function _desasignar(tipo, rid, fecha) {
  _cerrarPopup();
  fetch("/api/operaciones/desasignar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recurso_tipo: tipo, recurso_id: parseInt(rid), fecha: fecha }),
  })
  .then(function (r) { return r.json(); })
  .then(function () { _fetchCuadrante(); })
  .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error al desasignar", "error"); });
}

// ── Drag range ──────────────────────────────────────────────────────────────

function _highlightDrag() {
  _clearDragHighlight();
  if (!_dragStart || !_dragEnd) return;
  var minCol = Math.min(_dragStart.col, _dragEnd.col);
  var maxCol = Math.max(_dragStart.col, _dragEnd.col);
  var celdas = document.querySelectorAll("[data-oper-celda][data-tipo='" + _dragStart.tipo + "'][data-rid='" + _dragStart.id + "']");
  celdas.forEach(function (c) {
    var col = parseInt(c.dataset.col);
    if (col >= minCol && col <= maxCol && c.dataset.lab === "1") {
      c.style.outline = "2px solid #3B82F6";
      c.style.outlineOffset = "-1px";
      c.classList.add("oper-drag-sel");
    }
  });
}

function _clearDragHighlight() {
  document.querySelectorAll(".oper-drag-sel").forEach(function (c) {
    c.style.outline = "";
    c.style.outlineOffset = "";
    c.classList.remove("oper-drag-sel");
  });
}

function _mostrarPopupRango() {
  if (!_dragStart || !_dragEnd || !_operData) return;
  _cerrarPopup();

  var minCol = Math.min(_dragStart.col, _dragEnd.col);
  var maxCol = Math.max(_dragStart.col, _dragEnd.col);
  var fechaDesde = _operData.dias[minCol].fecha;
  var fechaHasta = _operData.dias[maxCol].fecha;
  var tipo = _dragStart.tipo;
  var rid = _dragStart.id;
  var nombre = _getNombreRecurso(tipo, rid);

  var popup = document.createElement("div");
  popup.id = "oper-popup";
  popup.style.cssText = "position:fixed;z-index:1000;background:#fff;border:1px solid var(--color-border);border-radius:8px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:220px;max-width:300px;font-size:13px;top:50%;left:50%;transform:translate(-50%,-50%);";

  var html = '<div style="font-weight:600;margin-bottom:4px;">Asignar ' + nombre + '</div>';
  html += '<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:10px;">Del ' + fechaDesde + ' al ' + fechaHasta + '</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
  _operData.proyectos.forEach(function (p) {
    var c = COLORES_PROYECTO[p.color_idx] || COLORES_PROYECTO[0];
    html += '<button type="button" onclick="_asignarRango(\'' + tipo + '\',' + rid + ',' + p.id + ',\'' + fechaDesde + '\',\'' + fechaHasta + '\')" style="padding:5px 10px;border-radius:4px;border:1px solid ' + c.border + ';background:' + c.bg + ';color:' + c.text + ';font-size:12px;font-weight:600;cursor:pointer;">' + p.abreviatura + ' ' + p.nombre + '</button>';
  });
  html += '</div>';
  html += '<button type="button" class="btn-small secondary" id="oper-popup-cerrar" style="margin-top:10px;width:100%;">Cancelar</button>';
  popup.innerHTML = html;
  document.body.appendChild(popup);
  document.getElementById("oper-popup-cerrar").addEventListener("click", _cerrarPopup);
}

window._asignarRango = function (tipo, rid, proyId, desde, hasta) {
  _cerrarPopup();
  fetch("/api/operaciones/asignar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recurso_tipo: tipo, recurso_id: rid, proyecto_id: proyId, fecha_desde: desde, fecha_hasta: hasta }),
  })
  .then(function (r) { return r.json(); })
  .then(function () { _fetchCuadrante(); })
  .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error al asignar rango", "error"); });
};

// ── Modal masivo ────────────────────────────────────────────────────────────

function _abrirModalMasivo() {
  if (!_operData) return;
  var overlay = document.getElementById("modal-oper-masivo-overlay");

  // Populate proyectos
  var sel = document.getElementById("oper-masivo-proyecto");
  sel.innerHTML = '<option value="">Seleccionar proyecto...</option>';
  _operData.proyectos.forEach(function (p) {
    sel.innerHTML += '<option value="' + p.id + '">' + p.nombre + '</option>';
  });

  // Default dates: this month range
  var hoy = new Date();
  document.getElementById("oper-masivo-desde").value = hoy.toISOString().slice(0, 10);
  var finMes = new Date(_operAnio, _operMes, 0);
  document.getElementById("oper-masivo-hasta").value = finMes.toISOString().slice(0, 10);

  // Checkboxes empleados
  var empDiv = document.getElementById("oper-masivo-empleados");
  empDiv.innerHTML = "";
  _operData.empleados.forEach(function (e) {
    empDiv.innerHTML += '<label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;"><input type="checkbox" value="' + e.id + '"> ' + e.nombre + '</label>';
  });

  // Checkboxes maquinas
  var maqDiv = document.getElementById("oper-masivo-maquinas");
  maqDiv.innerHTML = "";
  _operData.maquinas.forEach(function (m) {
    maqDiv.innerHTML += '<label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;"><input type="checkbox" value="' + m.id + '"> ' + m.nombre + '</label>';
  });

  overlay.classList.add("visible");
}

function _ejecutarAsignacionMasiva() {
  var proyId = document.getElementById("oper-masivo-proyecto").value;
  if (!proyId) { alert("Selecciona un proyecto"); return; }

  var desde = document.getElementById("oper-masivo-desde").value;
  var hasta = document.getElementById("oper-masivo-hasta").value;
  if (!desde || !hasta) { alert("Selecciona fechas"); return; }

  var recursos = [];
  document.querySelectorAll("#oper-masivo-empleados input:checked").forEach(function (cb) {
    recursos.push({ tipo: "empleado", id: parseInt(cb.value) });
  });
  document.querySelectorAll("#oper-masivo-maquinas input:checked").forEach(function (cb) {
    recursos.push({ tipo: "maquina", id: parseInt(cb.value) });
  });
  if (!recursos.length) { alert("Selecciona al menos un recurso"); return; }

  fetch("/api/operaciones/asignar-masivo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proyecto_id: parseInt(proyId), recursos: recursos, fecha_desde: desde, fecha_hasta: hasta }),
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    document.getElementById("modal-oper-masivo-overlay").classList.remove("visible");
    if (typeof mostrarToast === "function") mostrarToast(d.insertadas + " asignaciones creadas", "success");
    _fetchCuadrante();
  })
  .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error en asignación masiva", "error"); });
}

// ── Modal avería ───────────────────────────────────────────────────────────

function _mostrarModalAveria(tipo, rid, fecha) {
  _cerrarPopup();
  var nombreRec = _getNombreRecurso(tipo, rid);
  var fechaLabel = fecha.split("-").reverse().join("/");

  var overlay = document.createElement("div");
  overlay.id = "oper-averia-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;";

  var modal = document.createElement("div");
  modal.style.cssText = "background:#fff;border-radius:10px;padding:20px;width:340px;max-width:90vw;box-shadow:0 8px 24px rgba(0,0,0,.2);font-size:13px;";
  modal.innerHTML =
    '<div style="font-weight:600;font-size:14px;margin-bottom:4px;">\ud83d\udd27 Registrar aver\u00eda</div>' +
    '<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:12px;">' + nombreRec + ' — ' + fechaLabel + '</div>' +
    '<label style="font-size:12px;font-weight:500;">Descripci\u00f3n:</label>' +
    '<textarea id="oper-averia-desc" style="width:100%;height:60px;margin-top:4px;font-size:12px;border:1px solid var(--color-border);border-radius:6px;padding:6px;resize:vertical;" placeholder="Ej: Llevada al taller por fallo hidr\u00e1ulico"></textarea>' +
    '<div style="display:flex;gap:8px;margin-top:12px;">' +
    '<button type="button" class="btn-small" id="oper-averia-guardar" style="flex:1;background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;">Guardar</button>' +
    '<button type="button" class="btn-small secondary" id="oper-averia-cancelar" style="flex:1;">Cancelar</button>' +
    '</div>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.getElementById("oper-averia-desc").focus();

  document.getElementById("oper-averia-cancelar").addEventListener("click", function () {
    overlay.remove();
  });
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });

  document.getElementById("oper-averia-guardar").addEventListener("click", function () {
    var notas = document.getElementById("oper-averia-desc").value;
    overlay.remove();
    fetch("/api/operaciones/asignar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurso_tipo: tipo, recurso_id: parseInt(rid), fecha: fecha, estado: "averia", notas: notas }),
    })
    .then(function (r) { return r.json(); })
    .then(function () {
      if (typeof mostrarToast === "function") mostrarToast("Aver\u00eda registrada", "success");
      _fetchCuadrante();
    })
    .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error al registrar aver\u00eda", "error"); });
  });
}

// Close popup on outside click
document.addEventListener("click", function (e) {
  var popup = document.getElementById("oper-popup");
  if (popup && !popup.contains(e.target) && !e.target.closest("[data-oper-celda]")) {
    _cerrarPopup();
  }
});
