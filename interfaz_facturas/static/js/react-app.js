import React from "https://esm.sh/react@18?dev";
import { createRoot } from "https://esm.sh/react-dom@18/client?dev";

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
  if (!container) return;

  // Si ya hay un root React en este panel, reutilizarlo
  if (window._reactRoots[panelId]) {
    var Component = window._reactModules[componentName];
    if (Component) {
      window._reactRoots[panelId].render(React.createElement(Component, props));
    }
    return;
  }

  // Crear contenedor React dentro del panel
  var reactRoot = document.createElement("div");
  reactRoot.id = panelId + "-react";
  container.innerHTML = "";
  container.appendChild(reactRoot);

  var Component = window._reactModules[componentName];
  if (Component) {
    var root = createRoot(reactRoot);
    root.render(React.createElement(Component, props));
    window._reactRoots[panelId] = root;
  }
};

// Desmonta un componente React de un panel
window.unmountReactModule = function (panelId) {
  if (window._reactRoots[panelId]) {
    window._reactRoots[panelId].unmount();
    delete window._reactRoots[panelId];
  }
};

console.log("[React] Bootstrap cargado.");
