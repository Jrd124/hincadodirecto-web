// ═══ CRM — empresas, contactos, oportunidades, interacciones ═══
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

        // Card resumen — última interacción (Fase 1)
        var resumenCard = document.getElementById("crm-empresa-resumen-card");
        if (resumenCard) {
          fetch("/api/crm/empresas/" + id + "/resumen")
            .then(function (r) { return r.json(); })
            .then(function (res) {
              var iconoTipo = { llamada: "📞", email: "✉️", reunion: "🤝", nota: "📝", whatsapp: "💬", visita: "🏢" };
              var ui = res.ultima_interaccion;
              if (ui) {
                resumenCard.style.display = "flex";
                document.getElementById("crm-resumen-tipo-icon").textContent = iconoTipo[ui.tipo] || "📌";
                var fecha = ui.fecha ? ui.fecha.slice(0, 10) : "";
                document.getElementById("crm-resumen-fecha").textContent = fecha;
                document.getElementById("crm-resumen-asunto").textContent = ui.asunto || ui.descripcion || "—";
              } else {
                resumenCard.style.display = "none";
              }
              var cnt = [];
              if (res.num_contactos) cnt.push(res.num_contactos + " contacto" + (res.num_contactos !== 1 ? "s" : ""));
              if (res.num_oportunidades_abiertas) cnt.push(res.num_oportunidades_abiertas + " oport.");
              if (res.num_interacciones) cnt.push(res.num_interacciones + " interact.");
              var cntEl = document.getElementById("crm-resumen-contadores");
              if (cntEl) cntEl.textContent = cnt.join(" · ");
              if (!ui && cnt.length) resumenCard.style.display = "flex";
            })
            .catch(function () { if (resumenCard) resumenCard.style.display = "none"; });
        }

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

        // Actividades / Interacciones — timeline mejorado (Fase 2)
        var _tlIcon = { llamada: "📞", email: "✉️", whatsapp: "💬", reunion: "🤝", nota: "📝", visita: "🏢", gmail: "📧" };
        var _tlColor = { llamada: "#2563eb", email: "#7c3aed", reunion: "#059669", nota: "#d97706", whatsapp: "#25d366", visita: "#dc2626", gmail: "#ea4335" };
        var _tlInteracciones = emp.interacciones || [];
        var _tlFiltroActivo = "";

        function _tlFechaRelativa(fechaStr) {
          if (!fechaStr) return "";
          var d = new Date(fechaStr.substring(0, 10));
          var hoy = new Date(); hoy.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
          var diff = Math.round((hoy - d) / 86400000);
          if (diff === 0) return "Hoy";
          if (diff === 1) return "Ayer";
          if (diff < 7) return "Hace " + diff + " días";
          if (diff < 30) return "Hace " + Math.floor(diff / 7) + " sem.";
          if (diff < 365) return "Hace " + Math.floor(diff / 30) + " mes" + (Math.floor(diff / 30) > 1 ? "es" : "");
          return fechaStr.substring(0, 10);
        }

        // ── Modo selección (bulk delete) ──────────────────────────────────────
        var _tlModoSeleccion = false;
        var _tlSeleccionados = new Set();

        function _tlActualizarBarraSeleccion() {
          var batchBar = document.getElementById("crm-tl-batch-bar");
          var selCount = document.getElementById("crm-tl-sel-count");
          var btnElim = document.getElementById("btn-tl-eliminar-sel");
          var checkAll = document.getElementById("crm-tl-check-all");
          var n = _tlSeleccionados.size;
          if (selCount) selCount.textContent = n > 0 ? n + " seleccionada" + (n !== 1 ? "s" : "") : "Ninguna seleccionada";
          if (btnElim) btnElim.disabled = n === 0;
          if (checkAll) {
            var visibles = intEl ? intEl.querySelectorAll("[data-int-id]") : [];
            checkAll.indeterminate = n > 0 && n < visibles.length;
            checkAll.checked = n > 0 && n === visibles.length;
          }
          if (batchBar) batchBar.style.display = _tlModoSeleccion ? "flex" : "none";
        }

        function _tlEntrarModoSeleccion() {
          _tlModoSeleccion = true;
          _tlSeleccionados.clear();
          var btnSel = document.getElementById("btn-tl-seleccionar");
          if (btnSel) btnSel.style.display = "none";
          _tlRender();
          _tlActualizarBarraSeleccion();
        }

        function _tlSalirModoSeleccion() {
          _tlModoSeleccion = false;
          _tlSeleccionados.clear();
          var btnSel = document.getElementById("btn-tl-seleccionar");
          if (btnSel) btnSel.style.display = "";
          _tlRender();
          var batchBar = document.getElementById("crm-tl-batch-bar");
          if (batchBar) batchBar.style.display = "none";
        }

        function _tlRenderItem(i) {
          var icon = _tlIcon[i.tipo] || "📌";
          var fechaRel = _tlFechaRelativa(i.fecha);
          var sourceBadge = (i.source && i.source !== "manual")
            ? '<span class="crm-timeline-source-badge">' + _esc(i.source) + '</span>' : "";
          var desc = (i.descripcion && i.descripcion !== i.asunto && i.descripcion !== "Última interacción (import)")
            ? '<div class="crm-timeline-desc">' + _esc((i.descripcion || "").substring(0, 120)) + '</div>' : "";
          var checkbox = _tlModoSeleccion
            ? '<input type="checkbox" class="crm-tl-check" data-int-id="' + i.id + '" ' +
              (_tlSeleccionados.has(i.id) ? 'checked' : '') +
              ' style="width:16px;height:16px;flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();">'
            : "";
          return '<div class="crm-timeline-item' + (_tlSeleccionados.has(i.id) ? " crm-tl-selected" : "") +
            '" data-int-id="' + i.id + '" data-tipo="' + _esc(i.tipo) + '" style="cursor:pointer;display:flex;align-items:flex-start;gap:8px;">' +
            checkbox +
            '<span class="crm-timeline-icon">' + icon + '</span>' +
            '<div class="crm-timeline-body" style="flex:1;min-width:0;">' +
              '<div class="crm-timeline-header">' +
                '<span class="crm-timeline-tipo">' + _esc(i.tipo) + '</span>' +
                '<span class="crm-timeline-fecha" title="' + _esc(i.fecha || "") + '">' + fechaRel + '</span>' +
                sourceBadge +
              '</div>' +
              '<div class="crm-timeline-asunto">' + _esc(i.asunto || i.descripcion || "(sin asunto)") + '</div>' +
              desc +
            '</div>' +
          '</div>';
        }

        var intEl = document.getElementById("crm-empresa-interacciones-lista");
        function _tlRender() {
          var visible = _tlFiltroActivo
            ? _tlInteracciones.filter(function (i) { return i.tipo === _tlFiltroActivo; })
            : _tlInteracciones;
          if (visible.length > 0) {
            intEl.innerHTML = visible.map(_tlRenderItem).join("");
            intEl.querySelectorAll("[data-int-id]").forEach(function (el) {
              el.addEventListener("click", function (e) {
                var id = parseInt(el.getAttribute("data-int-id"));
                if (_tlModoSeleccion) {
                  // Toggle selección
                  if (_tlSeleccionados.has(id)) _tlSeleccionados.delete(id);
                  else _tlSeleccionados.add(id);
                  el.classList.toggle("crm-tl-selected", _tlSeleccionados.has(id));
                  var cb = el.querySelector(".crm-tl-check");
                  if (cb) cb.checked = _tlSeleccionados.has(id);
                  _tlActualizarBarraSeleccion();
                } else {
                  if (window._intAbrirModalEditar) _intAbrirModalEditar(id);
                }
              });
              // Checkbox click independiente
              var cb = el.querySelector(".crm-tl-check");
              if (cb) {
                cb.addEventListener("change", function (e) {
                  var id = parseInt(cb.getAttribute("data-int-id"));
                  if (cb.checked) _tlSeleccionados.add(id);
                  else _tlSeleccionados.delete(id);
                  el.classList.toggle("crm-tl-selected", cb.checked);
                  _tlActualizarBarraSeleccion();
                });
              }
            });
          } else {
            intEl.innerHTML = '<p class="crm-sin-datos">' +
              (_tlFiltroActivo ? "Sin actividades de tipo «" + _tlFiltroActivo + "»" : "Sin actividades") + '</p>';
          }
          _tlActualizarBarraSeleccion();
        }
        _tlRender();

        // Botón "Seleccionar"
        var btnTlSel = document.getElementById("btn-tl-seleccionar");
        if (btnTlSel) {
          // Reemplazar listener cada vez que se carga una empresa (clonar nodo)
          var btnTlSelNew = btnTlSel.cloneNode(true);
          btnTlSel.parentNode.replaceChild(btnTlSelNew, btnTlSel);
          btnTlSelNew.addEventListener("click", _tlEntrarModoSeleccion);
        }

        // Botón "Cancelar"
        var btnTlCancel = document.getElementById("btn-tl-cancelar-sel");
        if (btnTlCancel) {
          var btnTlCancelNew = btnTlCancel.cloneNode(true);
          btnTlCancel.parentNode.replaceChild(btnTlCancelNew, btnTlCancel);
          btnTlCancelNew.addEventListener("click", _tlSalirModoSeleccion);
        }

        // Checkbox "Seleccionar todas"
        var checkAll = document.getElementById("crm-tl-check-all");
        if (checkAll) {
          var checkAllNew = checkAll.cloneNode(true);
          checkAll.parentNode.replaceChild(checkAllNew, checkAll);
          checkAllNew.addEventListener("change", function () {
            var visibles = intEl ? intEl.querySelectorAll("[data-int-id]") : [];
            visibles.forEach(function (el) {
              var id = parseInt(el.getAttribute("data-int-id"));
              if (checkAllNew.checked) { _tlSeleccionados.add(id); el.classList.add("crm-tl-selected"); }
              else { _tlSeleccionados.delete(id); el.classList.remove("crm-tl-selected"); }
              var cb = el.querySelector(".crm-tl-check");
              if (cb) cb.checked = checkAllNew.checked;
            });
            _tlActualizarBarraSeleccion();
          });
        }

        // Botón "Eliminar seleccionadas"
        var btnElimSel = document.getElementById("btn-tl-eliminar-sel");
        if (btnElimSel) {
          var btnElimSelNew = btnElimSel.cloneNode(true);
          btnElimSel.parentNode.replaceChild(btnElimSelNew, btnElimSel);
          btnElimSelNew.addEventListener("click", function () {
            var ids = Array.from(_tlSeleccionados);
            if (ids.length === 0) return;
            if (!confirm("¿Eliminar " + ids.length + " actividad" + (ids.length !== 1 ? "es" : "") + "? Esta acción no se puede deshacer.")) return;
            btnElimSelNew.disabled = true;
            btnElimSelNew.textContent = "⏳ Eliminando…";
            fetch("/api/crm/interacciones/batch", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: ids })
            })
              .then(function (r) { return r.json(); })
              .then(function (res) {
                _tlSalirModoSeleccion();
                if (typeof mostrarToast === "function") {
                  mostrarToast((res.eliminadas || ids.length) + " actividad(es) eliminada(s).", "success");
                }
                if (_crmEmpresaSeleccionada) _crmSeleccionarEmpresa(_crmEmpresaSeleccionada);
              })
              .catch(function () {
                btnElimSelNew.disabled = false;
                btnElimSelNew.textContent = "🗑 Eliminar seleccionadas";
                alert("Error al eliminar. Inténtalo de nuevo.");
              });
          });
        }

        // Filtros tipo (pills)
        var filtrosEl = document.getElementById("crm-timeline-filtros");
        if (filtrosEl) {
          filtrosEl.querySelectorAll(".crm-tl-filtro").forEach(function (btn) {
            btn.addEventListener("click", function () {
              filtrosEl.querySelectorAll(".crm-tl-filtro").forEach(function (b) {
                b.classList.remove("crm-tl-filtro--activo");
              });
              btn.classList.add("crm-tl-filtro--activo");
              _tlFiltroActivo = btn.getAttribute("data-tipo") || "";
              _tlRender();
            });
          });
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
                    '<div><a href="#" onclick="navegarAProyecto(' + pr.id + ');return false;" style="font-size:13px;font-weight:500;color:var(--color-primary);text-decoration:none;">' + (pr.codigo ? '<span style="font-weight:600;">' + _esc(pr.codigo) + '</span> \u00b7 ' : '') + _esc(pr.nombre || "") + '</a>' +
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
    var dominioEl = document.getElementById("crm-emp-dominio");
    if (dominioEl) dominioEl.value = emp ? emp.dominio || "" : "";
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

  // ── Eliminar empresa ────────────────────────────────────────────────────────
  document.getElementById("btn-eliminar-empresa-crm").addEventListener("click", function () {
    if (!_crmEmpresaSeleccionada) return;
    var nombre = document.getElementById("crm-empresa-nombre").textContent || "esta empresa";
    if (!confirm("¿Eliminar \"" + nombre + "\"?\n\nSe eliminarán también todos sus contactos, interacciones y oportunidades abiertas.\n\nEsta acción no se puede deshacer.")) return;
    fetch("/api/crm/empresas/" + _crmEmpresaSeleccionada, { method: "DELETE" })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.error) { mostrarToast(res.error, "error"); return; }
        var el = res.eliminados || {};
        mostrarToast("Empresa eliminada" +
          (el.contactos ? " · " + el.contactos + " contacto(s)" : "") +
          (el.interacciones ? " · " + el.interacciones + " actividad(es)" : "") +
          (el.oportunidades ? " · " + el.oportunidades + " oport. cerrada(s)" : ""),
          "success");
        _crmEmpresaSeleccionada = null;
        document.getElementById("crm-empresas-sin-seleccion").style.display = "block";
        document.getElementById("crm-empresa-detalle").style.display = "none";
        _crmCargarEmpresas();
        _crmCargarStats();
      })
      .catch(function () { mostrarToast("Error al eliminar la empresa.", "error"); });
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
      dominio: (document.getElementById("crm-emp-dominio") || {}).value || "",
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
  var dedupHistorialEl = document.getElementById("crm-dedup-historial");
  var dedupVacioEl = document.getElementById("crm-dedup-vacio");
  var dedupResumenEl = document.getElementById("crm-dedup-resumen");

  // ── Renderizar grupos de duplicados (reutilizable) ─────────────────────────
  function _renderDedupGrupos(grupos, containerEl, resumenEl, vacioEl, opts) {
    var tipo = (opts && opts.tipo) || "all";
    var onRefresh = (opts && opts.onRefresh) || function () {};
    containerEl.innerHTML = "";
    if (grupos.length === 0) {
      if (vacioEl) vacioEl.style.display = "block";
      if (resumenEl) resumenEl.textContent = "0 grupos de posibles duplicados detectados.";
      return;
    }
    if (vacioEl) vacioEl.style.display = "none";
    var totalRegs = 0;
    grupos.forEach(function (g) { totalRegs += g.registros.length; });
    if (resumenEl) resumenEl.textContent = grupos.length + " grupo(s) de posibles duplicados (" + totalRegs + " registros afectados).";

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

        var html = '<label class="crm-dedup-radio"><input type="radio" name="dedup-principal-' + tipo + '-' + gi + '" value="' + reg.id + '"> Principal (se queda)</label>';
        html += '<h4>' + _esc(reg.nombre_canonico) + '</h4>';
        campos.forEach(function (c) {
          var val = c.value ? _esc(c.value) : '<span class="vacio">vacio</span>';
          html += '<div class="crm-dedup-campo"><strong>' + c.label + ':</strong> ' + val + '</div>';
        });
        html += '<div class="crm-dedup-facturas">Facturas prov: ' + (reg.num_facturas_prov || 0) + ' | Facturas cli: ' + (reg.num_facturas_cli || 0) + '</div>';
        ficha.innerHTML = html;

        ficha.querySelector("input[type=radio]").addEventListener("change", function () {
          fichasDiv.querySelectorAll(".crm-dedup-ficha").forEach(function (f) { f.classList.remove("seleccionado"); });
          ficha.classList.add("seleccionado");
        });

        fichasDiv.appendChild(ficha);
      });

      div.appendChild(fichasDiv);

      // Botones de acción
      var acciones = document.createElement("div");
      acciones.className = "crm-dedup-acciones";
      acciones.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:8px;";

      // Botón Fusionar
      var btnFusionar = document.createElement("button");
      btnFusionar.className = "primary";
      btnFusionar.textContent = "Fusionar grupo";
      btnFusionar.addEventListener("click", function () {
        var radios = div.querySelectorAll("input[name='dedup-principal-" + tipo + "-" + gi + "']");
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
          if (typeof _crmCargarEmpresas === "function") _crmCargarEmpresas();
          onRefresh();
        }).catch(function (err) {
          alert("Error al fusionar: " + err.message);
        });
      });
      acciones.appendChild(btnFusionar);

      // Botón No son duplicadas
      var btnNodup = document.createElement("button");
      btnNodup.className = "secondary";
      btnNodup.textContent = "No son duplicadas";
      btnNodup.addEventListener("click", function () {
        var ids = grupo.registros.map(function (r) { return r.id; });
        if (!confirm("Marcar este grupo como no-duplicados? No volveran a aparecer en el listado.")) return;
        // Marcar todos los pares del grupo
        var promesas = [];
        for (var a = 0; a < ids.length; a++) {
          for (var b = a + 1; b < ids.length; b++) {
            promesas.push(fetch("/api/terceros/no-duplicados", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tercero_id_1: ids[a], tercero_id_2: ids[b] })
            }));
          }
        }
        Promise.all(promesas).then(function () {
          div.innerHTML = '<div style="text-align:center;padding:16px;color:#64748b;font-weight:600;">Marcado como no-duplicados.</div>';
          onRefresh();
        }).catch(function (err) {
          alert("Error: " + err.message);
        });
      });
      acciones.appendChild(btnNodup);

      div.appendChild(acciones);
      containerEl.appendChild(div);
    });
  }

  // ── Renderizar historial de fusiones ───────────────────────────────────────
  function _renderHistorialFusiones(containerEl) {
    containerEl.innerHTML = '<p style="text-align:center;color:#94a3b8;">Cargando historial...</p>';
    fetch("/api/terceros/fusiones-log")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var fusiones = data.fusiones || [];
        if (fusiones.length === 0) {
          containerEl.innerHTML = '<p style="text-align:center;padding:40px;color:#94a3b8;">No hay fusiones registradas.</p>';
          return;
        }
        var html = '<table class="tabla-historial-fusiones" style="width:100%;border-collapse:collapse;font-size:0.9rem;">';
        html += '<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:left;">' +
          '<th style="padding:8px;">Fecha</th>' +
          '<th style="padding:8px;">Conservado</th>' +
          '<th style="padding:8px;">Eliminado</th>' +
          '<th style="padding:8px;">Motivo</th>' +
          '</tr></thead><tbody>';
        fusiones.forEach(function (f) {
          html += '<tr style="border-bottom:1px solid #f1f5f9;">' +
            '<td style="padding:8px;">' + _esc(f.fecha || "") + '</td>' +
            '<td style="padding:8px;">#' + f.tercero_conservado_id + ' ' + _esc(f.nombre_conservado || "") + '</td>' +
            '<td style="padding:8px;">#' + f.tercero_eliminado_id + ' ' + _esc(f.nombre_eliminado || "") + '</td>' +
            '<td style="padding:8px;">' + _esc(f.motivo || "") + '</td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        containerEl.innerHTML = html;
      })
      .catch(function (err) {
        containerEl.innerHTML = '<p style="color:#b91c1c;text-align:center;">Error: ' + _esc(err.message) + '</p>';
      });
  }

  // ── Lógica de pestañas genérica ────────────────────────────────────────────
  function _initDedupTabs(containerEl) {
    var tabs = containerEl.querySelectorAll(".dedup-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var panel = tab.dataset.panel;
        var tabType = tab.dataset.tab;
        // Actualizar botones activos
        tabs.forEach(function (t) {
          if (t.dataset.panel === panel) {
            t.classList.remove("active", "primary", "secondary");
            t.classList.add(t === tab ? "primary" : "secondary");
            if (t === tab) t.classList.add("active");
          }
        });
        // Mostrar/ocultar contenido
        var prefix = panel === "crm" ? "crm" : (panel === "finanzas" ? "finanzas" : (panel === "proveedores" ? "prov" : "cli"));
        var gruposEl = document.getElementById(prefix + "-dedup-grupos");
        var histEl = document.getElementById(prefix + "-dedup-historial");
        var vacioEl = document.getElementById(prefix + "-dedup-vacio");
        var resumenEl = document.getElementById(prefix + "-dedup-resumen");
        if (tabType === "pendientes") {
          if (gruposEl) gruposEl.style.display = "";
          if (histEl) histEl.style.display = "none";
          if (vacioEl && gruposEl && gruposEl.children.length === 0) vacioEl.style.display = "block";
          if (resumenEl) resumenEl.style.display = "";
        } else {
          if (gruposEl) gruposEl.style.display = "none";
          if (histEl) histEl.style.display = "";
          if (vacioEl) vacioEl.style.display = "none";
          if (resumenEl) resumenEl.style.display = "none";
          _renderHistorialFusiones(histEl);
        }
      });
    });
  }

  // Inicializar tabs del modal CRM
  _initDedupTabs(dedupModalEl);

  function _dedupAbrir() {
    dedupModalEl.classList.add("visible");
    dedupModalEl.setAttribute("aria-hidden", "false");
    dedupGruposEl.innerHTML = '<p style="text-align:center;color:#94a3b8;">Analizando duplicados...</p>';
    if (dedupHistorialEl) dedupHistorialEl.style.display = "none";
    dedupVacioEl.style.display = "none";
    dedupResumenEl.textContent = "";
    // Reset tabs to Pendientes
    dedupModalEl.querySelectorAll(".dedup-tab").forEach(function (t) {
      t.classList.remove("active", "primary", "secondary");
      t.classList.add(t.dataset.tab === "pendientes" ? "primary" : "secondary");
      if (t.dataset.tab === "pendientes") t.classList.add("active");
    });
    dedupGruposEl.style.display = "";

    fetch("/api/crm/duplicados")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var grupos = data.grupos || [];
        _renderDedupGrupos(grupos, dedupGruposEl, dedupResumenEl, dedupVacioEl, {
          tipo: "crm",
          onRefresh: function () { _dedupAbrir(); }
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

  // ── Exponer funciones reutilizables para Finanzas ──────────────────────────
  window._renderDedupGrupos = _renderDedupGrupos;
  window._renderHistorialFusiones = _renderHistorialFusiones;
  window._initDedupTabs = _initDedupTabs;

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

  // ── Eliminar contacto ───────────────────────────────────────────────────────
  document.getElementById("btn-eliminar-contacto-crm").addEventListener("click", function () {
    if (!_contSeleccionado) return;
    var nombre = (document.getElementById("crm-contacto-nombre") || {}).textContent || "este contacto";
    if (!confirm("¿Eliminar \"" + nombre + "\"?\n\nEsta acción no se puede deshacer.")) return;
    fetch("/api/crm/contactos/" + _contSeleccionado, { method: "DELETE" })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.error) { mostrarToast(res.error, "error"); return; }
        mostrarToast("Contacto eliminado.", "success");
        _contSeleccionado = null;
        var sinSel = document.getElementById("crm-contacto-sin-seleccion");
        var det = document.getElementById("crm-contacto-detalle");
        if (sinSel) sinSel.style.display = "block";
        if (det) det.style.display = "none";
        if (window._crmCargarContactos) _crmCargarContactos();
      })
      .catch(function () { mostrarToast("Error al eliminar el contacto.", "error"); });
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
    document.getElementById("btn-eliminar-crm-oportunidad").style.display = o ? "" : "none";
    // Autocomplete empresa
    fetch("/api/crm/empresas?activo=1&limit=500")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var emps = d.empresas || [];
        var empId = o ? String(o.empresa_id || "") : (_crmEmpresaSeleccionada ? String(_crmEmpresaSeleccionada) : "");
        var empNombre = "";
        if (empId) {
          var found = emps.find(function (e) { return String(e.id) === empId; });
          if (found) empNombre = found.nombre;
        }
        _opInitAutocompleteEmpresa(emps, empId, empNombre);
        if (empId) {
          var contId = o ? String(o.contacto_id || "") : "";
          _opCargarContactosAC(empId, contId);
        }
      });
    opModalEl.classList.add("visible");
    opModalEl.setAttribute("aria-hidden", "false");
  }

  // ── Autocomplete helpers para el modal de oportunidad ─────────────────────
  var _opEmpresas = [];
  var _opContactos = [];

  function _opInitAutocompleteEmpresa(emps, selectedId, selectedNombre) {
    _opEmpresas = emps;
    var txt = document.getElementById("crm-op-empresa-txt");
    var hid = document.getElementById("crm-op-empresa");
    var dd = document.getElementById("crm-op-empresa-dropdown");
    txt.value = selectedNombre || "";
    hid.value = selectedId || "";
    // Reset contacto
    document.getElementById("crm-op-contacto-txt").value = "";
    document.getElementById("crm-op-contacto").value = "";
    _opRenderDropdown(txt, hid, dd, emps, selectedId, function (id, nombre) {
      hid.value = id;
      txt.value = nombre;
      dd.style.display = "none";
      _opCargarContactosAC(id, "");
    });
  }

  function _opRenderDropdown(txt, hid, dd, items, selectedId, onSelect) {
    // Limpiar listeners previos clonando
    var newTxt = txt.cloneNode(true);
    txt.parentNode.replaceChild(newTxt, txt);
    txt = newTxt;

    txt.addEventListener("input", function () {
      var q = txt.value.trim().toLowerCase();
      var filtered = q
        ? items.filter(function (i) { return (i.nombre || i.label || "").toLowerCase().indexOf(q) !== -1; })
        : items.slice(0, 80);
      _opShowDropdown(dd, filtered, onSelect, hid);
    });
    txt.addEventListener("focus", function () {
      var q = txt.value.trim().toLowerCase();
      var filtered = q
        ? items.filter(function (i) { return (i.nombre || i.label || "").toLowerCase().indexOf(q) !== -1; })
        : items.slice(0, 80);
      _opShowDropdown(dd, filtered, onSelect, hid);
    });
    txt.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { dd.style.display = "none"; }
    });
    document.addEventListener("click", function (e) {
      if (!dd.contains(e.target) && e.target !== txt) dd.style.display = "none";
    }, { capture: true });
  }

  function _opShowDropdown(dd, items, onSelect, hid) {
    if (!items.length) { dd.style.display = "none"; return; }
    dd.innerHTML = items.map(function (i) {
      var id = i.id !== undefined ? i.id : i.value;
      var label = i.nombre || i.label || "";
      var extra = i.tipo ? '<span style="font-size:0.72rem;color:#94a3b8;margin-left:6px;">' + _esc(i.tipo) + '</span>' : "";
      return '<div class="crm-ac-item" data-id="' + id + '" style="padding:7px 12px;cursor:pointer;font-size:0.88rem;display:flex;align-items:center;' +
        (String(id) === String(hid.value) ? 'background:#EFF6FF;font-weight:600;' : '') + '">' +
        _esc(label) + extra + '</div>';
    }).join("");
    dd.style.display = "block";
    dd.querySelectorAll(".crm-ac-item").forEach(function (el) {
      el.addEventListener("mousedown", function (e) {
        e.preventDefault();
        onSelect(el.getAttribute("data-id"), el.textContent.trim().replace(/\s+\S+$/, "").trim());
        // Get clean label
        var label = el.querySelector ? el.childNodes[0] && el.childNodes[0].textContent || el.textContent : el.textContent;
        onSelect(el.getAttribute("data-id"), label.trim());
      });
    });
  }

  function _opCargarContactosAC(empresaId, selectedId) {
    var txt = document.getElementById("crm-op-contacto-txt");
    var hid = document.getElementById("crm-op-contacto");
    var dd = document.getElementById("crm-op-contacto-dropdown");
    txt.value = "";
    hid.value = "";
    _opContactos = [];
    if (!empresaId) return;
    fetch("/api/crm/contactos?empresa_id=" + empresaId + "&limit=200")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        _opContactos = (d.contactos || []).map(function (c) {
          return { id: c.id, nombre: c.nombre + (c.apellidos ? " " + c.apellidos : "") };
        });
        var selNombre = "";
        if (selectedId) {
          var found = _opContactos.find(function (c) { return String(c.id) === String(selectedId); });
          if (found) { selNombre = found.nombre; hid.value = String(selectedId); txt.value = selNombre; }
        }
        _opRenderDropdown(txt, hid, dd, _opContactos, selectedId || "", function (id, nombre) {
          hid.value = id;
          txt.value = nombre;
          dd.style.display = "none";
        });
      });
  }

  function _opCerrarModal() { opModalEl.classList.remove("visible"); opModalEl.setAttribute("aria-hidden", "true"); }
  document.getElementById("btn-nueva-oportunidad-crm").addEventListener("click", function () { _opAbrirModal(null); });
  document.getElementById("btn-cancelar-crm-oportunidad").addEventListener("click", _opCerrarModal);
  opModalEl.addEventListener("click", function (e) { if (e.target === opModalEl) _opCerrarModal(); });

  document.getElementById("btn-eliminar-crm-oportunidad").addEventListener("click", function () {
    var id = parseInt(document.getElementById("crm-op-edit-id").value);
    if (!id) return;
    var nombre = document.getElementById("crm-op-nombre").value || "esta oportunidad";
    if (!confirm("¿Eliminar definitivamente la oportunidad «" + nombre + "»?\n\nSus actividades vinculadas se conservarán pero quedarán desvinculadas.")) return;
    fetch("/api/crm/oportunidades/" + id, { method: "DELETE" })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { mostrarToast(res.data.error || "Error al eliminar", "error"); return; }
        mostrarToast("Oportunidad eliminada.", "success");
        _opCerrarModal();
        _crmCargarOportunidades();
        if (_crmEmpresaSeleccionada) _crmSeleccionarEmpresa(_crmEmpresaSeleccionada);
      })
      .catch(function () { mostrarToast("Error de conexión.", "error"); });
  });

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

  // ─── Gmail Sync — Fase 3 ─────────────────────────────────────────────────

  /** Comprueba si Gmail está disponible y actualiza UI del panel inicio */
  function _gmailComprobarEstado() {
    fetch("/api/gmail/estado")
      .then(function (r) { return r.json(); })
      .then(function (estado) {
        var card = document.getElementById("crm-gmail-admin-card");
        var txt = document.getElementById("crm-gmail-estado-txt");
        if (!card) return;
        card.style.display = "block";
        if (estado.disponible) {
          if (txt) txt.textContent = "Conectado como " + (estado.cuenta || "—");
          var btnGlobal = document.getElementById("btn-gmail-sync-global");
          if (btnGlobal) btnGlobal.disabled = false;
        } else {
          if (txt) txt.textContent = "No configurado: " + (estado.motivo || "");
          var btnGlobal2 = document.getElementById("btn-gmail-sync-global");
          if (btnGlobal2) btnGlobal2.disabled = true;
        }
      })
      .catch(function () {
        var card = document.getElementById("crm-gmail-admin-card");
        if (card) card.style.display = "none";
      });
  }

  /** Sincroniza Gmail para una empresa concreta y actualiza el timeline */
  function _gmailSyncEmpresa(empresaId, btn) {
    if (!empresaId) return;
    var orig = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Sincronizando…"; }
    fetch("/api/gmail/sync/empresa/" + empresaId, { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = orig; }
        if (res.error) {
          alert("Error Gmail sync: " + res.error);
          return;
        }
        var msg = "Gmail: " + res.hilos_encontrados + " hilo(s) encontrado(s), " +
          res.interacciones_creadas + " nueva(s).";
        if (res.interacciones_creadas > 0) {
          // Recargar empresa para mostrar nuevas actividades
          if (typeof _crmSeleccionarEmpresa === "function") {
            _crmSeleccionarEmpresa(empresaId);
          }
          // Pequeño toast
          var toast = document.createElement("div");
          toast.textContent = msg;
          Object.assign(toast.style, {
            position: "fixed", bottom: "24px", right: "24px",
            background: "#1e293b", color: "#fff", padding: "10px 18px",
            borderRadius: "8px", fontSize: "0.85rem", zIndex: "9999",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
          });
          document.body.appendChild(toast);
          setTimeout(function () { toast.remove(); }, 4000);
        } else {
          alert(msg);
        }
      })
      .catch(function (err) {
        if (btn) { btn.disabled = false; btn.textContent = orig; }
        alert("Error de red al sincronizar Gmail: " + err);
      });
  }

  // Botón Sync Gmail por empresa (se muestra cuando hay empresa seleccionada)
  var _btnGmailEmpresa = document.getElementById("btn-gmail-sync-empresa");
  if (_btnGmailEmpresa) {
    _btnGmailEmpresa.addEventListener("click", function () {
      _gmailSyncEmpresa(_crmEmpresaSeleccionada, _btnGmailEmpresa);
    });
    // Mostrar solo cuando Gmail está disponible
    fetch("/api/gmail/estado")
      .then(function (r) { return r.json(); })
      .then(function (e) {
        if (e.disponible) _btnGmailEmpresa.style.display = "";
      })
      .catch(function () {});
  }

  // Botón Sync Gmail global (en panel inicio CRM)
  var _btnGmailGlobal = document.getElementById("btn-gmail-sync-global");
  if (_btnGmailGlobal) {
    _btnGmailGlobal.addEventListener("click", function () {
      var btn = _btnGmailGlobal;
      var orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = "⏳ Sincronizando…";
      var res2El = document.getElementById("crm-gmail-sync-resultado");
      if (res2El) { res2El.style.display = "none"; res2El.textContent = ""; }
      fetch("/api/gmail/sync/global", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ solo_con_dominio: false }) })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          btn.disabled = false;
          btn.textContent = orig;
          if (res.error) {
            if (res2El) { res2El.style.display = "block"; res2El.textContent = "Error: " + res.error; }
            return;
          }
          var txt = "✓ " + res.empresas_procesadas + " empresa(s) procesadas · " +
            res.hilos_encontrados + " hilo(s) · " +
            res.interacciones_creadas + " actividad(es) nueva(s)";
          if (res.errores && res.errores.length) txt += " · " + res.errores.length + " error(es)";
          if (res2El) { res2El.style.display = "block"; res2El.textContent = txt; }
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = orig;
          if (res2El) { res2El.style.display = "block"; res2El.textContent = "Error de red: " + err; }
        });
    });
  }

  // Cargar estado Gmail cuando se abre el panel inicio CRM
  var _crmPanelInicioObs = document.getElementById("panel-crm-inicio");
  if (_crmPanelInicioObs) {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === "attributes" && _crmPanelInicioObs.classList.contains("visible")) {
          _gmailComprobarEstado();
        }
      });
    }).observe(_crmPanelInicioObs, { attributes: true, attributeFilter: ["class"] });
    // Si ya está visible al cargar
    if (_crmPanelInicioObs.classList.contains("visible")) _gmailComprobarEstado();
  }

  // ─── Seguimiento CRM — Fase 4B ───────────────────────────────────────────
  var _TIPO_ICON = { cliente: "🏢", lead: "🎯", proveedor: "🔧", colaborador: "🤝", otro: "📌" };
  var _INT_ICON  = { llamada: "📞", email: "✉️", reunion: "🤝", nota: "📝", whatsapp: "💬", visita: "🏢", gmail: "📧" };

  function _seguimientoDias(n) {
    if (!n || n < 0) return "nunca";
    if (n === 0) return "hoy";
    if (n === 1) return "ayer";
    if (n < 30) return n + "d";
    if (n < 365) return Math.floor(n / 30) + "m";
    return Math.floor(n / 365) + "a";
  }

  var _btnSeguimiento = document.getElementById("btn-seguimiento-consultar");
  if (_btnSeguimiento) {
    _btnSeguimiento.addEventListener("click", function () {
      var dias = parseInt(document.getElementById("crm-seguimiento-dias").value) || 30;
      var resultadoEl = document.getElementById("crm-seguimiento-resultado");
      var listaEl = document.getElementById("crm-seguimiento-lista");
      _btnSeguimiento.disabled = true;
      _btnSeguimiento.textContent = "⏳ Consultando…";
      fetch("/api/crm/seguimiento/empresas-frias?dias=" + dias + "&excluir=proveedor&limit=50")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          _btnSeguimiento.disabled = false;
          _btnSeguimiento.textContent = "Ver empresas frías";
          var empresas = data.empresas || [];
          if (resultadoEl) resultadoEl.style.display = "block";
          if (!listaEl) return;
          if (empresas.length === 0) {
            listaEl.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.85rem;padding:8px 0;">✅ Todas las empresas tienen actividad en los últimos ' + dias + ' días.</p>';
            return;
          }
          var header = '<div style="font-size:0.8rem;font-weight:600;color:var(--color-text-secondary);margin-bottom:6px;">' +
            data.total + ' empresa' + (data.total !== 1 ? "s" : "") + ' sin actividad > ' + dias + ' días</div>';
          var rows = empresas.map(function (e) {
            var icon = _TIPO_ICON[e.tipo] || "📌";
            var ult = _INT_ICON[e.ultima_interaccion_tipo] || "❓";
            var dias_str = _seguimientoDias(e.dias_sin_actividad);
            return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border,#E2E8F0);cursor:pointer;" ' +
              'onclick="window.navegarAEmpresaCRM(' + e.id + ')" title="Ir a la ficha de ' + _esc(e.nombre) + '">' +
              '<span>' + icon + '</span>' +
              '<span style="flex:1;font-size:0.85rem;font-weight:500;color:var(--color-text);">' + _esc(e.nombre) + '</span>' +
              '<span style="font-size:0.78rem;color:var(--color-text-secondary);">' + ult + ' ' + dias_str + '</span>' +
              '</div>';
          }).join("");
          listaEl.innerHTML = header + rows;
        })
        .catch(function () {
          _btnSeguimiento.disabled = false;
          _btnSeguimiento.textContent = "Ver empresas frías";
          if (listaEl) listaEl.innerHTML = '<p style="color:#dc2626;font-size:0.85rem;">Error al consultar.</p>';
        });
    });
  }

  // ─── Navegación desde otros módulos → Empresa CRM (Fase 1) ───────────────
  window.navegarAEmpresaCRM = function (empresaId) {
    // Navega al panel CRM empresas y selecciona la empresa indicada
    if (typeof activarSubpanel === "function") {
      activarSubpanel("crm", "empresas");
    } else {
      // fallback: activar módulo CRM manualmente
      var navCRM = document.getElementById("nav-crm-modulo");
      if (navCRM) navCRM.click();
      var navEmpresas = document.getElementById("nav-crm-empresas");
      if (navEmpresas) setTimeout(function () { navEmpresas.click(); }, 150);
    }
    setTimeout(function () {
      if (typeof _crmCargarEmpresas === "function") _crmCargarEmpresas();
      setTimeout(function () {
        if (typeof _crmSeleccionarEmpresa === "function") {
          _crmSeleccionarEmpresa(empresaId);
        }
        // Scroll al detalle
        var det = document.getElementById("crm-empresa-detalle");
        if (det) det.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 400);
    }, 300);
  };
})();
