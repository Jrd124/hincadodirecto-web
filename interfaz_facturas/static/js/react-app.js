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
    // Si ya hay un root React en este panel, reutilizarlo
    if (window._reactRoots[panelId]) {
      window._reactRoots[panelId].render(React.createElement(Component, props));
      return true;
    }

    // Guardar HTML vanilla como backup antes de limpiar
    container._vanillaBackup = container.innerHTML;

    // Crear contenedor React dentro del panel
    var reactRoot = document.createElement("div");
    reactRoot.id = panelId + "-react";
    container.innerHTML = "";
    container.appendChild(reactRoot);

    var root = createRoot(reactRoot);
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
