// ═══ PROYECTOS — CRUD, dashboard, partes, recursos ═══
(function () {
  var proyModalEl = document.getElementById("modal-proyecto");
  var proyFormEl = document.getElementById("form-proyecto");
  var parteModalEl = document.getElementById("modal-parte");

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
                (p.codigo ? '<span style="font-size:13px;font-weight:600;color:var(--color-primary);background:var(--color-primary)10;padding:2px 10px;border-radius:99px;border:1px solid var(--color-primary)30;">' + _esc(p.codigo) + '</span>' : '') +
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
            var _hincadoras = pt.num_operadores || 0;
            try { var _ln = JSON.parse(pt.notas || "[]"); if (Array.isArray(_ln)) _hincadoras = _ln.filter(function(l){return l.rol !== "ayudante";}).length || _hincadoras; } catch(e){}
            return '<tr style="border-bottom:1px solid var(--color-border);">' +
              '<td style="padding:8px 6px;">' + _esc((pt.fecha || "").substring(0, 10)) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;font-weight:500;">' + (pt.hincas_realizadas || 0) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;">' + (pt.horas_admin || 0) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;">' + _hincadoras + '</td>' +
              '<td style="padding:8px 6px;font-size:12px;color:' + (pt.incidencias ? 'var(--color-danger)' : 'var(--color-text-secondary)') + ';">' + (pt.incidencias ? _esc(pt.incidencias).substring(0, 50) : "\u2014") + '</td>' +
              '<td style="padding:8px 6px;text-align:center;"><div style="display:flex;gap:2px;justify-content:center;">' +
                '<button onclick="parteVer(' + pt.id + ',' + p.id + ')" title="Ver parte" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--color-text-secondary);" onmouseover="this.style.color=\'var(--color-primary)\'" onmouseout="this.style.color=\'var(--color-text-secondary)\'">' +
                  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>' +
                '<button onclick="parteEditar(' + pt.id + ',' + p.id + ')" title="Editar" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--color-text-secondary);" onmouseover="this.style.color=\'var(--color-primary)\'" onmouseout="this.style.color=\'var(--color-text-secondary)\'">' +
                  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
                '<button onclick="parteEliminar(' + pt.id + ',' + p.id + ')" title="Eliminar" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--color-text-secondary);" onmouseover="this.style.color=\'#DC2626\'" onmouseout="this.style.color=\'var(--color-text-secondary)\'">' +
                  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>' +
              '</div></td></tr>';
          }).join("");
          partesHtml = '<div style="height:200px;margin-bottom:12px;"><canvas id="chart-avance-proyecto"></canvas></div>' +
            '<div style="max-height:400px;overflow-y:auto;"><table style="width:100%;font-size:13px;border-collapse:collapse;"><thead><tr style="border-bottom:2px solid var(--color-border);position:sticky;top:0;background:var(--color-white);">' +
            '<th style="text-align:left;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Fecha</th>' +
            '<th style="text-align:right;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Hincas</th>' +
            '<th style="text-align:right;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">H. Admin</th>' +
            '<th style="text-align:right;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Hincadoras</th>' +
            '<th style="text-align:left;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Incidencias</th>' +
            '<th style="text-align:center;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Acciones</th>' +
            '</tr></thead><tbody>' + filas + '</tbody></table></div>';
        } else {
          partesHtml = '<p style="color:var(--color-text-secondary);font-size:13px;text-align:center;padding:24px;">Sin partes de trabajo registrados.</p>';
        }
        document.getElementById("proy-dash-partes-section").innerHTML =
          '<div class="presup-section" style="margin-bottom:16px;">' +
            '<div class="presup-section-header"><div class="presup-section-number" style="background:#16A34A;">\uD83D\uDCCA</div><div class="presup-section-title">Partes de trabajo</div>' +
            '<div style="margin-left:auto;display:flex;gap:8px;align-items:center;">' +
              '<span style="font-size:13px;color:var(--color-text-secondary);">' + (p.partes ? p.partes.length : 0) + ' partes</span>' +
              '<button style="padding:5px 14px;font-size:12px;font-weight:500;color:var(--color-primary);background:transparent;border:1px solid var(--color-primary);border-radius:6px;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background=\'var(--color-primary)\';this.style.color=\'white\'" onmouseout="this.style.background=\'transparent\';this.style.color=\'var(--color-primary)\'" onclick="partesProcesarFoto(' + p.id + ')">+ Alta parte</button>' +
            '</div></div>' +
            '<div class="presup-section-body" style="border-left-color:#16A34A;">' + partesHtml + '</div></div>';

        if (p.partes && p.partes.length) _renderChartAvanceProyecto(p);

        // ═══ Sección: Facturación ═══
        var fc = p.facturas_cliente || [];
        function _dashParseMoney(v) {
          var s = String(v || "").replace(/\s/g, "");
          if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
          var n = parseFloat(s); return isNaN(n) ? 0 : n;
        }
        function _dashFmtMoney(v) {
          var n = _dashParseMoney(v);
          return n ? Math.round(n).toLocaleString("es-ES") + " \u20AC" : "\u2014";
        }
        function _dashCobroBadge(estado) {
          var val = (estado || "pendiente").toString().trim().toLowerCase();
          var colores = { cobrada: "#16A34A", parcial: "#2563EB", pendiente: "#CA8A04" };
          var color = colores[val] || colores.pendiente;
          var label = val.charAt(0).toUpperCase() + val.slice(1);
          return '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;background:' + color + '15;color:' + color + ';border:1px solid ' + color + '30;">' + label + '</span>';
        }
        var factFilas = fc.map(function (f) {
          return '<tr style="border-bottom:1px solid var(--color-border);">' +
            '<td style="padding:8px 6px;font-weight:500;">' + _esc(f.numero_factura || "\u2014") + '</td>' +
            '<td style="padding:8px 6px;">' + _esc((f.fecha_factura || "").substring(0, 10)) + '</td>' +
            '<td style="padding:8px 6px;text-align:right;font-weight:500;">' + _dashFmtMoney(f.total_a_pagar) + '</td>' +
            '<td style="padding:8px 6px;text-align:center;">' + _dashCobroBadge(f.estado_cobro) + '</td></tr>';
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
                '<button style="padding:5px 14px;font-size:12px;font-weight:500;color:var(--color-primary);background:transparent;border:1px solid var(--color-primary);border-radius:6px;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background=\'var(--color-primary)\';this.style.color=\'white\'" onmouseout="this.style.background=\'transparent\';this.style.color=\'var(--color-primary)\'" onclick="certNueva(' + p.id + ')">+ Nueva certificaci\u00f3n</button>' +
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
              '<button style="padding:5px 14px;font-size:12px;font-weight:500;color:var(--color-primary);background:transparent;border:1px solid var(--color-primary);border-radius:6px;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background=\'var(--color-primary)\';this.style.color=\'white\'" onmouseout="this.style.background=\'transparent\';this.style.color=\'var(--color-primary)\'" onclick="proyectoAddRecurso(' + p.id + ')">+ Asignar recurso</button>' +
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
        var html = '<table class="tabla-facturas"><thead><tr><th>Codigo</th><th>Nombre</th><th>Cliente</th><th>Presupuesto</th><th>Parque</th><th>MW</th><th>Hincas</th><th>Tipo</th><th>Importe</th><th>Inicio est.</th><th>Acciones</th></tr></thead><tbody>';
        proys.forEach(function (p) {
          var presCol = p.presupuesto_id && p.presupuesto_ref ? '<a href="#" onclick="navegarAPresupuesto(' + p.presupuesto_id + ');return false;" style="color:#2563EB;text-decoration:none;font-size:12px;">' + _esc(p.presupuesto_ref) + '</a>' : '';
          html += '<tr><td style="font-size:12px;font-weight:600;color:var(--color-primary);white-space:nowrap;">' + _esc(p.codigo || "") + '</td>' +
            '<td style="font-weight:600;"><a href="#" onclick="proyectoDashboard(' + p.id + ');return false;" style="color:var(--color-primary);text-decoration:none;">' + _esc(p.nombre) + '</a></td>' +
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
        '<div class="proy-card-header"><div>' +
          (p.codigo ? '<span style="font-size:11px;font-weight:600;color:var(--color-primary);margin-bottom:2px;display:block;">' + _esc(p.codigo) + '</span>' : '') +
          '<h3 style="cursor:pointer;color:var(--color-primary);" onclick="proyectoDashboard(' + p.id + ')">' + _esc(p.nombre) + '</h3>' +
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
        var html = '<table class="tabla-facturas"><thead><tr><th>Codigo</th><th>Nombre</th><th>Cliente</th><th>Presupuesto</th><th>Tipo</th><th>Estado</th><th>Hincas</th><th>Dias</th><th>Facturado</th><th>Costes</th><th>Rentabilidad</th></tr></thead><tbody>';
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
            '<td style="font-size:12px;font-weight:600;color:var(--color-primary);white-space:nowrap;">' + _esc(p.codigo || "") + '</td>' +
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
    var badgeEl = document.getElementById("modal-proyecto-codigo-badge");
    if (p && p.codigo) {
      badgeEl.textContent = p.codigo;
      badgeEl.style.display = "";
    } else {
      badgeEl.style.display = "none";
    }
    document.getElementById("proy-edit-id").value = p ? p.id : "";
    document.getElementById("proy-nombre").value = p ? p.nombre || "" : "";
    var codigoEl = document.getElementById("proy-codigo");
    codigoEl.value = p ? p.codigo || "" : "";
    codigoEl.placeholder = p ? "" : "Se asignara automaticamente (PRY-2026-XXX)";
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

  // ── Modal parte unificado (Manual + OCR) ──

  function _parteCerrarModal() {
    parteModalEl.classList.remove("visible");
    parteModalEl.setAttribute("aria-hidden", "true");
    parteModalEl.innerHTML = "";
  }
  parteModalEl.addEventListener("click", function (e) { if (e.target === parteModalEl) _parteCerrarModal(); });

  window.parteNuevoUnificado = function (proyectoId, tabInicial) {
    var hoy = new Date().toISOString().substring(0, 10);
    parteModalEl.innerHTML =
      '<div class="modal-content" style="max-width:700px;max-height:90vh;overflow-y:auto;">' +
        '<h2 style="margin:0 0 16px;">Registrar parte de trabajo</h2>' +

        // Tabs
        '<div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid var(--color-border);">' +
          '<button id="tab-parte-manual" onclick="parteTabSwitch(\'manual\')" style="padding:10px 20px;font-size:14px;font-weight:500;border:none;background:none;cursor:pointer;margin-bottom:-2px;border-bottom:2px solid #2563EB;color:#2563EB;">\uD83D\uDCDD Manual</button>' +
          '<button id="tab-parte-foto" onclick="parteTabSwitch(\'foto\')" style="padding:10px 20px;font-size:14px;font-weight:500;border:none;background:none;cursor:pointer;margin-bottom:-2px;border-bottom:2px solid transparent;color:var(--color-text-secondary);">\uD83D\uDCF7 Desde foto</button>' +
        '</div>' +

        // Tab Manual
        '<div id="parte-contenido-manual">' +
          '<div style="border-left:3px solid #16A34A;padding:12px 16px;margin-bottom:12px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
            '<div style="font-size:14px;font-weight:600;color:#16A34A;margin-bottom:12px;">Produccion</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Fecha</label>' +
                '<input type="date" id="parte-fecha" value="' + hoy + '" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Hincas realizadas</label>' +
                '<input type="number" id="parte-hincas" min="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Horas maquina</label>' +
                '<input type="number" id="parte-horas-maq" step="0.5" min="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Horas personal</label>' +
                '<input type="number" id="parte-horas-pers" step="0.5" min="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">N\u00BA operadores</label>' +
                '<input type="number" id="parte-operadores" min="0" value="1" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">N\u00BA ayudantes</label>' +
                '<input type="number" id="parte-ayudantes" min="0" value="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
            '</div>' +
          '</div>' +

          '<div style="border-left:3px solid #2563EB;padding:12px 16px;margin-bottom:12px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
            '<div style="font-size:14px;font-weight:600;color:#2563EB;margin-bottom:12px;">Condiciones</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Terreno</label>' +
                '<select id="parte-terreno" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"><option value="">--</option><option value="normal">Normal</option><option value="rocoso">Rocoso</option><option value="arcilloso">Arcilloso</option><option value="arenoso">Arenoso</option></select></div>' +
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Meteorologia</label>' +
                '<select id="parte-meteo" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"><option value="">--</option><option value="bueno">Bueno</option><option value="lluvia">Lluvia</option><option value="viento">Viento</option><option value="calor_extremo">Calor extremo</option></select></div>' +
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Combustible (litros)</label>' +
                '<input type="number" id="parte-combustible" step="0.1" min="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
            '</div>' +
          '</div>' +

          '<div style="border-left:3px solid #CA8A04;padding:12px 16px;margin-bottom:16px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
            '<div style="font-size:14px;font-weight:600;color:#CA8A04;margin-bottom:12px;">Observaciones</div>' +
            '<div style="display:grid;gap:10px;">' +
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Incidencias</label>' +
                '<textarea id="parte-incidencias" rows="2" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);resize:vertical;" placeholder="Sin incidencias"></textarea></div>' +
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Notas</label>' +
                '<textarea id="parte-notas" rows="2" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);resize:vertical;"></textarea></div>' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--color-border);">' +
            '<button class="secondary" style="padding:8px 20px;" onclick="_parteCerrarModalGlobal()">Cancelar</button>' +
            '<button class="primary" style="width:auto;padding:8px 20px;" onclick="_parteGuardarManual(' + proyectoId + ')">Guardar parte</button>' +
          '</div>' +
        '</div>' +

        // Tab Foto
        '<div id="parte-contenido-foto" style="display:none;">' +
          '<div id="ocr-paso-1">' +
            '<div id="ocr-dropzone" style="border:2px dashed var(--color-border);border-radius:12px;padding:40px;text-align:center;cursor:pointer;margin-bottom:16px;" onclick="document.getElementById(\'ocr-input-foto\').click()">' +
              '<div style="font-size:32px;margin-bottom:8px;">\uD83D\uDCF7</div>' +
              '<div style="font-size:14px;color:var(--color-text-secondary);">Haz click o arrastra una foto del parte</div>' +
              '<div style="font-size:12px;color:var(--color-text-secondary);margin-top:4px;">JPG, PNG o WEBP</div>' +
            '</div>' +
            '<input type="file" id="ocr-input-foto" accept="image/*" capture="environment" style="display:none;">' +
            '<div id="ocr-preview" style="display:none;text-align:center;margin-bottom:16px;">' +
              '<img id="ocr-preview-img" style="max-width:100%;max-height:300px;border-radius:8px;">' +
            '</div>' +
            '<div id="ocr-loading" style="display:none;text-align:center;padding:20px;">' +
              '<div style="font-size:14px;color:var(--color-text-secondary);">Procesando parte con IA...</div>' +
              '<div style="margin-top:8px;font-size:12px;color:var(--color-text-secondary);">Esto puede tardar 5-10 segundos</div>' +
            '</div>' +
          '</div>' +

          '<div id="ocr-paso-2" style="display:none;">' +
            '<div style="background:#EFF6FF;border:1px solid #2563EB30;border-radius:8px;padding:12px;margin-bottom:16px;">' +
              '<span style="font-size:13px;color:#2563EB;">Datos extraidos automaticamente. Revisa y corrige si es necesario.</span>' +
            '</div>' +

            '<div style="border-left:3px solid #2563EB;padding:12px 16px;margin-bottom:12px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#2563EB;margin-bottom:12px;">Identificacion</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">N\u00BA Parte</label>' +
                  '<input type="text" id="ocr-numero" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Fecha</label>' +
                  '<input type="date" id="ocr-fecha" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Proyecto</label>' +
                  '<select id="ocr-proyecto" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></select></div>' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Cliente</label>' +
                  '<input type="text" id="ocr-cliente" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Obra / Poblacion</label>' +
                  '<input type="text" id="ocr-obra" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
              '</div>' +
            '</div>' +

            '<div style="border-left:3px solid #16A34A;padding:12px 16px;margin-bottom:12px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#16A34A;margin-bottom:12px;">Produccion</div>' +
              '<div id="ocr-lineas-container"></div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Total hincas</label>' +
                  '<input type="number" id="ocr-hincas" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Horas administracion</label>' +
                  '<input type="number" id="ocr-horas-admin" step="0.5" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
              '</div>' +
            '</div>' +

            '<div style="border-left:3px solid #CA8A04;padding:12px 16px;margin-bottom:16px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#CA8A04;margin-bottom:12px;">Incidencias</div>' +
              '<textarea id="ocr-incidencias" rows="2" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);resize:vertical;" placeholder="Sin incidencias"></textarea>' +
            '</div>' +

            '<div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--color-border);">' +
              '<button class="secondary" style="padding:8px 20px;" onclick="_parteCerrarModalGlobal()">Cancelar</button>' +
              '<button class="primary" style="width:auto;padding:8px 20px;" onclick="partesGuardarOCR(' + proyectoId + ')">Guardar parte</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Wire file input
    setTimeout(function () {
      var fi = document.getElementById("ocr-input-foto");
      if (fi) fi.addEventListener("change", function () { _partesEnviarOCR(this, proyectoId); });
    }, 0);

    // Load projects in OCR select
    fetch("/api/proyectos").then(function (r) { return r.json(); }).then(function (data) {
      var sel = document.getElementById("ocr-proyecto");
      if (!sel) return;
      sel.innerHTML = '<option value="">Seleccionar...</option>';
      (data.proyectos || []).forEach(function (pr) {
        var opt = document.createElement("option");
        opt.value = pr.id;
        opt.textContent = (pr.codigo ? pr.codigo + " \u00B7 " : "") + pr.nombre;
        if (pr.id === proyectoId) opt.selected = true;
        sel.appendChild(opt);
      });
    });

    parteModalEl.classList.add("visible");
    parteModalEl.setAttribute("aria-hidden", "false");

    // Switch to requested tab
    if (tabInicial === "foto") parteTabSwitch("foto");
  };

  window._parteCerrarModalGlobal = _parteCerrarModal;

  window.parteTabSwitch = function (tab) {
    var manual = document.getElementById("parte-contenido-manual");
    var foto = document.getElementById("parte-contenido-foto");
    var btnManual = document.getElementById("tab-parte-manual");
    var btnFoto = document.getElementById("tab-parte-foto");
    if (!manual || !foto) return;
    if (tab === "foto") {
      manual.style.display = "none";
      foto.style.display = "block";
      btnManual.style.borderBottomColor = "transparent";
      btnManual.style.color = "var(--color-text-secondary)";
      btnFoto.style.borderBottomColor = "#2563EB";
      btnFoto.style.color = "#2563EB";
    } else {
      manual.style.display = "block";
      foto.style.display = "none";
      btnManual.style.borderBottomColor = "#2563EB";
      btnManual.style.color = "#2563EB";
      btnFoto.style.borderBottomColor = "transparent";
      btnFoto.style.color = "var(--color-text-secondary)";
    }
  };

  // Alias old functions to unified modal
  window._proyRegistrarParte = function (proyId) { parteNuevoUnificado(proyId, "manual"); };
  window.partesProcesarFoto = function (proyId) { parteNuevoUnificado(proyId, "foto"); };

  // Manual save
  window._parteGuardarManual = function (proyectoId) {
    var body = {
      fecha: (document.getElementById("parte-fecha") || {}).value,
      hincas_realizadas: parseInt((document.getElementById("parte-hincas") || {}).value) || 0,
      horas_maquina: parseFloat((document.getElementById("parte-horas-maq") || {}).value) || 0,
      horas_personal: parseFloat((document.getElementById("parte-horas-pers") || {}).value) || 0,
      num_operadores: parseInt((document.getElementById("parte-operadores") || {}).value) || 1,
      num_ayudantes: parseInt((document.getElementById("parte-ayudantes") || {}).value) || 0,
      condiciones_terreno: (document.getElementById("parte-terreno") || {}).value || "",
      meteorologia: (document.getElementById("parte-meteo") || {}).value || "",
      combustible_litros: parseFloat((document.getElementById("parte-combustible") || {}).value) || null,
      incidencias: (document.getElementById("parte-incidencias") || {}).value || "",
      notas: (document.getElementById("parte-notas") || {}).value || "",
    };
    fetch("/api/proyectos/" + proyectoId + "/partes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { mostrarToast(res.data.error || "Error", "error"); return; }
        _parteCerrarModal();
        _proyVivos();
        if (window.proyectoDashboard) proyectoDashboard(proyectoId);
        mostrarToast("Parte registrado.", "success");
      })
      .catch(function () { mostrarToast("Error de conexion.", "error"); });
  };

  // ── Ver parte (detalle) ──

  window.parteVer = function (parteId, proyectoId) {
    fetch("/api/proyectos/partes/" + parteId)
      .then(function (r) { return r.json(); })
      .then(function (pt) {
        if (pt.error) { mostrarToast(pt.error, "error"); return; }
        var existing = document.getElementById("modal-parte-ver");
        if (existing) existing.remove();
        var modal = document.createElement("div");
        modal.className = "modal-overlay visible";
        modal.id = "modal-parte-ver";
        modal.style.zIndex = "110";
        modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });

        // Parse lineas from notas if JSON
        var lineasHtml = "";
        try {
          var lineas = JSON.parse(pt.notas || "[]");
          if (Array.isArray(lineas) && lineas.length) {
            lineasHtml = '<div style="margin-top:10px;"><div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:6px;">Detalle operadores</div>' +
              '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
              '<thead><tr style="border-bottom:1px solid var(--color-border);">' +
                '<th style="text-align:left;padding:4px 8px;font-size:11px;color:var(--color-text-secondary);">Operador</th>' +
                '<th style="text-align:left;padding:4px 8px;font-size:11px;color:var(--color-text-secondary);">Maquina</th>' +
                '<th style="text-align:right;padding:4px 8px;font-size:11px;color:var(--color-text-secondary);">Horas</th>' +
                '<th style="text-align:left;padding:4px 8px;font-size:11px;color:var(--color-text-secondary);">Rol</th>' +
              '</tr></thead><tbody>' +
              lineas.map(function (l) {
                return '<tr style="border-bottom:1px solid var(--color-border);">' +
                  '<td style="padding:4px 8px;">' + _esc(l.operador || "") + '</td>' +
                  '<td style="padding:4px 8px;">' + _esc(l.maquina || "") + '</td>' +
                  '<td style="padding:4px 8px;text-align:right;">' + (l.horas || 0) + '</td>' +
                  '<td style="padding:4px 8px;">' + _esc(l.rol || "") + '</td></tr>';
              }).join("") +
              '</tbody></table></div>';
          }
        } catch (e) {}

        var imgHtml = "";
        if (pt.imagen_archivo) {
          var imgUrl = "/api/archivo?ruta=" + encodeURIComponent(pt.imagen_archivo);
          imgHtml = '<div style="text-align:center;margin-bottom:16px;">' +
            '<img src="' + imgUrl + '" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid var(--color-border);" onerror="this.style.display=\'none\'">' +
            '<div style="margin-top:8px;"><button onclick="window.open(\'' + imgUrl + '\',\'_blank\')" style="padding:6px 14px;font-size:13px;font-weight:500;color:var(--color-primary);background:transparent;border:1px solid var(--color-primary);border-radius:6px;cursor:pointer;">Ver parte original</button></div>' +
          '</div>';
        } else {
          imgHtml = '<div style="text-align:center;margin-bottom:16px;padding:12px;color:var(--color-text-secondary);font-size:13px;font-style:italic;">Parte cargado manualmente \u2014 sin imagen adjunta</div>';
        }

        function _vFmt(v) { return v != null && v !== "" ? v : "\u2014"; }

        modal.innerHTML =
          '<div class="modal-content" style="max-width:600px;max-height:90vh;overflow-y:auto;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
              '<h2 style="margin:0;">Parte de trabajo #' + pt.id + '</h2>' +
              '<span style="font-size:13px;color:var(--color-text-secondary);">' + _esc((pt.fecha || "").substring(0, 10)) + '</span>' +
            '</div>' +
            imgHtml +
            '<div style="border-left:3px solid #16A34A;padding:12px 16px;margin-bottom:12px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#16A34A;margin-bottom:12px;">Produccion</div>' +
              '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">' +
                '<div><div style="font-size:11px;color:var(--color-text-secondary);">Hincas</div><div style="font-size:18px;font-weight:600;">' + _vFmt(pt.hincas_realizadas) + '</div></div>' +
                '<div><div style="font-size:11px;color:var(--color-text-secondary);">H. Maquina</div><div style="font-size:18px;font-weight:600;">' + _vFmt(pt.horas_maquina) + '</div></div>' +
                '<div><div style="font-size:11px;color:var(--color-text-secondary);">H. Personal</div><div style="font-size:18px;font-weight:600;">' + _vFmt(pt.horas_personal) + '</div></div>' +
                '<div><div style="font-size:11px;color:var(--color-text-secondary);">Operadores</div><div style="font-size:18px;font-weight:600;">' + _vFmt(pt.num_operadores) + '</div></div>' +
                '<div><div style="font-size:11px;color:var(--color-text-secondary);">Ayudantes</div><div style="font-size:18px;font-weight:600;">' + _vFmt(pt.num_ayudantes) + '</div></div>' +
                '<div><div style="font-size:11px;color:var(--color-text-secondary);">Gasoil (L)</div><div style="font-size:18px;font-weight:600;">' + _vFmt(pt.combustible_litros) + '</div></div>' +
              '</div>' +
              lineasHtml +
            '</div>' +
            (pt.incidencias ? '<div style="border-left:3px solid #CA8A04;padding:12px 16px;margin-bottom:12px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#CA8A04;margin-bottom:8px;">Incidencias</div>' +
              '<div style="font-size:13px;">' + _esc(pt.incidencias) + '</div></div>' : '') +
            '<div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--color-border);">' +
              '<button class="secondary" style="padding:8px 20px;" onclick="document.getElementById(\'modal-parte-ver\').remove()">Cerrar</button>' +
              '<button class="primary" style="width:auto;padding:8px 20px;" onclick="document.getElementById(\'modal-parte-ver\').remove();parteEditar(' + parteId + ',' + proyectoId + ')">Editar</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(modal);
      });
  };

  // ── Editar / Eliminar partes ──

  window.parteEditar = function (parteId, proyectoId) {
    // Fetch parte data from the cached dashboard data — parte is already loaded in p.partes
    // We'll fetch fresh from the partes list
    fetch("/api/proyectos/" + proyectoId + "/dashboard")
      .then(function (r) { return r.json(); })
      .then(function (dashData) {
        var pt = null;
        (dashData.partes || []).forEach(function (p) { if (p.id === parteId) pt = p; });
        if (!pt) { mostrarToast("Parte no encontrado", "error"); return; }

        // Parse notas: if JSON array of lineas, show readable text
        var _peNotasRaw = pt.notas || "";
        var _peNotasDisplay = _peNotasRaw;
        try {
          var _peLineas = JSON.parse(_peNotasRaw);
          if (Array.isArray(_peLineas) && _peLineas.length && _peLineas[0].operador) {
            _peNotasDisplay = _peLineas.map(function (l) {
              return (l.operador || "") + " con " + (l.maquina || "") + " " + (l.horas || 0) + "h (" + (l.rol || "operador") + ")";
            }).join("\n");
          }
        } catch (e) {}

        var existing = document.getElementById("modal-parte-editar");
        if (existing) existing.remove();
        var modal = document.createElement("div");
        modal.className = "modal-overlay visible";
        modal.id = "modal-parte-editar";
        modal.style.zIndex = "110";
        modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
        modal.innerHTML =
          '<div class="modal-content" style="max-width:600px;max-height:90vh;overflow-y:auto;">' +
            '<h2 style="margin:0 0 16px;">Editar parte de trabajo</h2>' +

            '<div style="border-left:3px solid #2563EB;padding:12px 16px;margin-bottom:12px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#2563EB;margin-bottom:12px;">Identificacion</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Fecha</label>' +
                  '<input type="date" id="pe-fecha" value="' + _esc((pt.fecha || "").substring(0, 10)) + '" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">ID Parte</label>' +
                  '<input type="text" value="#' + pt.id + '" readonly style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:#f3f4f6;color:#6b7280;cursor:not-allowed;"></div>' +
              '</div>' +
            '</div>' +

            '<div style="border-left:3px solid #16A34A;padding:12px 16px;margin-bottom:12px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#16A34A;margin-bottom:12px;">Produccion</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Hincas realizadas</label>' +
                  '<input type="number" id="pe-hincas" value="' + (pt.hincas_realizadas || 0) + '" min="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Horas maquina</label>' +
                  '<input type="number" id="pe-horas-maq" value="' + (pt.horas_maquina || 0) + '" step="0.5" min="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Horas personal</label>' +
                  '<input type="number" id="pe-horas-pers" value="' + (pt.horas_personal || 0) + '" step="0.5" min="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Operadores</label>' +
                  '<input type="number" id="pe-operadores" value="' + (pt.num_operadores || 0) + '" min="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Ayudantes</label>' +
                  '<input type="number" id="pe-ayudantes" value="' + (pt.num_ayudantes || 0) + '" min="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Gasoil (litros)</label>' +
                  '<input type="number" id="pe-gasoil" value="' + (pt.combustible_litros || "") + '" step="0.1" min="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
              '</div>' +
            '</div>' +

            '<div style="border-left:3px solid #CA8A04;padding:12px 16px;margin-bottom:16px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#CA8A04;margin-bottom:12px;">Incidencias y notas</div>' +
              '<div style="display:grid;gap:10px;">' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Incidencias</label>' +
                  '<textarea id="pe-incidencias" rows="2" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);resize:vertical;" placeholder="Sin incidencias">' + _esc(pt.incidencias || "") + '</textarea></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Notas</label>' +
                  '<textarea id="pe-notas" rows="2" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);resize:vertical;">' + _esc(_peNotasDisplay) + '</textarea>' +
                  '<input type="hidden" id="pe-notas-json" value="' + _esc(_peNotasRaw) + '"></div>' +
              '</div>' +
            '</div>' +

            '<div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--color-border);">' +
              '<button class="secondary" style="padding:8px 20px;" onclick="document.getElementById(\'modal-parte-editar\').remove()">Cancelar</button>' +
              '<button class="primary" style="width:auto;padding:8px 20px;" onclick="_parteGuardarEdicion(' + parteId + ',' + proyectoId + ')">Guardar cambios</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(modal);
      });
  };

  window._parteGuardarEdicion = function (parteId, proyectoId) {
    var body = {
      fecha: (document.getElementById("pe-fecha") || {}).value,
      hincas_realizadas: parseInt((document.getElementById("pe-hincas") || {}).value) || 0,
      horas_maquina: parseFloat((document.getElementById("pe-horas-maq") || {}).value) || 0,
      horas_personal: parseFloat((document.getElementById("pe-horas-pers") || {}).value) || 0,
      num_operadores: parseInt((document.getElementById("pe-operadores") || {}).value) || 0,
      num_ayudantes: parseInt((document.getElementById("pe-ayudantes") || {}).value) || 0,
      combustible_litros: parseFloat((document.getElementById("pe-gasoil") || {}).value) || null,
      incidencias: (document.getElementById("pe-incidencias") || {}).value || "",
      notas: (function () {
        var userText = (document.getElementById("pe-notas") || {}).value || "";
        var jsonOrig = (document.getElementById("pe-notas-json") || {}).value || "";
        // If user didn't change the readable text, preserve original JSON
        if (jsonOrig) {
          try {
            var lineas = JSON.parse(jsonOrig);
            if (Array.isArray(lineas) && lineas.length && lineas[0].operador) {
              var readable = lineas.map(function (l) {
                return (l.operador || "") + " con " + (l.maquina || "") + " " + (l.horas || 0) + "h (" + (l.rol || "operador") + ")";
              }).join("\n");
              if (userText === readable) return jsonOrig;
            }
          } catch (e) {}
        }
        return userText;
      })(),
    };
    fetch("/api/proyectos/partes/" + parteId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) {
          var m = document.getElementById("modal-parte-editar");
          if (m) m.remove();
          mostrarToast("Parte actualizado.", "success");
          proyectoDashboard(proyectoId);
        } else {
          mostrarToast(res.data.error || "Error al guardar", "error");
        }
      })
      .catch(function () { mostrarToast("Error de conexion.", "error"); });
  };

  window.parteEliminar = function (parteId, proyectoId) {
    if (!confirm("Eliminar este parte de trabajo? Esta accion no se puede deshacer.")) return;
    fetch("/api/proyectos/partes/" + parteId, { method: "DELETE" })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) {
          mostrarToast("Parte eliminado.", "success");
          proyectoDashboard(proyectoId);
        } else {
          mostrarToast(res.data.error || "Error al eliminar", "error");
        }
      })
      .catch(function () { mostrarToast("Error de conexion.", "error"); });
  };

  // ── OCR send/save (used by unified modal) ──

  function _partesEnviarOCR(input, proyectoId) {
    var file = input.files[0];
    if (!file) return;

    // Preview
    var reader = new FileReader();
    reader.onload = function (e) {
      document.getElementById("ocr-preview-img").src = e.target.result;
      document.getElementById("ocr-preview").style.display = "block";
    };
    reader.readAsDataURL(file);

    // Loading
    document.getElementById("ocr-dropzone").style.display = "none";
    document.getElementById("ocr-loading").style.display = "block";

    var formData = new FormData();
    formData.append("imagen", file);

    fetch("/api/partes/procesar-imagen", { method: "POST", body: formData })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        document.getElementById("ocr-loading").style.display = "none";
        if (!res.ok || res.data.error) {
          mostrarToast(res.data.error || "Error procesando la imagen", "error");
          document.getElementById("ocr-dropzone").style.display = "";
          return;
        }
        var datos = res.data;

        // Fill step 2
        document.getElementById("ocr-numero").value = datos.numero_parte || "";
        document.getElementById("ocr-fecha").value = datos.fecha || "";
        document.getElementById("ocr-cliente").value = datos.cliente || "";
        document.getElementById("ocr-obra").value = (datos.obra || "") + (datos.poblacion ? " \u00B7 " + datos.poblacion : "");
        document.getElementById("ocr-hincas").value = datos.total_hincas || 0;
        document.getElementById("ocr-horas-admin").value = datos.horas_admin || 0;
        document.getElementById("ocr-incidencias").value = datos.incidencias || "";

        // Render detail lines
        var container = document.getElementById("ocr-lineas-container");
        var lineas = datos.lineas || [];
        container.innerHTML = lineas.map(function (l, i) {
          return '<div style="display:grid;grid-template-columns:2fr 2fr 1fr 1fr;gap:8px;margin-bottom:6px;align-items:end;">' +
            '<div>' + (i === 0 ? '<label style="display:block;font-size:11px;color:var(--color-text-secondary);margin-bottom:3px;">Operador</label>' : '') +
              '<input type="text" class="ocr-linea-operador" value="' + _esc(l.operador || "") + '" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:13px;"></div>' +
            '<div>' + (i === 0 ? '<label style="display:block;font-size:11px;color:var(--color-text-secondary);margin-bottom:3px;">Maquina</label>' : '') +
              '<input type="text" class="ocr-linea-maquina" value="' + _esc(l.maquina || "") + '" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:13px;"></div>' +
            '<div>' + (i === 0 ? '<label style="display:block;font-size:11px;color:var(--color-text-secondary);margin-bottom:3px;">Horas</label>' : '') +
              '<input type="number" class="ocr-linea-horas" value="' + (l.horas || 0) + '" step="0.5" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:13px;"></div>' +
            '<div>' + (i === 0 ? '<label style="display:block;font-size:11px;color:var(--color-text-secondary);margin-bottom:3px;">Rol</label>' : '') +
              '<select class="ocr-linea-rol" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:13px;">' +
                '<option value="operador"' + (l.rol !== "ayudante" ? " selected" : "") + '>Operador</option>' +
                '<option value="ayudante"' + (l.rol === "ayudante" ? " selected" : "") + '>Ayudante</option>' +
              '</select></div>' +
          '</div>';
        }).join("");

        // Auto-select project if obra matches
        if (datos.obra) {
          var sel = document.getElementById("ocr-proyecto");
          var obraLower = datos.obra.toLowerCase();
          for (var oi = 0; oi < sel.options.length; oi++) {
            if (sel.options[oi].text.toLowerCase().indexOf(obraLower) !== -1) {
              sel.selectedIndex = oi;
              break;
            }
          }
        }

        // Store original data
        parteModalEl._ocrDatos = datos;

        // Show step 2
        document.getElementById("ocr-paso-1").style.display = "none";
        document.getElementById("ocr-paso-2").style.display = "block";
      })
      .catch(function () {
        document.getElementById("ocr-loading").style.display = "none";
        document.getElementById("ocr-dropzone").style.display = "";
        mostrarToast("Error de conexion", "error");
      });
  }

  window.partesGuardarOCR = function (proyectoIdDefault) {
    var selProy = document.getElementById("ocr-proyecto");
    var proyectoId = (selProy && selProy.value) || proyectoIdDefault;
    if (!proyectoId) {
      mostrarToast("Selecciona un proyecto", "error");
      return;
    }

    // Collect edited lines
    var operadores = document.querySelectorAll(".ocr-linea-operador");
    var maquinas = document.querySelectorAll(".ocr-linea-maquina");
    var horas = document.querySelectorAll(".ocr-linea-horas");
    var roles = document.querySelectorAll(".ocr-linea-rol");
    var lineas = [];
    for (var i = 0; i < operadores.length; i++) {
      lineas.push({
        operador: operadores[i].value,
        maquina: maquinas[i] ? maquinas[i].value : "",
        horas: parseFloat(horas[i] ? horas[i].value : 0) || 0,
        rol: roles[i] ? roles[i].value : "operador",
      });
    }

    var ocrDatos = (parteModalEl || {})._ocrDatos || {};
    var datos = {
      proyecto_id: parseInt(proyectoId),
      numero_parte: (document.getElementById("ocr-numero") || {}).value,
      fecha: (document.getElementById("ocr-fecha") || {}).value,
      cliente: (document.getElementById("ocr-cliente") || {}).value,
      obra: (document.getElementById("ocr-obra") || {}).value,
      total_hincas: parseInt((document.getElementById("ocr-hincas") || {}).value) || 0,
      horas_admin: parseFloat((document.getElementById("ocr-horas-admin") || {}).value) || 0,
      incidencias: (document.getElementById("ocr-incidencias") || {}).value,
      lineas: lineas,
      imagen_archivo: ocrDatos.imagen_archivo,
    };

    fetch("/api/partes/guardar-ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) {
          _parteCerrarModal();
          mostrarToast("Parte registrado correctamente", "success");
          _proyVivos();
          proyectoDashboard(parseInt(proyectoId));
        } else {
          mostrarToast(res.data.error || "Error al guardar", "error");
        }
      })
      .catch(function () { mostrarToast("Error de conexion", "error"); });
  };
})();
