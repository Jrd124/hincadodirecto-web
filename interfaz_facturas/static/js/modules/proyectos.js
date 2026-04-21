// ═══ PROYECTOS — CRUD, dashboard, partes, recursos ═══
(function () {
  var proyModalEl = document.getElementById("modal-proyecto");
  var proyFormEl = document.getElementById("form-proyecto");
  var parteModalEl = document.getElementById("modal-parte");

  function _fE(n) { return n ? Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }) : ""; }

  // ── Landing dashboard helpers ──

  var _SPAIN_PATH = "M175,12 L195,8 215,15 235,10 258,18 280,12 300,20 325,15 345,22 365,18 380,25 395,30 410,28 425,38 435,50 440,68 445,85 442,100 448,118 455,130 460,145 455,160 448,175 440,185 430,195 418,205 405,215 395,225 382,230 368,238 355,242 340,248 325,255 310,260 295,258 280,265 265,270 248,275 232,278 218,282 200,288 185,292 170,298 155,302 138,305 120,300 105,295 90,288 78,278 65,268 55,258 48,245 42,232 38,218 35,205 38,192 42,178 48,165 52,150 58,138 62,125 68,112 75,100 82,88 90,78 100,68 110,58 120,48 132,38 145,28 158,20 175,12Z";

  function _mapX(lon) { return (lon + 10) / 14 * 500; }
  function _mapY(lat) { return (44 - lat) / 8 * 340; }

  function _saludPill(salud) {
    var c = {saludable: {bg:"#E1F5EE",col:"#0F6E56"}, atencion: {bg:"#FAEEDA",col:"#854F0B"}, riesgo: {bg:"#FCEBEB",col:"#A32D2D"}};
    var s = c[salud] || c.atencion;
    var label = salud === "saludable" ? "Saludable" : (salud === "riesgo" ? "Riesgo" : "Atenci\u00f3n");
    return '<span style="padding:2px 8px;border-radius:9999px;font-size:0.68rem;font-weight:600;background:' + s.bg + ';color:' + s.col + ';">' + label + '</span>';
  }

  function _landingKpi(label, value, sub, color) {
    return '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:14px;text-align:center;">' +
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:4px;">' + label + '</div>' +
      '<div style="font-size:22px;font-weight:500;color:' + (color || '#1a1a1a') + ';">' + value + '</div>' +
      (sub ? '<div style="font-size:11px;color:#888;margin-top:2px;">' + sub + '</div>' : '') +
    '</div>';
  }

  function _cargarDashProy() {
    var container = document.getElementById("proy-landing-content");
    if (!container) return;
    fetch("/api/proyectos/dashboard-landing")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var k = d.kpis_globales || {};
        var pip = d.pipeline || {};
        var proys = d.proyectos_activos || [];
        var alertas = d.alertas || [];
        var prod = d.produccion_mes || {};
        var topCli = d.top_clientes_ytd || [];

        var h = '';

        // Header
        h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
          '<div><h1 style="margin:0;font-size:1.4rem;">Panel de Control</h1><p style="margin:4px 0 0;font-size:13px;color:#64748B;">Proyectos y operaciones</p></div>' +
          '<button onclick="if(typeof _proyNuevo===\'function\')_proyNuevo();else activarSubpanel(\'proyectos\',\'cotizados\')" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">+ Nuevo proyecto</button>' +
        '</div>';

        // 6 KPIs
        var margenCol = k.margen_medio_pct > 25 ? "#22c55e" : (k.margen_medio_pct > 15 ? "#eab308" : "#dc2626");
        var hincasVar = k.hincas_prev > 0 ? Math.round((k.hincas_mes - k.hincas_prev) / k.hincas_prev * 100) : 0;
        h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">';
        h += _landingKpi("Proyectos activos", k.vivos || 0, k.cotizados + " cotizados", "#2563eb");
        h += _landingKpi("Facturado YTD", _dashFmtEurCompact(k.facturado_ytd), (k.facturado_ytd_var > 0 ? "+" : "") + k.facturado_ytd_var + "% vs anterior", "#22c55e");
        h += _landingKpi("Margen medio", k.margen_medio_pct + "%", k.margen_status, margenCol);
        h += _landingKpi("Hincas mes", k.hincas_mes || 0, (hincasVar > 0 ? "+" : "") + hincasVar + "% vs anterior", "#8B5CF6");
        h += _landingKpi("Horas m\u00e1q.", k.horas_maq_mes + "h", k.maquinas_activas + " m\u00e1quinas activas", "#f59e0b");
        h += _landingKpi("En riesgo", k.en_riesgo || 0, k.en_riesgo > 0 ? "requieren atenci\u00f3n" : "todos saludables", k.en_riesgo > 0 ? "#dc2626" : "#22c55e");
        h += '</div>';

        // Pipeline
        h += '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:14px;margin-bottom:16px;">';
        h += '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#555;margin-bottom:10px;">Pipeline comercial</div>';
        h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
        var phases = [
          {k:"leads",label:"Leads",bg:"#F3F2EF",col:"#57534E",nav:"crm"},
          {k:"cotizados",label:"Cotizados",bg:"#FAEEDA",col:"#854F0B",nav:"proyectos:cotizados"},
          {k:"adjudicados",label:"Adjudicados",bg:"#E6F1FB",col:"#1E40AF",nav:"proyectos:adjudicados"},
          {k:"vivos",label:"Activos",bg:"#E1F5EE",col:"#0F6E56",nav:"proyectos:vivos"},
          {k:"terminados_ytd",label:"Terminados",bg:"#F1EFE8",col:"#57534E",nav:"proyectos:terminados"},
        ];
        phases.forEach(function(ph, i) {
          var pd = pip[ph.k] || {};
          var navParts = ph.nav.split(":");
          var navClick = navParts.length > 1 ? 'activarSubpanel(\'' + navParts[0] + '\',\'' + navParts[1] + '\')' : 'activarModulo(\'' + navParts[0] + '\')';
          h += '<div onclick="' + navClick + '" style="flex:1;min-width:80px;background:' + ph.bg + ';border-radius:6px;padding:10px 12px;text-align:center;cursor:pointer;" onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1">' +
            '<div style="font-size:20px;font-weight:600;color:' + ph.col + ';">' + (pd.count || 0) + '</div>' +
            '<div style="font-size:11px;color:' + ph.col + ';">' + ph.label + '</div>' +
            '<div style="font-size:10px;color:#888;margin-top:2px;">' + _dashFmtEurCompact(pd.importe || 0) + '</div></div>';
          if (i < 4) h += '<span style="font-size:16px;color:#ccc;">\u2192</span>';
        });
        h += '</div>';
        h += '<div style="display:flex;gap:20px;margin-top:10px;font-size:11px;color:#666;">' +
          '<span>Tasa conversi\u00f3n: <b>' + (pip.tasa_conversion || 0) + '%</b></span>' +
          '<span>Pipeline: <b>' + _dashFmtEurCompact(pip.pipeline_total || 0) + '</b></span>' +
          '<span>Ticket medio: <b>' + _dashFmtEurCompact(pip.ticket_medio || 0) + '</b></span></div>';
        h += '</div>';

        // Map + Alerts row
        h += '<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:10px;margin-bottom:16px;">';

        // Map
        var mapProys = proys.filter(function(p) { return p.ubicacion_lat && p.ubicacion_lon; });
        var sinUbic = proys.length - mapProys.length;
        h += '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:14px;">';
        h += '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#555;margin-bottom:8px;">Mapa de proyectos activos</div>';
        h += '<div style="display:flex;gap:12px;margin-bottom:6px;font-size:10px;">' +
          '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#1D9E75;"></span> Saludable</span>' +
          '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EF9F27;"></span> Atenci\u00f3n</span>' +
          '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#E24B4A;"></span> Riesgo</span></div>';
        h += '<svg viewBox="0 0 500 340" style="width:100%;max-height:260px;">';
        h += '<path d="' + _SPAIN_PATH + '" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1.5"/>';
        var pinColors = {saludable:"#1D9E75",atencion:"#EF9F27",riesgo:"#E24B4A"};
        mapProys.forEach(function(p) {
          var cx = _mapX(p.ubicacion_lon);
          var cy = _mapY(p.ubicacion_lat);
          var r = Math.max(6, Math.min(14, Math.sqrt((p.importe_presupuestado || 50000) / 5000)));
          var col = pinColors[p.salud] || "#EF9F27";
          h += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + col + '" stroke="#fff" stroke-width="1.5" style="cursor:pointer;" onclick="proyectoDashboard(' + p.id + ')"><title>' + (p.nombre||"") + ' \u2014 ' + _dashFmtEurCompact(p.importe_presupuestado) + ' \u2014 ' + p.avance_pct + '%</title></circle>';
        });
        h += '</svg>';
        if (sinUbic > 0) h += '<div style="font-size:10px;color:#aaa;margin-top:4px;">' + sinUbic + ' proyecto(s) sin ubicaci\u00f3n</div>';
        h += '</div>';

        // Alerts
        h += '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:14px;max-height:340px;overflow-y:auto;">';
        h += '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#555;margin-bottom:8px;">Alertas del portfolio</div>';
        if (!alertas.length) h += '<div style="color:#aaa;font-size:12px;padding:20px 0;text-align:center;">Sin alertas</div>';
        alertas.forEach(function(a) {
          var bg = a.nivel === "RIESGO" ? "#FCEBEB" : (a.nivel === "ATENCION" ? "#FAEEDA" : "#E6F1FB");
          var col = a.nivel === "RIESGO" ? "#A32D2D" : (a.nivel === "ATENCION" ? "#854F0B" : "#1E40AF");
          h += '<div style="padding:8px 10px;margin-bottom:6px;border-radius:6px;background:' + bg + ';">' +
            '<div style="font-size:10px;font-weight:700;color:' + col + ';text-transform:uppercase;">' + a.nivel + ' \u00b7 ' + (a.contexto || "") + '</div>' +
            '<div style="font-size:12px;color:' + col + ';margin-top:2px;">' + (a.descripcion || "") + '</div></div>';
        });
        h += '</div></div>';

        // Active projects table
        var totalPresup = proys.reduce(function(s,p){return s + (p.importe_presupuestado||0);}, 0);
        h += '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:14px;margin-bottom:16px;">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
          '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#555;">Proyectos activos</div>' +
          '<div style="font-size:11px;color:#888;">' + proys.length + ' proyectos \u00b7 ' + _dashFmtEurCompact(totalPresup) + ' en juego</div></div>';
        h += '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;">';
        h += '<thead><tr style="border-bottom:2px solid #E5E5E5;">' +
          '<th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;">Proyecto</th>' +
          '<th style="padding:6px 4px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;">Cliente</th>' +
          '<th style="padding:6px 4px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;width:120px;">Avance</th>' +
          '<th style="padding:6px 4px;text-align:right;font-size:10px;text-transform:uppercase;color:#888;">Fact / Presup</th>' +
          '<th style="padding:6px 4px;text-align:right;font-size:10px;text-transform:uppercase;color:#888;">Margen</th>' +
          '<th style="padding:6px 4px;text-align:center;font-size:10px;text-transform:uppercase;color:#888;">Salud</th>' +
          '</tr></thead><tbody>';
        proys.forEach(function(p, i) {
          var margenCol2 = p.margen_pct > 25 ? "#22c55e" : (p.margen_pct > 15 ? "#eab308" : "#dc2626");
          var barCol = p.salud === "saludable" ? "#22c55e" : (p.salud === "riesgo" ? "#dc2626" : "#eab308");
          h += '<tr style="border-bottom:1px solid #f1f1f1;cursor:pointer;' + (i%2 ? 'background:#fafafa;' : '') + '" onclick="proyectoDashboard(' + p.id + ')" onmouseover="this.style.background=\'#f0f7ff\'" onmouseout="this.style.background=\'' + (i%2 ? '#fafafa' : '') + '\'">' +
            '<td style="padding:6px 8px;font-weight:500;">' + (p.nombre || "") + '</td>' +
            '<td style="padding:6px 4px;color:#666;font-size:0.75rem;">' + (p.cliente || "\u2014") + '</td>' +
            '<td style="padding:6px 4px;"><div style="display:flex;align-items:center;gap:6px;"><div style="flex:1;height:5px;background:#E5E7EB;border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + Math.min(p.avance_pct, 100) + '%;background:' + barCol + ';border-radius:3px;"></div></div><span style="font-size:10px;font-weight:600;min-width:30px;">' + p.avance_pct + '%</span></div></td>' +
            '<td style="padding:6px 4px;text-align:right;font-size:0.75rem;">' + _dashFmtEurCompact(p.importe_facturado) + ' / ' + _dashFmtEurCompact(p.importe_presupuestado) + '</td>' +
            '<td style="padding:6px 4px;text-align:right;font-weight:500;color:' + margenCol2 + ';">' + p.margen_pct + '%</td>' +
            '<td style="padding:6px 4px;text-align:center;">' + _saludPill(p.salud) + '</td></tr>';
        });
        if (!proys.length) h += '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#aaa;">Sin proyectos activos</td></tr>';
        h += '</tbody></table></div>';

        // Production chart + Top clients row
        h += '<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:10px;margin-bottom:16px;">';

        // Production chart
        h += '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:14px;">';
        h += '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#555;margin-bottom:8px;">Producci\u00f3n global del mes</div>';
        h += '<div style="position:relative;height:220px;"><canvas id="chart-produccion-global"></canvas></div>';
        h += '<div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:#666;">' +
          '<span>Total: <b>' + (prod.total_mes || 0) + '</b></span>' +
          '<span>Media/d\u00eda: <b>' + (prod.media_dia || 0) + '</b></span>' +
          '<span>Mejor d\u00eda: <b>' + (prod.mejor_dia || 0) + '</b></span>' +
          '<span>vs anterior: <b style="color:' + ((prod.vs_anterior_pct || 0) >= 0 ? '#22c55e' : '#dc2626') + ';">' + ((prod.vs_anterior_pct || 0) > 0 ? '+' : '') + (prod.vs_anterior_pct || 0) + '%</b></span></div>';
        h += '</div>';

        // Top clients
        h += '<div style="background:#fff;border:0.5px solid #E5E5E5;border-radius:8px;padding:14px;">';
        h += '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#555;margin-bottom:10px;">Top clientes YTD</div>';
        var maxCli = topCli.length ? Math.max.apply(null, topCli.map(function(c){ return _safe_float_js(c.total) || 1; })) : 1;
        topCli.forEach(function(c, i) {
          var val = _safe_float_js(c.total);
          var pct = Math.round(val / maxCli * 100);
          h += '<div style="margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;"><span style="font-weight:500;">' + (i+1) + '. ' + (c.nombre || "?") + '</span><span style="font-weight:600;">' + _dashFmtEurCompact(val) + '</span></div>' +
            '<div style="height:5px;background:#E5E7EB;border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:#534AB7;border-radius:3px;"></div></div></div>';
        });
        if (!topCli.length) h += '<div style="color:#aaa;font-size:12px;padding:20px 0;text-align:center;">Sin datos</div>';
        h += '</div></div>';

        container.innerHTML = h;

        // Init production chart
        var canvas = document.getElementById("chart-produccion-global");
        if (canvas && (prod.dias || []).length) {
          var labels = prod.dias.map(function(d) { return d; });
          if (window._chartProdGlobal) { try { window._chartProdGlobal.destroy(); } catch(e){} }
          window._chartProdGlobal = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
              labels: labels,
              datasets: [
                { label: "Mes actual", data: prod.mes_actual || [], backgroundColor: "#534AB780", borderColor: "#534AB7", borderWidth: 1, order: 2 },
                { label: "Mes anterior", data: prod.mes_anterior || [], backgroundColor: "#D1D5DB60", borderColor: "#D1D5DB", borderWidth: 1, order: 3 },
                { label: "Objetivo", data: labels.map(function() { return prod.objetivo_diario || 0; }), type: "line", borderColor: "#9CA3AF", borderDash: [4,4], pointRadius: 0, borderWidth: 1.5, order: 1, fill: false },
              ]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { position: "top", labels: { font: { size: 10 } } } },
              scales: { y: { beginAtZero: true, title: { display: true, text: "Hincas", font: { size: 10 } } } }
            }
          });
        }
      })
      .catch(function (err) { if (container) container.innerHTML = '<p style="color:#dc3545;padding:40px;text-align:center;">Error: ' + err.message + '</p>'; });
  }

  function _safe_float_js(v) {
    if (!v) return 0;
    if (typeof v === "number") return v;
    var s = String(v).replace(/\s/g, "");
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
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

  function _kpiCard(label, value, sub, color) {
    return '<div class="card" style="padding:12px 14px;text-align:center;">' +
      '<div style="font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;">' + label + '</div>' +
      '<div style="font-size:1.2rem;font-weight:700;color:' + (color || '#1a1a1a') + ';">' + value + '</div>' +
      (sub ? '<div style="font-size:0.72rem;color:#888;">' + sub + '</div>' : '') +
    '</div>';
  }

  function _dashParseNum(val) {
    if (!val) return 0;
    if (typeof val === "number") return val;
    var s = String(val).replace(/\s/g, "");
    if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function _renderCurvaS(p) {
    var canvas = document.getElementById("chart-curva-s");
    if (!canvas) return;
    var serie = p.serie_curva_s || [];
    if (!serie.length) return;
    var labels = serie.map(function(s) { return (s.fecha || "").substring(5); });
    var prodData = serie.map(function(s) { return s.produccion || 0; });
    var acumData = serie.map(function(s) { return s.acumulado || 0; });
    var objData = serie.map(function(s) { return s.objetivo_lineal || 0; });
    if (window._chartCurvaS) { try { window._chartCurvaS.destroy(); } catch(e){} }
    window._chartCurvaS = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          { label: "Producci\u00f3n/d\u00eda", data: prodData, backgroundColor: "#3B82F640", borderColor: "#3B82F6", borderWidth: 1, yAxisID: "y", order: 3 },
          { label: "Acumulado real", data: acumData, type: "line", borderColor: "#8B5CF6", backgroundColor: "#8B5CF620", fill: true, tension: 0.3, pointRadius: 1, borderWidth: 2, yAxisID: "y1", order: 1 },
          { label: "Objetivo lineal", data: objData, type: "line", borderColor: "#9CA3AF", borderDash: [5,5], pointRadius: 0, borderWidth: 1.5, yAxisID: "y1", order: 2 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top", labels: { font: { size: 10 } } } },
        scales: {
          y: { position: "left", title: { display: true, text: "Producci\u00f3n/d\u00eda", font: { size: 10 } }, beginAtZero: true },
          y1: { position: "right", title: { display: true, text: "Acumulado", font: { size: 10 } }, beginAtZero: true, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  function _renderChartDiaSemana(p) {
    var canvas = document.getElementById("chart-dia-semana");
    if (!canvas) return;
    var rds = p.rendimiento_dia_semana || [0,0,0,0,0,0,0];
    var labels = ["L","M","X","J","V","S","D"];
    var colors = rds.map(function(_,i) { return i >= 5 ? "#D1D5DB" : "#3B82F6"; });
    if (window._chartDiaSemana) { try { window._chartDiaSemana.destroy(); } catch(e){} }
    window._chartDiaSemana = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels: labels, datasets: [{ data: rds, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, title: { display: true, text: "Media/d\u00eda", font: { size: 10 } } } }
      }
    });
  }

  window.proyectoDashboard = function (proyectoId) {
    fetch("/api/proyectos/" + proyectoId + "/dashboard-v2")
      .then(function (r) { return r.json(); })
      .then(function (p) {
        if (p.error) { mostrarToast(p.error, "error"); return; }
        var container = document.getElementById("proyecto-dashboard-content");
        var k = p.kpis || {};
        var fin = p.financiero || {};
        // ── State colors ──
        var _EC = {cotizado:"#eab308",adjudicado:"#2563eb",vivo:"#22c55e",en_curso:"#22c55e",terminado:"#3B82F6",perdido:"#ef4444",pausado:"#f59e0b"};
        var estadoColor = _EC[p.estado] || "#6B7280";
        var _estadoLabels = {cotizado:"Cotizado",adjudicado:"Adjudicado",vivo:"Activo",en_curso:"Activo",pausado:"Pausado",terminado:"Terminado",cancelado:"Cancelado",perdido:"Perdido"};
        var estadoLabel = _estadoLabels[p.estado] || (p.estado || "?").charAt(0).toUpperCase() + (p.estado || "").slice(1);
        var cliente = p.cliente_nombre || "";
        var ubicacion = p.ubicacion_texto || p.provincia || "";
        var modalLabel = (k.modalidad === "administracion" ? "Administraci\u00f3n" : "Producci\u00f3n");
        var tipoLabel = k.tipo_actividad === "mixto" ? "Mixto" : (k.tipo_actividad === "perforacion" ? "Perforaci\u00f3n" : "Hincado");

        // ── Action buttons by state ──
        var accBtns = '';
        var _bs = 'padding:5px 12px;border-radius:6px;font-size:0.78rem;font-weight:600;cursor:pointer;border:1px solid var(--border,#ccc);background:';
        if (p.estado === "vivo" || p.estado === "en_curso") {
          accBtns = '<button style="' + _bs + '#FFFBEB;color:#92400E;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'pausado\')">Pausar</button>' +
            '<button style="' + _bs + '#EFF6FF;color:#1E40AF;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'terminado\')">Terminar</button>';
        } else if (p.estado === "cotizado") {
          accBtns = '<button style="' + _bs + '#E6F1FB;color:#1E40AF;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'adjudicado\')">Adjudicar</button>' +
            '<button style="' + _bs + '#FEF2F2;color:#991B1B;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'perdido\')">Perder</button>' +
            '<button style="' + _bs + '#FEF2F2;color:#991B1B;" onclick="_proyEliminar(' + p.id + ',\'' + (p.nombre||'').replace(/'/g,"\\'") + '\')">Eliminar</button>';
        } else if (p.estado === "adjudicado") {
          accBtns = '<button style="' + _bs + '#DCFCE7;color:#166534;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'vivo\')">Iniciar obra</button>' +
            '<button style="' + _bs + '#FEF2F2;color:#991B1B;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'cancelado\')">Cancelar</button>';
        } else if (p.estado === "pausado") {
          accBtns = '<button style="' + _bs + '#DCFCE7;color:#166534;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'vivo\')">Reanudar</button>' +
            '<button style="' + _bs + '#EFF6FF;color:#1E40AF;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'terminado\')">Terminar</button>';
        } else if (p.estado === "terminado" || p.estado === "perdido") {
          accBtns = '<button style="' + _bs + '#DCFCE7;color:#166534;" onclick="_proyCambiarEstadoDash(' + p.id + ',\'vivo\')">Reabrir</button>';
        }
        accBtns += '<button style="' + _bs + '#fff;color:#3B82F6;border-color:#3B82F6;" onclick="_proyEditar(' + p.id + ')">&#x270E; Editar datos</button>';

        // ── HEADER (always visible) ──
        var hdr = '<div style="margin-bottom:16px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              '<button onclick="proyectoDashboardVolver()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;padding:4px;">&#x2190;</button>' +
              '<div><span style="font-size:0.75rem;color:#888;">' + (p.codigo || "") + '</span>' +
                ' <span style="padding:2px 8px;border-radius:9999px;font-size:0.7rem;font-weight:600;background:' + estadoColor + '18;color:' + estadoColor + ';">' + estadoLabel + '</span></div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + accBtns + '</div>' +
          '</div>' +
          '<h2 style="margin:4px 0 2px;font-size:1.3rem;">' + (p.nombre || "") + '</h2>' +
          '<div style="font-size:0.85rem;color:#666;">' + [cliente, ubicacion, tipoLabel + " por " + modalLabel].filter(Boolean).join(" \u00b7 ") + '</div>' +
        '</div>';

        // ���─ Progress bar ──
        hdr += '<div class="card" style="padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
          '<div style="flex:1;min-width:200px;"><div style="font-size:0.78rem;color:#888;margin-bottom:4px;">' + k.ejecutadas + ' de ' + k.objetivo + ' ' + k.unidad_principal + '</div>' +
          '<div style="height:8px;background:#E5E7EB;border-radius:4px;overflow:hidden;"><div style="height:100%;width:' + Math.min(k.avance_pct, 100) + '%;background:' + (k.avance_pct >= 100 ? '#22c55e' : '#3B82F6') + ';border-radius:4px;"></div></div></div>';
        if (k.dias_restantes != null) {
          var devColor = k.desviacion_dias != null ? (k.desviacion_dias > 0 ? "#dc2626" : "#22c55e") : "#666";
          var devText = k.desviacion_dias != null ? (k.desviacion_dias > 0 ? "+" + k.desviacion_dias + "d" : k.desviacion_dias + "d") : "";
          hdr += '<div style="text-align:right;"><div style="font-size:0.78rem;color:#888;">Fin estimado</div><div style="font-size:1rem;font-weight:700;">' + (k.fecha_fin_estimada || "\u2014") + '</div>' +
            (devText ? '<div style="font-size:0.75rem;color:' + devColor + ';">' + devText + ' vs plan</div>' : '') + '</div>';
        }
        hdr += '</div>';

        // ── TAB BUTTONS ──
        var tabs = [["resumen","Resumen"],["produccion","Producci\u00f3n"],["operativo","Operativo"],["financiero","Financiero"],["certificaciones","Certificaciones"]];
        var tabBar = '<div style="display:flex;border-bottom:2px solid var(--border,#e9ecef);margin-bottom:16px;">';
        tabs.forEach(function(t) {
          tabBar += '<button class="proy-dash-tab" data-tab="' + t[0] + '" onclick="proyDashCambiarTab(\'' + t[0] + '\')" style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.85rem;font-weight:600;border-bottom:2px solid ' + (t[0]==="resumen" ? 'var(--color-primary)' : 'transparent') + ';color:' + (t[0]==="resumen" ? 'var(--color-primary)' : 'var(--color-text-secondary)') + ';margin-bottom:-2px;">' + t[1] + '</button>';
        });
        tabBar += '</div>';

        // ── TAB: RESUMEN ──
        var margenColor = fin.margen_pct > 30 ? "#22c55e" : fin.margen_pct > 15 ? "#eab308" : "#dc2626";
        var tabResumen = '<div id="proy-dash-tab-resumen" class="proy-dash-tab-content">' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;">' +
            _kpiCard("Facturado", _dashFmtEurCompact(fin.facturado), fin.presupuesto > 0 ? Math.round(fin.facturado/fin.presupuesto*100) + "% ppto" : "", "#3B82F6") +
            _kpiCard("Costes reales", _dashFmtEurCompact(fin.costes), "", "#f59e0b") +
            _kpiCard("Margen bruto", _dashFmtEurCompact(fin.margen), fin.margen_pct + "%", margenColor) +
            _kpiCard("Ritmo", k.ritmo_diario + " " + k.unidad_principal.split("+")[0] + "/d\u00eda", k.dias_restantes != null ? k.dias_restantes + " d\u00edas restantes" : "", "#8B5CF6") +
          '</div>';

        // Desglose costes + Equipo hoy
        tabResumen += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">';
        // Left: cost breakdown
        var dc = p.desglose_costes || {};
        var dcTotal = Object.values(dc).reduce(function(a,b){return a+b;}, 0) || 1;
        tabResumen += '<div class="card" style="padding:14px;"><h4 style="margin:0 0 10px;font-size:0.88rem;font-weight:700;">Desglose de costes</h4>';
        ["personal","gasoil","transporte","hoteles","otros"].forEach(function(cat) {
          var val = dc[cat] || 0;
          var pct = Math.round(val / dcTotal * 100);
          var colors = {personal:"#3B82F6",gasoil:"#f59e0b",transporte:"#10B981",hoteles:"#8B5CF6",otros:"#6B7280"};
          tabResumen += '<div style="margin-bottom:6px;"><div style="display:flex;justify-content:space-between;font-size:0.78rem;"><span>' + cat.charAt(0).toUpperCase() + cat.slice(1) + '</span><span style="font-weight:600;">' + _dashFmtEur(val) + ' (' + pct + '%)</span></div>' +
            '<div style="height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:' + (colors[cat]||"#888") + ';border-radius:3px;"></div></div></div>';
        });
        tabResumen += '</div>';

        // Right: equipo hoy
        var eq = p.equipo_hoy || [];
        tabResumen += '<div class="card" style="padding:14px;"><h4 style="margin:0 0 10px;font-size:0.88rem;font-weight:700;">Equipo asignado hoy (' + eq.length + ')</h4>';
        if (eq.length) {
          eq.forEach(function(e) {
            var icon = e.recurso_tipo === "empleado" ? "\uD83D\uDC77" : "\uD83C\uDFD7\uFE0F";
            tabResumen += '<div style="padding:3px 0;font-size:0.82rem;">' + icon + ' ' + e.recurso_nombre + (e.funcion ? ' <span style="color:#888;">(' + e.funcion + ')</span>' : '') + '</div>';
          });
        } else {
          tabResumen += '<div style="color:#888;font-size:0.82rem;">Sin asignaciones hoy</div>';
        }
        tabResumen += '</div></div>';

        // Alerts
        var alertas = p.alertas || [];
        if (alertas.length) {
          tabResumen += '<div class="card" style="padding:14px;margin-bottom:16px;"><h4 style="margin:0 0 8px;font-size:0.88rem;font-weight:700;">Alertas</h4>';
          alertas.forEach(function(a) {
            var bg = a.nivel === "alta" ? "#FEF2F2" : a.nivel === "media" ? "#FFFBEB" : "#EFF6FF";
            var col = a.nivel === "alta" ? "#dc2626" : a.nivel === "media" ? "#ca8a04" : "#1E40AF";
            tabResumen += '<div style="padding:6px 10px;margin-bottom:4px;border-radius:6px;background:' + bg + ';color:' + col + ';font-size:0.82rem;font-weight:500;">' + a.texto + '</div>';
          });
          tabResumen += '</div>';
        }
        tabResumen += '</div>';

        // ── TAB: PRODUCCION ──
        var tabProd = '<div id="proy-dash-tab-produccion" class="proy-dash-tab-content" style="display:none;">';
        // KPIs
        tabProd += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">' +
          _kpiCard("Partes", k.total_partes, "", "#3B82F6") +
          _kpiCard(k.unidad_principal.split("+")[0] + "/d\u00eda", k.ritmo_diario + "", "", "#22c55e");
        if (k.tipo_actividad === "mixto") {
          tabProd += _kpiCard("Hincas", k.total_hincas, "", "#8B5CF6") + _kpiCard("Perfor.", k.total_perforaciones, "", "#f59e0b");
        } else {
          tabProd += _kpiCard("Horas m\u00e1q.", k.total_horas_maquina + "h", "", "#f59e0b");
        }
        tabProd += _kpiCard("Sin firmar", k.partes_sin_firmar, "", k.partes_sin_firmar > 0 ? "#dc2626" : "#22c55e") + '</div>';

        // Curva S
        tabProd += '<div class="card" style="padding:14px;margin-bottom:16px;"><h4 style="margin:0 0 8px;font-size:0.88rem;font-weight:700;">Curva S</h4>' +
          '<div style="position:relative;height:280px;"><canvas id="chart-curva-s"></canvas></div></div>';

        // Rendimiento por día semana
        tabProd += '<div class="card" style="padding:14px;margin-bottom:16px;"><h4 style="margin:0 0 8px;font-size:0.88rem;font-weight:700;">Rendimiento por d\u00eda de la semana</h4>' +
          '<div style="position:relative;height:180px;"><canvas id="chart-dia-semana"></canvas></div></div>';
        tabProd += '</div>';

        // ── TAB: OPERATIVO ──
        var tabOper = '<div id="proy-dash-tab-operativo" class="proy-dash-tab-content" style="display:none;">';
        // Partes table
        tabOper += '<div class="card" style="padding:14px;margin-bottom:16px;"><h4 style="margin:0 0 8px;font-size:0.88rem;font-weight:700;">Partes de trabajo</h4>';
        tabOper += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.8rem;">';
        // Adaptive headers
        tabOper += '<thead><tr style="background:#f1f3f5;">' +
          '<th style="padding:5px 6px;text-align:left;">Fecha</th>';
        if (k.tipo_actividad !== "perforacion") tabOper += '<th style="padding:5px 4px;text-align:right;">Hincas</th>';
        if (k.tipo_actividad !== "hinca") tabOper += '<th style="padding:5px 4px;text-align:right;">Perf.</th>';
        tabOper += '<th style="padding:5px 4px;text-align:right;">Horas m\u00e1q.</th>' +
          '<th style="padding:5px 4px;text-align:right;">H. admin</th>' +
          '<th style="padding:5px 4px;">Incidencia</th>' +
          '<th style="padding:5px 4px;text-align:center;">Estado</th>' +
          '<th style="padding:5px 4px;text-align:center;">Acc.</th></tr></thead><tbody>';
        (p.partes || []).forEach(function(pt) {
          var ef = (pt.estado_firma || "borrador");
          var rowBg = ef === "borrador" ? "background:#FEF2F2;" : (pt.incidencias ? "background:#FFFBEB;" : "");
          var estPill = ef === "firmado" ? '<span style="padding:1px 6px;border-radius:9999px;font-size:0.68rem;font-weight:600;background:#DCFCE7;color:#166534;">Firmado</span>' :
            '<span style="padding:1px 6px;border-radius:9999px;font-size:0.68rem;font-weight:600;background:#FEF2F2;color:#dc2626;">Borrador</span>';
          tabOper += '<tr style="border-bottom:1px solid var(--border,#e9ecef);' + rowBg + '">' +
            '<td style="padding:4px 6px;">' + (pt.fecha || "") + '</td>';
          if (k.tipo_actividad !== "perforacion") tabOper += '<td style="padding:4px 4px;text-align:right;">' + (pt.hincas_realizadas || 0) + '</td>';
          if (k.tipo_actividad !== "hinca") tabOper += '<td style="padding:4px 4px;text-align:right;">' + (pt.perforaciones_realizadas || 0) + '</td>';
          tabOper += '<td style="padding:4px 4px;text-align:right;">' + (pt.horas_maquina || 0) + '</td>' +
            '<td style="padding:4px 4px;text-align:right;">' + (pt.horas_admin || 0) + '</td>' +
            '<td style="padding:4px 4px;font-size:0.75rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (pt.incidencias || "\u2014") + '</td>' +
            '<td style="padding:4px 4px;text-align:center;">' + estPill + '</td>' +
            '<td style="padding:4px 4px;text-align:center;white-space:nowrap;">' +
              '<button onclick="parteVer(' + pt.id + ',' + p.id + ')" title="Ver" style="background:none;border:none;cursor:pointer;color:#6B7280;font-size:0.8rem;margin-right:2px;">&#x1F441;</button>' +
              '<button onclick="parteEditar(' + pt.id + ',' + p.id + ')" title="Editar" style="background:none;border:none;cursor:pointer;color:#3B82F6;font-size:0.8rem;">&#x270E;</button></td></tr>';
        });
        if (!(p.partes || []).length) tabOper += '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#888;">Sin partes</td></tr>';
        tabOper += '</tbody></table></div></div>';

        // Calendar placeholder
        tabOper += '<div class="card" style="padding:14px;margin-bottom:16px;"><h4 style="margin:0 0 8px;font-size:0.88rem;font-weight:700;">Calendario de asignaciones</h4>' +
          '<div id="proy-dash-calendario"></div></div>';
        tabOper += '</div>';

        // ── TAB: FINANCIERO ──
        var tabFin = '<div id="proy-dash-tab-financiero" class="proy-dash-tab-content" style="display:none;">';
        tabFin += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;">' +
          _kpiCard("Presupuestado", _dashFmtEurCompact(fin.presupuesto), "", "#6B7280") +
          _kpiCard("Facturado", _dashFmtEurCompact(fin.facturado), fin.presupuesto > 0 ? Math.round(fin.facturado/fin.presupuesto*100) + "% ppto" : "", "#3B82F6") +
          _kpiCard("Cobrado", _dashFmtEurCompact(fin.cobrado), fin.facturado > 0 ? Math.round(fin.cobrado/fin.facturado*100) + "% fact." : "", "#22c55e") +
          _kpiCard("Margen bruto", _dashFmtEurCompact(fin.margen), fin.margen_pct + "%", margenColor) +
        '</div>';

        // Facturas cliente
        tabFin += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">';
        tabFin += '<div class="card" style="padding:14px;"><h4 style="margin:0 0 8px;font-size:0.88rem;font-weight:700;">Facturaci\u00f3n cliente</h4>';
        tabFin += '<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">';
        (p.facturas_cliente || []).forEach(function(f) {
          var ec = (f.estado_cobro || "pendiente");
          var ecCol = ec === "cobrada" ? "#22c55e" : ec === "vencida" ? "#dc2626" : "#eab308";
          tabFin += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
            '<td style="padding:4px 4px;">' + (f.numero_factura || "?") + '</td>' +
            '<td style="padding:4px 4px;">' + (f.fecha_factura || "") + '</td>' +
            '<td style="padding:4px 4px;text-align:right;font-weight:600;">' + _dashFmtEur(_dashParseNum(f.total_a_pagar)) + '</td>' +
            '<td style="padding:4px 4px;text-align:center;"><span style="padding:1px 6px;border-radius:9999px;font-size:0.65rem;font-weight:600;background:' + ecCol + '18;color:' + ecCol + ';">' + ec + '</span></td></tr>';
        });
        if (!(p.facturas_cliente || []).length) tabFin += '<tr><td colspan="4" style="text-align:center;padding:1rem;color:#888;">Sin facturas</td></tr>';
        tabFin += '</table></div>';

        // Costes proveedor top
        tabFin += '<div class="card" style="padding:14px;"><h4 style="margin:0 0 8px;font-size:0.88rem;font-weight:700;">Costes por proveedor</h4>';
        var byProv = {};
        (p.costes || []).forEach(function(c) {
          var nm = c.proveedor || "?";
          if (!byProv[nm]) byProv[nm] = {count: 0, total: 0};
          byProv[nm].count++;
          byProv[nm].total += _dashParseNum(c.total_a_pagar || c.total);
        });
        var provList = Object.keys(byProv).map(function(nm) { return {nombre: nm, count: byProv[nm].count, total: byProv[nm].total}; }).sort(function(a,b){return b.total-a.total;}).slice(0,10);
        provList.forEach(function(pv) {
          tabFin += '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.78rem;border-bottom:1px solid var(--border,#e9ecef);"><span>' + pv.nombre + ' <span style="color:#888;">(' + pv.count + ')</span></span><span style="font-weight:600;">' + _dashFmtEur(pv.total) + '</span></div>';
        });
        if (!provList.length) tabFin += '<div style="color:#888;font-size:0.82rem;">Sin costes</div>';
        tabFin += '</div></div>';
        tabFin += '</div>';

        // ── TAB: CERTIFICACIONES ──
        var tabCert = '<div id="proy-dash-tab-certificaciones" class="proy-dash-tab-content" style="display:none;">';
        // Button to generate new certification
        tabCert += '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;"><button onclick="_proyGenerarCertModal(' + p.id + ')" style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:0.82rem;font-weight:600;cursor:pointer;">+ Generar certificaci\u00f3n</button></div>';
        var cr = p.certificaciones_resumen || {};
        tabCert += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">' +
          _kpiCard("Total importe", _dashFmtEurCompact(cr.total_importe || 0), "", "#3B82F6") +
          _kpiCard("Borradores", cr.borrador || 0, "", "#6B7280") +
          _kpiCard("Enviadas", cr.enviada || 0, "", "#eab308") +
          _kpiCard("Aprobadas", cr.aprobada || 0, "", "#22c55e") +
        '</div>';

        tabCert += '<div class="card" style="padding:14px;"><table style="width:100%;border-collapse:collapse;font-size:0.82rem;">';
        tabCert += '<thead><tr style="background:#f1f3f5;"><th style="padding:5px 6px;">#</th><th style="padding:5px 4px;">Periodo</th><th style="padding:5px 4px;">Tipo</th><th style="padding:5px 4px;text-align:right;">Hincas</th><th style="padding:5px 4px;text-align:right;">H. Admin</th><th style="padding:5px 4px;text-align:right;">Importe</th><th style="padding:5px 4px;text-align:center;">Estado</th><th style="padding:5px 4px;">Factura</th></tr></thead><tbody>';
        (p.certificaciones || []).forEach(function(c) {
          var estCol = c.estado === "aprobada" ? "#22c55e" : c.estado === "enviada" ? "#eab308" : "#6B7280";
          tabCert += '<tr style="border-bottom:1px solid var(--border,#e9ecef);">' +
            '<td style="padding:4px 6px;">' + (c.numero || "") + '</td>' +
            '<td style="padding:4px 4px;">' + (c.fecha_desde || "") + ' \u2192 ' + (c.fecha_hasta || "") + '</td>' +
            '<td style="padding:4px 4px;">' + (c.tipo || "") + '</td>' +
            '<td style="padding:4px 4px;text-align:right;">' + (c.total_hincas || 0) + '</td>' +
            '<td style="padding:4px 4px;text-align:right;">' + (c.total_horas_admin || 0) + '</td>' +
            '<td style="padding:4px 4px;text-align:right;font-weight:600;">' + _dashFmtEur(c.importe_total || 0) + '</td>' +
            '<td style="padding:4px 4px;text-align:center;"><span style="padding:1px 6px;border-radius:9999px;font-size:0.65rem;font-weight:600;background:' + estCol + '18;color:' + estCol + ';">' + (c.estado || "borrador") + '</span></td>' +
            '<td style="padding:4px 4px;">' + (c.factura_ref || "\u2014") + '</td></tr>';
        });
        if (!(p.certificaciones || []).length) tabCert += '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#888;">Sin certificaciones</td></tr>';
        tabCert += '</tbody></table></div>';
        tabCert += '</div>';

        // ── Assemble ──
        container.innerHTML = hdr + tabBar + tabResumen + tabProd + tabOper + tabFin + tabCert;

        // Render charts after DOM insert
        _renderCurvaS(p);
        _renderChartDiaSemana(p);
        // Render calendar in operativo tab
        if (typeof _renderRecursosCalendario === "function") {
          _recProyId = p.id;
          _renderRecursosCalendario(p.id);
        }

        // Mostrar panel
        activarSubpanel("proyectos", "dashboard");

      })
      .catch(function (err) { mostrarToast("Error al cargar dashboard: " + err.message, "error"); });
  };

  // ── Old dashboard code removed ──
  if (false) { var margen = 0;
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
          var _firmaPill = function(ef) {
            if (ef === "firmado") return '<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:#DCFCE7;color:#166534;">Firmado</span>';
            if (ef === "firmado_con_cambios") return '<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:#FEF3C7;color:#92400E;">Con cambios</span>';
            if (ef === "borrador") return '<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:#FEE2E2;color:#991B1B;">Borrador</span>';
            return '<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:#F3F4F6;color:#6B7280;">\u2014</span>';
          };
          var filas = p.partes.slice(0, 20).map(function (pt) {
            var _hincadoras = pt.num_operadores || 0;
            try { var _ln = JSON.parse(pt.notas || "[]"); if (Array.isArray(_ln)) _hincadoras = _ln.filter(function(l){return l.rol !== "ayudante";}).length || _hincadoras; } catch(e){}
            return '<tr style="border-bottom:1px solid var(--color-border);">' +
              '<td style="padding:8px 6px;">' + _esc((pt.fecha || "").substring(0, 10)) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;font-weight:500;">' + (pt.hincas_realizadas || 0) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;">' + (pt.horas_admin || 0) + '</td>' +
              '<td style="padding:8px 6px;text-align:right;">' + _hincadoras + '</td>' +
              '<td style="padding:8px 6px;font-size:12px;color:' + (pt.incidencias ? 'var(--color-danger)' : 'var(--color-text-secondary)') + ';">' + (pt.incidencias ? _esc(pt.incidencias).substring(0, 50) : "\u2014") + '</td>' +
              '<td style="padding:8px 6px;text-align:center;">' + _firmaPill(pt.estado_firma) + '</td>' +
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
            '<th style="text-align:center;padding:8px 6px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Firma</th>' +
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

        // ═══ Sección: Recursos asignados (calendar) ═══
        document.getElementById("proy-dash-recursos-section").innerHTML =
          '<div class="presup-section" style="margin-bottom:16px;">' +
            '<div class="presup-section-header"><div class="presup-section-number" style="background:#7C3AED;">\uD83D\uDD27</div><div class="presup-section-title">Recursos asignados</div>' +
            '<div style="margin-left:auto;"><button style="padding:5px 14px;font-size:12px;font-weight:500;color:var(--color-primary);background:transparent;border:1px solid var(--color-primary);border-radius:6px;cursor:pointer;" onclick="proyectoAsignarRecursoModal(' + p.id + ')">+ Asignar recurso</button></div></div>' +
            '<div class="presup-section-body" style="border-left-color:#7C3AED;">' +
              '<div style="display:grid;grid-template-columns:1fr 220px;gap:16px;">' +
                '<div>' +
                  '<div id="proy-recursos-cal" style="margin-bottom:16px;"></div>' +
                  '<div id="proy-recursos-semana" style="margin-bottom:8px;"></div>' +
                  '<div id="proy-recursos-semana2"></div>' +
                '</div>' +
                '<div id="proy-recursos-sidebar" style="border-left:1px solid var(--color-border);padding-left:16px;"></div>' +
              '</div>' +
            '</div></div>';
        _renderRecursosCalendario(p.id);

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

  } // end if(false) — dead old code above

  window._proyCambiarEstadoDash = function (id, estado) {
    var labelEstado = estado === "vivo" ? "iniciar obra" : (estado === "adjudicado" ? "adjudicar" : estado);
    if (!confirm("Cambiar estado del proyecto a '" + labelEstado + "'?")) return;
    fetch("/api/proyectos/" + id + "/estado", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: estado }) })
      .then(function (r) { return r.json(); })
      .then(function () { mostrarToast("Estado actualizado.", "success"); proyectoDashboard(id); });
  };

  window._proyEliminar = function (id, nombre) {
    if (!confirm("\u00bfSeguro que quieres eliminar el proyecto " + nombre + "? Esta acci\u00f3n no se puede deshacer.")) return;
    fetch("/api/proyectos/" + id, { method: "DELETE" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { mostrarToast(d.error, "error"); return; }
        mostrarToast("Proyecto eliminado.", "success");
        activarSubpanel("proyectos", "cotizados");
      });
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
    if (tab === "produccion") {
      if (window._chartCurvaS) try { window._chartCurvaS.resize(); } catch (e) {}
      if (window._chartDiaSemana) try { window._chartDiaSemana.resize(); } catch (e) {}
    }
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

  // ── Recursos: calendario + semanas + sidebar ──────────────────────────

  var _recProyId = null;
  var _recAsignaciones = [];

  function _renderRecursosCalendario(proyectoId) {
    _recProyId = proyectoId;
    var hoy = new Date();
    var y = hoy.getFullYear(), m = hoy.getMonth();

    // Fetch asignaciones for current + next month
    var desde = new Date(y, m, 1).toISOString().slice(0, 10);
    var hasta = new Date(y, m + 2, 0).toISOString().slice(0, 10);

    Promise.all([
      fetch("/api/proyectos/" + proyectoId + "/asignaciones?desde=" + desde + "&hasta=" + hasta).then(function(r){return r.json();}),
      fetch("/api/proyectos/" + proyectoId + "/recursos").then(function(r){return r.json();}),
    ]).then(function (results) {
      _recAsignaciones = results[0].asignaciones || [];
      var recursos = results[1].recursos || [];
      _pintarCalMes(y, m);
      _pintarSemanas(hoy);
      _pintarSidebar(recursos, proyectoId);
    }).catch(function () {});
  }
  window._renderRecursosCalendario = _renderRecursosCalendario;

  function _asigPorFecha() {
    var map = {};
    _recAsignaciones.forEach(function (a) {
      if (!map[a.fecha]) map[a.fecha] = [];
      map[a.fecha].push(a);
    });
    return map;
  }

  function _pintarCalMes(y, m) {
    var el = document.getElementById("proy-recursos-cal");
    if (!el) return;
    var dias = ["L","M","X","J","V","S","D"];
    var hoyStr = new Date().toISOString().slice(0, 10);
    var porFecha = _asigPorFecha();
    var primerDia = new Date(y, m, 1).getDay(); // 0=Sun
    primerDia = primerDia === 0 ? 6 : primerDia - 1; // Convert to Mon=0
    var diasMes = new Date(y, m + 1, 0).getDate();
    var meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
      '<button onclick="_recNavMes(-1)" style="background:none;border:none;cursor:pointer;font-size:16px;">\u25C0</button>' +
      '<span style="font-size:13px;font-weight:600;">' + meses[m] + ' ' + y + '</span>' +
      '<button onclick="_recNavMes(1)" style="background:none;border:none;cursor:pointer;font-size:16px;">\u25B6</button></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">';
    dias.forEach(function (d) { html += '<div style="text-align:center;font-size:10px;font-weight:600;color:var(--color-text-secondary);padding:2px;">' + d + '</div>'; });
    for (var i = 0; i < primerDia; i++) html += '<div></div>';
    for (var d = 1; d <= diasMes; d++) {
      var fecha = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var dow = new Date(y, m, d).getDay();
      var esFinde = dow === 0 || dow === 6;
      var esHoy = fecha === hoyStr;
      var tiene = porFecha[fecha] && porFecha[fecha].length > 0;
      var bg = esHoy ? '#DBEAFE' : tiene ? '#DCFCE7' : esFinde ? '#F9FAFB' : '#fff';
      var brd = esHoy ? '2px solid #3B82F6' : '1px solid #E5E7EB';
      html += '<div style="text-align:center;padding:3px 2px;font-size:11px;background:' + bg + ';border:' + brd + ';border-radius:4px;cursor:pointer;position:relative;" title="' + fecha + '">' +
        d + (tiene ? '<div style="width:4px;height:4px;border-radius:50%;background:#16A34A;margin:1px auto 0;"></div>' : '') + '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  window._recCalY = new Date().getFullYear();
  window._recCalM = new Date().getMonth();
  window._recNavMes = function (delta) {
    window._recCalM += delta;
    if (window._recCalM > 11) { window._recCalM = 0; window._recCalY++; }
    if (window._recCalM < 0) { window._recCalM = 11; window._recCalY--; }
    _pintarCalMes(window._recCalY, window._recCalM);
  };

  function _pintarSemanas(hoy) {
    var lunes = new Date(hoy);
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
    _pintarSemana("proy-recursos-semana", lunes, "Esta semana");
    var lunes2 = new Date(lunes);
    lunes2.setDate(lunes2.getDate() + 7);
    _pintarSemana("proy-recursos-semana2", lunes2, "Semana siguiente");
  }

  function _pintarSemana(containerId, lunes, titulo) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var hoyStr = new Date().toISOString().slice(0, 10);
    var porFecha = _asigPorFecha();
    var diasNom = ["Lun","Mar","Mié","Jue","Vie"];
    var html = '<div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--color-text-secondary);">' + titulo + '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">';
    for (var i = 0; i < 5; i++) {
      var d = new Date(lunes);
      d.setDate(d.getDate() + i);
      var fecha = d.toISOString().slice(0, 10);
      var esHoy = fecha === hoyStr;
      var headerBg = esHoy ? '#DBEAFE' : 'var(--color-bg-page)';
      var headerBrd = esHoy ? 'border:2px solid #3B82F6;' : '';
      html += '<div><div style="font-size:11px;font-weight:600;text-align:center;padding:4px;background:' + headerBg + ';border-radius:6px;' + headerBrd + '">' +
        diasNom[i] + ' ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '</div>';
      html += '<div style="margin-top:4px;min-height:40px;">';
      var asigs = porFecha[fecha] || [];
      if (asigs.length) {
        asigs.forEach(function (a) {
          var bg = a.recurso_tipo === 'empleado' ? '#DCFCE7' : a.recurso_tipo === 'maquina' ? '#DBEAFE' : '#FEF3C7';
          var icon = a.recurso_tipo === 'empleado' ? '\uD83D\uDC77' : a.recurso_tipo === 'maquina' ? '\uD83C\uDFD7\uFE0F' : '\uD83D\uDE97';
          var fdTag = (a.funcion_dia && a.recurso_tipo === 'empleado') ? ' <span title="Funci\u00f3n del d\u00eda: ' + a.funcion_dia + '" style="font-size:8px;background:#F59E0B;color:#fff;border-radius:2px;padding:0 2px;">' + (a.funcion_dia === 'ayudante' ? 'Ay' : 'Op') + '</span>' : '';
          var nombreEsc = _esc(a.recurso_nombre).replace(/'/g, "\\'");
          html += '<div onclick="desasignarDia(' + _recProyId + ',\'' + a.recurso_tipo + '\',' + a.recurso_id + ',\'' + fecha + '\',\'' + nombreEsc + '\')" style="padding:3px 6px;font-size:10px;background:' + bg + ';border-radius:4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;" title="Click para desasignar este d\u00eda">' + icon + ' ' + _esc(a.recurso_nombre) + fdTag + '</div>';
        });
      } else {
        html += '<div style="font-size:10px;color:#CBD5E1;text-align:center;padding:8px 0;">\u2014</div>';
      }
      html += '</div></div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  var _svgTrash = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
  var _svgPencil = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

  function _sidebarRecursoHtml(r, proyectoId) {
    var icon = r.recurso_tipo === 'empleado' ? '\uD83D\uDC77' : '\uD83C\uDFD7\uFE0F';
    var nombreEsc = _esc(r.recurso_nombre).replace(/'/g, "\\'");
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">' +
      '<span style="font-size:12px;">' + icon + ' ' + _esc(r.recurso_nombre) + ' <span style="color:#94A3B8;">(' + r.dias_asignados + 'd)</span></span>' +
      '<div style="display:flex;gap:2px;align-items:center;">' +
        '<button onclick="editarAsignacion(' + proyectoId + ',\'' + r.recurso_tipo + '\',' + r.recurso_id + ',\'' + nombreEsc + '\')" title="Editar fechas" style="background:none;border:none;cursor:pointer;padding:2px;color:var(--color-text-secondary);" onmouseover="this.style.color=\'var(--color-primary)\'" onmouseout="this.style.color=\'var(--color-text-secondary)\'">' + _svgPencil + '</button>' +
        '<button onclick="desasignarRecurso(' + proyectoId + ',\'' + r.recurso_tipo + '\',' + r.recurso_id + ',\'' + nombreEsc + '\')" title="Desasignar" style="background:none;border:none;cursor:pointer;padding:2px;color:var(--color-text-secondary);" onmouseover="this.style.color=\'#DC2626\'" onmouseout="this.style.color=\'var(--color-text-secondary)\'">' + _svgTrash + '</button>' +
      '</div></div>';
  }

  function _pintarSidebar(recursos, proyectoId) {
    var el = document.getElementById("proy-recursos-sidebar");
    if (!el) return;
    var emps = recursos.filter(function (r) { return r.recurso_tipo === 'empleado'; });
    var maqs = recursos.filter(function (r) { return r.recurso_tipo === 'maquina'; });
    var html = '';
    if (emps.length) {
      html += '<div style="font-size:11px;font-weight:600;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:6px;">\uD83D\uDC77 Equipo</div>';
      emps.forEach(function (r) { html += _sidebarRecursoHtml(r, proyectoId); });
    }
    if (maqs.length) {
      html += '<div style="font-size:11px;font-weight:600;color:var(--color-text-secondary);text-transform:uppercase;margin-top:12px;margin-bottom:6px;">\uD83C\uDFD7\uFE0F Máquinas</div>';
      maqs.forEach(function (r) { html += _sidebarRecursoHtml(r, proyectoId); });
    }
    if (!recursos.length) {
      html = '<p style="font-size:12px;color:var(--color-text-secondary);font-style:italic;">Sin recursos asignados</p>';
    }
    el.innerHTML = html;
  }

  // ── Modal asignar recurso (nuevo) ──

  window.proyectoAsignarRecursoModal = function (proyectoId) {
    var hoy = new Date().toISOString().slice(0, 10);
    var existing = document.getElementById("modal-asignar-recurso");
    if (existing) existing.remove();
    var _L = "font-size:11px;color:#888780;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;";

    // Fetch data in parallel
    Promise.all([
      fetch("/api/recursos/disponibles?fecha=" + hoy + "&tipo=empleado").then(function(r){return r.json();}),
      fetch("/api/recursos/disponibles?fecha=" + hoy + "&tipo=maquina").then(function(r){return r.json();}),
    ]).then(function (results) {
      var emps = results[0].recursos || [];
      var maqs = results[1].recursos || [];

      // Build employee rows
      var empHtml = '';
      emps.forEach(function(e) {
        var initials = ((e.nombre || "?")[0] + ((e.nombre || "").split(" ")[1] || "")[0] || "").toUpperCase();
        var isBaja = e.estado === "baja";
        var puesto = e.puesto || e.detalle || "";
        var puestoLabel = puesto === "ayudante" ? "Ayudante" : "Operador";
        var avatarBg = isBaja ? "#FCEBEB" : (puesto === "ayudante" ? "#EAF3DE" : "#E6F1FB");
        var avatarCol = isBaja ? "#A32D2D" : (puesto === "ayudante" ? "#27500A" : "#185FA5");
        var pillBg = isBaja ? "#FCEBEB" : (puesto === "ayudante" ? "#EAF3DE" : "#E6F1FB");
        var pillCol = isBaja ? "#A32D2D" : (puesto === "ayudante" ? "#27500A" : "#042C53");
        var bajaStyle = isBaja ? "opacity:0.55;background:repeating-linear-gradient(45deg,#FCEBEB,#FCEBEB 4px,white 4px,white 8px);cursor:not-allowed;" : "";
        var nameStyle = isBaja ? "text-decoration:line-through;" : "";
        var sub = isBaja ? '<span style="color:#A32D2D;">De baja</span>' : (e.detalle || "");
        var coste = e.coste_dia ? " \u00b7 " + Number(e.coste_dia).toFixed(0) + " \u20ac/d" : "";

        empHtml += '<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:' + (isBaja ? 'not-allowed' : 'pointer') + ';transition:background 0.15s;' + bajaStyle + '" ' + (!isBaja ? 'onmouseover="this.style.background=\'#F5F7FA\'" onmouseout="this.style.background=\'transparent\'"' : '') + '>' +
          '<input type="checkbox" name="emp" value="' + e.id + '|' + (e.nombre||"") + '"' + (isBaja ? ' disabled' : '') + ' style="margin:0;" onchange="_arUpdateResumen()">' +
          '<div style="width:28px;height:28px;border-radius:50%;background:' + avatarBg + ';color:' + avatarCol + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;flex-shrink:0;">' + initials + '</div>' +
          '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;' + nameStyle + '">' + (e.nombre||"") + '</div><div style="font-size:11px;color:#888780;">' + sub + coste + '</div></div>' +
          '<span style="background:' + pillBg + ';color:' + pillCol + ';font-size:10px;padding:2px 8px;border-radius:999px;">' + (isBaja ? "Baja" : puestoLabel) + '</span>' +
          (!isBaja ? '<select name="fn-' + e.id + '" style="padding:3px 6px;font-size:11px;border:0.5px solid #E5E5E5;border-radius:4px;background:white;"><option value="">Habitual</option><option value="operador">Op.</option><option value="ayudante">Ay.</option></select>' : '') +
          '</label>';
      });

      // Build machine cards
      var maqHtml = '';
      maqs.forEach(function(m) {
        var isAveria = m.estado === "averia" || m.estado === "taller";
        var estadoPill = isAveria ? '<span style="background:#FCEBEB;color:#A32D2D;font-size:10px;padding:2px 6px;border-radius:999px;">Aver\u00eda</span>' :
          '<span style="background:#E1F5EE;color:#0F6E56;font-size:10px;padding:2px 6px;border-radius:999px;">OK</span>';
        maqHtml += '<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:' + (isAveria ? 'not-allowed' : 'pointer') + ';' + (isAveria ? 'opacity:0.55;' : '') + 'transition:background 0.15s;" ' + (!isAveria ? 'onmouseover="this.style.background=\'#F5F7FA\'" onmouseout="this.style.background=\'transparent\'"' : '') + '>' +
          '<input type="checkbox" name="maq" value="' + m.id + '|' + (m.nombre||"") + '"' + (isAveria ? ' disabled' : '') + ' style="margin:0;" onchange="_arUpdateResumen()">' +
          '<span style="font-size:14px;">\uD83C\uDFD7\uFE0F</span>' +
          '<div style="flex:1;"><div style="font-size:13px;font-weight:500;">' + (m.nombre||"") + '</div><div style="font-size:11px;color:#888780;">' + (m.detalle||"") + '</div></div>' +
          estadoPill + '</label>';
      });

      var modal = document.createElement("div");
      modal.id = "modal-asignar-recurso";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;";
      modal.innerHTML = '<div style="background:white;border-radius:12px;width:640px;max-width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,0.15);">' +
        // Header
        '<div style="padding:20px 24px;border-bottom:0.5px solid #E5E5E5;display:flex;justify-content:space-between;align-items:flex-start;">' +
          '<div><div style="font-size:10px;color:#888780;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Planificador</div><div style="font-size:18px;font-weight:500;">Asignar equipo a proyecto</div></div>' +
          '<button onclick="document.getElementById(\'modal-asignar-recurso\').remove()" style="background:none;border:none;font-size:20px;color:#888780;cursor:pointer;padding:0;">\u00d7</button></div>' +
        '<div style="padding:20px 24px;">' +
        // Fechas
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">' +
          '<div><div style="' + _L + '">Desde</div><input type="date" id="ar-desde" value="' + hoy + '" onchange="_arUpdateResumen()" style="width:100%;padding:8px 12px;border:0.5px solid #E5E5E5;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>' +
          '<div><div style="' + _L + '">Hasta</div><input type="date" id="ar-hasta" value="' + hoy + '" onchange="_arUpdateResumen()" style="width:100%;padding:8px 12px;border:0.5px solid #E5E5E5;border-radius:6px;font-size:13px;box-sizing:border-box;"></div></div>' +
        // Empleados
        '<div style="margin-bottom:20px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;"><div style="' + _L + 'margin-bottom:0;">Empleados (' + emps.length + ')</div>' +
          '<button onclick="_arSelAll(\'emp\')" style="background:none;border:none;font-size:11px;color:#185FA5;cursor:pointer;">Seleccionar todos</button></div>' +
          '<div style="display:flex;flex-direction:column;gap:4px;max-height:240px;overflow-y:auto;border:0.5px solid #E5E5E5;border-radius:8px;padding:6px;">' + empHtml + '</div></div>' +
        // Máquinas
        '<div style="margin-bottom:20px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;"><div style="' + _L + 'margin-bottom:0;">M\u00e1quinas (' + maqs.length + ')</div>' +
          '<button onclick="_arSelAll(\'maq\')" style="background:none;border:none;font-size:11px;color:#185FA5;cursor:pointer;">Seleccionar todas</button></div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;border:0.5px solid #E5E5E5;border-radius:8px;padding:6px;">' + maqHtml + '</div></div>' +
        // Resumen
        '<div style="padding:12px 14px;background:#EEF4FA;border-radius:8px;font-size:12px;">' +
          '<div style="display:flex;justify-content:space-between;"><span style="color:#888780;">Seleccionados:</span><span style="font-weight:500;" id="ar-resumen-count">0 empleados + 0 m\u00e1quinas \u00b7 1 d\u00eda</span></div>' +
          '<div style="display:flex;justify-content:space-between;margin-top:4px;"><span style="color:#888780;">Coste estimado:</span><span style="font-weight:500;color:#0F6E56;" id="ar-resumen-coste">0 \u20ac</span></div></div>' +
        '</div>' +
        // Footer
        '<div style="padding:14px 24px;border-top:0.5px solid #E5E5E5;display:flex;justify-content:flex-end;gap:10px;">' +
          '<button onclick="document.getElementById(\'modal-asignar-recurso\').remove()" style="padding:8px 18px;font-size:13px;background:white;border:0.5px solid #D3D1C7;border-radius:6px;cursor:pointer;">Cancelar</button>' +
          '<button id="ar-btn-guardar" style="padding:8px 18px;font-size:13px;background:#1D9E75;border:none;color:white;border-radius:6px;font-weight:500;cursor:pointer;">Asignar equipo</button></div>' +
      '</div>';
      modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
      document.body.appendChild(modal);
      _arUpdateResumen();

      // Save handler
      document.getElementById("ar-btn-guardar").addEventListener("click", function () {
        var desde = document.getElementById("ar-desde").value;
        var hasta = document.getElementById("ar-hasta").value || desde;
        if (!desde) return;
        var checks = modal.querySelectorAll("input[name=emp]:checked, input[name=maq]:checked");
        if (!checks.length) { mostrarToast("Selecciona al menos un recurso", "error"); return; }
        var promises = [];
        checks.forEach(function(cb) {
          var parts = cb.value.split("|");
          var tipo = cb.name === "emp" ? "empleado" : "maquina";
          var payload = { recurso_tipo: tipo, recurso_id: parseInt(parts[0]), recurso_nombre: parts[1], fecha: desde, fecha_hasta: hasta };
          if (tipo === "empleado") {
            var fnSel = modal.querySelector("select[name=fn-" + parts[0] + "]");
            if (fnSel && fnSel.value) payload.funcion_dia = fnSel.value;
          }
          promises.push(fetch("/api/proyectos/" + proyectoId + "/asignaciones", {
            method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload)
          }));
        });
        Promise.all(promises).then(function() {
          modal.remove();
          mostrarToast(checks.length + " recurso(s) asignado(s).", "success");
          _renderRecursosCalendario(proyectoId);
        }).catch(function() { mostrarToast("Error.", "error"); });
      });
    });
  };

  window._arSelAll = function(tipo) {
    var modal = document.getElementById("modal-asignar-recurso");
    if (!modal) return;
    modal.querySelectorAll("input[name=" + tipo + "]:not(:disabled)").forEach(function(cb) { cb.checked = true; });
    _arUpdateResumen();
  };

  window._arUpdateResumen = function() {
    var modal = document.getElementById("modal-asignar-recurso");
    if (!modal) return;
    var empCount = modal.querySelectorAll("input[name=emp]:checked").length;
    var maqCount = modal.querySelectorAll("input[name=maq]:checked").length;
    var desde = (document.getElementById("ar-desde") || {}).value || "";
    var hasta = (document.getElementById("ar-hasta") || {}).value || desde;
    var dias = 1;
    if (desde && hasta) { dias = Math.max(1, Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1); }
    var countEl = document.getElementById("ar-resumen-count");
    if (countEl) countEl.textContent = empCount + " empleados + " + maqCount + " m\u00e1quinas \u00b7 " + dias + " d\u00eda(s)";
    var costeEl = document.getElementById("ar-resumen-coste");
    if (costeEl) costeEl.textContent = (empCount * 120 * dias) + " \u20ac (aprox)"; // rough estimate
  };

  window.desasignarRecurso = function (proyectoId, tipo, recursoId, nombre) {
    if (!confirm("\u00bfEliminar " + nombre + " de este proyecto? Se borrar\u00e1n todas sus asignaciones.")) return;
    fetch("/api/proyectos/" + proyectoId + "/asignaciones", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurso_tipo: tipo, recurso_id: recursoId, fecha: "2000-01-01", fecha_hasta: "2099-12-31" }),
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { mostrarToast(d.error, "error"); return; }
        mostrarToast(nombre + " eliminado del proyecto.", "success");
        proyectoDashboard(proyectoId);
      })
      .catch(function () { mostrarToast("Error al eliminar.", "error"); });
  };

  window.desasignarDia = function (proyectoId, tipo, recursoId, fecha, nombre) {
    if (!confirm("\u00bfDesasignar " + nombre + " el " + fecha + "?")) return;
    fetch("/api/proyectos/" + proyectoId + "/asignaciones", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurso_tipo: tipo, recurso_id: recursoId, fecha: fecha }),
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { mostrarToast(d.error, "error"); return; }
        mostrarToast(nombre + " desasignado el " + fecha + ".", "success");
        _renderRecursosCalendario(proyectoId);
      })
      .catch(function () { mostrarToast("Error al desasignar.", "error"); });
  };

  // ── Modal calendario edición de asignaciones ──
  window.editarAsignacion = function (proyectoId, tipo, recursoId, nombre) {
    Promise.all([
      fetch("/api/proyectos/" + proyectoId).then(function (r) { return r.json(); }),
      fetch("/api/proyectos/" + proyectoId + "/asignaciones?recurso_tipo=" + tipo + "&recurso_id=" + recursoId).then(function (r) { return r.json(); }),
    ]).then(function (results) {
      var proy = results[0];
      var asigs = results[1].asignaciones || [];
      _abrirModalCalendarioRecurso(proyectoId, tipo, recursoId, nombre, proy, asigs);
    });
  };

  function _abrirModalCalendarioRecurso(proyectoId, tipo, recursoId, nombre, proy, asigs) {
    var existing = document.getElementById("modal-editar-asignacion");
    if (existing) existing.remove();
    // Determine project date range
    var inicio = proy.fecha_inicio_real || proy.fecha_inicio_estimada || new Date().toISOString().slice(0, 10);
    var fin = proy.fecha_fin_real || proy.fecha_fin_estimada || "";
    if (!fin) {
      var d = new Date(inicio); d.setMonth(d.getMonth() + 3);
      fin = d.toISOString().slice(0, 10);
    }
    // Build set of assigned dates
    var asigSet = {};
    asigs.forEach(function (a) { asigSet[a.fecha] = true; });

    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-editar-asignacion";
    modal.style.zIndex = "110";
    modal.addEventListener("click", function (ev) { if (ev.target === modal) modal.remove(); });

    // Parse month for navigation
    var inicioDate = new Date(inicio + "T00:00:00");
    var finDate = new Date(fin + "T00:00:00");
    var curYear = inicioDate.getFullYear(), curMonth = inicioDate.getMonth();

    function renderModal() {
      var meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
      var diasNom = ["L","M","X","J","V","S","D"];
      // Count totals
      var allCells = [];
      var totalLaborables = 0;
      var d = new Date(curYear, curMonth, 1);
      var lastDay = new Date(curYear, curMonth + 1, 0).getDate();
      var primerDow = (d.getDay() + 6) % 7; // 0=Mon

      var calHtml = '<div style="display:grid;grid-template-columns:repeat(7,36px);gap:4px;justify-content:center;">';
      // Day headers
      for (var h = 0; h < 7; h++) {
        calHtml += '<div style="text-align:center;font-size:11px;font-weight:600;color:var(--color-text-secondary);padding:4px 0;">' + diasNom[h] + '</div>';
      }
      // Empty cells before first day
      for (var e = 0; e < primerDow; e++) {
        calHtml += '<div></div>';
      }
      // Days
      for (var day = 1; day <= lastDay; day++) {
        var dd = new Date(curYear, curMonth, day);
        var fecha = dd.toISOString().slice(0, 10);
        var dow = dd.getDay(); // 0=Sun
        var esFinDeSemana = dow === 0 || dow === 6;
        var enRango = dd >= inicioDate && dd <= finDate;

        if (esFinDeSemana || !enRango) {
          calHtml += '<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:6px;font-size:12px;background:#F3F4F6;color:#9CA3AF;opacity:0.5;">' + day + '</div>';
        } else {
          totalLaborables++;
          var asig = !!asigSet[fecha];
          var bg = asig ? '#DCFCE7' : 'var(--color-bg-page, #F8FAFC)';
          var col = asig ? '#166534' : 'var(--color-text-secondary)';
          var brd = asig ? '#16A34A' : 'var(--color-border-tertiary, #E5E7EB)';
          calHtml += '<div class="cal-dia-recurso" data-fecha="' + fecha + '" data-asignado="' + (asig ? '1' : '0') + '" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;background:' + bg + ';color:' + col + ';border:1px solid ' + brd + ';">' + day + '</div>';
        }
      }
      calHtml += '</div>';

      var seleccionados = 0;
      for (var k in asigSet) { if (asigSet[k]) seleccionados++; }

      modal.innerHTML =
        '<div class="modal-editar" role="dialog" style="max-width:380px;">' +
          '<h2 style="margin:0 0 4px;font-size:16px;">Asignaci\u00f3n de ' + _esc(nombre) + '</h2>' +
          '<p style="margin:0 0 12px;font-size:12px;color:var(--color-text-secondary);">' + _esc(proy.nombre || '') + '</p>' +
          '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
            '<button class="btn-small cal-btn-selall">Seleccionar todo</button>' +
            '<button class="btn-small cal-btn-quitall">Quitar todo</button>' +
          '</div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
            '<button class="btn-small cal-btn-prev" style="padding:2px 8px;">\u2190</button>' +
            '<span style="font-size:13px;font-weight:600;">' + meses[curMonth] + ' ' + curYear + '</span>' +
            '<button class="btn-small cal-btn-next" style="padding:2px 8px;">\u2192</button>' +
          '</div>' +
          calHtml +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;">' +
            '<span id="cal-resumen" style="font-size:12px;color:var(--color-text-secondary);">' + seleccionados + ' d\u00edas seleccionados</span>' +
            '<div style="display:flex;gap:8px;">' +
              '<button type="button" class="secondary cal-btn-cancelar">Cancelar</button>' +
              '<button type="button" class="primary cal-btn-guardar">Guardar</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      _bindCalEvents();
    }

    function _updateResumen() {
      var n = 0;
      for (var k in asigSet) { if (asigSet[k]) n++; }
      var el = document.getElementById("cal-resumen");
      if (el) el.textContent = n + " d\u00edas seleccionados";
    }

    function _bindCalEvents() {
      // Toggle days
      modal.querySelectorAll(".cal-dia-recurso").forEach(function (el) {
        el.addEventListener("click", function () {
          var fecha = this.dataset.fecha;
          var asig = this.dataset.asignado === "1";
          if (asig) {
            this.dataset.asignado = "0";
            this.style.background = "var(--color-bg-page, #F8FAFC)";
            this.style.color = "var(--color-text-secondary)";
            this.style.borderColor = "var(--color-border-tertiary, #E5E7EB)";
            delete asigSet[fecha];
          } else {
            this.dataset.asignado = "1";
            this.style.background = "#DCFCE7";
            this.style.color = "#166534";
            this.style.borderColor = "#16A34A";
            asigSet[fecha] = true;
          }
          _updateResumen();
        });
      });
      // Select all / clear all
      var btnSelAll = modal.querySelector(".cal-btn-selall");
      var btnQuitAll = modal.querySelector(".cal-btn-quitall");
      if (btnSelAll) btnSelAll.addEventListener("click", function () {
        modal.querySelectorAll(".cal-dia-recurso").forEach(function (el) {
          el.dataset.asignado = "1";
          el.style.background = "#DCFCE7";
          el.style.color = "#166534";
          el.style.borderColor = "#16A34A";
          asigSet[el.dataset.fecha] = true;
        });
        _updateResumen();
      });
      if (btnQuitAll) btnQuitAll.addEventListener("click", function () {
        modal.querySelectorAll(".cal-dia-recurso").forEach(function (el) {
          el.dataset.asignado = "0";
          el.style.background = "var(--color-bg-page, #F8FAFC)";
          el.style.color = "var(--color-text-secondary)";
          el.style.borderColor = "var(--color-border-tertiary, #E5E7EB)";
          delete asigSet[el.dataset.fecha];
        });
        _updateResumen();
      });
      // Month navigation
      var btnPrev = modal.querySelector(".cal-btn-prev");
      var btnNext = modal.querySelector(".cal-btn-next");
      if (btnPrev) btnPrev.addEventListener("click", function () {
        curMonth--;
        if (curMonth < 0) { curMonth = 11; curYear--; }
        modal.remove();
        renderModal();
      });
      if (btnNext) btnNext.addEventListener("click", function () {
        curMonth++;
        if (curMonth > 11) { curMonth = 0; curYear++; }
        modal.remove();
        renderModal();
      });
      // Cancel
      var btnCancel = modal.querySelector(".cal-btn-cancelar");
      if (btnCancel) btnCancel.addEventListener("click", function () { modal.remove(); });
      // Save
      var btnGuardar = modal.querySelector(".cal-btn-guardar");
      if (btnGuardar) btnGuardar.addEventListener("click", function () {
        var fechas = [];
        for (var k in asigSet) { if (asigSet[k]) fechas.push(k); }
        fechas.sort();
        btnGuardar.disabled = true;
        btnGuardar.textContent = "Guardando\u2026";
        fetch("/api/proyectos/" + proyectoId + "/asignaciones/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recurso_tipo: tipo, recurso_id: recursoId, recurso_nombre: nombre, fechas: fechas }),
        }).then(function (r) { return r.json(); })
          .then(function (d) {
            if (d.error) { mostrarToast(d.error, "error"); btnGuardar.disabled = false; btnGuardar.textContent = "Guardar"; return; }
            modal.remove();
            mostrarToast("Asignaci\u00f3n actualizada (" + fechas.length + " d\u00edas).", "success");
            _renderRecursosCalendario(proyectoId);
          })
          .catch(function () { mostrarToast("Error al guardar.", "error"); btnGuardar.disabled = false; btnGuardar.textContent = "Guardar"; });
      });
    }

    renderModal();
  }

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
            '<td style="white-space:nowrap;"><button class="primary" style="font-size:0.75rem;padding:2px 10px;" onclick="_proyActivar(' + p.id + ')">Adjudicar</button> ' +
            '<button style="font-size:0.75rem;padding:2px 10px;background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;border-radius:4px;cursor:pointer;" onclick="_proyPerder(' + p.id + ')">Perder</button> ' +
            '<button class="secondary" style="font-size:0.75rem;padding:2px 10px;" onclick="_proyEditar(' + p.id + ')">Editar</button></td></tr>';
        });
        html += '</tbody></table>';
        c.innerHTML = html;
      });
  };
  var panelCot = document.getElementById("panel-proyectos-cotizados");
  if (panelCot) new MutationObserver(function () { if (panelCot.classList.contains("visible")) _proyCotizados(); }).observe(panelCot, { attributes: true, attributeFilter: ["class"] });

  window._proyActivar = function (id) {
    if (!confirm("Adjudicar este proyecto? Pasara a estado 'vivo'.")) return;
    fetch("/api/proyectos/" + id + "/estado", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "vivo" }) })
      .then(function (r) { return r.json(); })
      .then(function () { mostrarToast("Proyecto adjudicado.", "success"); _proyCotizados(); _proyVivos(); });
  };

  window._proyPerder = function (id) {
    if (!confirm("Marcar como perdido? El proyecto pasara a estado 'perdido'.")) return;
    fetch("/api/proyectos/" + id + "/estado", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "perdido" }) })
      .then(function (r) { return r.json(); })
      .then(function () { mostrarToast("Proyecto marcado como perdido.", "success"); _proyCotizados(); });
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
    fetch("/api/proyectos?estado=vivo,adjudicado,pausado")
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

  // ── Adjudicados ──
  window._proyAdjudicados = function () {
    var el = document.getElementById("proy-adjudicados-content");
    if (!el) return;
    el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:1rem;">Cargando...</p>';
    fetch("/api/proyectos?estado=adjudicado")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var proys = d.proyectos || [];
        if (!proys.length) { el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:2rem;">Sin proyectos adjudicados.</p>'; return; }
        var h = '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">';
        h += '<thead><tr style="background:#f1f3f5;"><th style="padding:6px 8px;text-align:left;">C\u00f3digo</th><th style="padding:6px 4px;text-align:left;">Nombre</th><th style="padding:6px 4px;">Cliente</th><th style="padding:6px 4px;">Ubicaci\u00f3n</th><th style="padding:6px 4px;text-align:right;">Presupuesto</th><th style="padding:6px 4px;">Inicio est.</th><th style="padding:6px 4px;text-align:center;">Acc.</th></tr></thead><tbody>';
        proys.forEach(function (p) {
          h += '<tr style="border-bottom:1px solid #e9ecef;cursor:pointer;" onclick="proyectoDashboard(' + p.id + ')">' +
            '<td style="padding:5px 8px;font-family:monospace;">' + (p.codigo || "") + '</td>' +
            '<td style="padding:5px 4px;font-weight:500;">' + (p.nombre || "") + '</td>' +
            '<td style="padding:5px 4px;font-size:0.78rem;">' + (p.cliente_nombre || "\u2014") + '</td>' +
            '<td style="padding:5px 4px;font-size:0.78rem;">' + (p.provincia || p.ubicacion_texto || "\u2014") + '</td>' +
            '<td style="padding:5px 4px;text-align:right;">' + _dashFmtEurCompact(p.importe_presupuestado) + '</td>' +
            '<td style="padding:5px 4px;">' + (p.fecha_inicio_estimada || "\u2014") + '</td>' +
            '<td style="padding:5px 4px;text-align:center;"><button onclick="event.stopPropagation();_proyCambiarEstadoDash(' + p.id + ',\'vivo\')" style="padding:3px 8px;background:#DCFCE7;color:#166534;border:1px solid #86EFAC;border-radius:4px;font-size:0.75rem;cursor:pointer;">Iniciar obra</button></td></tr>';
        });
        h += '</tbody></table>';
        el.innerHTML = h;
      });
  };
  var panelAdj = document.getElementById("panel-proyectos-adjudicados");
  if (panelAdj) new MutationObserver(function () { if (panelAdj.classList.contains("visible")) _proyAdjudicados(); }).observe(panelAdj, { attributes: true, attributeFilter: ["class"] });

  var panelViv = document.getElementById("panel-proyectos-vivos");
  if (panelViv) new MutationObserver(function () { if (panelViv.classList.contains("visible")) _proyVivos(); }).observe(panelViv, { attributes: true, attributeFilter: ["class"] });

  window._proyCambiarEstado = function (id, estado) {
    var labelEstado = estado === "vivo" ? "reactivar (volver a vivo)" : estado;
    if (!confirm("Cambiar estado del proyecto a '" + labelEstado + "'?")) return;
    fetch("/api/proyectos/" + id + "/estado", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: estado }) })
      .then(function (r) { return r.json(); })
      .then(function () { mostrarToast("Estado actualizado.", "success"); _proyVivos(); _proyCotizados(); if(typeof _proyAdjudicados==='function')_proyAdjudicados(); _proyTerminados(); });
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
    // Pricing hinca/perforación
    document.getElementById("proy-tipo-actividad").value = p ? p.tipo_actividad || "hinca" : "hinca";
    document.getElementById("proy-hinca-cantidad").value = p ? p.hinca_cantidad || "" : "";
    document.getElementById("proy-hinca-prod-op").value = p ? p.hinca_precio_prod_operador || "" : "";
    document.getElementById("proy-hinca-prod-ay").value = p ? p.hinca_precio_prod_ayudante || "" : "";
    document.getElementById("proy-hinca-admin-op").value = p ? p.hinca_precio_admin_operador || "1300" : "1300";
    document.getElementById("proy-hinca-admin-ay").value = p ? p.hinca_precio_admin_ayudante || "1600" : "1600";
    document.getElementById("proy-perf-cantidad").value = p ? p.perforacion_cantidad || "" : "";
    document.getElementById("proy-perf-prod-op").value = p ? p.perforacion_precio_prod_operador || "" : "";
    document.getElementById("proy-perf-prod-ay").value = p ? p.perforacion_precio_prod_ayudante || "" : "";
    document.getElementById("proy-perf-admin-op").value = p ? p.perforacion_precio_admin_operador || "" : "";
    document.getElementById("proy-perf-admin-ay").value = p ? p.perforacion_precio_admin_ayudante || "" : "";
    // Localización
    document.getElementById("proy-edit-direccion").value = p ? p.direccion || "" : "";
    document.getElementById("proy-edit-municipio").value = p ? p.municipio || "" : "";
    document.getElementById("proy-edit-provincia-loc").value = p ? p.provincia || "" : "";
    document.getElementById("proy-edit-lat").value = p ? p.ubicacion_lat || "" : "";
    document.getElementById("proy-edit-lon").value = p ? p.ubicacion_lon || "" : "";
    _proyActualizarGmapsLink();
    _proyToggleActividad();
    _proyCalcResumen();
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
      tipo_actividad: document.getElementById("proy-tipo-actividad").value || "hinca",
      hinca_cantidad: parseInt(document.getElementById("proy-hinca-cantidad").value) || 0,
      hinca_precio_prod_operador: parseFloat(document.getElementById("proy-hinca-prod-op").value) || 0,
      hinca_precio_prod_ayudante: parseFloat(document.getElementById("proy-hinca-prod-ay").value) || 0,
      hinca_precio_admin_operador: parseFloat(document.getElementById("proy-hinca-admin-op").value) || 1300,
      hinca_precio_admin_ayudante: parseFloat(document.getElementById("proy-hinca-admin-ay").value) || 1600,
      perforacion_cantidad: parseInt(document.getElementById("proy-perf-cantidad").value) || 0,
      perforacion_precio_prod_operador: parseFloat(document.getElementById("proy-perf-prod-op").value) || 0,
      perforacion_precio_prod_ayudante: parseFloat(document.getElementById("proy-perf-prod-ay").value) || 0,
      perforacion_precio_admin_operador: parseFloat(document.getElementById("proy-perf-admin-op").value) || 0,
      perforacion_precio_admin_ayudante: parseFloat(document.getElementById("proy-perf-admin-ay").value) || 0,
      estado: document.getElementById("proy-estado").value,
      fecha_inicio_estimada: document.getElementById("proy-fecha-inicio").value || null,
      fecha_fin_estimada: document.getElementById("proy-fecha-fin").value || null,
      notas: document.getElementById("proy-notas").value,
      direccion: document.getElementById("proy-edit-direccion").value || null,
      municipio: document.getElementById("proy-edit-municipio").value || null,
      ubicacion_lat: document.getElementById("proy-edit-lat").value ? parseFloat(document.getElementById("proy-edit-lat").value) : null,
      ubicacion_lon: document.getElementById("proy-edit-lon").value ? parseFloat(document.getElementById("proy-edit-lon").value) : null,
    };
    var esCotizadoNuevo = !id && body.estado === "cotizado";
    var url = id ? "/api/proyectos/" + id : (esCotizadoNuevo ? "/api/proyectos/cotizado" : "/api/proyectos");
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
              '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Horas admin</label>' +
                '<input type="number" id="parte-horas-admin" step="0.5" min="0" value="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
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
      horas_admin: parseFloat((document.getElementById("parte-horas-admin") || {}).value) || 0,
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
            '<div style="margin-top:8px;"><button onclick="window.open(\'' + imgUrl + '\',\'_blank\')" style="padding:6px 14px;font-size:13px;font-weight:500;color:var(--color-primary);background:transparent;border:1px solid var(--color-primary);border-radius:6px;cursor:pointer;">Ver parte original</button>' + imgFirmadoBtn + '</div>' +
          '</div>';
        } else {
          imgHtml = '<div style="text-align:center;margin-bottom:16px;padding:12px;color:var(--color-text-secondary);font-size:13px;font-style:italic;">Parte cargado manualmente \u2014 sin imagen adjunta</div>';
        }

        function _vFmt(v) { return v != null && v !== "" ? v : "\u2014"; }

        // Firma badge
        var _ef = pt.estado_firma || "";
        var firmaBadge = "";
        if (_ef === "firmado") firmaBadge = '<div style="padding:8px 16px;background:#DCFCE7;border-radius:8px;margin-bottom:12px;font-weight:600;color:#166534;font-size:13px;">✅ Parte firmado</div>';
        else if (_ef === "firmado_con_cambios") {
          firmaBadge = '<div style="padding:8px 16px;background:#FEF3C7;border-radius:8px;margin-bottom:12px;font-weight:600;color:#92400E;font-size:13px;">⚠️ Firmado con diferencias</div>';
          if (pt.diferencias_firma) {
            try { var diffs = JSON.parse(pt.diferencias_firma); if (Array.isArray(diffs)) firmaBadge += '<div style="padding:6px 16px;background:#FEF3C7;border-radius:0 0 8px 8px;margin-top:-12px;margin-bottom:12px;font-size:12px;color:#92400E;">' + diffs.join("<br>") + '</div>'; } catch(e){}
          }
        }
        else if (_ef === "borrador") firmaBadge = '<div style="padding:8px 16px;background:#FEE2E2;border-radius:8px;margin-bottom:12px;font-weight:600;color:#991B1B;font-size:13px;">📝 Pendiente de firma</div>';

        // Imagen firmado button
        var imgFirmadoBtn = "";
        if (pt.imagen_firmado) {
          var imgFUrl = "/api/archivo?ruta=" + encodeURIComponent(pt.imagen_firmado);
          imgFirmadoBtn = ' <button onclick="window.open(\'' + imgFUrl + '\',\'_blank\')" style="padding:6px 14px;font-size:13px;font-weight:500;color:#16A34A;background:transparent;border:1px solid #16A34A;border-radius:6px;cursor:pointer;">Ver parte firmado</button>';
        }

        modal.innerHTML =
          '<div class="modal-content" style="max-width:600px;max-height:90vh;overflow-y:auto;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
              '<h2 style="margin:0;">Parte de trabajo #' + pt.id + '</h2>' +
              '<span style="font-size:13px;color:var(--color-text-secondary);">' + _esc((pt.fecha || "").substring(0, 10)) + '</span>' +
            '</div>' +
            firmaBadge +
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
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Horas admin</label>' +
                  '<input type="number" id="pe-horas-admin" value="' + (pt.horas_admin || 0) + '" step="0.5" min="0" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
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

            '<div style="border-left:3px solid #7C3AED;padding:12px 16px;margin-bottom:16px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#7C3AED;margin-bottom:8px;">Estado de firma</div>' +
              '<select id="pe-estado-firma" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);">' +
                '<option value="borrador"' + (pt.estado_firma === "borrador" ? " selected" : "") + '>Borrador</option>' +
                '<option value="firmado"' + (pt.estado_firma === "firmado" ? " selected" : "") + '>Firmado</option>' +
                '<option value="firmado_con_cambios"' + (pt.estado_firma === "firmado_con_cambios" ? " selected" : "") + '>Firmado con cambios</option>' +
              '</select>' +
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
      horas_admin: parseFloat((document.getElementById("pe-horas-admin") || {}).value) || 0,
      combustible_litros: parseFloat((document.getElementById("pe-gasoil") || {}).value) || null,
      incidencias: (document.getElementById("pe-incidencias") || {}).value || "",
      estado_firma: (document.getElementById("pe-estado-firma") || {}).value || "borrador",
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

  // ── Generar certificación modal ──
  window._proyGenerarCertModal = function (proyId) {
    var old = document.getElementById("modal-gen-cert");
    if (old) old.remove();
    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-gen-cert";
    modal.style.zIndex = "110";
    modal.innerHTML = '<div class="modal-editar" role="dialog" style="max-width:420px;">' +
      '<h2 style="margin:0 0 16px;">Generar certificaci\u00f3n</h2>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
        '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Desde</label><input type="date" id="gc-desde" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);box-sizing:border-box;"></div>' +
        '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Hasta</label><input type="date" id="gc-hasta" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);box-sizing:border-box;"></div></div>' +
      '<div id="gc-preview" style="padding:10px;background:#f8f9fa;border-radius:6px;margin-bottom:12px;font-size:12px;color:#666;">Selecciona fechas para ver vista previa</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button class="secondary" onclick="document.getElementById(\'modal-gen-cert\').remove()">Cancelar</button>' +
        '<button class="primary" style="width:auto;" id="gc-btn-generar">Generar</button>' +
      '</div></div>';
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    function preview() {
      var desde = document.getElementById("gc-desde").value;
      var hasta = document.getElementById("gc-hasta").value;
      var el = document.getElementById("gc-preview");
      if (!desde || !hasta) { el.textContent = "Selecciona fechas"; return; }
      fetch("/api/proyectos/" + proyId + "/dashboard").then(function(r){return r.json();}).then(function(d) {
        var partes = (d.partes || []).filter(function(pt) { return pt.fecha >= desde && pt.fecha <= hasta; });
        var hincas = 0, horas = 0;
        partes.forEach(function(pt) { hincas += (pt.hincas_realizadas||0); horas += (pt.horas_admin||0); });
        el.innerHTML = '<b>' + partes.length + ' partes</b> en rango<br>Hincas: <b>' + hincas + '</b> | Horas admin: <b>' + horas + '</b>';
      });
    }
    document.getElementById("gc-desde").addEventListener("change", preview);
    document.getElementById("gc-hasta").addEventListener("change", preview);
    document.getElementById("gc-btn-generar").addEventListener("click", function() {
      var desde = document.getElementById("gc-desde").value;
      var hasta = document.getElementById("gc-hasta").value;
      if (!desde || !hasta) { mostrarToast("Selecciona fechas", "error"); return; }
      fetch("/api/proyectos/" + proyId + "/certificaciones", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({fecha_desde: desde, fecha_hasta: hasta})
      }).then(function(r){return r.json();}).then(function(d) {
        if (d.error) { mostrarToast(d.error, "error"); return; }
        document.getElementById("modal-gen-cert").remove();
        mostrarToast("Certificaci\u00f3n generada.", "success");
        proyectoDashboard(proyId);
      }).catch(function() { mostrarToast("Error", "error"); });
    });
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

// ── Pricing hinca/perforación: toggle y cálculo ──
window._proyToggleActividad = function () {
  var tipo = document.getElementById("proy-tipo-actividad").value;
  var hinca = document.getElementById("proy-seccion-hinca");
  var perf = document.getElementById("proy-seccion-perforacion");
  if (hinca) hinca.style.display = (tipo === "hinca" || tipo === "mixto") ? "" : "none";
  if (perf) perf.style.display = (tipo === "perforacion" || tipo === "mixto") ? "" : "none";
  _proyCalcResumen();
};

window._proyCalcResumen = function () {
  var tipo = (document.getElementById("proy-tipo-actividad") || {}).value || "hinca";
  var fmtN = function (n) { return n ? n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20ac" : "\u2014"; };
  var html = "";
  if (tipo === "hinca" || tipo === "mixto") {
    var hCant = parseInt(document.getElementById("proy-hinca-cantidad").value) || 0;
    var hOp = parseFloat(document.getElementById("proy-hinca-prod-op").value) || 0;
    var hAy = parseFloat(document.getElementById("proy-hinca-prod-ay").value) || 0;
    if (hCant > 0 && (hOp > 0 || hAy > 0)) {
      html += '<div style="margin-bottom:6px;"><b style="color:#3B82F6;">Hinca prod.:</b> ';
      if (hOp > 0) html += hCant + ' x ' + fmtN(hOp) + ' = <b>' + fmtN(hCant * hOp) + '</b> (m\u00e1q+oper) ';
      if (hAy > 0) html += '| ' + hCant + ' x ' + fmtN(hAy) + ' = <b>' + fmtN(hCant * hAy) + '</b> (con ayud.)';
      html += '</div>';
    }
  }
  if (tipo === "perforacion" || tipo === "mixto") {
    var pCant = parseInt(document.getElementById("proy-perf-cantidad").value) || 0;
    var pOp = parseFloat(document.getElementById("proy-perf-prod-op").value) || 0;
    var pAy = parseFloat(document.getElementById("proy-perf-prod-ay").value) || 0;
    if (pCant > 0 && (pOp > 0 || pAy > 0)) {
      html += '<div style="margin-bottom:6px;"><b style="color:#16A34A;">Perf. prod.:</b> ';
      if (pOp > 0) html += pCant + ' x ' + fmtN(pOp) + ' = <b>' + fmtN(pCant * pOp) + '</b> (m\u00e1q+oper) ';
      if (pAy > 0) html += '| ' + pCant + ' x ' + fmtN(pAy) + ' = <b>' + fmtN(pCant * pAy) + '</b> (con ayud.)';
      html += '</div>';
    }
  }
  var resEl = document.getElementById("proy-resumen-pricing");
  if (resEl) resEl.innerHTML = html || '<span style="color:#888;">Introduce cantidades y precios para ver el resumen</span>';
};

// ── Localización helpers ──
function _proyActualizarGmapsLink() {
  var dir = (document.getElementById("proy-edit-direccion") || {}).value || "";
  var mun = (document.getElementById("proy-edit-municipio") || {}).value || "";
  var prov = (document.getElementById("proy-edit-provincia-loc") || {}).value || "";
  var q = [dir, mun, prov].filter(Boolean).join(" ");
  var link = document.getElementById("proy-link-gmaps");
  if (link) link.href = q ? "https://www.google.com/maps/search/" + encodeURIComponent(q) : "#";
}
window._proyActualizarGmapsLink = _proyActualizarGmapsLink;

window._proyBuscarCoords = function () {
  var dir = (document.getElementById("proy-edit-direccion") || {}).value || "";
  var mun = (document.getElementById("proy-edit-municipio") || {}).value || "";
  var prov = (document.getElementById("proy-edit-provincia-loc") || {}).value || "";
  var q = [dir, mun, prov].filter(Boolean).join(", ");
  if (!q) { if (typeof mostrarToast === "function") mostrarToast("Introduce direcci\u00f3n, municipio o provincia.", "error"); return; }
  fetch("https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(q) + "&format=json&countrycodes=es,pt&limit=1", { headers: { "User-Agent": "HincadoDirectoERP/1.0" } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.length > 0) {
        document.getElementById("proy-edit-lat").value = parseFloat(data[0].lat).toFixed(6);
        document.getElementById("proy-edit-lon").value = parseFloat(data[0].lon).toFixed(6);
        if (typeof mostrarToast === "function") mostrarToast("Coordenadas encontradas: " + data[0].display_name, "success");
      } else {
        if (typeof mostrarToast === "function") mostrarToast("No encontrado. Usa Google Maps para copiar coordenadas.", "error");
      }
    })
    .catch(function () { if (typeof mostrarToast === "function") mostrarToast("Error al buscar coordenadas.", "error"); });
};
