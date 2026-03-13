export interface Customer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface CustomerInput {
  name: string;
  email?: string;
  phone?: string;
}
