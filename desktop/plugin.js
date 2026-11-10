var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
}, __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default")), __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
  mod
)), __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// <define:import.meta.env>
var define_import_meta_env_default, init_define_import_meta_env = __esm({
  "<define:import.meta.env>"() {
    define_import_meta_env_default = { MODE: "production" };
  }
});

// react-cjs:react
var react_exports = {};
__export(react_exports, {
  default: () => react_default
});
import * as React from "react";
import * as react_star from "react";
var react_default, init_react = __esm({
  "react-cjs:react"() {
    init_define_import_meta_env();
    __reExport(react_exports, react_star);
    react_default = React;
  }
});

// node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.production.js
var require_use_sync_external_store_shim_production = __commonJS({
  "node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.production.js"(exports) {
    "use strict";
    init_define_import_meta_env();
    var React2 = (init_react(), __toCommonJS(react_exports));
    function is(x, y) {
      return x === y && (x !== 0 || 1 / x === 1 / y) || x !== x && y !== y;
    }
    var objectIs = typeof Object.is == "function" ? Object.is : is, useState7 = React2.useState, useEffect7 = React2.useEffect, useLayoutEffect2 = React2.useLayoutEffect, useDebugValue2 = React2.useDebugValue;
    function useSyncExternalStore$2(subscribe, getSnapshot) {
      var value2 = getSnapshot(), _useState = useState7({ inst: { value: value2, getSnapshot } }), inst = _useState[0].inst, forceUpdate = _useState[1];
      return useLayoutEffect2(
        function() {
          inst.value = value2, inst.getSnapshot = getSnapshot, checkIfSnapshotChanged(inst) && forceUpdate({ inst });
        },
        [subscribe, value2, getSnapshot]
      ), useEffect7(
        function() {
          return checkIfSnapshotChanged(inst) && forceUpdate({ inst }), subscribe(function() {
            checkIfSnapshotChanged(inst) && forceUpdate({ inst });
          });
        },
        [subscribe]
      ), useDebugValue2(value2), value2;
    }
    function checkIfSnapshotChanged(inst) {
      var latestGetSnapshot = inst.getSnapshot;
      inst = inst.value;
      try {
        var nextValue = latestGetSnapshot();
        return !objectIs(inst, nextValue);
      } catch {
        return !0;
      }
    }
    function useSyncExternalStore$1(subscribe, getSnapshot) {
      return getSnapshot();
    }
    var shim = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? useSyncExternalStore$1 : useSyncExternalStore$2;
    exports.useSyncExternalStore = React2.useSyncExternalStore !== void 0 ? React2.useSyncExternalStore : shim;
  }
});

// node_modules/use-sync-external-store/shim/index.js
var require_shim = __commonJS({
  "node_modules/use-sync-external-store/shim/index.js"(exports, module) {
    "use strict";
    init_define_import_meta_env();
    module.exports = require_use_sync_external_store_shim_production();
  }
});

// node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js
var require_with_selector_production = __commonJS({
  "node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js"(exports) {
    "use strict";
    init_define_import_meta_env();
    var React2 = (init_react(), __toCommonJS(react_exports)), shim = require_shim();
    function is(x, y) {
      return x === y && (x !== 0 || 1 / x === 1 / y) || x !== x && y !== y;
    }
    var objectIs = typeof Object.is == "function" ? Object.is : is, useSyncExternalStore2 = shim.useSyncExternalStore, useRef6 = React2.useRef, useEffect7 = React2.useEffect, useMemo6 = React2.useMemo, useDebugValue2 = React2.useDebugValue;
    exports.useSyncExternalStoreWithSelector = function(subscribe, getSnapshot, getServerSnapshot, selector2, isEqual) {
      var instRef = useRef6(null);
      if (instRef.current === null) {
        var inst = { hasValue: !1, value: null };
        instRef.current = inst;
      } else inst = instRef.current;
      instRef = useMemo6(
        function() {
          function memoizedSelector(nextSnapshot) {
            if (!hasMemo) {
              if (hasMemo = !0, memoizedSnapshot = nextSnapshot, nextSnapshot = selector2(nextSnapshot), isEqual !== void 0 && inst.hasValue) {
                var currentSelection = inst.value;
                if (isEqual(currentSelection, nextSnapshot))
                  return memoizedSelection = currentSelection;
              }
              return memoizedSelection = nextSnapshot;
            }
            if (currentSelection = memoizedSelection, objectIs(memoizedSnapshot, nextSnapshot)) return currentSelection;
            var nextSelection = selector2(nextSnapshot);
            return isEqual !== void 0 && isEqual(currentSelection, nextSelection) ? (memoizedSnapshot = nextSnapshot, currentSelection) : (memoizedSnapshot = nextSnapshot, memoizedSelection = nextSelection);
          }
          var hasMemo = !1, memoizedSnapshot, memoizedSelection, maybeGetServerSnapshot = getServerSnapshot === void 0 ? null : getServerSnapshot;
          return [
            function() {
              return memoizedSelector(getSnapshot());
            },
            maybeGetServerSnapshot === null ? void 0 : function() {
              return memoizedSelector(maybeGetServerSnapshot());
            }
          ];
        },
        [getSnapshot, getServerSnapshot, selector2, isEqual]
      );
      var value2 = useSyncExternalStore2(subscribe, instRef[0], instRef[1]);
      return useEffect7(
        function() {
          inst.hasValue = !0, inst.value = value2;
        },
        [value2]
      ), useDebugValue2(value2), value2;
    };
  }
});

// node_modules/use-sync-external-store/shim/with-selector.js
var require_with_selector = __commonJS({
  "node_modules/use-sync-external-store/shim/with-selector.js"(exports, module) {
    "use strict";
    init_define_import_meta_env();
    module.exports = require_with_selector_production();
  }
});

// src/plugin.tsx
init_define_import_meta_env();
import { host as host6, PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA } from "@hermes/plugin-sdk";

// node_modules/@xyflow/react/dist/base.css
var base_default = `/* this will be exported as base.css and can be used for a basic styling */
/* these are the necessary styles for React/Svelte Flow, they get used by base.css and style.css */
.react-flow {
  direction: ltr;

  --xy-edge-stroke-default: #b1b1b7;
  --xy-edge-stroke-width-default: 1;
  --xy-edge-stroke-selected-default: #555;

  --xy-connectionline-stroke-default: #b1b1b7;
  --xy-connectionline-stroke-width-default: 1;

  --xy-attribution-background-color-default: rgba(255, 255, 255, 0.5);

  --xy-minimap-background-color-default: #fff;
  --xy-minimap-mask-background-color-default: rgba(240, 240, 240, 0.6);
  --xy-minimap-mask-stroke-color-default: transparent;
  --xy-minimap-mask-stroke-width-default: 1;
  --xy-minimap-node-background-color-default: #e2e2e2;
  --xy-minimap-node-stroke-color-default: transparent;
  --xy-minimap-node-stroke-width-default: 2;

  --xy-background-color-default: transparent;
  --xy-background-pattern-dots-color-default: #91919a;
  --xy-background-pattern-lines-color-default: #eee;
  --xy-background-pattern-cross-color-default: #e2e2e2;
  background-color: var(--xy-background-color, var(--xy-background-color-default));
  --xy-node-border-default: 1px solid #bbb;
  --xy-node-border-selected-default: 1px solid #555;

  --xy-handle-background-color-default: #333;

  --xy-selection-background-color-default: rgba(150, 150, 180, 0.1);
  --xy-selection-border-default: 1px dotted rgba(155, 155, 155, 0.8);
  --xy-resize-background-color-default: #3367d9;
}
.react-flow.dark {
  --xy-edge-stroke-default: #3e3e3e;
  --xy-edge-stroke-width-default: 1;
  --xy-edge-stroke-selected-default: #727272;

  --xy-connectionline-stroke-default: #b1b1b7;
  --xy-connectionline-stroke-width-default: 1;

  --xy-attribution-background-color-default: rgba(150, 150, 150, 0.25);

  --xy-minimap-background-color-default: #141414;
  --xy-minimap-mask-background-color-default: rgba(60, 60, 60, 0.6);
  --xy-minimap-mask-stroke-color-default: transparent;
  --xy-minimap-mask-stroke-width-default: 1;
  --xy-minimap-node-background-color-default: #2b2b2b;
  --xy-minimap-node-stroke-color-default: transparent;
  --xy-minimap-node-stroke-width-default: 2;

  --xy-background-color-default: #141414;
  --xy-background-pattern-dots-color-default: #555;
  --xy-background-pattern-lines-color-default: #333;
  --xy-background-pattern-cross-color-default: #333;
  --xy-node-color-default: #f8f8f8;
}
.react-flow__background {
  background-color: var(--xy-background-color-props, var(--xy-background-color, var(--xy-background-color-default)));
  pointer-events: none;
  z-index: -1;
}
.react-flow__container {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}
.react-flow__pane {
  z-index: 1;
  touch-action: none;
}
.react-flow__pane.draggable {
    cursor: grab;
  }
.react-flow__pane.dragging {
    cursor: grabbing;
  }
.react-flow__pane.selection {
    cursor: pointer;
  }
.react-flow__viewport {
  transform-origin: 0 0;
  z-index: 2;
  pointer-events: none;
}
.react-flow__renderer {
  z-index: 4;
}
.react-flow__selection {
  z-index: 6;
}
.react-flow__nodesselection-rect:focus,
.react-flow__nodesselection-rect:focus-visible {
  outline: none;
}
.react-flow__edge-path {
  stroke: var(--xy-edge-stroke, var(--xy-edge-stroke-default));
  stroke-width: var(--xy-edge-stroke-width, var(--xy-edge-stroke-width-default));
  fill: none;
}
.react-flow__connection-path {
  stroke: var(--xy-connectionline-stroke, var(--xy-connectionline-stroke-default));
  stroke-width: var(--xy-connectionline-stroke-width, var(--xy-connectionline-stroke-width-default));
  fill: none;
}
.react-flow .react-flow__edges {
  position: absolute;
}
.react-flow .react-flow__edges svg {
    overflow: visible;
    position: absolute;
    pointer-events: none;
  }
.react-flow__edge {
  pointer-events: visibleStroke;
}
.react-flow__edge.selectable {
    cursor: pointer;
  }
.react-flow__edge.animated path {
    stroke-dasharray: 5;
    animation: dashdraw 0.5s linear infinite;
  }
.react-flow__edge.animated path.react-flow__edge-interaction {
    stroke-dasharray: none;
    animation: none;
  }
.react-flow__edge.inactive {
    pointer-events: none;
  }
.react-flow__edge.selected,
  .react-flow__edge:focus,
  .react-flow__edge:focus-visible {
    outline: none;
  }
.react-flow__edge.selected .react-flow__edge-path,
  .react-flow__edge.selectable:focus .react-flow__edge-path,
  .react-flow__edge.selectable:focus-visible .react-flow__edge-path {
    stroke: var(--xy-edge-stroke-selected, var(--xy-edge-stroke-selected-default));
  }
.react-flow__edge-textwrapper {
    pointer-events: all;
  }
.react-flow__edge .react-flow__edge-text {
    pointer-events: none;
    -webkit-user-select: none;
       -moz-user-select: none;
            user-select: none;
  }
/* Arrowhead marker styles - use CSS custom properties as default */
.react-flow__arrowhead polyline {
  stroke: var(--xy-edge-stroke, var(--xy-edge-stroke-default));
}
.react-flow__arrowhead polyline.arrowclosed {
  fill: var(--xy-edge-stroke, var(--xy-edge-stroke-default));
}
.react-flow__connection {
  pointer-events: none;
}
.react-flow__connection .animated {
    stroke-dasharray: 5;
    animation: dashdraw 0.5s linear infinite;
  }
svg.react-flow__connectionline {
  z-index: 1001;
  overflow: visible;
  position: absolute;
}
.react-flow__nodes {
  pointer-events: none;
  transform-origin: 0 0;
}
.react-flow__node {
  position: absolute;
  -webkit-user-select: none;
     -moz-user-select: none;
          user-select: none;
  pointer-events: all;
  transform-origin: 0 0;
  box-sizing: border-box;
  cursor: default;
}
.react-flow__node.selectable {
    cursor: pointer;
  }
.react-flow__node.draggable {
    cursor: grab;
    pointer-events: all;
  }
.react-flow__node.draggable.dragging {
      cursor: grabbing;
    }
.react-flow__nodesselection {
  z-index: 3;
  transform-origin: left top;
  pointer-events: none;
}
.react-flow__nodesselection-rect {
    position: absolute;
    pointer-events: all;
    cursor: grab;
  }
.react-flow__handle {
  position: absolute;
  pointer-events: none;
  min-width: 5px;
  min-height: 5px;
  background-color: var(--xy-handle-background-color, var(--xy-handle-background-color-default));
}
.react-flow__handle.connectingfrom {
    pointer-events: all;
  }
.react-flow__handle.connectionindicator {
    pointer-events: all;
    cursor: crosshair;
  }
.react-flow__handle-bottom {
    top: auto;
    left: 50%;
    bottom: 0;
    transform: translate(-50%, 50%);
  }
.react-flow__handle-top {
    top: 0;
    left: 50%;
    transform: translate(-50%, -50%);
  }
.react-flow__handle-left {
    top: 50%;
    left: 0;
    transform: translate(-50%, -50%);
  }
.react-flow__handle-right {
    top: 50%;
    right: 0;
    transform: translate(50%, -50%);
  }
.react-flow__edgeupdater {
  cursor: move;
  pointer-events: all;
}
.react-flow__pane.selection .react-flow__panel {
  pointer-events: none;
}
.react-flow__panel {
  position: absolute;
  z-index: 5;
  margin: 15px;
}
.react-flow__panel.top {
    top: 0;
  }
.react-flow__panel.bottom {
    bottom: 0;
  }
.react-flow__panel.top.center, .react-flow__panel.bottom.center {
      left: 50%;
      transform: translateX(-15px) translateX(-50%);
    }
.react-flow__panel.left {
    left: 0;
  }
.react-flow__panel.right {
    right: 0;
  }
.react-flow__panel.left.center, .react-flow__panel.right.center {
      top: 50%;
      transform: translateY(-15px) translateY(-50%);
    }
.react-flow__attribution {
  font-size: 10px;
  background: var(--xy-attribution-background-color, var(--xy-attribution-background-color-default));
  padding: 2px 3px;
  margin: 0;
}
.react-flow__attribution a {
    text-decoration: none;
    color: #999;
  }
@keyframes dashdraw {
  from {
    stroke-dashoffset: 10;
  }
}
.react-flow__edgelabel-renderer {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
  -webkit-user-select: none;
     -moz-user-select: none;
          user-select: none;
  left: 0;
  top: 0;
}
.react-flow__viewport-portal {
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  -webkit-user-select: none;
     -moz-user-select: none;
          user-select: none;
}
.react-flow__minimap {
  background: var(
    --xy-minimap-background-color-props,
    var(--xy-minimap-background-color, var(--xy-minimap-background-color-default))
  );
}
.react-flow__minimap-svg {
    display: block;
  }
.react-flow__minimap-mask {
    fill: var(
      --xy-minimap-mask-background-color-props,
      var(--xy-minimap-mask-background-color, var(--xy-minimap-mask-background-color-default))
    );
    stroke: var(
      --xy-minimap-mask-stroke-color-props,
      var(--xy-minimap-mask-stroke-color, var(--xy-minimap-mask-stroke-color-default))
    );
    stroke-width: var(
      --xy-minimap-mask-stroke-width-props,
      var(--xy-minimap-mask-stroke-width, var(--xy-minimap-mask-stroke-width-default))
    );
  }
.react-flow__minimap-node {
    fill: var(
      --xy-minimap-node-background-color-props,
      var(--xy-minimap-node-background-color, var(--xy-minimap-node-background-color-default))
    );
    stroke: var(
      --xy-minimap-node-stroke-color-props,
      var(--xy-minimap-node-stroke-color, var(--xy-minimap-node-stroke-color-default))
    );
    stroke-width: var(
      --xy-minimap-node-stroke-width-props,
      var(--xy-minimap-node-stroke-width, var(--xy-minimap-node-stroke-width-default))
    );
  }
.react-flow__background-pattern.dots {
    fill: var(
      --xy-background-pattern-color-props,
      var(--xy-background-pattern-color, var(--xy-background-pattern-dots-color-default))
    );
  }
.react-flow__background-pattern.lines {
    stroke: var(
      --xy-background-pattern-color-props,
      var(--xy-background-pattern-color, var(--xy-background-pattern-lines-color-default))
    );
  }
.react-flow__background-pattern.cross {
    stroke: var(
      --xy-background-pattern-color-props,
      var(--xy-background-pattern-color, var(--xy-background-pattern-cross-color-default))
    );
  }
.react-flow__controls {
  display: flex;
  flex-direction: column;
}
.react-flow__controls.horizontal {
    flex-direction: row;
  }
.react-flow__controls-button {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 26px;
    width: 26px;
    padding: 4px;
  }
.react-flow__controls-button svg {
      width: 100%;
      max-width: 12px;
      max-height: 12px;
      fill: currentColor;
    }
.react-flow__node-input,
.react-flow__node-default,
.react-flow__node-output,
.react-flow__node-group {
  border: var(--xy-node-border, var(--xy-node-border-default));
  color: var(--xy-node-color, var(--xy-node-color-default));
}
.react-flow__node-input.selected,
  .react-flow__node-input:focus,
  .react-flow__node-input:focus-visible,
  .react-flow__node-default.selected,
  .react-flow__node-default:focus,
  .react-flow__node-default:focus-visible,
  .react-flow__node-output.selected,
  .react-flow__node-output:focus,
  .react-flow__node-output:focus-visible,
  .react-flow__node-group.selected,
  .react-flow__node-group:focus,
  .react-flow__node-group:focus-visible {
    outline: none;
    border: var(--xy-node-border-selected, var(--xy-node-border-selected-default));
  }
.react-flow__nodesselection-rect,
.react-flow__selection {
  background: var(--xy-selection-background-color, var(--xy-selection-background-color-default));
  border: var(--xy-selection-border, var(--xy-selection-border-default));
}
.react-flow__resize-control {
  position: absolute;
}
.react-flow__resize-control.left,
.react-flow__resize-control.right {
  cursor: ew-resize;
}
.react-flow__resize-control.top,
.react-flow__resize-control.bottom {
  cursor: ns-resize;
}
.react-flow__resize-control.top.left,
.react-flow__resize-control.bottom.right {
  cursor: nwse-resize;
}
.react-flow__resize-control.bottom.left,
.react-flow__resize-control.top.right {
  cursor: nesw-resize;
}
/* handle styles */
.react-flow__resize-control.handle {
  width: 5px;
  height: 5px;
  border: 1px solid #fff;
  border-radius: 1px;
  background-color: var(--xy-resize-background-color, var(--xy-resize-background-color-default));
  translate: -50% -50%;
}
.react-flow__resize-control.handle.left {
  left: 0;
  top: 50%;
}
.react-flow__resize-control.handle.right {
  left: 100%;
  top: 50%;
}
.react-flow__resize-control.handle.top {
  left: 50%;
  top: 0;
}
.react-flow__resize-control.handle.bottom {
  left: 50%;
  top: 100%;
}
.react-flow__resize-control.handle.top.left {
  left: 0;
}
.react-flow__resize-control.handle.bottom.left {
  left: 0;
}
.react-flow__resize-control.handle.top.right {
  left: 100%;
}
.react-flow__resize-control.handle.bottom.right {
  left: 100%;
}
/* line styles */
.react-flow__resize-control.line {
  border-color: var(--xy-resize-background-color, var(--xy-resize-background-color-default));
  border-width: 0;
  border-style: solid;
}
.react-flow__resize-control.line.left,
.react-flow__resize-control.line.right {
  width: 1px;
  transform: translate(-50%, 0);
  top: 0;
  height: 100%;
}
.react-flow__resize-control.line.left {
  left: 0;
  border-left-width: 1px;
}
.react-flow__resize-control.line.right {
  left: 100%;
  border-right-width: 1px;
}
.react-flow__resize-control.line.top,
.react-flow__resize-control.line.bottom {
  height: 1px;
  transform: translate(0, -50%);
  left: 0;
  width: 100%;
}
.react-flow__resize-control.line.top {
  top: 0;
  border-top-width: 1px;
}
.react-flow__resize-control.line.bottom {
  border-bottom-width: 1px;
  top: 100%;
}
`;

// src/page/session-tree-page.tsx
init_define_import_meta_env();
import { Button as Button2, EmptyState, ErrorState, host as host4, useQuery, useValue } from "@hermes/plugin-sdk";

// node_modules/@xyflow/react/dist/esm/index.js
init_define_import_meta_env();
import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo, forwardRef, useEffect, useRef, useState, useLayoutEffect, useCallback, memo } from "react";

// node_modules/classcat/index.js
init_define_import_meta_env();
function cc(names) {
  if (typeof names == "string" || typeof names == "number") return "" + names;
  let out = "";
  if (Array.isArray(names))
    for (let i = 0, tmp; i < names.length; i++)
      (tmp = cc(names[i])) !== "" && (out += (out && " ") + tmp);
  else
    for (let k in names)
      names[k] && (out += (out && " ") + k);
  return out;
}

// node_modules/@xyflow/system/dist/esm/index.js
init_define_import_meta_env();

// node_modules/d3-drag/dist/d3-drag.mjs
init_define_import_meta_env();

// node_modules/d3-dispatch/dist/d3-dispatch.mjs
init_define_import_meta_env();
var noop = { value: () => {
} };
function dispatch() {
  for (var i = 0, n = arguments.length, _ = {}, t; i < n; ++i) {
    if (!(t = arguments[i] + "") || t in _ || /[\s.]/.test(t)) throw new Error("illegal type: " + t);
    _[t] = [];
  }
  return new Dispatch(_);
}
function Dispatch(_) {
  this._ = _;
}
function parseTypenames(typenames, types) {
  return typenames.trim().split(/^|\s+/).map(function(t) {
    var name = "", i = t.indexOf(".");
    if (i >= 0 && (name = t.slice(i + 1), t = t.slice(0, i)), t && !types.hasOwnProperty(t)) throw new Error("unknown type: " + t);
    return { type: t, name };
  });
}
Dispatch.prototype = dispatch.prototype = {
  constructor: Dispatch,
  on: function(typename, callback) {
    var _ = this._, T = parseTypenames(typename + "", _), t, i = -1, n = T.length;
    if (arguments.length < 2) {
      for (; ++i < n; ) if ((t = (typename = T[i]).type) && (t = get(_[t], typename.name))) return t;
      return;
    }
    if (callback != null && typeof callback != "function") throw new Error("invalid callback: " + callback);
    for (; ++i < n; )
      if (t = (typename = T[i]).type) _[t] = set(_[t], typename.name, callback);
      else if (callback == null) for (t in _) _[t] = set(_[t], typename.name, null);
    return this;
  },
  copy: function() {
    var copy = {}, _ = this._;
    for (var t in _) copy[t] = _[t].slice();
    return new Dispatch(copy);
  },
  call: function(type, that) {
    if ((n = arguments.length - 2) > 0) for (var args = new Array(n), i = 0, n, t; i < n; ++i) args[i] = arguments[i + 2];
    if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);
    for (t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
  },
  apply: function(type, that, args) {
    if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);
    for (var t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
  }
};
function get(type, name) {
  for (var i = 0, n = type.length, c; i < n; ++i)
    if ((c = type[i]).name === name)
      return c.value;
}
function set(type, name, callback) {
  for (var i = 0, n = type.length; i < n; ++i)
    if (type[i].name === name) {
      type[i] = noop, type = type.slice(0, i).concat(type.slice(i + 1));
      break;
    }
  return callback != null && type.push({ name, value: callback }), type;
}

// node_modules/d3-selection/dist/d3-selection.mjs
init_define_import_meta_env();
var xhtml = "http://www.w3.org/1999/xhtml", namespaces = {
  svg: "http://www.w3.org/2000/svg",
  xhtml,
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
  xmlns: "http://www.w3.org/2000/xmlns/"
};
function namespace(name) {
  var prefix = name += "", i = prefix.indexOf(":");
  return i >= 0 && (prefix = name.slice(0, i)) !== "xmlns" && (name = name.slice(i + 1)), namespaces.hasOwnProperty(prefix) ? { space: namespaces[prefix], local: name } : name;
}
function creatorInherit(name) {
  return function() {
    var document2 = this.ownerDocument, uri = this.namespaceURI;
    return uri === xhtml && document2.documentElement.namespaceURI === xhtml ? document2.createElement(name) : document2.createElementNS(uri, name);
  };
}
function creatorFixed(fullname) {
  return function() {
    return this.ownerDocument.createElementNS(fullname.space, fullname.local);
  };
}
function creator(name) {
  var fullname = namespace(name);
  return (fullname.local ? creatorFixed : creatorInherit)(fullname);
}
function none() {
}
function selector(selector2) {
  return selector2 == null ? none : function() {
    return this.querySelector(selector2);
  };
}
function selection_select(select2) {
  typeof select2 != "function" && (select2 = selector(select2));
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j)
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i)
      (node = group[i]) && (subnode = select2.call(node, node.__data__, i, group)) && ("__data__" in node && (subnode.__data__ = node.__data__), subgroup[i] = subnode);
  return new Selection(subgroups, this._parents);
}
function array(x) {
  return x == null ? [] : Array.isArray(x) ? x : Array.from(x);
}
function empty() {
  return [];
}
function selectorAll(selector2) {
  return selector2 == null ? empty : function() {
    return this.querySelectorAll(selector2);
  };
}
function arrayAll(select2) {
  return function() {
    return array(select2.apply(this, arguments));
  };
}
function selection_selectAll(select2) {
  typeof select2 == "function" ? select2 = arrayAll(select2) : select2 = selectorAll(select2);
  for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j)
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i)
      (node = group[i]) && (subgroups.push(select2.call(node, node.__data__, i, group)), parents.push(node));
  return new Selection(subgroups, parents);
}
function matcher(selector2) {
  return function() {
    return this.matches(selector2);
  };
}
function childMatcher(selector2) {
  return function(node) {
    return node.matches(selector2);
  };
}
var find = Array.prototype.find;
function childFind(match) {
  return function() {
    return find.call(this.children, match);
  };
}
function childFirst() {
  return this.firstElementChild;
}
function selection_selectChild(match) {
  return this.select(match == null ? childFirst : childFind(typeof match == "function" ? match : childMatcher(match)));
}
var filter = Array.prototype.filter;
function children() {
  return Array.from(this.children);
}
function childrenFilter(match) {
  return function() {
    return filter.call(this.children, match);
  };
}
function selection_selectChildren(match) {
  return this.selectAll(match == null ? children : childrenFilter(typeof match == "function" ? match : childMatcher(match)));
}
function selection_filter(match) {
  typeof match != "function" && (match = matcher(match));
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j)
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i)
      (node = group[i]) && match.call(node, node.__data__, i, group) && subgroup.push(node);
  return new Selection(subgroups, this._parents);
}
function sparse(update) {
  return new Array(update.length);
}
function selection_enter() {
  return new Selection(this._enter || this._groups.map(sparse), this._parents);
}
function EnterNode(parent, datum2) {
  this.ownerDocument = parent.ownerDocument, this.namespaceURI = parent.namespaceURI, this._next = null, this._parent = parent, this.__data__ = datum2;
}
EnterNode.prototype = {
  constructor: EnterNode,
  appendChild: function(child) {
    return this._parent.insertBefore(child, this._next);
  },
  insertBefore: function(child, next) {
    return this._parent.insertBefore(child, next);
  },
  querySelector: function(selector2) {
    return this._parent.querySelector(selector2);
  },
  querySelectorAll: function(selector2) {
    return this._parent.querySelectorAll(selector2);
  }
};
function constant(x) {
  return function() {
    return x;
  };
}
function bindIndex(parent, group, enter, update, exit, data) {
  for (var i = 0, node, groupLength = group.length, dataLength = data.length; i < dataLength; ++i)
    (node = group[i]) ? (node.__data__ = data[i], update[i] = node) : enter[i] = new EnterNode(parent, data[i]);
  for (; i < groupLength; ++i)
    (node = group[i]) && (exit[i] = node);
}
function bindKey(parent, group, enter, update, exit, data, key) {
  var i, node, nodeByKeyValue = /* @__PURE__ */ new Map(), groupLength = group.length, dataLength = data.length, keyValues = new Array(groupLength), keyValue;
  for (i = 0; i < groupLength; ++i)
    (node = group[i]) && (keyValues[i] = keyValue = key.call(node, node.__data__, i, group) + "", nodeByKeyValue.has(keyValue) ? exit[i] = node : nodeByKeyValue.set(keyValue, node));
  for (i = 0; i < dataLength; ++i)
    keyValue = key.call(parent, data[i], i, data) + "", (node = nodeByKeyValue.get(keyValue)) ? (update[i] = node, node.__data__ = data[i], nodeByKeyValue.delete(keyValue)) : enter[i] = new EnterNode(parent, data[i]);
  for (i = 0; i < groupLength; ++i)
    (node = group[i]) && nodeByKeyValue.get(keyValues[i]) === node && (exit[i] = node);
}
function datum(node) {
  return node.__data__;
}
function selection_data(value2, key) {
  if (!arguments.length) return Array.from(this, datum);
  var bind = key ? bindKey : bindIndex, parents = this._parents, groups = this._groups;
  typeof value2 != "function" && (value2 = constant(value2));
  for (var m = groups.length, update = new Array(m), enter = new Array(m), exit = new Array(m), j = 0; j < m; ++j) {
    var parent = parents[j], group = groups[j], groupLength = group.length, data = arraylike(value2.call(parent, parent && parent.__data__, j, parents)), dataLength = data.length, enterGroup = enter[j] = new Array(dataLength), updateGroup = update[j] = new Array(dataLength), exitGroup = exit[j] = new Array(groupLength);
    bind(parent, group, enterGroup, updateGroup, exitGroup, data, key);
    for (var i0 = 0, i1 = 0, previous, next; i0 < dataLength; ++i0)
      if (previous = enterGroup[i0]) {
        for (i0 >= i1 && (i1 = i0 + 1); !(next = updateGroup[i1]) && ++i1 < dataLength; ) ;
        previous._next = next || null;
      }
  }
  return update = new Selection(update, parents), update._enter = enter, update._exit = exit, update;
}
function arraylike(data) {
  return typeof data == "object" && "length" in data ? data : Array.from(data);
}
function selection_exit() {
  return new Selection(this._exit || this._groups.map(sparse), this._parents);
}
function selection_join(onenter, onupdate, onexit) {
  var enter = this.enter(), update = this, exit = this.exit();
  return typeof onenter == "function" ? (enter = onenter(enter), enter && (enter = enter.selection())) : enter = enter.append(onenter + ""), onupdate != null && (update = onupdate(update), update && (update = update.selection())), onexit == null ? exit.remove() : onexit(exit), enter && update ? enter.merge(update).order() : update;
}
function selection_merge(context) {
  for (var selection2 = context.selection ? context.selection() : context, groups0 = this._groups, groups1 = selection2._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j)
    for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i)
      (node = group0[i] || group1[i]) && (merge[i] = node);
  for (; j < m0; ++j)
    merges[j] = groups0[j];
  return new Selection(merges, this._parents);
}
function selection_order() {
  for (var groups = this._groups, j = -1, m = groups.length; ++j < m; )
    for (var group = groups[j], i = group.length - 1, next = group[i], node; --i >= 0; )
      (node = group[i]) && (next && node.compareDocumentPosition(next) ^ 4 && next.parentNode.insertBefore(node, next), next = node);
  return this;
}
function selection_sort(compare) {
  compare || (compare = ascending);
  function compareNode(a, b) {
    return a && b ? compare(a.__data__, b.__data__) : !a - !b;
  }
  for (var groups = this._groups, m = groups.length, sortgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, sortgroup = sortgroups[j] = new Array(n), node, i = 0; i < n; ++i)
      (node = group[i]) && (sortgroup[i] = node);
    sortgroup.sort(compareNode);
  }
  return new Selection(sortgroups, this._parents).order();
}
function ascending(a, b) {
  return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
}
function selection_call() {
  var callback = arguments[0];
  return arguments[0] = this, callback.apply(null, arguments), this;
}
function selection_nodes() {
  return Array.from(this);
}
function selection_node() {
  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j)
    for (var group = groups[j], i = 0, n = group.length; i < n; ++i) {
      var node = group[i];
      if (node) return node;
    }
  return null;
}
function selection_size() {
  let size = 0;
  for (let node of this) ++size;
  return size;
}
function selection_empty() {
  return !this.node();
}
function selection_each(callback) {
  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j)
    for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i)
      (node = group[i]) && callback.call(node, node.__data__, i, group);
  return this;
}
function attrRemove(name) {
  return function() {
    this.removeAttribute(name);
  };
}
function attrRemoveNS(fullname) {
  return function() {
    this.removeAttributeNS(fullname.space, fullname.local);
  };
}
function attrConstant(name, value2) {
  return function() {
    this.setAttribute(name, value2);
  };
}
function attrConstantNS(fullname, value2) {
  return function() {
    this.setAttributeNS(fullname.space, fullname.local, value2);
  };
}
function attrFunction(name, value2) {
  return function() {
    var v = value2.apply(this, arguments);
    v == null ? this.removeAttribute(name) : this.setAttribute(name, v);
  };
}
function attrFunctionNS(fullname, value2) {
  return function() {
    var v = value2.apply(this, arguments);
    v == null ? this.removeAttributeNS(fullname.space, fullname.local) : this.setAttributeNS(fullname.space, fullname.local, v);
  };
}
function selection_attr(name, value2) {
  var fullname = namespace(name);
  if (arguments.length < 2) {
    var node = this.node();
    return fullname.local ? node.getAttributeNS(fullname.space, fullname.local) : node.getAttribute(fullname);
  }
  return this.each((value2 == null ? fullname.local ? attrRemoveNS : attrRemove : typeof value2 == "function" ? fullname.local ? attrFunctionNS : attrFunction : fullname.local ? attrConstantNS : attrConstant)(fullname, value2));
}
function defaultView(node) {
  return node.ownerDocument && node.ownerDocument.defaultView || node.document && node || node.defaultView;
}
function styleRemove(name) {
  return function() {
    this.style.removeProperty(name);
  };
}
function styleConstant(name, value2, priority) {
  return function() {
    this.style.setProperty(name, value2, priority);
  };
}
function styleFunction(name, value2, priority) {
  return function() {
    var v = value2.apply(this, arguments);
    v == null ? this.style.removeProperty(name) : this.style.setProperty(name, v, priority);
  };
}
function selection_style(name, value2, priority) {
  return arguments.length > 1 ? this.each((value2 == null ? styleRemove : typeof value2 == "function" ? styleFunction : styleConstant)(name, value2, priority ?? "")) : styleValue(this.node(), name);
}
function styleValue(node, name) {
  return node.style.getPropertyValue(name) || defaultView(node).getComputedStyle(node, null).getPropertyValue(name);
}
function propertyRemove(name) {
  return function() {
    delete this[name];
  };
}
function propertyConstant(name, value2) {
  return function() {
    this[name] = value2;
  };
}
function propertyFunction(name, value2) {
  return function() {
    var v = value2.apply(this, arguments);
    v == null ? delete this[name] : this[name] = v;
  };
}
function selection_property(name, value2) {
  return arguments.length > 1 ? this.each((value2 == null ? propertyRemove : typeof value2 == "function" ? propertyFunction : propertyConstant)(name, value2)) : this.node()[name];
}
function classArray(string2) {
  return string2.trim().split(/^|\s+/);
}
function classList(node) {
  return node.classList || new ClassList(node);
}
function ClassList(node) {
  this._node = node, this._names = classArray(node.getAttribute("class") || "");
}
ClassList.prototype = {
  add: function(name) {
    var i = this._names.indexOf(name);
    i < 0 && (this._names.push(name), this._node.setAttribute("class", this._names.join(" ")));
  },
  remove: function(name) {
    var i = this._names.indexOf(name);
    i >= 0 && (this._names.splice(i, 1), this._node.setAttribute("class", this._names.join(" ")));
  },
  contains: function(name) {
    return this._names.indexOf(name) >= 0;
  }
};
function classedAdd(node, names) {
  for (var list = classList(node), i = -1, n = names.length; ++i < n; ) list.add(names[i]);
}
function classedRemove(node, names) {
  for (var list = classList(node), i = -1, n = names.length; ++i < n; ) list.remove(names[i]);
}
function classedTrue(names) {
  return function() {
    classedAdd(this, names);
  };
}
function classedFalse(names) {
  return function() {
    classedRemove(this, names);
  };
}
function classedFunction(names, value2) {
  return function() {
    (value2.apply(this, arguments) ? classedAdd : classedRemove)(this, names);
  };
}
function selection_classed(name, value2) {
  var names = classArray(name + "");
  if (arguments.length < 2) {
    for (var list = classList(this.node()), i = -1, n = names.length; ++i < n; ) if (!list.contains(names[i])) return !1;
    return !0;
  }
  return this.each((typeof value2 == "function" ? classedFunction : value2 ? classedTrue : classedFalse)(names, value2));
}
function textRemove() {
  this.textContent = "";
}
function textConstant(value2) {
  return function() {
    this.textContent = value2;
  };
}
function textFunction(value2) {
  return function() {
    var v = value2.apply(this, arguments);
    this.textContent = v ?? "";
  };
}
function selection_text(value2) {
  return arguments.length ? this.each(value2 == null ? textRemove : (typeof value2 == "function" ? textFunction : textConstant)(value2)) : this.node().textContent;
}
function htmlRemove() {
  this.innerHTML = "";
}
function htmlConstant(value2) {
  return function() {
    this.innerHTML = value2;
  };
}
function htmlFunction(value2) {
  return function() {
    var v = value2.apply(this, arguments);
    this.innerHTML = v ?? "";
  };
}
function selection_html(value2) {
  return arguments.length ? this.each(value2 == null ? htmlRemove : (typeof value2 == "function" ? htmlFunction : htmlConstant)(value2)) : this.node().innerHTML;
}
function raise() {
  this.nextSibling && this.parentNode.appendChild(this);
}
function selection_raise() {
  return this.each(raise);
}
function lower() {
  this.previousSibling && this.parentNode.insertBefore(this, this.parentNode.firstChild);
}
function selection_lower() {
  return this.each(lower);
}
function selection_append(name) {
  var create2 = typeof name == "function" ? name : creator(name);
  return this.select(function() {
    return this.appendChild(create2.apply(this, arguments));
  });
}
function constantNull() {
  return null;
}
function selection_insert(name, before) {
  var create2 = typeof name == "function" ? name : creator(name), select2 = before == null ? constantNull : typeof before == "function" ? before : selector(before);
  return this.select(function() {
    return this.insertBefore(create2.apply(this, arguments), select2.apply(this, arguments) || null);
  });
}
function remove() {
  var parent = this.parentNode;
  parent && parent.removeChild(this);
}
function selection_remove() {
  return this.each(remove);
}
function selection_cloneShallow() {
  var clone = this.cloneNode(!1), parent = this.parentNode;
  return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
}
function selection_cloneDeep() {
  var clone = this.cloneNode(!0), parent = this.parentNode;
  return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
}
function selection_clone(deep) {
  return this.select(deep ? selection_cloneDeep : selection_cloneShallow);
}
function selection_datum(value2) {
  return arguments.length ? this.property("__data__", value2) : this.node().__data__;
}
function contextListener(listener) {
  return function(event) {
    listener.call(this, event, this.__data__);
  };
}
function parseTypenames2(typenames) {
  return typenames.trim().split(/^|\s+/).map(function(t) {
    var name = "", i = t.indexOf(".");
    return i >= 0 && (name = t.slice(i + 1), t = t.slice(0, i)), { type: t, name };
  });
}
function onRemove(typename) {
  return function() {
    var on = this.__on;
    if (on) {
      for (var j = 0, i = -1, m = on.length, o; j < m; ++j)
        o = on[j], (!typename.type || o.type === typename.type) && o.name === typename.name ? this.removeEventListener(o.type, o.listener, o.options) : on[++i] = o;
      ++i ? on.length = i : delete this.__on;
    }
  };
}
function onAdd(typename, value2, options) {
  return function() {
    var on = this.__on, o, listener = contextListener(value2);
    if (on) {
      for (var j = 0, m = on.length; j < m; ++j)
        if ((o = on[j]).type === typename.type && o.name === typename.name) {
          this.removeEventListener(o.type, o.listener, o.options), this.addEventListener(o.type, o.listener = listener, o.options = options), o.value = value2;
          return;
        }
    }
    this.addEventListener(typename.type, listener, options), o = { type: typename.type, name: typename.name, value: value2, listener, options }, on ? on.push(o) : this.__on = [o];
  };
}
function selection_on(typename, value2, options) {
  var typenames = parseTypenames2(typename + ""), i, n = typenames.length, t;
  if (arguments.length < 2) {
    var on = this.node().__on;
    if (on) {
      for (var j = 0, m = on.length, o; j < m; ++j)
        for (i = 0, o = on[j]; i < n; ++i)
          if ((t = typenames[i]).type === o.type && t.name === o.name)
            return o.value;
    }
    return;
  }
  for (on = value2 ? onAdd : onRemove, i = 0; i < n; ++i) this.each(on(typenames[i], value2, options));
  return this;
}
function dispatchEvent(node, type, params) {
  var window2 = defaultView(node), event = window2.CustomEvent;
  typeof event == "function" ? event = new event(type, params) : (event = window2.document.createEvent("Event"), params ? (event.initEvent(type, params.bubbles, params.cancelable), event.detail = params.detail) : event.initEvent(type, !1, !1)), node.dispatchEvent(event);
}
function dispatchConstant(type, params) {
  return function() {
    return dispatchEvent(this, type, params);
  };
}
function dispatchFunction(type, params) {
  return function() {
    return dispatchEvent(this, type, params.apply(this, arguments));
  };
}
function selection_dispatch(type, params) {
  return this.each((typeof params == "function" ? dispatchFunction : dispatchConstant)(type, params));
}
function* selection_iterator() {
  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j)
    for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i)
      (node = group[i]) && (yield node);
}
var root = [null];
function Selection(groups, parents) {
  this._groups = groups, this._parents = parents;
}
function selection() {
  return new Selection([[document.documentElement]], root);
}
function selection_selection() {
  return this;
}
Selection.prototype = selection.prototype = {
  constructor: Selection,
  select: selection_select,
  selectAll: selection_selectAll,
  selectChild: selection_selectChild,
  selectChildren: selection_selectChildren,
  filter: selection_filter,
  data: selection_data,
  enter: selection_enter,
  exit: selection_exit,
  join: selection_join,
  merge: selection_merge,
  selection: selection_selection,
  order: selection_order,
  sort: selection_sort,
  call: selection_call,
  nodes: selection_nodes,
  node: selection_node,
  size: selection_size,
  empty: selection_empty,
  each: selection_each,
  attr: selection_attr,
  style: selection_style,
  property: selection_property,
  classed: selection_classed,
  text: selection_text,
  html: selection_html,
  raise: selection_raise,
  lower: selection_lower,
  append: selection_append,
  insert: selection_insert,
  remove: selection_remove,
  clone: selection_clone,
  datum: selection_datum,
  on: selection_on,
  dispatch: selection_dispatch,
  [Symbol.iterator]: selection_iterator
};
function select(selector2) {
  return typeof selector2 == "string" ? new Selection([[document.querySelector(selector2)]], [document.documentElement]) : new Selection([[selector2]], root);
}
var nextId = 0;
function local() {
  return new Local();
}
function Local() {
  this._ = "@" + (++nextId).toString(36);
}
Local.prototype = local.prototype = {
  constructor: Local,
  get: function(node) {
    for (var id2 = this._; !(id2 in node); ) if (!(node = node.parentNode)) return;
    return node[id2];
  },
  set: function(node, value2) {
    return node[this._] = value2;
  },
  remove: function(node) {
    return this._ in node && delete node[this._];
  },
  toString: function() {
    return this._;
  }
};
function sourceEvent(event) {
  let sourceEvent2;
  for (; sourceEvent2 = event.sourceEvent; ) event = sourceEvent2;
  return event;
}
function pointer(event, node) {
  if (event = sourceEvent(event), node === void 0 && (node = event.currentTarget), node) {
    var svg = node.ownerSVGElement || node;
    if (svg.createSVGPoint) {
      var point = svg.createSVGPoint();
      return point.x = event.clientX, point.y = event.clientY, point = point.matrixTransform(node.getScreenCTM().inverse()), [point.x, point.y];
    }
    if (node.getBoundingClientRect) {
      var rect = node.getBoundingClientRect();
      return [event.clientX - rect.left - node.clientLeft, event.clientY - rect.top - node.clientTop];
    }
  }
  return [event.pageX, event.pageY];
}

// node_modules/d3-drag/dist/d3-drag.mjs
var nonpassive = { passive: !1 }, nonpassivecapture = { capture: !0, passive: !1 };
function nopropagation(event) {
  event.stopImmediatePropagation();
}
function noevent(event) {
  event.preventDefault(), event.stopImmediatePropagation();
}
function nodrag(view) {
  var root2 = view.document.documentElement, selection2 = select(view).on("dragstart.drag", noevent, nonpassivecapture);
  "onselectstart" in root2 ? selection2.on("selectstart.drag", noevent, nonpassivecapture) : (root2.__noselect = root2.style.MozUserSelect, root2.style.MozUserSelect = "none");
}
function yesdrag(view, noclick) {
  var root2 = view.document.documentElement, selection2 = select(view).on("dragstart.drag", null);
  noclick && (selection2.on("click.drag", noevent, nonpassivecapture), setTimeout(function() {
    selection2.on("click.drag", null);
  }, 0)), "onselectstart" in root2 ? selection2.on("selectstart.drag", null) : (root2.style.MozUserSelect = root2.__noselect, delete root2.__noselect);
}
var constant2 = (x) => () => x;
function DragEvent(type, {
  sourceEvent: sourceEvent2,
  subject,
  target,
  identifier,
  active,
  x,
  y,
  dx,
  dy,
  dispatch: dispatch2
}) {
  Object.defineProperties(this, {
    type: { value: type, enumerable: !0, configurable: !0 },
    sourceEvent: { value: sourceEvent2, enumerable: !0, configurable: !0 },
    subject: { value: subject, enumerable: !0, configurable: !0 },
    target: { value: target, enumerable: !0, configurable: !0 },
    identifier: { value: identifier, enumerable: !0, configurable: !0 },
    active: { value: active, enumerable: !0, configurable: !0 },
    x: { value: x, enumerable: !0, configurable: !0 },
    y: { value: y, enumerable: !0, configurable: !0 },
    dx: { value: dx, enumerable: !0, configurable: !0 },
    dy: { value: dy, enumerable: !0, configurable: !0 },
    _: { value: dispatch2 }
  });
}
DragEvent.prototype.on = function() {
  var value2 = this._.on.apply(this._, arguments);
  return value2 === this._ ? this : value2;
};
function defaultFilter(event) {
  return !event.ctrlKey && !event.button;
}
function defaultContainer() {
  return this.parentNode;
}
function defaultSubject(event, d) {
  return d ?? { x: event.x, y: event.y };
}
function defaultTouchable() {
  return navigator.maxTouchPoints || "ontouchstart" in this;
}
function drag() {
  var filter2 = defaultFilter, container = defaultContainer, subject = defaultSubject, touchable = defaultTouchable, gestures = {}, listeners = dispatch("start", "drag", "end"), active = 0, mousedownx, mousedowny, mousemoving, touchending, clickDistance2 = 0;
  function drag2(selection2) {
    selection2.on("mousedown.drag", mousedowned).filter(touchable).on("touchstart.drag", touchstarted).on("touchmove.drag", touchmoved, nonpassive).on("touchend.drag touchcancel.drag", touchended).style("touch-action", "none").style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
  }
  function mousedowned(event, d) {
    if (!(touchending || !filter2.call(this, event, d))) {
      var gesture = beforestart(this, container.call(this, event, d), event, d, "mouse");
      gesture && (select(event.view).on("mousemove.drag", mousemoved, nonpassivecapture).on("mouseup.drag", mouseupped, nonpassivecapture), nodrag(event.view), nopropagation(event), mousemoving = !1, mousedownx = event.clientX, mousedowny = event.clientY, gesture("start", event));
    }
  }
  function mousemoved(event) {
    if (noevent(event), !mousemoving) {
      var dx = event.clientX - mousedownx, dy = event.clientY - mousedowny;
      mousemoving = dx * dx + dy * dy > clickDistance2;
    }
    gestures.mouse("drag", event);
  }
  function mouseupped(event) {
    select(event.view).on("mousemove.drag mouseup.drag", null), yesdrag(event.view, mousemoving), noevent(event), gestures.mouse("end", event);
  }
  function touchstarted(event, d) {
    if (filter2.call(this, event, d)) {
      var touches = event.changedTouches, c = container.call(this, event, d), n = touches.length, i, gesture;
      for (i = 0; i < n; ++i)
        (gesture = beforestart(this, c, event, d, touches[i].identifier, touches[i])) && (nopropagation(event), gesture("start", event, touches[i]));
    }
  }
  function touchmoved(event) {
    var touches = event.changedTouches, n = touches.length, i, gesture;
    for (i = 0; i < n; ++i)
      (gesture = gestures[touches[i].identifier]) && (noevent(event), gesture("drag", event, touches[i]));
  }
  function touchended(event) {
    var touches = event.changedTouches, n = touches.length, i, gesture;
    for (touchending && clearTimeout(touchending), touchending = setTimeout(function() {
      touchending = null;
    }, 500), i = 0; i < n; ++i)
      (gesture = gestures[touches[i].identifier]) && (nopropagation(event), gesture("end", event, touches[i]));
  }
  function beforestart(that, container2, event, d, identifier, touch) {
    var dispatch2 = listeners.copy(), p = pointer(touch || event, container2), dx, dy, s;
    if ((s = subject.call(that, new DragEvent("beforestart", {
      sourceEvent: event,
      target: drag2,
      identifier,
      active,
      x: p[0],
      y: p[1],
      dx: 0,
      dy: 0,
      dispatch: dispatch2
    }), d)) != null)
      return dx = s.x - p[0] || 0, dy = s.y - p[1] || 0, function gesture(type, event2, touch2) {
        var p0 = p, n;
        switch (type) {
          case "start":
            gestures[identifier] = gesture, n = active++;
            break;
          case "end":
            delete gestures[identifier], --active;
          // falls through
          case "drag":
            p = pointer(touch2 || event2, container2), n = active;
            break;
        }
        dispatch2.call(
          type,
          that,
          new DragEvent(type, {
            sourceEvent: event2,
            subject: s,
            target: drag2,
            identifier,
            active: n,
            x: p[0] + dx,
            y: p[1] + dy,
            dx: p[0] - p0[0],
            dy: p[1] - p0[1],
            dispatch: dispatch2
          }),
          d
        );
      };
  }
  return drag2.filter = function(_) {
    return arguments.length ? (filter2 = typeof _ == "function" ? _ : constant2(!!_), drag2) : filter2;
  }, drag2.container = function(_) {
    return arguments.length ? (container = typeof _ == "function" ? _ : constant2(_), drag2) : container;
  }, drag2.subject = function(_) {
    return arguments.length ? (subject = typeof _ == "function" ? _ : constant2(_), drag2) : subject;
  }, drag2.touchable = function(_) {
    return arguments.length ? (touchable = typeof _ == "function" ? _ : constant2(!!_), drag2) : touchable;
  }, drag2.on = function() {
    var value2 = listeners.on.apply(listeners, arguments);
    return value2 === listeners ? drag2 : value2;
  }, drag2.clickDistance = function(_) {
    return arguments.length ? (clickDistance2 = (_ = +_) * _, drag2) : Math.sqrt(clickDistance2);
  }, drag2;
}

// node_modules/d3-zoom/dist/d3-zoom.mjs
init_define_import_meta_env();

// node_modules/d3-interpolate/dist/d3-interpolate.mjs
init_define_import_meta_env();

// node_modules/d3-color/dist/d3-color.mjs
init_define_import_meta_env();
function define(constructor, factory, prototype) {
  constructor.prototype = factory.prototype = prototype, prototype.constructor = constructor;
}
function extend(parent, definition) {
  var prototype = Object.create(parent.prototype);
  for (var key in definition) prototype[key] = definition[key];
  return prototype;
}
function Color() {
}
var darker = 0.7, brighter = 1 / darker, reI = "\\s*([+-]?\\d+)\\s*", reN = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*", reP = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*", reHex = /^#([0-9a-f]{3,8})$/, reRgbInteger = new RegExp(`^rgb\\(${reI},${reI},${reI}\\)$`), reRgbPercent = new RegExp(`^rgb\\(${reP},${reP},${reP}\\)$`), reRgbaInteger = new RegExp(`^rgba\\(${reI},${reI},${reI},${reN}\\)$`), reRgbaPercent = new RegExp(`^rgba\\(${reP},${reP},${reP},${reN}\\)$`), reHslPercent = new RegExp(`^hsl\\(${reN},${reP},${reP}\\)$`), reHslaPercent = new RegExp(`^hsla\\(${reN},${reP},${reP},${reN}\\)$`), named = {
  aliceblue: 15792383,
  antiquewhite: 16444375,
  aqua: 65535,
  aquamarine: 8388564,
  azure: 15794175,
  beige: 16119260,
  bisque: 16770244,
  black: 0,
  blanchedalmond: 16772045,
  blue: 255,
  blueviolet: 9055202,
  brown: 10824234,
  burlywood: 14596231,
  cadetblue: 6266528,
  chartreuse: 8388352,
  chocolate: 13789470,
  coral: 16744272,
  cornflowerblue: 6591981,
  cornsilk: 16775388,
  crimson: 14423100,
  cyan: 65535,
  darkblue: 139,
  darkcyan: 35723,
  darkgoldenrod: 12092939,
  darkgray: 11119017,
  darkgreen: 25600,
  darkgrey: 11119017,
  darkkhaki: 12433259,
  darkmagenta: 9109643,
  darkolivegreen: 5597999,
  darkorange: 16747520,
  darkorchid: 10040012,
  darkred: 9109504,
  darksalmon: 15308410,
  darkseagreen: 9419919,
  darkslateblue: 4734347,
  darkslategray: 3100495,
  darkslategrey: 3100495,
  darkturquoise: 52945,
  darkviolet: 9699539,
  deeppink: 16716947,
  deepskyblue: 49151,
  dimgray: 6908265,
  dimgrey: 6908265,
  dodgerblue: 2003199,
  firebrick: 11674146,
  floralwhite: 16775920,
  forestgreen: 2263842,
  fuchsia: 16711935,
  gainsboro: 14474460,
  ghostwhite: 16316671,
  gold: 16766720,
  goldenrod: 14329120,
  gray: 8421504,
  green: 32768,
  greenyellow: 11403055,
  grey: 8421504,
  honeydew: 15794160,
  hotpink: 16738740,
  indianred: 13458524,
  indigo: 4915330,
  ivory: 16777200,
  khaki: 15787660,
  lavender: 15132410,
  lavenderblush: 16773365,
  lawngreen: 8190976,
  lemonchiffon: 16775885,
  lightblue: 11393254,
  lightcoral: 15761536,
  lightcyan: 14745599,
  lightgoldenrodyellow: 16448210,
  lightgray: 13882323,
  lightgreen: 9498256,
  lightgrey: 13882323,
  lightpink: 16758465,
  lightsalmon: 16752762,
  lightseagreen: 2142890,
  lightskyblue: 8900346,
  lightslategray: 7833753,
  lightslategrey: 7833753,
  lightsteelblue: 11584734,
  lightyellow: 16777184,
  lime: 65280,
  limegreen: 3329330,
  linen: 16445670,
  magenta: 16711935,
  maroon: 8388608,
  mediumaquamarine: 6737322,
  mediumblue: 205,
  mediumorchid: 12211667,
  mediumpurple: 9662683,
  mediumseagreen: 3978097,
  mediumslateblue: 8087790,
  mediumspringgreen: 64154,
  mediumturquoise: 4772300,
  mediumvioletred: 13047173,
  midnightblue: 1644912,
  mintcream: 16121850,
  mistyrose: 16770273,
  moccasin: 16770229,
  navajowhite: 16768685,
  navy: 128,
  oldlace: 16643558,
  olive: 8421376,
  olivedrab: 7048739,
  orange: 16753920,
  orangered: 16729344,
  orchid: 14315734,
  palegoldenrod: 15657130,
  palegreen: 10025880,
  paleturquoise: 11529966,
  palevioletred: 14381203,
  papayawhip: 16773077,
  peachpuff: 16767673,
  peru: 13468991,
  pink: 16761035,
  plum: 14524637,
  powderblue: 11591910,
  purple: 8388736,
  rebeccapurple: 6697881,
  red: 16711680,
  rosybrown: 12357519,
  royalblue: 4286945,
  saddlebrown: 9127187,
  salmon: 16416882,
  sandybrown: 16032864,
  seagreen: 3050327,
  seashell: 16774638,
  sienna: 10506797,
  silver: 12632256,
  skyblue: 8900331,
  slateblue: 6970061,
  slategray: 7372944,
  slategrey: 7372944,
  snow: 16775930,
  springgreen: 65407,
  steelblue: 4620980,
  tan: 13808780,
  teal: 32896,
  thistle: 14204888,
  tomato: 16737095,
  turquoise: 4251856,
  violet: 15631086,
  wheat: 16113331,
  white: 16777215,
  whitesmoke: 16119285,
  yellow: 16776960,
  yellowgreen: 10145074
};
define(Color, color, {
  copy(channels) {
    return Object.assign(new this.constructor(), this, channels);
  },
  displayable() {
    return this.rgb().displayable();
  },
  hex: color_formatHex,
  // Deprecated! Use color.formatHex.
  formatHex: color_formatHex,
  formatHex8: color_formatHex8,
  formatHsl: color_formatHsl,
  formatRgb: color_formatRgb,
  toString: color_formatRgb
});
function color_formatHex() {
  return this.rgb().formatHex();
}
function color_formatHex8() {
  return this.rgb().formatHex8();
}
function color_formatHsl() {
  return hslConvert(this).formatHsl();
}
function color_formatRgb() {
  return this.rgb().formatRgb();
}
function color(format) {
  var m, l;
  return format = (format + "").trim().toLowerCase(), (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) : l === 3 ? new Rgb(m >> 8 & 15 | m >> 4 & 240, m >> 4 & 15 | m & 240, (m & 15) << 4 | m & 15, 1) : l === 8 ? rgba(m >> 24 & 255, m >> 16 & 255, m >> 8 & 255, (m & 255) / 255) : l === 4 ? rgba(m >> 12 & 15 | m >> 8 & 240, m >> 8 & 15 | m >> 4 & 240, m >> 4 & 15 | m & 240, ((m & 15) << 4 | m & 15) / 255) : null) : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) : named.hasOwnProperty(format) ? rgbn(named[format]) : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0) : null;
}
function rgbn(n) {
  return new Rgb(n >> 16 & 255, n >> 8 & 255, n & 255, 1);
}
function rgba(r, g, b, a) {
  return a <= 0 && (r = g = b = NaN), new Rgb(r, g, b, a);
}
function rgbConvert(o) {
  return o instanceof Color || (o = color(o)), o ? (o = o.rgb(), new Rgb(o.r, o.g, o.b, o.opacity)) : new Rgb();
}
function rgb(r, g, b, opacity) {
  return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity ?? 1);
}
function Rgb(r, g, b, opacity) {
  this.r = +r, this.g = +g, this.b = +b, this.opacity = +opacity;
}
define(Rgb, rgb, extend(Color, {
  brighter(k) {
    return k = k == null ? brighter : Math.pow(brighter, k), new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  darker(k) {
    return k = k == null ? darker : Math.pow(darker, k), new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  rgb() {
    return this;
  },
  clamp() {
    return new Rgb(clampi(this.r), clampi(this.g), clampi(this.b), clampa(this.opacity));
  },
  displayable() {
    return -0.5 <= this.r && this.r < 255.5 && -0.5 <= this.g && this.g < 255.5 && -0.5 <= this.b && this.b < 255.5 && 0 <= this.opacity && this.opacity <= 1;
  },
  hex: rgb_formatHex,
  // Deprecated! Use color.formatHex.
  formatHex: rgb_formatHex,
  formatHex8: rgb_formatHex8,
  formatRgb: rgb_formatRgb,
  toString: rgb_formatRgb
}));
function rgb_formatHex() {
  return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}`;
}
function rgb_formatHex8() {
  return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}${hex((isNaN(this.opacity) ? 1 : this.opacity) * 255)}`;
}
function rgb_formatRgb() {
  let a = clampa(this.opacity);
  return `${a === 1 ? "rgb(" : "rgba("}${clampi(this.r)}, ${clampi(this.g)}, ${clampi(this.b)}${a === 1 ? ")" : `, ${a})`}`;
}
function clampa(opacity) {
  return isNaN(opacity) ? 1 : Math.max(0, Math.min(1, opacity));
}
function clampi(value2) {
  return Math.max(0, Math.min(255, Math.round(value2) || 0));
}
function hex(value2) {
  return value2 = clampi(value2), (value2 < 16 ? "0" : "") + value2.toString(16);
}
function hsla(h, s, l, a) {
  return a <= 0 ? h = s = l = NaN : l <= 0 || l >= 1 ? h = s = NaN : s <= 0 && (h = NaN), new Hsl(h, s, l, a);
}
function hslConvert(o) {
  if (o instanceof Hsl) return new Hsl(o.h, o.s, o.l, o.opacity);
  if (o instanceof Color || (o = color(o)), !o) return new Hsl();
  if (o instanceof Hsl) return o;
  o = o.rgb();
  var r = o.r / 255, g = o.g / 255, b = o.b / 255, min = Math.min(r, g, b), max = Math.max(r, g, b), h = NaN, s = max - min, l = (max + min) / 2;
  return s ? (r === max ? h = (g - b) / s + (g < b) * 6 : g === max ? h = (b - r) / s + 2 : h = (r - g) / s + 4, s /= l < 0.5 ? max + min : 2 - max - min, h *= 60) : s = l > 0 && l < 1 ? 0 : h, new Hsl(h, s, l, o.opacity);
}
function hsl(h, s, l, opacity) {
  return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity ?? 1);
}
function Hsl(h, s, l, opacity) {
  this.h = +h, this.s = +s, this.l = +l, this.opacity = +opacity;
}
define(Hsl, hsl, extend(Color, {
  brighter(k) {
    return k = k == null ? brighter : Math.pow(brighter, k), new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  darker(k) {
    return k = k == null ? darker : Math.pow(darker, k), new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  rgb() {
    var h = this.h % 360 + (this.h < 0) * 360, s = isNaN(h) || isNaN(this.s) ? 0 : this.s, l = this.l, m2 = l + (l < 0.5 ? l : 1 - l) * s, m1 = 2 * l - m2;
    return new Rgb(
      hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
      hsl2rgb(h, m1, m2),
      hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
      this.opacity
    );
  },
  clamp() {
    return new Hsl(clamph(this.h), clampt(this.s), clampt(this.l), clampa(this.opacity));
  },
  displayable() {
    return (0 <= this.s && this.s <= 1 || isNaN(this.s)) && 0 <= this.l && this.l <= 1 && 0 <= this.opacity && this.opacity <= 1;
  },
  formatHsl() {
    let a = clampa(this.opacity);
    return `${a === 1 ? "hsl(" : "hsla("}${clamph(this.h)}, ${clampt(this.s) * 100}%, ${clampt(this.l) * 100}%${a === 1 ? ")" : `, ${a})`}`;
  }
}));
function clamph(value2) {
  return value2 = (value2 || 0) % 360, value2 < 0 ? value2 + 360 : value2;
}
function clampt(value2) {
  return Math.max(0, Math.min(1, value2 || 0));
}
function hsl2rgb(h, m1, m2) {
  return (h < 60 ? m1 + (m2 - m1) * h / 60 : h < 180 ? m2 : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60 : m1) * 255;
}
var radians = Math.PI / 180, degrees = 180 / Math.PI, K = 18, Xn = 0.96422, Yn = 1, Zn = 0.82521, t0 = 4 / 29, t1 = 6 / 29, t2 = 3 * t1 * t1, t3 = t1 * t1 * t1;
function labConvert(o) {
  if (o instanceof Lab) return new Lab(o.l, o.a, o.b, o.opacity);
  if (o instanceof Hcl) return hcl2lab(o);
  o instanceof Rgb || (o = rgbConvert(o));
  var r = rgb2lrgb(o.r), g = rgb2lrgb(o.g), b = rgb2lrgb(o.b), y = xyz2lab((0.2225045 * r + 0.7168786 * g + 0.0606169 * b) / Yn), x, z;
  return r === g && g === b ? x = z = y : (x = xyz2lab((0.4360747 * r + 0.3850649 * g + 0.1430804 * b) / Xn), z = xyz2lab((0.0139322 * r + 0.0971045 * g + 0.7141733 * b) / Zn)), new Lab(116 * y - 16, 500 * (x - y), 200 * (y - z), o.opacity);
}
function lab(l, a, b, opacity) {
  return arguments.length === 1 ? labConvert(l) : new Lab(l, a, b, opacity ?? 1);
}
function Lab(l, a, b, opacity) {
  this.l = +l, this.a = +a, this.b = +b, this.opacity = +opacity;
}
define(Lab, lab, extend(Color, {
  brighter(k) {
    return new Lab(this.l + K * (k ?? 1), this.a, this.b, this.opacity);
  },
  darker(k) {
    return new Lab(this.l - K * (k ?? 1), this.a, this.b, this.opacity);
  },
  rgb() {
    var y = (this.l + 16) / 116, x = isNaN(this.a) ? y : y + this.a / 500, z = isNaN(this.b) ? y : y - this.b / 200;
    return x = Xn * lab2xyz(x), y = Yn * lab2xyz(y), z = Zn * lab2xyz(z), new Rgb(
      lrgb2rgb(3.1338561 * x - 1.6168667 * y - 0.4906146 * z),
      lrgb2rgb(-0.9787684 * x + 1.9161415 * y + 0.033454 * z),
      lrgb2rgb(0.0719453 * x - 0.2289914 * y + 1.4052427 * z),
      this.opacity
    );
  }
}));
function xyz2lab(t) {
  return t > t3 ? Math.pow(t, 1 / 3) : t / t2 + t0;
}
function lab2xyz(t) {
  return t > t1 ? t * t * t : t2 * (t - t0);
}
function lrgb2rgb(x) {
  return 255 * (x <= 31308e-7 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
}
function rgb2lrgb(x) {
  return (x /= 255) <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function hclConvert(o) {
  if (o instanceof Hcl) return new Hcl(o.h, o.c, o.l, o.opacity);
  if (o instanceof Lab || (o = labConvert(o)), o.a === 0 && o.b === 0) return new Hcl(NaN, 0 < o.l && o.l < 100 ? 0 : NaN, o.l, o.opacity);
  var h = Math.atan2(o.b, o.a) * degrees;
  return new Hcl(h < 0 ? h + 360 : h, Math.sqrt(o.a * o.a + o.b * o.b), o.l, o.opacity);
}
function hcl(h, c, l, opacity) {
  return arguments.length === 1 ? hclConvert(h) : new Hcl(h, c, l, opacity ?? 1);
}
function Hcl(h, c, l, opacity) {
  this.h = +h, this.c = +c, this.l = +l, this.opacity = +opacity;
}
function hcl2lab(o) {
  if (isNaN(o.h)) return new Lab(o.l, 0, 0, o.opacity);
  var h = o.h * radians;
  return new Lab(o.l, Math.cos(h) * o.c, Math.sin(h) * o.c, o.opacity);
}
define(Hcl, hcl, extend(Color, {
  brighter(k) {
    return new Hcl(this.h, this.c, this.l + K * (k ?? 1), this.opacity);
  },
  darker(k) {
    return new Hcl(this.h, this.c, this.l - K * (k ?? 1), this.opacity);
  },
  rgb() {
    return hcl2lab(this).rgb();
  }
}));
var A = -0.14861, B = 1.78277, C = -0.29227, D = -0.90649, E = 1.97294, ED = E * D, EB = E * B, BC_DA = B * C - D * A;
function cubehelixConvert(o) {
  if (o instanceof Cubehelix) return new Cubehelix(o.h, o.s, o.l, o.opacity);
  o instanceof Rgb || (o = rgbConvert(o));
  var r = o.r / 255, g = o.g / 255, b = o.b / 255, l = (BC_DA * b + ED * r - EB * g) / (BC_DA + ED - EB), bl = b - l, k = (E * (g - l) - C * bl) / D, s = Math.sqrt(k * k + bl * bl) / (E * l * (1 - l)), h = s ? Math.atan2(k, bl) * degrees - 120 : NaN;
  return new Cubehelix(h < 0 ? h + 360 : h, s, l, o.opacity);
}
function cubehelix(h, s, l, opacity) {
  return arguments.length === 1 ? cubehelixConvert(h) : new Cubehelix(h, s, l, opacity ?? 1);
}
function Cubehelix(h, s, l, opacity) {
  this.h = +h, this.s = +s, this.l = +l, this.opacity = +opacity;
}
define(Cubehelix, cubehelix, extend(Color, {
  brighter(k) {
    return k = k == null ? brighter : Math.pow(brighter, k), new Cubehelix(this.h, this.s, this.l * k, this.opacity);
  },
  darker(k) {
    return k = k == null ? darker : Math.pow(darker, k), new Cubehelix(this.h, this.s, this.l * k, this.opacity);
  },
  rgb() {
    var h = isNaN(this.h) ? 0 : (this.h + 120) * radians, l = +this.l, a = isNaN(this.s) ? 0 : this.s * l * (1 - l), cosh2 = Math.cos(h), sinh2 = Math.sin(h);
    return new Rgb(
      255 * (l + a * (A * cosh2 + B * sinh2)),
      255 * (l + a * (C * cosh2 + D * sinh2)),
      255 * (l + a * (E * cosh2)),
      this.opacity
    );
  }
}));

// node_modules/d3-interpolate/dist/d3-interpolate.mjs
function basis(t12, v0, v1, v2, v3) {
  var t22 = t12 * t12, t32 = t22 * t12;
  return ((1 - 3 * t12 + 3 * t22 - t32) * v0 + (4 - 6 * t22 + 3 * t32) * v1 + (1 + 3 * t12 + 3 * t22 - 3 * t32) * v2 + t32 * v3) / 6;
}
function basis$1(values) {
  var n = values.length - 1;
  return function(t) {
    var i = t <= 0 ? t = 0 : t >= 1 ? (t = 1, n - 1) : Math.floor(t * n), v1 = values[i], v2 = values[i + 1], v0 = i > 0 ? values[i - 1] : 2 * v1 - v2, v3 = i < n - 1 ? values[i + 2] : 2 * v2 - v1;
    return basis((t - i / n) * n, v0, v1, v2, v3);
  };
}
function basisClosed(values) {
  var n = values.length;
  return function(t) {
    var i = Math.floor(((t %= 1) < 0 ? ++t : t) * n), v0 = values[(i + n - 1) % n], v1 = values[i % n], v2 = values[(i + 1) % n], v3 = values[(i + 2) % n];
    return basis((t - i / n) * n, v0, v1, v2, v3);
  };
}
var constant3 = (x) => () => x;
function linear(a, d) {
  return function(t) {
    return a + t * d;
  };
}
function exponential(a, b, y) {
  return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function(t) {
    return Math.pow(a + t * b, y);
  };
}
function hue$1(a, b) {
  var d = b - a;
  return d ? linear(a, d > 180 || d < -180 ? d - 360 * Math.round(d / 360) : d) : constant3(isNaN(a) ? b : a);
}
function gamma(y) {
  return (y = +y) == 1 ? nogamma : function(a, b) {
    return b - a ? exponential(a, b, y) : constant3(isNaN(a) ? b : a);
  };
}
function nogamma(a, b) {
  var d = b - a;
  return d ? linear(a, d) : constant3(isNaN(a) ? b : a);
}
var rgb2 = (function rgbGamma(y) {
  var color2 = gamma(y);
  function rgb3(start2, end) {
    var r = color2((start2 = rgb(start2)).r, (end = rgb(end)).r), g = color2(start2.g, end.g), b = color2(start2.b, end.b), opacity = nogamma(start2.opacity, end.opacity);
    return function(t) {
      return start2.r = r(t), start2.g = g(t), start2.b = b(t), start2.opacity = opacity(t), start2 + "";
    };
  }
  return rgb3.gamma = rgbGamma, rgb3;
})(1);
function rgbSpline(spline) {
  return function(colors) {
    var n = colors.length, r = new Array(n), g = new Array(n), b = new Array(n), i, color2;
    for (i = 0; i < n; ++i)
      color2 = rgb(colors[i]), r[i] = color2.r || 0, g[i] = color2.g || 0, b[i] = color2.b || 0;
    return r = spline(r), g = spline(g), b = spline(b), color2.opacity = 1, function(t) {
      return color2.r = r(t), color2.g = g(t), color2.b = b(t), color2 + "";
    };
  };
}
var rgbBasis = rgbSpline(basis$1), rgbBasisClosed = rgbSpline(basisClosed);
function numberArray(a, b) {
  b || (b = []);
  var n = a ? Math.min(b.length, a.length) : 0, c = b.slice(), i;
  return function(t) {
    for (i = 0; i < n; ++i) c[i] = a[i] * (1 - t) + b[i] * t;
    return c;
  };
}
function isNumberArray(x) {
  return ArrayBuffer.isView(x) && !(x instanceof DataView);
}
function genericArray(a, b) {
  var nb = b ? b.length : 0, na = a ? Math.min(nb, a.length) : 0, x = new Array(na), c = new Array(nb), i;
  for (i = 0; i < na; ++i) x[i] = value(a[i], b[i]);
  for (; i < nb; ++i) c[i] = b[i];
  return function(t) {
    for (i = 0; i < na; ++i) c[i] = x[i](t);
    return c;
  };
}
function date(a, b) {
  var d = /* @__PURE__ */ new Date();
  return a = +a, b = +b, function(t) {
    return d.setTime(a * (1 - t) + b * t), d;
  };
}
function number(a, b) {
  return a = +a, b = +b, function(t) {
    return a * (1 - t) + b * t;
  };
}
function object(a, b) {
  var i = {}, c = {}, k;
  (a === null || typeof a != "object") && (a = {}), (b === null || typeof b != "object") && (b = {});
  for (k in b)
    k in a ? i[k] = value(a[k], b[k]) : c[k] = b[k];
  return function(t) {
    for (k in i) c[k] = i[k](t);
    return c;
  };
}
var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g, reB = new RegExp(reA.source, "g");
function zero(b) {
  return function() {
    return b;
  };
}
function one(b) {
  return function(t) {
    return b(t) + "";
  };
}
function string(a, b) {
  var bi = reA.lastIndex = reB.lastIndex = 0, am, bm, bs, i = -1, s = [], q = [];
  for (a = a + "", b = b + ""; (am = reA.exec(a)) && (bm = reB.exec(b)); )
    (bs = bm.index) > bi && (bs = b.slice(bi, bs), s[i] ? s[i] += bs : s[++i] = bs), (am = am[0]) === (bm = bm[0]) ? s[i] ? s[i] += bm : s[++i] = bm : (s[++i] = null, q.push({ i, x: number(am, bm) })), bi = reB.lastIndex;
  return bi < b.length && (bs = b.slice(bi), s[i] ? s[i] += bs : s[++i] = bs), s.length < 2 ? q[0] ? one(q[0].x) : zero(b) : (b = q.length, function(t) {
    for (var i2 = 0, o; i2 < b; ++i2) s[(o = q[i2]).i] = o.x(t);
    return s.join("");
  });
}
function value(a, b) {
  var t = typeof b, c;
  return b == null || t === "boolean" ? constant3(b) : (t === "number" ? number : t === "string" ? (c = color(b)) ? (b = c, rgb2) : string : b instanceof color ? rgb2 : b instanceof Date ? date : isNumberArray(b) ? numberArray : Array.isArray(b) ? genericArray : typeof b.valueOf != "function" && typeof b.toString != "function" || isNaN(b) ? object : number)(a, b);
}
var degrees2 = 180 / Math.PI, identity = {
  translateX: 0,
  translateY: 0,
  rotate: 0,
  skewX: 0,
  scaleX: 1,
  scaleY: 1
};
function decompose(a, b, c, d, e, f) {
  var scaleX, scaleY, skewX;
  return (scaleX = Math.sqrt(a * a + b * b)) && (a /= scaleX, b /= scaleX), (skewX = a * c + b * d) && (c -= a * skewX, d -= b * skewX), (scaleY = Math.sqrt(c * c + d * d)) && (c /= scaleY, d /= scaleY, skewX /= scaleY), a * d < b * c && (a = -a, b = -b, skewX = -skewX, scaleX = -scaleX), {
    translateX: e,
    translateY: f,
    rotate: Math.atan2(b, a) * degrees2,
    skewX: Math.atan(skewX) * degrees2,
    scaleX,
    scaleY
  };
}
var svgNode;
function parseCss(value2) {
  let m = new (typeof DOMMatrix == "function" ? DOMMatrix : WebKitCSSMatrix)(value2 + "");
  return m.isIdentity ? identity : decompose(m.a, m.b, m.c, m.d, m.e, m.f);
}
function parseSvg(value2) {
  return value2 == null || (svgNode || (svgNode = document.createElementNS("http://www.w3.org/2000/svg", "g")), svgNode.setAttribute("transform", value2), !(value2 = svgNode.transform.baseVal.consolidate())) ? identity : (value2 = value2.matrix, decompose(value2.a, value2.b, value2.c, value2.d, value2.e, value2.f));
}
function interpolateTransform(parse, pxComma, pxParen, degParen) {
  function pop(s) {
    return s.length ? s.pop() + " " : "";
  }
  function translate(xa, ya, xb, yb, s, q) {
    if (xa !== xb || ya !== yb) {
      var i = s.push("translate(", null, pxComma, null, pxParen);
      q.push({ i: i - 4, x: number(xa, xb) }, { i: i - 2, x: number(ya, yb) });
    } else (xb || yb) && s.push("translate(" + xb + pxComma + yb + pxParen);
  }
  function rotate(a, b, s, q) {
    a !== b ? (a - b > 180 ? b += 360 : b - a > 180 && (a += 360), q.push({ i: s.push(pop(s) + "rotate(", null, degParen) - 2, x: number(a, b) })) : b && s.push(pop(s) + "rotate(" + b + degParen);
  }
  function skewX(a, b, s, q) {
    a !== b ? q.push({ i: s.push(pop(s) + "skewX(", null, degParen) - 2, x: number(a, b) }) : b && s.push(pop(s) + "skewX(" + b + degParen);
  }
  function scale(xa, ya, xb, yb, s, q) {
    if (xa !== xb || ya !== yb) {
      var i = s.push(pop(s) + "scale(", null, ",", null, ")");
      q.push({ i: i - 4, x: number(xa, xb) }, { i: i - 2, x: number(ya, yb) });
    } else (xb !== 1 || yb !== 1) && s.push(pop(s) + "scale(" + xb + "," + yb + ")");
  }
  return function(a, b) {
    var s = [], q = [];
    return a = parse(a), b = parse(b), translate(a.translateX, a.translateY, b.translateX, b.translateY, s, q), rotate(a.rotate, b.rotate, s, q), skewX(a.skewX, b.skewX, s, q), scale(a.scaleX, a.scaleY, b.scaleX, b.scaleY, s, q), a = b = null, function(t) {
      for (var i = -1, n = q.length, o; ++i < n; ) s[(o = q[i]).i] = o.x(t);
      return s.join("");
    };
  };
}
var interpolateTransformCss = interpolateTransform(parseCss, "px, ", "px)", "deg)"), interpolateTransformSvg = interpolateTransform(parseSvg, ", ", ")", ")"), epsilon2 = 1e-12;
function cosh(x) {
  return ((x = Math.exp(x)) + 1 / x) / 2;
}
function sinh(x) {
  return ((x = Math.exp(x)) - 1 / x) / 2;
}
function tanh(x) {
  return ((x = Math.exp(2 * x)) - 1) / (x + 1);
}
var zoom = (function zoomRho(rho, rho2, rho4) {
  function zoom3(p0, p1) {
    var ux0 = p0[0], uy0 = p0[1], w0 = p0[2], ux1 = p1[0], uy1 = p1[1], w1 = p1[2], dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy, i, S;
    if (d2 < epsilon2)
      S = Math.log(w1 / w0) / rho, i = function(t) {
        return [
          ux0 + t * dx,
          uy0 + t * dy,
          w0 * Math.exp(rho * t * S)
        ];
      };
    else {
      var d1 = Math.sqrt(d2), b02 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1), b12 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1), r0 = Math.log(Math.sqrt(b02 * b02 + 1) - b02), r1 = Math.log(Math.sqrt(b12 * b12 + 1) - b12);
      S = (r1 - r0) / rho, i = function(t) {
        var s = t * S, coshr0 = cosh(r0), u = w0 / (rho2 * d1) * (coshr0 * tanh(rho * s + r0) - sinh(r0));
        return [
          ux0 + u * dx,
          uy0 + u * dy,
          w0 * coshr0 / cosh(rho * s + r0)
        ];
      };
    }
    return i.duration = Math.abs(S) * 1e3 * rho / Math.SQRT2, i;
  }
  return zoom3.rho = function(_) {
    var _1 = Math.max(1e-3, +_), _2 = _1 * _1, _4 = _2 * _2;
    return zoomRho(_1, _2, _4);
  }, zoom3;
})(Math.SQRT2, 2, 4);
function hsl2(hue) {
  return function(start2, end) {
    var h = hue((start2 = hsl(start2)).h, (end = hsl(end)).h), s = nogamma(start2.s, end.s), l = nogamma(start2.l, end.l), opacity = nogamma(start2.opacity, end.opacity);
    return function(t) {
      return start2.h = h(t), start2.s = s(t), start2.l = l(t), start2.opacity = opacity(t), start2 + "";
    };
  };
}
var hsl_default = hsl2(hue$1), hslLong = hsl2(nogamma);
function hcl2(hue) {
  return function(start2, end) {
    var h = hue((start2 = hcl(start2)).h, (end = hcl(end)).h), c = nogamma(start2.c, end.c), l = nogamma(start2.l, end.l), opacity = nogamma(start2.opacity, end.opacity);
    return function(t) {
      return start2.h = h(t), start2.c = c(t), start2.l = l(t), start2.opacity = opacity(t), start2 + "";
    };
  };
}
var hcl_default = hcl2(hue$1), hclLong = hcl2(nogamma);
function cubehelix2(hue) {
  return (function cubehelixGamma(y) {
    y = +y;
    function cubehelix3(start2, end) {
      var h = hue((start2 = cubehelix(start2)).h, (end = cubehelix(end)).h), s = nogamma(start2.s, end.s), l = nogamma(start2.l, end.l), opacity = nogamma(start2.opacity, end.opacity);
      return function(t) {
        return start2.h = h(t), start2.s = s(t), start2.l = l(Math.pow(t, y)), start2.opacity = opacity(t), start2 + "";
      };
    }
    return cubehelix3.gamma = cubehelixGamma, cubehelix3;
  })(1);
}
var cubehelix_default = cubehelix2(hue$1), cubehelixLong = cubehelix2(nogamma);

// node_modules/d3-transition/dist/d3-transition.mjs
init_define_import_meta_env();

// node_modules/d3-timer/dist/d3-timer.mjs
init_define_import_meta_env();
var frame = 0, timeout$1 = 0, interval$1 = 0, pokeDelay = 1e3, taskHead, taskTail, clockLast = 0, clockNow = 0, clockSkew = 0, clock = typeof performance == "object" && performance.now ? performance : Date, setFrame = typeof window == "object" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(f) {
  setTimeout(f, 17);
};
function now() {
  return clockNow || (setFrame(clearNow), clockNow = clock.now() + clockSkew);
}
function clearNow() {
  clockNow = 0;
}
function Timer() {
  this._call = this._time = this._next = null;
}
Timer.prototype = timer.prototype = {
  constructor: Timer,
  restart: function(callback, delay, time) {
    if (typeof callback != "function") throw new TypeError("callback is not a function");
    time = (time == null ? now() : +time) + (delay == null ? 0 : +delay), !this._next && taskTail !== this && (taskTail ? taskTail._next = this : taskHead = this, taskTail = this), this._call = callback, this._time = time, sleep();
  },
  stop: function() {
    this._call && (this._call = null, this._time = 1 / 0, sleep());
  }
};
function timer(callback, delay, time) {
  var t = new Timer();
  return t.restart(callback, delay, time), t;
}
function timerFlush() {
  now(), ++frame;
  for (var t = taskHead, e; t; )
    (e = clockNow - t._time) >= 0 && t._call.call(void 0, e), t = t._next;
  --frame;
}
function wake() {
  clockNow = (clockLast = clock.now()) + clockSkew, frame = timeout$1 = 0;
  try {
    timerFlush();
  } finally {
    frame = 0, nap(), clockNow = 0;
  }
}
function poke() {
  var now2 = clock.now(), delay = now2 - clockLast;
  delay > pokeDelay && (clockSkew -= delay, clockLast = now2);
}
function nap() {
  for (var t02, t12 = taskHead, t22, time = 1 / 0; t12; )
    t12._call ? (time > t12._time && (time = t12._time), t02 = t12, t12 = t12._next) : (t22 = t12._next, t12._next = null, t12 = t02 ? t02._next = t22 : taskHead = t22);
  taskTail = t02, sleep(time);
}
function sleep(time) {
  if (!frame) {
    timeout$1 && (timeout$1 = clearTimeout(timeout$1));
    var delay = time - clockNow;
    delay > 24 ? (time < 1 / 0 && (timeout$1 = setTimeout(wake, Math.ceil(time - clock.now() - clockSkew) + 1)), interval$1 && (interval$1 = clearInterval(interval$1))) : (interval$1 || (clockLast = clock.now(), interval$1 = setInterval(poke, pokeDelay)), frame = 1, setFrame(wake));
  }
}
function timeout(callback, delay, time) {
  var t = new Timer();
  return delay = delay == null ? 0 : +delay, t.restart((elapsed) => {
    t.stop(), callback(elapsed + delay);
  }, delay, time), t;
}

// node_modules/d3-ease/dist/d3-ease.mjs
init_define_import_meta_env();
function cubicInOut(t) {
  return ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;
}
var exponent = 3, polyIn = (function custom(e) {
  e = +e;
  function polyIn2(t) {
    return Math.pow(t, e);
  }
  return polyIn2.exponent = custom, polyIn2;
})(exponent), polyOut = (function custom2(e) {
  e = +e;
  function polyOut2(t) {
    return 1 - Math.pow(1 - t, e);
  }
  return polyOut2.exponent = custom2, polyOut2;
})(exponent), polyInOut = (function custom3(e) {
  e = +e;
  function polyInOut2(t) {
    return ((t *= 2) <= 1 ? Math.pow(t, e) : 2 - Math.pow(2 - t, e)) / 2;
  }
  return polyInOut2.exponent = custom3, polyInOut2;
})(exponent), pi = Math.PI, halfPi = pi / 2;
function tpmt(x) {
  return (Math.pow(2, -10 * x) - 9765625e-10) * 1.0009775171065494;
}
var b1 = 4 / 11, b2 = 6 / 11, b3 = 8 / 11, b4 = 3 / 4, b5 = 9 / 11, b6 = 10 / 11, b7 = 15 / 16, b8 = 21 / 22, b9 = 63 / 64, b0 = 1 / b1 / b1;
var overshoot = 1.70158, backIn = (function custom4(s) {
  s = +s;
  function backIn2(t) {
    return (t = +t) * t * (s * (t - 1) + t);
  }
  return backIn2.overshoot = custom4, backIn2;
})(overshoot), backOut = (function custom5(s) {
  s = +s;
  function backOut2(t) {
    return --t * t * ((t + 1) * s + t) + 1;
  }
  return backOut2.overshoot = custom5, backOut2;
})(overshoot), backInOut = (function custom6(s) {
  s = +s;
  function backInOut2(t) {
    return ((t *= 2) < 1 ? t * t * ((s + 1) * t - s) : (t -= 2) * t * ((s + 1) * t + s) + 2) / 2;
  }
  return backInOut2.overshoot = custom6, backInOut2;
})(overshoot), tau = 2 * Math.PI, amplitude = 1, period = 0.3, elasticIn = (function custom7(a, p) {
  var s = Math.asin(1 / (a = Math.max(1, a))) * (p /= tau);
  function elasticIn2(t) {
    return a * tpmt(- --t) * Math.sin((s - t) / p);
  }
  return elasticIn2.amplitude = function(a2) {
    return custom7(a2, p * tau);
  }, elasticIn2.period = function(p2) {
    return custom7(a, p2);
  }, elasticIn2;
})(amplitude, period), elasticOut = (function custom8(a, p) {
  var s = Math.asin(1 / (a = Math.max(1, a))) * (p /= tau);
  function elasticOut2(t) {
    return 1 - a * tpmt(t = +t) * Math.sin((t + s) / p);
  }
  return elasticOut2.amplitude = function(a2) {
    return custom8(a2, p * tau);
  }, elasticOut2.period = function(p2) {
    return custom8(a, p2);
  }, elasticOut2;
})(amplitude, period), elasticInOut = (function custom9(a, p) {
  var s = Math.asin(1 / (a = Math.max(1, a))) * (p /= tau);
  function elasticInOut2(t) {
    return ((t = t * 2 - 1) < 0 ? a * tpmt(-t) * Math.sin((s - t) / p) : 2 - a * tpmt(t) * Math.sin((s + t) / p)) / 2;
  }
  return elasticInOut2.amplitude = function(a2) {
    return custom9(a2, p * tau);
  }, elasticInOut2.period = function(p2) {
    return custom9(a, p2);
  }, elasticInOut2;
})(amplitude, period);

// node_modules/d3-transition/dist/d3-transition.mjs
var emptyOn = dispatch("start", "end", "cancel", "interrupt"), emptyTween = [], CREATED = 0, SCHEDULED = 1, STARTING = 2, STARTED = 3, RUNNING = 4, ENDING = 5, ENDED = 6;
function schedule(node, name, id2, index2, group, timing) {
  var schedules = node.__transition;
  if (!schedules) node.__transition = {};
  else if (id2 in schedules) return;
  create(node, id2, {
    name,
    index: index2,
    // For context during callback.
    group,
    // For context during callback.
    on: emptyOn,
    tween: emptyTween,
    time: timing.time,
    delay: timing.delay,
    duration: timing.duration,
    ease: timing.ease,
    timer: null,
    state: CREATED
  });
}
function init(node, id2) {
  var schedule2 = get2(node, id2);
  if (schedule2.state > CREATED) throw new Error("too late; already scheduled");
  return schedule2;
}
function set2(node, id2) {
  var schedule2 = get2(node, id2);
  if (schedule2.state > STARTED) throw new Error("too late; already running");
  return schedule2;
}
function get2(node, id2) {
  var schedule2 = node.__transition;
  if (!schedule2 || !(schedule2 = schedule2[id2])) throw new Error("transition not found");
  return schedule2;
}
function create(node, id2, self) {
  var schedules = node.__transition, tween;
  schedules[id2] = self, self.timer = timer(schedule2, 0, self.time);
  function schedule2(elapsed) {
    self.state = SCHEDULED, self.timer.restart(start2, self.delay, self.time), self.delay <= elapsed && start2(elapsed - self.delay);
  }
  function start2(elapsed) {
    var i, j, n, o;
    if (self.state !== SCHEDULED) return stop();
    for (i in schedules)
      if (o = schedules[i], o.name === self.name) {
        if (o.state === STARTED) return timeout(start2);
        o.state === RUNNING ? (o.state = ENDED, o.timer.stop(), o.on.call("interrupt", node, node.__data__, o.index, o.group), delete schedules[i]) : +i < id2 && (o.state = ENDED, o.timer.stop(), o.on.call("cancel", node, node.__data__, o.index, o.group), delete schedules[i]);
      }
    if (timeout(function() {
      self.state === STARTED && (self.state = RUNNING, self.timer.restart(tick, self.delay, self.time), tick(elapsed));
    }), self.state = STARTING, self.on.call("start", node, node.__data__, self.index, self.group), self.state === STARTING) {
      for (self.state = STARTED, tween = new Array(n = self.tween.length), i = 0, j = -1; i < n; ++i)
        (o = self.tween[i].value.call(node, node.__data__, self.index, self.group)) && (tween[++j] = o);
      tween.length = j + 1;
    }
  }
  function tick(elapsed) {
    for (var t = elapsed < self.duration ? self.ease.call(null, elapsed / self.duration) : (self.timer.restart(stop), self.state = ENDING, 1), i = -1, n = tween.length; ++i < n; )
      tween[i].call(node, t);
    self.state === ENDING && (self.on.call("end", node, node.__data__, self.index, self.group), stop());
  }
  function stop() {
    self.state = ENDED, self.timer.stop(), delete schedules[id2];
    for (var i in schedules) return;
    delete node.__transition;
  }
}
function interrupt(node, name) {
  var schedules = node.__transition, schedule2, active, empty2 = !0, i;
  if (schedules) {
    name = name == null ? null : name + "";
    for (i in schedules) {
      if ((schedule2 = schedules[i]).name !== name) {
        empty2 = !1;
        continue;
      }
      active = schedule2.state > STARTING && schedule2.state < ENDING, schedule2.state = ENDED, schedule2.timer.stop(), schedule2.on.call(active ? "interrupt" : "cancel", node, node.__data__, schedule2.index, schedule2.group), delete schedules[i];
    }
    empty2 && delete node.__transition;
  }
}
function selection_interrupt(name) {
  return this.each(function() {
    interrupt(this, name);
  });
}
function tweenRemove(id2, name) {
  var tween0, tween1;
  return function() {
    var schedule2 = set2(this, id2), tween = schedule2.tween;
    if (tween !== tween0) {
      tween1 = tween0 = tween;
      for (var i = 0, n = tween1.length; i < n; ++i)
        if (tween1[i].name === name) {
          tween1 = tween1.slice(), tween1.splice(i, 1);
          break;
        }
    }
    schedule2.tween = tween1;
  };
}
function tweenFunction(id2, name, value2) {
  var tween0, tween1;
  if (typeof value2 != "function") throw new Error();
  return function() {
    var schedule2 = set2(this, id2), tween = schedule2.tween;
    if (tween !== tween0) {
      tween1 = (tween0 = tween).slice();
      for (var t = { name, value: value2 }, i = 0, n = tween1.length; i < n; ++i)
        if (tween1[i].name === name) {
          tween1[i] = t;
          break;
        }
      i === n && tween1.push(t);
    }
    schedule2.tween = tween1;
  };
}
function transition_tween(name, value2) {
  var id2 = this._id;
  if (name += "", arguments.length < 2) {
    for (var tween = get2(this.node(), id2).tween, i = 0, n = tween.length, t; i < n; ++i)
      if ((t = tween[i]).name === name)
        return t.value;
    return null;
  }
  return this.each((value2 == null ? tweenRemove : tweenFunction)(id2, name, value2));
}
function tweenValue(transition2, name, value2) {
  var id2 = transition2._id;
  return transition2.each(function() {
    var schedule2 = set2(this, id2);
    (schedule2.value || (schedule2.value = {}))[name] = value2.apply(this, arguments);
  }), function(node) {
    return get2(node, id2).value[name];
  };
}
function interpolate(a, b) {
  var c;
  return (typeof b == "number" ? number : b instanceof color ? rgb2 : (c = color(b)) ? (b = c, rgb2) : string)(a, b);
}
function attrRemove2(name) {
  return function() {
    this.removeAttribute(name);
  };
}
function attrRemoveNS2(fullname) {
  return function() {
    this.removeAttributeNS(fullname.space, fullname.local);
  };
}
function attrConstant2(name, interpolate2, value1) {
  var string00, string1 = value1 + "", interpolate0;
  return function() {
    var string0 = this.getAttribute(name);
    return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, value1);
  };
}
function attrConstantNS2(fullname, interpolate2, value1) {
  var string00, string1 = value1 + "", interpolate0;
  return function() {
    var string0 = this.getAttributeNS(fullname.space, fullname.local);
    return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, value1);
  };
}
function attrFunction2(name, interpolate2, value2) {
  var string00, string10, interpolate0;
  return function() {
    var string0, value1 = value2(this), string1;
    return value1 == null ? void this.removeAttribute(name) : (string0 = this.getAttribute(name), string1 = value1 + "", string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate2(string00 = string0, value1)));
  };
}
function attrFunctionNS2(fullname, interpolate2, value2) {
  var string00, string10, interpolate0;
  return function() {
    var string0, value1 = value2(this), string1;
    return value1 == null ? void this.removeAttributeNS(fullname.space, fullname.local) : (string0 = this.getAttributeNS(fullname.space, fullname.local), string1 = value1 + "", string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate2(string00 = string0, value1)));
  };
}
function transition_attr(name, value2) {
  var fullname = namespace(name), i = fullname === "transform" ? interpolateTransformSvg : interpolate;
  return this.attrTween(name, typeof value2 == "function" ? (fullname.local ? attrFunctionNS2 : attrFunction2)(fullname, i, tweenValue(this, "attr." + name, value2)) : value2 == null ? (fullname.local ? attrRemoveNS2 : attrRemove2)(fullname) : (fullname.local ? attrConstantNS2 : attrConstant2)(fullname, i, value2));
}
function attrInterpolate(name, i) {
  return function(t) {
    this.setAttribute(name, i.call(this, t));
  };
}
function attrInterpolateNS(fullname, i) {
  return function(t) {
    this.setAttributeNS(fullname.space, fullname.local, i.call(this, t));
  };
}
function attrTweenNS(fullname, value2) {
  var t02, i0;
  function tween() {
    var i = value2.apply(this, arguments);
    return i !== i0 && (t02 = (i0 = i) && attrInterpolateNS(fullname, i)), t02;
  }
  return tween._value = value2, tween;
}
function attrTween(name, value2) {
  var t02, i0;
  function tween() {
    var i = value2.apply(this, arguments);
    return i !== i0 && (t02 = (i0 = i) && attrInterpolate(name, i)), t02;
  }
  return tween._value = value2, tween;
}
function transition_attrTween(name, value2) {
  var key = "attr." + name;
  if (arguments.length < 2) return (key = this.tween(key)) && key._value;
  if (value2 == null) return this.tween(key, null);
  if (typeof value2 != "function") throw new Error();
  var fullname = namespace(name);
  return this.tween(key, (fullname.local ? attrTweenNS : attrTween)(fullname, value2));
}
function delayFunction(id2, value2) {
  return function() {
    init(this, id2).delay = +value2.apply(this, arguments);
  };
}
function delayConstant(id2, value2) {
  return value2 = +value2, function() {
    init(this, id2).delay = value2;
  };
}
function transition_delay(value2) {
  var id2 = this._id;
  return arguments.length ? this.each((typeof value2 == "function" ? delayFunction : delayConstant)(id2, value2)) : get2(this.node(), id2).delay;
}
function durationFunction(id2, value2) {
  return function() {
    set2(this, id2).duration = +value2.apply(this, arguments);
  };
}
function durationConstant(id2, value2) {
  return value2 = +value2, function() {
    set2(this, id2).duration = value2;
  };
}
function transition_duration(value2) {
  var id2 = this._id;
  return arguments.length ? this.each((typeof value2 == "function" ? durationFunction : durationConstant)(id2, value2)) : get2(this.node(), id2).duration;
}
function easeConstant(id2, value2) {
  if (typeof value2 != "function") throw new Error();
  return function() {
    set2(this, id2).ease = value2;
  };
}
function transition_ease(value2) {
  var id2 = this._id;
  return arguments.length ? this.each(easeConstant(id2, value2)) : get2(this.node(), id2).ease;
}
function easeVarying(id2, value2) {
  return function() {
    var v = value2.apply(this, arguments);
    if (typeof v != "function") throw new Error();
    set2(this, id2).ease = v;
  };
}
function transition_easeVarying(value2) {
  if (typeof value2 != "function") throw new Error();
  return this.each(easeVarying(this._id, value2));
}
function transition_filter(match) {
  typeof match != "function" && (match = matcher(match));
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j)
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i)
      (node = group[i]) && match.call(node, node.__data__, i, group) && subgroup.push(node);
  return new Transition(subgroups, this._parents, this._name, this._id);
}
function transition_merge(transition2) {
  if (transition2._id !== this._id) throw new Error();
  for (var groups0 = this._groups, groups1 = transition2._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j)
    for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i)
      (node = group0[i] || group1[i]) && (merge[i] = node);
  for (; j < m0; ++j)
    merges[j] = groups0[j];
  return new Transition(merges, this._parents, this._name, this._id);
}
function start(name) {
  return (name + "").trim().split(/^|\s+/).every(function(t) {
    var i = t.indexOf(".");
    return i >= 0 && (t = t.slice(0, i)), !t || t === "start";
  });
}
function onFunction(id2, name, listener) {
  var on0, on1, sit = start(name) ? init : set2;
  return function() {
    var schedule2 = sit(this, id2), on = schedule2.on;
    on !== on0 && (on1 = (on0 = on).copy()).on(name, listener), schedule2.on = on1;
  };
}
function transition_on(name, listener) {
  var id2 = this._id;
  return arguments.length < 2 ? get2(this.node(), id2).on.on(name) : this.each(onFunction(id2, name, listener));
}
function removeFunction(id2) {
  return function() {
    var parent = this.parentNode;
    for (var i in this.__transition) if (+i !== id2) return;
    parent && parent.removeChild(this);
  };
}
function transition_remove() {
  return this.on("end.remove", removeFunction(this._id));
}
function transition_select(select2) {
  var name = this._name, id2 = this._id;
  typeof select2 != "function" && (select2 = selector(select2));
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j)
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i)
      (node = group[i]) && (subnode = select2.call(node, node.__data__, i, group)) && ("__data__" in node && (subnode.__data__ = node.__data__), subgroup[i] = subnode, schedule(subgroup[i], name, id2, i, subgroup, get2(node, id2)));
  return new Transition(subgroups, this._parents, name, id2);
}
function transition_selectAll(select2) {
  var name = this._name, id2 = this._id;
  typeof select2 != "function" && (select2 = selectorAll(select2));
  for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j)
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i)
      if (node = group[i]) {
        for (var children2 = select2.call(node, node.__data__, i, group), child, inherit2 = get2(node, id2), k = 0, l = children2.length; k < l; ++k)
          (child = children2[k]) && schedule(child, name, id2, k, children2, inherit2);
        subgroups.push(children2), parents.push(node);
      }
  return new Transition(subgroups, parents, name, id2);
}
var Selection2 = selection.prototype.constructor;
function transition_selection() {
  return new Selection2(this._groups, this._parents);
}
function styleNull(name, interpolate2) {
  var string00, string10, interpolate0;
  return function() {
    var string0 = styleValue(this, name), string1 = (this.style.removeProperty(name), styleValue(this, name));
    return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, string10 = string1);
  };
}
function styleRemove2(name) {
  return function() {
    this.style.removeProperty(name);
  };
}
function styleConstant2(name, interpolate2, value1) {
  var string00, string1 = value1 + "", interpolate0;
  return function() {
    var string0 = styleValue(this, name);
    return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, value1);
  };
}
function styleFunction2(name, interpolate2, value2) {
  var string00, string10, interpolate0;
  return function() {
    var string0 = styleValue(this, name), value1 = value2(this), string1 = value1 + "";
    return value1 == null && (string1 = value1 = (this.style.removeProperty(name), styleValue(this, name))), string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate2(string00 = string0, value1));
  };
}
function styleMaybeRemove(id2, name) {
  var on0, on1, listener0, key = "style." + name, event = "end." + key, remove2;
  return function() {
    var schedule2 = set2(this, id2), on = schedule2.on, listener = schedule2.value[key] == null ? remove2 || (remove2 = styleRemove2(name)) : void 0;
    (on !== on0 || listener0 !== listener) && (on1 = (on0 = on).copy()).on(event, listener0 = listener), schedule2.on = on1;
  };
}
function transition_style(name, value2, priority) {
  var i = (name += "") == "transform" ? interpolateTransformCss : interpolate;
  return value2 == null ? this.styleTween(name, styleNull(name, i)).on("end.style." + name, styleRemove2(name)) : typeof value2 == "function" ? this.styleTween(name, styleFunction2(name, i, tweenValue(this, "style." + name, value2))).each(styleMaybeRemove(this._id, name)) : this.styleTween(name, styleConstant2(name, i, value2), priority).on("end.style." + name, null);
}
function styleInterpolate(name, i, priority) {
  return function(t) {
    this.style.setProperty(name, i.call(this, t), priority);
  };
}
function styleTween(name, value2, priority) {
  var t, i0;
  function tween() {
    var i = value2.apply(this, arguments);
    return i !== i0 && (t = (i0 = i) && styleInterpolate(name, i, priority)), t;
  }
  return tween._value = value2, tween;
}
function transition_styleTween(name, value2, priority) {
  var key = "style." + (name += "");
  if (arguments.length < 2) return (key = this.tween(key)) && key._value;
  if (value2 == null) return this.tween(key, null);
  if (typeof value2 != "function") throw new Error();
  return this.tween(key, styleTween(name, value2, priority ?? ""));
}
function textConstant2(value2) {
  return function() {
    this.textContent = value2;
  };
}
function textFunction2(value2) {
  return function() {
    var value1 = value2(this);
    this.textContent = value1 ?? "";
  };
}
function transition_text(value2) {
  return this.tween("text", typeof value2 == "function" ? textFunction2(tweenValue(this, "text", value2)) : textConstant2(value2 == null ? "" : value2 + ""));
}
function textInterpolate(i) {
  return function(t) {
    this.textContent = i.call(this, t);
  };
}
function textTween(value2) {
  var t02, i0;
  function tween() {
    var i = value2.apply(this, arguments);
    return i !== i0 && (t02 = (i0 = i) && textInterpolate(i)), t02;
  }
  return tween._value = value2, tween;
}
function transition_textTween(value2) {
  var key = "text";
  if (arguments.length < 1) return (key = this.tween(key)) && key._value;
  if (value2 == null) return this.tween(key, null);
  if (typeof value2 != "function") throw new Error();
  return this.tween(key, textTween(value2));
}
function transition_transition() {
  for (var name = this._name, id0 = this._id, id1 = newId(), groups = this._groups, m = groups.length, j = 0; j < m; ++j)
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i)
      if (node = group[i]) {
        var inherit2 = get2(node, id0);
        schedule(node, name, id1, i, group, {
          time: inherit2.time + inherit2.delay + inherit2.duration,
          delay: 0,
          duration: inherit2.duration,
          ease: inherit2.ease
        });
      }
  return new Transition(groups, this._parents, name, id1);
}
function transition_end() {
  var on0, on1, that = this, id2 = that._id, size = that.size();
  return new Promise(function(resolve, reject) {
    var cancel = { value: reject }, end = { value: function() {
      --size === 0 && resolve();
    } };
    that.each(function() {
      var schedule2 = set2(this, id2), on = schedule2.on;
      on !== on0 && (on1 = (on0 = on).copy(), on1._.cancel.push(cancel), on1._.interrupt.push(cancel), on1._.end.push(end)), schedule2.on = on1;
    }), size === 0 && resolve();
  });
}
var id = 0;
function Transition(groups, parents, name, id2) {
  this._groups = groups, this._parents = parents, this._name = name, this._id = id2;
}
function transition(name) {
  return selection().transition(name);
}
function newId() {
  return ++id;
}
var selection_prototype = selection.prototype;
Transition.prototype = transition.prototype = {
  constructor: Transition,
  select: transition_select,
  selectAll: transition_selectAll,
  selectChild: selection_prototype.selectChild,
  selectChildren: selection_prototype.selectChildren,
  filter: transition_filter,
  merge: transition_merge,
  selection: transition_selection,
  transition: transition_transition,
  call: selection_prototype.call,
  nodes: selection_prototype.nodes,
  node: selection_prototype.node,
  size: selection_prototype.size,
  empty: selection_prototype.empty,
  each: selection_prototype.each,
  on: transition_on,
  attr: transition_attr,
  attrTween: transition_attrTween,
  style: transition_style,
  styleTween: transition_styleTween,
  text: transition_text,
  textTween: transition_textTween,
  remove: transition_remove,
  tween: transition_tween,
  delay: transition_delay,
  duration: transition_duration,
  ease: transition_ease,
  easeVarying: transition_easeVarying,
  end: transition_end,
  [Symbol.iterator]: selection_prototype[Symbol.iterator]
};
var defaultTiming = {
  time: null,
  // Set on use.
  delay: 0,
  duration: 250,
  ease: cubicInOut
};
function inherit(node, id2) {
  for (var timing; !(timing = node.__transition) || !(timing = timing[id2]); )
    if (!(node = node.parentNode))
      throw new Error(`transition ${id2} not found`);
  return timing;
}
function selection_transition(name) {
  var id2, timing;
  name instanceof Transition ? (id2 = name._id, name = name._name) : (id2 = newId(), (timing = defaultTiming).time = now(), name = name == null ? null : name + "");
  for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j)
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i)
      (node = group[i]) && schedule(node, name, id2, i, group, timing || inherit(node, id2));
  return new Transition(groups, this._parents, name, id2);
}
selection.prototype.interrupt = selection_interrupt;
selection.prototype.transition = selection_transition;

// node_modules/d3-zoom/dist/d3-zoom.mjs
var constant4 = (x) => () => x;
function ZoomEvent(type, {
  sourceEvent: sourceEvent2,
  target,
  transform: transform2,
  dispatch: dispatch2
}) {
  Object.defineProperties(this, {
    type: { value: type, enumerable: !0, configurable: !0 },
    sourceEvent: { value: sourceEvent2, enumerable: !0, configurable: !0 },
    target: { value: target, enumerable: !0, configurable: !0 },
    transform: { value: transform2, enumerable: !0, configurable: !0 },
    _: { value: dispatch2 }
  });
}
function Transform(k, x, y) {
  this.k = k, this.x = x, this.y = y;
}
Transform.prototype = {
  constructor: Transform,
  scale: function(k) {
    return k === 1 ? this : new Transform(this.k * k, this.x, this.y);
  },
  translate: function(x, y) {
    return x === 0 & y === 0 ? this : new Transform(this.k, this.x + this.k * x, this.y + this.k * y);
  },
  apply: function(point) {
    return [point[0] * this.k + this.x, point[1] * this.k + this.y];
  },
  applyX: function(x) {
    return x * this.k + this.x;
  },
  applyY: function(y) {
    return y * this.k + this.y;
  },
  invert: function(location) {
    return [(location[0] - this.x) / this.k, (location[1] - this.y) / this.k];
  },
  invertX: function(x) {
    return (x - this.x) / this.k;
  },
  invertY: function(y) {
    return (y - this.y) / this.k;
  },
  rescaleX: function(x) {
    return x.copy().domain(x.range().map(this.invertX, this).map(x.invert, x));
  },
  rescaleY: function(y) {
    return y.copy().domain(y.range().map(this.invertY, this).map(y.invert, y));
  },
  toString: function() {
    return "translate(" + this.x + "," + this.y + ") scale(" + this.k + ")";
  }
};
var identity2 = new Transform(1, 0, 0);
transform.prototype = Transform.prototype;
function transform(node) {
  for (; !node.__zoom; ) if (!(node = node.parentNode)) return identity2;
  return node.__zoom;
}
function nopropagation2(event) {
  event.stopImmediatePropagation();
}
function noevent2(event) {
  event.preventDefault(), event.stopImmediatePropagation();
}
function defaultFilter2(event) {
  return (!event.ctrlKey || event.type === "wheel") && !event.button;
}
function defaultExtent() {
  var e = this;
  return e instanceof SVGElement ? (e = e.ownerSVGElement || e, e.hasAttribute("viewBox") ? (e = e.viewBox.baseVal, [[e.x, e.y], [e.x + e.width, e.y + e.height]]) : [[0, 0], [e.width.baseVal.value, e.height.baseVal.value]]) : [[0, 0], [e.clientWidth, e.clientHeight]];
}
function defaultTransform() {
  return this.__zoom || identity2;
}
function defaultWheelDelta(event) {
  return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 2e-3) * (event.ctrlKey ? 10 : 1);
}
function defaultTouchable2() {
  return navigator.maxTouchPoints || "ontouchstart" in this;
}
function defaultConstrain(transform2, extent, translateExtent) {
  var dx0 = transform2.invertX(extent[0][0]) - translateExtent[0][0], dx1 = transform2.invertX(extent[1][0]) - translateExtent[1][0], dy0 = transform2.invertY(extent[0][1]) - translateExtent[0][1], dy1 = transform2.invertY(extent[1][1]) - translateExtent[1][1];
  return transform2.translate(
    dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1),
    dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1)
  );
}
function zoom2() {
  var filter2 = defaultFilter2, extent = defaultExtent, constrain = defaultConstrain, wheelDelta2 = defaultWheelDelta, touchable = defaultTouchable2, scaleExtent = [0, 1 / 0], translateExtent = [[-1 / 0, -1 / 0], [1 / 0, 1 / 0]], duration = 250, interpolate2 = zoom, listeners = dispatch("start", "zoom", "end"), touchstarting, touchfirst, touchending, touchDelay = 500, wheelDelay = 150, clickDistance2 = 0, tapDistance = 10;
  function zoom3(selection2) {
    selection2.property("__zoom", defaultTransform).on("wheel.zoom", wheeled, { passive: !1 }).on("mousedown.zoom", mousedowned).on("dblclick.zoom", dblclicked).filter(touchable).on("touchstart.zoom", touchstarted).on("touchmove.zoom", touchmoved).on("touchend.zoom touchcancel.zoom", touchended).style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
  }
  zoom3.transform = function(collection, transform2, point, event) {
    var selection2 = collection.selection ? collection.selection() : collection;
    selection2.property("__zoom", defaultTransform), collection !== selection2 ? schedule2(collection, transform2, point, event) : selection2.interrupt().each(function() {
      gesture(this, arguments).event(event).start().zoom(null, typeof transform2 == "function" ? transform2.apply(this, arguments) : transform2).end();
    });
  }, zoom3.scaleBy = function(selection2, k, p, event) {
    zoom3.scaleTo(selection2, function() {
      var k0 = this.__zoom.k, k1 = typeof k == "function" ? k.apply(this, arguments) : k;
      return k0 * k1;
    }, p, event);
  }, zoom3.scaleTo = function(selection2, k, p, event) {
    zoom3.transform(selection2, function() {
      var e = extent.apply(this, arguments), t02 = this.__zoom, p0 = p == null ? centroid(e) : typeof p == "function" ? p.apply(this, arguments) : p, p1 = t02.invert(p0), k1 = typeof k == "function" ? k.apply(this, arguments) : k;
      return constrain(translate(scale(t02, k1), p0, p1), e, translateExtent);
    }, p, event);
  }, zoom3.translateBy = function(selection2, x, y, event) {
    zoom3.transform(selection2, function() {
      return constrain(this.__zoom.translate(
        typeof x == "function" ? x.apply(this, arguments) : x,
        typeof y == "function" ? y.apply(this, arguments) : y
      ), extent.apply(this, arguments), translateExtent);
    }, null, event);
  }, zoom3.translateTo = function(selection2, x, y, p, event) {
    zoom3.transform(selection2, function() {
      var e = extent.apply(this, arguments), t = this.__zoom, p0 = p == null ? centroid(e) : typeof p == "function" ? p.apply(this, arguments) : p;
      return constrain(identity2.translate(p0[0], p0[1]).scale(t.k).translate(
        typeof x == "function" ? -x.apply(this, arguments) : -x,
        typeof y == "function" ? -y.apply(this, arguments) : -y
      ), e, translateExtent);
    }, p, event);
  };
  function scale(transform2, k) {
    return k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], k)), k === transform2.k ? transform2 : new Transform(k, transform2.x, transform2.y);
  }
  function translate(transform2, p0, p1) {
    var x = p0[0] - p1[0] * transform2.k, y = p0[1] - p1[1] * transform2.k;
    return x === transform2.x && y === transform2.y ? transform2 : new Transform(transform2.k, x, y);
  }
  function centroid(extent2) {
    return [(+extent2[0][0] + +extent2[1][0]) / 2, (+extent2[0][1] + +extent2[1][1]) / 2];
  }
  function schedule2(transition2, transform2, point, event) {
    transition2.on("start.zoom", function() {
      gesture(this, arguments).event(event).start();
    }).on("interrupt.zoom end.zoom", function() {
      gesture(this, arguments).event(event).end();
    }).tween("zoom", function() {
      var that = this, args = arguments, g = gesture(that, args).event(event), e = extent.apply(that, args), p = point == null ? centroid(e) : typeof point == "function" ? point.apply(that, args) : point, w = Math.max(e[1][0] - e[0][0], e[1][1] - e[0][1]), a = that.__zoom, b = typeof transform2 == "function" ? transform2.apply(that, args) : transform2, i = interpolate2(a.invert(p).concat(w / a.k), b.invert(p).concat(w / b.k));
      return function(t) {
        if (t === 1) t = b;
        else {
          var l = i(t), k = w / l[2];
          t = new Transform(k, p[0] - l[0] * k, p[1] - l[1] * k);
        }
        g.zoom(null, t);
      };
    });
  }
  function gesture(that, args, clean) {
    return !clean && that.__zooming || new Gesture(that, args);
  }
  function Gesture(that, args) {
    this.that = that, this.args = args, this.active = 0, this.sourceEvent = null, this.extent = extent.apply(that, args), this.taps = 0;
  }
  Gesture.prototype = {
    event: function(event) {
      return event && (this.sourceEvent = event), this;
    },
    start: function() {
      return ++this.active === 1 && (this.that.__zooming = this, this.emit("start")), this;
    },
    zoom: function(key, transform2) {
      return this.mouse && key !== "mouse" && (this.mouse[1] = transform2.invert(this.mouse[0])), this.touch0 && key !== "touch" && (this.touch0[1] = transform2.invert(this.touch0[0])), this.touch1 && key !== "touch" && (this.touch1[1] = transform2.invert(this.touch1[0])), this.that.__zoom = transform2, this.emit("zoom"), this;
    },
    end: function() {
      return --this.active === 0 && (delete this.that.__zooming, this.emit("end")), this;
    },
    emit: function(type) {
      var d = select(this.that).datum();
      listeners.call(
        type,
        this.that,
        new ZoomEvent(type, {
          sourceEvent: this.sourceEvent,
          target: zoom3,
          transform: this.that.__zoom,
          dispatch: listeners
        }),
        d
      );
    }
  };
  function wheeled(event, ...args) {
    if (!filter2.apply(this, arguments)) return;
    var g = gesture(this, args).event(event), t = this.__zoom, k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], t.k * Math.pow(2, wheelDelta2.apply(this, arguments)))), p = pointer(event);
    if (g.wheel)
      (g.mouse[0][0] !== p[0] || g.mouse[0][1] !== p[1]) && (g.mouse[1] = t.invert(g.mouse[0] = p)), clearTimeout(g.wheel);
    else {
      if (t.k === k) return;
      g.mouse = [p, t.invert(p)], interrupt(this), g.start();
    }
    noevent2(event), g.wheel = setTimeout(wheelidled, wheelDelay), g.zoom("mouse", constrain(translate(scale(t, k), g.mouse[0], g.mouse[1]), g.extent, translateExtent));
    function wheelidled() {
      g.wheel = null, g.end();
    }
  }
  function mousedowned(event, ...args) {
    if (touchending || !filter2.apply(this, arguments)) return;
    var currentTarget = event.currentTarget, g = gesture(this, args, !0).event(event), v = select(event.view).on("mousemove.zoom", mousemoved, !0).on("mouseup.zoom", mouseupped, !0), p = pointer(event, currentTarget), x0 = event.clientX, y0 = event.clientY;
    nodrag(event.view), nopropagation2(event), g.mouse = [p, this.__zoom.invert(p)], interrupt(this), g.start();
    function mousemoved(event2) {
      if (noevent2(event2), !g.moved) {
        var dx = event2.clientX - x0, dy = event2.clientY - y0;
        g.moved = dx * dx + dy * dy > clickDistance2;
      }
      g.event(event2).zoom("mouse", constrain(translate(g.that.__zoom, g.mouse[0] = pointer(event2, currentTarget), g.mouse[1]), g.extent, translateExtent));
    }
    function mouseupped(event2) {
      v.on("mousemove.zoom mouseup.zoom", null), yesdrag(event2.view, g.moved), noevent2(event2), g.event(event2).end();
    }
  }
  function dblclicked(event, ...args) {
    if (filter2.apply(this, arguments)) {
      var t02 = this.__zoom, p0 = pointer(event.changedTouches ? event.changedTouches[0] : event, this), p1 = t02.invert(p0), k1 = t02.k * (event.shiftKey ? 0.5 : 2), t12 = constrain(translate(scale(t02, k1), p0, p1), extent.apply(this, args), translateExtent);
      noevent2(event), duration > 0 ? select(this).transition().duration(duration).call(schedule2, t12, p0, event) : select(this).call(zoom3.transform, t12, p0, event);
    }
  }
  function touchstarted(event, ...args) {
    if (filter2.apply(this, arguments)) {
      var touches = event.touches, n = touches.length, g = gesture(this, args, event.changedTouches.length === n).event(event), started, i, t, p;
      for (nopropagation2(event), i = 0; i < n; ++i)
        t = touches[i], p = pointer(t, this), p = [p, this.__zoom.invert(p), t.identifier], g.touch0 ? !g.touch1 && g.touch0[2] !== p[2] && (g.touch1 = p, g.taps = 0) : (g.touch0 = p, started = !0, g.taps = 1 + !!touchstarting);
      touchstarting && (touchstarting = clearTimeout(touchstarting)), started && (g.taps < 2 && (touchfirst = p[0], touchstarting = setTimeout(function() {
        touchstarting = null;
      }, touchDelay)), interrupt(this), g.start());
    }
  }
  function touchmoved(event, ...args) {
    if (this.__zooming) {
      var g = gesture(this, args).event(event), touches = event.changedTouches, n = touches.length, i, t, p, l;
      for (noevent2(event), i = 0; i < n; ++i)
        t = touches[i], p = pointer(t, this), g.touch0 && g.touch0[2] === t.identifier ? g.touch0[0] = p : g.touch1 && g.touch1[2] === t.identifier && (g.touch1[0] = p);
      if (t = g.that.__zoom, g.touch1) {
        var p0 = g.touch0[0], l0 = g.touch0[1], p1 = g.touch1[0], l1 = g.touch1[1], dp = (dp = p1[0] - p0[0]) * dp + (dp = p1[1] - p0[1]) * dp, dl = (dl = l1[0] - l0[0]) * dl + (dl = l1[1] - l0[1]) * dl;
        t = scale(t, Math.sqrt(dp / dl)), p = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], l = [(l0[0] + l1[0]) / 2, (l0[1] + l1[1]) / 2];
      } else if (g.touch0) p = g.touch0[0], l = g.touch0[1];
      else return;
      g.zoom("touch", constrain(translate(t, p, l), g.extent, translateExtent));
    }
  }
  function touchended(event, ...args) {
    if (this.__zooming) {
      var g = gesture(this, args).event(event), touches = event.changedTouches, n = touches.length, i, t;
      for (nopropagation2(event), touchending && clearTimeout(touchending), touchending = setTimeout(function() {
        touchending = null;
      }, touchDelay), i = 0; i < n; ++i)
        t = touches[i], g.touch0 && g.touch0[2] === t.identifier ? delete g.touch0 : g.touch1 && g.touch1[2] === t.identifier && delete g.touch1;
      if (g.touch1 && !g.touch0 && (g.touch0 = g.touch1, delete g.touch1), g.touch0) g.touch0[1] = this.__zoom.invert(g.touch0[0]);
      else if (g.end(), g.taps === 2 && (t = pointer(t, this), Math.hypot(touchfirst[0] - t[0], touchfirst[1] - t[1]) < tapDistance)) {
        var p = select(this).on("dblclick.zoom");
        p && p.apply(this, arguments);
      }
    }
  }
  return zoom3.wheelDelta = function(_) {
    return arguments.length ? (wheelDelta2 = typeof _ == "function" ? _ : constant4(+_), zoom3) : wheelDelta2;
  }, zoom3.filter = function(_) {
    return arguments.length ? (filter2 = typeof _ == "function" ? _ : constant4(!!_), zoom3) : filter2;
  }, zoom3.touchable = function(_) {
    return arguments.length ? (touchable = typeof _ == "function" ? _ : constant4(!!_), zoom3) : touchable;
  }, zoom3.extent = function(_) {
    return arguments.length ? (extent = typeof _ == "function" ? _ : constant4([[+_[0][0], +_[0][1]], [+_[1][0], +_[1][1]]]), zoom3) : extent;
  }, zoom3.scaleExtent = function(_) {
    return arguments.length ? (scaleExtent[0] = +_[0], scaleExtent[1] = +_[1], zoom3) : [scaleExtent[0], scaleExtent[1]];
  }, zoom3.translateExtent = function(_) {
    return arguments.length ? (translateExtent[0][0] = +_[0][0], translateExtent[1][0] = +_[1][0], translateExtent[0][1] = +_[0][1], translateExtent[1][1] = +_[1][1], zoom3) : [[translateExtent[0][0], translateExtent[0][1]], [translateExtent[1][0], translateExtent[1][1]]];
  }, zoom3.constrain = function(_) {
    return arguments.length ? (constrain = _, zoom3) : constrain;
  }, zoom3.duration = function(_) {
    return arguments.length ? (duration = +_, zoom3) : duration;
  }, zoom3.interpolate = function(_) {
    return arguments.length ? (interpolate2 = _, zoom3) : interpolate2;
  }, zoom3.on = function() {
    var value2 = listeners.on.apply(listeners, arguments);
    return value2 === listeners ? zoom3 : value2;
  }, zoom3.clickDistance = function(_) {
    return arguments.length ? (clickDistance2 = (_ = +_) * _, zoom3) : Math.sqrt(clickDistance2);
  }, zoom3.tapDistance = function(_) {
    return arguments.length ? (tapDistance = +_, zoom3) : tapDistance;
  }, zoom3;
}

// node_modules/@xyflow/system/dist/esm/index.js
var errorMessages = {
  error001: (lib = "react") => `Seems like you have not used ${lib === "svelte" ? "SvelteFlowProvider" : "ReactFlowProvider"} as an ancestor. Help: https://${lib}flow.dev/error#001`,
  error002: () => "It looks like you've created a new nodeTypes or edgeTypes object. If this wasn't on purpose please define the nodeTypes/edgeTypes outside of the component or memoize them.",
  error003: (nodeType) => `Node type "${nodeType}" not found. Using fallback type "default".`,
  error004: () => "The parent container needs a width and a height to render the graph.",
  error005: () => "Only child nodes can use a parent extent.",
  error006: () => "Can't create edge. An edge needs a source and a target.",
  error007: (id2) => `The old edge with id=${id2} does not exist.`,
  error009: (type) => `Marker type "${type}" doesn't exist.`,
  error008: (handleType, { id: id2, sourceHandle, targetHandle }) => `Couldn't create edge for ${handleType} handle id: "${handleType === "source" ? sourceHandle : targetHandle}", edge id: ${id2}.`,
  error010: () => "Handle: No node id found. Make sure to only use a Handle inside a custom Node.",
  error011: (edgeType) => `Edge type "${edgeType}" not found. Using fallback type "default".`,
  error012: (id2) => `Node with id "${id2}" does not exist, it may have been removed. This can happen when a node is deleted before the "onNodeClick" handler is called.`,
  error013: (lib = "react") => `It seems that you haven't loaded the styles. Please import '@xyflow/${lib}/dist/style.css' or base.css to make sure everything is working properly.`,
  error014: () => "useNodeConnections: No node ID found. Call useNodeConnections inside a custom Node or provide a node ID.",
  error015: () => "It seems that you are trying to drag a node that is not initialized. Please use onNodesChange as explained in the docs.",
  error016: (id2) => `Edge with id "${id2}" does not exist, it may have been removed. This can happen when an edge is deleted before the "onEdgeClick" handler is called.`
}, infiniteExtent = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
], elementSelectionKeys = ["Enter", " ", "Escape"], defaultAriaLabelConfig = {
  "node.a11yDescription.default": "Press enter or space to select a node. Press delete to remove it and escape to cancel.",
  "node.a11yDescription.keyboardDisabled": "Press enter or space to select a node. You can then use the arrow keys to move the node around. Press delete to remove it and escape to cancel.",
  "node.a11yDescription.ariaLiveMessage": ({ direction, x, y }) => `Moved selected node ${direction}. New position, x: ${x}, y: ${y}`,
  "edge.a11yDescription.default": "Press enter or space to select an edge. You can then press delete to remove it or escape to cancel.",
  // Control elements
  "controls.ariaLabel": "Control Panel",
  "controls.zoomIn.ariaLabel": "Zoom In",
  "controls.zoomOut.ariaLabel": "Zoom Out",
  "controls.fitView.ariaLabel": "Fit View",
  "controls.interactive.ariaLabel": "Toggle Interactivity",
  // Mini map
  "minimap.ariaLabel": "Mini Map",
  // Handle
  "handle.ariaLabel": "Handle"
}, ConnectionMode;
(function(ConnectionMode2) {
  ConnectionMode2.Strict = "strict", ConnectionMode2.Loose = "loose";
})(ConnectionMode || (ConnectionMode = {}));
var PanOnScrollMode;
(function(PanOnScrollMode2) {
  PanOnScrollMode2.Free = "free", PanOnScrollMode2.Vertical = "vertical", PanOnScrollMode2.Horizontal = "horizontal";
})(PanOnScrollMode || (PanOnScrollMode = {}));
var SelectionMode;
(function(SelectionMode2) {
  SelectionMode2.Partial = "partial", SelectionMode2.Full = "full";
})(SelectionMode || (SelectionMode = {}));
var initialConnection = {
  inProgress: !1,
  isValid: null,
  from: null,
  fromHandle: null,
  fromPosition: null,
  fromNode: null,
  to: null,
  toHandle: null,
  toPosition: null,
  toNode: null,
  pointer: null
}, ConnectionLineType;
(function(ConnectionLineType2) {
  ConnectionLineType2.Bezier = "default", ConnectionLineType2.Straight = "straight", ConnectionLineType2.Step = "step", ConnectionLineType2.SmoothStep = "smoothstep", ConnectionLineType2.SimpleBezier = "simplebezier";
})(ConnectionLineType || (ConnectionLineType = {}));
var MarkerType;
(function(MarkerType2) {
  MarkerType2.Arrow = "arrow", MarkerType2.ArrowClosed = "arrowclosed";
})(MarkerType || (MarkerType = {}));
var Position;
(function(Position2) {
  Position2.Left = "left", Position2.Top = "top", Position2.Right = "right", Position2.Bottom = "bottom";
})(Position || (Position = {}));
var oppositePosition = {
  [Position.Left]: Position.Right,
  [Position.Right]: Position.Left,
  [Position.Top]: Position.Bottom,
  [Position.Bottom]: Position.Top
}, isEdgeBase = (element) => !!element && typeof element == "object" && "id" in element && "source" in element && "target" in element, isNodeBase = (element) => !!element && typeof element == "object" && "id" in element && "position" in element && !("source" in element) && !("target" in element), isInternalNodeBase = (element) => !!element && typeof element == "object" && "id" in element && "internals" in element && !("source" in element) && !("target" in element);
var getNodePositionWithOrigin = (node, nodeOrigin = [0, 0]) => {
  let { width, height } = getNodeDimensions(node), origin = node.origin ?? nodeOrigin, offsetX = width * origin[0], offsetY = height * origin[1];
  return {
    x: node.position.x - offsetX,
    y: node.position.y - offsetY
  };
}, getNodesBounds = (nodes, params = { nodeOrigin: [0, 0] }) => {
  if (nodes.length === 0)
    return { x: 0, y: 0, width: 0, height: 0 };
  let hasNode = !1, box = nodes.reduce((currBox, nodeOrId) => {
    let isId = typeof nodeOrId == "string", currentNode = !params.nodeLookup && !isId ? nodeOrId : void 0;
    return params.nodeLookup && (currentNode = isId ? params.nodeLookup.get(nodeOrId) : isInternalNodeBase(nodeOrId) ? nodeOrId : params.nodeLookup.get(nodeOrId.id)), currentNode ? (hasNode = !0, getBoundsOfBoxes(currBox, nodeToBox(currentNode, params.nodeOrigin))) : currBox;
  }, { x: 1 / 0, y: 1 / 0, x2: -1 / 0, y2: -1 / 0 });
  return hasNode ? boxToRect(box) : { x: 0, y: 0, width: 0, height: 0 };
}, getInternalNodesBounds = (nodeLookup, params = {}) => {
  let box = { x: 1 / 0, y: 1 / 0, x2: -1 / 0, y2: -1 / 0 }, hasVisibleNodes = !1;
  return nodeLookup.forEach((node) => {
    (params.filter === void 0 || params.filter(node)) && (box = getBoundsOfBoxes(box, nodeToBox(node)), hasVisibleNodes = !0);
  }), hasVisibleNodes ? boxToRect(box) : { x: 0, y: 0, width: 0, height: 0 };
}, getNodesInside = (nodes, rect, [tx, ty, tScale] = [0, 0, 1], partially = !1, excludeNonSelectableNodes = !1) => {
  let paneX = (rect.x - tx) / tScale, paneY = (rect.y - ty) / tScale, paneWidth = rect.width / tScale, paneHeight = rect.height / tScale, visibleNodes = [];
  for (let node of nodes.values()) {
    let { measured, selectable = !0, hidden = !1 } = node;
    if (excludeNonSelectableNodes && !selectable || hidden)
      continue;
    let width = measured.width ?? node.width ?? node.initialWidth ?? 0, height = measured.height ?? node.height ?? node.initialHeight ?? 0, { x, y } = node.internals.positionAbsolute, overlappingArea = getRectsOverlappingArea(paneX, paneY, paneWidth, paneHeight, x, y, width, height), area = width * height, partiallyVisible = partially && overlappingArea > 0;
    (!node.internals.handleBounds || partiallyVisible || overlappingArea >= area || node.dragging) && visibleNodes.push(node);
  }
  return visibleNodes;
}, getConnectedEdges = (nodes, edges) => {
  let nodeIds = /* @__PURE__ */ new Set();
  return nodes.forEach((node) => {
    nodeIds.add(node.id);
  }), edges.filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target));
};
function getFitViewNodes(nodeLookup, options) {
  let fitViewNodes = /* @__PURE__ */ new Map(), optionNodeIds = options?.nodes ? new Set(options.nodes.map((node) => node.id)) : null;
  return nodeLookup.forEach((n) => {
    let isVisible;
    if (options?.includeHiddenNodes) {
      let { width, height } = getNodeDimensions(n);
      isVisible = width > 0 && height > 0;
    } else
      isVisible = !!(n.measured.width && n.measured.height && !n.hidden);
    isVisible && (!optionNodeIds || optionNodeIds.has(n.id)) && fitViewNodes.set(n.id, n);
  }), fitViewNodes;
}
async function fitViewport({ nodes, width, height, panZoom, minZoom, maxZoom }, options) {
  if (nodes.size === 0)
    return !0;
  let nodesToFit = getFitViewNodes(nodes, options), bounds = getInternalNodesBounds(nodesToFit), viewport = getViewportForBounds(bounds, width, height, options?.minZoom ?? minZoom, options?.maxZoom ?? maxZoom, options?.padding ?? 0.1);
  return await panZoom.setViewport(viewport, {
    duration: options?.duration,
    ease: options?.ease,
    interpolate: options?.interpolate
  }), !0;
}
function calculateNodePosition({ nodeId, nextPosition, nodeLookup, nodeOrigin = [0, 0], nodeExtent, onError }) {
  let node = nodeLookup.get(nodeId), parentNode = node.parentId ? nodeLookup.get(node.parentId) : void 0, { x: parentX, y: parentY } = parentNode ? parentNode.internals.positionAbsolute : { x: 0, y: 0 }, origin = node.origin ?? nodeOrigin, extent = node.extent || nodeExtent;
  if (node.extent === "parent" && !node.expandParent)
    if (!parentNode)
      onError?.("005", errorMessages.error005());
    else {
      let { width: parentWidth, height: parentHeight } = getNodeDimensions(parentNode);
      parentWidth && parentHeight && (extent = [
        [parentX, parentY],
        [parentX + parentWidth, parentY + parentHeight]
      ]);
    }
  else parentNode && isCoordinateExtent(node.extent) && (extent = [
    [node.extent[0][0] + parentX, node.extent[0][1] + parentY],
    [node.extent[1][0] + parentX, node.extent[1][1] + parentY]
  ]);
  let positionAbsolute = isCoordinateExtent(extent) ? clampPosition(nextPosition, extent, node.measured) : nextPosition;
  return (node.measured.width === void 0 || node.measured.height === void 0) && onError?.("015", errorMessages.error015()), {
    position: {
      x: positionAbsolute.x - parentX + (node.measured.width ?? 0) * origin[0],
      y: positionAbsolute.y - parentY + (node.measured.height ?? 0) * origin[1]
    },
    positionAbsolute
  };
}
async function getElementsToRemove({ nodesToRemove = [], edgesToRemove = [], nodes, edges, onBeforeDelete }) {
  let nodeIds = new Set(nodesToRemove.map((node) => node.id)), matchingNodes = [];
  for (let node of nodes) {
    if (node.deletable === !1)
      continue;
    let isIncluded = nodeIds.has(node.id), parentHit = !isIncluded && node.parentId && matchingNodes.find((n) => n.id === node.parentId);
    (isIncluded || parentHit) && matchingNodes.push(node);
  }
  let edgeIds = new Set(edgesToRemove.map((edge) => edge.id)), deletableEdges = edges.filter((edge) => edge.deletable !== !1), matchingEdges = getConnectedEdges(matchingNodes, deletableEdges);
  for (let edge of deletableEdges)
    edgeIds.has(edge.id) && !matchingEdges.find((e) => e.id === edge.id) && matchingEdges.push(edge);
  if (!onBeforeDelete)
    return {
      edges: matchingEdges,
      nodes: matchingNodes
    };
  let onBeforeDeleteResult = await onBeforeDelete({
    nodes: matchingNodes,
    edges: matchingEdges
  });
  return typeof onBeforeDeleteResult == "boolean" ? onBeforeDeleteResult ? { edges: matchingEdges, nodes: matchingNodes } : { edges: [], nodes: [] } : onBeforeDeleteResult;
}
var clamp = (val, min = 0, max = 1) => Math.min(Math.max(val, min), max), clampPosition = (position = { x: 0, y: 0 }, extent, dimensions) => ({
  x: clamp(position.x, extent[0][0], extent[1][0] - (dimensions?.width ?? 0)),
  y: clamp(position.y, extent[0][1], extent[1][1] - (dimensions?.height ?? 0))
});
function clampPositionToParent(childPosition, childDimensions, parent) {
  let { width: parentWidth, height: parentHeight } = getNodeDimensions(parent), { x: parentX, y: parentY } = parent.internals.positionAbsolute;
  return clampPosition(childPosition, [
    [parentX, parentY],
    [parentX + parentWidth, parentY + parentHeight]
  ], childDimensions);
}
var calcAutoPanVelocity = (value2, min, max) => value2 < min ? clamp(Math.abs(value2 - min), 1, min) / min : value2 > max ? -clamp(Math.abs(value2 - max), 1, min) / min : 0, calcAutoPan = (pos, bounds, speed = 15, distance2 = 40) => {
  let xMovement = calcAutoPanVelocity(pos.x, distance2, bounds.width - distance2) * speed, yMovement = calcAutoPanVelocity(pos.y, distance2, bounds.height - distance2) * speed;
  return [xMovement, yMovement];
}, getBoundsOfBoxes = (box1, box2) => ({
  x: Math.min(box1.x, box2.x),
  y: Math.min(box1.y, box2.y),
  x2: Math.max(box1.x2, box2.x2),
  y2: Math.max(box1.y2, box2.y2)
}), rectToBox = ({ x, y, width, height }) => ({
  x,
  y,
  x2: x + width,
  y2: y + height
}), boxToRect = ({ x, y, x2, y2 }) => ({
  x,
  y,
  width: x2 - x,
  height: y2 - y
}), nodeToRect = (node, nodeOrigin = [0, 0]) => {
  let { x, y } = isInternalNodeBase(node) ? node.internals.positionAbsolute : getNodePositionWithOrigin(node, nodeOrigin);
  return {
    x,
    y,
    width: node.measured?.width ?? node.width ?? node.initialWidth ?? 0,
    height: node.measured?.height ?? node.height ?? node.initialHeight ?? 0
  };
}, nodeToBox = (node, nodeOrigin = [0, 0]) => {
  let { x, y } = isInternalNodeBase(node) ? node.internals.positionAbsolute : getNodePositionWithOrigin(node, nodeOrigin);
  return {
    x,
    y,
    x2: x + (node.measured?.width ?? node.width ?? node.initialWidth ?? 0),
    y2: y + (node.measured?.height ?? node.height ?? node.initialHeight ?? 0)
  };
}, getBoundsOfRects = (rect1, rect2) => boxToRect(getBoundsOfBoxes(rectToBox(rect1), rectToBox(rect2))), getRectsOverlappingArea = (aX, aY, aWidth, aHeight, bX, bY, bWidth, bHeight) => {
  let xOverlap = Math.max(0, Math.min(aX + aWidth, bX + bWidth) - Math.max(aX, bX)), yOverlap = Math.max(0, Math.min(aY + aHeight, bY + bHeight) - Math.max(aY, bY));
  return Math.ceil(xOverlap * yOverlap);
}, getOverlappingArea = (rectA, rectB) => getRectsOverlappingArea(rectA.x, rectA.y, rectA.width, rectA.height, rectB.x, rectB.y, rectB.width, rectB.height), isRectObject = (obj) => isNumeric(obj.width) && isNumeric(obj.height) && isNumeric(obj.x) && isNumeric(obj.y), isNumeric = (n) => !isNaN(n) && isFinite(n), createDevWarn = (lib, helpUrl) => (id2, message) => {
}, snapPosition = (position, snapGrid = [1, 1]) => ({
  x: snapGrid[0] * Math.round(position.x / snapGrid[0]),
  y: snapGrid[1] * Math.round(position.y / snapGrid[1])
}), pointToRendererPoint = ({ x, y }, [tx, ty, tScale], snapToGrid = !1, snapGrid = [1, 1]) => {
  let position = {
    x: (x - tx) / tScale,
    y: (y - ty) / tScale
  };
  return snapToGrid ? snapPosition(position, snapGrid) : position;
}, rendererPointToPoint = ({ x, y }, [tx, ty, tScale]) => ({
  x: x * tScale + tx,
  y: y * tScale + ty
});
function parsePadding(padding, viewport) {
  if (typeof padding == "number")
    return Math.floor((viewport - viewport / (1 + padding)) * 0.5);
  if (typeof padding == "string" && padding.endsWith("px")) {
    let paddingValue = parseFloat(padding);
    if (!Number.isNaN(paddingValue))
      return Math.floor(paddingValue);
  }
  if (typeof padding == "string" && padding.endsWith("%")) {
    let paddingValue = parseFloat(padding);
    if (!Number.isNaN(paddingValue))
      return Math.floor(viewport * paddingValue * 0.01);
  }
  return console.error(`The padding value "${padding}" is invalid. Please provide a number or a string with a valid unit (px or %).`), 0;
}
function parsePaddings(padding, width, height) {
  if (typeof padding == "string" || typeof padding == "number") {
    let paddingY = parsePadding(padding, height), paddingX = parsePadding(padding, width);
    return {
      top: paddingY,
      right: paddingX,
      bottom: paddingY,
      left: paddingX,
      x: paddingX * 2,
      y: paddingY * 2
    };
  }
  if (typeof padding == "object") {
    let top = parsePadding(padding.top ?? padding.y ?? 0, height), bottom = parsePadding(padding.bottom ?? padding.y ?? 0, height), left = parsePadding(padding.left ?? padding.x ?? 0, width), right = parsePadding(padding.right ?? padding.x ?? 0, width);
    return { top, right, bottom, left, x: left + right, y: top + bottom };
  }
  return { top: 0, right: 0, bottom: 0, left: 0, x: 0, y: 0 };
}
function calculateAppliedPaddings(bounds, x, y, zoom3, width, height) {
  let { x: left, y: top } = rendererPointToPoint(bounds, [x, y, zoom3]), { x: boundRight, y: boundBottom } = rendererPointToPoint({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, [x, y, zoom3]), right = width - boundRight, bottom = height - boundBottom;
  return {
    left: Math.floor(left),
    top: Math.floor(top),
    right: Math.floor(right),
    bottom: Math.floor(bottom)
  };
}
var getViewportForBounds = (bounds, width, height, minZoom, maxZoom, padding) => {
  let p = parsePaddings(padding, width, height), xZoom = (width - p.x) / bounds.width, yZoom = (height - p.y) / bounds.height, zoom3 = Math.min(xZoom, yZoom), clampedZoom = clamp(zoom3, minZoom, maxZoom), boundsCenterX = bounds.x + bounds.width / 2, boundsCenterY = bounds.y + bounds.height / 2, x = width / 2 - boundsCenterX * clampedZoom, y = height / 2 - boundsCenterY * clampedZoom, newPadding = calculateAppliedPaddings(bounds, x, y, clampedZoom, width, height), offset = {
    left: Math.min(newPadding.left - p.left, 0),
    top: Math.min(newPadding.top - p.top, 0),
    right: Math.min(newPadding.right - p.right, 0),
    bottom: Math.min(newPadding.bottom - p.bottom, 0)
  };
  return {
    x: x - offset.left + offset.right,
    y: y - offset.top + offset.bottom,
    zoom: clampedZoom
  };
}, isMacOs = () => typeof navigator < "u" && navigator?.userAgent?.indexOf("Mac") >= 0;
function isCoordinateExtent(extent) {
  return extent != null && extent !== "parent";
}
function getNodeDimensions(node) {
  return {
    width: node.measured?.width ?? node.width ?? node.initialWidth ?? 0,
    height: node.measured?.height ?? node.height ?? node.initialHeight ?? 0
  };
}
function nodeHasDimensions(node) {
  return (node.measured?.width ?? node.width ?? node.initialWidth) !== void 0 && (node.measured?.height ?? node.height ?? node.initialHeight) !== void 0;
}
function evaluateAbsolutePosition(position, dimensions = { width: 0, height: 0 }, parentId, nodeLookup, nodeOrigin) {
  let positionAbsolute = { ...position }, parent = nodeLookup.get(parentId);
  if (parent) {
    let origin = parent.origin || nodeOrigin;
    positionAbsolute.x += parent.internals.positionAbsolute.x - (dimensions.width ?? 0) * origin[0], positionAbsolute.y += parent.internals.positionAbsolute.y - (dimensions.height ?? 0) * origin[1];
  }
  return positionAbsolute;
}
function areSetsEqual(a, b) {
  if (a.size !== b.size)
    return !1;
  for (let item of a)
    if (!b.has(item))
      return !1;
  return !0;
}
function withResolvers() {
  let resolve, reject;
  return { promise: new Promise((res, rej) => {
    resolve = res, reject = rej;
  }), resolve, reject };
}
function mergeAriaLabelConfig(partial) {
  return { ...defaultAriaLabelConfig, ...partial || {} };
}
function getConnectionStatus(isValid) {
  return isValid === null ? null : isValid ? "valid" : "invalid";
}
function getPointerPosition(event, { snapGrid = [0, 0], snapToGrid = !1, transform: transform2, containerBounds }) {
  let { x, y } = getEventPosition(event), pointerPos = pointToRendererPoint({ x: x - (containerBounds?.left ?? 0), y: y - (containerBounds?.top ?? 0) }, transform2), { x: xSnapped, y: ySnapped } = snapToGrid ? snapPosition(pointerPos, snapGrid) : pointerPos;
  return {
    xSnapped,
    ySnapped,
    ...pointerPos
  };
}
var getDimensions = (node) => ({
  width: node.offsetWidth,
  height: node.offsetHeight
}), getHostForElement = (element) => element?.getRootNode?.() || window?.document, inputTags = ["INPUT", "SELECT", "TEXTAREA"];
function isInputDOMNode(event) {
  let target = event.composedPath?.()?.[0] || event.target;
  return target?.nodeType !== 1 ? !1 : inputTags.includes(target.nodeName) || target.hasAttribute("contenteditable") || !!target.closest(".nokey");
}
var isMouseEvent = (event) => "clientX" in event, getEventPosition = (event, bounds) => {
  let isMouse = isMouseEvent(event), evtX = isMouse ? event.clientX : event.touches?.[0].clientX, evtY = isMouse ? event.clientY : event.touches?.[0].clientY;
  return {
    x: evtX - (bounds?.left ?? 0),
    y: evtY - (bounds?.top ?? 0)
  };
}, getHandleBounds = (type, nodeElement, nodeBounds, zoom3, nodeId) => {
  let handles = nodeElement.querySelectorAll(`.${type}`);
  return !handles || !handles.length ? null : Array.from(handles).map((handle) => {
    let handleBounds = handle.getBoundingClientRect();
    return {
      id: handle.getAttribute("data-handleid"),
      type,
      nodeId,
      position: handle.getAttribute("data-handlepos"),
      x: (handleBounds.left - nodeBounds.left) / zoom3,
      y: (handleBounds.top - nodeBounds.top) / zoom3,
      ...getDimensions(handle)
    };
  });
};
function getBezierEdgeCenter({ sourceX, sourceY, targetX, targetY, sourceControlX, sourceControlY, targetControlX, targetControlY }) {
  let centerX = sourceX * 0.125 + sourceControlX * 0.375 + targetControlX * 0.375 + targetX * 0.125, centerY = sourceY * 0.125 + sourceControlY * 0.375 + targetControlY * 0.375 + targetY * 0.125, offsetX = Math.abs(centerX - sourceX), offsetY = Math.abs(centerY - sourceY);
  return [centerX, centerY, offsetX, offsetY];
}
function calculateControlOffset(distance2, curvature) {
  return distance2 >= 0 ? 0.5 * distance2 : curvature * 25 * Math.sqrt(-distance2);
}
function getControlWithCurvature({ pos, x1, y1, x2, y2, c }) {
  switch (pos) {
    case Position.Left:
      return [x1 - calculateControlOffset(x1 - x2, c), y1];
    case Position.Right:
      return [x1 + calculateControlOffset(x2 - x1, c), y1];
    case Position.Top:
      return [x1, y1 - calculateControlOffset(y1 - y2, c)];
    case Position.Bottom:
      return [x1, y1 + calculateControlOffset(y2 - y1, c)];
  }
}
function getBezierPath({ sourceX, sourceY, sourcePosition = Position.Bottom, targetX, targetY, targetPosition = Position.Top, curvature = 0.25 }) {
  let [sourceControlX, sourceControlY] = getControlWithCurvature({
    pos: sourcePosition,
    x1: sourceX,
    y1: sourceY,
    x2: targetX,
    y2: targetY,
    c: curvature
  }), [targetControlX, targetControlY] = getControlWithCurvature({
    pos: targetPosition,
    x1: targetX,
    y1: targetY,
    x2: sourceX,
    y2: sourceY,
    c: curvature
  }), [labelX, labelY, offsetX, offsetY] = getBezierEdgeCenter({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceControlX,
    sourceControlY,
    targetControlX,
    targetControlY
  });
  return [
    `M${sourceX},${sourceY} C${sourceControlX},${sourceControlY} ${targetControlX},${targetControlY} ${targetX},${targetY}`,
    labelX,
    labelY,
    offsetX,
    offsetY
  ];
}
function getEdgeCenter({ sourceX, sourceY, targetX, targetY }) {
  let xOffset = Math.abs(targetX - sourceX) / 2, centerX = targetX < sourceX ? targetX + xOffset : targetX - xOffset, yOffset = Math.abs(targetY - sourceY) / 2, centerY = targetY < sourceY ? targetY + yOffset : targetY - yOffset;
  return [centerX, centerY, xOffset, yOffset];
}
function getElevatedEdgeZIndex({ sourceNode, targetNode, selected: selected2 = !1, zIndex = 0, elevateOnSelect = !1, zIndexMode = "basic" }) {
  if (zIndexMode === "manual")
    return zIndex;
  let edgeZ = elevateOnSelect && selected2 ? zIndex + 1e3 : zIndex, nodeZ = Math.max(sourceNode.parentId || elevateOnSelect && sourceNode.selected ? sourceNode.internals.z : 0, targetNode.parentId || elevateOnSelect && targetNode.selected ? targetNode.internals.z : 0);
  return edgeZ + nodeZ;
}
function isEdgeVisible({ sourceNode, targetNode, width, height, transform: transform2 }) {
  let edgeBox = getBoundsOfBoxes(nodeToBox(sourceNode), nodeToBox(targetNode));
  edgeBox.x === edgeBox.x2 && (edgeBox.x2 += 1), edgeBox.y === edgeBox.y2 && (edgeBox.y2 += 1);
  let viewRect = {
    x: -transform2[0] / transform2[2],
    y: -transform2[1] / transform2[2],
    width: width / transform2[2],
    height: height / transform2[2]
  };
  return getOverlappingArea(viewRect, boxToRect(edgeBox)) > 0;
}
var getEdgeId = ({ source, sourceHandle, target, targetHandle }) => `xy-edge__${source}${sourceHandle || ""}-${target}${targetHandle || ""}`, connectionExists = (edge, edges) => edges.some((el) => el.source === edge.source && el.target === edge.target && (el.sourceHandle === edge.sourceHandle || !el.sourceHandle && !edge.sourceHandle) && (el.targetHandle === edge.targetHandle || !el.targetHandle && !edge.targetHandle)), addEdge = (edgeParams, edges, options = {}) => {
  if (!edgeParams.source || !edgeParams.target)
    return options.onError?.("006", errorMessages.error006()), edges;
  let edgeIdGenerator = options.getEdgeId || getEdgeId, edge;
  return isEdgeBase(edgeParams) ? edge = { ...edgeParams } : edge = {
    ...edgeParams,
    id: edgeIdGenerator(edgeParams)
  }, connectionExists(edge, edges) ? edges : (edge.sourceHandle === null && delete edge.sourceHandle, edge.targetHandle === null && delete edge.targetHandle, edges.concat(edge));
};
function getStraightPath({ sourceX, sourceY, targetX, targetY }) {
  let [labelX, labelY, offsetX, offsetY] = getEdgeCenter({
    sourceX,
    sourceY,
    targetX,
    targetY
  });
  return [`M ${sourceX},${sourceY}L ${targetX},${targetY}`, labelX, labelY, offsetX, offsetY];
}
var handleDirections = {
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 }
}, getDirection = ({ source, sourcePosition = Position.Bottom, target }) => sourcePosition === Position.Left || sourcePosition === Position.Right ? source.x < target.x ? { x: 1, y: 0 } : { x: -1, y: 0 } : source.y < target.y ? { x: 0, y: 1 } : { x: 0, y: -1 }, distance = (a, b) => Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2)), isBetween = (a, b, c) => a.x === b.x && b.x === c.x && (b.y - a.y) * (c.y - b.y) >= 0 || a.y === b.y && b.y === c.y && (b.x - a.x) * (c.x - b.x) >= 0;
function getPoints({ source, sourcePosition = Position.Bottom, target, targetPosition = Position.Top, center, offset, stepPosition }) {
  let sourceDir = handleDirections[sourcePosition], targetDir = handleDirections[targetPosition], sourceGapped = { x: source.x + sourceDir.x * offset, y: source.y + sourceDir.y * offset }, targetGapped = { x: target.x + targetDir.x * offset, y: target.y + targetDir.y * offset }, dir = getDirection({
    source: sourceGapped,
    sourcePosition,
    target: targetGapped
  }), dirAccessor = dir.x !== 0 ? "x" : "y", currDir = dir[dirAccessor], points = [], centerX, centerY, sourceGapOffset = { x: 0, y: 0 }, targetGapOffset = { x: 0, y: 0 }, [, , defaultOffsetX, defaultOffsetY] = getEdgeCenter({
    sourceX: source.x,
    sourceY: source.y,
    targetX: target.x,
    targetY: target.y
  });
  if (sourceDir[dirAccessor] * targetDir[dirAccessor] === -1) {
    dirAccessor === "x" ? (centerX = center.x ?? sourceGapped.x + (targetGapped.x - sourceGapped.x) * stepPosition, centerY = center.y ?? (sourceGapped.y + targetGapped.y) / 2) : (centerX = center.x ?? (sourceGapped.x + targetGapped.x) / 2, centerY = center.y ?? sourceGapped.y + (targetGapped.y - sourceGapped.y) * stepPosition);
    let verticalSplit = [
      { x: centerX, y: sourceGapped.y },
      { x: centerX, y: targetGapped.y }
    ], horizontalSplit = [
      { x: sourceGapped.x, y: centerY },
      { x: targetGapped.x, y: centerY }
    ];
    sourceDir[dirAccessor] === currDir ? points = dirAccessor === "x" ? verticalSplit : horizontalSplit : points = dirAccessor === "x" ? horizontalSplit : verticalSplit;
  } else {
    let sourceTarget = [{ x: sourceGapped.x, y: targetGapped.y }], targetSource = [{ x: targetGapped.x, y: sourceGapped.y }];
    if (dirAccessor === "x" ? points = sourceDir.x === currDir ? targetSource : sourceTarget : points = sourceDir.y === currDir ? sourceTarget : targetSource, sourcePosition === targetPosition) {
      let diff = Math.abs(source[dirAccessor] - target[dirAccessor]);
      if (diff <= offset) {
        let gapOffset = Math.min(offset - 1, offset - diff);
        sourceDir[dirAccessor] === currDir ? sourceGapOffset[dirAccessor] = (sourceGapped[dirAccessor] > source[dirAccessor] ? -1 : 1) * gapOffset : targetGapOffset[dirAccessor] = (targetGapped[dirAccessor] > target[dirAccessor] ? -1 : 1) * gapOffset;
      }
    }
    if (sourcePosition !== targetPosition) {
      let dirAccessorOpposite = dirAccessor === "x" ? "y" : "x", isSameDir = sourceDir[dirAccessor] === targetDir[dirAccessorOpposite], sourceGtTargetOppo = sourceGapped[dirAccessorOpposite] > targetGapped[dirAccessorOpposite], sourceLtTargetOppo = sourceGapped[dirAccessorOpposite] < targetGapped[dirAccessorOpposite];
      (sourceDir[dirAccessor] === 1 && (!isSameDir && sourceGtTargetOppo || isSameDir && sourceLtTargetOppo) || sourceDir[dirAccessor] !== 1 && (!isSameDir && sourceLtTargetOppo || isSameDir && sourceGtTargetOppo)) && (points = dirAccessor === "x" ? sourceTarget : targetSource);
    }
    let sourceGapPoint = { x: sourceGapped.x + sourceGapOffset.x, y: sourceGapped.y + sourceGapOffset.y }, targetGapPoint = { x: targetGapped.x + targetGapOffset.x, y: targetGapped.y + targetGapOffset.y }, maxXDistance = Math.max(Math.abs(sourceGapPoint.x - points[0].x), Math.abs(targetGapPoint.x - points[0].x)), maxYDistance = Math.max(Math.abs(sourceGapPoint.y - points[0].y), Math.abs(targetGapPoint.y - points[0].y));
    maxXDistance >= maxYDistance ? (centerX = (sourceGapPoint.x + targetGapPoint.x) / 2, centerY = points[0].y) : (centerX = points[0].x, centerY = (sourceGapPoint.y + targetGapPoint.y) / 2);
  }
  let gappedSource = { x: sourceGapped.x + sourceGapOffset.x, y: sourceGapped.y + sourceGapOffset.y }, gappedTarget = { x: targetGapped.x + targetGapOffset.x, y: targetGapped.y + targetGapOffset.y }, pathPoints = [];
  for (let point of [source, gappedSource, ...points, gappedTarget, target]) {
    let [a, b] = pathPoints.slice(-2);
    b && isBetween(a, b, point) && pathPoints.pop(), pathPoints.push(point);
  }
  return [pathPoints, centerX, centerY, defaultOffsetX, defaultOffsetY];
}
function getBend(a, b, c, size) {
  let bendSize = Math.min(distance(a, b) / 2, distance(b, c) / 2, size), { x, y } = b;
  if (a.x === x && x === c.x || a.y === y && y === c.y)
    return `L${x} ${y}`;
  if (a.y === y) {
    let xDir2 = a.x < c.x ? -1 : 1, yDir2 = a.y < c.y ? 1 : -1;
    return `L ${x + bendSize * xDir2},${y}Q ${x},${y} ${x},${y + bendSize * yDir2}`;
  }
  let xDir = a.x < c.x ? 1 : -1, yDir = a.y < c.y ? -1 : 1;
  return `L ${x},${y + bendSize * yDir}Q ${x},${y} ${x + bendSize * xDir},${y}`;
}
function getSmoothStepPath({ sourceX, sourceY, sourcePosition = Position.Bottom, targetX, targetY, targetPosition = Position.Top, borderRadius = 5, centerX, centerY, offset = 20, stepPosition = 0.5 }) {
  let [points, labelX, labelY, offsetX, offsetY] = getPoints({
    source: { x: sourceX, y: sourceY },
    sourcePosition,
    target: { x: targetX, y: targetY },
    targetPosition,
    center: { x: centerX, y: centerY },
    offset,
    stepPosition
  }), path = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++)
    path += getBend(points[i - 1], points[i], points[i + 1], borderRadius);
  return path += `L${points[points.length - 1].x} ${points[points.length - 1].y}`, [path, labelX, labelY, offsetX, offsetY];
}
function isNodeInitialized(node) {
  return node && !!(node.internals.handleBounds || node.handles?.length) && !!(node.measured.width || node.width || node.initialWidth);
}
function getEdgePosition(params) {
  let { sourceNode, targetNode } = params;
  if (!isNodeInitialized(sourceNode) || !isNodeInitialized(targetNode))
    return null;
  let sourceHandleBounds = sourceNode.internals.handleBounds || toHandleBounds(sourceNode.handles), targetHandleBounds = targetNode.internals.handleBounds || toHandleBounds(targetNode.handles), sourceHandle = getHandle$1(sourceHandleBounds?.source ?? [], params.sourceHandle), targetHandle = getHandle$1(
    // when connection type is loose we can define all handles as sources and connect source -> source
    params.connectionMode === ConnectionMode.Strict ? targetHandleBounds?.target ?? [] : (targetHandleBounds?.target ?? []).concat(targetHandleBounds?.source ?? []),
    params.targetHandle
  );
  if (!sourceHandle || !targetHandle)
    return params.onError?.("008", errorMessages.error008(sourceHandle ? "target" : "source", {
      id: params.id,
      sourceHandle: params.sourceHandle,
      targetHandle: params.targetHandle
    })), null;
  let sourcePosition = sourceHandle?.position || Position.Bottom, targetPosition = targetHandle?.position || Position.Top, source = getHandlePosition(sourceNode, sourceHandle, sourcePosition), target = getHandlePosition(targetNode, targetHandle, targetPosition);
  return {
    sourceX: source.x,
    sourceY: source.y,
    targetX: target.x,
    targetY: target.y,
    sourcePosition,
    targetPosition
  };
}
function toHandleBounds(handles) {
  if (!handles)
    return null;
  let source = [], target = [];
  for (let handle of handles)
    handle.width = handle.width ?? 1, handle.height = handle.height ?? 1, handle.type === "source" ? source.push(handle) : handle.type === "target" && target.push(handle);
  return {
    source,
    target
  };
}
function getHandlePosition(node, handle, fallbackPosition = Position.Left, center = !1) {
  let x = (handle?.x ?? 0) + node.internals.positionAbsolute.x, y = (handle?.y ?? 0) + node.internals.positionAbsolute.y, { width, height } = handle ?? getNodeDimensions(node);
  if (center)
    return { x: x + width / 2, y: y + height / 2 };
  switch (handle?.position ?? fallbackPosition) {
    case Position.Top:
      return { x: x + width / 2, y };
    case Position.Right:
      return { x: x + width, y: y + height / 2 };
    case Position.Bottom:
      return { x: x + width / 2, y: y + height };
    case Position.Left:
      return { x, y: y + height / 2 };
  }
}
function getHandle$1(bounds, handleId) {
  return bounds && (handleId ? bounds.find((d) => d.id === handleId) : bounds[0]) || null;
}
function getMarkerId(marker, id2) {
  return marker ? typeof marker == "string" ? marker : `${id2 ? `${id2}__` : ""}${Object.keys(marker).sort().map((key) => `${key}=${marker[key]}`).join("&")}` : "";
}
function createMarkerIds(edges, { id: id2, defaultColor, defaultMarkerStart, defaultMarkerEnd }) {
  let ids = /* @__PURE__ */ new Set();
  return edges.reduce((markers, edge) => ([edge.markerStart || defaultMarkerStart, edge.markerEnd || defaultMarkerEnd].forEach((marker) => {
    if (marker && typeof marker == "object") {
      let markerId = getMarkerId(marker, id2);
      ids.has(markerId) || (markers.push({ id: markerId, color: marker.color || defaultColor, ...marker }), ids.add(markerId));
    }
  }), markers), []).sort((a, b) => a.id.localeCompare(b.id));
}
var SELECTED_NODE_Z = 1e3, ROOT_PARENT_Z_INCREMENT = 10, defaultOptions = {
  nodeOrigin: [0, 0],
  nodeExtent: infiniteExtent,
  elevateNodesOnSelect: !0,
  zIndexMode: "basic",
  defaults: {}
}, adoptUserNodesDefaultOptions = {
  ...defaultOptions,
  checkEquality: !0
};
function mergeObjects(base, incoming) {
  let result = { ...base };
  for (let key in incoming)
    incoming[key] !== void 0 && (result[key] = incoming[key]);
  return result;
}
function updateAbsolutePositions(nodeLookup, parentLookup, options) {
  let _options = mergeObjects(defaultOptions, options);
  for (let node of nodeLookup.values())
    if (node.parentId)
      updateChildNode(node, nodeLookup, parentLookup, _options);
    else {
      let positionWithOrigin = getNodePositionWithOrigin(node, _options.nodeOrigin), extent = isCoordinateExtent(node.extent) ? node.extent : _options.nodeExtent, clampedPosition = clampPosition(positionWithOrigin, extent, getNodeDimensions(node));
      node.internals.positionAbsolute = clampedPosition;
    }
}
function parseHandles(userNode, internalNode) {
  if (!userNode.handles)
    return userNode.measured ? internalNode?.internals.handleBounds : void 0;
  let source = [], target = [];
  for (let handle of userNode.handles) {
    let handleBounds = {
      id: handle.id,
      width: handle.width ?? 1,
      height: handle.height ?? 1,
      nodeId: userNode.id,
      x: handle.x,
      y: handle.y,
      position: handle.position,
      type: handle.type
    };
    handle.type === "source" ? source.push(handleBounds) : handle.type === "target" && target.push(handleBounds);
  }
  return {
    source,
    target
  };
}
function isManualZIndexMode(zIndexMode) {
  return zIndexMode === "manual";
}
function adoptUserNodes(nodes, nodeLookup, parentLookup, options = {}) {
  let _options = mergeObjects(adoptUserNodesDefaultOptions, options), rootParentIndex = { i: 0 }, tmpLookup = new Map(nodeLookup), selectedNodeZ = _options?.elevateNodesOnSelect && !isManualZIndexMode(_options.zIndexMode) ? SELECTED_NODE_Z : 0, nodesInitialized = nodes.length > 0, hasSelectedNodes = !1;
  nodeLookup.clear(), parentLookup.clear();
  for (let userNode of nodes) {
    let internalNode = tmpLookup.get(userNode.id);
    if (_options.checkEquality && userNode === internalNode?.internals.userNode)
      nodeLookup.set(userNode.id, internalNode);
    else {
      let positionWithOrigin = getNodePositionWithOrigin(userNode, _options.nodeOrigin), extent = isCoordinateExtent(userNode.extent) ? userNode.extent : _options.nodeExtent, clampedPosition = clampPosition(positionWithOrigin, extent, getNodeDimensions(userNode));
      internalNode = {
        ..._options.defaults,
        ...userNode,
        measured: {
          width: userNode.measured?.width,
          height: userNode.measured?.height
        },
        internals: {
          positionAbsolute: clampedPosition,
          // if user re-initializes the node or removes `measured` for whatever reason, we reset the handleBounds so that the node gets re-measured
          handleBounds: parseHandles(userNode, internalNode),
          z: calculateZ(userNode, selectedNodeZ, _options.zIndexMode),
          userNode
        }
      }, nodeLookup.set(userNode.id, internalNode);
    }
    (internalNode.measured === void 0 || internalNode.measured.width === void 0 || internalNode.measured.height === void 0) && !internalNode.hidden && (nodesInitialized = !1), userNode.parentId && updateChildNode(internalNode, nodeLookup, parentLookup, options, rootParentIndex), hasSelectedNodes ||= userNode.selected ?? !1;
  }
  return { nodesInitialized, hasSelectedNodes };
}
function updateParentLookup(node, parentLookup) {
  if (!node.parentId)
    return;
  let childNodes = parentLookup.get(node.parentId);
  childNodes ? childNodes.set(node.id, node) : parentLookup.set(node.parentId, /* @__PURE__ */ new Map([[node.id, node]]));
}
function updateChildNode(node, nodeLookup, parentLookup, options, rootParentIndex) {
  let { elevateNodesOnSelect, nodeOrigin, nodeExtent, zIndexMode } = mergeObjects(defaultOptions, options), parentId = node.parentId, parentNode = nodeLookup.get(parentId);
  if (!parentNode) {
    console.warn(`Parent node ${parentId} not found. Please make sure that parent nodes are in front of their child nodes in the nodes array.`);
    return;
  }
  updateParentLookup(node, parentLookup), rootParentIndex && !parentNode.parentId && parentNode.internals.rootParentIndex === void 0 && zIndexMode === "auto" && (parentNode.internals.rootParentIndex = ++rootParentIndex.i, parentNode.internals.z = parentNode.internals.z + rootParentIndex.i * ROOT_PARENT_Z_INCREMENT), rootParentIndex && parentNode.internals.rootParentIndex !== void 0 && (rootParentIndex.i = parentNode.internals.rootParentIndex);
  let selectedNodeZ = elevateNodesOnSelect && !isManualZIndexMode(zIndexMode) ? SELECTED_NODE_Z : 0, { x, y, z } = calculateChildXYZ(node, parentNode, nodeOrigin, nodeExtent, selectedNodeZ, zIndexMode), { positionAbsolute } = node.internals, positionChanged = x !== positionAbsolute.x || y !== positionAbsolute.y;
  (positionChanged || z !== node.internals.z) && nodeLookup.set(node.id, {
    ...node,
    internals: {
      ...node.internals,
      positionAbsolute: positionChanged ? { x, y } : positionAbsolute,
      z
    }
  });
}
function calculateZ(node, selectedNodeZ, zIndexMode) {
  let zIndex = isNumeric(node.zIndex) ? node.zIndex : 0;
  return isManualZIndexMode(zIndexMode) ? zIndex : zIndex + (node.selected ? selectedNodeZ : 0);
}
function calculateChildXYZ(childNode, parentNode, nodeOrigin, nodeExtent, selectedNodeZ, zIndexMode) {
  let { x: parentX, y: parentY } = parentNode.internals.positionAbsolute, childDimensions = getNodeDimensions(childNode), positionWithOrigin = getNodePositionWithOrigin(childNode, nodeOrigin), clampedPosition = isCoordinateExtent(childNode.extent) ? clampPosition(positionWithOrigin, childNode.extent, childDimensions) : positionWithOrigin, absolutePosition = clampPosition({ x: parentX + clampedPosition.x, y: parentY + clampedPosition.y }, nodeExtent, childDimensions);
  childNode.extent === "parent" && (absolutePosition = clampPositionToParent(absolutePosition, childDimensions, parentNode));
  let childZ = calculateZ(childNode, selectedNodeZ, zIndexMode), parentZ = parentNode.internals.z ?? 0;
  return {
    x: absolutePosition.x,
    y: absolutePosition.y,
    z: parentZ >= childZ ? parentZ + 1 : childZ
  };
}
function handleExpandParent(children2, nodeLookup, parentLookup, nodeOrigin = [0, 0]) {
  let changes = [], parentExpansions = /* @__PURE__ */ new Map();
  for (let child of children2) {
    let parent = nodeLookup.get(child.parentId);
    if (!parent)
      continue;
    let parentRect = parentExpansions.get(child.parentId)?.expandedRect ?? nodeToRect(parent), expandedRect = getBoundsOfRects(parentRect, child.rect);
    parentExpansions.set(child.parentId, { expandedRect, parent });
  }
  return parentExpansions.size > 0 && parentExpansions.forEach(({ expandedRect, parent }, parentId) => {
    let positionAbsolute = parent.internals.positionAbsolute, dimensions = getNodeDimensions(parent), origin = parent.origin ?? nodeOrigin, xChange = expandedRect.x < positionAbsolute.x ? Math.round(Math.abs(positionAbsolute.x - expandedRect.x)) : 0, yChange = expandedRect.y < positionAbsolute.y ? Math.round(Math.abs(positionAbsolute.y - expandedRect.y)) : 0, newWidth = Math.max(dimensions.width, Math.round(expandedRect.width)), newHeight = Math.max(dimensions.height, Math.round(expandedRect.height)), widthChange = (newWidth - dimensions.width) * origin[0], heightChange = (newHeight - dimensions.height) * origin[1];
    (xChange > 0 || yChange > 0 || widthChange || heightChange) && (changes.push({
      id: parentId,
      type: "position",
      position: {
        x: parent.position.x - xChange + widthChange,
        y: parent.position.y - yChange + heightChange
      }
    }), parentLookup.get(parentId)?.forEach((childNode) => {
      children2.some((child) => child.id === childNode.id) || changes.push({
        id: childNode.id,
        type: "position",
        position: {
          x: childNode.position.x + xChange,
          y: childNode.position.y + yChange
        }
      });
    })), (dimensions.width < expandedRect.width || dimensions.height < expandedRect.height || xChange || yChange) && changes.push({
      id: parentId,
      type: "dimensions",
      setAttributes: !0,
      dimensions: {
        width: newWidth + (xChange ? origin[0] * xChange - widthChange : 0),
        height: newHeight + (yChange ? origin[1] * yChange - heightChange : 0)
      }
    });
  }), changes;
}
function updateNodeInternals(updates, nodeLookup, parentLookup, domNode, nodeOrigin, nodeExtent, zIndexMode) {
  let viewportNode = domNode?.querySelector(".xyflow__viewport"), updatedInternals = !1;
  if (!viewportNode)
    return { changes: [], updatedInternals };
  let changes = [], style2 = window.getComputedStyle(viewportNode), { m22: zoom3 } = new window.DOMMatrixReadOnly(style2.transform), parentExpandChildren = [];
  for (let update of updates.values()) {
    let node = nodeLookup.get(update.id);
    if (!node)
      continue;
    if (node.hidden) {
      nodeLookup.set(node.id, {
        ...node,
        internals: {
          ...node.internals,
          handleBounds: void 0
        }
      }), updatedInternals = !0;
      continue;
    }
    let dimensions = getDimensions(update.nodeElement), dimensionChanged = node.measured.width !== dimensions.width || node.measured.height !== dimensions.height;
    if (!!(dimensions.width && dimensions.height && (dimensionChanged || !node.internals.handleBounds || update.force))) {
      let nodeBounds = update.nodeElement.getBoundingClientRect(), extent = isCoordinateExtent(node.extent) ? node.extent : nodeExtent, { positionAbsolute } = node.internals;
      if (node.parentId && node.extent === "parent") {
        let parentNode = nodeLookup.get(node.parentId);
        parentNode && (positionAbsolute = clampPositionToParent(positionAbsolute, dimensions, parentNode));
      } else extent && (positionAbsolute = clampPosition(positionAbsolute, extent, dimensions));
      let newNode = {
        ...node,
        measured: dimensions,
        internals: {
          ...node.internals,
          positionAbsolute,
          handleBounds: {
            source: getHandleBounds("source", update.nodeElement, nodeBounds, zoom3, node.id),
            target: getHandleBounds("target", update.nodeElement, nodeBounds, zoom3, node.id)
          }
        }
      };
      nodeLookup.set(node.id, newNode), node.parentId && updateChildNode(newNode, nodeLookup, parentLookup, { nodeOrigin, zIndexMode }), updatedInternals = !0, dimensionChanged && (changes.push({
        id: node.id,
        type: "dimensions",
        dimensions
      }), node.expandParent && node.parentId && parentExpandChildren.push({
        id: node.id,
        parentId: node.parentId,
        rect: nodeToRect(newNode, nodeOrigin)
      }));
    }
  }
  if (parentExpandChildren.length > 0) {
    let parentExpandChanges = handleExpandParent(parentExpandChildren, nodeLookup, parentLookup, nodeOrigin);
    changes.push(...parentExpandChanges);
  }
  return { changes, updatedInternals };
}
async function panBy({ delta, panZoom, transform: transform2, translateExtent, width, height }) {
  if (!panZoom || !delta.x && !delta.y)
    return !1;
  let nextViewport = await panZoom.setViewportConstrained({
    x: transform2[0] + delta.x,
    y: transform2[1] + delta.y,
    zoom: transform2[2]
  }, [
    [0, 0],
    [width, height]
  ], translateExtent);
  return !!nextViewport && (nextViewport.x !== transform2[0] || nextViewport.y !== transform2[1] || nextViewport.k !== transform2[2]);
}
function addConnectionToLookup(type, connection, connectionKey, connectionLookup, nodeId, handleId) {
  let key = nodeId, nodeMap = connectionLookup.get(key) || /* @__PURE__ */ new Map();
  connectionLookup.set(key, nodeMap.set(connectionKey, connection)), key = `${nodeId}-${type}`;
  let typeMap = connectionLookup.get(key) || /* @__PURE__ */ new Map();
  if (connectionLookup.set(key, typeMap.set(connectionKey, connection)), handleId) {
    key = `${nodeId}-${type}-${handleId}`;
    let handleMap = connectionLookup.get(key) || /* @__PURE__ */ new Map();
    connectionLookup.set(key, handleMap.set(connectionKey, connection));
  }
}
function updateConnectionLookup(connectionLookup, edgeLookup, edges) {
  connectionLookup.clear(), edgeLookup.clear();
  for (let edge of edges) {
    let { source: sourceNode, target: targetNode, sourceHandle = null, targetHandle = null } = edge, connection = { edgeId: edge.id, source: sourceNode, target: targetNode, sourceHandle, targetHandle }, sourceKey = `${sourceNode}-${sourceHandle}--${targetNode}-${targetHandle}`, targetKey = `${targetNode}-${targetHandle}--${sourceNode}-${sourceHandle}`;
    addConnectionToLookup("source", connection, targetKey, connectionLookup, sourceNode, sourceHandle), addConnectionToLookup("target", connection, sourceKey, connectionLookup, targetNode, targetHandle), edgeLookup.set(edge.id, edge);
  }
}
function isParentSelected(node, nodeLookup) {
  if (!node.parentId)
    return !1;
  let parentNode = nodeLookup.get(node.parentId);
  return parentNode ? parentNode.selected ? !0 : isParentSelected(parentNode, nodeLookup) : !1;
}
function hasSelector(target, selector2, domNode) {
  let current = target;
  do {
    if (current?.matches?.(selector2))
      return !0;
    if (current === domNode)
      return !1;
    current = current?.parentElement;
  } while (current);
  return !1;
}
function getDragItems(nodeLookup, nodesDraggable, mousePos, nodeId, onlyDragNode) {
  let dragItems = /* @__PURE__ */ new Map();
  for (let [id2, node] of nodeLookup)
    if ((onlyDragNode ? node.id === nodeId : node.selected || node.id === nodeId) && (onlyDragNode || !node.parentId || !isParentSelected(node, nodeLookup)) && (node.draggable || nodesDraggable && typeof node.draggable > "u")) {
      let internalNode = nodeLookup.get(id2);
      internalNode && dragItems.set(id2, {
        id: id2,
        position: internalNode.position || { x: 0, y: 0 },
        distance: {
          x: mousePos.x - internalNode.internals.positionAbsolute.x,
          y: mousePos.y - internalNode.internals.positionAbsolute.y
        },
        extent: internalNode.extent,
        parentId: internalNode.parentId,
        origin: internalNode.origin,
        expandParent: internalNode.expandParent,
        internals: {
          positionAbsolute: internalNode.internals.positionAbsolute || { x: 0, y: 0 }
        },
        measured: {
          width: internalNode.measured.width ?? 0,
          height: internalNode.measured.height ?? 0
        }
      });
    }
  return dragItems;
}
function getEventHandlerParams({ nodeId, dragItems, nodeLookup, dragging = !0 }) {
  let nodesFromDragItems = [];
  for (let [id2, dragItem] of dragItems) {
    let node2 = nodeLookup.get(id2)?.internals.userNode;
    node2 && nodesFromDragItems.push({
      ...node2,
      position: dragItem.position,
      dragging
    });
  }
  if (!nodeId)
    return [nodesFromDragItems[0], nodesFromDragItems];
  let node = nodeLookup.get(nodeId)?.internals.userNode;
  return [
    node ? {
      ...node,
      position: dragItems.get(nodeId)?.position || node.position,
      dragging
    } : nodesFromDragItems[0],
    nodesFromDragItems
  ];
}
function calculateSnapOffset({ dragItems, snapGrid, x, y }) {
  let refDragItem = dragItems.values().next().value;
  if (!refDragItem)
    return null;
  let refPos = {
    x: x - refDragItem.distance.x,
    y: y - refDragItem.distance.y
  }, refPosSnapped = snapPosition(refPos, snapGrid);
  return {
    x: refPosSnapped.x - refPos.x,
    y: refPosSnapped.y - refPos.y
  };
}
function XYDrag({ onNodeMouseDown, getStoreItems, onDragStart, onDrag, onDragStop }) {
  let lastPos = { x: null, y: null }, autoPanId = 0, dragItems = /* @__PURE__ */ new Map(), autoPanStarted = !1, mousePosition = { x: 0, y: 0 }, containerBounds = null, dragStarted = !1, d3Selection = null, abortDrag = !1, nodePositionsChanged = !1, dragEvent = null;
  function update({ noDragClassName, handleSelector, domNode, isSelectable, nodeId, nodeClickDistance = 0 }) {
    d3Selection = select(domNode);
    function updateNodes({ x, y }) {
      let { nodeLookup, nodeExtent, snapGrid, snapToGrid, nodeOrigin, onNodeDrag, onSelectionDrag, onError, updateNodePositions } = getStoreItems();
      lastPos = { x, y };
      let hasChange = !1, isMultiDrag = dragItems.size > 1, nodesBox = isMultiDrag && nodeExtent ? rectToBox(getInternalNodesBounds(dragItems)) : null, multiDragSnapOffset = isMultiDrag && snapToGrid ? calculateSnapOffset({
        dragItems,
        snapGrid,
        x,
        y
      }) : null;
      for (let [id2, dragItem] of dragItems) {
        if (!nodeLookup.has(id2))
          continue;
        let nextPosition = { x: x - dragItem.distance.x, y: y - dragItem.distance.y };
        snapToGrid && (nextPosition = multiDragSnapOffset ? {
          x: Math.round(nextPosition.x + multiDragSnapOffset.x),
          y: Math.round(nextPosition.y + multiDragSnapOffset.y)
        } : snapPosition(nextPosition, snapGrid));
        let adjustedNodeExtent = null;
        if (isMultiDrag && nodeExtent && !dragItem.extent && nodesBox) {
          let { positionAbsolute: positionAbsolute2 } = dragItem.internals, x1 = positionAbsolute2.x - nodesBox.x + nodeExtent[0][0], x2 = positionAbsolute2.x + dragItem.measured.width - nodesBox.x2 + nodeExtent[1][0], y1 = positionAbsolute2.y - nodesBox.y + nodeExtent[0][1], y2 = positionAbsolute2.y + dragItem.measured.height - nodesBox.y2 + nodeExtent[1][1];
          adjustedNodeExtent = [
            [x1, y1],
            [x2, y2]
          ];
        }
        let { position, positionAbsolute } = calculateNodePosition({
          nodeId: id2,
          nextPosition,
          nodeLookup,
          nodeExtent: adjustedNodeExtent || nodeExtent,
          nodeOrigin,
          onError
        });
        hasChange = hasChange || dragItem.position.x !== position.x || dragItem.position.y !== position.y, dragItem.position = position, dragItem.internals.positionAbsolute = positionAbsolute;
      }
      if (nodePositionsChanged = nodePositionsChanged || hasChange, !!hasChange && (updateNodePositions(dragItems, !0), dragEvent && (onDrag || onNodeDrag || !nodeId && onSelectionDrag))) {
        let [currentNode, currentNodes] = getEventHandlerParams({
          nodeId,
          dragItems,
          nodeLookup
        });
        onDrag?.(dragEvent, dragItems, currentNode, currentNodes), onNodeDrag?.(dragEvent, currentNode, currentNodes), nodeId || onSelectionDrag?.(dragEvent, currentNodes);
      }
    }
    async function autoPan() {
      if (!containerBounds)
        return;
      let { transform: transform2, panBy: panBy2, autoPanSpeed, autoPanOnNodeDrag } = getStoreItems();
      if (!autoPanOnNodeDrag) {
        autoPanStarted = !1, cancelAnimationFrame(autoPanId);
        return;
      }
      let [xMovement, yMovement] = calcAutoPan(mousePosition, containerBounds, autoPanSpeed);
      (xMovement !== 0 || yMovement !== 0) && (lastPos.x = (lastPos.x ?? 0) - xMovement / transform2[2], lastPos.y = (lastPos.y ?? 0) - yMovement / transform2[2], await panBy2({ x: xMovement, y: yMovement }) && updateNodes(lastPos)), autoPanId = requestAnimationFrame(autoPan);
    }
    function startDrag(event) {
      let { nodeLookup, multiSelectionActive, nodesDraggable, transform: transform2, snapGrid, snapToGrid, selectNodesOnDrag, onNodeDragStart, onSelectionDragStart, unselectNodesAndEdges } = getStoreItems();
      dragStarted = !0;
      let isUnselectedNodeDrag = !!nodeId && !multiSelectionActive && !nodeLookup.get(nodeId)?.selected;
      (!selectNodesOnDrag || !isSelectable) && !multiSelectionActive && nodeId && (nodeLookup.get(nodeId)?.selected || unselectNodesAndEdges()), isSelectable && selectNodesOnDrag && nodeId && onNodeMouseDown?.(nodeId);
      let pointerPos = getPointerPosition(event.sourceEvent, { transform: transform2, snapGrid, snapToGrid, containerBounds });
      if (lastPos = pointerPos, dragItems = getDragItems(nodeLookup, nodesDraggable, pointerPos, nodeId, isUnselectedNodeDrag), dragItems.size > 0 && (onDragStart || onNodeDragStart || !nodeId && onSelectionDragStart)) {
        let [currentNode, currentNodes] = getEventHandlerParams({
          nodeId,
          dragItems,
          nodeLookup
        });
        onDragStart?.(event.sourceEvent, dragItems, currentNode, currentNodes), onNodeDragStart?.(event.sourceEvent, currentNode, currentNodes), nodeId || onSelectionDragStart?.(event.sourceEvent, currentNodes);
      }
    }
    let d3DragInstance = drag().clickDistance(nodeClickDistance).on("start", (event) => {
      let { domNode: domNode2, nodeDragThreshold, transform: transform2, snapGrid, snapToGrid } = getStoreItems();
      containerBounds = domNode2?.getBoundingClientRect() || null, abortDrag = !1, nodePositionsChanged = !1, dragEvent = event.sourceEvent, nodeDragThreshold === 0 && startDrag(event), lastPos = getPointerPosition(event.sourceEvent, { transform: transform2, snapGrid, snapToGrid, containerBounds }), mousePosition = getEventPosition(event.sourceEvent, containerBounds);
    }).on("drag", (event) => {
      let { autoPanOnNodeDrag, transform: transform2, snapGrid, snapToGrid, nodeDragThreshold, nodeLookup } = getStoreItems(), pointerPos = getPointerPosition(event.sourceEvent, { transform: transform2, snapGrid, snapToGrid, containerBounds });
      if (dragEvent = event.sourceEvent, (event.sourceEvent.type === "touchmove" && event.sourceEvent.touches.length > 1 || // if user deletes a node while dragging, we need to abort the drag to prevent errors
      nodeId && !nodeLookup.has(nodeId)) && (abortDrag = !0), !abortDrag) {
        if (!autoPanStarted && autoPanOnNodeDrag && dragStarted && (autoPanStarted = !0, autoPan()), !dragStarted) {
          let currentMousePosition = getEventPosition(event.sourceEvent, containerBounds), x = currentMousePosition.x - mousePosition.x, y = currentMousePosition.y - mousePosition.y;
          Math.sqrt(x * x + y * y) > nodeDragThreshold && startDrag(event);
        }
        (lastPos.x !== pointerPos.xSnapped || lastPos.y !== pointerPos.ySnapped) && dragItems && dragStarted && (mousePosition = getEventPosition(event.sourceEvent, containerBounds), updateNodes(pointerPos));
      }
    }).on("end", (event) => {
      if (!dragStarted || abortDrag) {
        abortDrag && dragItems.size > 0 && getStoreItems().updateNodePositions(dragItems, !1);
        return;
      }
      if (autoPanStarted = !1, dragStarted = !1, cancelAnimationFrame(autoPanId), dragItems.size > 0) {
        let { nodeLookup, updateNodePositions, onNodeDragStop, onSelectionDragStop } = getStoreItems();
        if (nodePositionsChanged && (updateNodePositions(dragItems, !1), nodePositionsChanged = !1), onDragStop || onNodeDragStop || !nodeId && onSelectionDragStop) {
          let [currentNode, currentNodes] = getEventHandlerParams({
            nodeId,
            dragItems,
            nodeLookup,
            dragging: !1
          });
          onDragStop?.(event.sourceEvent, dragItems, currentNode, currentNodes), onNodeDragStop?.(event.sourceEvent, currentNode, currentNodes), nodeId || onSelectionDragStop?.(event.sourceEvent, currentNodes);
        }
      }
    }).filter((event) => {
      let target = event.target;
      return !event.button && (!noDragClassName || !hasSelector(target, `.${noDragClassName}`, domNode)) && (!handleSelector || hasSelector(target, handleSelector, domNode));
    });
    d3Selection.call(d3DragInstance);
  }
  function destroy() {
    d3Selection?.on(".drag", null);
  }
  return {
    update,
    destroy
  };
}
function getNodesWithinDistance(position, nodeLookup, distance2) {
  let nodes = [], rect = {
    x: position.x - distance2,
    y: position.y - distance2,
    width: distance2 * 2,
    height: distance2 * 2
  };
  for (let node of nodeLookup.values())
    getOverlappingArea(rect, nodeToRect(node)) > 0 && nodes.push(node);
  return nodes;
}
var ADDITIONAL_DISTANCE = 250;
function getClosestHandle(position, connectionRadius, nodeLookup, fromHandle) {
  let closestHandles = [], minDistance = 1 / 0, closeNodes = getNodesWithinDistance(position, nodeLookup, connectionRadius + ADDITIONAL_DISTANCE);
  for (let node of closeNodes) {
    let allHandles = [...node.internals.handleBounds?.source ?? [], ...node.internals.handleBounds?.target ?? []];
    for (let handle of allHandles) {
      if (fromHandle.nodeId === handle.nodeId && fromHandle.type === handle.type && fromHandle.id === handle.id)
        continue;
      let { x, y } = getHandlePosition(node, handle, handle.position, !0), distance2 = Math.sqrt(Math.pow(x - position.x, 2) + Math.pow(y - position.y, 2));
      distance2 > connectionRadius || (distance2 < minDistance ? (closestHandles = [{ ...handle, x, y }], minDistance = distance2) : distance2 === minDistance && closestHandles.push({ ...handle, x, y }));
    }
  }
  if (!closestHandles.length)
    return null;
  if (closestHandles.length > 1) {
    let oppositeHandleType = fromHandle.type === "source" ? "target" : "source";
    return closestHandles.find((handle) => handle.type === oppositeHandleType) ?? closestHandles[0];
  }
  return closestHandles[0];
}
function getHandle(nodeId, handleType, handleId, nodeLookup, connectionMode, withAbsolutePosition = !1) {
  let node = nodeLookup.get(nodeId);
  if (!node)
    return null;
  let handles = connectionMode === "strict" ? node.internals.handleBounds?.[handleType] : [...node.internals.handleBounds?.source ?? [], ...node.internals.handleBounds?.target ?? []], handle = (handleId ? handles?.find((h) => h.id === handleId) : handles?.[0]) ?? null;
  return handle && withAbsolutePosition ? { ...handle, ...getHandlePosition(node, handle, handle.position, !0) } : handle;
}
function getHandleType(edgeUpdaterType, handleDomNode) {
  return edgeUpdaterType || (handleDomNode?.classList.contains("target") ? "target" : handleDomNode?.classList.contains("source") ? "source" : null);
}
function isConnectionValid(isInsideConnectionRadius, isHandleValid) {
  let isValid = null;
  return isHandleValid ? isValid = !0 : isInsideConnectionRadius && !isHandleValid && (isValid = !1), isValid;
}
var alwaysValid = () => !0;
function onPointerDown(event, { connectionMode, connectionRadius, handleId, nodeId, edgeUpdaterType, isTarget, domNode, nodeLookup, lib, autoPanOnConnect, flowId, panBy: panBy2, cancelConnection, onConnectStart, onConnect, onConnectEnd, isValidConnection = alwaysValid, onReconnectEnd, updateConnection, getTransform, getFromHandle, autoPanSpeed, dragThreshold = 1, handleDomNode }) {
  let doc = getHostForElement(event.target), autoPanId = 0, closestHandle, { x, y } = getEventPosition(event), handleType = getHandleType(edgeUpdaterType, handleDomNode), containerBounds = domNode?.getBoundingClientRect(), connectionStarted = !1;
  if (!containerBounds || !handleType)
    return;
  let fromHandleInternal = getHandle(nodeId, handleType, handleId, nodeLookup, connectionMode);
  if (!fromHandleInternal)
    return;
  let position = getEventPosition(event, containerBounds), autoPanStarted = !1, connection = null, isValid = !1, resultHandleDomNode = null;
  function autoPan() {
    if (!autoPanOnConnect || !containerBounds)
      return;
    let [x2, y2] = calcAutoPan(position, containerBounds, autoPanSpeed);
    panBy2({ x: x2, y: y2 }), autoPanId = requestAnimationFrame(autoPan);
  }
  let fromHandle = {
    ...fromHandleInternal,
    nodeId,
    type: handleType,
    position: fromHandleInternal.position
  }, fromInternalNode = nodeLookup.get(nodeId), previousConnection = {
    inProgress: !0,
    isValid: null,
    from: getHandlePosition(fromInternalNode, fromHandle, Position.Left, !0),
    fromHandle,
    fromPosition: fromHandle.position,
    fromNode: fromInternalNode,
    to: position,
    toHandle: null,
    toPosition: oppositePosition[fromHandle.position],
    toNode: null,
    pointer: position
  };
  function startConnection() {
    connectionStarted = !0, updateConnection(previousConnection), onConnectStart?.(event, { nodeId, handleId, handleType });
  }
  dragThreshold === 0 && startConnection();
  function onPointerMove(event2) {
    if (!connectionStarted) {
      let { x: evtX, y: evtY } = getEventPosition(event2), dx = evtX - x, dy = evtY - y;
      if (!(dx * dx + dy * dy > dragThreshold * dragThreshold))
        return;
      startConnection();
    }
    if (!getFromHandle() || !fromHandle) {
      onPointerUp(event2);
      return;
    }
    let transform2 = getTransform();
    position = getEventPosition(event2, containerBounds), closestHandle = getClosestHandle(pointToRendererPoint(position, transform2, !1, [1, 1]), connectionRadius, nodeLookup, fromHandle), autoPanStarted || (autoPan(), autoPanStarted = !0);
    let result = isValidHandle(event2, {
      handle: closestHandle,
      connectionMode,
      fromNodeId: nodeId,
      fromHandleId: handleId,
      fromType: isTarget ? "target" : "source",
      isValidConnection,
      doc,
      lib,
      flowId,
      nodeLookup
    });
    resultHandleDomNode = result.handleDomNode, connection = result.connection, isValid = isConnectionValid(!!closestHandle, result.isValid);
    let fromInternalNode2 = nodeLookup.get(nodeId), from2 = fromInternalNode2 ? getHandlePosition(fromInternalNode2, fromHandle, Position.Left, !0) : previousConnection.from, newConnection = {
      ...previousConnection,
      from: from2,
      isValid,
      to: result.toHandle && isValid ? rendererPointToPoint({ x: result.toHandle.x, y: result.toHandle.y }, transform2) : position,
      toHandle: result.toHandle,
      toPosition: isValid && result.toHandle ? result.toHandle.position : oppositePosition[fromHandle.position],
      toNode: result.toHandle ? nodeLookup.get(result.toHandle.nodeId) : null,
      pointer: position
    };
    updateConnection(newConnection), previousConnection = newConnection;
  }
  function onPointerUp(event2) {
    if (!("touches" in event2 && event2.touches.length > 0)) {
      if (connectionStarted) {
        (closestHandle || resultHandleDomNode) && connection && isValid && onConnect?.(connection);
        let { inProgress, ...connectionState } = previousConnection, finalConnectionState = {
          ...connectionState,
          toPosition: previousConnection.toHandle ? previousConnection.toPosition : null
        };
        onConnectEnd?.(event2, finalConnectionState), edgeUpdaterType && onReconnectEnd?.(event2, finalConnectionState);
      }
      cancelConnection(), cancelAnimationFrame(autoPanId), autoPanStarted = !1, isValid = !1, connection = null, resultHandleDomNode = null, doc.removeEventListener("mousemove", onPointerMove), doc.removeEventListener("mouseup", onPointerUp), doc.removeEventListener("touchmove", onPointerMove), doc.removeEventListener("touchend", onPointerUp);
    }
  }
  doc.addEventListener("mousemove", onPointerMove), doc.addEventListener("mouseup", onPointerUp), doc.addEventListener("touchmove", onPointerMove), doc.addEventListener("touchend", onPointerUp);
}
function isValidHandle(event, { handle, connectionMode, fromNodeId, fromHandleId, fromType, doc, lib, flowId, isValidConnection = alwaysValid, nodeLookup }) {
  let isTarget = fromType === "target", handleDomNode = handle ? doc.querySelector(`.${lib}-flow__handle[data-id="${flowId}-${handle?.nodeId}-${handle?.id}-${handle?.type}"]`) : null, { x, y } = getEventPosition(event), handleBelow = doc.elementFromPoint(x, y), handleToCheck = handleBelow?.classList.contains(`${lib}-flow__handle`) ? handleBelow : handleDomNode, result = {
    handleDomNode: handleToCheck,
    isValid: !1,
    connection: null,
    toHandle: null
  };
  if (handleToCheck) {
    let handleType = getHandleType(void 0, handleToCheck), handleNodeId = handleToCheck.getAttribute("data-nodeid"), handleId = handleToCheck.getAttribute("data-handleid"), connectable = handleToCheck.classList.contains("connectable"), connectableEnd = handleToCheck.classList.contains("connectableend");
    if (!handleNodeId || !handleType)
      return result;
    let connection = {
      source: isTarget ? handleNodeId : fromNodeId,
      sourceHandle: isTarget ? handleId : fromHandleId,
      target: isTarget ? fromNodeId : handleNodeId,
      targetHandle: isTarget ? fromHandleId : handleId
    };
    result.connection = connection;
    let isValid = connectable && connectableEnd && (connectionMode === ConnectionMode.Strict ? isTarget && handleType === "source" || !isTarget && handleType === "target" : handleNodeId !== fromNodeId || handleId !== fromHandleId);
    result.isValid = isValid && isValidConnection(connection), result.toHandle = getHandle(handleNodeId, handleType, handleId, nodeLookup, connectionMode, !0);
  }
  return result;
}
var XYHandle = {
  onPointerDown,
  isValid: isValidHandle
};
function XYMinimap({ domNode, panZoom, getTransform, getViewScale }) {
  let selection2 = select(domNode);
  function update({ translateExtent, width, height, zoomStep = 1, pannable = !0, zoomable = !0, inversePan = !1 }) {
    let zoomHandler = (event) => {
      if (event.sourceEvent.type !== "wheel" || !panZoom)
        return;
      let transform2 = getTransform(), factor = event.sourceEvent.ctrlKey && isMacOs() ? 10 : 1, pinchDelta = -event.sourceEvent.deltaY * (event.sourceEvent.deltaMode === 1 ? 0.05 : event.sourceEvent.deltaMode ? 1 : 2e-3) * zoomStep, nextZoom = transform2[2] * Math.pow(2, pinchDelta * factor);
      panZoom.scaleTo(nextZoom);
    }, panStart = [0, 0], panStartHandler = (event) => {
      (event.sourceEvent.type === "mousedown" || event.sourceEvent.type === "touchstart") && (panStart = [
        event.sourceEvent.clientX ?? event.sourceEvent.touches[0].clientX,
        event.sourceEvent.clientY ?? event.sourceEvent.touches[0].clientY
      ]);
    }, panHandler = (event) => {
      let transform2 = getTransform();
      if (event.sourceEvent.type !== "mousemove" && event.sourceEvent.type !== "touchmove" || !panZoom)
        return;
      let panCurrent = [
        event.sourceEvent.clientX ?? event.sourceEvent.touches[0].clientX,
        event.sourceEvent.clientY ?? event.sourceEvent.touches[0].clientY
      ], panDelta = [panCurrent[0] - panStart[0], panCurrent[1] - panStart[1]];
      panStart = panCurrent;
      let moveScale = getViewScale() * Math.max(transform2[2], Math.log(transform2[2])) * (inversePan ? -1 : 1), position = {
        x: transform2[0] - panDelta[0] * moveScale,
        y: transform2[1] - panDelta[1] * moveScale
      }, extent = [
        [0, 0],
        [width, height]
      ];
      panZoom.setViewportConstrained({
        x: position.x,
        y: position.y,
        zoom: transform2[2]
      }, extent, translateExtent);
    }, zoomAndPanHandler = zoom2().on("start", panStartHandler).on("zoom", pannable ? panHandler : null).on("zoom.wheel", zoomable ? zoomHandler : null);
    selection2.call(zoomAndPanHandler, {});
  }
  function destroy() {
    selection2.on("zoom", null);
  }
  return {
    update,
    destroy,
    pointer
  };
}
var transformToViewport = (transform2) => ({
  x: transform2.x,
  y: transform2.y,
  zoom: transform2.k
}), viewportToTransform = ({ x, y, zoom: zoom3 }) => identity2.translate(x, y).scale(zoom3), isWrappedWithClass = (event, className) => event.target.closest(`.${className}`), isRightClickPan = (panOnDrag, usedButton) => usedButton === 2 && Array.isArray(panOnDrag) && panOnDrag.includes(2), defaultEase = (t) => ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2, getD3Transition = (selection2, duration = 0, ease = defaultEase, onEnd = () => {
}) => {
  let hasDuration = typeof duration == "number" && duration > 0;
  return hasDuration || onEnd(), hasDuration ? selection2.transition().duration(duration).ease(ease).on("end", onEnd) : selection2;
}, wheelDelta = (event) => {
  let factor = event.ctrlKey && isMacOs() ? 10 : 1;
  return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 2e-3) * factor;
};
function createPanOnScrollHandler({ zoomPanValues, noWheelClassName, d3Selection, d3Zoom, panOnScrollMode, panOnScrollSpeed, zoomOnPinch, onPanZoomStart, onPanZoom, onPanZoomEnd }) {
  return (event) => {
    if (isWrappedWithClass(event, noWheelClassName))
      return event.ctrlKey && event.preventDefault(), !1;
    event.preventDefault(), event.stopImmediatePropagation();
    let currentZoom = d3Selection.property("__zoom").k || 1;
    if (event.ctrlKey && zoomOnPinch) {
      let point = pointer(event), pinchDelta = wheelDelta(event), zoom3 = currentZoom * Math.pow(2, pinchDelta);
      d3Zoom.scaleTo(d3Selection, zoom3, point, event);
      return;
    }
    let deltaNormalize = event.deltaMode === 1 ? 20 : 1, deltaX = panOnScrollMode === PanOnScrollMode.Vertical ? 0 : event.deltaX * deltaNormalize, deltaY = panOnScrollMode === PanOnScrollMode.Horizontal ? 0 : event.deltaY * deltaNormalize;
    !isMacOs() && event.shiftKey && panOnScrollMode !== PanOnScrollMode.Vertical && (deltaX = event.deltaY * deltaNormalize, deltaY = 0), d3Zoom.translateBy(
      d3Selection,
      -(deltaX / currentZoom) * panOnScrollSpeed,
      -(deltaY / currentZoom) * panOnScrollSpeed,
      // @ts-ignore
      { internal: !0 }
    );
    let nextViewport = transformToViewport(d3Selection.property("__zoom"));
    clearTimeout(zoomPanValues.panScrollTimeout), zoomPanValues.isPanScrolling ? onPanZoom?.(event, nextViewport) : (zoomPanValues.isPanScrolling = !0, onPanZoomStart?.(event, nextViewport)), zoomPanValues.panScrollTimeout = setTimeout(() => {
      onPanZoomEnd?.(event, nextViewport), zoomPanValues.isPanScrolling = !1;
    }, 150);
  };
}
function createZoomOnScrollHandler({ noWheelClassName, preventScrolling, d3ZoomHandler }) {
  return function(event, d) {
    let isWheel = event.type === "wheel", preventZoom = !preventScrolling && isWheel && !event.ctrlKey, hasNoWheelClass = isWrappedWithClass(event, noWheelClassName);
    if (event.ctrlKey && isWheel && hasNoWheelClass && event.preventDefault(), preventZoom || hasNoWheelClass)
      return null;
    event.preventDefault(), d3ZoomHandler.call(this, event, d);
  };
}
function createPanZoomStartHandler({ zoomPanValues, onDraggingChange, onPanZoomStart }) {
  return (event) => {
    if (event.sourceEvent?.internal)
      return;
    let viewport = transformToViewport(event.transform);
    zoomPanValues.mouseButton = event.sourceEvent?.button || 0, zoomPanValues.isZoomingOrPanning = !0, zoomPanValues.prevViewport = viewport, event.sourceEvent?.type === "mousedown" && onDraggingChange(!0), onPanZoomStart && onPanZoomStart?.(event.sourceEvent, viewport);
  };
}
function createPanZoomHandler({ zoomPanValues, panOnDrag, onPaneContextMenu, onTransformChange, onPanZoom }) {
  return (event) => {
    zoomPanValues.usedRightMouseButton = !!(onPaneContextMenu && isRightClickPan(panOnDrag, zoomPanValues.mouseButton ?? 0)), event.sourceEvent?.sync || onTransformChange([event.transform.x, event.transform.y, event.transform.k]), onPanZoom && !event.sourceEvent?.internal && onPanZoom?.(event.sourceEvent, transformToViewport(event.transform));
  };
}
function createPanZoomEndHandler({ zoomPanValues, panOnDrag, panOnScroll, onDraggingChange, onPanZoomEnd, onPaneContextMenu }) {
  return (event) => {
    if (!event.sourceEvent?.internal && (zoomPanValues.isZoomingOrPanning = !1, onPaneContextMenu && isRightClickPan(panOnDrag, zoomPanValues.mouseButton ?? 0) && !zoomPanValues.usedRightMouseButton && event.sourceEvent && onPaneContextMenu(event.sourceEvent), zoomPanValues.usedRightMouseButton = !1, onDraggingChange(!1), onPanZoomEnd)) {
      let viewport = transformToViewport(event.transform);
      zoomPanValues.prevViewport = viewport, clearTimeout(zoomPanValues.timerId), zoomPanValues.timerId = setTimeout(
        () => {
          onPanZoomEnd?.(event.sourceEvent, viewport);
        },
        // we need a setTimeout for panOnScroll to suppress multiple end events fired during scroll
        panOnScroll ? 150 : 0
      );
    }
  };
}
function createFilter({ panActivationKeyPressed, zoomActivationKeyPressed, zoomOnScroll, zoomOnPinch, panOnDrag, panOnScroll, zoomOnDoubleClick, userSelectionActive, noWheelClassName, noPanClassName, lib, connectionInProgress }) {
  return (event) => {
    let zoomScroll = zoomActivationKeyPressed || zoomOnScroll, pinchZoom = zoomOnPinch && event.ctrlKey, isWheelEvent = event.type === "wheel";
    if (event.button === 1 && event.type === "mousedown" && (isWrappedWithClass(event, `${lib}-flow__node`) || isWrappedWithClass(event, `${lib}-flow__edge`) || isWrappedWithClass(event, `${lib}-flow__selection`) || isWrappedWithClass(event, `${lib}-flow__nodesselection`)))
      return !0;
    if (!panOnDrag && !zoomScroll && !panOnScroll && !zoomOnDoubleClick && !zoomOnPinch || userSelectionActive || connectionInProgress && !isWheelEvent || isWrappedWithClass(event, noWheelClassName) && isWheelEvent || isWrappedWithClass(event, noPanClassName) && (!isWheelEvent || panOnScroll && isWheelEvent && !zoomActivationKeyPressed) || !zoomOnPinch && event.ctrlKey && isWheelEvent)
      return !1;
    if (!zoomOnPinch && event.type === "touchstart" && event.touches?.length > 1)
      return event.preventDefault(), !1;
    if (!zoomScroll && !panOnScroll && !pinchZoom && isWheelEvent || !panOnDrag && (event.type === "mousedown" || event.type === "touchstart") || Array.isArray(panOnDrag) && !panOnDrag.includes(event.button) && event.type === "mousedown")
      return !1;
    let buttonAllowed = Array.isArray(panOnDrag) && panOnDrag.includes(event.button) || !event.button || event.button <= 1;
    return (!event.ctrlKey || isWheelEvent || panActivationKeyPressed) && buttonAllowed;
  };
}
function XYPanZoom({ domNode, minZoom, maxZoom, translateExtent, viewport, onPanZoom, onPanZoomStart, onPanZoomEnd, onDraggingChange }) {
  let zoomPanValues = {
    isZoomingOrPanning: !1,
    usedRightMouseButton: !1,
    prevViewport: {},
    mouseButton: 0,
    timerId: void 0,
    panScrollTimeout: void 0,
    isPanScrolling: !1
  }, bbox = domNode.getBoundingClientRect(), cachedExtent = [
    [0, 0],
    [bbox.width, bbox.height]
  ], extentResizeObserver = typeof ResizeObserver < "u" ? new ResizeObserver((entries) => {
    let entry = entries[0];
    entry?.contentRect && (cachedExtent = [
      [0, 0],
      [entry.contentRect.width, entry.contentRect.height]
    ]);
  }) : null;
  extentResizeObserver?.observe(domNode);
  let d3ZoomInstance = zoom2().extent(() => cachedExtent).scaleExtent([minZoom, maxZoom]).translateExtent(translateExtent), d3Selection = select(domNode).call(d3ZoomInstance);
  setViewportConstrained({
    x: viewport.x,
    y: viewport.y,
    zoom: clamp(viewport.zoom, minZoom, maxZoom)
  }, [
    [0, 0],
    [bbox.width, bbox.height]
  ], translateExtent);
  let d3ZoomHandler = d3Selection.on("wheel.zoom"), d3DblClickZoomHandler = d3Selection.on("dblclick.zoom");
  d3ZoomInstance.wheelDelta(wheelDelta);
  async function setTransform(transform2, options) {
    return d3Selection ? new Promise((resolve) => {
      d3ZoomInstance?.interpolate(options?.interpolate === "linear" ? value : zoom).transform(getD3Transition(d3Selection, options?.duration, options?.ease, () => resolve(!0)), transform2);
    }) : !1;
  }
  function update({ noWheelClassName, noPanClassName, onPaneContextMenu, userSelectionActive, panOnScroll, panOnDrag, panOnScrollMode, panOnScrollSpeed, preventScrolling, zoomOnPinch, zoomOnScroll, zoomOnDoubleClick, panActivationKeyPressed = !1, zoomActivationKeyPressed, lib, onTransformChange, connectionInProgress, paneClickDistance, selectionOnDrag }) {
    userSelectionActive && !zoomPanValues.isZoomingOrPanning && d3ZoomInstance.on("zoom", null);
    let isPanOnScroll = panOnScroll && !zoomActivationKeyPressed && !userSelectionActive;
    d3ZoomInstance.clickDistance(selectionOnDrag ? 1 / 0 : !isNumeric(paneClickDistance) || paneClickDistance < 0 ? 0 : paneClickDistance);
    let wheelHandler = isPanOnScroll ? createPanOnScrollHandler({
      zoomPanValues,
      noWheelClassName,
      d3Selection,
      d3Zoom: d3ZoomInstance,
      panOnScrollMode,
      panOnScrollSpeed,
      zoomOnPinch,
      onPanZoomStart,
      onPanZoom,
      onPanZoomEnd
    }) : createZoomOnScrollHandler({
      noWheelClassName,
      preventScrolling,
      d3ZoomHandler
    });
    d3Selection.on("wheel.zoom", wheelHandler, { passive: !1 });
    let startHandler = createPanZoomStartHandler({
      zoomPanValues,
      onDraggingChange,
      onPanZoomStart
    });
    d3ZoomInstance.on("start", startHandler);
    let panZoomHandler = createPanZoomHandler({
      zoomPanValues,
      panOnDrag,
      onPaneContextMenu: !!onPaneContextMenu,
      onPanZoom,
      onTransformChange
    });
    d3ZoomInstance.on("zoom", panZoomHandler);
    let panZoomEndHandler = createPanZoomEndHandler({
      zoomPanValues,
      panOnDrag,
      panOnScroll,
      onPaneContextMenu,
      onPanZoomEnd,
      onDraggingChange
    });
    d3ZoomInstance.on("end", panZoomEndHandler);
    let filter2 = createFilter({
      panActivationKeyPressed,
      zoomActivationKeyPressed,
      panOnDrag,
      zoomOnScroll,
      panOnScroll,
      zoomOnDoubleClick,
      zoomOnPinch,
      userSelectionActive,
      noPanClassName,
      noWheelClassName,
      lib,
      connectionInProgress
    });
    d3ZoomInstance.filter(filter2), zoomOnDoubleClick ? d3Selection.on("dblclick.zoom", d3DblClickZoomHandler) : d3Selection.on("dblclick.zoom", null);
  }
  function destroy() {
    d3ZoomInstance.on("zoom", null), extentResizeObserver?.disconnect();
  }
  async function setViewportConstrained(viewport2, extent, translateExtent2) {
    let nextTransform = viewportToTransform(viewport2), contrainedTransform = d3ZoomInstance?.constrain()(nextTransform, extent, translateExtent2);
    return contrainedTransform && await setTransform(contrainedTransform), contrainedTransform;
  }
  async function setViewport(viewport2, options) {
    let nextTransform = viewportToTransform(viewport2);
    return await setTransform(nextTransform, options), nextTransform;
  }
  function syncViewport(viewport2) {
    if (d3Selection) {
      let nextTransform = viewportToTransform(viewport2), currentTransform = d3Selection.property("__zoom");
      (currentTransform.k !== viewport2.zoom || currentTransform.x !== viewport2.x || currentTransform.y !== viewport2.y) && d3ZoomInstance?.transform(d3Selection, nextTransform, null, { sync: !0 });
    }
  }
  function getViewport() {
    let transform2 = d3Selection ? transform(d3Selection.node()) : { x: 0, y: 0, k: 1 };
    return { x: transform2.x, y: transform2.y, zoom: transform2.k };
  }
  async function scaleTo(zoom3, options) {
    return d3Selection ? new Promise((resolve) => {
      d3ZoomInstance?.interpolate(options?.interpolate === "linear" ? value : zoom).scaleTo(getD3Transition(d3Selection, options?.duration, options?.ease, () => resolve(!0)), zoom3);
    }) : !1;
  }
  async function scaleBy(factor, options) {
    return d3Selection ? new Promise((resolve) => {
      d3ZoomInstance?.interpolate(options?.interpolate === "linear" ? value : zoom).scaleBy(getD3Transition(d3Selection, options?.duration, options?.ease, () => resolve(!0)), factor);
    }) : !1;
  }
  function setScaleExtent(scaleExtent) {
    d3ZoomInstance?.scaleExtent(scaleExtent);
  }
  function setTranslateExtent(translateExtent2) {
    d3ZoomInstance?.translateExtent(translateExtent2);
  }
  function setClickDistance(distance2) {
    let validDistance = !isNumeric(distance2) || distance2 < 0 ? 0 : distance2;
    d3ZoomInstance?.clickDistance(validDistance);
  }
  return {
    update,
    destroy,
    setViewport,
    setViewportConstrained,
    getViewport,
    scaleTo,
    scaleBy,
    setScaleExtent,
    setTranslateExtent,
    syncViewport,
    setClickDistance
  };
}
var ResizeControlVariant;
(function(ResizeControlVariant2) {
  ResizeControlVariant2.Line = "line", ResizeControlVariant2.Handle = "handle";
})(ResizeControlVariant || (ResizeControlVariant = {}));
function getResizeDirection({ width, prevWidth, height, prevHeight, affectsX, affectsY }) {
  let deltaWidth = width - prevWidth, deltaHeight = height - prevHeight, direction = [deltaWidth > 0 ? 1 : deltaWidth < 0 ? -1 : 0, deltaHeight > 0 ? 1 : deltaHeight < 0 ? -1 : 0];
  return deltaWidth && affectsX && (direction[0] = direction[0] * -1), deltaHeight && affectsY && (direction[1] = direction[1] * -1), direction;
}
function getControlDirection(controlPosition) {
  let isHorizontal = controlPosition.includes("right") || controlPosition.includes("left"), isVertical = controlPosition.includes("bottom") || controlPosition.includes("top"), affectsX = controlPosition.includes("left"), affectsY = controlPosition.includes("top");
  return {
    isHorizontal,
    isVertical,
    affectsX,
    affectsY
  };
}
function getLowerExtentClamp(lowerExtent, lowerBound) {
  return Math.max(0, lowerBound - lowerExtent);
}
function getUpperExtentClamp(upperExtent, upperBound) {
  return Math.max(0, upperExtent - upperBound);
}
function getSizeClamp(size, minSize, maxSize) {
  return Math.max(0, minSize - size, size - maxSize);
}
function xor(a, b) {
  return a ? !b : b;
}
function getDimensionsAfterResize(startValues, controlDirection, pointerPosition, boundaries, keepAspectRatio, nodeOrigin, extent, childExtent) {
  let { affectsX, affectsY } = controlDirection, { isHorizontal, isVertical } = controlDirection, isDiagonal = isHorizontal && isVertical, { xSnapped, ySnapped } = pointerPosition, { minWidth, maxWidth, minHeight, maxHeight } = boundaries, { x: startX, y: startY, width: startWidth, height: startHeight, aspectRatio } = startValues, distX = Math.floor(isHorizontal ? xSnapped - startValues.pointerX : 0), distY = Math.floor(isVertical ? ySnapped - startValues.pointerY : 0), newWidth = startWidth + (affectsX ? -distX : distX), newHeight = startHeight + (affectsY ? -distY : distY), originOffsetX = -nodeOrigin[0] * startWidth, originOffsetY = -nodeOrigin[1] * startHeight, clampX = getSizeClamp(newWidth, minWidth, maxWidth), clampY = getSizeClamp(newHeight, minHeight, maxHeight);
  if (extent) {
    let xExtentClamp = 0, yExtentClamp = 0;
    affectsX && distX < 0 ? xExtentClamp = getLowerExtentClamp(startX + distX + originOffsetX, extent[0][0]) : !affectsX && distX > 0 && (xExtentClamp = getUpperExtentClamp(startX + newWidth + originOffsetX, extent[1][0])), affectsY && distY < 0 ? yExtentClamp = getLowerExtentClamp(startY + distY + originOffsetY, extent[0][1]) : !affectsY && distY > 0 && (yExtentClamp = getUpperExtentClamp(startY + newHeight + originOffsetY, extent[1][1])), clampX = Math.max(clampX, xExtentClamp), clampY = Math.max(clampY, yExtentClamp);
  }
  if (childExtent) {
    let xExtentClamp = 0, yExtentClamp = 0;
    affectsX && distX > 0 ? xExtentClamp = getUpperExtentClamp(startX + distX, childExtent[0][0]) : !affectsX && distX < 0 && (xExtentClamp = getLowerExtentClamp(startX + newWidth, childExtent[1][0])), affectsY && distY > 0 ? yExtentClamp = getUpperExtentClamp(startY + distY, childExtent[0][1]) : !affectsY && distY < 0 && (yExtentClamp = getLowerExtentClamp(startY + newHeight, childExtent[1][1])), clampX = Math.max(clampX, xExtentClamp), clampY = Math.max(clampY, yExtentClamp);
  }
  if (keepAspectRatio) {
    if (isHorizontal) {
      let aspectHeightClamp = getSizeClamp(newWidth / aspectRatio, minHeight, maxHeight) * aspectRatio;
      if (clampX = Math.max(clampX, aspectHeightClamp), extent) {
        let aspectExtentClamp = 0;
        !affectsX && !affectsY || affectsX && !affectsY && isDiagonal ? aspectExtentClamp = getUpperExtentClamp(startY + originOffsetY + newWidth / aspectRatio, extent[1][1]) * aspectRatio : aspectExtentClamp = getLowerExtentClamp(startY + originOffsetY + (affectsX ? distX : -distX) / aspectRatio, extent[0][1]) * aspectRatio, clampX = Math.max(clampX, aspectExtentClamp);
      }
      if (childExtent) {
        let aspectExtentClamp = 0;
        !affectsX && !affectsY || affectsX && !affectsY && isDiagonal ? aspectExtentClamp = getLowerExtentClamp(startY + newWidth / aspectRatio, childExtent[1][1]) * aspectRatio : aspectExtentClamp = getUpperExtentClamp(startY + (affectsX ? distX : -distX) / aspectRatio, childExtent[0][1]) * aspectRatio, clampX = Math.max(clampX, aspectExtentClamp);
      }
    }
    if (isVertical) {
      let aspectWidthClamp = getSizeClamp(newHeight * aspectRatio, minWidth, maxWidth) / aspectRatio;
      if (clampY = Math.max(clampY, aspectWidthClamp), extent) {
        let aspectExtentClamp = 0;
        !affectsX && !affectsY || affectsY && !affectsX && isDiagonal ? aspectExtentClamp = getUpperExtentClamp(startX + newHeight * aspectRatio + originOffsetX, extent[1][0]) / aspectRatio : aspectExtentClamp = getLowerExtentClamp(startX + (affectsY ? distY : -distY) * aspectRatio + originOffsetX, extent[0][0]) / aspectRatio, clampY = Math.max(clampY, aspectExtentClamp);
      }
      if (childExtent) {
        let aspectExtentClamp = 0;
        !affectsX && !affectsY || affectsY && !affectsX && isDiagonal ? aspectExtentClamp = getLowerExtentClamp(startX + newHeight * aspectRatio, childExtent[1][0]) / aspectRatio : aspectExtentClamp = getUpperExtentClamp(startX + (affectsY ? distY : -distY) * aspectRatio, childExtent[0][0]) / aspectRatio, clampY = Math.max(clampY, aspectExtentClamp);
      }
    }
  }
  distY = distY + (distY < 0 ? clampY : -clampY), distX = distX + (distX < 0 ? clampX : -clampX), keepAspectRatio && (isDiagonal ? newWidth > newHeight * aspectRatio ? distY = (xor(affectsX, affectsY) ? -distX : distX) / aspectRatio : distX = (xor(affectsX, affectsY) ? -distY : distY) * aspectRatio : isHorizontal ? (distY = distX / aspectRatio, affectsY = affectsX) : (distX = distY * aspectRatio, affectsX = affectsY));
  let x = affectsX ? startX + distX : startX, y = affectsY ? startY + distY : startY;
  return {
    width: startWidth + (affectsX ? -distX : distX),
    height: startHeight + (affectsY ? -distY : distY),
    x: nodeOrigin[0] * distX * (affectsX ? -1 : 1) + x,
    y: nodeOrigin[1] * distY * (affectsY ? -1 : 1) + y
  };
}
var initPrevValues = { width: 0, height: 0, x: 0, y: 0 }, initStartValues = {
  ...initPrevValues,
  pointerX: 0,
  pointerY: 0,
  aspectRatio: 1
};
function nodeToChildExtent(child, parent, nodeOrigin) {
  let x = parent.position.x + child.position.x, y = parent.position.y + child.position.y, width = child.measured.width ?? 0, height = child.measured.height ?? 0, originOffsetX = nodeOrigin[0] * width, originOffsetY = nodeOrigin[1] * height;
  return [
    [x - originOffsetX, y - originOffsetY],
    [x + width - originOffsetX, y + height - originOffsetY]
  ];
}
function XYResizer({ domNode, nodeId, getStoreItems, onChange, onEnd }) {
  let selection2 = select(domNode), params = {
    controlDirection: getControlDirection("bottom-right"),
    boundaries: {
      minWidth: 0,
      minHeight: 0,
      maxWidth: Number.MAX_VALUE,
      maxHeight: Number.MAX_VALUE
    },
    resizeDirection: void 0,
    keepAspectRatio: !1
  };
  function update({ controlPosition, boundaries, keepAspectRatio, resizeDirection, onResizeStart, onResize, onResizeEnd, shouldResize }) {
    let prevValues = { ...initPrevValues }, startValues = { ...initStartValues };
    params = {
      boundaries,
      resizeDirection,
      keepAspectRatio,
      controlDirection: getControlDirection(controlPosition)
    };
    let node, containerBounds = null, childNodes = [], parentNode, nodeExtent, childExtent, dragHandler = drag().on("start", (event) => {
      let { nodeLookup, transform: transform2, snapGrid, snapToGrid, nodeOrigin, paneDomNode } = getStoreItems();
      if (node = nodeLookup.get(nodeId), !node)
        return;
      containerBounds = paneDomNode?.getBoundingClientRect() ?? null;
      let { xSnapped, ySnapped } = getPointerPosition(event.sourceEvent, {
        transform: transform2,
        snapGrid,
        snapToGrid,
        containerBounds
      });
      prevValues = {
        width: node.measured.width ?? 0,
        height: node.measured.height ?? 0,
        x: node.position.x ?? 0,
        y: node.position.y ?? 0
      }, startValues = {
        ...prevValues,
        pointerX: xSnapped,
        pointerY: ySnapped,
        aspectRatio: prevValues.width / prevValues.height
      }, parentNode = void 0, nodeExtent = isCoordinateExtent(node.extent) ? node.extent : void 0, node.parentId && (node.extent === "parent" || node.expandParent) && (parentNode = nodeLookup.get(node.parentId)), parentNode && node.extent === "parent" && (nodeExtent = [
        [0, 0],
        [parentNode.measured.width, parentNode.measured.height]
      ]), childNodes = [], childExtent = void 0;
      for (let [childId, child] of nodeLookup)
        if (child.parentId === nodeId && (childNodes.push({
          id: childId,
          position: { ...child.position },
          extent: child.extent
        }), child.extent === "parent" || child.expandParent)) {
          let extent = nodeToChildExtent(child, node, child.origin ?? nodeOrigin);
          childExtent ? childExtent = [
            [Math.min(extent[0][0], childExtent[0][0]), Math.min(extent[0][1], childExtent[0][1])],
            [Math.max(extent[1][0], childExtent[1][0]), Math.max(extent[1][1], childExtent[1][1])]
          ] : childExtent = extent;
        }
      onResizeStart?.(event, { ...prevValues });
    }).on("drag", (event) => {
      let { transform: transform2, snapGrid, snapToGrid, nodeOrigin: storeNodeOrigin } = getStoreItems(), pointerPosition = getPointerPosition(event.sourceEvent, {
        transform: transform2,
        snapGrid,
        snapToGrid,
        containerBounds
      }), childChanges = [];
      if (!node)
        return;
      let { x: prevX, y: prevY, width: prevWidth, height: prevHeight } = prevValues, change = {}, nodeOrigin = node.origin ?? storeNodeOrigin, { width, height, x, y } = getDimensionsAfterResize(startValues, params.controlDirection, pointerPosition, params.boundaries, params.keepAspectRatio, nodeOrigin, nodeExtent, childExtent), isWidthChange = width !== prevWidth, isHeightChange = height !== prevHeight, isXPosChange = x !== prevX && isWidthChange, isYPosChange = y !== prevY && isHeightChange;
      if (!isXPosChange && !isYPosChange && !isWidthChange && !isHeightChange)
        return;
      let lastValid = {
        prevValues: { ...prevValues },
        startX: startValues.x,
        startY: startValues.y,
        childNodes: childNodes.map((child) => ({
          ...child,
          position: { ...child.position }
        }))
      };
      if ((isXPosChange || isYPosChange || nodeOrigin[0] === 1 || nodeOrigin[1] === 1) && (change.x = isXPosChange ? x : prevValues.x, change.y = isYPosChange ? y : prevValues.y, prevValues.x = change.x, prevValues.y = change.y, childNodes.length > 0)) {
        let xChange = x - prevX, yChange = y - prevY;
        for (let childNode of childNodes)
          childNode.position = {
            x: childNode.position.x - xChange + nodeOrigin[0] * (width - prevWidth),
            y: childNode.position.y - yChange + nodeOrigin[1] * (height - prevHeight)
          }, childChanges.push(childNode);
      }
      if ((isWidthChange || isHeightChange) && (change.width = isWidthChange && (!params.resizeDirection || params.resizeDirection === "horizontal") ? width : prevValues.width, change.height = isHeightChange && (!params.resizeDirection || params.resizeDirection === "vertical") ? height : prevValues.height, prevValues.width = change.width, prevValues.height = change.height), parentNode && node.expandParent) {
        let xLimit = nodeOrigin[0] * (change.width ?? 0);
        change.x && change.x < xLimit && (prevValues.x = xLimit, startValues.x = startValues.x - (change.x - xLimit));
        let yLimit = nodeOrigin[1] * (change.height ?? 0);
        change.y && change.y < yLimit && (prevValues.y = yLimit, startValues.y = startValues.y - (change.y - yLimit));
      }
      let direction = getResizeDirection({
        width: prevValues.width,
        prevWidth,
        height: prevValues.height,
        prevHeight,
        affectsX: params.controlDirection.affectsX,
        affectsY: params.controlDirection.affectsY
      }), nextValues = { ...prevValues, direction };
      if (shouldResize?.(event, nextValues) === !1) {
        prevValues = lastValid.prevValues, startValues.x = lastValid.startX, startValues.y = lastValid.startY, childNodes.forEach((child, i) => {
          child.position = lastValid.childNodes[i].position;
        });
        return;
      }
      onResize?.(event, nextValues), onChange(change, childChanges);
    }).on("end", (event) => {
      onResizeEnd?.(event, { ...prevValues }), onEnd?.({ ...prevValues });
    });
    selection2.call(dragHandler);
  }
  function destroy() {
    selection2.on(".drag", null);
  }
  return {
    update,
    destroy
  };
}

// node_modules/zustand/esm/traditional.mjs
init_define_import_meta_env();
var import_with_selector = __toESM(require_with_selector(), 1);
import ReactExports from "react";

// node_modules/zustand/esm/vanilla.mjs
init_define_import_meta_env();
var createStoreImpl = (createState) => {
  let state, listeners = /* @__PURE__ */ new Set(), setState = (partial, replace) => {
    let nextState = typeof partial == "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      let previousState = state;
      state = replace ?? (typeof nextState != "object" || nextState === null) ? nextState : Object.assign({}, state, nextState), listeners.forEach((listener) => listener(state, previousState));
    }
  }, getState = () => state, api = { setState, getState, getInitialState: () => initialState, subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)), destroy: () => {
    (define_import_meta_env_default ? define_import_meta_env_default.MODE : void 0) !== "production" && console.warn(
      "[DEPRECATED] The `destroy` method will be unsupported in a future version. Instead use unsubscribe function returned by subscribe. Everything will be garbage-collected if store is garbage-collected."
    ), listeners.clear();
  } }, initialState = state = createState(setState, getState, api);
  return api;
}, createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;

// node_modules/zustand/esm/traditional.mjs
var { useDebugValue } = ReactExports, { useSyncExternalStoreWithSelector } = import_with_selector.default, identity3 = (arg) => arg;
function useStoreWithEqualityFn(api, selector2 = identity3, equalityFn) {
  let slice = useSyncExternalStoreWithSelector(
    api.subscribe,
    api.getState,
    api.getServerState || api.getInitialState,
    selector2,
    equalityFn
  );
  return useDebugValue(slice), slice;
}
var createWithEqualityFnImpl = (createState, defaultEqualityFn) => {
  let api = createStore(createState), useBoundStoreWithEqualityFn = (selector2, equalityFn = defaultEqualityFn) => useStoreWithEqualityFn(api, selector2, equalityFn);
  return Object.assign(useBoundStoreWithEqualityFn, api), useBoundStoreWithEqualityFn;
}, createWithEqualityFn = (createState, defaultEqualityFn) => createState ? createWithEqualityFnImpl(createState, defaultEqualityFn) : createWithEqualityFnImpl;

// node_modules/zustand/esm/shallow.mjs
init_define_import_meta_env();
function shallow$1(objA, objB) {
  if (Object.is(objA, objB))
    return !0;
  if (typeof objA != "object" || objA === null || typeof objB != "object" || objB === null)
    return !1;
  if (objA instanceof Map && objB instanceof Map) {
    if (objA.size !== objB.size) return !1;
    for (let [key, value2] of objA)
      if (!Object.is(value2, objB.get(key)))
        return !1;
    return !0;
  }
  if (objA instanceof Set && objB instanceof Set) {
    if (objA.size !== objB.size) return !1;
    for (let value2 of objA)
      if (!objB.has(value2))
        return !1;
    return !0;
  }
  let keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length)
    return !1;
  for (let keyA of keysA)
    if (!Object.prototype.hasOwnProperty.call(objB, keyA) || !Object.is(objA[keyA], objB[keyA]))
      return !1;
  return !0;
}

// src/shims/react-dom.ts
init_define_import_meta_env();
var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
function createPortal(children2, container, key) {
  if (!container || container.nodeType !== 1 && container.nodeType !== 9 && container.nodeType !== 11)
    throw new Error("Target container is not a DOM element.");
  return {
    $$typeof: REACT_PORTAL_TYPE,
    key: key == null ? null : String(key),
    children: children2,
    containerInfo: container,
    implementation: null
  };
}

// node_modules/@xyflow/react/dist/esm/index.js
var StoreContext = createContext(null), Provider$1 = StoreContext.Provider, zustandErrorMessage = errorMessages.error001("react");
function useStore(selector2, equalityFn) {
  let store = useContext(StoreContext);
  if (store === null)
    throw new Error(zustandErrorMessage);
  return useStoreWithEqualityFn(store, selector2, equalityFn);
}
function useStoreApi() {
  let store = useContext(StoreContext);
  if (store === null)
    throw new Error(zustandErrorMessage);
  return useMemo(() => ({
    getState: store.getState,
    setState: store.setState,
    subscribe: store.subscribe
  }), [store]);
}
var style = { display: "none" }, ariaLiveStyle = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  border: 0,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0px, 0px, 0px, 0px)",
  clipPath: "inset(100%)"
}, ARIA_NODE_DESC_KEY = "react-flow__node-desc", ARIA_EDGE_DESC_KEY = "react-flow__edge-desc", ARIA_LIVE_MESSAGE = "react-flow__aria-live", ariaLiveSelector = (s) => s.ariaLiveMessage, ariaLabelConfigSelector = (s) => s.ariaLabelConfig;
function AriaLiveMessage({ rfId }) {
  let ariaLiveMessage = useStore(ariaLiveSelector);
  return jsx("div", { id: `${ARIA_LIVE_MESSAGE}-${rfId}`, "aria-live": "assertive", "aria-atomic": "true", style: ariaLiveStyle, children: ariaLiveMessage });
}
function A11yDescriptions({ rfId, disableKeyboardA11y }) {
  let ariaLabelConfig = useStore(ariaLabelConfigSelector);
  return jsxs(Fragment, { children: [jsx("div", { id: `${ARIA_NODE_DESC_KEY}-${rfId}`, style, children: disableKeyboardA11y ? ariaLabelConfig["node.a11yDescription.default"] : ariaLabelConfig["node.a11yDescription.keyboardDisabled"] }), jsx("div", { id: `${ARIA_EDGE_DESC_KEY}-${rfId}`, style, children: ariaLabelConfig["edge.a11yDescription.default"] }), !disableKeyboardA11y && jsx(AriaLiveMessage, { rfId })] });
}
var Panel = forwardRef(({ position = "top-left", children: children2, className, style: style2, ...rest }, ref) => {
  let positionClasses = `${position}`.split("-");
  return jsx("div", { className: cc(["react-flow__panel", className, ...positionClasses]), style: style2, ref, ...rest, children: children2 });
});
Panel.displayName = "Panel";
var link = "https://reactflow.dev?utm_source=attribution";
function Attribution({ proOptions, position = "bottom-right" }) {
  return useEffect(() => {
  }, []), proOptions?.hideAttribution ? null : jsx(Panel, { position, className: "react-flow__attribution", "data-message": `Please only hide this attribution when you are subscribed to React Flow Pro: ${link}`, children: jsx("a", { href: link, target: "_blank", rel: "noopener noreferrer", "aria-label": "React Flow attribution", children: "React Flow" }) });
}
var selector$l = (s) => {
  let selectedNodes = [], selectedEdges = [];
  for (let [, node] of s.nodeLookup)
    node.selected && selectedNodes.push(node.internals.userNode);
  for (let [, edge] of s.edgeLookup)
    edge.selected && selectedEdges.push(edge);
  return { selectedNodes, selectedEdges };
}, selectId = (obj) => obj.id;
function areEqual$1(a, b) {
  return shallow$1(a.selectedNodes.map(selectId), b.selectedNodes.map(selectId)) && shallow$1(a.selectedEdges.map(selectId), b.selectedEdges.map(selectId));
}
function SelectionListenerInner({ onSelectionChange }) {
  let store = useStoreApi(), { selectedNodes, selectedEdges } = useStore(selector$l, areEqual$1);
  return useEffect(() => {
    let params = { nodes: selectedNodes, edges: selectedEdges };
    onSelectionChange?.(params), store.getState().onSelectionChangeHandlers.forEach((fn) => fn(params));
  }, [selectedNodes, selectedEdges, onSelectionChange]), null;
}
var changeSelector = (s) => !!s.onSelectionChangeHandlers;
function SelectionListener({ onSelectionChange }) {
  let storeHasSelectionChangeHandlers = useStore(changeSelector);
  return onSelectionChange || storeHasSelectionChangeHandlers ? jsx(SelectionListenerInner, { onSelectionChange }) : null;
}
var defaultNodeOrigin = [0, 0], defaultViewport = { x: 0, y: 0, zoom: 1 }, reactFlowFieldsToTrack = [
  "nodes",
  "edges",
  "defaultNodes",
  "defaultEdges",
  "onConnect",
  "onConnectStart",
  "onConnectEnd",
  "onClickConnectStart",
  "onClickConnectEnd",
  "nodesDraggable",
  "autoPanOnNodeFocus",
  "nodesConnectable",
  "nodesFocusable",
  "edgesFocusable",
  "edgesReconnectable",
  "elevateNodesOnSelect",
  "elevateEdgesOnSelect",
  "minZoom",
  "maxZoom",
  "nodeExtent",
  "onNodesChange",
  "onEdgesChange",
  "elementsSelectable",
  "connectionMode",
  "snapGrid",
  "snapToGrid",
  "translateExtent",
  "connectOnClick",
  "defaultEdgeOptions",
  "fitView",
  "fitViewOptions",
  "onNodesDelete",
  "onEdgesDelete",
  "onDelete",
  "onNodeDrag",
  "onNodeDragStart",
  "onNodeDragStop",
  "onSelectionDrag",
  "onSelectionDragStart",
  "onSelectionDragStop",
  "onMoveStart",
  "onMove",
  "onMoveEnd",
  "noPanClassName",
  "nodeOrigin",
  "autoPanOnConnect",
  "autoPanOnNodeDrag",
  "onError",
  "connectionRadius",
  "isValidConnection",
  "selectNodesOnDrag",
  "nodeDragThreshold",
  "connectionDragThreshold",
  "onBeforeDelete",
  "debug",
  "autoPanSpeed",
  "ariaLabelConfig",
  "zIndexMode"
], fieldsToTrack = [...reactFlowFieldsToTrack, "rfId"], selector$k = (s) => ({
  setNodes: s.setNodes,
  setEdges: s.setEdges,
  setMinZoom: s.setMinZoom,
  setMaxZoom: s.setMaxZoom,
  setTranslateExtent: s.setTranslateExtent,
  setNodeExtent: s.setNodeExtent,
  reset: s.reset,
  setDefaultNodesAndEdges: s.setDefaultNodesAndEdges
}), initPrevValues2 = {
  /*
   * these are values that are also passed directly to other components
   * than the StoreUpdater. We can reduce the number of setStore calls
   * by setting the same values here as prev fields.
   */
  translateExtent: infiniteExtent,
  nodeOrigin: defaultNodeOrigin,
  minZoom: 0.5,
  maxZoom: 2,
  elementsSelectable: !0,
  noPanClassName: "nopan",
  rfId: "1"
};
function StoreUpdater(props) {
  let { setNodes, setEdges, setMinZoom, setMaxZoom, setTranslateExtent, setNodeExtent, reset, setDefaultNodesAndEdges } = useStore(selector$k, shallow$1), store = useStoreApi();
  useEffect(() => (setDefaultNodesAndEdges(props.defaultNodes, props.defaultEdges), () => {
    previousFields.current = initPrevValues2, reset();
  }), []);
  let previousFields = useRef(initPrevValues2);
  return useEffect(
    () => {
      for (let fieldName of fieldsToTrack) {
        let fieldValue = props[fieldName], previousFieldValue = previousFields.current[fieldName];
        fieldValue !== previousFieldValue && (typeof props[fieldName] > "u" || (fieldName === "nodes" ? setNodes(fieldValue) : fieldName === "edges" ? setEdges(fieldValue) : fieldName === "minZoom" ? setMinZoom(fieldValue) : fieldName === "maxZoom" ? setMaxZoom(fieldValue) : fieldName === "translateExtent" ? setTranslateExtent(fieldValue) : fieldName === "nodeExtent" ? setNodeExtent(fieldValue) : fieldName === "ariaLabelConfig" ? store.setState({ ariaLabelConfig: mergeAriaLabelConfig(fieldValue) }) : fieldName === "fitView" ? store.setState({ fitViewQueued: fieldValue }) : fieldName === "fitViewOptions" ? store.setState({ fitViewOptions: fieldValue }) : store.setState({ [fieldName]: fieldValue })));
      }
      previousFields.current = props;
    },
    // Only re-run the effect if one of the fields we track changes
    fieldsToTrack.map((fieldName) => props[fieldName])
  ), null;
}
function getMediaQuery() {
  return typeof window > "u" || !window.matchMedia ? null : window.matchMedia("(prefers-color-scheme: dark)");
}
function useColorModeClass(colorMode) {
  let [colorModeClass, setColorModeClass] = useState(colorMode === "system" ? null : colorMode);
  return useEffect(() => {
    if (colorMode !== "system") {
      setColorModeClass(colorMode);
      return;
    }
    let mediaQuery = getMediaQuery(), updateColorModeClass = () => setColorModeClass(mediaQuery?.matches ? "dark" : "light");
    return updateColorModeClass(), mediaQuery?.addEventListener("change", updateColorModeClass), () => {
      mediaQuery?.removeEventListener("change", updateColorModeClass);
    };
  }, [colorMode]), colorModeClass !== null ? colorModeClass : getMediaQuery()?.matches ? "dark" : "light";
}
var defaultDoc = typeof document < "u" ? document : null;
function useKeyPress(keyCode = null, options = { target: defaultDoc, actInsideInputWithModifier: !0 }) {
  let [keyPressed, setKeyPressed] = useState(!1), modifierPressed = useRef(!1), pressedKeys = useRef(/* @__PURE__ */ new Set([])), [keyCodes, keysToWatch] = useMemo(() => {
    if (keyCode !== null) {
      let keys = (Array.isArray(keyCode) ? keyCode : [keyCode]).filter((kc) => typeof kc == "string").map((kc) => kc.replace(/\+/g, `
`).replace(`

`, `
+`).split(`
`)), keysFlat = keys.reduce((res, item) => res.concat(...item), []);
      return [keys, keysFlat];
    }
    return [[], []];
  }, [keyCode]);
  return useEffect(() => {
    let target = options?.target ?? defaultDoc, actInsideInputWithModifier = options?.actInsideInputWithModifier ?? !0;
    if (keyCode !== null) {
      let downHandler = (event) => {
        if (modifierPressed.current = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey, (!modifierPressed.current || modifierPressed.current && !actInsideInputWithModifier) && isInputDOMNode(event))
          return !1;
        let keyOrCode = useKeyOrCode(event.code, keysToWatch);
        if (pressedKeys.current.add(event[keyOrCode]), isMatchingKey(keyCodes, pressedKeys.current, !1)) {
          let target2 = event.composedPath?.()?.[0] || event.target, isInteractiveElement = target2?.nodeName === "BUTTON" || target2?.nodeName === "A";
          options.preventDefault !== !1 && (modifierPressed.current || !isInteractiveElement) && event.preventDefault(), setKeyPressed(!0);
        }
      }, upHandler = (event) => {
        let keyOrCode = useKeyOrCode(event.code, keysToWatch);
        isMatchingKey(keyCodes, pressedKeys.current, !0) ? (setKeyPressed(!1), pressedKeys.current.clear()) : pressedKeys.current.delete(event[keyOrCode]), event.key === "Meta" && pressedKeys.current.clear(), modifierPressed.current = !1;
      }, resetHandler = () => {
        pressedKeys.current.clear(), setKeyPressed(!1);
      };
      return target?.addEventListener("keydown", downHandler), target?.addEventListener("keyup", upHandler), window.addEventListener("blur", resetHandler), window.addEventListener("contextmenu", resetHandler), () => {
        target?.removeEventListener("keydown", downHandler), target?.removeEventListener("keyup", upHandler), window.removeEventListener("blur", resetHandler), window.removeEventListener("contextmenu", resetHandler);
      };
    }
  }, [keyCode, setKeyPressed]), keyPressed;
}
function isMatchingKey(keyCodes, pressedKeys, isUp) {
  return keyCodes.filter((keys) => isUp || keys.length === pressedKeys.size).some((keys) => keys.every((k) => pressedKeys.has(k)));
}
function useKeyOrCode(eventCode, keysToWatch) {
  return keysToWatch.includes(eventCode) ? "code" : "key";
}
var useViewportHelper = () => {
  let store = useStoreApi();
  return useMemo(() => ({
    zoomIn: async (options) => {
      let { panZoom } = store.getState();
      return panZoom ? panZoom.scaleBy(1.2, options) : !1;
    },
    zoomOut: async (options) => {
      let { panZoom } = store.getState();
      return panZoom ? panZoom.scaleBy(1 / 1.2, options) : !1;
    },
    zoomTo: async (zoomLevel, options) => {
      let { panZoom } = store.getState();
      return panZoom ? panZoom.scaleTo(zoomLevel, options) : !1;
    },
    getZoom: () => store.getState().transform[2],
    setViewport: async (viewport, options) => {
      let { transform: [tX, tY, tZoom], panZoom } = store.getState();
      return panZoom ? (await panZoom.setViewport({
        x: viewport.x ?? tX,
        y: viewport.y ?? tY,
        zoom: viewport.zoom ?? tZoom
      }, options), !0) : !1;
    },
    getViewport: () => {
      let [x, y, zoom3] = store.getState().transform;
      return { x, y, zoom: zoom3 };
    },
    setCenter: async (x, y, options) => store.getState().setCenter(x, y, options),
    fitBounds: async (bounds, options) => {
      let { width, height, minZoom, maxZoom, panZoom } = store.getState(), viewport = getViewportForBounds(bounds, width, height, minZoom, maxZoom, options?.padding ?? 0.1);
      return panZoom ? (await panZoom.setViewport(viewport, {
        duration: options?.duration,
        ease: options?.ease,
        interpolate: options?.interpolate
      }), !0) : !1;
    },
    screenToFlowPosition: (clientPosition, options = {}) => {
      let { transform: transform2, snapGrid, snapToGrid, domNode } = store.getState();
      if (!domNode)
        return clientPosition;
      let { x: domX, y: domY } = domNode.getBoundingClientRect(), correctedPosition = {
        x: clientPosition.x - domX,
        y: clientPosition.y - domY
      }, _snapGrid = options.snapGrid ?? snapGrid, _snapToGrid = options.snapToGrid ?? snapToGrid;
      return pointToRendererPoint(correctedPosition, transform2, _snapToGrid, _snapGrid);
    },
    flowToScreenPosition: (flowPosition) => {
      let { transform: transform2, domNode } = store.getState();
      if (!domNode)
        return flowPosition;
      let { x: domX, y: domY } = domNode.getBoundingClientRect(), rendererPosition = rendererPointToPoint(flowPosition, transform2);
      return {
        x: rendererPosition.x + domX,
        y: rendererPosition.y + domY
      };
    }
  }), []);
};
function applyChanges(changes, elements) {
  let updatedElements = [], changesMap = /* @__PURE__ */ new Map(), addItemChanges = [];
  for (let change of changes)
    if (change.type === "add") {
      addItemChanges.push(change);
      continue;
    } else if (change.type === "remove" || change.type === "replace")
      changesMap.set(change.id, [change]);
    else {
      let elementChanges = changesMap.get(change.id);
      elementChanges ? elementChanges.push(change) : changesMap.set(change.id, [change]);
    }
  for (let element of elements) {
    let changes2 = changesMap.get(element.id);
    if (!changes2) {
      updatedElements.push(element);
      continue;
    }
    if (changes2[0].type === "remove")
      continue;
    if (changes2[0].type === "replace") {
      updatedElements.push({ ...changes2[0].item });
      continue;
    }
    let updatedElement = { ...element };
    for (let change of changes2)
      applyChange(change, updatedElement);
    updatedElements.push(updatedElement);
  }
  return addItemChanges.length && addItemChanges.forEach((change) => {
    change.index !== void 0 ? updatedElements.splice(change.index, 0, { ...change.item }) : updatedElements.push({ ...change.item });
  }), updatedElements;
}
function applyChange(change, element) {
  switch (change.type) {
    case "select": {
      element.selected = change.selected;
      break;
    }
    case "position": {
      typeof change.position < "u" && (element.position = change.position), typeof change.dragging < "u" && (element.dragging = change.dragging);
      break;
    }
    case "dimensions": {
      typeof change.dimensions < "u" && (element.measured = {
        ...change.dimensions
      }, change.setAttributes && ((change.setAttributes === !0 || change.setAttributes === "width") && (element.width = change.dimensions.width), (change.setAttributes === !0 || change.setAttributes === "height") && (element.height = change.dimensions.height))), typeof change.resizing == "boolean" && (element.resizing = change.resizing);
      break;
    }
  }
}
function applyNodeChanges(changes, nodes) {
  return applyChanges(changes, nodes);
}
function applyEdgeChanges(changes, edges) {
  return applyChanges(changes, edges);
}
function createSelectionChange(id2, selected2) {
  return {
    id: id2,
    type: "select",
    selected: selected2
  };
}
function getSelectionChanges(items, selectedIds = /* @__PURE__ */ new Set()) {
  let changes = [];
  for (let [id2, item] of items) {
    let willBeSelected = selectedIds.has(id2);
    !(item.selected === void 0 && !willBeSelected) && item.selected !== willBeSelected && changes.push(createSelectionChange(item.id, willBeSelected));
  }
  return changes;
}
function getElementsDiffChanges({ items = [], lookup }) {
  let changes = [], itemsLookup = new Map(items.map((item) => [item.id, item]));
  for (let [index2, item] of items.entries()) {
    let lookupItem = lookup.get(item.id), storeItem = lookupItem?.internals?.userNode ?? lookupItem;
    storeItem !== void 0 && storeItem !== item && changes.push({ id: item.id, item, type: "replace" }), storeItem === void 0 && changes.push({ item, type: "add", index: index2 });
  }
  for (let [id2] of lookup)
    itemsLookup.get(id2) === void 0 && changes.push({ id: id2, type: "remove" });
  return changes;
}
function elementToRemoveChange(item) {
  return {
    id: item.id,
    type: "remove"
  };
}
var defaultOnError = createDevWarn("React Flow", "https://reactflow.dev/");
function addEdge2(edgeParams, edges, options = {}) {
  return addEdge(edgeParams, edges, {
    ...options,
    onError: options.onError ?? defaultOnError
  });
}
var isNode = (element) => isNodeBase(element), isEdge = (element) => isEdgeBase(element);
function fixedForwardRef(render) {
  return forwardRef(render);
}
var useIsomorphicLayoutEffect = typeof window < "u" ? useLayoutEffect : useEffect;
function useQueue(runQueue) {
  let [serial, setSerial] = useState(BigInt(0)), [queue] = useState(() => createQueue(() => setSerial((n) => n + BigInt(1))));
  return useIsomorphicLayoutEffect(() => {
    let queueItems = queue.get();
    queueItems.length && (runQueue(queueItems), queue.reset());
  }, [serial]), queue;
}
function createQueue(cb) {
  let queue = [];
  return {
    get: () => queue,
    reset: () => {
      queue = [];
    },
    push: (item) => {
      queue.push(item), cb();
    }
  };
}
var BatchContext = createContext(null);
function BatchProvider({ children: children2 }) {
  let store = useStoreApi(), nodeQueueHandler = useCallback((queueItems) => {
    let { nodes = [], setNodes, hasDefaultNodes, onNodesChange, nodeLookup, fitViewQueued, onNodesChangeMiddlewareMap } = store.getState(), next = nodes;
    for (let payload of queueItems)
      next = typeof payload == "function" ? payload(next) : payload;
    let changes = getElementsDiffChanges({
      items: next,
      lookup: nodeLookup
    });
    for (let middleware of onNodesChangeMiddlewareMap.values())
      changes = middleware(changes);
    hasDefaultNodes && setNodes(next), changes.length > 0 ? onNodesChange?.(changes) : fitViewQueued && window.requestAnimationFrame(() => {
      let { fitViewQueued: fitViewQueued2, nodes: nodes2, setNodes: setNodes2 } = store.getState();
      fitViewQueued2 && setNodes2(nodes2);
    });
  }, []), nodeQueue = useQueue(nodeQueueHandler), edgeQueueHandler = useCallback((queueItems) => {
    let { edges = [], setEdges, hasDefaultEdges, onEdgesChange, edgeLookup } = store.getState(), next = edges;
    for (let payload of queueItems)
      next = typeof payload == "function" ? payload(next) : payload;
    hasDefaultEdges ? setEdges(next) : onEdgesChange && onEdgesChange(getElementsDiffChanges({
      items: next,
      lookup: edgeLookup
    }));
  }, []), edgeQueue = useQueue(edgeQueueHandler), value2 = useMemo(() => ({ nodeQueue, edgeQueue }), []);
  return jsx(BatchContext.Provider, { value: value2, children: children2 });
}
function useBatchContext() {
  let batchContext = useContext(BatchContext);
  if (!batchContext)
    throw new Error("useBatchContext must be used within a BatchProvider");
  return batchContext;
}
var selector$j = (s) => !!s.panZoom;
function useReactFlow() {
  let viewportHelper = useViewportHelper(), store = useStoreApi(), batchContext = useBatchContext(), viewportInitialized = useStore(selector$j), generalHelper = useMemo(() => {
    let getInternalNode = (id2) => store.getState().nodeLookup.get(id2), setNodes = (payload) => {
      batchContext.nodeQueue.push(payload);
    }, setEdges = (payload) => {
      batchContext.edgeQueue.push(payload);
    }, getNodeRect = (node) => {
      let { nodeLookup, nodeOrigin } = store.getState(), nodeToUse = isNode(node) ? node : nodeLookup.get(node.id), position = nodeToUse.parentId ? evaluateAbsolutePosition(nodeToUse.position, nodeToUse.measured, nodeToUse.parentId, nodeLookup, nodeOrigin) : nodeToUse.position, nodeWithPosition = {
        ...nodeToUse,
        position,
        width: nodeToUse.measured?.width ?? nodeToUse.width,
        height: nodeToUse.measured?.height ?? nodeToUse.height
      };
      return nodeToRect(nodeWithPosition, nodeToUse.parentId ? void 0 : nodeOrigin);
    }, updateNode = (id2, nodeUpdate, options = { replace: !1 }) => {
      setNodes((prevNodes) => prevNodes.map((node) => {
        if (node.id === id2) {
          let nextNode = typeof nodeUpdate == "function" ? nodeUpdate(node) : nodeUpdate;
          return options.replace && isNode(nextNode) ? nextNode : { ...node, ...nextNode };
        }
        return node;
      }));
    }, updateEdge = (id2, edgeUpdate, options = { replace: !1 }) => {
      setEdges((prevEdges) => prevEdges.map((edge) => {
        if (edge.id === id2) {
          let nextEdge = typeof edgeUpdate == "function" ? edgeUpdate(edge) : edgeUpdate;
          return options.replace && isEdge(nextEdge) ? nextEdge : { ...edge, ...nextEdge };
        }
        return edge;
      }));
    };
    return {
      getNodes: () => store.getState().nodes.map((n) => ({ ...n })),
      getNode: (id2) => getInternalNode(id2)?.internals.userNode,
      getInternalNode,
      getEdges: () => {
        let { edges = [] } = store.getState();
        return edges.map((e) => ({ ...e }));
      },
      getEdge: (id2) => store.getState().edgeLookup.get(id2),
      setNodes,
      setEdges,
      addNodes: (payload) => {
        let newNodes = Array.isArray(payload) ? payload : [payload];
        batchContext.nodeQueue.push((nodes) => [...nodes, ...newNodes]);
      },
      addEdges: (payload) => {
        let newEdges = Array.isArray(payload) ? payload : [payload];
        batchContext.edgeQueue.push((edges) => [...edges, ...newEdges]);
      },
      toObject: () => {
        let { nodes = [], edges = [], transform: transform2 } = store.getState(), [x, y, zoom3] = transform2;
        return {
          nodes: nodes.map((n) => ({ ...n })),
          edges: edges.map((e) => ({ ...e })),
          viewport: {
            x,
            y,
            zoom: zoom3
          }
        };
      },
      deleteElements: async ({ nodes: nodesToRemove = [], edges: edgesToRemove = [] }) => {
        let { nodes, edges, onNodesDelete, onEdgesDelete, triggerNodeChanges, triggerEdgeChanges, onDelete, onBeforeDelete } = store.getState(), { nodes: matchingNodes, edges: matchingEdges } = await getElementsToRemove({
          nodesToRemove,
          edgesToRemove,
          nodes,
          edges,
          onBeforeDelete
        }), hasMatchingEdges = matchingEdges.length > 0, hasMatchingNodes = matchingNodes.length > 0;
        if (hasMatchingEdges) {
          let edgeChanges = matchingEdges.map(elementToRemoveChange);
          onEdgesDelete?.(matchingEdges), triggerEdgeChanges(edgeChanges);
        }
        if (hasMatchingNodes) {
          let nodeChanges = matchingNodes.map(elementToRemoveChange);
          onNodesDelete?.(matchingNodes), triggerNodeChanges(nodeChanges);
        }
        return (hasMatchingNodes || hasMatchingEdges) && onDelete?.({ nodes: matchingNodes, edges: matchingEdges }), { deletedNodes: matchingNodes, deletedEdges: matchingEdges };
      },
      /**
       * Partial is defined as "the 2 nodes/areas are intersecting partially".
       * If a is contained in b or b is contained in a, they are both
       * considered fully intersecting.
       */
      getIntersectingNodes: (nodeOrRect, partially = !0, nodes) => {
        let isRect = isRectObject(nodeOrRect), nodeRect = isRect ? nodeOrRect : getNodeRect(nodeOrRect), hasNodesOption = nodes !== void 0;
        if (!nodeRect)
          return [];
        let { nodeOrigin } = store.getState();
        return (nodes || store.getState().nodes).filter((n) => {
          let internalNode = store.getState().nodeLookup.get(n.id);
          if (internalNode && !isRect && (n.id === nodeOrRect.id || !internalNode.internals.positionAbsolute))
            return !1;
          let currNodeRect = nodeToRect(hasNodesOption ? n : internalNode, nodeOrigin), overlappingArea = getOverlappingArea(currNodeRect, nodeRect);
          return partially && overlappingArea > 0 || overlappingArea >= currNodeRect.width * currNodeRect.height || overlappingArea >= nodeRect.width * nodeRect.height;
        });
      },
      isNodeIntersecting: (nodeOrRect, area, partially = !0) => {
        let nodeRect = isRectObject(nodeOrRect) ? nodeOrRect : getNodeRect(nodeOrRect);
        if (!nodeRect)
          return !1;
        let overlappingArea = getOverlappingArea(nodeRect, area);
        return partially && overlappingArea > 0 || overlappingArea >= area.width * area.height || overlappingArea >= nodeRect.width * nodeRect.height;
      },
      updateNode,
      updateNodeData: (id2, dataUpdate, options = { replace: !1 }) => {
        updateNode(id2, (node) => {
          let nextData = typeof dataUpdate == "function" ? dataUpdate(node) : dataUpdate;
          return options.replace ? { ...node, data: nextData } : { ...node, data: { ...node.data, ...nextData } };
        }, options);
      },
      updateEdge,
      updateEdgeData: (id2, dataUpdate, options = { replace: !1 }) => {
        updateEdge(id2, (edge) => {
          let nextData = typeof dataUpdate == "function" ? dataUpdate(edge) : dataUpdate;
          return options.replace ? { ...edge, data: nextData } : { ...edge, data: { ...edge.data, ...nextData } };
        }, options);
      },
      getNodesBounds: (nodes) => {
        let { nodeLookup, nodeOrigin } = store.getState();
        return getNodesBounds(nodes, { nodeLookup, nodeOrigin });
      },
      getHandleConnections: ({ type, id: id2, nodeId }) => Array.from(store.getState().connectionLookup.get(`${nodeId}-${type}${id2 ? `-${id2}` : ""}`)?.values() ?? []),
      getNodeConnections: ({ type, handleId, nodeId }) => Array.from(store.getState().connectionLookup.get(`${nodeId}${type ? handleId ? `-${type}-${handleId}` : `-${type}` : ""}`)?.values() ?? []),
      fitView: async (options) => {
        let fitViewResolver = store.getState().fitViewResolver ?? withResolvers();
        return store.setState({ fitViewQueued: !0, fitViewOptions: options, fitViewResolver }), batchContext.nodeQueue.push((nodes) => [...nodes]), fitViewResolver.promise;
      }
    };
  }, []);
  return useMemo(() => ({
    ...generalHelper,
    ...viewportHelper,
    viewportInitialized
  }), [viewportInitialized]);
}
var selected = (item) => item.selected, win$1 = typeof window < "u" ? window : void 0;
function useGlobalKeyHandler({ deleteKeyCode, multiSelectionKeyCode }) {
  let store = useStoreApi(), { deleteElements } = useReactFlow(), deleteKeyPressed = useKeyPress(deleteKeyCode, { actInsideInputWithModifier: !1 }), multiSelectionKeyPressed = useKeyPress(multiSelectionKeyCode, { target: win$1 });
  useEffect(() => {
    if (deleteKeyPressed) {
      let { edges, nodes } = store.getState();
      deleteElements({ nodes: nodes.filter(selected), edges: edges.filter(selected) }), store.setState({ nodesSelectionActive: !1 });
    }
  }, [deleteKeyPressed]), useEffect(() => {
    store.setState({ multiSelectionActive: multiSelectionKeyPressed });
  }, [multiSelectionKeyPressed]);
}
function useResizeHandler(domNode) {
  let store = useStoreApi();
  useEffect(() => {
    let updateDimensions = () => {
      if (!domNode.current || !(domNode.current.checkVisibility?.() ?? !0))
        return !1;
      let size = getDimensions(domNode.current);
      (size.height === 0 || size.width === 0) && store.getState().onError?.("004", errorMessages.error004()), store.setState({ width: size.width || 500, height: size.height || 500 });
    };
    if (domNode.current) {
      updateDimensions(), window.addEventListener("resize", updateDimensions);
      let resizeObserver = new ResizeObserver(() => updateDimensions());
      return resizeObserver.observe(domNode.current), () => {
        window.removeEventListener("resize", updateDimensions), resizeObserver.disconnect();
      };
    }
  }, []);
}
var containerStyle = {
  position: "absolute",
  width: "100%",
  height: "100%",
  top: 0,
  left: 0
}, selector$i = (s) => ({
  userSelectionActive: s.userSelectionActive,
  lib: s.lib,
  connectionInProgress: s.connection.inProgress
});
function ZoomPane({ onPaneContextMenu, zoomOnScroll = !0, zoomOnPinch = !0, panOnScroll = !1, panActivationKeyPressed, panOnScrollSpeed = 0.5, panOnScrollMode = PanOnScrollMode.Free, zoomOnDoubleClick = !0, panOnDrag = !0, defaultViewport: defaultViewport2, translateExtent, minZoom, maxZoom, zoomActivationKeyCode, preventScrolling = !0, children: children2, noWheelClassName, noPanClassName, onViewportChange, isControlledViewport, paneClickDistance, selectionOnDrag }) {
  let store = useStoreApi(), zoomPane = useRef(null), { userSelectionActive, lib, connectionInProgress } = useStore(selector$i, shallow$1), zoomActivationKeyPressed = useKeyPress(zoomActivationKeyCode), panZoom = useRef();
  useResizeHandler(zoomPane);
  let onTransformChange = useCallback((transform2) => {
    onViewportChange?.({ x: transform2[0], y: transform2[1], zoom: transform2[2] }), isControlledViewport || store.setState({ transform: transform2 });
  }, [onViewportChange, isControlledViewport]);
  return useEffect(() => {
    if (zoomPane.current) {
      panZoom.current = XYPanZoom({
        domNode: zoomPane.current,
        minZoom,
        maxZoom,
        translateExtent,
        viewport: defaultViewport2,
        onDraggingChange: (paneDragging) => store.setState((prevState) => prevState.paneDragging === paneDragging ? prevState : { paneDragging }),
        onPanZoomStart: (event, vp) => {
          let { onViewportChangeStart, onMoveStart } = store.getState();
          onMoveStart?.(event, vp), onViewportChangeStart?.(vp);
        },
        onPanZoom: (event, vp) => {
          let { onViewportChange: onViewportChange2, onMove } = store.getState();
          onMove?.(event, vp), onViewportChange2?.(vp);
        },
        onPanZoomEnd: (event, vp) => {
          let { onViewportChangeEnd, onMoveEnd } = store.getState();
          onMoveEnd?.(event, vp), onViewportChangeEnd?.(vp);
        }
      });
      let { x, y, zoom: zoom3 } = panZoom.current.getViewport();
      return store.setState({
        panZoom: panZoom.current,
        transform: [x, y, zoom3],
        domNode: zoomPane.current.closest(".react-flow")
      }), () => {
        panZoom.current?.destroy();
      };
    }
  }, []), useEffect(() => {
    panZoom.current?.update({
      onPaneContextMenu,
      zoomOnScroll,
      zoomOnPinch,
      panOnScroll,
      panActivationKeyPressed,
      panOnScrollSpeed,
      panOnScrollMode,
      zoomOnDoubleClick,
      panOnDrag,
      zoomActivationKeyPressed,
      preventScrolling,
      noPanClassName,
      userSelectionActive,
      noWheelClassName,
      lib,
      onTransformChange,
      connectionInProgress,
      selectionOnDrag,
      paneClickDistance
    });
  }, [
    onPaneContextMenu,
    zoomOnScroll,
    zoomOnPinch,
    panOnScroll,
    panActivationKeyPressed,
    panOnScrollSpeed,
    panOnScrollMode,
    zoomOnDoubleClick,
    panOnDrag,
    zoomActivationKeyPressed,
    preventScrolling,
    noPanClassName,
    userSelectionActive,
    noWheelClassName,
    lib,
    onTransformChange,
    connectionInProgress,
    selectionOnDrag,
    paneClickDistance
  ]), jsx("div", { className: "react-flow__renderer", ref: zoomPane, style: containerStyle, children: children2 });
}
var selector$h = (s) => ({
  userSelectionActive: s.userSelectionActive,
  userSelectionRect: s.userSelectionRect
});
function UserSelection() {
  let { userSelectionActive, userSelectionRect } = useStore(selector$h, shallow$1);
  return userSelectionActive && userSelectionRect ? jsx("div", { className: "react-flow__selection react-flow__container", style: {
    width: userSelectionRect.width,
    height: userSelectionRect.height,
    transform: `translate(${userSelectionRect.x}px, ${userSelectionRect.y}px)`
  } }) : null;
}
var wrapHandler = (handler, containerRef) => (event) => {
  event.target === containerRef.current && handler?.(event);
}, selector$g = (s) => ({
  userSelectionActive: s.userSelectionActive,
  elementsSelectable: s.elementsSelectable,
  dragging: s.paneDragging,
  panBy: s.panBy,
  autoPanSpeed: s.autoPanSpeed
});
function Pane({ isSelecting, selectionKeyPressed, selectionMode = SelectionMode.Full, panOnDrag, autoPanOnSelection, paneClickDistance, selectionOnDrag, onSelectionStart, onSelectionEnd, onPaneClick, onPaneContextMenu, onPaneScroll, onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, children: children2 }) {
  let autoPanId = useRef(0), store = useStoreApi(), { userSelectionActive, elementsSelectable, dragging, panBy: panBy2, autoPanSpeed } = useStore(selector$g, shallow$1), isSelectionEnabled = elementsSelectable && (isSelecting || userSelectionActive), container = useRef(null), containerBounds = useRef(), selectedNodeIds = useRef(/* @__PURE__ */ new Set()), selectedEdgeIds = useRef(/* @__PURE__ */ new Set()), connectionEndedOnPane = useRef(!1), selectionInProgress = useRef(!1), position = useRef({ x: 0, y: 0 }), autoPanStarted = useRef(!1), onClick = (event) => {
    if (selectionInProgress.current || connectionEndedOnPane.current || store.getState().connection.inProgress) {
      selectionInProgress.current = !1, connectionEndedOnPane.current = !1;
      return;
    }
    let { connectionClickStartHandle, connection, onClickConnectEnd, resetSelectedElements } = store.getState();
    if (connectionClickStartHandle) {
      let connectionClone = structuredClone(connection);
      delete connectionClone.inProgress, connectionClone.toPosition = connectionClone.toHandle ? connectionClone.toHandle.position : null, onClickConnectEnd?.(event.nativeEvent, connectionClone), store.setState({ connectionClickStartHandle: null });
    }
    onPaneClick?.(event), resetSelectedElements(), store.setState({ nodesSelectionActive: !1 });
  }, onContextMenu = (event) => {
    if (Array.isArray(panOnDrag) && panOnDrag?.includes(2)) {
      event.preventDefault();
      return;
    }
    onPaneContextMenu?.(event);
  }, onWheel = onPaneScroll ? (event) => onPaneScroll(event) : void 0, onClickCapture = (event) => {
    selectionInProgress.current && (event.stopPropagation(), selectionInProgress.current = !1);
  }, onPointerDownCapture = (event) => {
    if (event.pointerType === "touch" && panOnDrag !== !1 && !selectionKeyPressed)
      return;
    let { domNode, transform: transform2 } = store.getState();
    if (containerBounds.current = domNode?.getBoundingClientRect(), !containerBounds.current)
      return;
    let eventTargetIsContainer = event.target === container.current;
    if (!eventTargetIsContainer && !!event.target.closest(".nokey") || !isSelecting || !(selectionOnDrag && eventTargetIsContainer || selectionKeyPressed) || event.button !== 0 || !event.isPrimary)
      return;
    event.target?.setPointerCapture?.(event.pointerId), selectionInProgress.current = !1;
    let { x, y } = getEventPosition(event.nativeEvent, containerBounds.current), userSelectionStartPosition = pointToRendererPoint({ x, y }, transform2);
    store.setState({
      userSelectionRect: {
        width: 0,
        height: 0,
        startX: userSelectionStartPosition.x,
        startY: userSelectionStartPosition.y,
        x,
        y
      }
    }), eventTargetIsContainer || (event.stopPropagation(), event.preventDefault());
  };
  function commitUserSelectionRect(mouseX, mouseY) {
    let { userSelectionRect } = store.getState();
    if (!userSelectionRect)
      return;
    let { transform: transform2, nodeLookup, edgeLookup, connectionLookup, triggerNodeChanges, triggerEdgeChanges, defaultEdgeOptions } = store.getState(), userStartPosition = { x: userSelectionRect.startX, y: userSelectionRect.startY }, { x: screenStartX, y: screenStartY } = rendererPointToPoint(userStartPosition, transform2), nextUserSelectRect = {
      startX: userStartPosition.x,
      startY: userStartPosition.y,
      x: mouseX < screenStartX ? mouseX : screenStartX,
      y: mouseY < screenStartY ? mouseY : screenStartY,
      width: Math.abs(mouseX - screenStartX),
      height: Math.abs(mouseY - screenStartY)
    }, prevSelectedNodeIds = selectedNodeIds.current, prevSelectedEdgeIds = selectedEdgeIds.current;
    selectedNodeIds.current = new Set(getNodesInside(nodeLookup, nextUserSelectRect, transform2, selectionMode === SelectionMode.Partial, !0).map((node) => node.id)), selectedEdgeIds.current = /* @__PURE__ */ new Set();
    let edgesSelectable = defaultEdgeOptions?.selectable ?? !0;
    for (let nodeId of selectedNodeIds.current) {
      let connections = connectionLookup.get(nodeId);
      if (connections)
        for (let { edgeId } of connections.values()) {
          let edge = edgeLookup.get(edgeId);
          edge && (edge.selectable ?? edgesSelectable) && selectedEdgeIds.current.add(edgeId);
        }
    }
    if (!areSetsEqual(prevSelectedNodeIds, selectedNodeIds.current)) {
      let changes = getSelectionChanges(nodeLookup, selectedNodeIds.current);
      triggerNodeChanges(changes);
    }
    if (!areSetsEqual(prevSelectedEdgeIds, selectedEdgeIds.current)) {
      let changes = getSelectionChanges(edgeLookup, selectedEdgeIds.current);
      triggerEdgeChanges(changes);
    }
    store.setState({
      userSelectionRect: nextUserSelectRect,
      userSelectionActive: !0,
      nodesSelectionActive: !1
    });
  }
  function autoPan() {
    if (!autoPanOnSelection || !containerBounds.current)
      return;
    let [x, y] = calcAutoPan(position.current, containerBounds.current, autoPanSpeed);
    panBy2({ x, y }).then((panned) => {
      if (!selectionInProgress.current || !panned) {
        autoPanId.current = requestAnimationFrame(autoPan);
        return;
      }
      let { x: mx, y: my } = position.current;
      commitUserSelectionRect(mx, my), autoPanId.current = requestAnimationFrame(autoPan);
    });
  }
  let cleanupAutoPan = () => {
    cancelAnimationFrame(autoPanId.current), autoPanId.current = 0, autoPanStarted.current = !1;
  };
  useEffect(() => () => cleanupAutoPan(), []);
  let onPointerMove = (event) => {
    let { userSelectionRect, transform: transform2, resetSelectedElements } = store.getState();
    if (!containerBounds.current || !userSelectionRect)
      return;
    let { x: mouseX, y: mouseY } = getEventPosition(event.nativeEvent, containerBounds.current);
    position.current = { x: mouseX, y: mouseY };
    let screenStart = rendererPointToPoint({ x: userSelectionRect.startX, y: userSelectionRect.startY }, transform2);
    if (!selectionInProgress.current) {
      let requiredDistance = selectionKeyPressed ? 0 : paneClickDistance;
      if (Math.hypot(mouseX - screenStart.x, mouseY - screenStart.y) <= requiredDistance)
        return;
      resetSelectedElements(), onSelectionStart?.(event);
    }
    selectionInProgress.current = !0, autoPanStarted.current || (autoPan(), autoPanStarted.current = !0), commitUserSelectionRect(mouseX, mouseY);
  }, onPointerUp = (event) => {
    if (!isSelectionEnabled) {
      event.target === container.current && store.getState().connection.inProgress && (connectionEndedOnPane.current = !0);
      return;
    }
    event.button === 0 && (event.target?.releasePointerCapture?.(event.pointerId), !userSelectionActive && event.target === container.current && store.getState().userSelectionRect && onClick?.(event), store.setState({
      userSelectionActive: !1,
      userSelectionRect: null
    }), selectionInProgress.current && (onSelectionEnd?.(event), store.setState({
      nodesSelectionActive: selectedNodeIds.current.size > 0
    })), cleanupAutoPan());
  }, onPointerCancel = (event) => {
    event.target?.releasePointerCapture?.(event.pointerId), cleanupAutoPan();
  }, draggable = panOnDrag === !0 || Array.isArray(panOnDrag) && panOnDrag.includes(0);
  return jsxs("div", { className: cc(["react-flow__pane", { draggable, dragging, selection: isSelecting }]), onClick: isSelectionEnabled ? void 0 : wrapHandler(onClick, container), onContextMenu: wrapHandler(onContextMenu, container), onWheel: wrapHandler(onWheel, container), onPointerEnter: isSelectionEnabled ? void 0 : onPaneMouseEnter, onPointerMove: isSelectionEnabled ? onPointerMove : onPaneMouseMove, onPointerUp, onPointerCancel: isSelectionEnabled ? onPointerCancel : void 0, onPointerDownCapture: isSelectionEnabled ? onPointerDownCapture : void 0, onClickCapture: isSelectionEnabled ? onClickCapture : void 0, onPointerLeave: onPaneMouseLeave, ref: container, style: containerStyle, children: [children2, jsx(UserSelection, {})] });
}
function handleNodeClick({ id: id2, store, unselect = !1, nodeRef }) {
  let { addSelectedNodes, unselectNodesAndEdges, multiSelectionActive, nodeLookup, onError } = store.getState(), node = nodeLookup.get(id2);
  if (!node) {
    onError?.("012", errorMessages.error012(id2));
    return;
  }
  store.setState({ nodesSelectionActive: !1 }), node.selected ? (unselect || node.selected && multiSelectionActive) && (unselectNodesAndEdges({ nodes: [node], edges: [] }), requestAnimationFrame(() => nodeRef?.current?.blur())) : addSelectedNodes([id2]);
}
function useDrag({ nodeRef, disabled = !1, noDragClassName, handleSelector, nodeId, isSelectable, nodeClickDistance }) {
  let store = useStoreApi(), [dragging, setDragging] = useState(!1), xyDrag = useRef();
  return useEffect(() => {
    if (!disabled)
      return xyDrag.current = XYDrag({
        getStoreItems: () => store.getState(),
        onNodeMouseDown: (id2) => {
          handleNodeClick({
            id: id2,
            store,
            nodeRef
          });
        },
        onDragStart: () => {
          setDragging(!0);
        },
        onDragStop: () => {
          setDragging(!1);
        }
      }), () => {
        xyDrag.current?.destroy(), xyDrag.current = void 0;
      };
  }, [disabled, store, nodeRef]), useEffect(() => {
    disabled || !nodeRef.current || !xyDrag.current || xyDrag.current.update({
      noDragClassName,
      handleSelector,
      domNode: nodeRef.current,
      isSelectable,
      nodeId,
      nodeClickDistance
    });
  }, [noDragClassName, handleSelector, disabled, isSelectable, nodeRef, nodeId, nodeClickDistance]), dragging;
}
var selectedAndDraggable = (nodesDraggable) => (n) => n.selected && (n.draggable || nodesDraggable && typeof n.draggable > "u");
function useMoveSelectedNodes() {
  let store = useStoreApi();
  return useCallback((params) => {
    let { nodeExtent, snapToGrid, snapGrid, nodesDraggable, onError, updateNodePositions, nodeLookup, nodeOrigin } = store.getState(), nodeUpdates = /* @__PURE__ */ new Map(), isSelected = selectedAndDraggable(nodesDraggable), xVelo = snapToGrid ? snapGrid[0] : 5, yVelo = snapToGrid ? snapGrid[1] : 5, xDiff = params.direction.x * xVelo * params.factor, yDiff = params.direction.y * yVelo * params.factor;
    for (let [, node] of nodeLookup) {
      if (!isSelected(node))
        continue;
      let nextPosition = {
        x: node.internals.positionAbsolute.x + xDiff,
        y: node.internals.positionAbsolute.y + yDiff
      };
      snapToGrid && (nextPosition = snapPosition(nextPosition, snapGrid));
      let { position, positionAbsolute } = calculateNodePosition({
        nodeId: node.id,
        nextPosition,
        nodeLookup,
        nodeExtent,
        nodeOrigin,
        onError
      });
      node.position = position, node.internals.positionAbsolute = positionAbsolute, nodeUpdates.set(node.id, node);
    }
    updateNodePositions(nodeUpdates);
  }, []);
}
var NodeIdContext = createContext(null), Provider = NodeIdContext.Provider;
NodeIdContext.Consumer;
var useNodeId = () => useContext(NodeIdContext), selector$f = (s) => ({
  connectOnClick: s.connectOnClick,
  noPanClassName: s.noPanClassName,
  rfId: s.rfId
}), HandleConfigContext = createContext(null);
function HandleConfigProvider({ children: children2 }) {
  let config = useStore(selector$f, shallow$1);
  return jsx(HandleConfigContext.Provider, { value: config, children: children2 });
}
function useHandleConfig() {
  let config = useContext(HandleConfigContext);
  if (!config)
    throw new Error("useHandleConfig must be used within a HandleConfigProvider");
  return config;
}
var idleConnectingState = {
  connectingFrom: !1,
  connectingTo: !1,
  clickConnecting: !1,
  isPossibleEndHandle: !0,
  connectionInProcess: !1,
  clickConnectionInProcess: !1,
  valid: !1
}, connectingSelector = (nodeId, handleId, type) => (state) => {
  let { connectionClickStartHandle: clickHandle, connectionMode, connection } = state, { fromHandle, toHandle, isValid } = connection;
  if (!fromHandle && !clickHandle)
    return idleConnectingState;
  let connectingTo = toHandle?.nodeId === nodeId && toHandle?.id === handleId && toHandle?.type === type;
  return {
    connectingFrom: fromHandle?.nodeId === nodeId && fromHandle?.id === handleId && fromHandle?.type === type,
    connectingTo,
    clickConnecting: clickHandle?.nodeId === nodeId && clickHandle?.id === handleId && clickHandle?.type === type,
    isPossibleEndHandle: connectionMode === ConnectionMode.Strict ? fromHandle?.type !== type : nodeId !== fromHandle?.nodeId || handleId !== fromHandle?.id,
    connectionInProcess: !!fromHandle,
    clickConnectionInProcess: !!clickHandle,
    valid: connectingTo && isValid
  };
};
function HandleComponent({ type = "source", position = Position.Top, isValidConnection, isConnectable = !0, isConnectableStart = !0, isConnectableEnd = !0, id: id2, onConnect, children: children2, className, onMouseDown, onTouchStart, ...rest }, ref) {
  let handleId = id2 || null, isTarget = type === "target", store = useStoreApi(), nodeId = useNodeId(), { connectOnClick, noPanClassName, rfId } = useHandleConfig(), { connectingFrom, connectingTo, clickConnecting, isPossibleEndHandle, connectionInProcess, clickConnectionInProcess, valid } = useStore(connectingSelector(nodeId, handleId, type), shallow$1);
  nodeId || store.getState().onError?.("010", errorMessages.error010());
  let onConnectExtended = (params) => {
    let { defaultEdgeOptions, onConnect: onConnectAction, hasDefaultEdges } = store.getState(), edgeParams = {
      ...defaultEdgeOptions,
      ...params
    };
    if (hasDefaultEdges) {
      let { edges, setEdges, onError } = store.getState();
      setEdges(addEdge2(edgeParams, edges, { onError }));
    }
    onConnectAction?.(edgeParams), onConnect?.(edgeParams);
  }, onPointerDown2 = (event) => {
    if (!nodeId)
      return;
    let isMouseTriggered = isMouseEvent(event.nativeEvent);
    if (isConnectableStart && (isMouseTriggered && event.button === 0 || !isMouseTriggered)) {
      let currentStore = store.getState();
      XYHandle.onPointerDown(event.nativeEvent, {
        handleDomNode: event.currentTarget,
        autoPanOnConnect: currentStore.autoPanOnConnect,
        connectionMode: currentStore.connectionMode,
        connectionRadius: currentStore.connectionRadius,
        domNode: currentStore.domNode,
        nodeLookup: currentStore.nodeLookup,
        lib: currentStore.lib,
        isTarget,
        handleId,
        nodeId,
        flowId: currentStore.rfId,
        panBy: currentStore.panBy,
        cancelConnection: currentStore.cancelConnection,
        onConnectStart: currentStore.onConnectStart,
        onConnectEnd: (...args) => store.getState().onConnectEnd?.(...args),
        updateConnection: currentStore.updateConnection,
        onConnect: onConnectExtended,
        isValidConnection: isValidConnection || ((...args) => store.getState().isValidConnection?.(...args) ?? !0),
        getTransform: () => store.getState().transform,
        getFromHandle: () => store.getState().connection.fromHandle,
        autoPanSpeed: currentStore.autoPanSpeed,
        dragThreshold: currentStore.connectionDragThreshold
      });
    }
    isMouseTriggered ? onMouseDown?.(event) : onTouchStart?.(event);
  }, onClick = (event) => {
    let { onClickConnectStart, onClickConnectEnd, connectionClickStartHandle, connectionMode, isValidConnection: isValidConnectionStore, lib, rfId: flowId, nodeLookup, connection: connectionState } = store.getState();
    if (!nodeId || !connectionClickStartHandle && !isConnectableStart)
      return;
    if (!connectionClickStartHandle) {
      onClickConnectStart?.(event.nativeEvent, { nodeId, handleId, handleType: type }), store.setState({ connectionClickStartHandle: { nodeId, type, id: handleId } });
      return;
    }
    let doc = getHostForElement(event.target), isValidConnectionHandler = isValidConnection || isValidConnectionStore, { connection, isValid } = XYHandle.isValid(event.nativeEvent, {
      handle: {
        nodeId,
        id: handleId,
        type
      },
      connectionMode,
      fromNodeId: connectionClickStartHandle.nodeId,
      fromHandleId: connectionClickStartHandle.id || null,
      fromType: connectionClickStartHandle.type,
      isValidConnection: isValidConnectionHandler,
      flowId,
      doc,
      lib,
      nodeLookup
    });
    isValid && connection && onConnectExtended(connection);
    let connectionClone = structuredClone(connectionState);
    delete connectionClone.inProgress, connectionClone.toPosition = connectionClone.toHandle ? connectionClone.toHandle.position : null, onClickConnectEnd?.(event, connectionClone), store.setState({ connectionClickStartHandle: null });
  };
  return jsx("div", { "data-handleid": handleId, "data-nodeid": nodeId, "data-handlepos": position, "data-id": `${rfId}-${nodeId}-${handleId}-${type}`, className: cc([
    "react-flow__handle",
    `react-flow__handle-${position}`,
    "nodrag",
    noPanClassName,
    className,
    {
      source: !isTarget,
      target: isTarget,
      connectable: isConnectable,
      connectablestart: isConnectableStart,
      connectableend: isConnectableEnd,
      clickconnecting: clickConnecting,
      connectingfrom: connectingFrom,
      connectingto: connectingTo,
      valid,
      /*
       * shows where you can start a connection from
       * and where you can end it while connecting
       */
      connectionindicator: isConnectable && (!connectionInProcess || isPossibleEndHandle) && (connectionInProcess || clickConnectionInProcess ? isConnectableEnd : isConnectableStart)
    }
  ]), onMouseDown: onPointerDown2, onTouchStart: onPointerDown2, onClick: connectOnClick ? onClick : void 0, ref, ...rest, children: children2 });
}
var Handle = memo(fixedForwardRef(HandleComponent));
function InputNode({ data, isConnectable, sourcePosition = Position.Bottom }) {
  return jsxs(Fragment, { children: [data?.label, jsx(Handle, { type: "source", position: sourcePosition, isConnectable })] });
}
function DefaultNode({ data, isConnectable, targetPosition = Position.Top, sourcePosition = Position.Bottom }) {
  return jsxs(Fragment, { children: [jsx(Handle, { type: "target", position: targetPosition, isConnectable }), data?.label, jsx(Handle, { type: "source", position: sourcePosition, isConnectable })] });
}
function GroupNode() {
  return null;
}
function OutputNode({ data, isConnectable, targetPosition = Position.Top }) {
  return jsxs(Fragment, { children: [jsx(Handle, { type: "target", position: targetPosition, isConnectable }), data?.label] });
}
var arrowKeyDiffs = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }
}, builtinNodeTypes = {
  input: InputNode,
  default: DefaultNode,
  output: OutputNode,
  group: GroupNode
};
function getNodeInlineStyleDimensions(node) {
  return node.internals.handleBounds === void 0 ? {
    width: node.width ?? node.initialWidth ?? node.style?.width,
    height: node.height ?? node.initialHeight ?? node.style?.height
  } : {
    width: node.width ?? node.style?.width,
    height: node.height ?? node.style?.height
  };
}
var selector$e = (s) => {
  let { width, height, x, y } = getInternalNodesBounds(s.nodeLookup, {
    filter: (node) => !!node.selected
  });
  return {
    width: isNumeric(width) ? width : null,
    height: isNumeric(height) ? height : null,
    userSelectionActive: s.userSelectionActive,
    transformString: `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]}) translate(${x}px,${y}px)`
  };
};
function NodesSelection({ onSelectionContextMenu, noPanClassName, disableKeyboardA11y }) {
  let store = useStoreApi(), { width, height, transformString, userSelectionActive } = useStore(selector$e, shallow$1), moveSelectedNodes = useMoveSelectedNodes(), nodeRef = useRef(null);
  useEffect(() => {
    disableKeyboardA11y || nodeRef.current?.focus({
      preventScroll: !0
    });
  }, [disableKeyboardA11y]);
  let shouldRender = !userSelectionActive && width !== null && height !== null;
  if (useDrag({
    nodeRef,
    disabled: !shouldRender
  }), !shouldRender)
    return null;
  let onContextMenu = onSelectionContextMenu ? (event) => {
    let selectedNodes = store.getState().nodes.filter((n) => n.selected);
    onSelectionContextMenu(event, selectedNodes);
  } : void 0, onKeyDown = (event) => {
    Object.prototype.hasOwnProperty.call(arrowKeyDiffs, event.key) && (event.preventDefault(), moveSelectedNodes({
      direction: arrowKeyDiffs[event.key],
      factor: event.shiftKey ? 4 : 1
    }));
  };
  return jsx("div", { className: cc(["react-flow__nodesselection", "react-flow__container", noPanClassName]), style: {
    transform: transformString
  }, children: jsx("div", { ref: nodeRef, className: "react-flow__nodesselection-rect", onContextMenu, tabIndex: disableKeyboardA11y ? void 0 : -1, onKeyDown: disableKeyboardA11y ? void 0 : onKeyDown, style: {
    width,
    height
  } }) });
}
var win = typeof window < "u" ? window : void 0, selector$d = (s) => ({ nodesSelectionActive: s.nodesSelectionActive, userSelectionActive: s.userSelectionActive });
function FlowRendererComponent({ children: children2, onPaneClick, onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, onPaneContextMenu, onPaneScroll, paneClickDistance, deleteKeyCode, selectionKeyCode, selectionOnDrag, selectionMode, onSelectionStart, onSelectionEnd, multiSelectionKeyCode, panActivationKeyCode, zoomActivationKeyCode, elementsSelectable, zoomOnScroll, zoomOnPinch, panOnScroll: _panOnScroll, panOnScrollSpeed, panOnScrollMode, zoomOnDoubleClick, panOnDrag: _panOnDrag, autoPanOnSelection, defaultViewport: defaultViewport2, translateExtent, minZoom, maxZoom, preventScrolling, onSelectionContextMenu, noWheelClassName, noPanClassName, disableKeyboardA11y, onViewportChange, isControlledViewport }) {
  let { nodesSelectionActive, userSelectionActive } = useStore(selector$d, shallow$1), selectionKeyPressed = useKeyPress(selectionKeyCode, { target: win }), panActivationKeyPressed = useKeyPress(panActivationKeyCode, { target: win }), panOnDrag = panActivationKeyPressed || _panOnDrag, panOnScroll = panActivationKeyPressed || _panOnScroll, _selectionOnDrag = selectionOnDrag && panOnDrag !== !0, isSelecting = selectionKeyPressed || userSelectionActive || _selectionOnDrag;
  return useGlobalKeyHandler({ deleteKeyCode, multiSelectionKeyCode }), jsx(ZoomPane, { onPaneContextMenu, elementsSelectable, zoomOnScroll, zoomOnPinch, panOnScroll, panActivationKeyPressed, panOnScrollSpeed, panOnScrollMode, zoomOnDoubleClick, panOnDrag: !selectionKeyPressed && panOnDrag, defaultViewport: defaultViewport2, translateExtent, minZoom, maxZoom, zoomActivationKeyCode, preventScrolling, noWheelClassName, noPanClassName, onViewportChange, isControlledViewport, paneClickDistance, selectionOnDrag: _selectionOnDrag, children: jsxs(Pane, { onSelectionStart, onSelectionEnd, onPaneClick, onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, onPaneContextMenu, onPaneScroll, panOnDrag, autoPanOnSelection, isSelecting: !!isSelecting, selectionMode, selectionKeyPressed, paneClickDistance, selectionOnDrag: _selectionOnDrag, children: [children2, nodesSelectionActive && jsx(NodesSelection, { onSelectionContextMenu, noPanClassName, disableKeyboardA11y })] }) });
}
FlowRendererComponent.displayName = "FlowRenderer";
var FlowRenderer = memo(FlowRendererComponent), selector$c = (onlyRenderVisible) => (s) => onlyRenderVisible ? getNodesInside(s.nodeLookup, { x: 0, y: 0, width: s.width, height: s.height }, s.transform, !0).map((node) => node.id) : Array.from(s.nodeLookup.keys());
function useVisibleNodeIds(onlyRenderVisible) {
  return useStore(useCallback(selector$c(onlyRenderVisible), [onlyRenderVisible]), shallow$1);
}
var selector$b = (s) => s.updateNodeInternals;
function useResizeObserver() {
  let updateNodeInternals2 = useStore(selector$b), [resizeObserver] = useState(() => typeof ResizeObserver > "u" ? null : new ResizeObserver((entries) => {
    let updates = /* @__PURE__ */ new Map();
    entries.forEach((entry) => {
      let id2 = entry.target.getAttribute("data-id");
      updates.set(id2, {
        id: id2,
        nodeElement: entry.target,
        force: !0
      });
    }), updateNodeInternals2(updates);
  }));
  return useEffect(() => () => {
    resizeObserver?.disconnect();
  }, [resizeObserver]), resizeObserver;
}
function useNodeObserver({ node, nodeType, hasDimensions, resizeObserver }) {
  let store = useStoreApi(), nodeRef = useRef(null), observedNode = useRef(null), prevSourcePosition = useRef(node.sourcePosition), prevTargetPosition = useRef(node.targetPosition), prevType = useRef(nodeType), isInitialized = hasDimensions && !!node.internals.handleBounds;
  return useEffect(() => {
    nodeRef.current && !node.hidden && (!isInitialized || observedNode.current !== nodeRef.current) && (observedNode.current && resizeObserver?.unobserve(observedNode.current), resizeObserver?.observe(nodeRef.current), observedNode.current = nodeRef.current);
  }, [isInitialized, node.hidden]), useEffect(() => () => {
    observedNode.current && (resizeObserver?.unobserve(observedNode.current), observedNode.current = null);
  }, []), useEffect(() => {
    if (nodeRef.current) {
      let typeChanged = prevType.current !== nodeType, sourcePosChanged = prevSourcePosition.current !== node.sourcePosition, targetPosChanged = prevTargetPosition.current !== node.targetPosition;
      (typeChanged || sourcePosChanged || targetPosChanged) && (prevType.current = nodeType, prevSourcePosition.current = node.sourcePosition, prevTargetPosition.current = node.targetPosition, store.getState().updateNodeInternals(/* @__PURE__ */ new Map([[node.id, { id: node.id, nodeElement: nodeRef.current, force: !0 }]])));
    }
  }, [node.id, nodeType, node.sourcePosition, node.targetPosition]), nodeRef;
}
function NodeWrapper({ id: id2, onClick, onMouseEnter, onMouseMove, onMouseLeave, onContextMenu, onDoubleClick, nodesDraggable, elementsSelectable, nodesConnectable, nodesFocusable, resizeObserver, noDragClassName, noPanClassName, disableKeyboardA11y, rfId, nodeTypes, nodeClickDistance, onError }) {
  let { node, internals, isParent } = useStore((s) => {
    let node2 = s.nodeLookup.get(id2), isParent2 = s.parentLookup.has(id2);
    return {
      node: node2,
      internals: node2.internals,
      isParent: isParent2
    };
  }, shallow$1), nodeType = node.type || "default", NodeComponent = nodeTypes?.[nodeType] || builtinNodeTypes[nodeType];
  NodeComponent === void 0 && (onError?.("003", errorMessages.error003(nodeType)), nodeType = "default", NodeComponent = nodeTypes?.default || builtinNodeTypes.default);
  let isDraggable = !!(node.draggable || nodesDraggable && typeof node.draggable > "u"), isSelectable = !!(node.selectable || elementsSelectable && typeof node.selectable > "u"), isConnectable = !!(node.connectable || nodesConnectable && typeof node.connectable > "u"), isFocusable = !!(node.focusable || nodesFocusable && typeof node.focusable > "u"), store = useStoreApi(), hasDimensions = nodeHasDimensions(node), nodeRef = useNodeObserver({ node, nodeType, hasDimensions, resizeObserver }), dragging = useDrag({
    nodeRef,
    disabled: node.hidden || !isDraggable,
    noDragClassName,
    handleSelector: node.dragHandle,
    nodeId: id2,
    isSelectable,
    nodeClickDistance
  }), moveSelectedNodes = useMoveSelectedNodes();
  if (node.hidden)
    return null;
  let nodeDimensions = getNodeDimensions(node), inlineDimensions = getNodeInlineStyleDimensions(node), hasPointerEvents = isSelectable || isDraggable || onClick || onMouseEnter || onMouseMove || onMouseLeave, onMouseEnterHandler = onMouseEnter ? (event) => onMouseEnter(event, { ...internals.userNode }) : void 0, onMouseMoveHandler = onMouseMove ? (event) => onMouseMove(event, { ...internals.userNode }) : void 0, onMouseLeaveHandler = onMouseLeave ? (event) => onMouseLeave(event, { ...internals.userNode }) : void 0, onContextMenuHandler = onContextMenu ? (event) => onContextMenu(event, { ...internals.userNode }) : void 0, onDoubleClickHandler = onDoubleClick ? (event) => onDoubleClick(event, { ...internals.userNode }) : void 0, onSelectNodeHandler = (event) => {
    let { selectNodesOnDrag, nodeDragThreshold } = store.getState();
    isSelectable && (!selectNodesOnDrag || !isDraggable || nodeDragThreshold > 0) && handleNodeClick({
      id: id2,
      store,
      nodeRef
    }), onClick && onClick(event, { ...internals.userNode });
  }, onKeyDown = (event) => {
    if (!(isInputDOMNode(event.nativeEvent) || disableKeyboardA11y)) {
      if (elementSelectionKeys.includes(event.key) && isSelectable) {
        let unselect = event.key === "Escape";
        handleNodeClick({
          id: id2,
          store,
          unselect,
          nodeRef
        });
      } else if (isDraggable && node.selected && Object.prototype.hasOwnProperty.call(arrowKeyDiffs, event.key)) {
        event.preventDefault();
        let { ariaLabelConfig } = store.getState();
        store.setState({
          ariaLiveMessage: ariaLabelConfig["node.a11yDescription.ariaLiveMessage"]({
            direction: event.key.replace("Arrow", "").toLowerCase(),
            x: ~~internals.positionAbsolute.x,
            y: ~~internals.positionAbsolute.y
          })
        }), moveSelectedNodes({
          direction: arrowKeyDiffs[event.key],
          factor: event.shiftKey ? 4 : 1
        });
      }
    }
  }, onFocus = () => {
    if (disableKeyboardA11y || !nodeRef.current?.matches(":focus-visible"))
      return;
    let { transform: transform2, width, height, autoPanOnNodeFocus, setCenter } = store.getState();
    if (!autoPanOnNodeFocus)
      return;
    getNodesInside(/* @__PURE__ */ new Map([[id2, node]]), { x: 0, y: 0, width, height }, transform2, !0).length > 0 || setCenter(node.position.x + nodeDimensions.width / 2, node.position.y + nodeDimensions.height / 2, {
      zoom: transform2[2]
    });
  };
  return jsx("div", { className: cc([
    "react-flow__node",
    `react-flow__node-${nodeType}`,
    {
      // this is overwritable by passing `nopan` as a class name
      [noPanClassName]: isDraggable
    },
    node.className,
    {
      selected: node.selected,
      selectable: isSelectable,
      parent: isParent,
      draggable: isDraggable,
      dragging
    }
  ]), ref: nodeRef, style: {
    zIndex: internals.z,
    transform: `translate(${internals.positionAbsolute.x}px,${internals.positionAbsolute.y}px)`,
    pointerEvents: hasPointerEvents ? "all" : "none",
    visibility: hasDimensions ? "visible" : "hidden",
    ...node.style,
    ...inlineDimensions
  }, "data-id": id2, "data-testid": `rf__node-${id2}`, onMouseEnter: onMouseEnterHandler, onMouseMove: onMouseMoveHandler, onMouseLeave: onMouseLeaveHandler, onContextMenu: onContextMenuHandler, onClick: onSelectNodeHandler, onDoubleClick: onDoubleClickHandler, onKeyDown: isFocusable ? onKeyDown : void 0, tabIndex: isFocusable ? 0 : void 0, onFocus: isFocusable ? onFocus : void 0, role: node.ariaRole ?? (isFocusable ? "group" : void 0), "aria-roledescription": "node", "aria-describedby": disableKeyboardA11y ? void 0 : `${ARIA_NODE_DESC_KEY}-${rfId}`, "aria-label": node.ariaLabel, ...node.domAttributes, children: jsx(Provider, { value: id2, children: jsx(NodeComponent, { id: id2, data: node.data, type: nodeType, positionAbsoluteX: internals.positionAbsolute.x, positionAbsoluteY: internals.positionAbsolute.y, selected: node.selected ?? !1, selectable: isSelectable, draggable: isDraggable, deletable: node.deletable ?? !0, isConnectable, sourcePosition: node.sourcePosition, targetPosition: node.targetPosition, dragging, dragHandle: node.dragHandle, zIndex: internals.z, parentId: node.parentId, ...nodeDimensions }) }) });
}
var NodeWrapper$1 = memo(NodeWrapper), selector$a = (s) => ({
  nodesConnectable: s.nodesConnectable,
  nodesFocusable: s.nodesFocusable,
  elementsSelectable: s.elementsSelectable,
  onError: s.onError
});
function NodeRendererComponent(props) {
  let { nodesConnectable, nodesFocusable, elementsSelectable, onError } = useStore(selector$a, shallow$1), nodeIds = useVisibleNodeIds(props.onlyRenderVisibleElements), resizeObserver = useResizeObserver();
  return jsx("div", { className: "react-flow__nodes", style: containerStyle, children: nodeIds.map((nodeId) => (
    /*
     * The split of responsibilities between NodeRenderer and
     * NodeComponentWrapper may appear weird. However, it’s designed to
     * minimize the cost of updates when individual nodes change.
     *
     * For example, when you’re dragging a single node, that node gets
     * updated multiple times per second. If `NodeRenderer` were to update
     * every time, it would have to re-run the `nodes.map()` loop every
     * time. This gets pricey with hundreds of nodes, especially if every
     * loop cycle does more than just rendering a JSX element!
     *
     * As a result of this choice, we took the following implementation
     * decisions:
     * - NodeRenderer subscribes *only* to node IDs – and therefore
     *   rerender *only* when visible nodes are added or removed.
     * - NodeRenderer performs all operations the result of which can be
     *   shared between nodes (such as creating the `ResizeObserver`
     *   instance, or subscribing to `selector`). This means extra prop
     *   drilling into `NodeComponentWrapper`, but it means we need to run
     *   these operations only once – instead of once per node.
     * - Any operations that you’d normally write inside `nodes.map` are
     *   moved into `NodeComponentWrapper`. This ensures they are
     *   memorized – so if `NodeRenderer` *has* to rerender, it only
     *   needs to regenerate the list of nodes, nothing else.
     */
    jsx(NodeWrapper$1, { id: nodeId, nodeTypes: props.nodeTypes, nodeExtent: props.nodeExtent, onClick: props.onNodeClick, onMouseEnter: props.onNodeMouseEnter, onMouseMove: props.onNodeMouseMove, onMouseLeave: props.onNodeMouseLeave, onContextMenu: props.onNodeContextMenu, onDoubleClick: props.onNodeDoubleClick, noDragClassName: props.noDragClassName, noPanClassName: props.noPanClassName, rfId: props.rfId, disableKeyboardA11y: props.disableKeyboardA11y, resizeObserver, nodesDraggable: props.nodesDraggable ?? !0, nodesConnectable, nodesFocusable, elementsSelectable, nodeClickDistance: props.nodeClickDistance, onError }, nodeId)
  )) });
}
NodeRendererComponent.displayName = "NodeRenderer";
var NodeRenderer = memo(NodeRendererComponent);
function useVisibleEdgeIds(onlyRenderVisible) {
  return useStore(useCallback((s) => {
    if (!onlyRenderVisible)
      return s.edges.map((edge) => edge.id);
    let visibleEdgeIds = [];
    if (s.width && s.height)
      for (let edge of s.edges) {
        let sourceNode = s.nodeLookup.get(edge.source), targetNode = s.nodeLookup.get(edge.target);
        sourceNode && targetNode && isEdgeVisible({
          sourceNode,
          targetNode,
          width: s.width,
          height: s.height,
          transform: s.transform
        }) && visibleEdgeIds.push(edge.id);
      }
    return visibleEdgeIds;
  }, [onlyRenderVisible]), shallow$1);
}
var ArrowSymbol = ({ color: color2 = "none", strokeWidth = 1 }) => {
  let style2 = {
    strokeWidth,
    ...color2 && { stroke: color2 }
  };
  return jsx("polyline", { className: "arrow", style: style2, strokeLinecap: "round", fill: "none", strokeLinejoin: "round", points: "-5,-4 0,0 -5,4" });
}, ArrowClosedSymbol = ({ color: color2 = "none", strokeWidth = 1 }) => {
  let style2 = {
    strokeWidth,
    ...color2 && { stroke: color2, fill: color2 }
  };
  return jsx("polyline", { className: "arrowclosed", style: style2, strokeLinecap: "round", strokeLinejoin: "round", points: "-5,-4 0,0 -5,4 -5,-4" });
}, MarkerSymbols = {
  [MarkerType.Arrow]: ArrowSymbol,
  [MarkerType.ArrowClosed]: ArrowClosedSymbol
};
function useMarkerSymbol(type) {
  let store = useStoreApi();
  return useMemo(() => Object.prototype.hasOwnProperty.call(MarkerSymbols, type) ? MarkerSymbols[type] : (store.getState().onError?.("009", errorMessages.error009(type)), null), [type]);
}
var Marker = ({ id: id2, type, color: color2, width = 12.5, height = 12.5, markerUnits = "strokeWidth", strokeWidth, orient = "auto-start-reverse" }) => {
  let Symbol2 = useMarkerSymbol(type);
  return Symbol2 ? jsx("marker", { className: "react-flow__arrowhead", id: id2, markerWidth: `${width}`, markerHeight: `${height}`, viewBox: "-10 -10 20 20", markerUnits, orient, refX: "0", refY: "0", children: jsx(Symbol2, { color: color2, strokeWidth }) }) : null;
}, MarkerDefinitions = ({ defaultColor, rfId }) => {
  let edges = useStore((s) => s.edges), defaultEdgeOptions = useStore((s) => s.defaultEdgeOptions), markers = useMemo(() => createMarkerIds(edges, {
    id: rfId,
    defaultColor,
    defaultMarkerStart: defaultEdgeOptions?.markerStart,
    defaultMarkerEnd: defaultEdgeOptions?.markerEnd
  }), [edges, defaultEdgeOptions, rfId, defaultColor]);
  return markers.length ? jsx("svg", { className: "react-flow__marker", "aria-hidden": "true", children: jsx("defs", { children: markers.map((marker) => jsx(Marker, { id: marker.id, type: marker.type, color: marker.color, width: marker.width, height: marker.height, markerUnits: marker.markerUnits, strokeWidth: marker.strokeWidth, orient: marker.orient }, marker.id)) }) }) : null;
};
MarkerDefinitions.displayName = "MarkerDefinitions";
var MarkerDefinitions$1 = memo(MarkerDefinitions);
function EdgeTextComponent({ x, y, label, labelStyle, labelShowBg = !0, labelBgStyle, labelBgPadding = [2, 4], labelBgBorderRadius = 2, children: children2, className, ...rest }) {
  let [edgeTextBbox, setEdgeTextBbox] = useState({ x: 1, y: 0, width: 0, height: 0 }), edgeTextClasses = cc(["react-flow__edge-textwrapper", className]), edgeTextRef = useRef(null);
  return useEffect(() => {
    if (edgeTextRef.current) {
      let textBbox = edgeTextRef.current.getBBox();
      setEdgeTextBbox({
        x: textBbox.x,
        y: textBbox.y,
        width: textBbox.width,
        height: textBbox.height
      });
    }
  }, [label]), label ? jsxs("g", { transform: `translate(${x - edgeTextBbox.width / 2} ${y - edgeTextBbox.height / 2})`, className: edgeTextClasses, visibility: edgeTextBbox.width ? "visible" : "hidden", ...rest, children: [labelShowBg && jsx("rect", { width: edgeTextBbox.width + 2 * labelBgPadding[0], x: -labelBgPadding[0], y: -labelBgPadding[1], height: edgeTextBbox.height + 2 * labelBgPadding[1], className: "react-flow__edge-textbg", style: labelBgStyle, rx: labelBgBorderRadius, ry: labelBgBorderRadius }), jsx("text", { className: "react-flow__edge-text", y: edgeTextBbox.height / 2, dy: "0.3em", ref: edgeTextRef, style: labelStyle, children: label }), children2] }) : null;
}
EdgeTextComponent.displayName = "EdgeText";
var EdgeText = memo(EdgeTextComponent);
function BaseEdge({ path, labelX, labelY, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, interactionWidth = 20, ...props }) {
  return jsxs(Fragment, { children: [jsx("path", { ...props, d: path, fill: "none", className: cc(["react-flow__edge-path", props.className]) }), interactionWidth ? jsx("path", { d: path, fill: "none", strokeOpacity: 0, strokeWidth: interactionWidth, className: "react-flow__edge-interaction" }) : null, label && isNumeric(labelX) && isNumeric(labelY) ? jsx(EdgeText, { x: labelX, y: labelY, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius }) : null] });
}
function getControl({ pos, x1, y1, x2, y2 }) {
  return pos === Position.Left || pos === Position.Right ? [0.5 * (x1 + x2), y1] : [x1, 0.5 * (y1 + y2)];
}
function getSimpleBezierPath({ sourceX, sourceY, sourcePosition = Position.Bottom, targetX, targetY, targetPosition = Position.Top }) {
  let [sourceControlX, sourceControlY] = getControl({
    pos: sourcePosition,
    x1: sourceX,
    y1: sourceY,
    x2: targetX,
    y2: targetY
  }), [targetControlX, targetControlY] = getControl({
    pos: targetPosition,
    x1: targetX,
    y1: targetY,
    x2: sourceX,
    y2: sourceY
  }), [labelX, labelY, offsetX, offsetY] = getBezierEdgeCenter({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceControlX,
    sourceControlY,
    targetControlX,
    targetControlY
  });
  return [
    `M${sourceX},${sourceY} C${sourceControlX},${sourceControlY} ${targetControlX},${targetControlY} ${targetX},${targetY}`,
    labelX,
    labelY,
    offsetX,
    offsetY
  ];
}
function createSimpleBezierEdge(params) {
  return memo(({ id: id2, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style: style2, markerEnd, markerStart, interactionWidth }) => {
    let [path, labelX, labelY] = getSimpleBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition
    }), _id = params.isInternal ? void 0 : id2;
    return jsx(BaseEdge, { id: _id, path, labelX, labelY, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style: style2, markerEnd, markerStart, interactionWidth });
  });
}
var SimpleBezierEdge = createSimpleBezierEdge({ isInternal: !1 }), SimpleBezierEdgeInternal = createSimpleBezierEdge({ isInternal: !0 });
SimpleBezierEdge.displayName = "SimpleBezierEdge";
SimpleBezierEdgeInternal.displayName = "SimpleBezierEdgeInternal";
function createSmoothStepEdge(params) {
  return memo(({ id: id2, sourceX, sourceY, targetX, targetY, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style: style2, sourcePosition = Position.Bottom, targetPosition = Position.Top, markerEnd, markerStart, pathOptions, interactionWidth }) => {
    let [path, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: pathOptions?.borderRadius,
      offset: pathOptions?.offset,
      stepPosition: pathOptions?.stepPosition
    }), _id = params.isInternal ? void 0 : id2;
    return jsx(BaseEdge, { id: _id, path, labelX, labelY, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style: style2, markerEnd, markerStart, interactionWidth });
  });
}
var SmoothStepEdge = createSmoothStepEdge({ isInternal: !1 }), SmoothStepEdgeInternal = createSmoothStepEdge({ isInternal: !0 });
SmoothStepEdge.displayName = "SmoothStepEdge";
SmoothStepEdgeInternal.displayName = "SmoothStepEdgeInternal";
function createStepEdge(params) {
  return memo(({ id: id2, ...props }) => {
    let _id = params.isInternal ? void 0 : id2;
    return jsx(SmoothStepEdge, { ...props, id: _id, pathOptions: useMemo(() => ({ borderRadius: 0, offset: props.pathOptions?.offset }), [props.pathOptions?.offset]) });
  });
}
var StepEdge = createStepEdge({ isInternal: !1 }), StepEdgeInternal = createStepEdge({ isInternal: !0 });
StepEdge.displayName = "StepEdge";
StepEdgeInternal.displayName = "StepEdgeInternal";
function createStraightEdge(params) {
  return memo(({ id: id2, sourceX, sourceY, targetX, targetY, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style: style2, markerEnd, markerStart, interactionWidth }) => {
    let [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY }), _id = params.isInternal ? void 0 : id2;
    return jsx(BaseEdge, { id: _id, path, labelX, labelY, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style: style2, markerEnd, markerStart, interactionWidth });
  });
}
var StraightEdge = createStraightEdge({ isInternal: !1 }), StraightEdgeInternal = createStraightEdge({ isInternal: !0 });
StraightEdge.displayName = "StraightEdge";
StraightEdgeInternal.displayName = "StraightEdgeInternal";
function createBezierEdge(params) {
  return memo(({ id: id2, sourceX, sourceY, targetX, targetY, sourcePosition = Position.Bottom, targetPosition = Position.Top, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style: style2, markerEnd, markerStart, pathOptions, interactionWidth }) => {
    let [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature: pathOptions?.curvature
    }), _id = params.isInternal ? void 0 : id2;
    return jsx(BaseEdge, { id: _id, path, labelX, labelY, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, style: style2, markerEnd, markerStart, interactionWidth });
  });
}
var BezierEdge = createBezierEdge({ isInternal: !1 }), BezierEdgeInternal = createBezierEdge({ isInternal: !0 });
BezierEdge.displayName = "BezierEdge";
BezierEdgeInternal.displayName = "BezierEdgeInternal";
var builtinEdgeTypes = {
  default: BezierEdgeInternal,
  straight: StraightEdgeInternal,
  step: StepEdgeInternal,
  smoothstep: SmoothStepEdgeInternal,
  simplebezier: SimpleBezierEdgeInternal
}, nullPosition = {
  sourceX: null,
  sourceY: null,
  targetX: null,
  targetY: null,
  sourcePosition: null,
  targetPosition: null,
  zIndex: void 0
}, shiftX = (x, shift, position) => position === Position.Left ? x - shift : position === Position.Right ? x + shift : x, shiftY = (y, shift, position) => position === Position.Top ? y - shift : position === Position.Bottom ? y + shift : y, EdgeUpdaterClassName = "react-flow__edgeupdater";
function EdgeAnchor({ position, centerX, centerY, radius = 10, onMouseDown, onMouseEnter, onMouseOut, type }) {
  return jsx("circle", { onMouseDown, onMouseEnter, onMouseOut, className: cc([EdgeUpdaterClassName, `${EdgeUpdaterClassName}-${type}`]), cx: shiftX(centerX, radius, position), cy: shiftY(centerY, radius, position), r: radius, stroke: "transparent", fill: "transparent" });
}
function EdgeUpdateAnchors({ isReconnectable, reconnectRadius, edge, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, onReconnect, onReconnectStart, onReconnectEnd, setReconnecting, setUpdateHover }) {
  let store = useStoreApi(), handleEdgeUpdater = (event, oppositeHandle) => {
    if (event.button !== 0)
      return;
    let { autoPanOnConnect, domNode, connectionMode, connectionRadius, lib, onConnectStart, cancelConnection, nodeLookup, rfId: flowId, panBy: panBy2, updateConnection } = store.getState(), isTarget = oppositeHandle.type === "target", _onReconnectEnd = (evt, connectionState) => {
      setReconnecting(!1), onReconnectEnd?.(evt, edge, oppositeHandle.type, connectionState);
    }, onConnectEdge = (connection) => onReconnect?.(edge, connection), _onConnectStart = (_event, params) => {
      setReconnecting(!0), onReconnectStart?.(event, edge, oppositeHandle.type), onConnectStart?.(_event, params);
    };
    XYHandle.onPointerDown(event.nativeEvent, {
      autoPanOnConnect,
      connectionMode,
      connectionRadius,
      domNode,
      handleId: oppositeHandle.id,
      nodeId: oppositeHandle.nodeId,
      nodeLookup,
      isTarget,
      edgeUpdaterType: oppositeHandle.type,
      lib,
      flowId,
      cancelConnection,
      panBy: panBy2,
      isValidConnection: (...args) => store.getState().isValidConnection?.(...args) ?? !0,
      onConnect: onConnectEdge,
      onConnectStart: _onConnectStart,
      onConnectEnd: (...args) => store.getState().onConnectEnd?.(...args),
      onReconnectEnd: _onReconnectEnd,
      updateConnection,
      getTransform: () => store.getState().transform,
      getFromHandle: () => store.getState().connection.fromHandle,
      dragThreshold: store.getState().connectionDragThreshold,
      handleDomNode: event.currentTarget
    });
  }, onReconnectSourceMouseDown = (event) => handleEdgeUpdater(event, { nodeId: edge.target, id: edge.targetHandle ?? null, type: "target" }), onReconnectTargetMouseDown = (event) => handleEdgeUpdater(event, { nodeId: edge.source, id: edge.sourceHandle ?? null, type: "source" }), onReconnectMouseEnter = () => setUpdateHover(!0), onReconnectMouseOut = () => setUpdateHover(!1);
  return jsxs(Fragment, { children: [(isReconnectable === !0 || isReconnectable === "source") && jsx(EdgeAnchor, { position: sourcePosition, centerX: sourceX, centerY: sourceY, radius: reconnectRadius, onMouseDown: onReconnectSourceMouseDown, onMouseEnter: onReconnectMouseEnter, onMouseOut: onReconnectMouseOut, type: "source" }), (isReconnectable === !0 || isReconnectable === "target") && jsx(EdgeAnchor, { position: targetPosition, centerX: targetX, centerY: targetY, radius: reconnectRadius, onMouseDown: onReconnectTargetMouseDown, onMouseEnter: onReconnectMouseEnter, onMouseOut: onReconnectMouseOut, type: "target" })] });
}
function EdgeWrapper({ id: id2, edgesFocusable, edgesReconnectable, elementsSelectable, onClick, onDoubleClick, onContextMenu, onMouseEnter, onMouseMove, onMouseLeave, reconnectRadius, onReconnect, onReconnectStart, onReconnectEnd, rfId, edgeTypes, noPanClassName, onError, disableKeyboardA11y }) {
  let edge = useStore((s) => s.edgeLookup.get(id2)), defaultEdgeOptions = useStore((s) => s.defaultEdgeOptions);
  edge = defaultEdgeOptions ? { ...defaultEdgeOptions, ...edge } : edge;
  let edgeType = edge.type || "default", EdgeComponent = edgeTypes?.[edgeType] || builtinEdgeTypes[edgeType];
  EdgeComponent === void 0 && (onError?.("011", errorMessages.error011(edgeType)), edgeType = "default", EdgeComponent = edgeTypes?.default || builtinEdgeTypes.default);
  let isFocusable = !!(edge.focusable || edgesFocusable && typeof edge.focusable > "u"), isReconnectable = typeof onReconnect < "u" && (edge.reconnectable || edgesReconnectable && typeof edge.reconnectable > "u"), isSelectable = !!(edge.selectable || elementsSelectable && typeof edge.selectable > "u"), edgeRef = useRef(null), [updateHover, setUpdateHover] = useState(!1), [reconnecting, setReconnecting] = useState(!1), store = useStoreApi(), { zIndex = edge.zIndex, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = useStore(useCallback((store2) => {
    let sourceNode = store2.nodeLookup.get(edge.source), targetNode = store2.nodeLookup.get(edge.target);
    if (!sourceNode || !targetNode)
      return nullPosition;
    let edgePosition = getEdgePosition({
      id: id2,
      sourceNode,
      targetNode,
      sourceHandle: edge.sourceHandle || null,
      targetHandle: edge.targetHandle || null,
      connectionMode: store2.connectionMode,
      onError
    }), zIndex2 = getElevatedEdgeZIndex({
      selected: edge.selected,
      zIndex: edge.zIndex,
      sourceNode,
      targetNode,
      elevateOnSelect: store2.elevateEdgesOnSelect,
      zIndexMode: store2.zIndexMode
    });
    return {
      ...edgePosition || nullPosition,
      zIndex: zIndex2
    };
  }, [edge.source, edge.target, edge.sourceHandle, edge.targetHandle, edge.selected, edge.zIndex, onError]), shallow$1), markerStartUrl = useMemo(() => edge.markerStart ? `url('#${getMarkerId(edge.markerStart, rfId)}')` : void 0, [edge.markerStart, rfId]), markerEndUrl = useMemo(() => edge.markerEnd ? `url('#${getMarkerId(edge.markerEnd, rfId)}')` : void 0, [edge.markerEnd, rfId]);
  if (edge.hidden || sourceX === null || sourceY === null || targetX === null || targetY === null)
    return null;
  let onEdgeClick = (event) => {
    let { addSelectedEdges, unselectNodesAndEdges, multiSelectionActive } = store.getState();
    isSelectable && (store.setState({ nodesSelectionActive: !1 }), edge.selected && multiSelectionActive ? (unselectNodesAndEdges({ nodes: [], edges: [edge] }), edgeRef.current?.blur()) : addSelectedEdges([id2])), onClick && onClick(event, edge);
  }, onEdgeDoubleClick = onDoubleClick ? (event) => {
    onDoubleClick(event, { ...edge });
  } : void 0, onEdgeContextMenu = onContextMenu ? (event) => {
    onContextMenu(event, { ...edge });
  } : void 0, onEdgeMouseEnter = onMouseEnter ? (event) => {
    onMouseEnter(event, { ...edge });
  } : void 0, onEdgeMouseMove = onMouseMove ? (event) => {
    onMouseMove(event, { ...edge });
  } : void 0, onEdgeMouseLeave = onMouseLeave ? (event) => {
    onMouseLeave(event, { ...edge });
  } : void 0, onKeyDown = (event) => {
    if (!disableKeyboardA11y && elementSelectionKeys.includes(event.key) && isSelectable) {
      let { unselectNodesAndEdges, addSelectedEdges } = store.getState();
      event.key === "Escape" ? (edgeRef.current?.blur(), unselectNodesAndEdges({ edges: [edge] })) : addSelectedEdges([id2]);
    }
  };
  return jsx("svg", { style: { zIndex }, children: jsxs("g", { className: cc([
    "react-flow__edge",
    `react-flow__edge-${edgeType}`,
    edge.className,
    noPanClassName,
    {
      selected: edge.selected,
      animated: edge.animated,
      inactive: !isSelectable && !onClick,
      updating: updateHover,
      selectable: isSelectable
    }
  ]), onClick: onEdgeClick, onDoubleClick: onEdgeDoubleClick, onContextMenu: onEdgeContextMenu, onMouseEnter: onEdgeMouseEnter, onMouseMove: onEdgeMouseMove, onMouseLeave: onEdgeMouseLeave, onKeyDown: isFocusable ? onKeyDown : void 0, tabIndex: isFocusable ? 0 : void 0, role: edge.ariaRole ?? (isFocusable ? "group" : "img"), "aria-roledescription": "edge", "data-id": id2, "data-testid": `rf__edge-${id2}`, "aria-label": edge.ariaLabel === null ? void 0 : edge.ariaLabel || `Edge from ${edge.source} to ${edge.target}`, "aria-describedby": isFocusable ? `${ARIA_EDGE_DESC_KEY}-${rfId}` : void 0, ref: edgeRef, ...edge.domAttributes, children: [!reconnecting && jsx(EdgeComponent, { id: id2, source: edge.source, target: edge.target, type: edge.type, selected: edge.selected, animated: edge.animated, selectable: isSelectable, deletable: edge.deletable ?? !0, label: edge.label, labelStyle: edge.labelStyle, labelShowBg: edge.labelShowBg, labelBgStyle: edge.labelBgStyle, labelBgPadding: edge.labelBgPadding, labelBgBorderRadius: edge.labelBgBorderRadius, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data: edge.data, style: edge.style, sourceHandleId: edge.sourceHandle, targetHandleId: edge.targetHandle, markerStart: markerStartUrl, markerEnd: markerEndUrl, pathOptions: "pathOptions" in edge ? edge.pathOptions : void 0, interactionWidth: edge.interactionWidth }), isReconnectable && jsx(EdgeUpdateAnchors, { edge, isReconnectable, reconnectRadius, onReconnect, onReconnectStart, onReconnectEnd, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, setUpdateHover, setReconnecting })] }) });
}
var EdgeWrapper$1 = memo(EdgeWrapper), selector$9 = (s) => ({
  edgesFocusable: s.edgesFocusable,
  edgesReconnectable: s.edgesReconnectable,
  elementsSelectable: s.elementsSelectable,
  connectionMode: s.connectionMode,
  onError: s.onError
});
function EdgeRendererComponent({ defaultMarkerColor, onlyRenderVisibleElements, rfId, edgeTypes, noPanClassName, onReconnect, onEdgeContextMenu, onEdgeMouseEnter, onEdgeMouseMove, onEdgeMouseLeave, onEdgeClick, reconnectRadius, onEdgeDoubleClick, onReconnectStart, onReconnectEnd, disableKeyboardA11y }) {
  let { edgesFocusable, edgesReconnectable, elementsSelectable, onError } = useStore(selector$9, shallow$1), edgeIds = useVisibleEdgeIds(onlyRenderVisibleElements);
  return jsxs("div", { className: "react-flow__edges", children: [jsx(MarkerDefinitions$1, { defaultColor: defaultMarkerColor, rfId }), edgeIds.map((id2) => jsx(EdgeWrapper$1, { id: id2, edgesFocusable, edgesReconnectable, elementsSelectable, noPanClassName, onReconnect, onContextMenu: onEdgeContextMenu, onMouseEnter: onEdgeMouseEnter, onMouseMove: onEdgeMouseMove, onMouseLeave: onEdgeMouseLeave, onClick: onEdgeClick, reconnectRadius, onDoubleClick: onEdgeDoubleClick, onReconnectStart, onReconnectEnd, rfId, onError, edgeTypes, disableKeyboardA11y }, id2))] });
}
EdgeRendererComponent.displayName = "EdgeRenderer";
var EdgeRenderer = memo(EdgeRendererComponent), toTransformString = (transform2) => `translate(${transform2[0]}px,${transform2[1]}px) scale(${transform2[2]})`;
function Viewport({ children: children2 }) {
  let store = useStoreApi(), viewportRef = useRef(null), [initialTransform] = useState(() => store.getState().transform);
  return useIsomorphicLayoutEffect(() => {
    let prevTransform = null, applyTransform = () => {
      let transform2 = store.getState().transform;
      prevTransform && transform2[0] === prevTransform[0] && transform2[1] === prevTransform[1] && transform2[2] === prevTransform[2] || (prevTransform = transform2, viewportRef.current && (viewportRef.current.style.transform = toTransformString(transform2)));
    };
    return applyTransform(), store.subscribe(applyTransform);
  }, [store]), jsx("div", { ref: viewportRef, className: "react-flow__viewport xyflow__viewport react-flow__container", style: { transform: toTransformString(initialTransform) }, children: children2 });
}
function useOnInitHandler(onInit) {
  let rfInstance = useReactFlow(), isInitialized = useRef(!1);
  useEffect(() => {
    !isInitialized.current && rfInstance.viewportInitialized && onInit && (setTimeout(() => onInit(rfInstance), 1), isInitialized.current = !0);
  }, [onInit, rfInstance.viewportInitialized]);
}
var selector$8 = (state) => state.panZoom?.syncViewport;
function useViewportSync(viewport) {
  let syncViewport = useStore(selector$8), store = useStoreApi();
  return useEffect(() => {
    viewport && (syncViewport?.(viewport), store.setState({ transform: [viewport.x, viewport.y, viewport.zoom] }));
  }, [viewport, syncViewport]), null;
}
function storeSelector$1(s) {
  return s.connection.inProgress ? { ...s.connection, to: pointToRendererPoint(s.connection.to, s.transform) } : { ...s.connection };
}
function getSelector(connectionSelector) {
  return connectionSelector ? (s) => {
    let connection = storeSelector$1(s);
    return connectionSelector(connection);
  } : storeSelector$1;
}
function useConnection(connectionSelector) {
  let combinedSelector = getSelector(connectionSelector);
  return useStore(combinedSelector, shallow$1);
}
var selector$7 = (s) => ({
  nodesConnectable: s.nodesConnectable,
  isValid: s.connection.isValid,
  inProgress: s.connection.inProgress,
  width: s.width,
  height: s.height
});
function ConnectionLineWrapper({ containerStyle: containerStyle2, style: style2, type, component }) {
  let { nodesConnectable, width, height, isValid, inProgress } = useStore(selector$7, shallow$1);
  return !(width && nodesConnectable && inProgress) ? null : jsx("svg", { style: containerStyle2, width, height, className: "react-flow__connectionline react-flow__container", children: jsx("g", { className: cc(["react-flow__connection", getConnectionStatus(isValid)]), children: jsx(ConnectionLine, { style: style2, type, CustomComponent: component, isValid }) }) });
}
var ConnectionLine = ({ style: style2, type = ConnectionLineType.Bezier, CustomComponent, isValid }) => {
  let { inProgress, from, fromNode, fromHandle, fromPosition, to, toNode, toHandle, toPosition, pointer: pointer2 } = useConnection();
  if (!inProgress)
    return;
  if (CustomComponent)
    return jsx(CustomComponent, { connectionLineType: type, connectionLineStyle: style2, fromNode, fromHandle, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, fromPosition, toPosition, connectionStatus: getConnectionStatus(isValid), toNode, toHandle, pointer: pointer2 });
  let path = "", pathParams = {
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: fromPosition,
    targetX: to.x,
    targetY: to.y,
    targetPosition: toPosition
  };
  switch (type) {
    case ConnectionLineType.Bezier:
      [path] = getBezierPath(pathParams);
      break;
    case ConnectionLineType.SimpleBezier:
      [path] = getSimpleBezierPath(pathParams);
      break;
    case ConnectionLineType.Step:
      [path] = getSmoothStepPath({
        ...pathParams,
        borderRadius: 0
      });
      break;
    case ConnectionLineType.SmoothStep:
      [path] = getSmoothStepPath(pathParams);
      break;
    default:
      [path] = getStraightPath(pathParams);
  }
  return jsx("path", { d: path, fill: "none", className: "react-flow__connection-path", style: style2 });
};
ConnectionLine.displayName = "ConnectionLine";
var emptyTypes = {};
function useNodeOrEdgeTypesWarning(nodeOrEdgeTypes = emptyTypes) {
  let typesRef = useRef(nodeOrEdgeTypes), store = useStoreApi();
  useEffect(() => {
  }, [nodeOrEdgeTypes]);
}
function useStylesLoadedWarning() {
  let store = useStoreApi(), checked = useRef(!1);
  useEffect(() => {
  }, []);
}
function GraphViewComponent({ nodeTypes, edgeTypes, onInit, onNodeClick, onEdgeClick, onNodeDoubleClick, onEdgeDoubleClick, onNodeMouseEnter, onNodeMouseMove, onNodeMouseLeave, onNodeContextMenu, onSelectionContextMenu, onSelectionStart, onSelectionEnd, connectionLineType, connectionLineStyle, connectionLineComponent, connectionLineContainerStyle, selectionKeyCode, selectionOnDrag, selectionMode, multiSelectionKeyCode, panActivationKeyCode, zoomActivationKeyCode, deleteKeyCode, onlyRenderVisibleElements, elementsSelectable, defaultViewport: defaultViewport2, translateExtent, minZoom, maxZoom, preventScrolling, defaultMarkerColor, zoomOnScroll, zoomOnPinch, panOnScroll, panOnScrollSpeed, panOnScrollMode, zoomOnDoubleClick, panOnDrag, autoPanOnSelection, onPaneClick, onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, onPaneScroll, onPaneContextMenu, paneClickDistance, nodeClickDistance, onEdgeContextMenu, onEdgeMouseEnter, onEdgeMouseMove, onEdgeMouseLeave, reconnectRadius, onReconnect, onReconnectStart, onReconnectEnd, noDragClassName, noWheelClassName, noPanClassName, disableKeyboardA11y, nodeExtent, rfId, viewport, onViewportChange, nodesDraggable }) {
  return useNodeOrEdgeTypesWarning(nodeTypes), useNodeOrEdgeTypesWarning(edgeTypes), useStylesLoadedWarning(), useOnInitHandler(onInit), useViewportSync(viewport), jsx(FlowRenderer, { onPaneClick, onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, onPaneContextMenu, onPaneScroll, paneClickDistance, deleteKeyCode, selectionKeyCode, selectionOnDrag, selectionMode, onSelectionStart, onSelectionEnd, multiSelectionKeyCode, panActivationKeyCode, zoomActivationKeyCode, elementsSelectable, zoomOnScroll, zoomOnPinch, zoomOnDoubleClick, panOnScroll, panOnScrollSpeed, panOnScrollMode, panOnDrag, autoPanOnSelection, defaultViewport: defaultViewport2, translateExtent, minZoom, maxZoom, onSelectionContextMenu, preventScrolling, noDragClassName, noWheelClassName, noPanClassName, disableKeyboardA11y, onViewportChange, isControlledViewport: !!viewport, children: jsxs(Viewport, { children: [jsx(EdgeRenderer, { edgeTypes, onEdgeClick, onEdgeDoubleClick, onReconnect, onReconnectStart, onReconnectEnd, onlyRenderVisibleElements, onEdgeContextMenu, onEdgeMouseEnter, onEdgeMouseMove, onEdgeMouseLeave, reconnectRadius, defaultMarkerColor, noPanClassName, disableKeyboardA11y, rfId }), jsx(ConnectionLineWrapper, { style: connectionLineStyle, type: connectionLineType, component: connectionLineComponent, containerStyle: connectionLineContainerStyle }), jsx("div", { className: "react-flow__edgelabel-renderer" }), jsx(NodeRenderer, { nodeTypes, onNodeClick, onNodeDoubleClick, onNodeMouseEnter, onNodeMouseMove, onNodeMouseLeave, onNodeContextMenu, nodeClickDistance, onlyRenderVisibleElements, noPanClassName, noDragClassName, disableKeyboardA11y, nodeExtent, rfId, nodesDraggable }), jsx("div", { className: "react-flow__viewport-portal" })] }) });
}
GraphViewComponent.displayName = "GraphView";
var GraphView = memo(GraphViewComponent), devWarn = createDevWarn("React Flow", "https://reactflow.dev/"), getInitialState = ({ nodes, edges, defaultNodes, defaultEdges, width, height, fitView, fitViewOptions, minZoom = 0.5, maxZoom = 2, nodeOrigin, nodeExtent, zIndexMode = "basic" } = {}) => {
  let nodeLookup = /* @__PURE__ */ new Map(), parentLookup = /* @__PURE__ */ new Map(), connectionLookup = /* @__PURE__ */ new Map(), edgeLookup = /* @__PURE__ */ new Map(), storeEdges = defaultEdges ?? edges ?? [], storeNodes = defaultNodes ?? nodes ?? [], storeNodeOrigin = nodeOrigin ?? [0, 0], storeNodeExtent = nodeExtent ?? infiniteExtent;
  updateConnectionLookup(connectionLookup, edgeLookup, storeEdges);
  let { nodesInitialized } = adoptUserNodes(storeNodes, nodeLookup, parentLookup, {
    nodeOrigin: storeNodeOrigin,
    nodeExtent: storeNodeExtent,
    zIndexMode
  }), transform2 = [0, 0, 1];
  if (fitView && width && height) {
    let bounds = getInternalNodesBounds(nodeLookup, {
      filter: (node) => !!((node.width || node.initialWidth) && (node.height || node.initialHeight))
    }), { x, y, zoom: zoom3 } = getViewportForBounds(bounds, width, height, minZoom, maxZoom, fitViewOptions?.padding ?? 0.1);
    transform2 = [x, y, zoom3];
  }
  return {
    rfId: "1",
    width: width ?? 0,
    height: height ?? 0,
    transform: transform2,
    nodes: storeNodes,
    nodesInitialized,
    nodeLookup,
    parentLookup,
    edges: storeEdges,
    edgeLookup,
    connectionLookup,
    onNodesChange: null,
    onEdgesChange: null,
    hasDefaultNodes: defaultNodes !== void 0,
    hasDefaultEdges: defaultEdges !== void 0,
    panZoom: null,
    minZoom,
    maxZoom,
    translateExtent: infiniteExtent,
    nodeExtent: storeNodeExtent,
    nodesSelectionActive: !1,
    userSelectionActive: !1,
    userSelectionRect: null,
    connectionMode: ConnectionMode.Strict,
    domNode: null,
    paneDragging: !1,
    noPanClassName: "nopan",
    nodeOrigin: storeNodeOrigin,
    nodeDragThreshold: 1,
    connectionDragThreshold: 1,
    snapGrid: [15, 15],
    snapToGrid: !1,
    nodesDraggable: !0,
    nodesConnectable: !0,
    nodesFocusable: !0,
    edgesFocusable: !0,
    edgesReconnectable: !0,
    elementsSelectable: !0,
    elevateNodesOnSelect: !0,
    elevateEdgesOnSelect: !0,
    selectNodesOnDrag: !0,
    multiSelectionActive: !1,
    fitViewQueued: fitView ?? !1,
    fitViewOptions,
    fitViewResolver: null,
    connection: { ...initialConnection },
    connectionClickStartHandle: null,
    connectOnClick: !0,
    ariaLiveMessage: "",
    autoPanOnConnect: !0,
    autoPanOnNodeDrag: !0,
    autoPanOnNodeFocus: !0,
    autoPanSpeed: 15,
    connectionRadius: 20,
    onError: devWarn,
    isValidConnection: void 0,
    onSelectionChangeHandlers: [],
    lib: "react",
    debug: !1,
    ariaLabelConfig: defaultAriaLabelConfig,
    zIndexMode,
    defaultEdgeOptions: void 0,
    onNodesChangeMiddlewareMap: /* @__PURE__ */ new Map(),
    onEdgesChangeMiddlewareMap: /* @__PURE__ */ new Map(),
    onNodesDelete: void 0,
    onEdgesDelete: void 0,
    onDelete: void 0,
    onBeforeDelete: void 0,
    onViewportChangeStart: void 0,
    onViewportChange: void 0,
    onViewportChangeEnd: void 0,
    onNodeDragStart: void 0,
    onNodeDrag: void 0,
    onNodeDragStop: void 0,
    onSelectionDragStart: void 0,
    onSelectionDrag: void 0,
    onSelectionDragStop: void 0,
    onMoveStart: void 0,
    onMove: void 0,
    onMoveEnd: void 0,
    onConnect: void 0,
    onConnectStart: void 0,
    onConnectEnd: void 0,
    onClickConnectStart: void 0,
    onClickConnectEnd: void 0
  };
}, createStore2 = ({ nodes, edges, defaultNodes, defaultEdges, width, height, fitView, fitViewOptions, minZoom, maxZoom, nodeOrigin, nodeExtent, zIndexMode }) => createWithEqualityFn((set3, get3) => {
  async function resolveFitView() {
    let { nodeLookup, panZoom, fitViewOptions: fitViewOptions2, fitViewResolver, width: width2, height: height2, minZoom: minZoom2, maxZoom: maxZoom2 } = get3();
    panZoom && (await fitViewport({
      nodes: nodeLookup,
      width: width2,
      height: height2,
      panZoom,
      minZoom: minZoom2,
      maxZoom: maxZoom2
    }, fitViewOptions2), fitViewResolver?.resolve(!0), set3({ fitViewResolver: null }));
  }
  return {
    ...getInitialState({
      nodes,
      edges,
      width,
      height,
      fitView,
      fitViewOptions,
      minZoom,
      maxZoom,
      nodeOrigin,
      nodeExtent,
      defaultNodes,
      defaultEdges,
      zIndexMode
    }),
    setNodes: (nodes2) => {
      let { nodeLookup, parentLookup, nodeOrigin: nodeOrigin2, nodeExtent: nodeExtent2, elevateNodesOnSelect, fitViewQueued, zIndexMode: zIndexMode2, nodesSelectionActive } = get3(), { nodesInitialized, hasSelectedNodes } = adoptUserNodes(nodes2, nodeLookup, parentLookup, {
        nodeOrigin: nodeOrigin2,
        nodeExtent: nodeExtent2,
        elevateNodesOnSelect,
        checkEquality: !0,
        zIndexMode: zIndexMode2
      }), nextNodesSelectionActive = nodesSelectionActive && hasSelectedNodes;
      fitViewQueued && nodesInitialized ? (resolveFitView(), set3({
        nodes: nodes2,
        nodesInitialized,
        fitViewQueued: !1,
        fitViewOptions: void 0,
        nodesSelectionActive: nextNodesSelectionActive
      })) : set3({ nodes: nodes2, nodesInitialized, nodesSelectionActive: nextNodesSelectionActive });
    },
    setEdges: (edges2) => {
      let { connectionLookup, edgeLookup } = get3();
      updateConnectionLookup(connectionLookup, edgeLookup, edges2), set3({ edges: edges2 });
    },
    setDefaultNodesAndEdges: (nodes2, edges2) => {
      if (nodes2) {
        let { setNodes } = get3();
        setNodes(nodes2), set3({ hasDefaultNodes: !0 });
      }
      if (edges2) {
        let { setEdges } = get3();
        setEdges(edges2), set3({ hasDefaultEdges: !0 });
      }
    },
    /*
     * Every node gets registered at a ResizeObserver. Whenever a node
     * changes its dimensions, this function is called to measure the
     * new dimensions and update the nodes.
     */
    updateNodeInternals: (updates) => {
      let { triggerNodeChanges, nodeLookup, parentLookup, domNode, nodeOrigin: nodeOrigin2, nodeExtent: nodeExtent2, debug, fitViewQueued, zIndexMode: zIndexMode2 } = get3(), { changes, updatedInternals } = updateNodeInternals(updates, nodeLookup, parentLookup, domNode, nodeOrigin2, nodeExtent2, zIndexMode2);
      updatedInternals && (updateAbsolutePositions(nodeLookup, parentLookup, { nodeOrigin: nodeOrigin2, nodeExtent: nodeExtent2, zIndexMode: zIndexMode2 }), fitViewQueued ? (resolveFitView(), set3({ fitViewQueued: !1, fitViewOptions: void 0 })) : set3({}), changes?.length > 0 && (debug && console.log("React Flow: trigger node changes", changes), triggerNodeChanges?.(changes)));
    },
    updateNodePositions: (nodeDragItems, dragging = !1) => {
      let parentExpandChildren = [], changes = [], { nodeLookup, triggerNodeChanges, connection, updateConnection, onNodesChangeMiddlewareMap } = get3();
      for (let [id2, dragItem] of nodeDragItems) {
        let node = nodeLookup.get(id2), expandParent = !!(node?.expandParent && node?.parentId && dragItem?.position), change = {
          id: id2,
          type: "position",
          position: expandParent ? {
            x: Math.max(0, dragItem.position.x),
            y: Math.max(0, dragItem.position.y)
          } : dragItem.position,
          dragging
        };
        if (node && connection.inProgress && connection.fromNode.id === node.id) {
          let updatedFrom = getHandlePosition(node, connection.fromHandle, Position.Left, !0);
          updateConnection({ ...connection, from: updatedFrom });
        }
        expandParent && node.parentId && parentExpandChildren.push({
          id: id2,
          parentId: node.parentId,
          rect: {
            ...dragItem.internals.positionAbsolute,
            width: dragItem.measured.width ?? 0,
            height: dragItem.measured.height ?? 0
          }
        }), changes.push(change);
      }
      if (parentExpandChildren.length > 0) {
        let { parentLookup, nodeOrigin: nodeOrigin2 } = get3(), parentExpandChanges = handleExpandParent(parentExpandChildren, nodeLookup, parentLookup, nodeOrigin2);
        changes.push(...parentExpandChanges);
      }
      for (let middleware of onNodesChangeMiddlewareMap.values())
        changes = middleware(changes);
      triggerNodeChanges(changes);
    },
    triggerNodeChanges: (changes) => {
      let { onNodesChange, setNodes, nodes: nodes2, hasDefaultNodes, debug } = get3();
      if (changes?.length) {
        if (hasDefaultNodes) {
          let updatedNodes = applyNodeChanges(changes, nodes2);
          setNodes(updatedNodes);
        }
        debug && console.log("React Flow: trigger node changes", changes), onNodesChange?.(changes);
      }
    },
    triggerEdgeChanges: (changes) => {
      let { onEdgesChange, setEdges, edges: edges2, hasDefaultEdges, debug } = get3();
      if (changes?.length) {
        if (hasDefaultEdges) {
          let updatedEdges = applyEdgeChanges(changes, edges2);
          setEdges(updatedEdges);
        }
        debug && console.log("React Flow: trigger edge changes", changes), onEdgesChange?.(changes);
      }
    },
    addSelectedNodes: (selectedNodeIds) => {
      let { multiSelectionActive, edgeLookup, nodeLookup, triggerNodeChanges, triggerEdgeChanges } = get3();
      if (multiSelectionActive) {
        let nodeChanges = selectedNodeIds.map((nodeId) => createSelectionChange(nodeId, !0));
        triggerNodeChanges(nodeChanges);
        return;
      }
      triggerNodeChanges(getSelectionChanges(nodeLookup, /* @__PURE__ */ new Set([...selectedNodeIds]))), triggerEdgeChanges(getSelectionChanges(edgeLookup));
    },
    addSelectedEdges: (selectedEdgeIds) => {
      let { multiSelectionActive, edgeLookup, nodeLookup, triggerNodeChanges, triggerEdgeChanges } = get3();
      if (multiSelectionActive) {
        let changedEdges = selectedEdgeIds.map((edgeId) => createSelectionChange(edgeId, !0));
        triggerEdgeChanges(changedEdges);
        return;
      }
      triggerEdgeChanges(getSelectionChanges(edgeLookup, /* @__PURE__ */ new Set([...selectedEdgeIds]))), triggerNodeChanges(getSelectionChanges(nodeLookup, /* @__PURE__ */ new Set()));
    },
    unselectNodesAndEdges: ({ nodes: nodes2, edges: edges2 } = {}) => {
      let { edges: storeEdges, nodes: storeNodes, nodeLookup, triggerNodeChanges, triggerEdgeChanges } = get3(), nodesToUnselect = nodes2 || storeNodes, edgesToUnselect = edges2 || storeEdges, nodeChanges = [];
      for (let node of nodesToUnselect)
        node.selected && nodeChanges.push(createSelectionChange(node.id, !1));
      let edgeChanges = [];
      for (let edge of edgesToUnselect)
        edge.selected && edgeChanges.push(createSelectionChange(edge.id, !1));
      triggerNodeChanges(nodeChanges), triggerEdgeChanges(edgeChanges);
    },
    setMinZoom: (minZoom2) => {
      let { panZoom, maxZoom: maxZoom2 } = get3();
      panZoom?.setScaleExtent([minZoom2, maxZoom2]), set3({ minZoom: minZoom2 });
    },
    setMaxZoom: (maxZoom2) => {
      let { panZoom, minZoom: minZoom2 } = get3();
      panZoom?.setScaleExtent([minZoom2, maxZoom2]), set3({ maxZoom: maxZoom2 });
    },
    setTranslateExtent: (translateExtent) => {
      get3().panZoom?.setTranslateExtent(translateExtent), set3({ translateExtent });
    },
    resetSelectedElements: () => {
      let { edges: edges2, nodes: nodes2, triggerNodeChanges, triggerEdgeChanges, elementsSelectable } = get3();
      if (!elementsSelectable)
        return;
      let nodeChanges = nodes2.reduce((res, node) => node.selected ? [...res, createSelectionChange(node.id, !1)] : res, []), edgeChanges = edges2.reduce((res, edge) => edge.selected ? [...res, createSelectionChange(edge.id, !1)] : res, []);
      triggerNodeChanges(nodeChanges), triggerEdgeChanges(edgeChanges);
    },
    setNodeExtent: (nextNodeExtent) => {
      let { nodes: nodes2, nodeLookup, parentLookup, nodeOrigin: nodeOrigin2, elevateNodesOnSelect, nodeExtent: nodeExtent2, zIndexMode: zIndexMode2 } = get3();
      nextNodeExtent[0][0] === nodeExtent2[0][0] && nextNodeExtent[0][1] === nodeExtent2[0][1] && nextNodeExtent[1][0] === nodeExtent2[1][0] && nextNodeExtent[1][1] === nodeExtent2[1][1] || (adoptUserNodes(nodes2, nodeLookup, parentLookup, {
        nodeOrigin: nodeOrigin2,
        nodeExtent: nextNodeExtent,
        elevateNodesOnSelect,
        checkEquality: !1,
        zIndexMode: zIndexMode2
      }), set3({ nodeExtent: nextNodeExtent }));
    },
    panBy: (delta) => {
      let { transform: transform2, width: width2, height: height2, panZoom, translateExtent } = get3();
      return panBy({ delta, panZoom, transform: transform2, translateExtent, width: width2, height: height2 });
    },
    setCenter: async (x, y, options) => {
      let { width: width2, height: height2, maxZoom: maxZoom2, panZoom } = get3();
      if (!panZoom)
        return !1;
      let nextZoom = typeof options?.zoom < "u" ? options.zoom : maxZoom2;
      return await panZoom.setViewport({
        x: width2 / 2 - x * nextZoom,
        y: height2 / 2 - y * nextZoom,
        zoom: nextZoom
      }, { duration: options?.duration, ease: options?.ease, interpolate: options?.interpolate }), !0;
    },
    cancelConnection: () => {
      set3({
        connection: { ...initialConnection }
      });
    },
    updateConnection: (connection) => {
      set3({ connection });
    },
    reset: () => set3({ ...getInitialState() })
  };
}, Object.is);
function ReactFlowProvider({ initialNodes: nodes, initialEdges: edges, defaultNodes, defaultEdges, initialWidth: width, initialHeight: height, initialMinZoom: minZoom, initialMaxZoom: maxZoom, initialFitViewOptions: fitViewOptions, fitView, nodeOrigin, nodeExtent, zIndexMode, children: children2 }) {
  let [store] = useState(() => createStore2({
    nodes,
    edges,
    defaultNodes,
    defaultEdges,
    width,
    height,
    fitView,
    minZoom,
    maxZoom,
    fitViewOptions,
    nodeOrigin,
    nodeExtent,
    zIndexMode
  }));
  return jsx(Provider$1, { value: store, children: jsx(BatchProvider, { children: jsx(HandleConfigProvider, { children: children2 }) }) });
}
function Wrapper({ children: children2, nodes, edges, defaultNodes, defaultEdges, width, height, fitView, fitViewOptions, minZoom, maxZoom, nodeOrigin, nodeExtent, zIndexMode }) {
  return useContext(StoreContext) ? jsx(Fragment, { children: children2 }) : jsx(ReactFlowProvider, { initialNodes: nodes, initialEdges: edges, defaultNodes, defaultEdges, initialWidth: width, initialHeight: height, fitView, initialFitViewOptions: fitViewOptions, initialMinZoom: minZoom, initialMaxZoom: maxZoom, nodeOrigin, nodeExtent, zIndexMode, children: children2 });
}
var wrapperStyle = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  zIndex: 0
};
function ReactFlow({ nodes, edges, defaultNodes, defaultEdges, className, nodeTypes, edgeTypes, onNodeClick, onEdgeClick, onInit, onMove, onMoveStart, onMoveEnd, onConnect, onConnectStart, onConnectEnd, onClickConnectStart, onClickConnectEnd, onNodeMouseEnter, onNodeMouseMove, onNodeMouseLeave, onNodeContextMenu, onNodeDoubleClick, onNodeDragStart, onNodeDrag, onNodeDragStop, onNodesDelete, onEdgesDelete, onDelete, onSelectionChange, onSelectionDragStart, onSelectionDrag, onSelectionDragStop, onSelectionContextMenu, onSelectionStart, onSelectionEnd, onBeforeDelete, connectionMode, connectionLineType = ConnectionLineType.Bezier, connectionLineStyle, connectionLineComponent, connectionLineContainerStyle, deleteKeyCode = "Backspace", selectionKeyCode = "Shift", selectionOnDrag = !1, selectionMode = SelectionMode.Full, panActivationKeyCode = "Space", multiSelectionKeyCode = isMacOs() ? "Meta" : "Control", zoomActivationKeyCode = isMacOs() ? "Meta" : "Control", snapToGrid, snapGrid, onlyRenderVisibleElements = !1, selectNodesOnDrag, nodesDraggable, autoPanOnNodeFocus, nodesConnectable, nodesFocusable, nodeOrigin = defaultNodeOrigin, edgesFocusable, edgesReconnectable, elementsSelectable = !0, defaultViewport: defaultViewport$1 = defaultViewport, minZoom = 0.5, maxZoom = 2, translateExtent = infiniteExtent, preventScrolling = !0, nodeExtent, defaultMarkerColor = "#b1b1b7", zoomOnScroll = !0, zoomOnPinch = !0, panOnScroll = !1, panOnScrollSpeed = 0.5, panOnScrollMode = PanOnScrollMode.Free, zoomOnDoubleClick = !0, panOnDrag = !0, onPaneClick, onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, onPaneScroll, onPaneContextMenu, paneClickDistance = 1, nodeClickDistance = 0, children: children2, onReconnect, onReconnectStart, onReconnectEnd, onEdgeContextMenu, onEdgeDoubleClick, onEdgeMouseEnter, onEdgeMouseMove, onEdgeMouseLeave, reconnectRadius = 10, onNodesChange, onEdgesChange, noDragClassName = "nodrag", noWheelClassName = "nowheel", noPanClassName = "nopan", fitView, fitViewOptions, connectOnClick, attributionPosition, proOptions, defaultEdgeOptions, elevateNodesOnSelect = !0, elevateEdgesOnSelect = !1, disableKeyboardA11y = !1, autoPanOnConnect, autoPanOnNodeDrag, autoPanOnSelection = !0, autoPanSpeed, connectionRadius, isValidConnection, onError, style: style2, id: id2, nodeDragThreshold, connectionDragThreshold, viewport, onViewportChange, width, height, colorMode = "light", debug, onScroll, ariaLabelConfig, zIndexMode = "basic", ...rest }, ref) {
  let rfId = id2 || "1", colorModeClassName = useColorModeClass(colorMode), wrapperOnScroll = useCallback((e) => {
    e.currentTarget.scrollTo({ top: 0, left: 0, behavior: "instant" }), onScroll?.(e);
  }, [onScroll]);
  return jsx("div", { "data-testid": "rf__wrapper", ...rest, onScroll: wrapperOnScroll, style: { ...style2, ...wrapperStyle }, ref, className: cc(["react-flow", className, colorModeClassName]), id: id2, role: "application", children: jsxs(Wrapper, { nodes, edges, width, height, fitView, fitViewOptions, minZoom, maxZoom, nodeOrigin, nodeExtent, zIndexMode, children: [jsx(StoreUpdater, { nodes, edges, defaultNodes, defaultEdges, onConnect, onConnectStart, onConnectEnd, onClickConnectStart, onClickConnectEnd, nodesDraggable, autoPanOnNodeFocus, nodesConnectable, nodesFocusable, edgesFocusable, edgesReconnectable, elementsSelectable, elevateNodesOnSelect, elevateEdgesOnSelect, minZoom, maxZoom, nodeExtent, onNodesChange, onEdgesChange, snapToGrid, snapGrid, connectionMode, translateExtent, connectOnClick, defaultEdgeOptions, fitView, fitViewOptions, onNodesDelete, onEdgesDelete, onDelete, onNodeDragStart, onNodeDrag, onNodeDragStop, onSelectionDrag, onSelectionDragStart, onSelectionDragStop, onMove, onMoveStart, onMoveEnd, noPanClassName, nodeOrigin, rfId, autoPanOnConnect, autoPanOnNodeDrag, autoPanSpeed, onError, connectionRadius, isValidConnection, selectNodesOnDrag, nodeDragThreshold, connectionDragThreshold, onBeforeDelete, debug, ariaLabelConfig, zIndexMode }), jsx(GraphView, { onInit, onNodeClick, onEdgeClick, onNodeMouseEnter, onNodeMouseMove, onNodeMouseLeave, onNodeContextMenu, onNodeDoubleClick, nodeTypes, edgeTypes, connectionLineType, connectionLineStyle, connectionLineComponent, connectionLineContainerStyle, selectionKeyCode, selectionOnDrag, selectionMode, deleteKeyCode, multiSelectionKeyCode, panActivationKeyCode, zoomActivationKeyCode, onlyRenderVisibleElements, defaultViewport: defaultViewport$1, translateExtent, minZoom, maxZoom, preventScrolling, zoomOnScroll, zoomOnPinch, zoomOnDoubleClick, panOnScroll, panOnScrollSpeed, panOnScrollMode, panOnDrag, autoPanOnSelection, onPaneClick, onPaneMouseEnter, onPaneMouseMove, onPaneMouseLeave, onPaneScroll, onPaneContextMenu, paneClickDistance, nodeClickDistance, onSelectionContextMenu, onSelectionStart, onSelectionEnd, onReconnect, onReconnectStart, onReconnectEnd, onEdgeContextMenu, onEdgeDoubleClick, onEdgeMouseEnter, onEdgeMouseMove, onEdgeMouseLeave, reconnectRadius, defaultMarkerColor, noDragClassName, noWheelClassName, noPanClassName, rfId, disableKeyboardA11y, nodeExtent, viewport, onViewportChange, nodesDraggable }), jsx(SelectionListener, { onSelectionChange }), children2, jsx(Attribution, { proOptions, position: attributionPosition }), jsx(A11yDescriptions, { rfId, disableKeyboardA11y })] }) });
}
var index = fixedForwardRef(ReactFlow), selector$6 = (s) => s.domNode?.querySelector(".react-flow__edgelabel-renderer");
function EdgeLabelRenderer({ children: children2 }) {
  let edgeLabelRenderer = useStore(selector$6);
  return edgeLabelRenderer ? createPortal(children2, edgeLabelRenderer) : null;
}
var viewportSelector = (state) => ({
  x: state.transform[0],
  y: state.transform[1],
  zoom: state.transform[2]
});
function useViewport() {
  return useStore(viewportSelector, shallow$1);
}
var error014 = errorMessages.error014();
function useInternalNode(id2) {
  return useStore(useCallback((s) => s.nodeLookup.get(id2), [id2]), shallow$1);
}
function LinePattern({ dimensions, lineWidth, variant, className }) {
  return jsx("path", { strokeWidth: lineWidth, d: `M${dimensions[0] / 2} 0 V${dimensions[1]} M0 ${dimensions[1] / 2} H${dimensions[0]}`, className: cc(["react-flow__background-pattern", variant, className]) });
}
function DotPattern({ radius, className }) {
  return jsx("circle", { cx: radius, cy: radius, r: radius, className: cc(["react-flow__background-pattern", "dots", className]) });
}
var BackgroundVariant;
(function(BackgroundVariant2) {
  BackgroundVariant2.Lines = "lines", BackgroundVariant2.Dots = "dots", BackgroundVariant2.Cross = "cross";
})(BackgroundVariant || (BackgroundVariant = {}));
var defaultSize = {
  [BackgroundVariant.Dots]: 1,
  [BackgroundVariant.Lines]: 1,
  [BackgroundVariant.Cross]: 6
}, selector$3 = (s) => ({ transform: s.transform, patternId: `pattern-${s.rfId}` });
function BackgroundComponent({
  id: id2,
  variant = BackgroundVariant.Dots,
  // only used for dots and cross
  gap = 20,
  // only used for lines and cross
  size,
  lineWidth = 1,
  offset = 0,
  color: color2,
  bgColor,
  style: style2,
  className,
  patternClassName
}) {
  let ref = useRef(null), { transform: transform2, patternId } = useStore(selector$3, shallow$1), patternSize = size || defaultSize[variant], isDots = variant === BackgroundVariant.Dots, isCross = variant === BackgroundVariant.Cross, gapXY = Array.isArray(gap) ? gap : [gap, gap], scaledGap = [gapXY[0] * transform2[2] || 1, gapXY[1] * transform2[2] || 1], scaledSize = patternSize * transform2[2], offsetXY = Array.isArray(offset) ? offset : [offset, offset], patternDimensions = isCross ? [scaledSize, scaledSize] : scaledGap, scaledOffset = [
    offsetXY[0] * transform2[2] + patternDimensions[0] / 2,
    offsetXY[1] * transform2[2] + patternDimensions[1] / 2
  ], _patternId = `${patternId}${id2 || ""}`;
  return jsxs("svg", { className: cc(["react-flow__background", className]), style: {
    ...style2,
    ...containerStyle,
    "--xy-background-color-props": bgColor,
    "--xy-background-pattern-color-props": color2
  }, ref, "data-testid": "rf__background", children: [jsx("pattern", { id: _patternId, x: transform2[0] % scaledGap[0], y: transform2[1] % scaledGap[1], width: scaledGap[0], height: scaledGap[1], patternUnits: "userSpaceOnUse", patternTransform: `translate(-${scaledOffset[0]},-${scaledOffset[1]})`, children: isDots ? jsx(DotPattern, { radius: scaledSize / 2, className: patternClassName }) : jsx(LinePattern, { dimensions: patternDimensions, lineWidth, variant, className: patternClassName }) }), jsx("rect", { x: "0", y: "0", width: "100%", height: "100%", fill: `url(#${_patternId})` })] });
}
BackgroundComponent.displayName = "Background";
var Background = memo(BackgroundComponent);
function PlusIcon() {
  return jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 32 32", children: jsx("path", { d: "M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z" }) });
}
function MinusIcon() {
  return jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 32 5", children: jsx("path", { d: "M0 0h32v4.2H0z" }) });
}
function FitViewIcon() {
  return jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 32 30", children: jsx("path", { d: "M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94c-.531 0-.939-.4-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z" }) });
}
function LockIcon() {
  return jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 25 32", children: jsx("path", { d: "M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0 8 0 4.571 3.429 4.571 7.619v3.048H3.048A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047zm4.724-13.866H7.467V7.619c0-2.59 2.133-4.724 4.723-4.724 2.591 0 4.724 2.133 4.724 4.724v3.048z" }) });
}
function UnlockIcon() {
  return jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 25 32", children: jsx("path", { d: "M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0c-4.114 1.828-1.37 2.133.305 2.438 1.676.305 4.42 2.59 4.42 5.181v3.048H3.047A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047z" }) });
}
function ControlButton({ children: children2, className, ...rest }) {
  return jsx("button", { type: "button", className: cc(["react-flow__controls-button", className]), ...rest, children: children2 });
}
var selector$2 = (s) => ({
  isInteractive: s.nodesDraggable || s.nodesConnectable || s.elementsSelectable,
  minZoomReached: s.transform[2] <= s.minZoom,
  maxZoomReached: s.transform[2] >= s.maxZoom,
  ariaLabelConfig: s.ariaLabelConfig
});
function ControlsComponent({ style: style2, showZoom = !0, showFitView = !0, showInteractive = !0, fitViewOptions, onZoomIn, onZoomOut, onFitView, onInteractiveChange, className, children: children2, position = "bottom-left", orientation = "vertical", "aria-label": ariaLabel }) {
  let store = useStoreApi(), { isInteractive, minZoomReached, maxZoomReached, ariaLabelConfig } = useStore(selector$2, shallow$1), { zoomIn, zoomOut, fitView } = useReactFlow(), onZoomInHandler = () => {
    zoomIn(), onZoomIn?.();
  }, onZoomOutHandler = () => {
    zoomOut(), onZoomOut?.();
  }, onFitViewHandler = () => {
    fitView(fitViewOptions), onFitView?.();
  }, onToggleInteractivity = () => {
    store.setState({
      nodesDraggable: !isInteractive,
      nodesConnectable: !isInteractive,
      elementsSelectable: !isInteractive
    }), onInteractiveChange?.(!isInteractive);
  };
  return jsxs(Panel, { className: cc(["react-flow__controls", orientation === "horizontal" ? "horizontal" : "vertical", className]), position, style: style2, "data-testid": "rf__controls", "aria-label": ariaLabel ?? ariaLabelConfig["controls.ariaLabel"], children: [showZoom && jsxs(Fragment, { children: [jsx(ControlButton, { onClick: onZoomInHandler, className: "react-flow__controls-zoomin", title: ariaLabelConfig["controls.zoomIn.ariaLabel"], "aria-label": ariaLabelConfig["controls.zoomIn.ariaLabel"], disabled: maxZoomReached, children: jsx(PlusIcon, {}) }), jsx(ControlButton, { onClick: onZoomOutHandler, className: "react-flow__controls-zoomout", title: ariaLabelConfig["controls.zoomOut.ariaLabel"], "aria-label": ariaLabelConfig["controls.zoomOut.ariaLabel"], disabled: minZoomReached, children: jsx(MinusIcon, {}) })] }), showFitView && jsx(ControlButton, { className: "react-flow__controls-fitview", onClick: onFitViewHandler, title: ariaLabelConfig["controls.fitView.ariaLabel"], "aria-label": ariaLabelConfig["controls.fitView.ariaLabel"], children: jsx(FitViewIcon, {}) }), showInteractive && jsx(ControlButton, { className: "react-flow__controls-interactive", onClick: onToggleInteractivity, title: ariaLabelConfig["controls.interactive.ariaLabel"], "aria-label": ariaLabelConfig["controls.interactive.ariaLabel"], children: isInteractive ? jsx(UnlockIcon, {}) : jsx(LockIcon, {}) }), children2] });
}
ControlsComponent.displayName = "Controls";
var Controls = memo(ControlsComponent);
function MiniMapNodeComponent({ id: id2, x, y, width, height, style: style2, color: color2, strokeColor, strokeWidth, className, borderRadius, shapeRendering, selected: selected2, onClick }) {
  let { background, backgroundColor } = style2 || {}, fill = color2 || background || backgroundColor;
  return jsx("rect", { className: cc(["react-flow__minimap-node", { selected: selected2 }, className]), x, y, rx: borderRadius, ry: borderRadius, width, height, style: {
    fill,
    stroke: strokeColor,
    strokeWidth
  }, shapeRendering, onClick: onClick ? (event) => onClick(event, id2) : void 0 });
}
var MiniMapNode = memo(MiniMapNodeComponent), selectorNodeIds = (s) => s.nodes.map((node) => node.id), getAttrFunction = (func) => func instanceof Function ? func : () => func;
function MiniMapNodes({
  nodeStrokeColor,
  nodeColor,
  nodeClassName = "",
  nodeBorderRadius = 5,
  nodeStrokeWidth,
  /*
   * We need to rename the prop to be `CapitalCase` so that JSX will render it as
   * a component properly.
   */
  nodeComponent: NodeComponent = MiniMapNode,
  onClick
}) {
  let nodeIds = useStore(selectorNodeIds, shallow$1), nodeColorFunc = getAttrFunction(nodeColor), nodeStrokeColorFunc = getAttrFunction(nodeStrokeColor), nodeClassNameFunc = getAttrFunction(nodeClassName), shapeRendering = typeof window > "u" || window.chrome ? "crispEdges" : "geometricPrecision";
  return jsx(Fragment, { children: nodeIds.map((nodeId) => (
    /*
     * The split of responsibilities between MiniMapNodes and
     * NodeComponentWrapper may appear weird. However, it’s designed to
     * minimize the cost of updates when individual nodes change.
     *
     * For more details, see a similar commit in `NodeRenderer/index.tsx`.
     */
    jsx(NodeComponentWrapper, { id: nodeId, nodeColorFunc, nodeStrokeColorFunc, nodeClassNameFunc, nodeBorderRadius, nodeStrokeWidth, NodeComponent, onClick, shapeRendering }, nodeId)
  )) });
}
function NodeComponentWrapperInner({ id: id2, nodeColorFunc, nodeStrokeColorFunc, nodeClassNameFunc, nodeBorderRadius, nodeStrokeWidth, shapeRendering, NodeComponent, onClick }) {
  let { node, x, y, width, height } = useStore((s) => {
    let node2 = s.nodeLookup.get(id2);
    if (!node2)
      return { node: void 0, x: 0, y: 0, width: 0, height: 0 };
    let userNode = node2.internals.userNode, { x: x2, y: y2 } = node2.internals.positionAbsolute, { width: width2, height: height2 } = getNodeDimensions(userNode);
    return {
      node: userNode,
      x: x2,
      y: y2,
      width: width2,
      height: height2
    };
  }, shallow$1);
  return !node || node.hidden || !nodeHasDimensions(node) ? null : jsx(NodeComponent, { x, y, width, height, style: node.style, selected: !!node.selected, className: nodeClassNameFunc(node), color: nodeColorFunc(node), borderRadius: nodeBorderRadius, strokeColor: nodeStrokeColorFunc(node), strokeWidth: nodeStrokeWidth, shapeRendering, onClick, id: node.id });
}
var NodeComponentWrapper = memo(NodeComponentWrapperInner), MiniMapNodes$1 = memo(MiniMapNodes), defaultWidth = 200, defaultHeight = 150, filterHidden = (node) => !node.hidden, selector$1 = (s) => {
  let viewBB = {
    x: -s.transform[0] / s.transform[2],
    y: -s.transform[1] / s.transform[2],
    width: s.width / s.transform[2],
    height: s.height / s.transform[2]
  }, hasVisibleNode = !1;
  for (let node of s.nodeLookup.values())
    if (!node.hidden) {
      hasVisibleNode = !0;
      break;
    }
  return {
    viewBB,
    boundingRect: hasVisibleNode ? getBoundsOfRects(getInternalNodesBounds(s.nodeLookup, { filter: filterHidden }), viewBB) : viewBB,
    rfId: s.rfId,
    panZoom: s.panZoom,
    translateExtent: s.translateExtent,
    flowWidth: s.width,
    flowHeight: s.height,
    ariaLabelConfig: s.ariaLabelConfig
  };
}, rectEqual = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height, areEqual = (a, b) => rectEqual(a.viewBB, b.viewBB) && rectEqual(a.boundingRect, b.boundingRect) && a.rfId === b.rfId && a.panZoom === b.panZoom && a.translateExtent === b.translateExtent && a.flowWidth === b.flowWidth && a.flowHeight === b.flowHeight && a.ariaLabelConfig === b.ariaLabelConfig, ARIA_LABEL_KEY = "react-flow__minimap-desc";
function MiniMapComponent({
  style: style2,
  className,
  nodeStrokeColor,
  nodeColor,
  nodeClassName = "",
  nodeBorderRadius = 5,
  nodeStrokeWidth,
  /*
   * We need to rename the prop to be `CapitalCase` so that JSX will render it as
   * a component properly.
   */
  nodeComponent,
  bgColor,
  maskColor,
  maskStrokeColor,
  maskStrokeWidth,
  position = "bottom-right",
  onClick,
  onNodeClick,
  pannable = !1,
  zoomable = !1,
  ariaLabel,
  inversePan,
  zoomStep = 1,
  offsetScale = 5
}) {
  let store = useStoreApi(), svg = useRef(null), { boundingRect, panZoom, viewBB, rfId, translateExtent, flowWidth, flowHeight, ariaLabelConfig } = useStore(selector$1, areEqual), elementWidth = style2?.width ?? defaultWidth, elementHeight = style2?.height ?? defaultHeight, scaledWidth = boundingRect.width / elementWidth, scaledHeight = boundingRect.height / elementHeight, viewScale = Math.max(scaledWidth, scaledHeight), viewWidth = viewScale * elementWidth, viewHeight = viewScale * elementHeight, offset = offsetScale * viewScale, x = boundingRect.x - (viewWidth - boundingRect.width) / 2 - offset, y = boundingRect.y - (viewHeight - boundingRect.height) / 2 - offset, width = viewWidth + offset * 2, height = viewHeight + offset * 2, labelledBy = `${ARIA_LABEL_KEY}-${rfId}`, viewScaleRef = useRef(0), minimapInstance = useRef();
  viewScaleRef.current = viewScale, useEffect(() => {
    let currentPanZoom = store.getState().panZoom;
    if (svg.current && currentPanZoom)
      return minimapInstance.current = XYMinimap({
        domNode: svg.current,
        panZoom: currentPanZoom,
        getTransform: () => store.getState().transform,
        getViewScale: () => viewScaleRef.current
      }), () => {
        minimapInstance.current?.destroy();
      };
  }, [panZoom]), useEffect(() => {
    minimapInstance.current?.update({
      translateExtent,
      width: flowWidth,
      height: flowHeight,
      inversePan,
      pannable,
      zoomStep,
      zoomable
    });
  }, [pannable, zoomable, inversePan, zoomStep, translateExtent, flowWidth, flowHeight]);
  let onSvgClick = onClick ? (event) => {
    let [x2, y2] = minimapInstance.current?.pointer(event) || [0, 0];
    onClick(event, { x: x2, y: y2 });
  } : void 0, nodeClickHandler = useCallback((event, nodeId) => {
    let node = store.getState().nodeLookup.get(nodeId).internals.userNode;
    onNodeClick?.(event, node);
  }, [onNodeClick]), onSvgNodeClick = onNodeClick ? nodeClickHandler : void 0, _ariaLabel = ariaLabel ?? ariaLabelConfig["minimap.ariaLabel"];
  return jsx(Panel, { position, style: {
    ...style2,
    "--xy-minimap-background-color-props": typeof bgColor == "string" ? bgColor : void 0,
    "--xy-minimap-mask-background-color-props": typeof maskColor == "string" ? maskColor : void 0,
    "--xy-minimap-mask-stroke-color-props": typeof maskStrokeColor == "string" ? maskStrokeColor : void 0,
    "--xy-minimap-mask-stroke-width-props": typeof maskStrokeWidth == "number" ? maskStrokeWidth * viewScale : void 0,
    "--xy-minimap-node-background-color-props": typeof nodeColor == "string" ? nodeColor : void 0,
    "--xy-minimap-node-stroke-color-props": typeof nodeStrokeColor == "string" ? nodeStrokeColor : void 0,
    "--xy-minimap-node-stroke-width-props": typeof nodeStrokeWidth == "number" ? nodeStrokeWidth : void 0
  }, className: cc(["react-flow__minimap", className]), "data-testid": "rf__minimap", children: jsxs("svg", { width: elementWidth, height: elementHeight, viewBox: `${x} ${y} ${width} ${height}`, className: "react-flow__minimap-svg", role: "img", "aria-labelledby": labelledBy, ref: svg, onClick: onSvgClick, children: [_ariaLabel && jsx("title", { id: labelledBy, children: _ariaLabel }), jsx(MiniMapNodes$1, { onClick: onSvgNodeClick, nodeColor, nodeStrokeColor, nodeBorderRadius, nodeClassName, nodeStrokeWidth, nodeComponent }), jsx("path", { className: "react-flow__minimap-mask", d: `M${x - offset},${y - offset}h${width + offset * 2}v${height + offset * 2}h${-width - offset * 2}z
        M${viewBB.x},${viewBB.y}h${viewBB.width}v${viewBB.height}h${-viewBB.width}z`, fillRule: "evenodd", pointerEvents: "none" })] }) });
}
MiniMapComponent.displayName = "MiniMap";
var MiniMap = memo(MiniMapComponent), scaleSelector = (calculateScale) => (store) => calculateScale ? `${Math.max(1 / store.transform[2], 1)}` : void 0, defaultPositions = {
  [ResizeControlVariant.Line]: "right",
  [ResizeControlVariant.Handle]: "bottom-right"
};
function ResizeControl({ nodeId, position, variant = ResizeControlVariant.Handle, className, style: style2 = void 0, children: children2, color: color2, minWidth = 10, minHeight = 10, maxWidth = Number.MAX_VALUE, maxHeight = Number.MAX_VALUE, keepAspectRatio = !1, resizeDirection, autoScale = !0, shouldResize, onResizeStart, onResize, onResizeEnd }) {
  let contextNodeId = useNodeId(), id2 = typeof nodeId == "string" ? nodeId : contextNodeId, store = useStoreApi(), resizeControlRef = useRef(null), isHandleControl = variant === ResizeControlVariant.Handle, scale = useStore(useCallback(scaleSelector(isHandleControl && autoScale), [isHandleControl, autoScale]), shallow$1), resizer = useRef(null), controlPosition = position ?? defaultPositions[variant];
  useEffect(() => {
    if (!(!resizeControlRef.current || !id2))
      return resizer.current || (resizer.current = XYResizer({
        domNode: resizeControlRef.current,
        nodeId: id2,
        getStoreItems: () => {
          let { nodeLookup, transform: transform2, snapGrid, snapToGrid, nodeOrigin, domNode } = store.getState();
          return {
            nodeLookup,
            transform: transform2,
            snapGrid,
            snapToGrid,
            nodeOrigin,
            paneDomNode: domNode
          };
        },
        onChange: (change, childChanges) => {
          let { triggerNodeChanges, nodeLookup, parentLookup, nodeOrigin } = store.getState(), changes = [], nextPosition = { x: change.x, y: change.y }, node = nodeLookup.get(id2);
          if (node && node.expandParent && node.parentId) {
            let origin = node.origin ?? nodeOrigin, width = change.width ?? node.measured.width ?? 0, height = change.height ?? node.measured.height ?? 0, child = {
              id: node.id,
              parentId: node.parentId,
              rect: {
                width,
                height,
                ...evaluateAbsolutePosition({
                  x: change.x ?? node.position.x,
                  y: change.y ?? node.position.y
                }, { width, height }, node.parentId, nodeLookup, origin)
              }
            }, parentExpandChanges = handleExpandParent([child], nodeLookup, parentLookup, nodeOrigin);
            changes.push(...parentExpandChanges), nextPosition.x = change.x ? Math.max(origin[0] * width, change.x) : void 0, nextPosition.y = change.y ? Math.max(origin[1] * height, change.y) : void 0;
          }
          if (nextPosition.x !== void 0 && nextPosition.y !== void 0) {
            let positionChange = {
              id: id2,
              type: "position",
              position: { ...nextPosition }
            };
            changes.push(positionChange);
          }
          if (change.width !== void 0 && change.height !== void 0) {
            let dimensionChange = {
              id: id2,
              type: "dimensions",
              resizing: !0,
              setAttributes: resizeDirection ? resizeDirection === "horizontal" ? "width" : "height" : !0,
              dimensions: {
                width: change.width,
                height: change.height
              }
            };
            changes.push(dimensionChange);
          }
          for (let childChange of childChanges) {
            let positionChange = {
              ...childChange,
              type: "position"
            };
            changes.push(positionChange);
          }
          triggerNodeChanges(changes);
        },
        onEnd: ({ width, height }) => {
          let dimensionChange = {
            id: id2,
            type: "dimensions",
            resizing: !1,
            dimensions: {
              width,
              height
            }
          };
          store.getState().triggerNodeChanges([dimensionChange]);
        }
      })), resizer.current.update({
        controlPosition,
        boundaries: {
          minWidth,
          minHeight,
          maxWidth,
          maxHeight
        },
        keepAspectRatio,
        resizeDirection,
        onResizeStart,
        onResize,
        onResizeEnd,
        shouldResize
      }), () => {
        resizer.current?.destroy();
      };
  }, [
    controlPosition,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    keepAspectRatio,
    onResizeStart,
    onResize,
    onResizeEnd,
    shouldResize
  ]);
  let positionClassNames = controlPosition.split("-");
  return jsx("div", { className: cc(["react-flow__resize-control", "nodrag", ...positionClassNames, variant, className]), ref: resizeControlRef, style: {
    ...style2,
    scale,
    ...color2 && { [isHandleControl ? "backgroundColor" : "borderColor"]: color2 }
  }, children: children2 });
}
var NodeResizeControl = memo(ResizeControl);

// src/page/session-tree-page.tsx
import { useCallback as useCallback5, useEffect as useEffect5, useMemo as useMemo5, useRef as useRef5, useState as useState6 } from "react";

// src/api.ts
init_define_import_meta_env();
import { host } from "@hermes/plugin-sdk";

// src/model/projects.ts
init_define_import_meta_env();
var NO_PROJECT_ID = "__no_project__", str = (value2) => typeof value2 == "string" && value2.trim() ? value2 : null;
function parseProjectsTree(payload) {
  let list = payload?.projects;
  if (!Array.isArray(list))
    return [];
  let out = [];
  for (let raw of list) {
    let node = raw, id2 = str(node?.id);
    if (!node || !id2)
      continue;
    let repos = Array.isArray(node.repos) ? node.repos : [];
    out.push({
      id: id2,
      label: str(node.label) ?? id2,
      color: str(node.color),
      icon: str(node.icon),
      isNoProject: node.isNoProject === !0 || id2 === NO_PROJECT_ID,
      isAuto: node.isAuto === !0,
      path: str(node.path),
      repoPaths: repos.map((repo) => str(repo?.path)).filter((path) => !!path),
      sessionIds: Array.isArray(node.sessionIds) ? node.sessionIds.filter((sid) => typeof sid == "string") : []
    });
  }
  return out;
}
function mergeProjects(lists) {
  let byId = /* @__PURE__ */ new Map();
  for (let list of lists)
    for (let project of list) {
      let known = byId.get(project.id);
      known ? (known.sessionIds = [.../* @__PURE__ */ new Set([...known.sessionIds, ...project.sessionIds])], known.repoPaths = [.../* @__PURE__ */ new Set([...known.repoPaths, ...project.repoPaths])], known.color ??= project.color, known.icon ??= project.icon) : byId.set(project.id, { ...project, sessionIds: [...project.sessionIds], repoPaths: [...project.repoPaths] });
    }
  return [...byId.values()];
}
var trimSlash = (path) => path.replace(/[/\\]+$/, "");
function under(path, root2) {
  let p = trimSlash(path), r = trimSlash(root2);
  return p === r || p.startsWith(`${r}/`) || p.startsWith(`${r}\\`);
}
function projectIndex(projects) {
  let bySession = /* @__PURE__ */ new Map(), roots = [], noProject = projects.find((project) => project.isNoProject);
  for (let project of projects) {
    for (let sid of project.sessionIds)
      bySession.has(sid) || bySession.set(sid, project.id);
    if (!project.isNoProject)
      for (let root2 of [project.path, ...project.repoPaths])
        root2 && roots.push({ root: root2, id: project.id });
  }
  return roots.sort((a, b) => b.root.length - a.root.length || a.id.localeCompare(b.id)), {
    projects: [...projects],
    byId: new Map(projects.map((project) => [project.id, project])),
    projectOf(row) {
      for (let id2 of [row.id, row._lineage_root_id, ...row._lineage_ids ?? []]) {
        let hit = id2 ? bySession.get(id2) : void 0;
        if (hit)
          return hit;
      }
      let place = row.git_repo_root || row.cwd;
      if (place) {
        let match = roots.find((entry) => under(place, entry.root));
        if (match)
          return match.id;
      }
      return noProject?.id;
    }
  };
}

// src/model/timeout.ts
init_define_import_meta_env();
function withTimeout(promise, ms, setTimer, message) {
  return new Promise((resolve, reject) => {
    let cancel = setTimer(() => reject(new Error(message)), ms);
    promise.then(
      (value2) => {
        cancel(), resolve(value2);
      },
      (error) => {
        cancel(), reject(error);
      }
    );
  });
}

// src/api.ts
var SESSION_LIMIT = 2e3, PROFILE_PARAM = "session_profile";
function fetchHealth(ctx, profile) {
  return ctx.rest(`/health?${PROFILE_PARAM}=${encodeURIComponent(profile)}`, { timeoutMs: 8e3 });
}
function fetchSessions(ctx, { profile, includeArchived = !1 }) {
  let query = new URLSearchParams({
    [PROFILE_PARAM]: profile,
    include_archived: String(includeArchived),
    limit: String(SESSION_LIMIT)
  });
  return ctx.rest(`/sessions?${query.toString()}`, { timeoutMs: 2e4 });
}
function fetchProfiles(ctx) {
  return ctx.rest(`/health?${PROFILE_PARAM}=*`, { timeoutMs: 8e3 });
}
var PROJECTS_TIMEOUT_MS = 8e3;
async function fetchProjects(profiles, ctx) {
  let bounded = (promise) => ctx ? withTimeout(promise, PROJECTS_TIMEOUT_MS, (fn, ms) => ctx.setTimeout(fn, ms), `projects.tree did not answer in ${PROJECTS_TIMEOUT_MS / 1e3} s`) : promise, results = await Promise.allSettled(
    profiles.map((profile) => bounded(host.request("projects.tree", { profile, preview_limit: 0 })).then(parseProjectsTree))
  ), trees = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (trees.length === 0 && results.length > 0)
    throw results[0].reason;
  return mergeProjects(trees);
}
var sessionPath = (id2, tail, profile) => `/sessions/${encodeURIComponent(id2)}/${tail}?${PROFILE_PARAM}=${encodeURIComponent(profile)}`;
function fetchMutationSnapshot(ctx, profile, id2) {
  return ctx.rest(sessionPath(id2, "mutation-snapshot", profile), { timeoutMs: 15e3 });
}
function postRename(ctx, profile, id2, title, identity4) {
  return ctx.rest(sessionPath(id2, "rename", profile), { method: "POST", body: { title, ...identity4 }, timeoutMs: 2e4 });
}
function postReadState(ctx, profile, id2, unread, identity4) {
  return ctx.rest(sessionPath(id2, "read", profile), { method: "POST", body: { unread, ...identity4 }, timeoutMs: 2e4 });
}
function postArchive(ctx, profile, id2, archived, identity4) {
  return ctx.rest(sessionPath(id2, "archive", profile), { method: "POST", body: { archived, ...identity4 }, timeoutMs: 2e4 });
}
function postDelete(ctx, profile, id2, identity4) {
  return ctx.rest(sessionPath(id2, "delete", profile), { method: "POST", body: { ...identity4 }, timeoutMs: 3e4 });
}
function fetchExport(ctx, profile, id2) {
  return ctx.rest(sessionPath(id2, "export", profile), { timeoutMs: 12e4 });
}
var profileQuery = (profile, extra = {}) => new URLSearchParams({ [PROFILE_PARAM]: profile, ...extra }).toString();
function stateTransport(ctx) {
  return {
    getState: (profile, sinceRev) => ctx.rest(`/state?${profileQuery(profile, sinceRev === void 0 ? {} : { since_rev: String(sinceRev) })}`, { timeoutMs: 1e4 }),
    patchPositions: (profile, body) => ctx.rest(`/state/positions?${profileQuery(profile)}`, { method: "PATCH", body, timeoutMs: 15e3 }),
    patchSettings: (profile, patch) => ctx.rest(`/settings?${profileQuery(profile)}`, { method: "PATCH", body: patch, timeoutMs: 15e3 }),
    deleteLayout: (profile, style2, scope) => ctx.rest(`/state/layout?${profileQuery(profile, { style: style2, scope })}`, { method: "DELETE", timeoutMs: 15e3 }),
    putLayout: (profile, body) => ctx.rest(`/state/layout?${profileQuery(profile)}`, { method: "PUT", body, timeoutMs: 2e4 }),
    forgetBlocks: (profile, ids) => ctx.rest(`/state/forget?${profileQuery(profile)}`, { method: "POST", body: { ids }, timeoutMs: 15e3 })
  };
}
var LAYOUT_CHANGED_EVENT = "plugin.session-tree.layout.changed";

// src/model/actions.ts
init_define_import_meta_env();
function isActionable(node) {
  return !!(node && node.kind === "session" && node.row && !node.readOnly);
}
function sanitizeFilenamePart(value2) {
  return value2.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
function exportFilename(sessionId, title) {
  let titlePart = title ? sanitizeFilenamePart(title) : "", idPart = sanitizeFilenamePart(sessionId).slice(0, 8) || "session";
  return `${titlePart || "session"}-${idPart}.json`;
}
function decodeExportEnvelope(envelope) {
  let value2 = envelope;
  if (!value2 || value2.encoding !== "base64" || typeof value2.body != "string" || !Number.isSafeInteger(value2.bytes))
    throw new Error("The export answer is not an export envelope");
  let binary = atob(value2.body), bytes = new Uint8Array(binary.length);
  for (let index2 = 0; index2 < binary.length; index2 += 1)
    bytes[index2] = binary.charCodeAt(index2);
  if (bytes.length !== value2.bytes)
    throw new Error(`The export arrived incomplete (${bytes.length} of ${value2.bytes} bytes)`);
  return bytes;
}
function createBranchCooldown(windowMs, now2 = Date.now) {
  let last;
  return {
    branched(childId) {
      last = { id: childId, at: now2() };
    },
    blocks(id2) {
      return !!(last && last.id === id2 && now2() - last.at < windowMs);
    }
  };
}
var BRANCH_COOLDOWN_MS = 800;
function createBranchFlights(request, mintKey) {
  let flights = /* @__PURE__ */ new Map();
  return function(params) {
    let key = JSON.stringify([params.profile, params.parentId]), existing = flights.get(key);
    if (existing)
      return { flight: existing, joined: !0 };
    let flight = request("session.branch_stored", {
      parent_session_id: params.parentId,
      idempotency_key: mintKey(),
      source: "desktop",
      ...params.cwd ? { cwd: params.cwd } : {},
      profile: params.profile
    }).finally(() => flights.delete(key));
    return flights.set(key, flight), { flight, joined: !1 };
  };
}
function projectRootCwd(project) {
  return (project?.path || project?.repoPaths.find(Boolean) || "").trim();
}
function moveTargets(projects, currentProjectId) {
  return projects.filter((project) => project.id !== currentProjectId && !project.isNoProject && projectRootCwd(project));
}
var DELETE_RUNNING_REASON = "Running — wait for it to finish";
function deleteBlockedReason(status) {
  return status?.running ? DELETE_RUNNING_REASON : void 0;
}
function branchNote(branches) {
  return branches <= 0 ? "" : branches === 1 ? "Its 1 branch stays as a separate session." : `Its ${branches} branches stay as separate sessions.`;
}
function renameRoute(row, host7, title) {
  let ids = /* @__PURE__ */ new Set([row.id, ...row._lineage_ids ?? []]);
  return title.trim() && host7.focusedSessionId && host7.focusedStoredSessionId && ids.has(host7.focusedStoredSessionId) ? { kind: "rpc", runtimeId: host7.focusedSessionId } : { kind: "backend" };
}
var DEFINITIVE = /revision_conflict|stale_generation|permission_denied|profile_mismatch|invalid_params|admission_conflict|session_busy|retained_receipts|runtime_coordination_required|unknown_execution|not_found|mutation_identity_required|client_upgrade_required|Session not found/;
function createFencedMutation(mintId) {
  let pending = /* @__PURE__ */ new Map();
  return async function(key, read, send) {
    let prepared = pending.get(key);
    prepared || (prepared = read().then((snapshot) => {
      if (typeof snapshot?.exists != "boolean" || !snapshot.exists || !Number.isSafeInteger(snapshot.runtime_revision) || snapshot.runtime_revision < 0 || !Number.isSafeInteger(snapshot.runtime_generation) || snapshot.runtime_generation < 0)
        throw new Error("Session mutation snapshot unavailable; refresh before trying again");
      return { request_id: mintId(), expected_revision: snapshot.runtime_revision, expected_generation: snapshot.runtime_generation };
    }), pending.set(key, prepared));
    let identity4;
    try {
      identity4 = await prepared;
    } catch (error) {
      throw pending.delete(key), error;
    }
    try {
      let result = await send(identity4);
      return pending.delete(key), result;
    } catch (error) {
      throw DEFINITIVE.test(String(error instanceof Error ? error.message : error)) && pending.delete(key), error;
    }
  };
}
function restErrorText(error) {
  let message = error instanceof Error ? error.message : String(error ?? "Unknown error"), match = /^(\d{3}): (.*)$/s.exec(message), detail = match ? match[2] : message;
  if (match)
    try {
      let body = JSON.parse(match[2]);
      detail = typeof body.detail == "string" ? body.detail : Array.isArray(body.detail) && body.detail.length > 0 ? body.detail.map(validationText).join("; ") : JSON.stringify(body.detail ?? body);
    } catch {
    }
  let reasons = {
    session_busy: "The session is running; try again when it is idle",
    revision_conflict: "The session changed elsewhere; refresh and try again",
    stale_generation: "The session changed elsewhere; refresh and try again",
    permission_denied: "Hermes refused: this window may not edit that session",
    not_found: "Session not found"
  };
  return reasons[detail] ? `${reasons[detail]} (${detail})` : detail;
}
var MAX_TITLE_LENGTH = 100;
function validationText(item) {
  let { loc, msg, type, input } = item ?? {}, field = Array.isArray(loc) ? String(loc[loc.length - 1] ?? "") : "";
  return field === "title" && type === "string_too_long" && typeof input == "string" ? `Title too long (${[...input].length} chars, max ${MAX_TITLE_LENGTH})` : field ? `${field}: ${msg ?? "invalid"}` : msg ?? "Invalid input";
}
function isAlreadyAbsent(outcome) {
  if (outcome instanceof Error) {
    let match = /^404: (.*)$/s.exec(outcome.message);
    if (!match)
      return !1;
    try {
      return JSON.parse(match[1]).detail === "Session not found";
    } catch {
      return !1;
    }
  }
  return !!(outcome && typeof outcome == "object" && outcome.already_absent === !0);
}
function applyOverrides(rows, overrides) {
  if (overrides.size === 0)
    return rows;
  let out = [];
  for (let row of rows) {
    let override = overrides.get(row.id);
    if (!override)
      out.push(row);
    else if (!override.removed) {
      let fields = { ...override };
      delete fields.removed, out.push({ ...row, ...fields });
    }
  }
  return out;
}
function settleOverrides(rows, overrides) {
  let byId = new Map(rows.map((row) => [row.id, row])), next = /* @__PURE__ */ new Map();
  for (let [id2, override] of overrides) {
    let row = byId.get(id2);
    if (override.removed) {
      row && next.set(id2, override);
      continue;
    }
    if (!row)
      continue;
    Object.keys(override).every((key) => key === "removed" || (row[key] ?? void 0) === (override[key] ?? void 0)) || next.set(id2, override);
  }
  return next;
}

// src/model/device-prefs.ts
init_define_import_meta_env();
var DEVICE_KEY = "device.v1", VIEWPORT_KEY = "viewport.v1", DEFAULTS = { styleOverride: null, showAll: !1, showArchived: !1, profile: null, panelOpen: {} }, viewportKey = (style2, profile, scope) => `${style2}|${profile}|${scope}`, DevicePrefs = class {
  storage;
  listeners = /* @__PURE__ */ new Set();
  toggles;
  version = 0;
  constructor(storage) {
    this.storage = storage, this.toggles = sanitize(storage.get(DEVICE_KEY, null));
  }
  get() {
    return this.toggles;
  }
  get changeVersion() {
    return this.version;
  }
  set(patch) {
    this.toggles = sanitize({ ...this.toggles, ...patch }), this.storage.set(DEVICE_KEY, this.toggles), this.version += 1;
    for (let listener of [...this.listeners])
      listener();
  }
  panelOpen(style2) {
    return this.toggles.panelOpen[style2] ?? !0;
  }
  setPanelOpen(style2, open) {
    this.set({ panelOpen: { ...this.toggles.panelOpen, [style2]: open } });
  }
  viewport(key) {
    let value2 = this.storage.get(`${VIEWPORT_KEY}:${key}`, null);
    return value2 && [value2.x, value2.y, value2.zoom].every(Number.isFinite) && value2.zoom > 0 ? { x: value2.x, y: value2.y, zoom: value2.zoom } : void 0;
  }
  /** Not a listener event: the viewport is the canvas's own state, only remembered here. */
  setViewport(key, viewport) {
    [viewport.x, viewport.y, viewport.zoom].every(Number.isFinite) && this.storage.set(`${VIEWPORT_KEY}:${key}`, { x: viewport.x, y: viewport.y, zoom: viewport.zoom });
  }
  subscribe(listener) {
    return this.listeners.add(listener), () => this.listeners.delete(listener);
  }
};
function sanitize(value2) {
  let raw = value2 && typeof value2 == "object" ? value2 : {}, panelOpen = {};
  if (raw.panelOpen && typeof raw.panelOpen == "object")
    for (let [style2, open] of Object.entries(raw.panelOpen))
      typeof open == "boolean" && (panelOpen[style2] = open);
  return {
    styleOverride: typeof raw.styleOverride == "string" ? raw.styleOverride : DEFAULTS.styleOverride,
    showAll: typeof raw.showAll == "boolean" ? raw.showAll : DEFAULTS.showAll,
    showArchived: typeof raw.showArchived == "boolean" ? raw.showArchived : DEFAULTS.showArchived,
    profile: typeof raw.profile == "string" ? raw.profile : DEFAULTS.profile,
    panelOpen
  };
}

// src/model/graph.ts
init_define_import_meta_env();

// src/model/branch-tree.ts
init_define_import_meta_env();

// src/model/sessions.ts
init_define_import_meta_env();
var HIDDEN_SOURCES = /* @__PURE__ */ new Set(["acp", "cron", "kanban", "oneshot", "subagent", "tool"]), trimmed = (value2) => value2?.trim() || void 0;
function forkParentId(row) {
  if (!trimmed(row._reset_from))
    return trimmed(row._branched_from) ?? trimmed(row.parent_session_id);
}
function isHiddenRow(row) {
  if (row.is_internal_child || row.message_count === 0)
    return !0;
  let source = (row.source ?? "").trim().toLowerCase();
  return HIDDEN_SOURCES.has(source);
}
function visibleRows(rows) {
  return rows.filter((row) => !isHiddenRow(row));
}
function compactedCount(row) {
  return typeof row.compacted_segments == "number" ? Math.max(0, row.compacted_segments) : Math.max(0, (row._lineage_ids?.length ?? 1) - 1);
}
function displayTitle(row) {
  return trimmed(row.title) ?? trimmed(row.preview)?.slice(0, 80) ?? "Untitled session";
}

// src/model/branch-tree.ts
var recency = (session) => session.last_active || session.started_at || 0, profileKey = (session) => (session.profile ?? "").trim() || "default", lineageKey = (session) => `${profileKey(session)}::${session._lineage_root_id?.trim() || session.id}`;
function collapseCompressionLineages(sessions) {
  let groups = /* @__PURE__ */ new Map();
  for (let session of sessions) {
    let key = lineageKey(session), group = groups.get(key);
    group ? group.push(session) : groups.set(key, [session]);
  }
  if (groups.size === sessions.length)
    return sessions;
  let winners = /* @__PURE__ */ new Set();
  for (let group of groups.values()) {
    let continuedIds = new Set(group.map((session) => session.parent_session_id?.trim())), score = (session) => continuedIds.has(session.id) ? -1 / 0 : Math.max(session.last_active || 0, session.started_at || 0);
    winners.add(group.reduce((best, session) => score(session) > score(best) ? session : best));
  }
  return sessions.filter((session) => winners.has(session));
}
function visibleIdIndex(sessions, input) {
  let byVisibleId = /* @__PURE__ */ new Map(), key = (session, id2) => `${profileKey(session)}::${id2}`;
  for (let session of sessions)
    for (let segment of session._lineage_ids ?? []) {
      let id2 = segment?.trim();
      id2 && !byVisibleId.has(key(session, id2)) && byVisibleId.set(key(session, id2), session);
    }
  for (let session of sessions) {
    let rootId = session._lineage_root_id?.trim();
    rootId && byVisibleId.set(key(session, rootId), session);
  }
  for (let session of sessions)
    byVisibleId.set(key(session, session.id), session);
  let survivorByLineage = new Map(sessions.map((session) => [lineageKey(session), session]));
  for (let session of input) {
    let survivor = survivorByLineage.get(lineageKey(session));
    survivor && !byVisibleId.has(key(session, session.id)) && byVisibleId.set(key(session, session.id), survivor);
  }
  return byVisibleId;
}
function lookupVisible(index2, session, id2) {
  return index2.get(`${profileKey(session)}::${id2.trim()}`);
}
function isOwnCompressionAncestry(session, parentId) {
  let rootId = session._lineage_root_id?.trim();
  return parentId === rootId || (session._lineage_ids ?? []).some((id2) => id2?.trim() === parentId) ? !0 : !!(rootId && rootId !== session.id && !session._branched_from?.trim());
}
function resolveBranchParent(session, index2) {
  let parentId = forkParentId(session);
  if (!parentId)
    return { kind: "none" };
  let parent = lookupVisible(index2, session, parentId);
  return parent ? parent === session || lineageKey(parent) === lineageKey(session) ? { kind: "none" } : { kind: "nested", parent } : isOwnCompressionAncestry(session, parentId) ? { kind: "none" } : { kind: "missing", parentId };
}

// src/model/graph.ts
var ALL_PROJECTS = "all", ALL_PROFILES = "*", STANDIN_PREFIX = "missing:", byCreated = (model) => (a, b) => {
  let na = model.nodeById.get(a), nb = model.nodeById.get(b);
  return (na?.createdAt ?? 0) - (nb?.createdAt ?? 0) || a.localeCompare(b);
};
function filterRows(rows, options) {
  return rows.filter(
    (row) => !isHiddenRow(row) && (options.showArchived || !row.archived) && (options.profile === ALL_PROFILES || profileKey(row) === options.profile)
  );
}
function buildGraph(rows, projects, options) {
  let input = filterRows(rows, options), sessions = collapseCompressionLineages(input), index2 = visibleIdIndex(sessions, input), projectsIdx = projectIndex(projects), idCount = /* @__PURE__ */ new Map();
  for (let row of sessions)
    idCount.set(row.id, (idCount.get(row.id) ?? 0) + 1);
  let nodeIdOf = /* @__PURE__ */ new Map();
  for (let row of sessions)
    nodeIdOf.set(row, (idCount.get(row.id) ?? 0) > 1 ? `${profileKey(row)}/${row.id}` : row.id);
  let nodes = [], nodeById = /* @__PURE__ */ new Map();
  for (let row of sessions) {
    let id2 = nodeIdOf.get(row), projectId = projectsIdx.projectOf(row), node = {
      id: id2,
      kind: "session",
      row,
      title: displayTitle(row),
      projectId,
      profile: profileKey(row),
      archived: !!row.archived,
      compacted: compactedCount(row),
      createdAt: row.started_at || row.last_active || 0,
      lastActive: recency(row),
      outOfScope: !1,
      readOnly: !1,
      familyId: id2,
      single: !0
    };
    nodes.push(node), nodeById.set(id2, node);
  }
  let edges = [], parentOf = /* @__PURE__ */ new Map(), continuedFrom = /* @__PURE__ */ new Map();
  for (let row of sessions) {
    let target = nodeIdOf.get(row), resolved = resolveBranchParent(row, index2);
    if (resolved.kind === "nested") {
      let source = nodeIdOf.get(resolved.parent);
      edges.push({ id: `branch:${source}->${target}`, source, target, kind: "branch", fromStandin: !1 }), parentOf.set(target, source);
      continue;
    }
    if (resolved.kind === "missing") {
      let source = `${STANDIN_PREFIX}${profileKey(row)}/${resolved.parentId}`;
      if (!nodeById.has(source)) {
        let standin = {
          id: source,
          kind: "standin",
          title: "Parent not loaded",
          profile: profileKey(row),
          archived: !1,
          compacted: 0,
          createdAt: (row.started_at || 0) - 1,
          lastActive: 0,
          outOfScope: !1,
          readOnly: !0,
          familyId: source,
          single: !1,
          missingId: resolved.parentId
        };
        nodes.push(standin), nodeById.set(source, standin);
      }
      edges.push({ id: `branch:${source}->${target}`, source, target, kind: "branch", fromStandin: !0 }), parentOf.set(target, source);
      continue;
    }
    let resetFrom = row._reset_from?.trim(), predecessor = resetFrom ? lookupVisible(index2, row, resetFrom) : void 0;
    if (predecessor && predecessor !== row) {
      let source = nodeIdOf.get(predecessor);
      edges.push({ id: `reset:${source}->${target}`, source, target, kind: "reset", fromStandin: !1 }), continuedFrom.set(target, source);
    }
  }
  let model = {
    options,
    nodes,
    edges,
    families: [],
    nodeById,
    childrenOf: /* @__PURE__ */ new Map(),
    parentOf,
    continuedAs: /* @__PURE__ */ new Map(),
    continuedFrom,
    projects: projectsIdx.projects,
    singles: []
  };
  for (let edge of edges) {
    let into = edge.kind === "branch" ? model.childrenOf : model.continuedAs;
    into.set(edge.source, [...into.get(edge.source) ?? [], edge.target]);
  }
  let order = byCreated(model);
  for (let list of [...model.childrenOf.values(), ...model.continuedAs.values()])
    list.sort(order);
  for (let node of nodes)
    node.kind === "standin" && (node.projectId = model.childrenOf.get(node.id)?.map((id2) => nodeById.get(id2)?.projectId).find(Boolean));
  return assignFamilies(model), applyScope(model, options.scope), model;
}
function assignFamilies(model) {
  let parent = new Map(model.nodes.map((node) => [node.id, node.id])), find2 = (id2) => {
    let root2 = id2;
    for (; parent.get(root2) !== root2; )
      root2 = parent.get(root2);
    return parent.set(id2, root2), root2;
  };
  for (let edge of model.edges) {
    let a = find2(edge.source), b = find2(edge.target);
    a !== b && parent.set(a < b ? b : a, a < b ? a : b);
  }
  let members = /* @__PURE__ */ new Map();
  for (let node of model.nodes) {
    let root2 = find2(node.id);
    members.set(root2, [...members.get(root2) ?? [], node.id]);
  }
  let order = byCreated(model);
  for (let [root2, ids] of members) {
    ids.sort(order);
    let family = {
      id: root2,
      nodeIds: ids,
      inScope: !0,
      lastActive: Math.max(0, ...ids.map((id2) => model.nodeById.get(id2)?.lastActive ?? 0))
    }, sessionIds = ids.filter((id2) => model.nodeById.get(id2)?.kind === "session"), lead = sessionIds.find((id2) => !model.parentOf.has(id2) && !model.continuedFrom.has(id2)) ?? sessionIds[0];
    family.projectId = lead ? model.nodeById.get(lead)?.projectId : void 0;
    for (let id2 of ids) {
      let node = model.nodeById.get(id2);
      node.familyId = root2, node.single = ids.length === 1;
    }
    model.families.push(family);
  }
  model.families.sort((a, b) => b.lastActive - a.lastActive || a.id.localeCompare(b.id)), model.singles = model.families.filter((family) => family.nodeIds.length === 1).map((family) => model.nodeById.get(family.nodeIds[0]));
}
function applyScope(model, scope) {
  let all = scope === ALL_PROJECTS;
  for (let node of model.nodes)
    node.kind === "session" && (node.outOfScope = !all && (node.projectId ?? NO_PROJECT_ID) !== scope, node.readOnly = node.outOfScope);
  for (let node of model.nodes)
    if (node.kind === "standin") {
      let children2 = model.childrenOf.get(node.id) ?? [];
      node.outOfScope = !all && children2.every((id2) => model.nodeById.get(id2)?.outOfScope), node.readOnly = !0;
    }
  for (let family of model.families)
    family.inScope = family.nodeIds.some((id2) => {
      let node = model.nodeById.get(id2);
      return node?.kind === "session" && !node.outOfScope;
    });
}
function lineageOf(model, id2) {
  let set3 = /* @__PURE__ */ new Set();
  if (!id2 || !model.nodeById.has(id2))
    return set3;
  let up = id2;
  for (; up && !set3.has(up); )
    set3.add(up), up = model.parentOf.get(up) ?? model.continuedFrom.get(up);
  let stack = [id2], down = /* @__PURE__ */ new Set([id2]);
  for (; stack.length > 0; ) {
    let next = stack.pop();
    for (let child of [...model.childrenOf.get(next) ?? [], ...model.continuedAs.get(next) ?? []])
      down.has(child) || (down.add(child), set3.add(child), stack.push(child));
  }
  return set3;
}
function singlesInScope(model) {
  return model.singles.filter((node) => !node.outOfScope);
}

// src/model/layout.ts
init_define_import_meta_env();
var GROUP_PREFIX = "group:", LABEL_WIDTH = 240, groupKey = (projectId) => `${GROUP_PREFIX}${projectId ?? NO_PROJECT_ID}`;
function laidOutFamilies(model, spec) {
  return model.families.filter((family) => spec.includeSingles || family.nodeIds.length > 1);
}
function layoutFamily(model, family, spec) {
  let step = spec.nodeHeight + spec.rowGap, column = spec.nodeWidth + spec.columnGap, members = new Set(family.nodeIds), positions = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set(), cursorY = 0, byCreated2 = (a, b) => (model.nodeById.get(a)?.createdAt ?? 0) - (model.nodeById.get(b)?.createdAt ?? 0) || a.localeCompare(b), place = (id2, depth) => {
    seen.add(id2);
    let kids = (model.childrenOf.get(id2) ?? []).filter((kid) => members.has(kid) && !seen.has(kid)), y;
    if (kids.length === 0)
      y = cursorY, cursorY += step;
    else {
      let ys = kids.map((kid) => place(kid, depth + 1));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    return positions.set(id2, { x: depth * column, y }), y;
  }, roots = family.nodeIds.filter((id2) => !model.parentOf.has(id2) || !members.has(model.parentOf.get(id2))), queue = roots.filter((id2) => !model.continuedFrom.has(id2)).sort(byCreated2), placeTree = (root2) => {
    if (seen.has(root2))
      return;
    positions.size > 0 && (cursorY += spec.treeGap);
    let before = new Set(positions.keys());
    place(root2, 0);
    let successors = [...positions.keys()].filter((id2) => !before.has(id2)).flatMap((id2) => model.continuedAs.get(id2) ?? []).filter((id2) => members.has(id2)).sort(byCreated2);
    for (let successor of successors)
      placeTree(successor);
  };
  for (let root2 of queue)
    placeTree(root2);
  for (let id2 of [...roots, ...family.nodeIds].sort(byCreated2))
    placeTree(id2);
  return { positions, height: Math.max(0, cursorY - spec.rowGap) };
}
function groupOrder(model, families) {
  let present = new Set(families.map((family) => family.projectId ?? NO_PROJECT_ID)), order = [], scope = model.options.scope;
  scope !== ALL_PROJECTS && present.has(scope) && order.push(scope);
  for (let project of model.projects)
    !project.isNoProject && present.has(project.id) && !order.includes(project.id) && order.push(project.id);
  for (let id2 of [...present].sort())
    id2 !== NO_PROJECT_ID && !order.includes(id2) && order.push(id2);
  return present.has(NO_PROJECT_ID) && !order.includes(NO_PROJECT_ID) && order.push(NO_PROJECT_ID), order.map((id2) => id2 === NO_PROJECT_ID ? void 0 : id2);
}
function layoutFamilies(model, families, spec, top, skipLabels = /* @__PURE__ */ new Set()) {
  let positions = /* @__PURE__ */ new Map(), labels = [], step = spec.nodeHeight + spec.rowGap, y = top;
  for (let projectId of groupOrder(model, families)) {
    let inGroup = families.filter((family) => (family.projectId ?? NO_PROJECT_ID) === (projectId ?? NO_PROJECT_ID)), key = groupKey(projectId);
    if (inGroup.length === 0)
      continue;
    skipLabels.has(key) || (labels.push({ id: key, projectId }), positions.set(key, { x: 0, y }), y += spec.labelHeight);
    let trees = inGroup.filter((family) => family.nodeIds.length > 1), singles = inGroup.filter((family) => family.nodeIds.length === 1);
    for (let family of trees) {
      let local2 = layoutFamily(model, family, spec);
      for (let [id2, point] of local2.positions)
        positions.set(id2, { x: point.x, y: point.y + y });
      y += local2.height + spec.familyGap;
    }
    singles.forEach((family, index2) => {
      positions.set(family.nodeIds[0], {
        x: index2 % spec.singlesColumns * (spec.nodeWidth + spec.columnGap),
        y: y + Math.floor(index2 / spec.singlesColumns) * step
      });
    }), singles.length > 0 && (y += Math.ceil(singles.length / spec.singlesColumns) * step - spec.rowGap + spec.familyGap), y += spec.groupGap - spec.familyGap;
  }
  return { positions, labels, bottom: y };
}
function layoutGraph(model, spec) {
  let { positions, labels } = layoutFamilies(model, laidOutFamilies(model, spec), spec, 0);
  return { positions, labels };
}
function rectOf(id2, point, spec) {
  return id2.startsWith(GROUP_PREFIX) ? { x: point.x, y: point.y, width: LABEL_WIDTH, height: spec.labelHeight } : { x: point.x, y: point.y, width: spec.nodeWidth, height: spec.nodeHeight };
}
function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
var CONTINUATION = "";
function labelGroup(id2) {
  let cut = id2.indexOf(CONTINUATION);
  return cut === -1 ? id2 : id2.slice(0, cut);
}
function mergeLayout(previous, model, spec) {
  if (!previous || previous.size === 0)
    return layoutGraph(model, spec);
  let positions = new Map(previous), families = laidOutFamilies(model, spec), shown = new Set(families.flatMap((family) => family.nodeIds)), step = spec.nodeHeight + spec.rowGap, column = spec.nodeWidth + spec.columnGap, clearX = spec.columnGap / 2, clearY = spec.rowGap / 2, blockRects = () => [...positions].filter(([id2]) => !id2.startsWith(GROUP_PREFIX)).map(([id2, point]) => rectOf(id2, point, spec)).map((rect) => ({ x: rect.x - clearX, y: rect.y - clearY, width: rect.width + 2 * clearX, height: rect.height + 2 * clearY })), labelEntries = () => [...positions].filter(([id2]) => id2.startsWith(GROUP_PREFIX)).sort(([a, p], [b, q]) => p.y - q.y || p.x - q.x || a.localeCompare(b)), occupied = () => [...blockRects(), ...labelEntries().map(([id2, point]) => rectOf(id2, point, spec))], bottomOf = (rects) => Math.max(0, ...rects.map((rect) => rect.y + rect.height)), bandUnder = (labelY, labels2) => {
    let next = labels2.find(([, point]) => point.y > labelY);
    return { top: labelY + spec.labelHeight, bottom: next ? next[1].y - spec.rowGap : 1 / 0 };
  }, bandOf = (key, anchorY) => {
    let labels2 = labelEntries(), own = labels2.filter(([id2]) => labelGroup(id2) === key);
    if (own.length === 0) {
      if (anchorY === void 0)
        return;
      let above = labels2.filter(([, point]) => point.y <= anchorY).pop();
      return above ? bandUnder(above[1].y, labels2) : { top: -1 / 0, bottom: labels2[0] ? labels2[0][1].y - spec.rowGap : 1 / 0 };
    }
    let pick2 = anchorY === void 0 ? own[0] : own.filter(([, point]) => point.y <= anchorY).pop() ?? own[0];
    return bandUnder(pick2[1].y, labels2);
  }, findSpot = (shape, height, band, x0, rowsFor) => {
    let all = occupied(), lowest = band.bottom === 1 / 0 ? Math.max(band.top, bottomOf(all)) + step + height : band.bottom, top = band.top === -1 / 0 ? Math.min(0, ...all.map((rect) => rect.y)) : band.top, maxTop = lowest - height;
    if (maxTop < top)
      return;
    let near = all.filter((rect) => rect.y < lowest && rect.y + rect.height > top), right = Math.max(x0, ...near.map((rect) => rect.x + rect.width)), rows = rowsFor(top, maxTop);
    for (let x = x0; x <= right + column; x += column)
      for (let y of rows)
        if (shape.every((point) => {
          let rect = rectOf("", { x: x + point.x, y: y + point.y }, spec);
          return !near.some((other) => overlaps(other, rect));
        }))
          return { x, y };
  }, rowsNear = (start2) => (top, maxTop) => {
    let first = Math.min(maxTop, Math.max(top, start2)), rows = [];
    for (let y = first; y <= maxTop; y += step)
      rows.push(y);
    for (let y = first - step; y >= top; y -= step)
      rows.push(y);
    return rows.push(top, maxTop), [...new Set(rows)];
  }, rowsDown = (top, maxTop) => {
    let rows = [];
    for (let y = top; y <= maxTop; y += step)
      rows.push(y);
    return rows.push(maxTop), [...new Set(rows)];
  }, continueGroup = (key, local2) => {
    let n = 1;
    for (; positions.has(`${key}${CONTINUATION}${n}`); )
      n += 1;
    let labelId = `${key}${CONTINUATION}${n}`, top = bottomOf(occupied()) + spec.groupGap;
    positions.set(labelId, { x: 0, y: top });
    for (let [id2, point] of local2)
      positions.set(id2, { x: point.x, y: point.y + top + spec.labelHeight });
  }, newFamilies = [];
  for (let family of families) {
    if (!family.nodeIds.some((id2) => positions.has(id2))) {
      newFamilies.push(family);
      continue;
    }
    let key = groupKey(family.projectId);
    for (let id2 of family.nodeIds) {
      if (positions.has(id2))
        continue;
      let parent = model.parentOf.get(id2), predecessor = model.continuedFrom.get(id2), child = (model.childrenOf.get(id2) ?? []).find((kid) => positions.has(kid)), anchor, start2;
      if (parent && positions.has(parent)) {
        let p = positions.get(parent), siblings = (model.childrenOf.get(parent) ?? []).filter((kid) => kid !== id2 && positions.has(kid)), below = siblings.length > 0 ? Math.max(...siblings.map((kid) => positions.get(kid).y)) + step : p.y;
        anchor = p, start2 = { x: p.x + column, y: below };
      } else if (predecessor && positions.has(predecessor)) {
        let p = positions.get(predecessor);
        anchor = p, start2 = { x: p.x, y: p.y + step + spec.treeGap };
      } else if (child) {
        let c = positions.get(child);
        anchor = c, start2 = { x: c.x - column, y: c.y };
      } else
        anchor = family.nodeIds.map((other) => positions.get(other)).find((point) => !!point), start2 = { x: 0, y: anchor?.y ?? 0 };
      let band = bandOf(key, anchor?.y), spot = band ? findSpot([{ x: 0, y: 0 }], spec.nodeHeight, band, start2.x, rowsNear(start2.y)) : void 0;
      spot ? positions.set(id2, spot) : continueGroup(key, /* @__PURE__ */ new Map([[id2, { x: 0, y: 0 }]]));
    }
  }
  let unlabelled = [];
  for (let family of newFamilies) {
    let key = groupKey(family.projectId), band = bandOf(key);
    if (!band) {
      unlabelled.push(family);
      continue;
    }
    let local2 = family.nodeIds.length > 1 ? layoutFamily(model, family, spec) : { positions: /* @__PURE__ */ new Map([[family.nodeIds[0], { x: 0, y: 0 }]]), height: spec.nodeHeight }, ids = [...local2.positions.keys()], spot = findSpot(
      ids.map((id2) => local2.positions.get(id2)),
      local2.height,
      band,
      0,
      rowsDown
    );
    if (spot)
      for (let id2 of ids) {
        let point = local2.positions.get(id2);
        positions.set(id2, { x: point.x + spot.x, y: point.y + spot.y });
      }
    else
      continueGroup(key, local2.positions);
  }
  if (unlabelled.length > 0) {
    let top = bottomOf(occupied()) + spec.groupGap, block = layoutFamilies(model, unlabelled, spec, top);
    for (let [id2, point] of block.positions)
      positions.set(id2, point);
  }
  for (let family of families) {
    let key = groupKey(family.projectId);
    if (positions.has(key))
      continue;
    let topmost = families.filter((other) => groupKey(other.projectId) === key).flatMap((other) => other.nodeIds).map((id2) => positions.get(id2)).filter((point) => !!point).reduce((best, point) => !best || point.y < best.y || point.y === best.y && point.x < best.x ? point : best, void 0);
    if (topmost) {
      let spot = { x: topmost.x, y: topmost.y - spec.labelHeight }, label = rectOf(key, spot, spec);
      [...positions].filter(([id2]) => shown.has(id2) || id2.startsWith(GROUP_PREFIX)).some(([id2, point]) => overlaps(rectOf(id2, point, spec), label)) || positions.set(key, spot);
    }
  }
  let present = new Set(families.map((family) => groupKey(family.projectId))), labels = [...positions.keys()].filter((id2) => id2.startsWith(GROUP_PREFIX) && present.has(labelGroup(id2))).map((id2) => {
    let projectId = labelGroup(id2).slice(GROUP_PREFIX.length);
    return { id: id2, projectId: projectId === NO_PROJECT_ID ? void 0 : projectId };
  });
  return { positions, labels };
}

// src/model/status.ts
init_define_import_meta_env();
function liveStatus(row, host7) {
  let ids = /* @__PURE__ */ new Set([row.id, ...row._lineage_ids ?? []]), open = !!(host7.focusedStoredSessionId && ids.has(host7.focusedStoredSessionId)), focusedBusy = open && (host7.busy || !!(host7.focusedSessionId && host7.busyBySession[host7.focusedSessionId])), running = !!row.is_active || focusedBusy || !!host7.busyBySession[row.id], needsInput = [...ids].some((id2) => host7.needsInput.has(id2)), unread = !!row.unread;
  return {
    running,
    needsInput,
    unread,
    pinned: !!row.pinned,
    open,
    tone: running ? "running" : needsInput ? "needs-input" : unread ? "unread" : "idle"
  };
}

// src/styles/registry.ts
init_define_import_meta_env();

// src/styles/dense/index.ts
init_define_import_meta_env();

// src/model/route.ts
init_define_import_meta_env();
var VEC = { down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 } }, round = (n) => Math.round(n * 100) / 100, pt = (p) => `${round(p.x)} ${round(p.y)}`;
function pathToSvg(path) {
  let d = `M${pt(path.start)}`;
  for (let seg of path.segs)
    d += seg.kind === "L" ? ` L${pt(seg.to)}` : seg.kind === "Q" ? ` Q${pt(seg.c)} ${pt(seg.to)}` : ` C${pt(seg.c1)} ${pt(seg.c2)} ${pt(seg.to)}`;
  return d;
}
function samplePath(path, perSeg = 24) {
  let out = [path.start], from = path.start;
  for (let seg of path.segs) {
    for (let i = 1; i <= perSeg; i += 1) {
      let t = i / perSeg, u = 1 - t;
      seg.kind === "L" ? out.push({ x: from.x + (seg.to.x - from.x) * t, y: from.y + (seg.to.y - from.y) * t }) : seg.kind === "Q" ? out.push({
        x: u * u * from.x + 2 * u * t * seg.c.x + t * t * seg.to.x,
        y: u * u * from.y + 2 * u * t * seg.c.y + t * t * seg.to.y
      }) : out.push({
        x: u * u * u * from.x + 3 * u * u * t * seg.c1.x + 3 * u * t * t * seg.c2.x + t * t * t * seg.to.x,
        y: u * u * u * from.y + 3 * u * u * t * seg.c1.y + 3 * u * t * t * seg.c2.y + t * t * t * seg.to.y
      });
    }
    from = seg.to;
  }
  return out;
}
function insideRect(point, rect, inset = 0) {
  return point.x > rect.x + inset && point.x < rect.x + rect.width - inset && point.y > rect.y + inset && point.y < rect.y + rect.height - inset;
}
function pathHits(path, rects, inset = 0.5) {
  let samples = samplePath(path);
  return rects.some((rect) => samples.some((sample) => insideRect(sample, rect, inset)));
}
function routeOf(path, detoured) {
  let samples = samplePath(path, 12);
  return { path, svg: pathToSvg(path), detoured, mid: samples[Math.floor(samples.length / 2)] };
}
function curvePath(from, to) {
  let horizontal = from.dir === "left" || from.dir === "right", span = Math.abs(horizontal ? to.x - from.x : to.y - from.y), d = Math.max(horizontal ? 24 : 14, span / 2), a = VEC[from.dir], b = VEC[to.dir];
  return {
    start: { x: from.x, y: from.y },
    segs: [
      {
        kind: "C",
        c1: { x: from.x + a.x * d, y: from.y + a.y * d },
        c2: { x: to.x + b.x * d, y: to.y + b.y * d },
        to: { x: to.x, y: to.y }
      }
    ]
  };
}
var DEFAULT_GRID = { margin: 12, bendPenalty: 40 }, Heap = class {
  items = [];
  get size() {
    return this.items.length;
  }
  push(f, s) {
    let items = this.items;
    items.push({ f, s });
    let i = items.length - 1;
    for (; i > 0; ) {
      let p = i - 1 >> 1;
      if (items[p].f <= items[i].f)
        break;
      [items[p], items[i]] = [items[i], items[p]], i = p;
    }
  }
  pop() {
    let items = this.items, top = items[0], last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (; ; ) {
        let l = 2 * i + 1, r = l + 1, m = i;
        if (l < items.length && items[l].f < items[m].f && (m = l), r < items.length && items[r].f < items[m].f && (m = r), m === i)
          break;
        [items[m], items[i]] = [items[i], items[m]], i = m;
      }
    }
    return top.s;
  }
}, uniqueSorted = (values) => [...new Set(values.map(round))].sort((a, b) => a - b);
function orthogonalRoute(from, to, obstacles, options = DEFAULT_GRID) {
  let m = options.margin, inflated = obstacles.map((r) => ({ x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m })), start2 = { x: round(from.x + VEC[from.dir].x * m), y: round(from.y + VEC[from.dir].y * m) }, goal = { x: round(to.x + VEC[to.dir].x * m), y: round(to.y + VEC[to.dir].y * m) };
  if (inflated.some((r) => insideRect(start2, r)) || inflated.some((r) => insideRect(goal, r)))
    return null;
  let allX = [start2.x, goal.x, ...inflated.flatMap((r) => [r.x, r.x + r.width])], allY = [start2.y, goal.y, ...inflated.flatMap((r) => [r.y, r.y + r.height])], extraX = [start2.x + VEC[from.dir].x * m, goal.x + VEC[to.dir].x * m, Math.min(...allX) - m, Math.max(...allX) + m], extraY = [start2.y + VEC[from.dir].y * m, goal.y + VEC[to.dir].y * m, Math.min(...allY) - m, Math.max(...allY) + m], xs = uniqueSorted([...allX, ...extraX]), ys = uniqueSorted([...allY, ...extraY]), W = xs.length, H = ys.length, blockedPoint = (x, y) => inflated.some((r) => insideRect({ x, y }, r)), blockedH = (y, x1, x2) => inflated.some((r) => y > r.y && y < r.y + r.height && x1 < r.x + r.width && x2 > r.x), blockedV = (x, y1, y2) => inflated.some((r) => x > r.x && x < r.x + r.width && y1 < r.y + r.height && y2 > r.y), si = xs.indexOf(start2.x), sj = ys.indexOf(start2.y), gi = xs.indexOf(goal.x), gj = ys.indexOf(goal.y), DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ], key = (i, j, d) => (j * W + i) * 5 + d, g = /* @__PURE__ */ new Map(), came = /* @__PURE__ */ new Map(), open = new Heap(), h = (i, j) => Math.abs(xs[i] - goal.x) + Math.abs(ys[j] - goal.y), startKey = key(si, sj, 4), firstDir = { right: 0, left: 1, down: 2, up: 3 }[from.dir], lastDir = { right: 1, left: 0, down: 3, up: 2 }[to.dir];
  g.set(startKey, 0), open.push(h(si, sj), startKey);
  let found = -1, expanded = 0;
  for (; open.size > 0 && expanded < 2e5; ) {
    let current = open.pop(), d = current % 5, cell = (current - d) / 5, i = cell % W, j = (cell - i) / W;
    if (expanded += 1, i === gi && j === gj && d !== (lastDir ^ 1)) {
      found = current;
      break;
    }
    let base = g.get(current);
    for (let nd = 0; nd < 4; nd += 1) {
      if (d === 4 && nd === (firstDir ^ 1) || d !== 4 && (d ^ 1) === nd)
        continue;
      let ni = i + DIRS[nd][0], nj = j + DIRS[nd][1];
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || blockedPoint(xs[ni], ys[nj]) || (nd < 2 ? blockedH(ys[j], Math.min(xs[i], xs[ni]), Math.max(xs[i], xs[ni])) : blockedV(xs[i], Math.min(ys[j], ys[nj]), Math.max(ys[j], ys[nj]))))
        continue;
      let step = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]), cost = base + step + (d !== 4 && d !== nd ? options.bendPenalty : 0), next = key(ni, nj, nd);
      cost < (g.get(next) ?? 1 / 0) && (g.set(next, cost), came.set(next, current), open.push(cost + h(ni, nj), next));
    }
  }
  if (found < 0)
    return null;
  let cells = [];
  for (let s = found; s !== void 0; s = came.get(s)) {
    let d = s % 5, cell = (s - d) / 5, i = cell % W;
    cells.push({ x: xs[i], y: ys[(cell - i) / W] });
  }
  return cells.reverse(), simplify([{ x: from.x, y: from.y }, ...cells, { x: to.x, y: to.y }]);
}
function simplify(points) {
  let out = [];
  for (let p of points) {
    let last = out[out.length - 1];
    if (!(last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6)) {
      if (out.length >= 2) {
        let a = out[out.length - 2], b = out[out.length - 1];
        if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(b.x - p.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6 && Math.abs(b.y - p.y) < 1e-6) {
          out[out.length - 1] = p;
          continue;
        }
      }
      out.push(p);
    }
  }
  return out;
}
function roundedPolyline(points, radius) {
  let segs = [];
  for (let k = 1; k < points.length; k += 1) {
    let corner = points[k];
    if (k === points.length - 1) {
      segs.push({ kind: "L", to: corner });
      break;
    }
    let prev = points[k - 1], next = points[k + 1], inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y), outLen = Math.hypot(next.x - corner.x, next.y - corner.y), r = Math.min(radius, inLen / 2, outLen / 2), a = { x: corner.x - (corner.x - prev.x) / (inLen || 1) * r, y: corner.y - (corner.y - prev.y) / (inLen || 1) * r }, b = { x: corner.x + (next.x - corner.x) / (outLen || 1) * r, y: corner.y + (next.y - corner.y) / (outLen || 1) * r };
    segs.push({ kind: "L", to: a }, { kind: "Q", c: corner, to: b });
  }
  return { start: points[0], segs };
}
function nearObstacles(from, to, obstacles, reach = 360) {
  let x1 = Math.min(from.x, to.x) - reach, x2 = Math.max(from.x, to.x) + reach, y1 = Math.min(from.y, to.y) - reach, y2 = Math.max(from.y, to.y) + reach;
  return obstacles.filter((r) => r.x < x2 && r.x + r.width > x1 && r.y < y2 && r.y + r.height > y1);
}
var DETOUR_MARGINS = [12, 6, 3, 1];
function detour(from, to, obstacles, radius, ends = []) {
  for (let margin of DETOUR_MARGINS) {
    let path = detourWith(from, to, obstacles, Math.max(0, Math.min(radius, margin - 2)), ends, margin);
    if (path)
      return path;
  }
}
function detourWith(from, to, obstacles, radius, ends, margin) {
  let options = { ...DEFAULT_GRID, margin }, near = [...nearObstacles(from, to, obstacles), ...ends], points = orthogonalRoute(from, to, near, options) ?? // A wider search only while the grid stays small (its size grows with the square of the count).
  (obstacles.length <= 120 && obstacles.length + ends.length > near.length ? orthogonalRoute(from, to, [...obstacles, ...ends], options) : null);
  if (!points)
    return;
  let rounded = roundedPolyline(points, radius);
  if (!pathHits(rounded, obstacles))
    return rounded;
  let sharp = roundedPolyline(points, 0);
  return pathHits(sharp, obstacles) ? void 0 : sharp;
}
var curveRouter = {
  shape: "curve",
  live: (from, to) => routeOf(curvePath(from, to), !1),
  route({ from, to, obstacles, ends }) {
    let plain = curvePath(from, to);
    if (!pathHits(plain, obstacles))
      return routeOf(plain, !1);
    let around = detour(from, to, obstacles, 10, ends);
    return around ? routeOf(around, !0) : routeOf(plain, !1);
  }
};
function routeLinks(links, rects, router) {
  let all = [...rects], out = /* @__PURE__ */ new Map();
  for (let link2 of links) {
    let obstacles = all.filter(([id2]) => id2 !== link2.source && id2 !== link2.target).map(([, rect]) => rect), ends = [rects.get(link2.source), rects.get(link2.target)].filter((rect) => !!rect);
    out.set(link2.id, router.route({ from: link2.from, to: link2.to, obstacles, ends }));
  }
  return out;
}

// src/styles/shared.tsx
init_define_import_meta_env();
import { Codicon } from "@hermes/plugin-sdk";
import { memo as memo2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function BlockHandles({ resetX }) {
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsx2(Handle, { type: "target", position: Position.Left, isConnectable: !1, className: "session-tree__handle" }),
    /* @__PURE__ */ jsx2(
      Handle,
      {
        id: "up",
        type: "target",
        position: Position.Top,
        isConnectable: !1,
        className: "session-tree__handle",
        style: { left: resetX }
      }
    ),
    /* @__PURE__ */ jsx2(Handle, { type: "source", position: Position.Right, isConnectable: !1, className: "session-tree__handle" }),
    /* @__PURE__ */ jsx2(
      Handle,
      {
        id: "down",
        type: "source",
        position: Position.Bottom,
        isConnectable: !1,
        className: "session-tree__handle",
        style: { left: resetX }
      }
    )
  ] });
}
function blockHandles(width, height, resetX) {
  return [
    { type: "target", position: Position.Left, x: 0, y: height / 2, width: 1, height: 1 },
    { id: "up", type: "target", position: Position.Top, x: resetX, y: 0, width: 1, height: 1 },
    { type: "source", position: Position.Right, x: width - 1, y: height / 2, width: 1, height: 1 },
    { id: "down", type: "source", position: Position.Bottom, x: resetX, y: height - 1, width: 1, height: 1 }
  ];
}
function ProjectGlyph({ project, size = 12 }) {
  return project ? project.color && !project.icon ? /* @__PURE__ */ jsx2("span", { className: "session-tree__glyph-dot", "aria-hidden": "true", style: { backgroundColor: project.color } }) : /* @__PURE__ */ jsx2(
    Codicon,
    {
      name: project.icon || (project.isNoProject ? "home" : project.isAuto ? "repo" : "folder-library"),
      size,
      className: "session-tree__glyph-icon",
      style: project.color ? { color: project.color } : void 0
    }
  ) : /* @__PURE__ */ jsx2("span", { className: "session-tree__glyph-dot session-tree__glyph-dot--none", "aria-hidden": "true" });
}
var projectColor = (project) => project?.color || "var(--ui-text-quaternary)", GroupLabel = memo2(function({ data }) {
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      className: `session-tree__group-label${data.dimmed ? " is-dimmed" : ""}`,
      "data-testid": "session-tree-group-label",
      "data-project-id": data.project?.id ?? "",
      style: { "--st-pc": projectColor(data.project) },
      children: [
        /* @__PURE__ */ jsx2(ProjectGlyph, { project: data.project, size: 11 }),
        /* @__PURE__ */ jsx2("span", { children: data.label })
      ]
    }
  );
});

// src/styles/dense/dense-flow.tsx
init_define_import_meta_env();
import { Codicon as Codicon2 } from "@hermes/plugin-sdk";
import { memo as memo3 } from "react";

// src/model/format.ts
init_define_import_meta_env();
function shortAge(epochSeconds, nowMs = Date.now()) {
  if (!epochSeconds)
    return "—";
  let seconds = Math.max(0, nowMs / 1e3 - epochSeconds);
  if (seconds < 60)
    return "now";
  let minutes = seconds / 60;
  if (minutes < 60)
    return `${Math.floor(minutes)}m`;
  let hours = minutes / 60;
  if (hours < 24)
    return `${Math.floor(hours)}h`;
  let days = hours / 24;
  return days < 14 ? `${Math.floor(days)}d` : days < 60 ? `${Math.floor(days / 7)}w` : days < 365 ? `${Math.floor(days / 30)}mo` : `${Math.floor(days / 365)}y`;
}
function agoLabel(epochSeconds, nowMs = Date.now()) {
  let age = shortAge(epochSeconds, nowMs);
  return age === "now" || age === "—" ? age : `${age} ago`;
}
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateTimeLabel(epochSeconds) {
  if (!epochSeconds)
    return "—";
  let date2 = new Date(epochSeconds * 1e3), hh = String(date2.getHours()).padStart(2, "0"), mm = String(date2.getMinutes()).padStart(2, "0");
  return `${MONTHS[date2.getMonth()]} ${date2.getDate()}, ${hh}:${mm}`;
}
function compactNumber(value2) {
  let n = Number(value2 ?? 0);
  return Number.isFinite(n) ? Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)) : "—";
}
function costLabel(actual, estimated) {
  let value2 = typeof actual == "number" && actual > 0 ? actual : estimated;
  return typeof value2 == "number" && Number.isFinite(value2) ? `$${value2.toFixed(2)}` : "—";
}

// src/page/session-actions-context.ts
init_define_import_meta_env();
import { createContext as createContext2, useContext as useContext2 } from "react";
var SessionActionsCtx = createContext2(null);
function useSessionActions() {
  return useContext2(SessionActionsCtx);
}

// src/styles/dense/spec.ts
init_define_import_meta_env();
function denseLayoutSpec({ showAll }) {
  return {
    nodeWidth: 168,
    nodeHeight: 26,
    columnGap: 54,
    rowGap: 8,
    treeGap: 26,
    familyGap: 18,
    groupGap: 30,
    labelHeight: 26,
    singlesColumns: 4,
    includeSingles: showAll
  };
}
function densePorts(kind, source, target) {
  return kind === "reset" ? {
    from: { x: source.x + 22, y: source.y + source.height, dir: "down" },
    to: { x: target.x + 22, y: target.y, dir: "up" }
  } : {
    from: { x: source.x + source.width, y: source.y + source.height / 2, dir: "right" },
    to: { x: target.x, y: target.y + target.height / 2, dir: "left" }
  };
}

// src/styles/dense/dense-flow.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function blockClass(data, selected2, extra = "") {
  let { node } = data;
  return [
    "session-tree__block",
    "st-dense",
    extra,
    selected2 ? "is-selected" : "",
    data.inLineage ? "is-lineage" : "",
    data.status?.open ? "is-open" : "",
    node.archived ? "is-archived" : "",
    node.outOfScope ? "is-out-of-scope" : ""
  ].filter(Boolean).join(" ");
}
var DenseBlock = memo3(function({ data, selected: selected2 }) {
  let { node, status, project } = data, actions = useSessionActions(), row = node.row, tone = status?.tone ?? "idle";
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      className: blockClass(data, !!selected2),
      "data-testid": "session-tree-block",
      "data-session-id": row.id,
      "data-node-id": node.id,
      "data-project-id": node.projectId ?? "",
      "data-status": tone,
      "data-open": status?.open ? "true" : void 0,
      "data-archived": node.archived ? "true" : void 0,
      "data-out-of-scope": node.outOfScope ? "true" : void 0,
      "data-lineage": data.inLineage ? "true" : void 0,
      style: { width: 168, height: 26, "--st-pc": projectColor(project) },
      children: [
        /* @__PURE__ */ jsx3(BlockHandles, { resetX: 22 }),
        /* @__PURE__ */ jsx3("span", { className: `st-dot st-dot--${tone}`, "aria-label": tone === "idle" ? void 0 : tone }),
        status?.pinned && /* @__PURE__ */ jsx3(Codicon2, { name: "pinned", size: 11, className: "st-pin" }),
        /* @__PURE__ */ jsx3("span", { className: "st-title", children: node.title }),
        node.compacted > 0 && /* @__PURE__ */ jsxs3("span", { className: "st-cmp", "data-testid": "session-tree-compacted", title: `compacted ×${node.compacted}`, children: [
          /* @__PURE__ */ jsx3(Codicon2, { name: "layers", size: 11 }),
          "×",
          node.compacted
        ] }),
        /* @__PURE__ */ jsx3("span", { className: "st-age", children: shortAge(row.last_active || row.started_at, data.nowMs) }),
        actions?.canAct(node) && // R14: the session menu from the block itself (on hover or while selected).
        /* @__PURE__ */ jsx3(
          "button",
          {
            type: "button",
            className: "st-more nodrag nopan",
            "data-testid": "session-tree-block-more",
            "aria-label": "Session actions",
            title: "Session actions",
            onMouseDown: (event) => event.stopPropagation(),
            onDoubleClick: (event) => event.stopPropagation(),
            onClick: (event) => {
              event.stopPropagation(), actions.openMenuFor(node.id, event.currentTarget);
            },
            children: /* @__PURE__ */ jsx3(Codicon2, { name: "ellipsis", size: 12 })
          }
        )
      ]
    }
  );
}), DenseStandin = memo3(function({ data }) {
  let { node } = data;
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      className: blockClass(data, !1, "is-standin"),
      "data-testid": "session-tree-standin",
      "data-node-id": node.id,
      "data-missing-id": node.missingId,
      "data-out-of-scope": node.outOfScope ? "true" : void 0,
      style: { width: 168, height: 26 },
      children: [
        /* @__PURE__ */ jsx3(BlockHandles, { resetX: 22 }),
        /* @__PURE__ */ jsx3("span", { className: "st-title", children: "Parent not loaded" }),
        /* @__PURE__ */ jsx3("span", { className: "st-age", children: "?" })
      ]
    }
  );
});
function rectOfInternal(node) {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured?.width ?? node.width ?? 168,
    height: node.measured?.height ?? node.height ?? 26
  };
}
var samePort = (a, b) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
function DenseLink({ id: id2, source, target, data }) {
  let sourceNode = useInternalNode(source), targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode || !data)
    return null;
  let { from, to } = densePorts(data.kind, rectOfInternal(sourceNode), rectOfInternal(targetNode)), route = data.route && samePort(data.route.from, from) && samePort(data.route.to, to) ? data.route.route : curveRouter.live(from, to), classes = [
    "session-tree__link",
    `session-tree__link--${data.kind}`,
    data.fromStandin ? "session-tree__link--standin" : "",
    data.highlighted ? "is-highlighted" : "",
    data.dimmed ? "is-dimmed" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsxs3(
    "g",
    {
      "data-testid": "session-tree-link",
      "data-source": source,
      "data-target": target,
      "data-kind": data.kind,
      "data-standin": data.fromStandin ? "true" : void 0,
      "data-detoured": route.detoured ? "true" : "false",
      "data-highlighted": data.highlighted ? "true" : void 0,
      className: data.dimmed ? "is-dimmed" : void 0,
      children: [
        /* @__PURE__ */ jsx3(BaseEdge, { id: id2, path: route.svg, className: classes }),
        data.kind === "reset" ? /* @__PURE__ */ jsx3(
          "path",
          {
            className: `session-tree__link-end${data.highlighted ? " is-highlighted" : ""}`,
            d: `M${to.x - 3} ${to.y - 5} L${to.x + 3} ${to.y - 5} L${to.x} ${to.y - 1}Z`
          }
        ) : /* @__PURE__ */ jsx3("circle", { className: `session-tree__link-end${data.highlighted ? " is-highlighted" : ""}`, cx: to.x - 2, cy: to.y, r: 2 }),
        data.kind === "reset" && // EdgeLabelRenderer portals into the flow's label layer (the react-dom shim's proof).
        /* @__PURE__ */ jsx3(EdgeLabelRenderer, { children: /* @__PURE__ */ jsx3(
          "div",
          {
            className: "session-tree__link-label nodrag nopan",
            "data-testid": "session-tree-link-label",
            "data-link-id": id2,
            style: { transform: `translate(0, -50%) translate(${route.mid.x + 6}px, ${route.mid.y}px)` },
            children: "continued as"
          }
        ) })
      ]
    }
  );
}

// src/styles/dense/inspector.tsx
init_define_import_meta_env();
import { Codicon as Codicon3 } from "@hermes/plugin-sdk";
import { useState as useState2 } from "react";

// src/page/labels.ts
init_define_import_meta_env();
import { useI18n } from "@hermes/plugin-sdk";
import { useMemo as useMemo2 } from "react";
function pick(tree, path) {
  let value2 = tree;
  for (let key of path.split("."))
    value2 = value2?.[key];
  return value2;
}
function labelsFrom(t) {
  let text = (path, fallback) => {
    let value2 = pick(t, path);
    return typeof value2 == "string" && value2 ? value2 : fallback;
  }, format = (path, fallback) => (arg) => {
    let value2 = pick(t, path);
    if (typeof value2 == "function")
      try {
        let out = value2(arg);
        if (typeof out == "string" && out)
          return out;
      } catch {
      }
    return fallback(arg);
  };
  return {
    rename: text("sidebar.row.rename", "Rename…"),
    pin: text("sidebar.row.pin", "Pin"),
    unpin: text("sidebar.row.unpin", "Unpin"),
    markRead: text("sidebar.row.markRead", "Mark as read"),
    markUnread: text("sidebar.row.markUnread", "Mark as unread"),
    appearance: text("sidebar.projects.menuAppearance", "Appearance"),
    noColor: text("sidebar.projects.noColor", "No color"),
    copyId: text("sidebar.row.copyId", "Copy ID"),
    copyIdFailed: text("sidebar.row.copyIdFailed", "Could not copy session ID"),
    copied: text("common.copied", "Copied"),
    branch: text("sidebar.row.branchFrom", "Branch"),
    export: text("sidebar.row.export", "Export"),
    moveToProject: text("sidebar.projects.moveToProject", "Move to project"),
    moveNoProjects: text("sidebar.projects.moveNoProjects", "No other projects"),
    movedTo: format("sidebar.projects.movedTo", (name) => `Moved to ${name}`),
    moveFailed: text("sidebar.projects.moveFailed", "Could not move session"),
    archive: text("sidebar.row.archive", "Archive"),
    unarchive: text("sidebar.row.unarchive", "Unarchive"),
    delete: text("common.delete", "Delete"),
    deleteTitle: text("sidebar.row.deleteTitle", "Delete session?"),
    deleteDesc: format("sidebar.row.deleteDesc", (title) => `This will permanently delete “${title}”. This cannot be undone.`),
    deleting: text("sidebar.row.deleting", "Deleting…"),
    deleted: text("sidebar.row.deleted", "Session deleted"),
    renameTitle: text("sidebar.row.renameTitle", "Rename session"),
    untitledPlaceholder: text("sidebar.row.untitledPlaceholder", "Untitled session"),
    renamed: text("sidebar.row.renamed", "Renamed"),
    renameFailed: text("sidebar.row.renameFailed", "Rename failed"),
    unreadFailed: text("sidebar.row.unreadFailed", "Could not update unread state"),
    sessionActions: text("sidebar.row.sessionActions", "Session actions"),
    cancel: text("common.cancel", "Cancel"),
    save: text("common.save", "Save"),
    exported: text("desktop.sessionExported", "Session exported"),
    exportFailed: text("desktop.sessionExportFailed", "Could not export session")
  };
}
function useMenuLabels() {
  let { t } = useI18n();
  return useMemo2(() => labelsFrom(t), [t]);
}

// src/styles/dense/inspector.tsx
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function NodeLink({
  model,
  id: id2,
  relation,
  onSelect,
  onOpen,
  nowMs
}) {
  let node = model.nodeById.get(id2);
  if (!node)
    return null;
  let project = node.projectId ? model.projects.find((p) => p.id === node.projectId) : void 0;
  return /* @__PURE__ */ jsxs4(
    "button",
    {
      type: "button",
      className: `st-lk${node.outOfScope ? " is-dim" : ""}`,
      "data-testid": "session-tree-inspector-link",
      "data-node-id": node.id,
      "data-relation": relation ?? "",
      title: node.kind === "standin" ? "Parent not loaded" : node.title,
      disabled: node.readOnly,
      style: { "--st-pc": projectColor(project) },
      onClick: () => onSelect(node.id, !0),
      onDoubleClick: () => onOpen(node),
      children: [
        relation && /* @__PURE__ */ jsx4("span", { className: "st-rel", children: relation }),
        /* @__PURE__ */ jsx4("span", { className: "st-lk-dot" }),
        /* @__PURE__ */ jsx4("span", { className: "st-lk-title", children: node.kind === "standin" ? "Parent not loaded" : node.title }),
        /* @__PURE__ */ jsx4("span", { className: "st-lk-age", children: node.row ? shortAge(node.row.last_active || node.row.started_at, nowMs) : "?" })
      ]
    }
  );
}
function Stat({ field, label, value: value2, title }) {
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsx4("small", { children: label }),
    /* @__PURE__ */ jsx4("b", { "data-field": field, title, children: value2 })
  ] });
}
function StatusTags({ node, status }) {
  let tags = [];
  return status?.open && tags.push({ key: "open", label: "● open in app", tone: "acc" }), status?.running && tags.push({ key: "running", label: "running", tone: "run" }), status?.needsInput && tags.push({ key: "needs-input", label: "needs input", tone: "ask" }), status?.unread && tags.push({ key: "unread", label: "unread", tone: "acc" }), status?.pinned && tags.push({ key: "pinned", label: "pinned" }), node.archived && tags.push({ key: "archived", label: "archived" }), node.compacted > 0 && tags.push({ key: "compacted", label: `compacted ×${node.compacted}`, tone: "acc" }), node.outOfScope && tags.push({ key: "out-of-scope", label: "outside this project" }), /* @__PURE__ */ jsx4("div", { className: "st-tags", "data-testid": "session-tree-inspector-tags", children: tags.map((tag) => /* @__PURE__ */ jsx4("span", { className: `st-tag${tag.tone ? ` st-tag--${tag.tone}` : ""}`, "data-tag": tag.key, children: tag.label }, tag.key)) });
}
function Actions({ node, onOpen }) {
  let actions = useSessionActions(), labels = useMenuLabels(), available = !!actions?.canAct(node), archived = !!node.row?.archived;
  return /* @__PURE__ */ jsxs4("div", { className: "st-acts", "data-testid": "session-tree-inspector-actions", children: [
    /* @__PURE__ */ jsxs4("button", { type: "button", className: "st-act st-act--primary", "data-action": "open", disabled: !available, title: "Open in a new tab", onClick: () => onOpen(node), children: [
      /* @__PURE__ */ jsx4(Codicon3, { name: "link-external", size: 12 }),
      "Open"
    ] }),
    /* @__PURE__ */ jsxs4(
      "button",
      {
        type: "button",
        className: "st-act",
        "data-action": "branch",
        disabled: !available,
        title: labels.branch,
        onClick: (event) => {
          event.detail > 1 || actions?.branch(node);
        },
        children: [
          /* @__PURE__ */ jsx4(Codicon3, { name: "repo-forked", size: 12 }),
          labels.branch
        ]
      }
    ),
    /* @__PURE__ */ jsx4("button", { type: "button", className: "st-act", "data-action": "rename", disabled: !available, title: labels.rename, "aria-label": labels.rename, onClick: () => actions?.rename(node), children: /* @__PURE__ */ jsx4(Codicon3, { name: "edit", size: 12 }) }),
    /* @__PURE__ */ jsx4(
      "button",
      {
        type: "button",
        className: "st-act",
        "data-action": "archive",
        disabled: !available,
        title: archived ? labels.unarchive : labels.archive,
        "aria-label": archived ? labels.unarchive : labels.archive,
        onClick: () => {
          actions?.toggleArchive(node);
        },
        children: /* @__PURE__ */ jsx4(Codicon3, { name: "archive", size: 12 })
      }
    ),
    /* @__PURE__ */ jsx4(
      "button",
      {
        type: "button",
        className: "st-act",
        "data-action": "more",
        "data-testid": "session-tree-inspector-more",
        disabled: !available,
        title: labels.sessionActions,
        "aria-label": labels.sessionActions,
        onClick: (event) => actions?.openMenuFor(node.id, event.currentTarget),
        children: /* @__PURE__ */ jsx4(Codicon3, { name: "ellipsis", size: 12 })
      }
    )
  ] });
}
function SessionDetails({ model, node, status, onSelect, onOpen, nowMs }) {
  let row = node.row, project = node.projectId ? model.projects.find((p) => p.id === node.projectId) : void 0, parent = model.parentOf.get(node.id), from = model.continuedFrom.get(node.id), continuedAs = model.continuedAs.get(node.id) ?? [], children2 = model.childrenOf.get(node.id) ?? [], segments = row._lineage_ids && row._lineage_ids.length > 1 ? row._lineage_ids : null, linkProps = { model, onSelect, onOpen, nowMs };
  return /* @__PURE__ */ jsxs4(Fragment3, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "st-ih", children: [
      /* @__PURE__ */ jsx4(ProjectGlyph, { project, size: 11 }),
      /* @__PURE__ */ jsx4("span", { "data-field": "project", children: project?.label ?? "No project" }),
      model.options.profile === "*" && /* @__PURE__ */ jsx4("span", { className: "st-ih-profile", "data-field": "profile", children: node.profile }),
      /* @__PURE__ */ jsx4("span", { className: "st-ih-id", "data-field": "id", title: row.id, children: row.id })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "st-it", "data-field": "title", children: node.title }),
    /* @__PURE__ */ jsx4(StatusTags, { node, status }),
    /* @__PURE__ */ jsx4(Actions, { node, onOpen }),
    /* @__PURE__ */ jsx4("div", { className: "st-sec", children: /* @__PURE__ */ jsxs4("div", { className: "st-kv", children: [
      /* @__PURE__ */ jsx4(Stat, { field: "last-used", label: "Last used", value: agoLabel(row.last_active || row.started_at, nowMs), title: dateTimeLabel(row.last_active) }),
      /* @__PURE__ */ jsx4(Stat, { field: "started", label: "Started", value: dateTimeLabel(row.started_at) }),
      /* @__PURE__ */ jsx4(Stat, { field: "messages", label: "Messages", value: String(row.message_count ?? 0) }),
      /* @__PURE__ */ jsx4(Stat, { field: "tool-calls", label: "Tool calls", value: String(row.tool_call_count ?? 0) }),
      /* @__PURE__ */ jsx4(Stat, { field: "tokens-in", label: "Tokens in", value: compactNumber(row.input_tokens), title: String(row.input_tokens ?? 0) }),
      /* @__PURE__ */ jsx4(Stat, { field: "tokens-out", label: "Tokens out", value: compactNumber(row.output_tokens), title: String(row.output_tokens ?? 0) }),
      /* @__PURE__ */ jsx4(Stat, { field: "cost", label: "Cost", value: costLabel(row.actual_cost_usd, row.estimated_cost_usd) }),
      /* @__PURE__ */ jsx4(Stat, { field: "model", label: "Model", value: row.model || "—", title: row.model ?? void 0 })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "st-sec", children: [
      /* @__PURE__ */ jsx4("div", { className: "st-sh", children: /* @__PURE__ */ jsx4("span", { children: "Compression" }) }),
      node.compacted > 0 ? /* @__PURE__ */ jsxs4("div", { "data-testid": "session-tree-inspector-compression", children: [
        /* @__PURE__ */ jsxs4("div", { className: "st-cmpline", "data-field": "compression", children: [
          /* @__PURE__ */ jsx4(Codicon3, { name: "layers", size: 12 }),
          "compacted ×",
          node.compacted,
          " — ",
          node.compacted,
          " earlier segment",
          node.compacted > 1 ? "s" : ""
        ] }),
        /* @__PURE__ */ jsx4("div", { className: "st-segs", children: Array.from({ length: node.compacted + 1 }, (_, index2) => /* @__PURE__ */ jsx4("i", { className: index2 === node.compacted ? "is-current" : void 0 }, index2)) }),
        segments && /* @__PURE__ */ jsx4("div", { className: "st-seglist", children: segments.map((segment, index2) => /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsx4("span", { children: index2 === segments.length - 1 ? "Current segment" : `Segment ${index2 + 1}` }),
          /* @__PURE__ */ jsx4("span", { className: "st-mono", children: segment })
        ] }, segment)) })
      ] }) : /* @__PURE__ */ jsx4("div", { className: "st-none", "data-field": "compression", children: "Not compacted · single segment" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "st-sec", children: [
      /* @__PURE__ */ jsx4("div", { className: "st-sh", children: /* @__PURE__ */ jsx4("span", { children: "Lineage" }) }),
      parent && /* @__PURE__ */ jsx4(NodeLink, { ...linkProps, id: parent, relation: "parent" }),
      from && /* @__PURE__ */ jsx4(NodeLink, { ...linkProps, id: from, relation: "cont. from" }),
      continuedAs.map((id2) => /* @__PURE__ */ jsx4(NodeLink, { ...linkProps, id: id2, relation: "cont. as" }, id2)),
      !parent && !from && continuedAs.length === 0 && /* @__PURE__ */ jsx4("div", { className: "st-none", children: "Root session · no parent" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "st-sec", children: [
      /* @__PURE__ */ jsxs4("div", { className: "st-sh", children: [
        /* @__PURE__ */ jsx4("span", { children: "Children" }),
        /* @__PURE__ */ jsx4("span", { "data-field": "children-count", children: children2.length })
      ] }),
      children2.map((id2) => /* @__PURE__ */ jsx4(NodeLink, { ...linkProps, id: id2 }, id2)),
      children2.length === 0 && /* @__PURE__ */ jsx4("div", { className: "st-none", children: "No branches yet" })
    ] })
  ] });
}
function DenseInspector(props) {
  let { model, selectedId, statusOf, onSelect, onOpen, nowMs } = props, [singlesOpen, setSinglesOpen] = useState2(!0), node = selectedId ? model.nodeById.get(selectedId) : void 0, singles = singlesInScope(model);
  return /* @__PURE__ */ jsxs4("aside", { className: "st-insp", "data-testid": "session-tree-inspector", "data-selected-id": node?.id ?? "", children: [
    /* @__PURE__ */ jsxs4("div", { className: "st-ib", children: [
      !node && /* @__PURE__ */ jsxs4("div", { className: "st-empty", "data-testid": "session-tree-inspector-empty", children: [
        "Select a session to inspect it.",
        /* @__PURE__ */ jsx4("br", {}),
        "Click a block · double-click opens it in a tab"
      ] }),
      node?.kind === "session" && /* @__PURE__ */ jsx4(SessionDetails, { ...props, node, status: statusOf(node) })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: `st-singles${singlesOpen ? "" : " is-collapsed"}`, "data-testid": "session-tree-singles", children: [
      /* @__PURE__ */ jsxs4("button", { type: "button", className: "st-singles-toggle", onClick: () => setSinglesOpen((open) => !open), "aria-expanded": singlesOpen, children: [
        /* @__PURE__ */ jsx4(Codicon3, { name: singlesOpen ? "chevron-down" : "chevron-right", size: 12 }),
        /* @__PURE__ */ jsx4("b", { children: "Singles" }),
        /* @__PURE__ */ jsx4("span", { "data-testid": "session-tree-singles-count", children: singles.length }),
        "· no branches"
      ] }),
      singlesOpen && /* @__PURE__ */ jsxs4("div", { className: "st-sl", children: [
        singles.map((single) => /* @__PURE__ */ jsx4(NodeLink, { model, id: single.id, onSelect, onOpen, nowMs }, single.id)),
        singles.length === 0 && /* @__PURE__ */ jsx4("div", { className: "st-none", children: "No singles in this scope" })
      ] })
    ] })
  ] });
}

// src/styles/dense/index.ts
var denseStyle = {
  id: "dense",
  label: "Dense + inspector",
  nodeTypes: { "dense-session": DenseBlock, "dense-standin": DenseStandin, group: GroupLabel },
  nodeType: { session: "dense-session", standin: "dense-standin", group: "group" },
  edgeTypes: { "dense-link": DenseLink },
  edgeType: "dense-link",
  nodeSize: { width: 168, height: 26 },
  layoutSpec: denseLayoutSpec,
  layout: (model, previous, spec) => mergeLayout(previous, model, spec),
  draggable: !0,
  savesLayout: !0,
  singles: "inspector-list",
  router: curveRouter,
  ports: densePorts,
  grid: 16,
  resetPortX: 22,
  Panel: DenseInspector
};

// src/styles/e2e-alt/index.ts
init_define_import_meta_env();

// src/styles/registry.ts
var DEFAULT_STYLE_ID = "dense", STYLES = /* @__PURE__ */ new Map([
  [denseStyle.id, denseStyle]
]);
function registeredStyles() {
  return [...STYLES.values()];
}
function isRegisteredStyle(id2) {
  return typeof id2 == "string" && STYLES.has(id2);
}
function getStyle(id2) {
  return STYLES.get(id2) ?? STYLES.get(DEFAULT_STYLE_ID);
}
function resolveStyleId(override, synced) {
  return isRegisteredStyle(override) ? override : isRegisteredStyle(synced) ? synced : DEFAULT_STYLE_ID;
}

// src/page/graph-canvas.tsx
init_define_import_meta_env();
import { useCallback as useCallback3, useEffect as useEffect2, useMemo as useMemo3, useRef as useRef2, useState as useState4 } from "react";

// src/page/plugin-context.ts
init_define_import_meta_env();
import { createContext as createContext3, useContext as useContext3 } from "react";
var PluginCtx = createContext3(null);
function usePluginCtx() {
  let ctx = useContext3(PluginCtx);
  if (!ctx)
    throw new Error("Session Tree component rendered outside its plugin context");
  return ctx;
}

// src/page/session-menu.tsx
init_define_import_meta_env();
import {
  Codicon as Codicon4,
  ColorSwatches,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  CopyButton,
  icons,
  PROFILE_SWATCHES
} from "@hermes/plugin-sdk";
import { useCallback as useCallback2, useState as useState3 } from "react";
import { Fragment as Fragment4, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function nodeIdAt(target) {
  return target?.closest?.(".react-flow__node")?.getAttribute("data-id") ?? null;
}
var ICON = 14;
function MenuItems({ node, actions, labels }) {
  let row = node.row, status = actions.statusOf(node), unread = !!row.unread, blocked = deleteBlockedReason(status), targets = actions.moveTargets(node), ArchiveOff = icons.ArchiveOff;
  return /* @__PURE__ */ jsxs5(Fragment4, { children: [
    /* @__PURE__ */ jsxs5(
      ContextMenuItem,
      {
        "data-action": "rename",
        onSelect: () => {
          actions.noteDialogFromMenu(), actions.rename(node);
        },
        children: [
          /* @__PURE__ */ jsx5(Codicon4, { name: "edit", size: ICON }),
          /* @__PURE__ */ jsx5("span", { children: labels.rename })
        ]
      }
    ),
    /* @__PURE__ */ jsxs5(ContextMenuItem, { "data-action": "pin", "data-pinned": row.pinned ? "true" : "false", onSelect: () => actions.togglePin(node), children: [
      /* @__PURE__ */ jsx5(Codicon4, { name: "pin", size: ICON }),
      /* @__PURE__ */ jsx5("span", { children: row.pinned ? labels.unpin : labels.pin })
    ] }),
    /* @__PURE__ */ jsxs5(ContextMenuItem, { "data-action": "read", "data-unread": unread ? "true" : "false", onSelect: () => {
      actions.toggleUnread(node);
    }, children: [
      /* @__PURE__ */ jsx5(Codicon4, { name: unread ? "mail-read" : "mail", size: ICON }),
      /* @__PURE__ */ jsx5("span", { children: unread ? labels.markRead : labels.markUnread })
    ] }),
    /* @__PURE__ */ jsxs5(ContextMenuSub, { children: [
      /* @__PURE__ */ jsxs5(ContextMenuSubTrigger, { "data-action": "appearance", children: [
        /* @__PURE__ */ jsx5(Codicon4, { name: "symbol-color", size: ICON }),
        /* @__PURE__ */ jsx5("span", { children: labels.appearance })
      ] }),
      /* @__PURE__ */ jsx5(ContextMenuSubContent, { className: "p-2", "data-testid": "session-tree-menu-appearance", children: /* @__PURE__ */ jsx5(
        ColorSwatches,
        {
          clearIcon: "circle-slash",
          clearLabel: labels.noColor,
          swatches: PROFILE_SWATCHES,
          value: actions.colorOf(node),
          onChange: (color2) => actions.setColor(node, color2)
        }
      ) })
    ] }),
    /* @__PURE__ */ jsx5(
      CopyButton,
      {
        appearance: "context-menu-item",
        errorMessage: labels.copyIdFailed,
        iconClassName: "size-3.5 text-current",
        label: labels.copyId,
        text: row.id,
        onCopied: () => actions.copied(node),
        onCopyError: (error) => actions.copyFailed(error)
      }
    ),
    /* @__PURE__ */ jsx5(ContextMenuSeparator, {}),
    /* @__PURE__ */ jsxs5(ContextMenuItem, { "data-action": "branch", onSelect: () => {
      actions.branch(node);
    }, children: [
      /* @__PURE__ */ jsx5(Codicon4, { name: "repo-forked", size: ICON }),
      /* @__PURE__ */ jsx5("span", { children: labels.branch })
    ] }),
    /* @__PURE__ */ jsxs5(ContextMenuItem, { "data-action": "export", onSelect: () => {
      actions.exportSession(node);
    }, children: [
      /* @__PURE__ */ jsx5(Codicon4, { name: "cloud-download", size: ICON }),
      /* @__PURE__ */ jsx5("span", { children: labels.export })
    ] }),
    /* @__PURE__ */ jsxs5(ContextMenuSub, { children: [
      /* @__PURE__ */ jsxs5(ContextMenuSubTrigger, { "data-action": "move", children: [
        /* @__PURE__ */ jsx5(Codicon4, { name: "folder", size: ICON }),
        /* @__PURE__ */ jsx5("span", { children: labels.moveToProject })
      ] }),
      /* @__PURE__ */ jsx5(ContextMenuSubContent, { "data-testid": "session-tree-menu-move", children: targets.length === 0 ? /* @__PURE__ */ jsx5(ContextMenuItem, { disabled: !0, children: labels.moveNoProjects }) : targets.map((project) => /* @__PURE__ */ jsx5(ContextMenuItem, { "data-action": "move-to", "data-project-id": project.id, onSelect: () => {
        actions.moveTo(node, project);
      }, children: project.label }, project.id)) })
    ] }),
    /* @__PURE__ */ jsx5(ContextMenuSeparator, {}),
    /* @__PURE__ */ jsxs5(ContextMenuItem, { "data-action": "archive", "data-archived": row.archived ? "true" : "false", onSelect: () => {
      actions.toggleArchive(node);
    }, children: [
      row.archived && ArchiveOff ? /* @__PURE__ */ jsx5(ArchiveOff, { className: "size-3.5" }) : /* @__PURE__ */ jsx5(Codicon4, { name: "archive", size: ICON }),
      /* @__PURE__ */ jsx5("span", { children: row.archived ? labels.unarchive : labels.archive })
    ] }),
    /* @__PURE__ */ jsxs5(
      ContextMenuItem,
      {
        variant: "destructive",
        className: "text-destructive focus:text-destructive",
        "data-action": "delete",
        "data-blocked-reason": blocked,
        disabled: !!blocked,
        title: blocked,
        onSelect: () => {
          actions.noteDialogFromMenu(), actions.remove(node);
        },
        children: [
          /* @__PURE__ */ jsx5(Codicon4, { name: "trash", size: ICON }),
          /* @__PURE__ */ jsx5("span", { children: labels.delete }),
          blocked && /* @__PURE__ */ jsx5("span", { className: "st-menu-note", children: blocked })
        ]
      }
    )
  ] });
}
function SessionMenu({ model, children: children2, onOpenFor, onRestoreFocus }) {
  let actions = useSessionActions(), labels = useMenuLabels(), [nodeId, setNodeId] = useState3(null), node = nodeId ? model.nodeById.get(nodeId) : void 0, onContextMenu = useCallback2(
    (event) => {
      let id2 = actions?.takeRequestedMenuNode() ?? null ?? nodeIdAt(event.target), target = id2 ? model.nodeById.get(id2) : void 0;
      if (!actions || !actions.canAct(target)) {
        event.preventDefault();
        return;
      }
      setNodeId(target.id), onOpenFor(target);
    },
    [actions, model, onOpenFor]
  );
  return /* @__PURE__ */ jsxs5(ContextMenu, { children: [
    /* @__PURE__ */ jsx5(ContextMenuTrigger, { asChild: !0, onContextMenu, children: children2 }),
    actions && node && actions.canAct(node) && /* @__PURE__ */ jsx5(
      ContextMenuContent,
      {
        className: "w-40",
        "aria-label": labels.sessionActions,
        "data-testid": "session-tree-menu",
        "data-node-id": node.id,
        onCloseAutoFocus: (event) => {
          event.preventDefault(), actions.dialogOpening() || onRestoreFocus();
        },
        children: /* @__PURE__ */ jsx5(MenuItems, { node, actions, labels })
      }
    )
  ] });
}

// src/page/graph-canvas.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var MIN_ZOOM = 0.3, MAX_ZOOM = 2.5, VISIBLE_ONLY_ABOVE = 150, OUT_OF_SCOPE_TIP = "Outside this project — switch to All projects to edit", STANDIN_TIP = "Parent not loaded — deleted, hidden or outside the loaded sessions", TOOLTIP_DELAY_MS = 350;
function isTypingTarget(target) {
  return !!target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}
function GraphCanvas(props) {
  let { style: style2, spec, model, positions, labels, selectedId, onSelect, onMove, onDragging, onOpen, statusOf, snap, nowMs, initialViewport, onViewport } = props, [mountViewport] = useState4(initialViewport), ctx = usePluginCtx(), wrapper = useRef2(null), [drag2, setDrag] = useState4(), actions = useSessionActions(), [tooltip, setTooltip] = useState4(), spaceDown = useRef2(!1), [spaceHeld, setSpaceHeld] = useState4(!1), tooltipTimer = useRef2(void 0), shown = useMemo3(() => new Set(laidOutFamilies(model, spec).flatMap((family) => family.nodeIds)), [model, spec]), lineage = useMemo3(() => lineageOf(model, selectedId), [model, selectedId]), rects = useMemo3(() => {
    let out = /* @__PURE__ */ new Map();
    for (let id2 of shown) {
      let point = positions.get(id2);
      point && out.set(id2, rectOf(id2, point, spec));
    }
    return out;
  }, [shown, positions, spec]), routes = useMemo3(() => {
    let ends = model.edges.filter((edge) => rects.has(edge.source) && rects.has(edge.target)).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, ...style2.ports(edge.kind, rects.get(edge.source), rects.get(edge.target)) })), routed = routeLinks(ends, rects, style2.router), out = /* @__PURE__ */ new Map();
    for (let end of ends)
      out.set(end.id, { from: end.from, to: end.to, route: routed.get(end.id) });
    return out;
  }, [model, rects, style2]), baseNodes = useMemo3(() => {
    let { width, height } = style2.nodeSize, handles = blockHandles(width, height, style2.resetPortX), nodes2 = [], projectById = new Map(model.projects.map((project) => [project.id, project])), noProject = model.projects.find((project) => project.isNoProject);
    for (let label of labels) {
      let point = positions.get(label.id), project = label.projectId ? projectById.get(label.projectId) : noProject;
      point && nodes2.push({
        id: label.id,
        type: style2.nodeType.group,
        position: point,
        data: {
          project,
          label: project?.label ?? "No project",
          dimmed: model.options.scope !== "all" && (label.projectId ?? "__no_project__") !== model.options.scope
        },
        draggable: !1,
        selectable: !1,
        focusable: !1,
        connectable: !1,
        width: LABEL_WIDTH,
        height: spec.labelHeight,
        measured: { width: LABEL_WIDTH, height: spec.labelHeight },
        className: "session-tree__group-node",
        zIndex: -1
      });
    }
    for (let node of model.nodes) {
      let point = positions.get(node.id);
      !point || !shown.has(node.id) || nodes2.push({
        id: node.id,
        type: node.kind === "standin" ? style2.nodeType.standin : style2.nodeType.session,
        position: point,
        data: {
          node,
          status: statusOf(node),
          project: node.projectId ? projectById.get(node.projectId) : void 0,
          inLineage: lineage.has(node.id) && node.id !== selectedId,
          nowMs
        },
        draggable: style2.draggable && !node.readOnly,
        selectable: !node.readOnly,
        connectable: !1,
        selected: node.id === selectedId && !node.readOnly,
        width,
        height,
        measured: { width, height },
        handles
      });
    }
    return nodes2;
  }, [model, positions, labels, shown, style2, spec, statusOf, lineage, selectedId, nowMs]), nodes = useMemo3(() => {
    let moved = drag2 ? baseNodes.map((node) => drag2.has(node.id) ? { ...node, position: drag2.get(node.id), dragging: !0 } : node) : baseNodes;
    return spaceHeld ? moved.map((node) => node.draggable ? { ...node, draggable: !1 } : node) : moved;
  }, [baseNodes, drag2, spaceHeld]), edges = useMemo3(
    () => model.edges.filter((edge) => shown.has(edge.source) && shown.has(edge.target)).map((edge) => {
      let source = model.nodeById.get(edge.source), target = model.nodeById.get(edge.target);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...edge.kind === "reset" ? { sourceHandle: "down", targetHandle: "up" } : {},
        type: style2.edgeType,
        selectable: !1,
        focusable: !1,
        data: {
          kind: edge.kind,
          fromStandin: edge.fromStandin,
          highlighted: lineage.has(edge.source) && lineage.has(edge.target),
          dimmed: !!(source?.outOfScope && target?.outOfScope),
          route: routes.get(edge.id)
        }
      };
    }),
    [model, shown, style2, lineage, routes]
  ), nodeTypes = style2.nodeTypes, edgeTypes = style2.edgeTypes, hideTooltip = useCallback3(() => {
    tooltipTimer.current?.(), tooltipTimer.current = void 0, setTooltip(void 0);
  }, []), onNodesChange = useCallback3((changes) => {
    let moves = changes.filter(
      (change) => change.type === "position" && !!change.position && change.dragging === !0
    );
    moves.length > 0 && setDrag((previous) => {
      let next = new Map(previous);
      for (let move of moves)
        next.set(move.id, move.position);
      return next;
    });
  }, []), onNodeDragStart = useCallback3(
    (_event, _node, dragged) => {
      hideTooltip(), onDragging(dragged.map((item) => item.id).filter((id2) => !id2.startsWith(GROUP_PREFIX)));
    },
    [hideTooltip, onDragging]
  ), onNodeDragStop = useCallback3(
    (_event, _node, dragged) => {
      let moves = /* @__PURE__ */ new Map();
      for (let item of dragged)
        item.id.startsWith(GROUP_PREFIX) || moves.set(item.id, { x: item.position.x, y: item.position.y });
      setDrag(void 0), moves.size > 0 && onMove(moves), onDragging(null);
    },
    [onMove, onDragging]
  ), graphNode = useCallback3((flowNode) => model.nodeById.get(flowNode.id), [model]), onNodeClick = useCallback3(
    (_event, flowNode) => {
      let node = graphNode(flowNode);
      node && !node.readOnly && onSelect(node.id);
    },
    [graphNode, onSelect]
  ), onNodeDoubleClick = useCallback3(
    (_event, flowNode) => {
      let node = graphNode(flowNode);
      node && !node.readOnly && node.kind === "session" && onOpen(node);
    },
    [graphNode, onOpen]
  ), onNodeContextMenu = useCallback3(() => hideTooltip(), [hideTooltip]), onMoveEnd = useCallback3((_event, viewport) => onViewport(viewport), [onViewport]), onMenuOpen = useCallback3(
    (node) => {
      hideTooltip(), onSelect(node.id);
    },
    [hideTooltip, onSelect]
  ), restoreFocus = useCallback3(() => {
    let attempt = () => {
      let active = document.activeElement;
      (!active || active === document.body) && wrapper.current?.focus({ preventScroll: !0 });
    };
    wrapper.current?.focus({ preventScroll: !0 });
    for (let ms of [0, 50, 150, 400])
      ctx.setTimeout(attempt, ms);
  }, [ctx]);
  useEffect2(() => (actions?.setMenuHost(wrapper.current), () => actions?.setMenuHost(null)), [actions]);
  let onNodeMouseEnter = useCallback3(
    (event, flowNode) => {
      let node = graphNode(flowNode), target = event.currentTarget;
      !node || !wrapper.current || (tooltipTimer.current?.(), tooltipTimer.current = ctx.setTimeout(() => {
        if (!wrapper.current || !target.isConnected)
          return;
        let box = wrapper.current.getBoundingClientRect(), rect = target.getBoundingClientRect(), text = node.kind === "standin" ? STANDIN_TIP : node.outOfScope ? OUT_OF_SCOPE_TIP : node.title;
        setTooltip({ text, nodeId: node.id, x: rect.left - box.left, y: rect.bottom - box.top + 6 });
      }, TOOLTIP_DELAY_MS));
    },
    [ctx, graphNode]
  );
  return useEffect2(() => {
    let element = wrapper.current;
    if (!element)
      return;
    let middle = (event) => {
      event.button === 1 && event.preventDefault();
    }, releaseSelect = (target = document.activeElement) => {
      let element2 = target;
      return element2 instanceof HTMLSelectElement && element2.closest('[data-testid="session-tree-toolbar"]') ? (element2.blur(), !0) : !1;
    }, offs = [
      ctx.addEventListener(element, "mousedown", middle, !0),
      ctx.addEventListener(element, "mouseup", middle, !0),
      ctx.addEventListener(element, "auxclick", middle, !0),
      ctx.addEventListener(
        element,
        "pointerdown",
        (event) => {
          let pointer2 = event, target = pointer2.target;
          releaseSelect(), !(pointer2.button !== 0 || spaceDown.current || !target) && target.closest(".react-flow__pane") && !target.closest(".react-flow__node") && onSelect(null);
        },
        !0
      ),
      ctx.addEventListener(
        window,
        "keydown",
        (event) => {
          if (event.code === "Space") {
            if (releaseSelect(event.target)) {
              event.preventDefault(), event.stopPropagation(), document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: !0 }));
              return;
            } else if (isTypingTarget(event.target))
              return;
            spaceDown.current = !0, setSpaceHeld(!0);
          }
        },
        !0
      ),
      ctx.addEventListener(window, "keyup", (event) => {
        event.code === "Space" && (spaceDown.current = !1, setSpaceHeld(!1));
      }),
      ctx.addEventListener(window, "blur", () => {
        spaceDown.current = !1, setSpaceHeld(!1);
      })
    ];
    return () => offs.forEach((off) => off());
  }, [ctx, onSelect]), useEffect2(() => () => tooltipTimer.current?.(), []), /* @__PURE__ */ jsx6(SessionMenu, { model, onOpenFor: onMenuOpen, onRestoreFocus: restoreFocus, children: /* @__PURE__ */ jsxs6(
    "div",
    {
      ref: wrapper,
      tabIndex: -1,
      className: `session-tree__canvas${snap ? " has-grid" : ""}`,
      "data-testid": "session-tree-canvas",
      "data-style": style2.id,
      "data-snap": snap ? "on" : "off",
      "data-grid": style2.grid,
      children: [
        /* @__PURE__ */ jsx6(
          index,
          {
            nodes,
            edges,
            nodeTypes,
            edgeTypes,
            onNodesChange,
            onNodeDragStart,
            onNodeDragStop,
            onNodeClick,
            onNodeDoubleClick,
            onNodeContextMenu,
            onNodeMouseEnter,
            onNodeMouseLeave: hideTooltip,
            onMoveStart: hideTooltip,
            panOnDrag: [1],
            panActivationKeyCode: "Space",
            zoomOnScroll: !0,
            panOnScroll: !1,
            zoomOnDoubleClick: !1,
            zoomOnPinch: !0,
            selectionOnDrag: !1,
            selectionKeyCode: null,
            multiSelectionKeyCode: null,
            deleteKeyCode: null,
            nodesConnectable: !1,
            nodesFocusable: !1,
            edgesFocusable: !1,
            elevateNodesOnSelect: !1,
            snapToGrid: snap,
            snapGrid: [style2.grid, style2.grid],
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
            onlyRenderVisibleElements: nodes.length > VISIBLE_ONLY_ABOVE,
            fitView: !mountViewport,
            fitViewOptions: { padding: 0.08, maxZoom: 1.25 },
            defaultViewport: mountViewport,
            onMoveEnd,
            proOptions: { hideAttribution: !0 },
            children: snap && /* @__PURE__ */ jsx6(Background, { variant: BackgroundVariant.Dots, gap: style2.grid, size: 1.3 })
          }
        ),
        tooltip && /* @__PURE__ */ jsx6(
          "div",
          {
            className: "session-tree__tooltip",
            role: "tooltip",
            "data-testid": "session-tree-tooltip",
            "data-node-id": tooltip.nodeId,
            style: { left: tooltip.x, top: tooltip.y },
            children: tooltip.text
          }
        )
      ]
    }
  ) });
}

// src/page/session-actions.tsx
init_define_import_meta_env();
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  host as host2,
  Input,
  isSubmitEnter,
  randomUuid
} from "@hermes/plugin-sdk";
import { useEffect as useEffect3, useMemo as useMemo4, useRef as useRef3, useState as useState5 } from "react";
import { Fragment as Fragment5, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var errorText = (error) => restErrorText(error), rpcReason = (error) => error?.data?.reason;
function useRowOverrides(serverRows) {
  let [overrides, setOverrides] = useState5(() => /* @__PURE__ */ new Map()), [settledFor, setSettledFor] = useState5(serverRows);
  return settledFor !== serverRows && (setSettledFor(serverRows), overrides.size > 0 && setOverrides(settleOverrides(serverRows, overrides))), [overrides, setOverrides];
}
function useSessionActionsController(options) {
  let labels = useMenuLabels(), { setOverrides } = options, [colors, setColors] = useState5(() => /* @__PURE__ */ new Map()), [renaming, setRenaming] = useState5(), [deleting, setDeleting] = useState5(), [mutate] = useState5(() => createFencedMutation(randomUuid)), [branchFlights] = useState5(
    () => createBranchFlights((method, params) => host2.request(method, params), randomUuid)
  ), [branchCooldown] = useState5(() => createBranchCooldown(BRANCH_COOLDOWN_MS)), latest = useRef3({ options, labels, colors }), menuHost = useRef3(null), requestedMenuNode = useRef3(null), dialogFromMenu = useRef3(!1);
  useEffect3(() => {
    latest.current = { options, labels, colors };
  });
  let actions = useMemo4(() => {
    let patch = (id2, override) => setOverrides((previous) => new Map(previous).set(id2, { ...previous.get(id2), ...override })), unpatch = (id2) => setOverrides((previous) => {
      if (!previous.has(id2))
        return previous;
      let next = new Map(previous);
      return next.delete(id2), next;
    }), rowOf = (node) => {
      if (!isActionable(node))
        throw new Error("Not available on this block");
      return node.row;
    }, notifyError = (error, fallback) => host2.notify({ kind: "error", title: fallback, message: errorText(error) });
    return {
      canAct: (node) => isActionable(node),
      statusOf: (node) => latest.current.options.statusOf(node),
      branchCount: (node) => latest.current.options.model.childrenOf.get(node.id)?.length ?? 0,
      moveTargets: (node) => moveTargets(latest.current.options.model.projects, node.projectId),
      colorOf: (node) => latest.current.colors.get(node.row?.id ?? node.id) ?? null,
      rename(node) {
        isActionable(node) && setRenaming(node);
      },
      togglePin(node) {
        let row = rowOf(node), pinned = !row.pinned;
        host2.sessions.pin(row.id, pinned), patch(row.id, { pinned });
      },
      async toggleUnread(node) {
        let row = rowOf(node), unread = !row.unread;
        patch(row.id, { unread });
        try {
          await mutate(
            JSON.stringify(["read", node.profile, row.id, unread]),
            () => fetchMutationSnapshot(latest.current.options.ctx, node.profile, row.id),
            (identity4) => postReadState(latest.current.options.ctx, node.profile, row.id, unread, identity4)
          ), latest.current.options.refreshSessions();
        } catch (error) {
          unpatch(row.id), notifyError(error, latest.current.labels.unreadFailed);
        }
      },
      setColor(node, color2) {
        let row = rowOf(node);
        host2.sessions.setColor(row.id, color2), setColors((previous) => new Map(previous).set(row.id, color2));
      },
      copied() {
        host2.notify({ kind: "success", message: "Session ID copied", durationMs: 2e3 });
      },
      copyFailed(error) {
        notifyError(error, latest.current.labels.copyIdFailed);
      },
      async branch(node) {
        let row = rowOf(node), joined = !1;
        if (!branchCooldown.blocks(row.id))
          try {
            let started = branchFlights({ parentId: row.id, profile: node.profile, cwd: row.cwd });
            joined = started.joined;
            let result = await started.flight;
            if (joined)
              return;
            let child = result?.stored_session_id;
            if (!child)
              throw new Error("The gateway returned no branch id");
            result.session_id && result.session_id !== child && await host2.request("session.close", { session_id: result.session_id }).catch(() => {
            }), branchCooldown.branched(child), latest.current.options.onBranched(child), latest.current.options.refreshSessions(), host2.notify({ kind: "success", message: `Branched “${node.title}”`, durationMs: 2e3 });
          } catch (error) {
            joined || notifyError(error, "Could not branch session");
          }
      },
      async exportSession(node) {
        let row = rowOf(node);
        try {
          let bytes = decodeExportEnvelope(await fetchExport(latest.current.options.ctx, node.profile, row.id)), url = URL.createObjectURL(new Blob([bytes], { type: "application/json" })), anchor = document.createElement("a");
          anchor.href = url, anchor.download = exportFilename(row.id, node.title), anchor.click(), latest.current.options.ctx.setTimeout(() => URL.revokeObjectURL(url), 1e3), host2.notify({ kind: "success", message: latest.current.labels.exported, durationMs: 2e3 });
        } catch (error) {
          notifyError(error, latest.current.labels.exportFailed);
        }
      },
      async moveTo(node, project) {
        let row = rowOf(node), cwd = projectRootCwd(project);
        try {
          if (!cwd)
            throw new Error("That project has no folder");
          await host2.request("session.workspace.move", { session_key: row.id, cwd, profile: node.profile }).catch((error) => {
            throw rpcReason(error) === "session_busy" ? new Error("The session is running; move it when it is idle") : error;
          }), latest.current.options.onMoved(node.id), latest.current.options.refreshSessions(), latest.current.options.refreshProjects(), host2.notify({ kind: "success", message: latest.current.labels.movedTo(project.label), durationMs: 2e3 });
        } catch (error) {
          notifyError(error, latest.current.labels.moveFailed);
        }
      },
      async toggleArchive(node) {
        let row = rowOf(node), archived = !row.archived;
        patch(row.id, archived ? { archived, pinned: !1 } : { archived });
        try {
          await mutate(
            JSON.stringify(["archive", node.profile, row.id, archived]),
            () => fetchMutationSnapshot(latest.current.options.ctx, node.profile, row.id),
            (identity4) => postArchive(latest.current.options.ctx, node.profile, row.id, archived, identity4)
          ), latest.current.options.refreshSessions(), host2.notify({ kind: "success", message: archived ? `Archived “${node.title}”` : `Unarchived “${node.title}”`, durationMs: 2e3 });
        } catch (error) {
          unpatch(row.id), notifyError(error, archived ? "Could not archive session" : "Could not unarchive session");
        }
      },
      remove(node) {
        isActionable(node) && setDeleting(node);
      },
      openMenuFor(nodeId, anchor) {
        let target = menuHost.current;
        if (!target)
          return;
        let rect = anchor.getBoundingClientRect();
        requestedMenuNode.current = nodeId, target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: !0, cancelable: !0, button: 2, clientX: rect.left, clientY: rect.bottom + 2 }));
      },
      setMenuHost(element) {
        menuHost.current = element;
      },
      takeRequestedMenuNode() {
        let id2 = requestedMenuNode.current;
        return requestedMenuNode.current = null, id2;
      },
      dialogOpening() {
        let opening = dialogFromMenu.current;
        return dialogFromMenu.current = !1, opening;
      },
      noteDialogFromMenu() {
        dialogFromMenu.current = !0;
      }
    };
  }, [branchFlights, branchCooldown, mutate, setOverrides]), backendRename = async (node, title) => {
    let row = node.row, { ctx } = latest.current.options;
    return (await mutate(
      JSON.stringify(["rename", node.profile, row.id, title]),
      () => fetchMutationSnapshot(ctx, node.profile, row.id),
      (identity4) => postRename(ctx, node.profile, row.id, title, identity4)
    ))?.title;
  }, dialogs = /* @__PURE__ */ jsxs7(Fragment5, { children: [
    /* @__PURE__ */ jsx7(
      RenameDialog,
      {
        node: renaming,
        labels,
        onClose: () => setRenaming(void 0),
        onSubmit: async (node, title) => {
          let row = node.row, route = renameRoute(row, latest.current.options.runtime, title), finalTitle = title;
          if (route.kind === "rpc")
            try {
              finalTitle = (await host2.request("session.title", { session_id: route.runtimeId, title }))?.title ?? title;
            } catch {
              finalTitle = await backendRename(node, title) ?? title;
            }
          else
            finalTitle = await backendRename(node, title) ?? title;
          setOverrides((previous) => new Map(previous).set(row.id, { ...previous.get(row.id), title: finalTitle || null })), latest.current.options.refreshSessions(), host2.notify({ kind: "success", message: labels.renamed, durationMs: 2e3 });
        }
      },
      renaming?.id ?? "none"
    ),
    /* @__PURE__ */ jsx7(
      DeleteDialog,
      {
        node: deleting,
        labels,
        branches: deleting ? options.model.childrenOf.get(deleting.id)?.length ?? 0 : 0,
        blocked: deleting ? deleteBlockedReason(options.statusOf(deleting)) : void 0,
        onClose: () => setDeleting(void 0),
        onConfirm: async (node) => {
          let row = node.row, blocked = deleteBlockedReason(latest.current.options.statusOf(node));
          if (blocked)
            throw new Error(blocked);
          await mutate(
            JSON.stringify(["delete", node.profile, row.id]),
            () => fetchMutationSnapshot(latest.current.options.ctx, node.profile, row.id),
            (identity4) => postDelete(latest.current.options.ctx, node.profile, row.id, identity4)
          ).catch((error) => {
            if (!isAlreadyAbsent(error))
              throw new Error(errorText(error));
          }), setOverrides((previous) => new Map(previous).set(row.id, { removed: !0 })), latest.current.options.onRemoved(node.id), latest.current.options.refreshSessions();
        }
      }
    )
  ] });
  return { actions, dialogs };
}
function RenameDialog({
  node,
  labels,
  onClose,
  onSubmit
}) {
  let current = node?.row?.title ?? "", [value2, setValue] = useState5(current), [busy, setBusy] = useState5(!1), [error, setError] = useState5(null), submit = async () => {
    if (!node || busy)
      return;
    let next = value2.trim();
    if (next === current.trim()) {
      onClose();
      return;
    }
    setBusy(!0), setError(null);
    try {
      await onSubmit(node, next), onClose();
    } catch (err) {
      setError(errorText(err)), host2.notify({ kind: "error", title: labels.renameFailed, message: errorText(err) });
    } finally {
      setBusy(!1);
    }
  };
  return /* @__PURE__ */ jsx7(Dialog, { open: !!node, onOpenChange: (open) => !open && !busy && onClose(), children: /* @__PURE__ */ jsxs7(DialogContent, { className: "max-w-md", "data-testid": "session-tree-rename-dialog", "data-node-id": node?.id, children: [
    /* @__PURE__ */ jsx7(DialogHeader, { children: /* @__PURE__ */ jsx7(DialogTitle, { children: labels.renameTitle }) }),
    /* @__PURE__ */ jsx7(
      Input,
      {
        autoFocus: !0,
        "aria-label": labels.renameTitle,
        "data-testid": "session-tree-rename-input",
        disabled: busy,
        placeholder: labels.untitledPlaceholder,
        value: value2,
        onChange: (event) => setValue(event.target.value),
        onKeyDown: (event) => {
          isSubmitEnter(event) && (event.preventDefault(), submit());
        }
      }
    ),
    error && /* @__PURE__ */ jsx7("div", { className: "st-dialog-error", role: "alert", "data-testid": "session-tree-rename-error", children: error }),
    /* @__PURE__ */ jsxs7(DialogFooter, { children: [
      /* @__PURE__ */ jsx7(Button, { type: "button", variant: "ghost", disabled: busy, onClick: onClose, children: labels.cancel }),
      /* @__PURE__ */ jsx7(Button, { type: "button", disabled: busy, "data-testid": "session-tree-rename-save", onClick: () => {
        submit();
      }, children: labels.save })
    ] })
  ] }) });
}
function DeleteDialog({
  node,
  labels,
  branches,
  blocked,
  onClose,
  onConfirm
}) {
  let note = branchNote(branches), description = node ? [labels.deleteDesc(node.title), note, blocked ?? ""].filter(Boolean).join(`
`) : "";
  return /* @__PURE__ */ jsx7(
    ConfirmDialog,
    {
      open: !!node,
      title: labels.deleteTitle,
      description: /* @__PURE__ */ jsx7("span", { "data-testid": "session-tree-delete-text", children: description }),
      confirmLabel: labels.delete,
      busyLabel: labels.deleting,
      doneLabel: labels.deleted,
      cancelLabel: labels.cancel,
      destructive: !0,
      onClose,
      onConfirm: () => node ? onConfirm(node) : void 0
    }
  );
}

// src/page/services.ts
init_define_import_meta_env();
import { host as host3 } from "@hermes/plugin-sdk";
import { useCallback as useCallback4, useSyncExternalStore } from "react";

// src/model/layout-sync.ts
init_define_import_meta_env();
var RETRY_MS = [1e3, 2e3, 5e3, 5e3, 1e4], POLL_MS = 5e3, CACHE_KEY = "layoutCache.v1", PENDING_KEY = "layoutPending.v1", BATCH_LIMIT = 1e3, EMPTY_SETTINGS = { style: null, snap: !1 };
var sameRef = (a, b) => a.profile === b.profile && a.style === b.style && a.scope === b.scope;
function isRefusal(error) {
  let match = /^(\d{3}): /.exec(error instanceof Error ? error.message : String(error ?? ""));
  return !!(match && ["400", "409", "413", "422"].includes(match[1]));
}
var LayoutSync = class {
  profiles = /* @__PURE__ */ new Map();
  pending;
  listeners = /* @__PURE__ */ new Set();
  watched = /* @__PURE__ */ new Map();
  dragging = /* @__PURE__ */ new Set();
  cancelFlush;
  flushing = !1;
  failures = 0;
  /** Bumps when an acknowledged write changes the snapshot: a fetch begun before it is stale. */
  writeSeq = 0;
  disposed = !1;
  version = 0;
  transport;
  storage;
  timers;
  options;
  constructor(transport, storage, timers, options = {}) {
    this.transport = transport, this.storage = storage, this.timers = timers, this.options = options, this.pending = (storage.get(PENDING_KEY, null) ?? []).filter(isOp), this.pending.length > 0 && this.schedule(0);
  }
  // --- subscription -------------------------------------------------------------------------
  /** Called after every change a reader can see (positions, settings, status). */
  subscribe(listener) {
    return this.listeners.add(listener), () => this.listeners.delete(listener);
  }
  /** Bumps on every visible change: a cheap memo key for React. */
  get changeVersion() {
    return this.version;
  }
  emit() {
    this.version += 1;
    for (let listener of [...this.listeners])
      listener();
  }
  // --- reads --------------------------------------------------------------------------------
  profile(profile) {
    let state = this.profiles.get(profile);
    if (!state) {
      let cached = this.storage.get(`${CACHE_KEY}:${profile}`, null);
      state = { server: isSnapshot(cached) ? cached : null, settled: !1, status: "loading" }, this.profiles.set(profile, state);
    }
    return state;
  }
  status(profile) {
    return this.profile(profile).status;
  }
  /** The store revision of this window's snapshot of `profile` (`null`: none yet). */
  revision(profile) {
    return this.profile(profile).server?.rev ?? null;
  }
  /** Whether the page may lay out: a fetch answered or failed (then the cache, or nothing). */
  settled(profile) {
    return this.profile(profile).settled;
  }
  /** Whether this profile's layouts come from the cache because the backend is unreachable. */
  offline(profile) {
    return this.profile(profile).status === "offline";
  }
  /** The synced settings as this window has them (its own unsent changes included). */
  settings(profile) {
    let base = { ...this.profile(profile).server?.settings ?? this.anySettings() };
    for (let op of this.pending)
      op.kind === "settings" && Object.assign(base, op.patch);
    return base;
  }
  /** Settings are global: any profile's snapshot holds them. */
  anySettings() {
    let best = null;
    for (let state of this.profiles.values())
      state.server && (!best || state.server.rev > best.rev) && (best = state.server);
    return best?.settings ?? EMPTY_SETTINGS;
  }
  /** The positions of one layout: the server's, this window's unsent changes on top. */
  positions(ref) {
    let stored = this.profile(ref.profile).server?.layouts[ref.style]?.[ref.scope] ?? {}, out = new Map(Object.entries(stored).map(([id2, entry]) => [id2, { x: entry.x, y: entry.y }]));
    for (let op of this.pending)
      (op.kind === "forget" ? op.profile === ref.profile : op.kind !== "settings" && sameRef(op.ref, ref)) && applyOp(out, op);
    return out;
  }
  // --- local changes ------------------------------------------------------------------------
  /**
   * Lay out against the stored positions and keep what the layout placed. Called while the page
   * renders, so it never notifies; new placements are queued as `if_absent` (`save: false` for a
   * style that saves nothing, Swimlanes).
   */
  place(ref, compute, { save = !0 } = {}) {
    let previous = this.positions(ref), result = compute(previous.size > 0 ? previous : void 0);
    if (!save)
      return result;
    let placed = [];
    for (let [id2, point] of result.positions)
      previous.has(id2) || placed.push([id2, { x: point.x, y: point.y }]);
    return placed.length > 0 && this.queue({ kind: "upsert", ref, mode: "if_absent", entries: placed }, !1), result;
  }
  /** A drop: these blocks now sit here. */
  drop(ref, moves) {
    moves.size !== 0 && this.queue({ kind: "upsert", ref, mode: "set", entries: [...moves].map(([id2, point]) => [id2, { x: point.x, y: point.y }]) }, !0);
  }
  /** Re-arrange: forget this layout. Answers what was shown, for Undo. */
  rearrange(ref) {
    let previous = this.positions(ref);
    return this.queue({ kind: "replace", ref, entries: null }, !0), previous;
  }
  /** Undo of a Re-arrange: the layout becomes `previous` again. */
  restore(ref, previous) {
    this.queue({ kind: "replace", ref, entries: [...previous].map(([id2, point]) => [id2, { x: point.x, y: point.y }]) }, !0);
  }
  /**
   * A block moved to another project: forget its stored spot in every layout of the profile (here
   * and on the server), so each layout places it anew in its new band.
   */
  forget(profile, id2) {
    this.queue({ kind: "forget", profile, ids: [id2] }, !0);
  }
  setSettings(profile, patch) {
    this.queue({ kind: "settings", profile, patch }, !0);
  }
  /** While blocks are dragged nothing is sent, and a refresh keeps their spots. */
  setDragging(ids) {
    let was = this.dragging.size > 0;
    this.dragging = new Set(ids ?? []), was && this.dragging.size === 0 && this.pending.length > 0 && this.schedule(this.options.debounceMs ?? 300);
  }
  get isDragging() {
    return this.dragging.size > 0;
  }
  queue(op, notify) {
    this.pending.push(op), this.persistPending(), this.schedule(this.options.debounceMs ?? 300), notify && this.emit();
  }
  persistPending() {
    this.storage.set(PENDING_KEY, this.pending);
  }
  /** (Re)starts the flush timer: trailing debounce, so a burst of drops goes out as one batch. */
  schedule(ms) {
    this.disposed || (this.cancelFlush?.(), this.cancelFlush = this.timers.setTimeout(() => {
      this.cancelFlush = void 0, this.flush();
    }, ms));
  }
  // --- sending ------------------------------------------------------------------------------
  /** Sends the queue in order; consecutive upserts of one layout and mode go as one request. */
  async flush() {
    if (!(this.flushing || this.disposed) && !(this.dragging.size > 0)) {
      this.flushing = !0;
      try {
        for (; this.pending.length > 0 && this.dragging.size === 0 && !this.disposed; ) {
          let [op, count] = this.nextBatch();
          try {
            await this.send(op), this.ack(op), this.pending.splice(0, count), this.persistPending(), this.failures = 0, this.markOnline(opProfile(op));
          } catch (error) {
            if (isRefusal(error)) {
              this.pending.splice(0, count), this.persistPending(), this.options.onRefused?.(error), this.emit();
              continue;
            }
            this.markOffline(opProfile(op)), this.retry();
            return;
          }
        }
      } finally {
        this.flushing = !1;
      }
      this.pending.length > 0 && this.dragging.size === 0 && this.schedule(0);
    }
  }
  /** The first pending op merged with the consecutive upserts of the same layout and mode. */
  nextBatch() {
    let first = this.pending[0];
    if (first.kind !== "upsert")
      return [first, 1];
    let merged = new Map(first.entries), count = 1;
    for (; count < this.pending.length; ) {
      let next = this.pending[count];
      if (next.kind !== "upsert" || next.mode !== first.mode || !sameRef(next.ref, first.ref) || merged.size + next.entries.length > BATCH_LIMIT)
        break;
      for (let [id2, point] of next.entries)
        (first.mode === "set" || !merged.has(id2)) && merged.set(id2, point);
      count += 1;
    }
    return [{ ...first, entries: [...merged] }, count];
  }
  async send(op) {
    if (op.kind === "settings")
      await this.transport.patchSettings(op.profile, op.patch);
    else if (op.kind === "forget")
      await this.transport.forgetBlocks(op.profile, op.ids);
    else if (op.kind === "upsert")
      for (let start2 = 0; start2 < op.entries.length; start2 += BATCH_LIMIT)
        await this.transport.patchPositions(op.ref.profile, {
          style: op.ref.style,
          scope: op.ref.scope,
          mode: op.mode,
          positions: op.entries.slice(start2, start2 + BATCH_LIMIT).map(([id2, point]) => ({ id: id2, x: point.x, y: point.y }))
        });
    else op.entries === null ? await this.transport.deleteLayout(op.ref.profile, op.ref.style, op.ref.scope) : await this.transport.putLayout(op.ref.profile, {
      style: op.ref.style,
      scope: op.ref.scope,
      positions: op.entries.map(([id2, point]) => ({ id: id2, x: point.x, y: point.y }))
    });
  }
  /** The server applied `op`: fold it into the snapshot this window keeps (the next fetch corrects it). */
  ack(op) {
    let now2 = Date.now() / 1e3;
    if (this.writeSeq += 1, op.kind === "settings") {
      for (let state2 of this.profiles.values())
        state2.server && (state2.server = { ...state2.server, settings: { ...state2.server.settings, ...op.patch } });
      return;
    }
    let state = this.profile(opProfile(op)), server = state.server ?? { schema: 1, rev: 0, settings: this.anySettings(), layouts: {} }, refs = op.kind === "forget" ? Object.entries(server.layouts).flatMap(([style2, scopes]) => Object.keys(scopes).map((scope) => ({ profile: op.profile, style: style2, scope }))) : [op.ref];
    for (let ref of refs) {
      let scopes = server.layouts[ref.style] ??= {}, current = new Map(Object.entries(scopes[ref.scope] ?? {}).map(([id2, entry]) => [id2, { x: entry.x, y: entry.y }]));
      applyOp(current, op), current.size === 0 ? delete scopes[ref.scope] : scopes[ref.scope] = Object.fromEntries([...current].map(([id2, point]) => [id2, { ...point, updated_at: now2 }])), Object.keys(scopes).length === 0 && delete server.layouts[ref.style];
    }
    state.server = server, this.cache(opProfile(op));
  }
  retry() {
    let ms = RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)];
    this.failures += 1, this.schedule(ms);
  }
  markOnline(profile) {
    let state = this.profile(profile);
    state.status !== "online" && (state.status = "online", state.settled = !0, this.emit());
  }
  markOffline(profile) {
    let state = this.profile(profile);
    (state.status !== "offline" || !state.settled) && (state.status = "offline", state.settled = !0, this.emit());
  }
  cache(profile) {
    let server = this.profile(profile).server;
    server && this.storage.set(`${CACHE_KEY}:${profile}`, server);
  }
  // --- fetching -----------------------------------------------------------------------------
  /** Fetch (or re-check) one profile's state. A failure leaves the cache in place, offline. */
  async refresh(profile) {
    if (this.disposed)
      return;
    let state = this.profile(profile), known = state.settled && state.status === "online" ? state.server?.rev : void 0, seq = this.writeSeq;
    try {
      let answer = await this.transport.getState(profile, known);
      if (seq !== this.writeSeq) {
        this.refresh(profile);
        return;
      }
      "unchanged" in answer || (state.server = answer, this.cache(profile));
      let wasOnline = state.status === "online", changed = !("unchanged" in answer) || !wasOnline || !state.settled;
      state.status = "online", state.settled = !0, !wasOnline && this.pending.length > 0 && !this.flushing && (this.failures = 0, this.schedule(0)), changed && this.emit();
    } catch {
      this.markOffline(profile), this.watched.has(profile) && this.retryRefresh(profile);
    }
  }
  refreshTimers = /* @__PURE__ */ new Map();
  retryRefresh(profile) {
    if (this.refreshTimers.has(profile) || this.disposed)
      return;
    let ms = RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)];
    this.refreshTimers.set(
      profile,
      this.timers.setTimeout(() => {
        this.refreshTimers.delete(profile), this.refresh(profile);
      }, ms)
    );
  }
  /** A page or settings view shows `profile`: load it now, and poll / follow pushes for it. */
  watch(profile) {
    return this.watched.set(profile, (this.watched.get(profile) ?? 0) + 1), (!this.profile(profile).settled || this.profile(profile).status !== "online") && this.refresh(profile), () => {
      let count = (this.watched.get(profile) ?? 1) - 1;
      count <= 0 ? this.watched.delete(profile) : this.watched.set(profile, count);
    };
  }
  /** The poll: every watched profile, cheaply (`since_rev`). */
  poll() {
    for (let profile of this.watched.keys())
      this.refresh(profile);
  }
  /** A push from the backend: refresh what it touched, unless this window already has it. */
  onRemoteChange(payload) {
    let { rev, profile } = payload ?? {};
    for (let name of this.watched.keys()) {
      let known = this.profile(name).server?.rev ?? -1;
      typeof rev == "number" && rev <= known || (profile === "*" || profile === name || typeof profile != "string") && this.refresh(name);
    }
  }
  dispose() {
    this.disposed = !0, this.cancelFlush?.();
    for (let cancel of this.refreshTimers.values())
      cancel();
    this.refreshTimers.clear(), this.listeners.clear();
  }
  /** Test and debug view: what is still waiting to be sent. */
  get pendingCount() {
    return this.pending.length;
  }
};
function applyOp(target, op) {
  if (op.kind === "forget") {
    for (let id2 of op.ids)
      target.delete(id2);
    return;
  }
  if (op.kind === "replace") {
    target.clear();
    for (let [id2, point] of op.entries ?? [])
      target.set(id2, point);
    return;
  }
  for (let [id2, point] of op.entries)
    (op.mode === "set" || !target.has(id2)) && target.set(id2, point);
}
function opProfile(op) {
  return op.kind === "settings" || op.kind === "forget" ? op.profile : op.ref.profile;
}
function isSnapshot(value2) {
  let snapshot = value2;
  return !!(snapshot && typeof snapshot.rev == "number" && snapshot.settings && typeof snapshot.layouts == "object" && snapshot.layouts);
}
function isOp(value2) {
  let op = value2;
  return !op || typeof op != "object" ? !1 : op.kind === "settings" ? typeof op.profile == "string" && !!op.patch : op.kind === "forget" ? typeof op.profile == "string" && Array.isArray(op.ids) : (op.kind === "upsert" || op.kind === "replace") && !!op.ref && (op.entries === null || Array.isArray(op.entries));
}

// src/page/services.ts
function createServices(ctx) {
  let sync = new LayoutSync(
    stateTransport(ctx),
    ctx.storage,
    { setTimeout: (fn, ms) => ctx.setTimeout(fn, ms) },
    {
      onRefused: (error) => host3.notify({ kind: "error", title: "Session Tree could not save the layout", message: restErrorText(error) })
    }
  );
  return ctx.onDispose(() => sync.dispose()), ctx.onEvent(LAYOUT_CHANGED_EVENT, (event) => sync.onRemoteChange(event.payload)), ctx.setInterval(() => {
    document.visibilityState === "visible" && sync.poll();
  }, POLL_MS), { sync, prefs: new DevicePrefs(ctx.storage) };
}
function useSyncVersion(sync) {
  let subscribe = useCallback4((listener) => sync.subscribe(listener), [sync]);
  return useSyncExternalStore(subscribe, () => sync.changeVersion);
}
function usePrefsVersion(prefs) {
  let subscribe = useCallback4((listener) => prefs.subscribe(listener), [prefs]);
  return useSyncExternalStore(subscribe, () => prefs.changeVersion);
}

// src/page/toolbar.tsx
init_define_import_meta_env();
import { Codicon as Codicon5 } from "@hermes/plugin-sdk";
import { Fragment as Fragment6, jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var noFocus = (event) => event.preventDefault();
function ToolButton({
  testId,
  title,
  pressed,
  onClick,
  children: children2,
  className
}) {
  return /* @__PURE__ */ jsx8(
    "button",
    {
      type: "button",
      className: `st-tb${pressed ? " is-on" : ""}${className ? ` ${className}` : ""}`,
      "data-testid": testId,
      title,
      "aria-label": title,
      "aria-pressed": pressed === void 0 ? void 0 : pressed,
      onMouseDown: noFocus,
      onClick,
      children: children2
    }
  );
}
var ZOOM_STEP = 1.2;
function Toolbar(props) {
  let { zoomTo, getZoom } = useReactFlow(), { zoom: zoom3 } = useViewport(), clamp2 = (value2) => Math.min(props.maxZoom, Math.max(props.minZoom, value2)), scoped = props.projects.filter((project) => project.sessionIds.length > 0 || project.id === props.scope);
  return /* @__PURE__ */ jsxs8("div", { className: "st-bar", "data-testid": "session-tree-toolbar", children: [
    /* @__PURE__ */ jsxs8("span", { className: "st-brand", children: [
      /* @__PURE__ */ jsx8(Codicon5, { name: "type-hierarchy", size: 14 }),
      "Session tree"
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "st-scope", role: "radiogroup", "aria-label": "Project scope", "data-testid": "session-tree-scope", children: [
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          role: "radio",
          "aria-checked": props.scope === ALL_PROJECTS,
          className: props.scope === ALL_PROJECTS ? "is-on" : void 0,
          "data-scope": ALL_PROJECTS,
          title: "All projects",
          onMouseDown: noFocus,
          onClick: () => props.onScope(ALL_PROJECTS),
          children: "All"
        }
      ),
      scoped.map((project) => /* @__PURE__ */ jsxs8(
        "button",
        {
          type: "button",
          role: "radio",
          "aria-checked": props.scope === project.id,
          className: props.scope === project.id ? "is-on" : void 0,
          "data-scope": project.id,
          title: `Project: ${project.label}`,
          onMouseDown: noFocus,
          onClick: () => props.onScope(project.id),
          children: [
            /* @__PURE__ */ jsx8(ProjectGlyph, { project, size: 11 }),
            project.label
          ]
        },
        project.id
      ))
    ] }),
    /* @__PURE__ */ jsxs8("label", { className: "st-profile", title: "Profile", children: [
      /* @__PURE__ */ jsx8(Codicon5, { name: "account", size: 12 }),
      /* @__PURE__ */ jsxs8(
        "select",
        {
          "data-testid": "session-tree-profile",
          "aria-label": "Profile",
          value: props.profile,
          onChange: (event) => {
            event.currentTarget.blur(), props.onProfile(event.target.value);
          },
          onKeyDown: (event) => {
            event.key === "Escape" && event.currentTarget.blur();
          },
          children: [
            props.profiles.map((name) => /* @__PURE__ */ jsx8("option", { value: name, children: name }, name)),
            /* @__PURE__ */ jsx8("option", { value: ALL_PROFILES, children: "All profiles" })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs8(
      "label",
      {
        className: "st-profile st-style",
        title: props.styleSource === "device" ? "View style (this device only — Settings → Plugins → Session Tree)" : "View style (synced to every device)",
        children: [
          /* @__PURE__ */ jsx8(Codicon5, { name: "layout", size: 12 }),
          /* @__PURE__ */ jsx8(
            "select",
            {
              "data-testid": "session-tree-style",
              "data-source": props.styleSource,
              "aria-label": "View style",
              value: props.styleId,
              onChange: (event) => {
                event.currentTarget.blur(), props.onStyle(event.target.value);
              },
              onKeyDown: (event) => {
                event.key === "Escape" && event.currentTarget.blur();
              },
              children: props.styles.map((style2) => /* @__PURE__ */ jsx8("option", { value: style2.id, children: style2.label }, style2.id))
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsx8("span", { className: "st-spacer" }),
    /* @__PURE__ */ jsxs8(
      ToolButton,
      {
        testId: "session-tree-show-all",
        title: `Show all: put the ${props.singlesCount} sessions without branches on the canvas`,
        pressed: props.showAll,
        onClick: () => props.onShowAll(!props.showAll),
        children: [
          /* @__PURE__ */ jsx8(Codicon5, { name: "list-flat", size: 13 }),
          "Show all"
        ]
      }
    ),
    /* @__PURE__ */ jsxs8(
      ToolButton,
      {
        testId: "session-tree-show-archived",
        title: "Show archived",
        pressed: props.showArchived,
        onClick: () => props.onShowArchived(!props.showArchived),
        children: [
          /* @__PURE__ */ jsx8(Codicon5, { name: "archive", size: 13 }),
          "Archived"
        ]
      }
    ),
    /* @__PURE__ */ jsx8(ToolButton, { testId: "session-tree-rearrange", title: "Re-arrange (reset this layout)", onClick: props.onRearrange, children: /* @__PURE__ */ jsx8(Codicon5, { name: "refresh", size: 13 }) }),
    /* @__PURE__ */ jsx8("span", { className: "st-sep" }),
    /* @__PURE__ */ jsxs8(
      ToolButton,
      {
        testId: "session-tree-snap",
        title: `Snap to grid (${props.snap ? "on" : "off"})`,
        pressed: props.snap,
        onClick: () => props.onSnap(!props.snap),
        children: [
          /* @__PURE__ */ jsx8(Codicon5, { name: "symbol-numeric", size: 13 }),
          "Snap"
        ]
      }
    ),
    /* @__PURE__ */ jsx8("span", { className: "st-sep" }),
    /* @__PURE__ */ jsx8(ToolButton, { testId: "session-tree-zoom-out", title: "Zoom out", onClick: () => {
      zoomTo(clamp2(getZoom() / ZOOM_STEP));
    }, children: "−" }),
    /* @__PURE__ */ jsx8(ToolButton, { testId: "session-tree-zoom-level", title: "Reset to 100%", onClick: () => {
      zoomTo(1);
    }, className: "st-zoom", children: /* @__PURE__ */ jsxs8("span", { "data-testid": "session-tree-zoom", children: [
      Math.round(zoom3 * 100),
      "%"
    ] }) }),
    /* @__PURE__ */ jsx8(ToolButton, { testId: "session-tree-zoom-in", title: "Zoom in", onClick: () => {
      zoomTo(clamp2(getZoom() * ZOOM_STEP));
    }, children: "+" }),
    /* @__PURE__ */ jsxs8(ToolButton, { testId: "session-tree-fit", title: "Fit to view", onClick: props.onFit, children: [
      /* @__PURE__ */ jsx8(Codicon5, { name: "screen-full", size: 13 }),
      "Fit"
    ] }),
    props.hasPanel && /* @__PURE__ */ jsxs8(Fragment6, { children: [
      /* @__PURE__ */ jsx8("span", { className: "st-sep" }),
      /* @__PURE__ */ jsx8(
        ToolButton,
        {
          testId: "session-tree-panel",
          title: props.panelOpen ? "Hide the side panel" : "Show the side panel",
          pressed: props.panelOpen,
          onClick: () => props.onPanel(!props.panelOpen),
          children: /* @__PURE__ */ jsx8(Codicon5, { name: "layout-sidebar-right", size: 13 })
        }
      )
    ] })
  ] });
}

// src/page/use-live-refresh.ts
init_define_import_meta_env();
import { useEffect as useEffect4, useRef as useRef4 } from "react";
var POLL_MS2 = 1e4;
function useLiveRefresh(ctx, refresh) {
  let latest = useRef4(refresh);
  useEffect4(() => {
    latest.current = refresh;
  }), useEffect4(() => {
    let offSessions = ctx.onEvent("sessions.changed", () => latest.current.sessions()), offProjects = ctx.onEvent("projects.changed", () => {
      latest.current.projects(), latest.current.sessions();
    }), offPoll = ctx.setInterval(() => {
      document.visibilityState === "visible" && (latest.current.sessions(), latest.current.projects());
    }, POLL_MS2);
    return () => {
      offSessions(), offProjects(), offPoll();
    };
  }, [ctx]);
}

// src/page/session-tree-page.tsx
import { Fragment as Fragment7, jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var BACKEND_OFF_MESSAGE = "Session Tree's backend is off: enable the session-tree plugin for this profile and restart the gateway.", OFFLINE_MESSAGE = "offline: showing last saved layout", UNDO_TOAST_MS = 1e4, FIT_OPTIONS = { padding: 0.08, maxZoom: 1.25, duration: 0 }, EMPTY_LAYOUT = { positions: /* @__PURE__ */ new Map(), labels: [] }, NO_NEEDS_INPUT = /* @__PURE__ */ new Set();
function SessionTreePage({ ctx, services }) {
  return /* @__PURE__ */ jsx9(PluginCtx.Provider, { value: ctx, children: /* @__PURE__ */ jsx9(ReactFlowProvider, { children: /* @__PURE__ */ jsx9(PageBody, { ctx, services }) }) });
}
function PageBody({ ctx, services: { sync, prefs } }) {
  let activeProfile = useValue(host4.state.profile) || "default", syncVersion = useSyncVersion(sync);
  usePrefsVersion(prefs);
  let device = prefs.get(), profile = device.profile ?? activeProfile, showAll = device.showAll, showArchived = device.showArchived, [scopeChoice, setScope] = useState6(ALL_PROJECTS), [selectedChoice, setSelectedId] = useState6(null), [fitRequest, setFitRequest] = useState6(0), [nowMs, setNowMs] = useState6(() => Date.now()), [toast, setToast] = useState6(), settings = sync.settings(profile), style2 = getStyle(resolveStyleId(device.styleOverride, settings.style)), snap = settings.snap, flow = useReactFlow();
  useEffect5(() => sync.watch(profile), [sync, profile]);
  let health = useQuery({
    queryKey: ["session-tree", "health", activeProfile],
    queryFn: () => fetchHealth(ctx, activeProfile),
    retry: !1,
    refetchOnWindowFocus: !1
  }), profiles = useQuery({
    queryKey: ["session-tree", "profiles"],
    queryFn: () => fetchProfiles(ctx),
    retry: !1,
    refetchOnWindowFocus: !1
  }), sessions = useQuery({
    queryKey: ["session-tree", "sessions", profile, showArchived],
    queryFn: () => fetchSessions(ctx, { profile, includeArchived: showArchived }),
    // Show archived refetches with the same profile: keep the canvas (viewport, selection,
    // inspector) on the previous rows until the new ones arrive. A new profile loads fresh.
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === profile ? previous : void 0,
    retry: !1,
    refetchOnWindowFocus: !1
  }), profileNames = useMemo5(() => {
    let names = new Set(profiles.data?.profiles ?? []);
    return names.add(activeProfile), profile !== ALL_PROFILES && names.add(profile), [...names].sort((a, b) => a === "default" ? -1 : b === "default" ? 1 : a.localeCompare(b));
  }, [profiles.data, activeProfile, profile]), projectProfiles = profile === ALL_PROFILES ? profileNames : [profile], projects = useQuery({
    queryKey: ["session-tree", "projects", projectProfiles.join(",")],
    queryFn: () => fetchProjects(projectProfiles, ctx),
    // The gateway socket may still be connecting on a cold page load.
    retry: 3,
    retryDelay: 750,
    refetchOnWindowFocus: !1
  });
  useLiveRefresh(ctx, {
    sessions: () => {
      sessions.refetch();
    },
    projects: () => {
      projects.refetch();
    }
  }), useEffect5(() => ctx.setInterval(() => setNowMs(Date.now()), 6e4), [ctx]);
  let projectList = useMemo5(() => projects.data ?? [], [projects.data]), scope = scopeChoice === ALL_PROJECTS || projectList.some((project) => project.id === scopeChoice) ? scopeChoice : ALL_PROJECTS, serverRows = useMemo5(() => sessions.data?.sessions ?? [], [sessions.data]), [overrides, setOverrides] = useRowOverrides(serverRows), rows = useMemo5(() => applyOverrides(serverRows, overrides), [serverRows, overrides]), model = useMemo5(
    () => buildGraph(rows, projectList, { profile, showArchived, scope }),
    [rows, projectList, profile, showArchived, scope]
  ), spec = useMemo5(() => style2.layoutSpec({ showAll }), [style2, showAll]), ref = useMemo5(() => ({ profile, style: style2.id, scope }), [profile, style2, scope]), ready = !!sessions.data && !projects.isPending && sync.settled(profile), layout = useMemo5(
    // Without projects (`projects.tree` failed) the groups are wrong: draw them, but save nothing.
    () => ready ? sync.place(ref, (previous) => style2.layout(model, previous, spec), { save: style2.savesLayout && !projects.isError }) : EMPTY_LAYOUT,
    // `syncVersion` re-runs the merge after a drop, a Re-arrange or another window's change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the version is the store's change signal
    [ready, sync, ref, style2, model, spec, syncVersion, projects.isError]
  ), busy = useValue(host4.state.busy), busyBySession = useValue(host4.state.busyBySession), focusedSessionId = useValue(host4.state.focusedSessionId), focusedStoredSessionId = useValue(host4.state.focusedStoredSessionId), hostStatus = useMemo5(
    () => ({
      busy: !!busy,
      busyBySession: busyBySession ?? {},
      focusedSessionId: focusedSessionId ?? null,
      focusedStoredSessionId: focusedStoredSessionId ?? null,
      needsInput: NO_NEEDS_INPUT
    }),
    [busy, busyBySession, focusedSessionId, focusedStoredSessionId]
  ), statusOf = useCallback5((node) => node.row ? liveStatus(node.row, hostStatus) : void 0, [hostStatus]), selectedId = selectedChoice && model.nodeById.get(selectedChoice)?.readOnly === !1 ? selectedChoice : null, fit = useCallback5(() => {
    let inScope = scope === ALL_PROJECTS ? void 0 : laidOutFamilies(model, spec).flatMap((family) => family.nodeIds).filter((id2) => model.nodeById.get(id2)?.outOfScope === !1).map((id2) => ({ id: id2 }));
    flow.fitView({ ...FIT_OPTIONS, nodes: inScope && inScope.length > 0 ? inScope : void 0 });
  }, [flow, model, spec, scope]);
  useEffect5(() => {
    fitRequest > 0 && fit();
  }, [fitRequest]);
  let requestFit = useCallback5(() => setFitRequest((count) => count + 1), [setFitRequest]), vpKey = viewportKey(style2.id, profile, scope), vpKeyRef = useRef5(vpKey), canvasShown = ready && model.nodes.length > 0 && !sessions.isError, appliedKey = useRef5(null);
  useEffect5(() => {
    if (vpKeyRef.current = vpKey, !canvasShown) {
      appliedKey.current = null;
      return;
    }
    if (appliedKey.current === null) {
      appliedKey.current = vpKey;
      return;
    }
    if (appliedKey.current !== vpKey) {
      appliedKey.current = vpKey;
      let saved = prefs.viewport(vpKey);
      saved ? flow.setViewport(saved, { duration: 0 }) : fit();
    }
  }, [vpKey, canvasShown, prefs, flow, fit]);
  let onViewport = useCallback5((viewport) => prefs.setViewport(vpKeyRef.current, viewport), [prefs]), onSelect = useCallback5(
    (id2, reveal2 = !1) => {
      let node = id2 ? model.nodeById.get(id2) : void 0;
      if (id2 && (!node || node.readOnly))
        return;
      setSelectedId(id2);
      let point = id2 ? layout.positions.get(id2) : void 0;
      if (reveal2 && point) {
        let { zoom: zoom3 } = flow.getViewport();
        flow.setCenter(point.x + style2.nodeSize.width / 2, point.y + style2.nodeSize.height / 2, { zoom: zoom3, duration: 0 });
      }
    },
    [model, layout, flow, style2, setSelectedId]
  ), onMove = useCallback5((moves) => sync.drop(ref, moves), [sync, ref]), onDragging = useCallback5((ids) => sync.setDragging(ids), [sync]), dismissToast = useCallback5(() => setToast(void 0), [setToast]), onRearrange = useCallback5(() => {
    let previous = sync.rearrange(ref), id2 = Date.now();
    requestFit(), setToast({
      id: id2,
      message: "Layout re-arranged",
      undo: () => {
        sync.restore(ref, previous), setToast(void 0), requestFit();
      }
    });
  }, [sync, ref, requestFit, setToast]);
  useEffect5(() => {
    if (toast)
      return ctx.setTimeout(() => setToast((current) => current?.id === toast.id ? void 0 : current), UNDO_TOAST_MS);
  }, [ctx, toast]);
  let onOpen = useCallback5(
    (node) => {
      !node.row || node.readOnly || host4.openSession(node.row.id, { intent: "tab", ...node.profile !== activeProfile ? { profile: node.profile } : {} });
    },
    [activeProfile]
  ), [pendingSelect, setPendingSelect] = useState6(null), [reveal, setReveal] = useState6(null);
  pendingSelect && model.nodeById.get(pendingSelect)?.readOnly === !1 && layout.positions.has(pendingSelect) && (setPendingSelect(null), setSelectedId(pendingSelect), setReveal({ id: pendingSelect })), useEffect5(() => {
    let point = reveal ? layout.positions.get(reveal.id) : void 0;
    if (point) {
      let { zoom: zoom3 } = flow.getViewport();
      flow.setCenter(point.x + style2.nodeSize.width / 2, point.y + style2.nodeSize.height / 2, { zoom: zoom3, duration: 0 });
    }
  }, [reveal]);
  let { actions, dialogs } = useSessionActionsController({
    ctx,
    model,
    setOverrides,
    statusOf,
    runtime: { focusedStoredSessionId: focusedStoredSessionId ?? null, focusedSessionId: focusedSessionId ?? null },
    refreshSessions: () => {
      sessions.refetch();
    },
    refreshProjects: () => {
      projects.refetch();
    },
    onBranched: (id2) => setPendingSelect(id2),
    onMoved: (id2) => sync.forget(profile, id2),
    onRemoved: (id2) => setSelectedId((current) => current === id2 ? null : current)
  }), visibleCount = useMemo5(() => visibleRows(rows).length, [rows]), onCanvas = useMemo5(() => laidOutFamilies(model, spec).reduce((sum, family) => sum + family.nodeIds.length, 0), [model, spec]), Panel2 = style2.Panel, panelOpen = prefs.panelOpen(style2.id), offline = sync.offline(profile), onStyle = useCallback5(
    (id2) => {
      prefs.get().styleOverride ? prefs.set({ styleOverride: id2 }) : sync.setSettings(profile, { style: id2 });
    },
    [prefs, sync, profile]
  );
  if (health.isError)
    return /* @__PURE__ */ jsx9("div", { className: "session-tree", "data-testid": "session-tree-page", "data-profile": activeProfile, children: /* @__PURE__ */ jsx9("div", { className: "session-tree__state", "data-testid": "session-tree-backend-off", children: /* @__PURE__ */ jsx9(EmptyState, { title: BACKEND_OFF_MESSAGE }) }) });
  let body;
  if (sessions.isError || projects.isError) {
    let failed = sessions.isError ? sessions : projects;
    body = /* @__PURE__ */ jsx9("div", { className: "session-tree__state", "data-testid": "session-tree-error", "data-failed": sessions.isError ? "sessions" : "projects", children: /* @__PURE__ */ jsx9(ErrorState, { title: sessions.isError ? "Could not load sessions" : "Could not load projects", description: errorText2(failed.error), children: /* @__PURE__ */ jsx9(Button2, { variant: "outline", "data-testid": "session-tree-retry", disabled: failed.isFetching, onClick: () => {
      failed.refetch();
    }, children: failed.isFetching ? "Retrying…" : "Retry" }) }) });
  } else if (health.isPending || sessions.isPending || projects.isPending || !sync.settled(profile))
    body = /* @__PURE__ */ jsx9("div", { className: "session-tree__state", "data-testid": "session-tree-loading", children: /* @__PURE__ */ jsx9(EmptyState, { title: "Loading sessions…" }) });
  else if (model.nodes.length === 0)
    body = /* @__PURE__ */ jsx9("div", { className: "session-tree__state", "data-testid": "session-tree-empty", children: /* @__PURE__ */ jsx9(EmptyState, { title: "No sessions yet", description: "Sessions you start show up here." }) });
  else {
    let saved = prefs.viewport(vpKey);
    body = /* @__PURE__ */ jsxs9(Fragment7, { children: [
      /* @__PURE__ */ jsx9(
        GraphCanvas,
        {
          style: style2,
          spec,
          model,
          positions: layout.positions,
          labels: layout.labels,
          selectedId,
          onSelect,
          onMove,
          onDragging,
          onOpen,
          statusOf,
          snap,
          nowMs,
          initialViewport: saved,
          onViewport
        }
      ),
      onCanvas === 0 && /* @__PURE__ */ jsx9("div", { className: "session-tree__hint", "data-testid": "session-tree-no-branches", children: "No branched sessions here — the sessions without branches are listed on the right." })
    ] });
  }
  return /* @__PURE__ */ jsx9(SessionActionsCtx.Provider, { value: actions, children: /* @__PURE__ */ jsxs9(
    "div",
    {
      className: "session-tree",
      "data-testid": "session-tree-page",
      "data-profile": profile,
      "data-scope": scope,
      "data-style": style2.id,
      "data-sync": sync.status(profile),
      "data-sync-rev": sync.revision(profile) ?? void 0,
      "data-row-count": sessions.data ? visibleCount : void 0,
      "data-node-count": sessions.data ? model.nodes.length : void 0,
      "data-canvas-count": sessions.data ? onCanvas : void 0,
      "data-projects": projects.isError ? "error" : projects.data ? String(projectList.length) : "loading",
      title: projects.isError ? `projects.tree: ${errorText2(projects.error)}` : void 0,
      children: [
        /* @__PURE__ */ jsx9(
          Toolbar,
          {
            projects: projectList,
            scope,
            onScope: setScope,
            profiles: profileNames,
            profile,
            onProfile: (next) => {
              prefs.set({ profile: next === activeProfile ? null : next }), setScope(ALL_PROJECTS), setSelectedId(null);
            },
            showAll,
            onShowAll: (on) => {
              prefs.set({ showAll: on }), requestFit();
            },
            showArchived,
            onShowArchived: (on) => prefs.set({ showArchived: on }),
            snap,
            onSnap: (on) => sync.setSettings(profile, { snap: on }),
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
            onFit: fit,
            onRearrange,
            singlesCount: model.singles.length,
            styles: registeredStyles().map((each) => ({ id: each.id, label: each.label })),
            styleId: style2.id,
            styleSource: device.styleOverride ? "device" : "synced",
            onStyle,
            hasPanel: !!Panel2,
            panelOpen,
            onPanel: (open) => prefs.setPanelOpen(style2.id, open)
          }
        ),
        offline && /* @__PURE__ */ jsx9("div", { className: "session-tree__banner", role: "status", "data-testid": "session-tree-offline", children: OFFLINE_MESSAGE }),
        /* @__PURE__ */ jsxs9("div", { className: "session-tree__main", children: [
          /* @__PURE__ */ jsx9("div", { className: "session-tree__stage", children: body }),
          Panel2 && panelOpen && sessions.data && /* @__PURE__ */ jsx9(Panel2, { model, selectedId, onSelect, onOpen, statusOf, nowMs })
        ] }),
        toast && /* @__PURE__ */ jsxs9("div", { className: "session-tree__toast", role: "status", "data-testid": "session-tree-toast", children: [
          /* @__PURE__ */ jsx9("span", { children: toast.message }),
          /* @__PURE__ */ jsx9("button", { type: "button", className: "st-toast-btn", "data-testid": "session-tree-undo", onClick: toast.undo, children: "Undo" }),
          /* @__PURE__ */ jsx9("button", { type: "button", className: "st-toast-btn", "aria-label": "Dismiss", onClick: dismissToast, children: "×" })
        ] }),
        dialogs
      ]
    }
  ) });
}
function errorText2(error) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

// src/settings/settings-page.tsx
init_define_import_meta_env();
import { host as host5, ListRow, SegmentedControl, ToggleRow, useValue as useValue2 } from "@hermes/plugin-sdk";
import { useEffect as useEffect6 } from "react";
import { jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
var USE_SYNCED = "synced";
function SettingsPage({ services: { sync, prefs } }) {
  let profile = useValue2(host5.state.profile) || "default";
  useSyncVersion(sync), usePrefsVersion(prefs), useEffect6(() => sync.watch(profile), [sync, profile]);
  let styles = registeredStyles().map((style2) => ({ id: style2.id, label: style2.label })), settings = sync.settings(profile), synced = isRegisteredStyle(settings.style) ? settings.style : DEFAULT_STYLE_ID, override = prefs.get().styleOverride, device = isRegisteredStyle(override) ? override : USE_SYNCED, offline = sync.offline(profile);
  return /* @__PURE__ */ jsxs10("div", { className: "session-tree__settings", "data-testid": "session-tree-settings", "data-sync": sync.status(profile), children: [
    /* @__PURE__ */ jsx10(
      ListRow,
      {
        id: "session-tree-view-style",
        title: "View style",
        description: "How the session graph is drawn, on every device that uses this Hermes.",
        action: /* @__PURE__ */ jsx10("div", { "data-testid": "session-tree-settings-style", "data-value": synced, children: /* @__PURE__ */ jsx10(SegmentedControl, { options: styles, value: synced, onChange: (id2) => sync.setSettings(profile, { style: id2 }) }) })
      }
    ),
    /* @__PURE__ */ jsx10(
      ListRow,
      {
        id: "session-tree-device-style",
        title: "On this device",
        description: "Use the synced style here, or pick one for this device only.",
        action: /* @__PURE__ */ jsx10("div", { "data-testid": "session-tree-settings-device", "data-value": device, children: /* @__PURE__ */ jsx10(
          SegmentedControl,
          {
            options: [{ id: USE_SYNCED, label: "Use synced style" }, ...styles],
            value: device,
            onChange: (id2) => prefs.set({ styleOverride: id2 === USE_SYNCED ? null : id2 })
          }
        ) })
      }
    ),
    /* @__PURE__ */ jsx10("div", { "data-testid": "session-tree-settings-snap", "data-value": settings.snap ? "on" : "off", children: /* @__PURE__ */ jsx10(
      ToggleRow,
      {
        id: "session-tree-snap-default",
        label: "Snap grid default",
        description: "Show the dot grid and snap dragged blocks to it (the toolbar's Snap toggle; synced).",
        checked: settings.snap,
        onChange: (on) => sync.setSettings(profile, { snap: on })
      }
    ) }),
    offline && /* @__PURE__ */ jsx10("p", { className: "session-tree__settings-note", "data-testid": "session-tree-settings-offline", children: "The Session Tree backend is unreachable: changes are kept here and saved when it is back." })
  ] });
}

// src/styles.css
var styles_default = `/* Session Tree — own styles. Colours only through the app theme (var(--ui-*)) and project
   colours from data (--st-pc), so light and dark follow the host. Status dots use the theme's
   own semantic colours (--ui-green / --ui-yellow). React Flow's base.css ships its own
   defaults; every --xy-* variable it reads is pointed at a theme variable here. */

.session-tree {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: var(--ui-text-primary);
  font-size: 12px;
  line-height: 1.3;
  user-select: none;
}

.session-tree__state {
  display: grid;
  flex: 1;
  place-items: center;
  padding: 24px;
  color: var(--ui-text-secondary);
}

.session-tree__main {
  display: flex;
  flex: 1;
  min-height: 0;
}

.session-tree__stage {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.session-tree__canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--ui-bg-editor);
}

.session-tree__hint {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 10px;
  border: 1px solid var(--ui-stroke-tertiary);
  border-radius: 6px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-secondary);
  pointer-events: none;
}

.session-tree .react-flow {
  --xy-background-color: transparent;
  --xy-background-pattern-color: var(--ui-stroke-secondary);
  --xy-edge-stroke: var(--ui-stroke-primary);
  --xy-edge-stroke-selected: var(--ui-accent);
  --xy-edge-stroke-width: 1;
  --xy-node-color: var(--ui-text-primary);
  --xy-node-border: none;
  --xy-node-background-color: transparent;
  --xy-handle-background-color: transparent;
  --xy-handle-border-color: transparent;
  --xy-selection-background-color: var(--ui-selection-background);
  --xy-selection-border: 1px dotted var(--ui-stroke-secondary);
  --xy-attribution-background-color: transparent;
}

.session-tree .react-flow__node {
  cursor: default;
}

.session-tree .react-flow__node.draggable {
  cursor: pointer;
}

.session-tree .react-flow__node.dragging {
  cursor: grabbing;
}

.session-tree .react-flow__pane {
  cursor: default;
}

.session-tree .react-flow__pane.dragging {
  cursor: grabbing;
}

/* --- toolbar --------------------------------------------------------------------------- */

.st-bar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 6px;
  border-bottom: 1px solid var(--ui-stroke-tertiary);
  background: var(--ui-bg-chrome);
  overflow: hidden;
}

.st-brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px 0 2px;
  font-weight: 600;
  white-space: nowrap;
}

.st-brand .codicon {
  color: var(--ui-accent);
}

.st-sep {
  flex: none;
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--ui-stroke-tertiary);
}

.st-spacer {
  flex: 1;
}

.st-tb,
.st-scope button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 24px;
  min-width: 24px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 11.5px;
  white-space: nowrap;
  cursor: pointer;
}

.st-tb:hover,
.st-scope button:hover {
  background: var(--ui-control-hover-background);
  color: var(--ui-text-primary);
}

.st-tb.is-on,
.st-scope button.is-on {
  border-color: color-mix(in srgb, var(--ui-accent) 55%, transparent);
  background: color-mix(in srgb, var(--ui-accent) 18%, transparent);
  color: var(--ui-text-primary);
}

.st-zoom {
  min-width: 44px;
  color: var(--ui-text-primary);
  font-variant-numeric: tabular-nums;
}

.st-scope {
  display: inline-flex;
  flex: 0 1 auto;
  gap: 1px;
  min-width: 0;
  padding: 1px;
  border: 1px solid var(--ui-stroke-tertiary);
  border-radius: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.st-scope button {
  height: 20px;
  border-radius: 4px;
}

.st-profile {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 4px 0 6px;
  border: 1px solid var(--ui-stroke-tertiary);
  border-radius: 5px;
  color: var(--ui-text-secondary);
}

.st-profile select {
  max-width: 120px;
  border: 0;
  background: transparent;
  color: var(--ui-text-primary);
  font: inherit;
  font-size: 11.5px;
  outline: 0;
}

.st-profile option {
  background: var(--ui-bg-elevated);
  color: var(--ui-text-primary);
}

.session-tree__glyph-dot {
  display: inline-block;
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.session-tree__glyph-dot--none {
  background: var(--ui-text-quaternary);
}

.session-tree__glyph-icon {
  flex: none;
}

/* --- blocks (Dense) -------------------------------------------------------------------- */

.session-tree__handle {
  width: 1px;
  min-width: 0;
  height: 1px;
  min-height: 0;
  border: 0;
  background: transparent;
  pointer-events: none;
}

.session-tree__block {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
  box-sizing: border-box;
  padding: 0 6px 0 9px;
  overflow: hidden;
  border: 1px solid var(--ui-stroke-secondary);
  border-radius: 6px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-primary);
  font-size: 12px;
  line-height: 1;
  transition: opacity 0.15s, border-color 0.12s, background 0.12s;
}

.session-tree__block::before {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  width: 2px;
  border-radius: 2px;
  background: var(--st-pc, var(--ui-text-quaternary));
  content: '';
}

.session-tree__block:hover {
  border-color: var(--ui-stroke-primary);
}

.session-tree__block.is-lineage {
  border-color: color-mix(in srgb, var(--ui-accent) 50%, var(--ui-stroke-secondary));
}

.session-tree__block.is-selected {
  border-color: var(--ui-accent);
  background: color-mix(in srgb, var(--ui-accent) 16%, var(--ui-bg-elevated));
}

.session-tree__block.is-open {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-accent) 55%, transparent);
}

.session-tree__block.is-archived {
  border-style: dashed;
  opacity: 0.5;
}

.session-tree__block.is-out-of-scope {
  opacity: 0.16;
}

.session-tree__block.is-standin {
  border-style: dashed;
  background: transparent;
  opacity: 0.6;
}

.session-tree__block.is-standin::before {
  display: none;
}

.session-tree__block.is-standin .st-title {
  color: var(--ui-text-tertiary);
  font-style: italic;
}

.session-tree__block.is-standin.is-out-of-scope {
  opacity: 0.16;
}

.st-dot {
  flex: none;
  width: 7px;
  height: 7px;
  box-sizing: border-box;
  border: 1px solid var(--ui-text-quaternary);
  border-radius: 50%;
}

.st-dot--running {
  border-color: var(--ui-green);
  background: var(--ui-green);
  animation: st-pulse 1.6s infinite;
}

.st-dot--needs-input {
  border-color: var(--ui-yellow);
  background: var(--ui-yellow);
}

.st-dot--unread {
  border-color: var(--ui-accent);
  background: var(--ui-accent);
}

@keyframes st-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--ui-green) 60%, transparent);
  }

  70% {
    box-shadow: 0 0 0 5px transparent;
  }

  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.st-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st-age {
  flex: none;
  color: var(--ui-text-tertiary);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.st-cmp {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 1px;
  color: var(--ui-accent);
  font-size: 10px;
}

.st-pin {
  flex: none;
  color: var(--ui-text-tertiary);
}

.session-tree__group-node {
  pointer-events: none;
}

.session-tree__group-label {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  color: var(--ui-text-tertiary);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.session-tree__group-label.is-dimmed {
  opacity: 0.3;
}

/* --- links (Dense) --------------------------------------------------------------------- */

.session-tree__link {
  fill: none;
  stroke: color-mix(in srgb, var(--ui-text-tertiary) 55%, transparent);
  stroke-width: 1;
}

.session-tree__link--reset {
  stroke: color-mix(in srgb, var(--ui-text-tertiary) 80%, transparent);
  stroke-dasharray: 4 3;
}

.session-tree__link--standin {
  stroke-dasharray: 2 3;
}

.session-tree__link.is-highlighted {
  stroke: var(--ui-accent);
  stroke-width: 1.6;
}

.session-tree__link-end {
  fill: color-mix(in srgb, var(--ui-text-tertiary) 65%, transparent);
}

.session-tree__link-end.is-highlighted {
  fill: var(--ui-accent);
}

g.is-dimmed {
  opacity: 0.18;
}

.session-tree__link-label {
  position: absolute;
  padding: 0 3px;
  border-radius: 3px;
  background: var(--ui-bg-editor);
  color: var(--ui-text-tertiary);
  font-size: 9.5px;
  letter-spacing: 0.02em;
  pointer-events: none;
}

/* --- tooltip + menu -------------------------------------------------------------------- */

.session-tree__tooltip {
  position: absolute;
  z-index: 30;
  max-width: 320px;
  padding: 4px 8px;
  border: 1px solid var(--ui-stroke-secondary);
  border-radius: 5px;
  background: var(--ui-bg-elevated);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--ui-text-primary) 18%, transparent);
  color: var(--ui-text-primary);
  font-size: 11.5px;
  pointer-events: none;
}

/* The menu itself is the SDK's ContextMenu (UI kit styles). Ours: the reason a disabled item
   gives, the block's ⋯ button, the rename dialog's inline error. */
.st-menu-note {
  margin-left: auto;
  padding-left: 8px;
  color: var(--ui-text-tertiary);
  font-size: 10px;
}

.st-more {
  position: absolute;
  top: 50%;
  right: 3px;
  display: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: inherit;
  color: var(--ui-text-secondary);
  cursor: pointer;
  transform: translateY(-50%);
}

.session-tree__block:hover .st-more,
.session-tree__block.is-selected .st-more {
  display: inline-flex;
}

.st-more:hover {
  color: var(--ui-text-primary);
}

.st-dialog-error {
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--ui-red) 35%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-red) 10%, transparent);
  color: var(--ui-red);
  font-size: 12px;
}

.session-tree__canvas:focus {
  outline: none;
}

/* --- inspector (Dense) ----------------------------------------------------------------- */

.st-insp {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 264px;
  min-height: 0;
  border-left: 1px solid var(--ui-stroke-tertiary);
  background: var(--ui-bg-sidebar);
  user-select: text;
}

.st-ib {
  flex: 1;
  min-height: 0;
  padding: 10px 11px;
  overflow: auto;
}

.st-empty {
  padding: 30px 6px;
  color: var(--ui-text-tertiary);
  text-align: center;
}

.st-ih {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-text-tertiary);
  font-size: 11px;
}

.st-ih-profile {
  padding: 0 5px;
  border: 1px solid var(--ui-stroke-tertiary);
  border-radius: 8px;
  font-size: 10px;
}

.st-ih-id,
.st-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
}

.st-ih-id {
  min-width: 0;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st-it {
  margin: 5px 0 6px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.25;
}

.st-it.is-standin {
  color: var(--ui-text-tertiary);
  font-style: italic;
}

.st-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.st-tag {
  display: inline-flex;
  align-items: center;
  height: 17px;
  padding: 0 6px;
  border: 1px solid var(--ui-stroke-secondary);
  border-radius: 9px;
  color: var(--ui-text-tertiary);
  font-size: 10px;
}

.st-tag--run {
  border-color: color-mix(in srgb, var(--ui-green) 45%, transparent);
  color: var(--ui-green);
}

.st-tag--ask {
  border-color: color-mix(in srgb, var(--ui-yellow) 50%, transparent);
  color: var(--ui-yellow);
}

.st-tag--acc {
  border-color: color-mix(in srgb, var(--ui-accent) 50%, transparent);
  color: var(--ui-accent);
}

.st-acts {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
}

.st-act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 7px;
  border: 1px solid var(--ui-stroke-secondary);
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-primary);
  font: inherit;
  font-size: 11px;
}

.st-act:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.st-act--primary {
  border-color: color-mix(in srgb, var(--ui-accent) 55%, transparent);
  background: color-mix(in srgb, var(--ui-accent) 20%, transparent);
}

.st-sec {
  padding: 8px 0;
  border-top: 1px solid var(--ui-stroke-tertiary);
}

.st-sh {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  color: var(--ui-text-tertiary);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.st-kv {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
}

.st-kv > div {
  min-width: 0;
}

.st-kv small {
  display: block;
  color: var(--ui-text-tertiary);
  font-size: 10px;
}

.st-kv b {
  display: block;
  overflow: hidden;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st-cmpline {
  display: flex;
  align-items: center;
  gap: 5px;
}

.st-cmpline .codicon {
  color: var(--ui-accent);
}

.st-segs {
  display: flex;
  gap: 2px;
  height: 6px;
  margin-top: 6px;
}

.st-segs i {
  flex: 1;
  border-radius: 2px;
  background: color-mix(in srgb, var(--ui-text-tertiary) 35%, transparent);
}

.st-segs i.is-current {
  background: var(--ui-accent);
}

.st-seglist {
  margin-top: 5px;
  color: var(--ui-text-tertiary);
  font-size: 10.5px;
}

.st-seglist div {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}

.st-none {
  color: var(--ui-text-tertiary);
  font-size: 11px;
}

.st-standin-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.st-lk {
  display: flex;
  align-items: center;
  gap: 6px;
  width: calc(100% + 10px);
  margin: 0 -5px;
  padding: 3px 5px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.st-lk:hover {
  background: color-mix(in srgb, var(--ui-accent) 14%, transparent);
}

.st-lk:disabled {
  cursor: default;
}

.st-lk:disabled:hover {
  background: transparent;
}

.st-lk.is-dim {
  opacity: 0.45;
}

.st-lk-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--st-pc, var(--ui-text-quaternary));
}

.st-lk-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st-lk-age {
  color: var(--ui-text-tertiary);
  font-size: 10.5px;
}

.st-rel {
  flex: none;
  width: 56px;
  color: var(--ui-text-tertiary);
  font-size: 10px;
}

.st-singles {
  flex: none;
  border-top: 1px solid var(--ui-stroke-tertiary);
}

.st-singles-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 11px;
  border: 0;
  background: transparent;
  color: var(--ui-text-tertiary);
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.st-singles-toggle b {
  color: var(--ui-text-primary);
  font-weight: 600;
}

.st-sl {
  max-height: 180px;
  padding: 0 11px 8px;
  overflow: auto;
}

.session-tree__settings {
  display: flex;
  flex-direction: column;
}

/* --- card 4: synced layout (offline banner, Re-arrange toast, settings note) ------------ */

.session-tree__banner {
  flex: none;
  padding: 4px 12px;
  border-bottom: 1px solid var(--ui-stroke-tertiary);
  background: var(--ui-bg-tertiary);
  color: var(--ui-text-secondary);
  font-size: 11.5px;
}

.session-tree__toast {
  position: absolute;
  bottom: 18px;
  left: 50%;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 6px 12px;
  border: 1px solid var(--ui-stroke-tertiary);
  border-radius: 7px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-primary);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--ui-text-primary) 18%, transparent);
  transform: translateX(-50%);
  user-select: none;
}

.st-toast-btn {
  padding: 2px 8px;
  border: 1px solid var(--ui-stroke-tertiary);
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-primary);
  font: inherit;
  cursor: pointer;
}

.st-toast-btn:hover {
  background: var(--ui-bg-tertiary);
}

.st-style select {
  max-width: 150px;
}

.session-tree__settings-note {
  margin: 8px 0 0;
  color: var(--ui-text-secondary);
  font-size: 12px;
}
`;

// src/plugin.tsx
import { jsx as jsx11 } from "react/jsx-runtime";
var PLUGIN_ID = "session-tree", ROUTE_PATH = "/session-tree";
function injectStyles(ctx) {
  let style2 = document.createElement("style");
  style2.dataset.sessionTree = "styles", style2.textContent = `${base_default}
${styles_default}`, document.head.appendChild(style2), ctx.onDispose(() => style2.remove());
}
var plugin = {
  id: PLUGIN_ID,
  name: "Session Tree",
  description: "Your chat sessions as an interactive graph of how they branched.",
  register(ctx) {
    injectStyles(ctx);
    let services = createServices(ctx);
    ctx.registerMany([
      {
        id: "page",
        area: ROUTES_AREA,
        data: { path: ROUTE_PATH },
        render: () => /* @__PURE__ */ jsx11(SessionTreePage, { ctx, services })
      },
      {
        id: "nav",
        area: SIDEBAR_NAV_AREA,
        data: { path: ROUTE_PATH, label: "Session Tree", codicon: "type-hierarchy" }
      },
      {
        id: "open",
        area: PALETTE_AREA,
        data: {
          id: "session-tree.open",
          label: "Open Session Tree",
          keywords: ["session", "tree", "graph", "branches"],
          run: () => host6.navigate(ROUTE_PATH)
        }
      }
    ]), ctx.registerSettingsPage?.({
      id: "settings",
      title: "Session Tree",
      icon: "type-hierarchy",
      render: () => /* @__PURE__ */ jsx11(SettingsPage, { services })
    });
  }
}, plugin_default = plugin;
export {
  PLUGIN_ID,
  ROUTE_PATH,
  plugin_default as default
};
/*! Bundled license information:

use-sync-external-store/cjs/use-sync-external-store-shim.production.js:
  (**
   * @license React
   * use-sync-external-store-shim.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js:
  (**
   * @license React
   * use-sync-external-store-shim/with-selector.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
