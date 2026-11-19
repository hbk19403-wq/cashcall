export type UserRole = "owner" | "manager" | "staff";

export interface UserProfile {
  user_id: string;
  username: string;
  role: UserRole;
  location_id: string | null;
}

export interface Location {
  id: string;
  code: string;
  name: string;
  state: string;
  tax_rate: number;
  address: string | null;
}

export interface DailySalesRow {
  id?: string;
  location_id: string;
  sale_date: string;
  cash_sales: number;
  pos_sales: number;
  uber_eats_gross: number;
  grubhub_gross: number;
  doordash_gross: number;
  catering_sales: number;
  cash_tips: number;
  safe_cash_balance: number | null;
  aggregator_commission?: number;
}

// Exact keys from HTML prototype
export type FoodCategory =
  | "protein"
  | "produce"
  | "wholesale"
  | "dry_goods"
  | "beverages"
  | "miscellaneous";

export const FOOD_CATEGORIES: { key: FoodCategory; label: string; icon: string }[] = [
  { key: "protein",      label: "Protein (Meat, Poultry & Seafood)", icon: "🥩" },
  { key: "produce",      label: "Produce & Vegetables",              icon: "🥬" },
  { key: "wholesale",    label: "Wholesale / Sysco / Restaurant Depot", icon: "🏪" },
  { key: "dry_goods",    label: "Dry Goods, Grains & Pantry",        icon: "🫘" },
  { key: "beverages",    label: "Beverages & Drinks",                icon: "🧃" },
  { key: "miscellaneous",label: "Miscellaneous",                     icon: "🧾" },
];

export interface InvoiceLineItem {
  id?: string;
  food_delivery_id?: string;
  name: string;
  /** Exact text from invoice before normalization (architecture Phase 2) */
  raw_description?: string;
  qty: number;
  unit: string;
  unit_price: number | null;
  total: number | null;
  category: string;
  /** Per-item OCR confidence: "high" | "medium" | "low" */
  ocr_confidence?: string;
  is_catch_weight?: boolean;
  is_credit?: boolean;
  is_fee?: boolean;
  /** Linked canonical item from items_master (architecture Phase 3) */
  master_item_id?: string;
}

export interface FoodDelivery {
  id?: string;
  location_id: string;
  delivery_date: string;
  vendor: string;
  invoice_number?: string;
  category: FoodCategory;
  amount: number;
  notes?: string;
}

export interface InfraRow {
  id?: string;
  location_id: string;
  month: string;
  rent: number;
  utilities: number;
  staffAccommodation: number;
  staffAccomUtilities: number;
  insurance: number;
  carPayment: number;
  gasExpenses: number;
  phone: number;
  storeInternet: number;
  trash: number;
  repairsMaintenance: number;
  pestControl: number;
  marketingFee: number;
  bankCharges: number;
  posCharges: number;
  creditCardFee: number;
}

// DB column names (snake_case) → UI key (camelCase from HTML)
export const INFRA_FIELDS: { key: string; dbKey: string; label: string; fixed: boolean }[] = [
  { key: "rent",               dbKey: "rent",                  label: "Rent",                             fixed: true  },
  { key: "utilities",          dbKey: "utilities",             label: "Utilities",                        fixed: false },
  { key: "staffAccommodation", dbKey: "staff_accommodation",   label: "Staff accommodation",              fixed: true  },
  { key: "staffAccomUtilities",dbKey: "staff_accom_utilities", label: "Staff accom. utilities + internet",fixed: false },
  { key: "insurance",          dbKey: "insurance",             label: "Insurance",                        fixed: true  },
  { key: "carPayment",         dbKey: "car_payment",           label: "Car payment",                      fixed: true  },
  { key: "gasExpenses",        dbKey: "gas_expenses",          label: "Gas expenses",                     fixed: false },
  { key: "phone",              dbKey: "phone",                 label: "Phone",                            fixed: true  },
  { key: "storeInternet",      dbKey: "store_internet",        label: "Store internet",                   fixed: true  },
  { key: "trash",              dbKey: "trash",                 label: "Trash",                            fixed: true  },
  { key: "repairsMaintenance", dbKey: "repairs_maintenance",   label: "Repairs & maintenance",            fixed: false },
  { key: "pestControl",        dbKey: "pest_control",          label: "Pest control",                     fixed: true  },
  { key: "marketingFee",       dbKey: "marketing_fee",         label: "Marketing fee",                    fixed: false },
  { key: "bankCharges",        dbKey: "bank_charges",          label: "Bank charges",                     fixed: false },
  { key: "posCharges",         dbKey: "pos_charges",           label: "POS charges",                      fixed: true  },
  { key: "creditCardFee",      dbKey: "credit_card_fee",       label: "Credit card exchange fee",         fixed: false },
];

export interface PLSummary {
  location_id: string;
  location_name: string;
  location_code: string;
  location_state: string;
  month: string;
  // Sales
  cash_sales: number;
  pos_sales: number;
  uber_eats_gross: number;
  grubhub_gross: number;
  doordash_gross: number;
  catering_sales: number;
  cash_tips: number;
  aggregator_gross: number;
  aggregator_commission: number;
  aggregator_net: number;
  total_gross_sales: number;
  total_net_sales: number;
  sales_tax: number;
  // Food
  food_cost: number;
  food_by_category: Record<FoodCategory, number>;
  // Labor
  foh_hourly_cost: number;
  foh_salaried_cost: number;
  boh_cost: number;
  payroll_taxes: number;
  total_labor: number;
  // Infra
  infrastructure: number;
  // Totals
  total_expenses: number;
  net_profit: number;
  // Pcts
  food_pct: number;
  labor_pct: number;
  infra_pct: number;
  net_profit_pct: number;
}
