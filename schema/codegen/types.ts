export interface Column {
  type: string;
  pk: boolean;
  auto: boolean;
  required: boolean;
  unique: boolean;
  default: string | null;
  references: string | null;
}

export type Tables = Record<string, Record<string, Column>>;

export interface Index {
  columns: string[];
  unique: boolean;
}

export type Indexes = Record<string, Record<string, Index>>;

export interface FieldRef {
  table: string;
  field: string;
  references: string | null;
}

export type Refs = Record<string, Record<string, FieldRef>>;

export interface Relationship {
  field: FieldRef;
}

export type Relationships = Record<string, Record<string, Relationship>>;

export interface Expr {
  _t: "field" | "rel" | "lit" | "bin" | "un" | "agg";
  [key: string]: unknown;
}

export interface Cascade {
  entity: string;
  via: string | null;
  set: Record<string, string>;
}

export interface Effect {
  emit: string | null;
  notify: { channel: string; template: string; to: string } | null;
  call: { service: string; action: string } | null;
}

export interface Operation {
  guard: Expr | null;
  relationships: Relationship[];
  public: boolean;
  scope: string | null;
  set: Record<string, string>;
  cascade: Cascade[];
  effects: Effect[];
}

export type Operations = Record<string, Record<string, Operation>>;

export interface OrganizationMetadata {
  name: string;
  description: string;
}

export interface AppMetadata {
  name: string;
  slug: string;
  apiTitle: string;
  description: string;
  version: string;
  defaultPorts: {
    server: number;
    mcp: number;
  };
  uiTitle: string;
}

export interface Schema {
  organization: OrganizationMetadata;
  tables: Tables;
  indexes?: Indexes;
  refs?: Refs;
  relationships?: Relationships;
  operations: Operations;
}
