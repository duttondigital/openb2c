import { button, card, detail, form, pagination, reset, table, theme } from "../ui/styles";
import { shellBaseStyles } from "../ui/shell";

const documentBase = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ob-shell-bg: #f7f7f4;
    --ob-shell-text: #242521;
    --ob-shell-border: #dedbd2;
    --ob-shell-focus: 0 0 0 3px rgba(17, 17, 17, 0.16);
    --ob-primary: #111111;
    --ob-primary-hover: #000000;
    --ob-primary-soft: #eeeeee;
    --ob-accent: #8f3f46;
    --ob-accent-soft: #f7ebe8;
    --ob-bg: #ffffff;
    --ob-bg-alt: #f7f7f4;
    --ob-bg-subtle: #fbfbf9;
    --ob-border: #dedbd2;
    --ob-border-strong: #c8c2b5;
    --ob-text: #242521;
    --ob-text-muted: #68675f;
    --ob-danger: #b42318;
    --ob-danger-soft: #fef3f2;
    --ob-success: #20745f;
    --ob-success-soft: #e8f3ef;
    --ob-warning: #946200;
    --ob-warning-soft: #fff4d6;
    --ob-radius: 8px;
    --ob-focus: 0 0 0 3px rgba(17, 17, 17, 0.16);
    --ob-shadow-sm: 0 1px 2px rgba(36, 37, 33, 0.06);
    --ob-nav-width: 248px;
    --ob-font: system-ui, -apple-system, sans-serif;
  }
  html {
    min-height: 100%;
    background: var(--ob-shell-bg);
  }
  body {
    background: var(--ob-shell-bg);
    min-height: 100%;
  }
  ob-app,
  ob-admin-app {
    display: block;
    min-height: 100vh;
  }
`;

const publicShell = `
  ${shellBaseStyles("ob-app")}
  ob-app .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 72px;
    padding: 16px 32px;
    border-bottom: 1px solid #dedbd2;
    background: #ffffff;
  }
  ob-app .brand {
    display: grid;
    gap: 3px;
  }
  ob-app .title {
    font-weight: 800;
    font-size: 17px;
    line-height: 1.2;
  }
  ob-app .description {
    color: #68675f;
    font-size: 12px;
    line-height: 1.4;
  }
  ob-app .top-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  ob-app .nav-button {
    min-height: 36px;
    padding: 8px 12px;
    border: 1px solid #111111;
    border-radius: 8px;
    background: #111111;
    color: white;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }
  ob-app ob-route-outlet {
    display: block;
    min-width: 0;
    width: 100%;
    max-width: 1280px;
    padding: 32px;
    margin: 0 auto;
  }
  ob-app ob-route-outlet > main:focus {
    outline: none;
  }
  ob-app ob-route-outlet .empty {
    padding: 40px;
    color: #68675f;
  }
  @media (max-width: 780px) {
    ob-app .topbar {
      align-items: flex-start;
      flex-direction: column;
      padding: 16px 20px;
    }
    ob-app .top-actions {
      width: 100%;
    }
    ob-app .nav-button {
      flex: 1;
    }
    ob-app ob-route-outlet {
      padding: 20px;
    }
  }
`;

const adminShell = `
  ${shellBaseStyles("ob-admin-app")}
  ob-admin-app {
    --ob-nav-width: 248px;
  }
  ob-admin-app .app {
    display: flex;
    min-height: 100vh;
  }
  ob-admin-app ob-nav {
    flex: 0 0 var(--ob-nav-width);
  }
  ob-admin-app ob-admin-route-outlet {
    flex: 1;
    min-width: 0;
    width: 100%;
    max-width: 1280px;
    padding: 32px;
    margin: 0 auto;
  }
  ob-admin-app ob-admin-route-outlet > main:focus {
    outline: none;
  }
  ob-admin-app ob-admin-route-outlet .empty {
    padding: 40px;
    color: #68675f;
  }
  @media (max-width: 780px) {
    ob-admin-app .app {
      flex-direction: column;
    }
    ob-admin-app ob-nav {
      flex-basis: auto;
    }
    ob-admin-app ob-admin-route-outlet {
      padding: 20px;
    }
  }
`;

const authMenu = `
  :host(ob-auth-menu) {
    display: inline-block;
    position: relative;
    font-family: system-ui, -apple-system, sans-serif;
  }
  :host(ob-auth-menu[placement="sidebar"]) {
    display: block;
    width: 100%;
  }
  :host(ob-auth-menu) .account-button {
    min-height: 36px;
    padding: 8px 12px;
    border: 1px solid var(--ob-border-strong);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    color: var(--ob-text);
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }
  :host(ob-auth-menu[placement="sidebar"]) .account-button {
    width: 100%;
    text-align: left;
  }
  :host(ob-auth-menu) .account-button:hover {
    background: var(--ob-bg-alt);
  }
  :host(ob-auth-menu) .menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 20;
    width: min(340px, calc(100vw - 32px));
    padding: 16px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    box-shadow: var(--ob-shadow);
  }
  :host(ob-auth-menu[placement="sidebar"]) .menu {
    position: static;
    width: 100%;
    margin-top: 8px;
    box-shadow: var(--ob-shadow-sm);
  }
  :host(ob-auth-menu) .menu-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  :host(ob-auth-menu) .menu-title {
    font-size: 16px;
    line-height: 1.3;
    font-weight: 800;
  }
  :host(ob-auth-menu) .menu-subtitle {
    color: var(--ob-text-muted);
    font-size: 13px;
    line-height: 1.4;
    margin-top: 2px;
  }
  :host(ob-auth-menu) .close {
    width: 32px;
    min-height: 32px;
    padding: 0;
    border: 1px solid var(--ob-border);
    background: var(--ob-bg-subtle);
    color: var(--ob-text);
    font-size: 18px;
    line-height: 1;
  }
  :host(ob-auth-menu) .session {
    display: grid;
    gap: 12px;
  }
  :host(ob-auth-menu) .session-box {
    padding: 12px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg-subtle);
  }
  :host(ob-auth-menu) .session-box strong,
  :host(ob-auth-menu) .session-box span {
    display: block;
  }
  :host(ob-auth-menu) .session-box span {
    color: var(--ob-text-muted);
    font-size: 13px;
    margin-top: 3px;
  }
  :host(ob-auth-menu) .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  :host(ob-auth-menu) .actions button {
    flex: 1;
  }
  @media (max-width: 560px) {
    :host(ob-auth-menu) { position: static; }
    :host(ob-auth-menu) .menu {
      left: 16px;
      right: 16px;
      width: auto;
    }
  }
`;

const commerce = `
  :host(ob-commerce) { display: block; }
  :host(ob-commerce) .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin: 0 auto 18px;
    max-width: 900px;
  }
  :host(ob-commerce) .eyebrow {
    color: var(--ob-text-muted);
    font-size: 13px;
    font-weight: 800;
    margin-bottom: 4px;
  }
  :host(ob-commerce) .page-header h1 {
    font-size: 28px;
    line-height: 1.15;
    font-weight: 800;
  }
  :host(ob-commerce) .cart-chip {
    min-height: 36px;
    padding: 8px 12px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    color: var(--ob-text);
    font-size: 13px;
    font-weight: 800;
  }
  :host(ob-commerce) .commerce-shell {
    max-width: 900px;
    margin: 0 auto;
  }
  :host(ob-commerce) .panel {
    background: var(--ob-bg);
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    padding: 20px;
    box-shadow: var(--ob-shadow-sm);
  }
  :host(ob-commerce) .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
  }
  :host(ob-commerce) .panel-header h2 {
    font-size: 20px;
    line-height: 1.25;
    font-weight: 800;
  }
  :host(ob-commerce) .step {
    color: var(--ob-text-muted);
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0;
  }
  :host(ob-commerce) .selector-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }
  :host(ob-commerce) .selector-card {
    align-items: stretch;
    justify-content: space-between;
    min-height: 112px;
    padding: 14px;
    text-align: left;
    background: var(--ob-bg);
    border: 1px solid var(--ob-border);
    color: var(--ob-text);
    flex-direction: column;
  }
  :host(ob-commerce) .selector-card:hover {
    background: var(--ob-bg-subtle);
    border-color: var(--ob-border-strong);
  }
  :host(ob-commerce) .selector-card.selected {
    border-color: var(--ob-primary);
    box-shadow: inset 0 0 0 1px var(--ob-primary);
  }
  :host(ob-commerce) .selector-title {
    font-size: 15px;
    line-height: 1.3;
    font-weight: 800;
    overflow-wrap: anywhere;
  }
  :host(ob-commerce) .selector-meta {
    display: grid;
    gap: 4px;
    color: var(--ob-text-muted);
    font-size: 13px;
    line-height: 1.35;
  }
  :host(ob-commerce) .variant-card {
    min-height: 86px;
  }
  :host(ob-commerce) .configure-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  :host(ob-commerce) .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
  }
  :host(ob-commerce) .cart-list {
    display: grid;
    gap: 10px;
  }
  :host(ob-commerce) .cart-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
    padding: 12px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg-subtle);
  }
  :host(ob-commerce) .cart-line h3 {
    font-size: 14px;
    line-height: 1.3;
    font-weight: 800;
    margin-bottom: 4px;
  }
  :host(ob-commerce) .cart-line p,
  :host(ob-commerce) .notice {
    color: var(--ob-text-muted);
    font-size: 13px;
    line-height: 1.4;
  }
  :host(ob-commerce) .notice {
    margin-top: 12px;
  }
  :host(ob-commerce) .icon-btn {
    width: 34px;
    min-height: 34px;
    padding: 0;
    font-size: 18px;
    line-height: 1;
  }
  :host(ob-commerce) .summary {
    display: grid;
    gap: 8px;
    font-size: 14px;
  }
  :host(ob-commerce) .summary-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0;
    border-bottom: 1px solid var(--ob-border);
  }
  :host(ob-commerce) .summary-row:last-child { border-bottom: 0; }
  :host(ob-commerce) .summary-row span:first-child {
    color: var(--ob-text-muted);
    font-weight: 700;
  }
  :host(ob-commerce) .summary-row span:last-child {
    text-align: right;
    font-weight: 800;
    overflow-wrap: anywhere;
  }
  :host(ob-commerce) .total-row {
    font-size: 16px;
  }
  :host(ob-commerce) .empty {
    color: var(--ob-text-muted);
    font-size: 14px;
    line-height: 1.45;
    padding: 18px;
    border: 1px dashed var(--ob-border-strong);
    border-radius: var(--ob-radius);
    background: var(--ob-bg-subtle);
  }
  @media (max-width: 680px) {
    :host(ob-commerce) .page-header {
      align-items: stretch;
      flex-direction: column;
    }
    :host(ob-commerce) .page-header h1 { font-size: 24px; }
    :host(ob-commerce) .panel-header { flex-direction: column; }
    :host(ob-commerce) .configure-grid { grid-template-columns: 1fr; }
    :host(ob-commerce) .actions button,
    :host(ob-commerce) .cart-chip { width: 100%; }
  }
`;

const nav = `
  :host(ob-nav) {
    position: sticky;
    top: 0;
    height: 100vh;
    z-index: 2;
  }
  :host(ob-nav) nav {
    width: var(--ob-nav-width);
    min-height: 100vh;
    background: var(--ob-bg);
    border-right: 1px solid var(--ob-border);
    padding: 18px 12px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  :host(ob-nav) .brand {
    padding: 0 8px 14px;
    border-bottom: 1px solid var(--ob-border);
  }
  :host(ob-nav) .title {
    font-weight: 800;
    font-size: 17px;
    line-height: 1.2;
  }
  :host(ob-nav) .description {
    color: var(--ob-text-muted);
    font-size: 12px;
    line-height: 1.4;
    margin-top: 5px;
  }
  :host(ob-nav) .group { display: grid; gap: 4px; }
  :host(ob-nav) .account {
    margin-top: auto;
    padding: 14px 8px 0;
    border-top: 1px solid var(--ob-border);
  }
  :host(ob-nav) .group-title {
    padding: 0 8px 4px;
    color: var(--ob-text-muted);
    font-size: 12px;
    font-weight: 800;
  }
  :host(ob-nav) .nav-link {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 38px;
    padding: 8px 10px;
    background: transparent;
    color: var(--ob-text);
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    text-decoration: none;
    border-radius: var(--ob-radius);
    border: 1px solid transparent;
    text-align: left;
    cursor: pointer;
  }
  :host(ob-nav) .nav-link:hover {
    background: var(--ob-bg-alt);
    border-color: var(--ob-border);
    text-decoration: none;
  }
  :host(ob-nav) .nav-link.active {
    background: var(--ob-primary);
    color: white;
    border-color: var(--ob-primary);
    box-shadow: var(--ob-shadow-sm);
  }
  @media (max-width: 780px) {
    :host(ob-nav) {
      position: static;
      height: auto;
    }
    :host(ob-nav) nav {
      width: 100%;
      min-height: auto;
      border-right: 0;
      border-bottom: 1px solid var(--ob-border);
    }
  }
`;

const entityList = `
  :host(ob-entity-list) .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  :host(ob-entity-list) .eyebrow {
    color: var(--ob-text-muted);
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  :host(ob-entity-list) .header h1 {
    font-size: 26px;
    line-height: 1.15;
    font-weight: 800;
  }
  :host(ob-entity-list) .arrow { font-size: 11px; margin-left: 6px; }
  @media (max-width: 640px) {
    :host(ob-entity-list) .header { align-items: flex-start; flex-direction: column; }
    :host(ob-entity-list) .header h1 { font-size: 22px; }
    :host(ob-entity-list) [data-action="create"] { width: 100%; }
  }
`;

const entityForm = `
  :host(ob-entity-form) { max-width: 760px; display: block; }
  :host(ob-entity-form) .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  :host(ob-entity-form) .form-group.full { grid-column: 1 / -1; }
  :host(ob-entity-form) .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 4px;
  }
  @media (max-width: 720px) {
    :host(ob-entity-form) .card-header { align-items: flex-start; flex-direction: column; }
    :host(ob-entity-form) .form-grid { grid-template-columns: 1fr; }
    :host(ob-entity-form) .actions button { width: 100%; }
  }
`;

const entityDetail = `
  :host(ob-entity-detail) .header-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  :host(ob-entity-detail) .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px solid var(--ob-border);
  }
  :host(ob-entity-detail) .delete-confirm {
    margin: 0 0 14px;
    padding: 10px 12px;
    border-radius: var(--ob-radius);
    background: var(--ob-danger-soft);
    color: var(--ob-danger);
    font-size: 13px;
    font-weight: 600;
  }
  :host(ob-entity-detail) .badge {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--ob-bg-alt);
    color: var(--ob-text-muted);
    font-size: 12px;
    font-weight: 700;
  }
  :host(ob-entity-detail) .badge.success { background: var(--ob-success-soft); color: var(--ob-success); }
  :host(ob-entity-detail) .badge.warning { background: var(--ob-warning-soft); color: var(--ob-warning); }
  :host(ob-entity-detail) .badge.danger { background: var(--ob-danger-soft); color: var(--ob-danger); }
  @media (max-width: 720px) {
    :host(ob-entity-detail) .card-header { align-items: flex-start; flex-direction: column; }
    :host(ob-entity-detail) .header-actions,
    :host(ob-entity-detail) .header-actions button,
    :host(ob-entity-detail) .actions button { width: 100%; }
  }
`;

const operationButton = `
  :host(ob-operation-btn) .msg { font-size: 13px; margin-top: 4px; }
  :host(ob-operation-btn) .msg.error { color: var(--ob-danger, #dc2626); }
  :host(ob-operation-btn) .msg.success { color: var(--ob-success, #16a34a); }
`;

function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim() + "\n";
}

function stylesheet(parts: string[]): string {
  return minifyCss(parts.join("\n"));
}

export function genPublicStylesheet(): string {
  return stylesheet([
    documentBase,
    publicShell,
    theme,
    reset,
    form,
    button,
    authMenu,
    commerce,
  ]);
}

export function genAdminStylesheet(): string {
  return stylesheet([
    documentBase,
    adminShell,
    theme,
    reset,
    form,
    button,
    table,
    pagination,
    card,
    detail,
    authMenu,
    nav,
    entityList,
    entityForm,
    entityDetail,
    operationButton,
  ]);
}
