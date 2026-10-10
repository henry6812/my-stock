// Shared constant definitions for portfolioService.
// Extracted verbatim from portfolioService.js to keep that file focused on logic.

export const MARKET = {
  TW: "TW",
  US: "US",
};

export const DEFAULT_HOLDING_TAG_OPTIONS = [
  { value: "STOCK", label: "個股", isDefault: true },
  { value: "ETF", label: "ETF" },
  { value: "BOND", label: "債券" },
];

export const DEFAULT_HOLDER_OPTIONS = ["Po", "Wei"];

export const SYNC_PENDING = "pending";
export const SYNC_SYNCED = "synced";

export const CLOUD_COLLECTION = {
  HOLDINGS: "holdings",
  PRICE_SNAPSHOTS: "price_snapshots",
  FX_RATES: "fx_rates",
  SYNC_META: "sync_meta",
  CASH_ACCOUNTS: "cash_accounts",
  CASH_BALANCE_SNAPSHOTS: "cash_balance_snapshots",
  EXPENSE_ENTRIES: "expense_entries",
  EXPENSE_CATEGORIES: "expense_categories",
  BUDGETS: "budgets",
  EXPENSE_TEMPLATES: "expense_templates",
  SAVINGS_GOALS: "savings_goals",
  APP_CONFIG: "app_config",
};

export const TREND_RANGE_DAYS = {
  "24h": 2,
  "7d": 7,
  "30d": 30,
};

export const EXPENSE_ENTRY_TYPE = {
  ONE_TIME: "ONE_TIME",
  RECURRING: "RECURRING",
};

export const RECURRENCE_TYPE = {
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
};

export const BUDGET_TYPE = {
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  YEARLY: "YEARLY",
};

export const BUDGET_MODE = {
  RESIDENT: "RESIDENT",
  SPECIAL: "SPECIAL",
};

export const EXPENSE_KIND_OPTIONS = ["家庭", "個人"];
export const HOLDER_OPTIONS_KEY = "holder_options";
export const INCOME_SETTINGS_KEY = "income_settings";
