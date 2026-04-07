/* Dashboard Director — React component */
(function () {
  "use strict";
  var React = window.React;
  if (!React) return;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var h = React.createElement;

  // ── Helpers ────────────────────────────────────────────────────────────
  function fmtEur(v) {
    if (v == null || isNaN(v)) return "\u2014";
    return Number(v).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " \u20AC";
  }

  function fmtRelativa(fecha) {
    if (!fecha) return "";
    try {
      var d = new Date(fecha.replace(" ", "T"));
      var diff = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diff < 60) return "hace unos segundos";
      if (diff < 3600) return "hace " + Math.floor(diff / 60) + " min";
      if (diff < 86400) return "hace " + Math.floor(diff / 3600) + " h";
      var dias = Math.floor(diff / 86400);
      if (dias === 1) return "ayer";
      if (dias < 7) return "hace " + dias + " d\u00edas";
      return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    } catch (e) { return fecha; }
  }

  function saludo() {
    var hora = new Date().getHours();
    return hora < 14 ? "Buenos d\u00edas" : hora < 20 ? "Buenas tardes" : "Buenas noches";
  }

  function fechaHoy() {
    var opciones = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    var s = new Date().toLocaleDateString("es-ES", opciones);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ── Sub-components ────────────────────────────────────────────────────

  function KpiCard(props) {
    return h("div", { className: "dir-kpi dir-kpi--" + props.color },
      h("span", { className: "dir-kpi__label" }, props.label),
      h("span", { className: "dir-kpi__value" }, props.value != null ? props.value : "\u2014"),
      h("span", { className: "dir-kpi__sub" }, props.sub || "\u2014")
    );
  }

  function ObrasActivas(props) {
    var lista = props.lista || [];
    if (!lista.length) {
      return h("tr", null, h("td", { colSpan: 4, className: "sin-datos" }, "Sin obras activas"));
    }
    return lista.map(function (ob) {
      var pct = ob.hincas_estimadas > 0 ? Math.round((ob.hincas_acumuladas / ob.hincas_estimadas) * 100) : 0;
      return h("tr", {
        key: ob.id,
        style: { cursor: "pointer" },
        onClick: function () { location.hash = "proyectos/dashboard/" + ob.id; },
      },
        h("td", null,
          h("strong", null, ob.codigo || ob.nombre),
          h("br"),
          h("span", { className: "dir-obra-sub" }, ob.provincia)
        ),
        h("td", null, ob.cliente),
        h("td", null,
          h("div", { className: "dir-progress-wrap" },
            h("div", { className: "dir-progress-bar" },
              h("div", { className: "dir-progress-fill", style: { width: pct + "%" } })
            ),
            h("span", { className: "dir-progress-text" },
              ob.hincas_acumuladas + " / " + (ob.hincas_estimadas || "\u2014") + " (" + pct + "%)"
            )
          )
        ),
        h("td", { className: "numero" }, ob.hincas_hoy || 0)
      );
    });
  }

  function PanelAlertas(props) {
    var alertas = props.alertas || [];
    var total = props.total || 0;
    if (!alertas.length) {
      return h("div", null,
        h("p", { className: "sin-datos", style: { padding: "16px", textAlign: "center" } }, "Sin alertas")
      );
    }
    var iconMap = { alta: "\uD83D\uDD34", media: "\uD83D\uDFE1", info: "\uD83D\uDD35" };
    return h("div", null,
      alertas.map(function (a, i) {
        return h("div", {
          key: i,
          className: "dir-alerta dir-alerta--" + a.severidad,
          style: a.link ? { cursor: "pointer" } : {},
          onClick: a.link ? function () { location.hash = a.link.replace(/^#/, ""); } : undefined,
        },
          h("span", { className: "dir-alerta__icon" }, iconMap[a.severidad] || ""),
          h("span", { className: "dir-alerta__msg" }, a.mensaje)
        );
      }),
      total > 10 ? h("button", { className: "btn-small dir-alertas-ver-todas" }, "Ver todas") : null
    );
  }

  function ActividadReciente(props) {
    var acts = props.actividad || [];
    var filtro = props.filtro;
    var onFiltro = props.onFiltro;
    var filtros = ["todos", "proyectos", "finanzas", "crm", "maquinaria"];
    var iconMap = { parte: "\uD83D\uDCCB", factura: "\uD83D\uDCE4", factura_prov: "\uD83D\uDCE5", certificacion: "\uD83D\uDCC4", proyecto: "\uD83D\uDCC1", crm: "\uD83E\uDD1D", maquinaria_check: "\uD83D\uDD27" };

    return h("div", null,
      h("div", { className: "dir-filtro-pills" },
        filtros.map(function (f) {
          return h("button", {
            key: f,
            className: "dir-filtro-pill" + (filtro === f ? " active" : ""),
            onClick: function () { onFiltro(f); },
          }, f.charAt(0).toUpperCase() + f.slice(1));
        })
      ),
      h("div", { className: "dir-timeline" },
        acts.length === 0
          ? h("p", { className: "sin-datos", style: { padding: "16px", textAlign: "center" } }, "Sin actividad reciente")
          : acts.filter(function (a) {
              return filtro === "todos" || a.categoria === filtro;
            }).map(function (a, i) {
              return h("div", { key: i, className: "dir-timeline-item" },
                h("span", { className: "dir-timeline-icon" }, iconMap[a.tipo] || "\u2022"),
                h("div", { className: "dir-timeline-body" },
                  h("span", { className: "dir-timeline-texto" }, a.texto),
                  h("span", { className: "dir-timeline-fecha" }, fmtRelativa(a.fecha))
                )
              );
            })
      )
    );
  }

  // ── Main component ────────────────────────────────────────────────────

  function DashboardDirector() {
    var stateData = useState(null);
    var data = stateData[0], setData = stateData[1];
    var stateLoading = useState(true);
    var loading = stateLoading[0], setLoading = stateLoading[1];
    var stateError = useState(null);
    var error = stateError[0], setError = stateError[1];
    var stateFiltro = useState("todos");
    var filtroAct = stateFiltro[0], setFiltroAct = stateFiltro[1];

    useEffect(function () {
      fetch("/api/dashboard/director?t=" + Date.now())
        .then(function (r) { return r.json(); })
        .then(function (d) { setData(d); setLoading(false); })
        .catch(function (e) { setError(e.message); setLoading(false); });
    }, []);

    if (loading) {
      return h("div", { className: "react-dashboard-director", style: { padding: "40px", textAlign: "center", color: "var(--color-text-secondary)" } },
        "Cargando dashboard..."
      );
    }
    if (error) {
      return h("div", { className: "react-dashboard-director", style: { padding: "40px", textAlign: "center", color: "#DC2626" } },
        "\u274C Error: " + error
      );
    }
    if (!data) return null;

    var p = data.proyectos || {};
    var f = data.finanzas || {};
    var m = data.maquinaria || {};
    var nombre = (data.usuario || "").charAt(0).toUpperCase() + (data.usuario || "").slice(1);

    return h("div", { className: "react-dashboard-director", style: { paddingTop: "32px" } },
      // Header
      h("div", { className: "dashboard-header" },
        h("h1", { id: "dashboard-saludo" }, saludo() + ", " + nombre),
        h("p", { className: "dashboard-fecha", id: "dashboard-fecha" }, fechaHoy())
      ),

      // KPIs
      h("div", { className: "dir-kpis" },
        h(KpiCard, { color: "teal", label: "Proyectos vivos", value: p.vivos, sub: (p.cotizados || 0) + " cotizados en pipeline" }),
        h(KpiCard, { color: "blue", label: "Hincas hoy", value: p.hincas_hoy, sub: (p.hincas_semana || 0) + " esta semana" }),
        h(KpiCard, { color: "green", label: "Facturado mes", value: fmtEur(f.facturado_mes), sub: fmtEur(f["facturado_a\u00f1o"]) + " en el a\u00f1o" }),
        h(KpiCard, { color: "amber", label: "Pendiente cobro", value: fmtEur(f.pendiente_cobro), sub: f.pendiente_cobro_texto || (f.pendiente_cobro_count + " facturas") }),
        h(KpiCard, { color: "coral", label: "Pendiente pago", value: fmtEur(f.pendiente_pago), sub: f.pendiente_pago_texto || (f.pendiente_pago_count + " facturas") }),
        h(KpiCard, { color: "gray", label: "M\u00e1quinas", value: (m.asignadas || 0) + " / " + (m.total || 0) + " asignadas", sub: (m.revisiones_pendientes || 0) + " revisiones pendientes" })
      ),

      // Obras + Alertas
      h("div", { className: "dir-grid-main" },
        h("div", { className: "card dir-panel dir-panel--obras" },
          h("h2", { className: "dir-panel__title" }, "Obras activas"),
          h("div", { className: "tabla-wrapper" },
            h("table", { className: "tabla-generica dir-tabla-obras" },
              h("thead", null,
                h("tr", null,
                  h("th", null, "Proyecto"),
                  h("th", null, "Cliente"),
                  h("th", null, "Progreso"),
                  h("th", { className: "numero" }, "Hincas hoy")
                )
              ),
              h("tbody", null, h(ObrasActivas, { lista: p.lista_vivos }))
            )
          )
        ),
        h("div", { className: "card dir-panel dir-panel--alertas" },
          h("h2", { className: "dir-panel__title" }, "Alertas"),
          h(PanelAlertas, { alertas: data.alertas, total: data.alertas_total })
        )
      ),

      // Actividad reciente
      h("div", { className: "card dir-panel dir-panel--actividad" },
        h("h2", { className: "dir-panel__title" }, "Actividad reciente"),
        h(ActividadReciente, { actividad: data.actividad_reciente, filtro: filtroAct, onFiltro: setFiltroAct })
      )
    );
  }

  // Register
  window._reactModules["DashboardDirector"] = DashboardDirector;
  console.log("[React] DashboardDirector registrado.");
  // NOTE: no auto-mount on first load — let vanilla render first.
  // React will take over on subsequent navigations to "Inicio" via app.js.
})();
