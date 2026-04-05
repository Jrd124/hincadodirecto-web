// ═══ PRESUPUESTOS — listado, editor, versiones, PDF ═══

// ═══════════════════════════════════════════════════════════════════════════════
// PRESUPUESTOS
// ═══════════════════════════════════════════════════════════════════════════════

(function () {

  function _esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function _fmtEur(n) { return n != null ? Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" }) : "\u2014"; }

  function _estadoBadge(estado) {
    return '<span class="status-badge status-badge--' + _esc(estado) + '">' + _esc(estado) + '</span>';
  }

  function _renderPresupStats(proys) {
    var stats = document.getElementById("presup-stats");
    if (!stats) return;
    var total = proys.length;
    var borrador = 0, enviNeg = 0, adjudicados = 0, importeAdj = 0;
    proys.forEach(function (p) {
      if (p.estado === "borrador") borrador++;
      if (p.estado === "enviada" || p.estado === "negociacion") enviNeg++;
      if (p.estado === "adjudicada") { adjudicados++; importeAdj += (p.total_version_activa || 0); }
    });
    function _card(label, value, color) {
      return '<div style="background:var(--color-white);border-left:3px solid ' + color + ';border-radius:var(--radius-md);padding:16px;">' +
        '<div style="font-size:12px;color:var(--color-text-secondary);text-transform:uppercase;">' + label + '</div>' +
        '<div style="font-size:24px;font-weight:600;">' + value + '</div></div>';
    }
    stats.innerHTML =
      _card("Total", total, "var(--color-primary)") +
      _card("Borrador", borrador, "#64748B") +
      _card("Enviados / Negoc.", enviNeg, "#CA8A04") +
      _card("Adjudicados", adjudicados, "#16A34A") +
      _card("Importe adjudicado", _fmtEur(importeAdj), "#16A34A");
  }

  // ── Lista ──

  window.presupCargarLista = function () {
    var estado = document.getElementById("presup-filtro-estado");
    var params = estado && estado.value ? "?estado=" + encodeURIComponent(estado.value) : "";
    // Siempre cargar todos para las metricas, luego filtrar la tabla
    fetch("/api/presupuestos")
      .then(function (r) { return r.json(); })
      .then(function (allData) {
        var allProys = allData.presupuestos || [];
        _renderPresupStats(allProys);
        var filtroVal = estado && estado.value ? estado.value : "";
        var proys = filtroVal ? allProys.filter(function (p) { return p.estado === filtroVal; }) : allProys;
        var container = document.getElementById("presupuestos-tabla-container");
        if (!proys.length) {
          container.innerHTML = '<p style="text-align:center;color:var(--color-text-secondary);padding:40px;">' + (filtroVal ? 'No hay presupuestos con estado "' + _esc(filtroVal) + '".' : 'No hay presupuestos. Crea el primero.') + '</p>';
          return;
        }
        var html = '<table class="tabla-facturas"><thead><tr><th>Ref.</th><th>Proyecto</th><th>Cliente</th><th>Rev.</th><th class="numero">Total</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>';
        proys.forEach(function (p) {
          html += '<tr style="cursor:pointer;" onclick="presupEditar(' + p.id + ')">' +
            '<td><strong>' + _esc(p.referencia) + '</strong></td>' +
            '<td>' + _esc(p.nombre_proyecto) + '</td>' +
            '<td>' + _esc(p.nombre_cliente || "") + '</td>' +
            '<td>' + _esc(p.revision_activa || "R00") + '</td>' +
            '<td class="numero">' + _fmtEur(p.total_version_activa) + '</td>' +
            '<td>' + _estadoBadge(p.estado) + '</td>' +
            '<td>' + _esc((p.created_at || "").substring(0, 10)) + '</td>' +
            '<td><button class="secondary" style="font-size:0.75rem;padding:2px 10px;" onclick="event.stopPropagation();presupEditar(' + p.id + ')">Editar</button></td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
      });
  };

  var filtroEstado = document.getElementById("presup-filtro-estado");
  if (filtroEstado) filtroEstado.addEventListener("change", presupCargarLista);

  var btnNuevo = document.getElementById("btn-presup-nuevo");
  if (btnNuevo) btnNuevo.addEventListener("click", function () { activarSubpanel("presupuestos", "nuevo"); presupNuevo(); });

  // ── Nuevo ──

  window.presupNuevo = function () {
    document.getElementById("presup-edit-id").value = "";
    document.getElementById("presup-version-id").value = "";
    document.getElementById("presup-form-titulo").textContent = "Nuevo presupuesto";
    document.getElementById("presup-form-ref").textContent = "";
    document.getElementById("presupuesto-form").reset();
    document.getElementById("presup-lineas-principal").innerHTML = "";
    document.getElementById("presup-lineas-adicionales").innerHTML = "";
    document.getElementById("presup-total").textContent = "0,00 \u20AC";
    document.getElementById("presup-validez").value = "30";
    document.getElementById("presup-btn-nueva-version").style.display = "none";
    document.getElementById("presup-versiones-selector").style.display = "none";
    document.getElementById("presup-estado-control").style.display = "none";
    document.getElementById("presup-proyecto-badge").style.display = "none";
    _presupCargarSelectTerceros();
    _presupCargarSelectOportunidades();
    _presupCargarSelectPlantillas();
    presupCheckCompletitud();
  };

  // ── Editar ──

  window.presupEditar = function (id) {
    fetch("/api/presupuestos/" + id)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { mostrarToast(data.error, "error"); return; }
        document.getElementById("presup-edit-id").value = data.id;
        document.getElementById("presup-form-titulo").textContent = "Editar " + (data.referencia || "");
        document.getElementById("presup-form-ref").textContent = data.referencia || "";
        document.getElementById("presup-nombre-proyecto").value = data.nombre_proyecto || "";
        document.getElementById("presup-nombre-cliente-display").value = data.nombre_cliente_display || "";
        document.getElementById("presup-btn-nueva-version").style.display = "inline-flex";

        // Estado control
        var estadoCtrl = document.getElementById("presup-estado-control");
        var estadoSel = document.getElementById("presup-estado-select");
        estadoCtrl.style.display = "flex";
        estadoSel.value = data.estado || "borrador";

        // Proyecto badge
        var badge = document.getElementById("presup-proyecto-badge");
        var badgeName = document.getElementById("presup-proyecto-badge-nombre");
        if (data.proyecto_id && data.proyecto_nombre) {
          badge.style.display = "block";
          badge.setAttribute("data-proyecto-id", data.proyecto_id);
          badgeName.textContent = data.proyecto_nombre;
        } else {
          badge.style.display = "none";
        }
        // Oportunidad CRM badge
        var oBadge = document.getElementById("presup-oportunidad-badge");
        var oBadgeName = document.getElementById("presup-oportunidad-badge-nombre");
        if (oBadge) {
          if (data.oportunidad_id && data.oportunidad_nombre) {
            oBadge.style.display = "block";
            oBadge.setAttribute("data-oportunidad-id", data.oportunidad_id);
            oBadgeName.textContent = data.oportunidad_nombre;
          } else {
            oBadge.style.display = "none";
          }
        }

        _presupCargarSelectTerceros(data.tercero_id);
        _presupCargarSelectOportunidades(data.oportunidad_id);

        // Badge "Ver empresa en CRM" (Fase 1)
        var crmBadge = document.getElementById("presup-crm-empresa-badge");
        if (crmBadge && data.tercero_id) {
          fetch("/api/crm/empresas?tercero_id=" + data.tercero_id + "&limit=1")
            .then(function (r) { return r.json(); })
            .then(function (d) {
              var emp = (d.empresas || [])[0];
              if (emp) {
                crmBadge.style.display = "inline-flex";
                crmBadge.setAttribute("data-crm-empresa-id", emp.id);
                var nameEl = crmBadge.querySelector(".presup-crm-empresa-nombre");
                if (nameEl) nameEl.textContent = emp.nombre;
              } else {
                crmBadge.style.display = "none";
              }
            })
            .catch(function () { if (crmBadge) crmBadge.style.display = "none"; });
        } else if (crmBadge) {
          crmBadge.style.display = "none";
        }

        // Poblar selector de versiones
        var versiones = data.versiones || [];
        var vSel = document.getElementById("presup-version-select");
        var vSelContainer = document.getElementById("presup-versiones-selector");
        vSel.innerHTML = "";
        versiones.forEach(function (v) {
          var opt = document.createElement("option");
          opt.value = v.id;
          opt.textContent = v.revision + (v.es_activa ? " (activa)" : "") + " - " + (v.fecha || "");
          vSel.appendChild(opt);
        });
        vSelContainer.style.display = versiones.length > 1 ? "block" : "none";

        // Cargar version activa
        var versionActiva = null;
        for (var i = 0; i < versiones.length; i++) {
          if (versiones[i].es_activa) { versionActiva = versiones[i]; break; }
        }
        if (!versionActiva && versiones.length) versionActiva = versiones[0];

        if (versionActiva) {
          vSel.value = String(versionActiva.id);
          _presupCargarVersion(versionActiva);
        } else {
          document.getElementById("presup-version-id").value = "";
          document.getElementById("presup-lineas-principal").innerHTML = "";
          document.getElementById("presup-lineas-adicionales").innerHTML = "";
          document.getElementById("presup-total").textContent = "0,00 \u20AC";
          _presupCargarSelectPlantillas();
        }
        activarSubpanel("presupuestos", "nuevo");
        setTimeout(presupCheckCompletitud, 400);
      });
  };

  function _presupCargarVersion(v) {
    document.getElementById("presup-version-id").value = v.id;
    document.getElementById("presup-forma-pago").value = v.forma_pago || "";
    document.getElementById("presup-notas-capacidad").value = v.notas_capacidad || "";
    document.getElementById("presup-validez").value = v.validez_dias || 30;
    _presupCargarSelectPlantillas(v.plantilla_tc_id || null);
    _presupRenderLineas(v.lineas || []);
    setTimeout(presupCheckCompletitud, 350);
  }

  window.presupCambiarVersion = function (versionId) {
    if (!versionId) return;
    fetch("/api/presupuestos/versiones/" + versionId)
      .then(function (r) { return r.json(); })
      .then(function (v) {
        if (v.error) { mostrarToast(v.error, "error"); return; }
        _presupCargarVersion(v);
      });
  };

  window.presupNuevaVersion = function () {
    var presupId = document.getElementById("presup-edit-id").value;
    if (!presupId) return;
    if (!confirm("Crear nueva revision? Se copiara todo el contenido de la version actual.")) return;
    fetch("/api/presupuestos/" + presupId + "/versiones", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { mostrarToast(data.error, "error"); return; }
        mostrarToast("Version " + data.revision + " creada.", "success");
        presupEditar(parseInt(presupId));
      });
  };

  // ── Estado y vinculación con proyectos ──

  function _presupGetEditId() {
    return parseInt(document.getElementById("presup-edit-id").value) || null;
  }

  var _presupEstadoPendiente = null;

  window.presupCambiarEstado = async function (nuevoEstado) {
    var presupId = _presupGetEditId();
    if (!presupId) return;

    // Al enviar o negociar: crear/vincular proyecto si no existe
    if (nuevoEstado === "enviada" || nuevoEstado === "negociacion") {
      try {
        var resCheck = await fetch("/api/presupuestos/" + presupId);
        var presupData = await resCheck.json();
        if (!presupData.proyecto_id) {
          _presupEstadoPendiente = nuevoEstado;
          _presupMostrarDialogoCrearProyecto(presupId);
          return;
        }
      } catch (_) { /* proceed */ }
    }

    // Para adjudicada: guardar primero
    if (nuevoEstado === "adjudicada") {
      // presupGuardarBorrador is sync-ish, just fire it
    }

    // Cambiar estado directamente
    try {
      var res = await fetch("/api/presupuestos/" + presupId + "/estado", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      var data = await res.json();
      if (data.error) {
        mostrarToast(data.error, "error");
        presupEditar(presupId);
        return;
      }
      mostrarToast("Estado cambiado a " + nuevoEstado, "success");
      presupEditar(presupId);
    } catch (_) {
      mostrarToast("Error al cambiar estado", "error");
      presupEditar(presupId);
    }
  };

  function _presupMostrarDialogoCrearProyecto(presupId) {
    var existing = document.getElementById("modal-crear-proyecto");
    if (existing) existing.remove();

    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-crear-proyecto";
    modal.innerHTML =
      '<div class="modal-editar" role="dialog" style="max-width:500px;">' +
        '<h2 style="margin:0 0 8px;">Vincular con proyecto</h2>' +
        '<p style="color:var(--color-text-secondary);font-size:14px;margin:0 0 20px;">Al enviar un presupuesto, se crea un proyecto en Cotizados para hacer seguimiento en el pipeline.</p>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<button type="button" onclick="presupCrearProyectoYCambiarEstado()" style="text-align:left;padding:14px 16px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-white);cursor:pointer;">' +
            '<div style="font-weight:600;font-size:14px;">Crear proyecto nuevo en Cotizados</div>' +
            '<div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px;">Se creará con los datos del presupuesto</div>' +
          '</button>' +
          '<button type="button" onclick="presupVincularProyectoYCambiarEstado()" style="text-align:left;padding:14px 16px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-white);cursor:pointer;">' +
            '<div style="font-weight:600;font-size:14px;">Vincular a proyecto cotizado existente</div>' +
            '<div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px;">Asociar a un proyecto que ya existe</div>' +
          '</button>' +
        '</div>' +
        '<div style="margin-top:16px;text-align:right;">' +
          '<button type="button" onclick="document.getElementById(\'modal-crear-proyecto\').remove();_presupEstadoPendiente=null;presupEditar(' + presupId + ');" class="secondary" style="padding:8px 16px;">Cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
  }

  window.presupCrearProyectoYCambiarEstado = async function () {
    var presupId = _presupGetEditId();
    if (!presupId) return;
    document.getElementById("modal-crear-proyecto")?.remove();

    try {
      var res = await fetch("/api/presupuestos/" + presupId);
      var presup = await res.json();
      var versionActiva = (presup.versiones || []).find(function (v) { return v.es_activa; }) || (presup.versiones || [])[0];

      var proyectoData = {
        nombre: presup.nombre_proyecto,
        empresa_id: presup.empresa_id,
        cliente_tercero_id: presup.tercero_id,
        oportunidad_id: presup.oportunidad_id || null,
        presupuesto_id: presup.id,
        nombre_parque: presup.nombre_proyecto,
        importe_presupuestado: versionActiva ? versionActiva.total : 0,
        estado: "cotizado",
      };

      var resP = await fetch("/api/proyectos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proyectoData),
      });
      if (!resP.ok) {
        var err = await resP.json();
        mostrarToast(err.error || "Error al crear proyecto", "error");
        _presupEstadoPendiente = null;
        return;
      }
      var proyecto = await resP.json();

      // Vincular presupuesto al proyecto
      await fetch("/api/presupuestos/" + presupId, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proyecto_id: proyecto.id,
          nombre_proyecto: presup.nombre_proyecto,
          tercero_id: presup.tercero_id,
        }),
      });

      // Cambiar estado del presupuesto
      if (_presupEstadoPendiente) {
        await fetch("/api/presupuestos/" + presupId + "/estado", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: _presupEstadoPendiente }),
        });
      }

      mostrarToast('Proyecto "' + proyecto.nombre + '" creado en Cotizados', "success");
      _presupEstadoPendiente = null;
      presupEditar(presupId);
    } catch (e) {
      mostrarToast("Error: " + e.message, "error");
      _presupEstadoPendiente = null;
    }
  };

  window.presupVincularProyectoYCambiarEstado = async function () {
    var presupId = _presupGetEditId();
    if (!presupId) return;
    var modalContent = document.querySelector("#modal-crear-proyecto .modal-editar");
    if (!modalContent) return;

    try {
      var res = await fetch("/api/proyectos?estado=cotizado");
      var data = await res.json();
      var proyectos = data.proyectos || [];

      if (!proyectos.length) {
        modalContent.innerHTML =
          '<h2 style="margin:0 0 12px;">No hay proyectos cotizados</h2>' +
          '<p style="color:var(--color-text-secondary);font-size:14px;">No hay proyectos en Cotizados para vincular.</p>' +
          '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">' +
            '<button type="button" onclick="document.getElementById(\'modal-crear-proyecto\').remove();_presupEstadoPendiente=null;presupEditar(' + presupId + ');" class="secondary" style="padding:8px 16px;">Cancelar</button>' +
            '<button type="button" onclick="presupCrearProyectoYCambiarEstado()" class="primary" style="width:auto;padding:8px 16px;">Crear proyecto nuevo</button>' +
          '</div>';
        return;
      }

      var optsHtml = proyectos.map(function (p) {
        return '<option value="' + p.id + '">' + (p.codigo ? p.codigo + ' \u00b7 ' : '') + _esc(p.nombre) + (p.cliente_nombre ? " \u2014 " + _esc(p.cliente_nombre) : "") + '</option>';
      }).join("");

      modalContent.innerHTML =
        '<h2 style="margin:0 0 12px;">Vincular a proyecto existente</h2>' +
        '<label style="display:block;font-size:13px;font-weight:500;margin-bottom:4px;">Selecciona el proyecto:</label>' +
        '<select id="vincular-proyecto-select" style="width:100%;padding:8px 12px;border:1px solid var(--color-border);border-radius:6px;font-size:14px;">' + optsHtml + '</select>' +
        '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button type="button" onclick="document.getElementById(\'modal-crear-proyecto\').remove();_presupEstadoPendiente=null;presupEditar(' + presupId + ');" class="secondary" style="padding:8px 16px;">Cancelar</button>' +
          '<button type="button" onclick="presupConfirmarVinculacion()" class="primary" style="width:auto;padding:8px 16px;">Vincular</button>' +
        '</div>';
    } catch (_) {
      mostrarToast("Error al cargar proyectos", "error");
    }
  };

  window.presupConfirmarVinculacion = async function () {
    var presupId = _presupGetEditId();
    var proyectoId = parseInt((document.getElementById("vincular-proyecto-select") || {}).value);
    if (!presupId || !proyectoId) return;
    document.getElementById("modal-crear-proyecto")?.remove();

    try {
      var resCur = await fetch("/api/presupuestos/" + presupId);
      var presup = await resCur.json();
      await fetch("/api/presupuestos/" + presupId, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proyecto_id: proyectoId,
          nombre_proyecto: presup.nombre_proyecto,
          tercero_id: presup.tercero_id,
        }),
      });

      if (_presupEstadoPendiente) {
        await fetch("/api/presupuestos/" + presupId + "/estado", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: _presupEstadoPendiente }),
        });
      }

      mostrarToast("Presupuesto vinculado al proyecto", "success");
      _presupEstadoPendiente = null;
      presupEditar(presupId);
    } catch (_) {
      mostrarToast("Error al vincular", "error");
      _presupEstadoPendiente = null;
    }
  };

  window.presupIrAProyecto = function () {
    var badge = document.getElementById("presup-proyecto-badge");
    var proyId = badge ? badge.getAttribute("data-proyecto-id") : null;
    if (proyId) navegarAProyecto(parseInt(proyId));
  };

  // ── Selects ──

  function _presupCargarSelectTerceros(selectedId) {
    fetch("/api/crm/empresas?activo=1&limit=200&tipo=cliente")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var sel = document.getElementById("presup-tercero-id");
        sel.innerHTML = '<option value="">Seleccionar cliente...</option>';
        (data.empresas || []).forEach(function (e) {
          var opt = document.createElement("option");
          opt.value = e.tercero_id || e.id;
          opt.textContent = e.nombre || "Empresa " + e.id;
          sel.appendChild(opt);
        });
        if (selectedId) sel.value = String(selectedId);
        presupCheckCompletitud();
      });
  }

  function _presupCargarSelectOportunidades(selectedId) {
    fetch("/api/crm/oportunidades")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var sel = document.getElementById("presup-oportunidad-id");
        sel.innerHTML = '<option value="">Sin vincular</option>';
        (data.oportunidades || []).forEach(function (o) {
          if (o.estado !== "perdida") {
            var opt = document.createElement("option");
            opt.value = o.id;
            opt.textContent = o.nombre;
            sel.appendChild(opt);
          }
        });
        if (selectedId) sel.value = String(selectedId);
      });
  }

  function _presupCargarSelectPlantillas(selectedId) {
    fetch("/api/presupuestos/plantillas-tc")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var sel = document.getElementById("presup-plantilla-tc");
        sel.innerHTML = '<option value="">Sin plantilla</option>';
        (data.plantillas || []).forEach(function (p) {
          var opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.nombre;
          sel.appendChild(opt);
        });
        if (selectedId) sel.value = String(selectedId);
      });
  }

  // ── Completitud ──

  window.presupCheckCompletitud = function () {
    // Sección 1: Datos
    var nombre = (document.getElementById("presup-nombre-proyecto")?.value || "").trim();
    var tercero = document.getElementById("presup-tercero-id")?.value;
    var s1ok = !!(nombre && tercero);
    _presupSetStatus("datos", s1ok, s1ok ? "Completo" : "Pendiente");

    // Sección 2: Partidas principales
    var lineasP = document.querySelectorAll('.presup-linea-row[data-seccion="principal"]');
    var countP = 0;
    lineasP.forEach(function (row) {
      var titulo = (row.querySelector(".presup-l-titulo")?.value || "").trim();
      var cant = parseFloat(row.querySelector(".presup-l-cantidad")?.value) || 0;
      var precio = parseFloat(row.querySelector(".presup-l-precio")?.value) || 0;
      if (titulo && cant > 0 && precio > 0) countP++;
    });
    var s2ok = countP > 0;
    _presupSetStatus("principales", s2ok, s2ok ? countP + " partida" + (countP > 1 ? "s" : "") + " lista" + (countP > 1 ? "s" : "") : "Sin partidas");
    var emptyP = document.getElementById("presup-empty-principales");
    if (emptyP) emptyP.style.display = lineasP.length > 0 ? "none" : "block";

    // Sección 3: Adicionales (siempre OK)
    var lineasA = document.querySelectorAll('.presup-linea-row[data-seccion="adicionales"]');
    var countA = lineasA.length;
    _presupSetStatus("adicionales", true, countA > 0 ? countA + " adicional" + (countA > 1 ? "es" : "") : "Opcional");
    var emptyA = document.getElementById("presup-empty-adicionales");
    if (emptyA) emptyA.style.display = lineasA.length > 0 ? "none" : "block";

    // Sección 4: Condiciones
    var plantilla = document.getElementById("presup-plantilla-tc")?.value;
    var s4ok = !!plantilla;
    _presupSetStatus("condiciones", s4ok, s4ok ? "Completo" : "Sin plantilla T&C");

    // Botón PDF
    var btnPdf = document.getElementById("presup-btn-pdf");
    if (btnPdf) {
      var ready = s1ok && s2ok;
      btnPdf.disabled = !ready;
      btnPdf.style.opacity = ready ? "1" : "0.5";
      btnPdf.title = ready ? "" : "Completa los datos y añade al menos una partida";
    }
  };

  function _presupSetStatus(section, ok, label) {
    var container = document.getElementById("presup-status-" + section);
    if (!container) return;
    var dot = container.querySelector(".presup-status-dot");
    var text = container.querySelector(".presup-status-label");
    if (dot) {
      dot.classList.remove("presup-status-pending", "presup-status-ok");
      dot.classList.add(ok ? "presup-status-ok" : "presup-status-pending");
    }
    if (text) text.textContent = label;
  }

  // ── Textarea auto-resize ──

  window.presupAutoResizeTextarea = function (textarea) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.max(60, textarea.scrollHeight) + "px";
  };

  // ── Lineas ──

  window.presupAddLinea = function (seccion) {
    var container = document.getElementById("presup-lineas-" + seccion);
    var idx = container.children.length;
    var numSec = seccion === "principal" ? "01" : "02";
    var codigo = numSec + "." + String(idx + 1).padStart(2, "0");

    var div = document.createElement("div");
    div.className = "presup-linea-row";
    div.dataset.seccion = seccion;
    div.innerHTML =
      '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px;background:var(--color-white);margin-bottom:10px;">' +
        '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">' +
          '<input type="text" class="presup-l-codigo" value="' + codigo + '" placeholder="Cód." style="width:70px;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:13px;text-align:center;flex-shrink:0;box-sizing:border-box;">' +
          '<input type="text" class="presup-l-titulo" placeholder="Título de la partida" style="flex:1;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:14px;font-weight:500;box-sizing:border-box;min-width:0;">' +
          '<input type="text" class="presup-l-unidad" value="Ud" placeholder="Ud" style="width:50px;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:13px;text-align:center;flex-shrink:0;box-sizing:border-box;">' +
          '<button type="button" onclick="this.closest(\'.presup-linea-row\').remove();presupRecalcular();" style="background:none;border:none;cursor:pointer;color:var(--color-danger);font-size:18px;flex-shrink:0;width:28px;line-height:1;" title="Eliminar partida">\u00D7</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 280px;gap:16px;align-items:start;">' +
          '<textarea class="presup-l-descripcion" placeholder="Descripción detallada (aparecerá en el PDF)" rows="3" style="width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;resize:vertical;box-sizing:border-box;line-height:1.5;min-height:60px;"></textarea>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
              '<div>' +
                '<label style="font-size:11px;color:var(--color-text-secondary);display:block;margin-bottom:2px;">Cantidad</label>' +
                '<input type="number" class="presup-l-cantidad" placeholder="0" step="any" oninput="presupRecalcular()" style="width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:14px;text-align:right;box-sizing:border-box;">' +
              '</div>' +
              '<div>' +
                '<label style="font-size:11px;color:var(--color-text-secondary);display:block;margin-bottom:2px;">Precio (\u20AC)</label>' +
                '<div style="display:flex;align-items:center;gap:4px;">' +
                  '<input type="number" class="presup-l-precio" placeholder="0,00" step="any" oninput="presupRecalcular()" style="flex:1;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;font-size:14px;text-align:right;box-sizing:border-box;min-width:0;">' +
                  '<button type="button" onclick="presupToggleCalc(this)" title="Calculadora" style="background:none;border:none;cursor:pointer;font-size:14px;padding:0;flex-shrink:0;">&#x1F4CA;</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--color-bg-alt);border-radius:var(--radius-sm);">' +
              '<span style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Total</span>' +
              '<span class="presup-l-total" style="font-size:16px;font-weight:600;color:var(--color-text);">0,00 \u20AC</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    container.appendChild(div);
    div.querySelector(".presup-l-descripcion").addEventListener("input", function () { presupAutoResizeTextarea(this); });
    presupCheckCompletitud();
  };

  // ── Calculadora de pricing ──

  var _calcHTML =
    '<div class="presup-pricing-calc" style="display:none;padding:12px;margin:4px 0 8px;background:var(--color-bg-alt);border:1px dashed var(--color-border);border-radius:var(--radius-sm);">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<span style="font-size:12px;font-weight:600;color:var(--color-text-secondary);">Calculadora de pricing</span>' +
        '<select class="calc-modalidad" style="font-size:12px;padding:2px 8px;border:1px solid var(--color-border);border-radius:4px;background:var(--color-white);" onchange="presupCalcModalidad(this)">' +
          '<option value="produccion">Por produccion</option>' +
          '<option value="administracion">Por administracion</option>' +
        '</select>' +
        '<button type="button" onclick="this.closest(\'.presup-pricing-calc\').style.display=\'none\'" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--color-text-secondary);font-size:14px;">\u00D7</button>' +
      '</div>' +
      '<div class="calc-produccion" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Coste maquina/mes</label>' +
          '<input type="number" class="calc-coste-maquina" placeholder="26500" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecio(this)"></div>' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Coste ayudante/mes</label>' +
          '<input type="number" class="calc-coste-ayudante" placeholder="6000" value="0" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecio(this)"></div>' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Rendimiento/dia</label>' +
          '<input type="number" class="calc-rendimiento" placeholder="85" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecio(this)"></div>' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Margen (\u20AC)</label>' +
          '<input type="number" class="calc-margen" placeholder="4" value="0" step="0.5" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecio(this)"></div>' +
      '</div>' +
      '<div class="calc-administracion" style="display:none;grid-template-columns:repeat(3,1fr);gap:8px;">' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Coste maquina/mes</label>' +
          '<input type="number" class="calc-admin-maquina" placeholder="22000" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecioAdmin(this)"></div>' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Coste operador/mes</label>' +
          '<input type="number" class="calc-admin-operador" placeholder="0" value="0" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecioAdmin(this)"></div>' +
        '<div><label style="font-size:11px;color:var(--color-text-secondary);">Margen (\u20AC)</label>' +
          '<input type="number" class="calc-admin-margen" placeholder="2000" value="0" style="width:100%;padding:4px 6px;border:1px solid var(--color-border);border-radius:4px;font-size:12px;" oninput="presupCalcPrecioAdmin(this)"></div>' +
      '</div>' +
      '<div style="margin-top:8px;display:flex;align-items:center;gap:12px;">' +
        '<span style="font-size:12px;color:var(--color-text-secondary);">Coste base: <strong class="calc-resultado-coste">\u2014</strong></span>' +
        '<span style="font-size:12px;color:var(--color-text-secondary);">Precio sugerido: <strong class="calc-resultado-precio" style="color:var(--color-primary);">\u2014</strong></span>' +
        '<button type="button" style="font-size:11px;padding:2px 10px;border:1px solid var(--color-border);border-radius:4px;background:var(--color-white);cursor:pointer;" onclick="presupCalcAplicar(this)">Aplicar \u2192</button>' +
      '</div>' +
    '</div>';

  window.presupToggleCalc = function (btn) {
    var row = btn.closest(".presup-linea-row");
    var calc = row.querySelector(".presup-pricing-calc");
    if (!calc) {
      var container = row.querySelector("div"); // outer wrapper div
      var wrapper = document.createElement("div");
      wrapper.innerHTML = _calcHTML;
      container.appendChild(wrapper.firstElementChild);
      calc = row.querySelector(".presup-pricing-calc");
    }
    calc.style.display = calc.style.display === "none" ? "block" : "none";
  };

  window.presupCalcModalidad = function (sel) {
    var calc = sel.closest(".presup-pricing-calc");
    var prod = calc.querySelector(".calc-produccion");
    var admin = calc.querySelector(".calc-administracion");
    if (sel.value === "produccion") {
      prod.style.display = "grid";
      admin.style.display = "none";
    } else {
      prod.style.display = "none";
      admin.style.display = "grid";
    }
  };

  window.presupCalcPrecio = function (input) {
    var calc = input.closest(".presup-pricing-calc");
    var costeMaq = parseFloat(calc.querySelector(".calc-coste-maquina").value) || 0;
    var costeAy = parseFloat(calc.querySelector(".calc-coste-ayudante").value) || 0;
    var rend = parseFloat(calc.querySelector(".calc-rendimiento").value) || 1;
    var margen = parseFloat(calc.querySelector(".calc-margen").value) || 0;
    var dias = 20;
    var costeBase = (costeMaq + costeAy) / (rend * dias);
    var precioSugerido = costeBase + margen;
    calc.querySelector(".calc-resultado-coste").textContent = costeBase.toFixed(2) + " \u20AC";
    calc.querySelector(".calc-resultado-precio").textContent = precioSugerido.toFixed(2) + " \u20AC";
  };

  window.presupCalcPrecioAdmin = function (input) {
    var calc = input.closest(".presup-pricing-calc");
    var maq = parseFloat(calc.querySelector(".calc-admin-maquina").value) || 0;
    var oper = parseFloat(calc.querySelector(".calc-admin-operador").value) || 0;
    var margen = parseFloat(calc.querySelector(".calc-admin-margen").value) || 0;
    var costeBase = maq + oper;
    var precioSugerido = costeBase + margen;
    calc.querySelector(".calc-resultado-coste").textContent = costeBase.toLocaleString("es-ES") + " \u20AC";
    calc.querySelector(".calc-resultado-precio").textContent = precioSugerido.toLocaleString("es-ES") + " \u20AC";
  };

  window.presupCalcAplicar = function (btn) {
    var calc = btn.closest(".presup-pricing-calc");
    var row = calc.closest(".presup-linea-row");
    var precioText = calc.querySelector(".calc-resultado-precio").textContent;
    var precio = parseFloat(precioText.replace(/[^\d,.\-]/g, "").replace(",", "."));
    if (!isNaN(precio) && precio > 0) {
      row.querySelector(".presup-l-precio").value = precio.toFixed(2);
      presupRecalcular();
      calc.style.display = "none";
    }
  };

  window.presupRecalcular = function () {
    var totalPrincipal = 0;
    document.querySelectorAll(".presup-linea-row").forEach(function (row) {
      var cant = parseFloat(row.querySelector(".presup-l-cantidad")?.value) || 0;
      var precio = parseFloat(row.querySelector(".presup-l-precio")?.value) || 0;
      var total = cant * precio;
      row.querySelector(".presup-l-total").textContent = total.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
      if (row.dataset.seccion === "principal") totalPrincipal += total;
    });
    document.getElementById("presup-total").textContent = totalPrincipal.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
    presupCheckCompletitud();
  };

  function _presupRecogerLineas() {
    var lineas = [];
    var orden = 0;
    document.querySelectorAll(".presup-linea-row").forEach(function (row) {
      lineas.push({
        seccion: row.dataset.seccion,
        codigo: (row.querySelector(".presup-l-codigo")?.value || "").trim(),
        titulo: (row.querySelector(".presup-l-titulo")?.value || "").trim(),
        descripcion: (row.querySelector(".presup-l-descripcion")?.value || "").trim(),
        unidad: (row.querySelector(".presup-l-unidad")?.value || "Ud").trim(),
        cantidad: parseFloat(row.querySelector(".presup-l-cantidad")?.value) || 0,
        precio_unitario: parseFloat(row.querySelector(".presup-l-precio")?.value) || 0,
        orden: orden++,
      });
    });
    return lineas;
  }

  function _presupRenderLineas(lineas) {
    document.getElementById("presup-lineas-principal").innerHTML = "";
    document.getElementById("presup-lineas-adicionales").innerHTML = "";
    for (var i = 0; i < lineas.length; i++) {
      var l = lineas[i];
      var sec = l.seccion || "principal";
      presupAddLinea(sec);
      var rows = document.querySelectorAll('.presup-linea-row[data-seccion="' + sec + '"]');
      var row = rows[rows.length - 1];
      if (!row) continue;
      row.querySelector(".presup-l-codigo").value = l.codigo || "";
      row.querySelector(".presup-l-titulo").value = l.titulo || "";
      var descField = row.querySelector(".presup-l-descripcion");
      descField.value = l.descripcion || "";
      presupAutoResizeTextarea(descField);
      row.querySelector(".presup-l-unidad").value = l.unidad || "Ud";
      row.querySelector(".presup-l-cantidad").value = l.cantidad || "";
      row.querySelector(".presup-l-precio").value = l.precio_unitario || "";
    }
    presupRecalcular();
  }

  // ── Guardar ──

  window.presupGuardarBorrador = function () {
    var nombre = document.getElementById("presup-nombre-proyecto").value.trim();
    var terceroId = parseInt(document.getElementById("presup-tercero-id").value) || null;
    if (!nombre || !terceroId) {
      mostrarToast("Nombre del proyecto y cliente son obligatorios.", "error");
      return;
    }
    var body = {
      nombre_proyecto: nombre,
      tercero_id: terceroId,
      nombre_cliente_display: document.getElementById("presup-nombre-cliente-display").value.trim(),
      oportunidad_id: parseInt(document.getElementById("presup-oportunidad-id").value) || null,
    };
    var presupId = document.getElementById("presup-edit-id").value;

    if (!presupId) {
      // Crear nuevo
      body.empresa_id = "hincado_directo"; // TODO: multi-empresa
      fetch("/api/presupuestos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { mostrarToast(data.error, "error"); return; }
          document.getElementById("presup-edit-id").value = data.id;
          var v = data.versiones && data.versiones[0];
          if (v) document.getElementById("presup-version-id").value = v.id;
          document.getElementById("presup-form-titulo").textContent = "Editar " + data.referencia;
          _guardarLineasYVersion();
          mostrarToast("Presupuesto creado: " + data.referencia, "success");
        });
    } else {
      // Actualizar cabecera
      fetch("/api/presupuestos/" + presupId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { mostrarToast(data.error, "error"); return; }
          _guardarLineasYVersion();
          mostrarToast("Presupuesto guardado.", "success");
        });
    }
  };

  function _guardarLineasYVersion() {
    var versionId = document.getElementById("presup-version-id").value;
    if (!versionId) return;

    // Guardar lineas
    var lineas = _presupRecogerLineas();
    fetch("/api/presupuestos/versiones/" + versionId + "/lineas", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineas: lineas }),
    });

    // Guardar datos de version
    var vData = {
      forma_pago: document.getElementById("presup-forma-pago").value.trim(),
      notas_capacidad: document.getElementById("presup-notas-capacidad").value.trim(),
      validez_dias: parseInt(document.getElementById("presup-validez").value) || 30,
      plantilla_tc_id: parseInt(document.getElementById("presup-plantilla-tc").value) || null,
    };
    fetch("/api/presupuestos/versiones/" + versionId, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vData),
    });
  }

  window.presupGenerarPDF = function () {
    var versionId = document.getElementById("presup-version-id").value;
    if (!versionId) {
      mostrarToast("Guarda el presupuesto primero.", "error");
      return;
    }
    // Guardar antes de generar
    var nombre = document.getElementById("presup-nombre-proyecto").value.trim();
    var terceroId = parseInt(document.getElementById("presup-tercero-id").value) || null;
    if (!nombre || !terceroId) {
      mostrarToast("Nombre del proyecto y cliente son obligatorios.", "error");
      return;
    }
    // Guardar lineas y version, luego abrir PDF
    _guardarLineasYVersion();
    setTimeout(function () {
      window.open("/api/presupuestos/versiones/" + versionId + "/pdf", "_blank");
    }, 500);
  };

  // ── Plantillas T&C ──

  window.presupCargarPlantillas = function () {
    fetch("/api/presupuestos/plantillas-tc")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var container = document.getElementById("plantillas-tc-container");
        var plantillas = data.plantillas || [];
        if (!plantillas.length) {
          container.innerHTML = '<p style="text-align:center;color:var(--color-text-secondary);padding:40px;">No hay plantillas.</p>';
          return;
        }
        var html = '<div style="display:grid;gap:12px;">';
        plantillas.forEach(function (p) {
          html += '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
              '<h3 style="font-size:15px;font-weight:600;margin:0;">' + _esc(p.nombre) + '</h3>' +
              '<span style="font-size:12px;color:var(--color-text-secondary);">' + _esc(p.tipo) + '</span>' +
            '</div>' +
            '<p style="font-size:13px;color:var(--color-text);margin:0 0 8px;">' + _esc((p.contenido || "").substring(0, 200)) + (p.contenido && p.contenido.length > 200 ? "..." : "") + '</p>' +
            (p.exclusiones ? '<details><summary style="font-size:12px;color:var(--color-text-secondary);cursor:pointer;">Exclusiones</summary><p style="font-size:12px;color:var(--color-text-secondary);white-space:pre-line;margin:8px 0 0;">' + _esc(p.exclusiones) + '</p></details>' : '') +
          '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
      });
  };

  window.presupNuevaPlantilla = function () {
    mostrarToast("Editor de plantillas pendiente de implementar.", "error");
  };

  var btnNuevaPlantilla = document.getElementById("btn-presup-nueva-plantilla");
  if (btnNuevaPlantilla) btnNuevaPlantilla.addEventListener("click", presupNuevaPlantilla);

  // ── Catálogo de partidas predefinidas ──

  var _catalogoCache = null;
  var _catalogoAdminFilter = "";

  async function _catalogoFetch() {
    var res = await fetch("/api/presupuestos/catalogo");
    var data = await res.json();
    _catalogoCache = data.catalogo || [];
    return _catalogoCache;
  }

  // -- Picker en formulario de presupuesto --

  window.presupToggleCatalogPicker = async function (seccion) {
    var picker = document.getElementById("presup-catalogo-picker-" + seccion);
    if (!picker) return;
    if (picker.style.display !== "none") {
      picker.style.display = "none";
      return;
    }
    var catalogo = _catalogoCache || await _catalogoFetch();
    var filtered = catalogo.filter(function (c) { return c.seccion === seccion; });
    _presupRenderCatalogoItems(picker, filtered, "", seccion);
    picker.style.display = "block";
  };

  function _presupRenderCatalogoItems(picker, items, filterCat, seccion) {
    var container = picker.querySelector(".presup-catalogo-items");
    var filtered = filterCat ? items.filter(function (i) { return i.categoria === filterCat; }) : items;
    if (!filtered.length) {
      container.innerHTML = '<p style="padding:12px;text-align:center;color:var(--color-text-secondary);font-size:13px;">Sin partidas en esta categoría</p>';
      return;
    }
    container.innerHTML = filtered.map(function (item) {
      var desc = (item.descripcion || "").split("\n")[0];
      var dataAttr = _esc(JSON.stringify(item));
      return '<div style="display:flex;justify-content:space-between;align-items:start;padding:8px 12px;border-bottom:1px solid var(--color-border);cursor:pointer;transition:background 0.1s;" ' +
        'onmouseover="this.style.background=\'var(--color-bg-alt)\'" onmouseout="this.style.background=\'\'" ' +
        'data-catalogo-item="' + dataAttr + '" data-seccion="' + seccion + '">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;font-weight:500;color:var(--color-text);">' + _esc(item.titulo) + '</div>' +
          '<div style="font-size:11px;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;">' + _esc(desc) + '</div>' +
        '</div>' +
        '<span style="font-size:11px;color:var(--color-primary);margin-left:8px;white-space:nowrap;">+ Añadir</span>' +
      '</div>';
    }).join("");
  }

  // Click en item del picker
  document.addEventListener("click", function (e) {
    var itemEl = e.target.closest("[data-catalogo-item]");
    if (!itemEl) return;
    var picker = itemEl.closest(".presup-catalogo-picker");
    if (!picker) return;
    var item;
    try { item = JSON.parse(itemEl.getAttribute("data-catalogo-item")); } catch (_) { return; }
    var seccion = itemEl.getAttribute("data-seccion") || "principal";

    presupAddLinea(seccion);
    var rows = document.querySelectorAll('.presup-linea-row[data-seccion="' + seccion + '"]');
    var row = rows[rows.length - 1];
    if (!row) return;

    row.querySelector(".presup-l-codigo").value = item.codigo_default || "";
    row.querySelector(".presup-l-titulo").value = item.titulo || "";
    var descEl = row.querySelector(".presup-l-descripcion");
    descEl.value = item.descripcion || "";
    presupAutoResizeTextarea(descEl);
    row.querySelector(".presup-l-unidad").value = item.unidad || "Ud";
    // rendimiento: pre-fill the pricing calc if available
    if (item.rendimiento_orientativo) {
      var calcRendInput = row.querySelector(".calc-rendimiento");
      if (calcRendInput) calcRendInput.value = item.rendimiento_orientativo;
    }

    picker.style.display = "none";
    presupRecalcular();
  });

  // Filtro por categoría en picker
  document.addEventListener("click", function (e) {
    if (!e.target.classList.contains("presup-cat-filter")) return;
    var picker = e.target.closest(".presup-catalogo-picker");
    if (!picker) return;
    picker.querySelectorAll(".presup-cat-filter").forEach(function (b) {
      b.classList.remove("active");
      b.style.background = "var(--color-white)";
    });
    e.target.classList.add("active");
    e.target.style.background = "var(--color-bg-alt)";
    var cat = e.target.dataset.cat || "";
    var seccion = picker.id.replace("presup-catalogo-picker-", "");
    var catalogo = (_catalogoCache || []).filter(function (c) { return c.seccion === seccion; });
    _presupRenderCatalogoItems(picker, catalogo, cat, seccion);
  });

  // -- Panel administración del catálogo --

  window.presupCargarCatalogo = async function () {
    var catalogo = await _catalogoFetch();
    _catalogoRenderAdmin(catalogo, _catalogoAdminFilter);
  };

  function _catalogoRenderAdmin(catalogo, filterCat) {
    var tbody = document.getElementById("tbody-catalogo-partidas");
    if (!tbody) return;
    var items = filterCat ? catalogo.filter(function (i) { return i.categoria === filterCat; }) : catalogo;
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="sin-datos">No hay partidas' + (filterCat ? ' en esta categoría' : '') + '.</td></tr>';
      return;
    }
    var html = "";
    items.forEach(function (item) {
      var catLabel = { hincado: "Hincado", perforado: "Perforado", transporte: "Transporte", parada: "Parada", otro: "Otro" }[item.categoria] || item.categoria;
      var secLabel = item.seccion === "principal" ? "Principal" : "Adicionales";
      html += "<tr>" +
        "<td>" + _esc(item.codigo_default || "—") + "</td>" +
        "<td>" + _esc(item.titulo) + "</td>" +
        "<td>" + catLabel + "</td>" +
        "<td>" + secLabel + "</td>" +
        "<td>" + _esc(item.unidad || "Ud") + "</td>" +
        '<td><button type="button" class="btn-small catalogo-btn-editar" data-id="' + item.id + '">Editar</button> ' +
        '<button type="button" class="btn-small catalogo-btn-eliminar" data-id="' + item.id + '" style="color:var(--color-danger);">Eliminar</button></td>' +
      "</tr>";
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll(".catalogo-btn-editar").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = parseInt(btn.getAttribute("data-id"), 10);
        var item = (_catalogoCache || []).find(function (i) { return i.id === id; });
        if (item) _catalogoAbrirModal(item);
      });
    });
    tbody.querySelectorAll(".catalogo-btn-eliminar").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = parseInt(btn.getAttribute("data-id"), 10);
        if (!confirm("¿Eliminar esta partida del catálogo?")) return;
        fetch("/api/presupuestos/catalogo/" + id, { method: "DELETE" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) { mostrarToast(data.error, "error"); return; }
            _catalogoCache = null;
            presupCargarCatalogo();
            mostrarToast("Partida eliminada.", "success");
          });
      });
    });
  }

  // Filtro admin
  document.querySelectorAll(".presup-cat-admin-filter").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".presup-cat-admin-filter").forEach(function (b) {
        b.classList.remove("active");
        b.style.background = "var(--color-white)";
      });
      btn.classList.add("active");
      btn.style.background = "var(--color-bg-alt)";
      _catalogoAdminFilter = btn.dataset.cat || "";
      _catalogoRenderAdmin(_catalogoCache || [], _catalogoAdminFilter);
    });
  });

  // Modal crear/editar
  var _catalogoEditId = null;
  var modalCatalogoOverlay = document.getElementById("modal-catalogo-overlay");

  function _catalogoAbrirModal(item) {
    if (!modalCatalogoOverlay) return;
    var titulo = document.getElementById("modal-catalogo-titulo");
    var btnGuardar = document.getElementById("btn-catalogo-guardar");
    var status = document.getElementById("catalogo-status");
    if (status) { status.textContent = ""; status.style.color = ""; }

    if (item) {
      _catalogoEditId = item.id;
      if (titulo) titulo.textContent = "Editar partida";
      if (btnGuardar) btnGuardar.textContent = "Guardar cambios";
      document.getElementById("catalogo-edit-id").value = item.id;
      document.getElementById("catalogo-seccion").value = item.seccion || "principal";
      document.getElementById("catalogo-categoria").value = item.categoria || "hincado";
      document.getElementById("catalogo-codigo").value = item.codigo_default || "";
      document.getElementById("catalogo-titulo").value = item.titulo || "";
      document.getElementById("catalogo-descripcion").value = item.descripcion || "";
      document.getElementById("catalogo-unidad").value = item.unidad || "Ud";
      document.getElementById("catalogo-rendimiento").value = item.rendimiento_orientativo || "";
      document.getElementById("catalogo-precio").value = item.precio_orientativo || "";
    } else {
      _catalogoEditId = null;
      if (titulo) titulo.textContent = "Nueva partida";
      if (btnGuardar) btnGuardar.textContent = "Guardar partida";
      document.getElementById("catalogo-edit-id").value = "";
      document.getElementById("form-catalogo-partida").reset();
      document.getElementById("catalogo-unidad").value = "Ud";
    }
    modalCatalogoOverlay.classList.add("visible");
    modalCatalogoOverlay.setAttribute("aria-hidden", "false");
  }

  function _catalogoCerrarModal() {
    if (!modalCatalogoOverlay) return;
    _catalogoEditId = null;
    modalCatalogoOverlay.classList.remove("visible");
    modalCatalogoOverlay.setAttribute("aria-hidden", "true");
  }

  var btnNuevaPartida = document.getElementById("btn-catalogo-nueva-partida");
  if (btnNuevaPartida) btnNuevaPartida.addEventListener("click", function () { _catalogoAbrirModal(null); });

  var btnCerrarCatalogo = document.getElementById("btn-cerrar-modal-catalogo");
  if (btnCerrarCatalogo) btnCerrarCatalogo.addEventListener("click", _catalogoCerrarModal);

  if (modalCatalogoOverlay) {
    modalCatalogoOverlay.addEventListener("click", function (e) {
      if (e.target === modalCatalogoOverlay) _catalogoCerrarModal();
    });
  }

  var formCatalogo = document.getElementById("form-catalogo-partida");
  if (formCatalogo) {
    formCatalogo.addEventListener("submit", function (e) {
      e.preventDefault();
      var tituloVal = (document.getElementById("catalogo-titulo").value || "").trim();
      if (!tituloVal) {
        mostrarToast("El título es obligatorio.", "error");
        return;
      }
      var payload = {
        seccion: document.getElementById("catalogo-seccion").value,
        categoria: document.getElementById("catalogo-categoria").value,
        codigo_default: document.getElementById("catalogo-codigo").value.trim() || null,
        titulo: tituloVal,
        descripcion: document.getElementById("catalogo-descripcion").value.trim() || null,
        unidad: document.getElementById("catalogo-unidad").value.trim() || "Ud",
        rendimiento_orientativo: parseInt(document.getElementById("catalogo-rendimiento").value) || null,
        precio_orientativo: parseFloat(document.getElementById("catalogo-precio").value) || null,
      };
      var url = _catalogoEditId ? "/api/presupuestos/catalogo/" + _catalogoEditId : "/api/presupuestos/catalogo";
      var method = _catalogoEditId ? "PUT" : "POST";
      var btnG = document.getElementById("btn-catalogo-guardar");
      if (btnG) btnG.disabled = true;

      fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { mostrarToast(data.error, "error"); return; }
          _catalogoCache = null;
          presupCargarCatalogo();
          _catalogoCerrarModal();
          mostrarToast(_catalogoEditId ? "Partida actualizada." : "Partida creada.", "success");
        })
        .catch(function () { mostrarToast("Error al guardar.", "error"); })
        .finally(function () { if (btnG) btnG.disabled = false; });
    });
  }

})();
