// ═══ HELPERS — funciones compartidas ═══

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
window.marcarCampoError = marcarCampoError;

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
window.actualizarContextosEmpresa = actualizarContextosEmpresa;

function _finFmtCompact(val) {
  if (!val && val !== 0) return "\u2014";
  var num = Number(val);
  if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(1) + "M \u20ac";
  if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + "k \u20ac";
  return num.toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " \u20ac";
}
window._finFmtCompact = _finFmtCompact;

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
window.formatearNumeroES = formatearNumeroES;

// Global HTML escape (used by Tesoreria and CRM IIFEs)
function _esc(s) {
  if (!s) return "";
  var d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
window._esc = _esc;
