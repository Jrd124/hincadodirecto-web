/**
 * Fase 2B — UI: Repuestos, Consumos, Proveedores/Talleres y Análisis.
 *
 * Archivo independiente de maquinaria.js (Fase 1B).
 * Depende de helpers.js (_esc, mostrarToast, formatearNumeroES).
 */
(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════════════════
  // ██  ESTADO INTERNO                                                  ██
  // ═══════════════════════════════════════════════════════════════════════
  var _tabActiva = "catalogo"; // catalogo | consumos | proveedores | analisis

  // ═══════════════════════════════════════════════════════════════════════
  // ██  ENTRY POINT                                                     ██
  // ═══════════════════════════════════════════════════════════════════════

  function cargarMaquinariaFase2b() {
    var container = document.getElementById("maquinaria-fase2b-content");
    if (!container) return;
    container.innerHTML = _renderShell();
    _switchTab(_tabActiva);
  }

  window.cargarMaquinariaFase2b = cargarMaquinariaFase2b;

  // ═══════════════════════════════════════════════════════════════════════
  // ██  SHELL — pestañas                                                ██
  // ═══════════════════════════════════════════════════════════════════════

  function _renderShell() {
    return (
      '<div>' +
        '<h1 style="margin:0 0 16px;font-size:1.35rem;font-weight:600;">Repuestos, Proveedores y Análisis</h1>' +
        '<div id="f2b-tabs" style="display:flex;gap:4px;border-bottom:2px solid var(--color-border,#E2E8F0);margin-bottom:16px;">' +
          _tabBtn("catalogo", "Catálogo Repuestos") +
          _tabBtn("consumos", "Consumos") +
          _tabBtn("proveedores", "Proveedores / Talleres") +
          _tabBtn("analisis", "Análisis") +
        '</div>' +
        '<div id="f2b-body"></div>' +
      '</div>'
    );
  }

  function _tabBtn(id, label) {
    return (
      '<button id="f2b-tab-' + id + '" onclick="window._f2bSwitch(\'' + id + '\')" ' +
      'style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:.9rem;' +
      'border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--color-text-secondary,#64748B);">' +
      label + '</button>'
    );
  }

  function _switchTab(tab) {
    _tabActiva = tab;
    // Highlight activa
    ["catalogo", "consumos", "proveedores", "analisis"].forEach(function (t) {
      var btn = document.getElementById("f2b-tab-" + t);
      if (!btn) return;
      if (t === tab) {
        btn.style.borderBottomColor = "var(--color-primary,#2563EB)";
        btn.style.color = "var(--color-primary,#2563EB)";
        btn.style.fontWeight = "600";
      } else {
        btn.style.borderBottomColor = "transparent";
        btn.style.color = "var(--color-text-secondary,#64748B)";
        btn.style.fontWeight = "400";
      }
    });
    var body = document.getElementById("f2b-body");
    if (!body) return;
    body.innerHTML = '<p style="color:#94A3B8;">Cargando...</p>';
    if (tab === "catalogo") _loadCatalogo();
    else if (tab === "consumos") _loadConsumos();
    else if (tab === "proveedores") _loadProveedores();
    else if (tab === "analisis") _loadAnalisis();
  }
  window._f2bSwitch = _switchTab;

  // ═══════════════════════════════════════════════════════════════════════
  // ██  HELPERS COMPARTIDOS                                             ██
  // ═══════════════════════════════════════════════════════════════════════

  function _fmt(v) {
    if (v == null) return "—";
    if (typeof formatearNumeroES === "function") return formatearNumeroES(v);
    return String(v);
  }

  function _fmtEur(v) {
    if (v == null) return "—";
    return _fmt(v) + " €";
  }

  function _badge(text, color) {
    return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:600;' +
      'background:' + (color || '#E2E8F0') + ';color:#fff;">' + _esc(text) + '</span>';
  }

  function _critColor(c) {
    if (c === "A") return "#DC2626";
    if (c === "B") return "#F59E0B";
    return "#6B7280";
  }

  function _apiJson(url, opts) {
    return fetch(url, opts).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { return Promise.reject(d); });
      return r.json();
    });
  }

  function _postJson(url, data) {
    return _apiJson(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  }

  function _putJson(url, data) {
    return _apiJson(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  }

  function _deleteJson(url) {
    return _apiJson(url, { method: "DELETE" });
  }

  function _val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
  function _valNum(id) { var v = _val(id); return v === "" ? null : Number(v); }

  // ═══════════════════════════════════════════════════════════════════════
  // ██  1. CATÁLOGO DE REPUESTOS                                        ██
  // ═══════════════════════════════════════════════════════════════════════

  function _loadCatalogo() {
    var qs = "";
    var fc = document.getElementById("f2b-cat-filtro-crit");
    var fq = document.getElementById("f2b-cat-filtro-q");
    if (fc && fc.value) qs += "&criticidad=" + fc.value;
    if (fq && fq.value) qs += "&q=" + encodeURIComponent(fq.value);
    _apiJson("/api/maquinaria/repuestos?activo=1" + qs)
      .then(function (data) {
        var reps = data.repuestos || [];
        var body = document.getElementById("f2b-body");
        if (!body) return;
        body.innerHTML = _renderCatalogoToolbar() + _renderCatalogoTabla(reps);
      })
      .catch(function () { mostrarToast("Error cargando repuestos", "error"); });
  }

  function _renderCatalogoToolbar() {
    return (
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">' +
        '<input id="f2b-cat-filtro-q" class="form-input" placeholder="Buscar código o descripción..." ' +
          'style="max-width:260px;" onkeyup="if(event.key===\'Enter\')window._f2bCatBuscar()">' +
        '<select id="f2b-cat-filtro-crit" class="form-input" style="max-width:130px;" onchange="window._f2bCatBuscar()">' +
          '<option value="">Criticidad</option>' +
          '<option value="A">A — Crítico</option>' +
          '<option value="B">B — Medio</option>' +
          '<option value="C">C — Bajo</option>' +
        '</select>' +
        '<button class="btn-outline" onclick="window._f2bCatBuscar()">Filtrar</button>' +
        '<div style="flex:1;"></div>' +
        '<button class="btn-primary" onclick="window._f2bCatNuevo()">+ Nuevo repuesto</button>' +
      '</div>'
    );
  }

  function _renderCatalogoTabla(reps) {
    if (!reps.length) return '<p style="color:#94A3B8;margin-top:16px;">Sin repuestos.</p>';
    var h = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.85rem;">' +
      '<thead><tr style="background:#F8FAFC;border-bottom:2px solid #E2E8F0;text-align:left;">' +
        '<th style="padding:8px;">Código</th>' +
        '<th style="padding:8px;">Descripción</th>' +
        '<th style="padding:8px;text-align:center;">Crit.</th>' +
        '<th style="padding:8px;text-align:right;">Stock</th>' +
        '<th style="padding:8px;text-align:right;">Mín.</th>' +
        '<th style="padding:8px;">Unidad</th>' +
        '<th style="padding:8px;text-align:right;">Precio ud.</th>' +
        '<th style="padding:8px;">Proveedor hab.</th>' +
        '<th style="padding:8px;text-align:center;">Acciones</th>' +
      '</tr></thead><tbody>';
    reps.forEach(function (r) {
      var stockAlert = "";
      if (r.stock_actual < 0) stockAlert = ' style="color:#DC2626;font-weight:700;"';
      else if (r.stock_actual < r.stock_minimo) stockAlert = ' style="color:#F59E0B;font-weight:600;"';
      h += '<tr style="border-bottom:1px solid #F1F5F9;">' +
        '<td style="padding:8px;font-family:monospace;">' + _esc(r.codigo) + '</td>' +
        '<td style="padding:8px;">' + _esc(r.descripcion) + '</td>' +
        '<td style="padding:8px;text-align:center;">' + _badge(r.criticidad, _critColor(r.criticidad)) + '</td>' +
        '<td style="padding:8px;text-align:right;"' + stockAlert + '>' + _fmt(r.stock_actual) + '</td>' +
        '<td style="padding:8px;text-align:right;">' + _fmt(r.stock_minimo) + '</td>' +
        '<td style="padding:8px;">' + _esc(r.unidad || "ud") + '</td>' +
        '<td style="padding:8px;text-align:right;">' + _fmtEur(r.precio_unitario) + '</td>' +
        '<td style="padding:8px;">' + _esc(r.proveedor_habitual_nombre || "") + '</td>' +
        '<td style="padding:8px;text-align:center;">' +
          '<button class="btn-outline" style="padding:2px 8px;font-size:.78rem;" ' +
            'onclick="window._f2bCatEditar(' + r.id + ')">Editar</button> ' +
          '<button class="btn-outline" style="padding:2px 8px;font-size:.78rem;" ' +
            'onclick="window._f2bCatVinculos(' + r.id + ',\'' + _esc(r.codigo) + '\')">Vincular</button>' +
        '</td>' +
      '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  window._f2bCatBuscar = _loadCatalogo;

  // — Modal: Nuevo repuesto —
  window._f2bCatNuevo = function () {
    _modalRepuesto(null);
  };

  window._f2bCatEditar = function (id) {
    _apiJson("/api/maquinaria/repuestos/" + id)
      .then(function (rep) { _modalRepuesto(rep); })
      .catch(function () { mostrarToast("Error cargando repuesto", "error"); });
  };

  function _modalRepuesto(rep) {
    var isEdit = !!rep;
    var m = document.createElement("div");
    m.className = "modal-overlay visible";
    m.id = "modal-f2b-rep";
    m.onclick = function (e) { if (e.target === m) m.remove(); };
    m.innerHTML =
      '<div class="modal-content" style="max-width:560px;">' +
        '<h2 style="margin:0 0 16px;">' + (isEdit ? "Editar repuesto" : "Nuevo repuesto") + '</h2>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label class="form-label">Código *</label>' +
            '<input type="text" id="f2b-rep-codigo" class="form-input" value="' + _esc((rep && rep.codigo) || "") + '"></div>' +
          '<div><label class="form-label">Descripción *</label>' +
            '<input type="text" id="f2b-rep-desc" class="form-input" value="' + _esc((rep && rep.descripcion) || "") + '"></div>' +
          '<div><label class="form-label">Criticidad</label>' +
            '<select id="f2b-rep-crit" class="form-input">' +
              '<option value="C"' + (rep && rep.criticidad === "C" ? " selected" : "") + '>C — Bajo</option>' +
              '<option value="B"' + (rep && rep.criticidad === "B" ? " selected" : "") + '>B — Medio</option>' +
              '<option value="A"' + (rep && rep.criticidad === "A" ? " selected" : "") + '>A — Crítico</option>' +
            '</select></div>' +
          '<div><label class="form-label">Unidad</label>' +
            '<input type="text" id="f2b-rep-unidad" class="form-input" value="' + _esc((rep && rep.unidad) || "ud") + '"></div>' +
          '<div><label class="form-label">Stock actual</label>' +
            '<input type="number" step="any" id="f2b-rep-stock" class="form-input" value="' + ((rep && rep.stock_actual != null) ? rep.stock_actual : 0) + '"></div>' +
          '<div><label class="form-label">Stock mínimo</label>' +
            '<input type="number" step="any" id="f2b-rep-stockmin" class="form-input" value="' + ((rep && rep.stock_minimo != null) ? rep.stock_minimo : 0) + '"></div>' +
          '<div><label class="form-label">Precio unitario (€)</label>' +
            '<input type="number" step="0.01" id="f2b-rep-precio" class="form-input" value="' + ((rep && rep.precio_unitario != null) ? rep.precio_unitario : "") + '"></div>' +
          '<div><label class="form-label">Ubicación física</label>' +
            '<input type="text" id="f2b-rep-ubicacion" class="form-input" value="' + _esc((rep && rep.ubicacion_fisica) || "") + '"></div>' +
          '<div><label class="form-label">Lead time (días)</label>' +
            '<input type="number" id="f2b-rep-lead" class="form-input" value="' + ((rep && rep.lead_time_dias != null) ? rep.lead_time_dias : "") + '"></div>' +
          '<div><label class="form-label">Equivalente (código)</label>' +
            '<input type="text" id="f2b-rep-equiv" class="form-input" placeholder="Código repuesto equiv." value="' + _esc((rep && rep.equivalente_codigo) || "") + '"></div>' +
        '</div>' +
        (isEdit ?
          '<div style="margin-top:12px;"><label class="form-label">Activo</label>' +
            '<select id="f2b-rep-activo" class="form-input" style="max-width:120px;">' +
              '<option value="1"' + (rep.activo ? " selected" : "") + '>Sí</option>' +
              '<option value="0"' + (!rep.activo ? " selected" : "") + '>No</option>' +
            '</select></div>' : "") +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
          '<button class="btn-outline" onclick="document.getElementById(\'modal-f2b-rep\').remove()">Cancelar</button>' +
          '<button class="btn-primary" onclick="window._f2bRepGuardar(' + (isEdit ? rep.id : "null") + ')">' + (isEdit ? "Guardar" : "Crear") + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
  }

  window._f2bRepGuardar = function (id) {
    var payload = {
      codigo: _val("f2b-rep-codigo"),
      descripcion: _val("f2b-rep-desc"),
      criticidad: _val("f2b-rep-crit"),
      unidad: _val("f2b-rep-unidad") || "ud",
      stock_actual: _valNum("f2b-rep-stock"),
      stock_minimo: _valNum("f2b-rep-stockmin"),
      precio_unitario: _valNum("f2b-rep-precio"),
      ubicacion_fisica: _val("f2b-rep-ubicacion") || null,
      lead_time_dias: _valNum("f2b-rep-lead"),
    };
    if (!payload.codigo || !payload.descripcion) {
      mostrarToast("Código y descripción son obligatorios", "error");
      return;
    }
    // Activo solo en edición
    var actEl = document.getElementById("f2b-rep-activo");
    if (actEl) payload.activo = Number(actEl.value);

    var promise = id
      ? _putJson("/api/maquinaria/repuestos/" + id, payload)
      : _postJson("/api/maquinaria/repuestos", payload);

    promise
      .then(function () {
        document.getElementById("modal-f2b-rep").remove();
        mostrarToast(id ? "Repuesto actualizado" : "Repuesto creado", "success");
        _loadCatalogo();
      })
      .catch(function (err) {
        mostrarToast(err.error || "Error guardando repuesto", "error");
      });
  };

  // — Modal: Vínculos repuesto ↔ máquina —
  window._f2bCatVinculos = function (repId, codigo) {
    _apiJson("/api/maquinaria/repuestos?limit=1&q=" + encodeURIComponent(codigo))
      .then(function () {
        // Obtener máquinas para el selector
        return _apiJson("/api/maquinaria/maquinas");
      })
      .then(function (maqData) {
        var maquinas = maqData.maquinas || [];
        _modalVinculos(repId, codigo, maquinas);
      })
      .catch(function () { mostrarToast("Error cargando datos", "error"); });
  };

  function _modalVinculos(repId, codigo, maquinas) {
    var m = document.createElement("div");
    m.className = "modal-overlay visible";
    m.id = "modal-f2b-vinc";
    m.onclick = function (e) { if (e.target === m) m.remove(); };

    var optsMaq = '<option value="">— Seleccionar máquina —</option>';
    maquinas.forEach(function (mq) {
      optsMaq += '<option value="' + mq.id + '">' + _esc(mq.nombre || mq.identificador_interno) + '</option>';
    });

    m.innerHTML =
      '<div class="modal-content" style="max-width:600px;">' +
        '<h2 style="margin:0 0 16px;">Vínculos de ' + _esc(codigo) + '</h2>' +
        '<div id="f2b-vinc-lista" style="margin-bottom:16px;"><p style="color:#94A3B8;">Cargando...</p></div>' +
        '<h3 style="font-size:.95rem;margin:0 0 8px;">Nuevo vínculo</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div><label class="form-label">Modo</label>' +
            '<select id="f2b-vinc-modo" class="form-input" onchange="window._f2bVincModo()">' +
              '<option value="maquina">Máquina concreta</option>' +
              '<option value="modelo">Marca / Modelo</option>' +
            '</select></div>' +
          '<div id="f2b-vinc-maq-wrap"><label class="form-label">Máquina</label>' +
            '<select id="f2b-vinc-maqid" class="form-input">' + optsMaq + '</select></div>' +
          '<div id="f2b-vinc-marca-wrap" style="display:none;"><label class="form-label">Marca</label>' +
            '<input type="text" id="f2b-vinc-marca" class="form-input"></div>' +
          '<div id="f2b-vinc-modelo-wrap" style="display:none;"><label class="form-label">Modelo</label>' +
            '<input type="text" id="f2b-vinc-modelo" class="form-input"></div>' +
          '<div><label class="form-label">Subsistema</label>' +
            '<input type="text" id="f2b-vinc-sub" class="form-input" placeholder="ej: hidráulico"></div>' +
          '<div><label class="form-label">Cantidad recomendada</label>' +
            '<input type="number" step="any" id="f2b-vinc-cant" class="form-input" value="1"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
          '<button class="btn-outline" onclick="document.getElementById(\'modal-f2b-vinc\').remove()">Cerrar</button>' +
          '<button class="btn-primary" onclick="window._f2bVincCrear(' + repId + ')">Vincular</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    _loadVinculosLista(repId);
  }

  window._f2bVincModo = function () {
    var modo = _val("f2b-vinc-modo");
    var maqW = document.getElementById("f2b-vinc-maq-wrap");
    var marcaW = document.getElementById("f2b-vinc-marca-wrap");
    var modeloW = document.getElementById("f2b-vinc-modelo-wrap");
    if (modo === "maquina") {
      if (maqW) maqW.style.display = "";
      if (marcaW) marcaW.style.display = "none";
      if (modeloW) modeloW.style.display = "none";
    } else {
      if (maqW) maqW.style.display = "none";
      if (marcaW) marcaW.style.display = "";
      if (modeloW) modeloW.style.display = "";
    }
  };

  function _loadVinculosLista(repId) {
    // There's no direct "list vinculos by repuesto" endpoint, so we fetch all machines and check
    // Actually, we can search by iterating. For now, show a note.
    // The API has GET /api/maquinaria/maquinas/<mid>/repuestos but not the reverse.
    // We'll list from the repuesto_maquina table via consumos or a workaround.
    var div = document.getElementById("f2b-vinc-lista");
    if (div) div.innerHTML = '<p style="color:#94A3B8;font-size:.85rem;">Los vínculos actuales se reflejan en la pestaña de cada máquina (Fase 1B → Detalle máquina).</p>';
  }

  window._f2bVincCrear = function (repId) {
    var modo = _val("f2b-vinc-modo");
    var payload = { repuesto_id: repId, subsistema: _val("f2b-vinc-sub") || null, cantidad_recomendada: _valNum("f2b-vinc-cant") || 1 };
    if (modo === "maquina") {
      payload.maquina_id = _valNum("f2b-vinc-maqid");
      if (!payload.maquina_id) { mostrarToast("Selecciona una máquina", "error"); return; }
    } else {
      payload.marca = _val("f2b-vinc-marca") || null;
      payload.modelo = _val("f2b-vinc-modelo") || null;
      if (!payload.marca && !payload.modelo) { mostrarToast("Indica al menos marca o modelo", "error"); return; }
    }
    _postJson("/api/maquinaria/repuestos/vincular", payload)
      .then(function () {
        mostrarToast("Vínculo creado", "success");
        _loadVinculosLista(repId);
      })
      .catch(function (err) { mostrarToast(err.error || "Error vinculando", "error"); });
  };

  // ═══════════════════════════════════════════════════════════════════════
  // ██  2. CONSUMOS                                                     ██
  // ═══════════════════════════════════════════════════════════════════════

  function _loadConsumos() {
    var qs = "";
    var fm = document.getElementById("f2b-con-filtro-maq");
    var fi = document.getElementById("f2b-con-filtro-inc");
    var fd = document.getElementById("f2b-con-filtro-desde");
    if (fm && fm.value) qs += "&maquina_id=" + fm.value;
    if (fi && fi.value) qs += "&incidencia_id=" + fi.value;
    if (fd && fd.value) qs += "&desde=" + fd.value;

    Promise.all([
      _apiJson("/api/maquinaria/consumos?limit=200" + qs),
      _apiJson("/api/maquinaria/alertas-stock"),
      _apiJson("/api/maquinaria/maquinas"),
    ]).then(function (results) {
      var consumos = results[0].consumos || [];
      var alertas = results[1].alertas || [];
      var maquinas = results[2].maquinas || [];
      var body = document.getElementById("f2b-body");
      if (!body) return;
      body.innerHTML = _renderAlertasBanner(alertas) + _renderConsumosToolbar(maquinas) + _renderConsumosTabla(consumos);
    }).catch(function () { mostrarToast("Error cargando consumos", "error"); });
  }

  function _renderAlertasBanner(alertas) {
    if (!alertas.length) return "";
    var h = '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;margin-bottom:12px;">' +
      '<strong style="color:#DC2626;">Alertas de stock (' + alertas.length + ')</strong>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">';
    alertas.forEach(function (a) {
      var col = a.alerta && a.alerta.tipo === "stock_negativo" ? "#DC2626" : "#F59E0B";
      h += '<span style="background:' + col + '22;color:' + col + ';padding:3px 10px;border-radius:4px;font-size:.8rem;">' +
        _esc(a.codigo) + ': ' + _fmt(a.stock_actual) + '/' + _fmt(a.stock_minimo) +
        (a.alerta && a.alerta.urgente ? ' ⚠' : '') + '</span>';
    });
    h += '</div></div>';
    return h;
  }

  function _renderConsumosToolbar(maquinas) {
    var optsMaq = '<option value="">Todas las máquinas</option>';
    maquinas.forEach(function (mq) {
      optsMaq += '<option value="' + mq.id + '">' + _esc(mq.nombre || mq.identificador_interno) + '</option>';
    });
    return (
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">' +
        '<select id="f2b-con-filtro-maq" class="form-input" style="max-width:200px;" onchange="window._f2bConBuscar()">' + optsMaq + '</select>' +
        '<input id="f2b-con-filtro-inc" class="form-input" placeholder="ID incidencia" style="max-width:120px;" ' +
          'onkeyup="if(event.key===\'Enter\')window._f2bConBuscar()">' +
        '<input type="date" id="f2b-con-filtro-desde" class="form-input" style="max-width:160px;" onchange="window._f2bConBuscar()">' +
        '<button class="btn-outline" onclick="window._f2bConBuscar()">Filtrar</button>' +
        '<div style="flex:1;"></div>' +
        '<button class="btn-primary" onclick="window._f2bConNuevo()">+ Registrar consumo</button>' +
      '</div>'
    );
  }

  function _renderConsumosTabla(consumos) {
    if (!consumos.length) return '<p style="color:#94A3B8;margin-top:16px;">Sin consumos registrados.</p>';
    var h = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.85rem;">' +
      '<thead><tr style="background:#F8FAFC;border-bottom:2px solid #E2E8F0;text-align:left;">' +
        '<th style="padding:8px;">Fecha</th>' +
        '<th style="padding:8px;">Repuesto</th>' +
        '<th style="padding:8px;">Máquina</th>' +
        '<th style="padding:8px;text-align:center;">Incid.</th>' +
        '<th style="padding:8px;text-align:right;">Cant.</th>' +
        '<th style="padding:8px;text-align:right;">Precio ud.</th>' +
        '<th style="padding:8px;text-align:right;">Coste total</th>' +
        '<th style="padding:8px;">Notas</th>' +
        '<th style="padding:8px;text-align:center;">Acc.</th>' +
      '</tr></thead><tbody>';
    consumos.forEach(function (c) {
      h += '<tr style="border-bottom:1px solid #F1F5F9;">' +
        '<td style="padding:8px;">' + _esc(c.fecha || "") + '</td>' +
        '<td style="padding:8px;font-family:monospace;">' + _esc(c.repuesto_codigo || "") + ' <span style="color:#94A3B8;">' + _esc(c.repuesto_descripcion || "") + '</span></td>' +
        '<td style="padding:8px;">' + _esc(c.maquina_nombre || "") + '</td>' +
        '<td style="padding:8px;text-align:center;">' + (c.incidencia_id || "—") + '</td>' +
        '<td style="padding:8px;text-align:right;">' + _fmt(c.cantidad) + ' ' + _esc(c.unidad || "") + '</td>' +
        '<td style="padding:8px;text-align:right;">' + _fmtEur(c.precio_unitario) + '</td>' +
        '<td style="padding:8px;text-align:right;font-weight:600;">' + _fmtEur(c.coste_total) + '</td>' +
        '<td style="padding:8px;font-size:.8rem;color:#64748B;">' + _esc(c.notas || "") + '</td>' +
        '<td style="padding:8px;text-align:center;">' +
          '<button class="btn-outline" style="padding:2px 8px;font-size:.78rem;color:#DC2626;" ' +
            'onclick="window._f2bConEliminar(' + c.id + ')">Eliminar</button>' +
        '</td>' +
      '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  window._f2bConBuscar = _loadConsumos;

  // — Modal: Registrar consumo —
  window._f2bConNuevo = function () {
    Promise.all([
      _apiJson("/api/maquinaria/repuestos?activo=1&limit=500"),
      _apiJson("/api/maquinaria/maquinas"),
    ]).then(function (results) {
      var reps = results[0].repuestos || [];
      var maqs = results[1].maquinas || [];
      _modalConsumo(reps, maqs);
    }).catch(function () { mostrarToast("Error cargando datos", "error"); });
  };

  function _modalConsumo(reps, maqs) {
    var optsR = '<option value="">— Seleccionar repuesto —</option>';
    reps.forEach(function (r) {
      optsR += '<option value="' + r.id + '" data-precio="' + (r.precio_unitario || "") + '">' +
        _esc(r.codigo) + ' — ' + _esc(r.descripcion) + ' (stock: ' + _fmt(r.stock_actual) + ')</option>';
    });
    var optsM = '<option value="">— Seleccionar máquina —</option>';
    maqs.forEach(function (mq) {
      optsM += '<option value="' + mq.id + '">' + _esc(mq.nombre || mq.identificador_interno) + '</option>';
    });

    var m = document.createElement("div");
    m.className = "modal-overlay visible";
    m.id = "modal-f2b-con";
    m.onclick = function (e) { if (e.target === m) m.remove(); };
    m.innerHTML =
      '<div class="modal-content" style="max-width:520px;">' +
        '<h2 style="margin:0 0 16px;">Registrar consumo de repuesto</h2>' +
        '<div style="display:grid;gap:12px;">' +
          '<div><label class="form-label">Repuesto *</label>' +
            '<select id="f2b-con-rep" class="form-input" onchange="window._f2bConRepChange()">' + optsR + '</select></div>' +
          '<div><label class="form-label">Máquina *</label>' +
            '<select id="f2b-con-maq" class="form-input">' + optsM + '</select></div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
            '<div><label class="form-label">Cantidad *</label>' +
              '<input type="number" step="any" id="f2b-con-cant" class="form-input" value="1" min="0.01"></div>' +
            '<div><label class="form-label">Precio unitario (€)</label>' +
              '<input type="number" step="0.01" id="f2b-con-precio" class="form-input" placeholder="Del catálogo"></div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
            '<div><label class="form-label">Incidencia (ID)</label>' +
              '<input type="number" id="f2b-con-inc" class="form-input" placeholder="Opcional"></div>' +
            '<div><label class="form-label">Fecha</label>' +
              '<input type="date" id="f2b-con-fecha" class="form-input" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
          '</div>' +
          '<div><label class="form-label">Notas</label>' +
            '<input type="text" id="f2b-con-notas" class="form-input"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
          '<button class="btn-outline" onclick="document.getElementById(\'modal-f2b-con\').remove()">Cancelar</button>' +
          '<button class="btn-primary" onclick="window._f2bConGuardar()">Registrar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
  }

  window._f2bConRepChange = function () {
    var sel = document.getElementById("f2b-con-rep");
    if (!sel) return;
    var opt = sel.options[sel.selectedIndex];
    var precio = opt ? opt.getAttribute("data-precio") : "";
    var inp = document.getElementById("f2b-con-precio");
    if (inp && precio) inp.placeholder = _fmt(Number(precio)) + " € (catálogo)";
  };

  window._f2bConGuardar = function () {
    var payload = {
      repuesto_id: _valNum("f2b-con-rep"),
      maquina_id: _valNum("f2b-con-maq"),
      cantidad: _valNum("f2b-con-cant"),
      fecha: _val("f2b-con-fecha") || null,
      notas: _val("f2b-con-notas") || null,
    };
    var precioVal = _valNum("f2b-con-precio");
    if (precioVal != null) payload.precio_unitario = precioVal;
    var incVal = _valNum("f2b-con-inc");
    if (incVal != null) payload.incidencia_id = incVal;

    if (!payload.repuesto_id || !payload.maquina_id) {
      mostrarToast("Repuesto y máquina son obligatorios", "error");
      return;
    }
    if (!payload.cantidad || payload.cantidad <= 0) {
      mostrarToast("Cantidad debe ser mayor que 0", "error");
      return;
    }

    _postJson("/api/maquinaria/consumos", payload)
      .then(function (res) {
        document.getElementById("modal-f2b-con").remove();
        var msg = "Consumo registrado. Stock: " + _fmt(res.stock_actual);
        if (res.alerta) msg += " — " + res.alerta.tipo.replace(/_/g, " ").toUpperCase();
        mostrarToast(msg, res.alerta ? "error" : "success");
        _loadConsumos();
      })
      .catch(function (err) { mostrarToast(err.error || "Error registrando consumo", "error"); });
  };

  window._f2bConEliminar = function (id) {
    if (!confirm("¿Eliminar este consumo? Se restaurará el stock.")) return;
    _deleteJson("/api/maquinaria/consumos/" + id)
      .then(function () {
        mostrarToast("Consumo eliminado", "success");
        _loadConsumos();
      })
      .catch(function (err) { mostrarToast(err.error || "Error eliminando", "error"); });
  };

  // ═══════════════════════════════════════════════════════════════════════
  // ██  3. PROVEEDORES / TALLERES                                       ██
  // ═══════════════════════════════════════════════════════════════════════

  function _loadProveedores() {
    var qs = "";
    var ft = document.getElementById("f2b-prov-filtro-tipo");
    var fq = document.getElementById("f2b-prov-filtro-q");
    if (ft && ft.value) qs += "&tipo=" + ft.value;
    if (fq && fq.value) qs += "&q=" + encodeURIComponent(fq.value);
    _apiJson("/api/maquinaria/proveedores?activo=1" + qs)
      .then(function (data) {
        var provs = data.proveedores || [];
        var body = document.getElementById("f2b-body");
        if (!body) return;
        body.innerHTML = _renderProveedoresToolbar() + _renderProveedoresTabla(provs);
      })
      .catch(function () { mostrarToast("Error cargando proveedores", "error"); });
  }

  function _renderProveedoresToolbar() {
    return (
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">' +
        '<input id="f2b-prov-filtro-q" class="form-input" placeholder="Buscar nombre, zona..." ' +
          'style="max-width:240px;" onkeyup="if(event.key===\'Enter\')window._f2bProvBuscar()">' +
        '<select id="f2b-prov-filtro-tipo" class="form-input" style="max-width:150px;" onchange="window._f2bProvBuscar()">' +
          '<option value="">Tipo</option>' +
          '<option value="taller">Taller</option>' +
          '<option value="proveedor">Proveedor</option>' +
          '<option value="ambos">Ambos</option>' +
        '</select>' +
        '<button class="btn-outline" onclick="window._f2bProvBuscar()">Filtrar</button>' +
        '<div style="flex:1;"></div>' +
        '<button class="btn-primary" onclick="window._f2bProvNuevo()">+ Nuevo proveedor</button>' +
      '</div>'
    );
  }

  function _renderProveedoresTabla(provs) {
    if (!provs.length) return '<p style="color:#94A3B8;margin-top:16px;">Sin proveedores.</p>';
    var h = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.85rem;">' +
      '<thead><tr style="background:#F8FAFC;border-bottom:2px solid #E2E8F0;text-align:left;">' +
        '<th style="padding:8px;">Nombre</th>' +
        '<th style="padding:8px;">Tipo</th>' +
        '<th style="padding:8px;">Zona</th>' +
        '<th style="padding:8px;">Contacto</th>' +
        '<th style="padding:8px;">Teléfono</th>' +
        '<th style="padding:8px;text-align:center;">Obra</th>' +
        '<th style="padding:8px;text-align:center;">Valoración</th>' +
        '<th style="padding:8px;text-align:right;">Resp. (días)</th>' +
        '<th style="padding:8px;text-align:center;">Acciones</th>' +
      '</tr></thead><tbody>';
    provs.forEach(function (p) {
      var estrellas = "";
      if (p.valoracion_interna) {
        for (var i = 0; i < 5; i++) estrellas += i < p.valoracion_interna ? "★" : "☆";
      }
      h += '<tr style="border-bottom:1px solid #F1F5F9;">' +
        '<td style="padding:8px;font-weight:500;">' + _esc(p.nombre) + '</td>' +
        '<td style="padding:8px;">' + _esc(p.tipo || "") + '</td>' +
        '<td style="padding:8px;">' + _esc(p.zona || "") + '</td>' +
        '<td style="padding:8px;">' + _esc(p.contacto || "") + '</td>' +
        '<td style="padding:8px;">' + _esc(p.telefono || "") + '</td>' +
        '<td style="padding:8px;text-align:center;">' + (p.salida_a_obra ? "Sí" : "No") + '</td>' +
        '<td style="padding:8px;text-align:center;color:#F59E0B;">' + estrellas + '</td>' +
        '<td style="padding:8px;text-align:right;">' + _fmt(p.tiempo_respuesta_dias) + '</td>' +
        '<td style="padding:8px;text-align:center;">' +
          '<button class="btn-outline" style="padding:2px 8px;font-size:.78rem;" ' +
            'onclick="window._f2bProvEditar(' + p.id + ')">Editar</button> ' +
          '<button class="btn-outline" style="padding:2px 8px;font-size:.78rem;" ' +
            'onclick="window._f2bProvCompat(' + p.id + ',\'' + _esc(p.nombre).replace(/'/g, "\\'") + '\')">Compat.</button>' +
        '</td>' +
      '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  window._f2bProvBuscar = _loadProveedores;

  // — Modal: Nuevo/Editar proveedor —
  window._f2bProvNuevo = function () { _modalProveedor(null); };

  window._f2bProvEditar = function (id) {
    _apiJson("/api/maquinaria/proveedores/" + id)
      .then(function (prov) { _modalProveedor(prov); })
      .catch(function () { mostrarToast("Error cargando proveedor", "error"); });
  };

  function _modalProveedor(prov) {
    var isEdit = !!prov;
    var m = document.createElement("div");
    m.className = "modal-overlay visible";
    m.id = "modal-f2b-prov";
    m.onclick = function (e) { if (e.target === m) m.remove(); };
    m.innerHTML =
      '<div class="modal-content" style="max-width:560px;">' +
        '<h2 style="margin:0 0 16px;">' + (isEdit ? "Editar proveedor" : "Nuevo proveedor") + '</h2>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div style="grid-column:1/-1;"><label class="form-label">Nombre *</label>' +
            '<input type="text" id="f2b-prov-nombre" class="form-input" value="' + _esc((prov && prov.nombre) || "") + '"></div>' +
          '<div><label class="form-label">Tipo</label>' +
            '<select id="f2b-prov-tipo" class="form-input">' +
              '<option value="taller"' + (prov && prov.tipo === "taller" ? " selected" : "") + '>Taller</option>' +
              '<option value="proveedor"' + (prov && prov.tipo === "proveedor" ? " selected" : "") + '>Proveedor</option>' +
              '<option value="ambos"' + (prov && prov.tipo === "ambos" ? " selected" : "") + '>Ambos</option>' +
            '</select></div>' +
          '<div><label class="form-label">Zona</label>' +
            '<input type="text" id="f2b-prov-zona" class="form-input" value="' + _esc((prov && prov.zona) || "") + '"></div>' +
          '<div><label class="form-label">Contacto</label>' +
            '<input type="text" id="f2b-prov-contacto" class="form-input" value="' + _esc((prov && prov.contacto) || "") + '"></div>' +
          '<div><label class="form-label">Teléfono</label>' +
            '<input type="text" id="f2b-prov-tel" class="form-input" value="' + _esc((prov && prov.telefono) || "") + '"></div>' +
          '<div><label class="form-label">Email</label>' +
            '<input type="email" id="f2b-prov-email" class="form-input" value="' + _esc((prov && prov.email) || "") + '"></div>' +
          '<div style="grid-column:1/-1;"><label class="form-label">Dirección</label>' +
            '<input type="text" id="f2b-prov-dir" class="form-input" value="' + _esc((prov && prov.direccion) || "") + '"></div>' +
          '<div><label class="form-label">Salida a obra</label>' +
            '<select id="f2b-prov-obra" class="form-input">' +
              '<option value="0"' + (prov && !prov.salida_a_obra ? " selected" : "") + '>No</option>' +
              '<option value="1"' + (prov && prov.salida_a_obra ? " selected" : "") + '>Sí</option>' +
            '</select></div>' +
          '<div><label class="form-label">Tiempo respuesta (días)</label>' +
            '<input type="number" step="0.5" id="f2b-prov-resp" class="form-input" value="' + ((prov && prov.tiempo_respuesta_dias != null) ? prov.tiempo_respuesta_dias : "") + '"></div>' +
          '<div><label class="form-label">Valoración (1-5)</label>' +
            '<input type="number" min="1" max="5" id="f2b-prov-val" class="form-input" value="' + ((prov && prov.valoracion_interna != null) ? prov.valoracion_interna : "") + '"></div>' +
          '<div><label class="form-label">Notas</label>' +
            '<input type="text" id="f2b-prov-notas" class="form-input" value="' + _esc((prov && prov.notas) || "") + '"></div>' +
        '</div>' +
        (isEdit ?
          '<div style="margin-top:12px;"><label class="form-label">Activo</label>' +
            '<select id="f2b-prov-activo" class="form-input" style="max-width:120px;">' +
              '<option value="1"' + (prov.activo ? " selected" : "") + '>Sí</option>' +
              '<option value="0"' + (!prov.activo ? " selected" : "") + '>No</option>' +
            '</select></div>' : "") +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
          '<button class="btn-outline" onclick="document.getElementById(\'modal-f2b-prov\').remove()">Cancelar</button>' +
          '<button class="btn-primary" onclick="window._f2bProvGuardar(' + (isEdit ? prov.id : "null") + ')">' + (isEdit ? "Guardar" : "Crear") + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
  }

  window._f2bProvGuardar = function (id) {
    var payload = {
      nombre: _val("f2b-prov-nombre"),
      tipo: _val("f2b-prov-tipo"),
      zona: _val("f2b-prov-zona") || null,
      contacto: _val("f2b-prov-contacto") || null,
      telefono: _val("f2b-prov-tel") || null,
      email: _val("f2b-prov-email") || null,
      direccion: _val("f2b-prov-dir") || null,
      salida_a_obra: Number(_val("f2b-prov-obra") || 0),
      tiempo_respuesta_dias: _valNum("f2b-prov-resp"),
      valoracion_interna: _valNum("f2b-prov-val"),
      notas: _val("f2b-prov-notas") || null,
    };
    if (!payload.nombre) { mostrarToast("Nombre es obligatorio", "error"); return; }
    var actEl = document.getElementById("f2b-prov-activo");
    if (actEl) payload.activo = Number(actEl.value);

    var promise = id
      ? _putJson("/api/maquinaria/proveedores/" + id, payload)
      : _postJson("/api/maquinaria/proveedores", payload);

    promise
      .then(function () {
        document.getElementById("modal-f2b-prov").remove();
        mostrarToast(id ? "Proveedor actualizado" : "Proveedor creado", "success");
        _loadProveedores();
      })
      .catch(function (err) { mostrarToast(err.error || "Error guardando", "error"); });
  };

  // — Modal: Compatibilidad proveedor —
  window._f2bProvCompat = function (provId, nombre) {
    _apiJson("/api/maquinaria/proveedores/" + provId)
      .then(function (prov) { _modalCompatibilidad(prov); })
      .catch(function () { mostrarToast("Error cargando proveedor", "error"); });
  };

  function _modalCompatibilidad(prov) {
    var compats = prov.compatibilidades || [];
    var m = document.createElement("div");
    m.className = "modal-overlay visible";
    m.id = "modal-f2b-compat";
    m.onclick = function (e) { if (e.target === m) m.remove(); };

    var listaHtml = "";
    if (compats.length) {
      listaHtml = '<table style="width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:12px;">' +
        '<thead><tr style="background:#F8FAFC;border-bottom:1px solid #E2E8F0;">' +
          '<th style="padding:6px;">Marca</th><th style="padding:6px;">Modelo</th>' +
          '<th style="padding:6px;">Subsistema</th><th style="padding:6px;">Acc.</th>' +
        '</tr></thead><tbody>';
      compats.forEach(function (c) {
        listaHtml += '<tr style="border-bottom:1px solid #F1F5F9;">' +
          '<td style="padding:6px;">' + _esc(c.marca || "—") + '</td>' +
          '<td style="padding:6px;">' + _esc(c.modelo || "—") + '</td>' +
          '<td style="padding:6px;">' + _esc(c.subsistema || "—") + '</td>' +
          '<td style="padding:6px;">' +
            '<button class="btn-outline" style="padding:1px 6px;font-size:.75rem;color:#DC2626;" ' +
              'onclick="window._f2bCompatEliminar(' + c.id + ',' + prov.id + ')">×</button>' +
          '</td></tr>';
      });
      listaHtml += '</tbody></table>';
    } else {
      listaHtml = '<p style="color:#94A3B8;font-size:.85rem;margin-bottom:12px;">Sin compatibilidades.</p>';
    }

    m.innerHTML =
      '<div class="modal-content" style="max-width:520px;">' +
        '<h2 style="margin:0 0 16px;">Compatibilidad: ' + _esc(prov.nombre) + '</h2>' +
        '<div id="f2b-compat-lista">' + listaHtml + '</div>' +
        '<h3 style="font-size:.9rem;margin:0 0 8px;">Agregar compatibilidad</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
          '<div><label class="form-label">Marca</label>' +
            '<input type="text" id="f2b-compat-marca" class="form-input"></div>' +
          '<div><label class="form-label">Modelo</label>' +
            '<input type="text" id="f2b-compat-modelo" class="form-input"></div>' +
          '<div><label class="form-label">Subsistema</label>' +
            '<input type="text" id="f2b-compat-sub" class="form-input"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
          '<button class="btn-outline" onclick="document.getElementById(\'modal-f2b-compat\').remove()">Cerrar</button>' +
          '<button class="btn-primary" onclick="window._f2bCompatAgregar(' + prov.id + ')">Agregar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
  }

  window._f2bCompatAgregar = function (provId) {
    var payload = {
      proveedor_id: provId,
      marca: _val("f2b-compat-marca") || null,
      modelo: _val("f2b-compat-modelo") || null,
      subsistema: _val("f2b-compat-sub") || null,
    };
    if (!payload.marca && !payload.modelo && !payload.subsistema) {
      mostrarToast("Indica al menos marca, modelo o subsistema", "error");
      return;
    }
    _postJson("/api/maquinaria/proveedores/compatibilidad", payload)
      .then(function () {
        mostrarToast("Compatibilidad agregada", "success");
        // Recargar modal
        document.getElementById("modal-f2b-compat").remove();
        window._f2bProvCompat(provId, "");
      })
      .catch(function (err) { mostrarToast(err.error || "Error", "error"); });
  };

  window._f2bCompatEliminar = function (compatId, provId) {
    _deleteJson("/api/maquinaria/proveedores/compatibilidad/" + compatId)
      .then(function () {
        mostrarToast("Compatibilidad eliminada", "success");
        document.getElementById("modal-f2b-compat").remove();
        window._f2bProvCompat(provId, "");
      })
      .catch(function (err) { mostrarToast(err.error || "Error", "error"); });
  };

  // ═══════════════════════════════════════════════════════════════════════
  // ██  4. ANÁLISIS                                                     ██
  // ═══════════════════════════════════════════════════════════════════════

  function _loadAnalisis() {
    Promise.all([
      _apiJson("/api/maquinaria/resumen-flota"),
      _apiJson("/api/maquinaria/maquinas"),
    ]).then(function (results) {
      var resumen = results[0];
      var maquinas = results[1].maquinas || [];
      var body = document.getElementById("f2b-body");
      if (!body) return;
      body.innerHTML = _renderResumenFlota(resumen) + _renderCriticidadPanel(maquinas);
    }).catch(function () { mostrarToast("Error cargando análisis", "error"); });
  }

  function _renderResumenFlota(r) {
    var h = '<h2 style="font-size:1.1rem;margin:0 0 12px;">Resumen de flota</h2>';

    // KPIs
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:16px;">';
    h += _kpiCard("Máquinas activas", r.total_maquinas_activas, "#2563EB");
    var costes90 = r.costes_flota_90d || {};
    h += _kpiCard("Coste total 90d", _fmtEur(costes90.coste_total), "#DC2626");
    var costes30 = r.costes_flota_30d || {};
    h += _kpiCard("Coste total 30d", _fmtEur(costes30.coste_total), "#F59E0B");
    var alertasA = r.alertas_stock_criticidad_A || [];
    h += _kpiCard("Alertas stock A", alertasA.length, alertasA.length > 0 ? "#DC2626" : "#16A34A");
    h += '</div>';

    // Desglose criticidad y estado
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">';
    h += _renderDesgloseCard("Por criticidad", r.por_criticidad || {}, { alta: "#DC2626", media: "#F59E0B", baja: "#16A34A" });
    h += _renderDesgloseCard("Por estado operativo", r.por_estado_operativo || {}, { operativa: "#16A34A", averiada: "#DC2626", en_reparacion: "#F59E0B", mantenimiento: "#2563EB" });
    h += '</div>';

    // Desglose costes
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">';
    h += '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:14px;">' +
      '<h3 style="font-size:.9rem;margin:0 0 8px;">Costes 90 días</h3>' +
      '<div style="font-size:.85rem;line-height:1.8;">' +
        'Downtime: <strong>' + _fmtEur(costes90.coste_downtime) + '</strong><br>' +
        'Repuestos: <strong>' + _fmtEur(costes90.coste_repuesto) + '</strong><br>' +
        'Servicio: <strong>' + _fmtEur(costes90.coste_servicio) + '</strong>' +
      '</div></div>';
    h += '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:14px;">' +
      '<h3 style="font-size:.9rem;margin:0 0 8px;">Costes 30 días</h3>' +
      '<div style="font-size:.85rem;line-height:1.8;">' +
        'Downtime: <strong>' + _fmtEur(costes30.coste_downtime) + '</strong><br>' +
        'Repuestos: <strong>' + _fmtEur(costes30.coste_repuesto) + '</strong><br>' +
        'Servicio: <strong>' + _fmtEur(costes30.coste_servicio) + '</strong>' +
      '</div></div>';
    h += '</div>';

    // Top máquinas coste
    var topMaq = r.top_maquinas_coste_90d || [];
    if (topMaq.length) {
      h += '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:14px;margin-bottom:16px;">' +
        '<h3 style="font-size:.9rem;margin:0 0 8px;">Top 5 máquinas — coste 90d</h3>' +
        '<div style="display:flex;flex-direction:column;gap:4px;">';
      topMaq.forEach(function (t, i) {
        h += '<div style="display:flex;justify-content:space-between;font-size:.85rem;padding:4px 0;' +
          (i < topMaq.length - 1 ? 'border-bottom:1px solid #F1F5F9;' : '') + '">' +
          '<span>' + (i + 1) + '. ' + _esc(t.nombre) + '</span>' +
          '<strong>' + _fmtEur(t.coste_total_90d) + '</strong></div>';
      });
      h += '</div></div>';
    }

    // Top repuestos (cantidad y coste)
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">';
    h += _renderTopRepuestos("Top repuestos — cantidad 90d", r.top_repuestos_cantidad_90d || [], "cantidad_90d", "");
    h += _renderTopRepuestos("Top repuestos — coste 90d", r.top_repuestos_coste_90d || [], "coste_90d", " €");
    h += '</div>';

    // Alertas stock criticidad A
    if (alertasA.length) {
      h += '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px;margin-bottom:16px;">' +
        '<h3 style="font-size:.9rem;margin:0 0 8px;color:#DC2626;">Alertas stock criticidad A</h3>';
      alertasA.forEach(function (a) {
        h += '<div style="font-size:.85rem;padding:3px 0;">' +
          '<strong>' + _esc(a.codigo) + '</strong> ' + _esc(a.descripcion) +
          ' — stock: ' + _fmt(a.stock_actual) + ' / mín: ' + _fmt(a.stock_minimo) + '</div>';
      });
      h += '</div>';
    }

    return h;
  }

  function _kpiCard(label, value, color) {
    return '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:14px;text-align:center;">' +
      '<div style="font-size:.78rem;color:#64748B;margin-bottom:4px;">' + label + '</div>' +
      '<div style="font-size:1.4rem;font-weight:700;color:' + color + ';">' + value + '</div></div>';
  }

  function _renderDesgloseCard(title, obj, colors) {
    var h = '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:14px;">' +
      '<h3 style="font-size:.9rem;margin:0 0 8px;">' + title + '</h3>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
    Object.keys(obj).forEach(function (k) {
      var col = (colors && colors[k]) || "#64748B";
      h += '<span style="padding:4px 10px;border-radius:4px;font-size:.82rem;background:' + col + '18;color:' + col + ';font-weight:500;">' +
        _esc(k) + ': ' + obj[k] + '</span>';
    });
    h += '</div></div>';
    return h;
  }

  function _renderTopRepuestos(title, items, field, suffix) {
    var h = '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:14px;">' +
      '<h3 style="font-size:.9rem;margin:0 0 8px;">' + title + '</h3>';
    if (!items.length) {
      h += '<p style="color:#94A3B8;font-size:.85rem;">Sin datos.</p>';
    } else {
      items.forEach(function (t, i) {
        h += '<div style="display:flex;justify-content:space-between;font-size:.85rem;padding:4px 0;' +
          (i < items.length - 1 ? 'border-bottom:1px solid #F1F5F9;' : '') + '">' +
          '<span>' + (i + 1) + '. ' + _esc(t.codigo) + '</span>' +
          '<strong>' + _fmt(t[field]) + suffix + '</strong></div>';
      });
    }
    h += '</div>';
    return h;
  }

  // — Panel de criticidad sugerida por máquina —
  function _renderCriticidadPanel(maquinas) {
    var optsM = '<option value="">— Seleccionar máquina —</option>';
    maquinas.forEach(function (mq) {
      optsM += '<option value="' + mq.id + '">' + _esc(mq.nombre || mq.identificador_interno) +
        (mq.criticidad ? ' (' + mq.criticidad + ')' : '') + '</option>';
    });
    return (
      '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:14px;margin-top:16px;">' +
        '<h3 style="font-size:.9rem;margin:0 0 10px;">Criticidad sugerida por máquina</h3>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">' +
          '<select id="f2b-crit-maq" class="form-input" style="max-width:280px;">' + optsM + '</select>' +
          '<button class="btn-primary" onclick="window._f2bCalcCriticidad()">Calcular</button>' +
        '</div>' +
        '<div id="f2b-crit-resultado"></div>' +
      '</div>'
    );
  }

  window._f2bCalcCriticidad = function () {
    var mid = _valNum("f2b-crit-maq");
    if (!mid) { mostrarToast("Selecciona una máquina", "error"); return; }
    var div = document.getElementById("f2b-crit-resultado");
    if (div) div.innerHTML = '<p style="color:#94A3B8;">Calculando...</p>';

    _apiJson("/api/maquinaria/maquinas/" + mid + "/criticidad-sugerida")
      .then(function (r) {
        if (!div) return;
        var colSug = r.criticidad_sugerida === "alta" ? "#DC2626" : r.criticidad_sugerida === "media" ? "#F59E0B" : "#16A34A";
        var d = r.detalle || {};
        div.innerHTML =
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div>' +
              '<div style="font-size:.82rem;color:#64748B;">Criticidad actual</div>' +
              '<div style="font-size:1.1rem;font-weight:700;">' + _esc(r.criticidad_actual || "—") + '</div>' +
            '</div>' +
            '<div>' +
              '<div style="font-size:.82rem;color:#64748B;">Criticidad sugerida</div>' +
              '<div style="font-size:1.1rem;font-weight:700;color:' + colSug + ';">' +
                _esc(r.criticidad_sugerida) + ' (score ' + r.score + ')' +
                (r.cambio_sugerido ? ' <span style="background:#FEF2F2;color:#DC2626;padding:2px 6px;border-radius:4px;font-size:.75rem;">Cambio sugerido</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="margin-top:10px;font-size:.85rem;line-height:1.8;color:#475569;">' +
            'Incidencias 90d: <strong>' + d.incidencias_90d + '</strong> · ' +
            'Incidencias 365d: <strong>' + d.incidencias_365d + '</strong> · ' +
            'Downtime 90d: <strong>' + d.horas_downtime_90d + 'h</strong> · ' +
            'Consumos rep. A 365d: <strong>' + d.consumos_repuesto_A_365d + '</strong> · ' +
            'Edad: <strong>' + d.edad_anos + ' años</strong>' +
          '</div>';
      })
      .catch(function (err) {
        if (div) div.innerHTML = '<p style="color:#DC2626;">' + _esc(err.error || "Error calculando") + '</p>';
      });
  };

})();
