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
    max-width: 100%;
    overflow-x: hidden;
    background: var(--ob-shell-bg);
  }
  body {
    background: var(--ob-shell-bg);
    min-height: 100%;
    max-width: 100%;
    overflow-x: hidden;
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
  ob-app .brand-lockup {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 12px;
  }
  ob-app .brand-logo {
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
    object-fit: contain;
  }
  ob-app .brand-copy {
    display: grid;
    min-width: 0;
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
    justify-content: flex-end;
    margin-left: auto;
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
    overflow-x: hidden;
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
`;

const authPanel = `
  :host(ob-auth-panel) {
    display: block;
    font-family: system-ui, -apple-system, sans-serif;
  }
  :host(ob-auth-panel) .auth-panel {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    box-shadow: var(--ob-shadow-sm);
  }
  :host(ob-auth-panel) .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  :host(ob-auth-panel) .panel-title {
    font-size: 16px;
    line-height: 1.3;
    font-weight: 800;
  }
  :host(ob-auth-panel) .panel-subtitle {
    color: var(--ob-text-muted);
    font-size: 13px;
    line-height: 1.4;
    margin-top: 2px;
  }
  :host(ob-auth-panel) .session {
    display: grid;
    gap: 12px;
  }
  :host(ob-auth-panel) .session-box {
    padding: 12px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg-subtle);
  }
  :host(ob-auth-panel) .session-box strong,
  :host(ob-auth-panel) .session-box span {
    display: block;
  }
  :host(ob-auth-panel) .session-box span {
    color: var(--ob-text-muted);
    font-size: 13px;
    margin-top: 3px;
  }
  :host(ob-auth-panel) .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  :host(ob-auth-panel) .actions button {
    flex: 1;
  }
`;

const authPage = `
  ob-auth-page {
    display: block;
    max-width: 520px;
    margin: 0 auto;
  }
  ob-auth-page[signed-in] {
    max-width: 860px;
  }
  ob-auth-page .page-header {
    margin-bottom: 18px;
  }
  ob-auth-page h1 {
    font-size: 28px;
    line-height: 1.15;
    font-weight: 800;
  }
  ob-auth-page p {
    color: var(--ob-text-muted);
    font-size: 14px;
    line-height: 1.45;
    margin-top: 8px;
  }
`;

const accountSummary = `
  :host(ob-account-summary) {
    display: block;
    margin-bottom: 16px;
    font-family: system-ui, -apple-system, sans-serif;
  }
  :host(ob-account-summary) .account-grid {
    display: grid;
    gap: 16px;
  }
  :host(ob-account-summary) .account-section {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    box-shadow: var(--ob-shadow-sm);
  }
  :host(ob-account-summary) .section-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  :host(ob-account-summary) h2 {
    font-size: 17px;
    line-height: 1.25;
    font-weight: 800;
  }
  :host(ob-account-summary) h3 {
    color: var(--ob-text-muted);
    font-size: 12px;
    font-weight: 800;
    margin-bottom: 8px;
    text-transform: uppercase;
  }
  :host(ob-account-summary) .section-header span,
  :host(ob-account-summary) .empty,
  :host(ob-account-summary) li span {
    color: var(--ob-text-muted);
    font-size: 13px;
  }
  :host(ob-account-summary) .activity-group + .activity-group {
    border-top: 1px solid var(--ob-border);
    padding-top: 12px;
  }
  :host(ob-account-summary) ul {
    display: grid;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  :host(ob-account-summary) li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 10px 0;
    border-top: 1px solid var(--ob-border-subtle, #ece7df);
  }
  :host(ob-account-summary) li:first-child {
    border-top: 0;
  }
  :host(ob-account-summary) li strong,
  :host(ob-account-summary) li span {
    display: block;
  }
  :host(ob-account-summary) .badge {
    flex: 0 0 auto;
    padding: 4px 8px;
    border-radius: var(--ob-radius);
    border: 1px solid var(--ob-border);
    color: var(--ob-text);
    font-size: 12px;
    font-weight: 800;
    background: var(--ob-bg-subtle);
  }
  :host(ob-account-summary) .badge.success {
    border-color: color-mix(in srgb, var(--ob-success, #16a34a) 35%, var(--ob-border));
    color: var(--ob-success, #16a34a);
  }
  :host(ob-account-summary) .badge.warning {
    border-color: color-mix(in srgb, var(--ob-warning, #ca8a04) 35%, var(--ob-border));
    color: var(--ob-warning, #ca8a04);
  }
  :host(ob-account-summary) .badge.danger {
    border-color: color-mix(in srgb, var(--ob-danger, #dc2626) 35%, var(--ob-border));
    color: var(--ob-danger, #dc2626);
  }
  @media (max-width: 640px) {
    :host(ob-account-summary) .section-header,
    :host(ob-account-summary) li {
      align-items: flex-start;
      flex-direction: column;
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
  :host(ob-commerce) .split-actions {
    align-items: center;
    justify-content: flex-end;
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
    :host(ob-commerce) .split-actions { align-items: stretch; }
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
  :host(ob-nav) .brand-lockup {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 10px;
  }
  :host(ob-nav) .brand-logo {
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    object-fit: contain;
  }
  :host(ob-nav) .brand-copy {
    display: grid;
    min-width: 0;
    gap: 5px;
  }
  :host(ob-nav) .menu-toggle {
    display: none;
    width: 38px;
    min-width: 38px;
    padding: 8px;
  }
  :host(ob-nav) .menu-toggle span {
    display: block;
    width: 18px;
    height: 2px;
    border-radius: 999px;
    background: currentColor;
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
  :host(ob-nav) .nav-groups {
    display: grid;
    gap: 18px;
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
    justify-content: flex-start;
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
      padding: 12px;
      gap: 12px;
    }
    :host(ob-nav) .brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0;
      border-bottom: 0;
    }
    :host(ob-nav) .menu-toggle {
      display: inline-grid;
      place-items: center;
      gap: 4px;
    }
    :host(ob-nav) .nav-groups,
    :host(ob-nav) .account {
      display: none;
    }
    :host(ob-nav) nav.expanded .nav-groups,
    :host(ob-nav) nav.expanded .account {
      display: grid;
    }
    :host(ob-nav) nav.expanded .nav-groups {
      gap: 14px;
    }
  }
`;

const adminWorkspace = `
  :host(ob-admin-workspace) .workspace {
    display: grid;
    gap: 18px;
    min-width: 0;
    max-width: 100%;
  }
  :host(ob-admin-workspace) ob-entity-list {
    display: block;
    min-width: 0;
    max-width: 100%;
  }
  :host(ob-admin-workspace) .workspace-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }
  :host(ob-admin-workspace) .eyebrow {
    color: var(--ob-text-muted);
    font-size: 13px;
    font-weight: 800;
    margin-bottom: 4px;
  }
  :host(ob-admin-workspace) h1 {
    font-size: 28px;
    line-height: 1.15;
    font-weight: 800;
  }
  :host(ob-admin-workspace) .workspace-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  :host(ob-admin-workspace) .workspace-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }
  :host(ob-admin-workspace) .workspace-panel {
    display: grid;
    align-content: start;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    box-shadow: var(--ob-shadow-sm);
  }
  :host(ob-admin-workspace) .workspace-panel h2 {
    font-size: 13px;
    line-height: 1.2;
    font-weight: 800;
    color: var(--ob-text-muted);
  }
  :host(ob-admin-workspace) .link-grid {
    display: grid;
    gap: 8px;
  }
  :host(ob-admin-workspace) .link-card {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg-subtle);
  }
  :host(ob-admin-workspace) .link-card:hover {
    border-color: var(--ob-border-strong);
    background: var(--ob-bg-alt);
    text-decoration: none;
  }
  :host(ob-admin-workspace) .link-card strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }
  :host(ob-admin-workspace) .link-card span {
    color: var(--ob-text-muted);
    font-size: 12px;
  }
  :host(ob-admin-workspace) .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  :host(ob-admin-workspace) .chip {
    display: inline-flex;
    min-height: 26px;
    align-items: center;
    padding: 4px 9px;
    border-radius: 999px;
    background: var(--ob-bg-alt);
    color: var(--ob-text-muted);
    font-size: 12px;
    font-weight: 700;
  }
  :host(ob-admin-workspace) .record-panels {
    display: grid;
    gap: 16px;
  }
  :host(ob-admin-workspace) .record-panel {
    display: grid;
    gap: 14px;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    box-shadow: var(--ob-shadow-sm);
  }
  :host(ob-admin-workspace) .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  :host(ob-admin-workspace) .panel-header h2 {
    font-size: 16px;
    font-weight: 800;
    line-height: 1.25;
  }
  :host(ob-admin-workspace) .panel-header p,
  :host(ob-admin-workspace) .muted {
    color: var(--ob-text-muted);
    font-size: 13px;
  }
  :host(ob-admin-workspace) .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  :host(ob-admin-workspace) .summary-grid div {
    display: grid;
    gap: 3px;
  }
  :host(ob-admin-workspace) dt {
    color: var(--ob-text-muted);
    font-size: 12px;
    font-weight: 800;
  }
  :host(ob-admin-workspace) dd {
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  :host(ob-admin-workspace) .panel-actions,
  :host(ob-admin-workspace) .inline-actions,
  :host(ob-admin-workspace) .segmented,
  :host(ob-admin-workspace) .call-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  :host(ob-admin-workspace) .segmented button.active {
    background: var(--ob-primary);
    border-color: var(--ob-primary);
    color: white;
  }
  :host(ob-admin-workspace) .timeline,
  :host(ob-admin-workspace) .compact-list,
  :host(ob-admin-workspace) .material-list {
    display: grid;
    gap: 8px;
  }
  :host(ob-admin-workspace) .timeline-item,
  :host(ob-admin-workspace) .compact-row,
  :host(ob-admin-workspace) .material-card {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg-subtle);
  }
  :host(ob-admin-workspace) .compact-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
  :host(ob-admin-workspace) .timeline-item:hover,
  :host(ob-admin-workspace) .compact-row:hover,
  :host(ob-admin-workspace) .material-card:hover {
    border-color: var(--ob-border-strong);
    text-decoration: none;
  }
  :host(ob-admin-workspace) .timeline-item time,
  :host(ob-admin-workspace) .timeline-item span,
  :host(ob-admin-workspace) .version-note span {
    color: var(--ob-text-muted);
    font-size: 12px;
  }
  :host(ob-admin-workspace) .matrix-wrap {
    max-width: 100%;
    overflow-x: auto;
  }
  :host(ob-admin-workspace) .matrix {
    width: 100%;
    min-width: 560px;
    border-collapse: collapse;
  }
  :host(ob-admin-workspace) .matrix th,
  :host(ob-admin-workspace) .matrix td {
    padding: 10px;
    border-bottom: 1px solid var(--ob-border);
    vertical-align: top;
    text-align: left;
  }
  :host(ob-admin-workspace) .matrix-cell {
    display: grid;
    gap: 6px;
    min-width: 120px;
  }
  :host(ob-admin-workspace) .matrix-add {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    justify-content: center;
    padding: 5px 8px;
    border: 1px dashed var(--ob-border-strong);
    border-radius: var(--ob-radius);
    color: var(--ob-text-muted);
  }
  :host(ob-admin-workspace) .material-card {
    grid-template-columns: minmax(0, 1fr) minmax(180px, .7fr);
    align-items: start;
  }
  :host(ob-admin-workspace) .version-note {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  :host(ob-admin-workspace) .empty-state {
    color: var(--ob-text-muted);
    padding: 12px;
    border: 1px dashed var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg-subtle);
  }
  @media (max-width: 720px) {
    :host(ob-admin-workspace) .workspace-header {
      align-items: stretch;
      flex-direction: column;
    }
    :host(ob-admin-workspace) .workspace-actions,
    :host(ob-admin-workspace) .workspace-actions a {
      width: 100%;
    }
    :host(ob-admin-workspace) .panel-header,
    :host(ob-admin-workspace) .material-card {
      grid-template-columns: 1fr;
      flex-direction: column;
    }
  }
`;

const entityList = `
  :host(ob-entity-list) {
    display: block;
    min-width: 0;
    max-width: 100%;
  }
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
  :host(ob-entity-list) .filter-bar {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    align-items: end;
    gap: 12px;
    margin-bottom: 14px;
    padding: 14px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    box-shadow: var(--ob-shadow-sm);
  }
  :host(ob-entity-list) .filter-control {
    display: grid;
    gap: 6px;
  }
  :host(ob-entity-list) .filter-actions {
    display: flex;
    justify-content: flex-end;
  }
  :host(ob-entity-list) .column-label {
    font-weight: 600;
  }
  .entity-table {
    table-layout: fixed;
  }
  .entity-table th,
  .entity-table td {
    max-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .entity-table th:last-child,
  .entity-table td:last-child {
    width: 86px;
  }
  .entity-table .sort-btn,
  .entity-table .column-label,
  .entity-table .cell-value,
  .entity-table .cell-link,
  .entity-table .cell-muted,
  .entity-table .row-action {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .entity-table .badge {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :host(ob-entity-list) .arrow { font-size: 11px; margin-left: 6px; }
  :host(ob-entity-list) .empty-state {
    display: grid;
    justify-items: center;
    gap: 8px;
  }
  :host(ob-entity-list) .empty-state strong {
    color: var(--ob-text);
    font-size: 15px;
  }
  :host(ob-entity-list) .empty-state span {
    color: var(--ob-text-muted);
  }
  :host(ob-entity-list) .page-size {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ob-text-muted);
  }
  :host(ob-entity-list) .page-size select {
    min-height: 34px;
    width: auto;
    min-width: 72px;
  }
  @media (max-width: 640px) {
    :host(ob-entity-list) .header { align-items: flex-start; flex-direction: column; }
    :host(ob-entity-list) .header h1 { font-size: 22px; }
    :host(ob-entity-list) [data-action="create"] { width: 100%; }
    :host(ob-entity-list) .filter-actions,
    :host(ob-entity-list) .filter-actions button { width: 100%; }
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
  :host(ob-entity-form) .form-group input[readonly],
  :host(ob-entity-form) .form-group textarea[readonly],
  :host(ob-entity-form) .form-group select:disabled {
    background: var(--ob-bg-alt);
    color: var(--ob-text-muted);
  }
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
  :host(ob-entity-detail) .section-title {
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 800;
    color: var(--ob-text-muted);
  }
  :host(ob-entity-detail) .related-section,
  :host(ob-entity-detail) .operation-section {
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px solid var(--ob-border);
  }
  :host(ob-entity-detail) .related-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }
  :host(ob-entity-detail) .related-group {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg-subtle);
  }
  :host(ob-entity-detail) .related-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  :host(ob-entity-detail) .related-header h2 {
    font-size: 15px;
    line-height: 1.25;
  }
  :host(ob-entity-detail) .related-header p {
    margin-top: 3px;
    color: var(--ob-text-muted);
    font-size: 12px;
  }
  :host(ob-entity-detail) .related-list {
    display: grid;
    gap: 6px;
  }
  :host(ob-entity-detail) .related-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
  }
  :host(ob-entity-detail) .related-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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
  :host(ob-entity-detail) .operation-confirm {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-top: 14px;
    padding: 12px;
    border: 1px solid var(--ob-warning);
    border-radius: var(--ob-radius);
    background: var(--ob-warning-soft);
    color: var(--ob-text);
  }
  :host(ob-entity-detail) .operation-confirm.danger {
    border-color: var(--ob-danger);
    background: var(--ob-danger-soft);
  }
  :host(ob-entity-detail) .operation-confirm p {
    margin: 4px 0 0;
    color: var(--ob-text-muted);
  }
  :host(ob-entity-detail) .confirm-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
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
    :host(ob-entity-detail) .operation-confirm,
    :host(ob-entity-detail) .confirm-actions,
    :host(ob-entity-detail) .confirm-actions button,
    :host(ob-entity-detail) .actions button { width: 100%; }
    :host(ob-entity-detail) .operation-confirm { flex-direction: column; }
  }
`;

const operationButton = `
  :host(ob-operation-btn) .msg { font-size: 13px; margin-top: 4px; }
  :host(ob-operation-btn) .msg.error { color: var(--ob-danger, #dc2626); }
  :host(ob-operation-btn) .msg.success { color: var(--ob-success, #16a34a); }
`;

const workflowBoard = `
  :host(ob-workflow-board) { display: block; }
  :host(ob-workflow-board) .workflow-page {
    display: grid;
    gap: 16px;
  }
  :host(ob-workflow-board) .workflow-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }
  :host(ob-workflow-board) .eyebrow {
    color: var(--ob-text-muted);
    font-size: 13px;
    font-weight: 800;
    margin-bottom: 4px;
  }
  :host(ob-workflow-board) h1 {
    font-size: 28px;
    line-height: 1.15;
    font-weight: 800;
  }
  :host(ob-workflow-board) .workflow-header p {
    color: var(--ob-text-muted);
    font-size: 14px;
    line-height: 1.45;
    margin-top: 6px;
  }
  :host(ob-workflow-board) .workflow-board {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 12px;
    align-items: start;
  }
  :host(ob-workflow-board) .workflow-lane {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  :host(ob-workflow-board) .lane-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
  }
  :host(ob-workflow-board) .lane-header h2 {
    font-size: 14px;
    line-height: 1.3;
    font-weight: 800;
  }
  :host(ob-workflow-board) .lane-header span {
    color: var(--ob-text-muted);
    font-size: 12px;
    font-weight: 800;
  }
  :host(ob-workflow-board) .lane-cards {
    display: grid;
    gap: 10px;
  }
  :host(ob-workflow-board) .workflow-card {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    box-shadow: var(--ob-shadow-sm);
  }
  :host(ob-workflow-board) .card-title {
    color: var(--ob-text);
    font-size: 15px;
    line-height: 1.3;
    font-weight: 800;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  :host(ob-workflow-board) .card-title:hover {
    text-decoration: underline;
  }
  :host(ob-workflow-board) .card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  :host(ob-workflow-board) .card-meta span {
    padding: 3px 7px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    color: var(--ob-text-muted);
    background: var(--ob-bg-subtle);
    font-size: 12px;
    line-height: 1.3;
    font-weight: 700;
  }
  :host(ob-workflow-board) .card-actions,
  :host(ob-workflow-board) .confirm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  :host(ob-workflow-board) .operation-confirm {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--ob-warning);
    border-radius: var(--ob-radius);
    background: var(--ob-warning-soft);
  }
  :host(ob-workflow-board) .operation-confirm.danger {
    border-color: var(--ob-danger);
    background: var(--ob-danger-soft);
  }
  :host(ob-workflow-board) .operation-confirm p {
    color: var(--ob-text-muted);
    font-size: 13px;
    line-height: 1.4;
  }
  :host(ob-workflow-board) .workflow-empty {
    color: var(--ob-text-muted);
    font-size: 13px;
    line-height: 1.45;
    padding: 14px;
    border: 1px dashed var(--ob-border-strong);
    border-radius: var(--ob-radius);
    background: var(--ob-bg-subtle);
  }
  @media (max-width: 780px) {
    :host(ob-workflow-board) .workflow-header {
      align-items: stretch;
      flex-direction: column;
    }
    :host(ob-workflow-board) .workflow-header a,
    :host(ob-workflow-board) .card-actions button,
    :host(ob-workflow-board) .confirm-actions button {
      width: 100%;
    }
  }
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
    authPanel,
    authPage,
    accountSummary,
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
    authPanel,
    authPage,
    accountSummary,
    nav,
    adminWorkspace,
    entityList,
    entityForm,
    entityDetail,
    workflowBoard,
    operationButton,
  ]);
}
