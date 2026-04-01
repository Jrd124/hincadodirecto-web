// ═══ APP.JS — Orquestador principal ═══
// Módulos cargados desde /static/js/modules/*.js (helpers, finanzas, proyectos, etc.)
// Este archivo solo contiene: configuración MODULOS, navegación, sidebar, dashboard inicio.

// Menú principal: alternar módulos
// Variables globales defensivas para evitar ReferenceError si alguna parte del código
// hace referencia a ellas antes de que se ejecute el bloque de Bancos.
var btnAbrirModalTarjeta;
var btnCerrarModalTarjeta;
const MODULOS = {
  inicio: {
    linkId: "nav-inicio-modulo",
    submenuId: "submenu-inicio",
    paneles: { inicio: "seccion-inicio" },
    subNavLinks: {},
    defecto: "inicio",
  },
  finanzas: {
    linkId: "nav-finanzas-modulo",
    submenuId: "submenu-finanzas",
    paneles: { inicio: "panel-finanzas-inicio", bancos: "panel-bancos-inicio", control_calidad: "panel-control-calidad-inicio", tesoreria: "panel-tesoreria-inicio" },
    subNavLinks: { proveedores: "nav-finanzas-proveedores", clientes: "nav-finanzas-clientes", control_calidad: "nav-finanzas-control-calidad", bancos: "nav-finanzas-bancos", tesoreria: "nav-finanzas-tesoreria" },
    defecto: "inicio",
  },
  proveedores: {
    linkId: null,
    submenuId: "submenu-proveedores",
    paneles: { facturas: "panel-facturas", proveedores: "panel-proveedores", cecos: "panel-cecos" },
    subNavLinks: { facturas: "nav-facturas", proveedores: "nav-proveedores", cecos: "nav-cecos" },
    defecto: "facturas",
  },
  clientes: {
    linkId: null,
    submenuId: "submenu-clientes",
    paneles: { clientes_facturas: "panel-clientes-facturas", clientes_listado: "panel-clientes-listado" },
    subNavLinks: { clientes_facturas: "nav-clientes-facturas", clientes_listado: "nav-clientes-listado" },
    defecto: "clientes_facturas",
  },
  proyectos: {
    linkId: "nav-proyectos-modulo",
    submenuId: "submenu-proyectos",
    paneles: { inicio: "panel-proyectos-inicio", cotizados: "panel-proyectos-cotizados", vivos: "panel-proyectos-vivos", terminados: "panel-proyectos-terminados", dashboard: "panel-proyecto-dashboard", transporte: "panel-proyectos-transporte", onboarding: "panel-onboarding-inicio" },
    subNavLinks: { cotizados: "nav-proyectos-cotizados", vivos: "nav-proyectos-vivos", terminados: "nav-proyectos-terminados", transporte: "nav-proyectos-transporte", onboarding: "nav-proyectos-onboarding" },
    defecto: "inicio",
  },
  bancos: {
    linkId: null,
    submenuId: "submenu-bancos",
    paneles: { inicio: "panel-bancos-inicio" },
    subNavLinks: {},
    defecto: "inicio",
  },
  rrhh: {
    linkId: "nav-rrhh-modulo",
    submenuId: "submenu-rrhh",
    paneles: { inicio: "panel-rrhh-inicio", equipo: "panel-rrhh-equipo", reserva: "panel-rrhh-reserva", alumni: "panel-rrhh-alumni", nominas: "panel-rrhh-nominas", adelantos: "panel-rrhh-adelantos" },
    subNavLinks: { equipo: "nav-rrhh-equipo", reserva: "nav-rrhh-reserva", alumni: "nav-rrhh-alumni", nominas: "nav-rrhh-nominas", adelantos: "nav-rrhh-adelantos" },
    defecto: "inicio",
  },
  onboarding: {
    linkId: "nav-onboarding-modulo",
    submenuId: "submenu-onboarding",
    paneles: { inicio: "panel-onboarding-inicio" },
    subNavLinks: {},
    defecto: "inicio",
  },
  control_calidad: {
    linkId: null,
    submenuId: "submenu-control-calidad",
    paneles: { inicio: "panel-control-calidad-inicio" },
    subNavLinks: {},
    defecto: "inicio",
  },
  crm: {
    linkId: "nav-crm-modulo",
    submenuId: "submenu-crm",
    paneles: { inicio: "panel-crm-inicio", empresas: "panel-crm-empresas", contactos: "panel-crm-contactos", oportunidades: "panel-crm-oportunidades", interacciones: "panel-crm-interacciones" },
    subNavLinks: { inicio: "nav-crm-inicio", empresas: "nav-crm-empresas", contactos: "nav-crm-contactos", oportunidades: "nav-crm-oportunidades", interacciones: "nav-crm-interacciones" },
    defecto: "inicio",
  },
  impuestos: {
    linkId: "nav-impuestos-modulo",
    paneles: { inicio: "panel-impuestos-inicio" },
    subNavLinks: {},
    defecto: "inicio",
  },
  presupuestos: {
    linkId: "nav-presupuestos-modulo",
    submenuId: "submenu-presupuestos",
    paneles: { todos: "panel-presupuestos-todos", nuevo: "panel-presupuestos-nuevo", catalogo: "panel-presupuestos-catalogo", plantillas: "panel-presupuestos-plantillas" },
    subNavLinks: { todos: "nav-presupuestos-todos", nuevo: "nav-presupuestos-nuevo", catalogo: "nav-presupuestos-catalogo", plantillas: "nav-presupuestos-plantillas" },
    defecto: "todos",
  },
  usuarios: {
    linkId: "nav-usuarios-modulo",
    paneles: { listado: "panel-usuarios" },
    subNavLinks: {},
    defecto: "listado",
  },
  maquinaria: {
    linkId: "nav-maquinaria-modulo",
    paneles: { listado: "panel-maquinaria", detalle: "panel-maquinaria-detalle" },
    subNavLinks: { listado: "nav-maquinaria-listado", mantenimiento: "nav-maquinaria-mantenimiento" },
    defecto: "listado",
  },
  cae: {
    linkId: "nav-cae-modulo",
    submenuId: "sidebar-children-cae",
    paneles: {
      inicio: "panel-cae-inicio",
      documentos: "panel-cae-documentos",
      expedientes: "panel-cae-expedientes",
      expediente_detalle: "panel-cae-expediente-detalle",
      plantillas: "panel-cae-plantillas",
      tareas: "panel-cae-tareas",
      config: "panel-cae-config",
    },
    subNavLinks: {
      inicio: "nav-cae-inicio",
      documentos: "nav-cae-documentos",
      expedientes: "nav-cae-expedientes",
      plantillas: "nav-cae-plantillas",
      tareas: "nav-cae-tareas",
      config: "nav-cae-config",
    },
    defecto: "inicio",
  },
};

let moduloActivo = "inicio";
let finanzasChild = "proveedores";
let proveedoresSubpanel = "facturas";
let clientesSubpanel = "clientes_facturas";
let proyectosSubpanel = "cotizados";
let rrhhSubpanel = "equipo";
let crmSubpanel = "inicio";
let presupuestosSubpanel = "todos";
let caeSubpanel = "inicio";

var _hashUpdateInProgress = false;
function actualizarHash() {
  if (_hashUpdateInProgress) return;
  var partes = [moduloActivo];
  if (moduloActivo === "finanzas" && finanzasChild !== "inicio") {
    partes.push(finanzasChild);
    if (finanzasChild === "proveedores") partes.push(proveedoresSubpanel);
    else if (finanzasChild === "clientes") partes.push(clientesSubpanel);
  } else if (moduloActivo === "proyectos" && proyectosSubpanel !== "inicio") {
    partes.push(proyectosSubpanel);
  } else if (moduloActivo === "rrhh" && rrhhSubpanel !== "inicio") {
    partes.push(rrhhSubpanel);
  } else if (moduloActivo === "crm") {
    partes.push(crmSubpanel);
  }
  var h = partes.join("/");
  if (location.hash.slice(1) !== h) {
    _hashUpdateInProgress = true;
    location.hash = h;
    setTimeout(function () { _hashUpdateInProgress = false; }, 0);
  }
}

// ═══ DASHBOARD INICIO ═══════════════════════════════════════════════════════

function cargarDashboardDirector() {
  var elFecha = document.getElementById("dashboard-fecha");
  if (elFecha) {
    var hoy = new Date();
    var opciones = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    var fechaStr = hoy.toLocaleDateString("es-ES", opciones);
    elFecha.textContent = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);
  }

  fetch("/api/dashboard/director?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      // — Saludo —
      var hora = new Date().getHours();
      var saludo = hora < 14 ? "Buenos días" : hora < 20 ? "Buenas tardes" : "Buenas noches";
      if (data.usuario) {
        var nombre = data.usuario.charAt(0).toUpperCase() + data.usuario.slice(1);
        saludo += ", " + nombre;
      }
      var elSaludo = document.getElementById("dashboard-saludo");
      if (elSaludo) elSaludo.textContent = saludo;

      var p = data.proyectos || {};
      var f = data.finanzas || {};
      var m = data.maquinaria || {};

      // — KPIs —
      _setDir("dir-proyectos-vivos", p.vivos);
      _setDir("dir-proyectos-cotizados", p.cotizados + " cotizados en pipeline");
      _setDir("dir-hincas-hoy", p.hincas_hoy);
      _setDir("dir-hincas-semana", p.hincas_semana + " esta semana");
      _setDir("dir-facturado-mes", _fmtEur(f.facturado_mes));
      _setDir("dir-facturado-anio", _fmtEur(f["facturado_año"]) + " en el año");
      _setDir("dir-pendiente-cobro", _fmtEur(f.pendiente_cobro));
      _setDir("dir-pendiente-cobro-n", f.pendiente_cobro_count + " facturas");
      _setDir("dir-pendiente-pago", _fmtEur(f.pendiente_pago));
      _setDir("dir-pendiente-pago-n", f.pendiente_pago_count + " facturas");
      _setDir("dir-maquinas", m.asignadas + " / " + m.total + " asignadas");
      _setDir("dir-maquinas-rev", m.revisiones_pendientes + " revisiones pendientes");

      // — Obras activas —
      var tbody = document.getElementById("dir-tbody-obras");
      if (tbody) {
        tbody.innerHTML = "";
        var lista = p.lista_vivos || [];
        if (lista.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="sin-datos">Sin obras activas</td></tr>';
        } else {
          lista.forEach(function (ob) {
            var pct = ob.hincas_estimadas > 0 ? Math.round((ob.hincas_acumuladas / ob.hincas_estimadas) * 100) : 0;
            var tr = document.createElement("tr");
            tr.style.cursor = "pointer";
            tr.onclick = function () { location.hash = "proyectos/dashboard/" + ob.id; };
            tr.innerHTML =
              '<td><strong>' + _esc(ob.codigo || ob.nombre) + '</strong><br><span class="dir-obra-sub">' + _esc(ob.provincia) + '</span></td>' +
              '<td>' + _esc(ob.cliente) + '</td>' +
              '<td><div class="dir-progress-wrap">' +
                '<div class="dir-progress-bar"><div class="dir-progress-fill" style="width:' + pct + '%"></div></div>' +
                '<span class="dir-progress-text">' + ob.hincas_acumuladas + ' / ' + (ob.hincas_estimadas || "—") + ' (' + pct + '%)</span>' +
              '</div></td>' +
              '<td class="numero">' + (ob.hincas_hoy || 0) + '</td>';
            tbody.appendChild(tr);
          });
        }
      }

      // — Alertas —
      var alertasList = document.getElementById("dir-alertas-list");
      if (alertasList) {
        alertasList.innerHTML = "";
        var alertas = data.alertas || [];
        if (alertas.length === 0) {
          alertasList.innerHTML = '<p class="sin-datos" style="padding:16px;text-align:center;">Sin alertas</p>';
        } else {
          alertas.forEach(function (a) {
            var iconMap = { alta: "\uD83D\uDD34", media: "\uD83D\uDFE1", info: "\uD83D\uDD35" };
            var div = document.createElement("div");
            div.className = "dir-alerta dir-alerta--" + a.severidad;
            if (a.link) {
              div.style.cursor = "pointer";
              div.onclick = function () { location.hash = a.link.replace(/^#/, ""); };
            }
            div.innerHTML = '<span class="dir-alerta__icon">' + (iconMap[a.severidad] || "") + '</span><span class="dir-alerta__msg">' + _esc(a.mensaje) + '</span>';
            alertasList.appendChild(div);
          });
        }
        var btnAll = document.getElementById("dir-alertas-ver-todas");
        if (btnAll) {
          btnAll.style.display = (data.alertas_total || 0) > 10 ? "" : "none";
        }
      }

      // — Actividad reciente —
      var timeline = document.getElementById("dir-timeline");
      if (timeline) {
        timeline.innerHTML = "";
        var acts = data.actividad_reciente || [];
        if (acts.length === 0) {
          timeline.innerHTML = '<p class="sin-datos" style="padding:16px;text-align:center;">Sin actividad reciente</p>';
        } else {
          acts.forEach(function (a) {
            var iconMap = { parte: "\uD83D\uDCCB", factura: "\uD83D\uDCE4", factura_prov: "\uD83D\uDCE5", certificacion: "\uD83D\uDCC4", proyecto: "\uD83D\uDCC1", crm: "\uD83E\uDD1D", maquinaria_check: "\uD83D\uDD27" };
            var div = document.createElement("div");
            div.className = "dir-timeline-item";
            div.dataset.categoria = a.categoria || "";
            div.innerHTML =
              '<span class="dir-timeline-icon">' + (iconMap[a.tipo] || "\u2022") + '</span>' +
              '<div class="dir-timeline-body">' +
                '<span class="dir-timeline-texto">' + _esc(a.texto) + '</span>' +
                '<span class="dir-timeline-fecha">' + _fmtRelativa(a.fecha) + '</span>' +
              '</div>';
            timeline.appendChild(div);
          });
        }
      }
    })
    .catch(function (err) { console.error("Error cargando dashboard director:", err); });
}

// Helpers del dashboard director
function _setDir(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val != null ? val : "—";
}
function _fmtEur(v) {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " \u20AC";
}
function _esc(s) {
  if (!s) return "";
  var d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
function _fmtRelativa(fecha) {
  if (!fecha) return "";
  try {
    var d = new Date(fecha.replace(" ", "T"));
    var ahora = new Date();
    var diff = Math.floor((ahora - d) / 1000);
    if (diff < 60) return "hace unos segundos";
    if (diff < 3600) return "hace " + Math.floor(diff / 60) + " min";
    if (diff < 86400) return "hace " + Math.floor(diff / 3600) + " h";
    var dias = Math.floor(diff / 86400);
    if (dias === 1) return "ayer";
    if (dias < 7) return "hace " + dias + " días";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  } catch (e) {
    return fecha;
  }
}

// Filtro de actividad reciente por categoría
window.filtrarActividad = function(filtro) {
  document.querySelectorAll(".dir-filtro-pill").forEach(function (p) { p.classList.remove("active"); });
  var sel = document.querySelector('.dir-filtro-pill[data-filtro="' + filtro + '"]');
  if (sel) sel.classList.add("active");
  document.querySelectorAll(".dir-timeline-item").forEach(function (item) {
    item.style.display = (filtro === "todos" || item.dataset.categoria === filtro) ? "" : "none";
  });
};

// ═══ NAVEGACIÓN Y HASH ══════════════════════════════════════════════════════

var _restaurandoHash = false;
function restaurarDesdeHash() {
  if (_restaurandoHash) return;
  _restaurandoHash = true;
  try {
  var h = (location.hash || "").replace(/^#/, "").trim();
  if (!h) return;
  var partes = h.split("/").filter(Boolean);
  if (partes.length === 0) return;
  var mod = partes[0];
  if (mod === "finanzas") {
    if (partes.length >= 2) {
      var child = partes[1];
      if (child === "bancos" || child === "control_calidad" || child === "proveedores" || child === "clientes" || child === "tesoreria") {
        finanzasChild = child;
        activarModulo("finanzas");
        activarFinanzasChild(child);
        if (child === "proveedores" && partes.length >= 3) {
          var sp = partes[2];
          if (sp === "facturas" || sp === "proveedores" || sp === "cecos") activarSubpanel("proveedores", sp);
          if (sp === "proveedores" && typeof window._comprobarBannerDuplicados === "function") window._comprobarBannerDuplicados("proveedor");
        } else if (child === "clientes" && partes.length >= 3) {
          var sp = partes[2];
          if (sp === "clientes_facturas" || sp === "clientes_listado") activarSubpanel("clientes", sp);
          if (sp === "clientes_listado" && typeof window._comprobarBannerDuplicados === "function") window._comprobarBannerDuplicados("cliente");
        }
      } else {
        finanzasChild = "inicio";
        activarModulo("finanzas");
      }
    } else {
      finanzasChild = "inicio";
      activarModulo("finanzas");
    }
  } else if (mod === "proyectos") {
    if (partes.length >= 2) {
      var sp = partes[1];
      if (["cotizados", "vivos", "terminados", "transporte", "onboarding"].indexOf(sp) >= 0) {
        proyectosSubpanel = sp;
        activarModulo("proyectos");
        activarSubpanel("proyectos", sp);
      } else {
        proyectosSubpanel = "inicio";
        activarModulo("proyectos");
      }
    } else {
      proyectosSubpanel = "inicio";
      activarModulo("proyectos");
    }
  } else if (mod === "rrhh") {
    if (partes.length >= 2) {
      var sp = partes[1];
      if (["equipo", "reserva", "alumni", "nominas", "adelantos"].indexOf(sp) >= 0) {
        rrhhSubpanel = sp;
        activarModulo("rrhh");
        activarSubpanel("rrhh", sp);
        if (typeof window._rrhhOnPanelShow === "function") window._rrhhOnPanelShow(sp);
      } else {
        rrhhSubpanel = "inicio";
        activarModulo("rrhh");
      }
    } else {
      rrhhSubpanel = "inicio";
      activarModulo("rrhh");
    }
  } else if (mod === "inicio") {
    activarModulo("inicio");
  } else if (mod === "onboarding") {
    activarModulo("onboarding");
  } else if (mod === "crm") {
    activarModulo("crm");
    if (partes.length >= 2) {
      var sp = partes[1];
      if (["inicio", "empresas", "contactos", "oportunidades", "interacciones"].indexOf(sp) >= 0) {
        activarSubpanel("crm", sp);
        if (sp === "inicio" && typeof _crmCargarStats === "function") _crmCargarStats();
        if (sp === "empresas" && typeof _crmCargarEmpresas === "function") _crmCargarEmpresas();
      }
    }
  }
  actualizarHash();
  } finally { _restaurandoHash = false; }
}

function _ocultarPanelesModulo(nombreModulo) {
  var m = MODULOS[nombreModulo];
  if (!m) return;
  Object.values(m.paneles).forEach(function (pid) {
    var p = document.getElementById(pid);
    if (p) p.classList.remove("visible");
  });
}

function activarModulo(nombre) {
  moduloActivo = nombre;
  // Hide ALL panels of ALL modules (including the target module)
  Object.keys(MODULOS).forEach((k) => {
    const m = MODULOS[k];
    const activo = k === nombre;
    if (m.linkId) {
      const el = document.getElementById(m.linkId);
      if (el) el.classList.toggle("activo", activo);
    }
    if (m.submenuId) {
      const sub = document.getElementById(m.submenuId);
      if (sub) sub.classList.toggle("visible", activo);
    }
    Object.values(m.paneles).forEach((pid) => {
      const p = document.getElementById(pid);
      if (p) p.classList.remove("visible");
    });
  });
  const mod = MODULOS[nombre];
  if (mod.defecto && mod.paneles[mod.defecto]) {
    document.getElementById(mod.paneles[mod.defecto]).classList.add("visible");
    Object.keys(mod.subNavLinks).forEach((k) => {
      const lid = mod.subNavLinks[k];
      if (lid) {
        const el = document.getElementById(lid);
        if (el) el.classList.toggle("activo", k === mod.defecto);
      }
    });
  }
  if (nombre === "finanzas") {
    document.getElementById("submenu-finanzas").classList.add("visible");
    // Don't auto-navigate to child — show finanzas dashboard
    // activarFinanzasChild is called separately when clicking a child item
  } else {
    document.getElementById("submenu-proveedores").classList.remove("visible");
    document.getElementById("submenu-clientes").classList.remove("visible");
  }
  if (nombre !== "finanzas") {
    document.getElementById("submenu-finanzas").classList.remove("visible");
  }
  // Toggle body.cae-active — CSS handles sidebar visual collapse
  document.body.classList.toggle("cae-active", nombre === "cae");
  // Update --sidebar-width so container margin follows (same mechanism as Maquinaria)
  if (nombre === "cae") {
    document.documentElement.style.setProperty("--sidebar-width", "64px");
  } else {
    var _sb = document.getElementById("sidebar");
    var _isCol = _sb && _sb.classList.contains("collapsed");
    document.documentElement.style.setProperty("--sidebar-width", _isCol ? "64px" : "240px");
  }

  if (nombre === "inicio") {
    cargarDashboardDirector();
  } else if (nombre === "finanzas") {
    cargarFinanzasInicio();
  } else if (nombre === "usuarios") {
    cargarUsuarios();
  } else if (nombre === "maquinaria") {
    cargarMaquinaria();
  }
  actualizarHash();
}

function activarFinanzasChild(child) {
  finanzasChild = child;
  // Ensure finanzas module is active (hides other modules' panels)
  if (moduloActivo !== "finanzas") {
    activarModulo("finanzas");
  }
  // Hide ALL finanzas-related panels
  _ocultarPanelesModulo("finanzas");
  _ocultarPanelesModulo("proveedores");
  _ocultarPanelesModulo("clientes");
  // Submenus
  var prov = document.getElementById("submenu-proveedores");
  var cli = document.getElementById("submenu-clientes");
  if (prov) prov.classList.toggle("visible", child === "proveedores");
  if (cli) cli.classList.toggle("visible", child === "clientes");
  // Sidebar highlight
  document.querySelectorAll("#submenu-finanzas a").forEach(function (a) { a.classList.remove("activo"); });
  var finanzasLink = document.getElementById("nav-finanzas-" + child.replace("_", "-"));
  if (finanzasLink) finanzasLink.classList.add("activo");
  // Show the requested child panel
  if (child === "proveedores") {
    proveedoresSubpanel = "facturas";
    document.getElementById("panel-facturas").classList.add("visible");
    document.getElementById("nav-facturas").classList.add("activo");
  } else if (child === "clientes") {
    clientesSubpanel = "clientes_facturas";
    document.getElementById("panel-clientes-facturas").classList.add("visible");
    document.getElementById("nav-clientes-facturas").classList.add("activo");
  } else if (child === "control_calidad") {
    document.getElementById("panel-control-calidad-inicio").classList.add("visible");
  } else if (child === "bancos") {
    document.getElementById("panel-bancos-inicio").classList.add("visible");
  } else if (child === "tesoreria") {
    document.getElementById("panel-tesoreria-inicio").classList.add("visible");
  }
  actualizarHash();
}

function activarSubpanel(modulo, subpanel) {
  const mod = MODULOS[modulo];
  if (modulo === "proveedores") proveedoresSubpanel = subpanel;
  else if (modulo === "clientes") clientesSubpanel = subpanel;
  else if (modulo === "proyectos") proyectosSubpanel = subpanel;
  else if (modulo === "rrhh") rrhhSubpanel = subpanel;
  else if (modulo === "crm") crmSubpanel = subpanel;
  else if (modulo === "presupuestos") presupuestosSubpanel = subpanel;
  else if (modulo === "cae") caeSubpanel = subpanel;
  Object.keys(mod.paneles).forEach((k) => {
    document.getElementById(mod.paneles[k]).classList.toggle("visible", k === subpanel);
    if (mod.subNavLinks[k]) {
      document.getElementById(mod.subNavLinks[k]).classList.toggle("activo", k === subpanel);
    }
  });
  actualizarHash();
}

// ═══ EVENT LISTENERS — Navegación sidebar ═══════════════════════════════════

document.getElementById("nav-inicio-modulo").addEventListener("click", (e) => {
  e.preventDefault();
  activarModulo("inicio");
});
document.getElementById("nav-finanzas-modulo").addEventListener("click", (e) => {
  e.preventDefault();
  finanzasChild = "inicio";
  activarModulo("finanzas");
});
document.getElementById("nav-proyectos-modulo").addEventListener("click", (e) => {
  e.preventDefault();
  proyectosSubpanel = "inicio";
  activarModulo("proyectos");
});
document.getElementById("nav-rrhh-modulo").addEventListener("click", (e) => {
  e.preventDefault();
  rrhhSubpanel = "inicio";
  activarModulo("rrhh");
});
if (document.getElementById("nav-onboarding-modulo")) {
  document.getElementById("nav-onboarding-modulo").addEventListener("click", (e) => {
    e.preventDefault();
    activarModulo("onboarding");
  });
}
document.getElementById("nav-finanzas-proveedores").addEventListener("click", (e) => {
  e.preventDefault();
  activarFinanzasChild("proveedores");
});
document.getElementById("nav-finanzas-clientes").addEventListener("click", (e) => {
  e.preventDefault();
  activarFinanzasChild("clientes");
});
document.getElementById("nav-finanzas-control-calidad").addEventListener("click", (e) => {
  e.preventDefault();
  activarFinanzasChild("control_calidad");
});
document.getElementById("nav-finanzas-bancos").addEventListener("click", (e) => {
  e.preventDefault();
  activarFinanzasChild("bancos");
});
document.getElementById("nav-finanzas-tesoreria").addEventListener("click", (e) => {
  e.preventDefault();
  activarFinanzasChild("tesoreria");
  if (window._tesCargarTodo) _tesCargarTodo();
});

// Apply container margin-left EARLY — before any navigation that might loop
(function earlyContainerMargin() {
  var sb = document.querySelector(".sidebar");
  if (!sb) return;
  var collapsed = false;
  try { collapsed = localStorage.getItem("sidebar-collapsed") === "1"; } catch (e) {}
  if (collapsed) sb.classList.add("collapsed");
  // Layout driven purely by CSS variable --sidebar-width
  var sw = collapsed ? "64px" : (window.innerWidth > 1024 ? "240px" : "0px");
  document.documentElement.style.setProperty("--sidebar-width", sw);
})();

(function setEstadoInicialFinanzas() {
  if (location.hash && location.hash.length > 1) {
    restaurarDesdeHash();
  } else {
    activarModulo("inicio");
  }
  window.addEventListener("hashchange", function () {
    if (_hashUpdateInProgress) return;
    if (location.hash && location.hash.length > 1) restaurarDesdeHash();
  });
})();

document.getElementById("nav-facturas").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  activarSubpanel("proveedores", "facturas");
});
document.getElementById("nav-proveedores").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  activarSubpanel("proveedores", "proveedores");
  if (typeof window._comprobarBannerDuplicados === "function") window._comprobarBannerDuplicados("proveedor");
});
document.getElementById("nav-cecos").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  activarSubpanel("proveedores", "cecos");
});
document.getElementById("nav-clientes-facturas").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  activarSubpanel("clientes", "clientes_facturas");
});
document.getElementById("nav-clientes-listado").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  activarSubpanel("clientes", "clientes_listado");
  if (typeof window._comprobarBannerDuplicados === "function") window._comprobarBannerDuplicados("cliente");
});
document.getElementById("nav-proyectos-cotizados").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("proyectos", "cotizados");
});
document.getElementById("nav-proyectos-vivos").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("proyectos", "vivos");
});
document.getElementById("nav-proyectos-terminados").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("proyectos", "terminados");
});
document.getElementById("nav-proyectos-transporte").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("proyectos", "transporte");
});
document.getElementById("nav-proyectos-onboarding").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("proyectos", "onboarding");
});

document.getElementById("nav-rrhh-equipo").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("rrhh", "equipo");
  if (typeof window._rrhhOnPanelShow === "function") window._rrhhOnPanelShow("equipo");
});
document.getElementById("nav-rrhh-reserva").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("rrhh", "reserva");
});
document.getElementById("nav-rrhh-alumni").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("rrhh", "alumni");
});
document.getElementById("nav-rrhh-nominas").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("rrhh", "nominas");
});
document.getElementById("nav-rrhh-adelantos").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("rrhh", "adelantos");
});

// CRM nav handlers
// ── Presupuestos nav ──
document.getElementById("nav-presupuestos-modulo").addEventListener("click", (e) => {
  e.preventDefault();
  activarModulo("presupuestos");
  presupCargarLista();
});
["todos", "nuevo", "catalogo", "plantillas"].forEach((sp) => {
  var el = document.getElementById("nav-presupuestos-" + sp);
  if (el) el.addEventListener("click", (e) => {
    e.preventDefault();
    activarSubpanel("presupuestos", sp);
    if (sp === "todos") presupCargarLista();
    if (sp === "nuevo") presupNuevo();
    if (sp === "catalogo") presupCargarCatalogo();
    if (sp === "plantillas") presupCargarPlantillas();
  });
});

document.getElementById("nav-crm-modulo").addEventListener("click", (e) => {
  e.preventDefault();
  activarModulo("crm");
});
["inicio", "empresas", "contactos", "oportunidades", "interacciones"].forEach((sp) => {
  var el = document.getElementById("nav-crm-" + sp);
  if (el) el.addEventListener("click", (e) => {
    e.preventDefault();
    activarSubpanel("crm", sp);
    if (sp === "inicio") _crmCargarStats();
    if (sp === "empresas") _crmCargarEmpresas();
    if (sp === "contactos" && window._crmCargarContactos) _crmCargarContactos();
    if (sp === "interacciones" && window._crmCargarInteracciones) _crmCargarInteracciones();
    if (sp === "oportunidades" && window._crmCargarOportunidades) _crmCargarOportunidades();
  });
});


var navUsuarios = document.getElementById("nav-usuarios-modulo");
if (navUsuarios) navUsuarios.addEventListener("click", function (e) {
  e.preventDefault();
  activarModulo("usuarios");
});

var navImpuestos = document.getElementById("nav-impuestos-modulo");
if (navImpuestos) navImpuestos.addEventListener("click", function (e) {
  e.preventDefault();
  activarModulo("impuestos");
  if (typeof cargarImpuestos === "function") cargarImpuestos();
});

var navMaquinaria = document.getElementById("nav-maquinaria-modulo");
if (navMaquinaria) navMaquinaria.addEventListener("click", function (e) {
  e.preventDefault();
  activarModulo("maquinaria");
  if (typeof cargarMaquinaria === "function") cargarMaquinaria();
});
var navMaqListado = document.getElementById("nav-maquinaria-listado");
if (navMaqListado) navMaqListado.addEventListener("click", function (e) {
  e.preventDefault();
  activarModulo("maquinaria");
  // Hide detalle, show list
  var det = document.getElementById("panel-maquinaria-detalle");
  if (det) det.classList.remove("visible");
  var lst = document.getElementById("panel-maquinaria");
  if (lst) lst.classList.add("visible");
  if (typeof cargarMaquinaria === "function") cargarMaquinaria();
});
var navMaqMant = document.getElementById("nav-maquinaria-mantenimiento");
if (navMaqMant) navMaqMant.addEventListener("click", function (e) {
  e.preventDefault();
  activarModulo("maquinaria");
  // Hide detalle, show list panel (dashboard renders into maquinaria-content)
  var det = document.getElementById("panel-maquinaria-detalle");
  if (det) det.classList.remove("visible");
  var lst = document.getElementById("panel-maquinaria");
  if (lst) lst.classList.add("visible");
  if (typeof cargarDashboardMantenimiento === "function") cargarDashboardMantenimiento();
});

var navCae = document.getElementById("nav-cae-modulo");
if (navCae) navCae.addEventListener("click", function (e) {
  e.preventDefault();
  activarModulo("cae");
  caeSubpanel = "inicio";
  _caeOnPanelShow("inicio");
});

// ===== SIDEBAR INTERACTION =====
(function initSidebar() {
  var sidebar = document.getElementById("sidebar");
  var overlay = document.getElementById("sidebar-overlay");
  var hamburger = document.getElementById("sidebar-hamburger");
  if (!sidebar) return;

  // Mobile toggle
  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
  }
  if (hamburger) hamburger.addEventListener("click", function () {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("open");
  });
  if (overlay) overlay.addEventListener("click", closeSidebar);

  // Desktop collapse/expand toggle
  var toggleBtn = document.getElementById("sidebar-toggle");
  var _tooltipMap = {
    "nav-inicio-modulo": "Inicio",
    "nav-finanzas-modulo": "Finanzas",
    "nav-proyectos-modulo": "Proyectos",
    "nav-rrhh-modulo": "RRHH",
    "nav-crm-modulo": "CRM"
  };

  // Exposed on window so activarModulo can auto-collapse for CAE
  window.applyCollapsed = applyCollapsed;
  function applyCollapsed(collapsed) {
    sidebar.classList.toggle("collapsed", collapsed);
    // Layout driven purely by CSS variable --sidebar-width (no inline overrides)
    var sidebarW = collapsed ? "64px" : "240px";
    document.documentElement.style.setProperty("--sidebar-width", sidebarW);
    // Remove any stale inline styles on the container so CSS variable takes effect
    var containerEl = document.querySelector(".container");
    if (containerEl) {
      containerEl.style.removeProperty("margin-left");
      containerEl.style.removeProperty("width");
    }
    if (toggleBtn) {
      toggleBtn.innerHTML = collapsed ? "&raquo;" : "&laquo;";
      toggleBtn.title = collapsed ? "Expandir menú" : "Colapsar menú";
    }
    // Set/remove title tooltips on top-level items
    Object.keys(_tooltipMap).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.title = collapsed ? _tooltipMap[id] : "";
    });
    try { localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0"); } catch (e) {}
  }

  // Restore from localStorage
  var savedCollapsed = false;
  try { savedCollapsed = localStorage.getItem("sidebar-collapsed") === "1"; } catch (e) {}
  if (savedCollapsed) applyCollapsed(true);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      applyCollapsed(!sidebar.classList.contains("collapsed"));
    });
  }

  // Expand/collapse groups (accordion: collapse others at top level)
  var topLevelGroups = ["finanzas", "proyectos", "rrhh", "presupuestos", "crm", "cae"];

  function toggleGroup(el) {
    var group = el.getAttribute("data-group");
    var children = document.getElementById("sidebar-children-" + group);
    if (!children) return;
    var isOpen = children.classList.contains("open");
    if (topLevelGroups.indexOf(group) >= 0 && !isOpen) {
      topLevelGroups.forEach(function (g) {
        if (g !== group) {
          var otherChildren = document.getElementById("sidebar-children-" + g);
          var otherParent = sidebar.querySelector("[data-group='" + g + "']");
          if (otherChildren) otherChildren.classList.remove("open");
          if (otherParent) otherParent.classList.remove("expanded");
        }
      });
    }
    children.classList.toggle("open", !isOpen);
    el.classList.toggle("expanded", !isOpen);
  }

  // Chevron-only click: just toggle, don't navigate
  sidebar.querySelectorAll(".sidebar-parent[data-group] > .sidebar-chevron").forEach(function (chev) {
    chev.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var parentItem = chev.closest(".sidebar-parent[data-group]");
      if (parentItem) toggleGroup(parentItem);
    });
  });

  // Full item click: navigation is handled by the dedicated handlers (lines nav-*-modulo).
  // syncSidebar() called from patched activarModulo handles sidebar state.
  // No toggleGroup here — avoids double-toggle conflict with syncSidebar.

  // Sync sidebar highlights after navigation
  function syncSidebar() {
    // Clear all active states
    sidebar.querySelectorAll(".activo").forEach(function (el) {
      el.classList.remove("activo");
    });
    // Accordion: collapse all top-level groups, then open only the active one
    topLevelGroups.forEach(function (g) {
      var ch = document.getElementById("sidebar-children-" + g);
      var pa = sidebar.querySelector("[data-group='" + g + "']");
      if (ch) ch.classList.remove("open");
      if (pa) pa.classList.remove("expanded");
    });
    // Collapse level-3 groups too
    ["proveedores", "clientes"].forEach(function (g) {
      var ch = document.getElementById("sidebar-children-" + g);
      var pa = sidebar.querySelector("[data-group='" + g + "']");
      if (ch) ch.classList.remove("open");
      if (pa) pa.classList.remove("expanded");
    });

    if (moduloActivo === "inicio") {
      var el = document.getElementById("nav-inicio-modulo");
      if (el) el.classList.add("activo");
    } else if (moduloActivo === "finanzas") {
      var fm = document.getElementById("nav-finanzas-modulo");
      if (fm) { fm.classList.add("activo"); fm.classList.add("expanded"); }
      var fc = document.getElementById("sidebar-children-finanzas");
      if (fc) fc.classList.add("open");

      var childLink = document.getElementById("nav-finanzas-" + finanzasChild.replace("_", "-"));
      if (childLink) childLink.classList.add("activo");

      if (finanzasChild === "proveedores") {
        var pc = document.getElementById("sidebar-children-proveedores");
        if (pc) pc.classList.add("open");
        if (childLink) childLink.classList.add("expanded");
        var leafId = { facturas: "nav-facturas", proveedores: "nav-proveedores", cecos: "nav-cecos" }[proveedoresSubpanel];
        if (leafId) { var lf = document.getElementById(leafId); if (lf) lf.classList.add("activo"); }
      } else if (finanzasChild === "clientes") {
        var cc = document.getElementById("sidebar-children-clientes");
        if (cc) cc.classList.add("open");
        if (childLink) childLink.classList.add("expanded");
        var leafId2 = { clientes_facturas: "nav-clientes-facturas", clientes_listado: "nav-clientes-listado" }[clientesSubpanel];
        if (leafId2) { var lf2 = document.getElementById(leafId2); if (lf2) lf2.classList.add("activo"); }
      }
    } else if (moduloActivo === "proyectos") {
      var pm = document.getElementById("nav-proyectos-modulo");
      if (pm) { pm.classList.add("activo"); pm.classList.add("expanded"); }
      var pchildren = document.getElementById("sidebar-children-proyectos");
      if (pchildren) pchildren.classList.add("open");
      var pLeafId = "nav-proyectos-" + proyectosSubpanel;
      var pLeaf = document.getElementById(pLeafId);
      if (pLeaf) pLeaf.classList.add("activo");
    } else if (moduloActivo === "rrhh") {
      var rm = document.getElementById("nav-rrhh-modulo");
      if (rm) { rm.classList.add("activo"); rm.classList.add("expanded"); }
      var rc = document.getElementById("sidebar-children-rrhh");
      if (rc) rc.classList.add("open");
      var rLeafId = "nav-rrhh-" + rrhhSubpanel;
      var rLeaf = document.getElementById(rLeafId);
      if (rLeaf) rLeaf.classList.add("activo");
    } else if (moduloActivo === "crm") {
      var cm = document.getElementById("nav-crm-modulo");
      if (cm) { cm.classList.add("activo"); cm.classList.add("expanded"); }
      var crmC = document.getElementById("sidebar-children-crm");
      if (crmC) crmC.classList.add("open");
      var crmSubpanel = typeof crmSubpanelActivo !== "undefined" ? crmSubpanelActivo : "inicio";
      var crmLeafId = "nav-crm-" + crmSubpanel;
      var crmLeaf = document.getElementById(crmLeafId);
      if (crmLeaf) crmLeaf.classList.add("activo");
    } else if (moduloActivo === "presupuestos") {
      var pm = document.getElementById("nav-presupuestos-modulo");
      if (pm) { pm.classList.add("activo"); pm.classList.add("expanded"); }
      var pc = document.getElementById("sidebar-children-presupuestos");
      if (pc) pc.classList.add("open");
      var pLeafId = "nav-presupuestos-" + presupuestosSubpanel;
      var pLeaf = document.getElementById(pLeafId);
      if (pLeaf) pLeaf.classList.add("activo");
    } else if (moduloActivo === "cae") {
      var caem = document.getElementById("nav-cae-modulo");
      if (caem) { caem.classList.add("activo"); caem.classList.add("expanded"); }
      var caec = document.getElementById("sidebar-children-cae");
      if (caec) caec.classList.add("open");
      var caeLeafId = "nav-cae-" + caeSubpanel.replace("_", "-");
      var caeLeaf = document.getElementById(caeLeafId);
      if (caeLeaf) caeLeaf.classList.add("activo");
    }

    // Close sidebar on mobile after nav
    if (window.innerWidth <= 1024) closeSidebar();
  }

  // Patch activarModulo, activarFinanzasChild, activarSubpanel to sync sidebar
  var _origActivarModulo = activarModulo;
  activarModulo = function (nombre) {
    _origActivarModulo(nombre);
    syncSidebar();
  };
  var _origActivarFinanzasChild = activarFinanzasChild;
  activarFinanzasChild = function (child) {
    _origActivarFinanzasChild(child);
    syncSidebar();
  };
  var _origActivarSubpanel = activarSubpanel;
  activarSubpanel = function (modulo, subpanel) {
    _origActivarSubpanel(modulo, subpanel);
    syncSidebar();
  };

  // User info is now loaded from /api/usuarios/me (see usuarios.js)

  // On resize, update --sidebar-width for the current collapsed state
  window.addEventListener("resize", function () {
    var sw = sidebar.classList.contains("collapsed") ? "64px" : (window.innerWidth > 1024 ? "240px" : "0px");
    document.documentElement.style.setProperty("--sidebar-width", sw);
  });

  // Initial sync
  syncSidebar();
})();
