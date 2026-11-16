/* 生成物：由 scripts/build.mjs 从 src/ 编译而来，不要手改。 */
window.__ModuleLoader__.load({id:`@shmilyoo/dsh-menu-example`,factory:require=>{"use strict";var module={exports:{}};var exports=module.exports;var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/menu-icon.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function MenuIcon({ size }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 36 36",
      fill: "none",
      "aria-hidden": "true",
      style: { display: "block" },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "9.5", cy: "11", r: "2", fill: "#7CB7FF" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M15.5 11H26.5", stroke: "#679EFE", strokeWidth: 3.5, strokeLinecap: "round" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "9.5", cy: "18", r: "2", fill: "#7CB7FF" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M15.5 18H26.5", stroke: "#679EFE", strokeWidth: 3.5, strokeLinecap: "round" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "9.5", cy: "25", r: "2", fill: "#7CB7FF" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M15.5 25H26.5", stroke: "#679EFE", strokeWidth: 3.5, strokeLinecap: "round" })
      ]
    }
  );
}

// src/client/menu-page.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var pageStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  boxSizing: "border-box",
  height: "100%",
  padding: "28px clamp(24px, 4vw, 48px) 48px",
  overflowY: "auto",
  color: "var(--dsw-alias-label-primary)"
};
var columnStyle = { width: "100%", maxWidth: "960px" };
var titleStyle = { margin: 0, fontSize: 20, fontWeight: 500, lineHeight: "28px" };
var bodyStyle = { margin: "12px 0 0", fontSize: 14, lineHeight: "22px" };
function MenuPage({ t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: pageStyle, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: columnStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h1", { style: titleStyle, children: t("page.title") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: bodyStyle, children: t("page.body") })
  ] }) });
}

// src/client/locales.ts
var NS = "menuExample";
var zh = {
  /** 左侧栏入口文案。 */
  "panel.label": "\u6D4B\u8BD5\u83DC\u5355",
  /** 面板页标题。 */
  "page.title": "\u6D4B\u8BD5\u83DC\u5355",
  /** 面板页正文，即需求里要求显示的内容。 */
  "page.body": "\u8FD9\u662F\u4E00\u4E2A\u6D4B\u8BD5\u83DC\u5355"
};
var en = {
  "panel.label": "Test menu",
  "page.title": "Test menu",
  "page.body": "This is a test menu"
};

// src/client/index.ts
var inject = ["slots", "locale"];
var PANEL_ID = "menu-example";
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "menu-example: dictionaries");
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist",
    id: PANEL_ID,
    order: 100,
    locale: NS,
    label: () => t("panel.label")
  }, MenuIcon)), "menu-example: sidebar entry");
  ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({
    name: "main",
    key: PANEL_ID,
    locale: NS
  }, MenuPage)), "menu-example: panel page");
}
return module.exports}});