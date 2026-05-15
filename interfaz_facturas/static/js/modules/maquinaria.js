// ═══ MAQUINARIA — máquinas, checks, incidencias ═══

function cargarMaquinaria() {
  var container = document.getElementById("maquinaria-content");
  if (!container) return;

  Promise.all([
    fetch("/api/maquinaria/maquinas").then(function (r) { return r.json(); }),
    fetch("/api/maquinaria/incidencias/stats").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (results) {
    var data = results[0];
    var incStats = results[1];
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

      // Sem\u00e1foro disponibilidad (Tarea 1.16)
      var eoColorsL = { operativa:"#16A34A", operativa_con_limitaciones:"#CA8A04", en_reserva:"#6366F1",
        pendiente_taller:"#D97706", parada_diagnostico:"#EA580C", parada_pendiente_pieza:"#DC2626",
        en_reparacion:"#DC2626", decomisionada:"#64748B" };
      var eoLabelsL = { operativa:"Operativa", operativa_con_limitaciones:"Op. limitada", en_reserva:"En reserva",
        pendiente_taller:"Pte. taller", parada_diagnostico:"Parada (diag.)", parada_pendiente_pieza:"Parada (pieza)",
        en_reparacion:"En reparaci\u00f3n", decomisionada:"Decomisionada" };

      var cards = maq.map(function (m) {
        var est = m.estado_computado || m.estado;
        var c = estadoColors[est] || "#64748B";
        var lbl = estadoLabels[est] || est;
        var eoV = m.estado_operativo || "operativa";
        var eoC = eoColorsL[eoV] || "#64748B";
        var eoL = eoLabelsL[eoV] || eoV;
        return '<div onclick="maqDetalle(' + m.id + ')" style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;cursor:pointer;transition:border-color 0.15s;border-top:3px solid ' + c + ';" ' +
          'onmouseover="this.style.borderColor=\'var(--color-primary)\'" onmouseout="this.style.borderColor=\'var(--color-border)\';this.style.borderTopColor=\'' + c + '\'">' +
          '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">' +
            '<div><div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:' + eoC + ';flex-shrink:0;box-shadow:0 0 0 2px ' + eoC + '30;" title="' + eoL + '"></span><span style="font-size:18px;font-weight:600;">' + _esc(m.nombre) + '</span></div>' +
              '<div style="font-size:12px;color:var(--color-text-secondary);">' + _esc(m.internal_id) + ' \u00b7 ' + _esc(m.modelo) + '</div></div>' +
            '<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:' + c + '15;color:' + c + ';font-weight:500;">' + lbl + '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div><div style="font-size:11px;color:var(--color-text-secondary);">Hor\u00f3metro</div>' +
              '<div style="font-size:16px;font-weight:600;">' + (m.horometro_actual || 0).toLocaleString("es-ES") + 'h</div>' +
              '<div style="font-size:10px;color:' + (m.horometro_ultima_lectura ? 'var(--color-text-secondary)' : '#DC2626') + ';">' + (m.horometro_ultima_lectura || 'Sin lectura') + '</div></div>' +
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
        // Incidencias banner
        (incStats ? '<div id="maq-inc-banner" style="margin-bottom:20px;">' + _buildIncBanner(incStats) + '</div>' : '') +

        // Dashboard flota ampliado (Tarea 1.19)
        (function () {
          // Estado operativo distribution
          var eoCounts = {};
          var critCounts = {};
          maq.forEach(function (m) {
            var eo = m.estado_operativo || 'operativa';
            var cr = m.criticidad || 'media';
            eoCounts[eo] = (eoCounts[eo] || 0) + 1;
            critCounts[cr] = (critCounts[cr] || 0) + 1;
          });
          var total = maq.length || 1;

          var eoOrder = ['operativa','operativa_con_limitaciones','en_reserva','pendiente_taller','parada_diagnostico','parada_pendiente_pieza','en_reparacion','decomisionada'];
          var eoCols = { operativa:"#16A34A", operativa_con_limitaciones:"#CA8A04", en_reserva:"#6366F1",
            pendiente_taller:"#D97706", parada_diagnostico:"#EA580C", parada_pendiente_pieza:"#DC2626",
            en_reparacion:"#DC2626", decomisionada:"#64748B" };
          var eoLbls = { operativa:"Operativa", operativa_con_limitaciones:"Op. limitada", en_reserva:"En reserva",
            pendiente_taller:"Pte. taller", parada_diagnostico:"Parada (diag.)", parada_pendiente_pieza:"Parada (pieza)",
            en_reparacion:"En reparación", decomisionada:"Decomisionada" };

          // Stacked bar for estado operativo
          var barSegments = '';
          eoOrder.forEach(function (eo) {
            var n = eoCounts[eo] || 0;
            if (n > 0) {
              var pct = Math.round((n / total) * 100);
              barSegments += '<div style="width:' + pct + '%;background:' + eoCols[eo] + ';height:100%;min-width:2px;" title="' + eoLbls[eo] + ': ' + n + '"></div>';
            }
          });

          var eoLegend = '';
          eoOrder.forEach(function (eo) {
            var n = eoCounts[eo] || 0;
            if (n > 0) {
              eoLegend += '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--color-text-secondary);">' +
                '<span style="width:8px;height:8px;border-radius:2px;background:' + eoCols[eo] + ';"></span>' +
                eoLbls[eo] + ' (' + n + ')</span>';
            }
          });

          // Criticidad pills
          var critOrder = ['critica','alta','media','baja'];
          var critCols = { baja:"#16A34A", media:"#CA8A04", alta:"#EA580C", critica:"#DC2626" };
          var critLbls = { baja:"Baja", media:"Media", alta:"Alta", critica:"Crítica" };
          var critPills = '';
          critOrder.forEach(function (cr) {
            var n = critCounts[cr] || 0;
            if (n > 0) {
              critPills += '<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:' + critCols[cr] + '08;border-radius:var(--radius-md);border:1px solid ' + critCols[cr] + '20;">' +
                '<span style="font-size:18px;font-weight:700;color:' + critCols[cr] + ';">' + n + '</span>' +
                '<span style="font-size:11px;color:' + critCols[cr] + ';font-weight:500;text-transform:uppercase;">' + critLbls[cr] + '</span></div>';
            }
          });

          // Operativas vs paradas
          var nOperativas = (eoCounts['operativa'] || 0) + (eoCounts['operativa_con_limitaciones'] || 0) + (eoCounts['en_reserva'] || 0);
          var nParadas = total - nOperativas;
          var pctDisp = Math.round((nOperativas / total) * 100);

          return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:20px;">' +
            // Disponibilidad flota
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
              '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:10px;">Disponibilidad flota</div>' +
              '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">' +
                '<span style="font-size:32px;font-weight:700;color:' + (pctDisp >= 80 ? '#16A34A' : pctDisp >= 50 ? '#CA8A04' : '#DC2626') + ';">' + pctDisp + '%</span>' +
                '<span style="font-size:13px;color:var(--color-text-secondary);">' + nOperativas + ' operativas / ' + nParadas + ' paradas</span></div>' +
              '<div style="height:8px;background:#E2E8F0;border-radius:4px;overflow:hidden;display:flex;">' + barSegments + '</div>' +
              '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;">' + eoLegend + '</div>' +
            '</div>' +
            // Criticidad
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
              '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:10px;">Criticidad de flota</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + critPills + '</div>' +
            '</div>' +
            // Resumen rápido
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
              '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:10px;">Resumen flota</div>' +
              '<div style="display:flex;flex-direction:column;gap:8px;">' +
                '<div style="display:flex;justify-content:space-between;font-size:13px;"><span>Horómetro medio</span><span style="font-weight:600;">' +
                  Math.round(maq.reduce(function (s, m) { return s + (m.horometro_actual || 0); }, 0) / total).toLocaleString("es-ES") + 'h</span></div>' +
                '<div style="display:flex;justify-content:space-between;font-size:13px;"><span>Con operario asignado</span><span style="font-weight:600;">' +
                  maq.filter(function (m) { return m.operario_nombre; }).length + '/' + total + '</span></div>' +
                '<div style="display:flex;justify-content:space-between;font-size:13px;"><span>Con proyecto activo</span><span style="font-weight:600;">' +
                  maq.filter(function (m) { return m.proyecto_actual && (m.proyecto_actual.nombre || m.proyecto_actual.codigo); }).length + '/' + total + '</span></div>' +
                '<div style="display:flex;justify-content:space-between;font-size:13px;"><span>Sin lectura horómetro</span><span style="font-weight:600;color:' +
                  (maq.filter(function (m) { return !m.horometro_ultima_lectura; }).length > 0 ? '#DC2626' : '#16A34A') + ';">' +
                  maq.filter(function (m) { return !m.horometro_ultima_lectura; }).length + '</span></div>' +
              '</div>' +
            '</div>' +
          '</div>';
        })() +

        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;">' + cards + '</div>';
    });
}

function _buildIncBanner(s) {
  var noAbiertas = (s.abiertas || 0) + (s.en_curso || 0);
  var sevColors = { seguridad: "#DC2626", alta: "#EA580C", media: "#CA8A04", baja: "#64748B" };
  var sevLabels = { seguridad: "Seguridad", alta: "Alta", media: "Media", baja: "Baja" };
  var sevBadges = "";
  ["seguridad", "alta", "media", "baja"].forEach(function (sev) {
    var n = (s.por_severidad || {})[sev] || 0;
    if (n > 0) {
      sevBadges += '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:' + sevColors[sev] + '15;color:' + sevColors[sev] + ';">' +
        n + ' ' + sevLabels[sev] + '</span>';
    }
  });

  var urgHtml = "";
  if (s.urgentes && s.urgentes.length) {
    urgHtml = '<div style="margin-top:10px;border-top:1px solid var(--color-border);padding-top:10px;">' +
      s.urgentes.slice(0, 3).map(function (u) {
        var sevC = sevColors[u.severidad] || "#64748B";
        return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + sevC + ';flex-shrink:0;"></span>' +
          '<span style="font-weight:500;">' + _esc(u.maquina_nombre || "?") + '</span>' +
          '<span style="color:var(--color-text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc((u.descripcion || "").substring(0, 60)) + '</span>' +
          '<span style="font-size:11px;color:' + sevC + ';">' + _esc(u.severidad || "?") + '</span>' +
        '</div>';
      }).join("") +
    '</div>';
  }

  return '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
      '<span style="font-size:15px;font-weight:600;">\u26A0\uFE0F Incidencias</span>' +
      '<button class="btn-outline" style="font-size:12px;padding:4px 12px;" onclick="maqVerHistorialIncidencias()">Ver historial completo</button>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:8px;">' +
      '<div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:' + (noAbiertas > 0 ? "#DC2626" : "#16A34A") + ';">' + noAbiertas + '</div><div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;">Abiertas</div></div>' +
      '<div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:#16A34A;">' + (s.cerradas || 0) + '</div><div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;">Resueltas</div></div>' +
      '<div style="text-align:center;"><div style="font-size:20px;font-weight:700;">' + (s.total || 0) + '</div><div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;">Total hist\u00f3rico</div></div>' +
      '<div style="text-align:center;"><div style="font-size:20px;font-weight:700;">' + (s.tiempo_medio_dias != null ? s.tiempo_medio_dias + 'd' : '\u2014') + '</div><div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;">Tiempo resol.</div></div>' +
    '</div>' +
    (sevBadges ? '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + sevBadges + '</div>' : '') +
    urgHtml +
  '</div>';
}
window.cargarMaquinaria = cargarMaquinaria;

window.maqDetalle = function (maqId) {
  Promise.all([
    fetch("/api/maquinaria/maquinas/" + maqId).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }),
    fetch("/api/maquinaria/maquinas/" + maqId + "/disponibilidad").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch("/api/maquinaria/maquinas/" + maqId + "/asignaciones").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (results) {
    var m = results[0];
    var disp = results[1] || {};
    var asignData = results[2] || {};
    var asignaciones = asignData.asignaciones || [];
      var container = document.getElementById("maquinaria-detalle-content");
      var estadoColors = { disponible: "#16A34A", en_proyecto: "#2563EB", en_taller: "#CA8A04", baja: "#DC2626" };
      var estadoLabelsD = { disponible: "Disponible", en_proyecto: "En proyecto", en_taller: "En taller", baja: "De baja" };
      var estComp = m.estado_computado || m.estado;
      var color = estadoColors[estComp] || "#64748B";
      // Estado operativo (Fase 1A)
      var eoColors = { operativa:"#16A34A", operativa_con_limitaciones:"#CA8A04", en_reserva:"#6366F1",
        pendiente_taller:"#D97706", parada_diagnostico:"#EA580C", parada_pendiente_pieza:"#DC2626",
        en_reparacion:"#DC2626", decomisionada:"#64748B" };
      var eoLabels = { operativa:"Operativa", operativa_con_limitaciones:"Op. con limitaciones", en_reserva:"En reserva",
        pendiente_taller:"Pte. taller", parada_diagnostico:"Parada (diag.)", parada_pendiente_pieza:"Parada (pieza)",
        en_reparacion:"En reparación", decomisionada:"Decomisionada" };
      var eoVal = m.estado_operativo || "operativa";
      var eoColor = eoColors[eoVal] || "#64748B";
      var critColors = { baja:"#16A34A", media:"#CA8A04", alta:"#EA580C", critica:"#DC2626" };
      var critLabels = { baja:"Baja", media:"Media", alta:"Alta", critica:"Crítica" };
      var critVal = m.criticidad || "media";

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

      // Incidencias (abiertas + historial)
      var sevColors = { baja: "#64748B", media: "#CA8A04", alta: "#DC2626", seguridad: "#7C3AED" };
      var zonasLabels = { hidraulico: "Hidr\u00e1ulico", motor: "Motor", bomba_inyeccion: "Bomba de inyecci\u00f3n", martillo_percusion: "Martillo", orugas_rodillos: "Orugas/Rodillos", reductor: "Reductor", sistema_electrico: "El\u00e9ctrico", estructura_chasis: "Estructura", barrena: "Barrena", cabina: "Cabina", refrigeracion: "Refrigeraci\u00f3n", otro: "Otro" };
      window._maqZonasLabels = zonasLabels;
      window._maqSevColors = sevColors;
      // Store all incidencias (open + historial) for detail view
      window._maqIncMap = {};
      (m.incidencias || []).forEach(function(i) { window._maqIncMap[i.id] = i; });
      (m.incidencias_historial || []).forEach(function(i) { window._maqIncMap[i.id] = i; });
      var incAbiertasHtml = "";
      if (m.incidencias && m.incidencias.length) {
        incAbiertasHtml = m.incidencias.map(function (i) {
          var sc = sevColors[i.severidad] || "#64748B";
          var zonaTag = i.zona && zonasLabels[i.zona]
            ? '<span style="font-size:10px;padding:2px 6px;border-radius:99px;background:#2563EB15;color:#2563EB;margin-left:4px;">' + zonasLabels[i.zona] + '</span>'
            : '';
          var fotosHtml = "";
          if (i.fotos && i.fotos.length) {
            fotosHtml = '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">' +
              i.fotos.map(function (f) {
                var safeName = f.filepath || f.filename || "";
                var origName = (f.filename || safeName).toLowerCase();
                var isVid = origName.endsWith(".mp4") || origName.endsWith(".mov") || origName.endsWith(".webm");
                return isVid
                  ? '<a href="/fotos_maquinaria/' + _esc(safeName) + '" target="_blank" style="width:48px;height:48px;border-radius:4px;background:#1e293b;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;text-decoration:none;">\u25B6</a>'
                  : '<a href="/fotos_maquinaria/' + _esc(safeName) + '" target="_blank"><img src="/fotos_maquinaria/' + _esc(safeName) + '" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid var(--color-border);"></a>';
              }).join("") + '</div>';
          }
          var nFotosTag = i.fotos && i.fotos.length ? '<span style="font-size:10px;color:var(--color-text-secondary);margin-left:4px;">\uD83D\uDCF7' + i.fotos.length + '</span>' : '';
          var nUpdatesTag = i.updates && i.updates.length ? '<span style="font-size:10px;color:#3b82f6;margin-left:4px;">\uD83D\uDCAC' + i.updates.length + '</span>' : '';
          var reporter = i.operario_nombre || i.usuario_nombre || "";
          return '<div style="border:1px solid var(--color-border);border-left:3px solid ' + sc + ';border-radius:var(--radius-md);padding:12px;margin-bottom:8px;cursor:pointer;" onclick="maqVerDetalleIncidencia(' + i.id + ',' + m.id + ')">' +
            '<div style="display:flex;justify-content:space-between;align-items:start;">' +
              '<div><span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + sc + '15;color:' + sc + ';font-weight:500;text-transform:uppercase;">' + i.severidad + '</span>' +
                zonaTag + nFotosTag + nUpdatesTag +
                '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:8px;">' + (i.fecha || "").substring(0, 10) + '</span></div>' +
              '<button onclick="event.stopPropagation();maqCerrarIncidencia(' + i.id + ',' + m.id + ')" class="btn-outline" style="font-size:11px;padding:2px 8px;">Cerrar</button>' +
            '</div>' +
            '<p style="font-size:13px;margin:8px 0 0;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;">' + _esc(i.descripcion) + '</p>' +
            (reporter ? '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">Reportada por ' + _esc(reporter) + '</div>' : '') +
          '</div>';
        }).join("");
      } else {
        incAbiertasHtml = '<p style="text-align:center;color:#16A34A;font-size:13px;padding:12px 0;">Sin incidencias abiertas \u2713</p>';
      }

      var historial = m.incidencias_historial || [];
      var incHistHtml = "";
      var MAX_HIST_PREVIEW = 5;
      if (historial.length) {
        var preview = historial.slice(0, MAX_HIST_PREVIEW);
        incHistHtml = preview.map(function (i) {
          var sc = sevColors[i.severidad] || "#64748B";
          var zonaTag = i.zona && zonasLabels[i.zona]
            ? '<span style="font-size:10px;padding:1px 5px;border-radius:99px;background:#2563EB15;color:#2563EB;margin-left:4px;">' + zonasLabels[i.zona] + '</span>'
            : '';
          var nFotos = i.fotos && i.fotos.length ? '<span style="font-size:10px;color:var(--color-text-secondary);margin-left:4px;">\uD83D\uDCF7' + i.fotos.length + '</span>' : '';
          var nUpd = i.updates && i.updates.length ? '<span style="font-size:10px;color:#3b82f6;margin-left:4px;">\uD83D\uDCAC' + i.updates.length + '</span>' : '';
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--color-border);cursor:pointer;" onclick="maqVerDetalleIncidencia(' + i.id + ',' + m.id + ')">' +
            '<div style="flex:1;min-width:0;">' +
              '<span style="font-size:11px;padding:1px 6px;border-radius:99px;background:' + sc + '15;color:' + sc + ';font-weight:500;text-transform:uppercase;">' + i.severidad + '</span>' +
              zonaTag + nFotos + nUpd +
              '<span style="font-size:12px;color:var(--color-text-secondary);margin-left:6px;">' + (i.fecha || "").substring(0, 10) + '</span>' +
              '<div style="font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _esc(i.descripcion) + '</div>' +
            '</div>' +
            '<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:#16A34A15;color:#16A34A;white-space:nowrap;margin-left:8px;">Cerrada</span>' +
          '</div>';
        }).join("");
        if (historial.length > MAX_HIST_PREVIEW) {
          incHistHtml += '<div style="text-align:center;padding:8px;">' +
            '<button class="btn-outline" style="font-size:12px;padding:4px 14px;" onclick="maqVerHistorialIncMaquina(' + m.id + ',\'' + _esc(m.nombre) + '\')">Ver las ' + historial.length + ' incidencias \u203A</button></div>';
        }
      } else {
        incHistHtml = '<p style="text-align:center;color:var(--color-text-secondary);font-size:12px;padding:10px;">Sin historial</p>';
      }

      container.innerHTML =
        // Header
        '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px;">' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
              '<button onclick="maqVolver()" style="background:none;border:none;cursor:pointer;font-size:18px;padding:0;color:var(--color-text-secondary);">\u2190</button>' +
              '<h1 style="margin:0;font-size:24px;">' + _esc(m.nombre) + '</h1>' +
              '<span style="font-size:12px;padding:3px 10px;border-radius:99px;background:' + color + '15;color:' + color + ';font-weight:500;">' + (estadoLabelsD[estComp] || estComp) + '</span>' +
              '<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:' + eoColor + '15;color:' + eoColor + ';font-weight:500;border:1px solid ' + eoColor + '30;">' + (eoLabels[eoVal] || eoVal) + '</span>' +
              '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:' + (critColors[critVal] || '#64748B') + '15;color:' + (critColors[critVal] || '#64748B') + ';font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Crit: ' + (critLabels[critVal] || critVal) + '</span>' +
            '</div>' +
            '<div style="font-size:14px;color:var(--color-text-secondary);">' + _esc(m.internal_id) + ' \u00b7 ' + _esc(m.marca || '') + ' ' + _esc(m.modelo) +
              (m.numero_serie ? ' \u00b7 S/N: ' + _esc(m.numero_serie) : '') +
              (m.matricula ? ' \u00b7 Mat: ' + _esc(m.matricula) : '') +
              (m.ano_fabricacion ? ' \u00b7 ' + m.ano_fabricacion : '') +
              (m.proyecto_actual && (m.proyecto_actual.nombre || m.proyecto_actual.codigo) ? ' \u00b7 \uD83D\uDCCD ' + _esc(m.proyecto_actual.nombre || m.proyecto_actual.codigo) : (m.proyecto_nombre ? ' \u00b7 \uD83D\uDCCD ' + _esc(m.proyecto_nombre) : '')) + '</div>' +
            (m.operario_nombre ? '<div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px;">\uD83D\uDC77 Operario habitual: ' + _esc(m.operario_nombre) + '</div>' : '') +
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
                '<div onclick="maqExportPassport(' + m.id + ')" style="padding:10px 16px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--color-border);" onmouseover="this.style.background=\'var(--color-bg-secondary)\'" onmouseout="this.style.background=\'\'">Asset Passport</div>' +
'<div onclick="maqExportDisponibilidad(' + m.id + ')" style="padding:10px 16px;cursor:pointer;font-size:13px;" onmouseover="this.style.background=\'var(--color-bg-secondary)\'" onmouseout="this.style.background=\'\'">Informe Disponibilidad (PDF)</div>' +
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
            '<div style="font-size:12px;color:var(--color-text-secondary);">Inicial: ' + (m.horometro_inicial || 0).toLocaleString("es-ES") + 'h \u00b7 Comisi\u00f3n: ' + (m.fecha_comision ? m.fecha_comision.substring(0, 4) : '\u2014') + '</div>' +
            '<div style="font-size:11px;color:' + (m.horometro_ultima_lectura ? 'var(--color-text-secondary)' : '#DC2626') + ';margin-top:4px;">\u00dalt. lectura: ' + (m.horometro_ultima_lectura || 'Sin lecturas') + '</div></div>' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
            '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:8px;">Revisiones pendientes</div>' + revPend + '</div>' +
          '<div style="background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;">' +
            '<div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;margin-bottom:6px;">Incidencias abiertas</div>' +
            '<div style="font-size:28px;font-weight:700;color:' + (m.incidencias && m.incidencias.length ? '#DC2626' : '#16A34A') + ';">' + (m.incidencias ? m.incidencias.length : 0) + '</div></div>' +
        '</div>' +

        // KPIs disponibilidad (Tarea 1.13)
        (function () {
          var d = disp;
          var dtHoras = d.horas_downtime || 0;
          var dtDias = d.dias_parados || 0;
          var costeDt = dtHoras > 0 ? Math.round((dtHoras / 8) * 900) : 0;
          var costeTotal = (d.coste_acumulado || 0) + costeDt;
          var mttr = d.mttr_horas || 0;
          var inc100h = d.incidencias_por_100h || 0;
          var dtColor = dtHoras > 24 ? '#DC2626' : dtHoras > 8 ? '#CA8A04' : '#16A34A';
          var costeColor = costeTotal > 5000 ? '#DC2626' : costeTotal > 1000 ? '#CA8A04' : '#16A34A';
          var mttrColor = mttr > 48 ? '#DC2626' : mttr > 24 ? '#CA8A04' : '#16A34A';
          var inc100Color = inc100h > 2 ? '#DC2626' : inc100h > 1 ? '#CA8A04' : '#16A34A';
          return '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;">' +
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid ' + dtColor + ';border-radius:var(--radius-lg);padding:14px 16px;">' +
              '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Downtime ' + (d.dias || 90) + 'd</div>' +
              '<div style="font-size:24px;font-weight:700;color:' + dtColor + ';margin:4px 0;">' + dtHoras + 'h</div>' +
              '<div style="font-size:11px;color:var(--color-text-secondary);">' + dtDias + ' días parados</div></div>' +
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid ' + costeColor + ';border-radius:var(--radius-lg);padding:14px 16px;">' +
              '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Coste ' + (d.dias || 90) + 'd</div>' +
              '<div style="font-size:24px;font-weight:700;color:' + costeColor + ';margin:4px 0;">' + costeTotal.toLocaleString("es-ES") + '€</div>' +
              '<div style="font-size:11px;color:var(--color-text-secondary);">Repuestos + servicio + parada</div></div>' +
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid ' + mttrColor + ';border-radius:var(--radius-lg);padding:14px 16px;">' +
              '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;">MTTR</div>' +
              '<div style="font-size:24px;font-weight:700;color:' + mttrColor + ';margin:4px 0;">' + mttr + 'h</div>' +
              '<div style="font-size:11px;color:var(--color-text-secondary);">Tiempo medio reparación</div></div>' +
            '<div style="background:var(--color-white);border:1px solid var(--color-border);border-left:3px solid ' + inc100Color + ';border-radius:var(--radius-lg);padding:14px 16px;">' +
              '<div style="font-size:10px;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Inc/100h</div>' +
              '<div style="font-size:24px;font-weight:700;color:' + inc100Color + ';margin:4px 0;">' + inc100h + '</div>' +
              '<div style="font-size:11px;color:var(--color-text-secondary);">Incidencias por 100h operación</div></div>' +
          '</div>';
        })() +

        // 2 columns
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
          '<div style="display:flex;flex-direction:column;gap:14px;min-width:0;">' +
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
          // Incidencias con tabs (Tarea 1.14)
          (function () {
            var allInc = (m.incidencias || []).concat(historial);
            var now = new Date();
            var d90 = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
            var inc90 = allInc.filter(function (i) { return i.fecha && new Date(i.fecha) >= d90; });

            function _incRow(i, showEstado) {
              var sc = sevColors[i.severidad] || "#64748B";
              var zonaTag = i.zona && zonasLabels[i.zona]
                ? '<span style="font-size:10px;padding:1px 5px;border-radius:99px;background:#2563EB15;color:#2563EB;margin-left:4px;">' + zonasLabels[i.zona] + '</span>' : '';
              var nFotos = i.fotos && i.fotos.length ? '<span style="font-size:10px;color:var(--color-text-secondary);margin-left:4px;">\uD83D\uDCF7' + i.fotos.length + '</span>' : '';
              var nUpd = i.updates && i.updates.length ? '<span style="font-size:10px;color:#3b82f6;margin-left:4px;">\uD83D\uDCAC' + i.updates.length + '</span>' : '';
              var esCerrada = ['cerrada','cerrada_validada','resuelta'].indexOf(i.estado) >= 0;
              var estadoTag = showEstado
                ? (esCerrada
                    ? '<span style="font-size:10px;padding:2px 6px;border-radius:99px;background:#16A34A15;color:#16A34A;margin-left:8px;">Cerrada</span>'
                    : '<span style="font-size:10px;padding:2px 6px;border-radius:99px;background:#CA8A0415;color:#CA8A04;margin-left:8px;">' + (i.estado || 'abierta') + '</span>')
                : '';
              var reporter = i.operario_nombre || i.usuario_nombre || "";
              return '<div style="border:1px solid var(--color-border);border-left:3px solid ' + sc + ';border-radius:var(--radius-md);padding:10px 12px;margin-bottom:6px;cursor:pointer;" onclick="maqVerDetalleIncidencia(' + i.id + ',' + m.id + ')">' +
                '<div style="display:flex;justify-content:space-between;align-items:start;">' +
                  '<div><span style="font-size:10px;padding:2px 6px;border-radius:99px;background:' + sc + '15;color:' + sc + ';font-weight:500;text-transform:uppercase;">' + i.severidad + '</span>' +
                    zonaTag + nFotos + nUpd + estadoTag +
                    '<span style="font-size:11px;color:var(--color-text-secondary);margin-left:6px;">' + (i.fecha || "").substring(0, 10) + '</span></div>' +
                  (!esCerrada ? '<button onclick="event.stopPropagation();maqCerrarIncidencia(' + i.id + ',' + m.id + ')" class="btn-outline" style="font-size:10px;padding:2px 6px;">Cerrar</button>' : '') +
                '</div>' +
                '<p style="font-size:12px;margin:6px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(i.descripcion) + '</p>' +
                (reporter ? '<div style="font-size:10px;color:var(--color-text-secondary);margin-top:2px;">por ' + _esc(reporter) + '</div>' : '') +
              '</div>';
            }

            var openCount = (m.incidencias || []).length;
            var tabAbiertas = openCount ? (m.incidencias || []).map(function (i) { return _incRow(i, false); }).join("") :
              '<p style="text-align:center;color:#16A34A;font-size:13px;padding:12px 0;">Sin incidencias abiertas \u2713</p>';
            var tab90d = inc90.length ? inc90.map(function (i) { return _incRow(i, true); }).join("") :
              '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:12px 0;">Sin incidencias en 90 d\u00EDas</p>';
            var tabTodas = allInc.length ? allInc.map(function (i) { return _incRow(i, true); }).join("") :
              '<p style="text-align:center;color:var(--color-text-secondary);font-size:13px;padding:12px 0;">Sin incidencias</p>';

            var tabStyle = 'style="padding:6px 14px;font-size:12px;font-weight:500;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;color:var(--color-text-secondary);"';
            var tabActiveStyle = 'border-bottom-color:#2563EB;color:#2563EB;';
            return '<div style="display:flex;flex-direction:column;min-width:0;">' +
              '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
                '<div style="padding:6px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                  '<div style="display:flex;gap:0;" id="maq-inc-tabs">' +
                    '<button ' + tabStyle.replace('transparent', '#2563EB') + ' data-tab="abiertas" onclick="maqSwitchIncTab(\'abiertas\')">\u26A0\uFE0F Abiertas (' + openCount + ')</button>' +
                    '<button ' + tabStyle + ' data-tab="90d" onclick="maqSwitchIncTab(\'90d\')">90 d\u00EDas (' + inc90.length + ')</button>' +
                    '<button ' + tabStyle + ' data-tab="todas" onclick="maqSwitchIncTab(\'todas\')">Todas (' + allInc.length + ')</button>' +
                  '</div>' +
                  '<button class="btn-outline" style="font-size:11px;padding:3px 10px;" onclick="maqNuevaIncidencia(' + m.id + ')">+ Nueva</button>' +
                '</div>' +
                '<div style="max-height:500px;overflow-y:auto;padding:10px;">' +
                  '<div id="maq-inc-tab-abiertas">' + tabAbiertas + '</div>' +
                  '<div id="maq-inc-tab-90d" style="display:none;">' + tab90d + '</div>' +
                  '<div id="maq-inc-tab-todas" style="display:none;">' + tabTodas + '</div>' +
                '</div>' +
              '</div>' +
            '</div>';
          })() +
        '</div>' +

        // Historial obras timeline (Tarea 1.15)
        (function () {
          if (!asignaciones.length) return '';
          var tlHtml = asignaciones.map(function (a, idx) {
            var isActive = !a.fecha_fin;
            var dotColor = isActive ? '#16A34A' : '#94A3B8';
            var dateRange = (a.fecha_inicio || '?').substring(0, 10) + ' → ' + (a.fecha_fin ? a.fecha_fin.substring(0, 10) : 'Actual');
            var dias = 0;
            if (a.fecha_inicio) {
              var start = new Date(a.fecha_inicio);
              var end = a.fecha_fin ? new Date(a.fecha_fin) : new Date();
              dias = Math.round((end - start) / (1000 * 86400));
            }
            return '<div style="display:flex;gap:12px;padding:12px 0;' + (idx < asignaciones.length - 1 ? 'border-bottom:1px solid var(--color-border);' : '') + '">' +
              '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:16px;">' +
                '<span style="width:12px;height:12px;border-radius:50%;background:' + dotColor + ';flex-shrink:0;' + (isActive ? 'box-shadow:0 0 0 3px ' + dotColor + '30;' : '') + '"></span>' +
                (idx < asignaciones.length - 1 ? '<div style="width:2px;flex:1;background:var(--color-border);"></div>' : '') +
              '</div>' +
              '<div style="flex:1;">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">' +
                  '<span style="font-size:14px;font-weight:' + (isActive ? '600' : '500') + ';">' + _esc(a.proyecto_nombre || a.proyecto_codigo || 'Proyecto #' + a.proyecto_id) + '</span>' +
                  (isActive ? '<span style="font-size:10px;padding:2px 6px;border-radius:99px;background:#16A34A15;color:#16A34A;font-weight:500;">Activa</span>' : '') +
                '</div>' +
                '<div style="font-size:12px;color:var(--color-text-secondary);">' + dateRange + ' · ' + dias + ' días</div>' +
                (a.operario_nombre ? '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:2px;">👷 ' + _esc(a.operario_nombre) + '</div>' : '') +
                (a.ubicacion ? '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:1px;">📍 ' + _esc(a.ubicacion) + '</div>' : '') +
              '</div>' +
            '</div>';
          }).join('');
          return '<div style="margin-top:20px;">' +
            '<div style="border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;">' +
              '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">' +
                '<span style="font-size:14px;font-weight:600;">🏗️ Historial de obras</span>' +
                '<span style="font-size:12px;color:var(--color-text-secondary);">' + asignaciones.length + ' asignaciones</span></div>' +
              '<div style="padding:12px 16px;max-height:300px;overflow-y:auto;">' + tlHtml + '</div>' +
            '</div>' +
          '</div>';
        })() +

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

      // Show detail panel, hide list (must clear inline display:none set by activarModulo)
      document.getElementById("panel-maquinaria").classList.remove("visible");
      document.getElementById("panel-maquinaria").style.display = 'none';
      document.getElementById("panel-maquinaria-detalle").style.display = '';
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

window.maqExportDisponibilidad = function (maqId) {
  document.querySelectorAll('[style*="z-index:50"]').forEach(function (d) { d.style.display = "none"; });
  mostrarToast("Generando informe de disponibilidad...", "info");
  var url = "/api/maquinaria/maquinas/" + maqId + "/export/disponibilidad";
  fetch(url).then(function (res) {
    if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || "Error " + res.status); });
    var fname = "informe_disponibilidad.pdf";
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
  document.getElementById("panel-maquinaria-detalle").style.display = 'none';
  document.getElementById("panel-maquinaria").style.display = '';
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

// ── Archivos pendientes de subir para la incidencia ──
var _incPendingFiles = [];

// \u2500\u2500 Wizard modal incidencias 4 pasos (Tarea 1.17) \u2500\u2500
window._incWizardStep = 1;
window.maqNuevaIncidencia = function (maqId) {
  _incPendingFiles = [];
  window._incWizardStep = 1;
  var hoy = new Date().toISOString().substring(0, 10);
  var ahora = new Date().toTimeString().substring(0, 5);
  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-maq-incidencia";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };

  var stepIndicator =
    '<div style="display:flex;gap:0;margin-bottom:20px;" id="inc-wiz-steps">' +
      [["1","Datos"],["2","Diagn\u00f3stico"],["3","Media"],["4","Revisar"]].map(function (s, i) {
        return '<div data-step="' + (i + 1) + '" style="flex:1;text-align:center;padding:8px 0;border-bottom:3px solid ' + (i === 0 ? '#2563EB' : '#E2E8F0') + ';cursor:pointer;" onclick="maqIncWizGoTo(' + (i + 1) + ')">' +
          '<div style="font-size:10px;font-weight:600;color:' + (i === 0 ? '#2563EB' : 'var(--color-text-secondary)') + ';">PASO ' + s[0] + '</div>' +
          '<div style="font-size:12px;color:' + (i === 0 ? '#2563EB' : 'var(--color-text-secondary)') + ';">' + s[1] + '</div></div>';
      }).join('') +
    '</div>';

  // Step 1: Datos b\u00E1sicos
  var step1 =
    '<div id="inc-wiz-1">' +
      '<div style="display:grid;gap:12px;">' +
        '<div><label class="form-label">Descripci\u00f3n / S\u00edntoma *</label>' +
          '<textarea id="maq-inc-desc" class="form-input" rows="3" placeholder="Describe qu\u00E9 se observ\u00f3..."></textarea></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label class="form-label">Severidad</label>' +
            '<select id="maq-inc-sev" class="form-input">' +
              '<option value="baja">Baja</option><option value="media" selected>Media</option>' +
              '<option value="alta">Alta</option><option value="seguridad">Seguridad</option></select></div>' +
          '<div><label class="form-label">Zona / Sistema</label>' +
            '<select id="maq-inc-zona" class="form-input"><option value="">-- Seleccionar --</option></select></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label class="form-label">Fecha</label>' +
            '<input type="date" id="maq-inc-fecha" class="form-input" value="' + hoy + '"></div>' +
          '<div><label class="form-label">Hora detecci\u00f3n</label>' +
            '<input type="time" id="maq-inc-hora" class="form-input" value="' + ahora + '"></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--color-bg-secondary);border-radius:var(--radius-md);">' +
          '<input type="checkbox" id="maq-inc-siguio" style="width:18px;height:18px;">' +
          '<label for="maq-inc-siguio" style="font-size:13px;cursor:pointer;">La m\u00E1quina sigui\u00f3 operando tras detectar la incidencia</label>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Step 2: Diagn\u00f3stico
  var step2 =
    '<div id="inc-wiz-2" style="display:none;">' +
      '<div style="display:grid;gap:12px;">' +
        '<div><label class="form-label">Tipo de incidencia</label>' +
          '<select id="maq-inc-tipo" class="form-input">' +
            '<option value="">-- Seleccionar --</option>' +
            '<option value="averia">Aver\u00eda</option><option value="desgaste">Desgaste</option>' +
            '<option value="accidente">Accidente</option><option value="preventivo">Preventivo detectado</option>' +
            '<option value="electrica">Fallo el\u00E9ctrico</option><option value="hidraulica">Fallo hidr\u00E1ulico</option>' +
            '<option value="otro">Otro</option></select></div>' +
        '<div><label class="form-label">Hor\u00f3metro al detectar</label>' +
          '<input type="number" id="maq-inc-horometro" class="form-input" placeholder="Ej: 4793"></div>' +
        '<div><label class="form-label">Causa probable</label>' +
          '<textarea id="maq-inc-causa" class="form-input" rows="2" placeholder="Hip\u00f3tesis de la causa ra\u00edz..."></textarea></div>' +
        '<div><label class="form-label">Operario que detect\u00f3</label>' +
          '<input type="text" id="maq-inc-operario" class="form-input" placeholder="Nombre del operario"></div>' +
      '</div>' +
    '</div>';

  // Step 3: Media
  var step3 =
    '<div id="inc-wiz-3" style="display:none;">' +
      '<div style="display:grid;gap:12px;">' +
        '<p style="font-size:13px;color:var(--color-text-secondary);margin:0;">A\u00f1ade fotos o v\u00eddeos para documentar la incidencia. Puedes a\u00f1adir m\u00E1s despu\u00E9s.</p>' +
        '<div><label class="form-label">Fotos / V\u00eddeos</label>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
            '<label style="display:inline-flex;align-items:center;gap:6px;padding:12px 20px;border:2px dashed var(--color-border);border-radius:var(--radius-md);cursor:pointer;font-size:14px;color:var(--color-text-secondary);width:100%;justify-content:center;">' +
              '<span>\uD83D\uDCF7 Pulsa para a\u00f1adir archivos</span>' +
              '<input type="file" id="maq-inc-files" multiple accept="image/*,video/*" style="display:none;" onchange="maqIncFilesChanged()">' +
            '</label>' +
            '<span id="maq-inc-files-count" style="font-size:12px;color:var(--color-text-secondary);"></span>' +
          '</div>' +
          '<div id="maq-inc-files-preview" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"></div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Step 4: Revisi\u00f3n
  var step4 =
    '<div id="inc-wiz-4" style="display:none;">' +
      '<div id="inc-wiz-summary" style="display:grid;gap:8px;"></div>' +
    '</div>';

  modal.innerHTML =
    '<div class="modal-content" style="max-width:560px;max-height:85vh;overflow-y:auto;">' +
      '<h2 style="margin:0 0 12px;">Nueva incidencia</h2>' +
      stepIndicator + step1 + step2 + step3 + step4 +
      '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid var(--color-border);">' +
        '<button class="btn-outline" id="inc-wiz-prev" style="display:none;" onclick="maqIncWizPrev()">\u2190 Anterior</button>' +
        '<div style="margin-left:auto;display:flex;gap:8px;">' +
          '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-incidencia\').remove()">Cancelar</button>' +
          '<button class="btn-primary" id="inc-wiz-next" style="width:auto;padding:8px 20px;" onclick="maqIncWizNext(' + maqId + ')">Siguiente \u2192</button>' +
        '</div>' +
      '</div></div>';
  document.body.appendChild(modal);

  // Cargar zonas
  fetch("/api/maquinaria/incidencias/zonas").then(function (r) { return r.json(); }).then(function (d) {
    var sel = document.getElementById("maq-inc-zona");
    if (!sel) return;
    (d.zonas || []).forEach(function (z) {
      var opt = document.createElement("option");
      opt.value = z.value;
      opt.textContent = z.label;
      sel.appendChild(opt);
    });
  });
};

window.maqIncWizGoTo = function (step) {
  if (step < 1 || step > 4) return;
  // Validate step 1 before leaving it
  if (window._incWizardStep === 1 && step > 1) {
    var desc = ((document.getElementById("maq-inc-desc") || {}).value || "").trim();
    if (!desc) { mostrarToast("La descripci\u00f3n es obligatoria", "error"); return; }
  }
  window._incWizardStep = step;
  for (var i = 1; i <= 4; i++) {
    var panel = document.getElementById("inc-wiz-" + i);
    if (panel) panel.style.display = i === step ? "" : "none";
  }
  // Update step indicators
  var tabs = document.getElementById("inc-wiz-steps");
  if (tabs) {
    tabs.querySelectorAll("[data-step]").forEach(function (el) {
      var s = parseInt(el.getAttribute("data-step"));
      el.style.borderBottomColor = s === step ? "#2563EB" : s < step ? "#16A34A" : "#E2E8F0";
      el.querySelectorAll("div").forEach(function (d) { d.style.color = s === step ? "#2563EB" : s < step ? "#16A34A" : "var(--color-text-secondary)"; });
    });
  }
  // Show/hide prev button
  var prev = document.getElementById("inc-wiz-prev");
  if (prev) prev.style.display = step > 1 ? "" : "none";
  // Change next button text
  var next = document.getElementById("inc-wiz-next");
  if (next) next.textContent = step === 4 ? "Reportar incidencia" : "Siguiente \u2192";
  // Build summary on step 4
  if (step === 4) _incBuildSummary();
};

window.maqIncWizNext = function (maqId) {
  if (window._incWizardStep < 4) {
    maqIncWizGoTo(window._incWizardStep + 1);
  } else {
    maqGuardarIncidencia(maqId);
  }
};

window.maqIncWizPrev = function () {
  if (window._incWizardStep > 1) maqIncWizGoTo(window._incWizardStep - 1);
};

function _incBuildSummary() {
  var el = document.getElementById("inc-wiz-summary");
  if (!el) return;
  var sevLabels = { baja:"Baja", media:"Media", alta:"Alta", seguridad:"Seguridad" };
  var sevColors = { baja:"#64748B", media:"#CA8A04", alta:"#EA580C", seguridad:"#DC2626" };
  var desc = ((document.getElementById("maq-inc-desc") || {}).value || "").trim();
  var sev = (document.getElementById("maq-inc-sev") || {}).value || "media";
  var zona = (document.getElementById("maq-inc-zona") || {});
  var zonaText = zona.selectedIndex > 0 ? zona.options[zona.selectedIndex].text : "No especificada";
  var fecha = (document.getElementById("maq-inc-fecha") || {}).value || "";
  var hora = (document.getElementById("maq-inc-hora") || {}).value || "";
  var siguio = (document.getElementById("maq-inc-siguio") || {}).checked;
  var tipo = (document.getElementById("maq-inc-tipo") || {});
  var tipoText = tipo.selectedIndex > 0 ? tipo.options[tipo.selectedIndex].text : "No especificado";
  var horometro = (document.getElementById("maq-inc-horometro") || {}).value || "";
  var causa = ((document.getElementById("maq-inc-causa") || {}).value || "").trim();
  var operario = ((document.getElementById("maq-inc-operario") || {}).value || "").trim();
  var nFotos = _incPendingFiles.length;
  var sc = sevColors[sev] || "#64748B";

  function _row(label, val, color) {
    return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--color-border);">' +
      '<span style="font-size:12px;color:var(--color-text-secondary);">' + label + '</span>' +
      '<span style="font-size:13px;font-weight:500;' + (color ? 'color:' + color + ';' : '') + '">' + val + '</span></div>';
  }

  el.innerHTML =
    '<div style="background:' + sc + '08;border:1px solid ' + sc + '20;border-radius:var(--radius-md);padding:12px 16px;margin-bottom:4px;">' +
      '<div style="font-size:11px;color:' + sc + ';text-transform:uppercase;font-weight:600;">Severidad: ' + (sevLabels[sev] || sev) + '</div>' +
      '<div style="font-size:14px;margin-top:4px;">' + _esc(desc.substring(0, 120)) + (desc.length > 120 ? '...' : '') + '</div>' +
    '</div>' +
    _row("Zona / Sistema", zonaText) +
    _row("Fecha", fecha + (hora ? ' ' + hora : '')) +
    _row("Sigui\u00f3 operando", siguio ? "S\u00ed" : "No", siguio ? "#16A34A" : "#DC2626") +
    (tipoText !== "No especificado" ? _row("Tipo incidencia", tipoText) : '') +
    (horometro ? _row("Hor\u00f3metro", horometro + "h") : '') +
    (causa ? _row("Causa probable", _esc(causa.substring(0, 80))) : '') +
    (operario ? _row("Operario detect\u00f3", _esc(operario)) : '') +
    _row("Archivos adjuntos", nFotos ? nFotos + " archivo(s)" : "Ninguno");
}

window.maqIncFilesChanged = function () {
  var input = document.getElementById("maq-inc-files");
  if (!input || !input.files) return;
  for (var i = 0; i < input.files.length; i++) _incPendingFiles.push(input.files[i]);
  _incRenderPreview();
};

function _incRenderPreview() {
  var container = document.getElementById("maq-inc-files-preview");
  var counter = document.getElementById("maq-inc-files-count");
  if (!container) return;
  if (counter) counter.textContent = _incPendingFiles.length ? _incPendingFiles.length + " archivo(s)" : "";
  container.innerHTML = _incPendingFiles.map(function (f, idx) {
    var isVideo = f.type && f.type.startsWith("video");
    var thumb = isVideo
      ? '<div style="width:60px;height:60px;border-radius:4px;background:#1e293b;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;">\u25B6</div>'
      : '<img src="' + URL.createObjectURL(f) + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;">';
    return '<div style="position:relative;">' + thumb +
      '<button onclick="_incRemoveFile(' + idx + ')" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#DC2626;color:#fff;border:none;font-size:11px;cursor:pointer;line-height:1;padding:0;">\u2715</button>' +
      '<div style="font-size:10px;color:var(--color-text-secondary);max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(f.name) + '</div></div>';
  }).join("");
}
window._incRemoveFile = function (idx) {
  _incPendingFiles.splice(idx, 1);
  _incRenderPreview();
};

window.maqGuardarIncidencia = function (maqId) {
  var desc = ((document.getElementById("maq-inc-desc") || {}).value || "").trim();
  if (!desc) { mostrarToast("La descripci\u00f3n es obligatoria", "error"); return; }
  var btn = document.getElementById("inc-wiz-next");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }
  var zona = (document.getElementById("maq-inc-zona") || {}).value || null;
  var payload = {
    maquina_id: maqId, descripcion: desc,
    severidad: (document.getElementById("maq-inc-sev") || {}).value || "media",
    fecha: (document.getElementById("maq-inc-fecha") || {}).value,
    zona: zona,
    hora_deteccion: (document.getElementById("maq-inc-hora") || {}).value || null,
    maquina_siguio_operando: (document.getElementById("maq-inc-siguio") || {}).checked ? 1 : 0,
    tipo_incidencia: (document.getElementById("maq-inc-tipo") || {}).value || null,
    horometro_deteccion: (document.getElementById("maq-inc-horometro") || {}).value ? parseInt((document.getElementById("maq-inc-horometro") || {}).value) : null,
    sintoma_inicial: desc,
    operario_detecta: ((document.getElementById("maq-inc-operario") || {}).value || "").trim() || null
  };
  // Remove null values
  Object.keys(payload).forEach(function (k) { if (payload[k] === null || payload[k] === "") delete payload[k]; });
  fetch("/api/maquinaria/incidencias", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(function (res) {
    if (!res.ok) throw new Error("Error creando incidencia");
    return res.json();
  }).then(function (inc) {
    // Subir fotos/vídeos secuencialmente
    if (!_incPendingFiles.length) return inc;
    var chain = Promise.resolve();
    _incPendingFiles.forEach(function (file) {
      chain = chain.then(function () {
        var fd = new FormData();
        fd.append("foto", file);
        fd.append("entidad_tipo", "incidencia");
        fd.append("entidad_id", inc.id);
        return fetch("/api/maquinaria/fotos", { method: "POST", body: fd });
      });
    });
    return chain.then(function () { return inc; });
  }).then(function () {
    _incPendingFiles = [];
    var m = document.getElementById("modal-maq-incidencia"); if (m) m.remove();
    mostrarToast("Incidencia reportada", "success");
    maqDetalle(maqId);
  }).catch(function (e) {
    mostrarToast(e.message || "Error", "error");
    if (btn) { btn.disabled = false; btn.textContent = "Reportar incidencia"; }
  });
};

window.maqCerrarIncidencia = function (incId, maqId) {
  _incPendingFiles = [];
  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-maq-cerrar-inc";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:480px;">' +
      '<h2 style="margin:0 0 16px;">Cerrar incidencia</h2>' +
      '<div style="display:grid;gap:12px;">' +
        '<div><label class="form-label">Resoluci\u00f3n *</label>' +
          '<textarea id="maq-cerrar-resolucion" class="form-input" rows="3" placeholder="Describe c\u00f3mo se resolvi\u00f3..."></textarea></div>' +
        '<div><label class="form-label">Fotos / V\u00eddeos de resoluci\u00f3n</label>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
            '<label style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px dashed var(--color-border);border-radius:var(--radius-md);cursor:pointer;font-size:13px;color:var(--color-text-secondary);">' +
              '<span>\uD83D\uDCF7 A\u00f1adir archivos</span>' +
              '<input type="file" multiple accept="image/*,video/*" style="display:none;" onchange="maqIncFilesChanged()">' +
            '</label>' +
            '<span id="maq-inc-files-count" style="font-size:12px;color:var(--color-text-secondary);"></span>' +
          '</div>' +
          '<div id="maq-inc-files-preview" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"></div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-cerrar-inc\').remove()">Cancelar</button>' +
        '<button class="btn-primary" id="maq-cerrar-btn" style="width:auto;padding:8px 20px;" onclick="maqConfirmarCerrarIncidencia(' + incId + ',' + maqId + ')">Cerrar incidencia</button>' +
      '</div></div>';
  document.body.appendChild(modal);
};

window.maqConfirmarCerrarIncidencia = function (incId, maqId) {
  var resolucion = ((document.getElementById("maq-cerrar-resolucion") || {}).value || "").trim();
  if (!resolucion) { mostrarToast("La resoluci\u00f3n es obligatoria", "error"); return; }
  var btn = document.getElementById("maq-cerrar-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Cerrando..."; }
  fetch("/api/maquinaria/incidencias/" + incId, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado: "cerrada", resolucion: resolucion })
  }).then(function (res) {
    if (!res.ok) throw new Error("Error cerrando");
    return res.json();
  }).then(function () {
    // Subir fotos de resolución
    if (!_incPendingFiles.length) return;
    var chain = Promise.resolve();
    _incPendingFiles.forEach(function (file) {
      chain = chain.then(function () {
        var fd = new FormData();
        fd.append("foto", file);
        fd.append("entidad_tipo", "incidencia");
        fd.append("entidad_id", incId);
        return fetch("/api/maquinaria/fotos", { method: "POST", body: fd });
      });
    });
    return chain;
  }).then(function () {
    _incPendingFiles = [];
    var m = document.getElementById("modal-maq-cerrar-inc"); if (m) m.remove();
    mostrarToast("Incidencia cerrada", "success");
    maqDetalle(maqId);
  }).catch(function (e) {
    mostrarToast(e.message || "Error", "error");
    if (btn) { btn.disabled = false; btn.textContent = "Cerrar incidencia"; }
  });
};

// ── Editar máquina ──

window.maqEditarModal = function (maqId) {
Promise.all([
    fetch("/api/maquinaria/maquinas/" + maqId).then(function (r) { return r.json(); }),
    fetch("/api/proyectos").then(function (r) { return r.json(); }).catch(function () { return { proyectos: [] }; }),
    fetch("/api/empleados?solo_activos=1").then(function (r) { return r.json(); }).catch(function () { return { empleados: [] }; }),
    fetch("/api/maquinaria/incidencias/config").then(function (r) { return r.json(); }).catch(function () { return { estados_operativos: [] }; })
  ]).then(function (results) {
    var m = results[0];
    var proyectos = results[1].proyectos || [];
    var empleados = results[2].empleados || [];
    var config = results[3];
    if (!m || m.error) { mostrarToast("Error al cargar m\u00e1quina", "error"); return; }
    var proyOpts = '<option value="">Sin proyecto</option>' +
      proyectos.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === m.proyecto_id ? ' selected' : '') + '>' + (p.codigo ? p.codigo + ' \u00b7 ' : '') + _esc(p.nombre) + '</option>';
      }).join("");
    var operarioOpts = '<option value="">Sin asignar</option>' +
      empleados.map(function (e) {
        return '<option value="' + e.id + '"' + (e.id === m.operario_habitual_id ? ' selected' : '') + '>' + _esc(e.nombre || e.username) + '</option>';
      }).join("");
    var estadoOpLabels = { decomisionada:"Decomisionada", en_reparacion:"En reparaci\u00f3n", parada_pendiente_pieza:"Parada (pieza)",
      parada_diagnostico:"Parada (diagn\u00f3stico)", pendiente_taller:"Pendiente taller", en_reserva:"En reserva",
      operativa_con_limitaciones:"Operativa con limitaciones", operativa:"Operativa" };
    var estadoOpOpts = (config.estados_operativos || []).map(function (eo) {
      return '<option value="' + eo + '"' + (eo === m.estado_operativo ? ' selected' : '') + '>' + (estadoOpLabels[eo] || eo) + '</option>';
    }).join("");
    var modal = document.createElement("div");
    modal.className = "modal-overlay visible";
    modal.id = "modal-maq-editar";
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML =
      '<div class="modal-content" style="max-width:600px;max-height:90vh;overflow-y:auto;">' +
        '<h2 style="margin:0 0 16px;">Editar ' + _esc(m.nombre) + '</h2>' +
        '<div style="display:grid;gap:12px;">' +
          // Fila 1: Nombre + Modelo
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div><label class="form-label">Nombre</label><input type="text" id="maq-ed-nombre" class="form-input" value="' + _esc(m.nombre) + '"></div>' +
            '<div><label class="form-label">Modelo</label><input type="text" id="maq-ed-modelo" class="form-input" value="' + _esc(m.modelo) + '"></div></div>' +
          // Fila 2: Marca + Tipo
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div><label class="form-label">Marca</label><input type="text" id="maq-ed-marca" class="form-input" value="' + _esc(m.marca || '') + '"></div>' +
            '<div><label class="form-label">Tipo</label><select id="maq-ed-tipo" class="form-input">' +
              '<option value="hincadora"' + (m.tipo_maquina === 'hincadora' ? ' selected' : '') + '>Hincadora</option>' +
              '<option value="perforadora"' + (m.tipo_maquina === 'perforadora' ? ' selected' : '') + '>Perforadora</option>' +
              '<option value="grua"' + (m.tipo_maquina === 'grua' ? ' selected' : '') + '>Gr\u00faa</option>' +
              '<option value="otro"' + (m.tipo_maquina === 'otro' ? ' selected' : '') + '>Otro</option></select></div></div>' +
          // Fila 3: N\u00ba Serie + Matr\u00edcula
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div><label class="form-label">N\u00ba Serie</label><input type="text" id="maq-ed-serie" class="form-input" value="' + _esc(m.numero_serie || '') + '"></div>' +
            '<div><label class="form-label">Matr\u00edcula</label><input type="text" id="maq-ed-matricula" class="form-input" value="' + _esc(m.matricula || '') + '"></div></div>' +
          // Fila 4: A\u00f1o fabricaci\u00f3n + Hor\u00f3metro
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div><label class="form-label">A\u00f1o fabricaci\u00f3n</label><input type="number" id="maq-ed-ano" class="form-input" min="1990" max="2030" value="' + (m.ano_fabricacion || '') + '"></div>' +
            '<div><label class="form-label">Hor\u00f3metro actual</label><input type="number" id="maq-ed-horometro" class="form-input" step="any" value="' + (m.horometro_actual || 0) + '"></div></div>' +
          // Fila 5: Estado + Proyecto
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div><label class="form-label">Estado</label><select id="maq-ed-estado" class="form-input">' +
              '<option value="disponible"' + (m.estado === 'disponible' ? ' selected' : '') + '>Disponible</option>' +
              '<option value="en_proyecto"' + (m.estado === 'en_proyecto' ? ' selected' : '') + '>En proyecto</option>' +
              '<option value="en_taller"' + (m.estado === 'en_taller' ? ' selected' : '') + '>En taller</option>' +
              '<option value="baja"' + (m.estado === 'baja' ? ' selected' : '') + '>De baja</option></select></div>' +
            '<div><label class="form-label">Proyecto</label><select id="maq-ed-proyecto" class="form-input">' + proyOpts + '</select></div></div>' +
          // Fila 6: Estado operativo + Criticidad
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div><label class="form-label">Estado operativo</label><select id="maq-ed-estado-op" class="form-input">' + estadoOpOpts + '</select></div>' +
            '<div><label class="form-label">Criticidad</label><select id="maq-ed-criticidad" class="form-input">' +
              '<option value="baja"' + (m.criticidad === 'baja' ? ' selected' : '') + '>Baja</option>' +
              '<option value="media"' + (m.criticidad === 'media' ? ' selected' : '') + '>Media</option>' +
              '<option value="alta"' + (m.criticidad === 'alta' ? ' selected' : '') + '>Alta</option>' +
              '<option value="critica"' + (m.criticidad === 'critica' ? ' selected' : '') + '>Cr\u00edtica</option></select></div></div>' +
          // Fila 7: Operario habitual
          '<div><label class="form-label">Operario habitual</label><select id="maq-ed-operario" class="form-input">' + operarioOpts + '</select></div>' +
          // Fila 8: Ubicaci\u00f3n
          '<div><label class="form-label">Ubicaci\u00f3n</label><input type="text" id="maq-ed-ubicacion" class="form-input" value="' + _esc(m.ubicacion || '') + '" placeholder="Ej: Parque PV Cuenca"></div>' +
          // Fila 9: Notas
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
  var _v = function (id) { return (document.getElementById(id) || {}).value || ""; };
  var data = {
    nombre: _v("maq-ed-nombre"),
    modelo: _v("maq-ed-modelo"),
    marca: _v("maq-ed-marca"),
    tipo_maquina: _v("maq-ed-tipo"),
    numero_serie: _v("maq-ed-serie"),
    matricula: _v("maq-ed-matricula"),
    ano_fabricacion: parseInt(_v("maq-ed-ano")) || null,
    horometro_actual: parseFloat(_v("maq-ed-horometro")) || 0,
    estado: _v("maq-ed-estado"),
    proyecto_id: parseInt(_v("maq-ed-proyecto")) || null,
    criticidad: _v("maq-ed-criticidad"),
    operario_habitual_id: parseInt(_v("maq-ed-operario")) || null,
    ubicacion: _v("maq-ed-ubicacion"),
    notas: _v("maq-ed-notas")
  };
  // Si cambi\u00f3 estado_operativo, enviar por endpoint separado
  var estadoOp = _v("maq-ed-estado-op");
  var guardar = fetch("/api/maquinaria/maquinas/" + maqId, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  });
  guardar.then(function (res) {
    if (!res.ok) { mostrarToast("Error al guardar", "error"); return; }
    // Actualizar estado operativo si se seleccion\u00f3
    if (estadoOp) {
      fetch("/api/maquinaria/maquinas/" + maqId + "/estado-operativo", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_operativo: estadoOp })
      }).then(function () {
        var m = document.getElementById("modal-maq-editar"); if (m) m.remove();
        mostrarToast("M\u00e1quina actualizada", "success");
        maqDetalle(maqId);
      });
    } else {
      var m = document.getElementById("modal-maq-editar"); if (m) m.remove();
      mostrarToast("M\u00e1quina actualizada", "success");
      maqDetalle(maqId);
    }
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
          var safeName = f.filepath || f.filename || "";
          return '<img src="/fotos_maquinaria/' + _esc(safeName) + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--color-border);cursor:pointer;" ' +
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

// ── Historial completo de incidencias ──

window.maqVerHistorialIncidencias = function () {
  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-maq-historial-inc";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:900px;max-height:90vh;display:flex;flex-direction:column;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h2 style="margin:0;">Historial de incidencias</h2>' +
        '<button style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--color-text-secondary);" onclick="document.getElementById(\'modal-maq-historial-inc\').remove()">\u2715</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
        '<select id="inc-filtro-maquina" class="form-input" style="width:auto;font-size:12px;" onchange="maqFiltrarIncidencias()">' +
          '<option value="">Todas las m\u00e1quinas</option></select>' +
        '<select id="inc-filtro-estado" class="form-input" style="width:auto;font-size:12px;" onchange="maqFiltrarIncidencias()">' +
          '<option value="">Todos los estados</option><option value="abierta">Abierta</option><option value="en_curso">En curso</option><option value="cerrada">Cerrada</option></select>' +
        '<select id="inc-filtro-severidad" class="form-input" style="width:auto;font-size:12px;" onchange="maqFiltrarIncidencias()">' +
          '<option value="">Todas las severidades</option><option value="seguridad">Seguridad</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select>' +
        '<input type="date" id="inc-filtro-desde" class="form-input" style="width:auto;font-size:12px;" onchange="maqFiltrarIncidencias()">' +
      '</div>' +
      '<div id="inc-historial-body" style="flex:1;overflow-y:auto;min-height:0;">' +
        '<p style="text-align:center;color:var(--color-text-secondary);padding:24px;">Cargando...</p>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  // Cargar máquinas en el filtro
  fetch("/api/maquinaria/maquinas").then(function (r) { return r.json(); }).then(function (d) {
    var sel = document.getElementById("inc-filtro-maquina");
    if (!sel) return;
    (d.maquinas || []).forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.nombre || m.identificador_interno || "?";
      sel.appendChild(opt);
    });
  });
  maqFiltrarIncidencias();
};

window.maqFiltrarIncidencias = function () {
  var maquinaId = (document.getElementById("inc-filtro-maquina") || {}).value || "";
  var estado = (document.getElementById("inc-filtro-estado") || {}).value || "";
  var severidad = (document.getElementById("inc-filtro-severidad") || {}).value || "";
  var desde = (document.getElementById("inc-filtro-desde") || {}).value || "";
  var qs = "?limit=200";
  if (maquinaId) qs += "&maquina_id=" + maquinaId;
  if (estado) qs += "&estado=" + estado;
  if (severidad) qs += "&severidad=" + severidad;
  if (desde) qs += "&desde=" + desde;

  fetch("/api/maquinaria/incidencias" + qs)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var incs = data.incidencias || [];
      var body = document.getElementById("inc-historial-body");
      if (!body) return;
      if (!incs.length) {
        body.innerHTML = '<p style="text-align:center;color:var(--color-text-secondary);padding:24px;">Sin incidencias con estos filtros</p>';
        return;
      }
      var sevColors = { seguridad: "#DC2626", alta: "#EA580C", media: "#CA8A04", baja: "#64748B" };
      var estColors = { abierta: "#DC2626", en_curso: "#CA8A04", cerrada: "#16A34A" };
      body.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="border-bottom:2px solid var(--color-border);text-align:left;">' +
          '<th style="padding:8px 6px;">Fecha</th>' +
          '<th style="padding:8px 6px;">M\u00e1quina</th>' +
          '<th style="padding:8px 6px;">Descripci\u00f3n</th>' +
          '<th style="padding:8px 6px;">Severidad</th>' +
          '<th style="padding:8px 6px;">Estado</th>' +
          '<th style="padding:8px 6px;">Operario</th>' +
          '<th style="padding:8px 6px;">Resoluci\u00f3n</th>' +
        '</tr></thead><tbody>' +
        incs.map(function (i) {
          var sevC = sevColors[i.severidad] || "#64748B";
          var estC = estColors[i.estado] || "#64748B";
          return '<tr style="border-bottom:1px solid var(--color-border);">' +
            '<td style="padding:6px;white-space:nowrap;">' + _esc(i.fecha || "") + '</td>' +
            '<td style="padding:6px;font-weight:500;cursor:pointer;color:#2563EB;" onclick="document.getElementById(\'modal-maq-historial-inc\').remove();maqDetalle(' + i.maquina_id + ')">' + _esc(i.maquina_nombre || "?") + '</td>' +
            '<td style="padding:6px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + _esc(i.descripcion || "") + '">' + _esc(i.descripcion || "") + '</td>' +
            '<td style="padding:6px;"><span style="padding:2px 6px;border-radius:8px;font-size:11px;font-weight:600;background:' + sevC + '15;color:' + sevC + ';">' + _esc(i.severidad || "?") + '</span></td>' +
            '<td style="padding:6px;"><span style="padding:2px 6px;border-radius:8px;font-size:11px;font-weight:600;background:' + estC + '15;color:' + estC + ';">' + _esc(i.estado || "?") + '</span></td>' +
            '<td style="padding:6px;font-size:12px;color:var(--color-text-secondary);">' + _esc(i.operario_nombre || "\u2014") + '</td>' +
            '<td style="padding:6px;font-size:12px;color:var(--color-text-secondary);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + _esc(i.resolucion || "") + '">' + _esc(i.resolucion || "\u2014") + '</td>' +
          '</tr>';
        }).join("") +
        '</tbody></table>';
    });
};

window.maqVerHistorialIncMaquina = function (maqId, maqNombre) {
  // Reutiliza el modal general pero pre-filtra por máquina
  maqVerHistorialIncidencias();
  // Esperar a que se carguen las opciones del select y seleccionar la máquina
  setTimeout(function () {
    var sel = document.getElementById("inc-filtro-maquina");
    if (sel) {
      sel.value = maqId;
      // Si la opción aún no está cargada (fetch pendiente), reintentar
      if (!sel.value) {
        var _checkInterval = setInterval(function () {
          sel.value = maqId;
          if (sel.value == maqId) {
            clearInterval(_checkInterval);
            maqFiltrarIncidencias();
          }
        }, 200);
        setTimeout(function () { clearInterval(_checkInterval); }, 3000);
      } else {
        maqFiltrarIncidencias();
      }
    }
  }, 100);
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

// ═══ Detalle incidencia (admin) ═══

function _incGalleryHtml(fotos) {
  if (!fotos || !fotos.length) return '';
  var html = '<div style="font-weight:600;font-size:13px;margin:16px 0 8px;">Fotos / V\u00eddeos (' + fotos.length + ')</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  fotos.forEach(function (f) {
    var src = "/fotos_maquinaria/" + _esc(f.filepath || f.filename || "");
    var origName = (f.filename || f.filepath || "").toLowerCase();
    var isVid = origName.match(/\.(mp4|mov|avi|webm)$/);
    if (isVid) {
      html += '<video src="' + src + '" controls preload="metadata" style="max-width:100%;max-height:280px;border-radius:8px;border:1px solid var(--color-border);"></video>';
    } else {
      html += '<img src="' + src + '" style="max-height:280px;border-radius:8px;border:1px solid var(--color-border);cursor:pointer;" onclick="event.stopPropagation();maqLightbox(\'' + src + '\')">';
    }
  });
  html += '</div>';
  return html;
}

function _incZonasOptions(selected) {
  var zonasLabels = window._maqZonasLabels || {};
  var keys = Object.keys(zonasLabels);
  var html = '<option value="">— Sin zona —</option>';
  keys.forEach(function (k) {
    html += '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + zonasLabels[k] + '</option>';
  });
  return html;
}

function _incUpdatesTimelineHtml(updates, incId, maqId) {
  if (!updates || !updates.length) return '';
  var html = '<div style="font-weight:600;font-size:13px;margin:16px 0 8px;border-top:1px solid var(--color-border);padding-top:12px;">Actualizaciones (' + updates.length + ')</div>';
  updates.forEach(function (u) {
    var fecha = (u.created_at || "").replace("T", " ").substring(0, 16);
    html += '<div style="background:var(--color-bg-page);border-radius:var(--radius-md);padding:8px 12px;margin-bottom:6px;border-left:3px solid #3b82f6;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
        '<span style="font-size:12px;font-weight:600;color:var(--color-text-primary);">' + _esc(u.autor_nombre || "Operario") + '</span>' +
        '<span style="font-size:11px;color:var(--color-text-secondary);">' + fecha + '</span>' +
      '</div>' +
      '<div style="font-size:13px;line-height:1.5;white-space:pre-wrap;">' + _esc(u.texto || "") + '</div>';
    if (u.fotos && u.fotos.length > 0) {
      html += _incGalleryHtml(u.fotos);
    }
    html += '</div>';
  });
  return html;
}

function _incUpdateFormHtml(incId, maqId) {
  return '<div style="border-top:1px solid var(--color-border);margin-top:12px;padding-top:12px;">' +
    '<div style="font-weight:600;font-size:13px;margin-bottom:6px;">A\u00f1adir actualizaci\u00f3n</div>' +
    '<textarea id="admin-update-texto" rows="2" placeholder="Ej: Recambios pedidos, llegan el martes..." style="width:100%;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:8px;font-size:13px;resize:vertical;min-height:40px;box-sizing:border-box;"></textarea>' +
    '<div style="display:flex;gap:8px;align-items:center;margin-top:6px;">' +
      '<label style="font-size:12px;color:var(--color-text-secondary);cursor:pointer;" onclick="document.getElementById(\'admin-update-foto\').click()">\ud83d\udcf7 Adjuntar foto</label>' +
      '<input type="file" id="admin-update-foto" accept="image/*,video/*" style="display:none;" onchange="window._adminUpdateFile=this.files[0];this.nextElementSibling.textContent=this.files[0]?this.files[0].name:\'\'">' +
      '<span style="font-size:11px;color:var(--color-text-secondary);"></span>' +
      '<div style="flex:1;"></div>' +
      '<button class="btn-primary" style="width:auto;padding:6px 16px;font-size:12px;" onclick="maqEnviarUpdateAdmin(' + incId + ',' + maqId + ')">Enviar</button>' +
    '</div>' +
  '</div>';
}

window.maqEnviarUpdateAdmin = function (incId, maqId) {
  var textarea = document.getElementById("admin-update-texto");
  var texto = (textarea ? textarea.value : "").trim();
  if (!texto) { mostrarToast("Escribe la actualizaci\u00f3n", "error"); return; }

  fetch("/api/maquinaria/incidencias/" + incId + "/updates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto: texto })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (d.error) { mostrarToast(d.error, "error"); return; }

    var file = window._adminUpdateFile;
    if (file) {
      var fd = new FormData();
      fd.append("foto", file);
      fd.append("entidad_tipo", "inc_update");
      fd.append("entidad_id", d.id);
      fetch("/api/maquinaria/fotos", { method: "POST", body: fd })
      .then(function () {
        window._adminUpdateFile = null;
        mostrarToast("Actualizaci\u00f3n a\u00f1adida", "ok");
        var modal = document.getElementById("modal-maq-detalle-inc");
        if (modal) modal.remove();
        maqCargarDetalle(maqId);
      })
      .catch(function () {
        mostrarToast("Actualizaci\u00f3n a\u00f1adida (fallo foto)", "warn");
        var modal = document.getElementById("modal-maq-detalle-inc");
        if (modal) modal.remove();
        maqCargarDetalle(maqId);
      });
    } else {
      mostrarToast("Actualizaci\u00f3n a\u00f1adida", "ok");
      var modal = document.getElementById("modal-maq-detalle-inc");
      if (modal) modal.remove();
      maqCargarDetalle(maqId);
    }
  })
  .catch(function (err) { mostrarToast("Error: " + err.message, "error"); });
};

// Tab switcher incidencias (Tarea 1.14)
window.maqSwitchIncTab = function (tab) {
  var tabs = document.getElementById("maq-inc-tabs");
  if (tabs) {
    tabs.querySelectorAll("button").forEach(function (b) {
      b.style.borderBottomColor = b.getAttribute("data-tab") === tab ? "#2563EB" : "transparent";
      b.style.color = b.getAttribute("data-tab") === tab ? "#2563EB" : "var(--color-text-secondary)";
    });
  }
  ["abiertas", "90d", "todas"].forEach(function (t) {
    var el = document.getElementById("maq-inc-tab-" + t);
    if (el) el.style.display = t === tab ? "" : "none";
  });
};

window.maqVerDetalleIncidencia = function (incId, maqId) {
  var i = (window._maqIncMap || {})[incId];
  if (!i) { mostrarToast("Incidencia no encontrada", "error"); return; }

  var sevColors = window._maqSevColors || { baja: "#64748B", media: "#CA8A04", alta: "#DC2626", seguridad: "#7C3AED" };
  var zonasLabels = window._maqZonasLabels || {};
  var sc = sevColors[i.severidad] || "#64748B";
  var zonaLabel = zonasLabels[i.zona] || "";
  var reporter = i.operario_nombre || i.usuario_nombre || "\u2014";
  var fotos = i.fotos || [];
  var isCerrada = i.estado === "cerrada";

  var galleryHtml = _incGalleryHtml(fotos);

  // Resolution section (for closed)
  var resolucionHtml = "";
  if (isCerrada) {
    resolucionHtml =
      '<div style="margin-top:16px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--radius-md);">' +
        '<div style="font-weight:600;font-size:13px;color:#16A34A;margin-bottom:4px;">Resoluci\u00f3n</div>' +
        '<p style="font-size:13px;white-space:pre-wrap;margin:0;">' + _esc(i.resolucion || "Sin detalle") + '</p>' +
        (i.cerrada_at ? '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:6px;">Cerrada: ' + i.cerrada_at + '</div>' : '') +
      '</div>';
  }

  // Updates timeline
  var updates = i.updates || [];
  var updatesHtml = _incUpdatesTimelineHtml(updates, incId, maqId);

  // Update form (for open incidencias, and also for admin on closed ones)
  var updateFormHtml = _incUpdateFormHtml(incId, maqId);

  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-maq-detalle-inc";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:600px;">' +
      // Header
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<h2 style="margin:0;font-size:18px;">Incidencia #' + i.id + '</h2>' +
          '<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:' + sc + '15;color:' + sc + ';font-weight:600;text-transform:uppercase;">' + (i.severidad || "media") + '</span>' +
          (zonaLabel ? '<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:#2563EB15;color:#2563EB;font-weight:500;">' + zonaLabel + '</span>' : '') +
          (isCerrada ? '<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:#16A34A15;color:#16A34A;font-weight:500;">Cerrada</span>' : '<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:#DC262615;color:#DC2626;font-weight:500;">Abierta</span>') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:4px;">' +
          '<button class="btn-outline" style="font-size:12px;padding:4px 12px;" onclick="maqEditarIncidencia(' + i.id + ',' + maqId + ')" title="Editar">\u270F\uFE0F Editar</button>' +
          '<button style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--color-text-secondary);" onclick="document.getElementById(\'modal-maq-detalle-inc\').remove()">\u2715</button>' +
        '</div>' +
      '</div>' +
      // Body — view mode
      '<div id="inc-detail-body">' +
        '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:13px;margin-bottom:12px;">' +
          '<span style="color:var(--color-text-secondary);font-weight:500;">Fecha</span><span>' + (i.fecha || "\u2014") + '</span>' +
          '<span style="color:var(--color-text-secondary);font-weight:500;">Reportado por</span><span>' + _esc(reporter) + '</span>' +
          (i.telegram_id ? '<span style="color:var(--color-text-secondary);font-weight:500;">Telegram</span><span>' + _esc(i.telegram_id) + '</span>' : '') +
        '</div>' +
        '<div style="font-weight:600;font-size:13px;margin-bottom:6px;">Descripci\u00f3n</div>' +
        '<div style="font-size:13px;line-height:1.5;padding:12px;background:var(--color-bg-page);border-radius:var(--radius-md);white-space:pre-wrap;">' + _esc(i.descripcion || "") + '</div>' +
        galleryHtml +
        resolucionHtml +
        updatesHtml +
        updateFormHtml +
      '</div>' +
      // Footer buttons
      (!isCerrada ?
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
          '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-detalle-inc\').remove()">Cerrar ventana</button>' +
          '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="document.getElementById(\'modal-maq-detalle-inc\').remove();maqCerrarIncidencia(' + i.id + ',' + maqId + ')">Cerrar incidencia</button>' +
        '</div>'
      :
        '<div style="display:flex;justify-content:space-between;margin-top:16px;">' +
          '<button style="background:none;border:1px solid #DC2626;color:#DC2626;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;" onclick="maqEliminarIncidencia(' + i.id + ',' + maqId + ')">Eliminar</button>' +
          '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-detalle-inc\').remove()">Cerrar</button>' +
        '</div>'
      ) +
    '</div>';
  document.body.appendChild(modal);
};

// ═══ Eliminar incidencia (admin, solo históricas/cerradas) ═══

window.maqEliminarIncidencia = function (incId, maqId) {
  if (!confirm("\u00bfEliminar esta incidencia? Se borrar\u00e1n tambi\u00e9n sus fotos y actualizaciones. Esta acci\u00f3n no se puede deshacer.")) return;

  fetch("/api/maquinaria/incidencias/" + incId, { method: "DELETE" })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (d.error) { mostrarToast(d.error, "error"); return; }
    mostrarToast("Incidencia eliminada", "ok");
    var modal = document.getElementById("modal-maq-detalle-inc");
    if (modal) modal.remove();
    if (window._maqIncMap) delete window._maqIncMap[incId];
    maqCargarDetalle(maqId);
  })
  .catch(function (err) { mostrarToast("Error: " + err.message, "error"); });
};

// ═══ Editar incidencia (admin) ═══

window.maqEditarIncidencia = function (incId, maqId) {
  // Close the detail modal if open
  var existing = document.getElementById("modal-maq-detalle-inc");
  if (existing) existing.remove();

  var i = (window._maqIncMap || {})[incId];
  if (!i) { mostrarToast("Incidencia no encontrada", "error"); return; }

  var sevColors = window._maqSevColors || { baja: "#64748B", media: "#CA8A04", alta: "#DC2626", seguridad: "#7C3AED" };
  var sc = sevColors[i.severidad] || "#64748B";
  var isCerrada = i.estado === "cerrada";
  var fotos = i.fotos || [];
  var galleryHtml = _incGalleryHtml(fotos);

  var modal = document.createElement("div");
  modal.className = "modal-overlay visible";
  modal.id = "modal-maq-edit-inc";
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div class="modal-content" style="max-width:600px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h2 style="margin:0;font-size:18px;">Editar incidencia #' + i.id + '</h2>' +
        '<button style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--color-text-secondary);" onclick="document.getElementById(\'modal-maq-edit-inc\').remove()">\u2715</button>' +
      '</div>' +
      '<div style="display:grid;gap:14px;">' +
        // Descripción
        '<div>' +
          '<label class="form-label">Descripci\u00f3n</label>' +
          '<textarea id="edit-inc-desc" class="form-input" rows="4">' + _esc(i.descripcion || "") + '</textarea>' +
        '</div>' +
        // Zona
        '<div>' +
          '<label class="form-label">Zona / Componente</label>' +
          '<select id="edit-inc-zona" class="form-input">' + _incZonasOptions(i.zona) + '</select>' +
        '</div>' +
        // Severidad
        '<div>' +
          '<label class="form-label">Severidad</label>' +
          '<select id="edit-inc-sev" class="form-input">' +
            '<option value="baja"' + (i.severidad === "baja" ? " selected" : "") + '>Baja</option>' +
            '<option value="media"' + (i.severidad === "media" ? " selected" : "") + '>Media</option>' +
            '<option value="alta"' + (i.severidad === "alta" ? " selected" : "") + '>Alta</option>' +
            '<option value="seguridad"' + (i.severidad === "seguridad" ? " selected" : "") + '>Seguridad (parada)</option>' +
          '</select>' +
        '</div>' +
        // Resolución (solo si cerrada)
        (isCerrada ?
          '<div>' +
            '<label class="form-label">Resoluci\u00f3n</label>' +
            '<textarea id="edit-inc-resolucion" class="form-input" rows="3">' + _esc(i.resolucion || "") + '</textarea>' +
          '</div>'
        : '') +
        // Fotos (read-only gallery)
        (galleryHtml ? '<div>' + galleryHtml + '</div>' : '') +
        // Adjuntar más fotos
        '<div>' +
          '<label class="form-label">A\u00f1adir fotos / v\u00eddeos</label>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
            '<label style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px dashed var(--color-border);border-radius:var(--radius-md);cursor:pointer;font-size:13px;color:var(--color-text-secondary);">' +
              '<span>\uD83D\uDCF7 Seleccionar archivos</span>' +
              '<input type="file" multiple accept="image/*,video/*" id="edit-inc-fotos" style="display:none;">' +
            '</label>' +
            '<span id="edit-inc-fotos-count" style="font-size:12px;color:var(--color-text-secondary);"></span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">' +
        '<button class="btn-outline" onclick="document.getElementById(\'modal-maq-edit-inc\').remove()">Cancelar</button>' +
        '<button class="btn-primary" id="edit-inc-save-btn" style="width:auto;padding:8px 20px;" onclick="maqGuardarEdicionIncidencia(' + i.id + ',' + maqId + ')">Guardar cambios</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  // File count listener
  var fileInput = document.getElementById("edit-inc-fotos");
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      var countEl = document.getElementById("edit-inc-fotos-count");
      if (countEl) countEl.textContent = this.files.length + " archivo(s) seleccionado(s)";
    });
  }
};

window.maqGuardarEdicionIncidencia = function (incId, maqId) {
  var desc = (document.getElementById("edit-inc-desc") || {}).value || "";
  var zona = (document.getElementById("edit-inc-zona") || {}).value || "";
  var sev = (document.getElementById("edit-inc-sev") || {}).value || "media";
  var resEl = document.getElementById("edit-inc-resolucion");
  var resolucion = resEl ? resEl.value : undefined;

  if (!desc.trim()) { mostrarToast("La descripci\u00f3n es obligatoria", "error"); return; }

  var btn = document.getElementById("edit-inc-save-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  var body = { descripcion: desc, zona: zona || null, severidad: sev };
  if (resolucion !== undefined) body.resolucion = resolucion;

  fetch("/api/maquinaria/incidencias/" + incId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  .then(function (res) {
    if (!res.ok) throw new Error("Error guardando");
    return res.json();
  })
  .then(function (updated) {
    // Upload new photos if any
    var fileInput = document.getElementById("edit-inc-fotos");
    var files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
    if (!files.length) return updated;

    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        var fd = new FormData();
        fd.append("foto", file);
        fd.append("entidad_tipo", "incidencia");
        fd.append("entidad_id", incId);
        return fetch("/api/maquinaria/fotos", { method: "POST", body: fd });
      });
    });
    return chain.then(function () { return updated; });
  })
  .then(function (updated) {
    // Update local cache
    if (window._maqIncMap) {
      window._maqIncMap[incId] = Object.assign(window._maqIncMap[incId] || {}, updated);
    }
    var m = document.getElementById("modal-maq-edit-inc");
    if (m) m.remove();
    mostrarToast("Incidencia actualizada", "success");
    // Refresh machine detail
    maqDetalle(maqId);
  })
  .catch(function (err) {
    mostrarToast("Error: " + err.message, "error");
    if (btn) { btn.disabled = false; btn.textContent = "Guardar cambios"; }
  });
};

// ═══ Lightbox (admin) ═══

window.maqLightbox = function (src) {
  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;z-index:10000;cursor:pointer;";
  overlay.onclick = function () { overlay.remove(); };
  overlay.innerHTML =
    '<img src="' + src + '" style="max-width:95%;max-height:90vh;object-fit:contain;border-radius:4px;">' +
    '<button style="position:absolute;top:12px;right:16px;background:none;border:none;color:#fff;font-size:2rem;cursor:pointer;">\u2715</button>';
  document.body.appendChild(overlay);
};
