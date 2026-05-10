export type ParsedHash = {
  path: string;
  params: URLSearchParams;
};

export function parseHash(hash: string): ParsedHash {
  const raw = hash.slice(1) || "/";
  const [path, query = ""] = raw.split("?");
  return { path: path || "/", params: new URLSearchParams(query) };
}

export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  return value.split("#")[0];
}
