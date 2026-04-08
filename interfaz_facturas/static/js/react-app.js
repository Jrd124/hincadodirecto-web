import React from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";

// Registry de módulos React migrados
window._reactModules = {};
window._reactRoots = {};

// React + createRoot disponibles globalmente para los módulos
window.React = React;
window.ReactDOM = { createRoot: createRoot };

// Monta un componente React en un panel existente
window.mountReactModule = function (panelId, componentName, props) {
  props = props || {};
  var container = document.getElementById(panelId);
  if (!container) {
    console.warn("[React] Panel no encontrado:", panelId);
    return false;
  }

  var Component = window._reactModules[componentName];
  if (!Component) {
    console.warn("[React] Componente no registrado:", componentName);
    return false;
  }

  try {
    // Pass a _mountKey to force re-fetch on re-navigation
    props._mountKey = Date.now();

    // Check if the React container div already exists in the DOM
    var reactRootEl = document.getElementById(panelId + "-react");

    // Si ya hay un root React Y su contenedor sigue en el DOM, reutilizar
    if (window._reactRoots[panelId] && reactRootEl) {
      window._reactRoots[panelId].render(React.createElement(Component, props));
      return true;
    }

    // Limpiar root huérfano si existía pero el DOM fue destruido
    if (window._reactRoots[panelId]) {
      try { window._reactRoots[panelId].unmount(); } catch (e) { /* ignore */ }
      delete window._reactRoots[panelId];
    }

    // Guardar HTML vanilla como backup antes de limpiar
    if (!container._vanillaBackup) {
      container._vanillaBackup = container.innerHTML;
    }

    // Crear contenedor React dentro del panel
    var newRoot = document.createElement("div");
    newRoot.id = panelId + "-react";
    container.innerHTML = "";
    container.appendChild(newRoot);

    var root = createRoot(newRoot);
    root.render(React.createElement(Component, props));
    window._reactRoots[panelId] = root;
    console.log("[React] Montado:", componentName, "en", panelId);
    return true;
  } catch (e) {
    console.error("[React] Error montando " + componentName + ":", e);
    // Restaurar vanilla si falla
    if (container._vanillaBackup) {
      container.innerHTML = container._vanillaBackup;
      delete container._vanillaBackup;
    }
    return false;
  }
};

// Desmonta un componente React de un panel
window.unmountReactModule = function (panelId) {
  if (window._reactRoots[panelId]) {
    window._reactRoots[panelId].unmount();
    delete window._reactRoots[panelId];
  }
};

window._reactReady = true;
console.log("[React] Bootstrap cargado.");
