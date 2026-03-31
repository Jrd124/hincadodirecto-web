// ═══ CERTIFICACIONES — certificaciones de avance ═══

function _certFmtNum(n) {
  if (n == null) return '0';
  return Math.round(n).toLocaleString('es-ES');
}

function _certFmtEur(n) {
  if (n == null || isNaN(n)) return '0 \u20ac';
  return Math.round(n).toLocaleString('es-ES') + ' \u20ac';
}

function _certFmtEurDec(n) {
  if (n == null || isNaN(n)) return '0,00 \u20ac';
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac';
}

function _certFormatNotas(texto) {
  if (!texto) return '';
  try {
    var lineas = JSON.parse(texto);
    if (Array.isArray(lineas) && lineas.length && lineas[0].operador) {
      return lineas.map(function (l) {
        return (l.operador || '') + ' con ' + (l.maquina || '') + ' ' + (l.horas || '') + 'h';
      }).join(', ');
    }
  } catch (e) {}
  return texto;
}

window.certNueva = function(proyectoId) {
  var now = new Date();
  var primerDiaMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var ultimoDiaMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0);
  var fDesde = primerDiaMesAnterior.toISOString().substring(0, 10);
  var fHasta = ultimoDiaMesAnterior.toISOString().substring(0, 10);

  // Fetch project prices
  fetch('/api/proyectos/' + proyectoId)
    .then(function(r) { return r.json(); })
    .then(function(proy) {
      var precioHinca = proy.precio_unitario_hinca || 0;
      var precioHora = proy.precio_hora_maquina || 0;

      var modal = document.createElement('div');
      modal.className = 'modal-overlay visible';
      modal.id = 'modal-nueva-cert';
      modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
      modal.innerHTML =
        '<div class="modal-content" style="max-width:550px;">' +
          '<h2 style="margin:0 0 16px;">Nueva certificaci\u00f3n</h2>' +
          '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:16px;overflow:hidden;">' +
            '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:8px;">' +
              '<div style="width:4px;height:20px;border-radius:2px;background:#7C3AED;"></div>' +
              '<span style="font-size:14px;font-weight:600;">Periodo</span>' +
            '</div>' +
            '<div style="padding:16px;">' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div><label class="form-label" style="font-size:12px;">Desde</label><input type="date" id="cert-fecha-desde" class="form-input" value="' + fDesde + '"></div>' +
                '<div><label class="form-label" style="font-size:12px;">Hasta</label><input type="date" id="cert-fecha-hasta" class="form-input" value="' + fHasta + '"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:16px;overflow:hidden;">' +
            '<div style="padding:10px 16px;background:var(--color-bg-page);border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:8px;">' +
              '<div style="width:4px;height:20px;border-radius:2px;background:#CA8A04;"></div>' +
              '<span style="font-size:14px;font-weight:600;">Precios unitarios</span>' +
              '<span style="font-size:11px;color:var(--color-text-secondary);margin-left:auto;">Precargados del proyecto</span>' +
            '</div>' +
            '<div style="padding:16px;">' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                '<div><label class="form-label" style="font-size:12px;">Precio por hinca (\u20ac)</label><input type="number" id="cert-precio-hinca" class="form-input" step="any" value="' + precioHinca + '"></div>' +
                '<div><label class="form-label" style="font-size:12px;">Precio por hora admin (\u20ac)</label><input type="number" id="cert-precio-hora" class="form-input" step="any" value="' + precioHora + '"></div>' +
              '</div>' +
              '<div><label class="form-label" style="font-size:12px;">Transporte (\u20ac, opcional)</label><input type="number" id="cert-transporte" class="form-input" step="any" value="0"></div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button class="btn-outline" onclick="document.getElementById(\'modal-nueva-cert\').remove()">Cancelar</button>' +
            '<button class="btn-primary" style="width:auto;padding:8px 20px;" onclick="certGenerar(' + proyectoId + ')">Generar certificaci\u00f3n</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    });
};

window.certGenerar = function(proyectoId) {
  var data = {
    fecha_desde: document.getElementById('cert-fecha-desde') ? document.getElementById('cert-fecha-desde').value : '',
    fecha_hasta: document.getElementById('cert-fecha-hasta') ? document.getElementById('cert-fecha-hasta').value : '',
    precio_hinca: document.getElementById('cert-precio-hinca') ? document.getElementById('cert-precio-hinca').value : 0,
    precio_hora_admin: document.getElementById('cert-precio-hora') ? document.getElementById('cert-precio-hora').value : 0,
    importe_transporte: document.getElementById('cert-transporte') ? document.getElementById('cert-transporte').value : 0
  };

  if (!data.fecha_desde || !data.fecha_hasta) {
    mostrarToast('Selecciona las fechas', 'error');
    return;
  }

  fetch('/api/proyectos/' + proyectoId + '/certificaciones', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  }).then(function(res) {
    if (res.ok) {
      var m = document.getElementById('modal-nueva-cert');
      if (m) m.remove();
      res.json().then(function(cert) {
        mostrarToast('Certificaci\u00f3n #' + cert.numero + ' generada: ' + _certFmtNum(cert.total_hincas) + ' hincas, ' + _certFmtEur(cert.importe_total), 'success');
        proyectoDashboard(proyectoId);
      });
    } else {
      res.json().then(function(err) {
        mostrarToast(err.error || 'Error al generar', 'error');
      });
    }
  }).catch(function() {
    mostrarToast('Error de conexi\u00f3n', 'error');
  });
};

window.certVer = function(certId, proyectoId) {
  fetch('/api/certificaciones/' + certId)
    .then(function(r) { return r.json(); })
    .then(function(cert) {
      if (cert.error) { mostrarToast(cert.error, 'error'); return; }
      var detRows = (cert.detalle || []).map(function(d) {
        return '<tr style="border-bottom:1px solid var(--color-border);">' +
          '<td style="padding:6px 8px;">' + (d.fecha || '').substring(0,10) + '</td>' +
          '<td style="padding:6px 8px;font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (d.descripcion || '').replace(/"/g, '&quot;') + '">' + _certFormatNotas(d.descripcion) + '</td>' +
          '<td style="padding:6px 8px;text-align:right;font-weight:500;">' + _certFmtNum(d.hincas) + '</td>' +
          '<td style="padding:6px 8px;text-align:right;">' + (d.horas_admin || 0) + '</td>' +
        '</tr>';
      }).join('');

      var modal = document.createElement('div');
      modal.className = 'modal-overlay visible';
      modal.id = 'modal-ver-cert';
      modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
      modal.innerHTML =
        '<div class="modal-content" style="max-width:700px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
            '<h2 style="margin:0;">Certificaci\u00f3n #' + cert.numero + '</h2>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
              '<span class="status-badge status-badge--' + (cert.estado === 'aprobada' ? 'adjudicada' : cert.estado === 'enviada' ? 'enviada' : 'borrador') + '">' + cert.estado + '</span>' +
              (cert.estado === 'borrador' ? '<button class="btn-outline" style="font-size:12px;padding:4px 12px;" onclick="certCambiarEstado(' + certId + ',\'enviada\',' + proyectoId + ')">Marcar enviada</button>' : '') +
              (cert.estado === 'enviada' ? '<button class="btn-outline" style="font-size:12px;padding:4px 12px;" onclick="certCambiarEstado(' + certId + ',\'aprobada\',' + proyectoId + ')">Marcar aprobada</button>' : '') +
            '</div>' +
          '</div>' +
          '<div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:16px;">Periodo: ' + (cert.fecha_desde || '').substring(0,10) + ' \u2192 ' + (cert.fecha_hasta || '').substring(0,10) + '</div>' +

          '<div style="max-height:300px;overflow-y:auto;margin-bottom:16px;">' +
            '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
              '<thead><tr style="border-bottom:2px solid var(--color-border);position:sticky;top:0;background:var(--color-white);">' +
                '<th style="text-align:left;padding:6px 8px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Fecha</th>' +
                '<th style="text-align:left;padding:6px 8px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Descripci\u00f3n</th>' +
                '<th style="text-align:right;padding:6px 8px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">Hincas</th>' +
                '<th style="text-align:right;padding:6px 8px;font-weight:600;color:var(--color-text-secondary);font-size:11px;text-transform:uppercase;">H. Admin</th>' +
              '</tr></thead>' +
              '<tbody>' + detRows + '</tbody>' +
            '</table>' +
          '</div>' +

          '<div style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px;background:var(--color-bg-page);">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">' +
              '<div><div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Producci\u00f3n</div><div style="font-size:16px;font-weight:600;">' + _certFmtNum(cert.total_hincas) + ' hincas \u00d7 ' + _certFmtEurDec(cert.precio_hinca) + '</div><div style="font-size:14px;color:var(--color-primary);font-weight:500;">' + _certFmtEur(cert.importe_produccion) + '</div></div>' +
              '<div><div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Administraci\u00f3n</div><div style="font-size:16px;font-weight:600;">' + (cert.total_horas_admin || 0) + 'h \u00d7 ' + _certFmtEurDec(cert.precio_hora_admin) + '</div><div style="font-size:14px;color:var(--color-primary);font-weight:500;">' + _certFmtEur(cert.importe_administracion) + '</div></div>' +
              '<div><div style="font-size:11px;color:var(--color-text-secondary);text-transform:uppercase;">Transporte</div><div style="font-size:16px;font-weight:600;">\u2014</div><div style="font-size:14px;color:var(--color-primary);font-weight:500;">' + _certFmtEur(cert.importe_transporte) + '</div></div>' +
            '</div>' +
            '<div style="border-top:2px solid var(--color-border);padding-top:12px;display:flex;justify-content:space-between;align-items:center;">' +
              '<span style="font-size:16px;font-weight:700;">TOTAL CERTIFICACI\u00d3N</span>' +
              '<span style="font-size:22px;font-weight:700;color:var(--color-primary);">' + _certFmtEur(cert.importe_total) + '</span>' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
            '<button style="padding:6px 14px;font-size:13px;font-weight:500;color:var(--color-primary);background:transparent;border:1px solid var(--color-primary);border-radius:6px;cursor:pointer;" onclick="window.open(\'/api/certificaciones/' + certId + '/pdf\', \'_blank\')">Descargar PDF</button>' +
            '<button style="padding:6px 14px;font-size:13px;font-weight:500;color:#16A34A;background:transparent;border:1px solid #16A34A;border-radius:6px;cursor:pointer;" onclick="window.open(\'/api/certificaciones/' + certId + '/partes-zip\', \'_blank\')">Descargar partes (ZIP)</button>' +
            '<button style="padding:6px 14px;font-size:13px;color:#DC2626;background:transparent;border:1px solid #DC2626;border-radius:6px;cursor:pointer;" onclick="certEliminar(' + certId + ',' + proyectoId + ')">Eliminar</button>' +
            '<button class="btn-outline" onclick="document.getElementById(\'modal-ver-cert\').remove()">Cerrar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
    });
};

window.certCambiarEstado = function(certId, nuevoEstado, proyectoId) {
  fetch('/api/certificaciones/' + certId + '/estado', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({estado: nuevoEstado})
  }).then(function(res) {
    if (res.ok) {
      var m = document.getElementById('modal-ver-cert');
      if (m) m.remove();
      mostrarToast('Estado actualizado a ' + nuevoEstado, 'success');
      proyectoDashboard(proyectoId);
    }
  });
};

window.certEliminar = function(certId, proyectoId) {
  if (!confirm('\u00bfEliminar esta certificaci\u00f3n? Esta acci\u00f3n no se puede deshacer.')) return;
  fetch('/api/certificaciones/' + certId, { method: 'DELETE' })
    .then(function(res) {
      if (res.ok) {
        var m = document.getElementById('modal-ver-cert');
        if (m) m.remove();
        mostrarToast('Certificaci\u00f3n eliminada', 'success');
        proyectoDashboard(proyectoId);
      } else {
        mostrarToast('Error al eliminar', 'error');
      }
    });
};
