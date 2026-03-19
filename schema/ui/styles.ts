export const theme = `
  :host {
    --ob-primary: #2563eb;
    --ob-primary-hover: #1d4ed8;
    --ob-bg: #ffffff;
    --ob-bg-alt: #f8fafc;
    --ob-border: #e2e8f0;
    --ob-text: #1e293b;
    --ob-text-muted: #64748b;
    --ob-danger: #dc2626;
    --ob-success: #16a34a;
    --ob-radius: 6px;
    --ob-nav-width: 220px;
    --ob-font: system-ui, -apple-system, sans-serif;
    font-family: var(--ob-font);
    color: var(--ob-text);
  }
`;

export const reset = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  a { color: var(--ob-primary); text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

export const button = `
  button, .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    background: var(--ob-bg);
    color: var(--ob-text);
    font-size: 14px;
    cursor: pointer;
    transition: background 0.15s;
  }
  button:hover { background: var(--ob-bg-alt); }
  button.primary {
    background: var(--ob-primary);
    color: white;
    border-color: var(--ob-primary);
  }
  button.primary:hover { background: var(--ob-primary-hover); }
  button.danger {
    background: var(--ob-danger);
    color: white;
    border-color: var(--ob-danger);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const table = `
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  th, td {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid var(--ob-border);
  }
  th {
    font-weight: 600;
    color: var(--ob-text-muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
    user-select: none;
  }
  th:hover { color: var(--ob-text); }
  tr:hover td { background: var(--ob-bg-alt); }
`;

export const form = `
  .form-group {
    margin-bottom: 16px;
  }
  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 4px;
    color: var(--ob-text-muted);
  }
  label .required { color: var(--ob-danger); }
  input, select, textarea {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    font-size: 14px;
    font-family: var(--ob-font);
    color: var(--ob-text);
    background: var(--ob-bg);
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: var(--ob-primary);
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
  }
  .error-msg {
    color: var(--ob-danger);
    font-size: 13px;
    margin-top: 8px;
    padding: 8px;
    background: #fef2f2;
    border-radius: var(--ob-radius);
  }
`;

export const card = `
  .card {
    background: var(--ob-bg);
    border: 1px solid var(--ob-border);
    border-radius: var(--ob-radius);
    padding: 20px;
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .card-header h2 {
    font-size: 18px;
    font-weight: 600;
  }
`;

export const detail = `
  dl {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 8px 16px;
    font-size: 14px;
  }
  dt {
    font-weight: 500;
    color: var(--ob-text-muted);
  }
  dd { color: var(--ob-text); }
`;

export const pagination = `
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    font-size: 13px;
    color: var(--ob-text-muted);
  }
  .pagination .controls {
    display: flex;
    gap: 8px;
  }
`;
