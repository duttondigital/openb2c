export const theme = `
  :host {
    --ob-primary: #2f5d55;
    --ob-primary-hover: #244a44;
    --ob-primary-soft: #e7f1ef;
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
    --ob-focus: 0 0 0 3px rgba(47, 93, 85, 0.18);
    --ob-shadow-sm: 0 1px 2px rgba(36, 37, 33, 0.06);
    --ob-nav-width: 248px;
    --ob-font: system-ui, -apple-system, sans-serif;
    font-family: var(--ob-font);
    color: var(--ob-text);
    display: block;
  }
`;

export const reset = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  a { color: var(--ob-primary); text-decoration: none; }
  a:hover { text-decoration: underline; text-underline-offset: 3px; }
  a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
    outline: none;
    box-shadow: var(--ob-focus);
  }
  .muted { color: var(--ob-text-muted); }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
`;

export const button = `
  button, .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 36px;
    padding: 8px 14px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    color: var(--ob-text);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
  }
  button:hover { background: var(--ob-bg-alt); border-color: var(--ob-border-strong); }
  button.primary {
    background: var(--ob-primary);
    color: white;
    border-color: var(--ob-primary);
  }
  button.primary:hover { background: var(--ob-primary-hover); }
  button.secondary {
    background: var(--ob-primary-soft);
    color: var(--ob-primary-hover);
    border-color: transparent;
  }
  button.secondary:hover { background: #dcebe8; border-color: transparent; }
  button.danger {
    background: var(--ob-danger-soft);
    color: var(--ob-danger);
    border-color: transparent;
  }
  button.danger:hover {
    background: var(--ob-danger);
    color: white;
    border-color: var(--ob-danger);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
  .button-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
`;

export const table = `
  .table-wrap {
    overflow: auto;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    box-shadow: var(--ob-shadow-sm);
  }
  table {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
    font-size: 14px;
    background: var(--ob-bg);
  }
  th, td {
    text-align: left;
    padding: 12px 14px;
    border-bottom: 1px solid var(--ob-border);
    vertical-align: middle;
  }
  th {
    font-weight: 600;
    color: var(--ob-text-muted);
    font-size: 12px;
    letter-spacing: 0;
    background: var(--ob-bg-subtle);
    white-space: nowrap;
  }
  tbody tr:last-child td { border-bottom: 0; }
  .sort-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    min-height: 0;
    padding: 0;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
  }
  .sort-btn:hover { color: var(--ob-text); background: transparent; text-decoration: underline; text-underline-offset: 3px; }
  tr:hover td { background: var(--ob-bg-alt); }
  td { color: var(--ob-text); }
  .cell-muted { color: var(--ob-text-muted); }
  .row-action { font-weight: 600; }
  .empty-state {
    padding: 32px 20px;
    text-align: center;
    color: var(--ob-text-muted);
  }
  .badge {
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
  .badge.success { background: var(--ob-success-soft); color: var(--ob-success); }
  .badge.warning { background: var(--ob-warning-soft); color: var(--ob-warning); }
  .badge.danger { background: var(--ob-danger-soft); color: var(--ob-danger); }
`;

export const form = `
  form {
    display: grid;
    gap: 16px;
  }
  .form-group {
    display: grid;
    gap: 6px;
  }
  label {
    display: block;
    font-size: 13px;
    font-weight: 700;
    color: var(--ob-text);
  }
  label .required { color: var(--ob-danger); }
  input, select, textarea {
    width: 100%;
    min-height: 40px;
    padding: 9px 11px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    font-size: 14px;
    font-family: var(--ob-font);
    color: var(--ob-text);
    background: var(--ob-bg);
  }
  textarea {
    min-height: 96px;
    resize: vertical;
  }
  input:focus, select:focus, textarea:focus {
    border-color: var(--ob-primary);
    box-shadow: var(--ob-focus);
  }
  input::placeholder, textarea::placeholder {
    color: #98958d;
  }
  .error-msg {
    color: var(--ob-danger);
    font-size: 13px;
    font-weight: 600;
    padding: 10px 12px;
    background: var(--ob-danger-soft);
    border: 1px solid #fecdca;
    border-radius: var(--ob-radius);
  }
  .help-text {
    color: var(--ob-text-muted);
    font-size: 12px;
  }
`;

export const card = `
  .card {
    background: var(--ob-bg);
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    padding: 22px;
    box-shadow: var(--ob-shadow-sm);
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  .card-header h1,
  .card-header h2 {
    font-size: 20px;
    line-height: 1.2;
    font-weight: 700;
  }
  .card-header p {
    color: var(--ob-text-muted);
    font-size: 13px;
    margin-top: 4px;
  }
`;

export const detail = `
  dl {
    display: grid;
    grid-template-columns: minmax(140px, 0.32fr) minmax(0, 1fr);
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    overflow: hidden;
    font-size: 14px;
    background: var(--ob-bg);
  }
  dt, dd {
    padding: 12px 14px;
    border-bottom: 1px solid var(--ob-border);
  }
  dt {
    font-weight: 700;
    color: var(--ob-text-muted);
    background: var(--ob-bg-subtle);
  }
  dd {
    color: var(--ob-text);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  dt:last-of-type, dd:last-of-type { border-bottom: 0; }
  .status-line {
    margin-top: 12px;
    font-size: 13px;
    font-weight: 600;
  }
  @media (max-width: 640px) {
    dl { grid-template-columns: 1fr; }
    dt { border-bottom: 0; padding-bottom: 4px; }
    dd { padding-top: 0; }
  }
`;

export const pagination = `
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 0;
    font-size: 13px;
    color: var(--ob-text-muted);
  }
  .pagination .controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  @media (max-width: 640px) {
    .pagination {
      align-items: flex-start;
      flex-direction: column;
    }
  }
`;
