// ═══ TRANSPORTE — cálculo rutas y proveedores ═══
(function () {
  var form = document.getElementById("form-transporte");
  var statusEl = document.getElementById("transporte-status");
  var rutaResumenEl = document.getElementById("transporte-ruta-resumen");
  var mapContainer = document.getElementById("map-transporte");
  var placeholderEl = document.getElementById("transporte-map-placeholder");
  var listaContainer = document.getElementById("transporte-listado-proveedores");
  var listaResumenEl = document.getElementById("transporte-listado-resumen");
  var btnNuevoProveedor = document.getElementById("transporte-btn-nuevo");
  var filtroFijoBtn = document.getElementById("transporte-filtro-fijo");
  var filtroMovilBtn = document.getElementById("transporte-filtro-movil");
  var filtroEmailBtn = document.getElementById("transporte-filtro-email");
  var filtroWebBtn = document.getElementById("transporte-filtro-web");
  var mensajeWhatsappEl = document.getElementById("transporte-whatsapp-mensaje");
  var btnEnviarWhatsapp = document.getElementById("transporte-btn-enviar-whatsapp");
  var btnDescargarExcel = document.getElementById("transporte-btn-descargar-excel");

  if (!form || !statusEl || !mapContainer) return;

  var mapInstance = null;
  var routeLayer = null;
  var markersLayer = null;
  var waypointsLayer = null;
  var originMarker = null;
  var destMarker = null;
  var routeInfoControl = null;
  var proveedorMarkers = [];
  var proveedorItems = [];
  var proveedoresDatos = [];
  var ultimoContextoWhatsapp = null;
  var ultimaBusquedaRuta = null;

  var paradasListEl = document.getElementById("transporte-paradas-list");
  var btnAnadirParada = document.getElementById("transporte-anadir-parada");
  if (btnAnadirParada && paradasListEl) {
    btnAnadirParada.addEventListener("click", function () {
      var row = document.createElement("div");
      row.className = "transporte-parada-row";
      row.innerHTML =
        "<input type=\"text\" class=\"transporte-parada-input\" placeholder=\"Ej. Toledo\" />" +
        "<a href=\"#\" class=\"transporte-quitar-parada\" role=\"button\">Quitar</a>";
      var quitar = row.querySelector(".transporte-quitar-parada");
      quitar.addEventListener("click", function (e) {
        e.preventDefault();
        row.remove();
      });
      paradasListEl.appendChild(row);
    });
  }

  var modalTransportistaOverlay = document.getElementById("modal-transportista-overlay");
  var btnCerrarModalTransportista = document.getElementById("btn-cerrar-modal-transportista");
  var formTransportista = document.getElementById("form-transportista");
  var transportistaStatusEl = document.getElementById("transportista-status");

  function abrirModalTransportista() {
    if (formTransportista) formTransportista.reset();
    if (transportistaStatusEl) transportistaStatusEl.textContent = "";
    if (modalTransportistaOverlay) {
      modalTransportistaOverlay.classList.add("visible");
      modalTransportistaOverlay.setAttribute("aria-hidden", "false");
    }
  }
  function cerrarModalTransportista() {
    if (modalTransportistaOverlay) {
      modalTransportistaOverlay.classList.remove("visible");
      modalTransportistaOverlay.setAttribute("aria-hidden", "true");
    }
  }

  if (btnNuevoProveedor) {
    btnNuevoProveedor.addEventListener("click", abrirModalTransportista);
  }
  if (btnCerrarModalTransportista) {
    btnCerrarModalTransportista.addEventListener("click", cerrarModalTransportista);
  }
  if (modalTransportistaOverlay) {
    modalTransportistaOverlay.addEventListener("click", function (e) {
      if (e.target === modalTransportistaOverlay) cerrarModalTransportista();
    });
  }
  if (formTransportista) {
    formTransportista.addEventListener("submit", function (e) {
      e.preventDefault();
      var nombre = (document.getElementById("transportista-nombre") && document.getElementById("transportista-nombre").value || "").trim();
      if (!nombre) {
        if (transportistaStatusEl) transportistaStatusEl.textContent = "El nombre es obligatorio.";
        return;
      }
      if (transportistaStatusEl) transportistaStatusEl.textContent = "Guardando…";
      var payload = {
        nombre: nombre,
        direccion: (document.getElementById("transportista-direccion") && document.getElementById("transportista-direccion").value || "").trim(),
        codigo_postal: (document.getElementById("transportista-codigo-postal") && document.getElementById("transportista-codigo-postal").value || "").trim(),
        localidad: (document.getElementById("transportista-localidad") && document.getElementById("transportista-localidad").value || "").trim(),
        provincia: (document.getElementById("transportista-provincia") && document.getElementById("transportista-provincia").value || "").trim(),
        telefono_fijo: (document.getElementById("transportista-telefono-fijo") && document.getElementById("transportista-telefono-fijo").value || "").trim(),
        telefono_movil: (document.getElementById("transportista-telefono-movil") && document.getElementById("transportista-telefono-movil").value || "").trim(),
        email: (document.getElementById("transportista-email") && document.getElementById("transportista-email").value || "").trim(),
        web: (document.getElementById("transportista-web") && document.getElementById("transportista-web").value || "").trim(),
      };
      fetch("/api/proyectos/transporte/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json().then(function (data) {
            if (!r.ok) throw new Error(data.error || r.statusText);
            return data;
          });
        })
        .then(function (data) {
          if (transportistaStatusEl) transportistaStatusEl.textContent = "Transportista guardado correctamente.";
          mostrarToast("Transportista guardado correctamente.", "success");
          setTimeout(cerrarModalTransportista, 1200);
        })
        .catch(function (err) {
          if (transportistaStatusEl) transportistaStatusEl.textContent = "Error: " + (err.message || "no se pudo guardar");
        });
    });
  }

  var listadoTransportistasOverlay = document.getElementById("modal-listado-transportistas-overlay");
  var btnVerListado = document.getElementById("transporte-btn-ver-listado");
  var listadoCerrarBtn = document.getElementById("transporte-listado-cerrar");
  var filtroProvinciaSelect = document.getElementById("transporte-filtro-provincia");
  var tablaTransportistasBody = document.getElementById("tabla-transportistas-admin-body");
  var tablaTransportistas = document.getElementById("tabla-transportistas-admin");
  var formCargaMasiva = document.getElementById("form-carga-masiva-transportistas");
  var cargaMasivaStatus = document.getElementById("transporte-carga-masiva-status");
  var listadoTransportistasData = [];
  var listadoSortCol = "nombre";
  var listadoSortDir = 1;

  var modalEditarTransportistaOverlay = document.getElementById("modal-editar-transportista-overlay");
  var formEditarTransportista = document.getElementById("form-editar-transportista");
  var editarTransportistaStatusEl = document.getElementById("editar-transportista-status");
  var btnCerrarEditarTransportista = document.getElementById("btn-cerrar-editar-transportista");

  function escapeHtmlAdmin(s) {
    if (s == null || s === undefined) return "";
    var t = String(s);
    var div = document.createElement("div");
    div.textContent = t;
    return div.innerHTML;
  }

  function renderListadoTable() {
    if (!tablaTransportistasBody) return;
    var provincia = (filtroProvinciaSelect && filtroProvinciaSelect.value) || "";
    var filtered = provincia ? listadoTransportistasData.filter(function (p) { return (p.provincia || "").trim() === provincia; }) : listadoTransportistasData.slice();
    var col = listadoSortCol;
    var sortKey = col === "telefono" ? "telefono_movil" : col;
    var dir = listadoSortDir;
    filtered.sort(function (a, b) {
      var va = a[sortKey] != null ? String(a[sortKey]).trim().toLowerCase() : "";
      var vb = b[sortKey] != null ? String(b[sortKey]).trim().toLowerCase() : "";
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
    tablaTransportistasBody.innerHTML = "";
    var contadorEl = document.getElementById("transporte-listado-contador");
    if (contadorEl) contadorEl.textContent = filtered.length + " transportista" + (filtered.length !== 1 ? "s" : "");
    filtered.forEach(function (p) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-id", p.id);
      // Merged phone column: móvil preferred, fijo as secondary
      var movil = (p.telefono_movil || "").trim();
      var fijo = (p.telefono_fijo || "").trim();
      var telHtml = "";
      if (movil && fijo) {
        telHtml = escapeHtmlAdmin(movil) + "<br><span style=\"font-size:11px;color:#94A3B8\">" + escapeHtmlAdmin(fijo) + "</span>";
      } else if (movil) {
        telHtml = escapeHtmlAdmin(movil);
      } else if (fijo) {
        telHtml = escapeHtmlAdmin(fijo);
      } else {
        telHtml = "—";
      }
      var emailVal = (p.email || "").trim();
      var webVal = (p.web || "").trim();
      tr.innerHTML =
        "<td>" + escapeHtmlAdmin(p.nombre) + "</td>" +
        "<td>" + escapeHtmlAdmin(p.provincia) + "</td>" +
        "<td>" + escapeHtmlAdmin(p.codigo_postal) + "</td>" +
        "<td>" + telHtml + "</td>" +
        "<td class=\"col-ellipsis\" title=\"" + escapeHtmlAdmin(emailVal) + "\">" + (emailVal ? escapeHtmlAdmin(emailVal) : "—") + "</td>" +
        "<td class=\"col-ellipsis\" title=\"" + escapeHtmlAdmin(webVal) + "\">" + (webVal ? escapeHtmlAdmin(webVal) : "—") + "</td>" +
        "<td><button type=\"button\" class=\"btn-small transporte-btn-editar-fila\" data-id=\"" + p.id + "\">Editar</button></td>";
      var btnEdit = tr.querySelector(".transporte-btn-editar-fila");
      if (btnEdit) {
        btnEdit.addEventListener("click", function () {
          var id = parseInt(btnEdit.getAttribute("data-id"), 10);
          if (isNaN(id)) return;
          fetch("/api/proyectos/transporte/proveedores/" + id)
            .then(function (r) { return r.json(); })
            .then(function (prov) {
              if (!prov || !prov.id) return;
              document.getElementById("editar-transportista-id").value = prov.id;
              document.getElementById("editar-transportista-nombre").value = prov.nombre || "";
              document.getElementById("editar-transportista-direccion").value = prov.direccion || "";
              document.getElementById("editar-transportista-codigo-postal").value = prov.codigo_postal || "";
              document.getElementById("editar-transportista-localidad").value = prov.localidad || "";
              document.getElementById("editar-transportista-provincia").value = prov.provincia || "";
              document.getElementById("editar-transportista-telefono-fijo").value = prov.telefono_fijo || "";
              document.getElementById("editar-transportista-telefono-movil").value = prov.telefono_movil || "";
              document.getElementById("editar-transportista-email").value = prov.email || "";
              document.getElementById("editar-transportista-web").value = prov.web || "";
              if (editarTransportistaStatusEl) editarTransportistaStatusEl.textContent = "";
              modalEditarTransportistaOverlay.classList.add("visible");
              modalEditarTransportistaOverlay.setAttribute("aria-hidden", "false");
            })
            .catch(function () { mostrarToast("Error al cargar el proveedor", "error"); });
        });
      }
      tablaTransportistasBody.appendChild(tr);
    });
    if (tablaTransportistas && tablaTransportistas.querySelector("th.sortable")) {
      tablaTransportistas.querySelectorAll("th.sortable").forEach(function (th) {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.getAttribute("data-col") === listadoSortCol) {
          th.classList.add(listadoSortDir === 1 ? "sort-asc" : "sort-desc");
        }
      });
    }
  }

  function abrirModalListadoTransportistas() {
    if (!listadoTransportistasOverlay) return;
    listadoTransportistasOverlay.classList.add("visible");
    listadoTransportistasOverlay.setAttribute("aria-hidden", "false");
    if (tablaTransportistasBody) tablaTransportistasBody.innerHTML = "<tr><td colspan=\"7\">Cargando…</td></tr>";
    fetch("/api/proyectos/transporte/proveedores")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        listadoTransportistasData = data.proveedores || [];
        var provincias = [];
        listadoTransportistasData.forEach(function (p) {
          var pr = (p.provincia || "").trim();
          if (pr && provincias.indexOf(pr) === -1) provincias.push(pr);
        });
        provincias.sort();
        if (filtroProvinciaSelect) {
          var sel = filtroProvinciaSelect;
          var current = sel.value;
          sel.innerHTML = "<option value=\"\">Todas</option>";
          provincias.forEach(function (pr) {
            var opt = document.createElement("option");
            opt.value = pr;
            opt.textContent = pr;
            sel.appendChild(opt);
          });
          sel.value = current || "";
        }
        renderListadoTable();
      })
      .catch(function () {
        if (tablaTransportistasBody) tablaTransportistasBody.innerHTML = "<tr><td colspan=\"7\">Error al cargar el listado.</td></tr>";
      });
  }

  function cerrarModalListadoTransportistas() {
    if (listadoTransportistasOverlay) {
      listadoTransportistasOverlay.classList.remove("visible");
      listadoTransportistasOverlay.setAttribute("aria-hidden", "true");
    }
  }

  function cerrarModalEditarTransportista() {
    if (modalEditarTransportistaOverlay) {
      modalEditarTransportistaOverlay.classList.remove("visible");
      modalEditarTransportistaOverlay.setAttribute("aria-hidden", "true");
    }
  }

  if (btnVerListado) btnVerListado.addEventListener("click", abrirModalListadoTransportistas);
  if (listadoCerrarBtn) listadoCerrarBtn.addEventListener("click", cerrarModalListadoTransportistas);
  if (listadoTransportistasOverlay) {
    listadoTransportistasOverlay.addEventListener("click", function (e) {
      if (e.target === listadoTransportistasOverlay) cerrarModalListadoTransportistas();
    });
  }
  if (filtroProvinciaSelect) {
    filtroProvinciaSelect.addEventListener("change", renderListadoTable);
  }
  if (tablaTransportistas) {
    tablaTransportistas.addEventListener("click", function (e) {
      var th = e.target.closest("th.sortable");
      if (!th) return;
      var col = th.getAttribute("data-col");
      if (!col) return;
      if (listadoSortCol === col) listadoSortDir = -listadoSortDir; else { listadoSortCol = col; listadoSortDir = 1; }
      renderListadoTable();
    });
  }
  var _cargaMasivaInput = document.getElementById("transporte-carga-masiva-archivo");
  var _cargaMasivaNombre = document.getElementById("transporte-carga-masiva-nombre");
  if (_cargaMasivaInput && _cargaMasivaNombre) {
    _cargaMasivaInput.addEventListener("change", function () {
      _cargaMasivaNombre.textContent = _cargaMasivaInput.files && _cargaMasivaInput.files[0] ? _cargaMasivaInput.files[0].name : "Ningún archivo";
    });
  }
  if (formCargaMasiva) {
    formCargaMasiva.addEventListener("submit", function (e) {
      e.preventDefault();
      var inputFile = document.getElementById("transporte-carga-masiva-archivo");
      if (!inputFile || !inputFile.files || !inputFile.files[0]) {
        if (cargaMasivaStatus) cargaMasivaStatus.textContent = "Selecciona un archivo Excel.";
        return;
      }
      if (cargaMasivaStatus) cargaMasivaStatus.textContent = "Subiendo…";
      var fd = new FormData();
      fd.append("archivo", inputFile.files[0]);
      fetch("/api/proyectos/transporte/proveedores/carga-masiva", { method: "POST", body: fd })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (res.ok) {
            cargaMasivaStatus.textContent = "Carga correcta: " + (res.data.insertados || 0) + " proveedor(es) insertado(s).";
            inputFile.value = "";
            fetch("/api/proyectos/transporte/proveedores").then(function (r) { return r.json(); }).then(function (data) {
              listadoTransportistasData = data.proveedores || [];
              renderListadoTable();
            });
          } else {
            cargaMasivaStatus.textContent = "Error: " + (res.data.error || "no se pudo subir");
          }
        })
        .catch(function () {
          if (cargaMasivaStatus) cargaMasivaStatus.textContent = "Error de conexión.";
        });
    });
  }
  if (formEditarTransportista) {
    formEditarTransportista.addEventListener("submit", function (e) {
      e.preventDefault();
      var id = parseInt(document.getElementById("editar-transportista-id").value, 10);
      if (isNaN(id)) return;
      var payload = {
        nombre: ((document.getElementById("editar-transportista-nombre") && document.getElementById("editar-transportista-nombre").value) || "").trim(),
        direccion: (document.getElementById("editar-transportista-direccion") && document.getElementById("editar-transportista-direccion").value || "").trim(),
        codigo_postal: (document.getElementById("editar-transportista-codigo-postal") && document.getElementById("editar-transportista-codigo-postal").value || "").trim(),
        localidad: (document.getElementById("editar-transportista-localidad") && document.getElementById("editar-transportista-localidad").value || "").trim(),
        provincia: (document.getElementById("editar-transportista-provincia") && document.getElementById("editar-transportista-provincia").value || "").trim(),
        telefono_fijo: (document.getElementById("editar-transportista-telefono-fijo") && document.getElementById("editar-transportista-telefono-fijo").value || "").trim(),
        telefono_movil: (document.getElementById("editar-transportista-telefono-movil") && document.getElementById("editar-transportista-telefono-movil").value || "").trim(),
        email: (document.getElementById("editar-transportista-email") && document.getElementById("editar-transportista-email").value || "").trim(),
        web: (document.getElementById("editar-transportista-web") && document.getElementById("editar-transportista-web").value || "").trim(),
      };
      if (!payload.nombre) {
        if (editarTransportistaStatusEl) editarTransportistaStatusEl.textContent = "El nombre es obligatorio.";
        return;
      }
      if (editarTransportistaStatusEl) editarTransportistaStatusEl.textContent = "Guardando…";
      fetch("/api/proyectos/transporte/proveedores/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (res.ok) {
            var idx = listadoTransportistasData.findIndex(function (p) { return p.id === id; });
            if (idx >= 0) {
              listadoTransportistasData[idx] = Object.assign({}, listadoTransportistasData[idx], payload);
            }
            cerrarModalEditarTransportista();
            renderListadoTable();
            mostrarToast("Transportista actualizado correctamente.", "success");
            if (ultimaBusquedaRuta) {
              fetch("/api/proyectos/transporte/buscar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ origen: ultimaBusquedaRuta.origen, destino: ultimaBusquedaRuta.destino, paradas: ultimaBusquedaRuta.paradas }),
              })
                .then(function (r) {
                  if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.statusText); });
                  return r.json();
                })
                .then(function (data) {
                  aplicarResultadoRuta(data, ultimaBusquedaRuta.origen, ultimaBusquedaRuta.destino, ultimaBusquedaRuta.paradas);
                })
                .catch(function () {});
            }
          } else {
            if (editarTransportistaStatusEl) editarTransportistaStatusEl.textContent = "Error: " + (res.data.error || "no se pudo guardar");
          }
        })
        .catch(function () {
          if (editarTransportistaStatusEl) editarTransportistaStatusEl.textContent = "Error de conexión.";
        });
    });
  }
  if (btnCerrarEditarTransportista) btnCerrarEditarTransportista.addEventListener("click", cerrarModalEditarTransportista);
  if (modalEditarTransportistaOverlay) {
    modalEditarTransportistaOverlay.addEventListener("click", function (e) {
      if (e.target === modalEditarTransportistaOverlay) cerrarModalEditarTransportista();
    });
  }

  function bindFiltro(btn) {
    if (!btn) return;
    btn.addEventListener("click", function () {
      btn.classList.toggle("activo");
      aplicarFiltrosProveedores();
    });
  }
  bindFiltro(filtroFijoBtn);
  bindFiltro(filtroMovilBtn);
  bindFiltro(filtroEmailBtn);
  bindFiltro(filtroWebBtn);

  if (btnDescargarExcel) {
    btnDescargarExcel.addEventListener("click", function () {
      if (!proveedoresDatos || proveedoresDatos.length === 0) {
        mostrarToast("No hay proveedores en la ruta para descargar. Busca una ruta primero.", "info");
        return;
      }
      var payload = {
        proveedores: proveedoresDatos,
        ruta: ultimoContextoWhatsapp ? {
          texto: ultimoContextoWhatsapp.rutaTexto,
          distancia_km: ultimoContextoWhatsapp.distancia_km,
          duracion_min: ultimoContextoWhatsapp.duracion_min,
        } : {},
      };
      fetch("/api/proyectos/transporte/proveedores/exportar-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.statusText); });
          return r.blob();
        })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = "proveedores_ruta.xlsx";
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        })
        .catch(function (err) {
          mostrarToast("Error al descargar: " + (err.message || "no se pudo generar el Excel"), "error");
        });
    });
  }

  if (btnEnviarWhatsapp) {
    btnEnviarWhatsapp.addEventListener("click", function () {
      if (!listaContainer) return;
      var checks = listaContainer.querySelectorAll(".transporte-list-select:checked");
      if (!checks.length) {
        mostrarToast("Selecciona al menos un proveedor para enviarles un WhatsApp.", "error");
        return;
      }
      var msg = encodeURIComponent(obtenerMensajeWhatsappParaEnvio());
      checks.forEach(function (chk) {
        var idx = parseInt(chk.getAttribute("data-idx") || "-1", 10);
        if (isNaN(idx) || !proveedoresDatos[idx]) return;
        var p = proveedoresDatos[idx];
        var movil = (p.telefono_movil || "").replace(/[^0-9]/g, "");
        if (!movil) return;
        if (movil.length === 9) movil = "34" + movil;
        var url = "https://wa.me/" + movil + "?text=" + msg;
        window.open(url, "_blank");
      });
    });
  }

  function limpiarListadoProveedores() {
    proveedorMarkers = [];
    proveedorItems = [];
    proveedoresDatos = [];
    if (listaContainer) {
      listaContainer.innerHTML = "";
    }
    if (listaResumenEl) {
      listaResumenEl.textContent = "";
    }
  }

  function obtenerMensajeWhatsappPorDefecto() {
    var base =
      "Hola, estamos planificando un transporte de maquinaria para la ruta ORIGEN_DESTINO para [xx] máquinas hincadoras. " +
      "Estas máquinas son de aproximadamente 4Tn, y medidas: 2,2m x 2,5m x 2,8m (ancho-profundo-alto). " +
      "¿Podríais indicarnos disponibilidad y precio aproximado? Gracias";
    if (ultimoContextoWhatsapp && ultimoContextoWhatsapp.rutaTexto) {
      return base.replace("ORIGEN_DESTINO", ultimoContextoWhatsapp.rutaTexto);
    }
    return base.replace("ORIGEN_DESTINO", "");
  }

  function obtenerMensajeWhatsappParaEnvio() {
    var txt = (mensajeWhatsappEl && mensajeWhatsappEl.value || "").trim();
    if (!txt) {
      txt = obtenerMensajeWhatsappPorDefecto();
    }
    return txt;
  }

  function marcarProveedorActivo(idx, panTo) {
    if (!listaContainer) return;
    proveedorItems.forEach(function (el, i) {
      if (!el) return;
      if (i === idx) {
        el.classList.add("activo");
      } else {
        el.classList.remove("activo");
      }
    });
    var m = proveedorMarkers[idx];
    if (m && mapInstance && panTo) {
      mapInstance.panTo(m.getLatLng());
      m.openPopup();
    }
    var item = proveedorItems[idx];
    if (item && listaContainer) {
      var parent = listaContainer;
      var parentRect = parent.getBoundingClientRect();
      var itemRect = item.getBoundingClientRect();
      // Solo desplazamos si el elemento queda fuera de la vista
      if (itemRect.top < parentRect.top) {
        parent.scrollTop += itemRect.top - parentRect.top - 8;
      } else if (itemRect.bottom > parentRect.bottom) {
        parent.scrollTop += itemRect.bottom - parentRect.bottom + 8;
      }
    }
  }

  function crearFilaProveedor(p, idx) {
    if (!listaContainer) return null;
    var div = document.createElement("div");
    div.className = "transporte-list-item";
    var nombre = (p.nombre || "").trim() || "—";
    var telefonoFijo = (p.telefono_fijo || "").trim() || "";
    var telefonoMovil = (p.telefono_movil || "").trim() || "";
    var email = (p.email || "").trim() || "";
    var web = (p.web || "").trim() || "";
    var dist = p.distancia_km != null ? p.distancia_km.toFixed(1) + " km" : "";
    var tieneFijo = !!telefonoFijo;
    var tieneMovil = !!telefonoMovil;
    var tieneEmail = !!email;
    var tieneWeb = !!web;
    var icons = "";
    if (tieneFijo) {
      icons += "<span class=\"transporte-list-icon icon-fijo\" title=\"Teléfono fijo\">☎</span>";
    }
    if (tieneMovil) {
      var movilDigits = telefonoMovil.replace(/[^0-9]/g, "");
      if (movilDigits.length === 9) {
        movilDigits = "34" + movilDigits;
      }
      if (movilDigits) {
        var msg = encodeURIComponent(obtenerMensajeWhatsappParaEnvio());
        icons +=
          "<a href=\"https://wa.me/" +
          movilDigits +
          "?text=" +
          msg +
          "\" class=\"transporte-list-icon icon-movil\" title=\"Enviar WhatsApp\" target=\"_blank\" rel=\"noopener noreferrer\">✆</a>";
      } else {
        icons += "<span class=\"transporte-list-icon icon-movil\" title=\"Teléfono móvil\">✆</span>";
      }
    }
    if (tieneEmail) {
      icons += "<span class=\"transporte-list-icon icon-email\" title=\"Email\">✉</span>";
    }
    if (tieneWeb) {
      icons += "<span class=\"transporte-list-icon icon-web\" title=\"Web\">🌐</span>";
    }

    div.innerHTML =
      "<div class=\"transporte-list-item-linea\">" +
      "<span class=\"transporte-list-select-wrap\"><input type=\"checkbox\" class=\"transporte-list-select\" data-idx=\"" + idx + "\"></span>" +
      "<span class=\"transporte-list-item-nombre\">" + escapeHtml(nombre) + "</span>" +
      "<span class=\"transporte-list-icon-row\">" + icons + "</span>" +
      "<span class=\"numero\">" + (dist ? dist : "") + "</span>" +
      "</div>";

    div.addEventListener("click", function () {
      marcarProveedorActivo(idx, true);
    });
    listaContainer.appendChild(div);
    return div;
  }

  function aplicarFiltrosProveedores() {
    if (!listaContainer) return;
    var requiereFijo = filtroFijoBtn && filtroFijoBtn.classList.contains("activo");
    var requiereMovil = filtroMovilBtn && filtroMovilBtn.classList.contains("activo");
    var requiereEmail = filtroEmailBtn && filtroEmailBtn.classList.contains("activo");
    var requiereWeb = filtroWebBtn && filtroWebBtn.classList.contains("activo");
    proveedorItems.forEach(function (el, idx) {
      if (!el) return;
      var p = proveedoresDatos[idx] || {};
      var tieneFijo = !!((p.telefono_fijo || "").trim());
      var tieneMovil = !!((p.telefono_movil || "").trim());
      var tieneEmail = !!((p.email || "").trim());
      var tieneWeb = !!((p.web || "").trim());
      var visible = true;
      if (requiereFijo || requiereMovil || requiereEmail || requiereWeb) {
        visible =
          (!requiereFijo || tieneFijo) &&
          (!requiereMovil || tieneMovil) &&
          (!requiereEmail || tieneEmail) &&
          (!requiereWeb || tieneWeb);
      }
      el.style.display = visible ? "" : "none";
      var m = proveedorMarkers[idx];
      if (m) {
        m.setOpacity(visible ? 1 : 0.25);
      }
    });
  }

  function mostrarEstado(texto, esError) {
    statusEl.style.display = "block";
    statusEl.textContent = texto;
    statusEl.style.color = esError ? "#b91c1c" : "";
  }

  function initMap() {
    if (mapInstance) return mapInstance;
    mapInstance = L.map("map-transporte").setView([40.4, -3.7], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(mapInstance);
    return mapInstance;
  }

  function clearMapLayers() {
    if (routeInfoControl && mapInstance) {
      mapInstance.removeControl(routeInfoControl);
      routeInfoControl = null;
    }
    if (waypointsLayer && mapInstance) {
      mapInstance.removeLayer(waypointsLayer);
      waypointsLayer = null;
    }
    if (originMarker && mapInstance) {
      mapInstance.removeLayer(originMarker);
      originMarker = null;
    }
    if (destMarker && mapInstance) {
      mapInstance.removeLayer(destMarker);
      destMarker = null;
    }
    if (routeLayer) {
      mapInstance.removeLayer(routeLayer);
      routeLayer = null;
    }
    if (markersLayer) {
      mapInstance.removeLayer(markersLayer);
      markersLayer = null;
    }
    limpiarListadoProveedores();
  }

  function escapeHtml(s) {
    if (s == null) return "";
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function aplicarResultadoRuta(data, origen, destino, paradas) {
    statusEl.style.display = "none";
    var ruta = data.ruta || {};
    var proveedores = data.proveedores || [];
    var coords = ruta.coordenadas_ruta || [];
    var distKm = ruta.distancia_km != null ? ruta.distancia_km : 0;
    var durMin = ruta.duracion_min != null ? ruta.duracion_min : 0;
    var rutaTexto = escapeHtml(origen);
    if (paradas.length > 0) {
      paradas.forEach(function (p) { rutaTexto += " → " + escapeHtml(p); });
    }
    rutaTexto += " → " + escapeHtml(destino);
    rutaResumenEl.innerHTML =
      "<p><strong>Ruta:</strong> " + rutaTexto + "</p>" +
      "<p><strong>Distancia:</strong> " + distKm.toFixed(1) + " km · <strong>Duración:</strong> " + Math.round(durMin) + " min</p>" +
      (proveedores.length === 0 ? "<p class=\"transporte-sin-proveedores\">No hay proveedores a menos de 50 km de la ruta.</p>" : "");
    rutaResumenEl.style.display = "block";
    ultimoContextoWhatsapp = { rutaTexto: rutaTexto, distancia_km: distKm, duracion_min: durMin };
    if (mensajeWhatsappEl) mensajeWhatsappEl.value = obtenerMensajeWhatsappPorDefecto();
    if (listaResumenEl) {
      listaResumenEl.textContent = proveedores.length
        ? proveedores.length + " proveedor(es) en la ruta (ordenados por cercanía)."
        : "No hay proveedores en la ruta para los criterios actuales.";
    }
    if (listaContainer && proveedores.length === 0) {
      var vacio = document.createElement("div");
      vacio.className = "transporte-list-empty";
      vacio.textContent = "Sin proveedores para esta ruta.";
      listaContainer.appendChild(vacio);
    }
    if (typeof L === "undefined") {
      mostrarEstado("Error: no se pudo cargar el mapa (Leaflet). Recarga la página.", true);
      if (placeholderEl) { placeholderEl.classList.remove("oculto"); placeholderEl.style.display = ""; }
      return;
    }
    if (placeholderEl) { placeholderEl.classList.add("oculto"); placeholderEl.style.display = "none"; }
    clearMapLayers();
    if (mapContainer) { mapContainer.style.minHeight = "450px"; mapContainer.style.height = "100%"; }
    setTimeout(function () {
      try { initMap(); } catch (err) {
        console.error("Leaflet initMap error:", err);
        mostrarEstado("Error al crear el mapa: " + (err.message || String(err)), true);
        if (placeholderEl) { placeholderEl.classList.remove("oculto"); placeholderEl.style.display = ""; }
        return;
      }
      if (!mapInstance) return;
      if (coords.length >= 2) {
        var latlngs = coords.map(function (c) { return [c[0], c[1]]; });
        routeLayer = L.polyline(latlngs, { color: "#1e40af", weight: 5, opacity: 0.8 }).addTo(mapInstance);
        var iconOrigen = L.divIcon({ className: "transporte-marker-origen", html: "<span class=\"transporte-marker-pin\" title=\"Origen\">O</span>", iconSize: [28, 28], iconAnchor: [14, 14] });
        var iconDestino = L.divIcon({ className: "transporte-marker-destino", html: "<span class=\"transporte-marker-pin\" title=\"Destino\">D</span>", iconSize: [28, 28], iconAnchor: [14, 14] });
        originMarker = L.marker(latlngs[0], { icon: iconOrigen }).addTo(mapInstance);
        originMarker.bindTooltip("Origen: " + escapeHtml(origen), { permanent: true, direction: "top", className: "transporte-tooltip-origen", offset: [0, -14] });
        destMarker = L.marker(latlngs[latlngs.length - 1], { icon: iconDestino }).addTo(mapInstance);
        destMarker.bindTooltip("Destino: " + escapeHtml(destino), { permanent: true, direction: "top", className: "transporte-tooltip-destino", offset: [0, -14] });
        var paradasCoords = (ruta.paradas_coords || []);
        if (paradasCoords.length > 0) {
          waypointsLayer = L.layerGroup().addTo(mapInstance);
          paradasCoords.forEach(function (pa) {
            var lat = pa.lat, lon = pa.lon;
            if (lat == null || lon == null) return;
            var num = pa.numero != null ? pa.numero : 0;
            var nombreParada = (pa.nombre || "").trim() || ("Parada " + num);
            var iconParada = L.divIcon({ className: "transporte-marker-parada", html: "<span class=\"transporte-marker-pin\" title=\"Parada " + num + "\">P" + num + "</span>", iconSize: [24, 24], iconAnchor: [12, 12] });
            var m = L.marker([lat, lon], { icon: iconParada }).addTo(waypointsLayer);
            m.bindTooltip("Parada " + num + ": " + escapeHtml(nombreParada), { permanent: true, direction: "top", className: "transporte-tooltip-parada", offset: [0, -12] });
          });
        }
        if (routeInfoControl && mapInstance) mapInstance.removeControl(routeInfoControl);
        routeInfoControl = L.control({ position: "topright" });
        routeInfoControl.onAdd = function () {
          var div = L.DomUtil.create("div", "transporte-map-info");
          div.innerHTML = "<strong>" + distKm.toFixed(1) + " km</strong> · <strong>" + Math.round(durMin) + " min</strong>";
          return div;
        };
        routeInfoControl.addTo(mapInstance);
        mapInstance.fitBounds(routeLayer.getBounds(), { padding: [40, 40], maxZoom: 10 });
      } else {
        mapInstance.setView([40.4, -3.7], 6);
      }
      setTimeout(function () { if (mapInstance && mapInstance.invalidateSize) mapInstance.invalidateSize(); }, 300);
      markersLayer = L.layerGroup().addTo(mapInstance);
      proveedoresDatos = proveedores.slice();
      var iconProveedor = L.divIcon({ className: "transporte-marker-proveedor", html: "<span class=\"transporte-marker-pin transporte-marker-pin-proveedor\" title=\"Proveedor\">🚚</span>", iconSize: [28, 28], iconAnchor: [14, 14] });
      proveedores.forEach(function (p, idx) {
        var lat = p.lat, lon = p.lon;
        if (lat == null || lon == null) return;
        var nombre = (p.nombre || "").trim() || "—";
        var localidad = (p.localidad || "").trim() || "—";
        var telefono = (p.telefono || "").trim() || "";
        var email = (p.email || "").trim() || "";
        var web = (p.web || "").trim() || "";
        var dist = p.distancia_km != null ? p.distancia_km.toFixed(1) + " km" : "";
        var popupContent = "<div class=\"transporte-popup\">" +
          "<strong>" + escapeHtml(nombre) + "</strong><br/>" +
          (localidad !== "—" ? escapeHtml(localidad) + "<br/>" : "") +
          (telefono ? "Tel: <a href=\"tel:" + telefono.replace(/\s/g, "") + "\">" + escapeHtml(telefono) + "</a><br/>" : "") +
          (email ? "Email: <a href=\"mailto:" + escapeHtml(email) + "\">" + escapeHtml(email) + "</a><br/>" : "") +
          (web ? "Web: <a href=\"" + escapeHtml(web) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(web.replace(/^https?:\/\//, "")) + "</a><br/>" : "") +
          (dist ? "A " + dist + " de la ruta" : "") + "</div>";
        var marker = L.marker([lat, lon], { icon: iconProveedor }).addTo(markersLayer);
        marker.bindPopup(popupContent, { maxWidth: 320 });
        var fila = crearFilaProveedor(p, idx);
        proveedorMarkers[idx] = marker;
        proveedorItems[idx] = fila;
        marker.on("click", function () { marcarProveedorActivo(idx, false); });
      });
    }, 50);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var origen = (document.getElementById("transporte-origen").value || "").trim();
    var destino = (document.getElementById("transporte-destino").value || "").trim();
    var paradas = [];
    if (paradasListEl) {
      paradasListEl.querySelectorAll(".transporte-parada-input").forEach(function (input) {
        var v = (input.value || "").trim();
        if (v) paradas.push(v);
      });
    }
    if (!origen || !destino) {
      mostrarEstado("Introduce origen y destino.", true);
      return;
    }
    if (placeholderEl) { placeholderEl.classList.add("oculto"); placeholderEl.style.display = "none"; }
    mostrarEstado("Buscando ruta y proveedores…", false);
    rutaResumenEl.style.display = "none";
    rutaResumenEl.innerHTML = "";
    limpiarListadoProveedores();
    fetch("/api/proyectos/transporte/buscar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origen: origen, destino: destino, paradas: paradas }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.statusText); });
        return r.json();
      })
      .then(function (data) {
        ultimaBusquedaRuta = { origen: origen, destino: destino, paradas: paradas.slice() };
        aplicarResultadoRuta(data, origen, destino, paradas);
      })
      .catch(function (err) {
        mostrarEstado(err.message || "Error al buscar ruta o proveedores.", true);
        if (placeholderEl) {
          placeholderEl.classList.remove("oculto");
          placeholderEl.style.display = "";
        }
      });
  });
})();
