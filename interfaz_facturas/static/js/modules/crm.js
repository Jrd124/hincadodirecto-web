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
    fetch("/api/crm/empresas?activo=1&limit=2000")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var emps = d.empresas || [];
        var selects = [
          contFiltroEmpEl,
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
    var targetEmpId = String(c ? (c.empresa_vinculada_id || "") : (_crmEmpresaSeleccionada || ""));
    fetch("/api/crm/empresas?activo=1&limit=2000")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var emps = d.empresas || [];
        var found = emps.find(function (e) { return String(e.id) === targetEmpId; });
        var txt = document.getElementById("crm-cont-empresa-txt");
        var hid = document.getElementById("crm-cont-empresa");
        var dd  = document.getElementById("crm-cont-empresa-dropdown");
        txt.value = found ? found.nombre : "";
        hid.value = targetEmpId;
        _opRenderDropdown(txt, hid, dd, emps, targetEmpId, function (id, nombre) {
          document.getElementById("crm-cont-empresa").value = id;
          document.getElementById("crm-cont-empresa-txt").value = nombre;
          dd.style.display = "none";
        });
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
          // Badge de fuente: gmail importado automáticamente
          var srcBadge = "";
          if (i.source === "gmail") {
            srcBadge = '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.7rem;font-weight:600;'
              + 'background:#fce8e6;color:#ea4335;border:1px solid #f5c6c2;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle;">'
              + '📧 Gmail</span>';
          } else if (i.source && i.source !== "manual") {
            srcBadge = '<span style="font-size:0.7rem;font-weight:600;background:#f1f5f9;color:#64748b;'
              + 'border:1px solid #e2e8f0;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle;">'
              + _esc(i.source) + '</span>';
          }
          return '<div class="crm-tl-card" data-int-id="' + i.id + '">' +
            '<div class="crm-tl-icon crm-tl-icon-' + _esc(i.tipo) + '">' + icon + '</div>' +
            '<div class="crm-tl-body">' +
              '<div class="crm-tl-asunto">' + _esc(i.asunto || "(Sin asunto)") + srcBadge + seg + '</div>' +
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
  // oportunidad_id "pendiente" para adjuntar al crear/editar. Se resetea al abrir/cerrar modal.
  var _intOportunidadIdPending = null;

  function _intAbrirModal(i, defaults) {
    var def = defaults || {};
    // Prioridad: interaccion existente > defaults explicitos > null
    _intOportunidadIdPending = (i && i.oportunidad_id) ? i.oportunidad_id
      : (def.oportunidad_id || null);
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
    fetch("/api/crm/empresas?activo=1&limit=2000")
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

  function _intCerrarModal() { intModalEl.classList.remove("visible"); intModalEl.setAttribute("aria-hidden", "true"); _intOportunidadIdPending = null; }
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
      oportunidad_id: _intOportunidadIdPending || null,
    };
    var url = id ? "/api/crm/interacciones/" + id : "/api/crm/interacciones";
    var method = id ? "PUT" : "POST";
    fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { mostrarToast(res.data.error || "Error", "error"); return; }
        var opIdAdjunto = _intOportunidadIdPending;
        _intCerrarModal();
        _crmCargarInteracciones();
        if (_contSeleccionado) _contSeleccionar(_contSeleccionado);
        if (_crmEmpresaSeleccionada) _crmSeleccionarEmpresa(_crmEmpresaSeleccionada);
        // Si el modal de oportunidad esta abierto y la interaccion iba vinculada, refrescar su timeline
        if (opIdAdjunto && opModalEl.classList.contains("visible")) {
          _opCargarInteraccionesModal(opIdAdjunto);
        }
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
  var opBoardEl      = document.getElementById("op-kanban-board");
  var opListaEl      = document.getElementById("op-lista-view");
  var opAnaliticaEl  = document.getElementById("op-analitica-view");
  var opMotorFiltros = document.getElementById("op-motor-filtros");
  var opModalEl      = document.getElementById("modal-crm-oportunidad");
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
        if (opAnaliticaEl && opAnaliticaEl.style.display !== "none") {
          _opRenderAnalitica();
        } else if (opListaEl && opListaEl.style.display !== "none") {
          _opRenderLista();
        } else {
          _opRenderKanban();
        }
      });
  };

  function _opRenderKanban() {
    // ── Bloque 4: motor filters ──────────────────────────────────────────
    var _mfRiesgo     = (document.getElementById("op-filtro-riesgo")     || {}).value || "";
    var _mfVencidas   = !!((document.getElementById("op-filtro-vencidas") || {}).checked);
    var _mfSinProx    = !!((document.getElementById("op-filtro-sin-proxima") || {}).checked);
    var _mfHoy        = new Date().toISOString().substring(0, 10);

    var byEstado = {};
    _opEstados.forEach(function (e) { byEstado[e.key] = []; });
    _opData.forEach(function (o) {
      if (_mfRiesgo && (o.riesgo || "sin_clasificar") !== _mfRiesgo) return;
      if (_mfVencidas && (!o.next_action_date || o.next_action_date.substring(0, 10) >= _mfHoy)) return;
      if (_mfSinProx && o.next_action_date) return;
      if (byEstado[o.estado]) byEstado[o.estado].push(o);
    });

    // Fase 3: para detectar "próxima acción vencida" en el render.
    var _hoyISO = new Date().toISOString().substring(0, 10);

    opBoardEl.innerHTML = _opEstados.map(function (est) {
      var ops = byEstado[est.key] || [];
      var total = ops.reduce(function (s, o) { return s + (o.importe_estimado || 0); }, 0);
      var cards = ops.map(function (o) {
        var prob = o.probabilidad || 0;
        // ── Fase 3: indicadores del motor ─────────────────────────────────
        // Riesgo: se pinta como stripe izquierdo del card vía clase CSS.
        // 'sin_clasificar' y null/undefined → sin stripe (comportamiento
        // idéntico a antes de Fase 3).
        var riesgoClass = (o.riesgo && o.riesgo !== 'sin_clasificar')
          ? ' riesgo-' + o.riesgo : '';
        // Meta row con "Nd sin contacto" + "⚠ vencida" si procede.
        // Si no hay datos del motor, la fila no se renderiza.
        var motorBits = '';
        if (typeof o.dias_sin_contacto === 'number' && o.dias_sin_contacto >= 0) {
          motorBits += '<span class="kanban-card-dias" title="Días desde la última interacción">'
            + o.dias_sin_contacto + 'd sin contacto</span>';
        }
        // La columna real del motor es 'next_action_date' (no 'proxima_accion_fecha').
        if (o.next_action_date && o.next_action_date.substring(0, 10) < _hoyISO) {
          motorBits += '<span class="kanban-card-accion-vencida" title="Próxima acción vencida: '
            + _esc(o.next_action_date.substring(0, 10)) + '">⚠ vencida</span>';
        }
        var motorRow = motorBits
          ? '<div class="kanban-card-motor-row">' + motorBits + '</div>'
          : '';
        return '<div class="kanban-card' + riesgoClass + '" draggable="true" data-op-id="' + o.id + '">' +
          '<div class="kanban-card-name">' + _esc(o.nombre) + '</div>' +
          '<div class="kanban-card-empresa">' + _esc(o.nombre_empresa || "") + '</div>' +
          (o.importe_estimado ? '<div class="kanban-card-importe">' + _fmtEur(o.importe_estimado) + '</div>' : '') +
          '<div class="kanban-card-row">' +
            '<div class="kanban-card-prob"><div class="kanban-card-prob-fill" style="width:' + prob + '%"></div></div>' +
            '<span class="kanban-card-prob-text">' + prob + '%</span>' +
          '</div>' +
          (o.fecha_estimada_cierre ? '<div class="kanban-card-fecha">' + _esc(o.fecha_estimada_cierre.substring(0, 10)) + '</div>' : '') +
          motorRow +
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

  // View toggle — helper para limpiar estado de todos los botones/vistas
  function _opActivarVista(vista) {
    // vista: "kanban" | "lista" | "analitica"
    opBoardEl.style.display      = vista === "kanban"    ? "" : "none";
    opListaEl.style.display      = vista === "lista"     ? "" : "none";
    opAnaliticaEl.style.display  = vista === "analitica" ? "" : "none";
    // Motor filtros: ocultos en analítica (muestra el pipeline completo)
    if (opMotorFiltros) opMotorFiltros.style.display = vista === "analitica" ? "none" : "";
    ["op-view-kanban", "op-view-lista", "op-view-analitica"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove("active");
    });
    var activeBtn = document.getElementById("op-view-" + vista);
    if (activeBtn) activeBtn.classList.add("active");
    if (vista === "lista")     _opRenderLista();
    if (vista === "analitica") _opRenderAnalitica();
  }

  document.getElementById("op-view-kanban").addEventListener("click", function () { _opActivarVista("kanban"); });
  document.getElementById("op-view-lista").addEventListener("click",   function () { _opActivarVista("lista"); });
  document.getElementById("op-view-analitica").addEventListener("click", function () { _opActivarVista("analitica"); });

  function _opRenderLista() {
    var estado   = document.getElementById("op-filtro-estado").value;
    var empId    = document.getElementById("op-filtro-empresa").value;
    var q        = (document.getElementById("op-filtro-buscar").value || "").trim().toLowerCase();
    // ── Bloque 4: motor filters ──────────────────────────────────────────
    var mfRiesgo    = (document.getElementById("op-filtro-riesgo")     || {}).value || "";
    var mfVencidas  = !!((document.getElementById("op-filtro-vencidas")    || {}).checked);
    var mfSinProx   = !!((document.getElementById("op-filtro-sin-proxima") || {}).checked);
    var mfOrdenar   = (document.getElementById("op-filtro-ordenar")    || {}).value || "";
    var mfHoy       = new Date().toISOString().substring(0, 10);

    var filtered = _opData.filter(function (o) {
      if (estado && o.estado !== estado) return false;
      if (empId && String(o.empresa_id) !== empId) return false;
      if (q && (o.nombre || "").toLowerCase().indexOf(q) < 0) return false;
      if (mfRiesgo && (o.riesgo || "sin_clasificar") !== mfRiesgo) return false;
      if (mfVencidas && (!o.next_action_date || o.next_action_date.substring(0, 10) >= mfHoy)) return false;
      if (mfSinProx && o.next_action_date) return false;
      return true;
    });

    // Ordenar
    if (mfOrdenar === "motor") {
      filtered.sort(function (a, b) { return (b.priority_score || 0) - (a.priority_score || 0); });
    } else if (mfOrdenar === "importe") {
      filtered.sort(function (a, b) { return (b.importe_estimado || 0) - (a.importe_estimado || 0); });
    } else if (mfOrdenar === "cierre") {
      filtered.sort(function (a, b) {
        if (!a.fecha_estimada_cierre && !b.fecha_estimada_cierre) return 0;
        if (!a.fecha_estimada_cierre) return 1;
        if (!b.fecha_estimada_cierre) return -1;
        return a.fecha_estimada_cierre.localeCompare(b.fecha_estimada_cierre);
      });
    }

    var container = document.getElementById("op-tabla-container");
    if (!filtered.length) {
      container.innerHTML = '<p class="crm-placeholder">Sin oportunidades con los filtros actuales.</p>';
      return;
    }

    var html = '<table class="tabla-facturas"><thead><tr>'
      + '<th>Nombre</th><th>Empresa</th><th>Estado</th>'
      + '<th>Riesgo</th><th style="text-align:right;">Prio.</th>'
      + '<th style="text-align:right;">Días sin contacto</th>'
      + '<th>Próx. acción</th>'
      + '<th style="text-align:right;">Importe</th><th style="text-align:right;">Prob.</th>'
      + '<th>Cierre</th>'
      + '</tr></thead><tbody>';

    filtered.forEach(function (o) {
      // Riesgo dot
      var rColor = o.riesgo === 'rojo' ? '#ef4444' : o.riesgo === 'ambar' ? '#f59e0b' : o.riesgo === 'verde' ? '#22c55e' : null;
      var riesgoCell = rColor
        ? '<span style="display:inline-flex;align-items:center;gap:4px;">'
          + '<span style="width:8px;height:8px;border-radius:50%;background:' + rColor + ';flex-shrink:0;"></span>'
          + '<span style="font-size:0.78rem;">' + _esc(o.riesgo) + '</span></span>'
        : '<span style="color:#cbd5e1;font-size:0.78rem;">—</span>';

      // Priority score chip
      var prioCell = (o.priority_score != null)
        ? '<span style="font-size:0.75rem;font-weight:700;color:#4f46e5;">' + o.priority_score + '</span>'
        : '<span style="color:#cbd5e1;font-size:0.78rem;">—</span>';

      // Días sin contacto
      var diasCell = (typeof o.dias_sin_contacto === 'number')
        ? '<span style="font-size:0.82rem;">' + o.dias_sin_contacto + 'd</span>'
        : '<span style="color:#cbd5e1;font-size:0.78rem;">—</span>';

      // Próxima acción: label + fecha (roja si vencida)
      var naCell = '<span style="color:#cbd5e1;font-size:0.78rem;">—</span>';
      if (o.next_action_type) {
        var naLabel = _NEXT_ACTION_LABEL[o.next_action_type] || o.next_action_type;
        var naFecha = o.next_action_date ? o.next_action_date.substring(0, 10) : "";
        var naVencida = naFecha && naFecha < mfHoy;
        naCell = '<span style="font-size:0.8rem;">' + _esc(naLabel) + '</span>'
          + (naFecha ? '<br><span style="font-size:0.73rem;color:' + (naVencida ? '#ef4444' : '#64748b') + ';">'
            + naFecha + (naVencida ? ' ⚠' : '') + '</span>' : '');
      }

      html += '<tr style="cursor:pointer;" data-op-id="' + o.id + '">'
        + '<td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(o.nombre) + '</td>'
        + '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(o.nombre_empresa || "") + '</td>'
        + '<td><span class="status-badge status-badge--' + _esc(o.estado) + '">' + _esc(o.estado) + '</span></td>'
        + '<td>' + riesgoCell + '</td>'
        + '<td class="numero">' + prioCell + '</td>'
        + '<td class="numero">' + diasCell + '</td>'
        + '<td>' + naCell + '</td>'
        + '<td class="numero">' + (o.importe_estimado ? _fmtEur(o.importe_estimado) : "") + '</td>'
        + '<td class="numero">' + (o.probabilidad || 0) + '%</td>'
        + '<td>' + _esc((o.fecha_estimada_cierre || "").substring(0, 10)) + '</td>'
        + '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
    container.querySelectorAll("[data-op-id]").forEach(function (tr) {
      tr.addEventListener("click", function () { _opEditarById(parseInt(tr.getAttribute("data-op-id"))); });
    });
  }

  // ── Bloque 4: Panel de Analítica de Pipeline ─────────────────────────────
  function _opRenderAnalitica() {
    var hoy = new Date().toISOString().substring(0, 10);
    var _ESTADOS_ABIERTOS = ["lead", "contacto_inicial", "cotizacion_enviada", "negociacion", "aplazada"];
    var abiertas = _opData.filter(function (o) { return _ESTADOS_ABIERTOS.indexOf(o.estado) >= 0; });
    var ganadas  = _opData.filter(function (o) { return o.estado === "ganada"; });
    var perdidas = _opData.filter(function (o) { return o.estado === "perdida"; });

    var totalImporte = abiertas.reduce(function (s, o) { return s + (o.importe_estimado || 0); }, 0);
    var valorMedio   = abiertas.length ? totalImporte / abiertas.length : 0;
    var cerradas     = ganadas.length + perdidas.length;
    var pctConv      = cerradas > 0 ? Math.round(ganadas.length / cerradas * 100) : null;

    // ── KPIs ──────────────────────────────────────────────────────────────
    var kpiEl = document.getElementById("op-kpi-row");
    if (kpiEl) {
      var kpis = [
        { label: "Pipeline abierto", value: abiertas.length + " ops",         sub: "oportunidades activas",     color: "#4f46e5" },
        { label: "Importe pipeline", value: _fmtEur(totalImporte) || "0 €",  sub: "valor estimado total",      color: "#0891b2" },
        { label: "Valor medio",      value: _fmtEur(valorMedio) || "0 €",    sub: "por oportunidad",           color: "#059669" },
        { label: "Ganadas",          value: ganadas.length,                   sub: pctConv != null ? pctConv + "% conversión" : "cerradas ganadas", color: "#16a34a" },
        { label: "Perdidas",         value: perdidas.length,                  sub: "oportunidades perdidas",    color: "#dc2626" },
      ];
      kpiEl.innerHTML = kpis.map(function (k) {
        return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;">'
          + '<div style="font-size:0.72rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">' + k.label + '</div>'
          + '<div style="font-size:1.45rem;font-weight:800;color:' + k.color + ';line-height:1.2;">' + k.value + '</div>'
          + '<div style="font-size:0.72rem;color:#94a3b8;margin-top:3px;">' + k.sub + '</div>'
          + '</div>';
      }).join("");
    }

    // ── Embudo por etapa ──────────────────────────────────────────────────
    var etapaLabels = {
      lead: "Lead", contacto_inicial: "Contacto inicial",
      cotizacion_enviada: "Cotización enviada", negociacion: "Negociación", aplazada: "Aplazada",
    };
    var etapaData = _ESTADOS_ABIERTOS.map(function (e) {
      var ops = _opData.filter(function (o) { return o.estado === e; });
      return {
        key: e, label: etapaLabels[e] || e,
        count: ops.length,
        importe: ops.reduce(function (s, o) { return s + (o.importe_estimado || 0); }, 0),
      };
    });
    var maxImporte = Math.max.apply(null, etapaData.map(function (e) { return e.importe; })) || 1;
    var funnelEl = document.getElementById("op-funnel-bars");
    if (funnelEl) {
      funnelEl.innerHTML = etapaData.map(function (e) {
        var pct = Math.round(e.importe / maxImporte * 100);
        var importeStr = e.importe ? _fmtEur(e.importe) : "0 €";
        return '<div style="margin-bottom:14px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">'
          + '<span style="font-size:0.82rem;font-weight:600;color:#374151;">' + _esc(e.label) + '</span>'
          + '<span style="font-size:0.78rem;color:#64748b;">' + e.count + ' · ' + importeStr + '</span>'
          + '</div>'
          + '<div style="height:10px;background:#f1f5f9;border-radius:5px;overflow:hidden;">'
          + '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#4f46e5,#818cf8);border-radius:5px;transition:width 0.5s;"></div>'
          + '</div>'
          + '</div>';
      }).join("") || '<p style="color:#94a3b8;font-size:0.85rem;">Sin datos.</p>';
    }

    // ── Riesgo breakdown ──────────────────────────────────────────────────
    var rCounts = { rojo: 0, ambar: 0, verde: 0, sin_clasificar: 0 };
    abiertas.forEach(function (o) {
      var r = o.riesgo || "sin_clasificar";
      if (rCounts[r] !== undefined) rCounts[r]++; else rCounts.sin_clasificar++;
    });
    var rTotal = abiertas.length || 1;
    var rCfg = [
      { key: "rojo",          label: "Rojo",           color: "#ef4444" },
      { key: "ambar",         label: "Ámbar",          color: "#f59e0b" },
      { key: "verde",         label: "Verde",          color: "#22c55e" },
      { key: "sin_clasificar",label: "Sin clasificar", color: "#cbd5e1" },
    ];
    var riesgoEl = document.getElementById("op-riesgo-breakdown");
    if (riesgoEl) {
      riesgoEl.innerHTML = rCfg.map(function (r) {
        var cnt = rCounts[r.key] || 0;
        var pct = Math.round(cnt / rTotal * 100);
        return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">'
          + '<span style="width:10px;height:10px;border-radius:50%;background:' + r.color + ';flex-shrink:0;display:inline-block;"></span>'
          + '<span style="font-size:0.82rem;color:#374151;flex:1;min-width:0;">' + r.label + '</span>'
          + '<div style="width:100px;height:7px;background:#f1f5f9;border-radius:4px;overflow:hidden;flex-shrink:0;">'
          + '<div style="height:100%;width:' + pct + '%;background:' + r.color + ';border-radius:4px;transition:width 0.4s;"></div>'
          + '</div>'
          + '<span style="font-size:0.78rem;color:#64748b;width:26px;text-align:right;flex-shrink:0;">' + cnt + '</span>'
          + '</div>';
      }).join("");
    }

    // ── Top 5 por priority_score ──────────────────────────────────────────
    var top5 = abiertas
      .filter(function (o) { return o.priority_score != null; })
      .sort(function (a, b) { return (b.priority_score || 0) - (a.priority_score || 0); })
      .slice(0, 5);
    var topEl = document.getElementById("op-top-prioridad");
    if (!topEl) return;
    if (!top5.length) {
      topEl.innerHTML = '<p style="color:#94a3b8;font-size:0.85rem;">Sin datos de motor. Registra interacciones comerciales (llamada, email, reunión) para activar el motor de seguimiento.</p>';
      return;
    }
    var _rDot = function (r) {
      var c = r === "rojo" ? "#ef4444" : r === "ambar" ? "#f59e0b" : r === "verde" ? "#22c55e" : "#e2e8f0";
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + c + ';vertical-align:middle;margin-right:3px;"></span>';
    };
    var topHtml = '<table class="tabla-facturas" style="font-size:0.82rem;">'
      + '<thead><tr><th>#</th><th>Oportunidad</th><th>Empresa</th>'
      + '<th style="text-align:right;">Prio.</th><th>Riesgo</th>'
      + '<th style="text-align:right;">Importe</th><th>Próx. acción</th></tr></thead><tbody>';
    top5.forEach(function (o, i) {
      var naLabel = o.next_action_type ? (_NEXT_ACTION_LABEL[o.next_action_type] || o.next_action_type) : "—";
      var naFecha = o.next_action_date ? o.next_action_date.substring(0, 10) : "";
      var naVenc  = naFecha && naFecha < hoy;
      topHtml += '<tr style="cursor:pointer;" data-op-id="' + o.id + '">'
        + '<td style="color:#94a3b8;font-size:0.75rem;width:28px;">' + (i + 1) + '</td>'
        + '<td style="font-weight:600;">' + _esc(o.nombre) + '</td>'
        + '<td>' + _esc(o.nombre_empresa || "") + '</td>'
        + '<td class="numero" style="font-weight:800;color:#4f46e5;">' + o.priority_score + '</td>'
        + '<td>' + _rDot(o.riesgo || "sin_clasificar") + '<span style="font-size:0.78rem;">' + _esc(o.riesgo || "—") + '</span></td>'
        + '<td class="numero">' + (o.importe_estimado ? _fmtEur(o.importe_estimado) : "—") + '</td>'
        + '<td>' + _esc(naLabel) + (naFecha
            ? ' <span style="font-size:0.72rem;color:' + (naVenc ? "#ef4444" : "#94a3b8") + ';">'
              + naFecha + (naVenc ? " ⚠" : "") + "</span>"
            : "") + '</td>'
        + '</tr>';
    });
    topHtml += '</tbody></table>';
    topEl.innerHTML = topHtml;
    topEl.querySelectorAll("[data-op-id]").forEach(function (tr) {
      tr.addEventListener("click", function () { _opEditarById(parseInt(tr.getAttribute("data-op-id"))); });
    });
  }

  ["op-filtro-estado", "op-filtro-empresa", "op-filtro-ordenar"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", _opRenderLista);
  });
  // Motor filters: actúan sobre ambas vistas (kanban visible o lista visible).
  function _opMotorFiltroChange() {
    if (opBoardEl.style.display !== "none") _opRenderKanban();
    else _opRenderLista();
  }
  ["op-filtro-riesgo"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", _opMotorFiltroChange);
  });
  ["op-filtro-vencidas", "op-filtro-sin-proxima"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", _opMotorFiltroChange);
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
    fetch("/api/crm/empresas?activo=1&limit=2000")
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

    // Timeline de interacciones: solo en modo edicion (hay id)
    var intWrap = document.getElementById("crm-op-interacciones-wrap");
    if (o && o.id) {
      intWrap.style.display = "";
      _opCargarInteraccionesModal(o.id);
    } else {
      intWrap.style.display = "none";
      var listaEl = document.getElementById("crm-op-interacciones-lista");
      if (listaEl) listaEl.innerHTML = "";
      var cntEl = document.getElementById("crm-op-interacciones-count");
      if (cntEl) cntEl.textContent = "";
    }

    opModalEl.classList.add("visible");
    opModalEl.setAttribute("aria-hidden", "false");
  }

  // Carga y renderiza el timeline de interacciones de una oportunidad en el modal
  function _opCargarInteraccionesModal(opId) {
    var listaEl = document.getElementById("crm-op-interacciones-lista");
    var cntEl = document.getElementById("crm-op-interacciones-count");
    if (!listaEl) return;
    listaEl.innerHTML = '<p class="crm-placeholder" style="padding:12px;color:#94a3b8;font-size:0.85rem;">Cargando…</p>';
    fetch("/api/crm/interacciones?oportunidad_id=" + opId + "&limit=200")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var list = data.interacciones || [];
        if (cntEl) cntEl.textContent = "(" + (data.total || list.length) + ")";
        if (list.length === 0) {
          listaEl.innerHTML = '<p class="crm-placeholder" style="padding:12px;color:#94a3b8;font-size:0.85rem;">Sin interacciones vinculadas a esta oportunidad.</p>';
          return;
        }
        listaEl.innerHTML = list.map(function (i) {
          var icon = _tlIcons[i.tipo] || "\uD83D\uDCDD";
          var srcBadge = "";
          if (i.source === "gmail") {
            srcBadge = '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.65rem;font-weight:600;background:#fce8e6;color:#ea4335;border:1px solid #f5c6c2;border-radius:4px;padding:1px 5px;margin-left:6px;vertical-align:middle;">📧 Gmail</span>';
          }
          return '<div class="crm-tl-card" data-op-int-id="' + i.id + '" style="cursor:pointer;">' +
            '<div class="crm-tl-icon crm-tl-icon-' + _esc(i.tipo) + '">' + icon + '</div>' +
            '<div class="crm-tl-body">' +
              '<div class="crm-tl-asunto">' + _esc(i.asunto || "(Sin asunto)") + srcBadge + '</div>' +
              '<div class="crm-tl-meta">' + _esc(i.nombre_contacto ? (i.nombre_contacto + ' ' + (i.apellidos_contacto || '')) : (i.nombre_empresa || '')) + '</div>' +
              (i.descripcion ? '<div class="crm-tl-desc">' + _esc(i.descripcion) + '</div>' : '') +
            '</div>' +
            '<div class="crm-tl-fecha">' + _esc((i.fecha || "").substring(0, 10)) + '</div>' +
          '</div>';
        }).join("");
        listaEl.querySelectorAll("[data-op-int-id]").forEach(function (el) {
          el.addEventListener("click", function () {
            var intId = parseInt(el.getAttribute("data-op-int-id"));
            if (window._intAbrirModalEditar) _intAbrirModalEditar(intId);
          });
        });
      })
      .catch(function () {
        listaEl.innerHTML = '<p class="crm-placeholder" style="padding:12px;color:#b91c1c;font-size:0.85rem;">Error al cargar interacciones.</p>';
      });
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
      document.getElementById("crm-op-empresa").value = id;
      document.getElementById("crm-op-empresa-txt").value = nombre;
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
      return '<div class="crm-ac-item" data-id="' + id + '" data-label="' + _esc(label) + '" style="padding:7px 12px;cursor:pointer;font-size:0.88rem;display:flex;align-items:center;' +
        (String(id) === String(hid.value) ? 'background:#EFF6FF;font-weight:600;' : '') + '">' +
        _esc(label) + extra + '</div>';
    }).join("");
    dd.style.display = "block";
    dd.querySelectorAll(".crm-ac-item").forEach(function (el) {
      el.addEventListener("mousedown", function (e) {
        e.preventDefault();
        onSelect(el.getAttribute("data-id"), el.getAttribute("data-label") || "");
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
          document.getElementById("crm-op-contacto").value = id;
          document.getElementById("crm-op-contacto-txt").value = nombre;
          dd.style.display = "none";
        });
      });
  }

  function _opCerrarModal() { opModalEl.classList.remove("visible"); opModalEl.setAttribute("aria-hidden", "true"); }
  document.getElementById("btn-nueva-oportunidad-crm").addEventListener("click", function () { _opAbrirModal(null); });
  document.getElementById("btn-cancelar-crm-oportunidad").addEventListener("click", _opCerrarModal);
  opModalEl.addEventListener("click", function (e) { if (e.target === opModalEl) _opCerrarModal(); });

  // "+ Interacción" dentro del modal oportunidad: abre modal de interacción con
  // oportunidad / empresa / contacto pre-rellenados.
  var _btnOpNuevaInt = document.getElementById("btn-crm-op-nueva-interaccion");
  if (_btnOpNuevaInt) {
    _btnOpNuevaInt.addEventListener("click", function () {
      var opId = parseInt(document.getElementById("crm-op-edit-id").value) || null;
      if (!opId) { mostrarToast("Guarda la oportunidad antes de añadir interacciones.", "info"); return; }
      var empId = document.getElementById("crm-op-empresa").value || null;
      var contId = document.getElementById("crm-op-contacto").value || null;
      _intAbrirModal(null, {
        oportunidad_id: opId,
        empresa_id: empId,
        contacto_id: contId,
      });
    });
  }

  // ── IA Sales Copilot — Fase A ────────────────────────────────────────────
  // Botón "✨ IA" en modal oportunidad: abre modal, carga contexto y permite
  // generar un borrador de email que el usuario copia/pega. NO envía nada.
  var _iaModalEl = document.getElementById("modal-crm-ia-email");
  var _iaUltimoContextPack = null;
  var _iaDisponible = null; // cache precheck

  function _iaPrecheck() {
    if (_iaDisponible !== null) return Promise.resolve(_iaDisponible);
    return fetch("/api/crm/ia/email/status")
      .then(function (r) { return r.json(); })
      .then(function (d) { _iaDisponible = !!d.disponible; return _iaDisponible; })
      .catch(function () { _iaDisponible = false; return false; });
  }

  function _iaAbrirModal() {
    if (!_iaModalEl) return;
    var opId = parseInt(document.getElementById("crm-op-edit-id").value) || null;
    if (!opId) {
      mostrarToast("Guarda la oportunidad antes de generar un email.", "info");
      return;
    }
    document.getElementById("crm-ia-oportunidad-id").value = opId;
    // Reset preview
    var previewWrap = document.getElementById("crm-ia-preview-wrap");
    if (previewWrap) previewWrap.style.display = "none";
    document.getElementById("crm-ia-subject").value = "";
    document.getElementById("crm-ia-body").value = "";
    document.getElementById("crm-ia-instrucciones").value = "";
    document.getElementById("crm-ia-copiado").style.display = "none";
    document.getElementById("crm-ia-contexto-linea").textContent = "Cargando contexto…";
    document.getElementById("crm-ia-contexto-motor").textContent = "";
    var hiloSel = document.getElementById("crm-ia-hilo");
    hiloSel.innerHTML = '<option value="">— Ninguno —</option>';

    _iaModalEl.classList.add("visible");
    _iaModalEl.setAttribute("aria-hidden", "false");

    // Precheck IA
    _iaPrecheck().then(function (ok) {
      var btn = document.getElementById("btn-crm-ia-generar");
      if (!ok) {
        btn.disabled = true;
        btn.textContent = "IA no disponible";
        mostrarToast("El asistente IA no está configurado (falta OpenAI).", "error");
      } else {
        btn.disabled = false;
        btn.textContent = "Generar borrador";
      }
    });

    // Carga context pack para mostrar resumen + poblar hilos
    fetch("/api/crm/ia/email/contexto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oportunidad_id: opId }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          document.getElementById("crm-ia-contexto-linea").textContent =
            "Error cargando contexto: " + (res.data.error || "desconocido");
          return;
        }
        var cp = res.data.context_pack || {};
        _iaUltimoContextPack = cp;
        var op = cp.oportunidad || {};
        var ec = cp.empresa_contacto || {};
        var mo = cp.motor || {};
        var linea =
          "<strong>" + _esc(op.nombre || "Oportunidad") + "</strong>" +
          " · " + _esc(ec.empresa_nombre || "—") +
          (ec.contacto_nombre ? " · " + _esc(ec.contacto_nombre) : "") +
          (op.importe_estimado ? " · " + _esc(op.importe_estimado) : "") +
          " · <em>" + _esc(op.estado || "") + "</em>";
        document.getElementById("crm-ia-contexto-linea").innerHTML = linea;

        var motorBits = [];
        if (mo.riesgo) motorBits.push("Riesgo: " + _esc(mo.riesgo));
        if (mo.dias_sin_contacto != null) motorBits.push(mo.dias_sin_contacto + " días sin contacto");
        if (mo.ultima_interaccion_fecha) motorBits.push("Último: " + _esc(mo.ultima_interaccion_fecha));
        if (mo.estado_respuesta) motorBits.push(_esc(mo.estado_respuesta));
        motorBits.push("~" + (res.data.estimacion_tokens || 0) + " tokens contexto");
        document.getElementById("crm-ia-contexto-motor").textContent = motorBits.join(" · ");

        // Popular hilos: buscamos interacciones con gmail_thread_id en la timeline
        // (el context pack no las expone por thread_id; recargamos desde endpoint)
        fetch("/api/crm/interacciones?oportunidad_id=" + opId + "&limit=50")
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var list = (d.interacciones || []).filter(function (i) {
              return i.gmail_thread_id;
            });
            if (list.length > 0) {
              list.forEach(function (i) {
                var opt = document.createElement("option");
                opt.value = i.gmail_thread_id;
                var fecha = (i.fecha || "").substring(0, 10);
                opt.textContent = fecha + " — " + (i.asunto || "(sin asunto)").substring(0, 70);
                hiloSel.appendChild(opt);
              });
            }
          })
          .catch(function () {});
      })
      .catch(function () {
        document.getElementById("crm-ia-contexto-linea").textContent = "Error cargando contexto.";
      });
  }

  function _iaCerrarModal() {
    if (!_iaModalEl) return;
    _iaModalEl.classList.remove("visible");
    _iaModalEl.setAttribute("aria-hidden", "true");
  }

  // Estado interno del último draft generado (para Fase B aprobar-en-gmail)
  var _iaUltimoDraft = null;

  function _iaPintarBorrador(d) {
    _iaUltimoDraft = d || null;
    var previewWrap = document.getElementById("crm-ia-preview-wrap");
    previewWrap.style.display = "";
    document.getElementById("crm-ia-subject").value = d.subject || "";
    document.getElementById("crm-ia-body").value = d.body || "";
    // Reset banner de aprobación al regenerar
    var apr = document.getElementById("crm-ia-aprobado");
    if (apr) { apr.style.display = "none"; apr.innerHTML = ""; }
    var sig = d.siguiente_accion_sugerida ? ("→ Siguiente acción: " + d.siguiente_accion_sugerida) : "";
    document.getElementById("crm-ia-siguiente").textContent = sig;
    var conf = d.confianza;
    var confTxt = "";
    if (typeof conf === "number") confTxt = "Confianza IA: " + Math.round(conf * 100) + "%";
    document.getElementById("crm-ia-confianza").textContent = confTxt;
    var huecos = d.huecos_detectados || [];
    var huecosEl = document.getElementById("crm-ia-huecos");
    if (huecos.length > 0) {
      huecosEl.style.display = "";
      huecosEl.innerHTML =
        "⚠️ Huecos detectados (revisar antes de enviar):<ul style='margin:4px 0 0 18px;'>" +
        huecos.map(function (h) { return "<li>" + _esc(String(h)) + "</li>"; }).join("") +
        "</ul>";
    } else {
      huecosEl.style.display = "none";
      huecosEl.innerHTML = "";
    }
    var meta = [];
    if (d.id) meta.push("Draft #" + d.id);
    if (d.model) meta.push(d.model);
    if (d.tokens_in != null) meta.push(d.tokens_in + " in / " + (d.tokens_out || 0) + " out");
    document.getElementById("crm-ia-meta").textContent = meta.join(" · ");
    document.getElementById("crm-ia-copiado").style.display = "none";
  }

  function _iaGenerar() {
    var opId = parseInt(document.getElementById("crm-ia-oportunidad-id").value) || null;
    if (!opId) return;
    var body = {
      oportunidad_id: opId,
      objetivo: document.getElementById("crm-ia-objetivo").value,
      tono: document.getElementById("crm-ia-tono").value,
      instrucciones: document.getElementById("crm-ia-instrucciones").value || null,
      hilo_referencia_id: document.getElementById("crm-ia-hilo").value || null,
    };
    var btn = document.getElementById("btn-crm-ia-generar");
    var textoOrig = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generando…";
    fetch("/api/crm/ia/email/borrador", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        btn.textContent = textoOrig;
        if (!res.ok) {
          mostrarToast("Error IA: " + (res.data.error || res.status), "error");
          return;
        }
        _iaPintarBorrador(res.data);
        mostrarToast("Borrador generado.", "success");
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = textoOrig;
        mostrarToast("Error de conexión con el servidor IA.", "error");
      });
  }

  function _iaCopiarTexto(texto) {
    if (!texto) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).then(function () { return true; }).catch(function () { return false; });
    }
    // Fallback
    try {
      var ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed"; ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return Promise.resolve(true);
    } catch (e) { return Promise.resolve(false); }
  }

  function _iaMostrarCopiado(msg) {
    var el = document.getElementById("crm-ia-copiado");
    el.textContent = "✓ " + (msg || "Copiado al portapapeles");
    el.style.display = "";
    setTimeout(function () { el.style.display = "none"; }, 2200);
  }

  // Wire up IA modal
  var _btnOpIa = document.getElementById("btn-crm-op-ia-email");
  if (_btnOpIa) _btnOpIa.addEventListener("click", _iaAbrirModal);
  var _btnIaCerrar = document.getElementById("btn-crm-ia-cerrar");
  if (_btnIaCerrar) _btnIaCerrar.addEventListener("click", _iaCerrarModal);
  var _btnIaCerrar2 = document.getElementById("btn-crm-ia-cerrar-2");
  if (_btnIaCerrar2) _btnIaCerrar2.addEventListener("click", _iaCerrarModal);
  if (_iaModalEl) {
    _iaModalEl.addEventListener("click", function (e) {
      if (e.target === _iaModalEl) _iaCerrarModal();
    });
  }
  var _formIa = document.getElementById("form-crm-ia-email");
  if (_formIa) _formIa.addEventListener("submit", function (e) { e.preventDefault(); _iaGenerar(); });
  var _btnIaRegen = document.getElementById("btn-crm-ia-regenerar");
  if (_btnIaRegen) _btnIaRegen.addEventListener("click", _iaGenerar);
  var _btnIaCopyAll = document.getElementById("btn-crm-ia-copiar");
  if (_btnIaCopyAll) _btnIaCopyAll.addEventListener("click", function () {
    var s = document.getElementById("crm-ia-subject").value || "";
    var b = document.getElementById("crm-ia-body").value || "";
    _iaCopiarTexto("Asunto: " + s + "\n\n" + b).then(function (ok) {
      if (ok) _iaMostrarCopiado("Asunto + cuerpo copiado");
      else mostrarToast("No se pudo copiar", "error");
    });
  });
  var _btnIaCopySubj = document.getElementById("btn-crm-ia-copiar-asunto");
  if (_btnIaCopySubj) _btnIaCopySubj.addEventListener("click", function () {
    _iaCopiarTexto(document.getElementById("crm-ia-subject").value || "").then(function (ok) {
      if (ok) _iaMostrarCopiado("Asunto copiado");
      else mostrarToast("No se pudo copiar", "error");
    });
  });
  var _btnIaCopyBody = document.getElementById("btn-crm-ia-copiar-body");
  if (_btnIaCopyBody) _btnIaCopyBody.addEventListener("click", function () {
    _iaCopiarTexto(document.getElementById("crm-ia-body").value || "").then(function (ok) {
      if (ok) _iaMostrarCopiado("Cuerpo copiado");
      else mostrarToast("No se pudo copiar", "error");
    });
  });

  // ── Fase B: aprobar borrador → crear draft en Gmail ─────────────────────
  var _iaAprobarModalEl = document.getElementById("modal-crm-ia-aprobar");
  var _iaAprobarOrigenContactoSinEmail = false;

  function _iaAprobarAbrir() {
    if (!_iaUltimoDraft || !_iaUltimoDraft.id) {
      mostrarToast("Genera primero un borrador.", "info");
      return;
    }
    var dest = _iaUltimoDraft.destinatarios_sugeridos || {};
    var contactoEmail = dest.contacto_email || "";
    var empresaEmail = dest.empresa_email || "";
    var to = contactoEmail || empresaEmail || "";
    var hint = "";
    if (contactoEmail) {
      hint = "Email del contacto del CRM" +
        (dest.contacto_nombre ? " (" + _esc(dest.contacto_nombre) + ")" : "");
      _iaAprobarOrigenContactoSinEmail = false;
    } else if (empresaEmail) {
      hint = "Email genérico de la empresa" +
        (dest.empresa_nombre ? " (" + _esc(dest.empresa_nombre) + ")" : "") +
        " — el contacto no tiene email guardado";
      _iaAprobarOrigenContactoSinEmail = !!dest.contacto_id;
    } else {
      hint = "⚠ No hay email guardado en el contacto ni en la empresa. Escribe uno.";
      _iaAprobarOrigenContactoSinEmail = !!dest.contacto_id;
    }
    document.getElementById("crm-ia-aprobar-to").value = to;
    document.getElementById("crm-ia-aprobar-to-hint").innerHTML = hint;
    document.getElementById("crm-ia-aprobar-subject-preview").textContent =
      document.getElementById("crm-ia-subject").value || _iaUltimoDraft.subject || "";

    // Mostrar checkbox "guardar email al contacto" solo si vamos a teclear uno nuevo
    var guardarWrap = document.getElementById("crm-ia-aprobar-guardar-wrap");
    var guardarChk = document.getElementById("crm-ia-aprobar-guardar-contacto");
    if (_iaAprobarOrigenContactoSinEmail) {
      guardarWrap.style.display = "";
      guardarChk.checked = true;
    } else {
      guardarWrap.style.display = "none";
      guardarChk.checked = false;
    }

    var err = document.getElementById("crm-ia-aprobar-error");
    err.style.display = "none"; err.textContent = "";

    _iaAprobarModalEl.classList.add("visible");
    _iaAprobarModalEl.setAttribute("aria-hidden", "false");
    setTimeout(function () { document.getElementById("crm-ia-aprobar-to").focus(); }, 50);
  }

  function _iaAprobarCerrar() {
    if (!_iaAprobarModalEl) return;
    _iaAprobarModalEl.classList.remove("visible");
    _iaAprobarModalEl.setAttribute("aria-hidden", "true");
  }

  function _iaAprobarConfirmar() {
    if (!_iaUltimoDraft || !_iaUltimoDraft.id) return;
    var to = (document.getElementById("crm-ia-aprobar-to").value || "").trim();
    var err = document.getElementById("crm-ia-aprobar-error");
    err.style.display = "none";
    if (!to || to.indexOf("@") === -1) {
      err.textContent = "Introduce un email válido.";
      err.style.display = "";
      return;
    }
    var subject = document.getElementById("crm-ia-subject").value || "";
    var body = document.getElementById("crm-ia-body").value || "";
    var persistir = document.getElementById("crm-ia-aprobar-guardar-contacto").checked &&
                    _iaAprobarOrigenContactoSinEmail;

    var btn = document.getElementById("btn-crm-ia-aprobar-confirmar");
    var orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Creando draft…";

    fetch("/api/crm/ia/email/borrador/" + _iaUltimoDraft.id + "/aprobar-en-gmail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: to,
        subject_override: subject,
        body_override: body,
        persistir_email_contacto: persistir,
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        btn.textContent = orig;
        if (!res.ok) {
          err.textContent = "Error: " + (res.data.error || res.status);
          err.style.display = "";
          return;
        }
        _iaAprobarCerrar();
        // Mostrar banner de éxito en el modal IA
        var apr = document.getElementById("crm-ia-aprobado");
        var link = res.data.permalink || "https://mail.google.com/mail/u/0/#drafts";
        apr.innerHTML = '✅ Draft creado en Gmail. ' +
          '<a href="' + _esc(link) + '" target="_blank" rel="noopener" style="color:#059669;text-decoration:underline;">Ver en Gmail →</a>';
        apr.style.display = "";
        // Marcar el draft como aprobado para que no se vuelva a crear
        if (_iaUltimoDraft) {
          _iaUltimoDraft.estado = "aprobado_en_gmail";
          _iaUltimoDraft.gmail_draft_id = res.data.gmail_draft_id;
        }
        // Desactivar botón aprobar (idempotencia visual)
        var apBtn = document.getElementById("btn-crm-ia-aprobar-gmail");
        if (apBtn) {
          apBtn.disabled = true;
          apBtn.textContent = "✓ Draft creado en Gmail";
          apBtn.style.opacity = "0.7";
        }
        mostrarToast("Draft creado en Gmail.", "success");
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = orig;
        err.textContent = "Error de conexión.";
        err.style.display = "";
      });
  }

  var _btnIaAprobar = document.getElementById("btn-crm-ia-aprobar-gmail");
  if (_btnIaAprobar) _btnIaAprobar.addEventListener("click", _iaAprobarAbrir);
  var _btnIaAprCancel1 = document.getElementById("btn-crm-ia-aprobar-cancelar");
  if (_btnIaAprCancel1) _btnIaAprCancel1.addEventListener("click", _iaAprobarCerrar);
  var _btnIaAprCancel2 = document.getElementById("btn-crm-ia-aprobar-cancelar-2");
  if (_btnIaAprCancel2) _btnIaAprCancel2.addEventListener("click", _iaAprobarCerrar);
  var _btnIaAprConf = document.getElementById("btn-crm-ia-aprobar-confirmar");
  if (_btnIaAprConf) _btnIaAprConf.addEventListener("click", _iaAprobarConfirmar);
  if (_iaAprobarModalEl) {
    _iaAprobarModalEl.addEventListener("click", function (e) {
      if (e.target === _iaAprobarModalEl) _iaAprobarCerrar();
    });
  }

  // Cuando se regenera un borrador, hay que reactivar el botón Aprobar
  // (porque se está creando uno nuevo). Se hace al pintar.
  // Reactivación tras regenerar:
  var _origIaPintar = _iaPintarBorrador;
  _iaPintarBorrador = function (d) {
    _origIaPintar(d);
    var apBtn = document.getElementById("btn-crm-ia-aprobar-gmail");
    if (apBtn) {
      apBtn.disabled = false;
      apBtn.textContent = "📨 Crear draft en Gmail";
      apBtn.style.opacity = "1";
    }
  };

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

  // ─── Gmail Sync — Fase 3 (widget global consolidado en Bloque 5) ────────────
  // _gmailComprobarEstado() eliminado — sustituido por _crmGmailComprobarEstado()

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

  // _btnGmailGlobal y su MutationObserver eliminados — consolidados en widget Bloque 5

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

  // ─── Oportunidades de hoy (Fase 3 Bloque 4) ──────────────────────────────
  // Navegación directa a la oportunidad: reusa _opEditarById que abre el
  // modal de edición cargando por id desde /api/crm/oportunidades/:id.
  window.navegarAOportunidadCRM = function (opId) {
    // Navega al subpanel de oportunidades y después abre el modal. El submódulo
    // se encarga del fetch.
    if (typeof activarSubpanel === "function") {
      activarSubpanel("crm", "oportunidades");
    } else {
      var navCRM = document.getElementById("nav-crm-modulo");
      if (navCRM) navCRM.click();
      var navOp = document.getElementById("nav-crm-oportunidades");
      if (navOp) setTimeout(function () { navOp.click(); }, 150);
    }
    setTimeout(function () {
      if (typeof window._crmCargarOportunidades === "function") window._crmCargarOportunidades();
      setTimeout(function () { _opEditarById(opId); }, 250);
    }, 200);
  };

  // Traducción de next_action_type del motor a etiquetas legibles.
  var _NEXT_ACTION_LABEL = {
    primer_contacto:      "Primer contacto",
    perseguir_respuesta:  "Perseguir respuesta",
    recordar_presupuesto: "Recordar presupuesto",
    cerrar:               "Cerrar",
    reactivar:            "Reactivar",
    revisar_estancada:    "Revisar (estancada)",
    usuario:              "Plan del usuario",
  };

  // Iconos por riesgo (consistentes con el stripe del kanban).
  var _RIESGO_DOT = {
    verde: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;" title="Riesgo verde"></span>',
    ambar: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;" title="Riesgo ámbar"></span>',
    rojo:  '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;" title="Riesgo rojo"></span>',
  };

  function _crmRenderOportunidadesHoy(data) {
    var listaEl = document.getElementById("crm-hoy-lista");
    if (!listaEl) return;
    var ops = (data && data.oportunidades) || [];
    var total = (data && data.total) || 0;
    if (!ops.length) {
      listaEl.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.85rem;padding:8px 0;">✅ Nada que atender hoy. Todas las oportunidades abiertas están al día.</p>';
      return;
    }
    var hoyISO = new Date().toISOString().substring(0, 10);
    var header = '<div style="font-size:0.8rem;font-weight:600;color:var(--color-text-secondary);margin-bottom:6px;">' +
      total + ' oportunidad' + (total !== 1 ? "es" : "") + ' con acción vencida o para hoy</div>';
    var rows = ops.map(function (o) {
      var dot = _RIESGO_DOT[o.riesgo] || '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#cbd5e1;" title="Sin clasificar"></span>';
      var nextType = _NEXT_ACTION_LABEL[o.next_action_type] || (o.next_action_type || "");
      var fecha = (o.next_action_date || "").substring(0, 10);
      var vencida = fecha && fecha < hoyISO;
      var fechaColor = vencida ? "#ef4444" : "#64748b";
      var fechaPrefix = vencida ? "⚠ " : "";
      var score = (typeof o.priority_score === "number") ? o.priority_score : null;
      var scoreChip = (score !== null)
        ? '<span style="font-size:0.68rem;padding:1px 6px;border-radius:10px;background:#eef2ff;color:#4f46e5;font-weight:600;" title="Priority score">' + score + '</span>'
        : '';
      var importe = o.importe_estimado ? _fmtEur(o.importe_estimado) : '';
      return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border,#E2E8F0);cursor:pointer;" ' +
        'onclick="window.navegarAOportunidadCRM(' + o.id + ')" title="Abrir oportunidad">' +
        dot +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:0.87rem;font-weight:600;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            _esc(o.nombre) +
            (importe ? ' <span style="color:#94a3b8;font-weight:500;font-size:0.78rem;">· ' + importe + '</span>' : '') +
          '</div>' +
          '<div style="font-size:0.74rem;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            _esc(o.nombre_empresa || "") + (nextType ? ' · ' + _esc(nextType) : '') +
          '</div>' +
        '</div>' +
        (fecha ? '<span style="font-size:0.75rem;color:' + fechaColor + ';font-weight:' + (vencida ? '600' : '500') + ';white-space:nowrap;">' + fechaPrefix + fecha + '</span>' : '') +
        scoreChip +
      '</div>';
    }).join("");
    listaEl.innerHTML = header + rows;
  }

  function _crmCargarOportunidadesHoy() {
    var listaEl = document.getElementById("crm-hoy-lista");
    var btn = document.getElementById("btn-crm-hoy-refrescar");
    var incluirVerdes = document.getElementById("crm-hoy-incluir-verdes");
    if (!listaEl) return;
    var qs = "?limit=50";
    if (incluirVerdes && incluirVerdes.checked) qs += "&incluir_verdes=true";
    if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
    listaEl.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.85rem;padding:8px 0;">Cargando…</p>';
    fetch("/api/crm/seguimiento/hoy" + qs)
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = "Refrescar"; }
        if (!res.ok) {
          listaEl.innerHTML = '<p style="color:#dc2626;font-size:0.85rem;">Error: ' + _esc((res.data && res.data.error) || "desconocido") + '</p>';
          return;
        }
        _crmRenderOportunidadesHoy(res.data);
      })
      .catch(function (err) {
        if (btn) { btn.disabled = false; btn.textContent = "Refrescar"; }
        listaEl.innerHTML = '<p style="color:#dc2626;font-size:0.85rem;">Error de red: ' + _esc(String(err)) + '</p>';
      });
  }

  // Botón manual de refresco + recarga al cambiar el checkbox.
  var _btnHoy = document.getElementById("btn-crm-hoy-refrescar");
  if (_btnHoy) _btnHoy.addEventListener("click", _crmCargarOportunidadesHoy);
  var _chkHoy = document.getElementById("crm-hoy-incluir-verdes");
  if (_chkHoy) _chkHoy.addEventListener("change", _crmCargarOportunidadesHoy);

  // Auto-carga cuando el panel inicio CRM se hace visible.
  var _panelInicioHoyObs = document.getElementById("panel-crm-inicio");
  if (_panelInicioHoyObs) {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === "attributes" && _panelInicioHoyObs.classList.contains("visible")) {
          _crmCargarOportunidadesHoy();
          _crmGmailComprobarEstado();
        }
      });
    }).observe(_panelInicioHoyObs, { attributes: true, attributeFilter: ["class"] });
    if (_panelInicioHoyObs.classList.contains("visible")) {
      _crmCargarOportunidadesHoy();
      _crmGmailComprobarEstado();
    }
  }

  // ── Bloque 5: Gmail Sync widget ──────────────────────────────────────────
  var _gmailDisponible = false;

  function _crmGmailComprobarEstado() {
    var estadoEl  = document.getElementById("crm-gmail-estado");
    var btnSync   = document.getElementById("btn-crm-gmail-sync");
    if (!estadoEl || !btnSync) return;

    estadoEl.textContent = "Comprobando conexión…";
    btnSync.disabled = true;
    btnSync.style.opacity = "0.5";

    fetch("/api/crm/gmail/status")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        _gmailDisponible = !!d.disponible;
        var btnPrev = document.getElementById("btn-crm-gmail-preview");
        if (d.disponible) {
          estadoEl.innerHTML = '✅ Conectado como <strong>' + _esc(d.cuenta || "") + '</strong>';
          btnSync.disabled = false;
          btnSync.style.opacity = "1";
          if (btnPrev) { btnPrev.disabled = false; btnPrev.style.opacity = "1"; }
        } else {
          estadoEl.innerHTML = '⚠️ No configurado — <span style="color:#94a3b8;">' + _esc(d.motivo || "Sin credenciales Gmail") + '</span>';
          btnSync.disabled = true;
          btnSync.style.opacity = "0.4";
        }
      })
      .catch(function () {
        estadoEl.textContent = "Error al comprobar estado Gmail.";
      });
  }

  function _crmGmailSync() {
    if (!_gmailDisponible) return;
    var btnSync    = document.getElementById("btn-crm-gmail-sync");
    var resumenEl  = document.getElementById("crm-gmail-resumen");
    var errorEl    = document.getElementById("crm-gmail-error");
    if (!btnSync) return;

    // Reset UI
    if (resumenEl) resumenEl.style.display = "none";
    if (errorEl)   errorEl.style.display   = "none";
    btnSync.disabled = true;
    btnSync.textContent = "Sincronizando…";
    btnSync.style.opacity = "0.7";

    var diasEl = document.getElementById("crm-gmail-dias");
    var diasAtras = diasEl ? (parseInt(diasEl.value) || 30) : 30;
    fetch("/api/crm/gmail/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dias_atras: diasAtras }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        btnSync.disabled = false;
        btnSync.textContent = "Sincronizar ahora";
        btnSync.style.opacity = "1";

        if (!res.ok || !res.data.ok) {
          if (errorEl) {
            errorEl.textContent = "❌ " + (res.data.error || "Error desconocido durante el sync.");
            errorEl.style.display = "";
          }
          return;
        }

        var r = res.data.resumen || {};
        var lineas = [];
        if (r.empresas_procesadas != null) lineas.push("Empresas procesadas: <strong>" + r.empresas_procesadas + "</strong>");
        if (r.hilos_nuevos        != null) lineas.push("Emails nuevos importados: <strong>" + r.hilos_nuevos + "</strong>");
        if (r.hilos_ya_existian   != null) lineas.push("Ya existían: <strong>" + r.hilos_ya_existian + "</strong>");
        if (r.errores             != null) lineas.push("Errores: <strong>" + r.errores + "</strong>");
        if (r.duracion_s          != null) lineas.push("Duración: <strong>" + Number(r.duracion_s).toFixed(1) + "s</strong>");
        if (resumenEl) {
          resumenEl.innerHTML = "✅ Sync completado — " + (lineas.length ? lineas.join(" · ") : "Sin cambios.");
          resumenEl.style.display = "";
        }

        // Refrescar interacciones si el panel está visible
        if (typeof window._crmCargarInteracciones === "function") {
          var panelInt = document.getElementById("panel-crm-interacciones");
          if (panelInt && panelInt.classList.contains("visible")) _crmCargarInteracciones();
        }
      })
      .catch(function (err) {
        btnSync.disabled = false;
        btnSync.textContent = "Sincronizar ahora";
        btnSync.style.opacity = "1";
        if (errorEl) {
          errorEl.textContent = "❌ Error de red: " + err.message;
          errorEl.style.display = "";
        }
      });
  }

  var _btnGmailSync = document.getElementById("btn-crm-gmail-sync");
  if (_btnGmailSync) _btnGmailSync.addEventListener("click", _crmGmailSync);

  // ── Vista previa selectiva ────────────────────────────────────────────────
  var _gmailPreviewData = [];   // hilos devueltos por /preview

  function _crmGmailPreview() {
    if (!_gmailDisponible) return;
    var diasEl    = document.getElementById("crm-gmail-dias");
    var diasAtras = diasEl ? (parseInt(diasEl.value) || 30) : 30;
    var btnPrev   = document.getElementById("btn-crm-gmail-preview");
    var wrapEl    = document.getElementById("crm-gmail-preview-wrap");
    var listaEl   = document.getElementById("crm-gmail-preview-lista");
    var countEl   = document.getElementById("crm-gmail-preview-count");
    var errorEl   = document.getElementById("crm-gmail-error");
    var resumenEl = document.getElementById("crm-gmail-resumen");

    if (resumenEl) resumenEl.style.display = "none";
    if (errorEl)   errorEl.style.display   = "none";
    if (wrapEl)    wrapEl.style.display    = "none";
    if (btnPrev) { btnPrev.disabled = true; btnPrev.textContent = "Buscando…"; }

    fetch("/api/crm/gmail/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dias_atras: diasAtras }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (btnPrev) { btnPrev.disabled = false; btnPrev.textContent = "Vista previa"; }
        if (!res.ok || !res.data.ok) {
          if (errorEl) { errorEl.textContent = "❌ " + (res.data.error || "Error en la vista previa"); errorEl.style.display = ""; }
          return;
        }
        _gmailPreviewData = res.data.hilos || [];
        if (!_gmailPreviewData.length) {
          if (countEl) countEl.textContent = "No se encontraron emails nuevos en los últimos " + diasAtras + " días.";
          if (wrapEl) { wrapEl.style.display = ""; }
          if (listaEl) listaEl.innerHTML = "";
          return;
        }
        _crmGmailRenderPreview();
        if (wrapEl) wrapEl.style.display = "";
      })
      .catch(function (err) {
        if (btnPrev) { btnPrev.disabled = false; btnPrev.textContent = "Vista previa"; }
        if (errorEl) { errorEl.textContent = "❌ Error de red: " + err.message; errorEl.style.display = ""; }
      });
  }

  function _crmGmailRenderPreview() {
    var listaEl  = document.getElementById("crm-gmail-preview-lista");
    var countEl  = document.getElementById("crm-gmail-preview-count");
    var selCount = document.getElementById("crm-gmail-sel-count");
    if (!listaEl) return;

    var nuevos   = _gmailPreviewData.filter(function (h) { return !h.ya_existe; }).length;
    var total    = _gmailPreviewData.length;
    if (countEl) countEl.textContent = total + " email(s) encontrado(s) · " + nuevos + " nuevo(s) · " + (total - nuevos) + " ya importado(s)";

    listaEl.innerHTML = _gmailPreviewData.map(function (h, idx) {
      var yaBg   = h.ya_existe ? "background:#f8fafc;opacity:0.6;" : "background:#fff;";
      var yaLabel = h.ya_existe ? '<span style="font-size:0.7rem;color:#94a3b8;margin-left:6px;">ya importado</span>' : '';
      var fecha  = (h.fecha || "").substring(0, 10);
      return '<label style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-bottom:1px solid #f1f5f9;cursor:pointer;' + yaBg + '">'
        + '<input type="checkbox" data-idx="' + idx + '" ' + (h.ya_existe ? '' : 'checked') + ' ' + (h.ya_existe ? 'disabled' : '') + ' style="margin-top:3px;flex-shrink:0;">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:0.83rem;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(h.asunto || "(sin asunto)") + yaLabel + '</div>'
        + '<div style="font-size:0.75rem;color:#64748b;margin-top:2px;">'
        + '<span style="font-weight:600;">' + _esc(h.empresa_nombre) + '</span>'
        + (h.from_addr ? ' &middot; ' + _esc(h.from_addr) : '')
        + (fecha ? ' &middot; ' + fecha : '')
        + '</div>'
        + (h.snippet ? '<div style="font-size:0.75rem;color:#94a3b8;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(h.snippet.substring(0, 120)) + '</div>' : '')
        + '</div>'
        + '</label>';
    }).join("");

    // Actualizar contador seleccionados
    function _actualizarContador() {
      var n = listaEl.querySelectorAll("input[type=checkbox]:checked:not(:disabled)").length;
      if (selCount) selCount.textContent = n;
    }
    listaEl.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.addEventListener("change", _actualizarContador);
    });
    _actualizarContador();
  }

  function _crmGmailImportarSeleccionados() {
    var listaEl  = document.getElementById("crm-gmail-preview-lista");
    var errorEl  = document.getElementById("crm-gmail-error");
    var resumenEl = document.getElementById("crm-gmail-resumen");
    var btnImp   = document.getElementById("btn-crm-gmail-import-sel");
    if (!listaEl) return;

    var seleccionados = [];
    listaEl.querySelectorAll("input[type=checkbox]:checked:not(:disabled)").forEach(function (cb) {
      var idx = parseInt(cb.getAttribute("data-idx"));
      if (_gmailPreviewData[idx]) seleccionados.push(_gmailPreviewData[idx]);
    });

    if (!seleccionados.length) {
      mostrarToast("Selecciona al menos un email para importar.", "error");
      return;
    }

    if (btnImp) { btnImp.disabled = true; btnImp.textContent = "Importando…"; }
    if (errorEl) errorEl.style.display = "none";

    fetch("/api/crm/gmail/sync/selective", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threads: seleccionados }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (btnImp) { btnImp.disabled = false; btnImp.innerHTML = 'Importar seleccionados (<span id="crm-gmail-sel-count">0</span>)'; }
        if (!res.ok || !res.data.ok) {
          if (errorEl) { errorEl.textContent = "❌ " + (res.data.error || "Error al importar"); errorEl.style.display = ""; }
          return;
        }
        var r = res.data.resumen || {};
        if (resumenEl) {
          resumenEl.innerHTML = "✅ Importados: <strong>" + (r.importados || 0) + "</strong>"
            + " · Ya existían: <strong>" + (r.ya_existian || 0) + "</strong>"
            + (r.errores && r.errores.length ? " · Errores: <strong>" + r.errores.length + "</strong>" : "");
          resumenEl.style.display = "";
        }
        // Marcar como "ya importados" en la preview
        _gmailPreviewData.forEach(function (h) {
          if (seleccionados.find(function (s) { return s.gmail_thread_id === h.gmail_thread_id && s.empresa_id === h.empresa_id; })) {
            h.ya_existe = true;
          }
        });
        _crmGmailRenderPreview();
        // Refrescar interacciones si el panel está visible
        if (typeof window._crmCargarInteracciones === "function") {
          var panelInt = document.getElementById("panel-crm-interacciones");
          if (panelInt && panelInt.classList.contains("visible")) _crmCargarInteracciones();
        }
      })
      .catch(function (err) {
        if (btnImp) { btnImp.disabled = false; btnImp.innerHTML = 'Importar seleccionados (<span id="crm-gmail-sel-count">0</span>)'; }
        if (errorEl) { errorEl.textContent = "❌ Error de red: " + err.message; errorEl.style.display = ""; }
      });
  }

  // Seleccionar todo / Ninguno
  var _btnSelAll  = document.getElementById("btn-crm-gmail-sel-all");
  var _btnSelNone = document.getElementById("btn-crm-gmail-sel-none");
  var _btnImportSel = document.getElementById("btn-crm-gmail-import-sel");
  var _btnGmailPreview = document.getElementById("btn-crm-gmail-preview");

  if (_btnSelAll) _btnSelAll.addEventListener("click", function () {
    var listaEl = document.getElementById("crm-gmail-preview-lista");
    if (listaEl) listaEl.querySelectorAll("input[type=checkbox]:not(:disabled)").forEach(function (cb) { cb.checked = true; cb.dispatchEvent(new Event("change")); });
  });
  if (_btnSelNone) _btnSelNone.addEventListener("click", function () {
    var listaEl = document.getElementById("crm-gmail-preview-lista");
    if (listaEl) listaEl.querySelectorAll("input[type=checkbox]:not(:disabled)").forEach(function (cb) { cb.checked = false; cb.dispatchEvent(new Event("change")); });
  });
  if (_btnImportSel)   _btnImportSel.addEventListener("click", _crmGmailImportarSeleccionados);
  if (_btnGmailPreview) _btnGmailPreview.addEventListener("click", _crmGmailPreview);

})();
