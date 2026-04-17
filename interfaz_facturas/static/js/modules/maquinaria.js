// ═══ MAQUINARIA — máquinas, checks, incidencias ═══

function cargarMaquinaria() {
  var container = document.getElementById("maquinaria-content");
  if (!container) return;

  fetch("/api/maquinaria/maquinas")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var maq = data.maquinas || [];
      var nDisp = 0, nProy = 0, nTaller = 0, nBaja = 0;
      maq.forEach(function (m) {
        var est = m.estado_computado || m.estado;
        if (est === "disponible") nDisp++;
        else if (est === "en_proyecto") nProy++;
        else if (est === "en_taller") nTaller++;
        else if (est === "baja") nBaja++;
      });

      var estadoColors = { disponible: "#16A34A", en_proyecto: "#2563EB", en_taller: "#CA8A04", baja: "#DC2626" };
      var estadoLabels = { disponible: "Disponible", en_proyecto: "En proyecto", en_taller: "En taller", baja: "De baja" };

      function _kpi(label, n, color) {
        return '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid ' + color + ';border-radius:var(--radius-md);padding:12px 16px;">' +
          '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;">' + label + '</div>' +
          '<div style="font-size:22px;font-weight:700;color:' + color + ';">' + n + '</div></div>';
      }

      var cards = maq.map(function (m) {
        var est = m.estado_computado || m.estado;
        var c = estadoColors[est] || "#64748B";
        var lbl = estadoLabels[est] || est;
        return '<div onclick="maqDetalle(' + m.id + ')" style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;cursor:pointer;transition:border-color 0.15s;border-top:3px solid ' + c + ';" ' +
          'onmouseover="this.style.borderColor=\'var(--color-primary)\'" onmouseout="this.style.borderColor=\'var(--color-border)\';this.style.borderTopColor=\'' + c + '\'">' +
          '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">' +
            '<div><div style="font-size:18px;font-weight:600;">' + _esc(m.nombre) + '</div>' +
              '<div style="font-size:12px;color:var(--color-text-secondary);">' + _esc(m.internal_id) + ' \u00b7 ' + _esc(m.modelo) + '</div></div>' +
            '<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:' + c + '15;color:' + c + ';font-weight:500;">' + lbl + '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div><div style="font-size:11px;color:var(--color-text-secondary);">Hor\u00f3metro</div>' +
              '<div style="font-size:16px;font-weight:600;">' + (m.horometro_actual || 0).toLocaleString("es-ES") + 'h</div></div>' +
            '<div><div style="font-size:11px;color:var(--color-text-secondary);">Proyecto</div>' +
              '<div style="font-size:13px;font-weight:500;">' + (m.proyecto_actual && (m.proyecto_actual.nombre || m.proyecto_actual.codigo) ? _esc(m.proyecto_actual.nombre || m.proyecto_actual.codigo) : (m.proyecto_nombre ? _esc(m.proyecto_nombre) : '\u2014')) + '</div></div>' +
          '</div>' +
          (m.operario_nombre ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--color-border);font-size:12px;color:var(--color-text-secondary);display:flex;align-items:center;justify-content:space-between;">' +
            '<span>\ud83d\udc77 ' + _esc(m.operario_nombre) + '</span>' +
            (m.responsable_id ? '<button onclick="event.stopPropagation();maqCopiarTelegramLink(' + m.responsable_id + ')" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 4px;" title="Copiar enlace Telegram para este operario">\u2709\ufe0f</button>' : '') +
          '</div>' : '') +
          '</div>';
      }).join("");

      container.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
          '<div><h1 style="margin:0;font-size:22px;">Maquinaria</h1>' +
            '<p style="margin:4px 0 0;font-size:14px;color:var(--color-text-secondary);">' + maq.length + ' m\u00e1quinas registradas</p></div>' +
          '<button class="btn-primary" style="width:auto;padding:8px 18px;font-size:14px;" onclick="maqNuevaModal()">+ Nueva m\u00e1quina</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;" id="maq-kpis">' +
          _kpi("Disponibles", nDisp, "#16A34A") +
          _kpi("En proyecto", nProy, "#2563EB") +
          _kpi("En taller", nTaller, "#CA8A04") +
          _kpi("De baja", nBaja, "#DC2626") +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;">' + cards + '</div>';
    });
}
window.cargarMaquinaria = cargarMaquinaria;

window.maqDetalle = function (maqId) {
  fetch("/api/maquinaria/maquinas/" + maqId)
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (m) {
      var container = document.getElementById("maquinaria-detalle-content");
      var estadoColors = { disponible: "#16A34A", en_proyecto: "#2563EB", en_taller: "#CA8A04", baja: "#DC2626" };
      var estadoLabelsD = { disponible: "Disponible", en_proyecto: "En proyecto", en_taller: "En taller", baja: "De baja" };
      var estComp = m.estado_computado || m.estado;
      var color = estadoColors[estComp] || "#64748B";

      // Revisiones pendientes badges
      var revPend = "";
      if (m.revisiones_pendientes && m.revisiones_pendientes.length) {
        revPend = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
          m.revisiones_pendientes.map(function (r) {
            var urg = r.urgente;
            var hito = r.proximo_hito ? r.proximo_hito.toLocaleString("es-ES") + 'h' : r.tipo;
            var label = hito + ' <span style="opacity:0.7;font-size:11px;">(' + r.tipo + ')</span>';
            return '<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:99px;font-size:12px;font-weight:500;' +
              'background:' + (urg ? '#DC262615' : '#CA8A0415') + ';color:' + (urg ? '#DC2626' : '#CA8A04') + ';' +
              'border:1px solid ' + (urg ? '#DC262630' : '#CA8A0430') + ';">' +
              label + (urg ? ' \u00a1atrasada!' : '') +
              '<button onclick="event.stopPropagation();maqCompletarRevision(' + m.id + ',' + r.intervalo + ',' + (m.horometro_actual || 0) + ')" ' +
              'style="background:none;border:none;cursor:pointer;font-size:14px;padding:0 2px;line-height:1;" title="Marcar como realizada">\u2713</button>' +
              '</span>';
          }).join("") + '</div>';
      } else {
        revPend = '<span style="color:#16A34A;font-size:13px;">\u2713 Todas al d\u00eda</span>';
      }

      // Checks rows
      var checksHtml = "";
      if (m.checks && m.checks.length) {
        checksHtml = m.checks.map(function (c) {
          return '<div onclick="maqVerCheck(' + c.id + ',' + m.id + ')" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--color-border);cursor:pointer;transition:background 0.1s;" onmouseover="this.style.background=\'var(--color-bg-secondary)\'" onmouseout="this.style.background=\'transparent\'">' +
            '<div><span style="font-size:13px;font-weight:500;">' + (c.fecha || "").substring(0, 10) + '</span>' +
              '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:8px;">' + (c.horometro || 0) + 'h</span>' +
              (c.usuario_nombre ? '<span style="font-size:11px;color:var(--color-text-secondary);margin-left:8px;">por ' + _esc(c.usuario_nombre) + '</span>' : '') +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + (c.estado === "cerrado" ? '#16A34A15' : '#CA8A0415') + ';color:' + (c.estado === "cerrado" ? '#16A34A' : '#CA8A04') + ';">' + c.estado + '</span>' +
              '<span style="font-size:11px;color:var(--color-text-secondary);">\u203A</span>' +
            '</div>' +
          '</div>';
        }).join("");
      } else {
        checksHtml = '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:16px;">Sin checks registrados</p>';
      }

      // Revisiones rows — combinar legacy + histórico de maintenance_logs
      var allRevs = [];
      if (m.revisiones && m.revisiones.length) {
        m.revisiones.forEach(function (r) {
          allRevs.push({ h: r.horometro_al_revision || 0, fecha: (r.fecha || "").substring(0, 10), tipo: r.tipo, estado: r.estado, tareas: null, src: "legacy" });
        });
      }
      if (m.revisiones_historico && m.revisiones_historico.length) {
        m.revisiones_historico.forEach(function (r) {
          allRevs.push({ h: r.horometro_al_revision || 0, fecha: (r.fecha || "").substring(0, 10), tipo: "hist\u00f3rico", estado: "cerrado", tareas: r.n_tareas, src: "log" });
        });
      }
      // Ordenar por horómetro desc
      allRevs.sort(function (a, b) { return b.h - a.h; });

      var revsHtml = "";
      if (allRevs.length) {
        revsHtml = allRevs.map(function (r) {
          var badge = r.src === "log"
            ? '<span style="font-size:12px;padding:2px 8px;border-radius:99px;background:#2563EB15;color:#2563EB;font-weight:500;">' + r.h + 'h</span>'
            : '<span style="font-size:12px;padding:2px 8px;border-radius:99px;background:#7C3AED15;color:#7C3AED;font-weight:500;">' + r.tipo + '</span>';
          var tareasInfo = r.tareas ? '<span style="font-size:11px;color:var(--color-text-secondary);margin-left:6px;">' + r.tareas + ' tareas</span>' : '';
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--color-border);">' +
            '<div>' + badge +
              '<span style="font-size:13px;margin-left:8px;">' + r.fecha + '</span>' +
              (r.src === "legacy" ? '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:6px;">' + r.h + 'h</span>' : '') +
              tareasInfo + '</div>' +
            '<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:#16A34A15;color:#16A34A;">\u2713 Realizada</span>' +
          '</div>';
        }).join("");
      } else {
        revsHtml = '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:16px;">Sin revisiones registradas</p>';
      }

      // Incidencias
      var incHtml = "";
      if (m.incidencias && m.incidencias.length) {
        var sevColors = { baja: "#64748B", media: "#CA8A04", alta: "#DC2626", seguridad: "#7C3AED" };
        incHtml = m.incidencias.map(function (i) {
          var sc = sevColors[i.severidad] || "#64748B";
          return '<div style="border:1px solid var(--color-border);border-left:3px solid ' + sc + ';border-radius:var(--radius-md);padding:12px;margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:start;">' +
              '<div><span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + sc + '15;color:' + sc + ';font-weight:500;text-transform:uppercase;">' + i.severidad + '</span>' +
                '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:8px;">' + (i.fecha || "").substring(0, 10) + '</span></div>' +
              '<button onclick="maqCerrarIncidencia(' + i.id + ',' + m.id + ')" class="btn-outline" style="font-size:11px;padding:2px 8px;">Cerrar</button>' +
            '</div>' +
            '<p style="font-size:13px;margin:8px 0 0;">' + _esc(i.descripcion) + '</p>' +
            (i.usuario_nombre ? '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">Reportada por ' + _esc(i.usuario_nombre) + '</div>' : '') +
          '</div>';
        }).join("");
      } else {
        incHtml = '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:16px;">Sin incidencias abiertas \u2713</p>';
      }

      container.innerHTML =
        // Header
        '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px;">' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
              '<button onclick="maqVolver()" style="background:none;border:none;cursor:pointer;font-size:18px;padding:0;color:var(--color-text-secondary);">\u2190</button>' +
              '<h1 style="margin:0;font-size:24px;">' + _esc(m.nombre) + '</h1>' +
              '<span style="font-size:12px;padding:3px 10px;border-radius:99px;background:' + color + '15;color:' + color + ';font-weight:500;">' + (estadoLabelsD[estComp] || estComp) + '</span>' +
            '</div>' +
            '<div style="font-size:14px;color:var(--color-text-secondary);">' + _esc(m.internal_id) + ' \u00b7 ' + _esc(m.modelo) +
              (m.numero_serie ? ' \u00b7 S/N: ' + _esc(m.numero_serie) : '') +
              (m.proyecto_actual && (m.proyecto_actual.nombre || m.proyecto_actual.codigo) ? ' \u00b7 \uD83D\uDCCD ' + _esc(m.proyecto_actual.nombre || m.proyecto_actual.codigo) : (m.proyecto_nombre ? ' \u00b7 \uD83D\uDCCD ' + _esc(m.proyecto_nombre) : '')) + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button class="btn-primary" style="width:auto;padding:8px 16px;" onclick="maqNuevoCheck(' + m.id + ')">\uD83D\uDCCB Check semanal</button>' +
            '<button class="btn-outline" style="padding:8px 16px;" onclick="maqNuevaIncidencia(' + m.id + ')">\u26A0\uFE0F Incidencia</button>' +
            '<button class="btn-outline" style="padding:8px 16px;" onclick="maqTokensModal(' + m.id + ')">\uD83D\uDD11 Tokens</button>' +
            '<div style="position:relative;display:inline-block;">' +
              '<button class="btn-outline" style="padding:8px 16px;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'block\'?\'none\':\'block\'">Exportar \u25BE</button>' +
              '<div style="display:none;position:absolute;right:0;top:100%;margin-top:4px;background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-md);box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:50;min-width:200px;">' +
                '<div onclick="maqExportHistory(' + m.id + ',\'pdf\')" style="padding:10px 16px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--color-border);" onmouseover="this.style.background=\'var(--color-bg-secondary)\'" onmouseout="this.style.background=\'\'">Historial de servicio (PDF)</div>' +
                '<div onclick="maqExportHistory(' + m.id + ',\'xlsx\')" style="padding:10px 16px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--color-border);" onmouseover="this.style.background=\'var(--color-bg-secondary)\'" onmouseout="this.style.background=\'\'">Historial de servicio (Excel)</div>' +
                '<div onclick="maqCertificadoModal(' + m.id + ')" style="padding:10px 16px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--color-border);" onmouseover="this.style.background=\'var(--color-bg-secondary)\'" onmouseout="this.style.background=\'\'">Certificado CAE / PRL</div>' +
                '<div onclick="maqExportPassport(' + m.id + ')" style="padding:10px 16px;cursor:pointer;font-size:13px;" onmouseover="this.style.background=\'var(--color-bg-secondary)\'" onmouseout="this.style.background=\'\'">Asset Passport</div>' +
              '</div>' +
            '</div>' +
            '<button class="btn-outline" style="padding:8px 16px;" onclick="maqEditarModal(' + m.id + ')">Editar</button>' +
            (estComp !== 'baja'
              ? '<button class="btn-outline" style="padding:8px 16px;color:#DC2626;border-color:#DC2626;" onclick="maqDecomisionar(' + m.id + ',\'' + _esc(m.nombre) + '\')">Decomisionar</button>'
              : '<button class="btn-outline" style="padding:8px 16px;color:#16A34A;border-color:#16A34A;" onclick="maqReactivar(' + m.id + ',\'' + _esc(m.nombre) + '\')">Reactivar</button>') +
          '</div>' +
        '</div>' +

        // KPIs
        '<div style="display:grid;grid-template-columns:250px 1fr 180px;gap:14px;margin-bottom:20px;">' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
            '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:6px;">Hor\u00f3metro</div>' +
            '<div style="font-size:28px;font-weight:700;">' + (m.horometro_actual || 0).toLocaleString("es-ES") + 'h</div>' +
            '<div style="font-size:12px;color:var(--color-text-secondary);">Inicial: ' + (m.horometro_inicial || 0).toLocaleString("es-ES") + 'h \u00b7 Comisi\u00f3n: ' + (m.fecha_comision ? m.fecha_comision.substring(0, 4) : '\u2014') + '</div></div>' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
            '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:8px;">Revisiones pendientes</div>' + revPend + '</div>' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
            '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:6px;">Incidencias abiertas</div>' +
            '<div style="font-size:28px;font-weight:700;color:' + (m.incidencias && m.incidencias.length ? '#DC2626' : '#16A34A') + ';">' + (m.incidencias ? m.incidencias.length : 0) + '</div></div>' +
        '</div>' +

        // 2 columns
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
          '<div style="display:flex;flex-direction:column;gap:14px;">' +
            // Checks
            '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                '<span style="font-size:14px;font-weight:600;">\uD83D\uDCCB Checks semanales</span>' +
                '<span style="font-size:12px;color:var(--color-text-secondary);">' + (m.checks ? m.checks.length : 0) + ' registrados</span></div>' +
              '<div style="padding:12px;max-height:250px;overflow-y:auto;">' + checksHtml + '</div></div>' +
            // Revisiones
            '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                '<span style="font-size:14px;font-weight:600;">\uD83D\uDD27 Revisiones por hor\u00f3metro</span>' +
                '<span style="font-size:12px;color:var(--color-text-secondary);">' + allRevs.length + ' realizadas</span></div>' +
              '<div style="padding:12px;max-height:250px;overflow-y:auto;">' + revsHtml + '</div></div>' +
          '</div>' +
          // Incidencias
          '<div>' +
            '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                '<span style="font-size:14px;font-weight:600;">\u26A0\uFE0F Incidencias abiertas</span>' +
                '<button class="btn-outline" style="font-size:12px;padding:3px 10px;" onclick="maqNuevaIncidencia(' + m.id + ')">+ Nueva</button></div>' +
              '<div style="padding:12px;max-height:500px;overflow-y:auto;">' + incHtml + '</div></div>' +
          '</div>' +
        '</div>' +

        // Charts section
        '<div id="maq-charts-section" style="margin-top:20px;">' +
          '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
            '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
              '<span style="font-size:14px;font-weight:600;">Análisis de consumo de horas</span>' +
              '<span id="maq-charts-stats" style="font-size:12px;color:var(--color-text-secondary);"></span>' +
            '</div>' +
            '<div style="padding:16px;">' +
              '<div id="maq-charts-loading" style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:24px;">Cargando gráficos...</div>' +
              '<div id="maq-charts-empty" style="display:none;text-align:center;color:var(--color-text-secondary);font-size:13px;padding:24px;">Datos insuficientes para generar gráficos (se necesitan al menos 2 lecturas de horómetro).</div>' +
              '<div id="maq-charts-container" style="display:none;">' +
                '<div style="margin-bottom:20px;"><canvas id="maq-chart-cumulative" height="220"></canvas></div>' +
                '<div><canvas id="maq-chart-biweekly" height="220"></canvas></div>' +
                '<div id="maq-charts-summary" style="margin-top:16px;padding:12px 16px;background:var(--color-bg-secondary);border-radius:var(--radius-md);font-size:13px;color:var(--color-text-secondary);"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Responsable de mantenimiento section
        '<div id="maq-responsable-section" style="margin-top:20px;">' +
          '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
            '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);">' +
              '<span style="font-size:14px;font-weight:600;">\uD83D\uDC64 Responsable de mantenimiento</span>' +
            '</div>' +
            '<div style="padding:16px;">' +
              '<div style="display:flex;align-items:center;gap:12px;">' +
                '<select id="maq-resp-select" class="form-input" style="flex:1;max-width:350px;">' +
                  '<option value="">Sin responsable asignado</option>' +
                '</select>' +
                '<button class="btn-primary" style="width:auto;padding:8px 16px;" onclick="maqGuardarResponsable(' + m.id + ')">Guardar</button>' +
              '</div>' +
              (m.responsable_nombre
                ? '<div style="margin-top:10px;padding:10px 14px;background:var(--color-bg-secondary);border-radius:var(--radius-md);font-size:13px;">' +
                    '<strong>' + _esc(m.responsable_nombre) + '</strong>' +
                    (m.responsable_telefono ? '<span style="color:var(--color-text-secondary);margin-left:8px;">' + _esc(m.responsable_telefono) + '</span>' : '') +
                  '</div>'
                : '') +
            '</div>' +
          '</div>' +
        '</div>' +

        // Auditor links section
        '<div id="maq-auditor-section" style="margin-top:20px;">' +
          '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
            '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
              '<span style="font-size:14px;font-weight:600;">\uD83D\uDD17 Compartir con auditor</span>' +
              '<button class="btn-primary" style="font-size:12px;padding:4px 12px;width:auto;" onclick="maqCrearAuditorLink(' + m.id + ')">+ Nuevo link</button>' +
            '</div>' +
            '<div id="maq-auditor-links" style="padding:12px;">' +
              '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:8px;">Cargando...</p>' +
            '</div>' +
          '</div>' +
        '</div>';

      // Store revision data for certificate modal
      window._maqRevHistorico = m.revisiones_historico || [];

      // Show detail panel, hide list
      document.getElementById("panel-maquinaria").classList.remove("visible");
      document.getElementById("panel-maquinaria-detalle").classList.add("visible");

      // ═══ CHARTS: Hourometer evolution & biweekly consumption ═══
      _maqLoadCharts(m.id);

      // ═══ AUDITOR LINKS ═══
      _maqLoadAuditorLinks(m.id);

      // ═══ RESPONSABLE DROPDOWN ═══
      _maqLoadResponsableSelect(m.responsable_id);
    })
    .catch(function () { mostrarToast("Error al cargar m\u00e1quina", "error"); });
};

window.maqExportHistory = function (maqId, format) {
  // Close dropdown
  document.querySelectorAll('[style*="z-index:50"]').forEach(function (d) { d.style.display = "none"; });
  mostrarToast("Generando " + format.toUpperCase() + "...", "info");
  var url = "/api/maquinaria/maquinas/" + maqId + "/export/service-history?format=" + format;
  fetch(url).then(function (res) {
    if (!res.ok) throw new Error("Error " + res.status);
    var fname = "historial." + format;
    var cd = res.headers.get("Content-Disposition");
    if (cd) {
      var match = cd.match(/filename=(.+)/);
      if (match) fname = match[1];
    }
    return res.blob().then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      URL.revokeObjectURL(a.href);
      mostrarToast("Descargado: " + fname, "success");
    });
  }).catch(function (err) { mostrarToast("Error: " + err.message, "error"); });
};

window.maqExportPassport = function (maqId) {
  // Close dropdown
  document.querySelectorAll('[style*="z-index:50"]').forEach(function (d) { d.style.display = "none"; });
  mostrarToast("Generando Asset Passport...", "info");
  var url = "/api/maquinaria/maquinas/" + maqId + "/asset-passport";
  fetch(url).then(function (res) {
    if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || "Error " + res.status); });
    var fname = "asset_passport.pdf";
    var cd = res.headers.get("Content-Disposition");
    if (cd) {
      var match = cd.match(/filename=(.+)/);
      if (match) fname = match[1];
    }
    return res.blob().then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      URL.revokeObjectURL(a.href);
      mostrarToast("Descargado: " + fname, "success");
    });
  }).catch(function (err) { mostrarToast("Error: " + err.message, "error"); });
};

// ═══════════════════════════════════════════════════════════════════════════════
// ██  Charts: Hourometer evolution & biweekly consumption                    ██
// ═══════════════════════════════════════════════════════════════════════════════

// Track chart instances to destroy on re-render
var _maqChartInstances = [];

function _maqLoadCharts(maqId) {
  _maqChartInstances.forEach(function (c) { c.destroy(); });
  _maqChartInstances = [];

  fetch("/api/maquinaria/maquinas/" + maqId + "/chart-data")
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (data) {
      var loadingEl = document.getElementById("maq-charts-loading");
      var emptyEl = document.getElementById("maq-charts-empty");
      var containerEl = document.getElementById("maq-charts-container");
      if (!loadingEl) return;

      loadingEl.style.display = "none";

      if (!data.readings || data.readings.length < 2) {
        emptyEl.style.display = "block";
        return;
      }
      containerEl.style.display = "block";

      var AZ = "#2563EB";
      var VE = "#16A34A";

      // ── Chart 1: Cumulative hourometer (line + area) ──
      var labels1 = data.readings.map(function (r) { return r.date; });
      var values1 = data.readings.map(function (r) { return r.horo; });

      var ctx1 = document.getElementById("maq-chart-cumulative").getContext("2d");
      var chart1 = new Chart(ctx1, {
        type: "line",
        data: {
          labels: labels1,
          datasets: [{
            label: "Horómetro (h)",
            data: values1,
            borderColor: AZ,
            backgroundColor: AZ + "25",
            fill: true,
            tension: 0.2,
            pointRadius: 3,
            pointBackgroundColor: AZ,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: "Evolución del horómetro", font: { size: 14, weight: "bold" }, color: "#1E293B", padding: { bottom: 10 } },
            legend: { display: false }
          },
          scales: {
            x: {
              type: "time",
              time: { unit: "month", tooltipFormat: "dd/MM/yyyy", displayFormats: { month: "MMM yyyy" } },
              grid: { display: false },
              ticks: { font: { size: 10 }, maxRotation: 30 }
            },
            y: {
              title: { display: true, text: "Horómetro (h)", font: { size: 11 } },
              grid: { color: "#E2E8F020" },
              ticks: { font: { size: 10 } }
            }
          }
        }
      });
      _maqChartInstances.push(chart1);

      // ── Chart 2: Biweekly consumption (bar) ──
      var labels2 = data.biweekly.map(function (b) { return b.label; });
      var values2 = data.biweekly.map(function (b) { return b.consumption; });
      var barColors = values2.map(function (v) { return v > 0 ? AZ + "CC" : "#E2E8F0"; });
      var avg = values2.length ? values2.reduce(function (a, b) { return a + b; }, 0) / values2.length : 0;

      var avgData = values2.map(function () { return Math.round(avg * 10) / 10; });

      var ctx2 = document.getElementById("maq-chart-biweekly").getContext("2d");
      var chart2 = new Chart(ctx2, {
        type: "bar",
        data: {
          labels: labels2,
          datasets: [
            {
              label: "Horas consumidas",
              data: values2,
              backgroundColor: barColors,
              borderRadius: 3,
              barPercentage: 0.7,
              order: 2
            },
            {
              label: "Media: " + avg.toFixed(0) + "h",
              data: avgData,
              type: "line",
              borderColor: VE,
              borderWidth: 1.5,
              borderDash: [6, 3],
              pointRadius: 0,
              fill: false,
              order: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: "Consumo bisemanal de horas", font: { size: 14, weight: "bold" }, color: "#1E293B", padding: { bottom: 10 } },
            legend: {
              display: true,
              labels: { font: { size: 10 }, usePointStyle: true, filter: function (item) { return item.datasetIndex === 1; } }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 30 } },
            y: {
              title: { display: true, text: "Horas", font: { size: 11 } },
              grid: { color: "#E2E8F020" },
              ticks: { font: { size: 10 }, precision: 0 }
            }
          }
        }
      });
      _maqChartInstances.push(chart2);

      // ── Summary stats ──
      if (data.stats) {
        var s = data.stats;
        var statsEl = document.getElementById("maq-charts-stats");
        var summaryEl = document.getElementById("maq-charts-summary");
        if (statsEl) statsEl.textContent = s.period_start + " — " + s.period_end;
        if (summaryEl) {
          summaryEl.innerHTML =
            '<strong>Resumen de actividad</strong><br>' +
            'Período: ' + s.period_start + ' — ' + s.period_end +
            ' · Horas totales operadas: ' + s.total_hours.toLocaleString("es-ES") + 'h' +
            ' · Media semanal: ' + s.avg_weekly + 'h' +
            ' · Media mensual: ' + s.avg_monthly + 'h' +
            ' · Utilización estimada: ' + s.utilization_pct + '% (sobre 50h/semana)';
        }
      }
    })
    .catch(function () {
      var loadingEl = document.getElementById("maq-charts-loading");
      if (loadingEl) loadingEl.textContent = "Error al cargar gráficos.";
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██  Auditor Links: Compartir con auditor (Fase 4)                          ██
// ═══════════════════════════════════════════════════════════════════════════════

function _maqLoadAuditorLinks(maqId) {
  fetch("/api/maquinaria/auditor-links?maquina_id=" + maqId)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var container = document.getElementById("maq-auditor-links");
      if (!container) return;
      var links = data.links || [];
      var now = new Date().toISOString();

      // Filter to non-expired
      var active = links.filter(function (l) { return l.expires_at > now; });

      if (!active.length) {
        container.innerHTML = '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:8px;">No hay links de auditor activos. Crea uno para compartir la ficha de esta máquina con un comprador o banco.</p>';
        return;
      }

      container.innerHTML = active.map(function (l) {
        var url = window.location.origin + "/audit/" + l.token;
        var expires = (l.expires_at || "").substring(0, 10);
        var dest = l.nombre_destinatario || "Sin nombre";
        var accesos = l.accesos_count || 0;
        var maxAcc = l.max_accesos ? " / " + l.max_accesos : "";
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:8px;">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:500;">' + _esc(dest) + '</div>' +
            '<div style="font-size:11px;color:var(--color-text-secondary);">Expira: ' + expires + ' · Accesos: ' + accesos + maxAcc + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;align-items:center;">' +
            '<button onclick="maqCopyAuditUrl(\'' + l.token + '\')" class="btn-outline" style="font-size:11px;padding:3px 10px;" title="Copiar enlace">Copiar link</button>' +
            '<button onclick="maqVerAuditLog(' + l.id + ')" class="btn-outline" style="font-size:11px;padding:3px 10px;" title="Ver accesos">Log</button>' +
            '<button onclick="maqRevocarAuditorLink(' + l.id + ',' + maqId + ')" class="btn-outline" style="font-size:11px;padding:3px 10px;color:#DC2626;border-color:#DC2626;" title="Revocar">Revocar</button>' +
          '</div>' +
        '</div>';
      }).join("");
    })
    .catch(function () {
      var container = document.getElementById("maq-auditor-links");
      if (container) container.innerHTML = '<p style="text-align:center;color:#DC2626;font-size:13px;">Error al cargar links</p>';
    });
}

window.maqCrearAuditorLink = function (maqId) {
  var nombre = prompt("Nombre del destinatario (ej: Banco Santander, comprador X):");
  if (nombre === null) return;
  var dias = prompt("Días de validez (1-90):", "14");
  if (dias === null) return;
  dias = parseInt(dias) || 14;

  fetch("/api/maquinaria/auditor-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maquina_id: maqId, nombre_destinatario: nombre, dias_expiracion: dias })
  })
    .then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || "Error"); });
      return r.json();
    })
    .then(function (link) {
      var url = window.location.origin + "/audit/" + link.token;
      mostrarToast("Link creado. Copiado al portapapeles.", "success");
      navigator.clipboard.writeText(url).catch(function () {});
      _maqLoadAuditorLinks(maqId);
    })
    .catch(function (err) { mostrarToast("Error: " + err.message, "error"); });
};

window.maqCopyAuditUrl = function (token) {
  var url = window.location.origin + "/audit/" + token;
  navigator.clipboard.writeText(url).then(function () {
    mostrarToast("Link copiado al portapapeles", "success");
  }).catch(function () {
    prompt("Copia este enlace:", url);
  });
};

window.maqRevocarAuditorLink = function (linkId, maqId) {
  if (!confirm("¿Revocar este link de auditor? El acceso se desactivará inmediatamente.")) return;
  fetch("/api/maquinaria/auditor-links/" + linkId, { method: "DELETE" })
    .then(function () {
      mostrarToast("Link revocado", "success");
      _maqLoadAuditorLinks(maqId);
    })
    .catch(function () { mostrarToast("Error al revocar", "error"); });
};

window.maqVerAuditLog = function (linkId) {
  fetch("/api/maquinaria/auditor-links/" + linkId + "/log")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var logs = data.log || [];
      if (!logs.length) {
        alert("Sin accesos registrados todavía.");
        return;
      }
      var text = logs.map(function (l) {
        return (l.created_at || "").substring(0, 19) + " | " + l.accion + " | IP: " + (l.ip || "?");
      }).join("\n");
      alert("Registro de accesos (" + logs.length + "):\n\n" + text);
    })
    .catch(function () { mostrarToast("Error al cargar log", "error"); });
};

// ═══════════════════════════════════════════════════════════════════════════════
// ██  Certificado CAE / PRL                                                  ██
// ═══════════════════════════════════════════════════════════════════════════════

window.maqCertificadoModal = function (maqId) {
  // Close dropdown
  document.querySelectorAll('[style*="z-index:50"]').forEach(function (d) { d.style.display = "none"; });

  var revs = window._maqRevHistorico || [];

  // Collect unique hito hours from revisiones_historico, sorted desc
  var hitosSet = {};
  revs.forEach(function (r) {
    var h = r.horometro_al_revision || 0;
    if (h > 0) hitosSet[h] = (r.fecha || "").substring(0, 10);
  });
  var hitos = Object.keys(hitosSet).map(Number).sort(function (a, b) { return b - a; });

  var hitoOpts = hitos.map(function (h) {
    return '<option value="' + h + '">' + h.toLocaleString("es-ES") + 'h — ' + (hitosSet[h] || "") + '</option>';
  }).join("");
  if (!hitoOpts) {
    hitoOpts = '<option value="">Sin revisiones registradas</option>';
  }

  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-maq-certificado";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:480px;">' +
      '<h2 style="margin:0 0 16px;">Generar certificado CAE / PRL</h2>' +

      // Modo
      '<div style="margin-bottom:16px;">' +
        '<label class="form-label">Tipo de certificado</label>' +
        '<select id="cert-modo" class="form-input" onchange="document.getElementById(\'cert-hito-group\').style.display=this.value===\'hito\'?\'block\':\'none\'">' +
          '<option value="ultima">Última revisión realizada</option>' +
          '<option value="hito">Revisión por hito (horómetro específico)</option>' +
        '</select>' +
      '</div>' +

      // Hito selector (hidden by default)
      '<div id="cert-hito-group" style="display:none;margin-bottom:16px;">' +
        '<label class="form-label">Hito de revisión</label>' +
        '<select id="cert-hito-horas" class="form-input">' + hitoOpts + '</select>' +
      '</div>' +

      // Lugar
      '<div style="margin-bottom:16px;">' +
        '<label class="form-label">Lugar de emisión</label>' +
        '<input type="text" id="cert-lugar" class="form-input" value="Badajoz">' +
      '</div>' +

      // Firmante
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
        '<div><label class="form-label">Nombre firmante</label>' +
          '<input type="text" id="cert-firmante-nombre" class="form-input" value="Sergio Garcia Cascallana"></div>' +
        '<div><label class="form-label">Cargo</label>' +
          '<input type="text" id="cert-firmante-cargo" class="form-input" value="Administrador"></div>' +
      '</div>' +

      // Buttons
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-certificado\').remove()">Cancelar</button>' +
        '<button class="btn-primary" style="width:auto;padding:8px 20px;" id="cert-btn-generar" onclick="maqGenerarCertificado(' + maqId + ')">Generar PDF</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
};

window.maqGenerarCertificado = function (maqId) {
  var modo = (document.getElementById("cert-modo") || {}).value || "ultima";
  var hitoHoras = modo === "hito" ? parseInt((document.getElementById("cert-hito-horas") || {}).value) || null : null;
  var lugar = (document.getElementById("cert-lugar") || {}).value || "Badajoz";
  var firmNombre = (document.getElementById("cert-firmante-nombre") || {}).value || "";
  var firmCargo = (document.getElementById("cert-firmante-cargo") || {}).value || "";

  if (modo === "hito" && !hitoHoras) {
    mostrarToast("Selecciona un hito de revisión", "error");
    return;
  }

  var btn = document.getElementById("cert-btn-generar");
  if (btn) { btn.disabled = true; btn.textContent = "Generando..."; }

  var payload = { modo: modo, lugar: lugar, firmante_nombre: firmNombre, firmante_cargo: firmCargo };
  if (hitoHoras) payload.hito_horas = hitoHoras;

  fetch("/api/maquinaria/maquinas/" + maqId + "/certificado-cae", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(function (res) {
    if (!res.ok) {
      return res.json().then(function (d) { throw new Error(d.error || "Error " + res.status); });
    }
    var fname = "certificado_cae.pdf";
    var cd = res.headers.get("Content-Disposition");
    if (cd) {
      var match = cd.match(/filename=(.+)/);
      if (match) fname = match[1];
    }
    return res.blob().then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      URL.revokeObjectURL(a.href);
      var m = document.getElementById("modal-maq-certificado"); if (m) m.remove();
      mostrarToast("Certificado descargado: " + fname, "success");
    });
  }).catch(function (err) {
    mostrarToast("Error: " + err.message, "error");
    if (btn) { btn.disabled = false; btn.textContent = "Generar PDF"; }
  });
};

window.maqVolver = function () {
  document.getElementById("panel-maquinaria-detalle").classList.remove("visible");
  document.getElementById("panel-maquinaria").classList.add("visible");
  cargarMaquinaria();
};

// ── Check semanal ──

window.maqNuevoCheck = function (maqId) {
  fetch("/api/maquinaria/templates/semanal")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var templates = data.templates || [];
      var hoy = new Date().toISOString().substring(0, 10);

      var itemsHtml = templates.map(function (t) {
        return '<div style="padding:10px 12px;border-bottom:1px solid var(--color-border);">' +
          '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;">' +
            '<input type="checkbox" data-template-id="' + t.id + '" style="width:20px;height:20px;accent-color:#16A34A;cursor:pointer;" ' +
              'onchange="var n=this.closest(\'div\').querySelector(\'.check-nota\');if(n)n.style.display=this.checked?\'none\':\'block\';">' +
            '<div style="flex:1;"><div style="font-size:14px;font-weight:500;">' + _esc(t.nombre) + '</div>' +
              (t.descripcion ? '<div style="font-size:12px;color:var(--color-text-secondary);">' + _esc(t.descripcion) + '</div>' : '') +
            '</div></label>' +
          '<input type="text" class="check-nota form-input" data-nota-id="' + t.id + '" placeholder="Observaci\u00f3n si No OK..." ' +
            'style="display:block;margin-top:6px;margin-left:30px;font-size:12px;padding:4px 8px;">' +
        '</div>';
      }).join("");

      var modal = document.createElement("div");
      modal.className = "modal-overlay visible";
      modal.id = "modal-maq-check";
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      modal.innerHTML =
        '<div class="modal-content" style="max-width:600px;max-height:90vh;display:flex;flex-direction:column;">' +
          '<h2 style="margin:0 0 16px;">Check semanal</h2>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
            '<div><label class="form-label">Fecha</label><input type="date" id="maq-check-fecha" class="form-input" value="' + hoy + '"></div>' +
            '<div><label class="form-label">Hor\u00f3metro actual</label><input type="number" id="maq-check-horometro" class="form-input" step="any" placeholder="Horas"></div>' +
          '</div>' +
          '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;margin-bottom:16px;flex:1;display:flex;flex-direction:column;min-height:0;">' +
            '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);font-size:14px;font-weight:600;">Checklist semanal (' + templates.length + ' puntos)</div>' +
            '<div style="padding:8px;overflow-y:auto;flex:1;">' + itemsHtml + '</div></div>' +
          '<div style="margin-bottom:16px;"><label class="form-label">Observaciones</label>' +
            '<textarea id="maq-check-obs" class="form-input" rows="2" placeholder="Notas adicionales..."></textarea></div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-check\').remove()">Cancelar</button>' +
            '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="maqGuardarCheck(' + maqId + ')">Guardar y cerrar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    });
};

window.maqGuardarCheck = function (maqId) {
  var checklist = {};
  document.querySelectorAll("#modal-maq-check [data-template-id]").forEach(function (cb) {
    var notaEl = document.querySelector('#modal-maq-check [data-nota-id="' + cb.dataset.templateId + '"]');
    checklist[cb.dataset.templateId] = { ok: cb.checked, nota: notaEl ? notaEl.value.trim() : "" };
  });
  var payload = {
    maquina_id: maqId,
    fecha: (document.getElementById("maq-check-fecha") || {}).value,
    horometro: parseFloat((document.getElementById("maq-check-horometro") || {}).value) || 0,
    checklist: checklist,
    observaciones: (document.getElementById("maq-check-obs") || {}).value
  };
  fetch("/api/maquinaria/checks", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  }).then(function (res) {
    if (res.ok) {
      return res.json().then(function (check) {
        return fetch("/api/maquinaria/checks/" + check.id + "/cerrar", { method: "PUT" });
      }).then(function () {
        var m = document.getElementById("modal-maq-check"); if (m) m.remove();
        mostrarToast("Check semanal registrado", "success");
        maqDetalle(maqId);
      });
    } else { mostrarToast("Error al guardar", "error"); }
  });
};

// ── Incidencias ──

window.maqNuevaIncidencia = function (maqId) {
  var hoy = new Date().toISOString().substring(0, 10);
  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-maq-incidencia";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:450px;">' +
      '<h2 style="margin:0 0 16px;">Nueva incidencia</h2>' +
      '<div style="display:grid;gap:12px;">' +
        '<div><label class="form-label">Descripci\u00f3n *</label><textarea id="maq-inc-desc" class="form-input" rows="3" placeholder="Describe la incidencia..."></textarea></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label class="form-label">Severidad</label><select id="maq-inc-sev" class="form-input"><option value="baja">Baja</option><option value="media" selected>Media</option><option value="alta">Alta</option><option value="seguridad">Seguridad</option></select></div>' +
          '<div><label class="form-label">Fecha</label><input type="date" id="maq-inc-fecha" class="form-input" value="' + hoy + '"></div>' +
        '</div></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-incidencia\').remove()">Cancelar</button>' +
        '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="maqGuardarIncidencia(' + maqId + ')">Reportar</button>' +
      '</div></div>';
  document.body.appendChild(modal);
};

window.maqGuardarIncidencia = function (maqId) {
  var desc = ((document.getElementById("maq-inc-desc") || {}).value || "").trim();
  if (!desc) { mostrarToast("La descripci\u00f3n es obligatoria", "error"); return; }
  fetch("/api/maquinaria/incidencias", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      maquina_id: maqId, descripcion: desc,
      severidad: (document.getElementById("maq-inc-sev") || {}).value || "media",
      fecha: (document.getElementById("maq-inc-fecha") || {}).value
    })
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-maq-incidencia"); if (m) m.remove();
      mostrarToast("Incidencia reportada", "success");
      maqDetalle(maqId);
    } else { mostrarToast("Error", "error"); }
  });
};

window.maqCerrarIncidencia = function (incId, maqId) {
  var resolucion = prompt("Resoluci\u00f3n de la incidencia:");
  if (resolucion === null) return;
  fetch("/api/maquinaria/incidencias/" + incId, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado: "cerrada", resolucion: resolucion })
  }).then(function () {
    mostrarToast("Incidencia cerrada", "success");
    maqDetalle(maqId);
  });
};

// ── Editar máquina ──

window.maqEditarModal = function (maqId) {
Promise.all([
    fetch("/api/maquinaria/maquinas/" + maqId).then(function (r) { return r.json(); }),
    fetch("/api/proyectos").then(function (r) { return r.json(); }).catch(function () { return { proyectos: [] }; })
  ]).then(function (results) {
    var m = results[0];
    var proyectos = results[1].proyectos || [];
    if (!m || m.error) { mostrarToast("Error al cargar m\u00e1quina", "error"); return; }
    var proyOpts = '<option value="">Sin proyecto</option>' +
      proyectos.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === m.proyecto_id ? ' selected' : '') + '>' + (p.codigo ? p.codigo + ' \u00b7 ' : '') + _esc(p.nombre) + '</option>';
      }).join("");
    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-maq-editar";
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML =
      '<div class="modal-content" style="max-width:500px;">' +
        '<h2 style="margin:0 0 16px;">Editar ' + _esc(m.nombre) + '</h2>' +
        '<div style="display:grid;gap:12px;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div><label class="form-label">Nombre</label><input type="text" id="maq-ed-nombre" class="form-input" value="' + _esc(m.nombre) + '"></div>' +
            '<div><label class="form-label">Modelo</label><input type="text" id="maq-ed-modelo" class="form-input" value="' + _esc(m.modelo) + '"></div></div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div><label class="form-label">N\u00ba Serie</label><input type="text" id="maq-ed-serie" class="form-input" value="' + _esc(m.numero_serie || '') + '"></div>' +
            '<div><label class="form-label">Hor\u00f3metro actual</label><input type="number" id="maq-ed-horometro" class="form-input" step="any" value="' + (m.horometro_actual || 0) + '"></div></div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div><label class="form-label">Estado</label><select id="maq-ed-estado" class="form-input">' +
              '<option value="disponible"' + (m.estado === 'disponible' ? ' selected' : '') + '>Disponible</option>' +
              '<option value="en_proyecto"' + (m.estado === 'en_proyecto' ? ' selected' : '') + '>En proyecto</option>' +
              '<option value="en_taller"' + (m.estado === 'en_taller' ? ' selected' : '') + '>En taller</option>' +
              '<option value="baja"' + (m.estado === 'baja' ? ' selected' : '') + '>De baja</option></select></div>' +
            '<div><label class="form-label">Proyecto</label><select id="maq-ed-proyecto" class="form-input">' + proyOpts + '</select></div></div>' +
          '<div><label class="form-label">Ubicaci\u00f3n</label><input type="text" id="maq-ed-ubicacion" class="form-input" value="' + _esc(m.ubicacion || '') + '" placeholder="Ej: Parque PV Cuenca"></div>' +
          '<div><label class="form-label">Notas</label><textarea id="maq-ed-notas" class="form-input" rows="2">' + _esc(m.notas || '') + '</textarea></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
          '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-editar\').remove()">Cancelar</button>' +
          '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="maqGuardarEdicion(' + maqId + ')">Guardar</button>' +
        '</div></div>';
    document.body.appendChild(modal);
  }).catch(function (err) {
    console.error("maqEditarModal error:", err);
    mostrarToast("Error al abrir editor: " + err.message, "error");
  });
};

window.maqGuardarEdicion = function (maqId) {
  var data = {
    nombre: (document.getElementById("maq-ed-nombre") || {}).value,
    modelo: (document.getElementById("maq-ed-modelo") || {}).value,
    numero_serie: (document.getElementById("maq-ed-serie") || {}).value,
    horometro_actual: parseFloat((document.getElementById("maq-ed-horometro") || {}).value) || 0,
    estado: (document.getElementById("maq-ed-estado") || {}).value,
    proyecto_id: parseInt((document.getElementById("maq-ed-proyecto") || {}).value) || null,
    ubicacion: (document.getElementById("maq-ed-ubicacion") || {}).value,
    notas: (document.getElementById("maq-ed-notas") || {}).value
  };
  fetch("/api/maquinaria/maquinas/" + maqId, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-maq-editar"); if (m) m.remove();
      mostrarToast("M\u00e1quina actualizada", "success");
      maqDetalle(maqId);
    } else { mostrarToast("Error", "error"); }
  });
};


// ═══════════════════════════════════════════════════════════════════════════════
// ██  Decomisionar / Reactivar máquina                                      ██
// ═══════════════════════════════════════════════════════════════════════════════

window.maqDecomisionar = function (maqId, nombre) {
  if (!confirm("\u00bfDecomisionar " + nombre + "? La m\u00e1quina pasar\u00e1 a estado 'De baja'.")) return;
  fetch("/api/maquinaria/maquinas/" + maqId, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado: "baja", activa: 0 })
  }).then(function (res) {
    if (res.ok) { mostrarToast(nombre + " decomisionada", "success"); maqDetalle(maqId); }
    else { mostrarToast("Error al decomisionar", "error"); }
  });
};

window.maqReactivar = function (maqId, nombre) {
  if (!confirm("\u00bfReactivar " + nombre + "?")) return;
  fetch("/api/maquinaria/maquinas/" + maqId, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado: "disponible", activa: 1 })
  }).then(function (res) {
    if (res.ok) { mostrarToast(nombre + " reactivada", "success"); maqDetalle(maqId); }
    else { mostrarToast("Error al reactivar", "error"); }
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// ██  Completar revisión pendiente manualmente                              ██
// ═══════════════════════════════════════════════════════════════════════════════

window.maqCompletarRevision = function (maqId, intervalo, horometro) {
  var hito = Math.floor(horometro / intervalo) * intervalo;
  if (!confirm("Marcar revisi\u00f3n de " + intervalo + "h como realizada al hito " + hito + "h?")) return;
  fetch("/api/maquinaria/maquinas/" + maqId + "/completar-revision", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intervalo: intervalo, horometro_actual: horometro })
  }).then(function (res) {
    if (res.ok) {
      mostrarToast("Revisi\u00f3n " + intervalo + "h marcada como realizada", "success");
      maqDetalle(maqId);
    } else {
      res.json().then(function (d) { mostrarToast(d.error || "Error", "error"); })
        .catch(function () { mostrarToast("Error al completar revisi\u00f3n", "error"); });
    }
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// ██  Detalle de check semanal (admin: ver, editar, eliminar)               ██
// ═══════════════════════════════════════════════════════════════════════════════

window.maqVerCheck = function (checkId, maqId) {
  Promise.all([
    fetch("/api/maquinaria/checks/" + checkId).then(function (r) { return r.json(); }),
    fetch("/api/maquinaria/templates/semanal").then(function (r) { return r.json(); }).catch(function () { return { templates: [] }; })
  ]).then(function (results) {
    var c = results[0];
    var templates = results[1].templates || [];
    if (!c || c.error) { mostrarToast("Error al cargar check", "error"); return; }

    var cl = c.checklist_parsed || {};

    // Build checklist HTML
    var clHtml = "";
    if (templates.length) {
      clHtml = templates.map(function (t) {
        var entry = cl[String(t.id)] || {};
        var ok = entry.ok;
        var nota = entry.nota || "";
        var icon = ok ? '<span style="color:#16A34A;">\u2713</span>' : '<span style="color:#DC2626;">\u2717</span>';
        return '<div style="display:flex;align-items:start;gap:8px;padding:6px 0;border-bottom:1px solid var(--color-border);" data-tmpl-id="' + t.id + '">' +
          '<input type="checkbox" class="chk-item" data-id="' + t.id + '"' + (ok ? ' checked' : '') + ' style="margin-top:3px;cursor:pointer;">' +
          '<div style="flex:1;">' +
            '<div style="font-size:13px;font-weight:500;">' + _esc(t.nombre) + '</div>' +
            (nota ? '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:2px;">' + _esc(nota) + '</div>' : '') +
          '</div></div>';
      }).join("");
    } else {
      // No templates, show raw JSON keys
      var keys = Object.keys(cl);
      if (keys.length) {
        clHtml = keys.map(function (k) {
          var entry = cl[k];
          return '<div style="padding:4px 0;font-size:13px;">' +
            (entry.ok ? '\u2713' : '\u2717') + ' Item ' + k +
            (entry.nota ? ' \u2014 ' + _esc(entry.nota) : '') + '</div>';
        }).join("");
      } else {
        clHtml = '<p style="color:var(--color-text-secondary);font-size:13px;">Sin checklist</p>';
      }
    }

    // Fotos HTML
    var fotosHtml = "";
    if (c.fotos && c.fotos.length) {
      fotosHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
        c.fotos.map(function (f) {
          return '<img src="/uploads/maquinaria/' + _esc(f.filename) + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--color-border);cursor:pointer;" ' +
            'onclick="window.open(this.src,\'_blank\')">';
        }).join("") + '</div>';
    }

    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-check-detalle";
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML =
      '<div class="modal-content" style="max-width:560px;max-height:80vh;overflow-y:auto;">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px;">' +
          '<div>' +
            '<h2 style="margin:0;">Check semanal</h2>' +
            '<div style="font-size:13px;color:var(--color-text-secondary);margin-top:4px;">' +
              (c.fecha || "").substring(0, 10) + ' \u00b7 ' + (c.horometro || 0) + 'h' +
              (c.usuario_nombre ? ' \u00b7 por ' + _esc(c.usuario_nombre) : '') +
            '</div>' +
          '</div>' +
          '<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:' + (c.estado === "cerrado" ? '#16A34A15' : '#CA8A0415') + ';color:' + (c.estado === "cerrado" ? '#16A34A' : '#CA8A04') + ';font-weight:500;">' + (c.estado || 'abierto') + '</span>' +
        '</div>' +

        // Checklist
        '<div style="margin-bottom:16px;">' +
          '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:8px;">Checklist</div>' +
          '<div id="chk-detail-items">' + clHtml + '</div>' +
        '</div>' +

        // Observaciones
        '<div style="margin-bottom:16px;">' +
          '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:4px;">Observaciones</div>' +
          '<textarea id="chk-edit-obs" class="form-input" rows="2" style="font-size:13px;">' + _esc(c.observaciones || '') + '</textarea>' +
        '</div>' +

        // Horómetro editable
        '<div style="margin-bottom:16px;">' +
          '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:4px;">Hor\u00f3metro</div>' +
          '<input type="number" id="chk-edit-horo" class="form-input" step="any" value="' + (c.horometro || 0) + '" style="max-width:150px;">' +
        '</div>' +

        // Fotos
        (fotosHtml ? '<div style="margin-bottom:16px;"><div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:4px;">Fotos</div>' + fotosHtml + '</div>' : '') +

        // Buttons
        '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px;border-top:1px solid var(--color-border);padding-top:16px;">' +
          '<button class="btn-outline" style="color:#DC2626;border-color:#DC2626;font-size:13px;padding:6px 14px;" onclick="maqEliminarCheck(' + checkId + ',' + maqId + ')">Eliminar check</button>' +
          '<div style="display:flex;gap:8px;">' +
            '<button class="btn-outline" style="font-size:13px;padding:6px 14px;" onclick="document.getElementById(\'modal-check-detalle\').remove()">Cancelar</button>' +
            '<button class="btn-primary" style="width:auto;font-size:13px;padding:6px 16px;" onclick="maqGuardarCheck(' + checkId + ',' + maqId + ')">Guardar cambios</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
  }).catch(function (err) {
    console.error("maqVerCheck error:", err);
    mostrarToast("Error al cargar check: " + err.message, "error");
  });
};

window.maqGuardarCheck = function (checkId, maqId) {
  // Rebuild checklist from checkboxes
  var items = document.querySelectorAll("#chk-detail-items .chk-item");
  var checklist = {};
  items.forEach(function (cb) {
    checklist[cb.getAttribute("data-id")] = { ok: cb.checked, nota: "" };
  });
  var data = {
    observaciones: (document.getElementById("chk-edit-obs") || {}).value || "",
    horometro: parseFloat((document.getElementById("chk-edit-horo") || {}).value) || 0,
    checklist: checklist
  };
  fetch("/api/maquinaria/checks/" + checkId, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-check-detalle"); if (m) m.remove();
      mostrarToast("Check actualizado", "success");
      maqDetalle(maqId);
    } else { mostrarToast("Error al actualizar", "error"); }
  });
};

window.maqEliminarCheck = function (checkId, maqId) {
  if (!confirm("\u00bfEliminar este check semanal? Esta acci\u00f3n no se puede deshacer.")) return;
  fetch("/api/maquinaria/checks/" + checkId, {
    method: "DELETE"
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-check-detalle"); if (m) m.remove();
      mostrarToast("Check eliminado", "success");
      maqDetalle(maqId);
    } else { mostrarToast("Error al eliminar", "error"); }
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// ██  Nueva máquina (crear desde la web)                                    ██
// ═══════════════════════════════════════════════════════════════════════════════

window.maqNuevaModal = function () {
  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-maq-nueva";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:520px;">' +
      '<h2 style="margin:0 0 16px;">Nueva m\u00e1quina</h2>' +
      '<div style="display:grid;gap:12px;">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label class="form-label">ID interno *</label><input type="text" id="maq-nw-intid" class="form-input" placeholder="Ej: HD1000-09"></div>' +
          '<div><label class="form-label">Nombre *</label><input type="text" id="maq-nw-nombre" class="form-input" placeholder="Ej: Giulietta"></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label class="form-label">Modelo</label><input type="text" id="maq-nw-modelo" class="form-input" value="ORTECO HD1000"></div>' +
          '<div><label class="form-label">N\u00ba Serie</label><input type="text" id="maq-nw-serie" class="form-input" placeholder="Ej: W240"></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label class="form-label">Hor\u00f3metro actual</label><input type="number" id="maq-nw-horometro" class="form-input" step="any" value="0"></div>' +
          '<div><label class="form-label">Hor\u00f3metro inicial</label><input type="number" id="maq-nw-horo-ini" class="form-input" step="any" value="0"></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label class="form-label">Fecha comisi\u00f3n</label><input type="date" id="maq-nw-fecha" class="form-input"></div>' +
          '<div><label class="form-label">Ubicaci\u00f3n</label><input type="text" id="maq-nw-ubicacion" class="form-input" placeholder="Ej: Parque PV Cuenca"></div></div>' +
        '<div><label class="form-label">Notas</label><textarea id="maq-nw-notas" class="form-input" rows="2" placeholder="Observaciones opcionales"></textarea></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-nueva\').remove()">Cancelar</button>' +
        '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="maqCrearNueva()">Crear m\u00e1quina</button>' +
      '</div></div>';
  document.body.appendChild(modal);
};

window.maqCrearNueva = function () {
  var intId = (document.getElementById("maq-nw-intid") || {}).value || "";
  var nombre = (document.getElementById("maq-nw-nombre") || {}).value || "";
  if (!intId.trim() || !nombre.trim()) {
    mostrarToast("ID interno y nombre son obligatorios", "error");
    return;
  }
  var data = {
    internal_id: intId.trim(),
    nombre: nombre.trim(),
    modelo: (document.getElementById("maq-nw-modelo") || {}).value || "ORTECO HD1000",
    numero_serie: (document.getElementById("maq-nw-serie") || {}).value || null,
    horometro_actual: parseFloat((document.getElementById("maq-nw-horometro") || {}).value) || 0,
    horometro_inicial: parseFloat((document.getElementById("maq-nw-horo-ini") || {}).value) || 0,
    fecha_comision: (document.getElementById("maq-nw-fecha") || {}).value || null,
    ubicacion: (document.getElementById("maq-nw-ubicacion") || {}).value || null,
    notas: (document.getElementById("maq-nw-notas") || {}).value || null
  };
  fetch("/api/maquinaria/maquinas", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  }).then(function (res) {
    if (res.ok) {
      var m = document.getElementById("modal-maq-nueva"); if (m) m.remove();
      mostrarToast("M\u00e1quina '" + data.nombre + "' creada", "success");
      cargarMaquinaria();
    } else {
      res.json().then(function (d) {
        mostrarToast(d.error || "Error al crear m\u00e1quina", "error");
      }).catch(function () { mostrarToast("Error al crear m\u00e1quina", "error"); });
    }
  }).catch(function (err) {
    mostrarToast("Error de red: " + err.message, "error");
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// ██  Tokens de acceso operario                                             ██
// ═══════════════════════════════════════════════════════════════════════════════

window.maqTokensModal = function (maqId) {
  fetch("/api/maquinaria/tokens?maquina_id=" + maqId)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var tokens = data.tokens || [];
      var baseUrl = window.location.origin + "/m/";

      var tokenRows = tokens.length
        ? tokens.map(function (t) {
            var exp = t.expires_at ? t.expires_at.substring(0, 10) : "—";
            var activo = t.activo ? '<span style="color:#16A34A;font-weight:600;">Activo</span>' : '<span style="color:#DC2626;">Inactivo</span>';
            var url = baseUrl + t.token;
            return '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:12px;margin-bottom:8px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div>' +
                  '<div style="font-weight:600;font-size:14px;">' + _esc(t.operario_nombre || "Sin nombre") + '</div>' +
                  '<div style="font-size:12px;color:var(--color-text-secondary);">Expira: ' + exp + ' &middot; ' + activo + '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;">' +
                  '<button class="btn-outline" style="font-size:11px;padding:4px 10px;" onclick="maqCopiarToken(\'' + t.token + '\')">Copiar link</button>' +
                  '<button class="btn-outline" style="font-size:11px;padding:4px 10px;" onclick="maqQrToken(\'' + t.token + '\',\'' + _esc(t.operario_nombre || "Operario") + '\')">QR</button>' +
                  (t.activo
                    ? '<button class="btn-outline" style="font-size:11px;padding:4px 10px;color:#DC2626;" onclick="maqDesactivarToken(' + t.id + ',' + maqId + ')">Desactivar</button>'
                    : '<button class="btn-outline" style="font-size:11px;padding:4px 10px;color:#16A34A;" onclick="maqReactivarToken(' + t.id + ',' + maqId + ')">Reactivar</button>'
                  ) +
                '</div>' +
              '</div>' +
              '<div style="margin-top:6px;">' +
                '<input type="text" readonly value="' + url + '" style="width:100%;font-size:11px;padding:4px 8px;border:1px solid var(--color-border);border-radius:4px;background:#f8f9fa;color:var(--color-text-secondary);" onclick="this.select()">' +
              '</div>' +
            '</div>';
          }).join("")
        : '<p style="text-align:center;color:var(--color-text-secondary);padding:20px;">Sin tokens creados para esta m\u00e1quina.</p>';

      var modal = document.createElement("div");
      modal.className = "modal-overlay visible";
      modal.id = "modal-maq-tokens";
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      modal.innerHTML =
        '<div class="modal-content" style="max-width:600px;">' +
          '<h2 style="margin:0 0 16px;">Tokens de acceso operario</h2>' +
          '<p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:12px;">Cada token da acceso a un operario para hacer checks y reportar incidencias desde su m\u00f3vil, sin necesidad de login.</p>' +
          '<div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;margin-bottom:16px;align-items:end;">' +
            '<div><label class="form-label">Nombre del operario</label><input type="text" id="tok-nombre" class="form-input" placeholder="Ej: Juan P\u00e9rez"></div>' +
            '<div><label class="form-label">Validez (d\u00edas)</label><input type="number" id="tok-dias" class="form-input" value="90" style="width:80px;"></div>' +
            '<button class="btn-primary" style="width:auto;padding:8px 16px;height:38px;" onclick="maqCrearToken(' + maqId + ')">Crear token</button>' +
          '</div>' +
          '<div id="tokens-lista">' + tokenRows + '</div>' +
          '<div style="display:flex;justify-content:flex-end;margin-top:12px;">' +
            '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-tokens\').remove()">Cerrar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    });
};

window.maqCrearToken = function (maqId) {
  var nombre = (document.getElementById("tok-nombre") || {}).value || "";
  var dias = parseInt((document.getElementById("tok-dias") || {}).value) || 90;
  fetch("/api/maquinaria/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maquina_id: maqId, operario_nombre: nombre, dias_validez: dias })
  }).then(function (r) {
    if (r.ok) {
      var m = document.getElementById("modal-maq-tokens");
      if (m) m.remove();
      mostrarToast("Token creado", "success");
      maqTokensModal(maqId);
    } else { mostrarToast("Error al crear token", "error"); }
  });
};

window.maqCopiarToken = function (token) {
  var url = window.location.origin + "/m/" + token;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function () {
      mostrarToast("Link copiado al portapapeles", "success");
    });
  } else {
    prompt("Copia este enlace:", url);
  }
};

window.maqCopiarTelegramLink = function (empleadoId) {
  fetch("/api/maquinaria/telegram-link/" + empleadoId)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.link) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(d.link).then(function () {
            mostrarToast("Enlace Telegram copiado", "success");
          });
        } else {
          prompt("Enlace Telegram para el operario:", d.link);
        }
      }
    })
    .catch(function () { mostrarToast("Error al obtener enlace", "error"); });
};

window.maqQrToken = function (token, operario) {
  // Genera QR usando API pública de qrserver.com (alternativa: librería local)
  var url = encodeURIComponent(window.location.origin + "/m/" + token);
  var qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + url;

  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-maq-qr";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:380px;text-align:center;">' +
      '<h2 style="margin:0 0 4px;">QR de acceso</h2>' +
      '<p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:16px;">' + _esc(operario) + '</p>' +
      '<img src="' + qrUrl + '" alt="QR Code" style="width:250px;height:250px;border:1px solid var(--color-border);border-radius:8px;">' +
      '<p style="font-size:12px;color:var(--color-text-secondary);margin-top:12px;">El operario escanea este c\u00f3digo con la c\u00e1mara del m\u00f3vil para acceder directamente.</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;">' +
        '<button class="btn-outline" onclick="window.open(\'' + qrUrl + '\',\'_blank\')">Descargar QR</button>' +
        '<button class="btn-outline" onclick="window.print()">Imprimir</button>' +
        '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-qr\').remove()">Cerrar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
};

window.maqDesactivarToken = function (tokenId, maqId) {
  if (!confirm("¿Desactivar este token? El operario perder\u00e1 acceso.")) return;
  fetch("/api/maquinaria/tokens/" + tokenId, { method: "DELETE" })
    .then(function () {
      var m = document.getElementById("modal-maq-tokens");
      if (m) m.remove();
      mostrarToast("Token desactivado", "success");
      maqTokensModal(maqId);
    });
};

window.maqReactivarToken = function (tokenId, maqId) {
  fetch("/api/maquinaria/tokens/" + tokenId + "/reactivar", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dias_validez: 90 })
  }).then(function () {
    var m = document.getElementById("modal-maq-tokens");
    if (m) m.remove();
    mostrarToast("Token reactivado (90 d\u00edas)", "success");
    maqTokensModal(maqId);
  });
};


// ═══════════════════════════════════════════════════════════════════════════════
// ██  Responsable de mantenimiento (vinculado a empleados RRHH)             ██
// ═══════════════════════════════════════════════════════════════════════════════

function _maqLoadResponsableSelect(currentId) {
  fetch("/api/empleados")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var sel = document.getElementById("maq-resp-select");
      if (!sel) return;
      var empleados = (data.empleados || []).filter(function (e) { return e.estado === "activo"; });
      sel.innerHTML = '<option value="">Sin responsable asignado</option>' +
        empleados.map(function (e) {
          var nombre = _esc(e.nombre + (e.apellidos ? ' ' + e.apellidos : ''));
          var tel = e.telefono ? ' \u00b7 ' + _esc(e.telefono) : '';
          return '<option value="' + e.id + '"' + (e.id === currentId ? ' selected' : '') + '>' +
            nombre + tel + '</option>';
        }).join("");
    });
}

window.maqGuardarResponsable = function (maqId) {
  var sel = document.getElementById("maq-resp-select");
  var respId = sel ? (sel.value ? parseInt(sel.value) : null) : null;
  fetch("/api/maquinaria/maquinas/" + maqId + "/responsable", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responsable_id: respId })
  }).then(function (r) {
    if (r.ok) {
      mostrarToast("Responsable actualizado", "success");
      maqDetalle(maqId);
    } else { mostrarToast("Error al asignar responsable", "error"); }
  });
};


// ═══════════════════════════════════════════════════════════════════════════════
// ██  Dashboard de mantenimiento                                            ██
// ═══════════════════════════════════════════════════════════════════════════════

window.cargarDashboardMantenimiento = function () {
  var container = document.getElementById("maquinaria-content");
  if (!container) return;

  fetch("/api/maquinaria/dashboard")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      function _kpi(label, n, color, icon) {
        return '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid ' + color + ';border-radius:var(--radius-md);padding:12px 16px;">' +
          '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;">' + (icon || '') + ' ' + label + '</div>' +
          '<div style="font-size:22px;font-weight:700;color:' + color + ';">' + n + '</div></div>';
      }

      // Revisiones pendientes detalle
      var revHtml = "";
      if (d.maquinas_con_revision_pendiente && d.maquinas_con_revision_pendiente.length) {
        revHtml = d.maquinas_con_revision_pendiente.map(function (m) {
          var badges = m.revisiones.map(function (r) {
            var urg = r.urgente;
            return '<span style="padding:3px 8px;border-radius:99px;font-size:11px;font-weight:500;' +
              'background:' + (urg ? '#DC262615' : '#CA8A0415') + ';color:' + (urg ? '#DC2626' : '#CA8A04') + ';">' +
              r.tipo + (urg ? ' (x' + r.veces_pendiente + ')' : '') + '</span>';
          }).join(" ");
          return '<div style="padding:10px 12px;border-bottom:1px solid var(--color-border);display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-weight:600;font-size:14px;cursor:pointer;color:var(--color-primary);" onclick="maqDetalle(' + m.maquina_id + ')">' + _esc(m.maquina_nombre) + '</span>' +
            '<div style="display:flex;gap:4px;flex-wrap:wrap;">' + badges + '</div></div>';
        }).join("");
      } else {
        revHtml = '<p style="text-align:center;color:#16A34A;padding:16px;">Todas las revisiones al d\u00eda</p>';
      }

      container.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
          '<div><h1 style="margin:0;font-size:22px;">Dashboard Mantenimiento</h1>' +
            '<p style="margin:4px 0 0;font-size:14px;color:var(--color-text-secondary);">Visi\u00f3n general del estado de maquinaria</p></div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button class="btn-outline" style="padding:8px 16px;" onclick="cargarMaquinaria()">Ver m\u00e1quinas</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px;">' +
          _kpi("M\u00e1quinas", d.total_maquinas, "#2563EB") +
          _kpi("En taller", d.maquinas_en_taller, "#CA8A04") +
          _kpi("Incidencias", d.incidencias_abiertas, d.incidencias_abiertas > 0 ? "#DC2626" : "#16A34A") +
          _kpi("Checks semana", d.checks_esta_semana, "#16A34A") +
          _kpi("Tokens activos", d.tokens_activos, "#7C3AED") +
        '</div>' +
        (d.incidencias_seguridad > 0
          ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;color:#DC2626;font-weight:600;">' +
              '\u26A0\uFE0F ' + d.incidencias_seguridad + ' incidencia(s) de SEGURIDAD abierta(s) — requieren atenci\u00f3n inmediata</div>'
          : '') +
        '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
          '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);font-size:14px;font-weight:600;">' +
            'Revisiones pendientes (' + d.revisiones_pendientes + ')</div>' +
          '<div>' + revHtml + '</div></div>';
    })
    .catch(function (err) {
      container.innerHTML = '<p style="color:#DC2626;padding:20px;">Error al cargar dashboard: ' + err.message + '</p>';
    });
};
