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
  finanzas: {
    linkId: "nav-finanzas-modulo",
    submenuId: "submenu-finanzas",
    paneles: {}, // se gestionan por hijo
    subNavLinks: { proveedores: "nav-finanzas-proveedores", clientes: "nav-finanzas-clientes", control_calidad: "nav-finanzas-control-calidad", bancos: "nav-finanzas-bancos" },
    defecto: "proveedores",
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
    paneles: { cotizados: "panel-proyectos-cotizados", vivos: "panel-proyectos-vivos", terminados: "panel-proyectos-terminados", transporte: "panel-proyectos-transporte", onboarding: "panel-onboarding-inicio" },
    subNavLinks: { cotizados: "nav-proyectos-cotizados", vivos: "nav-proyectos-vivos", terminados: "nav-proyectos-terminados", transporte: "nav-proyectos-transporte", onboarding: "nav-proyectos-onboarding" },
    defecto: "cotizados",
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
    paneles: { equipo: "panel-rrhh-equipo", reserva: "panel-rrhh-reserva", alumni: "panel-rrhh-alumni", nominas: "panel-rrhh-nominas", adelantos: "panel-rrhh-adelantos" },
    subNavLinks: { equipo: "nav-rrhh-equipo", reserva: "nav-rrhh-reserva", alumni: "nav-rrhh-alumni", nominas: "nav-rrhh-nominas", adelantos: "nav-rrhh-adelantos" },
    defecto: "equipo",
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
};

let moduloActivo = "finanzas";
let finanzasChild = "proveedores";
let proveedoresSubpanel = "facturas";
let clientesSubpanel = "clientes_facturas";
let proyectosSubpanel = "cotizados";
let rrhhSubpanel = "equipo";

function actualizarHash() {
  var partes = [moduloActivo];
  if (moduloActivo === "finanzas") {
    partes.push(finanzasChild);
    if (finanzasChild === "proveedores") partes.push(proveedoresSubpanel);
    else if (finanzasChild === "clientes") partes.push(clientesSubpanel);
  } else if (moduloActivo === "proyectos") {
    partes.push(proyectosSubpanel);
  } else if (moduloActivo === "rrhh") {
    partes.push(rrhhSubpanel);
  }
  var h = partes.join("/");
  if (location.hash.slice(1) !== h) location.hash = h;
}

function restaurarDesdeHash() {
  var h = (location.hash || "").replace(/^#/, "").trim();
  if (!h) return;
  var partes = h.split("/").filter(Boolean);
  if (partes.length === 0) return;
  var mod = partes[0];
  if (mod === "finanzas") {
    activarModulo("finanzas");
    if (partes.length >= 2) {
      var child = partes[1];
      if (child === "bancos" || child === "control_calidad" || child === "proveedores" || child === "clientes") {
        activarFinanzasChild(child);
        if (child === "proveedores" && partes.length >= 3) {
          var sp = partes[2];
          if (sp === "facturas" || sp === "proveedores" || sp === "cecos") activarSubpanel("proveedores", sp);
        } else if (child === "clientes" && partes.length >= 3) {
          var sp = partes[2];
          if (sp === "clientes_facturas" || sp === "clientes_listado") activarSubpanel("clientes", sp);
        }
      }
    }
  } else if (mod === "proyectos" && partes.length >= 2) {
    var sp = partes[1];
    activarModulo("proyectos");
    if (["cotizados", "vivos", "terminados", "transporte", "onboarding"].indexOf(sp) >= 0) activarSubpanel("proyectos", sp);
  } else if (mod === "rrhh" && partes.length >= 2) {
    var sp = partes[1];
    activarModulo("rrhh");
    if (["equipo", "reserva", "alumni", "nominas", "adelantos"].indexOf(sp) >= 0) activarSubpanel("rrhh", sp);
  } else if (mod === "onboarding") {
    activarModulo("onboarding");
  }
  actualizarHash();
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
    activarFinanzasChild(finanzasChild);
  } else {
    document.getElementById("submenu-proveedores").classList.remove("visible");
    document.getElementById("submenu-clientes").classList.remove("visible");
  }
  if (nombre !== "finanzas") {
    document.getElementById("submenu-finanzas").classList.remove("visible");
  }
  actualizarHash();
}

function activarFinanzasChild(child) {
  finanzasChild = child;
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
  Object.keys(mod.paneles).forEach((k) => {
    document.getElementById(mod.paneles[k]).classList.toggle("visible", k === subpanel);
    if (mod.subNavLinks[k]) {
      document.getElementById(mod.subNavLinks[k]).classList.toggle("activo", k === subpanel);
    }
  });
  actualizarHash();
}

document.getElementById("nav-finanzas-modulo").addEventListener("click", (e) => {
  e.preventDefault();
  activarModulo("finanzas");
});
document.getElementById("nav-proyectos-modulo").addEventListener("click", (e) => {
  e.preventDefault();
  activarModulo("proyectos");
});
document.getElementById("nav-rrhh-modulo").addEventListener("click", (e) => {
  e.preventDefault();
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

(function setEstadoInicialFinanzas() {
  if (location.hash && location.hash.length > 1) {
    restaurarDesdeHash();
  } else {
    if (document.getElementById("nav-finanzas-modulo")) activarModulo("finanzas");
    actualizarHash();
  }
  window.addEventListener("hashchange", function () {
    if (location.hash && location.hash.length > 1) restaurarDesdeHash();
  });
})();

document.getElementById("nav-facturas").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("proveedores", "facturas");
});
document.getElementById("nav-proveedores").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("proveedores", "proveedores");
});
document.getElementById("nav-cecos").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("proveedores", "cecos");
});
document.getElementById("nav-clientes-facturas").addEventListener("click", (e) => {
  e.preventDefault();
  activarSubpanel("clientes", "clientes_facturas");
});
document.getElementById("nav-clientes-listado").addEventListener("click", (e) => {
  e.preventDefault();
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

// Bancos: importar extracto (Santander)
(function () {
  var form = document.getElementById("form-bancos-importar");
  var statusEl = document.getElementById("bancos-status");
  var resultadoEl = document.getElementById("bancos-resultado");
  var listaEl = document.getElementById("bancos-resultado-lista");
  if (!form || !statusEl) return;
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
        if (data.leidos != null) items.push("Leídos en el Excel: " + data.leidos);
        if (data.insertados != null) items.push("Insertados: " + data.insertados);
        if (data.duplicados_omitidos != null) items.push("Duplicados omitidos: " + data.duplicados_omitidos);
        if (data.errores && data.errores.length) items.push("Errores: " + data.errores.length);
        items.forEach(function (t) {
          var li = document.createElement("li");
          li.textContent = t;
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

  function cargarMovimientosBancos() {
    if (!tbody || !contadorEl) return;
    var empresaId = (filtroEmpresa && filtroEmpresa.value) || "";
    if (!empresaId) {
      tbody.innerHTML = "<tr><td colspan=\"9\" class=\"sin-datos\">Selecciona una empresa para ver los movimientos.</td></tr>";
      contadorEl.textContent = "Selecciona empresa.";
      var concBlock = document.getElementById("bancos-conciliacion-block");
      if (concBlock) concBlock.style.display = "none";
      return;
    }
    var concBlock = document.getElementById("bancos-conciliacion-block");
    if (concBlock) concBlock.style.display = "block";
    tbody.innerHTML = "<tr><td colspan=\"9\" class=\"sin-datos\">Cargando…</td></tr>";
    var params = new URLSearchParams();
    params.set("limit", "500");
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
    fetch("/api/bancos/movimientos?" + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var movs = data.movimientos || [];
        var mapaTraspasos = detectarTraspasos(movs);
        var total = data.total != null ? data.total : movs.length;
        contadorEl.textContent = total + " movimiento" + (total !== 1 ? "s" : "");
        if (movs.length === 0) {
          tbody.innerHTML = "<tr><td colspan=\"9\" class=\"sin-datos\">No hay movimientos con los filtros seleccionados.</td></tr>";
          return;
        }
        tbody.innerHTML = "";
        movs.forEach(function (m, idx) {
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
          if (esTraspaso) {
            tr.classList.add("mov-traspaso");
          }
          var esIngreso = Number(importe) > 0 && !esTraspaso;
          if (esIngreso) {
            tr.classList.add("mov-ingreso");
          }
          var conciliadoAt = (m.conciliado_at || "").trim();
          var facturaRuta = (m.factura_ruta || "").trim();
          var conciliaCel = "—";
          if (conciliadoAt) {
            var d = conciliadoAt.slice(0, 10);
            conciliaCel = "<span class=\"bancos-conciliacion-fecha\" title=\"" + (conciliadoAt.replace(/"/g, "&quot;")) + "\">" + d + "</span>";
            conciliaCel += " <span class=\"bancos-conciliacion-btns\">";
            if (facturaRuta) {
              var rutaEsc = encodeURIComponent(facturaRuta);
              conciliaCel += "<a href=\"/api/archivo?ruta=" + rutaEsc + "\" target=\"_blank\" class=\"btn-link-small\" title=\"Abrir factura\">Ver factura</a> ";
            }
            conciliaCel += "<button type=\"button\" class=\"btn-small bancos-btn-desvincular\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" title=\"Quitar vinculación con factura\">Desvincular</button>";
            conciliaCel += "</span>";
          } else {
            conciliaCel = "<span class=\"sin-conciliar\">—</span>";
            var conceptoLower = ((m.concepto || "") + "").toLowerCase();
            var excluidoSugerencia = conceptoLower.indexOf("nomina") >= 0 || conceptoLower.indexOf("nómina") >= 0 || conceptoLower.indexOf("adelanto") >= 0 || conceptoLower.indexOf("liquidacion de las tarjetas de credito") >= 0 || conceptoLower.indexOf("adeudo mensual de tarjeta") >= 0;
            var esTraspasoExcluido = conceptoLower.indexOf("traspaso") >= 0;
            if (!excluidoSugerencia && !esTraspasoExcluido) {
              conciliaCel = "<span class=\"bancos-conciliacion-btns\"><button type=\"button\" class=\"btn-small bancos-btn-conciliar-factura\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" data-empresa-id=\"" + ((m.empresa_id || "") + "").replace(/\"/g, "&quot;") + "\" data-concepto=\"" + ((m.concepto || "") + "").replace(/\"/g, "&quot;") + "\" data-fecha=\"" + ((m.fecha_operacion || "") + "").replace(/\"/g, "&quot;") + "\" data-importe=\"" + (m.importe != null ? String(m.importe) : "").replace(/\"/g, "&quot;") + "\" title=\"Vincular este movimiento a una factura pendiente de pago\">Conciliar factura</button></span>";
            }
          }
          var tarjetaId = m.tarjeta_id != null ? m.tarjeta_id : "";
          var liquidacionPeriodo = (m.liquidacion_periodo || "").trim();
          var tarjetaAlias = (m.tarjeta_alias || "").trim();
          var conceptoMov = ((m.concepto || "") + "").toLowerCase();
          var esTarjetaAgrupacion = conceptoMov.indexOf("adeudo mensual de tarjeta") >= 0 || conceptoMov.indexOf("liquidacion de las tarjetas") >= 0;
          var extractoCel = "—";
          if (esTarjetaAgrupacion) {
            if (tarjetaId && liquidacionPeriodo) {
              extractoCel = "<span class=\"bancos-conciliacion-fecha\" title=\"Vinculado a extracto de tarjeta\">" + (tarjetaAlias || "Tarjeta") + " – " + liquidacionPeriodo + "</span>";
              extractoCel += " <span class=\"bancos-conciliacion-btns\"><button type=\"button\" class=\"btn-small bancos-btn-desvincular-extracto\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" title=\"Quitar vinculación con extracto de tarjeta\">Desvincular</button></span>";
            } else {
              extractoCel = "<button type=\"button\" class=\"btn-small bancos-btn-vincular-extracto\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" title=\"Vincular este movimiento a un extracto de tarjeta\">Vincular a extracto</button>";
            }
          }
          tr.innerHTML =
            "<td class=\"col-check\"><input type=\"checkbox\" class=\"bancos-check-mov\" value=\"" + (m.id != null ? m.id : "") + "\" title=\"Seleccionar\" /></td>" +
            "<td class=\"col-fecha\">" + (fecha === "—" ? "—" : fecha) + "</td>" +
            "<td class=\"col-banco\">" + bancoLabel + "</td>" +
            "<td class=\"col-concepto\" title=\"" + (m.concepto || "").replace(/\"/g, "&quot;") + "\">" + concepto + "</td>" +
            "<td class=\"numero\">" + formatNumero(importe) + "</td>" +
            "<td class=\"numero\">" + formatNumero(saldo) + "</td>" +
            "<td class=\"numero\">" + formatNumero(saldoAcum) + "</td>" +
            "<td class=\"col-conciliacion\">" + conciliaCel + "</td>" +
            "<td class=\"col-conciliacion col-agrupacion\">" + extractoCel + "</td>";
          try {
            if (Number(importe) > 0 && tr.children.length >= 5) {
              tr.children[4].classList.add("positivo");      // Importe
              tr.children[1].classList.add("ingreso-texto"); // Fecha
              tr.children[2].classList.add("ingreso-texto"); // Banco
              tr.children[3].classList.add("ingreso-texto"); // Concepto
            }
          } catch (e) {}
          tbody.appendChild(tr);
        });
      })
      .catch(function () {
        tbody.innerHTML = "<tr><td colspan=\"9\" class=\"sin-datos\">Error al cargar movimientos.</td></tr>";
        if (contadorEl) contadorEl.textContent = "0 movimientos";
      });
  }

  window.cargarMovimientosBancos = cargarMovimientosBancos;

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
        alert("Selecciona al menos un movimiento para borrar.");
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
          alert(n ? "Eliminados " + n + " movimiento(s)." : (data.mensaje || "Hecho."));
          cargarMovimientosBancos();
        })
        .catch(function () { alert("Error al eliminar."); })
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
          if (data.error) { alert(data.error); return; }
          cargarMovimientosBancos();
          var listEl = document.getElementById("bancos-sugerencias-list");
          if (listEl && listEl.innerHTML) document.getElementById("bancos-btn-cargar-sugerencias").click();
        })
        .catch(function () { alert("Error al desvincular."); })
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

  function abrirModalVincularExtracto(movId, empresaId) {
    if (!modalVincularExtracto || !vincularMovId || !vincularEmpresaId) return;
    vincularMovId.value = movId;
    vincularEmpresaId.value = empresaId || "";
    if (vincularStatus) { vincularStatus.textContent = ""; vincularStatus.style.color = ""; }
    if (vincularTarjetaSel) {
      vincularTarjetaSel.innerHTML = "<option value=\"\">Cargando…</option>";
      vincularTarjetaSel.disabled = true;
    }
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    if (vincularPeriodoInp) vincularPeriodoInp.value = y + "-" + m;
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
        vincularTarjetaSel.innerHTML = "<option value=\"\">Selecciona tarjeta…</option>";
        (data.tarjetas || []).forEach(function (t) {
          var opt = document.createElement("option");
          opt.value = t.id != null ? t.id : "";
          opt.textContent = (t.alias || "").trim() || (t.banco || "") + " " + (t.persona || "") || "Tarjeta " + t.id;
          vincularTarjetaSel.appendChild(opt);
        });
        vincularTarjetaSel.disabled = false;
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
        tr.innerHTML = "<td class=\"col-fecha\">" + fecha + "</td><td>" + cliente.replace(/</g, "&lt;") + "</td><td title=\"" + (concepto.replace(/"/g, "&quot;")) + "\">" + (concepto.length > 40 ? concepto.slice(0, 40) + "…" : concepto).replace(/</g, "&lt;") + "</td><td>" + numero.replace(/</g, "&lt;") + "</td><td class=\"numero\">" + formatNumeroConciliar(total) + "</td><td>—</td><td class=\"col-acciones\"><button type=\"button\" class=\"btn-small bancos-btn-vincular-factura-conciliar\" data-numero-factura=\"" + numEsc + "\" data-fecha-factura=\"" + fechaEsc + "\" data-cliente=\"" + clienteEsc + "\">Vincular</button></td>";
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
      thead.children[5].textContent = conciliarFacturaEsEntrada ? "" : "Estado";
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
        if (!numeroFactura && !fechaFactura && !cliente) return;
        btn.disabled = true;
        fetch("/api/bancos/conciliacion/confirmar-cliente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            movimiento_id: parseInt(conciliarFacturaMovId, 10),
            empresa_id: conciliarFacturaEmpresaId,
            numero_factura: numeroFactura || "",
            fecha_factura: fechaFactura || "",
            cliente: cliente || "",
          }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) { alert(data.error); btn.disabled = false; return; }
            cerrarModalConciliarFactura();
            cargarMovimientosBancos();
            alert(data.mensaje || "Entrada vinculada a factura de cliente.");
          })
          .catch(function () { alert("Error al vincular."); btn.disabled = false; });
      } else {
        if (!facId) return;
        btn.disabled = true;
        fetch("/api/bancos/conciliacion/confirmar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ movimiento_id: parseInt(conciliarFacturaMovId, 10), factura_proveedor_id: parseInt(facId, 10) }) })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) { alert(data.error); btn.disabled = false; return; }
            cerrarModalConciliarFactura();
            cargarMovimientosBancos();
            var listEl = document.getElementById("bancos-sugerencias-list");
            if (listEl && listEl.innerHTML) document.getElementById("bancos-btn-cargar-sugerencias").click();
            alert(data.mensaje || "Conciliación registrada.");
          })
          .catch(function () { alert("Error al vincular."); btn.disabled = false; });
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
          alert("Selecciona una empresa en el filtro de movimientos.");
          return;
        }
        abrirModalVincularExtracto(movId, empresaId);
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
          alert("Faltan datos del movimiento o empresa.");
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
            if (data.error) { alert(data.error); return; }
            cargarMovimientosBancos();
            if (typeof window.cargarLiquidacionesTarjetas === "function") window.cargarLiquidacionesTarjetas();
          })
          .catch(function () { alert("Error al desvincular."); })
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
        alert("Selecciona una empresa.");
        return;
      }
      var params = new URLSearchParams();
      params.set("empresa_id", empresaId);
      params.set("page", String(pagina));
      params.set("per_page", "10");
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
                  if (data.error) { alert(data.error); return; }
                  cargarMovimientosBancos();
                  cargarSugerenciasPagina(paginaSugerenciasActual);
                })
                .catch(function () { alert("Error al conciliar."); })
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
        alert("Elige una empresa para exportar los movimientos.");
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
          alert(n ? "Eliminados " + n + " movimiento(s) que solo tenían fecha." : (data.mensaje || "No había movimientos que eliminar."));
          cargarMovimientosBancos();
        })
        .catch(function () { alert("Error al eliminar."); })
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
  var filtroExtractosPeriodo = document.getElementById("extractos-filtro-periodo");
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
    if (!tarjetas || tarjetas.length === 0) {
      tbodyTarjetas.innerHTML = "<tr><td colspan=\"6\" class=\"sin-datos\">No hay tarjetas para esta empresa.</td></tr>";
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
          alert("Selecciona una empresa.");
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
            if (data.error) { alert(data.error); return; }
            cargarTarjetasBancos();
          })
          .catch(function () { alert("Error al actualizar la tarjeta."); })
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
    var filtroPeriodo = (filtroExtractosPeriodo && filtroExtractosPeriodo.value) || "";
    var filtradas = liqs.filter(function (l) {
      if (filtroTarjeta && String(l.tarjeta_id) !== filtroTarjeta) return false;
      if (filtroPeriodo && (l.periodo || "") !== filtroPeriodo) return false;
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
      var tarjetaLabel = (l.tarjeta_banco || "Banco") + " – " + (l.tarjeta_persona || "Titular");
      var ult4 = (l.tarjeta_alias || "").trim();
      if (ult4) tarjetaLabel += " (" + ult4 + ")";
      var estado = (l.estado || "pendiente");
      var totalMov = l.total_movimiento != null ? l.total_movimiento : 0;
      var pendiente = l.pendiente_facturas != null ? l.pendiente_facturas : (l.total_facturas || 0) + totalMov;
      var tid = l.tarjeta_id != null ? l.tarjeta_id : "";
      var per = (l.periodo || "").trim();
      var baseUrl = "/api/empresas/" + encodeURIComponent(empresaId) + "/tarjetas/extracto-export?tarjeta_id=" + encodeURIComponent(tid) + "&periodo=" + encodeURIComponent(per);
      var btnExcel = "<a href=\"" + baseUrl + "&tipo=excel\" target=\"_blank\" class=\"btn-small\" title=\"Descargar conciliación (facturas + movimiento bancario)\">Excel</a>";
      var btnFacturas = "<a href=\"" + baseUrl + "&tipo=facturas\" target=\"_blank\" class=\"btn-small\" title=\"Descargar facturas del extracto\">Facturas</a>";
      html += "<tr>";
      html += "<td>" + tarjetaLabel + "</td>";
      html += "<td>" + (l.periodo || "—") + "</td>";
      html += "<td class=\"numero\">" + (l.num_facturas != null ? String(l.num_facturas) : "0") + "</td>";
      html += "<td class=\"numero\">" + formatearNumeroES(l.total_facturas != null ? String(l.total_facturas) : null) + "</td>";
      html += "<td class=\"numero\">" + formatearNumeroES(totalMov) + "</td>";
      html += "<td class=\"numero\">" + formatearNumeroES(pendiente) + "</td>";
      html += "<td>" + estado.charAt(0).toUpperCase() + estado.slice(1) + "</td>";
      html += "<td class=\"bancos-conciliacion-btns\">" + btnExcel + " " + btnFacturas + "</td>";
      html += "</tr>";
    });
    tbodyLiquidaciones.innerHTML = html;
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
  if (filtroExtractosPeriodo) {
    filtroExtractosPeriodo.addEventListener("change", function () {
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
        alert("Selecciona primero una empresa para la tarjeta.");
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
        alert("Selecciona una empresa antes de crear una tarjeta.");
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
    var ruta = (item.ruta_archivo || "").trim() || "—";
    var div = document.createElement("div");
    div.className = "control-calidad-item";
    div.style.cssText = "border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;margin-bottom:8px;background:#f8fafc;";
    var erroresHtml = (item.errores || []).map(function (e) { return "<li>" + escapeHtml(e) + "</li>"; }).join("");
    div.innerHTML =
      "<strong>" + tipoLabel + "</strong> · Proveedor/Cliente: " + escapeHtml(prov) + " · Nº: " + escapeHtml(num) + " · Fecha: " + escapeHtml(fecha) + " · Ruta: " + escapeHtml(ruta) +
      "<ul class=\"control-calidad-errores\" style=\"margin:8px 0 0 18px;color:#b91c1c;\">" + erroresHtml + "</ul>" +
      "<p style=\"margin:10px 0 4px 0;\"><button type=\"button\" class=\"secondary btn-obtener-sugerencia\">Obtener sugerencia</button></p>" +
      "<div class=\"control-calidad-sugerencia-block\" style=\"display:none;margin-top:8px;padding:8px;background:#f1f5f9;border-radius:4px;\"></div>";
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
            bloqueSugerencia.innerHTML = "<p style=\"color:#64748b;\">No hay sugerencias automáticas para estos errores.</p><button type=\"button\" class=\"secondary\">Cerrar</button>";
            bloqueSugerencia.querySelector("button").addEventListener("click", function () { bloqueSugerencia.style.display = "none"; bloqueSugerencia.innerHTML = ""; });
          } else {
            var lineas = sug.map(function (s) {
              return "<strong>" + escapeHtml(s.campo) + "</strong>: " + escapeHtml(s.valor_actual) + " → " + escapeHtml(s.valor_sugerido) + ". " + escapeHtml(s.motivo || "");
            }).join("<br/>");
            bloqueSugerencia.innerHTML =
              "<p style=\"margin:0 0 8px 0;\"><strong>Sugerencia:</strong></p><p style=\"margin:0 0 8px 0;font-size:0.95em;\">" + lineas + "</p>" +
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
                  alert(err.message || "No se pudo aplicar la sugerencia.");
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
          bloqueSugerencia.innerHTML = "<p style=\"color:#b91c1c;\">Error al obtener sugerencia.</p>";
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
        listaEl.innerHTML = "<p style=\"color:#15803d;\">No hay facturas con problemas.</p>";
      } else {
        listaEl.innerHTML = "<p style=\"color:#64748b;\">Ninguna factura coincide con el filtro \"" + (filtroTipoError || "Todos") + "\".</p>";
      }
      return;
    }
    provF.forEach(function (item) { listaEl.appendChild(renderizarFacturaConErrores(item, "Proveedores", "proveedores")); });
    cliF.forEach(function (item) { listaEl.appendChild(renderizarFacturaConErrores(item, "Clientes", "clientes")); });
  }

  if (filtroEl) filtroEl.addEventListener("change", function () { renderListaControlCalidad(lastProv, lastCli, filtroEl.value); });
  if (exportarBtn) exportarBtn.addEventListener("click", function () {
    if (lastProv.length === 0 && lastCli.length === 0) { alert("No hay datos para exportar. Ejecuta antes un análisis."); return; }
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
        var numFacturas = prov.length + cli.length;
        var numErrores = prov.reduce(function (s, i) { return s + (i.errores || []).length; }, 0) + cli.reduce(function (s, i) { return s + (i.errores || []).length; }, 0);
        if (resumenEl) resumenEl.textContent = numFacturas + " factura(s) con problemas · " + numErrores + " error(es)";
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
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      "No se pudo contactar con el backend. Asegúrate de que está en ejecución.";
  } finally {
    form.querySelector("button[type=submit]").disabled = false;
  }
});

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
  { key: "retenciones_total", label: "Retenciones" },
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
      td.textContent = columnasNumericas.has(col.key) ? formatearNumeroES(raw || null) : (raw || "—");
      td.title = td.textContent;
      if (columnasNumericas.has(col.key)) td.classList.add("numero");
      tr.appendChild(td);
    });
    const tdAccion = document.createElement("td");
    const ruta = opts.getRutaVerFactura ? opts.getRutaVerFactura(f) : "";
    if (ruta) {
      const a = document.createElement("a");
      a.href = "/api/archivo?ruta=" + encodeURIComponent(ruta);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Ver factura";
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
  if (tarjetaId) {
    filtradas = filtradas.filter((f) => String(f.tarjeta_id || "") === tarjetaId);
  }

  if (filtroAlertasActivo) {
    filtradas = filtradas.filter(tieneAlerta);
  }

  if (!filtradas.length) {
    sinDatos.style.display = "block";
    sinDatos.textContent = filtroAlertasActivo
      ? "No hay facturas con alertas para los filtros seleccionados."
      : "No hay facturas cargadas para esta empresa. Sube facturas con el formulario de la izquierda.";
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
    total + " factura(s)" + (total > LIMITE_FILAS_TABLA ? " (mostrando primeras " + LIMITE_FILAS_TABLA + ")" : "");
  renderFacturasEnTbody(tbody, visibles, true);
  actualizarBotonEliminar();

  const btnAlertas = document.getElementById("btn-filtro-alertas");
  const totalConAlerta = FACTURAS_ACTUALES.filter(tieneAlerta).length;
  if (totalConAlerta > 0) {
    btnAlertas.style.display = "";
    if (filtroAlertasActivo) {
      btnAlertas.style.background = "#b91c1c";
      btnAlertas.style.color = "#fff";
      btnAlertas.textContent = "⚠ Alertas (" + filtradas.length + ") ✕";
    } else {
      btnAlertas.style.background = "#fef2f2";
      btnAlertas.style.color = "#b91c1c";
      btnAlertas.textContent = "⚠ Alertas (" + totalConAlerta + ")";
    }
  } else {
    btnAlertas.style.display = "none";
  }
}

async function cargarListado(empresaId) {
  const sinDatos = document.getElementById("sin-datos");
  FACTURAS_ACTUALES = [];
  // Orden por defecto: fecha más reciente primero
  sortStateFacturas.key = "fecha_factura";
  sortStateFacturas.dir = "desc";
  filtroAlertasActivo = false;
  document.getElementById("btn-filtro-alertas").style.display = "none";
  document.getElementById("tbody-facturas").innerHTML = "";
  document.getElementById("contador").textContent = "";
  sinDatos.style.display = "none";

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
      selTarjeta.innerHTML = "<option value=\"\">Todas las tarjetas</option>";
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
  }
}

document.getElementById("btn-cargar-listado").addEventListener("click", () => {
  const emp = document.getElementById("empresa-listado").value;
  if (!emp) {
    alert("Elige primero una empresa.");
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
    alert("No hay empresa seleccionada.");
    return;
  }
  const n = checks.length;
  if (!confirm("¿Seguro que quieres eliminar " + n + " factura(s)? Esta acción no se puede deshacer.")) return;
  const rutas = Array.from(checks).map((cb) => cb.dataset.ruta).filter(Boolean);
  if (!rutas.length) {
    alert("Las facturas seleccionadas no tienen ruta identificable.");
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
    alert(json.mensaje || "Facturas eliminadas.");
    cargarListado(emp);
  } catch (err) {
    alert(err.message || "No se pudieron eliminar las facturas.");
  }
});

document.getElementById("btn-exportar").addEventListener("click", () => {
  const emp = document.getElementById("empresa-listado").value;
  if (!emp) {
    alert("Elige primero una empresa para exportar.");
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
    alert("Elige primero una empresa para descargar las facturas.");
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
      } catch (e) {
        alert(e.message || "Error al guardar el centro de coste.");
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
  try {
    const resp = await fetch("/api/proveedores?empresa_id=" + encodeURIComponent(emp));
    const json = await resp.json();
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
    alert("Selecciona primero una empresa.");
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
    const resp = await fetch("/api/proveedores?empresa_id=" + encodeURIComponent(emp));
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
        alert(data.error || "Error al eliminar.");
        return;
      }
      cerrarModalProveedor();
      await refrescarListaProveedores();
      alert(data.mensaje || "Proveedor eliminado del maestro.");
    } catch (err) {
      alert("Error de conexión al eliminar.");
    }
  });
}

formProveedorEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const empresaId = document.getElementById("proveedor-empresa-id").value.trim();
  const nombre = document.getElementById("proveedor-nombre").value.trim();
  const nif = document.getElementById("proveedor-nif").value.trim();
  if (!empresaId && modalProveedorModo === "nuevo") {
    alert("La empresa es obligatoria.");
    return;
  }
  if (!nombre) {
    alert("El nombre del proveedor es obligatorio.");
    document.getElementById("proveedor-nombre").focus();
    return;
  }
  if (!nif) {
    alert("El NIF/CIF del proveedor es obligatorio.");
    document.getElementById("proveedor-nif").focus();
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
      alert(data.error || "Error al guardar el proveedor.");
      return;
    }
    if (typeof window.AL_CERRAR_PROVEEDOR_DESDE_FACTURA === "function") {
      window.AL_CERRAR_PROVEEDOR_DESDE_FACTURA(data);
    }
    cerrarModalProveedor();
    await refrescarListaProveedores();
  } catch (err) {
    alert("Error de conexión al guardar el proveedor.");
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
  contadorFacturasProveedor.textContent = filtradas.length + " factura(s)";
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
    alert("Elige empresa y un proveedor.");
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
    alert("Elige empresa y un proveedor.");
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
    alert("Selecciona primero una empresa en el listado de facturas.");
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
    alert("No hay empresa seleccionada.");
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
  } catch (err) {
    alert(err.message || "No se pudo guardar la factura.");
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
  { key: "num_hincadoras", label: "Hincadoras" },
  { key: "num_ayudantes", label: "Ayudantes" },
  { key: "pricing_servicio", label: "P. Servicio" },
  { key: "pricing_transporte", label: "P. Transporte" },
  { key: "iva", label: "IVA" },
  { key: "total_a_pagar", label: "Total a pagar" },
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
    total + " factura(s)" + (total > LIMITE_FILAS_TABLA ? " (mostrando primeras " + LIMITE_FILAS_TABLA + ")" : "");
}

function poblarFiltroAnioCli() {
  const sel = document.getElementById("cli-filtro-anio");
  const vals = new Set();
  CLI_FACTURAS.forEach((f) => { const y = (f.fecha_factura || "").slice(0, 4); if (/^\d{4}$/.test(y)) vals.add(y); });
  sel.innerHTML = "<option value=\"\">Todos los años</option>";
  Array.from(vals).sort().forEach((y) => { const o = document.createElement("option"); o.value = y; o.textContent = y; sel.appendChild(o); });
}

async function cargarListadoCli(empresaId) {
  CLI_FACTURAS = [];
  // Orden por defecto: fecha más reciente primero
  sortStateCli.key = "fecha_factura";
  sortStateCli.dir = "desc";
  document.getElementById("tbody-clientes-facturas").innerHTML = "";
  document.getElementById("cli-contador").textContent = "";
  document.getElementById("cli-sin-datos").style.display = "none";
  document.getElementById("cli-btn-eliminar").classList.remove("visible");
  try {
    const resp = await fetch("/api/facturas_clientes?empresa_id=" + encodeURIComponent(empresaId));
    const json = await resp.json();
    CLI_FACTURAS = json.facturas || [];
    poblarFiltroAnioCli();
    renderTablaClientesFacturas();
  } catch (e) {
    document.getElementById("cli-sin-datos").textContent = "Error al cargar las facturas de clientes.";
    document.getElementById("cli-sin-datos").style.display = "block";
  }
}

document.getElementById("cli-btn-cargar").addEventListener("click", () => {
  const emp = document.getElementById("cli-empresa-listado").value;
  if (!emp) { alert("Elige primero una empresa."); return; }
  cargarListadoCli(emp);
});
document.getElementById("cli-empresa-listado").addEventListener("change", () => {
  const emp = document.getElementById("cli-empresa-listado").value;
  if (emp) cargarListadoCli(emp);
});
document.getElementById("cli-filtro-anio").addEventListener("change", renderTablaClientesFacturas);
document.getElementById("cli-filtro-mes").addEventListener("change", renderTablaClientesFacturas);

document.getElementById("cli-btn-exportar").addEventListener("click", () => {
  const emp = document.getElementById("cli-empresa-listado").value;
  if (!emp) { alert("Elige primero una empresa para exportar."); return; }
  const anio = document.getElementById("cli-filtro-anio").value || "";
  const mes = document.getElementById("cli-filtro-mes").value || "";
  window.open("/api/facturas_clientes_export?empresa_id=" + encodeURIComponent(emp) + "&year=" + encodeURIComponent(anio) + "&month=" + encodeURIComponent(mes), "_blank");
});

document.getElementById("cli-btn-descargar-facturas").addEventListener("click", () => {
  const emp = document.getElementById("cli-empresa-listado").value;
  if (!emp) { alert("Elige primero una empresa para descargar."); return; }
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
      msg += ` ${resumen.facturas_procesadas} factura(s) procesada(s).`;
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
  if (!emp) { alert("No hay empresa seleccionada."); return; }
  if (!confirm("¿Seguro que quieres eliminar " + checks.length + " factura(s) de cliente? Esta acción no se puede deshacer.")) return;
  const indices = Array.from(checks).map((c) => parseInt(c.dataset.idx, 10));
  try {
    const resp = await fetch("/api/facturas_clientes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: emp, indices }),
    });
    if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || "Error"); }
    const json = await resp.json();
    alert(json.mensaje || "Eliminadas.");
    cargarListadoCli(emp);
  } catch (err) {
    alert(err.message || "No se pudieron eliminar.");
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
    alert("Selecciona primero una empresa en el listado de facturas.");
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
  if (!emp) { alert("No hay empresa seleccionada."); return; }
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
    try {
      if (typeof clienteSeleccionadoNombre !== "undefined" && clienteSeleccionadoNombre) {
        const empCli = document.getElementById("empresa-clientes-listado");
        if (empCli && empCli.value === emp) cargarFacturasCliente(emp, clienteSeleccionadoNombre);
      }
    } catch (_) {}
  } catch (err) {
    alert(err.message || "No se pudo guardar.");
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
  try {
    const resp = await fetch("/api/empresas/" + encodeURIComponent(emp) + "/clientes");
    const json = await resp.json();
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
    alert("Selecciona primero una empresa.");
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
        alert(data.error || "Error al eliminar.");
        return;
      }
      cerrarModalCliente();
      await refrescarListaClientes();
      alert(data.mensaje || "Cliente eliminado del maestro.");
    } catch (err) {
      alert("Error de conexión al eliminar.");
    }
  });
}

formClienteEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const empresaId = document.getElementById("cliente-empresa-id").value.trim();
  const nombre = document.getElementById("cliente-nombre").value.trim();
  const cif = document.getElementById("cliente-cif").value.trim();
  if (!empresaId && modalClienteModo === "nuevo") {
    alert("La empresa es obligatoria.");
    return;
  }
  if (!nombre) {
    alert("El nombre del cliente es obligatorio.");
    document.getElementById("cliente-nombre").focus();
    return;
  }
  if (!cif) {
    alert("El CIF/NIF del cliente es obligatorio.");
    document.getElementById("cliente-cif").focus();
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
      alert(data.error || "Error al guardar el cliente.");
      return;
    }
    if (typeof window.AL_CERRAR_CLIENTE_DESDE_FACTURA === "function") {
      window.AL_CERRAR_CLIENTE_DESDE_FACTURA(data, nombre, cif);
    }
    cerrarModalCliente();
    await refrescarListaClientes();
  } catch (err) {
    alert("Error de conexión al guardar el cliente.");
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
    total + " factura(s)" + (total > LIMITE_FILAS_TABLA ? " (mostrando primeras " + LIMITE_FILAS_TABLA + ")" : "");
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
  { key: "num_hincadoras", label: "Nº hincadoras" },
  { key: "num_ayudantes", label: "Nº ayudantes" },
  { key: "pricing_servicio", label: "P. servicio", numeric: true },
  { key: "pricing_transporte", label: "P. transporte", numeric: true },
  { key: "iva", label: "IVA", numeric: true },
  { key: "total_a_pagar", label: "Total a pagar", numeric: true },
];

const CLI_LISTADO_NUM = new Set(CLI_LISTADO_COLS.filter((c) => c.numeric).map((c) => c.key));

function renderClienteListadoThead() {
  const tr = document.querySelector("#tabla-facturas-cliente-listado thead tr");
  tr.innerHTML = "";
  CLI_LISTADO_COLS.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.label;
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
  facturas.forEach((f) => {
    const tr = document.createElement("tr");
    CLI_LISTADO_COLS.forEach((col) => {
      const td = document.createElement("td");
      const raw = (f[col.key] ?? "").toString().trim();
      td.textContent = CLI_LISTADO_NUM.has(col.key) ? formatearNumeroES(raw || null) : (raw || "—");
      td.title = td.textContent;
      if (CLI_LISTADO_NUM.has(col.key)) td.classList.add("numero");
      tr.appendChild(td);
    });
    const tdAcc = document.createElement("td");
    const ruta = (f.ruta_archivo || "").trim();
    if (ruta) {
      const a = document.createElement("a");
      a.href = "/api/archivo?ruta=" + encodeURIComponent(ruta);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Ver factura";
      a.className = "link-ver-factura";
      tdAcc.appendChild(a);
    }
    const btnEd = document.createElement("button");
    btnEd.type = "button";
    btnEd.className = "btn-editar-factura";
    btnEd.title = "Editar";
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
  if (!emp || !clienteSeleccionadoNombre) { alert("Selecciona una empresa y un cliente."); return; }
  const anio = filtroAnioClienteListado.value || "";
  const mes = filtroMesClienteListado.value || "";
  window.open("/api/facturas_clientes_export?empresa_id=" + encodeURIComponent(emp) + "&year=" + encodeURIComponent(anio) + "&month=" + encodeURIComponent(mes) + "&cliente=" + encodeURIComponent(clienteSeleccionadoNombre), "_blank");
});

document.getElementById("cli-listado-btn-descargar").addEventListener("click", () => {
  const emp = empresaClientesListadoEl.value;
  if (!emp || !clienteSeleccionadoNombre) { alert("Selecciona una empresa y un cliente."); return; }
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

  if (btnNuevoProveedor) {
    btnNuevoProveedor.addEventListener("click", function () {
      alert("Funcionalidad para incorporar un nuevo transportista pendiente de definir (v1).");
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

  if (btnEnviarWhatsapp) {
    btnEnviarWhatsapp.addEventListener("click", function () {
      if (!listaContainer) return;
      var checks = listaContainer.querySelectorAll(".transporte-list-select:checked");
      if (!checks.length) {
        alert("Selecciona al menos un proveedor para enviarles un WhatsApp.");
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

    if (placeholderEl) {
      placeholderEl.classList.add("oculto");
      placeholderEl.style.display = "none";
    }
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

        ultimoContextoWhatsapp = {
          rutaTexto: rutaTexto,
          distancia_km: distKm,
          duracion_min: durMin,
        };

        if (mensajeWhatsappEl && !mensajeWhatsappEl.value.trim()) {
          mensajeWhatsappEl.value = obtenerMensajeWhatsappPorDefecto();
        }

        if (listaResumenEl) {
          if (proveedores.length) {
            listaResumenEl.textContent = proveedores.length + " proveedor(es) en la ruta (ordenados por cercanía).";
          } else {
            listaResumenEl.textContent = "No hay proveedores en la ruta para los criterios actuales.";
          }
        }
        if (listaContainer && proveedores.length === 0) {
          var vacio = document.createElement("div");
          vacio.className = "transporte-list-empty";
          vacio.textContent = "Sin proveedores para esta ruta.";
          listaContainer.appendChild(vacio);
        }

        if (typeof L === "undefined") {
          mostrarEstado("Error: no se pudo cargar el mapa (Leaflet). Recarga la página.", true);
          if (placeholderEl) {
            placeholderEl.classList.remove("oculto");
            placeholderEl.style.display = "";
          }
          return;
        }

        if (placeholderEl) {
          placeholderEl.classList.add("oculto");
          placeholderEl.style.display = "none";
        }

        clearMapLayers();
        if (mapContainer) {
          mapContainer.style.minHeight = "450px";
          mapContainer.style.height = "100%";
        }
        setTimeout(function () {
          try {
            initMap();
          } catch (err) {
            console.error("Leaflet initMap error:", err);
            mostrarEstado("Error al crear el mapa: " + (err.message || String(err)), true);
            if (placeholderEl) {
              placeholderEl.classList.remove("oculto");
              placeholderEl.style.display = "";
            }
            return;
          }
          if (!mapInstance) return;

          if (coords.length >= 2) {
            var latlngs = coords.map(function (c) { return [c[0], c[1]]; });
            routeLayer = L.polyline(latlngs, { color: "#1e40af", weight: 5, opacity: 0.8 }).addTo(mapInstance);

            var iconOrigen = L.divIcon({
              className: "transporte-marker-origen",
              html: "<span class=\"transporte-marker-pin\" title=\"Origen\">O</span>",
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });
            var iconDestino = L.divIcon({
              className: "transporte-marker-destino",
              html: "<span class=\"transporte-marker-pin\" title=\"Destino\">D</span>",
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });
            originMarker = L.marker(latlngs[0], { icon: iconOrigen }).addTo(mapInstance);
            originMarker.bindTooltip("Origen: " + escapeHtml(origen), { permanent: true, direction: "top", className: "transporte-tooltip-origen", offset: [0, -14] });
            destMarker = L.marker(latlngs[latlngs.length - 1], { icon: iconDestino }).addTo(mapInstance);
            destMarker.bindTooltip("Destino: " + escapeHtml(destino), { permanent: true, direction: "top", className: "transporte-tooltip-destino", offset: [0, -14] });

            var paradasCoords = (ruta.paradas_coords || []);
            if (paradasCoords.length > 0) {
              waypointsLayer = L.layerGroup().addTo(mapInstance);
              paradasCoords.forEach(function (pa) {
                var lat = pa.lat;
                var lon = pa.lon;
                if (lat == null || lon == null) return;
                var num = pa.numero != null ? pa.numero : 0;
                var nombreParada = (pa.nombre || "").trim() || ("Parada " + num);
                var iconParada = L.divIcon({
                  className: "transporte-marker-parada",
                  html: "<span class=\"transporte-marker-pin\" title=\"Parada " + num + "\">P" + num + "</span>",
                  iconSize: [24, 24],
                  iconAnchor: [12, 12],
                });
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
          setTimeout(function () {
            if (mapInstance && mapInstance.invalidateSize) mapInstance.invalidateSize();
          }, 300);

          markersLayer = L.layerGroup().addTo(mapInstance);
          proveedoresDatos = proveedores.slice();
          var iconProveedor = L.divIcon({
            className: "transporte-marker-proveedor",
            html: "<span class=\"transporte-marker-pin transporte-marker-pin-proveedor\" title=\"Proveedor\">🚚</span>",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          proveedores.forEach(function (p, idx) {
            var lat = p.lat;
            var lon = p.lon;
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
            marker.on("click", function () {
              marcarProveedorActivo(idx, false);
            });
          });
        }, 50);
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