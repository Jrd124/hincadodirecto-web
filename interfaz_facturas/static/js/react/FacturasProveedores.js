/* Facturas de Proveedores — React component */
(function () {
  "use strict";
  var React = window.React;
  if (!React) return;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;
  var useCallback = React.useCallback;
  var useRef = React.useRef;
  var h = React.createElement;

  // ── Helpers ────────────────────────────────────────────────────────────
  function fmtNum(val) {
    if (val == null || (typeof val === "string" && val.trim() === "")) return "\u2014";
    var s = String(val).trim().replace(/\s/g, "");
    var n;
    if (/,\d/.test(s)) {
      n = parseFloat(s.replace(/\./g, "").replace(",", "."));
    } else {
      n = parseFloat(s);
    }
    if (isNaN(n)) return s || "\u2014";
    var parts = n.toFixed(2).split(".");
    var entera = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return entera + "," + parts[1];
  }

  function parseNum(val) {
    if (val == null) return 0;
    var s = String(val).trim().replace(/\s/g, "");
    if (/,\d/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    return parseFloat(s) || 0;
  }

  var MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  // ── Sub-components ────────────────────────────────────────────────────

  function PillEstado(props) {
    var e = (props.estado || "").trim().toLowerCase() || "pendiente";
    var map = {
      pendiente: { bg: "#FEF3C7", color: "#92400E", label: "Pendiente" },
      pagada: { bg: "#DCFCE7", color: "#166534", label: "Pagada" },
      parcial: { bg: "#DBEAFE", color: "#1E40AF", label: "Parcial" },
    };
    var s = map[e] || map.pendiente;
    return h("span", {
      style: { padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 500, background: s.bg, color: s.color },
    }, s.label);
  }

  function FilaFactura(props) {
    var f = props.factura;
    var sel = props.seleccionada;
    var onToggle = props.onToggle;
    var onEditar = props.onEditar;
    var ruta = (f.ruta_destino || f.ruta_archivo || "").trim();

    return h("tr", { style: sel ? { background: "var(--color-bg-selected, #EFF6FF)" } : {} },
      h("td", { className: "col-check" },
        h("input", { type: "checkbox", checked: sel, onChange: function () { onToggle(f.id); } })
      ),
      h("td", { className: "col-fecha" }, (f.fecha_factura || "\u2014").substring(0, 10)),
      h("td", null, f.proveedor || "\u2014"),
      h("td", null, f.numero_factura || "\u2014"),
      h("td", { className: "numero" }, fmtNum(f.base_imponible)),
      h("td", { className: "numero" }, fmtNum(f.iva)),
      h("td", { className: "numero" }, fmtNum(f.retenciones_total)),
      h("td", { className: "numero", style: { fontWeight: 600 } }, fmtNum(f.total_a_pagar)),
      h("td", null, h(PillEstado, { estado: f.estado_pago })),
      h("td", { className: "col-acciones" },
        ruta ? h("a", {
          href: "/api/archivo?ruta=" + encodeURIComponent(ruta),
          target: "_blank",
          className: "btn-small",
          title: "Ver PDF",
        }, "Ver") : null,
        " ",
        h("button", {
          className: "btn-small",
          onClick: function (e) { e.stopPropagation(); onEditar(f); },
        }, "Editar")
      )
    );
  }

  // ── Main component ────────────────────────────────────────────────────

  function FacturasProveedores(props) {
    var stFacturas = useState([]);
    var facturas = stFacturas[0], setFacturas = stFacturas[1];
    var stLoading = useState(true);
    var loading = stLoading[0], setLoading = stLoading[1];
    var stEmpresa = useState(props.empresa || "hincado_directo");
    var empresa = stEmpresa[0], setEmpresa = stEmpresa[1];
    var stAnio = useState(String(new Date().getFullYear()));
    var anio = stAnio[0], setAnio = stAnio[1];
    var stMes = useState("");
    var mes = stMes[0], setMes = stMes[1];
    var stEstado = useState("");
    var estado = stEstado[0], setEstado = stEstado[1];
    var stBusqueda = useState("");
    var busqueda = stBusqueda[0], setBusqueda = stBusqueda[1];
    var stTarjetaFiltro = useState("");
    var tarjetaFiltro = stTarjetaFiltro[0], setTarjetaFiltro = stTarjetaFiltro[1];
    var stSel = useState({});
    var sel = stSel[0], setSel = stSel[1];
    var stSort = useState({ key: "fecha_factura", dir: "desc" });
    var sort = stSort[0], setSort = stSort[1];
    var stSelectAll = useState(false);
    var selectAll = stSelectAll[0], setSelectAll = stSelectAll[1];

    var cargar = useCallback(function () {
      setLoading(true);
      setSel({});
      setSelectAll(false);
      fetch("/api/facturas?empresa_id=" + encodeURIComponent(empresa) + "&_t=" + Date.now(), { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          setFacturas(d.facturas || []);
          setLoading(false);
        })
        .catch(function () { setLoading(false); });
    }, [empresa]);

    useEffect(function () { cargar(); }, [cargar]);

    // Expose refresh for vanilla modals
    useEffect(function () {
      window._reactRefreshFacturasProveedores = cargar;
      return function () { delete window._reactRefreshFacturasProveedores; };
    }, [cargar]);

    // Extract unique years
    var anios = useMemo(function () {
      var set = {};
      facturas.forEach(function (f) {
        var y = (f.fecha_factura || "").substring(0, 4);
        if (y && /^\d{4}$/.test(y)) set[y] = true;
      });
      return Object.keys(set).sort().reverse();
    }, [facturas]);

    // Extract unique tarjeta options
    var tarjetaOpciones = useMemo(function () {
      var map = {};
      facturas.forEach(function (f) {
        var persona = (f.tarjeta_persona || "").trim();
        var tid = f.tarjeta_id;
        if (persona) map[persona] = persona;
        else if (tid) map["t_" + tid] = "Tarjeta " + tid;
      });
      return Object.values(map).sort();
    }, [facturas]);

    // Filter + sort
    var filtradas = useMemo(function () {
      var q = busqueda.toLowerCase();
      var list = facturas.filter(function (f) {
        var fecha = (f.fecha_factura || "").toString();
        if (anio && !fecha.startsWith(anio)) return false;
        if (mes && fecha.length >= 7 && fecha.slice(5, 7) !== mes) return false;
        if (estado) {
          var ep = ((f.estado_pago || "").trim() || "pendiente").toLowerCase();
          if (ep !== estado) return false;
        }
        if (tarjetaFiltro) {
          var persona = (f.tarjeta_persona || "").trim();
          if (tarjetaFiltro === "__banco__") {
            if (persona || (f.tarjeta_id && String(f.tarjeta_id).trim() !== "0")) return false;
          } else if (persona !== tarjetaFiltro) return false;
        }
        if (q) {
          var prov = (f.proveedor || "").toLowerCase();
          var num = (f.numero_factura || "").toLowerCase();
          var conc = (f.resumen_concepto || "").toLowerCase();
          if (prov.indexOf(q) < 0 && num.indexOf(q) < 0 && conc.indexOf(q) < 0) return false;
        }
        return true;
      });
      var k = sort.key, dir = sort.dir === "asc" ? 1 : -1;
      list.sort(function (a, b) {
        var va = a[k], vb = b[k];
        if (va == null) va = "";
        if (vb == null) vb = "";
        var na = parseNum(va), nb = parseNum(vb);
        if (na || nb) return (na - nb) * dir;
        return String(va).localeCompare(String(vb), "es") * dir;
      });
      return list;
    }, [facturas, anio, mes, estado, tarjetaFiltro, busqueda, sort]);

    var totalFiltrado = useMemo(function () {
      var sum = 0;
      filtradas.forEach(function (f) { sum += parseNum(f.total_a_pagar); });
      return sum;
    }, [filtradas]);

    var toggleSel = useCallback(function (id) {
      setSel(function (prev) {
        var next = Object.assign({}, prev);
        if (next[id]) { delete next[id]; } else { next[id] = true; }
        return next;
      });
    }, []);

    var toggleAll = useCallback(function () {
      if (selectAll) {
        setSel({});
        setSelectAll(false);
      } else {
        var next = {};
        filtradas.forEach(function (f) { next[f.id] = true; });
        setSel(next);
        setSelectAll(true);
      }
    }, [selectAll, filtradas]);

    var eliminar = useCallback(function () {
      var ids = Object.keys(sel).filter(function (k) { return sel[k]; });
      if (!ids.length) return;
      if (!confirm("\u00bfEliminar " + ids.length + " factura(s)? Esta acci\u00f3n no se puede deshacer.")) return;
      var rutas = ids.map(function (id) {
        var f = facturas.find(function (x) { return String(x.id) === String(id); });
        return f ? (f.ruta_destino || f.ruta_archivo || "").trim() : "";
      }).filter(Boolean);
      fetch("/api/facturas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresa, rutas: rutas, ids: ids }),
      }).then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { if (typeof mostrarToast === "function") mostrarToast(d.error, "error"); return; }
          // Optimistic update
          setFacturas(function (prev) { return prev.filter(function (f) { return !sel[f.id]; }); });
          setSel({});
          setSelectAll(false);
          if (typeof mostrarToast === "function") mostrarToast(d.mensaje || "Eliminadas.", "success");
        });
    }, [sel, facturas, empresa]);

    var editarFactura = useCallback(function (f) {
      if (typeof window.abrirModalEdicion === "function") {
        window.abrirModalEdicion(f);
      }
    }, []);

    var procesarFacturas = useCallback(function () {
      var btn = document.getElementById("btn-abrir-modal-procesar-prov");
      if (btn) btn.click();
    }, []);

    var handleSort = useCallback(function (key) {
      setSort(function (prev) {
        if (prev.key === key) return { key: key, dir: prev.dir === "asc" ? "desc" : "asc" };
        return { key: key, dir: "asc" };
      });
    }, []);

    var nSel = Object.keys(sel).filter(function (k) { return sel[k]; }).length;

    // Columns definition
    var cols = [
      { key: "fecha_factura", label: "Fecha", num: false },
      { key: "proveedor", label: "Proveedor", num: false },
      { key: "numero_factura", label: "N\u00BA Factura", num: false },
      { key: "base_imponible", label: "Base", num: true },
      { key: "iva", label: "IVA", num: true },
      { key: "retenciones_total", label: "Ret.", num: true },
      { key: "total_a_pagar", label: "Total", num: true },
      { key: "estado_pago", label: "Estado", num: false },
    ];

    // Estado pill styles
    var pillEstados = [
      { value: "", label: "Todas", bg: "var(--color-text-primary)", color: "var(--color-background-primary)" },
      { value: "pendiente", label: "Pendiente", bg: "#FEF3C7", color: "#92400E" },
      { value: "pagada", label: "Pagada", bg: "#DCFCE7", color: "#166534" },
      { value: "parcial", label: "Parcial", bg: "#DBEAFE", color: "#1E40AF" },
    ];

    var svgLupa = h("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", style: { position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)", pointerEvents: "none" } },
      h("circle", { cx: 11, cy: 11, r: 8 }), h("line", { x1: 21, y1: 21, x2: 16.65, y2: 16.65 })
    );

    return h("div", { style: { padding: "0" } },
      // ── Fila 1: Título + contador + acciones ──
      h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" } },
        h("div", null,
          h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
            h("div", { style: { fontSize: "18px", fontWeight: 500 } }, "Facturas de proveedores"),
            h("select", { className: "form-select", style: { fontSize: "12px", padding: "3px 20px 3px 8px" }, value: empresa, onChange: function (e) { setEmpresa(e.target.value); } },
              h("option", { value: "hincado_directo" }, "Hincado Directo"),
              h("option", { value: "global_nutria" }, "Global Nutria")
            )
          ),
          h("div", { style: { fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" } },
            loading ? "Cargando\u2026"
              : filtradas.length + " factura" + (filtradas.length !== 1 ? "s" : "") + " \u00B7 " + fmtNum(totalFiltrado) + " \u20AC"
          )
        ),
        h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
          nSel > 0 ? h("button", { onClick: eliminar, style: { padding: "6px 14px", fontSize: "13px", border: "1px solid #DC2626", borderRadius: "8px", background: "#FEF2F2", color: "#991B1B", cursor: "pointer", fontWeight: 500 } }, "Eliminar (" + nSel + ")") : null,
          h("button", { onClick: cargar, title: "Recargar", style: { padding: "6px 10px", fontSize: "13px", border: "1px solid var(--color-border-tertiary, #E5E7EB)", borderRadius: "8px", background: "none", cursor: "pointer" } }, "\u21BB"),
          h("button", { onClick: procesarFacturas, style: { padding: "6px 14px", fontSize: "13px", border: "none", borderRadius: "8px", background: "var(--color-primary)", color: "white", cursor: "pointer", fontWeight: 500 } }, "+ Procesar factura")
        )
      ),
      // ── Fila 2: Búsqueda + pills de estado ──
      h("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px" } },
        h("div", { style: { position: "relative", flex: 1, minWidth: "200px" } },
          svgLupa,
          h("input", {
            type: "text", value: busqueda,
            placeholder: "Buscar por proveedor, n\u00BA factura, concepto\u2026",
            onChange: function (e) { setBusqueda(e.target.value); },
            style: { width: "100%", boxSizing: "border-box", padding: "7px 12px 7px 32px", fontSize: "13px", border: "0.5px solid var(--color-border-tertiary, #E5E7EB)", borderRadius: "8px", background: "var(--color-background-primary, white)" },
          })
        ),
        h("div", { style: { display: "flex", gap: "0", background: "var(--color-background-primary, white)", borderRadius: "8px", padding: "3px", border: "0.5px solid var(--color-border-tertiary, #E5E7EB)" } },
          pillEstados.map(function (p) {
            var activo = estado === p.value;
            var estilo = activo
              ? { padding: "4px 12px", fontSize: "12px", fontWeight: 500, border: "none", borderRadius: "6px", cursor: "pointer", background: p.bg, color: p.color, whiteSpace: "nowrap" }
              : { padding: "4px 12px", fontSize: "12px", fontWeight: 400, border: "none", borderRadius: "6px", cursor: "pointer", background: "transparent", color: "var(--color-text-secondary)", whiteSpace: "nowrap" };
            return h("button", { key: p.value, style: estilo, onClick: function () { setEstado(p.value); } }, p.label);
          })
        )
      ),
      // ── Fila 3: Selects compactos ──
      h("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" } },
        h("select", { className: "form-select", style: { fontSize: "12px", padding: "5px 24px 5px 8px" }, value: anio, onChange: function (e) { setAnio(e.target.value); } },
          h("option", { value: "" }, "Todos los a\u00f1os"),
          anios.map(function (y) { return h("option", { key: y, value: y }, y); })
        ),
        h("select", { className: "form-select", style: { fontSize: "12px", padding: "5px 24px 5px 8px" }, value: mes, onChange: function (e) { setMes(e.target.value); } },
          h("option", { value: "" }, "Todos los meses"),
          [1,2,3,4,5,6,7,8,9,10,11,12].map(function (m) { return h("option", { key: m, value: String(m).padStart(2, "0") }, MESES[m]); })
        ),
        h("select", { className: "form-select", style: { fontSize: "12px", padding: "5px 24px 5px 8px" }, value: tarjetaFiltro, onChange: function (e) { setTarjetaFiltro(e.target.value); } },
          h("option", { value: "" }, "Pagado v\u00eda"),
          h("option", { value: "__banco__" }, "Banco (sin tarjeta)"),
          tarjetaOpciones.map(function (t) { return h("option", { key: t, value: t }, t); })
        )
      ),
      // Table
      h("div", { className: "tabla-wrapper" },
        h("table", { className: "tabla-generica", style: { fontSize: "13px" } },
          h("thead", null,
            h("tr", null,
              h("th", { className: "col-check" },
                h("input", { type: "checkbox", checked: selectAll, onChange: toggleAll })
              ),
              cols.map(function (col) {
                var arrow = sort.key === col.key ? (sort.dir === "asc" ? " \u25B2" : " \u25BC") : "";
                return h("th", {
                  key: col.key,
                  className: col.num ? "numero" : "",
                  style: { cursor: "pointer", userSelect: "none" },
                  onClick: function () { handleSort(col.key); },
                }, col.label + arrow);
              }),
              h("th", { className: "col-acciones" }, "Acciones")
            )
          ),
          h("tbody", null,
            loading
              ? h("tr", null, h("td", { colSpan: cols.length + 2, className: "sin-datos" }, "Cargando\u2026"))
              : filtradas.length === 0
                ? h("tr", null, h("td", { colSpan: cols.length + 2, className: "sin-datos" }, facturas.length > 0 ? "No hay facturas que coincidan con los filtros." : "No hay facturas. Usa \u00ab+ Procesar\u00bb para subir."))
                : filtradas.slice(0, 500).map(function (f) {
                    return h(FilaFactura, {
                      key: f.id || f.ruta_destino,
                      factura: f,
                      seleccionada: !!sel[f.id],
                      onToggle: toggleSel,
                      onEditar: editarFactura,
                    });
                  })
          )
        )
      )
    );
  }

  // Register
  window._reactModules["FacturasProveedores"] = FacturasProveedores;
  console.log("[React] FacturasProveedores registrado.");
})();
