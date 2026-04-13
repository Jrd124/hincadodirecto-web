// ═══ FINANZAS — dashboard, facturas, bancos, tesorería ═══

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
            '<td style="padding:8px 12px;white-space:nowrap;font-size:12px;font-weight:600;color:var(--color-primary);">' + _esc(p.codigo || "") + '</td>' +
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
                        '<th style="text-align:left;padding:8px 12px;font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Codigo</th>' +
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

window.cargarFinanzasInicio = cargarFinanzasInicio;

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
      var rrhhTipo = m.rrhh_tipo || "";
      // Factura conciliation — only if actually linked to a factura (not just conciliado_at from RRHH)
      var tieneFactura = m.factura_proveedor_id || m.factura_cliente_id || m.factura_cliente_key || m.multi_n_facturas;
      if (conciliadoAt && tieneFactura && !rrhhTipo) {
        var fLine = "<span class=\"cel-flex\">";
        if (m.multi_n_facturas) {
          fLine += "<span class=\"badge-conciliado\">Cobro \u2192 " + m.multi_n_facturas + " fact.</span>";
          fLine += "<button type=\"button\" class=\"btn-small bancos-btn-ver-multi\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" data-empresa-id=\"" + ((m.empresa_id || "") + "").replace(/\"/g, "&quot;") + "\" title=\"Ver facturas vinculadas\">Ver</button>";
        } else {
          fLine += "<span class=\"badge-conciliado\">Factura</span>";
          if (facturaRuta) {
            var rutaEsc = encodeURIComponent(facturaRuta);
            fLine += "<a href=\"/api/archivo?ruta=" + rutaEsc + "\" target=\"_blank\" class=\"btn-small\" title=\"Abrir factura\">Ver</a>";
          }
        }
        fLine += "<button type=\"button\" class=\"btn-small bancos-btn-desvincular\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" title=\"Quitar vinculaci\u00f3n\">Desvincular</button>";
        fLine += "</span>";
        vincParts.push(fLine);
      }
      // Seguro conciliado
      var seguroPolizaId = m.seguro_poliza_id;
      if (seguroPolizaId && conciliadoAt) {
        vincParts.push("<span class=\"cel-flex\"><span class=\"badge-conciliado\" style=\"background:#EDE9FE;color:#5B21B6;\">Seguro</span><button type=\"button\" onclick=\"segurosVerDetalle(" + seguroPolizaId + ")\" style=\"background:none;border:none;cursor:pointer;padding:2px 6px;color:var(--color-primary);font-size:12px;\" onmouseover=\"this.style.textDecoration='underline'\" onmouseout=\"this.style.textDecoration='none'\">Ver</button><button type=\"button\" class=\"btn-small bancos-btn-desvincular-seguro\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" data-poliza-id=\"" + seguroPolizaId + "\" title=\"Desvincular seguro\">Desvincular</button></span>");
      }
      // Albarán conciliado
      var albaranIds = m.albaran_ids;
      if (albaranIds && conciliadoAt) {
        vincParts.push("<span class=\"cel-flex\"><span class=\"badge-conciliado\" style=\"background:#FEF3C7;color:#92400E;\">Albar\u00e1n</span><button type=\"button\" class=\"btn-small bancos-btn-desvincular-albaran\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" title=\"Desvincular albar\u00e1n\">Desvincular</button></span>");
      }
      // RRHH conciliado
      if (rrhhTipo && conciliadoAt) {
        var rrhhLabels = { adelanto: "Adelanto", nomina: "Nómina", seguridad_social: "Seg. Social", irpf: "IRPF" };
        var rrhhColors = { adelanto: "background:#FEF3C7;color:#92400E;", nomina: "background:#DBEAFE;color:#1E40AF;", seguridad_social: "background:#F3E8FF;color:#6B21A8;", irpf: "background:#FEE2E2;color:#991B1B;" };
        var rrhhLabel = rrhhLabels[rrhhTipo] || rrhhTipo;
        vincParts.push("<span class=\"cel-flex\"><span class=\"badge-conciliado\" style=\"" + (rrhhColors[rrhhTipo] || "") + "\">" + rrhhLabel + "</span><button type=\"button\" class=\"btn-small bancos-btn-desvincular-rrhh\" data-mov-id=\"" + (m.id != null ? m.id : "") + "\" title=\"Desvincular RRHH\">Desvincular</button></span>");
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
      // Conciliar button — different rules for cobros (positive) vs pagos (negative)
      if (vincParts.length === 0 && !conciliadoAt) {
        var conceptoLower = ((m.concepto || "") + "").toLowerCase();
        var impNum = Number(m.importe) || 0;
        var _segKw = ["diaz saco", "brokers", "correduria de seguros", "correduría de seguros",
          "mutua madrilena", "mutua madrileña", "mutua",
          "mapfre", "allianz", "axa", "zurich", "generali", "liberty",
          "catalana occidente", "pelayo", "linea directa", "línea directa",
          "seguro", "prima seguro", "recibo seguro"];
        var esSeguro = false;
        for (var ski = 0; ski < _segKw.length; ski++) {
          if (conceptoLower.indexOf(_segKw[ski]) >= 0) { esSeguro = true; break; }
        }
        var movDataAttrs = " data-mov-id=\"" + (m.id != null ? m.id : "") + "\" data-empresa-id=\"" + ((m.empresa_id || "") + "").replace(/\"/g, "&quot;") + "\" data-concepto=\"" + ((m.concepto || "") + "").replace(/\"/g, "&quot;") + "\" data-fecha=\"" + ((m.fecha_operacion || "") + "").replace(/\"/g, "&quot;") + "\" data-importe=\"" + (m.importe != null ? String(m.importe) : "").replace(/\"/g, "&quot;") + "\"";
        if (esSeguro && impNum < 0) {
          // Cargo de seguro → conciliar con póliza
          vincParts.push("<button type=\"button\" class=\"btn-small bancos-btn-conciliar-seguro\"" + movDataAttrs + " title=\"Conciliar con póliza de seguro\" style=\"background:#7C3AED;color:white;\">Conciliar póliza</button>");
        } else {
          var excluido = false;
          if (impNum > 0) {
            excluido = conceptoLower.indexOf("traspaso") >= 0 || conceptoLower.indexOf("transferencia propia") >= 0;
          } else {
            var pagosExcluir = ["nomina", "nómina", "salario", "ss empresa", "seguridad social",
              "adelanto empleado", "liquidación tarjeta", "liquidacion tarjeta", "cargo tarjeta",
              "traspaso", "transferencia propia", "impuesto", "hacienda", "aeat", "tgss"];
            for (var ei = 0; ei < pagosExcluir.length; ei++) {
              if (conceptoLower.indexOf(pagosExcluir[ei]) >= 0) { excluido = true; break; }
            }
          }
          if (!excluido) {
            vincParts.push("<button type=\"button\" class=\"btn-small bancos-btn-conciliar-factura\"" + movDataAttrs + " title=\"Vincular a factura\">Conciliar</button>");
            if (impNum < 0) {
              vincParts.push("<button type=\"button\" class=\"btn-small bancos-btn-conciliar-albaran\"" + movDataAttrs + " title=\"Conciliar con albar\u00e1n\" style=\"font-size:11px;opacity:0.7;\">Albar\u00e1n</button>");
              vincParts.push("<button type=\"button\" class=\"btn-small bancos-btn-conciliar-seguro\"" + movDataAttrs + " title=\"Conciliar con p\u00f3liza de seguro\" style=\"font-size:11px;opacity:0.7;\">Seguro</button>");
              vincParts.push("<button type=\"button\" class=\"btn-small\" onclick=\"_abrirModalRrhhBanco(this)\"" + movDataAttrs + " style=\"font-size:11px;opacity:0.7;background:#F3E8FF;color:#6B21A8;\">RRHH</button>");
            }
          } else if (impNum < 0) {
            // Excluded movements (RRHH keywords etc) — still offer RRHH classification
            vincParts.push("<button type=\"button\" class=\"btn-small\" onclick=\"_abrirModalRrhhBanco(this)\"" + movDataAttrs + " style=\"background:#F3E8FF;color:#6B21A8;\">RRHH</button>");
          }
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

  // Ver detalle conciliación múltiple
  if (tbody) {
    tbody.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".bancos-btn-ver-multi");
      if (!btn) return;
      var movId = btn.getAttribute("data-mov-id");
      var multiEmpresaId = btn.getAttribute("data-empresa-id") || "";
      if (!movId) return;
      btn.disabled = true;
      fetch("/api/bancos/conciliacion/detalle-multi/" + movId)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var fmt = typeof formatearNumeroES === "function" ? formatearNumeroES : String;
          var html = '<div style="padding:20px;max-width:600px;">';
          html += '<h3 style="margin:0 0 12px;">Cobro de ' + fmt(d.importe) + ' \u20AC \u2014 ' + (d.fecha || "?") + '</h3>';
          var eyeSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
          html += '<table class="tabla-generica" style="width:100%;"><thead><tr><th>N\u00BA Factura</th><th>Cliente</th><th class="numero">Importe factura</th><th class="numero">Aplicado</th><th style="width:40px;"></th></tr></thead><tbody>';
          (d.facturas || []).forEach(function (f) {
            html += '<tr><td>' + (f.numero_factura || "?") + '</td><td>' + (f.cliente || "?") + '</td>';
            html += '<td class="numero">' + fmt(f.total_factura) + ' \u20AC</td>';
            html += '<td class="numero">' + fmt(f.importe_aplicado) + ' \u20AC</td>';
            html += '<td style="text-align:center;"><button class="btn-ver-factura-multi" data-fid="' + (f.factura_cliente_id || "") + '" title="Ver factura" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--color-text-secondary);" onmouseover="this.style.color=\'var(--color-primary)\'" onmouseout="this.style.color=\'var(--color-text-secondary)\'">' + eyeSvg + '</button></td></tr>';
          });
          html += '</tbody></table>';
          html += '<p style="margin:12px 0 0;font-weight:600;">Total aplicado: ' + fmt(d.total_aplicado) + ' \u20AC</p>';
          html += '<div style="margin-top:16px;display:flex;gap:8px;">';
          html += '<button onclick="this.closest(\'.modal-overlay\').classList.remove(\'visible\')" class="secondary">Cerrar</button>';
          html += '<button class="danger" id="btn-desvincular-multi-todo" data-mov-id="' + movId + '">Desvincular todo</button>';
          html += '</div></div>';
          // Reuse a generic overlay or create one
          var overlay = document.getElementById("modal-detalle-multi-overlay");
          if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "modal-detalle-multi-overlay";
            overlay.className = "modal-overlay";
            overlay.innerHTML = '<div class="modal-editar" role="dialog" id="modal-detalle-multi-body"></div>';
            overlay.addEventListener("click", function (ev) { if (ev.target === overlay) overlay.classList.remove("visible"); });
            document.body.appendChild(overlay);
          }
          document.getElementById("modal-detalle-multi-body").innerHTML = html;
          overlay.classList.add("visible");
          // Ver factura individual
          overlay.querySelectorAll(".btn-ver-factura-multi").forEach(function (b) {
            b.addEventListener("click", function () {
              var fid = b.getAttribute("data-fid");
              if (!fid) return;
              overlay.classList.remove("visible");
              // Fetch factura and open edit modal
              fetch("/api/facturas_clientes?empresa_id=" + encodeURIComponent(multiEmpresaId || "") + "&_t=" + Date.now(), {cache: "no-store"})
                .then(function (r) { return r.json(); })
                .then(function (data) {
                  var fac = (data.facturas || []).find(function (f) { return String(f.id) === String(fid); });
                  if (fac && typeof abrirModalEdicionCli === "function") abrirModalEdicionCli(fac);
                  else mostrarToast("Factura no encontrada", "error");
                })
                .catch(function () { mostrarToast("Error cargando factura", "error"); });
            });
          });
          // Desvincular todo
          var btnDesv = document.getElementById("btn-desvincular-multi-todo");
          if (btnDesv) {
            btnDesv.addEventListener("click", function () {
              if (!confirm("¿Desvincular TODAS las facturas de este cobro?")) return;
              btnDesv.disabled = true;
              btnDesv.textContent = "Desvinculando...";
              fetch("/api/bancos/conciliacion/desvincular", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ movimiento_id: parseInt(movId, 10) }),
              })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                  overlay.classList.remove("visible");
                  if (data.error) { mostrarToast(data.error, "error"); return; }
                  cargarMovimientosBancos();
                  mostrarToast(data.mensaje || "Desvinculación completada.", "success");
                })
                .catch(function () { mostrarToast("Error al desvincular.", "error"); btnDesv.disabled = false; });
            });
          }
        })
        .catch(function () { mostrarToast("Error cargando detalle.", "error"); })
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
  var conciliarFacturaImporte = 0;
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

  function _parseImporteFactura(f) {
    var v = f.total_a_pagar != null ? f.total_a_pagar : (f.total_factura != null ? f.total_factura : f.total);
    if (v == null) return 0;
    return Math.abs(parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0);
  }

  function renderConciliarFacturasLista(facturas) {
    if (!tbodyConciliarFacturas) return;
    tbodyConciliarFacturas.innerHTML = "";
    // Remove old totals bar if any
    var oldBar = document.getElementById("conciliar-multi-totals");
    if (oldBar) oldBar.remove();
    var oldBtn = document.getElementById("btn-conciliar-multi-confirmar");
    if (oldBtn) oldBtn.remove();

    if (!facturas || facturas.length === 0) {
      if (conciliarFacturaSinDatos) conciliarFacturaSinDatos.style.display = "block";
      return;
    }
    if (conciliarFacturaSinDatos) conciliarFacturaSinDatos.style.display = "none";
    var esClientes = conciliarFacturaEsEntrada;

    if (esClientes) {
      // Multi-select mode for client invoices
      var thead = document.querySelector("#tabla-conciliar-facturas thead tr");
      if (thead) thead.innerHTML = '<th style="width:30px;"></th><th class="col-fecha">Fecha</th><th>Cliente</th><th>Nº</th><th class="numero">Pendiente</th><th class="numero" style="width:110px;">Aplicar</th>';

      facturas.forEach(function (f) {
        var tr = document.createElement("tr");
        var fecha = (f.fecha_factura || "").toString().trim() || "—";
        var numero = (f.numero_factura || "").toString().trim() || "—";
        var cliente = (f.cliente || "").toString().trim() || "—";
        var pendiente = _parseImporteFactura(f);
        tr.innerHTML = '<td><input type="checkbox" class="conciliar-multi-check" data-fid="' + (f.id || "") + '" data-pendiente="' + pendiente + '"></td>' +
          '<td class="col-fecha">' + fecha + '</td>' +
          '<td>' + cliente.replace(/</g, "&lt;") + '</td>' +
          '<td>' + numero.replace(/</g, "&lt;") + '</td>' +
          '<td class="numero">' + formatNumeroConciliar(pendiente) + '</td>' +
          '<td><input type="number" class="conciliar-multi-importe" data-fid="' + (f.id || "") + '" value="0" min="0" step="0.01" style="width:100px;font-size:12px;padding:2px 4px;text-align:right;" disabled></td>';
        tbodyConciliarFacturas.appendChild(tr);
      });

      // Totals bar
      var bar = document.createElement("div");
      bar.id = "conciliar-multi-totals";
      bar.style.cssText = "display:flex;align-items:center;gap:12px;margin-top:12px;padding:8px 12px;background:#F8FAFC;border-radius:6px;font-size:13px;";
      bar.innerHTML = '<span>Cobro: <strong>' + formatNumeroConciliar(conciliarFacturaImporte) + '</strong></span>' +
        '<span>Aplicado: <strong id="conciliar-multi-sum">0,00</strong></span>' +
        '<span id="conciliar-multi-diff" style="margin-left:auto;font-weight:600;"></span>';
      tbodyConciliarFacturas.closest(".tabla-wrapper").after(bar);

      // Confirm button
      var btn = document.createElement("button");
      btn.id = "btn-conciliar-multi-confirmar";
      btn.className = "primary";
      btn.style.cssText = "margin-top:8px;width:100%;padding:8px;font-size:14px;font-weight:600;";
      btn.textContent = "Conciliar seleccionadas";
      btn.disabled = true;
      bar.after(btn);

      // Event: checkbox toggles importe field
      tbodyConciliarFacturas.addEventListener("change", function (e) {
        if (e.target.classList.contains("conciliar-multi-check")) {
          var fid = e.target.getAttribute("data-fid");
          var inp = tbodyConciliarFacturas.querySelector('.conciliar-multi-importe[data-fid="' + fid + '"]');
          if (e.target.checked) {
            var pendiente = parseFloat(e.target.getAttribute("data-pendiente")) || 0;
            var remaining = conciliarFacturaImporte - _sumarAplicados();
            inp.value = Math.min(pendiente, Math.max(remaining, 0)).toFixed(2);
            inp.disabled = false;
          } else {
            inp.value = "0";
            inp.disabled = true;
          }
          _actualizarTotalesMulti();
        }
        if (e.target.classList.contains("conciliar-multi-importe")) {
          _actualizarTotalesMulti();
        }
      });
      tbodyConciliarFacturas.addEventListener("input", function (e) {
        if (e.target.classList.contains("conciliar-multi-importe")) _actualizarTotalesMulti();
      });

      // Confirm click
      btn.addEventListener("click", function () {
        var aplicaciones = [];
        tbodyConciliarFacturas.querySelectorAll(".conciliar-multi-check:checked").forEach(function (cb) {
          var fid = cb.getAttribute("data-fid");
          var inp = tbodyConciliarFacturas.querySelector('.conciliar-multi-importe[data-fid="' + fid + '"]');
          var imp = parseFloat(inp.value) || 0;
          if (imp > 0 && fid) aplicaciones.push({ factura_cliente_id: parseInt(fid), importe_aplicado: imp });
        });
        if (!aplicaciones.length) return;
        btn.disabled = true;
        btn.textContent = "Conciliando...";
        fetch("/api/bancos/conciliacion/confirmar-cliente-multiple", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movimiento_id: parseInt(conciliarFacturaMovId), empresa_id: conciliarFacturaEmpresaId, aplicaciones: aplicaciones }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) { mostrarToast(data.error, "error"); btn.disabled = false; btn.textContent = "Conciliar seleccionadas"; return; }
            cerrarModalConciliarFactura();
            cargarMovimientosBancos();
            mostrarToast(data.mensaje || "Conciliación múltiple registrada.", "success");
          })
          .catch(function () { mostrarToast("Error al conciliar.", "error"); btn.disabled = false; btn.textContent = "Conciliar seleccionadas"; });
      });

    } else {
      // Supplier: keep original single-select behavior
      facturas.forEach(function (f) {
        var tr = document.createElement("tr");
        var fecha = (f.fecha_factura || "").toString().trim() || "—";
        var numero = (f.numero_factura || "").toString().trim() || "—";
        var total = f.total_a_pagar != null ? f.total_a_pagar : (f.total_factura != null ? f.total_factura : f.total);
        var proveedor = (f.proveedor || "").toString().trim() || "—";
        var concepto = (f.resumen_concepto || "").toString().trim() || "—";
        var estado = ((f.estado_pago || "").toString().trim() || "pendiente").toLowerCase();
        tr.innerHTML = "<td class=\"col-fecha\">" + fecha + "</td><td>" + proveedor.replace(/</g, "&lt;") + "</td><td title=\"" + (concepto.replace(/"/g, "&quot;")) + "\">" + (concepto.length > 40 ? concepto.slice(0, 40) + "…" : concepto).replace(/</g, "&lt;") + "</td><td>" + numero.replace(/</g, "&lt;") + "</td><td class=\"numero\">" + formatNumeroConciliar(total) + "</td><td>" + (estado === "parcial" ? "Parcial" : "Pendiente") + "</td><td class=\"col-acciones\"><button type=\"button\" class=\"btn-small bancos-btn-vincular-factura-conciliar\" data-factura-id=\"" + (f.id != null ? f.id : "") + "\">Vincular</button></td>";
        tbodyConciliarFacturas.appendChild(tr);
      });
    }
  }

  function _sumarAplicados() {
    var total = 0;
    if (!tbodyConciliarFacturas) return 0;
    tbodyConciliarFacturas.querySelectorAll(".conciliar-multi-importe").forEach(function (inp) {
      if (!inp.disabled) total += parseFloat(inp.value) || 0;
    });
    return total;
  }

  function _actualizarTotalesMulti() {
    var sum = _sumarAplicados();
    var elSum = document.getElementById("conciliar-multi-sum");
    var elDiff = document.getElementById("conciliar-multi-diff");
    var btn = document.getElementById("btn-conciliar-multi-confirmar");
    if (elSum) elSum.textContent = formatNumeroConciliar(sum);
    var diff = conciliarFacturaImporte - sum;
    if (elDiff) {
      if (Math.abs(diff) < 0.01) {
        elDiff.textContent = "✓ Cuadra";
        elDiff.style.color = "#16A34A";
      } else if (diff > 0) {
        elDiff.textContent = "Sobrante: " + formatNumeroConciliar(diff);
        elDiff.style.color = "#D97706";
      } else {
        elDiff.textContent = "Excede: " + formatNumeroConciliar(Math.abs(diff));
        elDiff.style.color = "#DC2626";
      }
    }
    if (btn) btn.disabled = (sum <= 0 || sum > conciliarFacturaImporte + 0.02);
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
    conciliarFacturaImporte = Math.abs(Number(importe) || 0);
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
      fetch("/api/facturas_clientes?empresa_id=" + encodeURIComponent(empresaId) + "&solo_pendientes_vinculacion=1&_t=" + Date.now(), {cache: "no-store"}).then(function (r) { return r.json(); }).then(function (data) {
        conciliarFacturaLista = data.facturas || [];
        renderConciliarFacturasLista(conciliarFacturaLista);
      }).catch(function () {
        conciliarFacturaLista = [];
        if (tbodyConciliarFacturas) tbodyConciliarFacturas.innerHTML = "<tr><td colspan=\"7\" class=\"sin-datos\">Error al cargar facturas de clientes.</td></tr>";
      });
    } else {
      fetch("/api/facturas?empresa_id=" + encodeURIComponent(empresaId) + "&_t=" + Date.now(), {cache: "no-store"}).then(function (r) { return r.json(); }).then(function (data) {
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
      // ── Conciliar con póliza de seguro ──
      var btnConciliarSeguro = e.target && e.target.closest && e.target.closest(".bancos-btn-conciliar-seguro");
      if (btnConciliarSeguro) {
        var sMovId = btnConciliarSeguro.getAttribute("data-mov-id");
        var sConcepto = btnConciliarSeguro.getAttribute("data-concepto") || "";
        var sFecha = btnConciliarSeguro.getAttribute("data-fecha") || "";
        var sImporte = btnConciliarSeguro.getAttribute("data-importe") || "";
        if (sMovId) _abrirModalConciliarSeguro(sMovId, sConcepto, sFecha, sImporte);
        return;
      }
      // ── Desvincular seguro ──
      var btnDesvincularSeg = e.target && e.target.closest && e.target.closest(".bancos-btn-desvincular-seguro");
      if (btnDesvincularSeg) {
        var dsPolizaId = btnDesvincularSeg.getAttribute("data-poliza-id");
        if (!dsPolizaId) return;
        if (!confirm("¿Desvincular este movimiento de la póliza de seguro?")) return;
        btnDesvincularSeg.disabled = true;
        fetch("/api/seguros/desconciliar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ poliza_id: parseInt(dsPolizaId, 10) }) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d.error) { mostrarToast(d.error, "error"); return; }
            cargarMovimientosBancos();
            mostrarToast(d.mensaje || "Seguro desvinculado.", "success");
          })
          .catch(function () { mostrarToast("Error al desvincular.", "error"); })
          .finally(function () { btnDesvincularSeg.disabled = false; });
        return;
      }
      // ── Conciliar con albarán ──
      var btnConciliarAlbaran = e.target && e.target.closest && e.target.closest(".bancos-btn-conciliar-albaran");
      if (btnConciliarAlbaran) {
        var aMovId = btnConciliarAlbaran.getAttribute("data-mov-id");
        var aConcepto = btnConciliarAlbaran.getAttribute("data-concepto") || "";
        var aFecha = btnConciliarAlbaran.getAttribute("data-fecha") || "";
        var aImporte = btnConciliarAlbaran.getAttribute("data-importe") || "";
        if (aMovId) _abrirModalConciliarAlbaran(aMovId, aConcepto, aFecha, aImporte);
        return;
      }
      // ── Desvincular albarán ──
      var btnDesvincularAlb = e.target && e.target.closest && e.target.closest(".bancos-btn-desvincular-albaran");
      if (btnDesvincularAlb) {
        var daMovId = btnDesvincularAlb.getAttribute("data-mov-id");
        if (!daMovId) return;
        if (!confirm("\u00bfDesvincular albaranes de este movimiento?")) return;
        btnDesvincularAlb.disabled = true;
        fetch("/api/albaranes/desconciliar-banco", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ movimiento_id: parseInt(daMovId, 10) }) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d.error) { mostrarToast(d.error, "error"); return; }
            cargarMovimientosBancos();
            mostrarToast(d.mensaje || "Albaranes desvinculados.", "success");
          })
          .catch(function () { mostrarToast("Error al desvincular.", "error"); })
          .finally(function () { btnDesvincularAlb.disabled = false; });
        return;
      }
      // ── Conciliar RRHH ──
      var btnConcRrhh = e.target && e.target.closest && e.target.closest(".bancos-btn-conciliar-rrhh");
      if (btnConcRrhh) {
        var rMovId = btnConcRrhh.getAttribute("data-mov-id");
        var rConcepto = btnConcRrhh.getAttribute("data-concepto") || "";
        var rFecha = btnConcRrhh.getAttribute("data-fecha") || "";
        var rImporte = btnConcRrhh.getAttribute("data-importe") || "";
        if (rMovId) _abrirModalConciliarRrhh(rMovId, rConcepto, rFecha, rImporte);
        return;
      }
      // ── Desvincular RRHH ──
      var btnDesRrhh = e.target && e.target.closest && e.target.closest(".bancos-btn-desvincular-rrhh");
      if (btnDesRrhh) {
        var dMovId = btnDesRrhh.getAttribute("data-mov-id");
        if (dMovId && confirm("¿Desvincular clasificación RRHH?")) {
          fetch("/api/rrhh/banco/desclasificar", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({movimiento_id: parseInt(dMovId)}) })
            .then(function() { cargarMovimientosBancos(); });
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

  // ── Modal conciliar cargo bancario con póliza de seguro ──────────────
  function _abrirModalConciliarSeguro(movId, concepto, fecha, importe) {
    var existing = document.getElementById("modal-conciliar-seguro");
    if (existing) existing.remove();
    var absImporte = Math.abs(Number(importe) || 0);
    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-conciliar-seguro";
    modal.style.zIndex = "110";
    modal.addEventListener("click", function (ev) { if (ev.target === modal) modal.remove(); });
    modal.innerHTML =
      '<div class="modal-editar" role="dialog" style="max-width:500px;max-height:85vh;overflow-y:auto;">' +
        '<h2 style="margin:0 0 12px;font-size:18px;">Conciliar con p\u00f3liza de seguro</h2>' +
        '<div style="background:var(--color-bg-page, #F8FAFC);padding:12px;border-radius:8px;margin-bottom:16px;">' +
          '<div style="font-size:12px;color:var(--color-text-secondary);">Cargo bancario</div>' +
          '<div style="font-size:18px;font-weight:600;">' + absImporte.toLocaleString("es-ES", { minimumFractionDigits: 2 }) + ' \u20AC</div>' +
          '<div style="font-size:12px;color:var(--color-text-secondary);">' + (fecha || '\u2014') + ' \u00B7 ' + (concepto || '\u2014').replace(/</g, '&lt;') + '</div>' +
        '</div>' +
        '<div id="seg-conciliar-lista" style="margin-bottom:16px;"><p style="color:var(--color-text-secondary);font-size:13px;">Cargando p\u00f3lizas pendientes\u2026</p></div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
          '<button type="button" class="secondary" onclick="document.getElementById(\'modal-conciliar-seguro\').remove()">Cancelar</button>' +
          '<button type="button" class="primary" id="btn-confirmar-conciliar-seguro" disabled>Conciliar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    // Cargar pólizas pendientes de pago
    fetch("/api/seguros/polizas-pendientes-pago?_t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var polizas = data.polizas || [];
        var container = document.getElementById("seg-conciliar-lista");
        if (!polizas.length) {
          container.innerHTML = '<p style="color:var(--color-text-secondary);font-size:13px;font-style:italic;">No hay pólizas pendientes de pago.</p>';
          return;
        }
        var iconos = { maquinaria: "\uD83C\uDFD7\uFE0F", vehiculo: "\uD83D\uDE97", responsabilidad_civil: "\uD83C\uDFE2", accidentes_convenio: "\uD83D\uDC77", dyo: "\uD83D\uDC54", otro: "\uD83D\uDCCB" };
        var html = '';
        polizas.forEach(function (p) {
          var prima = Number(p.prima_anual || 0);
          var coincide = Math.abs(prima - absImporte) < 0.02;
          var borderExtra = coincide ? "border-color:#16A34A;background:#F0FDF4;" : "";
          html += '<div class="seg-poliza-card" data-id="' + p.id + '" style="display:flex;align-items:flex-start;gap:12px;padding:12px;border:1px solid var(--color-border-tertiary, #E5E7EB);border-radius:8px;cursor:pointer;margin-bottom:8px;' + borderExtra + '">' +
            '<input type="radio" name="seg-poliza-sel" value="' + p.id + '" style="flex-shrink:0;margin-top:3px;"' + (coincide ? ' checked' : '') + '>' +
            '<div style="flex:1;min-width:0;font-weight:normal;">' +
              '<div style="font-size:14px !important;font-weight:500 !important;margin-bottom:4px;">' + (iconos[p.tipo] || '') + ' ' + (p.descripcion || (p.tipo || '').replace(/_/g, ' ')) + (p.recurso_nombre ? ' \u2014 ' + p.recurso_nombre : '') + '</div>' +
              '<div style="font-size:12px !important;font-weight:400 !important;color:var(--color-text-secondary);margin-bottom:4px;">' + (p.aseguradora || '') + ' \u00B7 N\u00BA ' + (p.numero_poliza || '\u2014') + '</div>' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="font-size:13px;font-weight:500;">Prima: ' + prima.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' \u20AC</span>' +
                (coincide ? '<span style="font-size:11px;font-weight:600;padding:2px 8px;background:#DCFCE7;color:#166534;border-radius:10px;">\u2713 Coincide</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>';
        });
        container.innerHTML = html;
        var btnConfirmar = document.getElementById("btn-confirmar-conciliar-seguro");
        // Click on card selects the radio
        container.querySelectorAll(".seg-poliza-card").forEach(function (card) {
          card.addEventListener("click", function (ev) {
            if (ev.target.tagName === "INPUT") return; // already handled
            var radio = card.querySelector('input[type="radio"]');
            if (radio) { radio.checked = true; btnConfirmar.disabled = false; }
          });
        });
        // Enable button when a radio is selected
        container.addEventListener("change", function () {
          btnConfirmar.disabled = false;
        });
        // Enable if any radio is pre-checked (coincident match)
        if (container.querySelector('input[name="seg-poliza-sel"]:checked')) btnConfirmar.disabled = false;
      });
    // Confirmar conciliación
    document.getElementById("btn-confirmar-conciliar-seguro").addEventListener("click", function () {
      var sel = document.querySelector('input[name="seg-poliza-sel"]:checked');
      if (!sel) return;
      this.disabled = true;
      this.textContent = "Conciliando…";
      fetch("/api/seguros/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimiento_id: parseInt(movId, 10), poliza_id: parseInt(sel.value, 10), movimiento_fecha: fecha, movimiento_importe: importe }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { mostrarToast(d.error, "error"); return; }
          var m = document.getElementById("modal-conciliar-seguro"); if (m) m.remove();
          cargarMovimientosBancos();
          mostrarToast(d.mensaje || "Póliza conciliada.", "success");
        })
        .catch(function () { mostrarToast("Error al conciliar.", "error"); });
    });
  }

  // ── Modal conciliar movimiento con albarán ────────────────────────────
  function _abrirModalConciliarAlbaran(movId, concepto, fecha, importe) {
    var existing = document.getElementById("modal-conciliar-albaran");
    if (existing) existing.remove();
    var absImporte = Math.abs(Number(importe) || 0);
    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-conciliar-albaran";
    modal.style.zIndex = "110";
    modal.addEventListener("click", function (ev) { if (ev.target === modal) modal.remove(); });
    modal.innerHTML =
      '<div class="modal-editar" role="dialog" style="max-width:550px;max-height:85vh;overflow-y:auto;">' +
        '<h2 style="margin:0 0 12px;font-size:18px;">Conciliar con albar\u00e1n</h2>' +
        '<div style="background:var(--color-bg-page, #F8FAFC);padding:12px;border-radius:8px;margin-bottom:16px;">' +
          '<div style="font-size:12px;color:var(--color-text-secondary);">Cargo bancario</div>' +
          '<div style="font-size:20px;font-weight:600;">' + absImporte.toLocaleString("es-ES", { minimumFractionDigits: 2 }) + ' \u20AC</div>' +
          '<div style="font-size:12px;color:var(--color-text-secondary);">' + (fecha || '\u2014') + ' \u00B7 ' + (concepto || '\u2014').replace(/</g, '&lt;') + '</div>' +
        '</div>' +
        '<div id="alb-conciliar-lista" style="margin-bottom:12px;"><p style="color:var(--color-text-secondary);font-size:13px;">Cargando albaranes\u2026</p></div>' +
        '<div id="alb-conciliar-total" style="font-size:13px;font-weight:500;margin-bottom:12px;"></div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
          '<button type="button" class="secondary" onclick="document.getElementById(\'modal-conciliar-albaran\').remove()">Cancelar</button>' +
          '<button type="button" class="primary" id="btn-confirmar-conciliar-albaran" disabled>Conciliar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    // Cargar albaranes sin conciliar
    fetch("/api/albaranes/sin-conciliar?_t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var albaranes = data.albaranes || [];
        var container = document.getElementById("alb-conciliar-lista");
        if (!albaranes.length) {
          container.innerHTML = '<p style="color:var(--color-text-secondary);font-size:13px;font-style:italic;">No hay albaranes pendientes de conciliar.</p>';
          return;
        }
        var html = '';
        albaranes.forEach(function (a) {
          var total = Number(a.total || 0);
          html += '<div class="alb-conciliar-item" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--color-border-tertiary, #E5E7EB);border-radius:8px;margin-bottom:6px;">' +
            '<input type="checkbox" class="alb-check" data-id="' + a.id + '" data-total="' + total + '" style="flex-shrink:0;">' +
            '<div style="flex:1;min-width:0;font-weight:normal;">' +
              '<div style="font-size:13px !important;font-weight:500 !important;">#' + (a.numero_albaran || '?') + ' \u2014 ' + (a.proveedor || '?') + '</div>' +
              '<div style="font-size:12px !important;font-weight:400 !important;color:var(--color-text-secondary);">' + (a.fecha || '') + (a.proyecto_nombre ? ' \u00B7 ' + a.proyecto_nombre : '') + '</div>' +
            '</div>' +
            '<span style="font-size:13px;font-weight:600;white-space:nowrap;">' + total.toLocaleString("es-ES", { minimumFractionDigits: 2 }) + ' \u20AC</span>' +
          '</div>';
        });
        container.innerHTML = html;
        var btnConfirmar = document.getElementById("btn-confirmar-conciliar-albaran");
        var totalEl = document.getElementById("alb-conciliar-total");
        function _updateTotal() {
          var checks = container.querySelectorAll(".alb-check:checked");
          var sum = 0;
          checks.forEach(function (c) { sum += Number(c.dataset.total || 0); });
          btnConfirmar.disabled = checks.length === 0;
          var diff = Math.abs(sum - absImporte);
          var cuadra = diff < 0.02;
          totalEl.innerHTML = 'Total aplicado: ' + sum.toLocaleString("es-ES", { minimumFractionDigits: 2 }) + ' \u20AC / ' + absImporte.toLocaleString("es-ES", { minimumFractionDigits: 2 }) + ' \u20AC cargo' + (cuadra ? ' \u2014 <span style="color:#16A34A;">\u2713 Cuadra</span>' : '');
        }
        container.addEventListener("change", _updateTotal);
      });
    // Confirmar
    document.getElementById("btn-confirmar-conciliar-albaran").addEventListener("click", function () {
      var checks = document.querySelectorAll("#alb-conciliar-lista .alb-check:checked");
      if (!checks.length) return;
      this.disabled = true;
      this.textContent = "Conciliando\u2026";
      var albs = [];
      checks.forEach(function (c) { albs.push({ albaran_id: parseInt(c.dataset.id, 10) }); });
      fetch("/api/albaranes/conciliar-banco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimiento_id: parseInt(movId, 10), movimiento_fecha: fecha, movimiento_importe: importe, albaranes: albs }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { mostrarToast(d.error, "error"); return; }
          var m = document.getElementById("modal-conciliar-albaran"); if (m) m.remove();
          cargarMovimientosBancos();
          mostrarToast(d.mensaje || "Albaranes conciliados.", "success");
        })
        .catch(function () { mostrarToast("Error al conciliar.", "error"); });
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
      var totalMovRaw = l.total_movimiento != null ? Number(l.total_movimiento) : 0;
      var totalMov = Math.abs(totalMovRaw);  // extracto (cargo bancario) always positive
      var totalFact = l.total_facturas != null ? Math.abs(Number(l.total_facturas)) : 0;
      // Pendiente = cuánto del extracto NO tiene factura asociada
      var pendiente = totalMov - totalFact;  // positive = faltan facturas, negative = sobran facturas
      var pendienteColor = Math.abs(pendiente) < 1 ? "#16A34A" : pendiente > 0 ? "#D97706" : "#DC2626";
      var tid = l.tarjeta_id != null ? l.tarjeta_id : "";
      var per = (l.periodo || "").trim();
      var baseUrl = "/api/empresas/" + encodeURIComponent(empresaId) + "/tarjetas/extracto-export?tarjeta_id=" + encodeURIComponent(tid) + "&periodo=" + encodeURIComponent(per);
      var btnExcel = "<a href=\"" + baseUrl + "&tipo=excel\" target=\"_blank\" class=\"btn-icon-descarga btn-icon-sm\" title=\"Descargar conciliación\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><rect x=\"2\" y=\"2\" width=\"20\" height=\"20\" rx=\"3\" fill=\"#107C41\"/><text x=\"12\" y=\"15.5\" text-anchor=\"middle\" fill=\"#fff\" font-size=\"7\" font-weight=\"700\" font-family=\"Inter,sans-serif\">XLS</text></svg></a>";
      var btnFacturas = "<a href=\"" + baseUrl + "&tipo=facturas\" target=\"_blank\" class=\"btn-icon-descarga btn-icon-sm\" title=\"Descargar facturas\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><rect x=\"2\" y=\"2\" width=\"20\" height=\"20\" rx=\"3\" fill=\"#DC2626\"/><text x=\"12\" y=\"15.5\" text-anchor=\"middle\" fill=\"#fff\" font-size=\"7\" font-weight=\"700\" font-family=\"Inter,sans-serif\">PDF</text></svg></a>";
      html += "<tr>";
      html += "<td>" + tarjetaLabel + "</td>";
      html += "<td>" + (l.periodo || "—") + "</td>";
      html += "<td class=\"numero\">" + (l.num_facturas != null ? String(l.num_facturas) : "0") + "</td>";
      html += "<td class=\"numero\">" + formatearNumeroES(totalFact) + "</td>";
      html += "<td class=\"numero\">" + formatearNumeroES(totalMov) + "</td>";
      html += "<td class=\"numero\" style=\"color:" + pendienteColor + "\">" + formatearNumeroES(Math.abs(pendiente) < 1 ? 0 : pendiente) + "</td>";
      var badgeClass = estado === "conciliado" ? "conciliado" : estado === "cargo recibido" ? "cargo-recibido" : "pendiente";
      var estadoLabel = estado.charAt(0).toUpperCase() + estado.slice(1);
      // % = cuánto del extracto está cubierto por facturas
      var pctVinculado = totalMov > 0 ? Math.min(100, Math.round((totalFact / totalMov) * 100)) : (totalFact > 0 ? 0 : (estado === "conciliado" ? 100 : 0));
      html += "<td><span class=\"badge-estado " + badgeClass + "\">" + estadoLabel + "</span>";
      var barColor = pctVinculado <= 33 ? "#E74C3C" : pctVinculado <= 66 ? "#E8B931" : "#1D9E75";
      html += " <span class=\"barra-progreso-extracto\"><span class=\"barra-bg\"><span class=\"barra-fill\" style=\"width:" + pctVinculado + "%;background:" + barColor + "\"></span></span><span class=\"barra-pct\">" + pctVinculado + "%</span></span>";
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

window.renderPaginacionBancos = renderPaginacionBancos;

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
      if (window._reactRefreshFacturasProveedores) window._reactRefreshFacturasProveedores();
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

const COLUMNAS_NUMERICAS = new Set(["base_imponible", "iva", "retenciones_total", "total_a_pagar"]);

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
        const val = (raw || "pendiente").toLowerCase();
        const badge = document.createElement("span");
        badge.className = "badge-pago badge-pago-" + val;
        badge.textContent = val.charAt(0).toUpperCase() + val.slice(1);
        td.appendChild(badge);
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
    if (filtroAlertasActivo) {
      sinDatos.textContent = "No hay facturas con alertas para los filtros seleccionados.";
    } else if (FACTURAS_ACTUALES.length > 0) {
      sinDatos.textContent = "No hay facturas que coincidan con los filtros seleccionados (" + FACTURAS_ACTUALES.length + " facturas cargadas).";
    } else {
      sinDatos.textContent = "No hay facturas cargadas para esta empresa. Usa el bot\u00f3n \u00ab+ Procesar\u00bb para subir nuevas.";
    }
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

async function cargarListado(empresaId, preservarFiltros) {
  const sinDatos = document.getElementById("sin-datos");
  const btnCargar = document.getElementById("btn-cargar-listado");

  // Preserve current filter values before clearing
  var prevAnio = document.getElementById("filtro-anio").value;
  var prevMes = document.getElementById("filtro-mes").value;
  var prevEstado = (document.getElementById("filtro-estado-pago") || {}).value || "";
  var prevTarjeta = (document.getElementById("filtro-tarjeta") || {}).value || "";

  FACTURAS_ACTUALES = [];
  sortStateFacturas.key = "fecha_factura";
  sortStateFacturas.dir = "desc";
  filtroAlertasActivo = false;
  document.getElementById("btn-filtro-alertas").style.display = "none";
  document.getElementById("tbody-facturas").innerHTML = "";
  document.getElementById("contador").textContent = "";
  sinDatos.style.display = "none";
  if (btnCargar) { btnCargar.classList.add("btn-loading"); }

  try {
    const resp = await fetch("/api/facturas?empresa_id=" + encodeURIComponent(empresaId) + "&_t=" + Date.now(), {cache: "no-store"});
    const json = await resp.json();
    const facturas = json.facturas || [];
    FACTURAS_ACTUALES = facturas;
    if (!facturas.length) {
      sinDatos.style.display = "block";
      sinDatos.textContent = "No hay facturas cargadas para esta empresa. Usa el bot\u00f3n \u00ab+ Procesar\u00bb para subir nuevas.";
      return;
    }
    poblarFiltroAnio(facturas);

    // Rebuild tarjeta options
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

    // Restore filters if requested (e.g. after edit or navigation)
    if (preservarFiltros) {
      if (prevAnio) document.getElementById("filtro-anio").value = prevAnio;
      if (prevMes) document.getElementById("filtro-mes").value = prevMes;
      if (prevEstado && document.getElementById("filtro-estado-pago")) document.getElementById("filtro-estado-pago").value = prevEstado;
      if (prevTarjeta && selTarjeta) selTarjeta.value = prevTarjeta;
    } else {
      if (document.getElementById("filtro-estado-pago")) document.getElementById("filtro-estado-pago").value = "";
    }

    console.log("[FACTURAS] Cargando con filtros:", {
      empresa: empresaId,
      anio: document.getElementById("filtro-anio").value,
      mes: document.getElementById("filtro-mes").value,
      estado: (document.getElementById("filtro-estado-pago") || {}).value,
      tarjeta: (document.getElementById("filtro-tarjeta") || {}).value,
      total: facturas.length,
      preservarFiltros: !!preservarFiltros,
    });

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
      var resp = await fetch("/api/facturas_clientes?empresa_id=" + encodeURIComponent(empresaId) + "&_t=" + Date.now(), {cache: "no-store"});
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
      var resp = await fetch("/api/facturas?empresa_id=" + encodeURIComponent(empresaId) + "&_t=" + Date.now(), {cache: "no-store"});
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
  const ids = Array.from(checks).map((cb) => cb.dataset.id).filter(Boolean);
  if (!rutas.length && !ids.length) {
    mostrarToast("Las facturas seleccionadas no tienen identificador.", "error");
    return;
  }
  try {
    const resp = await fetch("/api/facturas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: emp, rutas: rutas, ids: ids }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Error al eliminar");
    }
    const json = await resp.json();
    mostrarToast(json.mensaje || "Facturas eliminadas.", "success");
    cargarListado(emp, true);
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
  if (typeof window._comprobarBannerDuplicados === "function") window._comprobarBannerDuplicados("proveedor");
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
  // Comprobar duplicados pendientes para mostrar banner
  if (typeof window._comprobarBannerDuplicados === "function") window._comprobarBannerDuplicados("proveedor");
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
          opt.textContent = (pr.codigo ? pr.codigo + " \u00b7 " : "") + pr.nombre + " (" + (pr.estado || "") + ")";
          selProy.appendChild(opt);
        });
        if (f.proyecto_id) selProy.value = String(f.proyecto_id);
      }).catch(function () {});
  }

  var edLiquidacionPeriodo = document.getElementById("ed-liquidacion-periodo");
  var edLiquidacionInput = document.getElementById("ed-liquidacion-periodo-input");
  var edLiquidacionTexto = document.getElementById("ed-liquidacion-periodo-texto");
  var lip = (f.liquidacion_periodo || "").toString().trim();
  // Default: month from invoice date if no liquidacion_periodo set
  if (!lip) {
    var fechaFact = (f.fecha_factura || "").toString().trim().slice(0, 10);
    if (fechaFact && fechaFact.length >= 7) lip = fechaFact.slice(0, 7);
  }
  if (edLiquidacionPeriodo) edLiquidacionPeriodo.value = lip;
  if (edLiquidacionInput) edLiquidacionInput.value = lip;
  if (edLiquidacionTexto) edLiquidacionTexto.textContent = "";

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

  // Load albaranes for this invoice
  if (typeof window._cargarAlbaranesFactura === "function" && f.id) {
    window._cargarAlbaranesFactura((f.proveedor || "").toString().trim(), f.id);
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

document.getElementById("ed-liquidacion-periodo-input").addEventListener("change", function () {
  var periodo = this.value || "";
  var edLiquidacionPeriodo = document.getElementById("ed-liquidacion-periodo");
  if (edLiquidacionPeriodo) edLiquidacionPeriodo.value = periodo;
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
  factura.liquidacion_periodo = (document.getElementById("ed-liquidacion-periodo-input").value || document.getElementById("ed-liquidacion-periodo").value || "").trim() || null;
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
    // Update proveedor name if it changed (so the filtered view uses the new name)
    var nuevoNombreProv = factura.proveedor || "";
    cerrarModalEdicion();
    // Refresh the active view preserving filters (tarjeta, estado, año, mes)
    cargarListado(emp, true);
    if (window._reactRefreshFacturasProveedores) window._reactRefreshFacturasProveedores();
    if (proveedorSeleccionadoNombre) {
      // If name changed, update the selected proveedor and reload its panel
      if (nuevoNombreProv && nuevoNombreProv !== proveedorSeleccionadoNombre) {
        proveedorSeleccionadoNombre = nuevoNombreProv;
      }
      cargarFacturasProveedor(emp, proveedorSeleccionadoNombre);
    }
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

async function cargarListadoCli(empresaId, preservarFiltros) {
  var btnCargarCli = document.getElementById("cli-btn-cargar");

  // Save current filters
  var prevAnio = (document.getElementById("cli-filtro-anio") || {}).value || "";
  var prevMes = (document.getElementById("cli-filtro-mes") || {}).value || "";
  var prevCobro = (document.getElementById("cli-filtro-cobro") || {}).value || "";

  CLI_FACTURAS = [];
  sortStateCli.key = "fecha_factura";
  sortStateCli.dir = "desc";
  document.getElementById("tbody-clientes-facturas").innerHTML = "";
  document.getElementById("cli-contador").textContent = "";
  document.getElementById("cli-sin-datos").style.display = "none";
  document.getElementById("cli-btn-eliminar").classList.remove("visible");
  if (btnCargarCli) { btnCargarCli.classList.add("btn-loading"); }
  try {
    const resp = await fetch("/api/facturas_clientes?empresa_id=" + encodeURIComponent(empresaId) + "&_t=" + Date.now(), {cache: "no-store"});
    const json = await resp.json();
    CLI_FACTURAS = json.facturas || [];
    poblarFiltroAnioCli();
    // Restore filters if preserving
    if (preservarFiltros) {
      if (prevAnio) document.getElementById("cli-filtro-anio").value = prevAnio;
      if (prevMes && document.getElementById("cli-filtro-mes")) document.getElementById("cli-filtro-mes").value = prevMes;
      if (prevCobro && document.getElementById("cli-filtro-cobro")) document.getElementById("cli-filtro-cobro").value = prevCobro;
    }
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
    cargarListadoCli(emp, true);
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
          opt.textContent = (pr.codigo ? pr.codigo + " \u00b7 " : "") + pr.nombre + " (" + (pr.estado || "") + ")";
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

  var concCliWrap = document.getElementById("edc-conciliacion-wrap");
  var concCliResumen = document.getElementById("edc-conciliacion-resumen");
  var concCliPendiente = document.getElementById("edc-conciliacion-pendiente");
  if (concCliWrap && f.id) {
    concCliWrap.style.display = "block";
    if (concCliResumen) concCliResumen.textContent = "Cargando conciliación...";
    if (concCliPendiente) concCliPendiente.textContent = "";
    fetch("/api/bancos/conciliacion/factura-cliente/" + f.id)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var fmt = typeof formatearNumeroES === "function" ? formatearNumeroES : String;
        if (concCliResumen) concCliResumen.textContent = "Total a cobrar: " + fmt(d.total_factura) + " €";
        if (d.total_cobrado > 0) {
          var movTxt = d.movimientos.map(function (m) {
            return m.fecha + " — " + fmt(m.importe) + " €";
          }).join("\n");
          if (concCliPendiente) {
            concCliPendiente.innerHTML =
              "Total cobrado: <strong style=\"color:#16A34A\">" + fmt(d.total_cobrado) + " €</strong>" +
              " · Pendiente: <strong style=\"color:" + (d.pendiente > 0.01 ? "#D97706" : "#16A34A") + "\">" + fmt(d.pendiente) + " €</strong>" +
              " <span style=\"color:#94A3B8;font-size:12px;\">(" + d.movimientos.length + " movimiento" + (d.movimientos.length !== 1 ? "s" : "") + ")</span>";
          }
        } else {
          if (concCliPendiente) concCliPendiente.textContent = "Sin cobros vinculados · Pendiente: " + fmt(d.total_factura) + " €";
        }
      })
      .catch(function () {
        if (concCliResumen) concCliResumen.textContent = "Error cargando conciliación";
      });
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
    cargarListadoCli(emp, true);
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
  if (typeof window._comprobarBannerDuplicados === "function") window._comprobarBannerDuplicados("cliente");
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
  // Comprobar duplicados pendientes para mostrar banner
  if (typeof window._comprobarBannerDuplicados === "function") window._comprobarBannerDuplicados("cliente");
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

var btnSincronizarClientes = document.getElementById("btn-sincronizar-clientes");
if (btnSincronizarClientes) {
  btnSincronizarClientes.addEventListener("click", async () => {
    btnSincronizarClientes.disabled = true;
    try {
      await refrescarListaClientes();
      mostrarToast("Listado de clientes actualizado.", "success");
    } catch (err) {
      mostrarToast("Error al refrescar clientes.", "error");
    } finally {
      btnSincronizarClientes.disabled = false;
    }
  });
}

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
        const val = (raw || "pendiente").toLowerCase();
        const badge = document.createElement("span");
        badge.className = "badge-pago badge-pago-" + val;
        badge.textContent = val.charAt(0).toUpperCase() + val.slice(1);
        td.appendChild(badge);
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


// ═══ Window exports for standalone functions ═══
window.parseNumeroParaSort = parseNumeroParaSort;
window.ordenarFacturas = ordenarFacturas;
window.renderTablaFacturas = renderTablaFacturas;
window.renderTheadSortable = renderTheadSortable;
window.renderFacturasEnTbody = renderFacturasEnTbody;
window.aplicarFiltrosYRender = aplicarFiltrosYRender;
window.renderTablaCecos = renderTablaCecos;
window.renderPillsCecos = renderPillsCecos;
window.abrirModalNuevoProveedor = abrirModalNuevoProveedor;
window.abrirModalEditarProveedor = abrirModalEditarProveedor;
window.cerrarModalProveedor = cerrarModalProveedor;
window.abrirModalEdicion = abrirModalEdicion;
window.cerrarModalEdicion = cerrarModalEdicion;
window.abrirModalNuevoCliente = abrirModalNuevoCliente;
window.abrirModalEditarCliente = abrirModalEditarCliente;
window.cerrarModalCliente = cerrarModalCliente;
window.abrirModalEdicionCli = abrirModalEdicionCli;
window.cerrarModalEdicionCli = cerrarModalEdicionCli;
window.renderTablaClientesFacturas = renderTablaClientesFacturas;

// ═══════════════════════════════════════════════════════════════════════════
// DUPLICADOS FINANZAS (Proveedores y Clientes) — banner + modal
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  var modalEl = document.getElementById("modal-finanzas-dedup");
  var gruposEl = document.getElementById("finanzas-dedup-grupos");
  var historialEl = document.getElementById("finanzas-dedup-historial");
  var resumenEl = document.getElementById("finanzas-dedup-resumen");
  var vacioEl = document.getElementById("finanzas-dedup-vacio");
  var tituloEl = document.getElementById("modal-finanzas-dedup-titulo");

  // Cerrar modal
  var btnCerrar = document.getElementById("btn-cerrar-dedup-finanzas");
  if (btnCerrar) btnCerrar.addEventListener("click", _cerrarModal);
  if (modalEl) modalEl.addEventListener("click", function (e) { if (e.target === modalEl) _cerrarModal(); });

  function _cerrarModal() {
    if (!modalEl) return;
    modalEl.classList.remove("visible");
    modalEl.setAttribute("aria-hidden", "true");
  }

  // Init tabs del modal finanzas (deferred until _initDedupTabs is available)
  var _tabsInited = false;
  function _ensureTabs() {
    if (_tabsInited || !modalEl) return;
    if (typeof window._initDedupTabs === "function") {
      window._initDedupTabs(modalEl);
      _tabsInited = true;
    }
  }

  // Abrir modal con duplicados filtrados por tipo
  function abrirModalDuplicadosFinanzas(tipo) {
    if (!modalEl) return;
    _ensureTabs();
    var label = tipo === "proveedor" ? "proveedores" : "clientes";
    if (tituloEl) tituloEl.textContent = "Revisar duplicados de " + label;

    modalEl.classList.add("visible");
    modalEl.setAttribute("aria-hidden", "false");
    gruposEl.innerHTML = '<p style="text-align:center;color:#94a3b8;">Analizando duplicados...</p>';
    if (historialEl) historialEl.style.display = "none";
    if (vacioEl) vacioEl.style.display = "none";
    if (resumenEl) resumenEl.textContent = "";
    gruposEl.style.display = "";

    // Reset tabs to Pendientes
    modalEl.querySelectorAll(".dedup-tab").forEach(function (t) {
      t.classList.remove("active", "primary", "secondary");
      t.classList.add(t.dataset.tab === "pendientes" ? "primary" : "secondary");
      if (t.dataset.tab === "pendientes") t.classList.add("active");
    });

    fetch("/api/terceros/duplicados?tipo=" + encodeURIComponent(tipo))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var grupos = data.grupos || [];
        if (typeof window._renderDedupGrupos === "function") {
          window._renderDedupGrupos(grupos, gruposEl, resumenEl, vacioEl, {
            tipo: tipo,
            onRefresh: function () {
              abrirModalDuplicadosFinanzas(tipo);
              _comprobarBannerDuplicados(tipo);
            }
          });
        }
      })
      .catch(function (err) {
        gruposEl.innerHTML = '<p style="color:#b91c1c;text-align:center;">Error: ' + (err.message || err) + '</p>';
      });
  }

  // Comprobar y mostrar/ocultar banner de duplicados
  function _comprobarBannerDuplicados(tipo) {
    var bannerId = tipo === "proveedor" ? "banner-duplicados-proveedores" : "banner-duplicados-clientes";
    var bannerEl = document.getElementById(bannerId);
    if (!bannerEl) return;

    fetch("/api/terceros/duplicados-count?tipo=" + encodeURIComponent(tipo))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var total = data.total || 0;
        if (total > 0) {
          var label = tipo === "proveedor" ? "los proveedores" : "los clientes";
          bannerEl.innerHTML =
            '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#FEF3C7;border:1px solid rgba(245,158,11,0.19);border-radius:8px;margin-bottom:16px;">' +
              '<span style="font-size:18px;">\u26A0\uFE0F</span>' +
              '<span style="flex:1;font-size:14px;color:#92400E;">Se han encontrado <strong>' + total + '</strong> posibles duplicados entre ' + label + '</span>' +
              '<button type="button" id="btn-banner-dedup-' + tipo + '" style="padding:6px 14px;background:#F59E0B;color:white;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">Revisar duplicados</button>' +
            '</div>';
          bannerEl.style.display = "";
          document.getElementById("btn-banner-dedup-" + tipo).addEventListener("click", function () {
            abrirModalDuplicadosFinanzas(tipo);
          });
        } else {
          bannerEl.innerHTML = "";
          bannerEl.style.display = "none";
        }
      })
      .catch(function () {
        bannerEl.style.display = "none";
      });
  }

  window.abrirModalDuplicadosFinanzas = abrirModalDuplicadosFinanzas;
  window._comprobarBannerDuplicados = _comprobarBannerDuplicados;

  // ── Modal RRHH clasificación banco ──
  window._abrirModalRrhhBanco = function(btn) {
    var movId = btn.getAttribute("data-mov-id");
    var concepto = btn.getAttribute("data-concepto") || "";
    var fecha = btn.getAttribute("data-fecha") || "";
    var importe = btn.getAttribute("data-importe") || "";
    if (movId) _abrirModalConciliarRrhh(movId, concepto, fecha, importe);
  };
  function _abrirModalConciliarRrhh(movId, concepto, fecha, importe) {
    var existing = document.getElementById("modal-rrhh-banco");
    if (existing) existing.remove();

    // Auto-detect suggestion from concepto
    var conceptoLower = concepto.toLowerCase();
    var sugerencia = "";
    if (conceptoLower.indexOf("tgss") >= 0 || conceptoLower.indexOf("seguridad social") >= 0 || conceptoLower.indexOf("cotizacion") >= 0) sugerencia = "seguridad_social";
    else if (conceptoLower.indexOf("aeat") >= 0 || conceptoLower.indexOf("hacienda") >= 0 || conceptoLower.indexOf("retencion") >= 0 || conceptoLower.indexOf("impuesto") >= 0) sugerencia = "irpf";

    var mesDefault = fecha ? fecha.substring(0, 7) : "";

    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-rrhh-banco";
    modal.style.zIndex = "120";
    modal.innerHTML = '<div class="modal-editar" role="dialog" style="max-width:420px;">' +
      '<div class="modal-header"><h3>Clasificar como pago RRHH</h3><button class="modal-close" onclick="document.getElementById(\'modal-rrhh-banco\').remove()">&times;</button></div>' +
      '<div class="modal-body">' +
      '<div style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:12px;">' + fecha + ' | ' + importe + ' EUR | ' + concepto.substring(0, 80) + '</div>' +
      (sugerencia ? '<div style="padding:6px 10px;background:#FEF3C7;border-radius:6px;margin-bottom:12px;font-size:0.82rem;">Sugerencia: <b>' + (sugerencia === "seguridad_social" ? "Pago Seg. Social" : "Pago IRPF") + '</b></div>' : '') +
      '<div style="margin-bottom:12px;"><label style="font-size:12px;color:#888;">Tipo</label>' +
      '<select id="rrhh-banco-tipo" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:6px;" onchange="document.getElementById(\'rrhh-banco-emp-row\').style.display=this.value===\'adelanto\'||this.value===\'nomina\'?\'block\':\'none\';document.getElementById(\'rrhh-banco-periodo-row\').style.display=this.value===\'irpf\'?\'none\':\'block\';document.getElementById(\'rrhh-banco-trim-row\').style.display=this.value===\'irpf\'?\'block\':\'none\';">' +
      '<option value="adelanto">Adelanto a empleado</option>' +
      '<option value="nomina">Pago de n\u00f3mina</option>' +
      '<option value="seguridad_social"' + (sugerencia === "seguridad_social" ? " selected" : "") + '>Pago Seguridad Social</option>' +
      '<option value="irpf"' + (sugerencia === "irpf" ? " selected" : "") + '>Pago IRPF</option>' +
      '</select></div>' +
      '<div id="rrhh-banco-emp-row" style="margin-bottom:12px;' + (sugerencia ? 'display:none;' : '') + '"><label style="font-size:12px;color:#888;">Empleado</label>' +
      '<select id="rrhh-banco-empleado" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:6px;"><option value="">Cargando...</option></select></div>' +
      '<div id="rrhh-banco-periodo-row" style="margin-bottom:12px;' + (sugerencia === "irpf" ? 'display:none;' : '') + '"><label style="font-size:12px;color:#888;">Periodo (mes)</label>' +
      '<input type="month" id="rrhh-banco-periodo" value="' + mesDefault + '" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:6px;"></div>' +
      '<div id="rrhh-banco-trim-row" style="margin-bottom:12px;' + (sugerencia !== "irpf" ? 'display:none;' : '') + '"><label style="font-size:12px;color:#888;">Trimestre</label>' +
      '<select id="rrhh-banco-trimestre" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:6px;">' +
      '<option value="1T-2025">1T 2025</option><option value="2T-2025">2T 2025</option><option value="3T-2025">3T 2025</option><option value="4T-2025">4T 2025</option>' +
      '<option value="1T-2026">1T 2026</option><option value="2T-2026">2T 2026</option><option value="3T-2026">3T 2026</option><option value="4T-2026">4T 2026</option>' +
      '</select></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button class="secondary" onclick="document.getElementById(\'modal-rrhh-banco\').remove()">Cancelar</button>' +
      '<button class="primary" id="rrhh-banco-confirmar">Guardar</button>' +
      '</div></div></div>';

    modal.addEventListener("click", function(ev) { if (ev.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    // Load empleados
    fetch("/api/rrhh/empleados?estado=todos")
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var sel = document.getElementById("rrhh-banco-empleado");
        if (!sel) return;
        sel.innerHTML = '<option value="">Seleccionar empleado...</option>';
        (d.empleados || []).forEach(function(emp) {
          sel.innerHTML += '<option value="' + emp.id + '">' + (emp.nombre || "") + ' ' + (emp.apellidos || "") + '</option>';
        });
      });

    // Confirm handler
    document.getElementById("rrhh-banco-confirmar").addEventListener("click", function() {
      var tipo = document.getElementById("rrhh-banco-tipo").value;
      var empleadoId = document.getElementById("rrhh-banco-empleado").value;
      var periodo = tipo === "irpf" ? document.getElementById("rrhh-banco-trimestre").value : document.getElementById("rrhh-banco-periodo").value;

      if ((tipo === "adelanto" || tipo === "nomina") && !empleadoId) { alert("Selecciona un empleado"); return; }

      fetch("/api/rrhh/banco/clasificar", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ movimiento_id: parseInt(movId), rrhh_tipo: tipo, empleado_id: empleadoId ? parseInt(empleadoId) : null, periodo: periodo })
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.error) { alert("Error: " + d.error); return; }
        document.getElementById("modal-rrhh-banco").remove();
        if (typeof cargarMovimientosBancos === "function") cargarMovimientosBancos();
        if (typeof mostrarToast === "function") mostrarToast("Movimiento clasificado como RRHH", "success");
      })
      .catch(function(err) { alert("Error: " + err.message); });
    });
  }
})();
