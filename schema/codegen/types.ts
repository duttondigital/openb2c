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

export interface EcommerceOption {
  field: FieldRef | null;
  type: string;
  label: string | null;
  default: string | null;
  choices: string[];
  required: boolean;
  min: number | null;
  max: number | null;
}

export interface EcommerceCatalogConfig {
  entity: string;
  title: FieldRef | null;
  description: FieldRef | null;
  price: FieldRef | null;
  groupBy: FieldRef[];
  variantFields: FieldRef[];
  availability: {
    field: FieldRef | null;
    available: string;
  };
}

export interface EcommerceOrderConfig {
  entity: string;
  user: FieldRef | null;
  status: FieldRef | null;
  amount: FieldRef | null;
  currency: FieldRef | null;
  expiresAt: FieldRef | null;
  paymentReference: FieldRef | null;
  client: FieldRef | null;
  pendingStatus: string;
  paidStatus: string;
  expiredStatus: string;
  cancelledStatus: string;
}

export interface EcommerceLineItemConfig {
  entity: string;
  catalogItem: FieldRef | null;
  user: FieldRef | null;
  price: FieldRef | null;
  status: FieldRef | null;
  quantity: FieldRef | null;
  reservedStatus: string;
  fulfilledStatus: string;
  cancelledStatus: string;
  options: Record<string, EcommerceOption>;
}

export interface EcommerceLinkConfig {
  entity: string;
  order?: FieldRef | null;
  transaction?: FieldRef | null;
  lineItem: FieldRef | null;
}

export interface EcommerceTransactionConfig {
  entity: string;
  user: FieldRef | null;
  amount: FieldRef | null;
  type: FieldRef | null;
  status: FieldRef | null;
  reference: FieldRef | null;
  client: FieldRef | null;
  purchaseType: string;
  pendingStatus: string;
  completedStatus: string;
  failedStatus: string;
}

export interface EcommerceConfig {
  enabled: boolean;
  catalog: EcommerceCatalogConfig;
  order: EcommerceOrderConfig;
  lineItem: EcommerceLineItemConfig;
  orderLine: EcommerceLinkConfig;
  transaction: EcommerceTransactionConfig;
  transactionLine: EcommerceLinkConfig;
  checkout: {
    currency: string;
    expiryMinutes: number;
    maxQuantity: number;
    maxLines: number;
  };
}

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
  ecommerce?: EcommerceConfig;
}
