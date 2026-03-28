// ===== TOAST NOTIFICATIONS =====
(function () {
  var container = document.createElement("div");
  container.className = "toast-container";
  document.body.appendChild(container);
  window.mostrarToast = function (mensaje, tipo) {
    tipo = tipo || "info";
    var toast = document.createElement("div");
    toast.className = "toast toast-" + tipo;
    toast.textContent = mensaje;
    container.appendChild(toast);
    // Force layout to ensure the initial transform is applied before transitioning
    toast.offsetHeight;
    toast.classList.add("toast-visible");
    setTimeout(function () {
      toast.classList.add("toast-hiding");
      toast.classList.remove("toast-visible");
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3000);
  };
})();

// ===== VALIDACIÓN INLINE =====
function marcarCampoError(inputEl, mensaje) {
  if (!inputEl) return;
  inputEl.classList.add("input-error");
  var existente = inputEl.parentNode.querySelector(".form-error-msg");
  if (!existente) {
    var msg = document.createElement("span");
    msg.className = "form-error-msg";
    msg.textContent = mensaje || "Este campo es obligatorio";
    inputEl.parentNode.insertBefore(msg, inputEl.nextSibling);
  }
  function limpiar() {
    inputEl.classList.remove("input-error");
    var m = inputEl.parentNode.querySelector(".form-error-msg");
    if (m) m.remove();
    inputEl.removeEventListener("input", limpiar);
    inputEl.removeEventListener("change", limpiar);
  }
  inputEl.addEventListener("input", limpiar);
  inputEl.addEventListener("change", limpiar);
}

// Rellenar todos los selects de empresa desde la API (una sola fuente de verdad)
(function rellenarSelectsEmpresa() {
  fetch("/api/empresas?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (empresas) {
      document.querySelectorAll(".select-empresa").forEach(function (select) {
        var primera = select.options[0];
        if (!primera) return;
        select.innerHTML = "";
        select.appendChild(primera);
        empresas.forEach(function (e) {
          var opt = document.createElement("option");
          opt.value = e.id;
          opt.textContent = e.nombre;
          select.appendChild(opt);
        });
      });
      actualizarContextosEmpresa();
    })
    .catch(function (err) { console.error("Error cargando empresas:", err); });
})();

function actualizarContextosEmpresa() {
  function setContext(selectId, contextId) {
    var sel = document.getElementById(selectId);
    var ctx = document.getElementById(contextId);
    if (!sel || !ctx) return;
    var txt = sel.value && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "";
    ctx.textContent = txt ? "Empresa: " + txt : "";
  }
  function bancosContext() {
    var f = document.getElementById("bancos-filtro-empresa");
    var i = document.getElementById("bancos-empresa");
    var ctx = document.getElementById("empresa-contexto-bancos");
    if (!ctx) return;
    var sel = (f && f.value) ? f : (i && i.value) ? i : null;
    var txt = sel && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "";
    ctx.textContent = txt ? "Empresa: " + txt : "";
  }
  ["empresa-listado", "empresa-proveedores", "empresa-cecos", "cli-empresa-listado"].forEach(function (id) {
    var map = { "empresa-listado": "empresa-contexto-facturas", "empresa-proveedores": "empresa-contexto-proveedores", "empresa-cecos": "empresa-contexto-cecos", "cli-empresa-listado": "empresa-contexto-clientes" };
    var sel = document.getElementById(id);
    if (sel && !sel._empresaContextoBound) {
      sel._empresaContextoBound = true;
      sel.addEventListener("change", function () { setContext(id, map[id]); });
    }
    setContext(id, map[id]);
  });
  var bFiltro = document.getElementById("bancos-filtro-empresa");
  var bEmpresa = document.getElementById("bancos-empresa");
  if (bFiltro && !bFiltro._empresaContextoBound) { bFiltro._empresaContextoBound = true; bFiltro.addEventListener("change", bancosContext); }
  if (bEmpresa && !bEmpresa._empresaContextoBound) { bEmpresa._empresaContextoBound = true; bEmpresa.addEventListener("change", bancosContext); }
  bancosContext();
}

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
    subNavLinks: {},
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

function cargarDashboard() {
  var elFecha = document.getElementById("dashboard-fecha");
  if (elFecha) {
    var hoy = new Date();
    var opciones = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    var fechaStr = hoy.toLocaleDateString("es-ES", opciones);
    elFecha.textContent = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);
  }
  fetch("/api/dashboard?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var hora = new Date().getHours();
      var saludo = hora < 14 ? "Buenos días" : hora < 20 ? "Buenas tardes" : "Buenas noches";
      if (data.usuario) {
        var nombre = data.usuario.charAt(0).toUpperCase() + data.usuario.slice(1);
        saludo += ", " + nombre;
      }
      var elSaludo = document.getElementById("dashboard-saludo");
      if (elSaludo) elSaludo.textContent = saludo;
      var elPend = document.getElementById("dash-pendientes-count");
      if (elPend) elPend.textContent = data.facturas_pendientes_count != null ? data.facturas_pendientes_count : "—";
      var elImporte = document.getElementById("dash-importe-pendiente");
      if (elImporte) elImporte.textContent = data.importe_pendiente_total != null ? formatearNumeroES(data.importe_pendiente_total) + " €" : "—";
      var elMes = document.getElementById("dash-mes-count");
      if (elMes) elMes.textContent = data.facturas_mes_count != null ? data.facturas_mes_count : "—";
      var elMesLabel = document.getElementById("dash-mes-label");
      if (elMesLabel) {
        var meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
        elMesLabel.textContent = meses[new Date().getMonth()] + " " + new Date().getFullYear();
      }
      var elEmpresas = document.getElementById("dash-empresas-count");
      if (elEmpresas) elEmpresas.textContent = data.empresas_activas != null ? data.empresas_activas : "—";

      var tablaUltimas = document.getElementById("tabla-dash-ultimas");
      if (tablaUltimas && data.ultimas_facturas) {
        var tbody = tablaUltimas.querySelector("tbody");
        if (!tbody) { tbody = document.createElement("tbody"); tablaUltimas.appendChild(tbody); }
        tbody.innerHTML = "";
        if (data.ultimas_facturas.length === 0) {
          tbody.innerHTML = "<tr><td colspan=\"4\" style=\"text-align:center;color:#94A3B8;padding:24px;\">Sin facturas recientes</td></tr>";
        } else {
          data.ultimas_facturas.forEach(function (f) {
            var tr = document.createElement("tr");
            tr.innerHTML = "<td>" + (f.fecha || "—") + "</td><td>" + (f.proveedor || "—") + "</td><td class=\"numero\">" + formatearNumeroES(f.total) + " €</td><td>" + (f.empresa || "—") + "</td>";
            tbody.appendChild(tr);
          });
        }
      }

      var tablaPend = document.getElementById("tabla-dash-pendientes");
      if (tablaPend && data.pendientes_por_empresa) {
        var tbody2 = tablaPend.querySelector("tbody");
        if (!tbody2) { tbody2 = document.createElement("tbody"); tablaPend.appendChild(tbody2); }
        tbody2.innerHTML = "";
        if (data.pendientes_por_empresa.length === 0) {
          tbody2.innerHTML = "<tr><td colspan=\"3\" style=\"text-align:center;color:#94A3B8;padding:24px;\">Sin facturas pendientes</td></tr>";
        } else {
          data.pendientes_por_empresa.forEach(function (e) {
            var tr = document.createElement("tr");
            tr.innerHTML = "<td>" + (e.empresa || "—") + "</td><td class=\"numero\">" + (e.count || 0) + "</td><td class=\"numero\">" + formatearNumeroES(e.importe) + " €</td>";
            tbody2.appendChild(tr);
          });
        }
      }

      // --- Gráficos del dashboard ---
      renderizarGraficosDashboard(data);
    })
    .catch(function (err) { console.error("Error cargando dashboard:", err); });
}

var _chartInstances = {};
function _destroyChart(key) {
  if (_chartInstances[key]) { _chartInstances[key].destroy(); _chartInstances[key] = null; }
}

function renderizarGraficosDashboard(data) {
  if (typeof Chart === "undefined") return;

  // Defaults globales
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = "#64748B";
  Chart.defaults.elements.bar.borderWidth = 0;
  Chart.defaults.elements.arc.borderWidth = 0;
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;

  // 1) Facturación mensual (bar + line)
  if (data.facturas_por_mes && data.facturas_por_mes.length) {
    _destroyChart("facturasMes");
    var ctx1 = document.getElementById("chart-facturas-mes");
    if (ctx1) {
      _chartInstances["facturasMes"] = new Chart(ctx1, {
        type: "bar",
        data: {
          labels: data.facturas_por_mes.map(function(d) { return d.mes; }),
          datasets: [
            {
              label: "Importe (€)",
              data: data.facturas_por_mes.map(function(d) { return d.importe; }),
              backgroundColor: "rgba(37,99,235,0.8)",
              borderRadius: 6,
              yAxisID: "y",
              order: 2
            },
            {
              label: "Nº facturas",
              data: data.facturas_por_mes.map(function(d) { return d.count; }),
              type: "line",
              borderColor: "#F59E0B",
              backgroundColor: "#F59E0B",
              pointRadius: 4,
              pointBackgroundColor: "#F59E0B",
              tension: 0.3,
              yAxisID: "y1",
              order: 1
            }
          ]
        },
        options: {
          plugins: { legend: { display: false }, tooltip: { enabled: true } },
          scales: {
            x: { grid: { display: false } },
            y: { grid: { color: "#E2E8F0" }, beginAtZero: true, ticks: { callback: function(v) { return v.toLocaleString("es-ES") + " €"; } } },
            y1: { position: "right", grid: { drawOnChartArea: false }, beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
          }
        }
      });
    }
  }

  // 2) Estado de facturas (doughnut)
  if (data.facturas_por_estado) {
    _destroyChart("estadoFacturas");
    var ctx2 = document.getElementById("chart-estado-facturas");
    if (ctx2) {
      var est = data.facturas_por_estado;
      var totalFacturas = (est.pendiente || 0) + (est.pagada || 0) + (est.parcial || 0);
      _chartInstances["estadoFacturas"] = new Chart(ctx2, {
        type: "doughnut",
        data: {
          labels: ["Pendiente", "Pagada", "Parcial"],
          datasets: [{
            data: [est.pendiente || 0, est.pagada || 0, est.parcial || 0],
            backgroundColor: ["#F59E0B", "#10B981", "#3B82F6"],
            hoverOffset: 6
          }]
        },
        options: {
          cutout: "70%",
          plugins: {
            legend: { position: "bottom", labels: { padding: 16 } },
            tooltip: { enabled: true }
          }
        },
        plugins: [{
          id: "centerText",
          afterDraw: function(chart) {
            var ctx = chart.ctx;
            var w = chart.width, h = chart.chartArea.bottom - chart.chartArea.top;
            var cy = chart.chartArea.top + h / 2;
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "600 28px 'Inter', sans-serif";
            ctx.fillStyle = "#1E293B";
            ctx.fillText(totalFacturas, w / 2, cy - 8);
            ctx.font = "12px 'Inter', sans-serif";
            ctx.fillStyle = "#64748B";
            ctx.fillText("facturas", w / 2, cy + 16);
            ctx.restore();
          }
        }]
      });
    }
  }

  // 3) Top 5 proveedores (horizontal bar)
  if (data.top_proveedores && data.top_proveedores.length) {
    _destroyChart("topProveedores");
    var ctx3 = document.getElementById("chart-top-proveedores");
    if (ctx3) {
      var gradient = ctx3.getContext("2d").createLinearGradient(0, 0, ctx3.parentElement.offsetWidth, 0);
      gradient.addColorStop(0, "#2563EB");
      gradient.addColorStop(1, "#60A5FA");
      _chartInstances["topProveedores"] = new Chart(ctx3, {
        type: "bar",
        data: {
          labels: data.top_proveedores.map(function(d) { return d.nombre; }),
          datasets: [{
            data: data.top_proveedores.map(function(d) { return d.importe; }),
            backgroundColor: gradient,
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: "y",
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function(ctx) { return ctx.parsed.x.toLocaleString("es-ES", { minimumFractionDigits: 2 }) + " €"; } } }
          },
          scales: {
            x: { grid: { color: "#E2E8F0" }, beginAtZero: true, ticks: { callback: function(v) { return v.toLocaleString("es-ES") + " €"; } } },
            y: { grid: { display: false } }
          }
        }
      });
    }
  }
}

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
        } else if (child === "clientes" && partes.length >= 3) {
          var sp = partes[2];
          if (sp === "clientes_facturas" || sp === "clientes_listado") activarSubpanel("clientes", sp);
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
    cargarDashboard();
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

var navMaquinaria = document.getElementById("nav-maquinaria-modulo");
if (navMaquinaria) navMaquinaria.addEventListener("click", function (e) {
  e.preventDefault();
  activarModulo("maquinaria");
});

var navCae = document.getElementById("nav-cae-modulo");
if (navCae) navCae.addEventListener("click", function (e) {
  e.preventDefault();
  activarModulo("cae");
  caeSubpanel = "inicio";
  _caeOnPanelShow("inicio");
});


// ===== MODULE DASHBOARD NAV CARDS =====
function _finFmtCompact(val) {
  if (!val && val !== 0) return "\u2014";
  var num = Number(val);
  if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(1) + "M \u20ac";
  if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + "k \u20ac";
  return num.toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " \u20ac";
}

function cargarFinanzasInicio() {
  var container = document.getElementById("finanzas-dashboard-content");
  if (!container) return;

  fetch("/api/finanzas/dashboard?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var margenColor = d.margen_bruto >= 0 ? "#16A34A" : "#DC2626";

      // KPI card helper
      function _kpi(label, total, subtitle, color) {
        return '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid ' + color + ';border-radius:var(--radius-md);padding:14px 16px;">' +
          '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;">' + label + '</div>' +
          '<div style="font-size:20px;font-weight:700;color:' + color + ';margin-top:4px;">' + _finFmtCompact(total) + '</div>' +
          '<div style="font-size:11px;color:var(--color-text-secondary);">' + subtitle + '</div>' +
        '</div>';
      }

      // Proyecto rows
      var proyRows = "";
      if (d.proyectos && d.proyectos.length) {
        proyRows = d.proyectos.map(function (p) {
          var mc = p.margen >= 0 ? "#16A34A" : "#DC2626";
          return '<tr style="border-bottom:1px solid var(--color-border);cursor:pointer;" onclick="navegarAProyecto(' + p.id + ')">' +
            '<td style="padding:8px 12px;"><div style="font-weight:500;">' + _esc(p.nombre) + '</div>' +
              '<div style="font-size:11px;color:var(--color-text-secondary);">' + _esc(p.cliente || "") + ' \u00b7 <span class="status-badge status-badge--' + _esc(p.estado) + '">' + _esc(p.estado) + '</span></div></td>' +
            '<td style="padding:8px 12px;text-align:right;">' + _finFmtCompact(p.importe_presupuestado) + '</td>' +
            '<td style="padding:8px 12px;text-align:right;color:#2563EB;">' + _finFmtCompact(p.facturado) + '</td>' +
            '<td style="padding:8px 12px;text-align:right;color:#DC2626;">' + _finFmtCompact(p.costes) + '</td>' +
            '<td style="padding:8px 12px;text-align:right;font-weight:600;color:' + mc + ';">' + _finFmtCompact(p.margen) +
              '<div style="font-size:10px;font-weight:400;">' + p.margen_pct + '%</div></td>' +
          '</tr>';
        }).join("");
      }

      // Pipeline rows
      var pipeRows = "";
      if (d.pipeline && d.pipeline.length) {
        pipeRows = d.pipeline.map(function (p) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--color-border);cursor:pointer;" onclick="navegarAPresupuesto(' + p.id + ')">' +
            '<div><div style="font-size:13px;font-weight:500;color:var(--color-primary);">' + _esc(p.referencia || "") + '</div>' +
              '<div style="font-size:12px;color:var(--color-text-secondary);">' + _esc(p.nombre_proyecto || "") + ' \u00b7 ' + _esc(p.cliente || "") + '</div></div>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<span style="font-size:14px;font-weight:500;">' + _finFmtCompact(p.importe) + '</span>' +
              '<span class="status-badge status-badge--' + _esc(p.estado || "") + '">' + _esc(p.estado || "") + '</span>' +
            '</div></div>';
        }).join("");
      }

      // Nav card helper
      function _nav(emoji, title, subtitle, navTarget) {
        return '<div data-nav="finanzas:' + navTarget + '" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--color-border);border-radius:var(--radius-md);cursor:pointer;background:var(--color-white);transition:border-color 0.15s;" onmouseover="this.style.borderColor=\'var(--color-primary)\'" onmouseout="this.style.borderColor=\'var(--color-border)\'">' +
          '<span style="font-size:20px;">' + emoji + '</span>' +
          '<div style="flex:1;"><div style="font-size:14px;font-weight:500;">' + title + '</div>' +
            '<div style="font-size:12px;color:var(--color-text-secondary);">' + subtitle + '</div></div>' +
          '<span style="color:var(--color-text-secondary);font-size:14px;">\u203a</span>' +
        '</div>';
      }

      container.innerHTML =
        '<div class="breadcrumb-visual">Finanzas</div>' +
        '<h1 style="margin:0 0 4px;">Finanzas</h1>' +
        '<p class="subtitle" style="font-size:14px;color:#64748B;margin:0 0 20px;">Visi\u00f3n general del \u00e1rea financiera \u2014 ' + d.year + '</p>' +

        // KPIs
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px;" id="finanzas-kpis">' +
          _kpi("Facturaci\u00f3n clientes " + d.year, d.facturacion_clientes.total, d.facturacion_clientes.num + " facturas", "#16A34A") +
          _kpi("Cobros pendientes", d.cobros_pendientes.total, d.cobros_pendientes.num + " facturas", "#CA8A04") +
          _kpi("Facturas proveedor " + d.year, d.facturacion_proveedores.total, d.facturacion_proveedores.num + " facturas", "#DC2626") +
          _kpi("Pagos pendientes", d.pagos_pendientes.total, d.pagos_pendientes.num + " facturas", "#E85D24") +
          _kpi("Margen bruto " + d.year, d.margen_bruto, "Clientes - Proveedores", margenColor) +
        '</div>' +

        // Two columns
        '<div style="display:grid;grid-template-columns:3fr 2fr;gap:16px;" id="finanzas-cols">' +

          // Left column
          '<div style="display:flex;flex-direction:column;gap:16px;">' +

            // Rentabilidad por proyecto
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:12px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:8px;">' +
                '<span style="font-size:14px;">\uD83D\uDCCA</span>' +
                '<span style="font-size:14px;font-weight:600;">Rentabilidad por proyecto</span>' +
              '</div>' +
              '<div style="padding:0;max-height:300px;overflow-y:auto;">' +
                (proyRows
                  ? '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
                      '<thead><tr style="background:var(--color-bg-page);position:sticky;top:0;">' +
                        '<th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Proyecto</th>' +
                        '<th style="text-align:right;padding:8px 12px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Presupuest.</th>' +
                        '<th style="text-align:right;padding:8px 12px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Facturado</th>' +
                        '<th style="text-align:right;padding:8px 12px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Costes</th>' +
                        '<th style="text-align:right;padding:8px 12px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Margen</th>' +
                      '</tr></thead><tbody>' + proyRows + '</tbody></table>'
                  : '<p style="padding:20px;color:var(--color-text-secondary);text-align:center;">Sin proyectos activos</p>') +
              '</div>' +
            '</div>' +

            // Pipeline comercial
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:12px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                  '<span style="font-size:14px;">\uD83D\uDD2E</span>' +
                  '<span style="font-size:14px;font-weight:600;">Pipeline comercial</span>' +
                '</div>' +
                '<span style="font-size:14px;font-weight:600;color:var(--color-primary);">' + _finFmtCompact(d.pipeline_total) + ' en negociaci\u00f3n</span>' +
              '</div>' +
              '<div style="padding:0;max-height:250px;overflow-y:auto;">' +
                (pipeRows
                  ? '<div style="display:flex;flex-direction:column;">' + pipeRows + '</div>'
                  : '<p style="padding:20px;color:var(--color-text-secondary);text-align:center;">Sin presupuestos en negociaci\u00f3n</p>') +
              '</div>' +
            '</div>' +

          '</div>' +

          // Right column — Navigation cards
          '<div style="display:flex;flex-direction:column;gap:10px;">' +
            _nav("\uD83D\uDCC4", "Proveedores", d.facturacion_proveedores.num + " facturas este a\u00f1o", "proveedores") +
            _nav("\uD83D\uDC65", "Clientes", d.facturacion_clientes.num + " facturas este a\u00f1o", "clientes") +
            _nav("\uD83C\uDFE6", "Bancos", d.movimientos_sin_conciliar + " sin conciliar", "bancos") +
            _nav("\u2705", "Control de calidad", "An\u00e1lisis y validaci\u00f3n", "control_calidad") +
            _nav("\uD83D\uDCB0", "Tesorer\u00eda", "Flujo de caja y vencimientos", "tesoreria") +
          '</div>' +

        '</div>';

      // Re-bind navigation card clicks (since we rebuilt the DOM)
      container.querySelectorAll("[data-nav]").forEach(function (card) {
        card.addEventListener("click", function () {
          var parts = card.getAttribute("data-nav").split(":");
          activarFinanzasChild(parts[1]);
          if (parts[1] === "tesoreria" && window._tesCargarTodo) window._tesCargarTodo();
        });
      });
    })
    .catch(function (e) {
      console.error("Error cargando dashboard finanzas:", e);
    });
}

(function initModuloNavCards() {
  document.querySelectorAll(".modulo-nav-card[data-nav]").forEach(function (card) {
    card.addEventListener("click", function () {
      var nav = card.getAttribute("data-nav");
      if (!nav) return;
      var parts = nav.split(":");
      var modulo = parts[0];
      var child = parts[1];
      if (modulo === "finanzas") {
        activarModulo("finanzas");
        activarFinanzasChild(child);
        if (child === "tesoreria" && window._tesCargarTodo) _tesCargarTodo();
      } else if (modulo === "proyectos") {
        activarModulo("proyectos");
        activarSubpanel("proyectos", child);
      } else if (modulo === "rrhh") {
        activarModulo("rrhh");
        activarSubpanel("rrhh", child);
      }
    });
  });
})();

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

  // User info is now loaded from /api/usuarios/me (see Usuarios section below)

  // On resize, update --sidebar-width for the current collapsed state
  window.addEventListener("resize", function () {
    var sw = sidebar.classList.contains("collapsed") ? "64px" : (window.innerWidth > 1024 ? "240px" : "0px");
    document.documentElement.style.setProperty("--sidebar-width", sw);
  });

  // Initial sync
  syncSidebar();
})();

// Bancos: paginación mejorada
function renderPaginacionBancos(container, actual, total) {
  container.innerHTML = "";
  function addBtn(label, page, disabled, active) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    if (disabled) btn.disabled = true;
    if (active) btn.classList.add("pag-activa");
    if (!disabled && !active) {
      btn.addEventListener("click", function () {
        // Access paginaActual from the parent scope via the IIFE
        if (typeof window._bancosIrAPagina === "function") window._bancosIrAPagina(page);
      });
    }
    container.appendChild(btn);
  }
  function addEllipsis() {
    var sp = document.createElement("span");
    sp.className = "pag-ellipsis";
    sp.textContent = "…";
    container.appendChild(sp);
  }
  addBtn("«", 1, actual <= 1);
  addBtn("‹", actual - 1, actual <= 1);
  // Show max 5 page numbers with ellipsis
  var start = Math.max(1, actual - 2);
  var end = Math.min(total, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);
  if (start > 1) { addBtn("1", 1, false, actual === 1); if (start > 2) addEllipsis(); }
  for (var i = start; i <= end; i++) {
    if (i === 1 && start > 1) continue; // already added
    addBtn(String(i), i, false, i === actual);
  }
  if (end < total) { if (end < total - 1) addEllipsis(); addBtn(String(total), total, false, actual === total); }
  addBtn("›", actual + 1, actual >= total);
  addBtn("»", total, actual >= total);
}

// Bancos: modal importar extracto
(function () {
  var btnAbrir = document.getElementById("btn-abrir-modal-importar");
  var btnCerrar = document.getElementById("btn-cerrar-modal-importar");
  var overlay = document.getElementById("modal-importar-extracto-overlay");
  if (btnAbrir && overlay) {
    btnAbrir.addEventListener("click", function () {
      overlay.classList.add("visible");
      overlay.setAttribute("aria-hidden", "false");
    });
  }
  if (btnCerrar && overlay) {
    btnCerrar.addEventListener("click", function () {
      overlay.classList.remove("visible");
      overlay.setAttribute("aria-hidden", "true");
    });
  }
  if (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) { overlay.classList.remove("visible"); overlay.setAttribute("aria-hidden", "true"); }
    });
  }
})();

// Bancos: conciliación panel toggle
(function () {
  var toggle = document.getElementById("bancos-conciliacion-toggle");
  var body = document.getElementById("bancos-conciliacion-body");
  var panel = document.getElementById("bancos-conciliacion-block");
  if (toggle && body && panel) {
    toggle.addEventListener("click", function () {
      var open = body.style.display !== "none";
      body.style.display = open ? "none" : "block";
      panel.classList.toggle("open", !open);
    });
  }
})();

// Bancos: tarjetas config panel toggle
(function () {
  var toggle = document.getElementById("tarjetas-config-toggle");
  var body = document.getElementById("tarjetas-config-body");
  var panel = document.getElementById("tarjetas-config-panel");
  if (toggle && body && panel) {
    toggle.addEventListener("click", function () {
      var open = body.style.display !== "none";
      body.style.display = open ? "none" : "block";
      panel.classList.toggle("open", !open);
    });
  }
})();

// Bancos: importar extracto (Santander)
(function () {
  var form = document.getElementById("form-bancos-importar");
  var statusEl = document.getElementById("bancos-status");
  var resultadoEl = document.getElementById("bancos-resultado");
  var listaEl = document.getElementById("bancos-resultado-lista");
  if (!form || !statusEl) return;
  var fileInputInit = document.getElementById("bancos-archivo");
  var fileNameEl = document.getElementById("bancos-archivo-nombre");
  if (fileInputInit && fileNameEl) {
    fileInputInit.addEventListener("change", function () {
      fileNameEl.textContent = fileInputInit.files && fileInputInit.files[0] ? fileInputInit.files[0].name : "Ningún archivo";
    });
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var fileInput = document.getElementById("bancos-archivo");
    var bancoSelect = document.getElementById("bancos-banco");
    var empresaSelect = document.getElementById("bancos-empresa");
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      statusEl.textContent = "Selecciona un archivo Excel.";
      statusEl.style.color = "#b91c1c";
      resultadoEl.style.display = "none";
      return;
    }
    var empresaId = (empresaSelect && empresaSelect.value) || "";
    if (!empresaId) {
      statusEl.textContent = "Selecciona una empresa para asignar los movimientos.";
      statusEl.style.color = "#b91c1c";
      resultadoEl.style.display = "none";
      return;
    }
    var file = fileInput.files[0];
    var banco = (bancoSelect && bancoSelect.value) || "santander";
    statusEl.textContent = "Cargando…";
    statusEl.style.color = "";
    resultadoEl.style.display = "none";
    var fd = new FormData();
    fd.append("archivo", file);
    if (empresaId) fd.append("empresa_id", empresaId);
    var url = "/api/bancos/importar/" + banco;
    fetch(url, { method: "POST", body: fd })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.statusText); });
        return r.json();
      })
      .then(function (data) {
        statusEl.textContent = data.mensaje || "Carga finalizada.";
        statusEl.style.color = "";
        resultadoEl.style.display = "block";
        listaEl.innerHTML = "";
        var items = [];
        if (data.leidos != null) items.push({ icon: "ok", text: "Leídos en el Excel: " + data.leidos });
        if (data.insertados != null) items.push({ icon: data.insertados > 0 ? "ok" : "warn", text: "Insertados: " + data.insertados });
        if (data.duplicados_omitidos != null) items.push({ icon: data.duplicados_omitidos > 0 ? "warn" : "ok", text: "Duplicados omitidos: " + data.duplicados_omitidos });
        if (data.errores && data.errores.length) items.push({ icon: "err", text: "Errores: " + data.errores.length });
        items.forEach(function (item) {
          var li = document.createElement("li");
          var iconClass = item.icon === "ok" ? "ok" : item.icon === "warn" ? "warn" : "err";
          var iconChar = item.icon === "ok" ? "\u2713" : item.icon === "warn" ? "!" : "\u2717";
          li.innerHTML = "<span class=\"bancos-resultado-icono " + iconClass + "\">" + iconChar + "</span>" + item.text;
          listaEl.appendChild(li);
        });
        if (data.errores && data.errores.length) {
          data.errores.slice(0, 5).forEach(function (err) {
            var li = document.createElement("li");
            li.style.color = "#b91c1c";
            li.textContent = "Fila " + (err.indice + 1) + ": " + (err.error || "");
            listaEl.appendChild(li);
          });
          if (data.errores.length > 5) {
            var li = document.createElement("li");
            li.style.color = "#b91c1c";
            li.textContent = "… y " + (data.errores.length - 5) + " más.";
            listaEl.appendChild(li);
          }
        }
      })
      .catch(function (err) {
        statusEl.textContent = err.message || "Error al cargar.";
        statusEl.style.color = "#b91c1c";
        resultadoEl.style.display = "none";
      });
    if (typeof window.cargarMovimientosBancos === "function") window.cargarMovimientosBancos();
  });
})();

// Bancos: listado movimientos de caja (cargar, filtros, tabla)
(function () {
  var tbody = document.getElementById("tbody-movimientos-bancos");
  var contadorEl = document.getElementById("bancos-contador");
  var filtroBanco = document.getElementById("bancos-filtro-banco");
  var filtroFechaDesde = document.getElementById("bancos-filtro-fecha-desde");
  var filtroFechaHasta = document.getElementById("bancos-filtro-fecha-hasta");
  var filtroConcepto = document.getElementById("bancos-filtro-concepto");
  var filtroEmpresa = document.getElementById("bancos-filtro-empresa");
  var btnRefrescar = document.getElementById("bancos-btn-refrescar");
  var resumenEl = document.getElementById("bancos-resumen-periodo");
  var toggleTipo = document.getElementById("bancos-toggle-tipo");
  var paginacionEl = document.getElementById("bancos-paginacion");
  var pagPrevBtn = document.getElementById("bancos-pag-prev");
  var pagNextBtn = document.getElementById("bancos-pag-next");
  var pagInfoEl = document.getElementById("bancos-pag-info");
  var filtroTipoActual = "";
  var filtroConciliacionActual = "";
  var toggleConciliacion = document.getElementById("bancos-toggle-conciliacion");
  var movimientosCache = [];
  var paginaActual = 1;
  var movsPorPagina = 100;
  window._bancosIrAPagina = function (p) { paginaActual = p; renderMovimientosFiltrados(); };

  function formatNumero(n) {
    if (n == null || n === "") return "—";
    var x;
    if (typeof n === "string") {
      var s = n.trim();
      if (!s) return "—";
      // Normalizar formatos europeos: 1.234,56 ó 1234,56
      if (s.indexOf(",") !== -1) {
        if (s.indexOf(".") !== -1) {
          // Caso 1.234,56 -> quitar miles y usar punto como decimal
          s = s.replace(/\./g, "").replace(",", ".");
        } else {
          // Caso 1234,56 -> usar punto como decimal
          s = s.replace(",", ".");
        }
      }
      x = Number(s);
    } else {
      x = Number(n);
    }
    if (isNaN(x)) return "—";
    var abs = Math.abs(x);
    var base = abs.toFixed(2); // "1718.20"
    var partes = base.split(".");
    var entero = partes[0];
    var dec = partes[1] || "00";
    // Insertar separador de miles con puntos
    entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    var sNum = entero + "," + dec;
    return x < 0 ? "(" + sNum + ")" : sNum;
  }

  function detectarTraspasos(movs) {
    var n = movs.length;
    var esTraspaso = Object.create(null);
    function parseDate(s) {
      if (!s || typeof s !== "string") return null;
      var part = (s + "").trim().slice(0, 10);
      if (part.length !== 10) return null;
      var d = new Date(part);
      return isNaN(d.getTime()) ? null : d;
    }
    function dentroRango(d1, d2, dias) {
      if (!d1 || !d2) return false;
      var diff = Math.abs((d1.getTime() - d2.getTime()) / (24 * 60 * 60 * 1000));
      return diff <= dias;
    }
    for (var i = 0; i < n; i++) {
      var m1 = movs[i];
      var emp1 = (m1.empresa_id || "").toString().trim();
      var imp1 = m1.importe != null ? Number(m1.importe) : 0;
      if (!imp1) continue;
      var fecha1 = parseDate(m1.fecha_operacion);
      for (var j = 0; j < n; j++) {
        if (i === j) continue;
        var m2 = movs[j];
        var emp2 = (m2.empresa_id || "").toString().trim();
        if (emp1 !== emp2) continue;
        var imp2 = m2.importe != null ? Number(m2.importe) : 0;
        if (!imp2) continue;
        if ((imp1 > 0 && imp2 > 0) || (imp1 < 0 && imp2 < 0)) continue;
        if (Math.abs(Math.abs(imp1) - Math.abs(imp2)) > 0.01) continue;
        var fecha2 = parseDate(m2.fecha_operacion);
        if (!dentroRango(fecha1, fecha2, 2)) continue;
        esTraspaso[i] = true;
        esTraspaso[j] = true;
      }
    }
    return esTraspaso;
  }

  function actualizarResumenPeriodo(movs) {
    if (!resumenEl) return;
    if (!movs || movs.length === 0) { resumenEl.style.display = "none"; return; }
    var totalEntradas = 0, totalSalidas = 0, count = movs.length;
    movs.forEach(function (m) {
      var imp = m.importe != null ? Number(m.importe) : 0;
      if (imp > 0) totalEntradas += imp;
      else totalSalidas += imp;
    });
    // Saldo acumulado: usar saldo_acumulado del movimiento más antiguo (último del array, orden DESC) y más reciente (primero)
    // saldo_acumulado ya es el saldo real de la cuenta en ese punto
    var movMasAntiguo = movs[movs.length - 1];
    var movMasReciente = movs[0];
    // Saldo inicial = saldo acumulado ANTES del primer movimiento visible = saldo_acumulado del más antiguo - su importe
    var saldoInicial = null;
    if (movMasAntiguo && movMasAntiguo.saldo_acumulado != null) {
      saldoInicial = Number(movMasAntiguo.saldo_acumulado) - Number(movMasAntiguo.importe || 0);
    } else if (movMasAntiguo && movMasAntiguo.saldo != null) {
      // Fallback: usar saldo del extracto del primer movimiento - su importe
      saldoInicial = Number(movMasAntiguo.saldo) - Number(movMasAntiguo.importe || 0);
    }
    // Saldo final = saldo acumulado del movimiento más reciente
    var saldoFinal = null;
    if (movMasReciente && movMasReciente.saldo_acumulado != null) {
      saldoFinal = Number(movMasReciente.saldo_acumulado);
    } else if (movMasReciente && movMasReciente.saldo != null) {
      saldoFinal = Number(movMasReciente.saldo);
    }
    var html = "";
    if (saldoInicial !== null) html += "<span class=\"resumen-item\"><span class=\"resumen-label\">Saldo inicial:</span><span class=\"resumen-valor\">" + formatNumero(saldoInicial) + "</span></span>";
    if (saldoFinal !== null) html += "<span class=\"resumen-item\"><span class=\"resumen-label\">Saldo final:</span><span class=\"resumen-valor\">" + formatNumero(saldoFinal) + "</span></span>";
    html += "<span class=\"resumen-item\"><span class=\"resumen-label\">Entradas:</span><span class=\"resumen-valor positivo\">" + formatNumero(totalEntradas) + "</span></span>";
    html += "<span class=\"resumen-item\"><span class=\"resumen-label\">Salidas:</span><span class=\"resumen-valor negativo\">" + formatNumero(totalSalidas) + "</span></span>";
    html += "<span class=\"resumen-item\"><span class=\"resumen-label\">Movimientos:</span><span class=\"resumen-valor\">" + count + "</span></span>";
    resumenEl.innerHTML = html;
    resumenEl.style.display = "flex";
  }

  var MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  function mesAnioDeMovimiento(m) {
    var f = (m.fecha_operacion || "").trim().slice(0, 7);
    return f || "sin-fecha";
  }
  function labelMes(clave) {
    if (clave === "sin-fecha") return "Sin fecha";
    var partes = clave.split("-");
    var anio = partes[0];
    var mes = parseInt(partes[1], 10);
    return (mes >= 1 && mes <= 12 ? MESES_ES[mes - 1] : "?") + " " + anio;
  }

  function renderMovimientosFiltrados() {
    if (!tbody) return;
    var movsFiltrados = movimientosCache;
    if (filtroTipoActual === "cargos") {
      movsFiltrados = movsFiltrados.filter(function (m) { return Number(m.importe) < 0; });
    } else if (filtroTipoActual === "abonos") {
      movsFiltrados = movsFiltrados.filter(function (m) { return Number(m.importe) > 0; });
    }
    if (filtroConciliacionActual === "sin_conciliar") {
      movsFiltrados = movsFiltrados.filter(function (m) {
        return !m.conciliado_at && !m.factura_proveedor_id && !m.factura_cliente_id && !m.factura_cliente_key && (!m.tarjeta_id || m.tarjeta_id === 0);
      });
    } else if (filtroConciliacionActual === "conciliados") {
      movsFiltrados = movsFiltrados.filter(function (m) {
        return !!(m.conciliado_at || m.factura_proveedor_id || m.factura_cliente_id || m.factura_cliente_key || (m.tarjeta_id && m.tarjeta_id !== 0));
      });
    }
    actualizarResumenPeriodo(movsFiltrados);
    var totalPaginas = Math.max(1, Math.ceil(movsFiltrados.length / movsPorPagina));
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    var inicio = (paginaActual - 1) * movsPorPagina;
    var pagina = movsFiltrados.slice(inicio, inicio + movsPorPagina);
    if (contadorEl) contadorEl.textContent = movsFiltrados.length + " movimiento" + (movsFiltrados.length !== 1 ? "s" : "") + (movsFiltrados.length > movsPorPagina ? " · pág. " + paginaActual + "/" + totalPaginas : "");
    if (paginacionEl) {
      if (movsFiltrados.length > movsPorPagina) {
        paginacionEl.style.display = "flex";
        renderPaginacionBancos(paginacionEl, paginaActual, totalPaginas);
      } else {
        paginacionEl.style.display = "none";
      }
    }
    if (pagina.length === 0) {
      tbody.innerHTML = "<tr><td colspan=\"8\" class=\"sin-datos\">No hay movimientos con los filtros seleccionados.</td></tr>";
      return;
    }
    var mapaTraspasos = detectarTraspasos(pagina);
    tbody.innerHTML = "";
    var mesActual = null;
    pagina.forEach(function (m, idx) {
      var mesKey = mesAnioDeMovimiento(m);
      if (mesKey !== mesActual) {
        mesActual = mesKey;
        var trSep = document.createElement("tr");
        trSep.className = "separador-mes";
        trSep.innerHTML = "<td colspan=\"8\">" + labelMes(mesKey) + "</td>";
        tbody.appendChild(trSep);
      }
      var tr = document.createElement("tr");
      var fecha = (m.fecha_operacion || "").trim() || "—";
      var concepto = (m.concepto || "").trim() || "—";
      var importe = m.importe != null ? m.importe : "";
      var saldo = m.saldo != null ? m.saldo : "";
      var saldoAcum = m.saldo_acumulado != null ? m.saldo_acumulado : "";
      var bancoLabel = (m.banco || "").trim() || "—";
      if (bancoLabel.toLowerCase() === "santander") bancoLabel = "Santander";
      if (bancoLabel.toLowerCase() === "bbva") bancoLabel = "BBVA";
      var esTraspaso = !!mapaTraspasos[idx];
      if (esTraspaso) tr.classList.add("mov-traspaso");
      var esIngreso = Number(importe) > 0 && !esTraspaso;
      if (esIngreso) tr.classList.add("mov-ingreso");
      var conciliadoAt = (m.conciliado_at || "").trim();
      var facturaRuta = (m.factura_ruta || "").trim();
      // Build unified vinculación cell
      var vincParts = [];
      // Factura conciliation
      if (conciliadoAt) {
        var fLine = "<span class=\"cel-flex\">";
        fLine += "<span class=\"badge-conciliado\">Factura</span>";
        if (facturaRuta) {
          var rutaEsc = encodeURIComponent(facturaRuta);
          fLine += "<a href=\"/api/archivo?ruta=" + rutaEsc + "\" target=\"_blank\" class=\"btn-small\" title=\"Abrir factura\">Ver</a>";
        }
        fLine += "<button type=\"button\" class=\"btn-small bancos-btn-desvincular\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" title=\"Quitar vinculación\">Desvincular</button>";
        fLine += "</span>";
        vincParts.push(fLine);
      }
      // Tarjeta agrupación
      var tarjetaId = m.tarjeta_id != null ? m.tarjeta_id : "";
      var liquidacionPeriodo = (m.liquidacion_periodo || "").trim();
      var tarjetaAlias = (m.tarjeta_alias || "").trim();
      var conceptoMov = ((m.concepto || "") + "").toLowerCase();
      var esTarjetaAgrupacion = conceptoMov.indexOf("adeudo mensual de tarjeta") >= 0 || conceptoMov.indexOf("adeudo mensual tarjeta") >= 0 || conceptoMov.indexOf("liquidacion de las tarjetas") >= 0 || conceptoMov.indexOf("recibo mensual tarjeta") >= 0 || conceptoMov.indexOf("recibo tarjeta") >= 0 || conceptoMov.indexOf("liquidacion tarjeta") >= 0 || conceptoMov.indexOf("pago tarjeta") >= 0 || conceptoMov.indexOf("cargo tarjeta") >= 0;
      if (esTarjetaAgrupacion) {
        if (tarjetaId && liquidacionPeriodo) {
          // Compact: "Alias MM/YY"
          var aliasCorto = tarjetaAlias || "Tarjeta";
          var periodoCorto = liquidacionPeriodo;
          var ppMatch = liquidacionPeriodo.match(/^(\d{4})-(\d{2})$/);
          if (ppMatch) periodoCorto = ppMatch[2] + "/" + ppMatch[1].slice(2);
          vincParts.push("<span class=\"cel-flex\"><span class=\"badge-tarjeta\">Tarjeta</span><span class=\"cel-meta\">" + aliasCorto + " " + periodoCorto + "</span><button type=\"button\" class=\"btn-small bancos-btn-desvincular-extracto\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" title=\"Quitar vinculación\">Desvincular</button></span>");
        } else {
          vincParts.push("<button type=\"button\" class=\"btn-small bancos-btn-vincular-extracto\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" title=\"Vincular a extracto\">Vincular</button>");
        }
      }
      // Conciliar button if no links at all
      if (vincParts.length === 0 && !conciliadoAt) {
        var conceptoLower = ((m.concepto || "") + "").toLowerCase();
        var excluidoSugerencia = conceptoLower.indexOf("nomina") >= 0 || conceptoLower.indexOf("nómina") >= 0 || conceptoLower.indexOf("adelanto") >= 0 || conceptoLower.indexOf("liquidacion de las tarjetas") >= 0 || conceptoLower.indexOf("liquidacion tarjeta") >= 0 || conceptoLower.indexOf("adeudo mensual de tarjeta") >= 0 || conceptoLower.indexOf("adeudo mensual tarjeta") >= 0 || conceptoLower.indexOf("recibo mensual tarjeta") >= 0 || conceptoLower.indexOf("recibo tarjeta") >= 0 || conceptoLower.indexOf("pago tarjeta") >= 0 || conceptoLower.indexOf("cargo tarjeta") >= 0;
        var esTraspasoExcluido = conceptoLower.indexOf("traspaso") >= 0;
        if (!excluidoSugerencia && !esTraspasoExcluido) {
          vincParts.push("<button type=\"button\" class=\"btn-small bancos-btn-conciliar-factura\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" data-empresa-id=\"" + ((m.empresa_id || "") + "").replace(/\"/g, "&quot;") + "\" data-concepto=\"" + ((m.concepto || "") + "").replace(/\"/g, "&quot;") + "\" data-fecha=\"" + ((m.fecha_operacion || "") + "").replace(/\"/g, "&quot;") + "\" data-importe=\"" + (m.importe != null ? String(m.importe) : "").replace(/\"/g, "&quot;") + "\" title=\"Vincular a factura\">Conciliar</button>");
        }
      }
      var vincCel = vincParts.length > 0 ? vincParts.join("") : "<span style=\"color:#94A3B8\">—</span>";
      tr.innerHTML =
        "<td class=\"col-check\"><input type=\"checkbox\" class=\"bancos-check-mov\" value=\"" + (m.id != null ? m.id : "") + "\" title=\"Seleccionar\" /></td>" +
        "<td class=\"col-fecha\">" + (fecha === "—" ? "—" : fecha) + "</td>" +
        "<td class=\"col-banco\">" + bancoLabel + "</td>" +
        "<td class=\"col-concepto\" title=\"" + (m.concepto || "").replace(/\"/g, "&quot;") + "\">" + concepto + "</td>" +
        "<td class=\"numero\" style=\"color:" + (Number(importe) < 0 ? "#EF4444" : Number(importe) > 0 ? "#10B981" : "") + "\">" + formatNumero(importe) + "</td>" +
        "<td class=\"numero\">" + formatNumero(saldo) + "</td>" +
        "<td class=\"numero\">" + formatNumero(saldoAcum) + "</td>" +
        "<td class=\"col-vinculacion\">" + vincCel + "</td>";
      try {
        if (Number(importe) > 0 && tr.children.length >= 5) {
          tr.children[4].classList.add("positivo");
          tr.children[1].classList.add("ingreso-texto");
          tr.children[2].classList.add("ingreso-texto");
          tr.children[3].classList.add("ingreso-texto");
        }
      } catch (e) {}
      tbody.appendChild(tr);
    });
  }

  function cargarMovimientosBancos() {
    if (!tbody || !contadorEl) return;
    var empresaId = (filtroEmpresa && filtroEmpresa.value) || "";
    if (!empresaId) {
      tbody.innerHTML = "<tr><td colspan=\"8\" class=\"sin-datos\">Selecciona una empresa para ver los movimientos.</td></tr>";
      contadorEl.textContent = "Selecciona empresa.";
      if (resumenEl) resumenEl.style.display = "none";
      if (paginacionEl) paginacionEl.style.display = "none";
      var concBlock = document.getElementById("bancos-conciliacion-block");
      if (concBlock) concBlock.style.display = "none";
      return;
    }
    var concBlock = document.getElementById("bancos-conciliacion-block");
    if (concBlock) concBlock.style.display = "block";
    tbody.innerHTML = "<tr><td colspan=\"8\" class=\"sin-datos\">Cargando…</td></tr>";
    var params = new URLSearchParams();
    params.set("limit", "5000");
    var banco = (filtroBanco && filtroBanco.value) || "";
    var fechaDesde = (filtroFechaDesde && filtroFechaDesde.value) || "";
    var fechaHasta = (filtroFechaHasta && filtroFechaHasta.value) || "";
    if (banco) params.set("banco", banco);
    if (fechaDesde) params.set("fecha_desde", fechaDesde);
    if (fechaHasta) params.set("fecha_hasta", fechaHasta);
    var concepto = (filtroConcepto && filtroConcepto.value) || "";
    if (concepto) params.set("concepto", concepto);
    if (empresaId) params.set("empresa_id", empresaId);
    fetch("/api/bancos/movimientos?" + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        movimientosCache = data.movimientos || [];
        paginaActual = 1;
        renderMovimientosFiltrados();
      })
      .catch(function () {
        tbody.innerHTML = "<tr><td colspan=\"8\" class=\"sin-datos\">Error al cargar movimientos.</td></tr>";
        if (contadorEl) contadorEl.textContent = "0 movimientos";
        if (resumenEl) resumenEl.style.display = "none";
        if (paginacionEl) paginacionEl.style.display = "none";
      });
  }

  window.cargarMovimientosBancos = cargarMovimientosBancos;

  // UX-B.1: Toggle Todos/Cargos/Abonos
  if (toggleTipo) {
    toggleTipo.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-tipo]");
      if (!btn) return;
      filtroTipoActual = btn.getAttribute("data-tipo") || "";
      toggleTipo.querySelectorAll("button").forEach(function (b) { b.classList.remove("activo"); });
      btn.classList.add("activo");
      paginaActual = 1;
      renderMovimientosFiltrados();
    });
  }

  // Toggle Todos/Sin conciliar/Conciliados
  if (toggleConciliacion) {
    toggleConciliacion.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-concil]");
      if (!btn) return;
      filtroConciliacionActual = btn.getAttribute("data-concil") || "";
      toggleConciliacion.querySelectorAll("button").forEach(function (b) { b.classList.remove("activo"); });
      btn.classList.add("activo");
      paginaActual = 1;
      renderMovimientosFiltrados();
    });
  }

  // UX-B.7: Paginación
  // Pagination is now rendered dynamically by renderPaginacionBancos

  if (btnRefrescar) btnRefrescar.addEventListener("click", cargarMovimientosBancos);
  var checkAll = document.getElementById("bancos-check-all");
  if (checkAll) {
    checkAll.addEventListener("change", function () {
      var checked = checkAll.checked;
      tbody.querySelectorAll(".bancos-check-mov").forEach(function (cb) { cb.checked = checked; });
    });
  }
  var btnBorrarSel = document.getElementById("bancos-btn-borrar-seleccionados");
  if (btnBorrarSel) {
    btnBorrarSel.addEventListener("click", function () {
      var ids = [];
      tbody.querySelectorAll(".bancos-check-mov:checked").forEach(function (cb) {
        var v = cb.value;
        if (v !== "" && v != null) ids.push(parseInt(v, 10));
      });
      if (ids.length === 0) {
        mostrarToast("Selecciona al menos un movimiento para borrar.", "error");
        return;
      }
      if (!confirm("¿Eliminar " + ids.length + " movimiento(s) seleccionado(s)? Esta acción no se puede deshacer.")) return;
      btnBorrarSel.disabled = true;
      fetch("/api/bancos/movimientos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var n = data.eliminados != null ? data.eliminados : 0;
          mostrarToast(n ? "Eliminados " + n + " movimiento(s)." : (data.mensaje || "Hecho."), "success");
          cargarMovimientosBancos();
        })
        .catch(function () { mostrarToast("Error al eliminar.", "error"); })
        .finally(function () { btnBorrarSel.disabled = false; });
    });
  }

  // Desvincular conciliación (delegación en tbody)
  if (tbody) {
    tbody.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".bancos-btn-desvincular");
      if (!btn) return;
      var movId = btn.getAttribute("data-mov-id");
      if (!movId) return;
      if (!confirm("¿Desvincular este movimiento de la factura? La factura volverá a estado pendiente.")) return;
      btn.disabled = true;
      fetch("/api/bancos/conciliacion/desvincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimiento_id: parseInt(movId, 10) }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { mostrarToast(data.error, "error"); return; }
          cargarMovimientosBancos();
          var listEl = document.getElementById("bancos-sugerencias-list");
          if (listEl && listEl.innerHTML) document.getElementById("bancos-btn-cargar-sugerencias").click();
        })
        .catch(function () { mostrarToast("Error al desvincular.", "error"); })
        .finally(function () { btn.disabled = false; });
    });
  }

  // G.9: Vincular / Desvincular movimiento a extracto de tarjeta (delegación en tbody)
  var modalVincularExtracto = document.getElementById("modal-vincular-extracto-overlay");
  var formVincularExtracto = document.getElementById("form-vincular-extracto");
  var vincularMovId = document.getElementById("vincular-extracto-movimiento-id");
  var vincularEmpresaId = document.getElementById("vincular-extracto-empresa-id");
  var vincularTarjetaSel = document.getElementById("vincular-extracto-tarjeta");
  var vincularPeriodoInp = document.getElementById("vincular-extracto-periodo");
  var vincularStatus = document.getElementById("vincular-extracto-status");
  var btnCerrarVincularExtracto = document.getElementById("btn-cerrar-modal-vincular-extracto");

  function abrirModalVincularExtracto(movId, empresaId, movFecha, movImporte, movConcepto) {
    if (!modalVincularExtracto || !vincularMovId || !vincularEmpresaId) return;
    vincularMovId.value = movId;
    vincularEmpresaId.value = empresaId || "";
    if (vincularStatus) { vincularStatus.textContent = ""; vincularStatus.style.color = ""; }
    // UX-B.4: mostrar info del movimiento en el modal
    var infoEl = document.getElementById("vincular-extracto-mov-info");
    if (infoEl) {
      var conceptoEsc = (movConcepto || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      infoEl.innerHTML = "<strong>Movimiento:</strong> " + (movFecha || "—") + " &middot; " + (conceptoEsc || "") + " &middot; Importe: " + (movImporte != null ? formatNumero(movImporte) : "—") + " &euro;";
    }
    if (vincularTarjetaSel) {
      vincularTarjetaSel.innerHTML = "<option value=\"\">Cargando…</option>";
      vincularTarjetaSel.disabled = true;
    }
    // Extraer últimos 4 dígitos de tarjeta del concepto (ej: "5478240009522305" → "2305", "************1367" → "1367")
    var ultimos4Detectados = null;
    if (movConcepto) {
      var m16 = movConcepto.match(/\b(\d{16})\b/);
      if (m16) {
        ultimos4Detectados = m16[1].slice(-4);
      } else {
        var mMask = movConcepto.match(/[*xX]+(\d{4})\b/);
        if (mMask) ultimos4Detectados = mMask[1];
      }
    }
    // UX-B.4: preseleccionar periodo basado en la fecha del movimiento
    var periodoDefault;
    if (movFecha && typeof movFecha === "string" && movFecha.length >= 7) {
      periodoDefault = movFecha.slice(0, 7);
    } else {
      var now = new Date();
      periodoDefault = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    }
    if (vincularPeriodoInp) vincularPeriodoInp.value = periodoDefault;
    modalVincularExtracto.classList.add("visible");
    modalVincularExtracto.setAttribute("aria-hidden", "false");
    if (!empresaId || !vincularTarjetaSel) {
      if (vincularTarjetaSel) { vincularTarjetaSel.innerHTML = "<option value=\"\">Selecciona empresa en el filtro</option>"; vincularTarjetaSel.disabled = false; }
      return;
    }
    fetch("/api/empresas/" + encodeURIComponent(empresaId) + "/tarjetas?solo_activas=true")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!vincularTarjetaSel) return;
        var tarjetas = data.tarjetas || [];
        vincularTarjetaSel.innerHTML = "<option value=\"\">Selecciona tarjeta…</option>";
        tarjetas.forEach(function (t) {
          var opt = document.createElement("option");
          opt.value = t.id != null ? t.id : "";
          var u4 = (t.ultimos4 || "").trim();
          var label = (t.alias || "").trim() || (t.banco || "") + " " + (t.persona || "") || "Tarjeta " + t.id;
          if (u4) label += " (…" + u4 + ")";
          opt.textContent = label;
          opt.setAttribute("data-ultimos4", u4);
          vincularTarjetaSel.appendChild(opt);
        });
        vincularTarjetaSel.disabled = false;
        // Preseleccionar: match por últimos 4 dígitos > tarjeta única
        var matched = false;
        if (ultimos4Detectados) {
          for (var ti = 0; ti < tarjetas.length; ti++) {
            if ((tarjetas[ti].ultimos4 || "").trim() === ultimos4Detectados) {
              vincularTarjetaSel.value = String(tarjetas[ti].id);
              matched = true;
              break;
            }
          }
        }
        if (!matched && tarjetas.length === 1) {
          vincularTarjetaSel.value = String(tarjetas[0].id);
        }
      })
      .catch(function () {
        if (vincularTarjetaSel) {
          vincularTarjetaSel.innerHTML = "<option value=\"\">Error al cargar tarjetas</option>";
          vincularTarjetaSel.disabled = false;
        }
      });
  }

  function cerrarModalVincularExtracto() {
    if (!modalVincularExtracto) return;
    modalVincularExtracto.classList.remove("visible");
    modalVincularExtracto.setAttribute("aria-hidden", "true");
  }

  // Modal Conciliar factura
  var modalConciliarFactura = document.getElementById("modal-conciliar-factura-overlay");
  var conciliarFacturaMovInfo = document.getElementById("conciliar-factura-mov-info");
  var conciliarFacturaBuscar = document.getElementById("conciliar-factura-buscar");
  var tbodyConciliarFacturas = document.getElementById("tbody-conciliar-facturas");
  var conciliarFacturaSinDatos = document.getElementById("conciliar-factura-sin-datos");
  var btnCerrarConciliarFactura = document.getElementById("btn-cerrar-modal-conciliar-factura");
  var conciliarFacturaMovId = null;
  var conciliarFacturaEmpresaId = "";
  var conciliarFacturaEsEntrada = false;
  var conciliarFacturaLista = [];

  function formatNumeroConciliar(n) {
    if (n == null || n === "") return "—";
    var x = typeof n === "number" ? n : parseFloat(String(n).replace(",", "."));
    if (isNaN(x)) return "—";
    var abs = Math.abs(x);
    var base = abs.toFixed(2);
    var partes = base.split(".");
    var entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return entero + "," + (partes[1] || "00");
  }

  function renderConciliarFacturasLista(facturas) {
    if (!tbodyConciliarFacturas) return;
    tbodyConciliarFacturas.innerHTML = "";
    if (!facturas || facturas.length === 0) {
      if (conciliarFacturaSinDatos) conciliarFacturaSinDatos.style.display = "block";
      return;
    }
    if (conciliarFacturaSinDatos) conciliarFacturaSinDatos.style.display = "none";
    var esClientes = conciliarFacturaEsEntrada;
    facturas.forEach(function (f) {
      var tr = document.createElement("tr");
      var fecha = (f.fecha_factura || "").toString().trim() || "—";
      var numero = (f.numero_factura || "").toString().trim() || "—";
      var total = f.total_a_pagar != null ? f.total_a_pagar : (f.total_factura != null ? f.total_factura : f.total);
      if (esClientes) {
        var cliente = (f.cliente || "").toString().trim() || "—";
        var concepto = (f.proyecto || f.tipologia || "").toString().trim() || "—";
        var numEsc = (numero + "").replace(/"/g, "&quot;");
        var fechaEsc = (fecha + "").replace(/"/g, "&quot;");
        var clienteEsc = (cliente + "").replace(/"/g, "&quot;");
        var estadoCobro = (f.estado_cobro || "pendiente").toString().trim().toLowerCase();
        var estadoCel = estadoCobro === "cobrada" ? "Cobrada" : estadoCobro === "parcial" ? "Parcial" : "Pendiente";
        tr.innerHTML = "<td class=\"col-fecha\">" + fecha + "</td><td>" + cliente.replace(/</g, "&lt;") + "</td><td title=\"" + (concepto.replace(/"/g, "&quot;")) + "\">" + (concepto.length > 40 ? concepto.slice(0, 40) + "…" : concepto).replace(/</g, "&lt;") + "</td><td>" + numero.replace(/</g, "&lt;") + "</td><td class=\"numero\">" + formatNumeroConciliar(total) + "</td><td>" + estadoCel + "</td><td class=\"col-acciones\"><button type=\"button\" class=\"btn-small bancos-btn-vincular-factura-conciliar\" data-factura-cliente-id=\"" + (f.id != null ? f.id : "") + "\" data-numero-factura=\"" + numEsc + "\" data-fecha-factura=\"" + fechaEsc + "\" data-cliente=\"" + clienteEsc + "\">Vincular</button></td>";
      } else {
        var proveedor = (f.proveedor || "").toString().trim() || "—";
        var concepto = (f.resumen_concepto || "").toString().trim() || "—";
        var estado = ((f.estado_pago || "").toString().trim() || "pendiente").toLowerCase();
        tr.innerHTML = "<td class=\"col-fecha\">" + fecha + "</td><td>" + proveedor.replace(/</g, "&lt;") + "</td><td title=\"" + (concepto.replace(/"/g, "&quot;")) + "\">" + (concepto.length > 40 ? concepto.slice(0, 40) + "…" : concepto).replace(/</g, "&lt;") + "</td><td>" + numero.replace(/</g, "&lt;") + "</td><td class=\"numero\">" + formatNumeroConciliar(total) + "</td><td>" + (estado === "parcial" ? "Parcial" : "Pendiente") + "</td><td class=\"col-acciones\"><button type=\"button\" class=\"btn-small bancos-btn-vincular-factura-conciliar\" data-factura-id=\"" + (f.id != null ? f.id : "") + "\">Vincular</button></td>";
      }
      tbodyConciliarFacturas.appendChild(tr);
    });
  }

  function filtrarConciliarFacturas() {
    var q = (conciliarFacturaBuscar && conciliarFacturaBuscar.value || "").toLowerCase().trim();
    var list;
    if (conciliarFacturaEsEntrada) {
      list = !q ? conciliarFacturaLista : conciliarFacturaLista.filter(function (f) {
        var cli = (f.cliente || "").toLowerCase();
        var num = (f.numero_factura || "").toLowerCase();
        var proy = (f.proyecto || "").toLowerCase();
        var tip = (f.tipologia || "").toLowerCase();
        return cli.indexOf(q) >= 0 || num.indexOf(q) >= 0 || proy.indexOf(q) >= 0 || tip.indexOf(q) >= 0;
      });
    } else {
      list = !q ? conciliarFacturaLista : conciliarFacturaLista.filter(function (f) {
        var prov = (f.proveedor || "").toLowerCase();
        var conc = (f.resumen_concepto || "").toLowerCase();
        var num = (f.numero_factura || "").toLowerCase();
        return prov.indexOf(q) >= 0 || conc.indexOf(q) >= 0 || num.indexOf(q) >= 0;
      });
    }
    renderConciliarFacturasLista(list);
  }

  window.abrirModalConciliarFactura = function (movId, empresaId, concepto, fecha, importe) {
    conciliarFacturaMovId = movId;
    conciliarFacturaEmpresaId = empresaId || "";
    conciliarFacturaEsEntrada = Number(importe) > 0;
    if (conciliarFacturaMovInfo) conciliarFacturaMovInfo.innerHTML = "<strong>Movimiento:</strong> " + (fecha || "—") + " · " + (concepto || "—").replace(/</g, "&lt;") + " · Importe: " + formatNumeroConciliar(importe) + " · Empresa: " + (empresaId || "—").replace(/</g, "&lt;");
    if (conciliarFacturaBuscar) {
      conciliarFacturaBuscar.value = "";
      conciliarFacturaBuscar.placeholder = conciliarFacturaEsEntrada ? "Escriba para filtrar (cliente, número, proyecto)…" : "Escriba para filtrar…";
    }
    var thead = document.querySelector("#tabla-conciliar-facturas thead tr");
    if (thead && thead.children.length >= 6) {
      thead.children[1].textContent = conciliarFacturaEsEntrada ? "Cliente" : "Proveedor";
      thead.children[5].textContent = conciliarFacturaEsEntrada ? "Cobro" : "Estado";
    }
    var subtitulo = document.querySelector(".modal-conciliar-factura .subtitle");
    if (subtitulo) subtitulo.textContent = conciliarFacturaEsEntrada ? "Vincular esta entrada de caja a una factura emitida a cliente." : "Vincular este movimiento a una factura pendiente o parcial de pago.";
    if (conciliarFacturaSinDatos) {
      conciliarFacturaSinDatos.style.display = "none";
      conciliarFacturaSinDatos.textContent = conciliarFacturaEsEntrada ? "No hay facturas de clientes pendientes de vincular." : "No hay facturas pendientes o parciales para esta empresa.";
    }
    if (tbodyConciliarFacturas) tbodyConciliarFacturas.innerHTML = "<tr><td colspan=\"7\" class=\"sin-datos\">Cargando facturas…</td></tr>";
    if (modalConciliarFactura) { modalConciliarFactura.classList.add("visible"); modalConciliarFactura.setAttribute("aria-hidden", "false"); }
    if (conciliarFacturaEsEntrada) {
      fetch("/api/facturas_clientes?empresa_id=" + encodeURIComponent(empresaId) + "&solo_pendientes_vinculacion=1").then(function (r) { return r.json(); }).then(function (data) {
        conciliarFacturaLista = data.facturas || [];
        renderConciliarFacturasLista(conciliarFacturaLista);
      }).catch(function () {
        conciliarFacturaLista = [];
        if (tbodyConciliarFacturas) tbodyConciliarFacturas.innerHTML = "<tr><td colspan=\"7\" class=\"sin-datos\">Error al cargar facturas de clientes.</td></tr>";
      });
    } else {
      fetch("/api/facturas?empresa_id=" + encodeURIComponent(empresaId)).then(function (r) { return r.json(); }).then(function (data) {
        var todas = data.facturas || [];
        conciliarFacturaLista = todas.filter(function (f) { var ep = (f.estado_pago || "").toString().trim().toLowerCase(); return ep === "pendiente" || ep === "parcial"; });
        renderConciliarFacturasLista(conciliarFacturaLista);
      }).catch(function () {
        conciliarFacturaLista = [];
        if (tbodyConciliarFacturas) tbodyConciliarFacturas.innerHTML = "<tr><td colspan=\"7\" class=\"sin-datos\">Error al cargar facturas.</td></tr>";
      });
    }
  };

  function cerrarModalConciliarFactura() {
    if (modalConciliarFactura) { modalConciliarFactura.classList.remove("visible"); modalConciliarFactura.setAttribute("aria-hidden", "true"); }
    conciliarFacturaMovId = null;
    conciliarFacturaLista = [];
  }

  if (conciliarFacturaBuscar) { conciliarFacturaBuscar.addEventListener("input", filtrarConciliarFacturas); }
  if (btnCerrarConciliarFactura) btnCerrarConciliarFactura.addEventListener("click", cerrarModalConciliarFactura);
  if (tbodyConciliarFacturas) {
    tbodyConciliarFacturas.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".bancos-btn-vincular-factura-conciliar");
      if (!btn || !conciliarFacturaMovId) return;
      var esEntrada = conciliarFacturaEsEntrada;
      var numeroFactura = btn.getAttribute("data-numero-factura");
      var fechaFactura = btn.getAttribute("data-fecha-factura");
      var cliente = btn.getAttribute("data-cliente");
      var facId = btn.getAttribute("data-factura-id");
      if (esEntrada) {
        var facturaClienteId = btn.getAttribute("data-factura-cliente-id");
        if (!facturaClienteId && !numeroFactura && !fechaFactura && !cliente) return;
        btn.disabled = true;
        var bodyData = {
          movimiento_id: parseInt(conciliarFacturaMovId, 10),
          empresa_id: conciliarFacturaEmpresaId,
          numero_factura: numeroFactura || "",
          fecha_factura: fechaFactura || "",
          cliente: cliente || "",
        };
        if (facturaClienteId) bodyData.factura_cliente_id = parseInt(facturaClienteId, 10);
        fetch("/api/bancos/conciliacion/confirmar-cliente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyData),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) { mostrarToast(data.error, "error"); btn.disabled = false; return; }
            cerrarModalConciliarFactura();
            cargarMovimientosBancos();
            mostrarToast(data.mensaje || "Entrada vinculada a factura de cliente.", "success");
          })
          .catch(function () { mostrarToast("Error al vincular.", "error"); btn.disabled = false; });
      } else {
        if (!facId) return;
        btn.disabled = true;
        fetch("/api/bancos/conciliacion/confirmar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ movimiento_id: parseInt(conciliarFacturaMovId, 10), factura_proveedor_id: parseInt(facId, 10) }) })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) { mostrarToast(data.error, "error"); btn.disabled = false; return; }
            cerrarModalConciliarFactura();
            cargarMovimientosBancos();
            var listEl = document.getElementById("bancos-sugerencias-list");
            if (listEl && listEl.innerHTML) document.getElementById("bancos-btn-cargar-sugerencias").click();
            mostrarToast(data.mensaje || "Conciliación registrada.", "success");
          })
          .catch(function () { mostrarToast("Error al vincular.", "error"); btn.disabled = false; });
      }
    });
  }

  if (tbody) {
    tbody.addEventListener("click", function (e) {
      var btnVincular = e.target && e.target.closest && e.target.closest(".bancos-btn-vincular-extracto");
      if (btnVincular) {
        var movId = btnVincular.getAttribute("data-mov-id");
        var empresaId = (filtroEmpresa && filtroEmpresa.value) || "";
        if (!movId) return;
        if (!empresaId) {
          mostrarToast("Selecciona una empresa en el filtro de movimientos.", "error");
          return;
        }
        // UX-B.4: buscar fecha e importe del movimiento en cache para preselección
        var movData = null;
        if (typeof movimientosCache !== "undefined") {
          for (var mi = 0; mi < movimientosCache.length; mi++) {
            if (String(movimientosCache[mi].id) === String(movId)) { movData = movimientosCache[mi]; break; }
          }
        }
        var mFecha = movData ? (movData.fecha_operacion || "") : "";
        var mImporte = movData ? movData.importe : null;
        var mConcepto = movData ? (movData.concepto || "") : "";
        abrirModalVincularExtracto(movId, empresaId, mFecha, mImporte, mConcepto);
        return;
      }
      var btnConciliarFactura = e.target && e.target.closest && e.target.closest(".bancos-btn-conciliar-factura");
      if (btnConciliarFactura) {
        var movId = btnConciliarFactura.getAttribute("data-mov-id");
        var empresaId = btnConciliarFactura.getAttribute("data-empresa-id") || (filtroEmpresa && filtroEmpresa.value) || "";
        var concepto = btnConciliarFactura.getAttribute("data-concepto") || "";
        var fecha = btnConciliarFactura.getAttribute("data-fecha") || "";
        var importe = btnConciliarFactura.getAttribute("data-importe") || "";
        if (!movId || !empresaId) {
          mostrarToast("Faltan datos del movimiento o empresa.", "error");
          return;
        }
        // Si el concepto indica movimiento de tarjeta, redirigir al modal de vincular extracto
        var cLow = concepto.toLowerCase();
        if (cLow.indexOf("recibo mensual tarjeta") >= 0 || cLow.indexOf("recibo tarjeta") >= 0 || cLow.indexOf("adeudo mensual de tarjeta") >= 0 || cLow.indexOf("adeudo mensual tarjeta") >= 0 || cLow.indexOf("liquidacion de las tarjetas") >= 0 || cLow.indexOf("liquidacion tarjeta") >= 0 || cLow.indexOf("pago tarjeta") >= 0 || cLow.indexOf("cargo tarjeta") >= 0) {
          abrirModalVincularExtracto(movId, empresaId, fecha, Number(importe) || null, concepto);
          return;
        }
        if (typeof window.abrirModalConciliarFactura === "function") {
          window.abrirModalConciliarFactura(movId, empresaId, concepto, fecha, importe);
        }
        return;
      }
      var btnDesvincularExt = e.target && e.target.closest && e.target.closest(".bancos-btn-desvincular-extracto");
      if (btnDesvincularExt) {
        var movId = btnDesvincularExt.getAttribute("data-mov-id");
        var empresaId = (filtroEmpresa && filtroEmpresa.value) || "";
        if (!movId || !empresaId) return;
        if (!confirm("¿Desvincular este movimiento del extracto de tarjeta?")) return;
        btnDesvincularExt.disabled = true;
        fetch("/api/bancos/tarjetas/desvincular-movimiento", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ empresa_id: empresaId, movimiento_id: parseInt(movId, 10) }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) { mostrarToast(data.error, "error"); return; }
            cargarMovimientosBancos();
            if (typeof window.cargarLiquidacionesTarjetas === "function") window.cargarLiquidacionesTarjetas();
          })
          .catch(function () { mostrarToast("Error al desvincular.", "error"); })
          .finally(function () { btnDesvincularExt.disabled = false; });
        return;
      }
    });
  }

  if (formVincularExtracto) {
    formVincularExtracto.addEventListener("submit", function (e) {
      e.preventDefault();
      var movId = (vincularMovId && vincularMovId.value) || "";
      var empresaId = (vincularEmpresaId && vincularEmpresaId.value) || "";
      var tarjetaId = (vincularTarjetaSel && vincularTarjetaSel.value) || "";
      var periodo = (vincularPeriodoInp && vincularPeriodoInp.value) || "";
      if (!movId || !empresaId || !tarjetaId || !periodo) {
        if (vincularStatus) { vincularStatus.textContent = "Completa tarjeta y periodo."; vincularStatus.style.color = "#b91c1c"; }
        return;
      }
      if (vincularStatus) { vincularStatus.textContent = "Vinculando…"; vincularStatus.style.color = ""; }
      var btnConfirmar = document.getElementById("btn-vincular-extracto-confirmar");
      if (btnConfirmar) btnConfirmar.disabled = true;
      fetch("/api/bancos/tarjetas/conciliar-movimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          movimiento_id: parseInt(movId, 10),
          tarjeta_id: parseInt(tarjetaId, 10),
          periodo: periodo,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) {
            if (vincularStatus) { vincularStatus.textContent = data.error; vincularStatus.style.color = "#b91c1c"; }
            return;
          }
          cerrarModalVincularExtracto();
          cargarMovimientosBancos();
          if (typeof window.cargarLiquidacionesTarjetas === "function") window.cargarLiquidacionesTarjetas();
          mostrarToast("Movimiento vinculado correctamente.", "success");
        })
        .catch(function () {
          if (vincularStatus) { vincularStatus.textContent = "Error de conexión."; vincularStatus.style.color = "#b91c1c"; }
        })
        .finally(function () {
          if (btnConfirmar) btnConfirmar.disabled = false;
        });
    });
  }
  if (btnCerrarVincularExtracto) btnCerrarVincularExtracto.addEventListener("click", cerrarModalVincularExtracto);
  if (modalVincularExtracto) {
    modalVincularExtracto.addEventListener("click", function (e) {
      if (e.target === modalVincularExtracto) cerrarModalVincularExtracto();
    });
  }

  // Cargar sugerencias de conciliación
  var btnCargarSug = document.getElementById("bancos-btn-cargar-sugerencias");
  var btnActualizarSug = document.getElementById("bancos-btn-actualizar-sugerencias");
  var sugerenciasList = document.getElementById("bancos-sugerencias-list");
  function cargarSugerenciasConciliacion() {
    if (!btnCargarSug || !sugerenciasList) return;
    btnCargarSug.click();
  }
  if (btnActualizarSug) {
    btnActualizarSug.addEventListener("click", function () {
      cargarSugerenciasConciliacion();
    });
  }
  if (btnCargarSug && sugerenciasList) {
    var paginaSugerenciasActual = 1;
    function cargarSugerenciasPagina(pagina) {
      var empresaId = (filtroEmpresa && filtroEmpresa.value) || "";
      if (!empresaId) {
        mostrarToast("Selecciona una empresa.", "error");
        return;
      }
      var params = new URLSearchParams();
      params.set("empresa_id", empresaId);
      params.set("page", String(pagina));
      params.set("per_page", "10");
      var umbralInput = document.getElementById("bancos-umbral-sugerencias");
      if (umbralInput && umbralInput.value) params.set("umbral", umbralInput.value);
      if (filtroFechaDesde && filtroFechaDesde.value) params.set("fecha_desde", filtroFechaDesde.value);
      if (filtroFechaHasta && filtroFechaHasta.value) params.set("fecha_hasta", filtroFechaHasta.value);
      btnCargarSug.disabled = true;
      sugerenciasList.innerHTML = "<p class=\"sin-datos\">Cargando…</p>";
      fetch("/api/bancos/conciliacion/sugerencias?" + params.toString())
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var sugs = data.sugerencias || [];
          var nMov = data.movimientos_sin_conciliar != null ? data.movimientos_sin_conciliar : 0;
          var nFac = data.facturas_pendientes != null ? data.facturas_pendientes : 0;
          var totalSug = data.total_sugerencias != null ? data.total_sugerencias : sugs.length;
          var pagActual = data.pagina_actual != null ? data.pagina_actual : 1;
          var totalPag = data.total_paginas != null ? data.total_paginas : 1;
          paginaSugerenciasActual = pagActual;
          if (sugs.length === 0 && totalSug === 0) {
            sugerenciasList.innerHTML = "<p class=\"sin-datos\">No hay sugerencias (movimientos sin conciliar: " + nMov + ", facturas pendientes: " + nFac + ").</p>";
            return;
          }
          var html = "<p class=\"sugerencias-resumen\">" + totalSug + " sugerencia(s) en total. Mostrando página " + pagActual + " de " + (totalPag || 1) + " (máx. 10 por página). Mov. sin conciliar: " + nMov + ", facturas pendientes: " + nFac + ".</p>";
          html += "<table class=\"tabla-sugerencias\"><thead><tr><th class=\"col-fecha\">F. movimiento</th><th class=\"col-concepto\">Concepto movimiento</th><th class=\"col-fecha\">F. factura</th><th class=\"col-concepto\">Concepto factura</th><th class=\"col-similitud\">Similitud</th><th class=\"col-importe\">Importe / Total</th><th class=\"col-acciones\"></th></tr></thead><tbody>";
          sugs.forEach(function (s) {
            var conceptoEsc = (s.movimiento_concepto || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
            var conceptoFac = (s.factura_resumen_concepto != null && String(s.factura_resumen_concepto).trim() !== "")
              ? (s.factura_proveedor ? s.factura_proveedor + " – " : "") + (s.factura_resumen_concepto || "")
              : (s.factura_proveedor || "—") + " " + (s.factura_numero || "—");
            conceptoFac = conceptoFac.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
            var simStr = (s.similitud_texto != null) ? (Math.round(s.similitud_texto * 100) + "%") : "—";
            html += "<tr>";
            html += "<td class=\"sug-fecha\">" + (s.movimiento_fecha || "—") + "</td>";
            html += "<td class=\"col-mov-concepto\">" + conceptoEsc + "</td>";
            html += "<td class=\"sug-fecha\">" + (s.factura_fecha || "—") + "</td>";
            html += "<td class=\"col-fac-concepto\">" + conceptoFac + "</td>";
            html += "<td class=\"col-similitud\" title=\"Similitud entre concepto del movimiento y concepto de la factura\">" + simStr + "</td>";
            html += "<td class=\"col-importe\">" + formatNumero(s.movimiento_importe) + " / " + formatNumero(s.factura_total) + (s.es_parcial && s.factura_remaining != null ? " <span class=\"sug-pago-parcial\" title=\"Pago parcial\">(falta " + formatNumero(s.factura_remaining) + ")</span>" : "") + (s.diferencia != null && s.diferencia > 0 ? " (&Delta; " + formatNumero(s.diferencia) + ")" : "") + "</td>";
            html += "<td class=\"sug-acciones\">";
            if (s.factura_ruta) {
              var rutaEsc = encodeURIComponent(s.factura_ruta);
              html += "<a href=\"/api/archivo?ruta=" + rutaEsc + "\" target=\"_blank\" class=\"btn-link-small\" title=\"Ver factura\">Ver factura</a> ";
            }
            html += "<button type=\"button\" class=\"btn-conciliar-small bancos-btn-conciliar\" data-mov-id=\"" + (s.movimiento_id || "") + "\" data-factura-id=\"" + (s.factura_id || "") + "\">Conciliar</button></td></tr>";
          });
          html += "</tbody></table>";
          if (totalSug > 0) {
            html += "<div class=\"paginacion-sugerencias\">";
            html += "<button type=\"button\" class=\"btn-pag-sug btn-pag-ant\" " + (pagActual <= 1 ? "disabled" : "") + " data-pagina=\"" + (pagActual - 1) + "\">Anterior</button>";
            html += "<span class=\"texto-pagina-sug\">Página " + pagActual + " de " + (totalPag || 1) + "</span>";
            html += "<button type=\"button\" class=\"btn-pag-sug btn-pag-sig\" " + (pagActual >= (totalPag || 1) ? "disabled" : "") + " data-pagina=\"" + (pagActual + 1) + "\">Siguiente</button>";
            html += "</div>";
          }
          sugerenciasList.innerHTML = html;
          sugerenciasList.querySelectorAll(".bancos-btn-conciliar").forEach(function (btn) {
            btn.addEventListener("click", function () {
              var movId = parseInt(btn.getAttribute("data-mov-id"), 10);
              var facId = parseInt(btn.getAttribute("data-factura-id"), 10);
              if (!movId || !facId) return;
              if (!confirm("¿Vincular este movimiento con la factura y marcar la factura como pagada?")) return;
              btn.disabled = true;
              fetch("/api/bancos/conciliacion/confirmar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ movimiento_id: movId, factura_proveedor_id: facId }),
              })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                  if (data.error) { mostrarToast(data.error, "error"); return; }
                  cargarMovimientosBancos();
                  cargarSugerenciasPagina(paginaSugerenciasActual);
                })
                .catch(function () { mostrarToast("Error al conciliar.", "error"); })
                .finally(function () { btn.disabled = false; });
            });
          });
          sugerenciasList.querySelectorAll(".btn-pag-sug").forEach(function (btn) {
            if (btn.disabled) return;
            btn.addEventListener("click", function () {
              var p = parseInt(btn.getAttribute("data-pagina"), 10);
              if (p >= 1 && p <= totalPag) cargarSugerenciasPagina(p);
            });
          });
        })
        .catch(function () {
          sugerenciasList.innerHTML = "<p class=\"sin-datos\">Error al cargar sugerencias.</p>";
        })
        .finally(function () { btnCargarSug.disabled = false; });
    }
    btnCargarSug.addEventListener("click", function () {
      cargarSugerenciasPagina(1);
    });
  }
  var btnExportar = document.getElementById("bancos-btn-exportar");
  if (btnExportar) {
    btnExportar.addEventListener("click", function () {
      var empresaId = (filtroEmpresa && filtroEmpresa.value) || "";
      if (!empresaId) {
        mostrarToast("Elige una empresa para exportar los movimientos.", "error");
        return;
      }
      var params = new URLSearchParams();
      var banco = (filtroBanco && filtroBanco.value) || "";
      var fechaDesde = (filtroFechaDesde && filtroFechaDesde.value) || "";
      var fechaHasta = (filtroFechaHasta && filtroFechaHasta.value) || "";
      var empresaId = (filtroEmpresa && filtroEmpresa.value) || "";
      if (banco) params.set("banco", banco);
      if (fechaDesde) params.set("fecha_desde", fechaDesde);
      if (fechaHasta) params.set("fecha_hasta", fechaHasta);
      var concepto = (filtroConcepto && filtroConcepto.value) || "";
      if (concepto) params.set("concepto", concepto);
      if (empresaId) params.set("empresa_id", empresaId);
      var url = "/api/bancos/movimientos_export";
      var qs = params.toString();
      if (qs) url += "?" + qs;
      window.open(url, "_blank");
    });
  }
  var btnEliminarSoloFecha = document.getElementById("bancos-btn-eliminar-solo-fecha");
  if (btnEliminarSoloFecha) {
    btnEliminarSoloFecha.addEventListener("click", function () {
      if (!confirm("¿Eliminar de la base de datos todos los movimientos que solo tienen fecha (concepto vacío e importe 0)? La acción no se puede deshacer.")) return;
      btnEliminarSoloFecha.disabled = true;
      fetch("/api/bancos/movimientos/solo-fecha", { method: "DELETE" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var n = data.eliminados != null ? data.eliminados : 0;
          mostrarToast(n ? "Eliminados " + n + " movimiento(s) que solo tenían fecha." : (data.mensaje || "No había movimientos que eliminar."), "success");
          cargarMovimientosBancos();
        })
        .catch(function () { mostrarToast("Error al eliminar.", "error"); })
        .finally(function () { btnEliminarSoloFecha.disabled = false; });
    });
  }
  if (filtroBanco) filtroBanco.addEventListener("change", cargarMovimientosBancos);
  if (filtroFechaDesde) filtroFechaDesde.addEventListener("change", cargarMovimientosBancos);
  if (filtroFechaHasta) filtroFechaHasta.addEventListener("change", cargarMovimientosBancos);
  if (filtroEmpresa) filtroEmpresa.addEventListener("change", cargarMovimientosBancos);

  // Tabs Bancos: Movimientos / Tarjetas
  var tabMov = document.getElementById("bancos-tab-movimientos");
  var tabTar = document.getElementById("bancos-tab-tarjetas");
  var secMov = document.getElementById("bancos-seccion-movimientos");
  var secTar = document.getElementById("bancos-seccion-tarjetas");
  function activarTabBancos(nombre) {
    var esMov = nombre === "mov";
    if (tabMov) tabMov.classList.toggle("activo", esMov);
    if (tabTar) tabTar.classList.toggle("activo", !esMov);
    if (secMov) secMov.style.display = esMov ? "" : "none";
    if (secTar) secTar.style.display = esMov ? "none" : "";
    var bc = document.getElementById("bancos-breadcrumb");
    if (bc) bc.innerHTML = "Finanzas &rsaquo; Bancos &rsaquo; " + (esMov ? "Movimientos" : "Tarjetas");
    // Al cambiar de pestaña, asegúrate de que el usuario ve el bloque desde arriba
    var panelBancos = document.getElementById("panel-bancos-inicio");
    if (panelBancos && panelBancos.scrollIntoView) {
      panelBancos.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (window && window.scrollTo) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  if (tabMov) {
    tabMov.addEventListener("click", function () { activarTabBancos("mov"); });
  }
  if (tabTar) {
    tabTar.addEventListener("click", function () { activarTabBancos("tarjetas"); cargarTarjetasBancos(); });
  }
  // Estado inicial: pestaña Movimientos activa
  activarTabBancos("mov");

  // Tarjetas: maestro por empresa
  var tarjetasEmpresaSel = document.getElementById("bancos-tarjetas-empresa");
  var tbodyTarjetas = document.getElementById("tbody-tarjetas-bancos");
  var formTarjeta = document.getElementById("form-tarjetas-bancos");
  var statusTarjeta = document.getElementById("tarjetas-status");
  var tbodyLiquidaciones = document.getElementById("tbody-tarjetas-liquidaciones");
  var filtroExtractosTarjeta = document.getElementById("extractos-filtro-tarjeta");
  var filtroExtractosMes = document.getElementById("extractos-filtro-mes");
  var filtroExtractosAnio = document.getElementById("extractos-filtro-anio");
  var liquidacionesCache = [];
  var modalTarjetaOverlay = document.getElementById("modal-tarjeta-overlay");
  btnAbrirModalTarjeta = document.getElementById("btn-abrir-modal-tarjeta");
  btnCerrarModalTarjeta = document.getElementById("btn-cerrar-modal-tarjeta");

  function poblarSelectEmpresasEnTarjetas() {
    // Los selects con clase .select-empresa (incluido bancos-tarjetas-empresa)
    // se rellenan ya al inicio con rellenarSelectsEmpresa(); aquí no duplicamos nada.
    return;
  }

  var tarjetasListaCache = []; // cache for edit handler

  function renderTarjetas(tarjetas) {
    if (!tbodyTarjetas) return;
    tarjetasListaCache = tarjetas || [];
    var countBadge = document.getElementById("tarjetas-config-count");
    if (countBadge) countBadge.textContent = tarjetas ? String(tarjetas.length) : "";
    if (!tarjetas || tarjetas.length === 0) {
      tbodyTarjetas.innerHTML = "<tr><td colspan=\"6\" class=\"sin-datos\">No hay tarjetas para esta empresa.</td></tr>";
      if (countBadge) countBadge.textContent = "";
      return;
    }
    var html = "";
    tarjetas.forEach(function (t) {
      var estado = t.activa ? "Activa" : "Inactiva";
      var badge = "<span class=\"" + (t.activa ? "badge-activa" : "badge-inactiva") + "\">" + estado + "</span>";
      var tarjetaLabel = (t.ultimos4 || "") ? "···· " + t.ultimos4 : "";
      html += "<tr>";
      html += "<td>" + (t.banco || "—") + "</td>";
      html += "<td>" + (t.persona || "—") + "</td>";
      html += "<td>" + (tarjetaLabel || "—") + "</td>";
      html += "<td>" + (t.alias || "—") + "</td>";
      html += "<td>" + badge + "</td>";
      html += "<td>";
      html += "<button type=\"button\" class=\"btn-small bancos-btn-tarjeta-editar\" data-id=\"" + t.id + "\">Editar</button> ";
      html += "<button type=\"button\" class=\"btn-small bancos-btn-tarjeta-toggle\" data-id=\"" + t.id + "\" data-activa=\"" + (t.activa ? "1" : "0") + "\">" + (t.activa ? "Desactivar" : "Activar") + "</button>";
      html += "</td>";
      html += "</tr>";
    });
    tbodyTarjetas.innerHTML = html;
    // Edit button handlers
    tbodyTarjetas.querySelectorAll(".bancos-btn-tarjeta-editar").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = parseInt(btn.getAttribute("data-id"), 10);
        var tarjeta = tarjetasListaCache.find(function (t) { return t.id === id; });
        if (tarjeta) abrirModalTarjeta(tarjeta);
      });
    });
    tbodyTarjetas.querySelectorAll(".bancos-btn-tarjeta-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = parseInt(btn.getAttribute("data-id"), 10);
        if (!id) return;
        var empresaId = (tarjetasEmpresaSel && tarjetasEmpresaSel.value) || "";
        if (!empresaId) {
          mostrarToast("Selecciona una empresa.", "error");
          return;
        }
        var activaActual = btn.getAttribute("data-activa") === "1";
        var nuevoEstado = !activaActual;
        btn.disabled = true;
        fetch("/api/tarjetas/" + id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ empresa_id: empresaId, activa: nuevoEstado }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) { mostrarToast(data.error, "error"); return; }
            cargarTarjetasBancos();
          })
          .catch(function () { mostrarToast("Error al actualizar la tarjeta.", "error"); })
          .finally(function () { btn.disabled = false; });
      });
    });
  }

  function renderLiquidaciones(liqs) {
    if (!tbodyLiquidaciones) return;
    var empresaId = (tarjetasEmpresaSel && tarjetasEmpresaSel.value) || "";
    if (!liqs || liqs.length === 0) {
      tbodyLiquidaciones.innerHTML = "<tr><td colspan=\"8\" class=\"sin-datos\">No hay extractos generados para las facturas pagadas con tarjeta.</td></tr>";
      if (filtroExtractosTarjeta) filtroExtractosTarjeta.innerHTML = "<option value=\"\">Todas</option>";
      return;
    }
    var filtroTarjeta = (filtroExtractosTarjeta && filtroExtractosTarjeta.value) || "";
    var filtroMes = (filtroExtractosMes && filtroExtractosMes.value) || "";
    var filtroAnio = (filtroExtractosAnio && filtroExtractosAnio.value) || "";
    var filtradas = liqs.filter(function (l) {
      if (filtroTarjeta && String(l.tarjeta_id) !== filtroTarjeta) return false;
      var per = (l.periodo || "");
      if (filtroAnio && !per.startsWith(filtroAnio)) return false;
      if (filtroMes && per.length >= 7 && per.slice(5, 7) !== filtroMes) return false;
      return true;
    });
    if (filtradas.length === 0) {
      tbodyLiquidaciones.innerHTML = "<tr><td colspan=\"8\" class=\"sin-datos\">No hay extractos con los filtros seleccionados.</td></tr>";
      return;
    }
    var tarjetasUnicas = [];
    var seen = {};
    liqs.forEach(function (l) {
      var id = l.tarjeta_id;
      if (id != null && !seen[id]) {
        seen[id] = true;
        var label = (l.tarjeta_banco || "Banco") + " – " + (l.tarjeta_persona || "Titular");
        if ((l.tarjeta_alias || "").trim()) label += " (" + l.tarjeta_alias.trim() + ")";
        tarjetasUnicas.push({ id: id, label: label });
      }
    });
    if (filtroExtractosTarjeta) {
      var valorActual = filtroExtractosTarjeta.value;
      filtroExtractosTarjeta.innerHTML = "<option value=\"\">Todas</option>";
      tarjetasUnicas.forEach(function (t) {
        var opt = document.createElement("option");
        opt.value = String(t.id);
        opt.textContent = t.label;
        filtroExtractosTarjeta.appendChild(opt);
      });
      if (valorActual) filtroExtractosTarjeta.value = valorActual;
    }
    var html = "";
    filtradas.forEach(function (l) {
      // Compact tarjeta label: show alias if available, else "Banco – Persona"
      var tarjetaAlias = (l.tarjeta_alias || "").trim();
      var tarjetaLabel = tarjetaAlias || ((l.tarjeta_banco || "Banco") + " – " + (l.tarjeta_persona || "Titular"));
      var estado = (l.estado || "pendiente");
      var totalMov = l.total_movimiento != null ? l.total_movimiento : 0;
      var pendiente = l.pendiente_facturas != null ? l.pendiente_facturas : (l.total_facturas || 0) + totalMov;
      var tid = l.tarjeta_id != null ? l.tarjeta_id : "";
      var per = (l.periodo || "").trim();
      var baseUrl = "/api/empresas/" + encodeURIComponent(empresaId) + "/tarjetas/extracto-export?tarjeta_id=" + encodeURIComponent(tid) + "&periodo=" + encodeURIComponent(per);
      var btnExcel = "<a href=\"" + baseUrl + "&tipo=excel\" target=\"_blank\" class=\"btn-icon-descarga btn-icon-sm\" title=\"Descargar conciliación\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><rect x=\"2\" y=\"2\" width=\"20\" height=\"20\" rx=\"3\" fill=\"#107C41\"/><text x=\"12\" y=\"15.5\" text-anchor=\"middle\" fill=\"#fff\" font-size=\"7\" font-weight=\"700\" font-family=\"Inter,sans-serif\">XLS</text></svg></a>";
      var btnFacturas = "<a href=\"" + baseUrl + "&tipo=facturas\" target=\"_blank\" class=\"btn-icon-descarga btn-icon-sm\" title=\"Descargar facturas\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><rect x=\"2\" y=\"2\" width=\"20\" height=\"20\" rx=\"3\" fill=\"#DC2626\"/><text x=\"12\" y=\"15.5\" text-anchor=\"middle\" fill=\"#fff\" font-size=\"7\" font-weight=\"700\" font-family=\"Inter,sans-serif\">PDF</text></svg></a>";
      html += "<tr>";
      html += "<td>" + tarjetaLabel + "</td>";
      html += "<td>" + (l.periodo || "—") + "</td>";
      html += "<td class=\"numero\">" + (l.num_facturas != null ? String(l.num_facturas) : "0") + "</td>";
      html += "<td class=\"numero\">" + formatearNumeroES(l.total_facturas != null ? String(l.total_facturas) : null) + "</td>";
      html += "<td class=\"numero\">" + formatearNumeroES(totalMov) + "</td>";
      html += "<td class=\"numero\">" + formatearNumeroES(pendiente) + "</td>";
      var badgeClass = estado === "conciliado" ? "conciliado" : estado === "cargo recibido" ? "cargo-recibido" : "pendiente";
      var estadoLabel = estado.charAt(0).toUpperCase() + estado.slice(1);
      var totalFact = l.total_facturas != null ? Math.abs(Number(l.total_facturas)) : 0;
      var totalMovAbs = l.total_movimiento != null ? Math.abs(Number(l.total_movimiento)) : 0;
      var pctVinculado = totalFact > 0 && totalMovAbs > 0 ? Math.min(100, Math.round((totalMovAbs / totalFact) * 100)) : (estado === "conciliado" ? 100 : 0);
      html += "<td><span class=\"badge-estado " + badgeClass + "\">" + estadoLabel + "</span>";
      var fillClass = pctVinculado >= 100 ? "fill-100" : pctVinculado === 0 ? "fill-0" : "";
      html += " <span class=\"barra-progreso-extracto\"><span class=\"barra-bg\"><span class=\"barra-fill " + fillClass + "\" style=\"width:" + pctVinculado + "%\"></span></span><span class=\"barra-pct\">" + pctVinculado + "%</span></span>";
      html += "</td>";
      html += "<td class=\"bancos-conciliacion-btns\">" + btnExcel + " " + btnFacturas + "</td>";
      html += "</tr>";
    });
    tbodyLiquidaciones.innerHTML = html;
    // UX-B.5: generar avisos tras renderizar liquidaciones
    renderAvisosTarjetas(filtradas);
  }

  // UX-B.5: Bloque colapsable de avisos
  function renderAvisosTarjetas(liqs) {
    var container = document.getElementById("bancos-avisos-container");
    if (!container) return;
    var avisos = [];
    (liqs || []).forEach(function (l) {
      var estado = (l.estado || "pendiente");
      var numFact = l.num_facturas != null ? Number(l.num_facturas) : 0;
      var totalMov = l.total_movimiento != null ? Number(l.total_movimiento) : 0;
      var tarjetaLabel = (l.tarjeta_banco || "Banco") + " " + (l.tarjeta_persona || "");
      var ult4 = (l.tarjeta_alias || "").trim();
      if (ult4) tarjetaLabel += " (" + ult4 + ")";
      var per = l.periodo || "?";
      if (numFact > 0 && totalMov === 0 && estado === "pendiente") {
        avisos.push(tarjetaLabel + " – " + per + ": tiene " + numFact + (numFact === 1 ? " factura vinculada" : " facturas vinculadas") + " pero no hay movimiento bancario conciliado.");
      }
      if (estado === "cargo recibido") {
        var pendiente = l.pendiente_facturas != null ? Math.abs(Number(l.pendiente_facturas)) : 0;
        if (pendiente > 0.01) {
          avisos.push(tarjetaLabel + " – " + per + ": cargo recibido pero quedan " + pendiente.toFixed(2) + " \u20ac pendientes de vincular a facturas.");
        }
      }
    });
    if (avisos.length === 0) {
      container.innerHTML = "";
      return;
    }
    var html = "<div class=\"bancos-avisos-bloque\">";
    html += "<div class=\"bancos-avisos-header\" id=\"bancos-avisos-toggle\"><span class=\"avisos-flecha\" id=\"bancos-avisos-flecha\">\u25B6</span> " + avisos.length + " aviso" + (avisos.length > 1 ? "s" : "") + "</div>";
    html += "<div class=\"bancos-avisos-body oculto\" id=\"bancos-avisos-body\"><ul>";
    avisos.forEach(function (a) { html += "<li>" + a + "</li>"; });
    html += "</ul></div></div>";
    container.innerHTML = html;
    var toggleBtn = document.getElementById("bancos-avisos-toggle");
    var body = document.getElementById("bancos-avisos-body");
    var flecha = document.getElementById("bancos-avisos-flecha");
    if (toggleBtn && body) {
      toggleBtn.addEventListener("click", function () {
        var abierto = !body.classList.contains("oculto");
        if (abierto) {
          body.classList.add("oculto");
          if (flecha) flecha.classList.remove("abierto");
        } else {
          body.classList.remove("oculto");
          if (flecha) flecha.classList.add("abierto");
        }
      });
    }
  }

  function cargarLiquidacionesTarjetas() {
    if (!tarjetasEmpresaSel || !tbodyLiquidaciones) return;
    var empresaId = (tarjetasEmpresaSel.value || "").trim();
    if (!empresaId) {
      tbodyLiquidaciones.innerHTML = "<tr><td colspan=\"8\" class=\"sin-datos\">Selecciona una empresa para ver los extractos.</td></tr>";
      liquidacionesCache = [];
      return;
    }
    tbodyLiquidaciones.innerHTML = "<tr><td colspan=\"8\" class=\"sin-datos\">Cargando…</td></tr>";
    fetch("/api/empresas/" + encodeURIComponent(empresaId) + "/tarjetas/liquidaciones-resumen")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          tbodyLiquidaciones.innerHTML = "<tr><td colspan=\"8\" class=\"sin-datos\">" + (data.error || "Error al cargar extractos.") + "</td></tr>";
          liquidacionesCache = [];
          return;
        }
        liquidacionesCache = data.liquidaciones || [];
        renderLiquidaciones(liquidacionesCache);
      })
      .catch(function () {
        tbodyLiquidaciones.innerHTML = "<tr><td colspan=\"8\" class=\"sin-datos\">Error al cargar extractos.</td></tr>";
        liquidacionesCache = [];
      });
  }
  window.cargarLiquidacionesTarjetas = cargarLiquidacionesTarjetas;

  function cargarTarjetasBancos() {
    if (!tarjetasEmpresaSel || !tbodyTarjetas) return;
    poblarSelectEmpresasEnTarjetas();
    var empresaId = (tarjetasEmpresaSel.value || "").trim();
    if (!empresaId) {
      tbodyTarjetas.innerHTML = "<tr><td colspan=\"6\" class=\"sin-datos\">Selecciona una empresa para ver las tarjetas.</td></tr>";
      return;
    }
    tbodyTarjetas.innerHTML = "<tr><td colspan=\"6\" class=\"sin-datos\">Cargando…</td></tr>";
    fetch("/api/empresas/" + encodeURIComponent(empresaId) + "/tarjetas")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          tbodyTarjetas.innerHTML = "<tr><td colspan=\"6\" class=\"sin-datos\">" + (data.error || "Error al cargar tarjetas.") + "</td></tr>";
          return;
        }
        renderTarjetas(data.tarjetas || []);
        cargarLiquidacionesTarjetas();
      })
      .catch(function () {
        tbodyTarjetas.innerHTML = "<tr><td colspan=\"6\" class=\"sin-datos\">Error al cargar tarjetas.</td></tr>";
      });
  }

  if (tarjetasEmpresaSel) {
    tarjetasEmpresaSel.addEventListener("change", function () {
      cargarTarjetasBancos();
      cargarLiquidacionesTarjetas();
    });
  }
  if (filtroExtractosTarjeta) {
    filtroExtractosTarjeta.addEventListener("change", function () {
      renderLiquidaciones(liquidacionesCache);
    });
  }
  if (filtroExtractosMes) {
    filtroExtractosMes.addEventListener("change", function () {
      renderLiquidaciones(liquidacionesCache);
    });
  }
  if (filtroExtractosAnio) {
    filtroExtractosAnio.addEventListener("change", function () {
      renderLiquidaciones(liquidacionesCache);
    });
  }

  var tarjetaEditId = null; // null = nueva, int = editando

  function abrirModalTarjeta(tarjeta) {
    if (!modalTarjetaOverlay) return;
    if (statusTarjeta) {
      statusTarjeta.textContent = "";
      statusTarjeta.style.color = "";
    }
    var titulo = document.getElementById("modal-tarjeta-titulo");
    var btnGuardar = document.getElementById("btn-tarjeta-guardar");
    if (tarjeta) {
      tarjetaEditId = tarjeta.id;
      if (titulo) titulo.textContent = "Editar tarjeta";
      if (btnGuardar) btnGuardar.textContent = "Guardar cambios";
      document.getElementById("tarjeta-banco").value = tarjeta.banco || "";
      document.getElementById("tarjeta-persona").value = tarjeta.persona || "";
      document.getElementById("tarjeta-ultimos4").value = tarjeta.ultimos4 || "";
      document.getElementById("tarjeta-alias").value = tarjeta.alias || "";
      document.getElementById("tarjeta-activa").checked = !!tarjeta.activa;
    } else {
      tarjetaEditId = null;
      if (titulo) titulo.textContent = "Nueva tarjeta";
      if (btnGuardar) btnGuardar.textContent = "Guardar tarjeta";
      if (formTarjeta) formTarjeta.reset();
      document.getElementById("tarjeta-activa").checked = true;
    }
    modalTarjetaOverlay.classList.add("visible");
    modalTarjetaOverlay.setAttribute("aria-hidden", "false");
  }

  function cerrarModalTarjeta() {
    if (!modalTarjetaOverlay) return;
    tarjetaEditId = null;
    modalTarjetaOverlay.classList.remove("visible");
    modalTarjetaOverlay.setAttribute("aria-hidden", "true");
  }

  if (btnAbrirModalTarjeta) {
    btnAbrirModalTarjeta.addEventListener("click", function () {
      if (!tarjetasEmpresaSel || !tarjetasEmpresaSel.value) {
        mostrarToast("Selecciona primero una empresa para la tarjeta.", "error");
        return;
      }
      abrirModalTarjeta();
    });
  }
  if (btnCerrarModalTarjeta) {
    btnCerrarModalTarjeta.addEventListener("click", cerrarModalTarjeta);
  }
  if (modalTarjetaOverlay) {
    modalTarjetaOverlay.addEventListener("click", function (e) {
      if (e.target === modalTarjetaOverlay) cerrarModalTarjeta();
    });
  }

  if (formTarjeta) {
    formTarjeta.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!tarjetasEmpresaSel || !tarjetasEmpresaSel.value) {
        mostrarToast("Selecciona una empresa antes de crear una tarjeta.", "error");
        return;
      }
      var empresaId = tarjetasEmpresaSel.value;
      var banco = (document.getElementById("tarjeta-banco").value || "").trim();
      var persona = (document.getElementById("tarjeta-persona").value || "").trim();
      var ultimos4 = (document.getElementById("tarjeta-ultimos4").value || "").trim();
      var alias = (document.getElementById("tarjeta-alias").value || "").trim();
      var activa = !!document.getElementById("tarjeta-activa").checked;
      if (!banco || !persona) {
        if (statusTarjeta) {
          statusTarjeta.textContent = "Banco y persona son obligatorios.";
          statusTarjeta.style.color = "#b91c1c";
        }
        return;
      }
      var payload = {
        empresa_id: empresaId,
        banco: banco,
        persona: persona,
        ultimos4: ultimos4 || null,
        alias: alias || null,
        activa: activa,
      };
      var btnGuardar = document.getElementById("btn-tarjeta-guardar");
      if (btnGuardar) btnGuardar.disabled = true;
      if (statusTarjeta) {
        statusTarjeta.textContent = "Guardando…";
        statusTarjeta.style.color = "";
      }
      var fetchUrl = tarjetaEditId ? ("/api/tarjetas/" + tarjetaEditId) : "/api/tarjetas";
      var fetchMethod = tarjetaEditId ? "PUT" : "POST";
      fetch(fetchUrl, {
        method: fetchMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) {
            if (statusTarjeta) {
              statusTarjeta.textContent = data.error;
              statusTarjeta.style.color = "#b91c1c";
            }
            return;
          }
          formTarjeta.reset();
          if (document.getElementById("tarjeta-activa")) {
            document.getElementById("tarjeta-activa").checked = true;
          }
          if (statusTarjeta) {
            statusTarjeta.textContent = "Tarjeta guardada correctamente.";
            statusTarjeta.style.color = "#15803d";
          }
          mostrarToast("Tarjeta guardada correctamente.", "success");
          cargarTarjetasBancos();
          cargarLiquidacionesTarjetas();
          if (modalTarjetaOverlay) {
            modalTarjetaOverlay.classList.remove("visible");
            modalTarjetaOverlay.setAttribute("aria-hidden", "true");
          }
        })
        .catch(function () {
          if (statusTarjeta) {
            statusTarjeta.textContent = "Error al guardar la tarjeta.";
            statusTarjeta.style.color = "#b91c1c";
          }
        })
        .finally(function () {
          var btnGuardar2 = document.getElementById("btn-tarjeta-guardar");
          if (btnGuardar2) btnGuardar2.disabled = false;
        });
    });
  }

  // Al mostrar el panel Bancos, cargar listado si está visible
  var panelBancos = document.getElementById("panel-bancos-inicio");
  if (panelBancos) {
    var obs = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.attributeName === "class" && panelBancos.classList.contains("visible")) cargarMovimientosBancos();
      });
    });
    obs.observe(panelBancos, { attributes: true });
  }
})();

// Control de calidad: llamada al análisis y listado de errores (1.4) + sugerencias (2.2)
(function () {
  const form = document.getElementById("form-control-calidad");
  const statusEl = document.getElementById("control-calidad-status");
  const resultadosEl = document.getElementById("control-calidad-resultados");
  const testsEl = document.getElementById("control-calidad-tests");
  const listaEl = document.getElementById("control-calidad-lista");
  const resumenEl = document.getElementById("control-calidad-resumen");
  const filtroEl = document.getElementById("control-calidad-filtro-tipo-error");
  const exportarBtn = document.getElementById("control-calidad-exportar-csv");
  var lastProv = [];
  var lastCli = [];

  function mostrarEstado(texto, esError) {
    statusEl.style.display = "block";
    statusEl.textContent = texto;
    statusEl.style.color = esError ? "#b91c1c" : "";
  }

  function escapeHtml(s) {
    if (s == null) return "";
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function renderizarFacturaConErrores(item, tipoLabel, tipoValue) {
    var f = item.fila || {};
    var prov = (f.proveedor || f.cliente || "").trim() || "—";
    var num = (f.numero_factura || "").trim() || "—";
    var fecha = (f.fecha_factura || "").trim() || "—";
    var ruta = (item.ruta_archivo || "").trim() || "";
    var esProv = tipoValue === "proveedores";
    var div = document.createElement("div");
    div.className = "control-calidad-item";
    var erroresHtml = (item.errores || []).map(function (e) { return "<li>" + escapeHtml(e) + "</li>"; }).join("");
    var rutaHtml = ruta ? " <span class=\"cc-ruta-info\" title=\"" + escapeHtml(ruta) + "\">\u2139</span>" : "";
    div.innerHTML =
      "<div class=\"cc-card-header\"><span class=\"cc-badge-tipo " + (esProv ? "prov" : "cli") + "\">" + tipoLabel + "</span><span class=\"cc-card-nombre\">" + escapeHtml(prov) + "</span></div>" +
      "<div class=\"cc-card-meta\">Nº " + escapeHtml(num) + " · " + escapeHtml(fecha) + rutaHtml + "</div>" +
      "<ul class=\"control-calidad-errores\">" + erroresHtml + "</ul>" +
      "<div><button type=\"button\" class=\"secondary btn-obtener-sugerencia\">\u2728 Sugerencia</button></div>" +
      "<div class=\"control-calidad-sugerencia-block\" style=\"display:none;\"></div>";
    var btnSugerencia = div.querySelector(".btn-obtener-sugerencia");
    var bloqueSugerencia = div.querySelector(".control-calidad-sugerencia-block");

    btnSugerencia.addEventListener("click", function () {
      var empresaId = (document.getElementById("empresa-control-calidad").value || "").trim();
      if (!empresaId) {
        mostrarEstado("Selecciona una empresa.", true);
        return;
      }
      btnSugerencia.disabled = true;
      btnSugerencia.textContent = "Cargando…";
      fetch("/api/control-calidad/sugerir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          tipo: tipoValue,
          fila: item.fila || {},
          errores: item.errores || [],
          ruta_archivo: item.ruta_archivo,
          indice: item.indice,
          usar_llm: document.getElementById("usar-llm-sugerencias") ? document.getElementById("usar-llm-sugerencias").checked : false,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          btnSugerencia.disabled = false;
          btnSugerencia.textContent = "Obtener sugerencia";
          var sug = data.sugerencias || [];
          if (sug.length === 0) {
            bloqueSugerencia.innerHTML = "<p class=\"control-calidad-msg-info\">No hay sugerencias automáticas para estos errores.</p><button type=\"button\" class=\"secondary\">Cerrar</button>";
            bloqueSugerencia.querySelector("button").addEventListener("click", function () { bloqueSugerencia.style.display = "none"; bloqueSugerencia.innerHTML = ""; });
          } else {
            var lineas = sug.map(function (s) {
              return "<strong>" + escapeHtml(s.campo) + "</strong>: " + escapeHtml(s.valor_actual) + " → " + escapeHtml(s.valor_sugerido) + ". " + escapeHtml(s.motivo || "");
            }).join("<br/>");
            bloqueSugerencia.innerHTML =
              "<p class=\"mb-2\"><strong>Sugerencia:</strong></p><p class=\"mb-2\" style=\"font-size:0.95em;\">" + lineas + "</p>" +
              "<div class=\"control-calidad-acciones\">" +
              "<button type=\"button\" class=\"secondary btn-aceptar-sugerencia\">Aceptar sugerencia</button> " +
              "<button type=\"button\" class=\"secondary btn-rechazar-sugerencia\">Rechazar</button> " +
              "<button type=\"button\" class=\"secondary btn-editar-mano\">Editar a mano</button>" +
              "</div>";
            bloqueSugerencia.querySelector(".btn-rechazar-sugerencia").addEventListener("click", function () {
              bloqueSugerencia.style.display = "none";
              bloqueSugerencia.innerHTML = "";
            });
            bloqueSugerencia.querySelector(".btn-aceptar-sugerencia").addEventListener("click", function () {
              var facturaActualizada = {};
              var fila = item.fila || {};
              for (var k in fila) if (fila.hasOwnProperty(k)) facturaActualizada[k] = fila[k];
              sug.forEach(function (s) {
                facturaActualizada[s.campo] = s.valor_sugerido != null ? String(s.valor_sugerido) : "";
              });
              var url = tipoValue === "proveedores" ? "/api/factura" : "/api/factura_cliente";
              var body = { empresa_id: empresaId, factura: facturaActualizada };
              if (tipoValue === "clientes") {
                body.clave_original = {
                  numero_factura: (fila.numero_factura || "").trim(),
                  fecha_factura: (fila.fecha_factura || "").trim(),
                  cliente: (fila.cliente || "").trim(),
                };
              }
              fetch(url, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              })
                .then(function (r) {
                  if (!r.ok) return r.json().then(function (err) { throw new Error(err.error || "Error al guardar"); });
                  bloqueSugerencia.style.display = "none";
                  bloqueSugerencia.innerHTML = "";
                  if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event("submit", { cancelable: true }));
                })
                .catch(function (err) {
                  mostrarToast(err.message || "No se pudo aplicar la sugerencia.", "error");
                });
            });
            bloqueSugerencia.querySelector(".btn-editar-mano").addEventListener("click", function () {
              if (tipoValue === "proveedores") {
                var empListado = document.getElementById("empresa-listado");
                if (empListado) empListado.value = empresaId;
                if (typeof abrirModalEdicion === "function") abrirModalEdicion(item.fila || {});
              } else {
                var empCli = document.getElementById("cli-empresa-listado");
                if (empCli) empCli.value = empresaId;
                if (typeof abrirModalEdicionCli === "function") abrirModalEdicionCli(item.fila || {});
              }
            });
          }
          bloqueSugerencia.style.display = "block";
        })
        .catch(function (err) {
          btnSugerencia.disabled = false;
          btnSugerencia.textContent = "Obtener sugerencia";
          bloqueSugerencia.innerHTML = "<p class=\"control-calidad-msg-error\">Error al obtener sugerencia.</p>";
          bloqueSugerencia.style.display = "block";
        });
    });

    return div;
  }

  function filtrarPorTipoError(items, filtro) {
    if (!filtro || !filtro.trim()) return items;
    return items.filter(function (item) {
      return (item.errores || []).some(function (e) { return e.indexOf(filtro) !== -1; });
    });
  }

  function renderListaControlCalidad(prov, cli, filtroTipoError) {
    listaEl.innerHTML = "";
    var provF = filtrarPorTipoError(prov, filtroTipoError);
    var cliF = filtrarPorTipoError(cli, filtroTipoError);
    if (provF.length === 0 && cliF.length === 0) {
      if (prov.length === 0 && cli.length === 0) {
        listaEl.innerHTML = "<p class=\"control-calidad-msg-ok\">No hay facturas con problemas.</p>";
      } else {
        listaEl.innerHTML = "<p class=\"control-calidad-msg-info\">Ninguna factura coincide con el filtro \"" + (filtroTipoError || "Todos") + "\".</p>";
      }
      return;
    }
    var grid = document.createElement("div");
    grid.className = "control-calidad-grid";
    provF.forEach(function (item) { grid.appendChild(renderizarFacturaConErrores(item, "Proveedores", "proveedores")); });
    cliF.forEach(function (item) { grid.appendChild(renderizarFacturaConErrores(item, "Clientes", "clientes")); });
    listaEl.appendChild(grid);
  }

  if (filtroEl) filtroEl.addEventListener("change", function () { renderListaControlCalidad(lastProv, lastCli, filtroEl.value); });
  if (exportarBtn) exportarBtn.addEventListener("click", function () {
    if (lastProv.length === 0 && lastCli.length === 0) { mostrarToast("No hay datos para exportar. Ejecuta antes un análisis.", "error"); return; }
    var csv = "tipo;proveedor_o_cliente;numero_factura;fecha;ruta_archivo;errores\n";
    lastProv.forEach(function (item) {
      var f = item.fila || {};
      var provCli = (f.proveedor || "").trim() || "—";
      var num = (f.numero_factura || "").trim() || "—";
      var fecha = (f.fecha_factura || "").trim() || "—";
      var ruta = (item.ruta_archivo || "").trim() || "—";
      var err = (item.errores || []).join(" | ").replace(/"/g, "\"\"");
      csv += "Proveedores;\"" + provCli + "\";\"" + num + "\";\"" + fecha + "\";\"" + ruta + "\";\"" + err + "\"\n";
    });
    lastCli.forEach(function (item) {
      var f = item.fila || {};
      var provCli = (f.cliente || "").trim() || "—";
      var num = (f.numero_factura || "").trim() || "—";
      var fecha = (f.fecha_factura || "").trim() || "—";
      var ruta = (item.ruta_archivo || "").trim() || "—";
      var err = (item.errores || []).join(" | ").replace(/"/g, "\"\"");
      csv += "Clientes;\"" + provCli + "\";\"" + num + "\";\"" + fecha + "\";\"" + ruta + "\";\"" + err + "\"\n";
    });
    var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "informe_control_calidad.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var empresaId = (document.getElementById("empresa-control-calidad").value || "").trim();
    var tipo = (document.getElementById("tipo-control-calidad").value || "ambos").trim();
    var incluirTests = document.getElementById("incluir-tests-control-calidad").checked === true;

    if (!empresaId) {
      mostrarEstado("Selecciona una empresa.", true);
      resultadosEl.style.display = "none";
      return;
    }

    mostrarEstado("Analizando…", false);
    resultadosEl.style.display = "none";
    testsEl.style.display = "none";
    listaEl.innerHTML = "";

    fetch("/api/control-calidad/analizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: empresaId, tipo: tipo, incluir_tests: incluirTests }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        statusEl.style.display = "none";
        resultadosEl.style.display = "block";

        if (data.unit_tests) {
          var ut = data.unit_tests;
          testsEl.style.display = "block";
          if (ut.ok) {
            testsEl.innerHTML = "<p style=\"color:#15803d;\"><strong>Tests: OK</strong> (" + ut.total + " pruebas)</p>";
          } else {
            var fallos = (ut.fallos || []).map(function (f) {
              return "<li><strong>" + escapeHtml(f.test || "") + "</strong><pre style=\"margin:4px 0 0 0;font-size:0.85em;white-space:pre-wrap;\">" + escapeHtml(f.error || "") + "</pre></li>";
            }).join("");
            testsEl.innerHTML = "<p style=\"color:#b91c1c;\"><strong>Tests: " + (ut.fallos ? ut.fallos.length : 0) + " fallos</strong></p><details><summary>Ver detalle</summary><ul>" + fallos + "</ul></details>";
          }
        }

        var prov = data.facturas_proveedores || [];
        var cli = data.facturas_clientes || [];
        lastProv = prov;
        lastCli = cli;
        var numConProblemas = prov.length + cli.length;
        var numErrores = prov.reduce(function (s, i) { return s + (i.errores || []).length; }, 0) + cli.reduce(function (s, i) { return s + (i.errores || []).length; }, 0);
        var totalAnalizadas = data.total_analizadas || numConProblemas;
        var barEl = document.getElementById("control-calidad-resumen-bar");
        if (barEl) {
          barEl.style.display = "flex";
          barEl.innerHTML =
            "<span class=\"resumen-item\"><span class=\"resumen-label\">Analizadas</span><span class=\"resumen-valor\">" + totalAnalizadas + "</span></span>" +
            "<span class=\"resumen-item\"><span class=\"resumen-label\">Con problemas</span><span class=\"resumen-valor" + (numConProblemas > 0 ? " rojo" : "") + "\">" + numConProblemas + "</span></span>" +
            "<span class=\"resumen-item\"><span class=\"resumen-label\">Errores</span><span class=\"resumen-valor" + (numErrores > 0 ? " rojo" : "") + "\">" + numErrores + "</span></span>";
        }
        renderListaControlCalidad(prov, cli, filtroEl ? filtroEl.value : "");
      })
      .catch(function (err) {
        mostrarEstado("Error al analizar: " + (err.message || "Error de red"), true);
        resultadosEl.style.display = "none";
      });
  });
})();

// Botón seleccionar facturas: abre el input y muestra nombres debajo
const inputArchivos = document.getElementById("archivos");
const btnSeleccionar = document.getElementById("btn-seleccionar-facturas");
const listaArchivos = document.getElementById("lista-archivos");

btnSeleccionar.addEventListener("click", () => inputArchivos.click());

inputArchivos.addEventListener("change", () => {
  listaArchivos.innerHTML = "";
  for (const file of inputArchivos.files) {
    const li = document.createElement("li");
    li.textContent = file.name;
    listaArchivos.appendChild(li);
  }
});

// Formulario subir
const form = document.getElementById("facturas-form");
const statusEl = document.getElementById("status");
const selectEmpresaProc = document.getElementById("empresa");
const selectTarjetaProc = document.getElementById("facturas-tarjeta");

async function cargarTarjetasParaEmpresaFacturas(empresaId) {
  if (!selectTarjetaProc) return;
  selectTarjetaProc.innerHTML = '<option value="">Sin tarjeta / pago directo</option>';
  if (!empresaId) return;
  try {
    const resp = await fetch("/api/empresas/" + encodeURIComponent(empresaId) + "/tarjetas?solo_activas=true");
    const json = await resp.json();
    const tarjetas = (json.tarjetas || []).slice().sort((a, b) => {
      const ta = ((a.banco || "") + " " + (a.persona || "")).toLowerCase();
      const tb = ((b.banco || "") + " " + (b.persona || "")).toLowerCase();
      return ta.localeCompare(tb, "es");
    });
    tarjetas.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = String(t.id);
      const ult4 = (t.ultimos4 || "").trim();
      const alias = (t.alias || "").trim();
      let label = (t.banco || "Banco") + " – " + (t.persona || "Titular");
      if (ult4) label += " ···· " + ult4;
      if (alias) label += " (" + alias + ")";
      opt.textContent = label;
      selectTarjetaProc.appendChild(opt);
    });
  } catch (e) {
    // Si falla, simplemente dejamos el desplegable con la opción por defecto.
  }
}

if (selectEmpresaProc) {
  selectEmpresaProc.addEventListener("change", () => {
    cargarTarjetasParaEmpresaFacturas(selectEmpresaProc.value || "");
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const empresa = document.getElementById("empresa").value;
  const archivos = document.getElementById("archivos").files;

  if (!empresa || !archivos.length) {
    statusEl.textContent = "Selecciona una empresa y al menos un archivo.";
    return;
  }

  const data = new FormData();
  data.append("empresa_id", empresa);
  if (selectTarjetaProc && selectTarjetaProc.value) {
    data.append("tarjeta_id", selectTarjetaProc.value);
  }
  for (const file of archivos) {
    data.append("archivos", file);
  }

  statusEl.textContent = "Enviando archivos…";
  form.querySelector("button[type=submit]").disabled = true;

  try {
    const resp = await fetch("/api/procesar", {
      method: "POST",
      body: data,
    });

    if (!resp.ok) {
      throw new Error("Error HTTP " + resp.status);
    }

    const json = await resp.json();
    const resumen = json.resumen_proceso || {};
    let msg = json.mensaje || "Procesamiento completado.";
    if (resumen.procesado) {
      if (resumen.filas_añadidas > 0) {
        msg = resumen.filas_añadidas + (resumen.filas_añadidas === 1 ? " factura añadida" : " facturas añadidas") + ".";
        if (resumen.facturas_con_vision) msg += " (" + resumen.facturas_con_vision + " con vision)";
      } else if (resumen.facturas_omitidas_duplicadas > 0) {
        msg = "Factura(s) ya existente(s) — " + resumen.facturas_omitidas_duplicadas + " duplicada(s) omitida(s).";
      } else {
        msg = "No se han añadido facturas nuevas.";
      }
    }
    statusEl.textContent = msg;
    // Sincronizar empresa del listado con la del procesamiento y recargar
    const empListado = document.getElementById("empresa-listado");
    if (empListado) {
      if (empListado.value !== empresa) empListado.value = empresa;
      var idsNuevos = resumen.ids_insertados || [];
      if (idsNuevos.length > 0) {
        cargarListadoFiltradoPorIds(empresa, idsNuevos, "proveedores");
      } else {
        cargarListado(empresa);
      }
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      "No se pudo contactar con el backend. Asegúrate de que está en ejecución.";
  } finally {
    form.querySelector("button[type=submit]").disabled = false;
  }
});

// Modal procesar facturas proveedores
(function () {
  var overlay = document.getElementById("modal-procesar-prov-overlay");
  var btnAbrir = document.getElementById("btn-abrir-modal-procesar-prov");
  var btnCerrar = document.getElementById("btn-cerrar-modal-procesar-prov");
  if (!overlay || !btnAbrir) return;
  btnAbrir.addEventListener("click", function () {
    // Sincronizar empresa del listado al modal
    var empListado = document.getElementById("empresa-listado");
    var empModal = document.getElementById("empresa");
    if (empListado && empModal && empListado.value && !empModal.value) {
      empModal.value = empListado.value;
      empModal.dispatchEvent(new Event("change"));
    }
    overlay.classList.add("visible");
    overlay.setAttribute("aria-hidden", "false");
  });
  function cerrar() { overlay.classList.remove("visible"); overlay.setAttribute("aria-hidden", "true"); }
  if (btnCerrar) btnCerrar.addEventListener("click", cerrar);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) cerrar(); });
})();

// Modal procesar facturas clientes
(function () {
  var overlay = document.getElementById("modal-procesar-cli-overlay");
  var btnAbrir = document.getElementById("btn-abrir-modal-procesar-cli");
  var btnCerrar = document.getElementById("btn-cerrar-modal-procesar-cli");
  if (!overlay || !btnAbrir) return;
  btnAbrir.addEventListener("click", function () {
    var empListado = document.getElementById("cli-empresa-listado");
    var empModal = document.getElementById("cli-empresa-proc");
    if (empListado && empModal && empListado.value && !empModal.value) {
      empModal.value = empListado.value;
    }
    overlay.classList.add("visible");
    overlay.setAttribute("aria-hidden", "false");
  });
  function cerrar() { overlay.classList.remove("visible"); overlay.setAttribute("aria-hidden", "true"); }
  if (btnCerrar) btnCerrar.addEventListener("click", cerrar);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) cerrar(); });
})();

// Formato numérico: miles con punto, decimales con coma. Parsea bien 52.15 → 52,15 y 1234.56 → 1.234,56
function formatearNumeroES(val) {
  if (val == null || (typeof val === "string" && val.trim() === "")) return "—";
  const s = String(val).trim().replace(/\s/g, "");
  let n;
  if (/,\d/.test(s)) {
    // Formato europeo: coma como decimal (ej. 1.234,56)
    n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  } else {
    // Punto como decimal (ej. 52.15 o 1234.56)
    n = parseFloat(s);
  }
  if (Number.isNaN(n)) return s || "—";
  const [entera, dec = ""] = n.toFixed(2).split(".");
  const conMiles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec ? conMiles + "," + dec : conMiles;
}

const COLUMNAS_NUMERICAS = new Set(["base_imponible", "iva", "retenciones_total", "total_a_pagar"]);

// Límite de filas a renderizar en tabla para evitar DOM gigantes (virtualización ligera)
const LIMITE_FILAS_TABLA = 1000;

const COLUMNAS = [
  { key: "fecha_factura", label: "Fecha" },
  { key: "proveedor", label: "Proveedor" },
  { key: "nif_proveedor", label: "CIF/NIF" },
  { key: "pais_proveedor", label: "País" },
  { key: "localidad_proveedor", label: "Localidad" },
  { key: "resumen_concepto", label: "Concepto" },
  { key: "numero_factura", label: "Nº factura" },
  { key: "base_imponible", label: "Base" },
  { key: "iva", label: "IVA" },
  { key: "retenciones_total", label: "Ret." },
  { key: "total_a_pagar", label: "Total a pagar" },
  { key: "estado_pago", label: "Estado pago" },
];

function parseNumeroParaSort(val) {
  if (val == null) return -Infinity;
  const s = String(val).trim().replace(/\s/g, "").replace("€", "");
  if (!s) return -Infinity;
  let n;
  if (/,\d/.test(s)) {
    n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  } else {
    n = parseFloat(s);
  }
  return Number.isNaN(n) ? -Infinity : n;
}

function ordenarFacturas(facturas, columnaKey, direccion) {
  if (!columnaKey) return facturas;
  const esNum = COLUMNAS_NUMERICAS.has(columnaKey);
  const mult = direccion === "desc" ? -1 : 1;
  return facturas.slice().sort((a, b) => {
    const va = (a[columnaKey] ?? "").toString().trim();
    const vb = (b[columnaKey] ?? "").toString().trim();
    if (esNum) {
      return (parseNumeroParaSort(va) - parseNumeroParaSort(vb)) * mult;
    }
    return va.localeCompare(vb, "es", { sensitivity: "base" }) * mult;
  });
}

/**
 * Render genérico de tablas de facturas (cabecera ordenable + filas).
 * Sirve para la tabla de facturas proveedores, la de facturas por proveedor y la de facturas de clientes.
 * @param {Object} opts
 * @param {HTMLTableRowElement} opts.theadTr - Fila <tr> del <thead>
 * @param {HTMLTableSectionElement} opts.tbody - Elemento <tbody>
 * @param {Array<Object>} opts.facturas - Lista de facturas (objetos con keys según columnas)
 * @param {Array<{key: string, label: string}>} opts.columnas - Definición de columnas
 * @param {Set<string>} opts.columnasNumericas - Keys de columnas numéricas (formato ES)
 * @param {boolean} opts.conCheckbox - Si se muestra columna de checkbox
 * @param {string} [opts.checkAllId] - id del checkbox "seleccionar todas"
 * @param {string} [opts.checkboxClass] - clase de los checkboxes de fila
 * @param {string} [opts.tbodySelectorParaCheckAll] - selector para que check-all encuentre los checkboxes (ej. "#tbody-facturas .check-factura")
 * @param {function} [opts.onCheckAllChange] - Callback al cambiar "seleccionar todas"
 * @param {function} [opts.getCheckboxData] - (f) => objeto con data-* para el checkbox de la fila (ej. { ruta: "..." } o { idx: 0 })
 * @param {function} [opts.onCheckChange] - Callback al cambiar un checkbox de fila
 * @param {Object} opts.sortState - { key: string, dir: "asc"|"desc" }
 * @param {function} opts.onSort - Callback al hacer clic en una columna ordenable
 * @param {function} opts.getRutaVerFactura - (f) => ruta para el enlace "Ver factura"
 * @param {function} opts.onEditar - (f) => al hacer clic en Editar
 * @param {function} [opts.tieneError] - (f) => boolean para fila con error
 * @param {string} [opts.motivoErrorKey] - key del motivo de error en f (para title del badge)
 */
function renderTablaFacturas(opts) {
  const theadTr = opts.theadTr;
  const tbody = opts.tbody;
  const facturas = opts.facturas || [];
  const columnas = opts.columnas;
  const columnasNumericas = opts.columnasNumericas || new Set();
  const conCheckbox = !!opts.conCheckbox;

  // Thead
  theadTr.innerHTML = "";
  if (conCheckbox && opts.checkAllId != null) {
    const thCheck = document.createElement("th");
    thCheck.className = "col-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = opts.checkAllId;
    cb.title = "Seleccionar todas";
    cb.addEventListener("change", (e) => {
      const checks = document.querySelectorAll(opts.tbodySelectorParaCheckAll || "");
      checks.forEach((c) => {
        c.checked = e.target.checked;
        const tr = c.closest("tr");
        if (tr) tr.classList.toggle("fila-seleccionada", c.checked);
      });
      if (opts.onCheckAllChange) opts.onCheckAllChange();
    });
    thCheck.appendChild(cb);
    theadTr.appendChild(thCheck);
  }
  columnas.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.label;
    th.className = "sortable";
    th.title = "Ordenar por " + col.label;
    if (columnasNumericas.has(col.key)) th.classList.add("numero");
    if (opts.sortState.key === col.key) {
      th.classList.add(opts.sortState.dir === "asc" ? "sort-asc" : "sort-desc");
    }
    th.addEventListener("click", () => {
      if (opts.sortState.key === col.key) {
        opts.sortState.dir = opts.sortState.dir === "asc" ? "desc" : "asc";
      } else {
        opts.sortState.key = col.key;
        opts.sortState.dir = "asc";
      }
      opts.onSort();
    });
    theadTr.appendChild(th);
  });
  const thAcciones = document.createElement("th");
  thAcciones.textContent = "Acciones";
  theadTr.appendChild(thAcciones);

  // Tbody
  tbody.innerHTML = "";
  // Estado vacío
  var tablaParent = tbody.closest("table");
  if (tablaParent) {
    var vacioExistente = tablaParent.parentNode.querySelector(".tabla-estado-vacio");
    if (vacioExistente) vacioExistente.remove();
  }
  if (!facturas.length) {
    if (tablaParent) {
      var divVacio = document.createElement("div");
      divVacio.className = "tabla-estado-vacio";
      divVacio.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><p class="estado-vacio-titulo">No hay facturas para mostrar</p><p class="estado-vacio-subtitulo">Selecciona una empresa y pulsa Cargar listado</p>';
      tablaParent.parentNode.insertBefore(divVacio, tablaParent.nextSibling);
    }
    return;
  }
  facturas.forEach((f) => {
    const tr = document.createElement("tr");
    const tieneError = opts.tieneError ? opts.tieneError(f) : false;
    const motivoError = (opts.motivoErrorKey && f[opts.motivoErrorKey]) ? String(f[opts.motivoErrorKey]).trim() : "";
    if (tieneError) tr.classList.add("fila-con-error");

    if (conCheckbox && opts.checkboxClass != null) {
      const tdCheck = document.createElement("td");
      tdCheck.className = "col-check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = opts.checkboxClass;
      const data = opts.getCheckboxData ? opts.getCheckboxData(f) : {};
      Object.keys(data).forEach((k) => { cb.dataset[k] = data[k]; });
      cb.addEventListener("change", () => {
        tr.classList.toggle("fila-seleccionada", cb.checked);
        if (opts.onCheckChange) opts.onCheckChange();
      });
      tdCheck.appendChild(cb);
      tr.appendChild(tdCheck);
    }
    columnas.forEach((col) => {
      const td = document.createElement("td");
      const raw = (f[col.key] ?? "").toString().trim();
      if (col.key === "estado_pago" || col.key === "estado_cobro") {
        const val = raw.toLowerCase();
        if (val) {
          const badge = document.createElement("span");
          badge.className = "badge-pago badge-pago-" + val;
          badge.textContent = raw;
          td.appendChild(badge);
        } else {
          td.textContent = "—";
        }
      } else if (col.key === "fecha_factura" && raw.length >= 10) {
        // Formato compacto dd/mm/yy
        var partes = raw.slice(0, 10).split("-");
        td.textContent = partes.length === 3 ? partes[2] + "/" + partes[1] + "/" + partes[0].slice(2) : raw;
      } else {
        td.textContent = columnasNumericas.has(col.key) ? formatearNumeroES(raw || null) : (raw || "—");
      }
      td.title = raw || "—";
      if (columnasNumericas.has(col.key)) td.classList.add("numero");
      if (col.key === "pais_proveedor" || col.key === "pais") td.classList.add("col-pais");
      if (col.key === "cliente" || col.key === "proveedor") td.classList.add("col-cliente");
      if (col.key === "localidad") td.classList.add("col-localidad");
      if (col.key === "proyecto") td.classList.add("col-proyecto");
      if (col.key === "concepto") td.classList.add("col-concepto-narrow");
      tr.appendChild(td);
    });
    const tdAccion = document.createElement("td");
    const ruta = opts.getRutaVerFactura ? opts.getRutaVerFactura(f) : "";
    if (ruta) {
      const a = document.createElement("a");
      a.href = "/api/archivo?ruta=" + encodeURIComponent(ruta);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Ver";
      a.className = "link-ver-factura";
      tdAccion.appendChild(a);
    }
    const btnEditar = document.createElement("button");
    btnEditar.type = "button";
    btnEditar.className = "btn-editar-factura";
    btnEditar.title = "Editar factura";
    btnEditar.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/><path d=\"M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z\"/></svg>";
    btnEditar.addEventListener("click", () => opts.onEditar(f));
    tdAccion.appendChild(btnEditar);
    if (tieneError) {
      const badge = document.createElement("span");
      badge.className = "badge-alerta";
      badge.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0z\"/><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"/><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"/></svg>";
      if (motivoError) badge.title = motivoError;
      tdAccion.appendChild(badge);
    }
    if (!ruta) tdAccion.insertBefore(document.createTextNode("—"), btnEditar);
    tr.appendChild(tdAccion);
    tbody.appendChild(tr);
  });
}

function renderTheadSortable(theadTr, conCheckbox, sortState, onSort) {
  // Solo pinta la cabecera; el tbody se rellena con renderTablaFacturas en cada flujo.
  theadTr.innerHTML = "";
  if (conCheckbox) {
    const thCheck = document.createElement("th");
    thCheck.className = "col-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "check-all-facturas";
    cb.title = "Seleccionar todas";
    cb.addEventListener("change", (e) => {
      const checks = document.querySelectorAll("#tbody-facturas .check-factura");
      checks.forEach((c) => {
        c.checked = e.target.checked;
        const tr = c.closest("tr");
        if (tr) tr.classList.toggle("fila-seleccionada", c.checked);
      });
      actualizarBotonEliminar();
    });
    thCheck.appendChild(cb);
    theadTr.appendChild(thCheck);
  }
  COLUMNAS.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.label;
    th.className = "sortable";
    if (COLUMNAS_NUMERICAS.has(col.key)) th.classList.add("numero");
    if (sortState.key === col.key) {
      th.classList.add(sortState.dir === "asc" ? "sort-asc" : "sort-desc");
    }
    th.addEventListener("click", () => {
      if (sortState.key === col.key) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      } else {
        sortState.key = col.key;
        sortState.dir = "asc";
      }
      onSort();
    });
    theadTr.appendChild(th);
  });
  const thAcciones = document.createElement("th");
  thAcciones.textContent = "Acciones";
  theadTr.appendChild(thAcciones);
}

function renderFacturasEnTbody(tbody, facturas, conCheckbox, sortState, onSort) {
  sortState = sortState || sortStateFacturas;
  onSort = onSort || aplicarFiltrosYRender;
  renderTablaFacturas({
    theadTr: tbody.closest("table").querySelector("thead tr"),
    tbody,
    facturas,
    columnas: COLUMNAS,
    columnasNumericas: COLUMNAS_NUMERICAS,
    conCheckbox,
    checkAllId: conCheckbox ? "check-all-facturas" : undefined,
    checkboxClass: conCheckbox ? "check-factura" : undefined,
    tbodySelectorParaCheckAll: "#tbody-facturas .check-factura",
    onCheckAllChange: actualizarBotonEliminar,
    getCheckboxData: conCheckbox ? (f) => ({ ruta: (f.ruta_destino || f.ruta_archivo || "").trim(), id: String(f.id || "") }) : undefined,
    onCheckChange: actualizarBotonEliminar,
    sortState,
    onSort,
    getRutaVerFactura: (f) => (f.ruta_destino || f.ruta_archivo || "").trim(),
    onEditar: abrirModalEdicion,
    tieneError: tieneAlerta,
    motivoErrorKey: "motivo_error",
  });
}

function _actualizarBadgeDescarga(btnId, count) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  var badge = btn.querySelector(".badge-seleccion");
  if (count > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "badge-seleccion";
      btn.style.position = "relative";
      btn.appendChild(badge);
    }
    badge.textContent = count;
  } else if (badge) {
    badge.remove();
  }
}

function actualizarBotonEliminar() {
  const checks = document.querySelectorAll("#tbody-facturas .check-factura:checked");
  const btn = document.getElementById("btn-eliminar-seleccionadas");
  if (checks.length > 0) {
    btn.classList.add("visible");
    btn.title = "Eliminar " + checks.length + " seleccionadas";
  } else {
    btn.classList.remove("visible");
    btn.title = "Eliminar seleccionadas";
  }
  const total = document.querySelectorAll("#tbody-facturas .check-factura");
  const checkAll = document.getElementById("check-all-facturas");
  if (checkAll) {
    checkAll.checked = total.length > 0 && checks.length === total.length;
    checkAll.indeterminate = checks.length > 0 && checks.length < total.length;
  }
  _actualizarBadgeDescarga("btn-exportar", checks.length);
  _actualizarBadgeDescarga("btn-descargar-facturas", checks.length);
}

let FACTURAS_ACTUALES = [];
const sortStateFacturas = { key: "", dir: "asc" };
let filtroAlertasActivo = false;

function tieneAlerta(f) {
  const flag = ((f.flag_error || f.flag_error_revisor || "") + "").trim();
  return flag && flag !== "0" && flag.toLowerCase() !== "false" && flag.toLowerCase() !== "no";
}

function poblarFiltroAnio(facturas) {
  const filtroAnio = document.getElementById("filtro-anio");
  const valores = new Set();
  facturas.forEach((f) => {
    const fecha = (f.fecha_factura || "").toString().slice(0, 4);
    if (fecha && /^\d{4}$/.test(fecha)) valores.add(fecha);
  });
  const actuales = new Set(
    Array.from(filtroAnio.options)
      .map((o) => o.value)
      .filter(Boolean)
  );
  if (valores.size && valores.size !== actuales.size) {
    filtroAnio.innerHTML = '<option value="">Todos los años</option>';
    Array.from(valores)
      .sort()
      .forEach((y) => {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        filtroAnio.appendChild(opt);
      });
  }
}

function aplicarFiltrosYRender() {
  const tbody = document.getElementById("tbody-facturas");
  const sinDatos = document.getElementById("sin-datos");
  const contador = document.getElementById("contador");
  const anio = document.getElementById("filtro-anio").value;
  const mes = document.getElementById("filtro-mes").value;

  tbody.innerHTML = "";
  sinDatos.style.display = "none";
  contador.textContent = "";

  let filtradas = FACTURAS_ACTUALES.slice();
  if (anio) {
    filtradas = filtradas.filter((f) =>
      (f.fecha_factura || "").toString().startsWith(anio)
    );
  }
  if (mes) {
    filtradas = filtradas.filter((f) => {
      const fecha = (f.fecha_factura || "").toString();
      return fecha.length >= 7 && fecha.slice(5, 7) === mes;
    });
  }
  const estadoPago = (document.getElementById("filtro-estado-pago") || {}).value || "";
  if (estadoPago) {
    filtradas = filtradas.filter((f) =>
      ((f.estado_pago || "").toString().trim() || "pendiente") === estadoPago
    );
  }
  const tarjetaId = (document.getElementById("filtro-tarjeta") || {}).value || "";
  if (tarjetaId === "__banco__") {
    filtradas = filtradas.filter((f) => !f.tarjeta_id || String(f.tarjeta_id).trim() === "" || String(f.tarjeta_id).trim() === "0");
  } else if (tarjetaId) {
    filtradas = filtradas.filter((f) => String(f.tarjeta_id || "") === tarjetaId);
  }

  if (filtroAlertasActivo) {
    filtradas = filtradas.filter(tieneAlerta);
  }

  if (!filtradas.length) {
    sinDatos.style.display = "block";
    sinDatos.textContent = filtroAlertasActivo
      ? "No hay facturas con alertas para los filtros seleccionados."
      : "No hay facturas cargadas para esta empresa. Usa el bot\u00f3n \u00ab+ Procesar\u00bb para subir nuevas.";
    return;
  }

  if (sortStateFacturas.key) {
    filtradas = ordenarFacturas(filtradas, sortStateFacturas.key, sortStateFacturas.dir);
  }

  const theadTr = document.querySelector("#tabla-facturas thead tr");
  renderTheadSortable(theadTr, true, sortStateFacturas, aplicarFiltrosYRender);

  const total = filtradas.length;
  let visibles = filtradas;
  if (total > LIMITE_FILAS_TABLA) {
    visibles = filtradas.slice(0, LIMITE_FILAS_TABLA);
  }

  contador.textContent =
    total + (total === 1 ? " factura" : " facturas") + (total > LIMITE_FILAS_TABLA ? " (mostrando primeras " + LIMITE_FILAS_TABLA + ")" : "");
  renderFacturasEnTbody(tbody, visibles, true);
  actualizarBotonEliminar();

  const btnAlertas = document.getElementById("btn-filtro-alertas");
  const totalConAlerta = FACTURAS_ACTUALES.filter(tieneAlerta).length;
  if (totalConAlerta > 0) {
    btnAlertas.style.display = "";
    if (filtroAlertasActivo) {
      btnAlertas.classList.add("btn-alerta-activo");
      btnAlertas.textContent = "⚠ Alertas (" + filtradas.length + ") ✕";
    } else {
      btnAlertas.classList.remove("btn-alerta-activo");
      btnAlertas.textContent = "⚠ Alertas (" + totalConAlerta + ")";
    }
  } else {
    btnAlertas.style.display = "none";
  }
}

async function cargarListado(empresaId) {
  const sinDatos = document.getElementById("sin-datos");
  const btnCargar = document.getElementById("btn-cargar-listado");
  FACTURAS_ACTUALES = [];
  // Orden por defecto: fecha más reciente primero
  sortStateFacturas.key = "fecha_factura";
  sortStateFacturas.dir = "desc";
  filtroAlertasActivo = false;
  document.getElementById("btn-filtro-alertas").style.display = "none";
  document.getElementById("tbody-facturas").innerHTML = "";
  document.getElementById("contador").textContent = "";
  sinDatos.style.display = "none";
  if (btnCargar) { btnCargar.classList.add("btn-loading"); }

  try {
    const resp = await fetch("/api/facturas?empresa_id=" + encodeURIComponent(empresaId));
    const json = await resp.json();
    const facturas = json.facturas || [];
    FACTURAS_ACTUALES = facturas;
    if (!facturas.length) {
      sinDatos.style.display = "block";
      return;
    }
    poblarFiltroAnio(facturas);
    var filtroEstadoPago = document.getElementById("filtro-estado-pago");
    if (filtroEstadoPago) filtroEstadoPago.value = "";
    const selTarjeta = document.getElementById("filtro-tarjeta");
    if (selTarjeta) {
      selTarjeta.innerHTML = "<option value=\"\">Pagado v\u00eda</option><option value=\"__banco__\">Banco (sin tarjeta)</option>";
      try {
        const r = await fetch("/api/empresas/" + encodeURIComponent(empresaId) + "/tarjetas?solo_activas=true");
        const data = await r.json();
        (data.tarjetas || []).forEach((t) => {
          const opt = document.createElement("option");
          opt.value = String(t.id != null ? t.id : "");
          opt.textContent = (t.alias || "").trim() || (t.banco || "") + " " + (t.persona || "") || "Tarjeta " + t.id;
          selTarjeta.appendChild(opt);
        });
      } catch (e) { /* ignorar */ }
    }
    aplicarFiltrosYRender();
  } catch (err) {
    console.error("Error cargando listado de facturas:", err);
    sinDatos.textContent = "No se pudo cargar el listado. Comprueba que el backend está en marcha.";
    sinDatos.style.display = "block";
  } finally {
    if (btnCargar) { btnCargar.classList.remove("btn-loading"); }
  }
}

/**
 * Carga el listado filtrado solo por las facturas recién procesadas (por IDs).
 * Muestra un banner informativo con opción de ver el listado completo.
 * tipo: "proveedores" o "clientes"
 */
async function cargarListadoFiltradoPorIds(empresaId, ids, tipo) {
  if (!ids || ids.length === 0) {
    if (tipo === "clientes") cargarListadoCli(empresaId);
    else cargarListado(empresaId);
    return;
  }
  var idsSet = {};
  ids.forEach(function (id) { idsSet[id] = true; });
  try {
    if (tipo === "clientes") {
      var resp = await fetch("/api/facturas_clientes?empresa_id=" + encodeURIComponent(empresaId));
      var json = await resp.json();
      var todas = json.facturas || [];
      var nuevas = todas.filter(function (f) { return idsSet[f.id]; });
      CLI_FACTURAS = nuevas;
      var bannerEl = document.getElementById("cli-sin-datos");
      if (nuevas.length > 0) {
        var bannerHtml = "<div class=\"banner-facturas-nuevas\" style=\"background:#EFF6FF;border:1px solid #3B82F6;border-radius:8px;padding:12px 16px;margin-bottom:12px;display:flex;align-items:center;gap:12px;\">"
          + "<span style=\"color:#1D4ED8;font-weight:600;\">Se han procesado " + nuevas.length + " factura" + (nuevas.length !== 1 ? "s" : "") + " nueva" + (nuevas.length !== 1 ? "s" : "") + ". Rev\u00edsalas a continuaci\u00f3n.</span>"
          + "<button type=\"button\" class=\"btn-small\" id=\"cli-ver-listado-completo\" style=\"margin-left:auto;\">Ver listado completo</button>"
          + "</div>";
        bannerEl.innerHTML = bannerHtml;
        bannerEl.style.display = "block";
        document.getElementById("cli-ver-listado-completo").addEventListener("click", function () {
          bannerEl.style.display = "none";
          cargarListadoCli(empresaId);
        });
        poblarFiltroAnioCli();
        renderTablaClientesFacturas();
      } else {
        bannerEl.innerHTML = "<div style=\"background:#EFF6FF;border:1px solid #3B82F6;border-radius:8px;padding:12px 16px;color:#1D4ED8;font-weight:600;\">No se han a\u00f1adido facturas nuevas (todas duplicadas).</div>";
        bannerEl.style.display = "block";
      }
    } else {
      var resp = await fetch("/api/facturas?empresa_id=" + encodeURIComponent(empresaId));
      var json = await resp.json();
      var todas = json.facturas || [];
      var nuevas = todas.filter(function (f) { return idsSet[f.id]; });
      FACTURAS_ACTUALES = nuevas;
      var sinDatos = document.getElementById("sin-datos");
      if (nuevas.length > 0) {
        var bannerHtml = "<div class=\"banner-facturas-nuevas\" style=\"background:#EFF6FF;border:1px solid #3B82F6;border-radius:8px;padding:12px 16px;margin-bottom:12px;display:flex;align-items:center;gap:12px;\">"
          + "<span style=\"color:#1D4ED8;font-weight:600;\">Se han procesado " + nuevas.length + " factura" + (nuevas.length !== 1 ? "s" : "") + " nueva" + (nuevas.length !== 1 ? "s" : "") + ". Rev\u00edsalas a continuaci\u00f3n.</span>"
          + "<button type=\"button\" class=\"btn-small\" id=\"prov-ver-listado-completo\" style=\"margin-left:auto;\">Ver listado completo</button>"
          + "</div>";
        sinDatos.innerHTML = bannerHtml;
        sinDatos.style.display = "block";
        document.getElementById("prov-ver-listado-completo").addEventListener("click", function () {
          sinDatos.style.display = "none";
          cargarListado(empresaId);
        });
        poblarFiltroAnio(nuevas);
        aplicarFiltrosYRender();
      } else {
        sinDatos.innerHTML = "<div style=\"background:#EFF6FF;border:1px solid #3B82F6;border-radius:8px;padding:12px 16px;color:#1D4ED8;font-weight:600;\">No se han a\u00f1adido facturas nuevas (todas duplicadas).</div>";
        sinDatos.style.display = "block";
      }
    }
  } catch (e) {
    console.error("Error cargando listado filtrado:", e);
    if (tipo === "clientes") cargarListadoCli(empresaId);
    else cargarListado(empresaId);
  }
}

document.getElementById("btn-cargar-listado").addEventListener("click", () => {
  const emp = document.getElementById("empresa-listado").value;
  if (!emp) {
    mostrarToast("Elige primero una empresa.", "error");
    return;
  }
  cargarListado(emp);
});

document.getElementById("empresa-listado").addEventListener("change", () => {
  const emp = document.getElementById("empresa-listado").value;
  if (emp) cargarListado(emp);
});

document.getElementById("filtro-anio").addEventListener("change", aplicarFiltrosYRender);
document.getElementById("filtro-mes").addEventListener("change", aplicarFiltrosYRender);
var filtroEstadoPagoEl = document.getElementById("filtro-estado-pago");
var filtroTarjetaEl = document.getElementById("filtro-tarjeta");
if (filtroEstadoPagoEl) filtroEstadoPagoEl.addEventListener("change", aplicarFiltrosYRender);
if (filtroTarjetaEl) filtroTarjetaEl.addEventListener("change", aplicarFiltrosYRender);

document.getElementById("btn-filtro-alertas").addEventListener("click", () => {
  filtroAlertasActivo = !filtroAlertasActivo;
  aplicarFiltrosYRender();
});

document.getElementById("btn-eliminar-seleccionadas").addEventListener("click", async () => {
  const checks = document.querySelectorAll("#tbody-facturas .check-factura:checked");
  if (!checks.length) return;
  const emp = document.getElementById("empresa-listado").value;
  if (!emp) {
    mostrarToast("No hay empresa seleccionada.", "error");
    return;
  }
  const n = checks.length;
  if (!confirm("¿Seguro que quieres eliminar " + n + (n === 1 ? " factura" : " facturas") + "? Esta acción no se puede deshacer.")) return;
  const rutas = Array.from(checks).map((cb) => cb.dataset.ruta).filter(Boolean);
  if (!rutas.length) {
    mostrarToast("Las facturas seleccionadas no tienen ruta identificable.", "error");
    return;
  }
  try {
    const resp = await fetch("/api/facturas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: emp, rutas }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Error al eliminar");
    }
    const json = await resp.json();
    mostrarToast(json.mensaje || "Facturas eliminadas.", "success");
    cargarListado(emp);
  } catch (err) {
    mostrarToast(err.message || "No se pudieron eliminar las facturas.", "error");
  }
});

document.getElementById("btn-exportar").addEventListener("click", () => {
  const emp = document.getElementById("empresa-listado").value;
  if (!emp) {
    mostrarToast("Elige primero una empresa para exportar.", "error");
    return;
  }
  const checks = document.querySelectorAll("#tbody-facturas .check-factura:checked");
  if (!checks.length) {
    mostrarToast("Selecciona al menos una factura para descargar.", "info");
    return;
  }
  const ids = Array.from(checks).map(cb => cb.dataset.id).filter(Boolean).join(",");
  const anio = document.getElementById("filtro-anio").value || "";
  const mes = document.getElementById("filtro-mes").value || "";
  const filtroEstadoPago = document.getElementById("filtro-estado-pago");
  const filtroTarjeta = document.getElementById("filtro-tarjeta");
  const estadoPago = (filtroEstadoPago && filtroEstadoPago.value) ? filtroEstadoPago.value : "";
  const tarjetaId = (filtroTarjeta && filtroTarjeta.value) ? filtroTarjeta.value : "";
  let url =
    "/api/facturas_export?empresa_id=" +
    encodeURIComponent(emp) +
    "&year=" +
    encodeURIComponent(anio) +
    "&month=" +
    encodeURIComponent(mes);
  if (ids) url += "&ids=" + ids;
  if (estadoPago) url += "&estado_pago=" + encodeURIComponent(estadoPago);
  if (tarjetaId) url += "&tarjeta_id=" + encodeURIComponent(tarjetaId);
  window.open(url, "_blank");
});

document.getElementById("btn-descargar-facturas").addEventListener("click", () => {
  const emp = document.getElementById("empresa-listado").value;
  if (!emp) {
    mostrarToast("Elige primero una empresa para descargar las facturas.", "error");
    return;
  }
  const checks = document.querySelectorAll("#tbody-facturas .check-factura:checked");
  if (!checks.length) {
    mostrarToast("Selecciona al menos una factura para descargar.", "info");
    return;
  }
  const ids = Array.from(checks).map(cb => cb.dataset.id).filter(Boolean).join(",");
  const anio = document.getElementById("filtro-anio").value || "";
  const mes = document.getElementById("filtro-mes").value || "";
  const filtroEstadoPago = document.getElementById("filtro-estado-pago");
  const filtroTarjeta = document.getElementById("filtro-tarjeta");
  const estadoPago = (filtroEstadoPago && filtroEstadoPago.value) ? filtroEstadoPago.value : "";
  const tarjetaId = (filtroTarjeta && filtroTarjeta.value) ? filtroTarjeta.value : "";
  let url =
    "/api/facturas_zip?empresa_id=" +
    encodeURIComponent(emp) +
    "&year=" +
    encodeURIComponent(anio) +
    "&month=" +
    encodeURIComponent(mes);
  if (ids) url += "&ids=" + ids;
  if (estadoPago) url += "&estado_pago=" + encodeURIComponent(estadoPago);
  if (tarjetaId) url += "&tarjeta_id=" + encodeURIComponent(tarjetaId);
  window.location.href = url;
});

// --- Panel CeCos: asignar centro de coste por proveedor ---
const empresaCecosEl = document.getElementById("empresa-cecos");
const tbodyCecos = document.getElementById("tbody-cecos");
const cecosMensaje = document.getElementById("cecos-mensaje");
const cecosCentrosWrapper = document.getElementById("cecos-centros-wrapper");
const cecosCentrosList = document.getElementById("cecos-centros-list");
let CECOS_PROVEEDORES = [];
let CECOS_EMPRESA_ACTUAL = "";
let cecosFiltroActivo = "";

function renderTablaCecos(filtro) {
  tbodyCecos.innerHTML = "";
  const emp = CECOS_EMPRESA_ACTUAL;
  let pendientes = 0;
  let visibles = 0;

  CECOS_PROVEEDORES.forEach((p) => {
    const nombre = (p.nombre_canonico || "").trim() || "Sin nombre";
    const nif = (p.nif || "").trim();
    const ceco = (p.centro_coste || "").trim();

    if (filtro === "__sin_asignar__") {
      if (ceco) return;
    } else if (filtro && ceco !== filtro) {
      return;
    }

    visibles++;
    const tr = document.createElement("tr");

    const tdNombre = document.createElement("td");
    tdNombre.textContent = nombre;
    tr.appendChild(tdNombre);

    const tdNif = document.createElement("td");
    tdNif.textContent = nif || "—";
    tr.appendChild(tdNif);

    const tdCeco = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.value = ceco;
    input.placeholder = "p. ej. Marketing, IT, Administración…";
    tdCeco.appendChild(input);
    tr.appendChild(tdCeco);

    const tdAccion = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-guardar-ceco";
    btn.textContent = "Guardar";
    btn.addEventListener("click", async () => {
      const nuevoCeco = input.value.trim();
      try {
        const r = await fetch("/api/proveedor_ceco", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            empresa_id: emp,
            proveedor: nombre,
            centro_coste: nuevoCeco,
          }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || "No se pudo guardar el centro de coste.");
        }
        cecosMensaje.textContent = `Centro de coste guardado para ${nombre}.`;
        empresaCecosEl.dispatchEvent(new Event("change"));
        mostrarToast("Centro de coste guardado correctamente.", "success");
      } catch (e) {
        mostrarToast(e.message || "Error al guardar el centro de coste.", "error");
      }
    });
    tdAccion.appendChild(btn);
    tr.appendChild(tdAccion);

    if (ceco) {
      tr.classList.add("fila-ceco-asignado");
    } else {
      tr.classList.add("fila-ceco-pendiente");
      pendientes += 1;
    }

    tbodyCecos.appendChild(tr);
  });

  if (filtro) {
    cecosMensaje.textContent = visibles + " proveedor(es) mostrados.";
  } else {
    if (pendientes > 0) {
      cecosMensaje.textContent = `${pendientes} proveedor(es) sin centro de coste asignado.`;
    } else {
      cecosMensaje.textContent = "Todos los proveedores tienen centro de coste asignado.";
    }
  }
}

function renderPillsCecos() {
  cecosCentrosList.innerHTML = "";
  const centrosSet = new Set();
  let sinAsignar = 0;
  CECOS_PROVEEDORES.forEach((p) => {
    const ceco = (p.centro_coste || "").trim();
    if (ceco) centrosSet.add(ceco);
    else sinAsignar++;
  });
  const centrosOrdenados = Array.from(centrosSet).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase(), "es")
  );
  if (!centrosOrdenados.length && !sinAsignar) {
    cecosCentrosWrapper.style.display = "none";
    return;
  }
  cecosCentrosWrapper.style.display = "block";

  const pillTodos = document.createElement("span");
  pillTodos.className = "cecos-centro-pill" + (!cecosFiltroActivo ? " activo" : "");
  pillTodos.textContent = "Todos";
  pillTodos.addEventListener("click", () => {
    cecosFiltroActivo = "";
    renderPillsCecos();
    renderTablaCecos("");
  });
  cecosCentrosList.appendChild(pillTodos);

  centrosOrdenados.forEach((c) => {
    const pill = document.createElement("span");
    pill.className = "cecos-centro-pill" + (cecosFiltroActivo === c ? " activo" : "");
    pill.textContent = c;
    pill.addEventListener("click", () => {
      cecosFiltroActivo = cecosFiltroActivo === c ? "" : c;
      renderPillsCecos();
      renderTablaCecos(cecosFiltroActivo);
    });
    cecosCentrosList.appendChild(pill);
  });

  if (sinAsignar > 0) {
    const pillSin = document.createElement("span");
    pillSin.className = "cecos-centro-pill" + (cecosFiltroActivo === "__sin_asignar__" ? " activo" : "");
    pillSin.textContent = "Sin asignar (" + sinAsignar + ")";
    pillSin.addEventListener("click", () => {
      cecosFiltroActivo = cecosFiltroActivo === "__sin_asignar__" ? "" : "__sin_asignar__";
      renderPillsCecos();
      renderTablaCecos(cecosFiltroActivo);
    });
    cecosCentrosList.appendChild(pillSin);
  }
}

empresaCecosEl.addEventListener("change", async () => {
  const emp = empresaCecosEl.value;
  CECOS_EMPRESA_ACTUAL = emp;
  CECOS_PROVEEDORES = [];
  cecosFiltroActivo = "";
  tbodyCecos.innerHTML = "";
  cecosMensaje.textContent = "";
  cecosCentrosList.innerHTML = "";
  cecosCentrosWrapper.style.display = "none";
  if (!emp) return;
  try {
    const resp = await fetch("/api/proveedores?empresa_id=" + encodeURIComponent(emp));
    const json = await resp.json();
    let proveedores = json.proveedores || [];
    proveedores = proveedores
      .slice()
      .sort((a, b) =>
        ((a.nombre_canonico || "").trim() || "Sin nombre")
          .toLowerCase()
          .localeCompare(
            ((b.nombre_canonico || "").trim() || "Sin nombre").toLowerCase(),
            "es"
          )
      );
    if (!proveedores.length) {
      cecosMensaje.textContent = "No hay proveedores maestros aún para esta empresa.";
      return;
    }
    CECOS_PROVEEDORES = proveedores;
    renderPillsCecos();
    renderTablaCecos("");
  } catch (e) {
    cecosMensaje.textContent = "No se pudieron cargar los proveedores para esta empresa.";
  }
});

// --- Bloque Proveedores: listado único y facturas del proveedor seleccionado ---
const empresaProveedoresEl = document.getElementById("empresa-proveedores");
const listaProveedoresEl = document.getElementById("lista-proveedores");
const tablaFacturasProveedorWrapper = document.getElementById("tabla-facturas-proveedor-wrapper");
const tbodyFacturasProveedor = document.getElementById("tbody-facturas-proveedor");
const sinSeleccionEl = document.getElementById("proveedores-sin-seleccion");
const contadorFacturasProveedor = document.getElementById("contador-facturas-proveedor");
const tituloFacturasProveedor = document.getElementById("titulo-facturas-proveedor");

let FACTURAS_PROVEEDOR_ACTUALES = [];
let proveedorSeleccionadoNombre = "";
const sortStateProveedores = { key: "", dir: "asc" };
const proveedoresFiltrosWrap = document.getElementById("proveedores-filtros-wrap");
const filtroAnioProveedor = document.getElementById("filtro-anio-proveedor");
const filtroMesProveedor = document.getElementById("filtro-mes-proveedor");
const filtroEstadoPagoProveedor = document.getElementById("filtro-estado-pago-proveedor");
const filtroTarjetaProveedor = document.getElementById("filtro-tarjeta-proveedor");

empresaProveedoresEl.addEventListener("change", async () => {
  const emp = empresaProveedoresEl.value;
  listaProveedoresEl.innerHTML = "";
  tablaFacturasProveedorWrapper.style.display = "none";
  proveedoresFiltrosWrap.style.display = "none";
  sinSeleccionEl.style.display = "block";
  sinSeleccionEl.textContent = "Selecciona un proveedor de la lista.";
  tituloFacturasProveedor.textContent = "Facturas del proveedor seleccionado";
  contadorFacturasProveedor.textContent = "";
  FACTURAS_PROVEEDOR_ACTUALES = [];
  proveedorSeleccionadoNombre = "";
  if (!emp) return;
  listaProveedoresEl.innerHTML = "<div class=\"lista-loading\"><div class=\"spinner\"></div>Cargando…</div>";
  try {
    const resp = await fetch("/api/proveedores?empresa_id=" + encodeURIComponent(emp) + "&solo_con_facturas=1");
    const json = await resp.json();
    listaProveedoresEl.innerHTML = "";
    const proveedores = (json.proveedores || []).slice().sort((a, b) => {
      const na = ((a.nombre_canonico || "").trim() || "Sin nombre").toLowerCase();
      const nb = ((b.nombre_canonico || "").trim() || "Sin nombre").toLowerCase();
      return na.localeCompare(nb, "es");
    });
    proveedores.forEach((p) => {
      const nombre = (p.nombre_canonico || "").trim() || "Sin nombre";
      const nif = (p.nif || "").trim();
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = nif ? nombre + " (" + nif + ")" : nombre;
      span.addEventListener("click", () => {
        Array.from(listaProveedoresEl.querySelectorAll("li")).forEach((el) => el.classList.remove("seleccionado"));
        li.classList.add("seleccionado");
        cargarFacturasProveedor(emp, nombre);
      });
      li.appendChild(span);
      const btnEditar = document.createElement("button");
      btnEditar.type = "button";
      btnEditar.className = "btn-editar-proveedor";
      btnEditar.textContent = "Editar";
      btnEditar.setAttribute("aria-label", "Editar " + nombre);
      btnEditar.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirModalEditarProveedor(emp, p);
      });
      li.appendChild(btnEditar);
      listaProveedoresEl.appendChild(li);
    });
  } catch (err) {
    listaProveedoresEl.innerHTML = "<li style=\"cursor:default;color:#94a3b8;\">No se pudo cargar el listado.</li>";
  }
});

const modalProveedorEl = document.getElementById("modal-proveedor");
const formProveedorEl = document.getElementById("form-proveedor");
const modalProveedorTitulo = document.getElementById("modal-proveedor-titulo");
let modalProveedorModo = "nuevo";

var btnEliminarProveedorEl = document.getElementById("btn-eliminar-proveedor");

function abrirModalNuevoProveedor(empresaId) {
  if (!empresaId) {
    mostrarToast("Selecciona primero una empresa.", "error");
    return;
  }
  modalProveedorModo = "nuevo";
  modalProveedorTitulo.textContent = "Nuevo proveedor";
  document.getElementById("proveedor-empresa-id").value = empresaId;
  document.getElementById("proveedor-empresa-readonly").value = empresaProveedoresEl.options[empresaProveedoresEl.selectedIndex]?.text || empresaId;
  document.getElementById("proveedor-old-nombre").value = "";
  document.getElementById("proveedor-old-nif").value = "";
  document.getElementById("proveedor-nombre").value = "";
  document.getElementById("proveedor-nif").value = "";
  document.getElementById("proveedor-direccion").value = "";
  document.getElementById("proveedor-localidad").value = "";
  document.getElementById("proveedor-pais").value = "";
  document.getElementById("proveedor-email").value = "";
  document.getElementById("proveedor-telefono").value = "";
  document.getElementById("proveedor-centro-coste").value = "";
  if (btnEliminarProveedorEl) btnEliminarProveedorEl.style.display = "none";
  modalProveedorEl.classList.add("visible");
  modalProveedorEl.setAttribute("aria-hidden", "false");
  document.getElementById("proveedor-nombre").focus();
}

function abrirModalEditarProveedor(empresaId, p) {
  modalProveedorModo = "editar";
  modalProveedorTitulo.textContent = "Editar proveedor";
  document.getElementById("proveedor-empresa-id").value = empresaId;
  document.getElementById("proveedor-empresa-readonly").value = empresaProveedoresEl.options[empresaProveedoresEl.selectedIndex]?.text || empresaId;
  document.getElementById("proveedor-old-nombre").value = (p.nombre_canonico || "").trim();
  document.getElementById("proveedor-old-nif").value = (p.nif || "").trim();
  document.getElementById("proveedor-nombre").value = (p.nombre_canonico || "").trim();
  document.getElementById("proveedor-nif").value = (p.nif || "").trim();
  document.getElementById("proveedor-direccion").value = (p.direccion || "").trim();
  document.getElementById("proveedor-localidad").value = (p.localidad || "").trim();
  document.getElementById("proveedor-pais").value = (p.pais || "").trim();
  document.getElementById("proveedor-email").value = (p.email || "").trim();
  document.getElementById("proveedor-telefono").value = (p.telefono || "").trim();
  document.getElementById("proveedor-centro-coste").value = (p.centro_coste || "").trim();
  if (btnEliminarProveedorEl) btnEliminarProveedorEl.style.display = "inline-block";
  modalProveedorEl.classList.add("visible");
  modalProveedorEl.setAttribute("aria-hidden", "false");
  document.getElementById("proveedor-nombre").focus();
}

function cerrarModalProveedor() {
  modalProveedorEl.classList.remove("visible");
  modalProveedorEl.setAttribute("aria-hidden", "true");
}

async function refrescarListaProveedores() {
  const emp = empresaProveedoresEl.value;
  if (!emp) return;
  try {
    const resp = await fetch("/api/proveedores?empresa_id=" + encodeURIComponent(emp) + "&solo_con_facturas=1");
    const json = await resp.json();
    const proveedores = (json.proveedores || []).slice().sort((a, b) => {
      const na = ((a.nombre_canonico || "").trim() || "Sin nombre").toLowerCase();
      const nb = ((b.nombre_canonico || "").trim() || "Sin nombre").toLowerCase();
      return na.localeCompare(nb, "es");
    });
    listaProveedoresEl.innerHTML = "";
    proveedores.forEach((p) => {
      const nombre = (p.nombre_canonico || "").trim() || "Sin nombre";
      const nif = (p.nif || "").trim();
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = nif ? nombre + " (" + nif + ")" : nombre;
      span.addEventListener("click", () => {
        Array.from(listaProveedoresEl.querySelectorAll("li")).forEach((el) => el.classList.remove("seleccionado"));
        li.classList.add("seleccionado");
        cargarFacturasProveedor(emp, nombre);
      });
      li.appendChild(span);
      const btnEditar = document.createElement("button");
      btnEditar.type = "button";
      btnEditar.className = "btn-editar-proveedor";
      btnEditar.textContent = "Editar";
      btnEditar.setAttribute("aria-label", "Editar " + nombre);
      btnEditar.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirModalEditarProveedor(emp, p);
      });
      li.appendChild(btnEditar);
      listaProveedoresEl.appendChild(li);
    });
  } catch (err) {
    listaProveedoresEl.innerHTML = "<li style=\"cursor:default;color:#94a3b8;\">No se pudo actualizar el listado.</li>";
  }
}

document.getElementById("btn-nuevo-proveedor").addEventListener("click", () => {
  abrirModalNuevoProveedor(empresaProveedoresEl.value);
});

const btnSincronizarFacturasProveedores = document.getElementById("btn-sincronizar-facturas-proveedores");
if (btnSincronizarFacturasProveedores) {
  btnSincronizarFacturasProveedores.addEventListener("click", async () => {
    const empresaId = empresaProveedoresEl.value.trim();
    const body = empresaId ? { empresa_id: empresaId } : {};
    btnSincronizarFacturasProveedores.disabled = true;
    try {
      const resp = await fetch("/api/proveedores/sincronizar-facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) {
        mostrarToast(data.error || "Error al sincronizar.", "error");
        return;
      }
      mostrarToast(data.mensaje || "Sincronización completada.", "success");
      await refrescarListaProveedores();
      if (empresaId && proveedorSeleccionadoNombre) {
        await cargarFacturasProveedor(empresaId, proveedorSeleccionadoNombre);
      }
    } catch (err) {
      mostrarToast("Error de conexión al sincronizar.", "error");
    } finally {
      btnSincronizarFacturasProveedores.disabled = false;
    }
  });
}

document.getElementById("btn-cancelar-proveedor").addEventListener("click", cerrarModalProveedor);

if (btnEliminarProveedorEl) {
  btnEliminarProveedorEl.addEventListener("click", async () => {
    const empresaId = document.getElementById("proveedor-empresa-id").value.trim();
    const nombre = document.getElementById("proveedor-old-nombre").value.trim();
    const nif = document.getElementById("proveedor-old-nif").value.trim();
    if (!empresaId || (!nombre && !nif)) return;
    if (!confirm("¿Eliminar este proveedor del maestro? Las facturas que lo referencian no se borran, pero dejará de aparecer en el listado único.")) return;
    try {
      const resp = await fetch("/api/proveedores", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, nombre_canonico: nombre, nif: nif }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        mostrarToast(data.error || "Error al eliminar.", "error");
        return;
      }
      cerrarModalProveedor();
      await refrescarListaProveedores();
      mostrarToast(data.mensaje || "Proveedor eliminado del maestro.", "success");
    } catch (err) {
      mostrarToast("Error de conexión al eliminar.", "error");
    }
  });
}

formProveedorEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const empresaId = document.getElementById("proveedor-empresa-id").value.trim();
  const nombre = document.getElementById("proveedor-nombre").value.trim();
  const nif = document.getElementById("proveedor-nif").value.trim();
  if (!empresaId && modalProveedorModo === "nuevo") {
    mostrarToast("La empresa es obligatoria.", "error");
    return;
  }
  if (!nombre) {
    var _pn = document.getElementById("proveedor-nombre");
    marcarCampoError(_pn, "El nombre del proveedor es obligatorio");
    mostrarToast("El nombre del proveedor es obligatorio.", "error");
    _pn.focus();
    return;
  }
  if (!nif) {
    var _pnif = document.getElementById("proveedor-nif");
    marcarCampoError(_pnif, "El NIF/CIF es obligatorio");
    mostrarToast("El NIF/CIF del proveedor es obligatorio.", "error");
    _pnif.focus();
    return;
  }
  const body = {
    empresa_id: empresaId,
    nombre_canonico: nombre,
    nif: nif,
    direccion: document.getElementById("proveedor-direccion").value.trim(),
    localidad: document.getElementById("proveedor-localidad").value.trim(),
    pais: document.getElementById("proveedor-pais").value.trim(),
    email: document.getElementById("proveedor-email").value.trim(),
    telefono: document.getElementById("proveedor-telefono").value.trim(),
    centro_coste: document.getElementById("proveedor-centro-coste").value.trim(),
  };
  if (modalProveedorModo === "editar") {
    body.old_nombre_canonico = document.getElementById("proveedor-old-nombre").value;
    body.old_nif = document.getElementById("proveedor-old-nif").value;
  }
  try {
    const url = modalProveedorModo === "nuevo" ? "/api/proveedores" : "/api/proveedores";
    const method = modalProveedorModo === "nuevo" ? "POST" : "PUT";
    const resp = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) {
      mostrarToast(data.error || "Error al guardar el proveedor.", "error");
      return;
    }
    if (typeof window.AL_CERRAR_PROVEEDOR_DESDE_FACTURA === "function") {
      window.AL_CERRAR_PROVEEDOR_DESDE_FACTURA(data);
    }
    cerrarModalProveedor();
    await refrescarListaProveedores();
    mostrarToast("Proveedor guardado correctamente.", "success");
  } catch (err) {
    mostrarToast("Error de conexión al guardar el proveedor.", "error");
  }
});

function poblarFiltroAnioProveedor(facturas) {
  const valores = new Set();
  facturas.forEach((f) => {
    const fecha = (f.fecha_factura || "").toString().slice(0, 4);
    if (fecha && /^\d{4}$/.test(fecha)) valores.add(fecha);
  });
  const actuales = new Set(
    Array.from(filtroAnioProveedor.options).map((o) => o.value).filter(Boolean)
  );
  if (valores.size && (valores.size !== actuales.size || !actuales.size)) {
    filtroAnioProveedor.innerHTML = "<option value=\"\">Todos los años</option>";
    Array.from(valores).sort().forEach((y) => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      filtroAnioProveedor.appendChild(opt);
    });
  }
}

function aplicarFiltrosProveedorYRender() {
  const anio = filtroAnioProveedor.value;
  const mes = filtroMesProveedor.value;
  const estadoPago = (filtroEstadoPagoProveedor && filtroEstadoPagoProveedor.value) || "";
  const tarjetaId = (filtroTarjetaProveedor && filtroTarjetaProveedor.value) || "";
  let filtradas = FACTURAS_PROVEEDOR_ACTUALES.slice();
  if (anio) {
    filtradas = filtradas.filter((f) =>
      (f.fecha_factura || "").toString().startsWith(anio)
    );
  }
  if (mes) {
    filtradas = filtradas.filter((f) => {
      const fecha = (f.fecha_factura || "").toString();
      return fecha.length >= 7 && fecha.slice(5, 7) === mes;
    });
  }
  if (estadoPago) {
    filtradas = filtradas.filter((f) =>
      ((f.estado_pago || "").toString().trim() || "pendiente") === estadoPago
    );
  }
  if (tarjetaId) {
    filtradas = filtradas.filter((f) => String(f.tarjeta_id || "") === tarjetaId);
  }
  if (sortStateProveedores.key) {
    filtradas = ordenarFacturas(filtradas, sortStateProveedores.key, sortStateProveedores.dir);
  }
  const theadTr = document.querySelector("#tabla-facturas-proveedor thead tr");
  renderTheadSortable(theadTr, false, sortStateProveedores, aplicarFiltrosProveedorYRender);
  renderFacturasEnTbody(tbodyFacturasProveedor, filtradas, false, sortStateProveedores, aplicarFiltrosProveedorYRender);
  contadorFacturasProveedor.textContent = filtradas.length + (filtradas.length === 1 ? " factura" : " facturas");
}

async function cargarFacturasProveedor(empresaId, nombreProveedor) {
  sinSeleccionEl.style.display = "none";
  contadorFacturasProveedor.textContent = "Cargando…";
  proveedoresFiltrosWrap.style.display = "none";
  // Orden por defecto: fecha más reciente primero
  sortStateProveedores.key = "fecha_factura";
  sortStateProveedores.dir = "desc";
  try {
    const url = "/api/facturas?empresa_id=" + encodeURIComponent(empresaId) + "&proveedor=" + encodeURIComponent(nombreProveedor);
    const resp = await fetch(url);
    const json = await resp.json();
    const facturas = json.facturas || [];
    FACTURAS_PROVEEDOR_ACTUALES = facturas;
    proveedorSeleccionadoNombre = nombreProveedor;
    poblarFiltroAnioProveedor(facturas);
    filtroMesProveedor.value = "";
    if (filtroEstadoPagoProveedor) filtroEstadoPagoProveedor.value = "";
    if (filtroTarjetaProveedor) {
      filtroTarjetaProveedor.innerHTML = "<option value=\"\">Todas las tarjetas</option>";
      try {
        const r = await fetch("/api/empresas/" + encodeURIComponent(empresaId) + "/tarjetas?solo_activas=true");
        const data = await r.json();
        (data.tarjetas || []).forEach((t) => {
          const opt = document.createElement("option");
          opt.value = String(t.id != null ? t.id : "");
          opt.textContent = (t.alias || "").trim() || (t.banco || "") + " " + (t.persona || "") || "Tarjeta " + t.id;
          filtroTarjetaProveedor.appendChild(opt);
        });
      } catch (e) { /* ignorar */ }
    }
    aplicarFiltrosProveedorYRender();
    tituloFacturasProveedor.textContent = "Facturas de " + nombreProveedor;
    proveedoresFiltrosWrap.style.display = "flex";
    tablaFacturasProveedorWrapper.style.display = "block";
  } catch (err) {
    contadorFacturasProveedor.textContent = "";
    sinSeleccionEl.style.display = "block";
    sinSeleccionEl.textContent = "No se pudo cargar las facturas de este proveedor.";
  }
}

filtroAnioProveedor.addEventListener("change", aplicarFiltrosProveedorYRender);
filtroMesProveedor.addEventListener("change", aplicarFiltrosProveedorYRender);
if (filtroEstadoPagoProveedor) filtroEstadoPagoProveedor.addEventListener("change", aplicarFiltrosProveedorYRender);
if (filtroTarjetaProveedor) filtroTarjetaProveedor.addEventListener("change", aplicarFiltrosProveedorYRender);

document.getElementById("btn-exportar-proveedor").addEventListener("click", () => {
  const emp = empresaProveedoresEl.value;
  if (!emp || !proveedorSeleccionadoNombre) {
    mostrarToast("Elige empresa y un proveedor.", "error");
    return;
  }
  const anio = filtroAnioProveedor.value || "";
  const mes = filtroMesProveedor.value || "";
  const estadoPago = (filtroEstadoPagoProveedor && filtroEstadoPagoProveedor.value) ? filtroEstadoPagoProveedor.value : "";
  const tarjetaId = (filtroTarjetaProveedor && filtroTarjetaProveedor.value) ? filtroTarjetaProveedor.value : "";
  let url = "/api/facturas_export?empresa_id=" + encodeURIComponent(emp) +
    "&proveedor=" + encodeURIComponent(proveedorSeleccionadoNombre) +
    "&year=" + encodeURIComponent(anio) + "&month=" + encodeURIComponent(mes);
  if (estadoPago) url += "&estado_pago=" + encodeURIComponent(estadoPago);
  if (tarjetaId) url += "&tarjeta_id=" + encodeURIComponent(tarjetaId);
  window.open(url, "_blank");
});

document.getElementById("btn-descargar-facturas-proveedor").addEventListener("click", () => {
  const emp = empresaProveedoresEl.value;
  if (!emp || !proveedorSeleccionadoNombre) {
    mostrarToast("Elige empresa y un proveedor.", "error");
    return;
  }
  const anio = filtroAnioProveedor.value || "";
  const mes = filtroMesProveedor.value || "";
  const estadoPago = (filtroEstadoPagoProveedor && filtroEstadoPagoProveedor.value) ? filtroEstadoPagoProveedor.value : "";
  const tarjetaId = (filtroTarjetaProveedor && filtroTarjetaProveedor.value) ? filtroTarjetaProveedor.value : "";
  let url = "/api/facturas_zip?empresa_id=" + encodeURIComponent(emp) +
    "&proveedor=" + encodeURIComponent(proveedorSeleccionadoNombre) +
    "&year=" + encodeURIComponent(anio) + "&month=" + encodeURIComponent(mes);
  if (estadoPago) url += "&estado_pago=" + encodeURIComponent(estadoPago);
  if (tarjetaId) url += "&tarjeta_id=" + encodeURIComponent(tarjetaId);
  window.location.href = url;
});

let facturaEdicion = null;
let PROVEEDORES_EN_EDICION = [];

async function cargarTarjetasEnSelectorEdicion(empId, facturaActual) {
  var selTar = document.getElementById("ed-tarjeta");
  if (!selTar) return;
  selTar.innerHTML = "<option value=\"\">Sin tarjeta / pago directo</option>";
  if (!empId) return;
  try {
    var resp = await fetch("/api/empresas/" + encodeURIComponent(empId) + "/tarjetas?solo_activas=true");
    var data = await resp.json();
    var tarjetas = (data.tarjetas || []).slice().sort(function (a, b) {
      var ta = ((a.banco || "") + " " + (a.persona || "")).toLowerCase();
      var tb = ((b.banco || "") + " " + (b.persona || "")).toLowerCase();
      return ta.localeCompare(tb, "es");
    });
    tarjetas.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = String(t.id);
      var ult4 = (t.ultimos4 || "").trim();
      var alias = (t.alias || "").trim();
      var label = (t.banco || "Banco") + " – " + (t.persona || "Titular");
      if (ult4) label += " ···· " + ult4;
      if (alias) label += " (" + alias + ")";
      opt.textContent = label;
      selTar.appendChild(opt);
    });
    var actualId = facturaActual && facturaActual.tarjeta_id != null ? String(facturaActual.tarjeta_id) : "";
    if (actualId) selTar.value = actualId;
  } catch (e) {
    // Si falla, dejamos solo la opción por defecto.
  }
}

function _actualizarTerceroStatus(terceroId, nombreMatch) {
  var el = document.getElementById("ed-tercero-status");
  if (!el) return;
  if (terceroId) {
    var label = nombreMatch ? nombreMatch + " (#" + terceroId + ")" : "#" + terceroId;
    el.innerHTML = "<span style=\"color:#16a34a\">\u2713 Vinculado a tercero " + label + "</span>";
  } else {
    el.innerHTML = "<span style=\"color:#d97706\">\u26A0 Sin vincular al maestro de terceros</span>";
  }
}

function abrirModalEdicion(f) {
  facturaEdicion = f;
  document.getElementById("ed-fecha").value = (f.fecha_factura || "").toString().trim();
  document.getElementById("ed-proveedor").value = (f.proveedor || "").toString().trim();
  document.getElementById("ed-nif").value = (f.nif_proveedor || "").toString().trim();
  document.getElementById("ed-pais").value = (f.pais_proveedor || "").toString().trim();
  document.getElementById("ed-localidad").value = (f.localidad_proveedor || "").toString().trim();
  document.getElementById("ed-concepto").value = (f.resumen_concepto || "").toString().trim();
  document.getElementById("ed-numero").value = (f.numero_factura || "").toString().trim();
  document.getElementById("ed-base").value = (f.base_imponible || "").toString().trim();
  document.getElementById("ed-iva").value = (f.iva || "").toString().trim();
  document.getElementById("ed-retenciones").value = (f.retenciones_total || "").toString().trim();
  document.getElementById("ed-total").value = (f.total_a_pagar || "").toString().trim();
  var estadoPago = (f.estado_pago || "").toString().trim();
  document.getElementById("ed-estado-pago").value = (estadoPago && ["pendiente", "pagada", "parcial"].includes(estadoPago)) ? estadoPago : "pendiente";
  document.getElementById("ed-comentarios").value = (f.comentarios_revision || "").toString().trim();

  // Inicializar tercero_id y estado de vinculación
  var terceroIdActual = f.tercero_id || null;
  document.getElementById("ed-tercero-id").value = terceroIdActual || "";
  _actualizarTerceroStatus(terceroIdActual, null);

  var emp = (f && f.empresa_id) ? String(f.empresa_id).trim() : "";
  if (!emp) {
    var empListado = document.getElementById("empresa-listado");
    emp = (empListado && empListado.value) ? empListado.value : "";
  }
  if (!emp) {
    var empProv = document.getElementById("empresa-proveedores");
    emp = (empProv && empProv.value) ? empProv.value : "";
  }
  var sel = document.getElementById("ed-selector-proveedor");
  sel.innerHTML = "<option value=\"\">Seleccionar proveedor…</option>";
  PROVEEDORES_EN_EDICION = [];
  if (emp) {
    fetch("/api/proveedores?empresa_id=" + encodeURIComponent(emp))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var lista = (data.proveedores || []).slice().sort(function (a, b) {
          var na = ((a.nombre_canonico || "").trim() || "").toLowerCase();
          var nb = ((b.nombre_canonico || "").trim() || "").toLowerCase();
          return na.localeCompare(nb, "es");
        });
        PROVEEDORES_EN_EDICION = lista;
        lista.forEach(function (p, i) {
          var opt = document.createElement("option");
          opt.value = String(i);
          if (p.tercero_id) opt.setAttribute("data-tercero-id", String(p.tercero_id));
          var nombre = (p.nombre_canonico || "").trim() || "Sin nombre";
          var nif = (p.nif || "").trim();
          opt.textContent = nif ? nombre + " (" + nif + ")" : nombre;
          sel.appendChild(opt);
        });
        var provFactura = (f.proveedor || "").toString().trim();
        var nifFactura = (f.nif_proveedor || "").toString().trim();
        for (var i = 0; i < lista.length; i++) {
          var p = lista[i];
          if ((p.nombre_canonico || "").trim() === provFactura && (p.nif || "").trim() === nifFactura) {
            sel.value = String(i);
            // Actualizar tercero_id si el proveedor del maestro tiene uno y la factura no
            if (p.tercero_id && !document.getElementById("ed-tercero-id").value) {
              document.getElementById("ed-tercero-id").value = String(p.tercero_id);
              _actualizarTerceroStatus(p.tercero_id, (p.nombre_canonico || "").trim());
            }
            break;
          }
        }
      })
      .catch(function () {});
  }

  cargarTarjetasEnSelectorEdicion(emp, f);

  // Poblar selector de proyecto para imputar costes
  var selProy = document.getElementById("ed-proyecto-id");
  if (selProy) {
    selProy.innerHTML = '<option value="">Sin proyecto</option>';
    fetch("/api/proyectos")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        (d.proyectos || []).forEach(function (pr) {
          var opt = document.createElement("option");
          opt.value = String(pr.id);
          opt.textContent = pr.nombre + " (" + (pr.estado || "") + ")";
          selProy.appendChild(opt);
        });
        if (f.proyecto_id) selProy.value = String(f.proyecto_id);
      }).catch(function () {});
  }

  var edLiquidacionPeriodo = document.getElementById("ed-liquidacion-periodo");
  var edLiquidacionTexto = document.getElementById("ed-liquidacion-periodo-texto");
  if (edLiquidacionPeriodo) edLiquidacionPeriodo.value = (f.liquidacion_periodo || "").toString().trim();
  if (edLiquidacionTexto) {
    var lip = (f.liquidacion_periodo || "").toString().trim();
    edLiquidacionTexto.textContent = lip ? "Periodo liquidación: " + lip + " (extracto mes siguiente)" : "";
  }

  var concWrap = document.getElementById("ed-conciliacion-wrap");
  var concResumen = document.getElementById("ed-conciliacion-resumen");
  var concPendiente = document.getElementById("ed-conciliacion-pendiente");
  var concMovs = document.getElementById("ed-conciliacion-movs");
  var totalFacturaStr = (f.total_a_pagar || f.total_factura || f.total || "").toString().trim();
  var totalFacturaNum = 0;
  if (totalFacturaStr) {
    var s = totalFacturaStr.replace(/\s/g, "");
    if (s.indexOf(",") !== -1) {
      totalFacturaNum = parseFloat(s.replace(/\./g, "").replace(",", "."));
    } else {
      totalFacturaNum = parseFloat(s);
    }
    if (Number.isNaN(totalFacturaNum)) totalFacturaNum = 0;
  }
  if (concResumen) concResumen.textContent = "Cargando conciliación…";
  if (concPendiente) concPendiente.textContent = "";
  if (concMovs) concMovs.innerHTML = "";
  var facturaId = f.id != null && f.id !== "" ? f.id : null;
  if (facturaId != null && typeof formatearNumeroES === "function") {
    fetch("/api/bancos/conciliacion/factura-proveedor/" + facturaId)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error && concResumen) {
          concResumen.textContent = "Total factura: " + formatearNumeroES(totalFacturaNum) + " € · No se pudo cargar la conciliación.";
          if (concPendiente) concPendiente.textContent = "Pendiente de pago: " + formatearNumeroES(totalFacturaNum) + " €";
          return;
        }
        var totalFac = data.total_factura != null ? data.total_factura : totalFacturaNum;
        var totalPagado = data.total_pagado != null ? data.total_pagado : 0;
        var pendiente = data.pendiente != null ? data.pendiente : Math.max(0, totalFac - totalPagado);
        if (concResumen) concResumen.textContent = "Total factura: " + formatearNumeroES(totalFac) + " € · Pagado (conciliado): " + formatearNumeroES(totalPagado) + " €";
        if (concPendiente) concPendiente.textContent = "Pendiente de pago: " + formatearNumeroES(pendiente) + " €";
        if (concMovs && data.movimientos && data.movimientos.length > 0) {
          var html = "Movimientos vinculados: ";
          data.movimientos.forEach(function (mov, i) {
            if (i) html += "; ";
            html += (mov.fecha_operacion || "").slice(0, 10) + " " + (mov.concepto || "").slice(0, 30) + " " + formatearNumeroES(mov.importe) + " €";
          });
          concMovs.textContent = html;
        }
      })
      .catch(function () {
        if (concResumen) concResumen.textContent = "Total factura: " + formatearNumeroES(totalFacturaNum) + " € · Error al cargar la conciliación.";
        if (concPendiente) concPendiente.textContent = "Pendiente de pago: " + formatearNumeroES(totalFacturaNum) + " €";
      });
  } else {
    if (concResumen) concResumen.textContent = "Total factura: " + (typeof formatearNumeroES === "function" ? formatearNumeroES(totalFacturaNum) : totalFacturaStr) + " €";
    if (concPendiente) concPendiente.textContent = "Pendiente de pago: " + (typeof formatearNumeroES === "function" ? formatearNumeroES(totalFacturaNum) : totalFacturaStr) + " € (sin datos de conciliación)";
  }

  var overlay = document.getElementById("modal-editar-overlay");
  overlay.classList.add("visible");
  overlay.setAttribute("aria-hidden", "false");
}

function cerrarModalEdicion() {
  var overlay = document.getElementById("modal-editar-overlay");
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");
  facturaEdicion = null;
}

document.getElementById("btn-cerrar-editar").addEventListener("click", cerrarModalEdicion);
document.getElementById("modal-editar-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-editar-overlay") cerrarModalEdicion();
});

document.getElementById("ed-btn-extracto-mes-siguiente").addEventListener("click", function () {
  var fechaInp = document.getElementById("ed-fecha");
  var edLiquidacionPeriodo = document.getElementById("ed-liquidacion-periodo");
  var edLiquidacionTexto = document.getElementById("ed-liquidacion-periodo-texto");
  var fechaStr = (fechaInp && fechaInp.value) ? fechaInp.value.trim().slice(0, 10) : "";
  var d = fechaStr ? new Date(fechaStr + "T12:00:00") : new Date();
  if (isNaN(d.getTime())) d = new Date();
  var year = d.getFullYear();
  var month = d.getMonth() + 1;
  month += 1;
  if (month > 12) { month = 1; year += 1; }
  var periodo = year + "-" + String(month).padStart(2, "0");
  if (edLiquidacionPeriodo) edLiquidacionPeriodo.value = periodo;
  if (edLiquidacionTexto) edLiquidacionTexto.textContent = "Periodo liquidación: " + periodo + " (extracto mes siguiente)";
});

document.getElementById("ed-selector-proveedor").addEventListener("change", function () {
  const v = this.value;
  if (v === "" || !PROVEEDORES_EN_EDICION.length) {
    document.getElementById("ed-tercero-id").value = "";
    _actualizarTerceroStatus(null, null);
    return;
  }
  const i = parseInt(v, 10);
  if (isNaN(i) || i < 0 || i >= PROVEEDORES_EN_EDICION.length) return;
  const p = PROVEEDORES_EN_EDICION[i];
  document.getElementById("ed-proveedor").value = (p.nombre_canonico || "").trim();
  document.getElementById("ed-nif").value = (p.nif || "").trim();
  document.getElementById("ed-pais").value = (p.pais || "").trim();
  document.getElementById("ed-localidad").value = (p.localidad || "").trim();
  // Actualizar tercero_id desde el proveedor seleccionado
  var tid = p.tercero_id || null;
  document.getElementById("ed-tercero-id").value = tid ? String(tid) : "";
  _actualizarTerceroStatus(tid, (p.nombre_canonico || "").trim());
});

window.abrirModalNuevoProveedorDesdeFactura = function() {
  var emp = (document.getElementById("empresa-listado") || {}).value || "";
  if (!emp && facturaEdicion) emp = String(facturaEdicion.empresa_id || "").trim();
  if (!emp) {
    var empProv = document.getElementById("empresa-proveedores");
    if (empProv && empProv.value) emp = empProv.value;
  }
  if (!emp) {
    mostrarToast("Selecciona primero una empresa.", "error");
    return;
  }
  var nombre = (document.getElementById("ed-proveedor") || {}).value || "";
  var nif = (document.getElementById("ed-nif") || {}).value || "";
  nombre = nombre.trim();
  nif = nif.trim();
  modalProveedorModo = "nuevo";
  if (modalProveedorTitulo) modalProveedorTitulo.textContent = "Nuevo proveedor (desde factura)";
  var selEmpresa = document.getElementById("empresa-listado");
  var empText = (selEmpresa && selEmpresa.selectedIndex >= 0 && selEmpresa.options[selEmpresa.selectedIndex]) ? selEmpresa.options[selEmpresa.selectedIndex].text : emp;
  document.getElementById("proveedor-empresa-id").value = emp;
  document.getElementById("proveedor-empresa-readonly").value = empText;
  document.getElementById("proveedor-old-nombre").value = "";
  document.getElementById("proveedor-old-nif").value = "";
  document.getElementById("proveedor-nombre").value = nombre;
  document.getElementById("proveedor-nif").value = nif;
  document.getElementById("proveedor-direccion").value = "";
  document.getElementById("proveedor-localidad").value = "";
  document.getElementById("proveedor-pais").value = "";
  document.getElementById("proveedor-email").value = "";
  document.getElementById("proveedor-telefono").value = "";
  document.getElementById("proveedor-centro-coste").value = "";
  if (modalProveedorEl) {
    modalProveedorEl.classList.add("visible");
    modalProveedorEl.setAttribute("aria-hidden", "false");
  }
  var campoNombre = document.getElementById("proveedor-nombre");
  if (campoNombre) campoNombre.focus();
  window.AL_CERRAR_PROVEEDOR_DESDE_FACTURA = function (nuevoProveedor) {
    window.AL_CERRAR_PROVEEDOR_DESDE_FACTURA = null;
    PROVEEDORES_EN_EDICION = (nuevoProveedor && nuevoProveedor.proveedores) ? nuevoProveedor.proveedores : PROVEEDORES_EN_EDICION.slice();
    const sel = document.getElementById("ed-selector-proveedor");
    // Capturar tercero_id devuelto por el backend al crear el proveedor
    var nuevoTerceroId = (nuevoProveedor && nuevoProveedor.tercero_id) ? nuevoProveedor.tercero_id : null;
    if (nuevoProveedor && nuevoProveedor.proveedores && nuevoProveedor.proveedores.length) {
      const lista = nuevoProveedor.proveedores;
      PROVEEDORES_EN_EDICION = lista;
      sel.innerHTML = "<option value=\"\">Seleccionar proveedor…</option>";
      lista.forEach((p, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        if (p.tercero_id) opt.setAttribute("data-tercero-id", String(p.tercero_id));
        const nom = (p.nombre_canonico || "").trim() || "Sin nombre";
        const n = (p.nif || "").trim();
        opt.textContent = n ? nom + " (" + n + ")" : nom;
        sel.appendChild(opt);
      });
      sel.value = String(lista.length - 1);
      const ult = lista[lista.length - 1];
      document.getElementById("ed-proveedor").value = (ult.nombre_canonico || "").trim();
      document.getElementById("ed-nif").value = (ult.nif || "").trim();
      document.getElementById("ed-pais").value = (ult.pais || "").trim();
      document.getElementById("ed-localidad").value = (ult.localidad || "").trim();
      // Asignar tercero_id: preferir el devuelto por el backend, fallback al del último proveedor
      var tid = nuevoTerceroId || ult.tercero_id || null;
      document.getElementById("ed-tercero-id").value = tid ? String(tid) : "";
      _actualizarTerceroStatus(tid, (ult.nombre_canonico || "").trim());
    } else if (nuevoTerceroId) {
      document.getElementById("ed-tercero-id").value = String(nuevoTerceroId);
      _actualizarTerceroStatus(nuevoTerceroId, document.getElementById("ed-proveedor").value.trim());
    }
  };
}

document.getElementById("form-editar-factura").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!facturaEdicion) return;
  var emp = (facturaEdicion && facturaEdicion.empresa_id) ? String(facturaEdicion.empresa_id).trim() : "";
  if (!emp) {
    var empListado = document.getElementById("empresa-listado");
    emp = (empListado && empListado.value) ? empListado.value : "";
  }
  if (!emp) {
    var empProv = document.getElementById("empresa-proveedores");
    emp = (empProv && empProv.value) ? empProv.value : "";
  }
  if (!emp) {
    mostrarToast("No hay empresa seleccionada.", "error");
    return;
  }
  const factura = { ...facturaEdicion };
  factura.fecha_factura = document.getElementById("ed-fecha").value.trim();
  factura.proveedor = document.getElementById("ed-proveedor").value.trim();
  factura.nif_proveedor = document.getElementById("ed-nif").value.trim();
  factura.pais_proveedor = document.getElementById("ed-pais").value.trim();
  factura.localidad_proveedor = document.getElementById("ed-localidad").value.trim();
  factura.resumen_concepto = document.getElementById("ed-concepto").value.trim();
  factura.numero_factura = document.getElementById("ed-numero").value.trim();
  factura.base_imponible = document.getElementById("ed-base").value.trim();
  factura.iva = document.getElementById("ed-iva").value.trim();
  factura.retenciones_total = document.getElementById("ed-retenciones").value.trim();
  factura.total_a_pagar = document.getElementById("ed-total").value.trim();
  factura.tarjeta_id = document.getElementById("ed-tarjeta").value.trim() || null;
  factura.liquidacion_periodo = document.getElementById("ed-liquidacion-periodo").value.trim() || null;
  factura.estado_pago = document.getElementById("ed-estado-pago").value.trim() || "pendiente";
  factura.comentarios_revision = document.getElementById("ed-comentarios").value.trim();
  factura.tercero_id = document.getElementById("ed-tercero-id").value.trim() || null;
  factura.proyecto_id = (document.getElementById("ed-proyecto-id") || {}).value || null;

  try {
    const resp = await fetch("/api/factura", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: emp, factura }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Error al guardar");
    }
    cerrarModalEdicion();
    cargarListado(emp);
    mostrarToast("Factura guardada correctamente.", "success");
  } catch (err) {
    mostrarToast(err.message || "No se pudo guardar la factura.", "error");
  }
});

// ─── Módulo Clientes: Facturas emitidas ───────────────────────────
const COLUMNAS_CLI = [
  { key: "fecha_factura", label: "Fecha" },
  { key: "cliente", label: "Cliente" },
  { key: "cif_nif", label: "CIF/NIF" },
  { key: "pais", label: "País" },
  { key: "localidad", label: "Localidad" },
  { key: "numero_factura", label: "Nº factura" },
  { key: "proyecto", label: "Proyecto" },
  { key: "tipologia", label: "Tipología" },
  { key: "num_hincadoras", label: "Hinc." },
  { key: "num_ayudantes", label: "Ayud." },
  { key: "pricing_servicio", label: "P.Serv." },
  { key: "pricing_transporte", label: "P.Trans." },
  { key: "iva", label: "IVA" },
  { key: "total_a_pagar", label: "Total a pagar" },
  { key: "estado_cobro", label: "Cobro" },
];
const COLUMNAS_NUM_CLI = new Set(["pricing_servicio", "pricing_transporte", "iva", "total_a_pagar"]);

let CLI_FACTURAS = [];
const sortStateCli = { key: "", dir: "asc" };

function actualizarBtnEliminarCli() {
  const checks = document.querySelectorAll("#tbody-clientes-facturas .cli-check:checked");
  const btn = document.getElementById("cli-btn-eliminar");
  if (checks.length) {
    btn.classList.add("visible");
    btn.title = "Eliminar " + checks.length + " seleccionadas";
  } else {
    btn.classList.remove("visible");
    btn.title = "Eliminar seleccionadas";
  }
  _actualizarBadgeDescarga("cli-btn-exportar", checks.length);
  _actualizarBadgeDescarga("cli-btn-descargar-facturas", checks.length);
}

function _parseImporteES(val) {
  if (!val) return 0;
  return parseFloat(String(val).replace(/\./g, "").replace(",", ".")) || 0;
}
function tieneDescuadreCli(f) {
  var servicio = _parseImporteES(f.pricing_servicio);
  var transporte = _parseImporteES(f.pricing_transporte);
  var iva = _parseImporteES(f.iva);
  var retenciones = _parseImporteES(f.retenciones);
  var anticipos = _parseImporteES(f.anticipos);
  var total = _parseImporteES(f.total_a_pagar);
  if (total === 0 && servicio === 0) return false;
  var calculado = servicio + transporte + iva - retenciones - anticipos;
  return Math.abs(calculado - total) > 0.02;
}
let filtroDescuadreCliActivo = false;

function renderTablaClientesFacturas() {
  const anio = document.getElementById("cli-filtro-anio").value;
  const mes = document.getElementById("cli-filtro-mes").value;
  const tbody = document.getElementById("tbody-clientes-facturas");
  const sinDatos = document.getElementById("cli-sin-datos");
  const contador = document.getElementById("cli-contador");
  tbody.innerHTML = "";
  sinDatos.style.display = "none";
  contador.textContent = "";

  let filtradas = CLI_FACTURAS.map((f, i) => ({ ...f, _idx: i }));
  if (anio) filtradas = filtradas.filter((f) => (f.fecha_factura || "").startsWith(anio));
  if (mes) filtradas = filtradas.filter((f) => { const d = f.fecha_factura || ""; return d.length >= 7 && d.slice(5, 7) === mes; });
  const filtroCobro = (document.getElementById("cli-filtro-cobro") || {}).value || "";
  if (filtroCobro) filtradas = filtradas.filter((f) => (f.estado_cobro || "pendiente").toLowerCase() === filtroCobro);
  if (filtroDescuadreCliActivo) filtradas = filtradas.filter(tieneDescuadreCli);
  if (sortStateCli.key) {
    const esNum = COLUMNAS_NUM_CLI.has(sortStateCli.key);
    const mult = sortStateCli.dir === "desc" ? -1 : 1;
    filtradas.sort((a, b) => {
      const va = (a[sortStateCli.key] ?? "").toString().trim();
      const vb = (b[sortStateCli.key] ?? "").toString().trim();
      if (esNum) return (parseNumeroParaSort(va) - parseNumeroParaSort(vb)) * mult;
      return va.localeCompare(vb, "es", { sensitivity: "base" }) * mult;
    });
  }
  if (!filtradas.length) { sinDatos.style.display = "block"; return; }

  const total = filtradas.length;
  let visibles = filtradas;
  if (total > LIMITE_FILAS_TABLA) {
    visibles = filtradas.slice(0, LIMITE_FILAS_TABLA);
  }

  // Enrich with descuadre tooltip before rendering
  visibles.forEach(function (f) {
    if (tieneDescuadreCli(f)) {
      var s = _parseImporteES(f.pricing_servicio), t = _parseImporteES(f.pricing_transporte);
      var iv = _parseImporteES(f.iva), r = _parseImporteES(f.retenciones), a = _parseImporteES(f.anticipos);
      var tot = _parseImporteES(f.total_a_pagar);
      var calc = s + t + iv - r - a;
      f._descuadre_msg = "Descuadre: calculado " + calc.toFixed(2) + " vs total " + tot.toFixed(2);
    }
  });
  renderTablaFacturas({
    theadTr: document.getElementById("thead-clientes-facturas"),
    tbody,
    facturas: visibles,
    columnas: COLUMNAS_CLI,
    columnasNumericas: COLUMNAS_NUM_CLI,
    conCheckbox: true,
    checkAllId: "cli-check-all",
    checkboxClass: "cli-check",
    tbodySelectorParaCheckAll: "#tbody-clientes-facturas .cli-check",
    onCheckAllChange: actualizarBtnEliminarCli,
    getCheckboxData: (f) => ({ idx: String(f._idx), id: String(f.id || "") }),
    onCheckChange: actualizarBtnEliminarCli,
    sortState: sortStateCli,
    onSort: renderTablaClientesFacturas,
    getRutaVerFactura: (f) => (f.ruta_archivo || "").trim(),
    onEditar: abrirModalEdicionCli,
    tieneError: tieneDescuadreCli,
    motivoErrorKey: "_descuadre_msg",
  });
  contador.textContent =
    total + (total === 1 ? " factura" : " facturas") + (total > LIMITE_FILAS_TABLA ? " (mostrando primeras " + LIMITE_FILAS_TABLA + ")" : "");

  // Botón de filtro descuadre
  var btnDescCli = document.getElementById("cli-btn-filtro-alertas");
  if (btnDescCli) {
    var totalDescuadre = CLI_FACTURAS.filter(tieneDescuadreCli).length;
    if (totalDescuadre > 0) {
      btnDescCli.style.display = "";
      if (filtroDescuadreCliActivo) {
        btnDescCli.classList.add("btn-alerta-activo");
        btnDescCli.textContent = "\u26A0 Descuadre (" + filtradas.length + ") \u2715";
      } else {
        btnDescCli.classList.remove("btn-alerta-activo");
        btnDescCli.textContent = "\u26A0 Descuadre (" + totalDescuadre + ")";
      }
    } else {
      btnDescCli.style.display = "none";
    }
  }
}

function poblarFiltroAnioCli() {
  const sel = document.getElementById("cli-filtro-anio");
  const vals = new Set();
  CLI_FACTURAS.forEach((f) => { const y = (f.fecha_factura || "").slice(0, 4); if (/^\d{4}$/.test(y)) vals.add(y); });
  sel.innerHTML = "<option value=\"\">Todos los años</option>";
  Array.from(vals).sort().forEach((y) => { const o = document.createElement("option"); o.value = y; o.textContent = y; sel.appendChild(o); });
}

async function cargarListadoCli(empresaId) {
  var btnCargarCli = document.getElementById("cli-btn-cargar");
  CLI_FACTURAS = [];
  // Orden por defecto: fecha más reciente primero
  sortStateCli.key = "fecha_factura";
  sortStateCli.dir = "desc";
  document.getElementById("tbody-clientes-facturas").innerHTML = "";
  document.getElementById("cli-contador").textContent = "";
  document.getElementById("cli-sin-datos").style.display = "none";
  document.getElementById("cli-btn-eliminar").classList.remove("visible");
  if (btnCargarCli) { btnCargarCli.classList.add("btn-loading"); }
  try {
    const resp = await fetch("/api/facturas_clientes?empresa_id=" + encodeURIComponent(empresaId));
    const json = await resp.json();
    CLI_FACTURAS = json.facturas || [];
    poblarFiltroAnioCli();
    renderTablaClientesFacturas();
  } catch (e) {
    document.getElementById("cli-sin-datos").textContent = "Error al cargar las facturas de clientes.";
    document.getElementById("cli-sin-datos").style.display = "block";
  } finally {
    if (btnCargarCli) { btnCargarCli.classList.remove("btn-loading"); }
  }
}

document.getElementById("cli-btn-cargar").addEventListener("click", () => {
  const emp = document.getElementById("cli-empresa-listado").value;
  if (!emp) { mostrarToast("Elige primero una empresa.", "error"); return; }
  cargarListadoCli(emp);
});
document.getElementById("cli-empresa-listado").addEventListener("change", () => {
  const emp = document.getElementById("cli-empresa-listado").value;
  if (emp) cargarListadoCli(emp);
});
document.getElementById("cli-filtro-anio").addEventListener("change", renderTablaClientesFacturas);
document.getElementById("cli-filtro-mes").addEventListener("change", renderTablaClientesFacturas);
if (document.getElementById("cli-filtro-cobro")) document.getElementById("cli-filtro-cobro").addEventListener("change", renderTablaClientesFacturas);
var _btnDescCli = document.getElementById("cli-btn-filtro-alertas");
if (_btnDescCli) _btnDescCli.addEventListener("click", function () {
  filtroDescuadreCliActivo = !filtroDescuadreCliActivo;
  renderTablaClientesFacturas();
});

document.getElementById("cli-btn-exportar").addEventListener("click", () => {
  const emp = document.getElementById("cli-empresa-listado").value;
  if (!emp) { mostrarToast("Elige primero una empresa para exportar.", "error"); return; }
  const checks = document.querySelectorAll("#tbody-clientes-facturas .cli-check:checked");
  if (!checks.length) { mostrarToast("Selecciona al menos una factura para descargar.", "info"); return; }
  const ids = Array.from(checks).map(cb => cb.dataset.id).filter(Boolean).join(",");
  const anio = document.getElementById("cli-filtro-anio").value || "";
  const mes = document.getElementById("cli-filtro-mes").value || "";
  let url = "/api/facturas_clientes_export?empresa_id=" + encodeURIComponent(emp) + "&year=" + encodeURIComponent(anio) + "&month=" + encodeURIComponent(mes);
  if (ids) url += "&ids=" + ids;
  window.open(url, "_blank");
});

document.getElementById("cli-btn-descargar-facturas").addEventListener("click", () => {
  const emp = document.getElementById("cli-empresa-listado").value;
  if (!emp) { mostrarToast("Elige primero una empresa para descargar.", "error"); return; }
  const checks = document.querySelectorAll("#tbody-clientes-facturas .cli-check:checked");
  if (!checks.length) { mostrarToast("Selecciona al menos una factura para descargar.", "info"); return; }
  const ids = Array.from(checks).map(cb => cb.dataset.id).filter(Boolean).join(",");
  const anio = document.getElementById("cli-filtro-anio").value || "";
  const mes = document.getElementById("cli-filtro-mes").value || "";
  let url = "/api/facturas_clientes_zip?empresa_id=" + encodeURIComponent(emp) + "&year=" + encodeURIComponent(anio) + "&month=" + encodeURIComponent(mes);
  if (ids) url += "&ids=" + ids;
  window.location.href = url;
});

// ── Procesador de facturas de clientes (subida + pipeline) ──
const cliInputArchivos = document.getElementById("cli-archivos");
const cliBtnSeleccionar = document.getElementById("cli-btn-seleccionar");
const cliListaArchivos = document.getElementById("cli-lista-archivos");

cliBtnSeleccionar.addEventListener("click", () => cliInputArchivos.click());

cliInputArchivos.addEventListener("change", () => {
  cliListaArchivos.innerHTML = "";
  for (const f of cliInputArchivos.files) {
    const li = document.createElement("li");
    li.textContent = f.name;
    cliListaArchivos.appendChild(li);
  }
});

document.getElementById("cli-procesar-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const empresa = document.getElementById("cli-empresa-proc").value;
  const archivos = document.getElementById("cli-archivos").files;
  if (!empresa || !archivos.length) {
    document.getElementById("cli-proc-status").textContent = "Selecciona una empresa y al menos un archivo.";
    return;
  }

  const data = new FormData();
  data.append("empresa_id", empresa);
  for (const file of archivos) {
    data.append("archivos", file);
  }

  const procStatus = document.getElementById("cli-proc-status");
  procStatus.textContent = "Enviando archivos…";
  ev.target.querySelector("button[type=submit]").disabled = true;

  try {
    const resp = await fetch("/api/procesar_clientes", {
      method: "POST",
      body: data,
    });

    if (!resp.ok) throw new Error("Error HTTP " + resp.status);

    const json = await resp.json();
    const resumen = json.resumen_proceso || {};
    let msg = json.mensaje || "Procesamiento completado.";
    if (resumen.procesado) {
      msg += ` ${resumen.facturas_procesadas} ${resumen.facturas_procesadas === 1 ? "factura procesada" : "facturas procesadas"}.`;
      if (resumen.facturas_con_vision) msg += ` (${resumen.facturas_con_vision} con visión)`;
    }
    procStatus.textContent = msg;

    cliInputArchivos.value = "";
    cliListaArchivos.innerHTML = "";

    // Sincronizar empresa del listado y recargar
    const empListado = document.getElementById("cli-empresa-listado");
    if (empListado.value !== empresa) empListado.value = empresa;
    var idsNuevos = resumen.ids_insertados || [];
    if (idsNuevos.length > 0) {
      cargarListadoFiltradoPorIds(empresa, idsNuevos, "clientes");
    } else {
      cargarListadoCli(empresa);
    }
  } catch (err) {
    console.error(err);
    procStatus.textContent = "No se pudo contactar con el backend. Asegúrate de que está en ejecución.";
  } finally {
    ev.target.querySelector("button[type=submit]").disabled = false;
  }
});


// Eliminar facturas clientes seleccionadas
document.getElementById("cli-btn-eliminar").addEventListener("click", async () => {
  const checks = document.querySelectorAll("#tbody-clientes-facturas .cli-check:checked");
  if (!checks.length) return;
  const emp = document.getElementById("cli-empresa-listado").value;
  if (!emp) { mostrarToast("No hay empresa seleccionada.", "error"); return; }
  if (!confirm("¿Seguro que quieres eliminar " + checks.length + (checks.length === 1 ? " factura" : " facturas") + " de cliente? Esta acción no se puede deshacer.")) return;
  const indices = Array.from(checks).map((c) => parseInt(c.dataset.idx, 10));
  try {
    const resp = await fetch("/api/facturas_clientes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: emp, indices }),
    });
    if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || "Error"); }
    const json = await resp.json();
    mostrarToast(json.mensaje || "Eliminadas.", "success");
    cargarListadoCli(emp);
  } catch (err) {
    mostrarToast(err.message || "No se pudieron eliminar.", "error");
  }
});

// Modal edición factura cliente
let cliFacturaEdicion = null;
let CLIENTES_EN_EDICION = [];

function abrirModalEdicionCli(f) {
  cliFacturaEdicion = f;
  document.getElementById("edc-fecha").value = (f.fecha_factura || "").trim();
  document.getElementById("edc-cliente").value = (f.cliente || "").trim();
  document.getElementById("edc-nif").value = (f.cif_nif || "").trim();
  document.getElementById("edc-pais").value = (f.pais || "").trim();
  document.getElementById("edc-localidad").value = (f.localidad || "").trim();
  document.getElementById("edc-proyecto").value = (f.proyecto || "").trim();
  // Poblar selector de proyecto vinculado
  var selProyCli = document.getElementById("edc-proyecto-id");
  if (selProyCli) {
    selProyCli.innerHTML = '<option value="">Sin vincular</option>';
    fetch("/api/proyectos")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        (d.proyectos || []).forEach(function (pr) {
          var opt = document.createElement("option");
          opt.value = String(pr.id);
          opt.textContent = pr.nombre + " (" + (pr.estado || "") + ")";
          selProyCli.appendChild(opt);
        });
        if (f.proyecto_id) selProyCli.value = String(f.proyecto_id);
      }).catch(function () {});
  }
  document.getElementById("edc-tipologia").value = (f.tipologia || "").trim();
  document.getElementById("edc-hincadoras").value = (f.num_hincadoras || "").trim();
  document.getElementById("edc-ayudantes").value = (f.num_ayudantes || "").trim();
  document.getElementById("edc-pricing-servicio").value = (f.pricing_servicio || "").trim();
  document.getElementById("edc-pricing-transporte").value = (f.pricing_transporte || "").trim();
  document.getElementById("edc-retenciones").value = (f.retenciones || "0").trim();
  document.getElementById("edc-anticipos").value = (f.anticipos || "0").trim();
  document.getElementById("edc-num-factura").value = (f.numero_factura || "").trim();
  document.getElementById("edc-iva").value = (f.iva || "").trim();
  document.getElementById("edc-total").value = (f.total_a_pagar || "").trim();

  const emp = document.getElementById("cli-empresa-listado").value;
  const sel = document.getElementById("edc-selector-cliente");
  sel.innerHTML = "<option value=\"\">Seleccionar cliente…</option>";
  CLIENTES_EN_EDICION = [];
  if (emp) {
    fetch("/api/empresas/" + encodeURIComponent(emp) + "/clientes")
      .then((r) => r.json())
      .then((data) => {
        const lista = (data.clientes || []).slice().sort((a, b) => {
          const na = ((a.cliente || "").trim() || "").toLowerCase();
          const nb = ((b.cliente || "").trim() || "").toLowerCase();
          return na.localeCompare(nb, "es");
        });
        CLIENTES_EN_EDICION = lista;
        lista.forEach((c, i) => {
          const opt = document.createElement("option");
          opt.value = String(i);
          const nombre = (c.cliente || "").trim() || "Sin nombre";
          const cif = (c.cif_nif || "").trim();
          opt.textContent = cif ? nombre + " (" + cif + ")" : nombre;
          sel.appendChild(opt);
        });
        const optNuevo = document.createElement("option");
        optNuevo.value = "nuevo";
        optNuevo.textContent = "➕ Crear nuevo cliente";
        sel.appendChild(optNuevo);
        const cliFactura = (f.cliente || "").toString().trim();
        const nifFactura = (f.cif_nif || "").toString().trim();
        for (let i = 0; i < lista.length; i++) {
          const c = lista[i];
          if ((c.cliente || "").trim() === cliFactura && (c.cif_nif || "").trim() === nifFactura) {
            sel.value = String(i);
            break;
          }
        }
      })
      .catch(() => {});
  }

  var totalCobrar = (f.total_a_pagar || "").toString().trim();
  var concCliWrap = document.getElementById("edc-conciliacion-wrap");
  var concCliResumen = document.getElementById("edc-conciliacion-resumen");
  var concCliPendiente = document.getElementById("edc-conciliacion-pendiente");
  if (concCliWrap) {
    concCliWrap.style.display = "block";
    if (concCliResumen) concCliResumen.textContent = "Total a cobrar: " + (totalCobrar ? (typeof formatearNumeroES === "function" ? formatearNumeroES(totalCobrar) : totalCobrar) + " €" : "—");
    if (concCliPendiente) concCliPendiente.textContent = "Total cobrado: — · Pendiente de cobro: " + (totalCobrar ? (typeof formatearNumeroES === "function" ? formatearNumeroES(totalCobrar) : totalCobrar) + " € (sin movimientos vinculados)" : "—");
  }

  _validarImportesFacturaCliente();
  var overlayCli = document.getElementById("modal-editar-cli-overlay");
  overlayCli.classList.add("visible");
  overlayCli.setAttribute("aria-hidden", "false");
}
function cerrarModalEdicionCli() {
  var overlayCli = document.getElementById("modal-editar-cli-overlay");
  overlayCli.classList.remove("visible");
  overlayCli.setAttribute("aria-hidden", "true");
  cliFacturaEdicion = null;
}
document.getElementById("btn-cerrar-editar-cli").addEventListener("click", cerrarModalEdicionCli);
document.getElementById("modal-editar-cli-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-editar-cli-overlay") cerrarModalEdicionCli();
});

function _validarImportesFacturaCliente() {
  var _pn = function (id) {
    var val = (document.getElementById(id) || {}).value || "0";
    return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
  };
  var servicio = _pn("edc-pricing-servicio");
  var transporte = _pn("edc-pricing-transporte");
  var iva = _pn("edc-iva");
  var retenciones = _pn("edc-retenciones");
  var anticipos = _pn("edc-anticipos");
  var total = _pn("edc-total");
  var calculado = servicio + transporte + iva - retenciones - anticipos;
  var diferencia = Math.abs(calculado - total);
  var div = document.getElementById("edc-descuadre");
  if (!div) return;
  if (total === 0 && servicio === 0) {
    div.style.display = "none";
    return;
  }
  div.style.display = "block";
  if (diferencia < 0.02) {
    div.style.background = "#16A34A10";
    div.style.color = "#16A34A";
    div.style.border = "1px solid #16A34A30";
    div.textContent = "\u2713 Importes correctos";
  } else {
    var fmt = function (n) { return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    div.style.background = "#DC262610";
    div.style.color = "#DC2626";
    div.style.border = "1px solid #DC262630";
    div.textContent = "\u26A0 Descuadre de " + fmt(diferencia) + " \u20AC \u2014 Calculado: " + fmt(calculado) + " \u20AC vs Total: " + fmt(total) + " \u20AC";
  }
}
["edc-pricing-servicio", "edc-pricing-transporte", "edc-iva", "edc-retenciones", "edc-anticipos", "edc-total"].forEach(function (id) {
  var el = document.getElementById(id);
  if (el) el.addEventListener("input", _validarImportesFacturaCliente);
});

document.getElementById("edc-selector-cliente").addEventListener("change", function () {
  const v = this.value;
  if (v === "nuevo") {
    abrirModalNuevoClienteDesdeFactura();
    this.value = "";
    return;
  }
  if (v === "" || !CLIENTES_EN_EDICION.length) return;
  const i = parseInt(v, 10);
  if (isNaN(i) || i < 0 || i >= CLIENTES_EN_EDICION.length) return;
  const c = CLIENTES_EN_EDICION[i];
  document.getElementById("edc-cliente").value = (c.cliente || "").trim();
  document.getElementById("edc-nif").value = (c.cif_nif || "").trim();
  document.getElementById("edc-pais").value = (c.pais || "").trim();
  document.getElementById("edc-localidad").value = (c.localidad || "").trim();
  document.getElementById("edc-proyecto").value = (c.proyecto || "").trim();
});

document.getElementById("edc-btn-nuevo-cliente").addEventListener("click", abrirModalNuevoClienteDesdeFactura);

function abrirModalNuevoClienteDesdeFactura() {
  const emp = document.getElementById("cli-empresa-listado").value;
  if (!emp) {
    mostrarToast("Selecciona primero una empresa en el listado de facturas.", "error");
    return;
  }
  const nombre = document.getElementById("edc-cliente").value.trim();
  const cif = document.getElementById("edc-nif").value.trim();
  modalClienteModo = "nuevo";
  modalClienteTitulo.textContent = "Nuevo cliente (desde factura)";
  document.getElementById("cliente-empresa-id").value = emp;
  document.getElementById("cliente-empresa-readonly").value = document.getElementById("cli-empresa-listado").options[document.getElementById("cli-empresa-listado").selectedIndex]?.text || emp;
  document.getElementById("cliente-old-nombre").value = "";
  document.getElementById("cliente-old-cif").value = "";
  document.getElementById("cliente-nombre").value = nombre;
  document.getElementById("cliente-cif").value = cif;
  document.getElementById("cliente-direccion").value = "";
  document.getElementById("cliente-localidad").value = "";
  document.getElementById("cliente-pais").value = "";
  document.getElementById("cliente-proyecto").value = "";
  document.getElementById("cliente-email").value = "";
  document.getElementById("cliente-telefono").value = "";
  if (document.getElementById("btn-eliminar-cliente")) document.getElementById("btn-eliminar-cliente").style.display = "none";
  modalClienteEl.classList.add("visible");
  modalClienteEl.setAttribute("aria-hidden", "false");
  document.getElementById("cliente-nombre").focus();
  window.AL_CERRAR_CLIENTE_DESDE_FACTURA = function (data, savedNombre, savedCif) {
    window.AL_CERRAR_CLIENTE_DESDE_FACTURA = null;
    const sel = document.getElementById("edc-selector-cliente");
    if (data && data.clientes && data.clientes.length) {
      const lista = data.clientes;
      CLIENTES_EN_EDICION = lista;
      sel.innerHTML = "<option value=\"\">Seleccionar cliente…</option>";
      lista.forEach((c, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx);
        const nom = (c.cliente || "").trim() || "Sin nombre";
        const n = (c.cif_nif || "").trim();
        opt.textContent = n ? nom + " (" + n + ")" : nom;
        sel.appendChild(opt);
      });
      const optNuevo = document.createElement("option");
      optNuevo.value = "nuevo";
      optNuevo.textContent = "➕ Crear nuevo cliente";
      sel.appendChild(optNuevo);
      const idxNew = lista.findIndex((c) => (c.cliente || "").trim() === savedNombre && (c.cif_nif || "").trim() === savedCif);
      const ult = idxNew >= 0 ? lista[idxNew] : lista[lista.length - 1];
      const selectIdx = idxNew >= 0 ? idxNew : lista.length - 1;
      sel.value = String(selectIdx);
      document.getElementById("edc-cliente").value = (ult.cliente || "").trim();
      document.getElementById("edc-nif").value = (ult.cif_nif || "").trim();
      document.getElementById("edc-pais").value = (ult.pais || "").trim();
      document.getElementById("edc-localidad").value = (ult.localidad || "").trim();
      document.getElementById("edc-proyecto").value = (ult.proyecto || "").trim();
    }
  };
}

document.getElementById("form-editar-factura-cli").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!cliFacturaEdicion) return;
  const emp = document.getElementById("cli-empresa-listado").value;
  if (!emp) { mostrarToast("No hay empresa seleccionada.", "error"); return; }
  const clave_original = {
    numero_factura: (cliFacturaEdicion.numero_factura || "").trim(),
    fecha_factura: (cliFacturaEdicion.fecha_factura || "").trim(),
    cliente: (cliFacturaEdicion.cliente || "").trim(),
  };
  const factura = {};
  const mapeo = {
    "edc-fecha": "fecha_factura", "edc-cliente": "cliente", "edc-nif": "cif_nif",
    "edc-pais": "pais", "edc-localidad": "localidad", "edc-proyecto": "proyecto",
    "edc-tipologia": "tipologia", "edc-hincadoras": "num_hincadoras",
    "edc-ayudantes": "num_ayudantes",
    "edc-pricing-servicio": "pricing_servicio",
    "edc-pricing-transporte": "pricing_transporte",
    "edc-retenciones": "retenciones", "edc-anticipos": "anticipos",
    "edc-num-factura": "numero_factura",
    "edc-iva": "iva", "edc-total": "total_a_pagar",
  };
  Object.entries(mapeo).forEach(([id, key]) => { factura[key] = document.getElementById(id).value.trim(); });
  factura.proyecto_id = (document.getElementById("edc-proyecto-id") || {}).value || null;
  try {
    const resp = await fetch("/api/factura_cliente", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: emp, factura, clave_original }),
    });
    if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || "Error"); }
    cerrarModalEdicionCli();
    cargarListadoCli(emp);
    mostrarToast("Factura guardada correctamente.", "success");
    try {
      if (typeof clienteSeleccionadoNombre !== "undefined" && clienteSeleccionadoNombre) {
        const empCli = document.getElementById("empresa-clientes-listado");
        if (empCli && empCli.value === emp) cargarFacturasCliente(emp, clienteSeleccionadoNombre);
      }
    } catch (_) {}
  } catch (err) {
    mostrarToast(err.message || "No se pudo guardar.", "error");
  }
});

// --- Bloque Clientes: listado único y facturas del cliente seleccionado ---
const empresaClientesListadoEl = document.getElementById("empresa-clientes-listado");
const listaClientesUnicosEl = document.getElementById("lista-clientes-unicos");
const tablaFacturasClienteWrapper = document.getElementById("tabla-facturas-cliente-wrapper");
const tbodyFacturasClienteListado = document.getElementById("tbody-facturas-cliente-listado");
const clientesSinSeleccionEl = document.getElementById("clientes-sin-seleccion");
const contadorFacturasClienteListado = document.getElementById("contador-facturas-cliente-listado");
const tituloFacturasCliente = document.getElementById("titulo-facturas-cliente");
const clientesFiltrosWrap = document.getElementById("clientes-listado-filtros-wrap");
const filtroAnioClienteListado = document.getElementById("filtro-anio-cliente-listado");
const filtroMesClienteListado = document.getElementById("filtro-mes-cliente-listado");

let FACTURAS_CLIENTE_LISTADO = [];
let clienteSeleccionadoNombre = "";
const sortStateClienteListado = { key: "", dir: "asc" };

empresaClientesListadoEl.addEventListener("change", async () => {
  const emp = empresaClientesListadoEl.value;
  listaClientesUnicosEl.innerHTML = "";
  tablaFacturasClienteWrapper.style.display = "none";
  clientesFiltrosWrap.style.display = "none";
  clientesSinSeleccionEl.style.display = "block";
  clientesSinSeleccionEl.textContent = "Selecciona un cliente de la lista.";
  tituloFacturasCliente.textContent = "Facturas del cliente seleccionado";
  contadorFacturasClienteListado.textContent = "";
  FACTURAS_CLIENTE_LISTADO = [];
  clienteSeleccionadoNombre = "";
  if (!emp) return;
  listaClientesUnicosEl.innerHTML = "<div class=\"lista-loading\"><div class=\"spinner\"></div>Cargando…</div>";
  try {
    const resp = await fetch("/api/empresas/" + encodeURIComponent(emp) + "/clientes");
    const json = await resp.json();
    listaClientesUnicosEl.innerHTML = "";
    const clientes = (json.clientes || []).slice().sort((a, b) => {
      const na = ((a.cliente || "").trim() || "").toLowerCase();
      const nb = ((b.cliente || "").trim() || "").toLowerCase();
      return na.localeCompare(nb, "es");
    });
    clientes.forEach((c) => {
      const nombre = (c.cliente || "").trim() || "Sin nombre";
      const cif = (c.cif_nif || "").trim();
      const enMaestro = !!c.en_maestro;
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = cif ? nombre + " (" + cif + ")" : nombre;
      span.dataset.nombre = nombre;
      span.addEventListener("click", () => {
        Array.from(listaClientesUnicosEl.querySelectorAll("li")).forEach((el) => el.classList.remove("seleccionado"));
        li.classList.add("seleccionado");
        cargarFacturasCliente(emp, nombre);
      });
      li.appendChild(span);
      if (enMaestro) {
        const btnEditar = document.createElement("button");
        btnEditar.type = "button";
        btnEditar.className = "btn-editar-proveedor";
        btnEditar.textContent = "Editar";
        btnEditar.setAttribute("aria-label", "Editar " + nombre);
        btnEditar.addEventListener("click", (e) => {
          e.stopPropagation();
          abrirModalEditarCliente(emp, c);
        });
        li.appendChild(btnEditar);
      }
      listaClientesUnicosEl.appendChild(li);
    });
    if (!clientes.length) {
      listaClientesUnicosEl.innerHTML = "<li style=\"cursor:default;color:#94a3b8;\">No hay clientes registrados.</li>";
    }
  } catch (err) {
    listaClientesUnicosEl.innerHTML = "<li style=\"cursor:default;color:#94a3b8;\">No se pudo cargar el listado.</li>";
  }
});

const modalClienteEl = document.getElementById("modal-cliente");
const formClienteEl = document.getElementById("form-cliente");
const modalClienteTitulo = document.getElementById("modal-cliente-titulo");
const btnEliminarClienteEl = document.getElementById("btn-eliminar-cliente");
let modalClienteModo = "nuevo";

function abrirModalNuevoCliente(empresaId) {
  if (!empresaId) {
    mostrarToast("Selecciona primero una empresa.", "error");
    return;
  }
  modalClienteModo = "nuevo";
  modalClienteTitulo.textContent = "Nuevo cliente";
  document.getElementById("cliente-empresa-id").value = empresaId;
  document.getElementById("cliente-empresa-readonly").value = empresaClientesListadoEl.options[empresaClientesListadoEl.selectedIndex]?.text || empresaId;
  document.getElementById("cliente-old-nombre").value = "";
  document.getElementById("cliente-old-cif").value = "";
  document.getElementById("cliente-nombre").value = "";
  document.getElementById("cliente-cif").value = "";
  document.getElementById("cliente-direccion").value = "";
  document.getElementById("cliente-localidad").value = "";
  document.getElementById("cliente-pais").value = "";
  document.getElementById("cliente-proyecto").value = "";
  document.getElementById("cliente-email").value = "";
  document.getElementById("cliente-telefono").value = "";
  if (btnEliminarClienteEl) btnEliminarClienteEl.style.display = "none";
  modalClienteEl.classList.add("visible");
  modalClienteEl.setAttribute("aria-hidden", "false");
  document.getElementById("cliente-nombre").focus();
}

function abrirModalEditarCliente(empresaId, c) {
  modalClienteModo = "editar";
  modalClienteTitulo.textContent = "Editar cliente";
  document.getElementById("cliente-empresa-id").value = empresaId;
  document.getElementById("cliente-empresa-readonly").value = empresaClientesListadoEl.options[empresaClientesListadoEl.selectedIndex]?.text || empresaId;
  document.getElementById("cliente-old-nombre").value = (c.cliente || "").trim();
  document.getElementById("cliente-old-cif").value = (c.cif_nif || "").trim();
  document.getElementById("cliente-nombre").value = (c.cliente || "").trim();
  document.getElementById("cliente-cif").value = (c.cif_nif || "").trim();
  document.getElementById("cliente-direccion").value = (c.direccion || "").trim();
  document.getElementById("cliente-localidad").value = (c.localidad || "").trim();
  document.getElementById("cliente-pais").value = (c.pais || "").trim();
  document.getElementById("cliente-proyecto").value = (c.proyecto || "").trim();
  document.getElementById("cliente-email").value = (c.email || "").trim();
  document.getElementById("cliente-telefono").value = (c.telefono || "").trim();
  if (btnEliminarClienteEl) btnEliminarClienteEl.style.display = "inline-block";
  modalClienteEl.classList.add("visible");
  modalClienteEl.setAttribute("aria-hidden", "false");
  document.getElementById("cliente-nombre").focus();
}

function cerrarModalCliente() {
  modalClienteEl.classList.remove("visible");
  modalClienteEl.setAttribute("aria-hidden", "true");
}

async function refrescarListaClientes() {
  const emp = empresaClientesListadoEl.value;
  if (!emp) return;
  try {
    const resp = await fetch("/api/empresas/" + encodeURIComponent(emp) + "/clientes");
    const json = await resp.json();
    const clientes = (json.clientes || []).slice().sort((a, b) => {
      const na = ((a.cliente || "").trim() || "").toLowerCase();
      const nb = ((b.cliente || "").trim() || "").toLowerCase();
      return na.localeCompare(nb, "es");
    });
    listaClientesUnicosEl.innerHTML = "";
    clientes.forEach((c) => {
      const nombre = (c.cliente || "").trim() || "Sin nombre";
      const cif = (c.cif_nif || "").trim();
      const enMaestro = !!c.en_maestro;
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = cif ? nombre + " (" + cif + ")" : nombre;
      span.dataset.nombre = nombre;
      span.addEventListener("click", () => {
        Array.from(listaClientesUnicosEl.querySelectorAll("li")).forEach((el) => el.classList.remove("seleccionado"));
        li.classList.add("seleccionado");
        cargarFacturasCliente(emp, nombre);
      });
      li.appendChild(span);
      if (enMaestro) {
        const btnEditar = document.createElement("button");
        btnEditar.type = "button";
        btnEditar.className = "btn-editar-proveedor";
        btnEditar.textContent = "Editar";
        btnEditar.setAttribute("aria-label", "Editar " + nombre);
        btnEditar.addEventListener("click", (e) => {
          e.stopPropagation();
          abrirModalEditarCliente(emp, c);
        });
        li.appendChild(btnEditar);
      }
      listaClientesUnicosEl.appendChild(li);
    });
  } catch (err) {
    listaClientesUnicosEl.innerHTML = "<li style=\"cursor:default;color:#94a3b8;\">No se pudo actualizar el listado.</li>";
  }
}

document.getElementById("btn-nuevo-cliente").addEventListener("click", () => {
  abrirModalNuevoCliente(empresaClientesListadoEl.value);
});

document.getElementById("btn-cancelar-cliente").addEventListener("click", cerrarModalCliente);

if (btnEliminarClienteEl) {
  btnEliminarClienteEl.addEventListener("click", async () => {
    const empresaId = document.getElementById("cliente-empresa-id").value.trim();
    const cliente = document.getElementById("cliente-old-nombre").value.trim();
    const cifNif = document.getElementById("cliente-old-cif").value.trim();
    if (!empresaId || (!cliente && !cifNif)) return;
    if (!confirm("¿Eliminar este cliente del maestro? Las facturas que lo referencian no se borran, pero dejará de aparecer en el listado único.")) return;
    try {
      const resp = await fetch("/api/clientes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, cliente: cliente, cif_nif: cifNif }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        mostrarToast(data.error || "Error al eliminar.", "error");
        return;
      }
      cerrarModalCliente();
      await refrescarListaClientes();
      mostrarToast(data.mensaje || "Cliente eliminado del maestro.", "success");
    } catch (err) {
      mostrarToast("Error de conexión al eliminar.", "error");
    }
  });
}

formClienteEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const empresaId = document.getElementById("cliente-empresa-id").value.trim();
  const nombre = document.getElementById("cliente-nombre").value.trim();
  const cif = document.getElementById("cliente-cif").value.trim();
  if (!empresaId && modalClienteModo === "nuevo") {
    mostrarToast("La empresa es obligatoria.", "error");
    return;
  }
  if (!nombre) {
    var _cn = document.getElementById("cliente-nombre");
    marcarCampoError(_cn, "El nombre del cliente es obligatorio");
    mostrarToast("El nombre del cliente es obligatorio.", "error");
    _cn.focus();
    return;
  }
  if (!cif) {
    var _ccif = document.getElementById("cliente-cif");
    marcarCampoError(_ccif, "El CIF/NIF es obligatorio");
    mostrarToast("El CIF/NIF del cliente es obligatorio.", "error");
    _ccif.focus();
    return;
  }
  const body = {
    empresa_id: empresaId,
    cliente: nombre,
    cif_nif: cif,
    direccion: document.getElementById("cliente-direccion").value.trim(),
    localidad: document.getElementById("cliente-localidad").value.trim(),
    pais: document.getElementById("cliente-pais").value.trim(),
    proyecto: document.getElementById("cliente-proyecto").value.trim(),
    email: document.getElementById("cliente-email").value.trim(),
    telefono: document.getElementById("cliente-telefono").value.trim(),
  };
  if (modalClienteModo === "editar") {
    body.old_cliente = document.getElementById("cliente-old-nombre").value;
    body.old_cif_nif = document.getElementById("cliente-old-cif").value;
  }
  try {
    const url = "/api/clientes";
    const method = modalClienteModo === "nuevo" ? "POST" : "PUT";
    const resp = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) {
      mostrarToast(data.error || "Error al guardar el cliente.", "error");
      return;
    }
    if (typeof window.AL_CERRAR_CLIENTE_DESDE_FACTURA === "function") {
      window.AL_CERRAR_CLIENTE_DESDE_FACTURA(data, nombre, cif);
    }
    cerrarModalCliente();
    await refrescarListaClientes();
    mostrarToast("Cliente guardado correctamente.", "success");
  } catch (err) {
    mostrarToast("Error de conexión al guardar el cliente.", "error");
  }
});

function poblarFiltroAnioClienteListado(facturas) {
  const valores = new Set();
  facturas.forEach((f) => {
    const fecha = (f.fecha_factura || "").toString().slice(0, 4);
    if (fecha && /^\d{4}$/.test(fecha)) valores.add(fecha);
  });
  filtroAnioClienteListado.innerHTML = "<option value=\"\">Todos los años</option>";
  Array.from(valores).sort().forEach((y) => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    filtroAnioClienteListado.appendChild(opt);
  });
}

function aplicarFiltrosClienteListadoYRender() {
  const anio = filtroAnioClienteListado.value;
  const mes = filtroMesClienteListado.value;
  let filtradas = FACTURAS_CLIENTE_LISTADO.slice();
  if (anio) filtradas = filtradas.filter((f) => (f.fecha_factura || "").toString().startsWith(anio));
  if (mes) filtradas = filtradas.filter((f) => { const fe = (f.fecha_factura || "").toString(); return fe.length >= 7 && fe.slice(5, 7) === mes; });
  if (sortStateClienteListado.key) {
    const k = sortStateClienteListado.key;
    const dir = sortStateClienteListado.dir === "asc" ? 1 : -1;
    filtradas.sort((a, b) => {
      let va = (a[k] || "").toString().trim();
      let vb = (b[k] || "").toString().trim();
      const na = parseFloat(va.replace(/[^\d.,-]/g, "").replace(",", "."));
      const nb = parseFloat(vb.replace(/[^\d.,-]/g, "").replace(",", "."));
      if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
      return va.localeCompare(vb, "es") * dir;
    });
  }
  const total = filtradas.length;
  let visibles = filtradas;
  if (total > LIMITE_FILAS_TABLA) {
    visibles = filtradas.slice(0, LIMITE_FILAS_TABLA);
  }
  renderFacturasClienteListado(visibles);
  contadorFacturasClienteListado.textContent =
    total + (total === 1 ? " factura" : " facturas") + (total > LIMITE_FILAS_TABLA ? " (mostrando primeras " + LIMITE_FILAS_TABLA + ")" : "");
}

const CLI_LISTADO_COLS = [
  { key: "fecha_factura", label: "Fecha" },
  { key: "cliente", label: "Cliente" },
  { key: "cif_nif", label: "CIF/NIF" },
  { key: "pais", label: "País" },
  { key: "localidad", label: "Localidad" },
  { key: "numero_factura", label: "Nº factura" },
  { key: "proyecto", label: "Proyecto" },
  { key: "tipologia", label: "Tipología" },
  { key: "num_hincadoras", label: "Hinc." },
  { key: "num_ayudantes", label: "Ayud." },
  { key: "pricing_servicio", label: "P.Serv.", numeric: true },
  { key: "pricing_transporte", label: "P.Trans.", numeric: true },
  { key: "iva", label: "IVA", numeric: true },
  { key: "total_a_pagar", label: "Total a pagar", numeric: true },
  { key: "estado_cobro", label: "Cobro" },
];

const CLI_LISTADO_NUM = new Set(CLI_LISTADO_COLS.filter((c) => c.numeric).map((c) => c.key));

function renderClienteListadoThead() {
  const tr = document.querySelector("#tabla-facturas-cliente-listado thead tr");
  tr.innerHTML = "";
  CLI_LISTADO_COLS.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.label;
    th.title = "Ordenar por " + col.label;
    th.className = "sortable";
    if (col.numeric) th.classList.add("numero");
    if (sortStateClienteListado.key === col.key) {
      th.classList.add(sortStateClienteListado.dir === "asc" ? "sort-asc" : "sort-desc");
    }
    th.addEventListener("click", () => {
      if (sortStateClienteListado.key === col.key) {
        sortStateClienteListado.dir = sortStateClienteListado.dir === "asc" ? "desc" : "asc";
      } else {
        sortStateClienteListado.key = col.key;
        sortStateClienteListado.dir = "asc";
      }
      aplicarFiltrosClienteListadoYRender();
    });
    tr.appendChild(th);
  });
  const thAcc = document.createElement("th");
  thAcc.textContent = "Acciones";
  tr.appendChild(thAcc);
}

function renderFacturasClienteListado(facturas) {
  renderClienteListadoThead();
  tbodyFacturasClienteListado.innerHTML = "";
  // Estado vacío
  var tablaParentCli = tbodyFacturasClienteListado.closest("table");
  if (tablaParentCli) {
    var vacioExistenteCli = tablaParentCli.parentNode.querySelector(".tabla-estado-vacio");
    if (vacioExistenteCli) vacioExistenteCli.remove();
  }
  if (!facturas || !facturas.length) {
    if (tablaParentCli) {
      var divVacioCli = document.createElement("div");
      divVacioCli.className = "tabla-estado-vacio";
      divVacioCli.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><p class="estado-vacio-titulo">No hay facturas para mostrar</p><p class="estado-vacio-subtitulo">Selecciona una empresa y pulsa Cargar listado</p>';
      tablaParentCli.parentNode.insertBefore(divVacioCli, tablaParentCli.nextSibling);
    }
    return;
  }
  facturas.forEach((f) => {
    const tr = document.createElement("tr");
    CLI_LISTADO_COLS.forEach((col) => {
      const td = document.createElement("td");
      const raw = (f[col.key] ?? "").toString().trim();
      if (col.key === "estado_cobro") {
        const val = raw.toLowerCase();
        if (val) {
          const badge = document.createElement("span");
          badge.className = "badge-pago badge-pago-" + val;
          badge.textContent = raw;
          td.appendChild(badge);
        } else {
          td.textContent = "—";
        }
      } else if (col.key === "fecha_factura" && raw.length >= 10) {
        var partesFCli = raw.slice(0, 10).split("-");
        td.textContent = partesFCli.length === 3 ? partesFCli[2] + "/" + partesFCli[1] + "/" + partesFCli[0].slice(2) : raw;
      } else {
        td.textContent = CLI_LISTADO_NUM.has(col.key) ? formatearNumeroES(raw || null) : (raw || "—");
      }
      td.title = raw || "—";
      if (CLI_LISTADO_NUM.has(col.key)) td.classList.add("numero");
      if (col.key === "pais" || col.key === "pais_proveedor") td.classList.add("col-pais");
      if (col.key === "cliente") td.classList.add("col-cliente");
      if (col.key === "localidad") td.classList.add("col-localidad");
      if (col.key === "proyecto") td.classList.add("col-proyecto");
      tr.appendChild(td);
    });
    const tdAcc = document.createElement("td");
    tdAcc.style.minWidth = "130px";
    tdAcc.style.whiteSpace = "nowrap";
    const ruta = (f.ruta_archivo || "").trim();
    if (ruta) {
      const a = document.createElement("a");
      a.href = "/api/archivo?ruta=" + encodeURIComponent(ruta);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Ver";
      a.className = "link-ver-factura";
      tdAcc.appendChild(a);
    }
    const btnEd = document.createElement("button");
    btnEd.type = "button";
    btnEd.className = "btn-editar-factura";
    btnEd.title = "Editar factura";
    btnEd.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/><path d=\"M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z\"/></svg>";
    btnEd.addEventListener("click", () => abrirModalEdicionCli(f));
    tdAcc.appendChild(btnEd);
    tr.appendChild(tdAcc);
    tbodyFacturasClienteListado.appendChild(tr);
  });
}

async function cargarFacturasCliente(empresaId, nombreCliente) {
  clientesSinSeleccionEl.style.display = "none";
  contadorFacturasClienteListado.textContent = "Cargando…";
  clientesFiltrosWrap.style.display = "none";
  // Orden por defecto: fecha más reciente primero
  sortStateClienteListado.key = "fecha_factura";
  sortStateClienteListado.dir = "desc";
  try {
    const url = "/api/facturas_clientes?empresa_id=" + encodeURIComponent(empresaId) + "&cliente=" + encodeURIComponent(nombreCliente);
    const resp = await fetch(url);
    const json = await resp.json();
    const facturas = json.facturas || [];
    FACTURAS_CLIENTE_LISTADO = facturas;
    clienteSeleccionadoNombre = nombreCliente;
    poblarFiltroAnioClienteListado(facturas);
    filtroMesClienteListado.value = "";
    aplicarFiltrosClienteListadoYRender();
    tituloFacturasCliente.textContent = "Facturas de " + nombreCliente;
    clientesFiltrosWrap.style.display = "flex";
    tablaFacturasClienteWrapper.style.display = "block";
  } catch (err) {
    contadorFacturasClienteListado.textContent = "Error al cargar facturas.";
  }
}

filtroAnioClienteListado.addEventListener("change", aplicarFiltrosClienteListadoYRender);
filtroMesClienteListado.addEventListener("change", aplicarFiltrosClienteListadoYRender);

document.getElementById("cli-listado-btn-exportar").addEventListener("click", () => {
  const emp = empresaClientesListadoEl.value;
  if (!emp || !clienteSeleccionadoNombre) { mostrarToast("Selecciona una empresa y un cliente.", "error"); return; }
  const anio = filtroAnioClienteListado.value || "";
  const mes = filtroMesClienteListado.value || "";
  window.open("/api/facturas_clientes_export?empresa_id=" + encodeURIComponent(emp) + "&year=" + encodeURIComponent(anio) + "&month=" + encodeURIComponent(mes) + "&cliente=" + encodeURIComponent(clienteSeleccionadoNombre), "_blank");
});

document.getElementById("cli-listado-btn-descargar").addEventListener("click", () => {
  const emp = empresaClientesListadoEl.value;
  if (!emp || !clienteSeleccionadoNombre) { mostrarToast("Selecciona una empresa y un cliente.", "error"); return; }
  const anio = filtroAnioClienteListado.value || "";
  const mes = filtroMesClienteListado.value || "";
  window.location.href = "/api/facturas_clientes_zip?empresa_id=" + encodeURIComponent(emp) + "&year=" + encodeURIComponent(anio) + "&month=" + encodeURIComponent(mes) + "&cliente=" + encodeURIComponent(clienteSeleccionadoNombre);
});

// ─── Proyectos > Transporte: buscador + mapa con ruta y marcadores ─────────
(function () {
  var form = document.getElementById("form-transporte");
  var statusEl = document.getElementById("transporte-status");
  var rutaResumenEl = document.getElementById("transporte-ruta-resumen");
  var mapContainer = document.getElementById("map-transporte");
  var placeholderEl = document.getElementById("transporte-map-placeholder");
  var listaContainer = document.getElementById("transporte-listado-proveedores");
  var listaResumenEl = document.getElementById("transporte-listado-resumen");
  var btnNuevoProveedor = document.getElementById("transporte-btn-nuevo");
  var filtroFijoBtn = document.getElementById("transporte-filtro-fijo");
  var filtroMovilBtn = document.getElementById("transporte-filtro-movil");
  var filtroEmailBtn = document.getElementById("transporte-filtro-email");
  var filtroWebBtn = document.getElementById("transporte-filtro-web");
  var mensajeWhatsappEl = document.getElementById("transporte-whatsapp-mensaje");
  var btnEnviarWhatsapp = document.getElementById("transporte-btn-enviar-whatsapp");
  var btnDescargarExcel = document.getElementById("transporte-btn-descargar-excel");

  if (!form || !statusEl || !mapContainer) return;

  var mapInstance = null;
  var routeLayer = null;
  var markersLayer = null;
  var waypointsLayer = null;
  var originMarker = null;
  var destMarker = null;
  var routeInfoControl = null;
  var proveedorMarkers = [];
  var proveedorItems = [];
  var proveedoresDatos = [];
  var ultimoContextoWhatsapp = null;
  var ultimaBusquedaRuta = null;

  var paradasListEl = document.getElementById("transporte-paradas-list");
  var btnAnadirParada = document.getElementById("transporte-anadir-parada");
  if (btnAnadirParada && paradasListEl) {
    btnAnadirParada.addEventListener("click", function () {
      var row = document.createElement("div");
      row.className = "transporte-parada-row";
      row.innerHTML =
        "<input type=\"text\" class=\"transporte-parada-input\" placeholder=\"Ej. Toledo\" />" +
        "<a href=\"#\" class=\"transporte-quitar-parada\" role=\"button\">Quitar</a>";
      var quitar = row.querySelector(".transporte-quitar-parada");
      quitar.addEventListener("click", function (e) {
        e.preventDefault();
        row.remove();
      });
      paradasListEl.appendChild(row);
    });
  }

  var modalTransportistaOverlay = document.getElementById("modal-transportista-overlay");
  var btnCerrarModalTransportista = document.getElementById("btn-cerrar-modal-transportista");
  var formTransportista = document.getElementById("form-transportista");
  var transportistaStatusEl = document.getElementById("transportista-status");

  function abrirModalTransportista() {
    if (formTransportista) formTransportista.reset();
    if (transportistaStatusEl) transportistaStatusEl.textContent = "";
    if (modalTransportistaOverlay) {
      modalTransportistaOverlay.classList.add("visible");
      modalTransportistaOverlay.setAttribute("aria-hidden", "false");
    }
  }
  function cerrarModalTransportista() {
    if (modalTransportistaOverlay) {
      modalTransportistaOverlay.classList.remove("visible");
      modalTransportistaOverlay.setAttribute("aria-hidden", "true");
    }
  }

  if (btnNuevoProveedor) {
    btnNuevoProveedor.addEventListener("click", abrirModalTransportista);
  }
  if (btnCerrarModalTransportista) {
    btnCerrarModalTransportista.addEventListener("click", cerrarModalTransportista);
  }
  if (modalTransportistaOverlay) {
    modalTransportistaOverlay.addEventListener("click", function (e) {
      if (e.target === modalTransportistaOverlay) cerrarModalTransportista();
    });
  }
  if (formTransportista) {
    formTransportista.addEventListener("submit", function (e) {
      e.preventDefault();
      var nombre = (document.getElementById("transportista-nombre") && document.getElementById("transportista-nombre").value || "").trim();
      if (!nombre) {
        if (transportistaStatusEl) transportistaStatusEl.textContent = "El nombre es obligatorio.";
        return;
      }
      if (transportistaStatusEl) transportistaStatusEl.textContent = "Guardando…";
      var payload = {
        nombre: nombre,
        direccion: (document.getElementById("transportista-direccion") && document.getElementById("transportista-direccion").value || "").trim(),
        codigo_postal: (document.getElementById("transportista-codigo-postal") && document.getElementById("transportista-codigo-postal").value || "").trim(),
        localidad: (document.getElementById("transportista-localidad") && document.getElementById("transportista-localidad").value || "").trim(),
        provincia: (document.getElementById("transportista-provincia") && document.getElementById("transportista-provincia").value || "").trim(),
        telefono_fijo: (document.getElementById("transportista-telefono-fijo") && document.getElementById("transportista-telefono-fijo").value || "").trim(),
        telefono_movil: (document.getElementById("transportista-telefono-movil") && document.getElementById("transportista-telefono-movil").value || "").trim(),
        email: (document.getElementById("transportista-email") && document.getElementById("transportista-email").value || "").trim(),
        web: (document.getElementById("transportista-web") && document.getElementById("transportista-web").value || "").trim(),
      };
      fetch("/api/proyectos/transporte/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json().then(function (data) {
            if (!r.ok) throw new Error(data.error || r.statusText);
            return data;
          });
        })
        .then(function (data) {
          if (transportistaStatusEl) transportistaStatusEl.textContent = "Transportista guardado correctamente.";
          mostrarToast("Transportista guardado correctamente.", "success");
          setTimeout(cerrarModalTransportista, 1200);
        })
        .catch(function (err) {
          if (transportistaStatusEl) transportistaStatusEl.textContent = "Error: " + (err.message || "no se pudo guardar");
        });
    });
  }

  var listadoTransportistasOverlay = document.getElementById("modal-listado-transportistas-overlay");
  var btnVerListado = document.getElementById("transporte-btn-ver-listado");
  var listadoCerrarBtn = document.getElementById("transporte-listado-cerrar");
  var filtroProvinciaSelect = document.getElementById("transporte-filtro-provincia");
  var tablaTransportistasBody = document.getElementById("tabla-transportistas-admin-body");
  var tablaTransportistas = document.getElementById("tabla-transportistas-admin");
  var formCargaMasiva = document.getElementById("form-carga-masiva-transportistas");
  var cargaMasivaStatus = document.getElementById("transporte-carga-masiva-status");
  var listadoTransportistasData = [];
  var listadoSortCol = "nombre";
  var listadoSortDir = 1;

  var modalEditarTransportistaOverlay = document.getElementById("modal-editar-transportista-overlay");
  var formEditarTransportista = document.getElementById("form-editar-transportista");
  var editarTransportistaStatusEl = document.getElementById("editar-transportista-status");
  var btnCerrarEditarTransportista = document.getElementById("btn-cerrar-editar-transportista");

  function escapeHtmlAdmin(s) {
    if (s == null || s === undefined) return "";
    var t = String(s);
    var div = document.createElement("div");
    div.textContent = t;
    return div.innerHTML;
  }

  function renderListadoTable() {
    if (!tablaTransportistasBody) return;
    var provincia = (filtroProvinciaSelect && filtroProvinciaSelect.value) || "";
    var filtered = provincia ? listadoTransportistasData.filter(function (p) { return (p.provincia || "").trim() === provincia; }) : listadoTransportistasData.slice();
    var col = listadoSortCol;
    var sortKey = col === "telefono" ? "telefono_movil" : col;
    var dir = listadoSortDir;
    filtered.sort(function (a, b) {
      var va = a[sortKey] != null ? String(a[sortKey]).trim().toLowerCase() : "";
      var vb = b[sortKey] != null ? String(b[sortKey]).trim().toLowerCase() : "";
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
    tablaTransportistasBody.innerHTML = "";
    var contadorEl = document.getElementById("transporte-listado-contador");
    if (contadorEl) contadorEl.textContent = filtered.length + " transportista" + (filtered.length !== 1 ? "s" : "");
    filtered.forEach(function (p) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-id", p.id);
      // Merged phone column: móvil preferred, fijo as secondary
      var movil = (p.telefono_movil || "").trim();
      var fijo = (p.telefono_fijo || "").trim();
      var telHtml = "";
      if (movil && fijo) {
        telHtml = escapeHtmlAdmin(movil) + "<br><span style=\"font-size:11px;color:#94A3B8\">" + escapeHtmlAdmin(fijo) + "</span>";
      } else if (movil) {
        telHtml = escapeHtmlAdmin(movil);
      } else if (fijo) {
        telHtml = escapeHtmlAdmin(fijo);
      } else {
        telHtml = "—";
      }
      var emailVal = (p.email || "").trim();
      var webVal = (p.web || "").trim();
      tr.innerHTML =
        "<td>" + escapeHtmlAdmin(p.nombre) + "</td>" +
        "<td>" + escapeHtmlAdmin(p.provincia) + "</td>" +
        "<td>" + escapeHtmlAdmin(p.codigo_postal) + "</td>" +
        "<td>" + telHtml + "</td>" +
        "<td class=\"col-ellipsis\" title=\"" + escapeHtmlAdmin(emailVal) + "\">" + (emailVal ? escapeHtmlAdmin(emailVal) : "—") + "</td>" +
        "<td class=\"col-ellipsis\" title=\"" + escapeHtmlAdmin(webVal) + "\">" + (webVal ? escapeHtmlAdmin(webVal) : "—") + "</td>" +
        "<td><button type=\"button\" class=\"btn-small transporte-btn-editar-fila\" data-id=\"" + p.id + "\">Editar</button></td>";
      var btnEdit = tr.querySelector(".transporte-btn-editar-fila");
      if (btnEdit) {
        btnEdit.addEventListener("click", function () {
          var id = parseInt(btnEdit.getAttribute("data-id"), 10);
          if (isNaN(id)) return;
          fetch("/api/proyectos/transporte/proveedores/" + id)
            .then(function (r) { return r.json(); })
            .then(function (prov) {
              if (!prov || !prov.id) return;
              document.getElementById("editar-transportista-id").value = prov.id;
              document.getElementById("editar-transportista-nombre").value = prov.nombre || "";
              document.getElementById("editar-transportista-direccion").value = prov.direccion || "";
              document.getElementById("editar-transportista-codigo-postal").value = prov.codigo_postal || "";
              document.getElementById("editar-transportista-localidad").value = prov.localidad || "";
              document.getElementById("editar-transportista-provincia").value = prov.provincia || "";
              document.getElementById("editar-transportista-telefono-fijo").value = prov.telefono_fijo || "";
              document.getElementById("editar-transportista-telefono-movil").value = prov.telefono_movil || "";
              document.getElementById("editar-transportista-email").value = prov.email || "";
              document.getElementById("editar-transportista-web").value = prov.web || "";
              if (editarTransportistaStatusEl) editarTransportistaStatusEl.textContent = "";
              modalEditarTransportistaOverlay.classList.add("visible");
              modalEditarTransportistaOverlay.setAttribute("aria-hidden", "false");
            })
            .catch(function () { mostrarToast("Error al cargar el proveedor", "error"); });
        });
      }
      tablaTransportistasBody.appendChild(tr);
    });
    if (tablaTransportistas && tablaTransportistas.querySelector("th.sortable")) {
      tablaTransportistas.querySelectorAll("th.sortable").forEach(function (th) {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.getAttribute("data-col") === listadoSortCol) {
          th.classList.add(listadoSortDir === 1 ? "sort-asc" : "sort-desc");
        }
      });
    }
  }

  function abrirModalListadoTransportistas() {
    if (!listadoTransportistasOverlay) return;
    listadoTransportistasOverlay.classList.add("visible");
    listadoTransportistasOverlay.setAttribute("aria-hidden", "false");
    if (tablaTransportistasBody) tablaTransportistasBody.innerHTML = "<tr><td colspan=\"7\">Cargando…</td></tr>";
    fetch("/api/proyectos/transporte/proveedores")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        listadoTransportistasData = data.proveedores || [];
        var provincias = [];
        listadoTransportistasData.forEach(function (p) {
          var pr = (p.provincia || "").trim();
          if (pr && provincias.indexOf(pr) === -1) provincias.push(pr);
        });
        provincias.sort();
        if (filtroProvinciaSelect) {
          var sel = filtroProvinciaSelect;
          var current = sel.value;
          sel.innerHTML = "<option value=\"\">Todas</option>";
          provincias.forEach(function (pr) {
            var opt = document.createElement("option");
            opt.value = pr;
            opt.textContent = pr;
            sel.appendChild(opt);
          });
          sel.value = current || "";
        }
        renderListadoTable();
      })
      .catch(function () {
        if (tablaTransportistasBody) tablaTransportistasBody.innerHTML = "<tr><td colspan=\"7\">Error al cargar el listado.</td></tr>";
      });
  }

  function cerrarModalListadoTransportistas() {
    if (listadoTransportistasOverlay) {
      listadoTransportistasOverlay.classList.remove("visible");
      listadoTransportistasOverlay.setAttribute("aria-hidden", "true");
    }
  }

  function cerrarModalEditarTransportista() {
    if (modalEditarTransportistaOverlay) {
      modalEditarTransportistaOverlay.classList.remove("visible");
      modalEditarTransportistaOverlay.setAttribute("aria-hidden", "true");
    }
  }

  if (btnVerListado) btnVerListado.addEventListener("click", abrirModalListadoTransportistas);
  if (listadoCerrarBtn) listadoCerrarBtn.addEventListener("click", cerrarModalListadoTransportistas);
  if (listadoTransportistasOverlay) {
    listadoTransportistasOverlay.addEventListener("click", function (e) {
      if (e.target === listadoTransportistasOverlay) cerrarModalListadoTransportistas();
    });
  }
  if (filtroProvinciaSelect) {
    filtroProvinciaSelect.addEventListener("change", renderListadoTable);
  }
  if (tablaTransportistas) {
    tablaTransportistas.addEventListener("click", function (e) {
      var th = e.target.closest("th.sortable");
      if (!th) return;
      var col = th.getAttribute("data-col");
      if (!col) return;
      if (listadoSortCol === col) listadoSortDir = -listadoSortDir; else { listadoSortCol = col; listadoSortDir = 1; }
      renderListadoTable();
    });
  }
  var _cargaMasivaInput = document.getElementById("transporte-carga-masiva-archivo");
  var _cargaMasivaNombre = document.getElementById("transporte-carga-masiva-nombre");
  if (_cargaMasivaInput && _cargaMasivaNombre) {
    _cargaMasivaInput.addEventListener("change", function () {
      _cargaMasivaNombre.textContent = _cargaMasivaInput.files && _cargaMasivaInput.files[0] ? _cargaMasivaInput.files[0].name : "Ningún archivo";
    });
  }
  if (formCargaMasiva) {
    formCargaMasiva.addEventListener("submit", function (e) {
      e.preventDefault();
      var inputFile = document.getElementById("transporte-carga-masiva-archivo");
      if (!inputFile || !inputFile.files || !inputFile.files[0]) {
        if (cargaMasivaStatus) cargaMasivaStatus.textContent = "Selecciona un archivo Excel.";
        return;
      }
      if (cargaMasivaStatus) cargaMasivaStatus.textContent = "Subiendo…";
      var fd = new FormData();
      fd.append("archivo", inputFile.files[0]);
      fetch("/api/proyectos/transporte/proveedores/carga-masiva", { method: "POST", body: fd })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (res.ok) {
            cargaMasivaStatus.textContent = "Carga correcta: " + (res.data.insertados || 0) + " proveedor(es) insertado(s).";
            inputFile.value = "";
            fetch("/api/proyectos/transporte/proveedores").then(function (r) { return r.json(); }).then(function (data) {
              listadoTransportistasData = data.proveedores || [];
              renderListadoTable();
            });
          } else {
            cargaMasivaStatus.textContent = "Error: " + (res.data.error || "no se pudo subir");
          }
        })
        .catch(function () {
          if (cargaMasivaStatus) cargaMasivaStatus.textContent = "Error de conexión.";
        });
    });
  }
  if (formEditarTransportista) {
    formEditarTransportista.addEventListener("submit", function (e) {
      e.preventDefault();
      var id = parseInt(document.getElementById("editar-transportista-id").value, 10);
      if (isNaN(id)) return;
      var payload = {
        nombre: ((document.getElementById("editar-transportista-nombre") && document.getElementById("editar-transportista-nombre").value) || "").trim(),
        direccion: (document.getElementById("editar-transportista-direccion") && document.getElementById("editar-transportista-direccion").value || "").trim(),
        codigo_postal: (document.getElementById("editar-transportista-codigo-postal") && document.getElementById("editar-transportista-codigo-postal").value || "").trim(),
        localidad: (document.getElementById("editar-transportista-localidad") && document.getElementById("editar-transportista-localidad").value || "").trim(),
        provincia: (document.getElementById("editar-transportista-provincia") && document.getElementById("editar-transportista-provincia").value || "").trim(),
        telefono_fijo: (document.getElementById("editar-transportista-telefono-fijo") && document.getElementById("editar-transportista-telefono-fijo").value || "").trim(),
        telefono_movil: (document.getElementById("editar-transportista-telefono-movil") && document.getElementById("editar-transportista-telefono-movil").value || "").trim(),
        email: (document.getElementById("editar-transportista-email") && document.getElementById("editar-transportista-email").value || "").trim(),
        web: (document.getElementById("editar-transportista-web") && document.getElementById("editar-transportista-web").value || "").trim(),
      };
      if (!payload.nombre) {
        if (editarTransportistaStatusEl) editarTransportistaStatusEl.textContent = "El nombre es obligatorio.";
        return;
      }
      if (editarTransportistaStatusEl) editarTransportistaStatusEl.textContent = "Guardando…";
      fetch("/api/proyectos/transporte/proveedores/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (res.ok) {
            var idx = listadoTransportistasData.findIndex(function (p) { return p.id === id; });
            if (idx >= 0) {
              listadoTransportistasData[idx] = Object.assign({}, listadoTransportistasData[idx], payload);
            }
            cerrarModalEditarTransportista();
            renderListadoTable();
            mostrarToast("Transportista actualizado correctamente.", "success");
            if (ultimaBusquedaRuta) {
              fetch("/api/proyectos/transporte/buscar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ origen: ultimaBusquedaRuta.origen, destino: ultimaBusquedaRuta.destino, paradas: ultimaBusquedaRuta.paradas }),
              })
                .then(function (r) {
                  if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.statusText); });
                  return r.json();
                })
                .then(function (data) {
                  aplicarResultadoRuta(data, ultimaBusquedaRuta.origen, ultimaBusquedaRuta.destino, ultimaBusquedaRuta.paradas);
                })
                .catch(function () {});
            }
          } else {
            if (editarTransportistaStatusEl) editarTransportistaStatusEl.textContent = "Error: " + (res.data.error || "no se pudo guardar");
          }
        })
        .catch(function () {
          if (editarTransportistaStatusEl) editarTransportistaStatusEl.textContent = "Error de conexión.";
        });
    });
  }
  if (btnCerrarEditarTransportista) btnCerrarEditarTransportista.addEventListener("click", cerrarModalEditarTransportista);
  if (modalEditarTransportistaOverlay) {
    modalEditarTransportistaOverlay.addEventListener("click", function (e) {
      if (e.target === modalEditarTransportistaOverlay) cerrarModalEditarTransportista();
    });
  }

  function bindFiltro(btn) {
    if (!btn) return;
    btn.addEventListener("click", function () {
      btn.classList.toggle("activo");
      aplicarFiltrosProveedores();
    });
  }
  bindFiltro(filtroFijoBtn);
  bindFiltro(filtroMovilBtn);
  bindFiltro(filtroEmailBtn);
  bindFiltro(filtroWebBtn);

  if (btnDescargarExcel) {
    btnDescargarExcel.addEventListener("click", function () {
      if (!proveedoresDatos || proveedoresDatos.length === 0) {
        mostrarToast("No hay proveedores en la ruta para descargar. Busca una ruta primero.", "info");
        return;
      }
      var payload = {
        proveedores: proveedoresDatos,
        ruta: ultimoContextoWhatsapp ? {
          texto: ultimoContextoWhatsapp.rutaTexto,
          distancia_km: ultimoContextoWhatsapp.distancia_km,
          duracion_min: ultimoContextoWhatsapp.duracion_min,
        } : {},
      };
      fetch("/api/proyectos/transporte/proveedores/exportar-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.statusText); });
          return r.blob();
        })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = "proveedores_ruta.xlsx";
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        })
        .catch(function (err) {
          mostrarToast("Error al descargar: " + (err.message || "no se pudo generar el Excel"), "error");
        });
    });
  }

  if (btnEnviarWhatsapp) {
    btnEnviarWhatsapp.addEventListener("click", function () {
      if (!listaContainer) return;
      var checks = listaContainer.querySelectorAll(".transporte-list-select:checked");
      if (!checks.length) {
        mostrarToast("Selecciona al menos un proveedor para enviarles un WhatsApp.", "error");
        return;
      }
      var msg = encodeURIComponent(obtenerMensajeWhatsappParaEnvio());
      checks.forEach(function (chk) {
        var idx = parseInt(chk.getAttribute("data-idx") || "-1", 10);
        if (isNaN(idx) || !proveedoresDatos[idx]) return;
        var p = proveedoresDatos[idx];
        var movil = (p.telefono_movil || "").replace(/[^0-9]/g, "");
        if (!movil) return;
        if (movil.length === 9) movil = "34" + movil;
        var url = "https://wa.me/" + movil + "?text=" + msg;
        window.open(url, "_blank");
      });
    });
  }

  function limpiarListadoProveedores() {
    proveedorMarkers = [];
    proveedorItems = [];
    proveedoresDatos = [];
    if (listaContainer) {
      listaContainer.innerHTML = "";
    }
    if (listaResumenEl) {
      listaResumenEl.textContent = "";
    }
  }

  function obtenerMensajeWhatsappPorDefecto() {
    var base =
      "Hola, estamos planificando un transporte de maquinaria para la ruta ORIGEN_DESTINO para [xx] máquinas hincadoras. " +
      "Estas máquinas son de aproximadamente 4Tn, y medidas: 2,2m x 2,5m x 2,8m (ancho-profundo-alto). " +
      "¿Podríais indicarnos disponibilidad y precio aproximado? Gracias";
    if (ultimoContextoWhatsapp && ultimoContextoWhatsapp.rutaTexto) {
      return base.replace("ORIGEN_DESTINO", ultimoContextoWhatsapp.rutaTexto);
    }
    return base.replace("ORIGEN_DESTINO", "");
  }

  function obtenerMensajeWhatsappParaEnvio() {
    var txt = (mensajeWhatsappEl && mensajeWhatsappEl.value || "").trim();
    if (!txt) {
      txt = obtenerMensajeWhatsappPorDefecto();
    }
    return txt;
  }

  function marcarProveedorActivo(idx, panTo) {
    if (!listaContainer) return;
    proveedorItems.forEach(function (el, i) {
      if (!el) return;
      if (i === idx) {
        el.classList.add("activo");
      } else {
        el.classList.remove("activo");
      }
    });
    var m = proveedorMarkers[idx];
    if (m && mapInstance && panTo) {
      mapInstance.panTo(m.getLatLng());
      m.openPopup();
    }
    var item = proveedorItems[idx];
    if (item && listaContainer) {
      var parent = listaContainer;
      var parentRect = parent.getBoundingClientRect();
      var itemRect = item.getBoundingClientRect();
      // Solo desplazamos si el elemento queda fuera de la vista
      if (itemRect.top < parentRect.top) {
        parent.scrollTop += itemRect.top - parentRect.top - 8;
      } else if (itemRect.bottom > parentRect.bottom) {
        parent.scrollTop += itemRect.bottom - parentRect.bottom + 8;
      }
    }
  }

  function crearFilaProveedor(p, idx) {
    if (!listaContainer) return null;
    var div = document.createElement("div");
    div.className = "transporte-list-item";
    var nombre = (p.nombre || "").trim() || "—";
    var telefonoFijo = (p.telefono_fijo || "").trim() || "";
    var telefonoMovil = (p.telefono_movil || "").trim() || "";
    var email = (p.email || "").trim() || "";
    var web = (p.web || "").trim() || "";
    var dist = p.distancia_km != null ? p.distancia_km.toFixed(1) + " km" : "";
    var tieneFijo = !!telefonoFijo;
    var tieneMovil = !!telefonoMovil;
    var tieneEmail = !!email;
    var tieneWeb = !!web;
    var icons = "";
    if (tieneFijo) {
      icons += "<span class=\"transporte-list-icon icon-fijo\" title=\"Teléfono fijo\">☎</span>";
    }
    if (tieneMovil) {
      var movilDigits = telefonoMovil.replace(/[^0-9]/g, "");
      if (movilDigits.length === 9) {
        movilDigits = "34" + movilDigits;
      }
      if (movilDigits) {
        var msg = encodeURIComponent(obtenerMensajeWhatsappParaEnvio());
        icons +=
          "<a href=\"https://wa.me/" +
          movilDigits +
          "?text=" +
          msg +
          "\" class=\"transporte-list-icon icon-movil\" title=\"Enviar WhatsApp\" target=\"_blank\" rel=\"noopener noreferrer\">✆</a>";
      } else {
        icons += "<span class=\"transporte-list-icon icon-movil\" title=\"Teléfono móvil\">✆</span>";
      }
    }
    if (tieneEmail) {
      icons += "<span class=\"transporte-list-icon icon-email\" title=\"Email\">✉</span>";
    }
    if (tieneWeb) {
      icons += "<span class=\"transporte-list-icon icon-web\" title=\"Web\">🌐</span>";
    }

    div.innerHTML =
      "<div class=\"transporte-list-item-linea\">" +
      "<span class=\"transporte-list-select-wrap\"><input type=\"checkbox\" class=\"transporte-list-select\" data-idx=\"" + idx + "\"></span>" +
      "<span class=\"transporte-list-item-nombre\">" + escapeHtml(nombre) + "</span>" +
      "<span class=\"transporte-list-icon-row\">" + icons + "</span>" +
      "<span class=\"numero\">" + (dist ? dist : "") + "</span>" +
      "</div>";

    div.addEventListener("click", function () {
      marcarProveedorActivo(idx, true);
    });
    listaContainer.appendChild(div);
    return div;
  }

  function aplicarFiltrosProveedores() {
    if (!listaContainer) return;
    var requiereFijo = filtroFijoBtn && filtroFijoBtn.classList.contains("activo");
    var requiereMovil = filtroMovilBtn && filtroMovilBtn.classList.contains("activo");
    var requiereEmail = filtroEmailBtn && filtroEmailBtn.classList.contains("activo");
    var requiereWeb = filtroWebBtn && filtroWebBtn.classList.contains("activo");
    proveedorItems.forEach(function (el, idx) {
      if (!el) return;
      var p = proveedoresDatos[idx] || {};
      var tieneFijo = !!((p.telefono_fijo || "").trim());
      var tieneMovil = !!((p.telefono_movil || "").trim());
      var tieneEmail = !!((p.email || "").trim());
      var tieneWeb = !!((p.web || "").trim());
      var visible = true;
      if (requiereFijo || requiereMovil || requiereEmail || requiereWeb) {
        visible =
          (!requiereFijo || tieneFijo) &&
          (!requiereMovil || tieneMovil) &&
          (!requiereEmail || tieneEmail) &&
          (!requiereWeb || tieneWeb);
      }
      el.style.display = visible ? "" : "none";
      var m = proveedorMarkers[idx];
      if (m) {
        m.setOpacity(visible ? 1 : 0.25);
      }
    });
  }

  function mostrarEstado(texto, esError) {
    statusEl.style.display = "block";
    statusEl.textContent = texto;
    statusEl.style.color = esError ? "#b91c1c" : "";
  }

  function initMap() {
    if (mapInstance) return mapInstance;
    mapInstance = L.map("map-transporte").setView([40.4, -3.7], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(mapInstance);
    return mapInstance;
  }

  function clearMapLayers() {
    if (routeInfoControl && mapInstance) {
      mapInstance.removeControl(routeInfoControl);
      routeInfoControl = null;
    }
    if (waypointsLayer && mapInstance) {
      mapInstance.removeLayer(waypointsLayer);
      waypointsLayer = null;
    }
    if (originMarker && mapInstance) {
      mapInstance.removeLayer(originMarker);
      originMarker = null;
    }
    if (destMarker && mapInstance) {
      mapInstance.removeLayer(destMarker);
      destMarker = null;
    }
    if (routeLayer) {
      mapInstance.removeLayer(routeLayer);
      routeLayer = null;
    }
    if (markersLayer) {
      mapInstance.removeLayer(markersLayer);
      markersLayer = null;
    }
    limpiarListadoProveedores();
  }

  function escapeHtml(s) {
    if (s == null) return "";
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function aplicarResultadoRuta(data, origen, destino, paradas) {
    statusEl.style.display = "none";
    var ruta = data.ruta || {};
    var proveedores = data.proveedores || [];
    var coords = ruta.coordenadas_ruta || [];
    var distKm = ruta.distancia_km != null ? ruta.distancia_km : 0;
    var durMin = ruta.duracion_min != null ? ruta.duracion_min : 0;
    var rutaTexto = escapeHtml(origen);
    if (paradas.length > 0) {
      paradas.forEach(function (p) { rutaTexto += " → " + escapeHtml(p); });
    }
    rutaTexto += " → " + escapeHtml(destino);
    rutaResumenEl.innerHTML =
      "<p><strong>Ruta:</strong> " + rutaTexto + "</p>" +
      "<p><strong>Distancia:</strong> " + distKm.toFixed(1) + " km · <strong>Duración:</strong> " + Math.round(durMin) + " min</p>" +
      (proveedores.length === 0 ? "<p class=\"transporte-sin-proveedores\">No hay proveedores a menos de 50 km de la ruta.</p>" : "");
    rutaResumenEl.style.display = "block";
    ultimoContextoWhatsapp = { rutaTexto: rutaTexto, distancia_km: distKm, duracion_min: durMin };
    if (mensajeWhatsappEl) mensajeWhatsappEl.value = obtenerMensajeWhatsappPorDefecto();
    if (listaResumenEl) {
      listaResumenEl.textContent = proveedores.length
        ? proveedores.length + " proveedor(es) en la ruta (ordenados por cercanía)."
        : "No hay proveedores en la ruta para los criterios actuales.";
    }
    if (listaContainer && proveedores.length === 0) {
      var vacio = document.createElement("div");
      vacio.className = "transporte-list-empty";
      vacio.textContent = "Sin proveedores para esta ruta.";
      listaContainer.appendChild(vacio);
    }
    if (typeof L === "undefined") {
      mostrarEstado("Error: no se pudo cargar el mapa (Leaflet). Recarga la página.", true);
      if (placeholderEl) { placeholderEl.classList.remove("oculto"); placeholderEl.style.display = ""; }
      return;
    }
    if (placeholderEl) { placeholderEl.classList.add("oculto"); placeholderEl.style.display = "none"; }
    clearMapLayers();
    if (mapContainer) { mapContainer.style.minHeight = "450px"; mapContainer.style.height = "100%"; }
    setTimeout(function () {
      try { initMap(); } catch (err) {
        console.error("Leaflet initMap error:", err);
        mostrarEstado("Error al crear el mapa: " + (err.message || String(err)), true);
        if (placeholderEl) { placeholderEl.classList.remove("oculto"); placeholderEl.style.display = ""; }
        return;
      }
      if (!mapInstance) return;
      if (coords.length >= 2) {
        var latlngs = coords.map(function (c) { return [c[0], c[1]]; });
        routeLayer = L.polyline(latlngs, { color: "#1e40af", weight: 5, opacity: 0.8 }).addTo(mapInstance);
        var iconOrigen = L.divIcon({ className: "transporte-marker-origen", html: "<span class=\"transporte-marker-pin\" title=\"Origen\">O</span>", iconSize: [28, 28], iconAnchor: [14, 14] });
        var iconDestino = L.divIcon({ className: "transporte-marker-destino", html: "<span class=\"transporte-marker-pin\" title=\"Destino\">D</span>", iconSize: [28, 28], iconAnchor: [14, 14] });
        originMarker = L.marker(latlngs[0], { icon: iconOrigen }).addTo(mapInstance);
        originMarker.bindTooltip("Origen: " + escapeHtml(origen), { permanent: true, direction: "top", className: "transporte-tooltip-origen", offset: [0, -14] });
        destMarker = L.marker(latlngs[latlngs.length - 1], { icon: iconDestino }).addTo(mapInstance);
        destMarker.bindTooltip("Destino: " + escapeHtml(destino), { permanent: true, direction: "top", className: "transporte-tooltip-destino", offset: [0, -14] });
        var paradasCoords = (ruta.paradas_coords || []);
        if (paradasCoords.length > 0) {
          waypointsLayer = L.layerGroup().addTo(mapInstance);
          paradasCoords.forEach(function (pa) {
            var lat = pa.lat, lon = pa.lon;
            if (lat == null || lon == null) return;
            var num = pa.numero != null ? pa.numero : 0;
            var nombreParada = (pa.nombre || "").trim() || ("Parada " + num);
            var iconParada = L.divIcon({ className: "transporte-marker-parada", html: "<span class=\"transporte-marker-pin\" title=\"Parada " + num + "\">P" + num + "</span>", iconSize: [24, 24], iconAnchor: [12, 12] });
            var m = L.marker([lat, lon], { icon: iconParada }).addTo(waypointsLayer);
            m.bindTooltip("Parada " + num + ": " + escapeHtml(nombreParada), { permanent: true, direction: "top", className: "transporte-tooltip-parada", offset: [0, -12] });
          });
        }
        if (routeInfoControl && mapInstance) mapInstance.removeControl(routeInfoControl);
        routeInfoControl = L.control({ position: "topright" });
        routeInfoControl.onAdd = function () {
          var div = L.DomUtil.create("div", "transporte-map-info");
          div.innerHTML = "<strong>" + distKm.toFixed(1) + " km</strong> · <strong>" + Math.round(durMin) + " min</strong>";
          return div;
        };
        routeInfoControl.addTo(mapInstance);
        mapInstance.fitBounds(routeLayer.getBounds(), { padding: [40, 40], maxZoom: 10 });
      } else {
        mapInstance.setView([40.4, -3.7], 6);
      }
      setTimeout(function () { if (mapInstance && mapInstance.invalidateSize) mapInstance.invalidateSize(); }, 300);
      markersLayer = L.layerGroup().addTo(mapInstance);
      proveedoresDatos = proveedores.slice();
      var iconProveedor = L.divIcon({ className: "transporte-marker-proveedor", html: "<span class=\"transporte-marker-pin transporte-marker-pin-proveedor\" title=\"Proveedor\">🚚</span>", iconSize: [28, 28], iconAnchor: [14, 14] });
      proveedores.forEach(function (p, idx) {
        var lat = p.lat, lon = p.lon;
        if (lat == null || lon == null) return;
        var nombre = (p.nombre || "").trim() || "—";
        var localidad = (p.localidad || "").trim() || "—";
        var telefono = (p.telefono || "").trim() || "";
        var email = (p.email || "").trim() || "";
        var web = (p.web || "").trim() || "";
        var dist = p.distancia_km != null ? p.distancia_km.toFixed(1) + " km" : "";
        var popupContent = "<div class=\"transporte-popup\">" +
          "<strong>" + escapeHtml(nombre) + "</strong><br/>" +
          (localidad !== "—" ? escapeHtml(localidad) + "<br/>" : "") +
          (telefono ? "Tel: <a href=\"tel:" + telefono.replace(/\s/g, "") + "\">" + escapeHtml(telefono) + "</a><br/>" : "") +
          (email ? "Email: <a href=\"mailto:" + escapeHtml(email) + "\">" + escapeHtml(email) + "</a><br/>" : "") +
          (web ? "Web: <a href=\"" + escapeHtml(web) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(web.replace(/^https?:\/\//, "")) + "</a><br/>" : "") +
          (dist ? "A " + dist + " de la ruta" : "") + "</div>";
        var marker = L.marker([lat, lon], { icon: iconProveedor }).addTo(markersLayer);
        marker.bindPopup(popupContent, { maxWidth: 320 });
        var fila = crearFilaProveedor(p, idx);
        proveedorMarkers[idx] = marker;
        proveedorItems[idx] = fila;
        marker.on("click", function () { marcarProveedorActivo(idx, false); });
      });
    }, 50);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var origen = (document.getElementById("transporte-origen").value || "").trim();
    var destino = (document.getElementById("transporte-destino").value || "").trim();
    var paradas = [];
    if (paradasListEl) {
      paradasListEl.querySelectorAll(".transporte-parada-input").forEach(function (input) {
        var v = (input.value || "").trim();
        if (v) paradas.push(v);
      });
    }
    if (!origen || !destino) {
      mostrarEstado("Introduce origen y destino.", true);
      return;
    }
    if (placeholderEl) { placeholderEl.classList.add("oculto"); placeholderEl.style.display = "none"; }
    mostrarEstado("Buscando ruta y proveedores…", false);
    rutaResumenEl.style.display = "none";
    rutaResumenEl.innerHTML = "";
    limpiarListadoProveedores();
    fetch("/api/proyectos/transporte/buscar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origen: origen, destino: destino, paradas: paradas }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.statusText); });
        return r.json();
      })
      .then(function (data) {
        ultimaBusquedaRuta = { origen: origen, destino: destino, paradas: paradas.slice() };
        aplicarResultadoRuta(data, origen, destino, paradas);
      })
      .catch(function (err) {
        mostrarEstado(err.message || "Error al buscar ruta o proveedores.", true);
        if (placeholderEl) {
          placeholderEl.classList.remove("oculto");
          placeholderEl.style.display = "";
        }
      });
  });
})();

// Global HTML escape (used by Tesoreria and CRM IIFEs)
function _esc(s) {
  if (!s) return "";
  var d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ═══ PROYECTOS CRUD ═════════════════════════════════════════════════════════════
(function () {
  var proyModalEl = document.getElementById("modal-proyecto");
  var proyFormEl = document.getElementById("form-proyecto");
  var parteModalEl = document.getElementById("modal-parte");
  var parteFormEl = document.getElementById("form-parte");

  function _fE(n) { return n ? Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }) : ""; }

  function _cargarDashProy() {
    fetch("/api/proyectos/dashboard")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var el = function (id) { return document.getElementById(id); };
        el("proy-met-vivos").textContent = (d.por_estado && d.por_estado.vivo) || 0;
        el("proy-met-hincas").textContent = d.hincas_mes || 0;
        el("proy-met-horas").textContent = d.horas_maquina_mes || 0;
        el("proy-met-fact").textContent = _fE(d.importe_facturado);
      }).catch(function () {});
  }

  // Observe dashboard visibility
  var dashPanel = document.getElementById("panel-proyectos-inicio");
  if (dashPanel) {
    new MutationObserver(function () {
      if (dashPanel.classList.contains("visible")) _cargarDashProy();
    }).observe(dashPanel, { attributes: true, attributeFilter: ["class"] });
  }

  // ── Navegación cruzada entre módulos ──
  window.navegarAPresupuesto = function (presupId) {
    if (!presupId) return;
    activarModulo("presupuestos");
    activarSubpanel("presupuestos", "todos");
    setTimeout(function () { if (window.presupEditar) presupEditar(presupId); }, 200);
  };
  window.navegarAOportunidad = function (oportunidadId) {
    if (!oportunidadId) return;
    activarModulo("crm");
    activarSubpanel("crm", "oportunidades");
    setTimeout(function () { if (window._opEditarById) _opEditarById(oportunidadId); }, 200);
  };
  window.navegarAProyecto = function (proyectoId) {
    if (!proyectoId) return;
    activarModulo("proyectos");
    window.proyectoDashboard(proyectoId);
  };

  // ── Dashboard de proyecto individual ──
  function _dashFmtEur(n) {
    if (n == null || n === "") return "\u2014";
    return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function _dashFmtEurCompact(val) {
    if (!val && val !== 0) return "\u2014";
    var num = Number(val);
    if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(1) + "M \u20AC";
    if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + "k \u20AC";
    return num.toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " \u20AC";
  }
  function _dashDiasActivo(p) {
    var inicio = p.fecha_inicio_real || p.fecha_inicio_estimada;
    if (!inicio) return 0;
    var d0 = new Date(inicio);
    var d1 = p.fecha_fin_real ? new Date(p.fecha_fin_real) : new Date();
    return Math.max(0, Math.floor((d1 - d0) / 86400000));
  }

  var _dashLastSubpanel = "inicio";

  window.proyectoDashboard = function (proyectoId) {
    fetch("/api/proyectos/" + proyectoId + "/dashboard")
      .then(function (r) { return r.json(); })
      .then(function (p) {
        if (p.error) { mostrarToast(p.error, "error"); return; }
        var container = document.getElementById("proyecto-dashboard-content");

        var diasActivo = _dashDiasActivo(p);
        var rp = p.resumen_partes || {};
        var hincasPct = p.hincas_estimadas ? ((rp.total_hincas || 0) / p.hincas_estimadas * 100).toFixed(1) : "\u2014";
        var totalCostes = (p.resumen_costes || {}).total_costes || 0;
        // Calcular facturado desde facturas_cliente
        var totalFacturado = 0;
        (p.facturas_cliente || []).forEach(function (f) {
          var s = String(f.total_a_pagar || "").replace(/\s/g, "");
          if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
          var n = parseFloat(s); if (!isNaN(n)) totalFacturado += n;
        });
        var margen = totalFacturado - totalCostes;
        var margenPct = totalFacturado ? ((margen / totalFacturado) * 100).toFixed(1) : "\u2014";

        // Badges de navegación cruzada
        var badges = "";
        var presId = p.presupuesto_id_vinculado || p.presupuesto_id;
        var presRef = p.presupuesto_ref;
        if (presId && presRef) badges += '<a href="#" onclick="navegarAPresupuesto(' + presId + ');return false;" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#2563EB10;color:#2563EB;border-radius:99px;font-size:12px;text-decoration:none;border:1px solid #2563EB30;">\uD83D\uDCC4 ' + _esc(presRef) + '</a>';
        var oportId = p.oportunidad_id_vinculado || p.oportunidad_id;
        var oportNom = p.oportunidad_nombre;
        if (oportId && oportNom) badges += '<a href="#" onclick="navegarAOportunidad(' + oportId + ');return false;" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#16A34A10;color:#16A34A;border-radius:99px;font-size:12px;text-decoration:none;border:1px solid #16A34A30;">\u2B50 ' + _esc(oportNom) + '</a>';

        // Botones de acción por estado
        var acciones = "";
        if (p.estado === "cotizado") acciones = '<button class="primary" style="width:auto;padding:8px 16px;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'vivo\')">Activar proyecto</button>';
        else if (p.estado === "vivo") acciones = '<button class="secondary" style="padding:8px 16px;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'pausado\')">Pausar</button><button class="secondary" style="padding:8px 16px;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'terminado\')">Terminar</button>';
        else if (p.estado === "pausado") acciones = '<button class="primary" style="width:auto;padding:8px 16px;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'vivo\')">Reactivar</button>';
        acciones += '<button class="secondary" style="padding:8px 16px;" onclick="_proyEditar(' + p.id + ')">Editar datos</button>';

        // Historial timeline
        var histHtml = "";
        if (p.historial && p.historial.length) {
          histHtml = '<div style="position:relative;padding-left:24px;">';
          p.historial.forEach(function (h, i) {
            var isFirst = i === 0;
            var isLast = i === p.historial.length - 1;
            histHtml += '<div style="position:relative;margin-bottom:' + (isLast ? '0' : '16px') + ';">' +
              '<div style="position:absolute;left:-24px;width:12px;height:12px;border-radius:50%;background:' + (isFirst ? 'var(--color-primary)' : 'var(--color-border)') + ';margin-top:4px;"></div>' +
              (!isLast ? '<div style="position:absolute;left:-19px;top:16px;width:2px;height:calc(100% + 4px);background:var(--color-border);"></div>' : '') +
              '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
              (h.estado_anterior ? '<span class="status-badge status-badge--' + _esc(h.estado_anterior) + '">' + _esc(h.estado_anterior) + '</span><span style="color:var(--color-text-secondary);">\u2192</span>' : '') +
              '<span class="status-badge status-badge--' + _esc(h.estado_nuevo) + '">' + _esc(h.estado_nuevo) + '</span>' +
              '<span style="font-size:12px;color:var(--color-text-secondary);">' + _esc((h.fecha || "").substring(0, 10)) + '</span>' +
              '</div>' +
              (h.motivo ? '<div style="font-size:13px;color:var(--color-text-secondary);margin-top:4px;">' + _esc(h.motivo) + '</div>' : '') +
              (h.usuario ? '<div style="font-size:11px;color:var(--color-text-secondary);">por ' + _esc(h.usuario) + '</div>' : '') +
              '</div>';
          });
          histHtml += '</div>';
        } else {
          histHtml = '<p style="color:var(--color-text-secondary);font-size:13px;">Sin cambios de estado registrados</p>';
        }

        container.innerHTML =
          // HEADER
          '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:24px;flex-wrap:wrap;gap:12px;">' +
            '<div>' +
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
                '<button onclick="proyectoDashboardVolver()" style="background:none;border:none;cursor:pointer;font-size:18px;padding:0;color:var(--color-text-secondary);">\u2190</button>' +
                '<h1 style="margin:0;font-size:24px;">' + _esc(p.nombre) + '</h1>' +
                '<span class="status-badge status-badge--' + _esc(p.estado) + '">' + _esc(p.estado) + '</span>' +
              '</div>' +
              '<div style="font-size:14px;color:var(--color-text-secondary);">' +
                _esc(p.cliente_nombre || "") + (p.nombre_parque ? ' \u00B7 ' + _esc(p.nombre_parque) : "") + (p.provincia ? ' \u00B7 ' + _esc(p.provincia) : "") +
              '</div>' +
              (badges ? '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' + badges + '</div>' : '') +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + acciones + '</div>' +
          '</div>' +
          // KPIs - 3 grupos
          '<div id="proy-dash-kpis" style="display:grid;grid-template-columns:280px 1fr 180px;gap:14px;margin-bottom:20px;">' +
            // GRUPO 1: AVANCE
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
              '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Avance del proyecto</div>' +
              '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px;">' +
                '<span style="font-size:28px;font-weight:700;color:var(--color-text);">' + (rp.total_hincas || 0) + '</span>' +
                '<span style="font-size:14px;color:var(--color-text-secondary);">/ ' + (p.hincas_estimadas || "\u2014") + ' hincas</span>' +
              '</div>' +
              '<div style="height:10px;background:var(--color-bg-alt);border-radius:5px;overflow:hidden;margin-bottom:8px;">' +
                '<div style="height:100%;background:linear-gradient(90deg,#2563EB,#16A34A);border-radius:5px;width:' + (p.hincas_estimadas ? Math.min(100, (rp.total_hincas || 0) / p.hincas_estimadas * 100) : 0) + '%;transition:width 0.5s;"></div>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-secondary);">' +
                '<span>' + hincasPct + '% completado</span>' +
                '<span>' + diasActivo + ' d\u00eda' + (diasActivo !== 1 ? 's' : '') + ' activo</span>' +
              '</div>' +
            '</div>' +
            // GRUPO 2: FINANCIERO
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
              '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Financiero</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;text-align:center;">' +
                '<div><div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:2px;">Presupuestado</div><div style="font-size:18px;font-weight:600;color:var(--color-text);">' + _dashFmtEurCompact(p.importe_presupuestado) + '</div></div>' +
                '<div style="position:relative;"><div style="position:absolute;left:-4px;top:50%;color:var(--color-border);font-size:14px;">\u203A</div><div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:2px;">Facturado</div><div style="font-size:18px;font-weight:600;color:#2563EB;">' + _dashFmtEurCompact(totalFacturado) + '</div></div>' +
                '<div style="position:relative;"><div style="position:absolute;left:-4px;top:50%;color:var(--color-border);font-size:14px;">\u203A</div><div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:2px;">Costes</div><div style="font-size:18px;font-weight:600;color:#DC2626;">' + _dashFmtEurCompact(totalCostes) + '</div></div>' +
                '<div style="position:relative;padding:6px;border-radius:var(--radius-md);background:' + (margen >= 0 ? '#16A34A08' : '#DC262608') + ';"><div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:2px;">Margen</div><div style="font-size:18px;font-weight:700;color:' + (margen >= 0 ? '#16A34A' : '#DC2626') + ';">' + _dashFmtEurCompact(margen) + '</div><div style="font-size:10px;color:' + (margen >= 0 ? '#16A34A' : '#DC2626') + ';">' + margenPct + '%</div></div>' +
              '</div>' +
              (p.importe_presupuestado ? (
                '<div style="display:flex;height:4px;border-radius:2px;overflow:hidden;margin-top:10px;background:var(--color-bg-alt);">' +
                  '<div style="background:#2563EB;width:' + Math.min(100, (totalFacturado / p.importe_presupuestado) * 100) + '%;"></div>' +
                  '<div style="background:#DC2626;width:' + Math.min(100 - Math.min(100, (totalFacturado / p.importe_presupuestado) * 100), (totalCostes / p.importe_presupuestado) * 100) + '%;"></div>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--color-text-secondary);margin-top:3px;">' +
                  '<span>Facturado: ' + Math.round((totalFacturado / p.importe_presupuestado) * 100) + '%</span>' +
                  '<span>del presupuesto</span>' +
                '</div>'
              ) : '') +
            '</div>' +
            // GRUPO 3: OPERATIVO
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
              '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Operativo</div>' +
              '<div style="margin-bottom:12px;">' +
                '<div style="font-size:24px;font-weight:600;color:var(--color-text);">' + (rp.total_horas_maquina || 0) + 'h</div>' +
                '<div style="font-size:11px;color:var(--color-text-secondary);">horas m\u00e1quina</div>' +
              '</div>' +
              '<div>' +
                '<div style="font-size:24px;font-weight:600;color:var(--color-text);">' + (rp.total_partes || 0) + '</div>' +
                '<div style="font-size:11px;color:var(--color-text-secondary);">partes registrados</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          // TABS
          '<div style="display:flex;gap:0;border-bottom:2px solid var(--color-border);margin-bottom:20px;">' +
            '<button class="proy-dash-tab" data-tab="operativo" onclick="proyDashCambiarTab(\'operativo\')" style="padding:10px 24px;font-size:14px;font-weight:500;background:none;border:none;border-bottom:2px solid var(--color-primary);margin-bottom:-2px;color:var(--color-primary);cursor:pointer;">Operativo</button>' +
            '<button class="proy-dash-tab" data-tab="gestion" onclick="proyDashCambiarTab(\'gestion\')" style="padding:10px 24px;font-size:14px;font-weight:500;background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--color-text-secondary);cursor:pointer;">Gesti\u00f3n</button>' +
          '</div>' +
          '<div id="proy-dash-tab-operativo" class="proy-dash-tab-content">' +
            '<div style="display:flex;flex-direction:column;gap:14px;">' +
              '<div id="proy-dash-recursos-section"></div>' +
              '<div style="display:grid;grid-template-columns:3fr 2fr;gap:14px;">' +
                '<div style="display:flex;flex-direction:column;gap:14px;">' +
                  '<div id="proy-dash-partes-section"></div>' +
                  '<div id="proy-dash-certificaciones-section"></div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:14px;">' +
                  '<div id="proy-dash-facturacion-section"></div>' +
                  '<div id="proy-dash-costes-section"></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div id="proy-dash-tab-gestion" class="proy-dash-tab-content" style="display:none;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
              '<div id="proy-dash-presupuestos-section"></div>' +
              '<div id="proy-dash-crm-section"></div>' +
              '<div id="proy-dash-documentos-section"></div>' +
              '<div id="proy-dash-historial-section"></div>' +
            '</div>' +
          '</div>';

        // ═══ Sección: Partes de trabajo ═══
        var partesHtml = "";
        if (p.partes && p.partes.length) {
          var filas = p.partes.slice(0, 20).map(function (pt) {
            return '<tr style="border-bottom:1px solid var(--color-border);">' +
              '<td style="padding:8px 6px;">' + _esc((pt.fecha || "").substring(0, 10)) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;font-weight:500;">' + (pt.hincas_realizadas || 0) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;">' + (pt.horas_maquina || 0) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;">' + (pt.horas_personal || 0) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;">' + (pt.num_operadores || 0) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;">' + (pt.num_ayudantes || 0) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;">' + (pt.combustible_litros || "\u2014") + '</td>' +
              '<td style="padding:8px 6px;font-size:12px;color:' + (pt.incidencias ? 'var(--color-danger)' : 'var(--color-text-secondary)') + ';">' + (pt.incidencias ? _esc(pt.incidencias).substring(0, 50) : "\u2014") + '</td></tr>';
          }).join("");
          partesHtml = '<div style="height:200px;margin-bottom:12px;"><canvas id="chart-avance-proyecto"></canvas></div>' +
            '<div style="max-height:400px;overflow-y:auto;"><table style="width:100%;font-size:13px;border-collapse:collapse;"><thead><tr style="border-bottom:2px solid var(--color-border);position:sticky;top:0;background:var(--color-white);">' +
            '<th style="text-align:left;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Fecha</th>' +
            '<th style="text-align:right;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Hincas</th>' +
            '<th style="text-align:right;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">H. M\u00e1q.</th>' +
            '<th style="text-align:right;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">H. Pers.</th>' +
            '<th style="text-align:right;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Oper.</th>' +
            '<th style="text-align:right;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Ayud.</th>' +
            '<th style="text-align:right;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Gasoil (L)</th>' +
            '<th style="text-align:left;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Incidencias</th>' +
            '</tr></thead><tbody>' + filas + '</tbody></table></div>';
        } else {
          partesHtml = '<p style="color:var(--color-text-secondary);font-size:13px;text-align:center;padding:24px;">Sin partes de trabajo registrados.</p>';
        }
        document.getElementById("proy-dash-partes-section").innerHTML =
          '<div class="presup-section" style="margin-bottom:16px;">' +
            '<div class="presup-section-header"><div class="presup-section-number" style="background:#16A34A;">\uD83D\uDCCA</div><div class="presup-section-title">Partes de trabajo</div>' +
            '<div style="margin-left:auto;font-size:13px;color:var(--color-text-secondary);">' + (p.partes ? p.partes.length : 0) + ' partes</div></div>' +
            '<div class="presup-section-body" style="border-left-color:#16A34A;">' + partesHtml + '</div></div>';

        if (p.partes && p.partes.length) _renderChartAvanceProyecto(p);

        // ═══ Sección: Facturación ═══
        var fc = p.facturas_cliente || [];
        var factFilas = fc.map(function (f) {
          return '<tr style="border-bottom:1px solid var(--color-border);">' +
            '<td style="padding:8px 6px;font-weight:500;">' + _esc(f.numero_factura || "\u2014") + '</td>' +
            '<td style="padding:8px 6px;">' + _esc((f.fecha_factura || "").substring(0, 10)) + '</td>' +
            '<td style="padding:8px 6px;text-align:right;font-weight:500;">' + _esc(f.total_a_pagar || "\u2014") + '</td>' +
            '<td style="padding:8px 6px;text-align:center;"><span class="status-badge status-badge--' + ((f.estado_cobro || "pendiente") === "cobrada" ? "adjudicada" : "negociacion") + '">' + _esc(f.estado_cobro || "pendiente") + '</span></td></tr>';
        }).join("");
        var factTotal = 0;
        fc.forEach(function (f) {
          var s = String(f.total_a_pagar || "").replace(/\s/g, "");
          if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
          var n = parseFloat(s);
          if (!isNaN(n)) factTotal += n;
        });
        var progBar = "";
        if (p.importe_presupuestado && p.importe_presupuestado > 0) {
          var pct = Math.min(100, Math.round(factTotal / p.importe_presupuestado * 100));
          progBar = '<div style="margin-bottom:16px;"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;"><span>Facturado vs Presupuestado</span><span>' + pct + '%</span></div>' +
            '<div style="height:8px;background:var(--color-bg-alt);border-radius:4px;overflow:hidden;"><div style="height:100%;background:#CA8A04;border-radius:4px;width:' + pct + '%;"></div></div></div>';
        }
        var factBody = fc.length
          ? progBar + '<table style="width:100%;font-size:13px;border-collapse:collapse;"><thead><tr style="border-bottom:2px solid var(--color-border);"><th style="text-align:left;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">N\u00BA Factura</th><th style="text-align:left;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Fecha</th><th style="text-align:right;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Total</th><th style="text-align:center;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Estado cobro</th></tr></thead><tbody>' + factFilas + '</tbody></table>'
          : '<p style="color:var(--color-text-secondary);font-size:13px;text-align:center;padding:24px;">Sin facturas vinculadas a este proyecto.</p>';
        document.getElementById("proy-dash-facturacion-section").innerHTML =
          '<div class="presup-section" style="margin-bottom:16px;">' +
            '<div class="presup-section-header"><div class="presup-section-number" style="background:#CA8A04;">\uD83D\uDCB0</div><div class="presup-section-title">Facturaci\u00f3n</div>' +
            '<div style="margin-left:auto;font-size:13px;color:var(--color-text-secondary);">' + _dashFmtEur(factTotal) + ' facturado</div></div>' +
            '<div class="presup-section-body" style="border-left-color:#CA8A04;">' + factBody + '</div></div>';

        // ═══ Sección: Certificaciones ═══
        var certCards = '';
        if (p.certificaciones && p.certificaciones.length) {
          certCards = '<div style="display:flex;flex-direction:column;gap:6px;">' +
            p.certificaciones.map(function(c) {
              var estadoClass = c.estado === 'aprobada' ? 'adjudicada' : c.estado === 'enviada' ? 'enviada' : 'borrador';
              return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid var(--color-border);border-radius:var(--radius-md);cursor:pointer;" onclick="certVer(' + c.id + ',' + p.id + ')">' +
                '<div>' +
                  '<span style="font-size:14px;font-weight:600;">Certificaci\u00f3n #' + c.numero + '</span>' +
                  '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:8px;">' + (c.fecha_desde || '').substring(0,10) + ' \u2192 ' + (c.fecha_hasta || '').substring(0,10) + '</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                  '<div style="text-align:right;">' +
                    '<div style="font-size:14px;font-weight:500;">' + _dashFmtEur(c.importe_total) + '</div>' +
                    '<div style="font-size:11px;color:var(--color-text-secondary);">' + (c.total_hincas || 0) + ' hincas \u00b7 ' + (c.total_horas_admin || 0) + 'h admin</div>' +
                  '</div>' +
                  '<span class="status-badge status-badge--' + estadoClass + '">' + _esc(c.estado) + '</span>' +
                  (c.factura_ref ? '<span style="font-size:11px;color:var(--color-primary);">\uD83D\uDCC4 ' + _esc(c.factura_ref) + '</span>' : '') +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>';
        } else {
          certCards = '<p style="color:var(--color-text-secondary);font-size:13px;text-align:center;padding:16px;">Sin certificaciones. Genera la primera para certificar el avance mensual.</p>';
        }
        document.getElementById("proy-dash-certificaciones-section").innerHTML =
          '<div class="presup-section" style="margin-bottom:16px;">' +
            '<div class="presup-section-header">' +
              '<div class="presup-section-number" style="background:#7C3AED;">\uD83D\uDCCB</div>' +
              '<div class="presup-section-title">Certificaciones</div>' +
              '<div style="margin-left:auto;display:flex;gap:8px;align-items:center;">' +
                '<span style="font-size:13px;color:var(--color-text-secondary);">' + (p.certificaciones ? p.certificaciones.length : 0) + ' certificaciones</span>' +
                '<button class="btn-outline" style="font-size:12px;padding:4px 12px;" onclick="certNueva(' + p.id + ')">+ Nueva certificaci\u00f3n</button>' +
              '</div>' +
            '</div>' +
            '<div class="presup-section-body" style="border-left-color:#7C3AED;">' + certCards + '</div>' +
          '</div>';

        // ═══ Sección: Costes ═══
        var costFilas = (p.costes || []).map(function (c) {
          return '<tr style="border-bottom:1px solid var(--color-border);">' +
            '<td style="padding:8px 6px;font-weight:500;">' + _esc(c.proveedor || "\u2014") + '</td>' +
            '<td style="padding:8px 6px;font-size:12px;color:var(--color-text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(c.resumen_concepto || "\u2014") + '</td>' +
            '<td style="padding:8px 6px;">' + _esc(c.numero_factura || "\u2014") + '</td>' +
            '<td style="padding:8px 6px;">' + _esc((c.fecha_factura || "").substring(0, 10)) + '</td>' +
            '<td style="padding:8px 6px;text-align:right;font-weight:500;">' + _esc(c.total_a_pagar || c.total || "\u2014") + '</td>' +
            '<td style="padding:8px 6px;text-align:center;"><span class="status-badge status-badge--' + ((c.estado_pago || "pendiente").toLowerCase() === "pagada" ? "adjudicada" : "negociacion") + '">' + _esc(c.estado_pago || "pendiente") + '</span></td></tr>';
        }).join("");
        var costProgBar = "";
        if (totalFacturado > 0 && totalCostes > 0) {
          var costPct = Math.min(100, Math.round(totalCostes / totalFacturado * 100));
          costProgBar = '<div style="margin-bottom:16px;">' +
            '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;"><span>Costes vs Facturado</span><span>' + costPct + '% \u2014 Margen: ' + _dashFmtEur(margen) + '</span></div>' +
            '<div style="height:8px;background:var(--color-bg-alt);border-radius:4px;overflow:hidden;display:flex;">' +
              '<div style="height:100%;background:#DC2626;border-radius:4px 0 0 4px;width:' + costPct + '%;"></div>' +
              '<div style="height:100%;background:#16A34A;flex:1;border-radius:0 4px 4px 0;"></div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--color-text-secondary);margin-top:2px;"><span>Costes: ' + _dashFmtEur(totalCostes) + '</span><span>Margen: ' + _dashFmtEur(margen) + '</span></div></div>';
        }
        var costBody = (p.costes || []).length
          ? costProgBar + '<table style="width:100%;font-size:13px;border-collapse:collapse;"><thead><tr style="border-bottom:2px solid var(--color-border);">' +
            '<th style="text-align:left;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Proveedor</th>' +
            '<th style="text-align:left;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Concepto</th>' +
            '<th style="text-align:left;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">N\u00BA Factura</th>' +
            '<th style="text-align:left;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Fecha</th>' +
            '<th style="text-align:right;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Total</th>' +
            '<th style="text-align:center;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Estado</th>' +
            '</tr></thead><tbody>' + costFilas + '</tbody></table>'
          : '<p style="color:var(--color-text-secondary);font-size:13px;text-align:center;padding:16px;">Sin facturas de proveedor imputadas. Vincula facturas desde el modal de edici\u00f3n de facturas.</p>';
        document.getElementById("proy-dash-costes-section").innerHTML =
          '<div class="presup-section" style="margin-bottom:16px;">' +
            '<div class="presup-section-header"><div class="presup-section-number" style="background:#DC2626;">\uD83D\uDCB8</div><div class="presup-section-title">Costes</div>' +
            '<div style="margin-left:auto;font-size:13px;color:var(--color-text-secondary);">' + _dashFmtEur(totalCostes) + ' en ' + ((p.costes || []).length) + ' facturas</div></div>' +
            '<div class="presup-section-body" style="border-left-color:#DC2626;">' + costBody + '</div></div>';

        // ═══ Sección: Recursos asignados ═══
        var rec = p.recursos || [];
        function _recChips(items, colorActivo, fallback) {
          if (!items.length) return '<span style="font-size:12px;color:var(--color-text-secondary);font-style:italic;">' + fallback + '</span>';
          return items.map(function (r) {
            var activo = r.activo !== false && r.activo !== 0;
            var bg = activo ? colorActivo + '10' : '#DC262610';
            var fg = activo ? colorActivo : '#DC2626';
            var bdr = activo ? colorActivo + '30' : '#DC262630';
            return '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:99px;font-size:12px;background:' + bg + ';color:' + fg + ';border:1px solid ' + bdr + ';">' +
              '<span style="width:6px;height:6px;border-radius:50%;background:' + fg + ';"></span>' +
              _esc(r.descripcion || r.tercero_nombre || r.tipo) +
            '</span>';
          }).join('');
        }
        var recPersonas = rec.filter(function (r) { return r.tipo === 'operador' || r.tipo === 'ayudante' || r.tipo === 'ayudante_tiralineas'; });
        var recMaquinas = rec.filter(function (r) { return r.tipo === 'maquina'; });
        var recVehiculos = rec.filter(function (r) { return r.tipo === 'vehiculo' || r.tipo === 'pickup'; });
        document.getElementById("proy-dash-recursos-section").innerHTML =
          '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
            '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="font-size:14px;">\uD83D\uDD27</span>' +
                '<span style="font-size:14px;font-weight:600;">Recursos asignados</span>' +
              '</div>' +
              '<button class="btn-outline" style="font-size:12px;padding:4px 12px;" onclick="proyectoAddRecurso(' + p.id + ')">+ Asignar recurso</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;min-height:80px;">' +
              '<div style="padding:12px 16px;border-right:1px solid var(--color-border);">' +
                '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">\uD83D\uDC77 Personas</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + _recChips(recPersonas, '#16A34A', 'Sin asignar') + '</div>' +
              '</div>' +
              '<div style="padding:12px 16px;border-right:1px solid var(--color-border);">' +
                '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">\uD83C\uDFD7\uFE0F M\u00e1quinas</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + _recChips(recMaquinas, '#2563EB', 'Sin asignar') + '</div>' +
              '</div>' +
              '<div style="padding:12px 16px;">' +
                '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">\uD83D\uDE97 Veh\u00edculos</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + _recChips(recVehiculos, '#CA8A04', 'Sin asignar') + '</div>' +
              '</div>' +
            '</div>' +
          '</div>';

        // ═══ Sección: Presupuestos vinculados ═══
        var prs = p.presupuestos || [];
        var prsCards = prs.map(function (pr) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid var(--color-border);border-radius:var(--radius-md);cursor:pointer;" onclick="navegarAPresupuesto(' + pr.id + ')">' +
            '<div><div style="font-size:14px;font-weight:600;color:var(--color-primary);">' + _esc(pr.referencia || "") + '</div>' +
            '<div style="font-size:12px;color:var(--color-text-secondary);">' + _esc(pr.nombre_proyecto || "") + '</div></div>' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              '<span style="font-size:12px;color:var(--color-text-secondary);">' + _esc(pr.revision || "R00") + '</span>' +
              '<span style="font-size:14px;font-weight:500;">' + (pr.total ? _dashFmtEur(pr.total) : "\u2014") + '</span>' +
              '<span class="status-badge status-badge--' + _esc(pr.estado || "") + '">' + _esc(pr.estado || "") + '</span>' +
            '</div></div>';
        }).join("");
        document.getElementById("proy-dash-presupuestos-section").innerHTML =
          '<div class="presup-section" style="margin-bottom:16px;">' +
            '<div class="presup-section-header"><div class="presup-section-number" style="background:#2563EB;">\uD83D\uDCC4</div><div class="presup-section-title">Presupuestos</div>' +
            '<div style="margin-left:auto;font-size:13px;color:var(--color-text-secondary);">' + prs.length + ' presupuesto' + (prs.length !== 1 ? 's' : '') + '</div></div>' +
            '<div class="presup-section-body" style="border-left-color:#2563EB;">' +
            (prs.length ? '<div style="display:flex;flex-direction:column;gap:8px;">' + prsCards + '</div>' : '<p style="color:var(--color-text-secondary);font-size:13px;text-align:center;padding:16px;">Sin presupuestos vinculados.</p>') +
            '</div></div>';

        // ═══ Sección: Interacciones CRM ═══
        var ints = p.interacciones || [];
        var tipoColores = { llamada: "#2563EB", email: "#16A34A", reunion: "#7C3AED", nota: "#64748B", whatsapp: "#16A34A", visita: "#CA8A04" };
        var intCards = ints.slice(0, 10).map(function (it) {
          var col = tipoColores[it.tipo] || "#64748B";
          return '<div style="display:flex;gap:12px;align-items:start;padding:8px 12px;border-left:3px solid ' + col + ';border-radius:0 var(--radius-sm) var(--radius-sm) 0;background:var(--color-bg-page);">' +
            '<div style="min-width:70px;"><div style="font-size:12px;color:var(--color-text-secondary);">' + _esc((it.fecha || "").substring(0, 10)) + '</div>' +
            '<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:' + col + '15;color:' + col + ';font-weight:500;text-transform:uppercase;">' + _esc(it.tipo || "") + '</span></div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:13px;font-weight:500;">' + _esc(it.asunto || "Sin asunto") + '</div>' +
              (it.descripcion ? '<div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(it.descripcion) + '</div>' : '') +
              (it.contacto_nombre ? '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:2px;">Con: ' + _esc(it.contacto_nombre) + ' ' + _esc(it.contacto_apellidos || "") + '</div>' : '') +
            '</div>' +
            (it.resultado ? '<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:var(--color-bg-alt);color:var(--color-text-secondary);">' + _esc(it.resultado) + '</span>' : '') +
            '</div>';
        }).join("");
        var intExtra = ints.length > 10 ? '<p style="font-size:12px;color:var(--color-text-secondary);text-align:center;margin-top:4px;">+ ' + (ints.length - 10) + ' interacciones m\u00e1s</p>' : "";
        document.getElementById("proy-dash-crm-section").innerHTML =
          '<div class="presup-section" style="margin-bottom:16px;">' +
            '<div class="presup-section-header"><div class="presup-section-number" style="background:#E85D24;">\uD83D\uDCAC</div><div class="presup-section-title">Interacciones con el cliente</div>' +
            '<div style="margin-left:auto;font-size:13px;color:var(--color-text-secondary);">' + ints.length + ' registradas</div></div>' +
            '<div class="presup-section-body" style="border-left-color:#E85D24;">' +
            (ints.length ? '<div style="display:flex;flex-direction:column;gap:6px;">' + intCards + intExtra + '</div>' : '<p style="color:var(--color-text-secondary);font-size:13px;text-align:center;padding:16px;">Sin interacciones registradas con este cliente.</p>') +
            '</div></div>';

        // ═══ Sección: Documentos ═══
        var docs = p.documentos || [];
        var docIcons = { contrato: "\uD83D\uDCDD", acta: "\uD83D\uDCCB", certificacion: "\u2705", plano: "\uD83D\uDCD0", foto: "\uD83D\uDCF7", informe: "\uD83D\uDCCA", otro: "\uD83D\uDCC4" };
        var docCards = docs.map(function (d) {
          return '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:12px;display:flex;gap:10px;align-items:start;">' +
            '<span style="font-size:20px;">' + (docIcons[d.tipo] || "\uD83D\uDCC4") + '</span>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:13px;font-weight:500;">' + _esc(d.nombre) + '</div>' +
              '<div style="font-size:11px;color:var(--color-text-secondary);">' + _esc(d.tipo || "") + (d.fecha_documento ? " \u00B7 " + d.fecha_documento.substring(0, 10) : "") + '</div>' +
              (d.descripcion ? '<div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px;">' + _esc(d.descripcion) + '</div>' : '') +
              (d.url_externa ? '<a href="' + _esc(d.url_externa) + '" target="_blank" style="font-size:12px;color:var(--color-primary);text-decoration:none;margin-top:4px;display:inline-block;">Abrir enlace \u2197</a>' : '') +
            '</div>' +
            '<button onclick="proyectoEliminarDocumento(' + p.id + ',' + d.id + ')" style="background:none;border:none;cursor:pointer;color:var(--color-text-secondary);font-size:14px;" title="Eliminar">\u00D7</button>' +
            '</div>';
        }).join("");
        document.getElementById("proy-dash-documentos-section").innerHTML =
          '<div class="presup-section" style="margin-bottom:16px;">' +
            '<div class="presup-section-header"><div class="presup-section-number" style="background:#0891B2;">\uD83D\uDCC1</div><div class="presup-section-title">Documentos</div>' +
            '<div style="margin-left:auto;"><button class="secondary" style="font-size:12px;padding:4px 12px;" onclick="proyectoAddDocumento(' + p.id + ')">+ A\u00f1adir documento</button></div></div>' +
            '<div class="presup-section-body" style="border-left-color:#0891B2;">' +
            (docs.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;">' + docCards + '</div>' : '<p style="color:var(--color-text-secondary);font-size:13px;text-align:center;padding:16px;">Sin documentos. A\u00f1ade contratos, actas, planos y otros documentos del proyecto.</p>') +
            '</div></div>';

        // ═══ Sección: Historial de estados (tab Gestión) ═══
        document.getElementById("proy-dash-historial-section").innerHTML =
          '<div class="presup-section" style="margin-bottom:16px;">' +
            '<div class="presup-section-header"><div class="presup-section-number" style="background:#64748B;">\uD83D\uDCCB</div><div class="presup-section-title">Historial de estados</div></div>' +
            '<div class="presup-section-body" style="border-left-color:#64748B;">' + histHtml + '</div></div>';

        // Mostrar panel
        activarSubpanel("proyectos", "dashboard");
      })
      .catch(function (err) { mostrarToast("Error al cargar dashboard: " + err.message, "error"); });
  };

  window._proyCambiarEstadoDash = function (id, estado) {
    var labelEstado = estado === "vivo" ? "reactivar (volver a vivo)" : estado;
    if (!confirm("Cambiar estado del proyecto a '" + labelEstado + "'?")) return;
    fetch("/api/proyectos/" + id + "/estado", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: estado }) })
      .then(function (r) { return r.json(); })
      .then(function () { mostrarToast("Estado actualizado.", "success"); proyectoDashboard(id); });
  };

  window.proyectoDashboardVolver = function () {
    activarSubpanel("proyectos", "inicio");
  };

  window.proyDashCambiarTab = function (tab) {
    document.querySelectorAll(".proy-dash-tab-content").forEach(function (el) { el.style.display = "none"; });
    var tabEl = document.getElementById("proy-dash-tab-" + tab);
    if (tabEl) tabEl.style.display = "block";
    document.querySelectorAll(".proy-dash-tab").forEach(function (btn) {
      if (btn.getAttribute("data-tab") === tab) {
        btn.style.borderBottomColor = "var(--color-primary)";
        btn.style.color = "var(--color-primary)";
      } else {
        btn.style.borderBottomColor = "transparent";
        btn.style.color = "var(--color-text-secondary)";
      }
    });
    if (tab === "operativo" && window._chartAvanceProyecto) {
      try { window._chartAvanceProyecto.resize(); } catch (e) {}
    }
  };

  function _renderChartAvanceProyecto(p) {
    var canvas = document.getElementById("chart-avance-proyecto");
    if (!canvas || !p.partes || !p.partes.length) return;
    var sorted = (p.partes || []).slice().sort(function (a, b) { return (a.fecha || "").localeCompare(b.fecha || ""); });
    var labels = sorted.map(function (pt) { return (pt.fecha || "").substring(5, 10); });
    var hincasDia = sorted.map(function (pt) { return pt.hincas_realizadas || 0; });
    var acum = 0;
    var hincasAcum = hincasDia.map(function (h) { acum += h; return acum; });
    var meta = p.hincas_estimadas || 0;
    if (window._chartAvanceProyecto) { try { window._chartAvanceProyecto.destroy(); } catch (e) {} }
    var datasets = [
      { label: "Hincas/d\u00eda", data: hincasDia, backgroundColor: "#2563EB40", borderColor: "#2563EB", borderWidth: 1, yAxisID: "y", order: 2 },
      { label: "Acumulado", data: hincasAcum, type: "line", borderColor: "#16A34A", backgroundColor: "#16A34A20", fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2, yAxisID: "y1", order: 1 }
    ];
    window._chartAvanceProyecto = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top", labels: { font: { size: 11 } } } },
        scales: {
          y: { position: "left", title: { display: true, text: "Hincas/d\u00eda", font: { size: 11 } }, beginAtZero: true },
          y1: { position: "right", title: { display: true, text: "Acumulado", font: { size: 11 } }, beginAtZero: true, grid: { drawOnChartArea: false },
            max: meta && meta > acum ? Math.ceil(meta * 1.1) : undefined }
        }
      }
    });
  }

  window.proyectoAddRecurso = function (proyectoId) {
    var existing = document.getElementById("modal-add-recurso");
    if (existing) existing.remove();
    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-add-recurso";
    modal.style.zIndex = "110";
    modal.innerHTML = '<div class="modal-editar" role="dialog" style="max-width:450px;">' +
      '<h2 style="margin:0 0 16px;">Asignar recurso</h2>' +
      '<div style="display:grid;gap:12px;">' +
        '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Tipo</label><select id="recurso-tipo" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);">' +
          '<option value="maquina">M\u00e1quina</option><option value="operador">Operador</option><option value="ayudante">Ayudante</option><option value="ayudante_tiralineas">Ayudante tiralíneas</option><option value="vehiculo">Veh\u00edculo</option><option value="pickup">Pickup</option><option value="otro">Otro</option></select></div>' +
        '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Descripci\u00f3n</label><input type="text" id="recurso-descripcion" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);box-sizing:border-box;" placeholder="Ej: Orteco HD 1000, Juan P\u00e9rez..."></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Fecha inicio</label><input type="date" id="recurso-fecha-inicio" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);box-sizing:border-box;"></div>' +
          '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Fecha fin (opcional)</label><input type="date" id="recurso-fecha-fin" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);box-sizing:border-box;"></div></div>' +
        '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Notas (opcional)</label><textarea id="recurso-notas" rows="2" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);box-sizing:border-box;resize:vertical;"></textarea></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="secondary" onclick="document.getElementById(\'modal-add-recurso\').remove()">Cancelar</button>' +
        '<button class="primary" style="width:auto;padding:8px 20px;" onclick="proyectoGuardarRecurso(' + proyectoId + ')">Guardar</button>' +
      '</div></div>';
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  };

  window.proyectoGuardarRecurso = function (proyectoId) {
    var body = {
      tipo: document.getElementById("recurso-tipo").value,
      descripcion: document.getElementById("recurso-descripcion").value,
      fecha_inicio: document.getElementById("recurso-fecha-inicio").value || null,
      fecha_fin: document.getElementById("recurso-fecha-fin").value || null,
      notas: document.getElementById("recurso-notas").value || null
    };
    fetch("/api/proyectos/" + proyectoId + "/recursos", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) {
      if (r.ok) {
        var m = document.getElementById("modal-add-recurso");
        if (m) m.remove();
        mostrarToast("Recurso asignado.", "success");
        proyectoDashboard(proyectoId);
      } else {
        mostrarToast("Error al asignar recurso.", "error");
      }
    }).catch(function () { mostrarToast("Error de conexi\u00f3n.", "error"); });
  };

  window.proyectoAddDocumento = function (proyectoId) {
    var existing = document.getElementById("modal-add-documento");
    if (existing) existing.remove();
    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-add-documento";
    modal.style.zIndex = "110";
    modal.innerHTML = '<div class="modal-editar" role="dialog" style="max-width:500px;">' +
      '<h2 style="margin:0 0 16px;">A\u00f1adir documento</h2>' +
      '<div style="display:grid;gap:12px;">' +
        '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Nombre del documento *</label><input type="text" id="doc-nombre" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);box-sizing:border-box;" placeholder="Ej: Contrato PV Navabuena"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Tipo</label><select id="doc-tipo" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);">' +
            '<option value="contrato">Contrato</option><option value="acta">Acta</option><option value="certificacion">Certificaci\u00f3n</option><option value="plano">Plano</option><option value="foto">Foto</option><option value="informe">Informe</option><option value="otro">Otro</option></select></div>' +
          '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Fecha</label><input type="date" id="doc-fecha" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);box-sizing:border-box;"></div></div>' +
        '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">URL o enlace externo (opcional)</label><input type="text" id="doc-url" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);box-sizing:border-box;" placeholder="https://drive.google.com/..."></div>' +
        '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Descripci\u00f3n (opcional)</label><textarea id="doc-descripcion" rows="2" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);box-sizing:border-box;resize:vertical;" placeholder="Notas sobre el documento"></textarea></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="secondary" onclick="document.getElementById(\'modal-add-documento\').remove()">Cancelar</button>' +
        '<button class="primary" style="width:auto;padding:8px 20px;" onclick="proyectoGuardarDocumento(' + proyectoId + ')">Guardar</button>' +
      '</div></div>';
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  };

  window.proyectoGuardarDocumento = function (proyectoId) {
    var nombre = (document.getElementById("doc-nombre") || {}).value || "";
    nombre = nombre.trim();
    if (!nombre) { mostrarToast("El nombre es obligatorio.", "error"); return; }
    var body = {
      nombre: nombre,
      tipo: (document.getElementById("doc-tipo") || {}).value || "otro",
      fecha_documento: (document.getElementById("doc-fecha") || {}).value || null,
      url_externa: ((document.getElementById("doc-url") || {}).value || "").trim() || null,
      descripcion: ((document.getElementById("doc-descripcion") || {}).value || "").trim() || null
    };
    fetch("/api/proyectos/" + proyectoId + "/documentos", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) {
      if (r.ok) {
        var m = document.getElementById("modal-add-documento");
        if (m) m.remove();
        mostrarToast("Documento a\u00f1adido.", "success");
        proyectoDashboard(proyectoId);
      } else {
        mostrarToast("Error al a\u00f1adir documento.", "error");
      }
    }).catch(function () { mostrarToast("Error de conexi\u00f3n.", "error"); });
  };

  window.proyectoEliminarDocumento = function (proyectoId, docId) {
    if (!confirm("\u00BFEliminar este documento?")) return;
    fetch("/api/proyectos/" + proyectoId + "/documentos/" + docId, { method: "DELETE" })
      .then(function (r) {
        if (r.ok) { mostrarToast("Documento eliminado.", "success"); proyectoDashboard(proyectoId); }
        else { mostrarToast("Error al eliminar.", "error"); }
      });
  };

  // ── Cotizados ──
  window._proyCotizados = function () {
    fetch("/api/proyectos?estado=cotizado")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var proys = d.proyectos || [];
        var c = document.getElementById("proy-cotizados-tabla");
        if (!proys.length) { c.innerHTML = '<p class="crm-placeholder">Sin proyectos cotizados.</p>'; return; }
        var html = '<table class="tabla-facturas"><thead><tr><th>Nombre</th><th>Cliente</th><th>Presupuesto</th><th>Parque</th><th>MW</th><th>Hincas</th><th>Tipo</th><th>Importe</th><th>Inicio est.</th><th>Acciones</th></tr></thead><tbody>';
        proys.forEach(function (p) {
          var presCol = p.presupuesto_id && p.presupuesto_ref ? '<a href="#" onclick="navegarAPresupuesto(' + p.presupuesto_id + ');return false;" style="color:#2563EB;text-decoration:none;font-size:12px;">' + _esc(p.presupuesto_ref) + '</a>' : '';
          html += '<tr><td style="font-weight:600;"><a href="#" onclick="proyectoDashboard(' + p.id + ');return false;" style="color:var(--color-primary);text-decoration:none;">' + _esc(p.nombre) + '</a></td>' +
            '<td>' + _esc(p.nombre_cliente || "") + '</td>' +
            '<td>' + presCol + '</td>' +
            '<td>' + _esc(p.nombre_parque || "") + '</td>' +
            '<td class="numero">' + (p.mw_parque || "") + '</td>' +
            '<td class="numero">' + (p.hincas_estimadas || "") + '</td>' +
            '<td>' + _esc(p.tipo_trabajo || "") + '</td>' +
            '<td class="numero">' + _fE(p.importe_presupuestado) + '</td>' +
            '<td>' + _esc((p.fecha_inicio_estimada || "").substring(0, 10)) + '</td>' +
            '<td><button class="primary" style="font-size:0.75rem;padding:2px 10px;" onclick="_proyActivar(' + p.id + ')">Activar</button> ' +
            '<button class="secondary" style="font-size:0.75rem;padding:2px 10px;" onclick="_proyEditar(' + p.id + ')">Editar</button></td></tr>';
        });
        html += '</tbody></table>';
        c.innerHTML = html;
      });
  };
  var panelCot = document.getElementById("panel-proyectos-cotizados");
  if (panelCot) new MutationObserver(function () { if (panelCot.classList.contains("visible")) _proyCotizados(); }).observe(panelCot, { attributes: true, attributeFilter: ["class"] });

  window._proyActivar = function (id) {
    if (!confirm("Activar este proyecto? Pasara a estado 'vivo'.")) return;
    fetch("/api/proyectos/" + id + "/estado", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "vivo" }) })
      .then(function (r) { return r.json(); })
      .then(function () { mostrarToast("Proyecto activado.", "success"); _proyCotizados(); });
  };

  // ── Vivos ──
  var _proyVivosFiltro = ""; // "", "vivo", "pausado"
  var _proyVivosCache = [];

  function _renderProyVivosCards(proys) {
    var g = document.getElementById("proy-vivos-grid");
    if (!proys.length) { g.innerHTML = '<p class="crm-placeholder">Sin proyectos con los filtros seleccionados.</p>'; return; }
    g.innerHTML = proys.map(function (p) {
      var esPausado = p.estado === "pausado";
      var progreso = p.progreso || 0;
      var ultimoParte = (p.partes && p.partes[0]) || null;
      var recursos = (p.recursos || []).map(function (r) { return (r.descripcion || r.tipo); }).join(", ");
      var badgeClass = esPausado ? "status-badge status-badge--pausado" : "status-badge status-badge--vivo";
      var badgeText = esPausado ? "Pausado" : "Vivo";
      var cardClass = "proy-card" + (esPausado ? " proy-card-pausado" : "");
      var actions = '';
      if (esPausado) {
        actions = '<button class="primary" onclick="_proyCambiarEstado(' + p.id + ',\'vivo\')">Reactivar</button>' +
          '<button class="secondary" onclick="_proyEditar(' + p.id + ')">Editar</button>' +
          '<button class="secondary" onclick="_proyCambiarEstado(' + p.id + ',\'terminado\')">Terminar</button>';
      } else {
        actions = '<button class="primary" onclick="_proyRegistrarParte(' + p.id + ')">Registrar parte</button>' +
          '<button class="secondary" onclick="_proyEditar(' + p.id + ')">Editar</button>' +
          '<button class="secondary" onclick="_proyCambiarEstado(' + p.id + ',\'pausado\')">Pausar</button>' +
          '<button class="secondary" onclick="_proyCambiarEstado(' + p.id + ',\'terminado\')">Terminar</button>';
      }
      var _lb='';if(p.presupuesto_id&&p.presupuesto_ref)_lb+='<a href="#" onclick="navegarAPresupuesto('+p.presupuesto_id+');return false;" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#2563EB10;color:#2563EB;border-radius:99px;font-size:12px;text-decoration:none;border:1px solid #2563EB30;">\uD83D\uDCC4 '+_esc(p.presupuesto_ref)+'</a>';if(p.oportunidad_id&&p.oportunidad_nombre)_lb+='<a href="#" onclick="navegarAOportunidad('+p.oportunidad_id+');return false;" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#16A34A10;color:#16A34A;border-radius:99px;font-size:12px;text-decoration:none;border:1px solid #16A34A30;">\u2B50 '+_esc(p.oportunidad_nombre)+'</a>';
      return '<div class="' + cardClass + '">' +
        '<div class="proy-card-header"><div><h3 style="cursor:pointer;color:var(--color-primary);" onclick="proyectoDashboard(' + p.id + ')">' + _esc(p.nombre) + '</h3>' +
          '<div class="proy-card-header-meta">' + _esc(p.nombre_cliente || "") +
          (p.ubicacion_texto ? ' &middot; ' + _esc(p.ubicacion_texto) : '') +
          (p.nombre_parque ? ' &middot; ' + _esc(p.nombre_parque) : '') + '</div></div>' +
          '<span class="' + badgeClass + '">' + badgeText + '</span></div>' +
        (_lb ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 16px 10px;">' + _lb + '</div>' : '') +
        '<div class="proy-progress"><div class="proy-progress-label"><span>' + (p.hincas_realizadas || 0) + ' / ' + (p.hincas_estimadas || "?") + ' hincas</span><span>' + progreso + '%</span></div>' +
          '<div class="proy-progress-bar"><div class="proy-progress-fill" style="width:' + Math.min(progreso, 100) + '%"></div></div></div>' +
        '<div class="proy-metrics">' +
          '<div class="proy-metric"><span class="proy-metric-val">' + (p.dias_activo || 0) + '</span><span class="proy-metric-label">Dias activo</span></div>' +
          (ultimoParte ? '<div class="proy-metric"><span class="proy-metric-val">' + (ultimoParte.hincas_realizadas || 0) + '</span><span class="proy-metric-label">Hincas ultimo parte</span></div>' : '') +
          '<div class="proy-metric"><span class="proy-metric-val">' + _fE(p.importe_presupuestado) + '</span><span class="proy-metric-label">Presupuesto</span></div>' +
        '</div>' +
        (recursos ? '<div class="proy-card-recursos"><strong>Recursos:</strong> ' + _esc(recursos) + '</div>' : '') +
        (ultimoParte ? '<div class="proy-card-parte"><strong>' + _esc(ultimoParte.fecha) + ':</strong> ' + (ultimoParte.hincas_realizadas || 0) + ' hincas, ' + (ultimoParte.horas_maquina || 0) + 'h maq' + (ultimoParte.incidencias ? ' — <em>' + _esc(ultimoParte.incidencias) + '</em>' : '') + '</div>' : '') +
        '<div class="proy-card-actions">' + actions + '</div></div>';
    }).join("");
  }

  window._proyVivos = function () {
    fetch("/api/proyectos?estado=vivo,pausado")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        _proyVivosCache = d.proyectos || [];
        var filtrados = _proyVivosCache;
        if (_proyVivosFiltro) {
          filtrados = filtrados.filter(function (p) { return p.estado === _proyVivosFiltro; });
        }
        _renderProyVivosCards(filtrados);
      });
  };

  // Toggle filtro Todos/Activos/Pausados
  var toggleVivosEstado = document.getElementById("proy-vivos-toggle-estado");
  if (toggleVivosEstado) {
    toggleVivosEstado.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-proy-filtro]");
      if (!btn) return;
      _proyVivosFiltro = btn.getAttribute("data-proy-filtro") || "";
      toggleVivosEstado.querySelectorAll("button").forEach(function (b) { b.classList.remove("activo"); });
      btn.classList.add("activo");
      // Re-render from cache without re-fetching
      var filtrados = _proyVivosCache;
      if (_proyVivosFiltro) {
        filtrados = filtrados.filter(function (p) { return p.estado === _proyVivosFiltro; });
      }
      _renderProyVivosCards(filtrados);
    });
  }

  var panelViv = document.getElementById("panel-proyectos-vivos");
  if (panelViv) new MutationObserver(function () { if (panelViv.classList.contains("visible")) _proyVivos(); }).observe(panelViv, { attributes: true, attributeFilter: ["class"] });

  window._proyCambiarEstado = function (id, estado) {
    var labelEstado = estado === "vivo" ? "reactivar (volver a vivo)" : estado;
    if (!confirm("Cambiar estado del proyecto a '" + labelEstado + "'?")) return;
    fetch("/api/proyectos/" + id + "/estado", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: estado }) })
      .then(function (r) { return r.json(); })
      .then(function () { mostrarToast("Estado actualizado.", "success"); _proyVivos(); _proyCotizados(); _proyTerminados(); });
  };

  // ── Terminados (incluye cancelados) ──
  window._proyTerminados = function () {
    fetch("/api/proyectos?estado=terminado,cancelado")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var proys = d.proyectos || [];
        var c = document.getElementById("proy-terminados-tabla");
        if (!proys.length) { c.innerHTML = '<p class="crm-placeholder">Sin proyectos terminados.</p>'; return; }
        var html = '<table class="tabla-facturas"><thead><tr><th>Nombre</th><th>Cliente</th><th>Presupuesto</th><th>Tipo</th><th>Estado</th><th>Hincas</th><th>Dias</th><th>Facturado</th><th>Costes</th><th>Rentabilidad</th></tr></thead><tbody>';
        proys.forEach(function (p) {
          var rent = 0;
          if (p.importe_facturado && p.importe_costes) rent = Math.round((p.importe_facturado - p.importe_costes) / p.importe_facturado * 100);
          var cls = rent >= 20 ? "proy-rent-green" : rent >= 10 ? "proy-rent-yellow" : "proy-rent-red";
          var esCancelado = p.estado === "cancelado";
          var badgeEstado = esCancelado
            ? '<span class="status-badge status-badge--cancelado">Cancelado</span>'
            : '<span class="status-badge status-badge--terminado">Terminado</span>';
          var presColT = p.presupuesto_id && p.presupuesto_ref ? '<a href="#" onclick="event.stopPropagation();navegarAPresupuesto(' + p.presupuesto_id + ');return false;" style="color:#2563EB;text-decoration:none;font-size:12px;">' + _esc(p.presupuesto_ref) + '</a>' : '';
          html += '<tr style="cursor:pointer;' + (esCancelado ? 'opacity:0.7;' : '') + '" onclick="proyectoDashboard(' + p.id + ')">' +
            '<td style="font-weight:600;">' + _esc(p.nombre) + '</td>' +
            '<td>' + _esc(p.nombre_cliente || "") + '</td>' +
            '<td>' + presColT + '</td>' +
            '<td>' + _esc(p.tipo_trabajo || "") + '</td>' +
            '<td>' + badgeEstado + '</td>' +
            '<td class="numero">' + (p.hincas_realizadas || 0) + '</td>' +
            '<td class="numero">' + (p.dias_activo || 0) + '</td>' +
            '<td class="numero">' + _fE(p.importe_facturado) + '</td>' +
            '<td class="numero">' + _fE(p.importe_costes) + '</td>' +
            '<td class="numero ' + cls + '">' + rent + '%</td></tr>';
        });
        html += '</tbody></table>';
        c.innerHTML = html;
      });
  };
  var panelTerm = document.getElementById("panel-proyectos-terminados");
  if (panelTerm) new MutationObserver(function () { if (panelTerm.classList.contains("visible")) _proyTerminados(); }).observe(panelTerm, { attributes: true, attributeFilter: ["class"] });

  // ── Modal proyecto ──
  function _proyAbrirModal(p) {
    document.getElementById("modal-proyecto-titulo").textContent = p ? "Editar proyecto" : "Nuevo proyecto";
    document.getElementById("proy-edit-id").value = p ? p.id : "";
    document.getElementById("proy-nombre").value = p ? p.nombre || "" : "";
    document.getElementById("proy-codigo").value = p ? p.codigo || "" : "";
    document.getElementById("proy-tipo").value = p ? p.tipo_trabajo || "" : "";
    document.getElementById("proy-modalidad").value = p ? p.modalidad_facturacion || "" : "";
    document.getElementById("proy-parque").value = p ? p.nombre_parque || "" : "";
    document.getElementById("proy-provincia").value = p ? p.provincia || "" : "";
    document.getElementById("proy-ubicacion").value = p ? p.ubicacion_texto || "" : "";
    document.getElementById("proy-mw").value = p ? p.mw_parque || "" : "";
    document.getElementById("proy-hincas-est").value = p ? p.hincas_estimadas || "" : "";
    document.getElementById("proy-precio-hinca").value = p ? p.precio_unitario_hinca || "" : "";
    document.getElementById("proy-precio-hora-maq").value = p ? p.precio_hora_maquina || "" : "";
    document.getElementById("proy-precio-hora-ay").value = p ? p.precio_hora_ayudante || "" : "";
    document.getElementById("proy-importe").value = p ? p.importe_presupuestado || "" : "";
    document.getElementById("proy-estado").value = p ? p.estado || "cotizado" : "cotizado";
    document.getElementById("proy-fecha-inicio").value = p ? (p.fecha_inicio_estimada || "").substring(0, 10) : "";
    document.getElementById("proy-fecha-fin").value = p ? (p.fecha_fin_estimada || "").substring(0, 10) : "";
    document.getElementById("proy-notas").value = p ? p.notas || "" : "";
    // Load clientes
    fetch("/api/crm/empresas?activo=1&limit=200&tipo=cliente")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var sel = document.getElementById("proy-cliente");
        sel.innerHTML = '<option value="">Seleccionar</option>';
        (d.empresas || []).forEach(function (e) {
          var opt = document.createElement("option");
          opt.value = e.tercero_id || e.id;
          opt.textContent = e.nombre;
          sel.appendChild(opt);
        });
        if (p && p.cliente_tercero_id) sel.value = String(p.cliente_tercero_id);
      });
    proyModalEl.classList.add("visible");
    proyModalEl.setAttribute("aria-hidden", "false");
  }
  function _proyCerrarModal() { proyModalEl.classList.remove("visible"); proyModalEl.setAttribute("aria-hidden", "true"); }

  window._proyEditar = function (id) {
    fetch("/api/proyectos/" + id)
      .then(function (r) { return r.json(); })
      .then(function (p) { if (!p.error) _proyAbrirModal(p); });
  };

  document.getElementById("btn-nuevo-proyecto").addEventListener("click", function () { _proyAbrirModal(null); });
  document.getElementById("btn-nuevo-proyecto-vivo").addEventListener("click", function () { _proyAbrirModal(null); });
  document.getElementById("btn-cancelar-proyecto").addEventListener("click", _proyCerrarModal);
  proyModalEl.addEventListener("click", function (e) { if (e.target === proyModalEl) _proyCerrarModal(); });

  proyFormEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = document.getElementById("proy-edit-id").value;
    var body = {
      nombre: document.getElementById("proy-nombre").value,
      codigo: document.getElementById("proy-codigo").value,
      empresa_id: "hincado_directo",
      cliente_tercero_id: document.getElementById("proy-cliente").value || null,
      tipo_trabajo: document.getElementById("proy-tipo").value || null,
      modalidad_facturacion: document.getElementById("proy-modalidad").value || null,
      nombre_parque: document.getElementById("proy-parque").value,
      ubicacion_texto: document.getElementById("proy-ubicacion").value,
      provincia: document.getElementById("proy-provincia").value,
      mw_parque: document.getElementById("proy-mw").value ? parseFloat(document.getElementById("proy-mw").value) : null,
      hincas_estimadas: document.getElementById("proy-hincas-est").value ? parseInt(document.getElementById("proy-hincas-est").value) : null,
      precio_unitario_hinca: document.getElementById("proy-precio-hinca").value ? parseFloat(document.getElementById("proy-precio-hinca").value) : null,
      precio_hora_maquina: document.getElementById("proy-precio-hora-maq").value ? parseFloat(document.getElementById("proy-precio-hora-maq").value) : null,
      precio_hora_ayudante: document.getElementById("proy-precio-hora-ay").value ? parseFloat(document.getElementById("proy-precio-hora-ay").value) : null,
      importe_presupuestado: document.getElementById("proy-importe").value ? parseFloat(document.getElementById("proy-importe").value) : null,
      estado: document.getElementById("proy-estado").value,
      fecha_inicio_estimada: document.getElementById("proy-fecha-inicio").value || null,
      fecha_fin_estimada: document.getElementById("proy-fecha-fin").value || null,
      notas: document.getElementById("proy-notas").value,
    };
    var url = id ? "/api/proyectos/" + id : "/api/proyectos";
    var method = id ? "PUT" : "POST";
    fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { mostrarToast(res.data.error || "Error", "error"); return; }
        _proyCerrarModal();
        _proyCotizados(); _proyVivos(); _proyTerminados();
        mostrarToast("Proyecto guardado.", "success");
      })
      .catch(function () { mostrarToast("Error de conexion.", "error"); });
  });

  // ── Modal parte ──
  window._proyRegistrarParte = function (proyId) {
    document.getElementById("modal-parte-titulo").textContent = "Registrar parte de trabajo";
    document.getElementById("parte-proyecto-id").value = proyId;
    document.getElementById("parte-edit-id").value = "";
    document.getElementById("parte-fecha").value = new Date().toISOString().substring(0, 10);
    document.getElementById("parte-hincas").value = "";
    document.getElementById("parte-horas-maq").value = "";
    document.getElementById("parte-horas-pers").value = "";
    document.getElementById("parte-operadores").value = "1";
    document.getElementById("parte-ayudantes").value = "0";
    document.getElementById("parte-terreno").value = "";
    document.getElementById("parte-meteo").value = "";
    document.getElementById("parte-combustible").value = "";
    document.getElementById("parte-incidencias").value = "";
    document.getElementById("parte-notas").value = "";
    parteModalEl.classList.add("visible");
    parteModalEl.setAttribute("aria-hidden", "false");
  };

  document.getElementById("btn-cancelar-parte").addEventListener("click", function () {
    parteModalEl.classList.remove("visible"); parteModalEl.setAttribute("aria-hidden", "true");
  });
  parteModalEl.addEventListener("click", function (e) { if (e.target === parteModalEl) { parteModalEl.classList.remove("visible"); parteModalEl.setAttribute("aria-hidden", "true"); } });

  parteFormEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var proyId = document.getElementById("parte-proyecto-id").value;
    var parteId = document.getElementById("parte-edit-id").value;
    var body = {
      fecha: document.getElementById("parte-fecha").value,
      hincas_realizadas: document.getElementById("parte-hincas").value ? parseInt(document.getElementById("parte-hincas").value) : 0,
      horas_maquina: document.getElementById("parte-horas-maq").value ? parseFloat(document.getElementById("parte-horas-maq").value) : 0,
      horas_personal: document.getElementById("parte-horas-pers").value ? parseFloat(document.getElementById("parte-horas-pers").value) : 0,
      num_operadores: document.getElementById("parte-operadores").value ? parseInt(document.getElementById("parte-operadores").value) : 1,
      num_ayudantes: document.getElementById("parte-ayudantes").value ? parseInt(document.getElementById("parte-ayudantes").value) : 0,
      condiciones_terreno: document.getElementById("parte-terreno").value,
      meteorologia: document.getElementById("parte-meteo").value,
      combustible_litros: document.getElementById("parte-combustible").value ? parseFloat(document.getElementById("parte-combustible").value) : null,
      incidencias: document.getElementById("parte-incidencias").value,
      notas: document.getElementById("parte-notas").value,
    };
    var url = parteId ? "/api/proyectos/partes/" + parteId : "/api/proyectos/" + proyId + "/partes";
    var method = parteId ? "PUT" : "POST";
    fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { mostrarToast(res.data.error || "Error", "error"); return; }
        parteModalEl.classList.remove("visible"); parteModalEl.setAttribute("aria-hidden", "true");
        _proyVivos();
        mostrarToast("Parte registrado.", "success");
      })
      .catch(function () { mostrarToast("Error de conexion.", "error"); });
  });
})();

// ═══ TESORERIA ══════════════════════════════════════════════════════════════════
(function () {
  var _tesChart = null;
  var _tesCalTipo = "";
  var _tesAgingTipo = "proveedores";

  function _fmtE(n) {
    if (n == null) return "--";
    return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  window._tesCargarTodo = function () {
    _tesCargarResumen();
    _tesCargarFlujo();
    _tesCargarCalendario();
    _tesCargarAging();
    _tesCargarAlertas();
  };

  function _tesCargarResumen() {
    fetch("/api/tesoreria/resumen")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        document.getElementById("tes-saldo").textContent = _fmtE(d.saldo_actual);
        document.getElementById("tes-cobrar").textContent = _fmtE(d.por_cobrar_total);
        document.getElementById("tes-pagar").textContent = _fmtE(d.por_pagar_total);
        var prev = [
          { el: "tes-prev30", card: "tes-prev30-card", val: d.prevision_30d },
          { el: "tes-prev60", card: "tes-prev60-card", val: d.prevision_60d },
          { el: "tes-prev90", card: "tes-prev90-card", val: d.prevision_90d },
        ];
        prev.forEach(function (p) {
          var el = document.getElementById(p.el);
          el.textContent = _fmtE(p.val);
          el.className = "tes-valor" + (p.val < 0 ? " tes-valor-neg" : " tes-valor-pos");
          var card = document.getElementById(p.card);
          card.className = "tes-card" + (p.val < 0 ? " tes-card-red" : " tes-card-green");
        });
      });
  }

  function _tesCargarFlujo() {
    fetch("/api/tesoreria/flujo-caja")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var flujo = d.flujo || [];
        var labels = flujo.map(function (f) { return f.fecha.substring(5); });
        var saldos = flujo.map(function (f) { return f.saldo; });
        var cobros = flujo.map(function (f) { return f.cobros; });
        var pagos = flujo.map(function (f) { return -f.pagos; });

        var ctx = document.getElementById("tes-chart-flujo");
        if (_tesChart) _tesChart.destroy();
        _tesChart = new Chart(ctx, {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              {
                type: "line",
                label: "Saldo proyectado",
                data: saldos,
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59,130,246,0.08)",
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2,
                yAxisID: "y",
                order: 0,
              },
              {
                label: "Cobros",
                data: cobros,
                backgroundColor: "rgba(34,197,94,0.6)",
                yAxisID: "y",
                order: 1,
              },
              {
                label: "Pagos",
                data: pagos,
                backgroundColor: "rgba(239,68,68,0.6)",
                yAxisID: "y",
                order: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
              legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 11 } } },
              tooltip: {
                callbacks: {
                  label: function (ctx) {
                    var v = ctx.raw || 0;
                    return ctx.dataset.label + ": " + _fmtE(Math.abs(v));
                  },
                },
              },
            },
            scales: {
              x: { grid: { display: false }, ticks: { maxTicksLimit: 15, font: { size: 10 } } },
              y: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 }, callback: function (v) { return _fmtE(v); } } },
            },
          },
        });
      });
  }

  function _tesCargarCalendario() {
    var params = new URLSearchParams();
    if (_tesCalTipo) params.set("tipo", _tesCalTipo);
    fetch("/api/tesoreria/calendario?" + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var eventos = d.eventos || [];
        var container = document.getElementById("tes-calendario");
        if (!eventos.length) {
          container.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;font-size:0.85rem;">Sin vencimientos proximos.</p>';
          return;
        }
        // Group by week
        var weeks = {};
        eventos.forEach(function (e) {
          var dt = new Date(e.fecha + "T00:00:00");
          var dayOfWeek = dt.getDay();
          var monday = new Date(dt);
          monday.setDate(dt.getDate() - ((dayOfWeek + 6) % 7));
          var key = monday.toISOString().substring(0, 10);
          if (!weeks[key]) weeks[key] = { start: key, eventos: [], total: 0 };
          weeks[key].eventos.push(e);
          weeks[key].total += (e.tipo === "cobro" ? 1 : -1) * (e.importe || 0);
        });
        var html = "";
        Object.keys(weeks).sort().forEach(function (wk) {
          var w = weeks[wk];
          var endDate = new Date(w.start + "T00:00:00");
          endDate.setDate(endDate.getDate() + 6);
          html += '<div class="tes-semana-header">Semana ' + w.start.substring(5) + ' al ' + endDate.toISOString().substring(5, 10) + ' (' + _fmtE(w.total) + ')</div>';
          w.eventos.slice(0, 20).forEach(function (e) {
            html += '<div class="tes-venc-item">' +
              '<span class="tes-venc-fecha">' + _esc(e.fecha.substring(5)) + '</span>' +
              '<span class="tes-venc-empresa">' + _esc(e.empresa) + '</span>' +
              '<span class="tes-venc-importe">' + _fmtE(e.importe) + '</span>' +
              '<span class="tes-badge-' + e.tipo + '">' + (e.tipo === "cobro" ? "Cobro" : "Pago") + '</span>' +
              (e.vencida ? ' <span class="tes-badge-vencida">Vencida</span>' : '') +
            '</div>';
          });
        });
        container.innerHTML = html;
      })
      .catch(function (err) { console.error("Calendario error:", err); });
  }

  function _tesCargarAging() {
    fetch("/api/tesoreria/aging?tipo=" + _tesAgingTipo)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var aging = d.aging || [];
        var container = document.getElementById("tes-aging");
        if (!aging.length) {
          container.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;font-size:0.85rem;">Sin deudas pendientes.</p>';
          return;
        }
        var html = '<table style="width:100%;font-size:0.8rem;border-collapse:collapse;"><thead><tr style="border-bottom:2px solid #e2e8f0;"><th style="text-align:left;padding:4px 6px;">Empresa</th><th style="text-align:right;padding:4px 6px;">Total</th><th style="text-align:right;padding:4px 6px;">0-30d</th><th style="text-align:right;padding:4px 6px;">31-60d</th><th style="text-align:right;padding:4px 6px;color:#f97316;">61-90d</th><th style="text-align:right;padding:4px 6px;color:#ef4444;">>90d</th></tr></thead><tbody>';
        aging.forEach(function (a) {
          var total = a.total || 1;
          html += '<tr style="border-bottom:1px solid #f1f5f9;">' +
            '<td style="padding:4px 6px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + _esc(a.empresa) + '">' + _esc(a.empresa) + '</td>' +
            '<td style="text-align:right;padding:4px 6px;font-weight:600;">' + _fmtE(a.total) + '</td>' +
            '<td style="text-align:right;padding:4px 6px;">' + (a.t_0_30 ? _fmtE(a.t_0_30) : '') + '</td>' +
            '<td style="text-align:right;padding:4px 6px;">' + (a.t_31_60 ? _fmtE(a.t_31_60) : '') + '</td>' +
            '<td style="text-align:right;padding:4px 6px;' + (a.t_61_90 ? 'color:#f97316;' : '') + '">' + (a.t_61_90 ? _fmtE(a.t_61_90) : '') + '</td>' +
            '<td style="text-align:right;padding:4px 6px;' + (a.t_90_plus ? 'color:#ef4444;font-weight:600;' : '') + '">' + (a.t_90_plus ? _fmtE(a.t_90_plus) : '') + '</td>' +
          '</tr>' +
          '<tr><td colspan="6" style="padding:0 6px 4px;"><div class="tes-aging-bar">' +
            '<div class="tes-aging-seg-0" style="width:' + (a.t_0_30 / total * 100) + '%"></div>' +
            '<div class="tes-aging-seg-1" style="width:' + (a.t_31_60 / total * 100) + '%"></div>' +
            '<div class="tes-aging-seg-2" style="width:' + (a.t_61_90 / total * 100) + '%"></div>' +
            '<div class="tes-aging-seg-3" style="width:' + (a.t_90_plus / total * 100) + '%"></div>' +
          '</div></td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
      })
      .catch(function (err) { console.error("Aging error:", err); });
  }

  function _tesCargarAlertas() {
    fetch("/api/tesoreria/alertas")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var el = document.getElementById("tes-alerta-vencidas");
        if (d.facturas_vencidas > 0) {
          el.style.display = "";
          el.innerHTML = '<strong>Atencion:</strong> Tienes ' + d.facturas_vencidas + ' factura(s) vencida(s) por importe de ' + _fmtE(d.importe_vencido) +
            ' (' + d.pagos_vencidos + ' pagos, ' + d.cobros_vencidos + ' cobros)';
        } else {
          el.style.display = "none";
        }
      });
  }

  // Calendar toggle
  document.querySelectorAll(".tes-cal-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tes-cal-toggle").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      _tesCalTipo = btn.getAttribute("data-tipo") || "";
      _tesCargarCalendario();
    });
  });

  // Aging toggle
  document.querySelectorAll(".tes-aging-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tes-aging-toggle").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      _tesAgingTipo = btn.getAttribute("data-tipo") || "proveedores";
      _tesCargarAging();
    });
  });

  // Observer
  var tesPanel = document.getElementById("panel-tesoreria-inicio");
  if (tesPanel) {
    new MutationObserver(function () {
      if (tesPanel.classList.contains("visible")) _tesCargarTodo();
    }).observe(tesPanel, { attributes: true, attributeFilter: ["class"] });
  }
})();

// ═══ CRM ═══════════════════════════════════════════════════════════════════════
(function () {
  var _crmEmpresaSeleccionada = null;
  var _crmOffset = 0;
  var _crmLimit = 50;
  var _crmTotal = 0;
  var _crmBuscarTimer = null;

  var listaEl = document.getElementById("crm-empresas-lista");
  var buscarEl = document.getElementById("crm-empresas-buscar");
  var filtroTipoEl = document.getElementById("crm-empresas-filtro-tipo");
  var detalleEl = document.getElementById("crm-empresa-detalle");
  var sinSelEl = document.getElementById("crm-empresas-sin-seleccion");
  var paginacionEl = document.getElementById("crm-empresas-paginacion");
  var modalEl = document.getElementById("modal-crm-empresa");
  var formEl = document.getElementById("form-crm-empresa");

  if (!listaEl) return;

  // Stats
  window._crmCargarStats = function () {
    fetch("/api/crm/stats")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var el = function (id) { return document.getElementById(id); };
        el("crm-stat-empresas").textContent = d.total_empresas || 0;
        el("crm-stat-contactos").textContent = d.total_contactos || 0;
        el("crm-stat-oportunidades").textContent = d.oportunidades_abiertas || 0;
        var imp = d.importe_pipeline || 0;
        el("crm-stat-pipeline").textContent = imp > 0 ? imp.toLocaleString("es-ES", { style: "currency", currency: "EUR" }) : "0";
        el("crm-stat-interacciones-mes").textContent = d.interacciones_mes || 0;
        el("crm-stat-pendientes").textContent = d.pendientes_seguimiento || 0;
        el("crm-stat-conversion").textContent = (d.tasa_conversion || 0) + "%";
      })
      .catch(function () {});
  };

  // Dashboard cards navigation
  document.querySelectorAll(".crm-dash-card[data-crm-nav]").forEach(function (card) {
    card.addEventListener("click", function () {
      var target = card.getAttribute("data-crm-nav");
      activarSubpanel("crm", target);
      if (target === "empresas") _crmCargarEmpresas();
      if (target === "contactos" && window._crmCargarContactos) _crmCargarContactos();
      if (target === "interacciones" && window._crmCargarInteracciones) _crmCargarInteracciones();
      if (target === "oportunidades" && window._crmCargarOportunidades) _crmCargarOportunidades();
    });
  });

  // Empresas list
  window._crmCargarEmpresas = function () {
    var q = (buscarEl.value || "").trim();
    var tipo = filtroTipoEl.value;
    var params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tipo) params.set("tipo", tipo);
    params.set("activo", "1");
    params.set("limit", String(_crmLimit));
    params.set("offset", String(_crmOffset));

    fetch("/api/crm/empresas?" + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _crmTotal = data.total || 0;
        listaEl.innerHTML = "";
        if (!data.empresas || data.empresas.length === 0) {
          listaEl.innerHTML = '<li style="cursor:default;color:#94a3b8;justify-content:center;">Sin resultados</li>';
          _crmRenderPaginacion();
          return;
        }
        data.empresas.forEach(function (emp) {
          var li = document.createElement("li");
          if (_crmEmpresaSeleccionada && _crmEmpresaSeleccionada === emp.id) li.classList.add("seleccionado");
          li.innerHTML =
            '<div class="crm-empresa-li-info">' +
              '<span class="crm-empresa-li-nombre">' + _esc(emp.nombre) + '</span>' +
              '<div class="crm-empresa-li-meta">' +
                '<span class="status-badge status-badge--' + _esc(emp.tipo) + '">' + _esc(emp.tipo) + '</span>' +
                '<span class="crm-empresa-li-contactos">' + (emp.num_contactos || 0) + ' contactos</span>' +
              '</div>' +
            '</div>';
          li.addEventListener("click", function () {
            _crmSeleccionarEmpresa(emp.id);
            listaEl.querySelectorAll("li").forEach(function (el) { el.classList.remove("seleccionado"); });
            li.classList.add("seleccionado");
          });
          listaEl.appendChild(li);
        });
        _crmRenderPaginacion();
      })
      .catch(function () {
        listaEl.innerHTML = '<li style="cursor:default;color:#b91c1c;">Error al cargar</li>';
      });
  };

  function _crmRenderPaginacion() {
    var totalPags = Math.ceil(_crmTotal / _crmLimit);
    var pagActual = Math.floor(_crmOffset / _crmLimit) + 1;
    if (totalPags <= 1) { paginacionEl.innerHTML = ""; return; }
    paginacionEl.innerHTML =
      '<button id="crm-pag-prev"' + (pagActual <= 1 ? ' disabled' : '') + '>&laquo; Ant</button>' +
      '<span>' + pagActual + ' / ' + totalPags + '</span>' +
      '<button id="crm-pag-next"' + (pagActual >= totalPags ? ' disabled' : '') + '>Sig &raquo;</button>';
    document.getElementById("crm-pag-prev").addEventListener("click", function () {
      _crmOffset = Math.max(0, _crmOffset - _crmLimit);
      _crmCargarEmpresas();
    });
    document.getElementById("crm-pag-next").addEventListener("click", function () {
      _crmOffset += _crmLimit;
      _crmCargarEmpresas();
    });
  }

  // Buscar con debounce
  buscarEl.addEventListener("input", function () {
    clearTimeout(_crmBuscarTimer);
    _crmBuscarTimer = setTimeout(function () { _crmOffset = 0; _crmCargarEmpresas(); }, 300);
  });
  filtroTipoEl.addEventListener("change", function () { _crmOffset = 0; _crmCargarEmpresas(); });

  // Seleccionar empresa (detalle)
  function _crmSeleccionarEmpresa(id) {
    _crmEmpresaSeleccionada = id;
    fetch("/api/crm/empresas/" + id)
      .then(function (r) { return r.json(); })
      .then(function (emp) {
        if (emp.error) { sinSelEl.style.display = "block"; detalleEl.style.display = "none"; return; }
        sinSelEl.style.display = "none";
        detalleEl.style.display = "block";
        document.getElementById("crm-empresa-nombre").textContent = emp.nombre || "";
        document.getElementById("crm-empresa-cif").textContent = emp.cif ? "CIF: " + emp.cif : "";
        var badge = document.getElementById("crm-empresa-tipo-badge");
        badge.textContent = emp.tipo || "";
        badge.className = "status-badge status-badge--" + (emp.tipo || "lead");
        document.getElementById("crm-empresa-sector").textContent = emp.sector ? emp.sector : "";
        document.getElementById("crm-empresa-direccion").textContent = [emp.direccion, emp.localidad, emp.provincia, emp.pais].filter(Boolean).join(", ") || "Sin direccion";
        document.getElementById("crm-empresa-telefono").textContent = emp.telefono ? "Tel: " + emp.telefono : "";
        document.getElementById("crm-empresa-email").textContent = emp.email || "";
        document.getElementById("crm-empresa-web").textContent = emp.web || "";
        document.getElementById("crm-empresa-notas").textContent = emp.notas || "Sin notas";

        // Contactos
        var contEl = document.getElementById("crm-empresa-contactos-lista");
        if (emp.contactos && emp.contactos.length > 0) {
          contEl.innerHTML = emp.contactos.map(function (c) {
            return '<div class="crm-contacto-mini-item" style="cursor:pointer;" data-cont-id="' + c.id + '"><strong>' + _esc(c.nombre) + ' ' + _esc(c.apellidos || '') + '</strong>' +
              (c.cargo ? '<span>' + _esc(c.cargo) + '</span>' : '') +
              (c.email ? '<span>' + _esc(c.email) + '</span>' : '') +
              (c.telefono ? '<span>' + _esc(c.telefono) + '</span>' : '') + '</div>';
          }).join("");
          contEl.querySelectorAll("[data-cont-id]").forEach(function (el) {
            el.addEventListener("click", function () { activarSubpanel("crm", "contactos"); setTimeout(function () { if (window._crmCargarContactos) { _crmCargarContactos(); _contSeleccionar(parseInt(el.getAttribute("data-cont-id"))); } }, 100); });
          });
        } else {
          contEl.innerHTML = '<p class="crm-sin-datos">Sin contactos</p>';
        }

        // Interacciones
        var _tlI = { llamada: "\u260E", email: "\u2709", whatsapp: "\uD83D\uDCAC", reunion: "\uD83D\uDC65", nota: "\uD83D\uDCDD", visita: "\uD83D\uDCCD" };
        var intEl = document.getElementById("crm-empresa-interacciones-lista");
        if (emp.interacciones && emp.interacciones.length > 0) {
          intEl.innerHTML = emp.interacciones.map(function (i) {
            return '<div class="crm-timeline-item" style="cursor:pointer;" data-int-id="' + i.id + '">' +
              '<span class="crm-timeline-fecha">' + _esc((i.fecha || "").substring(0, 10)) + '</span>' +
              '<span class="crm-timeline-tipo">' + (_tlI[i.tipo] || "") + ' ' + _esc(i.tipo) + '</span>' +
              '<span class="crm-timeline-asunto">' + _esc(i.asunto || i.descripcion || "") + '</span>' +
              (i.resultado ? '<span class="status-badge status-badge--lead" style="font-size:0.65rem;">' + _esc(i.resultado) + '</span>' : '') +
              '</div>';
          }).join("");
          intEl.querySelectorAll("[data-int-id]").forEach(function (el) {
            el.addEventListener("click", function () { if (window._intAbrirModalEditar) _intAbrirModalEditar(parseInt(el.getAttribute("data-int-id"))); });
          });
        } else {
          intEl.innerHTML = '<p class="crm-sin-datos">Sin interacciones</p>';
        }

        // Oportunidades
        var opEl = document.getElementById("crm-empresa-oportunidades-lista");
        if (emp.oportunidades && emp.oportunidades.length > 0) {
          opEl.innerHTML = emp.oportunidades.map(function (o) {
            var imp = o.importe_estimado ? Number(o.importe_estimado).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }) : "";
            return '<div class="crm-contacto-mini-item" style="cursor:pointer;" data-op-id="' + o.id + '">' +
              '<strong>' + _esc(o.nombre) + '</strong>' +
              '<span class="status-badge status-badge--' + _esc(o.estado) + '">' + _esc(o.estado) + '</span>' +
              (imp ? '<span style="font-weight:600;">' + imp + '</span>' : '') + '</div>';
          }).join("");
          opEl.querySelectorAll("[data-op-id]").forEach(function (el) {
            el.addEventListener("click", function () {
              activarSubpanel("crm", "oportunidades");
              setTimeout(function () { if (window._crmCargarOportunidades) { _crmCargarOportunidades(); } }, 100);
            });
          });
        } else {
          opEl.innerHTML = '<p class="crm-sin-datos">Sin oportunidades</p>';
        }

        // Presupuestos vinculados (por tercero_id)
        var presSecEl = document.getElementById("crm-empresa-presupuestos-lista");
        if (presSecEl && emp.tercero_id) {
          fetch("/api/presupuestos?tercero_id=" + emp.tercero_id)
            .then(function (r) { return r.json(); })
            .then(function (pd) {
              var pres = pd.presupuestos || [];
              if (pres.length) {
                presSecEl.innerHTML = pres.map(function (pr) {
                  var imp = pr.total_version_activa ? Number(pr.total_version_activa).toLocaleString("es-ES", {style:"currency",currency:"EUR",minimumFractionDigits:0}) : "";
                  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--color-border);">' +
                    '<div><a href="#" onclick="navegarAPresupuesto(' + pr.id + ');return false;" style="font-size:13px;font-weight:500;color:var(--color-primary);text-decoration:none;">' + _esc(pr.referencia || "") + '</a>' +
                    '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:6px;">' + _esc(pr.nombre_proyecto || "") + '</span></div>' +
                    '<div style="display:flex;align-items:center;gap:6px;">' + (imp ? '<span style="font-size:13px;font-weight:500;">' + imp + '</span>' : '') +
                    '<span class="status-badge status-badge--' + _esc(pr.estado || "") + '">' + _esc(pr.estado || "") + '</span></div></div>';
                }).join("");
              } else {
                presSecEl.innerHTML = '<p class="crm-sin-datos" style="font-style:italic;">Sin presupuestos</p>';
              }
            }).catch(function () { presSecEl.innerHTML = '<p class="crm-sin-datos">Error</p>'; });
        } else if (presSecEl) {
          presSecEl.innerHTML = '<p class="crm-sin-datos" style="font-style:italic;">Sin presupuestos</p>';
        }

        // Proyectos vinculados (por tercero_id)
        var proySecEl = document.getElementById("crm-empresa-proyectos-lista");
        if (proySecEl && emp.tercero_id) {
          fetch("/api/proyectos?tercero_id=" + emp.tercero_id)
            .then(function (r) { return r.json(); })
            .then(function (pd) {
              var proys = pd.proyectos || [];
              if (proys.length) {
                proySecEl.innerHTML = proys.map(function (pr) {
                  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--color-border);">' +
                    '<div><a href="#" onclick="navegarAProyecto(' + pr.id + ');return false;" style="font-size:13px;font-weight:500;color:var(--color-primary);text-decoration:none;">' + _esc(pr.nombre || "") + '</a>' +
                    '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:6px;">' + _esc(pr.ubicacion_texto || pr.nombre_parque || "") + '</span></div>' +
                    '<div style="display:flex;align-items:center;gap:6px;">' +
                    '<span class="status-badge status-badge--' + _esc(pr.estado || "") + '">' + _esc(pr.estado || "") + '</span></div></div>';
                }).join("");
              } else {
                proySecEl.innerHTML = '<p class="crm-sin-datos" style="font-style:italic;">Sin proyectos</p>';
              }
            }).catch(function () { proySecEl.innerHTML = '<p class="crm-sin-datos">Error</p>'; });
        } else if (proySecEl) {
          proySecEl.innerHTML = '<p class="crm-sin-datos" style="font-style:italic;">Sin proyectos</p>';
        }
      })
      .catch(function () { sinSelEl.textContent = "Error al cargar empresa."; });
  }

  // Modal crear/editar empresa
  function _crmAbrirModal(emp) {
    document.getElementById("modal-crm-empresa-titulo").textContent = emp ? "Editar empresa" : "Nueva empresa";
    document.getElementById("crm-empresa-edit-id").value = emp ? emp.id : "";
    document.getElementById("crm-emp-nombre").value = emp ? emp.nombre || "" : "";
    document.getElementById("crm-emp-cif").value = emp ? emp.cif || "" : "";
    document.getElementById("crm-emp-tipo").value = emp ? emp.tipo || "lead" : "lead";
    document.getElementById("crm-emp-direccion").value = emp ? emp.direccion || "" : "";
    document.getElementById("crm-emp-localidad").value = emp ? emp.localidad || "" : "";
    document.getElementById("crm-emp-provincia").value = emp ? emp.provincia || "" : "";
    document.getElementById("crm-emp-pais").value = emp ? emp.pais || "" : "";
    document.getElementById("crm-emp-telefono").value = emp ? emp.telefono || "" : "";
    document.getElementById("crm-emp-email").value = emp ? emp.email || "" : "";
    document.getElementById("crm-emp-web").value = emp ? emp.web || "" : "";
    document.getElementById("crm-emp-sector").value = emp ? emp.sector || "" : "";
    document.getElementById("crm-emp-notas").value = emp ? emp.notas || "" : "";
    modalEl.classList.add("visible");
    modalEl.setAttribute("aria-hidden", "false");
    document.getElementById("crm-emp-nombre").focus();
  }

  function _crmCerrarModal() {
    modalEl.classList.remove("visible");
    modalEl.setAttribute("aria-hidden", "true");
  }

  document.getElementById("btn-nueva-empresa-crm").addEventListener("click", function () { _crmAbrirModal(null); });
  document.getElementById("btn-cancelar-crm-empresa").addEventListener("click", _crmCerrarModal);
  modalEl.addEventListener("click", function (e) { if (e.target === modalEl) _crmCerrarModal(); });

  document.getElementById("btn-editar-empresa-crm").addEventListener("click", function () {
    if (!_crmEmpresaSeleccionada) return;
    fetch("/api/crm/empresas/" + _crmEmpresaSeleccionada)
      .then(function (r) { return r.json(); })
      .then(function (emp) { if (!emp.error) _crmAbrirModal(emp); });
  });

  // Submit form
  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = document.getElementById("crm-empresa-edit-id").value;
    var body = {
      nombre: document.getElementById("crm-emp-nombre").value,
      cif: document.getElementById("crm-emp-cif").value,
      tipo: document.getElementById("crm-emp-tipo").value,
      direccion: document.getElementById("crm-emp-direccion").value,
      localidad: document.getElementById("crm-emp-localidad").value,
      provincia: document.getElementById("crm-emp-provincia").value,
      pais: document.getElementById("crm-emp-pais").value,
      telefono: document.getElementById("crm-emp-telefono").value,
      email: document.getElementById("crm-emp-email").value,
      web: document.getElementById("crm-emp-web").value,
      sector: document.getElementById("crm-emp-sector").value,
      notas: document.getElementById("crm-emp-notas").value,
    };
    var url = id ? "/api/crm/empresas/" + id : "/api/crm/empresas";
    var method = id ? "PUT" : "POST";
    fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { alert(res.data.error || "Error"); return; }
        _crmCerrarModal();
        _crmCargarEmpresas();
        if (res.data.id) _crmSeleccionarEmpresa(res.data.id);
      })
      .catch(function (err) { alert("Error: " + err.message); });
  });

  // Helper escape HTML
  // ── Deduplicación ──────────────────────────────────────────────────────────
  var dedupModalEl = document.getElementById("modal-crm-dedup");
  var dedupGruposEl = document.getElementById("crm-dedup-grupos");
  var dedupVacioEl = document.getElementById("crm-dedup-vacio");
  var dedupResumenEl = document.getElementById("crm-dedup-resumen");

  function _dedupAbrir() {
    dedupModalEl.classList.add("visible");
    dedupModalEl.setAttribute("aria-hidden", "false");
    dedupGruposEl.innerHTML = '<p style="text-align:center;color:#94a3b8;">Analizando duplicados...</p>';
    dedupVacioEl.style.display = "none";
    dedupResumenEl.textContent = "";

    fetch("/api/crm/duplicados")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var grupos = data.grupos || [];
        if (grupos.length === 0) {
          dedupGruposEl.innerHTML = "";
          dedupVacioEl.style.display = "block";
          dedupResumenEl.textContent = "0 grupos de posibles duplicados detectados.";
          return;
        }
        var totalRegs = 0;
        grupos.forEach(function (g) { totalRegs += g.registros.length; });
        dedupResumenEl.textContent = grupos.length + " grupo(s) de posibles duplicados (" + totalRegs + " registros afectados).";
        dedupGruposEl.innerHTML = "";
        grupos.forEach(function (grupo, gi) {
          var div = document.createElement("div");
          div.className = "crm-dedup-grupo";
          var titulo = document.createElement("div");
          titulo.className = "crm-dedup-grupo-titulo";
          titulo.textContent = "Grupo " + (gi + 1) + ": " + grupo.motivo;
          div.appendChild(titulo);

          var fichasDiv = document.createElement("div");
          fichasDiv.className = "crm-dedup-fichas";

          grupo.registros.forEach(function (reg) {
            var ficha = document.createElement("div");
            ficha.className = "crm-dedup-ficha";
            ficha.dataset.id = reg.id;

            var campos = [
              { label: "ID", value: "#" + reg.id },
              { label: "Nombre", value: reg.nombre_canonico },
              { label: "CIF/NIF", value: reg.nif },
              { label: "Localidad", value: reg.localidad },
              { label: "Direccion", value: reg.direccion },
              { label: "Telefono", value: reg.telefono },
              { label: "Email", value: reg.email },
            ];

            var html = '<label class="crm-dedup-radio"><input type="radio" name="dedup-principal-' + gi + '" value="' + reg.id + '"> Principal (se queda)</label>';
            html += '<h4>' + _esc(reg.nombre_canonico) + '</h4>';
            campos.forEach(function (c) {
              var val = c.value ? _esc(c.value) : '<span class="vacio">vacio</span>';
              html += '<div class="crm-dedup-campo"><strong>' + c.label + ':</strong> ' + val + '</div>';
            });
            html += '<div class="crm-dedup-facturas">Facturas prov: ' + (reg.num_facturas_prov || 0) + ' | Facturas cli: ' + (reg.num_facturas_cli || 0) + '</div>';
            ficha.innerHTML = html;

            // Highlight on radio select
            ficha.querySelector("input[type=radio]").addEventListener("change", function () {
              fichasDiv.querySelectorAll(".crm-dedup-ficha").forEach(function (f) { f.classList.remove("seleccionado"); });
              ficha.classList.add("seleccionado");
            });

            fichasDiv.appendChild(ficha);
          });

          div.appendChild(fichasDiv);

          // Boton fusionar
          var acciones = document.createElement("div");
          acciones.className = "crm-dedup-acciones";
          var btnFusionar = document.createElement("button");
          btnFusionar.className = "primary";
          btnFusionar.textContent = "Fusionar grupo";
          btnFusionar.addEventListener("click", function () {
            var radios = div.querySelectorAll("input[name='dedup-principal-" + gi + "']");
            var principalId = null;
            radios.forEach(function (r) { if (r.checked) principalId = parseInt(r.value); });
            if (!principalId) {
              alert("Selecciona el registro principal (el que se queda) antes de fusionar.");
              return;
            }
            var absorbidos = grupo.registros.filter(function (r) { return r.id !== principalId; }).map(function (r) { return r.id; });
            if (!confirm("Se fusionaran " + absorbidos.length + " registro(s) en el principal #" + principalId + ". Las facturas y datos se transferiran. Continuar?")) return;

            var promesas = absorbidos.map(function (absId) {
              return fetch("/api/crm/fusionar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ principal_id: principalId, absorbido_id: absId })
              }).then(function (r) { return r.json(); });
            });

            Promise.all(promesas).then(function (resultados) {
              var totalProv = 0, totalCli = 0, camposCopiados = [];
              resultados.forEach(function (res) {
                totalProv += res.facturas_prov_reasignadas || 0;
                totalCli += res.facturas_cli_reasignadas || 0;
                camposCopiados = camposCopiados.concat(res.campos_copiados || []);
              });
              div.innerHTML = '<div style="text-align:center;padding:16px;color:#059669;font-weight:600;">' +
                'Fusionado correctamente. Facturas prov reasignadas: ' + totalProv +
                ', Facturas cli reasignadas: ' + totalCli +
                (camposCopiados.length ? '. Campos copiados: ' + camposCopiados.join(", ") : '') +
                '</div>';
              _crmCargarEmpresas();
            }).catch(function (err) {
              alert("Error al fusionar: " + err.message);
            });
          });
          acciones.appendChild(btnFusionar);
          div.appendChild(acciones);

          dedupGruposEl.appendChild(div);
        });
      })
      .catch(function (err) {
        dedupGruposEl.innerHTML = '<p style="color:#b91c1c;text-align:center;">Error al detectar duplicados: ' + _esc(err.message) + '</p>';
      });
  }

  function _dedupCerrar() {
    dedupModalEl.classList.remove("visible");
    dedupModalEl.setAttribute("aria-hidden", "true");
  }

  document.getElementById("btn-revisar-duplicados-crm").addEventListener("click", _dedupAbrir);
  document.getElementById("btn-cerrar-dedup").addEventListener("click", _dedupCerrar);
  dedupModalEl.addEventListener("click", function (e) { if (e.target === dedupModalEl) _dedupCerrar(); });

  // Load CRM data when navigating to it via MutationObserver
  // ═══════════════════════════════════════════════════════════════════════════
  // CRM CONTACTOS
  // ═══════════════════════════════════════════════════════════════════════════
  var _contSeleccionado = null;
  var _contOffset = 0, _contLimit = 50, _contTotal = 0, _contTimer = null;
  var contListaEl = document.getElementById("crm-contactos-lista");
  var contBuscarEl = document.getElementById("crm-contactos-buscar");
  var contFiltroEmpEl = document.getElementById("crm-contactos-filtro-empresa");
  var contDetalleEl = document.getElementById("crm-contacto-detalle");
  var contSinSelEl = document.getElementById("crm-contactos-sin-seleccion");
  var contPagEl = document.getElementById("crm-contactos-paginacion");
  var contModalEl = document.getElementById("modal-crm-contacto");
  var contFormEl = document.getElementById("form-crm-contacto");

  var _tlIcons = {
    llamada: "\u260E", email: "\u2709", whatsapp: "\uD83D\uDCAC",
    reunion: "\uD83D\uDC65", nota: "\uD83D\uDCDD", visita: "\uD83D\uDCCD"
  };

  function _crmCargarEmpresasSelect() {
    fetch("/api/crm/empresas?activo=1&limit=200")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var emps = d.empresas || [];
        var selects = [
          contFiltroEmpEl,
          document.getElementById("crm-cont-empresa"),
          document.getElementById("crm-int-empresa"),
          document.getElementById("crm-inter-filtro-empresa"),
        ];
        selects.forEach(function (sel) {
          if (!sel) return;
          var val = sel.value;
          var first = sel.options[0] ? sel.options[0].outerHTML : '<option value="">--</option>';
          sel.innerHTML = first;
          emps.forEach(function (e) {
            var opt = document.createElement("option");
            opt.value = e.id;
            opt.textContent = e.nombre;
            sel.appendChild(opt);
          });
          sel.value = val;
        });
      });
  }

  window._crmCargarContactos = function () {
    _crmCargarEmpresasSelect();
    var q = (contBuscarEl.value || "").trim();
    var emp = contFiltroEmpEl.value;
    var p = new URLSearchParams();
    if (q) p.set("q", q);
    if (emp) p.set("empresa_id", emp);
    p.set("limit", String(_contLimit));
    p.set("offset", String(_contOffset));
    fetch("/api/crm/contactos?" + p.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _contTotal = data.total || 0;
        contListaEl.innerHTML = "";
        if (!data.contactos || data.contactos.length === 0) {
          contListaEl.innerHTML = '<li style="cursor:default;color:#94a3b8;justify-content:center;">Sin resultados</li>';
          _contRenderPag();
          return;
        }
        data.contactos.forEach(function (c) {
          var li = document.createElement("li");
          if (_contSeleccionado === c.id) li.classList.add("seleccionado");
          var nombreCompleto = _esc(c.nombre) + (c.apellidos ? " " + _esc(c.apellidos) : "");
          li.innerHTML =
            '<div class="crm-empresa-li-info">' +
              '<span class="crm-empresa-li-nombre">' + nombreCompleto + '</span>' +
              '<div class="crm-empresa-li-meta">' +
                (c.cargo ? '<span style="font-size:0.75rem;color:#94a3b8;">' + _esc(c.cargo) + '</span>' : '') +
                (c.nombre_empresa ? '<span style="font-size:0.72rem;color:#b0b8c4;">' + _esc(c.nombre_empresa) + '</span>' : '') +
              '</div>' +
              '<div class="crm-empresa-li-meta" style="margin-top:1px;">' +
                '<span class="status-badge status-badge--' + _esc(c.tipo_relacion || 'otro') + '">' + _esc(c.tipo_relacion || 'otro') + '</span>' +
                '<span class="crm-empresa-li-contactos">' + (c.num_interacciones || 0) + ' interacciones</span>' +
              '</div>' +
            '</div>';
          li.addEventListener("click", function () {
            _contSeleccionar(c.id);
            contListaEl.querySelectorAll("li").forEach(function (el) { el.classList.remove("seleccionado"); });
            li.classList.add("seleccionado");
          });
          contListaEl.appendChild(li);
        });
        _contRenderPag();
      })
      .catch(function () { contListaEl.innerHTML = '<li style="cursor:default;color:#b91c1c;">Error al cargar</li>'; });
  };

  function _contRenderPag() {
    var totalPags = Math.ceil(_contTotal / _contLimit);
    var pagActual = Math.floor(_contOffset / _contLimit) + 1;
    if (totalPags <= 1) { contPagEl.innerHTML = ""; return; }
    contPagEl.innerHTML =
      '<button id="cont-pag-prev"' + (pagActual <= 1 ? ' disabled' : '') + '>&laquo; Ant</button>' +
      '<span>' + pagActual + ' / ' + totalPags + '</span>' +
      '<button id="cont-pag-next"' + (pagActual >= totalPags ? ' disabled' : '') + '>Sig &raquo;</button>';
    document.getElementById("cont-pag-prev").addEventListener("click", function () { _contOffset = Math.max(0, _contOffset - _contLimit); _crmCargarContactos(); });
    document.getElementById("cont-pag-next").addEventListener("click", function () { _contOffset += _contLimit; _crmCargarContactos(); });
  }

  contBuscarEl.addEventListener("input", function () {
    clearTimeout(_contTimer);
    _contTimer = setTimeout(function () { _contOffset = 0; _crmCargarContactos(); }, 300);
  });
  contFiltroEmpEl.addEventListener("change", function () { _contOffset = 0; _crmCargarContactos(); });

  window._contSeleccionar = function (id) {
    _contSeleccionado = id;
    fetch("/api/crm/contactos/" + id)
      .then(function (r) { return r.json(); })
      .then(function (c) {
        if (c.error) { contSinSelEl.style.display = "block"; contDetalleEl.style.display = "none"; return; }
        contSinSelEl.style.display = "none";
        contDetalleEl.style.display = "block";
        document.getElementById("crm-contacto-nombre-completo").textContent = (c.nombre || "") + (c.apellidos ? " " + c.apellidos : "");
        document.getElementById("crm-contacto-cargo").textContent = c.cargo || "";
        var empLink = document.getElementById("crm-contacto-empresa-link");
        if (c.nombre_empresa) {
          empLink.textContent = c.nombre_empresa;
          empLink.style.display = "";
          empLink.onclick = function (e) { e.preventDefault(); activarSubpanel("crm", "empresas"); setTimeout(function () { _crmSeleccionarEmpresa(c.empresa_vinculada_id); _crmCargarEmpresas(); }, 100); };
        } else { empLink.style.display = "none"; }
        var badge = document.getElementById("crm-contacto-tipo-badge");
        badge.textContent = c.tipo_relacion || "otro";
        badge.className = "status-badge status-badge--" + (c.tipo_relacion || "otro");
        document.getElementById("crm-contacto-email").innerHTML = c.email ? '<a href="mailto:' + _esc(c.email) + '">' + _esc(c.email) + '</a>' : "";
        document.getElementById("crm-contacto-telefono").innerHTML = c.telefono ? '<a href="tel:' + _esc(c.telefono) + '">' + _esc(c.telefono) + '</a>' : "";
        document.getElementById("crm-contacto-telefono2").textContent = c.telefono2 || "";
        document.getElementById("crm-contacto-notas").textContent = c.notas || "Sin notas";

        var intEl = document.getElementById("crm-contacto-interacciones-lista");
        if (c.interacciones && c.interacciones.length > 0) {
          intEl.innerHTML = c.interacciones.map(function (i) {
            return '<div class="crm-timeline-item" style="cursor:pointer;" data-int-id="' + i.id + '">' +
              '<span class="crm-timeline-fecha">' + _esc((i.fecha || "").substring(0, 10)) + '</span>' +
              '<span class="crm-timeline-tipo">' + _esc(i.tipo) + '</span>' +
              '<span class="crm-timeline-asunto">' + _esc(i.asunto || i.descripcion || "") + '</span>' +
              (i.resultado ? '<span class="status-badge status-badge--lead" style="font-size:0.65rem;">' + _esc(i.resultado) + '</span>' : '') +
              '</div>';
          }).join("");
          intEl.querySelectorAll("[data-int-id]").forEach(function (el) {
            el.addEventListener("click", function () { _intAbrirModalEditar(parseInt(el.getAttribute("data-int-id"))); });
          });
        } else { intEl.innerHTML = '<p class="crm-sin-datos">Sin interacciones</p>'; }
      });
  }

  // Modal contacto
  function _contAbrirModal(c) {
    document.getElementById("modal-crm-contacto-titulo").textContent = c ? "Editar contacto" : "Nuevo contacto";
    document.getElementById("crm-cont-edit-id").value = c ? c.id : "";
    document.getElementById("crm-cont-nombre").value = c ? c.nombre || "" : "";
    document.getElementById("crm-cont-apellidos").value = c ? c.apellidos || "" : "";
    document.getElementById("crm-cont-cargo").value = c ? c.cargo || "" : "";
    document.getElementById("crm-cont-email").value = c ? c.email || "" : "";
    document.getElementById("crm-cont-telefono").value = c ? c.telefono || "" : "";
    document.getElementById("crm-cont-telefono2").value = c ? c.telefono2 || "" : "";
    document.getElementById("crm-cont-tipo").value = c ? c.tipo_relacion || "otro" : "otro";
    document.getElementById("crm-cont-notas").value = c ? c.notas || "" : "";
    document.getElementById("btn-eliminar-crm-contacto").style.display = c ? "" : "none";
    var targetEmpId = c ? (c.empresa_vinculada_id || "") : (_crmEmpresaSeleccionada || "");
    fetch("/api/crm/empresas?activo=1&limit=200")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var empSel = document.getElementById("crm-cont-empresa");
        var firstOpt = '<option value="">Sin empresa</option>';
        empSel.innerHTML = firstOpt;
        (d.empresas || []).forEach(function (e) {
          var opt = document.createElement("option");
          opt.value = e.id;
          opt.textContent = e.nombre;
          empSel.appendChild(opt);
        });
        empSel.value = String(targetEmpId);
      });
    contModalEl.classList.add("visible");
    contModalEl.setAttribute("aria-hidden", "false");
    document.getElementById("crm-cont-nombre").focus();
  }
  function _contCerrarModal() { contModalEl.classList.remove("visible"); contModalEl.setAttribute("aria-hidden", "true"); }

  document.getElementById("btn-nuevo-contacto-crm").addEventListener("click", function () { _contAbrirModal(null); });
  document.getElementById("btn-cancelar-crm-contacto").addEventListener("click", _contCerrarModal);
  contModalEl.addEventListener("click", function (e) { if (e.target === contModalEl) _contCerrarModal(); });

  var btnAddContEmp = document.getElementById("btn-add-contacto-empresa");
  if (btnAddContEmp) btnAddContEmp.addEventListener("click", function () { _contAbrirModal(null); });

  document.getElementById("btn-editar-contacto-crm").addEventListener("click", function () {
    if (!_contSeleccionado) return;
    fetch("/api/crm/contactos/" + _contSeleccionado).then(function (r) { return r.json(); }).then(function (c) { if (!c.error) _contAbrirModal(c); });
  });

  contFormEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = document.getElementById("crm-cont-edit-id").value;
    var body = {
      nombre: document.getElementById("crm-cont-nombre").value,
      apellidos: document.getElementById("crm-cont-apellidos").value,
      cargo: document.getElementById("crm-cont-cargo").value,
      email: document.getElementById("crm-cont-email").value,
      telefono: document.getElementById("crm-cont-telefono").value,
      telefono2: document.getElementById("crm-cont-telefono2").value,
      empresa_vinculada_id: document.getElementById("crm-cont-empresa").value || null,
      tipo_relacion: document.getElementById("crm-cont-tipo").value,
      notas: document.getElementById("crm-cont-notas").value,
    };
    var url = id ? "/api/crm/contactos/" + id : "/api/crm/contactos";
    var method = id ? "PUT" : "POST";
    fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { mostrarToast(res.data.error || "Error", "error"); return; }
        _contCerrarModal();
        _crmCargarContactos();
        if (res.data.id) _contSeleccionar(res.data.id);
        if (_crmEmpresaSeleccionada) _crmSeleccionarEmpresa(_crmEmpresaSeleccionada);
        mostrarToast("Contacto guardado.", "success");
      })
      .catch(function () { mostrarToast("Error de conexion.", "error"); });
  });

  document.getElementById("btn-eliminar-crm-contacto").addEventListener("click", function () {
    var id = document.getElementById("crm-cont-edit-id").value;
    if (!id || !confirm("Eliminar este contacto?")) return;
    fetch("/api/crm/contactos/" + id, { method: "DELETE" })
      .then(function (r) { return r.json(); })
      .then(function () { _contCerrarModal(); _contSeleccionado = null; contDetalleEl.style.display = "none"; contSinSelEl.style.display = "block"; _crmCargarContactos(); mostrarToast("Contacto eliminado.", "success"); });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CRM INTERACCIONES
  // ═══════════════════════════════════════════════════════════════════════════
  var _intOffset = 0, _intLimit = 50, _intTotal = 0, _intTimer = null;
  var intTimelineEl = document.getElementById("crm-interacciones-timeline");
  var intPagEl = document.getElementById("crm-interacciones-paginacion");
  var intModalEl = document.getElementById("modal-crm-interaccion");
  var intFormEl = document.getElementById("form-crm-interaccion");
  var intFiltroTipoEl = document.getElementById("crm-inter-filtro-tipo");
  var intFiltroEmpEl = document.getElementById("crm-inter-filtro-empresa");
  var intFechaDesdeEl = document.getElementById("crm-inter-fecha-desde");
  var intFechaHastaEl = document.getElementById("crm-inter-fecha-hasta");
  var intBuscarEl = document.getElementById("crm-inter-buscar");

  window._crmCargarInteracciones = function () {
    _crmCargarEmpresasSelect();
    var p = new URLSearchParams();
    if (intFiltroTipoEl.value) p.set("tipo", intFiltroTipoEl.value);
    if (intFiltroEmpEl.value) p.set("empresa_id", intFiltroEmpEl.value);
    if (intFechaDesdeEl.value) p.set("fecha_desde", intFechaDesdeEl.value);
    if (intFechaHastaEl.value) p.set("fecha_hasta", intFechaHastaEl.value);
    if (intBuscarEl.value.trim()) p.set("q", intBuscarEl.value.trim());
    p.set("limit", String(_intLimit));
    p.set("offset", String(_intOffset));
    fetch("/api/crm/interacciones?" + p.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _intTotal = data.total || 0;
        if (!data.interacciones || data.interacciones.length === 0) {
          intTimelineEl.innerHTML = '<p class="crm-placeholder">Sin interacciones registradas.</p>';
          _intRenderPag();
          return;
        }
        intTimelineEl.innerHTML = data.interacciones.map(function (i) {
          var icon = _tlIcons[i.tipo] || "\uD83D\uDCDD";
          var seg = "";
          if (i.siguiente_accion) {
            seg = '<span class="crm-badge-seguimiento">Seguimiento ' + _esc((i.fecha_siguiente_accion || "").substring(0, 10)) + '</span>';
          }
          return '<div class="crm-tl-card" data-int-id="' + i.id + '">' +
            '<div class="crm-tl-icon crm-tl-icon-' + _esc(i.tipo) + '">' + icon + '</div>' +
            '<div class="crm-tl-body">' +
              '<div class="crm-tl-asunto">' + _esc(i.asunto || "(Sin asunto)") + seg + '</div>' +
              '<div class="crm-tl-meta">' + _esc(i.nombre_empresa || "") + (i.nombre_contacto ? ' &middot; ' + _esc(i.nombre_contacto) + ' ' + _esc(i.apellidos_contacto || '') : '') + '</div>' +
              (i.descripcion ? '<div class="crm-tl-desc">' + _esc(i.descripcion) + '</div>' : '') +
            '</div>' +
            '<div class="crm-tl-fecha">' + _esc((i.fecha || "").substring(0, 10)) + '</div>' +
          '</div>';
        }).join("");
        intTimelineEl.querySelectorAll("[data-int-id]").forEach(function (el) {
          el.addEventListener("click", function () { _intAbrirModalEditar(parseInt(el.getAttribute("data-int-id"))); });
        });
        _intRenderPag();
      })
      .catch(function () { intTimelineEl.innerHTML = '<p class="crm-placeholder" style="color:#b91c1c;">Error al cargar</p>'; });
  };

  function _intRenderPag() {
    var totalPags = Math.ceil(_intTotal / _intLimit);
    var pagActual = Math.floor(_intOffset / _intLimit) + 1;
    if (totalPags <= 1) { intPagEl.innerHTML = ""; return; }
    intPagEl.innerHTML =
      '<button id="int-pag-prev"' + (pagActual <= 1 ? ' disabled' : '') + '>&laquo; Ant</button>' +
      '<span>' + pagActual + ' / ' + totalPags + '</span>' +
      '<button id="int-pag-next"' + (pagActual >= totalPags ? ' disabled' : '') + '>Sig &raquo;</button>';
    document.getElementById("int-pag-prev").addEventListener("click", function () { _intOffset = Math.max(0, _intOffset - _intLimit); _crmCargarInteracciones(); });
    document.getElementById("int-pag-next").addEventListener("click", function () { _intOffset += _intLimit; _crmCargarInteracciones(); });
  }

  [intFiltroTipoEl, intFiltroEmpEl, intFechaDesdeEl, intFechaHastaEl].forEach(function (el) {
    if (el) el.addEventListener("change", function () { _intOffset = 0; _crmCargarInteracciones(); });
  });
  if (intBuscarEl) intBuscarEl.addEventListener("input", function () {
    clearTimeout(_intTimer);
    _intTimer = setTimeout(function () { _intOffset = 0; _crmCargarInteracciones(); }, 300);
  });

  // Modal interaccion
  function _intAbrirModal(i, defaults) {
    var def = defaults || {};
    document.getElementById("modal-crm-interaccion-titulo").textContent = i ? "Editar interaccion" : "Nueva interaccion";
    document.getElementById("crm-int-edit-id").value = i ? i.id : "";
    document.getElementById("crm-int-tipo").value = i ? i.tipo || "nota" : "llamada";
    document.getElementById("crm-int-fecha").value = i ? (i.fecha || "").substring(0, 10) : new Date().toISOString().substring(0, 10);
    document.getElementById("crm-int-asunto").value = i ? i.asunto || "" : "";
    document.getElementById("crm-int-descripcion").value = i ? i.descripcion || "" : "";
    document.getElementById("crm-int-duracion").value = i ? i.duracion_minutos || "" : "";
    document.getElementById("crm-int-resultado").value = i ? i.resultado || "" : "";
    document.getElementById("crm-int-siguiente").value = i ? i.siguiente_accion || "" : "";
    document.getElementById("crm-int-fecha-siguiente").value = i ? (i.fecha_siguiente_accion || "").substring(0, 10) : "";
    document.getElementById("btn-eliminar-crm-interaccion").style.display = i ? "" : "none";

    var targetEmpId = i ? (i.empresa_id || "") : (def.empresa_id || _crmEmpresaSeleccionada || "");
    var targetContId = i ? (i.contacto_id || "") : (def.contacto_id || "");

    // Load empresas select, then set values after options are populated
    fetch("/api/crm/empresas?activo=1&limit=200")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var empSel = document.getElementById("crm-int-empresa");
        var firstOpt = '<option value="">Sin empresa</option>';
        empSel.innerHTML = firstOpt;
        (d.empresas || []).forEach(function (e) {
          var opt = document.createElement("option");
          opt.value = e.id;
          opt.textContent = e.nombre;
          empSel.appendChild(opt);
        });
        empSel.value = String(targetEmpId);
        _intCargarContactosEmpresa(targetEmpId, targetContId);
      });

    intModalEl.classList.add("visible");
    intModalEl.setAttribute("aria-hidden", "false");
  }

  window._intAbrirModalEditar = function (id) {
    fetch("/api/crm/interacciones/" + id)
      .then(function (r) { return r.json(); })
      .then(function (i) { if (!i.error) _intAbrirModal(i); });
  };

  function _intCargarContactosEmpresa(empresaId, selectedId) {
    var sel = document.getElementById("crm-int-contacto");
    sel.innerHTML = '<option value="">Sin contacto</option>';
    if (!empresaId) return;
    fetch("/api/crm/contactos?empresa_id=" + empresaId + "&limit=200")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        (d.contactos || []).forEach(function (c) {
          var opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = c.nombre + (c.apellidos ? " " + c.apellidos : "");
          sel.appendChild(opt);
        });
        if (selectedId) sel.value = String(selectedId);
      });
  }

  document.getElementById("crm-int-empresa").addEventListener("change", function () {
    _intCargarContactosEmpresa(this.value, "");
  });

  function _intCerrarModal() { intModalEl.classList.remove("visible"); intModalEl.setAttribute("aria-hidden", "true"); }
  document.getElementById("btn-nueva-interaccion-crm").addEventListener("click", function () { _intAbrirModal(null); });
  document.getElementById("btn-cancelar-crm-interaccion").addEventListener("click", _intCerrarModal);
  intModalEl.addEventListener("click", function (e) { if (e.target === intModalEl) _intCerrarModal(); });

  var btnAddIntEmp = document.getElementById("btn-add-interaccion-empresa");
  if (btnAddIntEmp) btnAddIntEmp.addEventListener("click", function () {
    _intAbrirModal(null, { empresa_id: _crmEmpresaSeleccionada });
  });
  var btnAddIntCont = document.getElementById("btn-add-interaccion-contacto");
  if (btnAddIntCont) btnAddIntCont.addEventListener("click", function () {
    if (!_contSeleccionado) return;
    // Fetch contacto to get empresa_vinculada_id
    fetch("/api/crm/contactos/" + _contSeleccionado)
      .then(function (r) { return r.json(); })
      .then(function (c) {
        _intAbrirModal(null, { empresa_id: c.empresa_vinculada_id, contacto_id: c.id });
      });
  });

  intFormEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = document.getElementById("crm-int-edit-id").value;
    var body = {
      tipo: document.getElementById("crm-int-tipo").value,
      fecha: document.getElementById("crm-int-fecha").value,
      empresa_id: document.getElementById("crm-int-empresa").value || null,
      contacto_id: document.getElementById("crm-int-contacto").value || null,
      asunto: document.getElementById("crm-int-asunto").value,
      descripcion: document.getElementById("crm-int-descripcion").value,
      duracion_minutos: document.getElementById("crm-int-duracion").value ? parseInt(document.getElementById("crm-int-duracion").value) : null,
      resultado: document.getElementById("crm-int-resultado").value,
      siguiente_accion: document.getElementById("crm-int-siguiente").value,
      fecha_siguiente_accion: document.getElementById("crm-int-fecha-siguiente").value || null,
    };
    var url = id ? "/api/crm/interacciones/" + id : "/api/crm/interacciones";
    var method = id ? "PUT" : "POST";
    fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { mostrarToast(res.data.error || "Error", "error"); return; }
        _intCerrarModal();
        _crmCargarInteracciones();
        if (_contSeleccionado) _contSeleccionar(_contSeleccionado);
        if (_crmEmpresaSeleccionada) _crmSeleccionarEmpresa(_crmEmpresaSeleccionada);
        mostrarToast("Interaccion guardada.", "success");
      })
      .catch(function () { mostrarToast("Error de conexion.", "error"); });
  });

  document.getElementById("btn-eliminar-crm-interaccion").addEventListener("click", function () {
    var id = document.getElementById("crm-int-edit-id").value;
    if (!id || !confirm("Eliminar esta interaccion?")) return;
    fetch("/api/crm/interacciones/" + id, { method: "DELETE" })
      .then(function (r) { return r.json(); })
      .then(function () {
        _intCerrarModal();
        _crmCargarInteracciones();
        if (_contSeleccionado) _contSeleccionar(_contSeleccionado);
        if (_crmEmpresaSeleccionada) _crmSeleccionarEmpresa(_crmEmpresaSeleccionada);
        mostrarToast("Interaccion eliminada.", "success");
      });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CRM OPORTUNIDADES
  // ═══════════════════════════════════════════════════════════════════════════
  var _opEstados = [
    { key: "lead", label: "Lead" },
    { key: "contacto_inicial", label: "Contacto inicial" },
    { key: "cotizacion_enviada", label: "Cotizacion enviada" },
    { key: "negociacion", label: "Negociacion" },
    { key: "ganada", label: "Ganada" },
    { key: "perdida", label: "Perdida" },
    { key: "aplazada", label: "Aplazada" },
  ];
  var opBoardEl = document.getElementById("op-kanban-board");
  var opListaEl = document.getElementById("op-lista-view");
  var opModalEl = document.getElementById("modal-crm-oportunidad");
  var opFormEl = document.getElementById("form-crm-oportunidad");
  var opMpModalEl = document.getElementById("modal-crm-motivo-perdida");
  var _opData = [];

  function _fmtEur(n) {
    if (!n) return "";
    return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  window._crmCargarOportunidades = function () {
    _crmCargarEmpresasSelect();
    fetch("/api/crm/oportunidades?limit=500")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _opData = data.oportunidades || [];
        _opRenderKanban();
      });
  };

  function _opRenderKanban() {
    var byEstado = {};
    _opEstados.forEach(function (e) { byEstado[e.key] = []; });
    _opData.forEach(function (o) { if (byEstado[o.estado]) byEstado[o.estado].push(o); });

    opBoardEl.innerHTML = _opEstados.map(function (est) {
      var ops = byEstado[est.key] || [];
      var total = ops.reduce(function (s, o) { return s + (o.importe_estimado || 0); }, 0);
      var cards = ops.map(function (o) {
        var prob = o.probabilidad || 0;
        return '<div class="kanban-card" draggable="true" data-op-id="' + o.id + '">' +
          '<div class="kanban-card-name">' + _esc(o.nombre) + '</div>' +
          '<div class="kanban-card-empresa">' + _esc(o.nombre_empresa || "") + '</div>' +
          (o.importe_estimado ? '<div class="kanban-card-importe">' + _fmtEur(o.importe_estimado) + '</div>' : '') +
          '<div class="kanban-card-row">' +
            '<div class="kanban-card-prob"><div class="kanban-card-prob-fill" style="width:' + prob + '%"></div></div>' +
            '<span class="kanban-card-prob-text">' + prob + '%</span>' +
          '</div>' +
          (o.fecha_estimada_cierre ? '<div class="kanban-card-fecha">' + _esc(o.fecha_estimada_cierre.substring(0, 10)) + '</div>' : '') +
          (o.fuente && o.fuente !== "otro" ? '<span class="kanban-card-fuente">' + _esc(o.fuente) + '</span>' : '') +
          (function(){var bb='';if(o.presupuesto_id&&o.presupuesto_ref)bb+='<span style="font-size:11px;padding:2px 6px;background:#2563EB10;color:#2563EB;border-radius:4px;">\uD83D\uDCC4 '+_esc(o.presupuesto_ref)+'</span>';if(o.proyecto_id&&o.proyecto_nombre)bb+='<span style="font-size:11px;padding:2px 6px;background:#16A34A10;color:#16A34A;border-radius:4px;">\uD83D\uDD27 '+_esc(o.proyecto_nombre)+'</span>';return bb?'<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">'+bb+'</div>':'';})() +
        '</div>';
      }).join("");
      return '<div class="kanban-col kb-' + est.key + '" data-estado="' + est.key + '">' +
        '<div class="kanban-col-header">' +
          '<span class="kanban-col-title">' + _esc(est.label) + '</span>' +
          '<div class="kanban-col-meta"><span class="kanban-col-count">' + ops.length + '</span>' + (total ? '<span>' + _fmtEur(total) + '</span>' : '') + '</div>' +
        '</div>' +
        '<div class="kanban-col-body" data-estado="' + est.key + '">' + (cards || '<div style="color:#cbd5e1;text-align:center;padding:20px;font-size:0.8rem;">Sin oportunidades</div>') + '</div>' +
      '</div>';
    }).join("");

    // Drag & drop
    opBoardEl.querySelectorAll(".kanban-card").forEach(function (card) {
      card.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", card.getAttribute("data-op-id"));
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", function () { card.classList.remove("dragging"); });
      card.addEventListener("click", function () { _opEditarById(parseInt(card.getAttribute("data-op-id"))); });
    });
    opBoardEl.querySelectorAll(".kanban-col-body").forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("drag-over"); });
      col.addEventListener("dragleave", function () { col.classList.remove("drag-over"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault();
        col.classList.remove("drag-over");
        var opId = parseInt(e.dataTransfer.getData("text/plain"));
        var nuevoEstado = col.getAttribute("data-estado");
        if (!opId || !nuevoEstado) return;
        var op = _opData.find(function (o) { return o.id === opId; });
        if (!op || op.estado === nuevoEstado) return;
        if (nuevoEstado === "perdida") {
          document.getElementById("crm-mp-oportunidad-id").value = opId;
          document.getElementById("crm-mp-motivo").value = "";
          opMpModalEl.classList.add("visible");
          opMpModalEl.setAttribute("aria-hidden", "false");
          return;
        }
        _opCambiarEstado(opId, nuevoEstado, null);
      });
    });
  }

  function _opCambiarEstado(opId, estado, motivo) {
    var body = { estado: estado };
    if (motivo) body.motivo_perdida = motivo;
    fetch("/api/crm/oportunidades/" + opId + "/estado", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { mostrarToast(res.data.error || "Error", "error"); return; }
        mostrarToast("Estado actualizado.", "success");
        if (estado === "ganada") mostrarToast("Oportunidad ganada. Considera crear un proyecto vinculado.", "info");
        _crmCargarOportunidades();
        if (_crmEmpresaSeleccionada) _crmSeleccionarEmpresa(_crmEmpresaSeleccionada);
      });
  }

  // Motivo perdida modal (drag&drop)
  document.getElementById("form-crm-motivo-perdida").addEventListener("submit", function (e) {
    e.preventDefault();
    var opId = parseInt(document.getElementById("crm-mp-oportunidad-id").value);
    var motivo = document.getElementById("crm-mp-motivo").value.trim();
    if (!motivo) { mostrarToast("El motivo es obligatorio.", "error"); return; }
    opMpModalEl.classList.remove("visible");
    opMpModalEl.setAttribute("aria-hidden", "true");
    _opCambiarEstado(opId, "perdida", motivo);
  });
  document.getElementById("btn-cancelar-motivo-perdida").addEventListener("click", function () {
    opMpModalEl.classList.remove("visible");
    opMpModalEl.setAttribute("aria-hidden", "true");
  });

  // View toggle
  document.getElementById("op-view-kanban").addEventListener("click", function () {
    opBoardEl.style.display = "";
    opListaEl.style.display = "none";
    document.getElementById("op-view-kanban").classList.add("active");
    document.getElementById("op-view-lista").classList.remove("active");
  });
  document.getElementById("op-view-lista").addEventListener("click", function () {
    opBoardEl.style.display = "none";
    opListaEl.style.display = "";
    document.getElementById("op-view-lista").classList.add("active");
    document.getElementById("op-view-kanban").classList.remove("active");
    _opRenderLista();
  });

  function _opRenderLista() {
    var estado = document.getElementById("op-filtro-estado").value;
    var empId = document.getElementById("op-filtro-empresa").value;
    var q = (document.getElementById("op-filtro-buscar").value || "").trim().toLowerCase();
    var filtered = _opData.filter(function (o) {
      if (estado && o.estado !== estado) return false;
      if (empId && String(o.empresa_id) !== empId) return false;
      if (q && (o.nombre || "").toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var container = document.getElementById("op-tabla-container");
    if (!filtered.length) {
      container.innerHTML = '<p class="crm-placeholder">Sin oportunidades.</p>';
      return;
    }
    var html = '<table class="tabla-facturas"><thead><tr><th>Nombre</th><th>Empresa</th><th>Estado</th><th>Importe</th><th>Prob.</th><th>Cierre</th><th>Presupuesto</th><th>Proyecto</th><th>Fuente</th></tr></thead><tbody>';
    filtered.forEach(function (o) {
      var opPresCol = o.presupuesto_id && o.presupuesto_ref ? '<a href="#" onclick="event.stopPropagation();navegarAPresupuesto(' + o.presupuesto_id + ');return false;" style="color:#2563EB;text-decoration:none;font-size:12px;">' + _esc(o.presupuesto_ref) + '</a>' : '';
      var opProyCol = o.proyecto_id && o.proyecto_nombre ? '<a href="#" onclick="event.stopPropagation();navegarAProyecto(' + o.proyecto_id + ');return false;" style="color:#16A34A;text-decoration:none;font-size:12px;">' + _esc(o.proyecto_nombre) + '</a>' : '';
      html += '<tr style="cursor:pointer;" data-op-id="' + o.id + '">' +
        '<td style="font-weight:600;">' + _esc(o.nombre) + '</td>' +
        '<td>' + _esc(o.nombre_empresa || "") + '</td>' +
        '<td><span class="status-badge status-badge--' + _esc(o.estado) + '">' + _esc(o.estado) + '</span></td>' +
        '<td class="numero">' + (o.importe_estimado ? _fmtEur(o.importe_estimado) : "") + '</td>' +
        '<td class="numero">' + (o.probabilidad || 0) + '%</td>' +
        '<td>' + _esc((o.fecha_estimada_cierre || "").substring(0, 10)) + '</td>' +
        '<td>' + opPresCol + '</td>' +
        '<td>' + opProyCol + '</td>' +
        '<td>' + _esc(o.fuente || "") + '</td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
    container.querySelectorAll("[data-op-id]").forEach(function (tr) {
      tr.addEventListener("click", function () { _opEditarById(parseInt(tr.getAttribute("data-op-id"))); });
    });
  }

  ["op-filtro-estado", "op-filtro-empresa"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", _opRenderLista);
  });
  var opBuscarEl = document.getElementById("op-filtro-buscar");
  var _opBuscarTimer = null;
  if (opBuscarEl) opBuscarEl.addEventListener("input", function () {
    clearTimeout(_opBuscarTimer);
    _opBuscarTimer = setTimeout(_opRenderLista, 300);
  });

  // Modal oportunidad
  document.getElementById("crm-op-estado").addEventListener("change", function () {
    document.getElementById("crm-op-motivo-wrap").style.display = this.value === "perdida" ? "" : "none";
  });

  function _opAbrirModal(o) {
    document.getElementById("modal-crm-oportunidad-titulo").textContent = o ? "Editar oportunidad" : "Nueva oportunidad";
    document.getElementById("crm-op-edit-id").value = o ? o.id : "";
    document.getElementById("crm-op-nombre").value = o ? o.nombre || "" : "";
    document.getElementById("crm-op-estado").value = o ? o.estado || "lead" : "lead";
    document.getElementById("crm-op-probabilidad").value = o ? o.probabilidad || "" : "";
    document.getElementById("crm-op-importe").value = o ? o.importe_estimado || "" : "";
    document.getElementById("crm-op-fecha-cierre").value = o ? (o.fecha_estimada_cierre || "").substring(0, 10) : "";
    document.getElementById("crm-op-fuente").value = o ? o.fuente || "otro" : "otro";
    document.getElementById("crm-op-motivo").value = o ? o.motivo_perdida || "" : "";
    document.getElementById("crm-op-descripcion").value = o ? o.descripcion || "" : "";
    document.getElementById("crm-op-motivo-wrap").style.display = (o && o.estado === "perdida") ? "" : "none";
    fetch("/api/crm/empresas?activo=1&limit=200")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var empSel = document.getElementById("crm-op-empresa");
        empSel.innerHTML = '<option value="">Seleccionar</option>';
        (d.empresas || []).forEach(function (e) {
          var opt = document.createElement("option");
          opt.value = e.id;
          opt.textContent = e.nombre;
          empSel.appendChild(opt);
        });
        empSel.value = o ? String(o.empresa_id || "") : (_crmEmpresaSeleccionada ? String(_crmEmpresaSeleccionada) : "");
        _opCargarContactos(empSel.value, o ? o.contacto_id : "");
      });
    opModalEl.classList.add("visible");
    opModalEl.setAttribute("aria-hidden", "false");
  }

  function _opCargarContactos(empresaId, selectedId) {
    var sel = document.getElementById("crm-op-contacto");
    sel.innerHTML = '<option value="">Sin contacto</option>';
    if (!empresaId) return;
    fetch("/api/crm/contactos?empresa_id=" + empresaId + "&limit=200")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        (d.contactos || []).forEach(function (c) {
          var opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = c.nombre + (c.apellidos ? " " + c.apellidos : "");
          sel.appendChild(opt);
        });
        if (selectedId) sel.value = String(selectedId);
      });
  }

  document.getElementById("crm-op-empresa").addEventListener("change", function () {
    _opCargarContactos(this.value, "");
  });

  function _opCerrarModal() { opModalEl.classList.remove("visible"); opModalEl.setAttribute("aria-hidden", "true"); }
  document.getElementById("btn-nueva-oportunidad-crm").addEventListener("click", function () { _opAbrirModal(null); });
  document.getElementById("btn-cancelar-crm-oportunidad").addEventListener("click", _opCerrarModal);
  opModalEl.addEventListener("click", function (e) { if (e.target === opModalEl) _opCerrarModal(); });

  function _opEditarById(id) {
    fetch("/api/crm/oportunidades/" + id)
      .then(function (r) { return r.json(); })
      .then(function (o) { if (!o.error) _opAbrirModal(o); });
  }

  opFormEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = document.getElementById("crm-op-edit-id").value;
    var estado = document.getElementById("crm-op-estado").value;
    var body = {
      nombre: document.getElementById("crm-op-nombre").value,
      empresa_id: document.getElementById("crm-op-empresa").value || null,
      contacto_id: document.getElementById("crm-op-contacto").value || null,
      estado: estado,
      probabilidad: document.getElementById("crm-op-probabilidad").value ? parseInt(document.getElementById("crm-op-probabilidad").value) : null,
      importe_estimado: document.getElementById("crm-op-importe").value ? parseFloat(document.getElementById("crm-op-importe").value) : null,
      fecha_estimada_cierre: document.getElementById("crm-op-fecha-cierre").value || null,
      fuente: document.getElementById("crm-op-fuente").value,
      motivo_perdida: document.getElementById("crm-op-motivo").value,
      descripcion: document.getElementById("crm-op-descripcion").value,
    };
    var url = id ? "/api/crm/oportunidades/" + id : "/api/crm/oportunidades";
    var method = id ? "PUT" : "POST";
    fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { mostrarToast(res.data.error || "Error", "error"); return; }
        _opCerrarModal();
        _crmCargarOportunidades();
        if (_crmEmpresaSeleccionada) _crmSeleccionarEmpresa(_crmEmpresaSeleccionada);
        mostrarToast("Oportunidad guardada.", "success");
        if (estado === "ganada" && (!id || res.data.estado === "ganada")) {
          mostrarToast("Oportunidad ganada. Considera crear un proyecto vinculado.", "info");
        }
      })
      .catch(function () { mostrarToast("Error de conexion.", "error"); });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVERS
  // ═══════════════════════════════════════════════════════════════════════════
  var _crmObserver = new MutationObserver(function () {
    var panelInicio = document.getElementById("panel-crm-inicio");
    var panelEmpresas = document.getElementById("panel-crm-empresas");
    var panelContactos = document.getElementById("panel-crm-contactos");
    var panelInteracciones = document.getElementById("panel-crm-interacciones");
    var panelOportunidades = document.getElementById("panel-crm-oportunidades");
    if (panelInicio && panelInicio.classList.contains("visible")) _crmCargarStats();
    if (panelEmpresas && panelEmpresas.classList.contains("visible")) _crmCargarEmpresas();
    if (panelContactos && panelContactos.classList.contains("visible")) _crmCargarContactos();
    if (panelInteracciones && panelInteracciones.classList.contains("visible")) _crmCargarInteracciones();
    if (panelOportunidades && panelOportunidades.classList.contains("visible")) _crmCargarOportunidades();
  });
  ["panel-crm-inicio", "panel-crm-empresas", "panel-crm-contactos", "panel-crm-interacciones", "panel-crm-oportunidades"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) _crmObserver.observe(el, { attributes: true, attributeFilter: ["class"] });
  });

  var _initPanelEmpresas = document.getElementById("panel-crm-empresas");
  var _initPanelInicio = document.getElementById("panel-crm-inicio");
  if (_initPanelInicio && _initPanelInicio.classList.contains("visible")) _crmCargarStats();
  if (_initPanelEmpresas && _initPanelEmpresas.classList.contains("visible")) _crmCargarEmpresas();
})();


// ═══════════════════════════════════════════════════════════════════════════════
// PRESUPUESTOS
// ═══════════════════════════════════════════════════════════════════════════════

(function () {

  function _esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function _fmtEur(n) { return n != null ? Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" }) : "\u2014"; }

  function _estadoBadge(estado) {
    return '<span class="status-badge status-badge--' + _esc(estado) + '">' + _esc(estado) + '</span>';
  }

  function _renderPresupStats(proys) {
    var stats = document.getElementById("presup-stats");
    if (!stats) return;
    var total = proys.length;
    var borrador = 0, enviNeg = 0, adjudicados = 0, importeAdj = 0;
    proys.forEach(function (p) {
      if (p.estado === "borrador") borrador++;
      if (p.estado === "enviada" || p.estado === "negociacion") enviNeg++;
      if (p.estado === "adjudicada") { adjudicados++; importeAdj += (p.total_version_activa || 0); }
    });
    function _card(label, value, color) {
      return '<div style="background:var(--color-white);border-left:3px solid ' + color + ';border-radius:var(--radius-md);padding:16px;">' +
        '<div style="font-size:12px;color:var(--color-text-secondary);text-transform:uppercase;">' + label + '</div>' +
        '<div style="font-size:24px;font-weight:600;">' + value + '</div></div>';
    }
    stats.innerHTML =
      _card("Total", total, "var(--color-primary)") +
      _card("Borrador", borrador, "#64748B") +
      _card("Enviados / Negoc.", enviNeg, "#CA8A04") +
      _card("Adjudicados", adjudicados, "#16A34A") +
      _card("Importe adjudicado", _fmtEur(importeAdj), "#16A34A");
  }

  // ── Lista ──

  window.presupCargarLista = function () {
    var estado = document.getElementById("presup-filtro-estado");
    var params = estado && estado.value ? "?estado=" + encodeURIComponent(estado.value) : "";
    // Siempre cargar todos para las metricas, luego filtrar la tabla
    fetch("/api/presupuestos")
      .then(function (r) { return r.json(); })
      .then(function (allData) {
        var allProys = allData.presupuestos || [];
        _renderPresupStats(allProys);
        var filtroVal = estado && estado.value ? estado.value : "";
        var proys = filtroVal ? allProys.filter(function (p) { return p.estado === filtroVal; }) : allProys;
        var container = document.getElementById("presupuestos-tabla-container");
        if (!proys.length) {
          container.innerHTML = '<p style="text-align:center;color:var(--color-text-secondary);padding:40px;">' + (filtroVal ? 'No hay presupuestos con estado "' + _esc(filtroVal) + '".' : 'No hay presupuestos. Crea el primero.') + '</p>';
          return;
        }
        var html = '<table class="tabla-facturas"><thead><tr><th>Ref.</th><th>Proyecto</th><th>Cliente</th><th>Rev.</th><th class="numero">Total</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>';
        proys.forEach(function (p) {
          html += '<tr style="cursor:pointer;" onclick="presupEditar(' + p.id + ')">' +
            '<td><strong>' + _esc(p.referencia) + '</strong></td>' +
            '<td>' + _esc(p.nombre_proyecto) + '</td>' +
            '<td>' + _esc(p.nombre_cliente || "") + '</td>' +
            '<td>' + _esc(p.revision_activa || "R00") + '</td>' +
            '<td class="numero">' + _fmtEur(p.total_version_activa) + '</td>' +
            '<td>' + _estadoBadge(p.estado) + '</td>' +
            '<td>' + _esc((p.created_at || "").substring(0, 10)) + '</td>' +
            '<td><button class="secondary" style="font-size:0.75rem;padding:2px 10px;" onclick="event.stopPropagation();presupEditar(' + p.id + ')">Editar</button></td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
      });
  };

  var filtroEstado = document.getElementById("presup-filtro-estado");
  if (filtroEstado) filtroEstado.addEventListener("change", presupCargarLista);

  var btnNuevo = document.getElementById("btn-presup-nuevo");
  if (btnNuevo) btnNuevo.addEventListener("click", function () { activarSubpanel("presupuestos", "nuevo"); presupNuevo(); });

  // ── Nuevo ──

  window.presupNuevo = function () {
    document.getElementById("presup-edit-id").value = "";
    document.getElementById("presup-version-id").value = "";
    document.getElementById("presup-form-titulo").textContent = "Nuevo presupuesto";
    document.getElementById("presup-form-ref").textContent = "";
    document.getElementById("presupuesto-form").reset();
    document.getElementById("presup-lineas-principal").innerHTML = "";
    document.getElementById("presup-lineas-adicionales").innerHTML = "";
    document.getElementById("presup-total").textContent = "0,00 \u20AC";
    document.getElementById("presup-validez").value = "30";
    document.getElementById("presup-btn-nueva-version").style.display = "none";
    document.getElementById("presup-versiones-selector").style.display = "none";
    document.getElementById("presup-estado-control").style.display = "none";
    document.getElementById("presup-proyecto-badge").style.display = "none";
    _presupCargarSelectTerceros();
    _presupCargarSelectOportunidades();
    _presupCargarSelectPlantillas();
    presupCheckCompletitud();
  };

  // ── Editar ──

  window.presupEditar = function (id) {
    fetch("/api/presupuestos/" + id)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { mostrarToast(data.error, "error"); return; }
        document.getElementById("presup-edit-id").value = data.id;
        document.getElementById("presup-form-titulo").textContent = "Editar " + (data.referencia || "");
        document.getElementById("presup-form-ref").textContent = data.referencia || "";
        document.getElementById("presup-nombre-proyecto").value = data.nombre_proyecto || "";
        document.getElementById("presup-nombre-cliente-display").value = data.nombre_cliente_display || "";
        document.getElementById("presup-btn-nueva-version").style.display = "inline-flex";

        // Estado control
        var estadoCtrl = document.getElementById("presup-estado-control");
        var estadoSel = document.getElementById("presup-estado-select");
        estadoCtrl.style.display = "flex";
        estadoSel.value = data.estado || "borrador";

        // Proyecto badge
        var badge = document.getElementById("presup-proyecto-badge");
        var badgeName = document.getElementById("presup-proyecto-badge-nombre");
        if (data.proyecto_id && data.proyecto_nombre) {
          badge.style.display = "block";
          badge.setAttribute("data-proyecto-id", data.proyecto_id);
          badgeName.textContent = data.proyecto_nombre;
        } else {
          badge.style.display = "none";
        }
        // Oportunidad CRM badge
        var oBadge = document.getElementById("presup-oportunidad-badge");
        var oBadgeName = document.getElementById("presup-oportunidad-badge-nombre");
        if (oBadge) {
          if (data.oportunidad_id && data.oportunidad_nombre) {
            oBadge.style.display = "block";
            oBadge.setAttribute("data-oportunidad-id", data.oportunidad_id);
            oBadgeName.textContent = data.oportunidad_nombre;
          } else {
            oBadge.style.display = "none";
          }
        }

        _presupCargarSelectTerceros(data.tercero_id);
        _presupCargarSelectOportunidades(data.oportunidad_id);

        // Poblar selector de versiones
        var versiones = data.versiones || [];
        var vSel = document.getElementById("presup-version-select");
        var vSelContainer = document.getElementById("presup-versiones-selector");
        vSel.innerHTML = "";
        versiones.forEach(function (v) {
          var opt = document.createElement("option");
          opt.value = v.id;
          opt.textContent = v.revision + (v.es_activa ? " (activa)" : "") + " - " + (v.fecha || "");
          vSel.appendChild(opt);
        });
        vSelContainer.style.display = versiones.length > 1 ? "block" : "none";

        // Cargar version activa
        var versionActiva = null;
        for (var i = 0; i < versiones.length; i++) {
          if (versiones[i].es_activa) { versionActiva = versiones[i]; break; }
        }
        if (!versionActiva && versiones.length) versionActiva = versiones[0];

        if (versionActiva) {
          vSel.value = String(versionActiva.id);
          _presupCargarVersion(versionActiva);
        } else {
          document.getElementById("presup-version-id").value = "";
          document.getElementById("presup-lineas-principal").innerHTML = "";
          document.getElementById("presup-lineas-adicionales").innerHTML = "";
          document.getElementById("presup-total").textContent = "0,00 \u20AC";
          _presupCargarSelectPlantillas();
        }
        activarSubpanel("presupuestos", "nuevo");
        setTimeout(presupCheckCompletitud, 400);
      });
  };

  function _presupCargarVersion(v) {
    document.getElementById("presup-version-id").value = v.id;
    document.getElementById("presup-forma-pago").value = v.forma_pago || "";
    document.getElementById("presup-notas-capacidad").value = v.notas_capacidad || "";
    document.getElementById("presup-validez").value = v.validez_dias || 30;
    _presupCargarSelectPlantillas(v.plantilla_tc_id || null);
    _presupRenderLineas(v.lineas || []);
    setTimeout(presupCheckCompletitud, 350);
  }

  window.presupCambiarVersion = function (versionId) {
    if (!versionId) return;
    fetch("/api/presupuestos/versiones/" + versionId)
      .then(function (r) { return r.json(); })
      .then(function (v) {
        if (v.error) { mostrarToast(v.error, "error"); return; }
        _presupCargarVersion(v);
      });
  };

  window.presupNuevaVersion = function () {
    var presupId = document.getElementById("presup-edit-id").value;
    if (!presupId) return;
    if (!confirm("Crear nueva revision? Se copiara todo el contenido de la version actual.")) return;
    fetch("/api/presupuestos/" + presupId + "/versiones", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { mostrarToast(data.error, "error"); return; }
        mostrarToast("Version " + data.revision + " creada.", "success");
        presupEditar(parseInt(presupId));
      });
  };

  // ── Estado y vinculación con proyectos ──

  function _presupGetEditId() {
    return parseInt(document.getElementById("presup-edit-id").value) || null;
  }

  var _presupEstadoPendiente = null;

  window.presupCambiarEstado = async function (nuevoEstado) {
    var presupId = _presupGetEditId();
    if (!presupId) return;

    // Al enviar o negociar: crear/vincular proyecto si no existe
    if (nuevoEstado === "enviada" || nuevoEstado === "negociacion") {
      try {
        var resCheck = await fetch("/api/presupuestos/" + presupId);
        var presupData = await resCheck.json();
        if (!presupData.proyecto_id) {
          _presupEstadoPendiente = nuevoEstado;
          _presupMostrarDialogoCrearProyecto(presupId);
          return;
        }
      } catch (_) { /* proceed */ }
    }

    // Para adjudicada: guardar primero
    if (nuevoEstado === "adjudicada") {
      // presupGuardarBorrador is sync-ish, just fire it
    }

    // Cambiar estado directamente
    try {
      var res = await fetch("/api/presupuestos/" + presupId + "/estado", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      var data = await res.json();
      if (data.error) {
        mostrarToast(data.error, "error");
        presupEditar(presupId);
        return;
      }
      mostrarToast("Estado cambiado a " + nuevoEstado, "success");
      presupEditar(presupId);
    } catch (_) {
      mostrarToast("Error al cambiar estado", "error");
      presupEditar(presupId);
    }
  };

  function _presupMostrarDialogoCrearProyecto(presupId) {
    var existing = document.getElementById("modal-crear-proyecto");
    if (existing) existing.remove();

    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-crear-proyecto";
    modal.innerHTML =
      '<div class="modal-editar" role="dialog" style="max-width:500px;">' +
        '<h2 style="margin:0 0 8px;">Vincular con proyecto</h2>' +
        '<p style="color:var(--color-text-secondary);font-size:14px;margin:0 0 20px;">Al enviar un presupuesto, se crea un proyecto en Cotizados para hacer seguimiento en el pipeline.</p>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<button type="button" onclick="presupCrearProyectoYCambiarEstado()" style="text-align:left;padding:14px 16px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-white);cursor:pointer;">' +
            '<div style="font-weight:600;font-size:14px;">Crear proyecto nuevo en Cotizados</div>' +
            '<div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px;">Se creará con los datos del presupuesto</div>' +
          '</button>' +
          '<button type="button" onclick="presupVincularProyectoYCambiarEstado()" style="text-align:left;padding:14px 16px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-white);cursor:pointer;">' +
            '<div style="font-weight:600;font-size:14px;">Vincular a proyecto cotizado existente</div>' +
            '<div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px;">Asociar a un proyecto que ya existe</div>' +
          '</button>' +
        '</div>' +
        '<div style="margin-top:16px;text-align:right;">' +
          '<button type="button" onclick="document.getElementById(\'modal-crear-proyecto\').remove();_presupEstadoPendiente=null;presupEditar(' + presupId + ');" class="secondary" style="padding:8px 16px;">Cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
  }

  window.presupCrearProyectoYCambiarEstado = async function () {
    var presupId = _presupGetEditId();
    if (!presupId) return;
    document.getElementById("modal-crear-proyecto")?.remove();

    try {
      var res = await fetch("/api/presupuestos/" + presupId);
      var presup = await res.json();
      var versionActiva = (presup.versiones || []).find(function (v) { return v.es_activa; }) || (presup.versiones || [])[0];

      var proyectoData = {
        nombre: presup.nombre_proyecto,
        empresa_id: presup.empresa_id,
        cliente_tercero_id: presup.tercero_id,
        oportunidad_id: presup.oportunidad_id || null,
        presupuesto_id: presup.id,
        nombre_parque: presup.nombre_proyecto,
        importe_presupuestado: versionActiva ? versionActiva.total : 0,
        estado: "cotizado",
      };

      var resP = await fetch("/api/proyectos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proyectoData),
      });
      if (!resP.ok) {
        var err = await resP.json();
        mostrarToast(err.error || "Error al crear proyecto", "error");
        _presupEstadoPendiente = null;
        return;
      }
      var proyecto = await resP.json();

      // Vincular presupuesto al proyecto
      await fetch("/api/presupuestos/" + presupId, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proyecto_id: proyecto.id,
          nombre_proyecto: presup.nombre_proyecto,
          tercero_id: presup.tercero_id,
        }),
      });

      // Cambiar estado del presupuesto
      if (_presupEstadoPendiente) {
        await fetch("/api/presupuestos/" + presupId + "/estado", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: _presupEstadoPendiente }),
        });
      }

      mostrarToast('Proyecto "' + proyecto.nombre + '" creado en Cotizados', "success");
      _presupEstadoPendiente = null;
      presupEditar(presupId);
    } catch (e) {
      mostrarToast("Error: " + e.message, "error");
      _presupEstadoPendiente = null;
    }
  };

  window.presupVincularProyectoYCambiarEstado = async function () {
    var presupId = _presupGetEditId();
    if (!presupId) return;
    var modalContent = document.querySelector("#modal-crear-proyecto .modal-editar");
    if (!modalContent) return;

    try {
      var res = await fetch("/api/proyectos?estado=cotizado");
      var data = await res.json();
      var proyectos = data.proyectos || [];

      if (!proyectos.length) {
        modalContent.innerHTML =
          '<h2 style="margin:0 0 12px;">No hay proyectos cotizados</h2>' +
          '<p style="color:var(--color-text-secondary);font-size:14px;">No hay proyectos en Cotizados para vincular.</p>' +
          '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">' +
            '<button type="button" onclick="document.getElementById(\'modal-crear-proyecto\').remove();_presupEstadoPendiente=null;presupEditar(' + presupId + ');" class="secondary" style="padding:8px 16px;">Cancelar</button>' +
            '<button type="button" onclick="presupCrearProyectoYCambiarEstado()" class="primary" style="width:auto;padding:8px 16px;">Crear proyecto nuevo</button>' +
          '</div>';
        return;
      }

      var optsHtml = proyectos.map(function (p) {
        return '<option value="' + p.id + '">' + _esc(p.nombre) + (p.cliente_nombre ? " \u2014 " + _esc(p.cliente_nombre) : "") + '</option>';
      }).join("");

      modalContent.innerHTML =
        '<h2 style="margin:0 0 12px;">Vincular a proyecto existente</h2>' +
        '<label style="display:block;font-size:13px;font-weight:500;margin-bottom:4px;">Selecciona el proyecto:</label>' +
        '<select id="vincular-proyecto-select" style="width:100%;padding:8px 12px;border:1px solid var(--color-border);border-radius:6px;font-size:14px;">' + optsHtml + '</select>' +
        '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button type="button" onclick="document.getElementById(\'modal-crear-proyecto\').remove();_presupEstadoPendiente=null;presupEditar(' + presupId + ');" class="secondary" style="padding:8px 16px;">Cancelar</button>' +
          '<button type="button" onclick="presupConfirmarVinculacion()" class="primary" style="width:auto;padding:8px 16px;">Vincular</button>' +
        '</div>';
    } catch (_) {
      mostrarToast("Error al cargar proyectos", "error");
    }
  };

  window.presupConfirmarVinculacion = async function () {
    var presupId = _presupGetEditId();
    var proyectoId = parseInt((document.getElementById("vincular-proyecto-select") || {}).value);
    if (!presupId || !proyectoId) return;
    document.getElementById("modal-crear-proyecto")?.remove();

    try {
      var resCur = await fetch("/api/presupuestos/" + presupId);
      var presup = await resCur.json();

      await fetch("/api/presupuestos/" + presupId, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proyecto_id: proyectoId,
          nombre_proyecto: presup.nombre_proyecto,
          tercero_id: presup.tercero_id,
        }),
      });

      if (_presupEstadoPendiente) {
        await fetch("/api/presupuestos/" + presupId + "/estado", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: _presupEstadoPendiente }),
        });
      }

      mostrarToast("Presupuesto vinculado al proyecto", "success");
      _presupEstadoPendiente = null;
      presupEditar(presupId);
    } catch (_) {
      mostrarToast("Error al vincular", "error");
      _presupEstadoPendiente = null;
    }
  };

  window.presupIrAProyecto = function () {
    var badge = document.getElementById("presup-proyecto-badge");
    var proyId = badge ? badge.getAttribute("data-proyecto-id") : null;
    if (proyId) navegarAProyecto(parseInt(proyId));
  };

  // ── Selects ──

  function _presupCargarSelectTerceros(selectedId) {
    fetch("/api/crm/empresas?activo=1&limit=200&tipo=cliente")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var sel = document.getElementById("presup-tercero-id");
        sel.innerHTML = '<option value="">Seleccionar cliente...</option>';
        (data.empresas || []).forEach(function (e) {
          var opt = document.createElement("option");
          opt.value = e.tercero_id || e.id;
          opt.textContent = e.nombre || "Empresa " + e.id;
          sel.appendChild(opt);
        });
        if (selectedId) sel.value = String(selectedId);
        presupCheckCompletitud();
      });
  }

  function _presupCargarSelectOportunidades(selectedId) {
    fetch("/api/crm/oportunidades")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var sel = document.getElementById("presup-oportunidad-id");
        sel.innerHTML = '<option value="">Sin vincular</option>';
        (data.oportunidades || []).forEach(function (o) {
          if (o.estado !== "perdida") {
            var opt = document.createElement("option");
            opt.value = o.id;
            opt.textContent = o.nombre;
            sel.appendChild(opt);
          }
        });
        if (selectedId) sel.value = String(selectedId);
      });
  }

  function _presupCargarSelectPlantillas(selectedId) {
    fetch("/api/presupuestos/plantillas-tc")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var sel = document.getElementById("presup-plantilla-tc");
        sel.innerHTML = '<option value="">Sin plantilla</option>';
        (data.plantillas || []).forEach(function (p) {
          var opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.nombre;
          sel.appendChild(opt);
        });
        if (selectedId) sel.value = String(selectedId);
      });
  }

  // ── Completitud ──

  window.presupCheckCompletitud = function () {
    // Sección 1: Datos
    var nombre = (document.getElementById("presup-nombre-proyecto")?.value || "").trim();
    var tercero = document.getElementById("presup-tercero-id")?.value;
    var s1ok = !!(nombre && tercero);
    _presupSetStatus("datos", s1ok, s1ok ? "Completo" : "Pendiente");

    // Sección 2: Partidas principales
    var lineasP = document.querySelectorAll('.presup-linea-row[data-seccion="principal"]');
    var countP = 0;
    lineasP.forEach(function (row) {
      var titulo = (row.querySelector(".presup-l-titulo")?.value || "").trim();
      var cant = parseFloat(row.querySelector(".presup-l-cantidad")?.value) || 0;
      var precio = parseFloat(row.querySelector(".presup-l-precio")?.value) || 0;
      if (titulo && cant > 0 && precio > 0) countP++;
    });
    var s2ok = countP > 0;
    _presupSetStatus("principales", s2ok, s2ok ? countP + " partida" + (countP > 1 ? "s" : "") + " lista" + (countP > 1 ? "s" : "") : "Sin partidas");
    var emptyP = document.getElementById("presup-empty-principales");
    if (emptyP) emptyP.style.display = lineasP.length > 0 ? "none" : "block";

    // Sección 3: Adicionales (siempre OK)
    var lineasA = document.querySelectorAll('.presup-linea-row[data-seccion="adicionales"]');
    var countA = lineasA.length;
    _presupSetStatus("adicionales", true, countA > 0 ? countA + " adicional" + (countA > 1 ? "es" : "") : "Opcional");
    var emptyA = document.getElementById("presup-empty-adicionales");
    if (emptyA) emptyA.style.display = lineasA.length > 0 ? "none" : "block";

    // Sección 4: Condiciones
    var plantilla = document.getElementById("presup-plantilla-tc")?.value;
    var s4ok = !!plantilla;
    _presupSetStatus("condiciones", s4ok, s4ok ? "Completo" : "Sin plantilla T&C");

    // Botón PDF
    var btnPdf = document.getElementById("presup-btn-pdf");
    if (btnPdf) {
      var ready = s1ok && s2ok;
      btnPdf.disabled = !ready;
      btnPdf.style.opacity = ready ? "1" : "0.5";
      btnPdf.title = ready ? "" : "Completa los datos y añade al menos una partida";
    }
  };

  function _presupSetStatus(section, ok, label) {
    var container = document.getElementById("presup-status-" + section);
    if (!container) return;
    var dot = container.querySelector(".presup-status-dot");
    var text = container.querySelector(".presup-status-label");
    if (dot) {
      dot.classList.remove("presup-status-pending", "presup-status-ok");
      dot.classList.add(ok ? "presup-status-ok" : "presup-status-pending");
    }
    if (text) text.textContent = label;
  }

  // ── Textarea auto-resize ──

  window.presupAutoResizeTextarea = function (textarea) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.max(60, textarea.scrollHeight) + "px";
  };

  // ── Lineas ──

  window.presupAddLinea = function (seccion) {
    var container = document.getElementById("presup-lineas-" + seccion);
    var idx = container.children.length;
    var numSec = seccion === "principal" ? "01" : "02";
    var codigo = numSec + "." + String(idx + 1).padStart(2, "0");

    var div = document.createElement("div");
    div.className = "presup-linea-row";
    div.dataset.seccion = seccion;
    div.innerHTML =
      '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px;background:var(--color-white);margin-bottom:10px;">' +
        '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">' +
          '<input type="text" class="presup-l-codigo" value="' + codigo + '" placeholder="Cód." style="width:70px;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:13px;text-align:center;flex-shrink:0;box-sizing:border-box;">' +
          '<input type="text" class="presup-l-titulo" placeholder="Título de la partida" style="flex:1;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:14px;font-weight:500;box-sizing:border-box;min-width:0;">' +
          '<input type="text" class="presup-l-unidad" value="Ud" placeholder="Ud" style="width:50px;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:13px;text-align:center;flex-shrink:0;box-sizing:border-box;">' +
          '<button type="button" onclick="this.closest(\'.presup-linea-row\').remove();presupRecalcular();" style="background:none;border:none;cursor:pointer;color:var(--color-danger);font-size:18px;flex-shrink:0;width:28px;line-height:1;" title="Eliminar partida">\u00D7</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 280px;gap:16px;align-items:start;">' +
          '<textarea class="presup-l-descripcion" placeholder="Descripción detallada (aparecerá en el PDF)" rows="3" style="width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;resize:vertical;box-sizing:border-box;line-height:1.5;min-height:60px;"></textarea>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
              '<div>' +
                '<label style="font-size:11px;color:var(--color-text-secondary);display:block;margin-bottom:2px;">Cantidad</label>' +
                '<input type="number" class="presup-l-cantidad" placeholder="0" step="any" oninput="presupRecalcular()" style="width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:14px;text-align:right;box-sizing:border-box;">' +
              '</div>' +
              '<div>' +
                '<label style="font-size:11px;color:var(--color-text-secondary);display:block;margin-bottom:2px;">Precio (\u20AC)</label>' +
                '<div style="display:flex;align-items:center;gap:4px;">' +
                  '<input type="number" class="presup-l-precio" placeholder="0,00" step="any" oninput="presupRecalcular()" style="flex:1;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:14px;text-align:right;box-sizing:border-box;min-width:0;">' +
                  '<button type="button" onclick="presupToggleCalc(this)" title="Calculadora" style="background:none;border:none;cursor:pointer;font-size:14px;padding:0;flex-shrink:0;">&#x1F4CA;</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--color-bg-alt);border-radius:var(--radius-sm);">' +
              '<span style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Total</span>' +
              '<span class="presup-l-total" style="font-size:16px;font-weight:600;color:var(--color-text);">0,00 \u20AC</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    container.appendChild(div);
    div.querySelector(".presup-l-descripcion").addEventListener("input", function () { presupAutoResizeTextarea(this); });
    presupCheckCompletitud();
  };

  // ── Calculadora de pricing ──

  var _calcHTML =
    '<div class="presup-pricing-calc" style="display:none;padding:12px;margin:4px 0 8px;background:var(--color-bg-alt);border:1px dashed var(--color-border);border-radius:var(--radius-sm);">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<span style="font-size:12px;font-weight:600;color:var(--color-text-secondary);">Calculadora de pricing</span>' +
        '<select class="calc-modalidad" style="font-size:12px;padding:2px 8px;border:1px solid var(--color-border);border-radius:4px;background:var(--color-white);" onchange="presupCalcModalidad(this)">' +
          '<option value="produccion">Por produccion</option>' +
          '<option value="administracion">Por administracion</option>' +
        '</select>' +
        '<button type="button" onclick="this.closest(\'.presup-pricing-calc\').style.display=\'none\'" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--color-text-secondary);font-size:14px;">\u00D7</button>' +
      '</div>' +
      '<div class="calc-produccion" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Coste maquina/mes</label>' +
          '<input type="number" class="calc-coste-maquina" placeholder="26500" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecio(this)"></div>' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Coste ayudante/mes</label>' +
          '<input type="number" class="calc-coste-ayudante" placeholder="6000" value="0" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecio(this)"></div>' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Rendimiento/dia</label>' +
          '<input type="number" class="calc-rendimiento" placeholder="85" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecio(this)"></div>' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Margen (\u20AC)</label>' +
          '<input type="number" class="calc-margen" placeholder="4" value="0" step="0.5" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecio(this)"></div>' +
      '</div>' +
      '<div class="calc-administracion" style="display:none;grid-template-columns:repeat(3,1fr);gap:8px;">' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Coste maquina/mes</label>' +
          '<input type="number" class="calc-admin-maquina" placeholder="22000" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecioAdmin(this)"></div>' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Coste operador/mes</label>' +
          '<input type="number" class="calc-admin-operador" placeholder="0" value="0" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecioAdmin(this)"></div>' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Margen (\u20AC)</label>' +
          '<input type="number" class="calc-admin-margen" placeholder="2000" value="0" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecioAdmin(this)"></div>' +
      '</div>' +
      '<div style="margin-top:8px;display:flex;align-items:center;gap:12px;">' +
        '<span style="font-size:12px;color:var(--color-text-secondary);">Coste base: <strong class="calc-resultado-coste">\u2014</strong></span>' +
        '<span style="font-size:12px;color:var(--color-text-secondary);">Precio sugerido: <strong class="calc-resultado-precio" style="color:var(--color-primary);">\u2014</strong></span>' +
        '<button type="button" style="font-size:11px;padding:2px 10px;border:1px solid var(--color-border);border-radius:4px;background:var(--color-white);cursor:pointer;" onclick="presupCalcAplicar(this)">Aplicar \u2192</button>' +
      '</div>' +
    '</div>';

  window.presupToggleCalc = function (btn) {
    var row = btn.closest(".presup-linea-row");
    var calc = row.querySelector(".presup-pricing-calc");
    if (!calc) {
      var container = row.querySelector("div"); // outer wrapper div
      var wrapper = document.createElement("div");
      wrapper.innerHTML = _calcHTML;
      container.appendChild(wrapper.firstElementChild);
      calc = row.querySelector(".presup-pricing-calc");
    }
    calc.style.display = calc.style.display === "none" ? "block" : "none";
  };

  window.presupCalcModalidad = function (sel) {
    var calc = sel.closest(".presup-pricing-calc");
    var prod = calc.querySelector(".calc-produccion");
    var admin = calc.querySelector(".calc-administracion");
    if (sel.value === "produccion") {
      prod.style.display = "grid";
      admin.style.display = "none";
    } else {
      prod.style.display = "none";
      admin.style.display = "grid";
    }
  };

  window.presupCalcPrecio = function (input) {
    var calc = input.closest(".presup-pricing-calc");
    var costeMaq = parseFloat(calc.querySelector(".calc-coste-maquina").value) || 0;
    var costeAy = parseFloat(calc.querySelector(".calc-coste-ayudante").value) || 0;
    var rend = parseFloat(calc.querySelector(".calc-rendimiento").value) || 1;
    var margen = parseFloat(calc.querySelector(".calc-margen").value) || 0;
    var dias = 20;
    var costeBase = (costeMaq + costeAy) / (rend * dias);
    var precioSugerido = costeBase + margen;
    calc.querySelector(".calc-resultado-coste").textContent = costeBase.toFixed(2) + " \u20AC";
    calc.querySelector(".calc-resultado-precio").textContent = precioSugerido.toFixed(2) + " \u20AC";
  };

  window.presupCalcPrecioAdmin = function (input) {
    var calc = input.closest(".presup-pricing-calc");
    var maq = parseFloat(calc.querySelector(".calc-admin-maquina").value) || 0;
    var oper = parseFloat(calc.querySelector(".calc-admin-operador").value) || 0;
    var margen = parseFloat(calc.querySelector(".calc-admin-margen").value) || 0;
    var costeBase = maq + oper;
    var precioSugerido = costeBase + margen;
    calc.querySelector(".calc-resultado-coste").textContent = costeBase.toLocaleString("es-ES") + " \u20AC";
    calc.querySelector(".calc-resultado-precio").textContent = precioSugerido.toLocaleString("es-ES") + " \u20AC";
  };

  window.presupCalcAplicar = function (btn) {
    var calc = btn.closest(".presup-pricing-calc");
    var row = calc.closest(".presup-linea-row");
    var precioText = calc.querySelector(".calc-resultado-precio").textContent;
    var precio = parseFloat(precioText.replace(/[^\d,.\-]/g, "").replace(",", "."));
    if (!isNaN(precio) && precio > 0) {
      row.querySelector(".presup-l-precio").value = precio.toFixed(2);
      presupRecalcular();
      calc.style.display = "none";
    }
  };

  window.presupRecalcular = function () {
    var totalPrincipal = 0;
    document.querySelectorAll(".presup-linea-row").forEach(function (row) {
      var cant = parseFloat(row.querySelector(".presup-l-cantidad")?.value) || 0;
      var precio = parseFloat(row.querySelector(".presup-l-precio")?.value) || 0;
      var total = cant * precio;
      row.querySelector(".presup-l-total").textContent = total.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
      if (row.dataset.seccion === "principal") totalPrincipal += total;
    });
    document.getElementById("presup-total").textContent = totalPrincipal.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
    presupCheckCompletitud();
  };

  function _presupRecogerLineas() {
    var lineas = [];
    var orden = 0;
    document.querySelectorAll(".presup-linea-row").forEach(function (row) {
      lineas.push({
        seccion: row.dataset.seccion,
        codigo: (row.querySelector(".presup-l-codigo")?.value || "").trim(),
        titulo: (row.querySelector(".presup-l-titulo")?.value || "").trim(),
        descripcion: (row.querySelector(".presup-l-descripcion")?.value || "").trim(),
        unidad: (row.querySelector(".presup-l-unidad")?.value || "Ud").trim(),
        cantidad: parseFloat(row.querySelector(".presup-l-cantidad")?.value) || 0,
        precio_unitario: parseFloat(row.querySelector(".presup-l-precio")?.value) || 0,
        orden: orden++,
      });
    });
    return lineas;
  }

  function _presupRenderLineas(lineas) {
    document.getElementById("presup-lineas-principal").innerHTML = "";
    document.getElementById("presup-lineas-adicionales").innerHTML = "";
    for (var i = 0; i < lineas.length; i++) {
      var l = lineas[i];
      var sec = l.seccion || "principal";
      presupAddLinea(sec);
      var rows = document.querySelectorAll('.presup-linea-row[data-seccion="' + sec + '"]');
      var row = rows[rows.length - 1];
      if (!row) continue;
      row.querySelector(".presup-l-codigo").value = l.codigo || "";
      row.querySelector(".presup-l-titulo").value = l.titulo || "";
      var descField = row.querySelector(".presup-l-descripcion");
      descField.value = l.descripcion || "";
      presupAutoResizeTextarea(descField);
      row.querySelector(".presup-l-unidad").value = l.unidad || "Ud";
      row.querySelector(".presup-l-cantidad").value = l.cantidad || "";
      row.querySelector(".presup-l-precio").value = l.precio_unitario || "";
    }
    presupRecalcular();
  }

  // ── Guardar ──

  window.presupGuardarBorrador = function () {
    var nombre = document.getElementById("presup-nombre-proyecto").value.trim();
    var terceroId = parseInt(document.getElementById("presup-tercero-id").value) || null;
    if (!nombre || !terceroId) {
      mostrarToast("Nombre del proyecto y cliente son obligatorios.", "error");
      return;
    }
    var body = {
      nombre_proyecto: nombre,
      tercero_id: terceroId,
      nombre_cliente_display: document.getElementById("presup-nombre-cliente-display").value.trim(),
      oportunidad_id: parseInt(document.getElementById("presup-oportunidad-id").value) || null,
    };
    var presupId = document.getElementById("presup-edit-id").value;

    if (!presupId) {
      // Crear nuevo
      body.empresa_id = "hincado_directo"; // TODO: multi-empresa
      fetch("/api/presupuestos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { mostrarToast(data.error, "error"); return; }
          document.getElementById("presup-edit-id").value = data.id;
          var v = data.versiones && data.versiones[0];
          if (v) document.getElementById("presup-version-id").value = v.id;
          document.getElementById("presup-form-titulo").textContent = "Editar " + data.referencia;
          _guardarLineasYVersion();
          mostrarToast("Presupuesto creado: " + data.referencia, "success");
        });
    } else {
      // Actualizar cabecera
      fetch("/api/presupuestos/" + presupId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { mostrarToast(data.error, "error"); return; }
          _guardarLineasYVersion();
          mostrarToast("Presupuesto guardado.", "success");
        });
    }
  };

  function _guardarLineasYVersion() {
    var versionId = document.getElementById("presup-version-id").value;
    if (!versionId) return;

    // Guardar lineas
    var lineas = _presupRecogerLineas();
    fetch("/api/presupuestos/versiones/" + versionId + "/lineas", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineas: lineas }),
    });

    // Guardar datos de version
    var vData = {
      forma_pago: document.getElementById("presup-forma-pago").value.trim(),
      notas_capacidad: document.getElementById("presup-notas-capacidad").value.trim(),
      validez_dias: parseInt(document.getElementById("presup-validez").value) || 30,
      plantilla_tc_id: parseInt(document.getElementById("presup-plantilla-tc").value) || null,
    };
    fetch("/api/presupuestos/versiones/" + versionId, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vData),
    });
  }

  window.presupGenerarPDF = function () {
    var versionId = document.getElementById("presup-version-id").value;
    if (!versionId) {
      mostrarToast("Guarda el presupuesto primero.", "error");
      return;
    }
    // Guardar antes de generar
    var nombre = document.getElementById("presup-nombre-proyecto").value.trim();
    var terceroId = parseInt(document.getElementById("presup-tercero-id").value) || null;
    if (!nombre || !terceroId) {
      mostrarToast("Nombre del proyecto y cliente son obligatorios.", "error");
      return;
    }
    // Guardar lineas y version, luego abrir PDF
    _guardarLineasYVersion();
    setTimeout(function () {
      window.open("/api/presupuestos/versiones/" + versionId + "/pdf", "_blank");
    }, 500);
  };

  // ── Plantillas T&C ──

  window.presupCargarPlantillas = function () {
    fetch("/api/presupuestos/plantillas-tc")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var container = document.getElementById("plantillas-tc-container");
        var plantillas = data.plantillas || [];
        if (!plantillas.length) {
          container.innerHTML = '<p style="text-align:center;color:var(--color-text-secondary);padding:40px;">No hay plantillas.</p>';
          return;
        }
        var html = '<div style="display:grid;gap:12px;">';
        plantillas.forEach(function (p) {
          html += '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
              '<h3 style="font-size:15px;font-weight:600;margin:0;">' + _esc(p.nombre) + '</h3>' +
              '<span style="font-size:12px;color:var(--color-text-secondary);">' + _esc(p.tipo) + '</span>' +
            '</div>' +
            '<p style="font-size:13px;color:var(--color-text);margin:0 0 8px;">' + _esc((p.contenido || "").substring(0, 200)) + (p.contenido && p.contenido.length > 200 ? "..." : "") + '</p>' +
            (p.exclusiones ? '<details><summary style="font-size:12px;color:var(--color-text-secondary);cursor:pointer;">Exclusiones</summary><p style="font-size:12px;color:var(--color-text-secondary);white-space:pre-line;margin:8px 0 0;">' + _esc(p.exclusiones) + '</p></details>' : '') +
          '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
      });
  };

  window.presupNuevaPlantilla = function () {
    mostrarToast("Editor de plantillas pendiente de implementar.", "error");
  };

  var btnNuevaPlantilla = document.getElementById("btn-presup-nueva-plantilla");
  if (btnNuevaPlantilla) btnNuevaPlantilla.addEventListener("click", presupNuevaPlantilla);

  // ── Catálogo de partidas predefinidas ──

  var _catalogoCache = null;
  var _catalogoAdminFilter = "";

  async function _catalogoFetch() {
    var res = await fetch("/api/presupuestos/catalogo");
    var data = await res.json();
    _catalogoCache = data.catalogo || [];
    return _catalogoCache;
  }

  // -- Picker en formulario de presupuesto --

  window.presupToggleCatalogPicker = async function (seccion) {
    var picker = document.getElementById("presup-catalogo-picker-" + seccion);
    if (!picker) return;
    if (picker.style.display !== "none") {
      picker.style.display = "none";
      return;
    }
    var catalogo = _catalogoCache || await _catalogoFetch();
    var filtered = catalogo.filter(function (c) { return c.seccion === seccion; });
    _presupRenderCatalogoItems(picker, filtered, "", seccion);
    picker.style.display = "block";
  };

  function _presupRenderCatalogoItems(picker, items, filterCat, seccion) {
    var container = picker.querySelector(".presup-catalogo-items");
    var filtered = filterCat ? items.filter(function (i) { return i.categoria === filterCat; }) : items;
    if (!filtered.length) {
      container.innerHTML = '<p style="padding:12px;text-align:center;color:var(--color-text-secondary);font-size:13px;">Sin partidas en esta categoría</p>';
      return;
    }
    container.innerHTML = filtered.map(function (item) {
      var desc = (item.descripcion || "").split("\n")[0];
      var dataAttr = _esc(JSON.stringify(item));
      return '<div style="display:flex;justify-content:space-between;align-items:start;padding:8px 12px;border-bottom:1px solid var(--color-border);cursor:pointer;transition:background 0.1s;" ' +
        'onmouseover="this.style.background=\'var(--color-bg-alt)\'" onmouseout="this.style.background=\'\'" ' +
        'data-catalogo-item="' + dataAttr + '" data-seccion="' + seccion + '">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;font-weight:500;color:var(--color-text);">' + _esc(item.titulo) + '</div>' +
          '<div style="font-size:11px;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;">' + _esc(desc) + '</div>' +
        '</div>' +
        '<span style="font-size:11px;color:var(--color-primary);margin-left:8px;white-space:nowrap;">+ Añadir</span>' +
      '</div>';
    }).join("");
  }

  // Click en item del picker
  document.addEventListener("click", function (e) {
    var itemEl = e.target.closest("[data-catalogo-item]");
    if (!itemEl) return;
    var picker = itemEl.closest(".presup-catalogo-picker");
    if (!picker) return;
    var item;
    try { item = JSON.parse(itemEl.getAttribute("data-catalogo-item")); } catch (_) { return; }
    var seccion = itemEl.getAttribute("data-seccion") || "principal";

    presupAddLinea(seccion);
    var rows = document.querySelectorAll('.presup-linea-row[data-seccion="' + seccion + '"]');
    var row = rows[rows.length - 1];
    if (!row) return;

    row.querySelector(".presup-l-codigo").value = item.codigo_default || "";
    row.querySelector(".presup-l-titulo").value = item.titulo || "";
    var descEl = row.querySelector(".presup-l-descripcion");
    descEl.value = item.descripcion || "";
    presupAutoResizeTextarea(descEl);
    row.querySelector(".presup-l-unidad").value = item.unidad || "Ud";
    // rendimiento: pre-fill the pricing calc if available
    if (item.rendimiento_orientativo) {
      var calcRendInput = row.querySelector(".calc-rendimiento");
      if (calcRendInput) calcRendInput.value = item.rendimiento_orientativo;
    }

    picker.style.display = "none";
    presupRecalcular();
  });

  // Filtro por categoría en picker
  document.addEventListener("click", function (e) {
    if (!e.target.classList.contains("presup-cat-filter")) return;
    var picker = e.target.closest(".presup-catalogo-picker");
    if (!picker) return;
    picker.querySelectorAll(".presup-cat-filter").forEach(function (b) {
      b.classList.remove("active");
      b.style.background = "var(--color-white)";
    });
    e.target.classList.add("active");
    e.target.style.background = "var(--color-bg-alt)";
    var cat = e.target.dataset.cat || "";
    var seccion = picker.id.replace("presup-catalogo-picker-", "");
    var catalogo = (_catalogoCache || []).filter(function (c) { return c.seccion === seccion; });
    _presupRenderCatalogoItems(picker, catalogo, cat, seccion);
  });

  // -- Panel administración del catálogo --

  window.presupCargarCatalogo = async function () {
    var catalogo = await _catalogoFetch();
    _catalogoRenderAdmin(catalogo, _catalogoAdminFilter);
  };

  function _catalogoRenderAdmin(catalogo, filterCat) {
    var tbody = document.getElementById("tbody-catalogo-partidas");
    if (!tbody) return;
    var items = filterCat ? catalogo.filter(function (i) { return i.categoria === filterCat; }) : catalogo;
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="sin-datos">No hay partidas' + (filterCat ? ' en esta categoría' : '') + '.</td></tr>';
      return;
    }
    var html = "";
    items.forEach(function (item) {
      var catLabel = { hincado: "Hincado", perforado: "Perforado", transporte: "Transporte", parada: "Parada", otro: "Otro" }[item.categoria] || item.categoria;
      var secLabel = item.seccion === "principal" ? "Principal" : "Adicionales";
      html += "<tr>" +
        "<td>" + _esc(item.codigo_default || "—") + "</td>" +
        "<td>" + _esc(item.titulo) + "</td>" +
        "<td>" + catLabel + "</td>" +
        "<td>" + secLabel + "</td>" +
        "<td>" + _esc(item.unidad || "Ud") + "</td>" +
        '<td><button type="button" class="btn-small catalogo-btn-editar" data-id="' + item.id + '">Editar</button> ' +
        '<button type="button" class="btn-small catalogo-btn-eliminar" data-id="' + item.id + '" style="color:var(--color-danger);">Eliminar</button></td>' +
      "</tr>";
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll(".catalogo-btn-editar").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = parseInt(btn.getAttribute("data-id"), 10);
        var item = (_catalogoCache || []).find(function (i) { return i.id === id; });
        if (item) _catalogoAbrirModal(item);
      });
    });
    tbody.querySelectorAll(".catalogo-btn-eliminar").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = parseInt(btn.getAttribute("data-id"), 10);
        if (!confirm("¿Eliminar esta partida del catálogo?")) return;
        fetch("/api/presupuestos/catalogo/" + id, { method: "DELETE" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) { mostrarToast(data.error, "error"); return; }
            _catalogoCache = null;
            presupCargarCatalogo();
            mostrarToast("Partida eliminada.", "success");
          });
      });
    });
  }

  // Filtro admin
  document.querySelectorAll(".presup-cat-admin-filter").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".presup-cat-admin-filter").forEach(function (b) {
        b.classList.remove("active");
        b.style.background = "var(--color-white)";
      });
      btn.classList.add("active");
      btn.style.background = "var(--color-bg-alt)";
      _catalogoAdminFilter = btn.dataset.cat || "";
      _catalogoRenderAdmin(_catalogoCache || [], _catalogoAdminFilter);
    });
  });

  // Modal crear/editar
  var _catalogoEditId = null;
  var modalCatalogoOverlay = document.getElementById("modal-catalogo-overlay");

  function _catalogoAbrirModal(item) {
    if (!modalCatalogoOverlay) return;
    var titulo = document.getElementById("modal-catalogo-titulo");
    var btnGuardar = document.getElementById("btn-catalogo-guardar");
    var status = document.getElementById("catalogo-status");
    if (status) { status.textContent = ""; status.style.color = ""; }

    if (item) {
      _catalogoEditId = item.id;
      if (titulo) titulo.textContent = "Editar partida";
      if (btnGuardar) btnGuardar.textContent = "Guardar cambios";
      document.getElementById("catalogo-edit-id").value = item.id;
      document.getElementById("catalogo-seccion").value = item.seccion || "principal";
      document.getElementById("catalogo-categoria").value = item.categoria || "hincado";
      document.getElementById("catalogo-codigo").value = item.codigo_default || "";
      document.getElementById("catalogo-titulo").value = item.titulo || "";
      document.getElementById("catalogo-descripcion").value = item.descripcion || "";
      document.getElementById("catalogo-unidad").value = item.unidad || "Ud";
      document.getElementById("catalogo-rendimiento").value = item.rendimiento_orientativo || "";
      document.getElementById("catalogo-precio").value = item.precio_orientativo || "";
    } else {
      _catalogoEditId = null;
      if (titulo) titulo.textContent = "Nueva partida";
      if (btnGuardar) btnGuardar.textContent = "Guardar partida";
      document.getElementById("catalogo-edit-id").value = "";
      document.getElementById("form-catalogo-partida").reset();
      document.getElementById("catalogo-unidad").value = "Ud";
    }
    modalCatalogoOverlay.classList.add("visible");
    modalCatalogoOverlay.setAttribute("aria-hidden", "false");
  }

  function _catalogoCerrarModal() {
    if (!modalCatalogoOverlay) return;
    _catalogoEditId = null;
    modalCatalogoOverlay.classList.remove("visible");
    modalCatalogoOverlay.setAttribute("aria-hidden", "true");
  }

  var btnNuevaPartida = document.getElementById("btn-catalogo-nueva-partida");
  if (btnNuevaPartida) btnNuevaPartida.addEventListener("click", function () { _catalogoAbrirModal(null); });

  var btnCerrarCatalogo = document.getElementById("btn-cerrar-modal-catalogo");
  if (btnCerrarCatalogo) btnCerrarCatalogo.addEventListener("click", _catalogoCerrarModal);

  if (modalCatalogoOverlay) {
    modalCatalogoOverlay.addEventListener("click", function (e) {
      if (e.target === modalCatalogoOverlay) _catalogoCerrarModal();
    });
  }

  var formCatalogo = document.getElementById("form-catalogo-partida");
  if (formCatalogo) {
    formCatalogo.addEventListener("submit", function (e) {
      e.preventDefault();
      var tituloVal = (document.getElementById("catalogo-titulo").value || "").trim();
      if (!tituloVal) {
        mostrarToast("El título es obligatorio.", "error");
        return;
      }
      var payload = {
        seccion: document.getElementById("catalogo-seccion").value,
        categoria: document.getElementById("catalogo-categoria").value,
        codigo_default: document.getElementById("catalogo-codigo").value.trim() || null,
        titulo: tituloVal,
        descripcion: document.getElementById("catalogo-descripcion").value.trim() || null,
        unidad: document.getElementById("catalogo-unidad").value.trim() || "Ud",
        rendimiento_orientativo: parseInt(document.getElementById("catalogo-rendimiento").value) || null,
        precio_orientativo: parseFloat(document.getElementById("catalogo-precio").value) || null,
      };
      var url = _catalogoEditId ? "/api/presupuestos/catalogo/" + _catalogoEditId : "/api/presupuestos/catalogo";
      var method = _catalogoEditId ? "PUT" : "POST";
      var btnG = document.getElementById("btn-catalogo-guardar");
      if (btnG) btnG.disabled = true;

      fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { mostrarToast(data.error, "error"); return; }
          _catalogoCache = null;
          presupCargarCatalogo();
          _catalogoCerrarModal();
          mostrarToast(_catalogoEditId ? "Partida actualizada." : "Partida creada.", "success");
        })
        .catch(function () { mostrarToast("Error al guardar.", "error"); })
        .finally(function () { if (btnG) btnG.disabled = false; });
    });
  }

})();

// ═══ Certificaciones ═══════════════════════════════════════════════════════

window.certNueva = function(proyectoId) {
  var now = new Date();
  var primerDiaMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var ultimoDiaMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0);
  var fDesde = primerDiaMesAnterior.toISOString().substring(0, 10);
  var fHasta = ultimoDiaMesAnterior.toISOString().substring(0, 10);

  var modal = document.createElement('div');
  modal.className = 'modal-overlay visible';
  modal.id = 'modal-nueva-cert';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:550px;">' +
      '<h2 style="margin:0 0 16px;">Nueva certificaci\u00f3n</h2>' +
      '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:16px;overflow:hidden;">' +
        '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:8px;">' +
          '<div style="width:4px;height:20px;border-radius:2px;background:#7C3AED;"></div>' +
          '<span style="font-size:14px;font-weight:600;">Periodo</span>' +
        '</div>' +
        '<div style="padding:16px;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div><label class="form-label" style="font-size:12px;">Desde</label><input type="date" id="cert-fecha-desde" class="form-input" value="' + fDesde + '"></div>' +
            '<div><label class="form-label" style="font-size:12px;">Hasta</label><input type="date" id="cert-fecha-hasta" class="form-input" value="' + fHasta + '"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:16px;overflow:hidden;">' +
        '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:8px;">' +
          '<div style="width:4px;height:20px;border-radius:2px;background:#CA8A04;"></div>' +
          '<span style="font-size:14px;font-weight:600;">Precios unitarios</span>' +
        '</div>' +
        '<div style="padding:16px;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
            '<div><label class="form-label" style="font-size:12px;">Precio por hinca (\u20ac)</label><input type="number" id="cert-precio-hinca" class="form-input" step="any" value="0" placeholder="15.00"></div>' +
            '<div><label class="form-label" style="font-size:12px;">Precio por hora admin (\u20ac)</label><input type="number" id="cert-precio-hora" class="form-input" step="any" value="0" placeholder="250.00"></div>' +
          '</div>' +
          '<div><label class="form-label" style="font-size:12px;">Transporte (\u20ac, opcional)</label><input type="number" id="cert-transporte" class="form-input" step="any" value="0" placeholder="0"></div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button class="btn-outline" onclick="document.getElementById(\'modal-nueva-cert\').remove()">Cancelar</button>' +
        '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="certGenerar(' + proyectoId + ')">Generar certificaci\u00f3n</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
};

window.certGenerar = function(proyectoId) {
  var data = {
    fecha_desde: document.getElementById('cert-fecha-desde') ? document.getElementById('cert-fecha-desde').value : '',
    fecha_hasta: document.getElementById('cert-fecha-hasta') ? document.getElementById('cert-fecha-hasta').value : '',
    precio_hinca: document.getElementById('cert-precio-hinca') ? document.getElementById('cert-precio-hinca').value : 0,
    precio_hora_admin: document.getElementById('cert-precio-hora') ? document.getElementById('cert-precio-hora').value : 0,
    importe_transporte: document.getElementById('cert-transporte') ? document.getElementById('cert-transporte').value : 0
  };

  if (!data.fecha_desde || !data.fecha_hasta) {
    mostrarToast('Selecciona las fechas', 'error');
    return;
  }

  fetch('/api/proyectos/' + proyectoId + '/certificaciones', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  }).then(function(res) {
    if (res.ok) {
      var m = document.getElementById('modal-nueva-cert');
      if (m) m.remove();
      res.json().then(function(cert) {
        mostrarToast('Certificaci\u00f3n #' + cert.numero + ' generada: ' + (cert.total_hincas || 0) + ' hincas, ' + (cert.importe_total || 0).toFixed(2) + ' \u20ac', 'success');
        proyectoDashboard(proyectoId);
      });
    } else {
      res.json().then(function(err) {
        mostrarToast(err.error || 'Error al generar', 'error');
      });
    }
  }).catch(function() {
    mostrarToast('Error de conexi\u00f3n', 'error');
  });
};

window.certVer = function(certId, proyectoId) {
  fetch('/api/certificaciones/' + certId)
    .then(function(r) { return r.json(); })
    .then(function(cert) {
      if (cert.error) { mostrarToast(cert.error, 'error'); return; }
      var detRows = (cert.detalle || []).map(function(d) {
        return '<tr style="border-bottom:1px solid var(--color-border);">' +
          '<td style="padding:6px 8px;">' + (d.fecha || '').substring(0,10) + '</td>' +
          '<td style="padding:6px 8px;">' + (d.descripcion || '\u2014') + '</td>' +
          '<td style="padding:6px 8px;text-align:right;font-weight:500;">' + (d.hincas || 0) + '</td>' +
          '<td style="padding:6px 8px;text-align:right;">' + (d.horas_admin || 0) + '</td>' +
        '</tr>';
      }).join('');

      var modal = document.createElement('div');
      modal.className = 'modal-overlay visible';
      modal.id = 'modal-ver-cert';
      modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
      modal.innerHTML =
        '<div class="modal-content" style="max-width:700px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
            '<h2 style="margin:0;">Certificaci\u00f3n #' + cert.numero + '</h2>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
              '<span class="status-badge status-badge--' + (cert.estado === 'aprobada' ? 'adjudicada' : cert.estado === 'enviada' ? 'enviada' : 'borrador') + '">' + cert.estado + '</span>' +
              (cert.estado === 'borrador' ? '<button class="btn-outline" style="font-size:12px;padding:4px 12px;" onclick="certCambiarEstado(' + certId + ',\'enviada\',' + proyectoId + ')">Marcar enviada</button>' : '') +
              (cert.estado === 'enviada' ? '<button class="btn-outline" style="font-size:12px;padding:4px 12px;" onclick="certCambiarEstado(' + certId + ',\'aprobada\',' + proyectoId + ')">Marcar aprobada</button>' : '') +
            '</div>' +
          '</div>' +
          '<div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:16px;">Periodo: ' + (cert.fecha_desde || '').substring(0,10) + ' \u2192 ' + (cert.fecha_hasta || '').substring(0,10) + '</div>' +

          '<div style="max-height:300px;overflow-y:auto;margin-bottom:16px;">' +
            '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
              '<thead><tr style="border-bottom:2px solid var(--color-border);position:sticky;top:0;background:var(--color-white);">' +
                '<th style="text-align:left;padding:6px 8px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Fecha</th>' +
                '<th style="text-align:left;padding:6px 8px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Descripci\u00f3n</th>' +
                '<th style="text-align:right;padding:6px 8px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Hincas</th>' +
                '<th style="text-align:right;padding:6px 8px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">H. Admin</th>' +
              '</tr></thead>' +
              '<tbody>' + detRows + '</tbody>' +
            '</table>' +
          '</div>' +

          '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px;background:var(--color-bg-page);">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">' +
              '<div><div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Producci\u00f3n</div><div style="font-size:16px;font-weight:600;">' + (cert.total_hincas || 0) + ' hincas \u00d7 ' + (cert.precio_hinca || 0).toFixed(2) + ' \u20ac</div><div style="font-size:14px;color:var(--color-primary);font-weight:500;">' + (cert.importe_produccion || 0).toFixed(2) + ' \u20ac</div></div>' +
              '<div><div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Administraci\u00f3n</div><div style="font-size:16px;font-weight:600;">' + (cert.total_horas_admin || 0) + 'h \u00d7 ' + (cert.precio_hora_admin || 0).toFixed(2) + ' \u20ac</div><div style="font-size:14px;color:var(--color-primary);font-weight:500;">' + (cert.importe_administracion || 0).toFixed(2) + ' \u20ac</div></div>' +
              '<div><div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Transporte</div><div style="font-size:16px;font-weight:600;">\u2014</div><div style="font-size:14px;color:var(--color-primary);font-weight:500;">' + (cert.importe_transporte || 0).toFixed(2) + ' \u20ac</div></div>' +
            '</div>' +
            '<div style="border-top:2px solid var(--color-border);padding-top:12px;display:flex;justify-content:space-between;align-items:center;">' +
              '<span style="font-size:16px;font-weight:700;">TOTAL CERTIFICACI\u00d3N</span>' +
              '<span style="font-size:22px;font-weight:700;color:var(--color-primary);">' + (cert.importe_total || 0).toFixed(2) + ' \u20ac</span>' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
            '<button class="btn-outline" style="padding:8px 16px;color:var(--color-danger);border-color:var(--color-danger);" onclick="certEliminar(' + certId + ',' + proyectoId + ')">Eliminar</button>' +
            '<button class="btn-primary" style="width:auto;padding:8px 16px;" onclick="window.open(\'/api/certificaciones/' + certId + '/pdf\', \'_blank\')">Descargar PDF</button>' +
            '<button class="btn-outline" onclick="document.getElementById(\'modal-ver-cert\').remove()">Cerrar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    });
};

window.certCambiarEstado = function(certId, nuevoEstado, proyectoId) {
  fetch('/api/certificaciones/' + certId + '/estado', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({estado: nuevoEstado})
  }).then(function(res) {
    if (res.ok) {
      var m = document.getElementById('modal-ver-cert');
      if (m) m.remove();
      mostrarToast('Estado actualizado a ' + nuevoEstado, 'success');
      proyectoDashboard(proyectoId);
    }
  });
};

window.certEliminar = function(certId, proyectoId) {
  if (!confirm('¿Eliminar esta certificación? Esta acción no se puede deshacer.')) return;
  fetch('/api/certificaciones/' + certId, { method: 'DELETE' })
    .then(function(res) {
      if (res.ok) {
        var m = document.getElementById('modal-ver-cert');
        if (m) m.remove();
        mostrarToast('Certificación eliminada', 'success');
        proyectoDashboard(proyectoId);
      } else {
        mostrarToast('Error al eliminar', 'error');
      }
    });
};

// ═══ Usuarios ═════════════════════════════════════════════════════════════

(function () {
  function _iniciales(nombre) {
    if (!nombre) return "??";
    var partes = nombre.trim().split(/\s+/);
    if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
    return nombre.substring(0, 2).toUpperCase();
  }

  // Cargar info del usuario logueado al iniciar
  fetch("/api/usuarios/me")
    .then(function (r) { return r.json(); })
    .then(function (u) {
      var nameEl = document.getElementById("sidebar-username");
      var avatarEl = document.getElementById("sidebar-avatar");
      var rolEl = document.getElementById("sidebar-user-rol");
      if (nameEl) nameEl.textContent = u.nombre || u.username || "Usuario";
      if (avatarEl) avatarEl.textContent = _iniciales(u.nombre || u.username);
      if (rolEl) rolEl.textContent = u.rol || "";
      // Mostrar link Usuarios solo para admin
      var grpUsuarios = document.getElementById("sidebar-group-usuarios");
      if (grpUsuarios) grpUsuarios.style.display = u.rol === "admin" ? "" : "none";
    })
    .catch(function () {});
})();

function cargarUsuarios() {
  var container = document.getElementById("usuarios-content");
  if (!container) return;

  fetch("/api/usuarios")
    .then(function (r) {
      if (r.status === 403) {
        container.innerHTML = '<p style="color:var(--color-danger);padding:40px;text-align:center;">No tienes permisos para gestionar usuarios.</p>';
        return null;
      }
      return r.json();
    })
    .then(function (data) {
      if (!data) return;
      var usuarios = data.usuarios || [];
      var rolColors = { admin: "#DC2626", operador: "#2563EB", solo_lectura: "#64748B" };

      var filas = usuarios.map(function (u) {
        var rc = rolColors[u.rol] || "#64748B";
        return '<tr style="border-bottom:1px solid var(--color-border);">' +
          '<td style="padding:10px 14px;font-weight:500;">' + _esc(u.username) + '</td>' +
          '<td style="padding:10px 14px;">' + _esc(u.nombre) + '</td>' +
          '<td style="padding:10px 14px;text-align:center;"><span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + rc + '15;color:' + rc + ';font-weight:500;">' + _esc(u.rol) + '</span></td>' +
          '<td style="padding:10px 14px;text-align:center;"><span style="width:8px;height:8px;border-radius:50%;display:inline-block;background:' + (u.activo ? '#16A34A' : '#DC2626') + ';"></span> ' + (u.activo ? 'Activo' : 'Inactivo') + '</td>' +
          '<td style="padding:10px 14px;font-size:12px;color:var(--color-text-secondary);">' + (u.ultimo_login ? u.ultimo_login.substring(0, 16).replace('T', ' ') : 'Nunca') + '</td>' +
          '<td style="padding:10px 14px;text-align:center;"><button onclick="usuarioEditarModal(' + u.id + ')" class="btn-outline" style="font-size:12px;padding:3px 10px;">Editar</button></td>' +
        '</tr>';
      }).join('');

      container.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
          '<h1 style="margin:0;font-size:22px;">Gesti\u00f3n de usuarios</h1>' +
          '<button class="btn-primary" style="width:auto;padding:8px 16px;" onclick="usuarioNuevoModal()">+ Nuevo usuario</button>' +
        '</div>' +
        '<table style="width:100%;font-size:13px;border-collapse:collapse;background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">' +
          '<thead><tr style="background:var(--color-bg-page);">' +
            '<th style="text-align:left;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Usuario</th>' +
            '<th style="text-align:left;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Nombre</th>' +
            '<th style="text-align:center;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Rol</th>' +
            '<th style="text-align:center;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Estado</th>' +
            '<th style="text-align:left;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">\u00DAltimo login</th>' +
            '<th style="text-align:center;padding:10px 14px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Acciones</th>' +
          '</tr></thead>' +
          '<tbody>' + filas + '</tbody>' +
        '</table>';
    });
}

window.usuarioNuevoModal = function () {
  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-usuario";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:450px;">' +
      '<h2 style="margin:0 0 16px;">Nuevo usuario</h2>' +
      '<div style="display:grid;gap:12px;">' +
        '<div><label class="form-label">Nombre de usuario *</label><input type="text" id="usr-username" class="form-input" placeholder="ej: jromero"></div>' +
        '<div><label class="form-label">Nombre completo</label><input type="text" id="usr-nombre" class="form-input" placeholder="Javier Romero"></div>' +
        '<div><label class="form-label">Email (opcional)</label><input type="email" id="usr-email" class="form-input" placeholder="javier@hincadodirecto.com"></div>' +
        '<div><label class="form-label">Rol</label><select id="usr-rol" class="form-input"><option value="admin">Admin \u2014 acceso total</option><option value="operador" selected>Operador \u2014 partes y maquinaria</option><option value="solo_lectura">Solo lectura \u2014 ver sin modificar</option></select></div>' +
        '<div><label class="form-label">Contrase\u00f1a *</label><input type="password" id="usr-password" class="form-input" placeholder="M\u00ednimo 4 caracteres"></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="btn-outline" onclick="document.getElementById(\'modal-usuario\').remove()">Cancelar</button>' +
        '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="usuarioGuardar()">Crear usuario</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
};

window.usuarioGuardar = function () {
  var data = {
    username: (document.getElementById("usr-username") || {}).value || "",
    nombre: (document.getElementById("usr-nombre") || {}).value || "",
    email: (document.getElementById("usr-email") || {}).value || "",
    rol: (document.getElementById("usr-rol") || {}).value || "operador",
    password: (document.getElementById("usr-password") || {}).value || ""
  };
  data.username = data.username.trim();
  data.nombre = data.nombre.trim() || data.username;
  if (!data.username || !data.password) {
    mostrarToast("Usuario y contrase\u00f1a son obligatorios", "error");
    return;
  }
  fetch("/api/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-usuario");
      if (m) m.remove();
      mostrarToast("Usuario creado", "success");
      cargarUsuarios();
    } else {
      res.json().then(function (err) { mostrarToast(err.error || "Error", "error"); });
    }
  });
};

window.usuarioEditarModal = function (userId) {
  fetch("/api/usuarios")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var u = (data.usuarios || []).find(function (x) { return x.id === userId; });
      if (!u) return;

      var modal = document.createElement("div");
      modal.className = "modal-overlay visible";
      modal.id = "modal-usuario";
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      modal.innerHTML =
        '<div class="modal-content" style="max-width:450px;">' +
          '<h2 style="margin:0 0 16px;">Editar usuario: ' + _esc(u.username) + '</h2>' +
          '<div style="display:grid;gap:12px;">' +
            '<div><label class="form-label">Nombre completo</label><input type="text" id="usr-nombre" class="form-input" value="' + _esc(u.nombre) + '"></div>' +
            '<div><label class="form-label">Email</label><input type="email" id="usr-email" class="form-input" value="' + _esc(u.email || '') + '"></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
              '<div><label class="form-label">Rol</label><select id="usr-rol" class="form-input">' +
                '<option value="admin"' + (u.rol === "admin" ? " selected" : "") + '>Admin</option>' +
                '<option value="operador"' + (u.rol === "operador" ? " selected" : "") + '>Operador</option>' +
                '<option value="solo_lectura"' + (u.rol === "solo_lectura" ? " selected" : "") + '>Solo lectura</option>' +
              '</select></div>' +
              '<div><label class="form-label">Estado</label><select id="usr-activo" class="form-input">' +
                '<option value="1"' + (u.activo ? " selected" : "") + '>Activo</option>' +
                '<option value="0"' + (!u.activo ? " selected" : "") + '>Inactivo</option>' +
              '</select></div>' +
            '</div>' +
            '<div><label class="form-label">Nueva contrase\u00f1a (dejar vac\u00edo para no cambiar)</label><input type="password" id="usr-password" class="form-input" placeholder="Solo si quieres cambiarla"></div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
            '<button class="btn-outline" onclick="document.getElementById(\'modal-usuario\').remove()">Cancelar</button>' +
            '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="usuarioActualizar(' + userId + ')">Guardar cambios</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    });
};

window.usuarioActualizar = function (userId) {
  var data = {
    nombre: (document.getElementById("usr-nombre") || {}).value || "",
    email: (document.getElementById("usr-email") || {}).value || "",
    rol: (document.getElementById("usr-rol") || {}).value,
    activo: (document.getElementById("usr-activo") || {}).value === "1"
  };
  var pw = (document.getElementById("usr-password") || {}).value;
  if (pw) data.password = pw;

  fetch("/api/usuarios/" + userId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-usuario");
      if (m) m.remove();
      mostrarToast("Usuario actualizado", "success");
      cargarUsuarios();
    } else {
      res.json().then(function (err) { mostrarToast(err.error || "Error", "error"); });
    }
  });
};

// ═══ Maquinaria ═══════════════════════════════════════════════════════════

function cargarMaquinaria() {
  var container = document.getElementById("maquinaria-content");
  if (!container) return;

  fetch("/api/maquinaria/maquinas")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var maq = data.maquinas || [];
      var nDisp = 0, nProy = 0, nTaller = 0, nBaja = 0;
      maq.forEach(function (m) {
        if (m.estado === "disponible") nDisp++;
        else if (m.estado === "en_proyecto") nProy++;
        else if (m.estado === "en_taller") nTaller++;
        else if (m.estado === "baja") nBaja++;
      });

      var estadoColors = { disponible: "#16A34A", en_proyecto: "#2563EB", en_taller: "#CA8A04", baja: "#DC2626" };
      var estadoLabels = { disponible: "Disponible", en_proyecto: "En proyecto", en_taller: "En taller", baja: "De baja" };

      function _kpi(label, n, color) {
        return '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid ' + color + ';border-radius:var(--radius-md);padding:12px 16px;">' +
          '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;">' + label + '</div>' +
          '<div style="font-size:22px;font-weight:700;color:' + color + ';">' + n + '</div></div>';
      }

      var cards = maq.map(function (m) {
        var c = estadoColors[m.estado] || "#64748B";
        var lbl = estadoLabels[m.estado] || m.estado;
        return '<div onclick="maqDetalle(' + m.id + ')" style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;cursor:pointer;transition:border-color 0.15s;border-top:3px solid ' + c + ';" ' +
          'onmouseover="this.style.borderColor=\'var(--color-primary)\'" onmouseout="this.style.borderColor=\'var(--color-border)\';this.style.borderTopColor=\'' + c + '\'">' +
          '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">' +
            '<div><div style="font-size:18px;font-weight:600;">' + _esc(m.nombre) + '</div>' +
              '<div style="font-size:12px;color:var(--color-text-secondary);">' + _esc(m.internal_id) + ' \u00b7 ' + _esc(m.modelo) + '</div></div>' +
            '<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:' + c + '15;color:' + c + ';font-weight:500;">' + lbl + '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div><div style="font-size:11px;color:var(--color-text-secondary);">Hor\u00f3metro</div>' +
              '<div style="font-size:16px;font-weight:600;">' + (m.horometro_actual || 0).toLocaleString("es-ES") + 'h</div></div>' +
            '<div><div style="font-size:11px;color:var(--color-text-secondary);">Proyecto</div>' +
              '<div style="font-size:13px;font-weight:500;">' + (m.proyecto_nombre ? _esc(m.proyecto_nombre) : '\u2014') + '</div></div>' +
          '</div></div>';
      }).join("");

      container.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
          '<div><h1 style="margin:0;font-size:22px;">Maquinaria</h1>' +
            '<p style="margin:4px 0 0;font-size:14px;color:var(--color-text-secondary);">' + maq.length + ' m\u00e1quinas registradas</p></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;" id="maq-kpis">' +
          _kpi("Disponibles", nDisp, "#16A34A") +
          _kpi("En proyecto", nProy, "#2563EB") +
          _kpi("En taller", nTaller, "#CA8A04") +
          _kpi("De baja", nBaja, "#DC2626") +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;">' + cards + '</div>';
    });
}

window.maqDetalle = function (maqId) {
  fetch("/api/maquinaria/maquinas/" + maqId)
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (m) {
      var container = document.getElementById("maquinaria-detalle-content");
      var estadoColors = { disponible: "#16A34A", en_proyecto: "#2563EB", en_taller: "#CA8A04", baja: "#DC2626" };
      var color = estadoColors[m.estado] || "#64748B";

      // Revisiones pendientes badges
      var revPend = "";
      if (m.revisiones_pendientes && m.revisiones_pendientes.length) {
        revPend = '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          m.revisiones_pendientes.map(function (r) {
            var urg = r.urgente;
            return '<span style="padding:4px 10px;border-radius:99px;font-size:12px;font-weight:500;' +
              'background:' + (urg ? '#DC262615' : '#CA8A0415') + ';color:' + (urg ? '#DC2626' : '#CA8A04') + ';' +
              'border:1px solid ' + (urg ? '#DC262630' : '#CA8A0430') + ';">' +
              r.tipo + (urg ? ' (\u00a1atrasada!)' : '') + '</span>';
          }).join("") + '</div>';
      } else {
        revPend = '<span style="color:#16A34A;font-size:13px;">\u2713 Todas al d\u00eda</span>';
      }

      // Checks rows
      var checksHtml = "";
      if (m.checks && m.checks.length) {
        checksHtml = m.checks.map(function (c) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--color-border);">' +
            '<div><span style="font-size:13px;font-weight:500;">' + (c.fecha || "").substring(0, 10) + '</span>' +
              '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:8px;">' + (c.horometro || 0) + 'h</span>' +
              (c.usuario_nombre ? '<span style="font-size:11px;color:var(--color-text-secondary);margin-left:8px;">por ' + _esc(c.usuario_nombre) + '</span>' : '') +
            '</div>' +
            '<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + (c.estado === "cerrado" ? '#16A34A15' : '#CA8A0415') + ';color:' + (c.estado === "cerrado" ? '#16A34A' : '#CA8A04') + ';">' + c.estado + '</span>' +
          '</div>';
        }).join("");
      } else {
        checksHtml = '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:16px;">Sin checks registrados</p>';
      }

      // Revisiones rows
      var revsHtml = "";
      if (m.revisiones && m.revisiones.length) {
        revsHtml = m.revisiones.map(function (r) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--color-border);">' +
            '<div><span style="font-size:12px;padding:2px 8px;border-radius:99px;background:#2563EB15;color:#2563EB;font-weight:500;">' + r.tipo + '</span>' +
              '<span style="font-size:13px;margin-left:8px;">' + (r.fecha || "").substring(0, 10) + '</span>' +
              '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:6px;">' + (r.horometro_al_revision || 0) + 'h</span></div>' +
            '<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + (r.estado === "cerrado" ? '#16A34A15' : '#CA8A0415') + ';color:' + (r.estado === "cerrado" ? '#16A34A' : '#CA8A04') + ';">' + r.estado + '</span>' +
          '</div>';
        }).join("");
      } else {
        revsHtml = '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:16px;">Sin revisiones registradas</p>';
      }

      // Incidencias
      var incHtml = "";
      if (m.incidencias && m.incidencias.length) {
        var sevColors = { baja: "#64748B", media: "#CA8A04", alta: "#DC2626", seguridad: "#7C3AED" };
        incHtml = m.incidencias.map(function (i) {
          var sc = sevColors[i.severidad] || "#64748B";
          return '<div style="border:1px solid var(--color-border);border-left:3px solid ' + sc + ';border-radius:var(--radius-md);padding:12px;margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:start;">' +
              '<div><span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + sc + '15;color:' + sc + ';font-weight:500;text-transform:uppercase;">' + i.severidad + '</span>' +
                '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:8px;">' + (i.fecha || "").substring(0, 10) + '</span></div>' +
              '<button onclick="maqCerrarIncidencia(' + i.id + ',' + m.id + ')" class="btn-outline" style="font-size:11px;padding:2px 8px;">Cerrar</button>' +
            '</div>' +
            '<p style="font-size:13px;margin:8px 0 0;">' + _esc(i.descripcion) + '</p>' +
            (i.usuario_nombre ? '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">Reportada por ' + _esc(i.usuario_nombre) + '</div>' : '') +
          '</div>';
        }).join("");
      } else {
        incHtml = '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:16px;">Sin incidencias abiertas \u2713</p>';
      }

      container.innerHTML =
        // Header
        '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px;">' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
              '<button onclick="maqVolver()" style="background:none;border:none;cursor:pointer;font-size:18px;padding:0;color:var(--color-text-secondary);">\u2190</button>' +
              '<h1 style="margin:0;font-size:24px;">' + _esc(m.nombre) + '</h1>' +
              '<span style="font-size:12px;padding:3px 10px;border-radius:99px;background:' + color + '15;color:' + color + ';font-weight:500;">' + m.estado + '</span>' +
            '</div>' +
            '<div style="font-size:14px;color:var(--color-text-secondary);">' + _esc(m.internal_id) + ' \u00b7 ' + _esc(m.modelo) +
              (m.numero_serie ? ' \u00b7 S/N: ' + _esc(m.numero_serie) : '') +
              (m.proyecto_nombre ? ' \u00b7 \uD83D\uDCCD ' + _esc(m.proyecto_nombre) : '') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button class="btn-primary" style="width:auto;padding:8px 16px;" onclick="maqNuevoCheck(' + m.id + ')">\uD83D\uDCCB Check semanal</button>' +
            '<button class="btn-outline" style="padding:8px 16px;" onclick="maqNuevaIncidencia(' + m.id + ')">\u26A0\uFE0F Incidencia</button>' +
            '<button class="btn-outline" style="padding:8px 16px;" onclick="maqEditarModal(' + m.id + ')">Editar</button>' +
          '</div>' +
        '</div>' +

        // KPIs
        '<div style="display:grid;grid-template-columns:250px 1fr 180px;gap:14px;margin-bottom:20px;">' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
            '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:6px;">Hor\u00f3metro</div>' +
            '<div style="font-size:28px;font-weight:700;">' + (m.horometro_actual || 0).toLocaleString("es-ES") + 'h</div>' +
            '<div style="font-size:12px;color:var(--color-text-secondary);">Inicial: ' + (m.horometro_inicial || 0).toLocaleString("es-ES") + 'h \u00b7 Comisi\u00f3n: ' + (m.fecha_comision ? m.fecha_comision.substring(0, 4) : '\u2014') + '</div></div>' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
            '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:8px;">Revisiones pendientes</div>' + revPend + '</div>' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
            '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:6px;">Incidencias abiertas</div>' +
            '<div style="font-size:28px;font-weight:700;color:' + (m.incidencias && m.incidencias.length ? '#DC2626' : '#16A34A') + ';">' + (m.incidencias ? m.incidencias.length : 0) + '</div></div>' +
        '</div>' +

        // 2 columns
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
          '<div style="display:flex;flex-direction:column;gap:14px;">' +
            // Checks
            '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                '<span style="font-size:14px;font-weight:600;">\uD83D\uDCCB Checks semanales</span>' +
                '<span style="font-size:12px;color:var(--color-text-secondary);">' + (m.checks ? m.checks.length : 0) + ' registrados</span></div>' +
              '<div style="padding:12px;max-height:250px;overflow-y:auto;">' + checksHtml + '</div></div>' +
            // Revisiones
            '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                '<span style="font-size:14px;font-weight:600;">\uD83D\uDD27 Revisiones por hor\u00f3metro</span>' +
                '<span style="font-size:12px;color:var(--color-text-secondary);">' + (m.revisiones ? m.revisiones.length : 0) + ' realizadas</span></div>' +
              '<div style="padding:12px;max-height:250px;overflow-y:auto;">' + revsHtml + '</div></div>' +
          '</div>' +
          // Incidencias
          '<div>' +
            '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                '<span style="font-size:14px;font-weight:600;">\u26A0\uFE0F Incidencias abiertas</span>' +
                '<button class="btn-outline" style="font-size:12px;padding:3px 10px;" onclick="maqNuevaIncidencia(' + m.id + ')">+ Nueva</button></div>' +
              '<div style="padding:12px;max-height:500px;overflow-y:auto;">' + incHtml + '</div></div>' +
          '</div>' +
        '</div>';

      // Show detail panel, hide list
      document.getElementById("panel-maquinaria").classList.remove("visible");
      document.getElementById("panel-maquinaria-detalle").classList.add("visible");
    })
    .catch(function () { mostrarToast("Error al cargar m\u00e1quina", "error"); });
};

window.maqVolver = function () {
  document.getElementById("panel-maquinaria-detalle").classList.remove("visible");
  document.getElementById("panel-maquinaria").classList.add("visible");
  cargarMaquinaria();
};

// ── Check semanal ──

window.maqNuevoCheck = function (maqId) {
  fetch("/api/maquinaria/templates/semanal")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var templates = data.templates || [];
      var hoy = new Date().toISOString().substring(0, 10);

      var itemsHtml = templates.map(function (t) {
        return '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--color-border);cursor:pointer;">' +
          '<input type="checkbox" data-template-id="' + t.id + '" style="width:20px;height:20px;accent-color:#16A34A;cursor:pointer;">' +
          '<div style="flex:1;"><div style="font-size:14px;font-weight:500;">' + _esc(t.nombre) + '</div>' +
            (t.descripcion ? '<div style="font-size:12px;color:var(--color-text-secondary);">' + _esc(t.descripcion) + '</div>' : '') +
          '</div></label>';
      }).join("");

      var modal = document.createElement("div");
      modal.className = "modal-overlay visible";
      modal.id = "modal-maq-check";
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      modal.innerHTML =
        '<div class="modal-content" style="max-width:550px;">' +
          '<h2 style="margin:0 0 16px;">Check semanal</h2>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
            '<div><label class="form-label">Fecha</label><input type="date" id="maq-check-fecha" class="form-input" value="' + hoy + '"></div>' +
            '<div><label class="form-label">Hor\u00f3metro actual</label><input type="number" id="maq-check-horometro" class="form-input" step="any" placeholder="Horas"></div>' +
          '</div>' +
          '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;margin-bottom:16px;">' +
            '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);font-size:14px;font-weight:600;">Checklist ORTECO</div>' +
            '<div style="padding:8px;">' + itemsHtml + '</div></div>' +
          '<div style="margin-bottom:16px;"><label class="form-label">Observaciones</label>' +
            '<textarea id="maq-check-obs" class="form-input" rows="2" placeholder="Notas adicionales..."></textarea></div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-check\').remove()">Cancelar</button>' +
            '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="maqGuardarCheck(' + maqId + ')">Guardar y cerrar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    });
};

window.maqGuardarCheck = function (maqId) {
  var checklist = {};
  document.querySelectorAll("#modal-maq-check [data-template-id]").forEach(function (cb) {
    checklist[cb.dataset.templateId] = { ok: cb.checked, nota: "" };
  });
  var payload = {
    maquina_id: maqId,
    fecha: (document.getElementById("maq-check-fecha") || {}).value,
    horometro: parseFloat((document.getElementById("maq-check-horometro") || {}).value) || 0,
    checklist: checklist,
    observaciones: (document.getElementById("maq-check-obs") || {}).value
  };
  fetch("/api/maquinaria/checks", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  }).then(function (res) {
    if (res.ok) {
      return res.json().then(function (check) {
        return fetch("/api/maquinaria/checks/" + check.id + "/cerrar", { method: "PUT" });
      }).then(function () {
        var m = document.getElementById("modal-maq-check"); if (m) m.remove();
        mostrarToast("Check semanal registrado", "success");
        maqDetalle(maqId);
      });
    } else { mostrarToast("Error al guardar", "error"); }
  });
};

// ── Incidencias ──

window.maqNuevaIncidencia = function (maqId) {
  var hoy = new Date().toISOString().substring(0, 10);
  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-maq-incidencia";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:450px;">' +
      '<h2 style="margin:0 0 16px;">Nueva incidencia</h2>' +
      '<div style="display:grid;gap:12px;">' +
        '<div><label class="form-label">Descripci\u00f3n *</label><textarea id="maq-inc-desc" class="form-input" rows="3" placeholder="Describe la incidencia..."></textarea></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label class="form-label">Severidad</label><select id="maq-inc-sev" class="form-input"><option value="baja">Baja</option><option value="media" selected>Media</option><option value="alta">Alta</option><option value="seguridad">Seguridad</option></select></div>' +
          '<div><label class="form-label">Fecha</label><input type="date" id="maq-inc-fecha" class="form-input" value="' + hoy + '"></div>' +
        '</div></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-incidencia\').remove()">Cancelar</button>' +
        '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="maqGuardarIncidencia(' + maqId + ')">Reportar</button>' +
      '</div></div>';
  document.body.appendChild(modal);
};

window.maqGuardarIncidencia = function (maqId) {
  var desc = ((document.getElementById("maq-inc-desc") || {}).value || "").trim();
  if (!desc) { mostrarToast("La descripci\u00f3n es obligatoria", "error"); return; }
  fetch("/api/maquinaria/incidencias", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      maquina_id: maqId, descripcion: desc,
      severidad: (document.getElementById("maq-inc-sev") || {}).value || "media",
      fecha: (document.getElementById("maq-inc-fecha") || {}).value
    })
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-maq-incidencia"); if (m) m.remove();
      mostrarToast("Incidencia reportada", "success");
      maqDetalle(maqId);
    } else { mostrarToast("Error", "error"); }
  });
};

window.maqCerrarIncidencia = function (incId, maqId) {
  var resolucion = prompt("Resoluci\u00f3n de la incidencia:");
  if (resolucion === null) return;
  fetch("/api/maquinaria/incidencias/" + incId, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado: "cerrada", resolucion: resolucion })
  }).then(function () {
    mostrarToast("Incidencia cerrada", "success");
    maqDetalle(maqId);
  });
};

// ── Editar máquina ──

window.maqEditarModal = function (maqId) {
  fetch("/api/maquinaria/maquinas/" + maqId)
    .then(function (r) { return r.json(); })
    .then(function (m) {
      fetch("/api/proyectos")
        .then(function (r) { return r.json(); })
        .then(function (pData) {
          var proyectos = pData.proyectos || [];
          var proyOpts = '<option value="">Sin proyecto</option>' +
            proyectos.map(function (p) {
              return '<option value="' + p.id + '"' + (p.id === m.proyecto_id ? ' selected' : '') + '>' + _esc(p.nombre) + '</option>';
            }).join("");

          var modal = document.createElement("div");
          modal.className = "modal-overlay visible";
          modal.id = "modal-maq-editar";
          modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
          modal.innerHTML =
            '<div class="modal-content" style="max-width:500px;">' +
              '<h2 style="margin:0 0 16px;">Editar ' + _esc(m.nombre) + '</h2>' +
              '<div style="display:grid;gap:12px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                  '<div><label class="form-label">Nombre</label><input type="text" id="maq-ed-nombre" class="form-input" value="' + _esc(m.nombre) + '"></div>' +
                  '<div><label class="form-label">Modelo</label><input type="text" id="maq-ed-modelo" class="form-input" value="' + _esc(m.modelo) + '"></div></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                  '<div><label class="form-label">N\u00ba Serie</label><input type="text" id="maq-ed-serie" class="form-input" value="' + _esc(m.numero_serie || '') + '"></div>' +
                  '<div><label class="form-label">Hor\u00f3metro actual</label><input type="number" id="maq-ed-horometro" class="form-input" step="any" value="' + (m.horometro_actual || 0) + '"></div></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                  '<div><label class="form-label">Estado</label><select id="maq-ed-estado" class="form-input">' +
                    '<option value="disponible"' + (m.estado === 'disponible' ? ' selected' : '') + '>Disponible</option>' +
                    '<option value="en_proyecto"' + (m.estado === 'en_proyecto' ? ' selected' : '') + '>En proyecto</option>' +
                    '<option value="en_taller"' + (m.estado === 'en_taller' ? ' selected' : '') + '>En taller</option>' +
                    '<option value="baja"' + (m.estado === 'baja' ? ' selected' : '') + '>De baja</option></select></div>' +
                  '<div><label class="form-label">Proyecto</label><select id="maq-ed-proyecto" class="form-input">' + proyOpts + '</select></div></div>' +
                '<div><label class="form-label">Ubicaci\u00f3n</label><input type="text" id="maq-ed-ubicacion" class="form-input" value="' + _esc(m.ubicacion || '') + '" placeholder="Ej: Parque PV Cuenca"></div>' +
                '<div><label class="form-label">Notas</label><textarea id="maq-ed-notas" class="form-input" rows="2">' + _esc(m.notas || '') + '</textarea></div>' +
              '</div>' +
              '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
                '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-editar\').remove()">Cancelar</button>' +
                '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="maqGuardarEdicion(' + maqId + ')">Guardar</button>' +
              '</div></div>';
          document.body.appendChild(modal);
        });
    });
};

window.maqGuardarEdicion = function (maqId) {
  var data = {
    nombre: (document.getElementById("maq-ed-nombre") || {}).value,
    modelo: (document.getElementById("maq-ed-modelo") || {}).value,
    numero_serie: (document.getElementById("maq-ed-serie") || {}).value,
    horometro_actual: parseFloat((document.getElementById("maq-ed-horometro") || {}).value) || 0,
    estado: (document.getElementById("maq-ed-estado") || {}).value,
    proyecto_id: parseInt((document.getElementById("maq-ed-proyecto") || {}).value) || null,
    ubicacion: (document.getElementById("maq-ed-ubicacion") || {}).value,
    notas: (document.getElementById("maq-ed-notas") || {}).value
  };
  fetch("/api/maquinaria/maquinas/" + maqId, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-maq-editar"); if (m) m.remove();
      mostrarToast("M\u00e1quina actualizada", "success");
      maqDetalle(maqId);
    } else { mostrarToast("Error", "error"); }
  });
};

// === MODULO CAE ===================================================================

var _caeConstantes = null;
var _caeExpDetalleId = null;
var _caeFolderState = { driveId: null, folderId: null, path: [] };

// ── Helpers ──

function _caeFetch(url, opts) {
  return fetch(url, opts).then(function (r) { return r.json(); });
}

function _caeBadge(status) {
  var colors = { READY: "#28a745", MISSING: "#dc3545", EXPIRED: "#fd7e14", DOUBTFUL: "#ffc107" };
  var labels = { READY: "OK", MISSING: "Falta", EXPIRED: "Caducado", DOUBTFUL: "Dudoso" };
  var estadoColors = { ABIERTO: "#17a2b8", EN_REVISION: "#ffc107", COMPLETO: "#28a745", CERRADO: "#6c757d" };
  var c = colors[status] || estadoColors[status] || "#6c757d";
  var l = labels[status] || status;
  return '<span style="background:' + c + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:0.8rem;font-weight:600;">' + l + '</span>';
}

function _caePrioridad(p) {
  var c = { HIGH: "#dc3545", MEDIUM: "#ffc107", LOW: "#6c757d" };
  var l = { HIGH: "Alta", MEDIUM: "Media", LOW: "Baja" };
  return '<span style="color:' + (c[p] || "#6c757d") + ';font-weight:600;">' + (l[p] || p) + '</span>';
}

function _caeLoadConstantes() {
  if (_caeConstantes) return Promise.resolve(_caeConstantes);
  return _caeFetch("/api/cae/constantes").then(function (d) { _caeConstantes = d; return d; });
}

// ── Dashboard CAE ──

function caeCargarInicio() {
  _caeFetch("/api/cae/dashboard").then(function (d) {
    document.getElementById("cae-stat-expedientes").textContent = d.expedientes_activos || 0;
    document.getElementById("cae-stat-docs").textContent = d.documentos_total || 0;
    document.getElementById("cae-stat-caducados").textContent = d.documentos_caducados || 0;
    document.getElementById("cae-stat-tareas").textContent = d.tareas_pendientes || 0;
  });
  _caeFetch("/api/cae/expedientes").then(function (d) {
    var tb = document.getElementById("cae-expedientes-recientes");
    if (!tb) return;
    var exps = (d.expedientes || []).slice(0, 5);
    tb.innerHTML = exps.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);">Sin expedientes a&uacute;n</td></tr>' :
      exps.map(function (e) {
        return '<tr><td>' + (e.proyecto_nombre || '-') + '</td><td>' + (e.plantilla_nombre || '-') + '</td><td>' + _caeBadge(e.estado) + '</td><td>' + (e.last_analysis_at || 'Nunca') + '</td><td><button class="btn-link" onclick="caeVerExpediente(' + e.id + ')">Ver</button></td></tr>';
      }).join('');
  });
}

// ── Documentos CAE ──

function caeCargarDocumentos() {
  var q = (document.getElementById("cae-doc-busqueda") || {}).value || "";
  var dt = (document.getElementById("cae-doc-filter-type") || {}).value || "";
  var et = (document.getElementById("cae-doc-filter-entity") || {}).value || "";
  var cf = (document.getElementById("cae-doc-filter-confidence") || {}).value || "";
  var params = "?limit=100" + (q ? "&q=" + encodeURIComponent(q) : "") + (dt ? "&doc_type=" + dt : "") + (et ? "&entity_type=" + et : "") + (cf ? "&confidence=" + cf : "");
  _caeFetch("/api/cae/documentos" + params).then(function (d) {
    var tb = document.getElementById("cae-documentos-tabla");
    if (!tb) return;
    var docs = d.documentos || [];
    tb.innerHTML = docs.length === 0 ? '<tr><td colspan="6" style="text-align:center;">Sin documentos. Configura carpetas y sincroniza.</td></tr>' :
      docs.map(function (doc) {
        return '<tr><td title="' + (doc.ruta || '') + '">' + (doc.nombre || '-') + '</td><td>' + (doc.doc_type || '-') + '</td><td>' + (doc.entity_type || '-') + '</td><td>' + _caeBadge(doc.confidence || 'UNKNOWN') + '</td><td>' + (doc.fecha_caducidad || '-') + '</td><td><button class="btn-link" onclick="caeConfirmarDoc(' + doc.id + ')">Confirmar</button></td></tr>';
      }).join('');
  });
  // Populate doc type filter
  _caeLoadConstantes().then(function (c) {
    var sel = document.getElementById("cae-doc-filter-type");
    if (sel && sel.options.length <= 1) {
      (c.doc_types || []).forEach(function (t) {
        var o = document.createElement("option"); o.value = t; o.textContent = t; sel.appendChild(o);
      });
    }
  });
}

window.caeConfirmarDoc = function (docId) {
  if (confirm("Confirmar clasificacion de este documento?")) {
    fetch("/api/cae/documentos/" + docId, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confidence: "CONFIRMED" })
    }).then(function () { caeCargarDocumentos(); mostrarToast("Documento confirmado", "success"); });
  }
};

// ── Expedientes CAE ──

function caeCargarExpedientes() {
  _caeFetch("/api/cae/expedientes").then(function (d) {
    var tb = document.getElementById("cae-expedientes-tabla");
    if (!tb) return;
    var exps = d.expedientes || [];
    tb.innerHTML = exps.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Sin expedientes. Crea uno vinculado a un proyecto.</td></tr>' :
      exps.map(function (e) {
        return '<tr><td>' + (e.proyecto_nombre || '-') + '</td><td>' + (e.plantilla_nombre || '-') + '</td><td>' + _caeBadge(e.estado) + '</td><td>' + (e.last_analysis_at || 'Nunca') + '</td><td><button class="btn-link" onclick="caeVerExpediente(' + e.id + ')">Ver</button></td></tr>';
      }).join('');
  });
}

window.caeVerExpediente = function (eid) {
  _caeExpDetalleId = eid;
  caeSubpanel = "expediente_detalle";
  mostrarSubpanel("cae", "expediente_detalle");
  caeCargarExpedienteDetalle(eid);
};

function caeCargarExpedienteDetalle(eid) {
  _caeFetch("/api/cae/expedientes/" + eid).then(function (e) {
    document.getElementById("cae-exp-det-nombre").textContent = e.proyecto_nombre || "Expediente";
    document.getElementById("cae-exp-det-titulo").textContent = (e.proyecto_nombre || "Expediente") + " — " + (e.plantilla_nombre || "");

    // Stats
    var res = e.resultados || [];
    var counts = { READY: 0, MISSING: 0, EXPIRED: 0, DOUBTFUL: 0 };
    res.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; });
    var total = res.length;
    var pct = total > 0 ? Math.round(counts.READY / total * 100) : 0;
    document.getElementById("cae-exp-det-stats").innerHTML =
      '<div class="stat-card"><div class="stat-value">' + pct + '%</div><div class="stat-label">Completo</div></div>' +
      '<div class="stat-card"><div class="stat-value" style="color:#28a745;">' + counts.READY + '</div><div class="stat-label">OK</div></div>' +
      '<div class="stat-card"><div class="stat-value" style="color:#dc3545;">' + counts.MISSING + '</div><div class="stat-label">Faltan</div></div>' +
      '<div class="stat-card"><div class="stat-value" style="color:#fd7e14;">' + counts.EXPIRED + '</div><div class="stat-label">Caducados</div></div>' +
      '<div class="stat-card"><div class="stat-value" style="color:#ffc107;">' + counts.DOUBTFUL + '</div><div class="stat-label">Dudosos</div></div>';

    // Entidades
    var entDiv = document.getElementById("cae-exp-entidades");
    var ents = e.entidades || [];
    entDiv.innerHTML = ents.length === 0 ? '<p style="color:var(--text-secondary);">Sin entidades asignadas.</p>' :
      ents.map(function (en) {
        return '<span style="display:inline-block;background:var(--bg-hover);padding:4px 10px;border-radius:6px;margin:2px;font-size:0.85rem;">' +
          en.entity_type + ' #' + en.entity_id +
          ' <button style="border:none;background:none;color:#dc3545;cursor:pointer;font-weight:bold;" onclick="caeDesasignarEntidad(' + eid + ',\'' + en.entity_type + '\',' + en.entity_id + ')">&times;</button></span>';
      }).join('');

    // Radar documental (matrix)
    _caeRenderRadar(e);

    // Tareas
    var tarTb = document.getElementById("cae-exp-tareas");
    var tareas = e.tareas || [];
    tarTb.innerHTML = tareas.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Sin tareas</td></tr>' :
      tareas.map(function (t) {
        return '<tr><td>' + _caePrioridad(t.prioridad) + '</td><td>' + t.titulo + '</td><td>' + t.tipo + '</td><td>' + _caeBadge(t.estado) + '</td><td>' +
          (t.estado === 'PENDIENTE' ? '<button class="btn-link" onclick="caeCambiarTarea(' + t.id + ',\'EN_CURSO\')">Iniciar</button>' :
           t.estado === 'EN_CURSO' ? '<button class="btn-link" onclick="caeCambiarTarea(' + t.id + ',\'COMPLETADA\')">Completar</button>' : '') + '</td></tr>';
      }).join('');
  });
}

function _caeRenderRadar(exp) {
  var container = document.getElementById("cae-radar-container");
  if (!container) return;
  var resultados = exp.resultados || [];
  if (resultados.length === 0) { container.innerHTML = '<p style="color:var(--text-secondary);">Ejecuta el analisis para ver el radar.</p>'; return; }

  // Group by item name
  var items = {};
  var entities = {};
  resultados.forEach(function (r) {
    var key = r.item_nombre || r.plantilla_item_id;
    if (!items[key]) items[key] = {};
    var eKey = (r.entity_type || '') + (r.entity_id ? '#' + r.entity_id : '');
    items[key][eKey] = r.status;
    entities[eKey] = true;
  });

  var entKeys = Object.keys(entities);
  var html = '<table class="tabla-generica" style="font-size:0.8rem;"><thead><tr><th>Requisito</th>';
  entKeys.forEach(function (ek) { html += '<th style="text-align:center;">' + ek + '</th>'; });
  html += '</tr></thead><tbody>';
  Object.keys(items).forEach(function (itemName) {
    html += '<tr><td>' + itemName + '</td>';
    entKeys.forEach(function (ek) {
      var s = items[itemName][ek];
      var colors = { READY: "#28a745", MISSING: "#dc3545", EXPIRED: "#fd7e14", DOUBTFUL: "#ffc107" };
      var c = colors[s] || "#e9ecef";
      html += '<td style="text-align:center;"><span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:' + c + ';" title="' + (s || 'N/A') + '"></span></td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Acciones expediente ──

window.caeDesasignarEntidad = function (eid, etype, entityId) {
  fetch("/api/cae/expedientes/" + eid + "/entidades", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_type: etype, entity_id: entityId })
  }).then(function () { caeCargarExpedienteDetalle(eid); });
};

window.caeCambiarTarea = function (tid, estado) {
  fetch("/api/cae/tareas/" + tid, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado: estado })
  }).then(function () {
    if (_caeExpDetalleId) caeCargarExpedienteDetalle(_caeExpDetalleId);
    mostrarToast("Tarea actualizada", "success");
  });
};

// ── Plantillas CAE ──

function caeCargarPlantillas() {
  _caeFetch("/api/cae/plantillas").then(function (d) {
    var div = document.getElementById("cae-plantillas-lista");
    if (!div) return;
    var pls = d.plantillas || [];
    if (pls.length === 0) { div.innerHTML = '<div class="card"><p style="text-align:center;">Sin plantillas. Crea una para definir requisitos documentales.</p></div>'; return; }
    div.innerHTML = pls.map(function (p) {
      var itemsHtml = (p.items || []).map(function (i) {
        return '<tr><td>' + i.nombre + '</td><td>' + i.target_entity_type + '</td><td>' + i.doc_type + '</td><td>' + (i.is_mandatory ? 'Si' : 'No') + '</td></tr>';
      }).join('');
      return '<div class="card" style="margin-bottom:1rem;"><div style="display:flex;justify-content:space-between;align-items:center;"><h3>' + p.nombre + '</h3><div><button class="btn-link" onclick="caeEditarPlantilla(' + p.id + ')">Editar</button> <button class="btn-link" style="color:#dc3545;" onclick="caeEliminarPlantilla(' + p.id + ')">Eliminar</button></div></div>' +
        '<p style="color:var(--text-secondary);font-size:0.9rem;">' + (p.cliente_nombre || 'Sin cliente') + (p.descripcion ? ' — ' + p.descripcion : '') + '</p>' +
        '<table class="tabla-generica" style="margin-top:0.5rem;"><thead><tr><th>Requisito</th><th>Entidad</th><th>Tipo doc</th><th>Obligatorio</th></tr></thead><tbody>' + itemsHtml + '</tbody></table></div>';
    }).join('');
  });
}

window.caeEliminarPlantilla = function (pid) {
  if (confirm("Eliminar plantilla?")) {
    fetch("/api/cae/plantillas/" + pid, { method: "DELETE" }).then(function () {
      caeCargarPlantillas(); mostrarToast("Plantilla eliminada", "success");
    });
  }
};

window.caeEditarPlantilla = function (pid) {
  // Simplified: open modal, load data
  _caeAbrirModalPlantilla(pid);
};

// ── Tareas CAE ──

function caeCargarTareas() {
  var est = (document.getElementById("cae-tarea-filter-estado") || {}).value || "";
  var pri = (document.getElementById("cae-tarea-filter-prioridad") || {}).value || "";
  var params = "?" + (est ? "estado=" + est + "&" : "") + (pri ? "prioridad=" + pri : "");
  _caeFetch("/api/cae/tareas" + params).then(function (d) {
    var tb = document.getElementById("cae-tareas-tabla");
    if (!tb) return;
    var tareas = d.tareas || [];
    tb.innerHTML = tareas.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Sin tareas</td></tr>' :
      tareas.map(function (t) {
        return '<tr><td>' + _caePrioridad(t.prioridad) + '</td><td>' + t.titulo + '</td><td>' + t.tipo + '</td><td>' + _caeBadge(t.estado) + '</td><td>' +
          (t.estado === 'PENDIENTE' ? '<button class="btn-link" onclick="caeCambiarTarea(' + t.id + ',\'EN_CURSO\')">Iniciar</button>' :
           t.estado === 'EN_CURSO' ? '<button class="btn-link" onclick="caeCambiarTarea(' + t.id + ',\'COMPLETADA\')">Completar</button>' : '') + '</td></tr>';
      }).join('');
  });
}

// ── Config CAE ──

function caeCargarConfig() {
  _caeFetch("/api/cae/sync/carpetas").then(function (d) {
    var div = document.getElementById("cae-carpetas-lista");
    if (!div) return;
    var cs = d.carpetas || [];
    div.innerHTML = cs.length === 0 ? '<p style="color:var(--text-secondary);">Sin carpetas configuradas.</p>' :
      cs.map(function (c) {
        return '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;background:var(--bg-hover);border-radius:6px;margin-bottom:0.25rem;">' +
          '<span style="flex:1;">' + (c.label || c.folder_path || 'Carpeta') + '</span>' +
          '<span style="color:var(--text-secondary);font-size:0.8rem;">Sync: ' + (c.last_synced_at || 'Nunca') + '</span>' +
          '<button class="btn-link" style="color:#dc3545;" onclick="caeEliminarCarpeta(' + c.id + ')">Quitar</button></div>';
      }).join('');
  });
  _caeFetch("/api/cae/sync/runs?limit=10").then(function (d) {
    var tb = document.getElementById("cae-sync-runs-tabla");
    if (!tb) return;
    var runs = d.runs || [];
    tb.innerHTML = runs.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Sin historial</td></tr>' :
      runs.map(function (r) {
        return '<tr><td>' + (r.carpeta_label || '-') + '</td><td>' + (r.started_at || '-') + '</td><td>' + (r.items_found || 0) + '</td><td>' + (r.items_new || 0) + '</td><td>' + _caeBadge(r.status || 'OK') + '</td></tr>';
      }).join('');
  });
}

window.caeEliminarCarpeta = function (cid) {
  if (confirm("Quitar esta carpeta de la indexacion?")) {
    fetch("/api/cae/sync/carpetas/" + cid, { method: "DELETE" }).then(function () {
      caeCargarConfig(); mostrarToast("Carpeta eliminada", "success");
    });
  }
};

// ── Modal nuevo expediente ──

function _caeAbrirModalExpediente() {
  var modal = document.getElementById("modal-cae-nuevo-expediente");
  modal.style.display = "";
  modal.classList.add("visible");
  // Load projects
  _caeFetch("/api/proyectos/").then(function (d) {
    var sel = document.getElementById("cae-exp-proyecto-select");
    sel.innerHTML = '<option value="">Seleccionar...</option>';
    (d.proyectos || d || []).forEach(function (p) {
      sel.innerHTML += '<option value="' + p.id + '">' + (p.codigo || '') + ' — ' + p.nombre + '</option>';
    });
  });
  // Load templates
  _caeFetch("/api/cae/plantillas").then(function (d) {
    var sel = document.getElementById("cae-exp-plantilla-select");
    sel.innerHTML = '<option value="">Seleccionar...</option>';
    (d.plantillas || []).forEach(function (p) {
      sel.innerHTML += '<option value="' + p.id + '">' + p.nombre + '</option>';
    });
  });
}

// ── Modal nueva/editar plantilla ──

function _caeAbrirModalPlantilla(pid) {
  var modal = document.getElementById("modal-cae-nueva-plantilla");
  modal.style.display = "";
  modal.classList.add("visible");
  document.getElementById("cae-plantilla-modal-titulo").textContent = pid ? "Editar plantilla" : "Nueva plantilla";
  modal.dataset.editId = pid || "";

  // Load empresas CRM
  _caeFetch("/api/crm/empresas").then(function (d) {
    var sel = document.getElementById("cae-plantilla-cliente");
    sel.innerHTML = '<option value="">Sin cliente especifico</option>';
    (d.empresas || []).forEach(function (e) {
      sel.innerHTML += '<option value="' + e.id + '">' + e.nombre + '</option>';
    });
  });

  if (pid) {
    _caeFetch("/api/cae/plantillas/" + pid).then(function (p) {
      document.getElementById("cae-plantilla-nombre").value = p.nombre || "";
      document.getElementById("cae-plantilla-desc").value = p.descripcion || "";
      if (p.cliente_empresa_id) document.getElementById("cae-plantilla-cliente").value = p.cliente_empresa_id;
      _caeRenderPlantillaItems(p.items || []);
    });
  } else {
    document.getElementById("cae-plantilla-nombre").value = "";
    document.getElementById("cae-plantilla-desc").value = "";
    _caeRenderPlantillaItems([]);
  }
}

function _caeRenderPlantillaItems(items) {
  var div = document.getElementById("cae-plantilla-items-lista");
  div.innerHTML = "";
  items.forEach(function (item, i) { _caeAddPlantillaItemRow(div, item, i); });
}

function _caeAddPlantillaItemRow(container, item, idx) {
  _caeLoadConstantes().then(function (c) {
    var row = document.createElement("div");
    row.className = "cae-plantilla-item-row";
    row.style.cssText = "display:flex;gap:0.5rem;align-items:center;margin-bottom:0.5rem;flex-wrap:wrap;";
    row.dataset.idx = idx;

    var dtOptions = (c.doc_types || []).map(function (t) {
      return '<option value="' + t + '"' + (t === (item.doc_type || '') ? ' selected' : '') + '>' + t + '</option>';
    }).join('');

    row.innerHTML =
      '<input type="text" placeholder="Nombre" value="' + (item.nombre || '') + '" class="cae-pi-nombre" style="flex:2;min-width:150px;" />' +
      '<select class="cae-pi-entity-type" style="width:auto;"><option value="EMPRESA"' + ((item.target_entity_type || '') === 'EMPRESA' ? ' selected' : '') + '>Empresa</option><option value="OPERARIO"' + ((item.target_entity_type || '') === 'OPERARIO' ? ' selected' : '') + '>Operario</option><option value="MAQUINA"' + ((item.target_entity_type || '') === 'MAQUINA' ? ' selected' : '') + '>Maquina</option><option value="VEHICULO"' + ((item.target_entity_type || '') === 'VEHICULO' ? ' selected' : '') + '>Vehiculo</option></select>' +
      '<select class="cae-pi-doc-type" style="width:auto;">' + dtOptions + '</select>' +
      '<label style="font-size:0.85rem;"><input type="checkbox" class="cae-pi-mandatory"' + (item.is_mandatory !== 0 ? ' checked' : '') + ' /> Oblig.</label>' +
      '<button type="button" style="border:none;background:none;color:#dc3545;cursor:pointer;font-size:1.2rem;" onclick="this.parentElement.remove()">&times;</button>';

    container.appendChild(row);
  });
}

// ── Folder explorer ──

function _caeAbrirFolderExplorer() {
  var modal = document.getElementById("modal-cae-folder-explorer");
  modal.style.display = "";
  modal.classList.add("visible");
  _caeFolderState = { driveId: null, folderId: null, path: [{ name: "Drives", driveId: null, folderId: null }] };
  // First: list drives
  _caeFetch("/api/cae/onedrive/drives").then(function (d) {
    var list = document.getElementById("cae-folder-list");
    list.innerHTML = (d.drives || []).map(function (dr) {
      return '<div class="cae-folder-item" style="padding:8px;cursor:pointer;border-bottom:1px solid var(--border);" onclick="caeSelectDrive(\'' + dr.id + '\',\'' + (dr.name || '').replace(/'/g, "\\'") + '\')">' +
        '<strong>' + (dr.name || 'Drive') + '</strong></div>';
    }).join('') || '<p>No se encontraron drives.</p>';
    _caeUpdateFolderBreadcrumb();
  });
}

window.caeSelectDrive = function (driveId, name) {
  _caeFolderState.driveId = driveId;
  _caeFolderState.folderId = null;
  _caeFolderState.path = [{ name: "Drives", driveId: null, folderId: null }, { name: name, driveId: driveId, folderId: null }];
  _caeLoadFolderContents();
};

window.caeNavigateFolder = function (folderId, name) {
  _caeFolderState.folderId = folderId;
  _caeFolderState.path.push({ name: name, driveId: _caeFolderState.driveId, folderId: folderId });
  _caeLoadFolderContents();
};

function _caeLoadFolderContents() {
  var params = "?drive_id=" + _caeFolderState.driveId;
  if (_caeFolderState.folderId) params += "&folder_id=" + _caeFolderState.folderId;
  _caeFetch("/api/cae/onedrive/carpetas" + params).then(function (d) {
    var list = document.getElementById("cae-folder-list");
    var items = (d.items || []).filter(function (i) { return i.is_folder; });
    list.innerHTML = items.map(function (i) {
      return '<div class="cae-folder-item" style="padding:8px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;" onclick="caeNavigateFolder(\'' + i.id + '\',\'' + (i.name || '').replace(/'/g, "\\'") + '\')">' +
        '<span>&#128193; ' + i.name + '</span><span style="color:var(--text-secondary);font-size:0.8rem;">' + (i.child_count || 0) + ' items</span></div>';
    }).join('') || '<p style="padding:8px;color:var(--text-secondary);">Carpeta vacia</p>';
    _caeUpdateFolderBreadcrumb();
  });
}

function _caeUpdateFolderBreadcrumb() {
  var bc = document.getElementById("cae-folder-breadcrumb");
  bc.innerHTML = _caeFolderState.path.map(function (p, i) {
    return '<span style="cursor:pointer;text-decoration:underline;" onclick="caeNavBreadcrumb(' + i + ')">' + p.name + '</span>';
  }).join(' &rsaquo; ');
}

window.caeNavBreadcrumb = function (idx) {
  var p = _caeFolderState.path[idx];
  _caeFolderState.driveId = p.driveId;
  _caeFolderState.folderId = p.folderId;
  _caeFolderState.path = _caeFolderState.path.slice(0, idx + 1);
  if (!p.driveId) {
    // Back to drives
    _caeFetch("/api/cae/onedrive/drives").then(function (d) {
      document.getElementById("cae-folder-list").innerHTML = (d.drives || []).map(function (dr) {
        return '<div class="cae-folder-item" style="padding:8px;cursor:pointer;border-bottom:1px solid var(--border);" onclick="caeSelectDrive(\'' + dr.id + '\',\'' + (dr.name || '').replace(/'/g, "\\'") + '\')">' +
          '<strong>' + (dr.name || 'Drive') + '</strong></div>';
      }).join('');
      _caeUpdateFolderBreadcrumb();
    });
  } else {
    _caeLoadFolderContents();
  }
};

// ── Event listeners (CAE) ──

document.addEventListener("DOMContentLoaded", function () {
  // Navigation hooks
  var caeNavLinks = {
    "nav-cae-inicio": "inicio", "nav-cae-documentos": "documentos",
    "nav-cae-expedientes": "expedientes", "nav-cae-plantillas": "plantillas",
    "nav-cae-tareas": "tareas", "nav-cae-config": "config"
  };
  Object.keys(caeNavLinks).forEach(function (linkId) {
    var el = document.getElementById(linkId);
    if (el) el.addEventListener("click", function (ev) {
      ev.preventDefault();
      caeSubpanel = caeNavLinks[linkId];
      mostrarSubpanel("cae", caeSubpanel);
      _caeOnPanelShow(caeSubpanel);
    });
  });

  // Buttons
  var btnNuevoExp = document.getElementById("btn-nuevo-expediente");
  if (btnNuevoExp) btnNuevoExp.addEventListener("click", _caeAbrirModalExpediente);

  var btnExpVolver = document.getElementById("btn-cae-exp-volver");
  if (btnExpVolver) btnExpVolver.addEventListener("click", function () {
    caeSubpanel = "expedientes";
    mostrarSubpanel("cae", "expedientes");
    caeCargarExpedientes();
  });

  var btnAnalizar = document.getElementById("btn-cae-exp-analizar");
  if (btnAnalizar) btnAnalizar.addEventListener("click", function () {
    if (!_caeExpDetalleId) return;
    fetch("/api/cae/expedientes/" + _caeExpDetalleId + "/analizar", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { mostrarToast(d.error, "error"); return; }
        mostrarToast("Analisis completado: " + d.porcentaje_completo + "% completo", "success");
        caeCargarExpedienteDetalle(_caeExpDetalleId);
      });
  });

  // Asignar entidad
  var btnAsignar = document.getElementById("btn-cae-exp-asignar");
  if (btnAsignar) btnAsignar.addEventListener("click", function () {
    var etype = document.getElementById("cae-exp-ent-type").value;
    var eid = document.getElementById("cae-exp-ent-id").value;
    if (!eid || !_caeExpDetalleId) return;
    fetch("/api/cae/expedientes/" + _caeExpDetalleId + "/entidades", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: etype, entity_id: parseInt(eid) })
    }).then(function () { caeCargarExpedienteDetalle(_caeExpDetalleId); mostrarToast("Entidad asignada", "success"); });
  });

  // Load entity options when type changes
  var entTypeSelect = document.getElementById("cae-exp-ent-type");
  if (entTypeSelect) entTypeSelect.addEventListener("change", function () { _caeLoadEntityOptions(this.value); });

  // Doc filters
  var btnDocFiltrar = document.getElementById("cae-doc-filtrar");
  if (btnDocFiltrar) btnDocFiltrar.addEventListener("click", caeCargarDocumentos);

  // Tareas filters
  var btnTareasFiltrar = document.getElementById("cae-tareas-filtrar");
  if (btnTareasFiltrar) btnTareasFiltrar.addEventListener("click", caeCargarTareas);

  // Nueva plantilla
  var btnNuevaPlantilla = document.getElementById("btn-nueva-plantilla");
  if (btnNuevaPlantilla) btnNuevaPlantilla.addEventListener("click", function () { _caeAbrirModalPlantilla(null); });

  var btnPlantillaClose = document.getElementById("btn-cae-plantilla-modal-close");
  if (btnPlantillaClose) btnPlantillaClose.addEventListener("click", function () {
    document.getElementById("modal-cae-nueva-plantilla").classList.remove("visible");
  });

  var btnAddItem = document.getElementById("btn-cae-plantilla-add-item");
  if (btnAddItem) btnAddItem.addEventListener("click", function () {
    var container = document.getElementById("cae-plantilla-items-lista");
    _caeAddPlantillaItemRow(container, {}, container.children.length);
  });

  var btnGuardarPlantilla = document.getElementById("btn-cae-plantilla-guardar");
  if (btnGuardarPlantilla) btnGuardarPlantilla.addEventListener("click", function () {
    var modal = document.getElementById("modal-cae-nueva-plantilla");
    var editId = modal.dataset.editId;
    var items = [];
    document.querySelectorAll(".cae-plantilla-item-row").forEach(function (row, i) {
      items.push({
        nombre: row.querySelector(".cae-pi-nombre").value,
        target_entity_type: row.querySelector(".cae-pi-entity-type").value,
        doc_type: row.querySelector(".cae-pi-doc-type").value,
        is_mandatory: row.querySelector(".cae-pi-mandatory").checked ? 1 : 0,
        sort_order: i,
      });
    });
    var data = {
      nombre: document.getElementById("cae-plantilla-nombre").value,
      descripcion: document.getElementById("cae-plantilla-desc").value,
      cliente_empresa_id: document.getElementById("cae-plantilla-cliente").value || null,
      items: items,
    };
    var url = editId ? "/api/cae/plantillas/" + editId : "/api/cae/plantillas";
    var method = editId ? "PUT" : "POST";
    fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function () { modal.classList.remove("visible"); caeCargarPlantillas(); mostrarToast("Plantilla guardada", "success"); });
  });

  // Expediente modal
  var btnExpClose = document.getElementById("btn-cae-exp-modal-close");
  if (btnExpClose) btnExpClose.addEventListener("click", function () {
    document.getElementById("modal-cae-nuevo-expediente").classList.remove("visible");
  });

  var btnExpCrear = document.getElementById("btn-cae-exp-crear");
  if (btnExpCrear) btnExpCrear.addEventListener("click", function () {
    var pid = document.getElementById("cae-exp-proyecto-select").value;
    var tid = document.getElementById("cae-exp-plantilla-select").value;
    if (!pid) { mostrarToast("Selecciona un proyecto", "error"); return; }
    fetch("/api/cae/expedientes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proyecto_id: parseInt(pid), plantilla_id: tid ? parseInt(tid) : null })
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        document.getElementById("modal-cae-nuevo-expediente").classList.remove("visible");
        if (d.error) { mostrarToast(d.error, "error"); return; }
        mostrarToast("Expediente creado", "success");
        caeVerExpediente(d.id);
      });
  });

  // Folder explorer
  var btnAddCarpeta = document.getElementById("btn-cae-add-carpeta");
  if (btnAddCarpeta) btnAddCarpeta.addEventListener("click", _caeAbrirFolderExplorer);

  var btnFolderClose = document.getElementById("btn-cae-folder-close");
  if (btnFolderClose) btnFolderClose.addEventListener("click", function () {
    document.getElementById("modal-cae-folder-explorer").classList.remove("visible");
  });

  var btnFolderSelect = document.getElementById("btn-cae-folder-select");
  if (btnFolderSelect) btnFolderSelect.addEventListener("click", function () {
    if (!_caeFolderState.driveId) { mostrarToast("Navega hasta una carpeta", "error"); return; }
    var label = document.getElementById("cae-folder-label").value || null;
    var pathStr = _caeFolderState.path.map(function (p) { return p.name; }).join("/");
    fetch("/api/cae/sync/carpetas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        drive_id: _caeFolderState.driveId,
        folder_id: _caeFolderState.folderId || "root",
        folder_path: pathStr,
        label: label,
      })
    }).then(function () {
      document.getElementById("modal-cae-folder-explorer").classList.remove("visible");
      document.getElementById("cae-folder-label").value = "";
      caeCargarConfig();
      mostrarToast("Carpeta anadida", "success");
    });
  });

  // Sync button
  var btnSync = document.getElementById("btn-cae-sync-ahora");
  if (btnSync) btnSync.addEventListener("click", function () {
    var status = document.getElementById("cae-sync-status");
    status.innerHTML = '<span style="color:var(--text-secondary);">Sincronizando...</span>';
    btnSync.disabled = true;
    fetch("/api/cae/sync/ejecutar", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        btnSync.disabled = false;
        var results = d.resultados || [];
        var totalNew = results.reduce(function (a, r) { return a + (r.items_new || 0); }, 0);
        status.innerHTML = '<span style="color:#28a745;">Completado. ' + totalNew + ' documentos nuevos.</span>';
        caeCargarConfig();
      })
      .catch(function () {
        btnSync.disabled = false;
        status.innerHTML = '<span style="color:#dc3545;">Error al sincronizar.</span>';
      });
  });
});

function _caeLoadEntityOptions(entityType) {
  var sel = document.getElementById("cae-exp-ent-id");
  if (!sel) return;
  sel.innerHTML = '<option value="">Cargando...</option>';
  var url = entityType === "OPERARIO" ? "/api/empleados" : entityType === "MAQUINA" ? "/api/maquinaria/maquinas" : "/api/vehiculos";
  _caeFetch(url).then(function (d) {
    var items = d.empleados || d.maquinas || d.vehiculos || [];
    sel.innerHTML = '<option value="">Seleccionar...</option>' +
      items.map(function (i) {
        var label = i.nombre || i.internal_id || i.matricula || "?";
        if (i.apellidos) label += " " + i.apellidos;
        return '<option value="' + i.id + '">' + label + '</option>';
      }).join('');
  });
}

function _caeOnPanelShow(panel) {
  if (panel === "inicio") caeCargarInicio();
  if (panel === "documentos") caeCargarDocumentos();
  if (panel === "expedientes") caeCargarExpedientes();
  if (panel === "plantillas") caeCargarPlantillas();
  if (panel === "tareas") caeCargarTareas();
  if (panel === "config") caeCargarConfig();
}

// Bridge: expose mostrarSubpanel globally so CAE event listeners can call it
// It delegates to the existing activarSubpanel + triggers CAE data loading
window.mostrarSubpanel = function (mod, sub) {
  activarSubpanel(mod, sub);
  if (mod === "cae") _caeOnPanelShow(sub);
};
