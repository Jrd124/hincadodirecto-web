// ═══ IMPUESTOS — seguimiento obligaciones fiscales ═══
(function () {
  var SOCIEDADES = {
    hincado_directo: "Hincado Directo",
    global_nutria: "Global Nutria",
    nutria_capital: "Nutria Capital",
    summitbridge_capital: "Summitbridge Capital"
  };
  var ESTADO_COLORES = {
    pendiente: "#CA8A04",
    en_preparacion: "#2563EB",
    presentado: "#16A34A",
    pagado: "#16A34A"
  };
  var MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  function _fmtEur(n) {
    if (n == null || isNaN(n)) return "\u2014";
    return Math.round(n).toLocaleString("es-ES") + " \u20ac";
  }

  function _esVencida(ob) {
    return ob.estado === "pendiente" && ob.fecha_limite < new Date().toISOString().substring(0, 10);
  }

  function _estadoPill(estado, vencida) {
    if (vencida) return '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;background:#DC262615;color:#DC2626;border:1px solid #DC262630;">Vencida</span>';
    var color = ESTADO_COLORES[estado] || "#64748B";
    var label = estado === "en_preparacion" ? "En prep." : estado.charAt(0).toUpperCase() + estado.slice(1);
    return '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;background:' + color + '15;color:' + color + ';border:1px solid ' + color + '30;">' + label + '</span>';
  }

  // ── Dashboard ──
  window.cargarImpuestos = function () {
    var container = document.getElementById("impuestos-dashboard-content");
    if (!container) return;
    var filtroSoc = document.getElementById("imp-filtro-sociedad");
    var filtroAno = document.getElementById("imp-filtro-ano");
    var sociedad = (filtroSoc && filtroSoc.value) || "";
    var año = (filtroAno && filtroAno.value) || "2026";

    var params = "año=" + año;
    if (sociedad) params += "&sociedad=" + sociedad;

    Promise.all([
      fetch("/api/impuestos/resumen?" + params).then(function (r) { return r.json(); }),
      fetch("/api/impuestos/obligaciones?" + params).then(function (r) { return r.json(); })
    ]).then(function (results) {
      var resumen = results[0];
      var obligaciones = results[1].obligaciones || [];
      var proxima = resumen.proximas && resumen.proximas[0];

      // KPIs
      var kpis =
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;">' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid #CA8A04;border-radius:var(--radius-md);padding:14px 16px;">' +
            '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Pendientes</div>' +
            '<div style="font-size:24px;font-weight:700;color:#CA8A04;margin-top:4px;">' + (resumen.pendiente || 0) + '</div></div>' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid #2563EB;border-radius:var(--radius-md);padding:14px 16px;">' +
            '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;">En preparacion</div>' +
            '<div style="font-size:24px;font-weight:700;color:#2563EB;margin-top:4px;">' + (resumen.en_preparacion || 0) + '</div></div>' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid #16A34A;border-radius:var(--radius-md);padding:14px 16px;">' +
            '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Presentados</div>' +
            '<div style="font-size:24px;font-weight:700;color:#16A34A;margin-top:4px;">' + ((resumen.presentado || 0) + (resumen.pagado || 0)) + '</div></div>' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid #64748B;border-radius:var(--radius-md);padding:14px 16px;">' +
            '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Proximo vencimiento</div>' +
            '<div style="font-size:16px;font-weight:700;color:var(--color-text);margin-top:4px;">' + (proxima ? proxima.fecha_limite.substring(0, 10) : "\u2014") + '</div>' +
            '<div style="font-size:11px;color:var(--color-text-secondary);">' + (proxima ? "Mod. " + proxima.modelo + " - " + (SOCIEDADES[proxima.sociedad] || proxima.sociedad) : "") + '</div></div>' +
        '</div>';

      // Calendar grid
      var modelosUnicos = [];
      var modeloSet = {};
      obligaciones.forEach(function (ob) {
        if (!modeloSet[ob.modelo]) { modeloSet[ob.modelo] = true; modelosUnicos.push(ob.modelo); }
      });
      var calHeader = '<th style="padding:6px 4px;font-size:11px;color:var(--color-text-secondary);text-align:left;min-width:60px;">Modelo</th>';
      MESES.forEach(function (m) { calHeader += '<th style="padding:6px 4px;font-size:11px;color:var(--color-text-secondary);text-align:center;min-width:40px;">' + m + '</th>'; });
      var calRows = modelosUnicos.map(function (mod) {
        var row = '<td style="padding:6px 4px;font-size:13px;font-weight:500;">' + mod + '</td>';
        for (var mi = 0; mi < 12; mi++) {
          var mesStr = String(mi + 1).length === 1 ? "0" + (mi + 1) : String(mi + 1);
          var match = null;
          obligaciones.forEach(function (ob) {
            if (ob.modelo === mod && ob.fecha_limite.substring(5, 7) === mesStr) match = ob;
          });
          if (match) {
            var venc = _esVencida(match);
            var dotColor = venc ? "#DC2626" : (ESTADO_COLORES[match.estado] || "#64748B");
            row += '<td style="text-align:center;padding:6px 4px;cursor:pointer;" onclick="impuestoEditarModal(' + match.id + ')" title="' + match.descripcion + " - " + match.estado + '">' +
              '<div style="width:12px;height:12px;border-radius:50%;background:' + dotColor + ';margin:0 auto;"></div></td>';
          } else {
            row += '<td></td>';
          }
        }
        return '<tr style="border-bottom:1px solid var(--color-border);">' + row + '</tr>';
      }).join("");

      var calendario =
        '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:20px;">' +
          '<div style="padding:12px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);font-size:14px;font-weight:600;">Calendario fiscal ' + año + '</div>' +
          '<div style="padding:0;overflow-x:auto;">' +
            '<table style="width:100%;font-size:13px;border-collapse:collapse;"><thead><tr style="border-bottom:2px solid var(--color-border);">' + calHeader + '</tr></thead><tbody>' + calRows + '</tbody></table>' +
          '</div>' +
          '<div style="padding:8px 16px;display:flex;gap:16px;font-size:11px;color:var(--color-text-secondary);">' +
            '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#CA8A04;vertical-align:middle;margin-right:4px;"></span>Pendiente</span>' +
            '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#2563EB;vertical-align:middle;margin-right:4px;"></span>En prep.</span>' +
            '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#16A34A;vertical-align:middle;margin-right:4px;"></span>Presentado</span>' +
            '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#DC2626;vertical-align:middle;margin-right:4px;"></span>Vencida</span>' +
          '</div>' +
        '</div>';

      // Detail table
      var filas = obligaciones.map(function (ob) {
        var venc = _esVencida(ob);
        return '<tr style="border-bottom:1px solid var(--color-border);cursor:pointer;' + (venc ? 'background:#FEF2F210;' : '') + '" onclick="impuestoEditarModal(' + ob.id + ')">' +
          '<td style="padding:8px 10px;font-size:12px;">' + (SOCIEDADES[ob.sociedad] || ob.sociedad) + '</td>' +
          '<td style="padding:8px 10px;font-weight:500;">Mod. ' + ob.modelo + '</td>' +
          '<td style="padding:8px 10px;">' + ob.periodo + '</td>' +
          '<td style="padding:8px 10px;' + (venc ? 'color:#DC2626;font-weight:600;' : '') + '">' + ob.fecha_limite.substring(0, 10) + '</td>' +
          '<td style="padding:8px 10px;">' + _estadoPill(ob.estado, venc) + '</td>' +
          '<td style="padding:8px 10px;text-align:right;">' + _fmtEur(ob.importe_estimado) + '</td>' +
        '</tr>';
      }).join("");

      var tabla =
        '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
          '<div style="padding:12px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);font-size:14px;font-weight:600;">Obligaciones fiscales</div>' +
          '<div style="max-height:400px;overflow-y:auto;">' +
            '<table style="width:100%;font-size:13px;border-collapse:collapse;"><thead><tr style="border-bottom:2px solid var(--color-border);position:sticky;top:0;background:var(--color-white);">' +
              '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Sociedad</th>' +
              '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Modelo</th>' +
              '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Periodo</th>' +
              '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Fecha limite</th>' +
              '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Estado</th>' +
              '<th style="text-align:right;padding:8px 10px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Importe est.</th>' +
            '</tr></thead><tbody>' + (filas || '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--color-text-secondary);">Sin obligaciones</td></tr>') + '</tbody></table>' +
          '</div>' +
        '</div>';

      container.innerHTML = kpis + calendario + tabla;
    });
  };

  // ── Modal editar ──
  window.impuestoEditarModal = function (id) {
    fetch("/api/impuestos/obligaciones/" + id)
      .then(function (r) { return r.json(); })
      .then(function (ob) {
        if (ob.error) { mostrarToast(ob.error, "error"); return; }
        var existing = document.getElementById("modal-impuesto-editar");
        if (existing) existing.remove();
        var modal = document.createElement("div");
        modal.className = "modal-overlay visible";
        modal.id = "modal-impuesto-editar";
        modal.style.zIndex = "110";
        modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });

        modal.innerHTML =
          '<div class="modal-content" style="max-width:600px;max-height:90vh;overflow-y:auto;">' +
            '<h2 style="margin:0 0 16px;">' + ob.descripcion + '</h2>' +

            '<div style="border-left:3px solid #2563EB;padding:12px 16px;margin-bottom:12px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#2563EB;margin-bottom:12px;">Identificacion</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Sociedad</label>' +
                  '<input type="text" value="' + (SOCIEDADES[ob.sociedad] || ob.sociedad) + '" readonly style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:#f3f4f6;color:#6b7280;cursor:not-allowed;"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Modelo</label>' +
                  '<input type="text" value="Modelo ' + ob.modelo + '" readonly style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:#f3f4f6;color:#6b7280;cursor:not-allowed;"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Periodo</label>' +
                  '<input type="text" value="' + ob.periodo + ' ' + ob.año + '" readonly style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:#f3f4f6;color:#6b7280;cursor:not-allowed;"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Fecha limite</label>' +
                  '<input type="text" value="' + ob.fecha_limite.substring(0, 10) + '" readonly style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:#f3f4f6;color:#6b7280;cursor:not-allowed;"></div>' +
              '</div>' +
            '</div>' +

            '<div style="border-left:3px solid #16A34A;padding:12px 16px;margin-bottom:12px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#16A34A;margin-bottom:12px;">Estado</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Estado</label>' +
                  '<select id="imp-estado" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);">' +
                    '<option value="pendiente"' + (ob.estado === "pendiente" ? " selected" : "") + '>Pendiente</option>' +
                    '<option value="en_preparacion"' + (ob.estado === "en_preparacion" ? " selected" : "") + '>En preparacion</option>' +
                    '<option value="presentado"' + (ob.estado === "presentado" ? " selected" : "") + '>Presentado</option>' +
                    '<option value="pagado"' + (ob.estado === "pagado" ? " selected" : "") + '>Pagado</option>' +
                  '</select></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">N\u00BA referencia</label>' +
                  '<input type="text" id="imp-referencia" value="' + (ob.numero_referencia || "") + '" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Fecha presentacion</label>' +
                  '<input type="date" id="imp-fecha-pres" value="' + (ob.fecha_presentacion || "").substring(0, 10) + '" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Fecha pago</label>' +
                  '<input type="date" id="imp-fecha-pago" value="' + (ob.fecha_pago || "").substring(0, 10) + '" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
              '</div>' +
            '</div>' +

            '<div style="border-left:3px solid #CA8A04;padding:12px 16px;margin-bottom:12px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#CA8A04;margin-bottom:12px;">Importes</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Importe estimado</label>' +
                  '<input type="number" id="imp-estimado" value="' + (ob.importe_estimado || 0) + '" step="0.01" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Importe real</label>' +
                  '<input type="number" id="imp-real" value="' + (ob.importe_real || "") + '" step="0.01" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);"></div>' +
              '</div>' +
            '</div>' +

            '<div style="border-left:3px solid #64748B;padding:12px 16px;margin-bottom:16px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#64748B;margin-bottom:12px;">Notas</div>' +
              '<div style="display:grid;gap:10px;">' +
                '<div><label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text-secondary);cursor:pointer;">' +
                  '<input type="checkbox" id="imp-asesoria"' + (ob.asesoria_notificada ? " checked" : "") + '> Asesoria notificada</label></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Notas</label>' +
                  '<textarea id="imp-notas" rows="3" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);resize:vertical;">' + (ob.notas || "") + '</textarea></div>' +
              '</div>' +
            '</div>' +

            '<div style="border-left:3px solid #7C3AED;padding:12px 16px;margin-bottom:16px;background:var(--color-bg-page);border-radius:0 8px 8px 0;">' +
              '<div style="font-size:14px;font-weight:600;color:#7C3AED;margin-bottom:12px;">Documentos</div>' +
              '<div id="imp-docs-lista" style="margin-bottom:12px;"><div style="color:var(--color-text-secondary);font-size:13px;">Cargando...</div></div>' +
              '<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;">' +
                '<div style="flex:1;min-width:150px;"><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Archivo</label>' +
                  '<input type="file" id="imp-doc-file" style="font-size:12px;"></div>' +
                '<div><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Tipo</label>' +
                  '<select id="imp-doc-tipo" style="padding:7px 8px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:12px;">' +
                    '<option value="modelo">Modelo presentado</option><option value="justificante">Justificante pago</option><option value="borrador">Borrador</option><option value="otro">Otro</option>' +
                  '</select></div>' +
                '<button style="padding:7px 14px;font-size:12px;font-weight:500;color:white;background:#7C3AED;border:none;border-radius:6px;cursor:pointer;" onclick="impuestoSubirDoc(' + id + ')">Subir</button>' +
              '</div>' +
            '</div>' +

            '<div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--color-border);">' +
              '<button class="secondary" style="padding:8px 20px;" onclick="document.getElementById(\'modal-impuesto-editar\').remove()">Cancelar</button>' +
              '<button class="primary" style="width:auto;padding:8px 20px;" onclick="impuestoGuardar(' + id + ')">Guardar</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(modal);
        _impCargarDocs(id);
      });
  };

  window.impuestoGuardar = function (id) {
    var body = {
      estado: (document.getElementById("imp-estado") || {}).value || "pendiente",
      numero_referencia: (document.getElementById("imp-referencia") || {}).value || "",
      fecha_presentacion: (document.getElementById("imp-fecha-pres") || {}).value || "",
      fecha_pago: (document.getElementById("imp-fecha-pago") || {}).value || "",
      importe_estimado: parseFloat((document.getElementById("imp-estimado") || {}).value) || 0,
      importe_real: parseFloat((document.getElementById("imp-real") || {}).value) || null,
      asesoria_notificada: (document.getElementById("imp-asesoria") || {}).checked ? 1 : 0,
      notas: (document.getElementById("imp-notas") || {}).value || "",
    };
    fetch("/api/impuestos/obligaciones/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.error) { mostrarToast(res.error, "error"); return; }
        var m = document.getElementById("modal-impuesto-editar");
        if (m) m.remove();
        mostrarToast("Obligacion actualizada.", "success");
        cargarImpuestos();
      })
      .catch(function () { mostrarToast("Error de conexion.", "error"); });
  };

  // ── Documentos ──

  function _impCargarDocs(obligacionId) {
    var container = document.getElementById("imp-docs-lista");
    if (!container) return;
    fetch("/api/impuestos/obligaciones/" + obligacionId + "/documentos")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var docs = data.documentos || [];
        if (!docs.length) {
          container.innerHTML = '<div style="color:var(--color-text-secondary);font-size:13px;font-style:italic;">Sin documentos adjuntos</div>';
          return;
        }
        var tipoLabels = { modelo: "Modelo", justificante: "Justificante", borrador: "Borrador", otro: "Otro" };
        container.innerHTML = docs.map(function (d) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--color-border);">' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (d.nombre_archivo || "") + '</div>' +
              '<div style="font-size:11px;color:var(--color-text-secondary);">' + (tipoLabels[d.tipo] || d.tipo) + ' \u00b7 ' + (d.fecha_subida || "").substring(0, 10) + '</div>' +
            '</div>' +
            (d.ruta_archivo ? '<button onclick="window.open(\'/api/archivo?ruta=' + encodeURIComponent(d.ruta_archivo) + '\',\'_blank\')" title="Ver" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--color-text-secondary);" onmouseover="this.style.color=\'var(--color-primary)\'" onmouseout="this.style.color=\'var(--color-text-secondary)\'">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>' : '') +
            '<button onclick="impuestoEliminarDoc(' + d.id + ',' + obligacionId + ')" title="Eliminar" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--color-text-secondary);" onmouseover="this.style.color=\'#DC2626\'" onmouseout="this.style.color=\'var(--color-text-secondary)\'">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>' +
          '</div>';
        }).join("");
      });
  }

  window.impuestoSubirDoc = function (obligacionId) {
    var fileInput = document.getElementById("imp-doc-file");
    var tipoSel = document.getElementById("imp-doc-tipo");
    if (!fileInput || !fileInput.files[0]) { mostrarToast("Selecciona un archivo", "error"); return; }
    var fd = new FormData();
    fd.append("archivo", fileInput.files[0]);
    fd.append("tipo", tipoSel ? tipoSel.value : "modelo");
    fetch("/api/impuestos/obligaciones/" + obligacionId + "/documentos", { method: "POST", body: fd })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) {
          mostrarToast("Documento subido.", "success");
          fileInput.value = "";
          _impCargarDocs(obligacionId);
        } else {
          mostrarToast(res.data.error || "Error al subir", "error");
        }
      })
      .catch(function () { mostrarToast("Error de conexion.", "error"); });
  };

  window.impuestoEliminarDoc = function (docId, obligacionId) {
    if (!confirm("Eliminar este documento?")) return;
    fetch("/api/impuestos/documentos/" + docId, { method: "DELETE" })
      .then(function (r) {
        if (r.ok) { mostrarToast("Documento eliminado.", "success"); _impCargarDocs(obligacionId); }
        else { mostrarToast("Error al eliminar.", "error"); }
      });
  };

  // Auto-load on panel visibility
  var panel = document.getElementById("panel-impuestos-inicio");
  if (panel) {
    new MutationObserver(function () {
      if (panel.classList.contains("visible")) cargarImpuestos();
    }).observe(panel, { attributes: true, attributeFilter: ["class"] });
  }
})();
