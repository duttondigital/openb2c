import type { ObApi } from "./components/ob-api";
import { escapeAttr } from "./format";

export const SHELL_OBSERVED_ATTRIBUTES = ["src", "api-base"];

export type ShellAttributes = {
  src: string;
  apiBase: string;
};

export function readShellAttributes(element: HTMLElement): ShellAttributes {
  return {
    src: element.getAttribute("src") || "openapi.json",
    apiBase: element.getAttribute("api-base") || "",
  };
}

export function renderApiProvider(attributes: ShellAttributes, children: string): string {
  return `
    <ob-api src="${escapeAttr(attributes.src)}" api-base="${escapeAttr(attributes.apiBase)}">
      ${children}
    </ob-api>
  `;
}

export function renderSkipLink(): string {
  return `<button class="skip-link" type="button" data-action="skip">Skip to content</button>`;
}

export function focusOutlet(root: ParentNode, selector: string) {
  const outlet = root.querySelector(selector) as HTMLElement & { focusContent?: () => void };
  outlet?.focusContent?.();
}

export function apiTitle(api: ObApi): string {
  return api.spec?.info?.title?.replace(/\s+API$/, "") || "App";
}

export function apiDescription(api: ObApi): string {
  return api.spec?.["x-openb2c-organization"]?.description || api.spec?.info?.description || "";
}

export function apiLogo(api: ObApi): { src: string; alt: string | null } | null {
  const logo = api.spec?.["x-openb2c-organization"]?.logo;
  if (!logo?.src) return null;
  return {
    src: logo.src,
    alt: logo.alt ?? null,
  };
}

export function shellBaseStyles(host: string): string {
  return `
    ${host} {
      --ob-shell-bg: #f7f7f4;
      --ob-shell-text: #242521;
      --ob-shell-focus: 0 0 0 3px rgba(17, 17, 17, 0.16);
      display: block;
      min-height: 100vh;
      font-family: system-ui, -apple-system, sans-serif;
      color: var(--ob-shell-text);
      background: var(--ob-shell-bg);
    }
    ${host} *, ${host} *::before, ${host} *::after { box-sizing: border-box; }
    ${host} .skip-link {
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 10;
      transform: translateY(-140%);
      padding: 8px 12px;
      border: 0;
      border-radius: 8px;
      background: #ffffff;
      color: #111111;
      box-shadow: var(--ob-shell-focus);
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    ${host} .skip-link:focus {
      transform: translateY(0);
    }
  `;
}
