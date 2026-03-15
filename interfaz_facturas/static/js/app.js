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
    paneles: { inicio: "panel-finanzas-inicio" },
    subNavLinks: { proveedores: "nav-finanzas-proveedores", clientes: "nav-finanzas-clientes", control_calidad: "nav-finanzas-control-calidad", bancos: "nav-finanzas-bancos" },
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
    paneles: { inicio: "panel-proyectos-inicio", cotizados: "panel-proyectos-cotizados", vivos: "panel-proyectos-vivos", terminados: "panel-proyectos-terminados", transporte: "panel-proyectos-transporte", onboarding: "panel-onboarding-inicio" },
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
};

let moduloActivo = "inicio";
let finanzasChild = "proveedores";
let proveedoresSubpanel = "facturas";
let clientesSubpanel = "clientes_facturas";
let proyectosSubpanel = "cotizados";
let rrhhSubpanel = "equipo";
let crmSubpanel = "inicio";

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
    _hashUpdateInProgress = false;
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
      if (child === "bancos" || child === "control_calidad" || child === "proveedores" || child === "clientes") {
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
      if (["inicio", "empresas", "contactos", "oportunidades", "interacciones"].indexOf(sp) >= 0) activarSubpanel("crm", sp);
    }
  }
  actualizarHash();
  } finally { _restaurandoHash = false; }
}

function activarModulo(nombre) {
  moduloActivo = nombre;
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
    if (!activo) {
      Object.values(m.paneles).forEach((pid) => {
        const p = document.getElementById(pid);
        if (p) p.classList.remove("visible");
      });
    }
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
  if (nombre === "inicio") {
    cargarDashboard();
  } else if (nombre === "finanzas") {
    cargarFinanzasInicio();
  }
  actualizarHash();
}

function activarFinanzasChild(child) {
  finanzasChild = child;
  // Hide finanzas dashboard
  var finInicio = document.getElementById("panel-finanzas-inicio");
  if (finInicio) finInicio.classList.remove("visible");
  var prov = document.getElementById("submenu-proveedores");
  var cli = document.getElementById("submenu-clientes");
  if (prov) prov.classList.toggle("visible", child === "proveedores");
  if (cli) cli.classList.toggle("visible", child === "clientes");
  document.querySelectorAll("#submenu-finanzas a").forEach(function (a) { a.classList.remove("activo"); });
  var finanzasLink = document.getElementById("nav-finanzas-" + child.replace("_", "-"));
  if (finanzasLink) finanzasLink.classList.add("activo");
  Object.values(MODULOS.proveedores.paneles).forEach(function (pid) {
    var p = document.getElementById(pid);
    if (p) p.classList.remove("visible");
  });
  Object.values(MODULOS.clientes.paneles).forEach(function (pid) {
    var p = document.getElementById(pid);
    if (p) p.classList.remove("visible");
  });
  document.getElementById("panel-control-calidad-inicio").classList.remove("visible");
  document.getElementById("panel-bancos-inicio").classList.remove("visible");
  if (child === "proveedores") {
    proveedoresSubpanel = "facturas";
    document.getElementById("panel-facturas").classList.add("visible");
    document.getElementById("nav-facturas").classList.add("activo");
    document.getElementById("nav-proveedores").classList.remove("activo");
    document.getElementById("nav-cecos").classList.remove("activo");
  } else if (child === "clientes") {
    clientesSubpanel = "clientes_facturas";
    document.getElementById("panel-clientes-facturas").classList.add("visible");
    document.getElementById("nav-clientes-facturas").classList.add("activo");
    document.getElementById("nav-clientes-listado").classList.remove("activo");
  } else if (child === "control_calidad") {
    document.getElementById("panel-control-calidad-inicio").classList.add("visible");
  } else if (child === "bancos") {
    document.getElementById("panel-bancos-inicio").classList.add("visible");
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

// Apply container margin-left EARLY — before any navigation that might loop
(function earlyContainerMargin() {
  var sb = document.querySelector(".sidebar");
  var ct = document.querySelector(".container");
  if (!sb || !ct) return;
  var collapsed = false;
  try { collapsed = localStorage.getItem("sidebar-collapsed") === "1"; } catch (e) {}
  if (collapsed) sb.classList.add("collapsed");
  if (window.innerWidth > 1024) {
    ct.style.setProperty("margin-left", collapsed ? "64px" : "240px", "important");
  } else {
    ct.style.setProperty("margin-left", "0", "important");
  }
})();

(function setEstadoInicialFinanzas() {
  if (location.hash && location.hash.length > 1) {
    restaurarDesdeHash();
  } else {
    activarModulo("inicio");
  }
  window.addEventListener("hashchange", function () {
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
  });
});


// ===== MODULE DASHBOARD NAV CARDS =====
function cargarFinanzasInicio() {
  fetch("/api/finanzas/resumen?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var elProv = document.getElementById("fin-met-prov");
      var elCli = document.getElementById("fin-met-cli");
      var elSinConc = document.getElementById("fin-met-sinconc");
      if (elProv) elProv.textContent = formatearNumeroES(data.total_prov) + " €";
      if (elCli) elCli.textContent = formatearNumeroES(data.total_cli) + " €";
      if (elSinConc) elSinConc.textContent = data.sin_conciliar != null ? String(data.sin_conciliar) : "—";
    })
    .catch(function () {});
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

  function applyCollapsed(collapsed) {
    sidebar.classList.toggle("collapsed", collapsed);
    // Force container margin-left with !important via setProperty
    var containerEl = document.querySelector(".container");
    if (containerEl) {
      if (window.innerWidth > 1024) {
        containerEl.style.setProperty("margin-left", collapsed ? "64px" : "240px", "important");
      } else {
        containerEl.style.setProperty("margin-left", "0", "important");
      }
    }
    document.documentElement.style.setProperty("--sidebar-width", collapsed ? "64px" : "240px");
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
  var topLevelGroups = ["finanzas", "proyectos", "rrhh", "crm"];

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

  // Load user info from dashboard API
  fetch("/api/dashboard?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.usuario) {
        var name = data.usuario;
        var displayName = name.charAt(0).toUpperCase() + name.slice(1);
        var usernameEl = document.getElementById("sidebar-username");
        if (usernameEl) usernameEl.textContent = displayName;
        var avatarEl = document.getElementById("sidebar-avatar");
        if (avatarEl) {
          var parts = name.split(/[\s._-]+/);
          var initials = parts.length >= 2
            ? (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
            : name.slice(0, 2).toUpperCase();
          avatarEl.textContent = initials;
        }
      }
    })
    .catch(function () {});

  // On resize, update container margin-left for the current collapsed state
  window.addEventListener("resize", function () {
    var containerEl = document.querySelector(".container");
    if (containerEl) {
      if (window.innerWidth > 1024) {
        containerEl.style.setProperty("margin-left", sidebar.classList.contains("collapsed") ? "64px" : "240px", "important");
      } else {
        containerEl.style.setProperty("margin-left", "0", "important");
      }
    }
  });

  // Initial sync
  syncSidebar();
  // Set initial container margin-left with !important
  var _initContainer = document.querySelector(".container");
  if (_initContainer) {
    var _isCollapsed = sidebar.classList.contains("collapsed");
    if (window.innerWidth > 1024) {
      _initContainer.style.setProperty("margin-left", _isCollapsed ? "64px" : "240px", "important");
    } else {
      _initContainer.style.setProperty("margin-left", "0", "important");
    }
  }
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
    var primerSaldo = movs[movs.length - 1] && movs[movs.length - 1].saldo != null ? Number(movs[movs.length - 1].saldo) : null;
    var ultimoSaldo = movs[0] && movs[0].saldo != null ? Number(movs[0].saldo) : null;
    var html = "";
    if (primerSaldo !== null) html += "<span class=\"resumen-item\"><span class=\"resumen-label\">Saldo inicial:</span><span class=\"resumen-valor\">" + formatNumero(primerSaldo) + "</span></span>";
    if (ultimoSaldo !== null) html += "<span class=\"resumen-item\"><span class=\"resumen-label\">Saldo final:</span><span class=\"resumen-valor\">" + formatNumero(ultimoSaldo) + "</span></span>";
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
      var esTarjetaAgrupacion = conceptoMov.indexOf("adeudo mensual de tarjeta") >= 0 || conceptoMov.indexOf("liquidacion de las tarjetas") >= 0;
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
        var excluidoSugerencia = conceptoLower.indexOf("nomina") >= 0 || conceptoLower.indexOf("nómina") >= 0 || conceptoLower.indexOf("adelanto") >= 0 || conceptoLower.indexOf("liquidacion de las tarjetas de credito") >= 0 || conceptoLower.indexOf("adeudo mensual de tarjeta") >= 0;
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

  function abrirModalVincularExtracto(movId, empresaId, movFecha, movImporte) {
    if (!modalVincularExtracto || !vincularMovId || !vincularEmpresaId) return;
    vincularMovId.value = movId;
    vincularEmpresaId.value = empresaId || "";
    if (vincularStatus) { vincularStatus.textContent = ""; vincularStatus.style.color = ""; }
    // UX-B.4: mostrar info del movimiento en el modal
    var infoEl = document.getElementById("vincular-extracto-mov-info");
    if (infoEl) {
      infoEl.innerHTML = "<strong>Movimiento:</strong> " + (movFecha || "—") + " &middot; Importe: " + (movImporte != null ? formatNumero(movImporte) : "—") + " &euro;";
    }
    if (vincularTarjetaSel) {
      vincularTarjetaSel.innerHTML = "<option value=\"\">Cargando…</option>";
      vincularTarjetaSel.disabled = true;
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
          opt.textContent = (t.alias || "").trim() || (t.banco || "") + " " + (t.persona || "") || "Tarjeta " + t.id;
          vincularTarjetaSel.appendChild(opt);
        });
        vincularTarjetaSel.disabled = false;
        // UX-B.4: si solo hay una tarjeta, preseleccionarla
        if (tarjetas.length === 1) {
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
        abrirModalVincularExtracto(movId, empresaId, mFecha, mImporte);
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

  function renderTarjetas(tarjetas) {
    if (!tbodyTarjetas) return;
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
      html += "<button type=\"button\" class=\"btn-small bancos-btn-tarjeta-toggle\" data-id=\"" + t.id + "\" data-activa=\"" + (t.activa ? "1" : "0") + "\">" + (t.activa ? "Desactivar" : "Activar") + "</button>";
      html += "</td>";
      html += "</tr>";
    });
    tbodyTarjetas.innerHTML = html;
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

  function abrirModalTarjeta() {
    if (!modalTarjetaOverlay) return;
    if (statusTarjeta) {
      statusTarjeta.textContent = "";
      statusTarjeta.style.color = "";
    }
    modalTarjetaOverlay.classList.add("visible");
    modalTarjetaOverlay.setAttribute("aria-hidden", "false");
  }

  function cerrarModalTarjeta() {
    if (!modalTarjetaOverlay) return;
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
      fetch("/api/tarjetas", {
        method: "POST",
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
    statusEl.textContent = json.mensaje || "Procesamiento lanzado correctamente.";
    // Recargar listado si hay empresa seleccionada
    const empListado = document.getElementById("empresa-listado");
    if (empListado && empListado.value) {
      if (typeof window.cargarListadoProveedores === "function") window.cargarListadoProveedores(empListado.value);
      else if (document.getElementById("btn-cargar-listado")) document.getElementById("btn-cargar-listado").click();
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
    getCheckboxData: conCheckbox ? (f) => ({ ruta: (f.ruta_destino || f.ruta_archivo || "").trim() }) : undefined,
    onCheckChange: actualizarBotonEliminar,
    sortState,
    onSort,
    getRutaVerFactura: (f) => (f.ruta_destino || f.ruta_archivo || "").trim(),
    onEditar: abrirModalEdicion,
    tieneError: tieneAlerta,
    motivoErrorKey: "motivo_error",
  });
}

function actualizarBotonEliminar() {
  const checks = document.querySelectorAll("#tbody-facturas .check-factura:checked");
  const btn = document.getElementById("btn-eliminar-seleccionadas");
  if (checks.length > 0) {
    btn.classList.add("visible");
    btn.textContent = "Eliminar seleccionadas (" + checks.length + ")";
  } else {
    btn.classList.remove("visible");
  }
  const total = document.querySelectorAll("#tbody-facturas .check-factura");
  const checkAll = document.getElementById("check-all-facturas");
  if (checkAll) {
    checkAll.checked = total.length > 0 && checks.length === total.length;
    checkAll.indeterminate = checks.length > 0 && checks.length < total.length;
  }
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
          var nombre = (p.nombre_canonico || "").trim() || "Sin nombre";
          var nif = (p.nif || "").trim();
          opt.textContent = nif ? nombre + " (" + nif + ")" : nombre;
          sel.appendChild(opt);
        });
        var optNuevo = document.createElement("option");
        optNuevo.value = "nuevo";
        optNuevo.textContent = "➕ Crear nuevo proveedor";
        sel.appendChild(optNuevo);
        var provFactura = (f.proveedor || "").toString().trim();
        var nifFactura = (f.nif_proveedor || "").toString().trim();
        for (var i = 0; i < lista.length; i++) {
          var p = lista[i];
          if ((p.nombre_canonico || "").trim() === provFactura && (p.nif || "").trim() === nifFactura) {
            sel.value = String(i);
            break;
          }
        }
      })
      .catch(function () {});
  }

  cargarTarjetasEnSelectorEdicion(emp, f);

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
  if (v === "nuevo") {
    abrirModalNuevoProveedorDesdeFactura();
    this.value = "";
    return;
  }
  if (v === "" || !PROVEEDORES_EN_EDICION.length) return;
  const i = parseInt(v, 10);
  if (isNaN(i) || i < 0 || i >= PROVEEDORES_EN_EDICION.length) return;
  const p = PROVEEDORES_EN_EDICION[i];
  document.getElementById("ed-proveedor").value = (p.nombre_canonico || "").trim();
  document.getElementById("ed-nif").value = (p.nif || "").trim();
  document.getElementById("ed-pais").value = (p.pais || "").trim();
  document.getElementById("ed-localidad").value = (p.localidad || "").trim();
});

document.getElementById("ed-btn-nuevo-proveedor").addEventListener("click", abrirModalNuevoProveedorDesdeFactura);

function abrirModalNuevoProveedorDesdeFactura() {
  const emp = document.getElementById("empresa-listado").value;
  if (!emp) {
    mostrarToast("Selecciona primero una empresa en el listado de facturas.", "error");
    return;
  }
  const nombre = document.getElementById("ed-proveedor").value.trim();
  const nif = document.getElementById("ed-nif").value.trim();
  modalProveedorModo = "nuevo";
  modalProveedorTitulo.textContent = "Nuevo proveedor (desde factura)";
  document.getElementById("proveedor-empresa-id").value = emp;
  document.getElementById("proveedor-empresa-readonly").value = document.getElementById("empresa-listado").options[document.getElementById("empresa-listado").selectedIndex]?.text || emp;
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
  modalProveedorEl.classList.add("visible");
  modalProveedorEl.setAttribute("aria-hidden", "false");
  document.getElementById("proveedor-nombre").focus();
  window.AL_CERRAR_PROVEEDOR_DESDE_FACTURA = function (nuevoProveedor) {
    window.AL_CERRAR_PROVEEDOR_DESDE_FACTURA = null;
    PROVEEDORES_EN_EDICION = (nuevoProveedor && nuevoProveedor.proveedores) ? nuevoProveedor.proveedores : PROVEEDORES_EN_EDICION.slice();
    const sel = document.getElementById("ed-selector-proveedor");
    if (nuevoProveedor && nuevoProveedor.proveedores && nuevoProveedor.proveedores.length) {
      const lista = nuevoProveedor.proveedores;
      PROVEEDORES_EN_EDICION = lista;
      sel.innerHTML = "<option value=\"\">Seleccionar proveedor…</option>";
      lista.forEach((p, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        const nom = (p.nombre_canonico || "").trim() || "Sin nombre";
        const n = (p.nif || "").trim();
        opt.textContent = n ? nom + " (" + n + ")" : nom;
        sel.appendChild(opt);
      });
      const optNuevo = document.createElement("option");
      optNuevo.value = "nuevo";
      optNuevo.textContent = "➕ Crear nuevo proveedor";
      sel.appendChild(optNuevo);
      sel.value = String(lista.length - 1);
      const ult = lista[lista.length - 1];
      document.getElementById("ed-proveedor").value = (ult.nombre_canonico || "").trim();
      document.getElementById("ed-nif").value = (ult.nif || "").trim();
      document.getElementById("ed-pais").value = (ult.pais || "").trim();
      document.getElementById("ed-localidad").value = (ult.localidad || "").trim();
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
    btn.textContent = "Eliminar seleccionadas (" + checks.length + ")";
  } else {
    btn.classList.remove("visible");
  }
}

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
    getCheckboxData: (f) => ({ idx: String(f._idx) }),
    onCheckChange: actualizarBtnEliminarCli,
    sortState: sortStateCli,
    onSort: renderTablaClientesFacturas,
    getRutaVerFactura: (f) => (f.ruta_archivo || "").trim(),
    onEditar: abrirModalEdicionCli,
  });
  contador.textContent =
    total + (total === 1 ? " factura" : " facturas") + (total > LIMITE_FILAS_TABLA ? " (mostrando primeras " + LIMITE_FILAS_TABLA + ")" : "");
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

document.getElementById("cli-btn-exportar").addEventListener("click", () => {
  const emp = document.getElementById("cli-empresa-listado").value;
  if (!emp) { mostrarToast("Elige primero una empresa para exportar.", "error"); return; }
  const anio = document.getElementById("cli-filtro-anio").value || "";
  const mes = document.getElementById("cli-filtro-mes").value || "";
  window.open("/api/facturas_clientes_export?empresa_id=" + encodeURIComponent(emp) + "&year=" + encodeURIComponent(anio) + "&month=" + encodeURIComponent(mes), "_blank");
});

document.getElementById("cli-btn-descargar-facturas").addEventListener("click", () => {
  const emp = document.getElementById("cli-empresa-listado").value;
  if (!emp) { mostrarToast("Elige primero una empresa para descargar.", "error"); return; }
  const anio = document.getElementById("cli-filtro-anio").value || "";
  const mes = document.getElementById("cli-filtro-mes").value || "";
  window.location.href = "/api/facturas_clientes_zip?empresa_id=" + encodeURIComponent(emp) + "&year=" + encodeURIComponent(anio) + "&month=" + encodeURIComponent(mes);
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
    cargarListadoCli(empresa);
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
  document.getElementById("edc-tipologia").value = (f.tipologia || "").trim();
  document.getElementById("edc-hincadoras").value = (f.num_hincadoras || "").trim();
  document.getElementById("edc-ayudantes").value = (f.num_ayudantes || "").trim();
  document.getElementById("edc-pricing-servicio").value = (f.pricing_servicio || "").trim();
  document.getElementById("edc-pricing-transporte").value = (f.pricing_transporte || "").trim();
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
    "edc-pricing-transporte": "pricing_transporte", "edc-num-factura": "numero_factura",
    "edc-iva": "iva", "edc-total": "total_a_pagar",
  };
  Object.entries(mapeo).forEach(([id, key]) => { factura[key] = document.getElementById(id).value.trim(); });
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
      })
      .catch(function () {});
  };

  // Dashboard cards navigation
  document.querySelectorAll(".crm-dash-card[data-crm-nav]").forEach(function (card) {
    card.addEventListener("click", function () {
      var target = card.getAttribute("data-crm-nav");
      activarSubpanel("crm", target);
      if (target === "empresas") _crmCargarEmpresas();
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
                '<span class="crm-badge crm-badge-' + _esc(emp.tipo) + '">' + _esc(emp.tipo) + '</span>' +
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
        badge.className = "crm-badge crm-badge-" + (emp.tipo || "lead");
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
            return '<div class="crm-contacto-mini-item"><strong>' + _esc(c.nombre) + ' ' + _esc(c.apellidos || '') + '</strong>' +
              (c.cargo ? '<span>' + _esc(c.cargo) + '</span>' : '') +
              (c.email ? '<span>' + _esc(c.email) + '</span>' : '') + '</div>';
          }).join("");
        } else {
          contEl.innerHTML = '<p class="crm-sin-datos">Sin contactos</p>';
        }

        // Interacciones
        var intEl = document.getElementById("crm-empresa-interacciones-lista");
        if (emp.interacciones && emp.interacciones.length > 0) {
          intEl.innerHTML = emp.interacciones.map(function (i) {
            return '<div class="crm-timeline-item">' +
              '<span class="crm-timeline-fecha">' + _esc((i.fecha || "").substring(0, 10)) + '</span>' +
              '<span class="crm-timeline-tipo">' + _esc(i.tipo) + '</span>' +
              '<span class="crm-timeline-asunto">' + _esc(i.asunto || i.descripcion || "") + '</span></div>';
          }).join("");
        } else {
          intEl.innerHTML = '<p class="crm-sin-datos">Sin interacciones</p>';
        }

        // Oportunidades
        var opEl = document.getElementById("crm-empresa-oportunidades-lista");
        if (emp.oportunidades && emp.oportunidades.length > 0) {
          opEl.innerHTML = emp.oportunidades.map(function (o) {
            var imp = o.importe_estimado ? Number(o.importe_estimado).toLocaleString("es-ES", { style: "currency", currency: "EUR" }) : "";
            return '<div class="crm-contacto-mini-item"><strong>' + _esc(o.nombre) + '</strong>' +
              '<span class="crm-badge crm-badge-lead">' + _esc(o.estado) + '</span>' +
              (imp ? '<span>' + imp + '</span>' : '') + '</div>';
          }).join("");
        } else {
          opEl.innerHTML = '<p class="crm-sin-datos">Sin oportunidades</p>';
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
  function _esc(s) {
    if (!s) return "";
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // Load CRM data when navigating to it via MutationObserver
  var _crmObserver = new MutationObserver(function () {
    var panelInicio = document.getElementById("panel-crm-inicio");
    var panelEmpresas = document.getElementById("panel-crm-empresas");
    if (panelInicio && panelInicio.classList.contains("visible")) _crmCargarStats();
    if (panelEmpresas && panelEmpresas.classList.contains("visible")) _crmCargarEmpresas();
  });
  ["panel-crm-inicio", "panel-crm-empresas"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) _crmObserver.observe(el, { attributes: true, attributeFilter: ["class"] });
  });
})();