import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  db,
  DB_MAX_KEY,
  DB_MIN_KEY,
  FX_PAIR_USD_TWD,
  SYNC_KEY_PRICES,
} from "../db/database";
import { getUsdTwdRate } from "./priceProviders/fxProvider";
import {
  getHoldingQuote,
  sleepForRateLimit,
} from "./priceProviders/finnhubProvider";
import {
  applyCollectionRecordLocally,
  assertCloudWriteReady,
  deleteCollectionDoc,
  getSyncRuntimeState,
  initCloudSync,
  registerMigratedDocKey,
  writeCollectionRecord,
  stopCloudSync,
  syncNowWithCloud,
} from "./firebase/cloudSyncService";
import { buildCashAccountKey, buildHoldingKey } from "./firebase/firestoreMappers";
import { parseNumericLike } from "../utils/number";

dayjs.extend(utc);
dayjs.extend(timezone);

const MARKET = {
  TW: "TW",
  US: "US",
};

const DEFAULT_HOLDING_TAG_OPTIONS = [
  { value: "STOCK", label: "個股", isDefault: true },
  { value: "ETF", label: "ETF" },
  { value: "BOND", label: "債券" },
];
const DEFAULT_HOLDER_OPTIONS = ["Po", "Wei"];

const SYNC_PENDING = "pending";
const SYNC_SYNCED = "synced";
const CLOUD_COLLECTION = {
  HOLDINGS: "holdings",
  PRICE_SNAPSHOTS: "price_snapshots",
  FX_RATES: "fx_rates",
  SYNC_META: "sync_meta",
  CASH_ACCOUNTS: "cash_accounts",
  CASH_BALANCE_SNAPSHOTS: "cash_balance_snapshots",
  EXPENSE_ENTRIES: "expense_entries",
  EXPENSE_CATEGORIES: "expense_categories",
  BUDGETS: "budgets",
  APP_CONFIG: "app_config",
};

const TREND_RANGE_DAYS = {
  "24h": 2,
  "7d": 7,
  "30d": 30,
};

const EXPENSE_ENTRY_TYPE = {
  ONE_TIME: "ONE_TIME",
  RECURRING: "RECURRING",
};

const RECURRENCE_TYPE = {
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
};

const BUDGET_TYPE = {
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  YEARLY: "YEARLY",
};
const BUDGET_MODE = {
  RESIDENT: "RESIDENT",
  SPECIAL: "SPECIAL",
};

const EXPENSE_KIND_OPTIONS = ["家庭", "個人"];
const HOLDER_OPTIONS_KEY = "holder_options";
const INCOME_SETTINGS_KEY = "income_settings";

const isDeleted = (item) => Boolean(item?.deletedAt);

const getNowIso = () => new Date().toISOString();
const getNowDate = () => dayjs().format("YYYY-MM-DD");
const makeRemoteKey = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const normalizeDateOnly = (value) => {
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.format("YYYY-MM-DD");
};

const toDayjsDateOnly = (value) => dayjs(normalizeDateOnly(value));

const ensureCloudWritable = () => {
  assertCloudWriteReady();
};

const mirrorToCloud = async (collectionName, record) => {
  await writeCollectionRecord({ collectionName, record });
  await applyCollectionRecordLocally({
    collectionName,
    record,
    preferLocalId: Number.isInteger(record?.id) ? record.id : undefined,
  });
};

const getExpenseCategoryRemoteKeyById = async (categoryId) => {
  if (!Number.isInteger(categoryId)) {
    return null;
  }
  const category = await db.expense_categories.get(categoryId);
  return category?.remoteKey ?? null;
};

const getBudgetRemoteKeyById = async (budgetId) => {
  if (!Number.isInteger(budgetId)) {
    return null;
  }
  const budget = await db.budgets.get(budgetId);
  return budget?.remoteKey ?? null;
};

const withExpenseAssociationKeys = async (entry) => {
  const categoryId = Number.isInteger(entry?.categoryId) ? entry.categoryId : null;
  const budgetId = Number.isInteger(entry?.budgetId) ? entry.budgetId : null;
  const [categoryRemoteKey, budgetRemoteKey] = await Promise.all([
    getExpenseCategoryRemoteKeyById(categoryId),
    getBudgetRemoteKeyById(budgetId),
  ]);
  return {
    ...entry,
    categoryId,
    budgetId,
    categoryRemoteKey,
    budgetRemoteKey,
  };
};

const requireLocalId = (record, entityLabel) => {
  if (!record?.id) {
    throw new Error(`${entityLabel} 同步後未能建立本地快取`);
  }
  return record.id;
};

const migrateHoldingCloudKeyIfNeeded = async ({
  previousHolding,
  nextHolding,
}) => {
  if (!previousHolding || !nextHolding) {
    return;
  }
  const previousDocKey = buildHoldingKey(previousHolding);
  const nextDocKey = buildHoldingKey(nextHolding);
  if (previousDocKey === nextDocKey) {
    return;
  }
  registerMigratedDocKey({
    collectionName: CLOUD_COLLECTION.HOLDINGS,
    docId: previousDocKey,
    updatedAt: nextHolding.updatedAt,
  });
  await deleteCollectionDoc({
    collectionName: CLOUD_COLLECTION.HOLDINGS,
    docId: previousDocKey,
  });
};

const migrateCashAccountCloudKeyIfNeeded = async ({
  previousCashAccount,
  nextCashAccount,
}) => {
  if (!previousCashAccount || !nextCashAccount) {
    return;
  }
  const previousDocKey = buildCashAccountKey(previousCashAccount);
  const nextDocKey = buildCashAccountKey(nextCashAccount);
  if (previousDocKey === nextDocKey) {
    return;
  }
  registerMigratedDocKey({
    collectionName: CLOUD_COLLECTION.CASH_ACCOUNTS,
    docId: previousDocKey,
    updatedAt: nextCashAccount.updatedAt,
  });
  await deleteCollectionDoc({
    collectionName: CLOUD_COLLECTION.CASH_ACCOUNTS,
    docId: previousDocKey,
  });
};

const normalizeIncomeValue = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = parseNumericLike(value, {
    fallback: Number.NaN,
    context: "normalizeIncomeValue",
  });
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Income must be a positive number");
  }
  return Math.round(parsed);
};

const normalizeMonthValue = (month) => {
  const parsed = dayjs(`${month}-01`);
  if (!parsed.isValid()) {
    throw new Error("Invalid month format");
  }
  return parsed.format("YYYY-MM");
};

const normalizeMonthOverrides = (overrides = []) => {
  const map = new Map();
  for (const item of overrides) {
    if (!item) continue;
    const month = normalizeMonthValue(item.month);
    const incomeTwd = normalizeIncomeValue(item.incomeTwd);
    if (incomeTwd === null) continue;
    map.set(month, incomeTwd);
  }
  return Array.from(map.entries())
    .map(([month, incomeTwd]) => ({ month, incomeTwd }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

const normalizeHolderOptionValue = (value) => String(value ?? "").trim();

const normalizeConfiguredHolder = (holder, holderOptions = []) => {
  const normalized = normalizeHolderOptionValue(holder);
  if (!normalized) {
    return null;
  }
  return holderOptions.includes(normalized) ? normalized : null;
};

const normalizeHolderOptions = (options = []) => {
  const normalizedOptions = [];
  const seen = new Set();

  for (const option of options) {
    const normalized = normalizeHolderOptionValue(option);
    if (!normalized) {
      throw new Error("持有人名稱不可空白");
    }
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) {
      throw new Error(`持有人名稱不可重複：${normalized}`);
    }
    seen.add(dedupeKey);
    normalizedOptions.push(normalized);
  }

  if (normalizedOptions.length === 0) {
    throw new Error("至少需要保留 1 位持有人");
  }

  return normalizedOptions;
};

const normalizeHolderRenameMap = ({
  renameMap = {},
  previousOptions = [],
  nextOptions = [],
}) => {
  const previousSet = new Set(previousOptions);
  const nextSet = new Set(nextOptions);
  const normalizedMap = {};
  const seenPrevious = new Set();

  for (const [fromRaw, toRaw] of Object.entries(renameMap)) {
    const from = normalizeHolderOptionValue(fromRaw);
    const to = normalizeHolderOptionValue(toRaw);

    if (!from || !to || from === to) {
      continue;
    }
    if (!previousSet.has(from)) {
      throw new Error(`找不到原持有人：${from}`);
    }
    if (!nextSet.has(to)) {
      throw new Error(`改名後的持有人不存在：${to}`);
    }
    const fromKey = from.toLowerCase();
    if (seenPrevious.has(fromKey)) {
      throw new Error(`重複的持有人改名來源：${from}`);
    }
    seenPrevious.add(fromKey);
    normalizedMap[from] = to;
  }

  return normalizedMap;
};

const normalizeBudgetMode = (value) => {
  const normalized = String(value || "").toUpperCase();
  if (normalized === BUDGET_MODE.SPECIAL) {
    return BUDGET_MODE.SPECIAL;
  }
  return BUDGET_MODE.RESIDENT;
};

const normalizeBudgetType = (value) => {
  const normalized = String(value || "").toUpperCase();
  if (
    normalized === BUDGET_TYPE.MONTHLY ||
    normalized === BUDGET_TYPE.QUARTERLY ||
    normalized === BUDGET_TYPE.YEARLY
  ) {
    return normalized;
  }
  return BUDGET_TYPE.MONTHLY;
};

const getMonthsPerCycle = (budgetType) =>
  budgetType === BUDGET_TYPE.MONTHLY
    ? 1
    : budgetType === BUDGET_TYPE.QUARTERLY
      ? 3
      : 12;

const resolveIncomeForMonth = ({
  month,
  defaultMonthlyIncomeTwd,
  monthOverridesMap,
}) => {
  if (monthOverridesMap.has(month)) {
    return monthOverridesMap.get(month);
  }
  return typeof defaultMonthlyIncomeTwd === "number"
    ? defaultMonthlyIncomeTwd
    : null;
};

const sortHoldingsByOrder = (a, b) => {
  const aOrder = Number(a?.sortOrder);
  const bOrder = Number(b?.sortOrder);
  const aHasOrder = Number.isFinite(aOrder);
  const bHasOrder = Number.isFinite(bOrder);

  if (aHasOrder && bHasOrder && aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  if (aHasOrder && !bHasOrder) return -1;
  if (!aHasOrder && bHasOrder) return 1;

  if (!a?.updatedAt && !b?.updatedAt) return 0;
  if (!a?.updatedAt) return 1;
  if (!b?.updatedAt) return -1;
  return a.updatedAt > b.updatedAt ? -1 : 1;
};

const normalizeSymbol = (symbol, market) => {
  const normalized = symbol.trim().toUpperCase();
  if (market === MARKET.TW) {
    return normalized.replace(".TW", "");
  }
  return normalized;
};

const normalizeAssetTag = (assetTag) =>
  String(assetTag ?? "")
    .trim()
    .toUpperCase();

const ensureHoldingTagOptions = async () => {
  const config = await db.app_config.get("holding_tags");
  const options = Array.isArray(config?.options) ? config.options : [];
  if (options.length > 0) {
    return options;
  }
  return DEFAULT_HOLDING_TAG_OPTIONS;
};

const ensureHolderOptions = async () => {
  const config = await db.app_config.get(HOLDER_OPTIONS_KEY);
  const options = Array.isArray(config?.options) ? config.options : [];
  if (options.length > 0) {
    return normalizeHolderOptions(options);
  }
  return normalizeHolderOptions(DEFAULT_HOLDER_OPTIONS);
};

const getActiveExpenseEntries = async () => {
  const entries = await db.expense_entries.toArray();
  return entries.filter((item) => !isDeleted(item));
};

const getDefaultHoldingTag = (options) => {
  const defaultOption = options.find((item) => item.isDefault);
  return defaultOption?.value || options[0]?.value || "STOCK";
};

const resolveHoldingTag = ({ inputTag, options }) => {
  const normalizedInputTag = normalizeAssetTag(inputTag);
  if (!normalizedInputTag) {
    return getDefaultHoldingTag(options);
  }
  const isValid = options.some((item) => item.value === normalizedInputTag);
  if (!isValid) {
    throw new Error("Invalid holding tag");
  }
  return normalizedInputTag;
};

const getLatestTwoSnapshotsByHoldingId = async (holdingId) => {
  const snapshots = await db.price_snapshots
    .where("[holdingId+capturedAt]")
    .between([holdingId, DB_MIN_KEY], [holdingId, DB_MAX_KEY])
    .reverse()
    .toArray();

  const activeSnapshots = snapshots.filter((item) => !isDeleted(item));
  return {
    latestSnapshot: activeSnapshots[0],
    previousSnapshot: activeSnapshots[1],
  };
};

const getLatestSnapshotAtOrBefore = async (holdingId, baselineAtIso) => {
  const snapshots = await db.price_snapshots
    .where("[holdingId+capturedAt]")
    .between([holdingId, DB_MIN_KEY], [holdingId, baselineAtIso], true, true)
    .reverse()
    .toArray();

  return snapshots.find((item) => !isDeleted(item));
};

const getLatestCashBalanceSnapshotAtOrBefore = async (
  cashAccountId,
  baselineAtIso,
) => {
  const snapshots = await db.cash_balance_snapshots
    .where("[cashAccountId+capturedAt]")
    .between(
      [cashAccountId, DB_MIN_KEY],
      [cashAccountId, baselineAtIso],
      true,
      true,
    )
    .reverse()
    .toArray();

  return snapshots.find((item) => !isDeleted(item));
};

const getEarliestCashBalanceSnapshotAfter = async (
  cashAccountId,
  baselineAtIso,
) => {
  const snapshots = await db.cash_balance_snapshots
    .where("[cashAccountId+capturedAt]")
    .between(
      [cashAccountId, baselineAtIso],
      [cashAccountId, DB_MAX_KEY],
      false,
      true,
    )
    .toArray();

  return snapshots.find((item) => !isDeleted(item));
};

const getBaselineAtIso = () =>
  dayjs().tz("Asia/Taipei").subtract(1, "day").endOf("day").utc().toISOString();

const recordCashBalanceSnapshot = async ({
  cashAccount,
  balanceTwd,
  capturedAt = getNowIso(),
}) => {
  if (!cashAccount) {
    return;
  }

  const snapshot = {
    cashAccountId: cashAccount.id,
    bankCode: cashAccount.bankCode ?? null,
    bankName: cashAccount.bankName,
    accountAlias: cashAccount.accountAlias,
    holder: normalizeHolderOptionValue(cashAccount.holder) || null,
    balanceTwd: parseNumericLike(balanceTwd, {
      fallback: 0,
      context: "recordCashBalanceSnapshot.balanceTwd",
    }),
    capturedAt,
    updatedAt: capturedAt,
    deletedAt: null,
    syncState: SYNC_PENDING,
  };

  await mirrorToCloud(CLOUD_COLLECTION.CASH_BALANCE_SNAPSHOTS, snapshot);
};

const setSyncMeta = async ({ status, errorMessage = "" }) => {
  const nowIso = getNowIso();
  await mirrorToCloud(CLOUD_COLLECTION.SYNC_META, {
    key: SYNC_KEY_PRICES,
    lastUpdatedAt: nowIso,
    status,
    errorMessage,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  });
  return nowIso;
};

const getActiveHoldings = async () => {
  const holdings = await db.holdings.toArray();
  return holdings.filter((item) => !isDeleted(item));
};

const getActiveCashAccounts = async () => {
  const cashAccounts = await db.cash_accounts.toArray();
  return cashAccounts.filter((item) => !isDeleted(item));
};

export const setCurrentUser = (uid) => {
  void uid;
};

export const initSync = async (uid) => {
  await initCloudSync(uid);
};

export const stopSync = () => {
  stopCloudSync();
};

export const syncNow = async () => syncNowWithCloud();
export const getHolderOptions = async () => ensureHolderOptions();
export const getCloudSyncRuntime = () => getSyncRuntimeState();

export const getHoldingTagOptions = async () => ensureHoldingTagOptions();

export const getHolderUsageSummary = async ({ holders = [] } = {}) => {
  const targetHolders =
    Array.isArray(holders) && holders.length > 0
      ? normalizeHolderOptions(holders)
      : [];
  const targetSet = new Set(targetHolders);
  const summaryMap = new Map(
    targetHolders.map((holder) => [
      holder,
      { holder, holdingCount: 0, cashAccountCount: 0, expenseEntryCount: 0 },
    ]),
  );

  const [holdings, cashAccounts, expenseEntries] = await Promise.all([
    getActiveHoldings(),
    getActiveCashAccounts(),
    getActiveExpenseEntries(),
  ]);

  for (const holding of holdings) {
    const holder = normalizeHolderOptionValue(holding.holder);
    if (!targetSet.has(holder)) continue;
    summaryMap.get(holder).holdingCount += 1;
  }
  for (const cashAccount of cashAccounts) {
    const holder = normalizeHolderOptionValue(cashAccount.holder);
    if (!targetSet.has(holder)) continue;
    summaryMap.get(holder).cashAccountCount += 1;
  }
  for (const entry of expenseEntries) {
    const payer = normalizeHolderOptionValue(entry.payer);
    if (!targetSet.has(payer)) continue;
    summaryMap.get(payer).expenseEntryCount += 1;
  }

  return Array.from(summaryMap.values()).map((item) => ({
    ...item,
    totalAffected:
      item.holdingCount + item.cashAccountCount + item.expenseEntryCount,
  }));
};

export const saveHolderOptions = async ({ options = [], renameMap = {} } = {}) => {
  ensureCloudWritable();
  const previousOptions = await ensureHolderOptions();
  const nextOptions = normalizeHolderOptions(options);
  const normalizedRenameMap = normalizeHolderRenameMap({
    renameMap,
    previousOptions,
    nextOptions,
  });
  const renamedSources = new Set(Object.keys(normalizedRenameMap));
  const nextOptionSet = new Set(nextOptions);
  const removedHolders = previousOptions.filter(
    (holder) => !renamedSources.has(holder) && !nextOptionSet.has(holder),
  );
  const removedHolderSet = new Set(removedHolders);
  const nowIso = getNowIso();
  const changedHoldingPairs = [];
  const changedCashAccounts = [];
  const changedExpenseEntries = [];
  const resolveNextHolderValue = (value) => {
    const normalized = normalizeHolderOptionValue(value);
    if (!normalized) {
      return null;
    }
    if (normalizedRenameMap[normalized]) {
      return normalizedRenameMap[normalized];
    }
    if (removedHolderSet.has(normalized)) {
      return null;
    }
    return normalized;
  };
  const [activeHoldings, activeCashAccounts] = await Promise.all([
    getActiveHoldings(),
    getActiveCashAccounts(),
  ]);
  const nextHoldingKeys = new Map();
  for (const holding of activeHoldings) {
    const nextHolder = resolveNextHolderValue(holding.holder);
    const key = [holding.symbol, holding.market, nextHolder || "__UNSET__"].join(
      "::",
    );
    if (nextHoldingKeys.has(key)) {
      throw new Error(
        `持有人調整後，持股 ${holding.symbol} (${holding.market}) 會出現重複紀錄，請先手動整理`,
      );
    }
    nextHoldingKeys.set(key, holding.id);
  }
  const nextCashKeys = new Map();
  for (const cashAccount of activeCashAccounts) {
    const nextHolder = resolveNextHolderValue(cashAccount.holder);
    const key = [
      cashAccount.bankName,
      cashAccount.accountAlias,
      nextHolder || "__UNSET__",
    ].join("::");
    if (nextCashKeys.has(key)) {
      throw new Error(
        `持有人調整後，帳戶 ${cashAccount.bankName} / ${cashAccount.accountAlias} 會出現重複紀錄，請先手動整理`,
      );
    }
    nextCashKeys.set(key, cashAccount.id);
  }

  const holdings = await getActiveHoldings();
  for (const holding of holdings) {
    const currentHolder = normalizeHolderOptionValue(holding.holder);
    const nextHolder = resolveNextHolderValue(currentHolder);

    if ((currentHolder || null) === nextHolder) {
      continue;
    }

    const nextHolding = {
      ...holding,
      holder: nextHolder,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    };
    await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, nextHolding);
    changedHoldingPairs.push({
      previousHolding: holding,
      nextHolding,
    });
  }

  const cashAccounts = await getActiveCashAccounts();
  for (const cashAccount of cashAccounts) {
    const currentHolder = normalizeHolderOptionValue(cashAccount.holder);
    const nextHolder = resolveNextHolderValue(currentHolder);

    if ((currentHolder || null) === nextHolder) {
      continue;
    }

    const nextCashAccount = {
      ...cashAccount,
      holder: nextHolder,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    };
    await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, nextCashAccount);
    changedCashAccounts.push(nextCashAccount);
  }

  const expenseEntries = await getActiveExpenseEntries();
  for (const entry of expenseEntries) {
    const currentPayer = normalizeHolderOptionValue(entry.payer);
    const nextPayer = resolveNextHolderValue(currentPayer);

    if ((currentPayer || null) === nextPayer) {
      continue;
    }

    const nextEntry = await withExpenseAssociationKeys({
      ...entry,
      payer: nextPayer,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
    await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, nextEntry);
    changedExpenseEntries.push(nextEntry);
  }

  const configRecord = {
    key: HOLDER_OPTIONS_KEY,
    options: nextOptions,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  };
  await mirrorToCloud(CLOUD_COLLECTION.APP_CONFIG, configRecord);

  for (const pair of changedHoldingPairs) {
    await migrateHoldingCloudKeyIfNeeded(pair);
  }

  return {
    options: nextOptions,
    removedHolders,
    renamedCount: Object.keys(normalizedRenameMap).length,
    updatedHoldingCount: changedHoldingPairs.length,
    updatedCashAccountCount: changedCashAccounts.length,
    updatedExpenseEntryCount: changedExpenseEntries.length,
  };
};

export const getIncomeSettings = async () => {
  const config = await db.app_config.get(INCOME_SETTINGS_KEY);
  const defaultMonthlyIncomeTwd =
    typeof config?.defaultMonthlyIncomeTwd === "number"
      ? config.defaultMonthlyIncomeTwd
      : null;
  const monthOverrides = normalizeMonthOverrides(config?.monthOverrides ?? []);
  return { defaultMonthlyIncomeTwd, monthOverrides };
};

export const saveIncomeSettings = async (input = {}) => {
  ensureCloudWritable();
  const nowIso = getNowIso();
  const defaultMonthlyIncomeTwd = normalizeIncomeValue(
    input.defaultMonthlyIncomeTwd,
  );
  const monthOverrides = normalizeMonthOverrides(input.monthOverrides ?? []);
  const record = {
    key: INCOME_SETTINGS_KEY,
    defaultMonthlyIncomeTwd,
    monthOverrides,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  };
  await mirrorToCloud(CLOUD_COLLECTION.APP_CONFIG, record);
};

export const setIncomeOverride = async ({ month, incomeTwd }) => {
  const { defaultMonthlyIncomeTwd, monthOverrides } = await getIncomeSettings();
  const normalizedMonth = normalizeMonthValue(month);
  const normalizedIncome = normalizeIncomeValue(incomeTwd);
  if (normalizedIncome === null) {
    throw new Error("Income must be a positive number");
  }

  const next = monthOverrides.filter((item) => item.month !== normalizedMonth);
  next.push({ month: normalizedMonth, incomeTwd: normalizedIncome });
  await saveIncomeSettings({
    defaultMonthlyIncomeTwd,
    monthOverrides: next,
  });
};

export const removeIncomeOverride = async ({ month }) => {
  const { defaultMonthlyIncomeTwd, monthOverrides } = await getIncomeSettings();
  const normalizedMonth = normalizeMonthValue(month);
  const next = monthOverrides.filter((item) => item.month !== normalizedMonth);
  await saveIncomeSettings({
    defaultMonthlyIncomeTwd,
    monthOverrides: next,
  });
};

export const upsertHolding = async ({
  symbol,
  market,
  shares,
  assetTag,
  holder,
}) => {
  ensureCloudWritable();
  const normalizedMarket = market === MARKET.US ? MARKET.US : MARKET.TW;
  const normalizedSymbol = normalizeSymbol(symbol, normalizedMarket);
  const holderOptions = await ensureHolderOptions();
  const normalizedHolder = normalizeConfiguredHolder(holder, holderOptions);
  const parsedShares = Number(shares);
  const options = await ensureHoldingTagOptions();
  const hasAssetTagInput =
    assetTag !== undefined &&
    assetTag !== null &&
    String(assetTag).trim() !== "";

  if (!normalizedSymbol) {
    throw new Error("Stock symbol is required");
  }

  if (!normalizedHolder) {
    throw new Error("請選擇持有人");
  }

  if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
    throw new Error("Shares must be a positive number");
  }

  const existing = await db.holdings
    .where("[symbol+market+holder]")
    .equals([normalizedSymbol, normalizedMarket, normalizedHolder])
    .first();
  const nowIso = getNowIso();

  if (existing) {
    const nextAssetTag = hasAssetTagInput
      ? resolveHoldingTag({ inputTag: assetTag, options })
      : existing.assetTag || getDefaultHoldingTag(options);
    const nextHolding = {
      ...existing,
      shares: parsedShares,
      assetTag: nextAssetTag,
      holder: normalizedHolder,
      updatedAt: nowIso,
      deletedAt: null,
      syncState: SYNC_PENDING,
    };
    await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, nextHolding);
    const updatedHolding = await db.holdings
      .where("[symbol+market+holder]")
      .equals([normalizedSymbol, normalizedMarket, normalizedHolder])
      .first();
    return {
      id: requireLocalId(updatedHolding ?? existing, "持股"),
      created: false,
    };
  }

  const holdings = await getActiveHoldings();
  const maxSortOrder = holdings.reduce((max, item) => {
    const value = Number(item?.sortOrder);
    if (!Number.isFinite(value)) return max;
    return Math.max(max, value);
  }, 0);

  const nextAssetTag = hasAssetTagInput
    ? resolveHoldingTag({ inputTag: assetTag, options })
    : getDefaultHoldingTag(options);

  const nextHolding = {
    symbol: normalizedSymbol,
    market: normalizedMarket,
    assetTag: nextAssetTag,
    holder: normalizedHolder,
    shares: parsedShares,
    companyName: normalizedSymbol,
    sortOrder: maxSortOrder + 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  };
  await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, nextHolding);
  const insertedHolding = await db.holdings
    .where("[symbol+market+holder]")
    .equals([normalizedSymbol, normalizedMarket, normalizedHolder])
    .first();

  return {
    id: requireLocalId(insertedHolding, "持股"),
    created: true,
  };
};

export const updateHoldingTag = async ({ id, assetTag }) => {
  ensureCloudWritable();
  const parsedId = Number(id);
  const options = await ensureHoldingTagOptions();
  const nextAssetTag = resolveHoldingTag({ inputTag: assetTag, options });

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Holding not found");
  }

  const existing = await db.holdings.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Holding not found");
  }

  await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, {
    ...existing,
    assetTag: nextAssetTag,
    updatedAt: getNowIso(),
    syncState: SYNC_PENDING,
  });
};

export const updateHoldingHolder = async ({ id, holder }) => {
  ensureCloudWritable();
  const parsedId = Number(id);
  const holderOptions = await ensureHolderOptions();
  const normalizedHolder = normalizeConfiguredHolder(holder, holderOptions);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Holding not found");
  }
  if (!normalizedHolder) {
    throw new Error("請選擇持有人");
  }

  const existing = await db.holdings.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Holding not found");
  }
  if (
    normalizeConfiguredHolder(existing.holder, holderOptions) === normalizedHolder
  ) {
    return;
  }

  const conflict = await db.holdings
    .where("[symbol+market+holder]")
    .equals([existing.symbol, existing.market, normalizedHolder])
    .and((item) => item.id !== parsedId && !isDeleted(item))
    .first();
  if (conflict) {
    throw new Error("同持有人的該股票已存在");
  }

  const nextHolding = {
    ...existing,
    holder: normalizedHolder,
    updatedAt: getNowIso(),
    syncState: SYNC_PENDING,
  };
  await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, nextHolding);
  await migrateHoldingCloudKeyIfNeeded({
    previousHolding: existing,
    nextHolding,
  });
};

export const updateHoldingShares = async ({ id, shares }) => {
  ensureCloudWritable();
  const parsedId = Number(id);
  const parsedShares = Number(shares);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Holding not found");
  }

  if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
    throw new Error("Shares must be a positive number");
  }

  const existing = await db.holdings.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Holding not found");
  }

  await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, {
    ...existing,
    shares: parsedShares,
    updatedAt: getNowIso(),
    syncState: SYNC_PENDING,
  });
};

export const removeHolding = async ({ id }) => {
  ensureCloudWritable();
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Holding not found");
  }

  const existing = await db.holdings.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Holding not found");
  }

  const nowIso = getNowIso();
  await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, {
    ...existing,
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  });

  const affectedSnapshots = await db.price_snapshots
    .where("holdingId")
    .equals(parsedId)
    .toArray();
  for (const snapshot of affectedSnapshots) {
    await mirrorToCloud(CLOUD_COLLECTION.PRICE_SNAPSHOTS, {
      ...snapshot,
      deletedAt: nowIso,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
  }

  const remaining = (await db.holdings.toArray()).filter(
    (item) => !isDeleted(item),
  );
  for (const holding of remaining) {
    await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, {
      ...holding,
      sortOrder: remaining
        .slice()
        .sort(sortHoldingsByOrder)
        .findIndex((item) => item.id === holding.id) + 1,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
  }
};

export const reorderHoldings = async ({ orderedIds }) => {
  ensureCloudWritable();
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error("orderedIds is required");
  }

  const normalizedIds = orderedIds.map((id) => Number(id));
  if (normalizedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("orderedIds contains invalid id");
  }

  const uniqueIds = new Set(normalizedIds);
  if (uniqueIds.size !== normalizedIds.length) {
    throw new Error("orderedIds contains duplicate id");
  }

  const holdings = (await db.holdings.toArray()).filter(
    (item) => !isDeleted(item),
  );
  const existingIds = holdings.map((item) => item.id);

  if (existingIds.length !== normalizedIds.length) {
    throw new Error("orderedIds does not match holdings length");
  }

  const existingIdSet = new Set(existingIds);
  for (const id of normalizedIds) {
    if (!existingIdSet.has(id)) {
      throw new Error("orderedIds contains unknown id");
    }
  }

  const nowIso = getNowIso();
  for (let i = 0; i < normalizedIds.length; i += 1) {
    const holding = holdings.find((item) => item.id === normalizedIds[i]);
    if (!holding) continue;
    await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, {
      ...holding,
      sortOrder: i + 1,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
  }
};

export const refreshHoldingPrice = async ({ holdingId }) => {
  ensureCloudWritable();
  const parsedHoldingId = Number(holdingId);
  if (!Number.isInteger(parsedHoldingId) || parsedHoldingId <= 0) {
    throw new Error("Holding not found");
  }

  const holding = await db.holdings.get(parsedHoldingId);
  if (!holding || isDeleted(holding)) {
    throw new Error("Holding not found");
  }

  const quote = await getHoldingQuote(holding);
  let fxRateToTwd = 1;

  if (holding.market === MARKET.US) {
    const fx = await getUsdTwdRate();
    fxRateToTwd = fx.rate;
    const fxRecord = {
      pair: FX_PAIR_USD_TWD,
      rate: fx.rate,
      fetchedAt: fx.fetchedAt,
      source: "open.er-api",
      updatedAt: getNowIso(),
      deletedAt: null,
      syncState: SYNC_PENDING,
    };
    await mirrorToCloud(CLOUD_COLLECTION.FX_RATES, fxRecord);
  }

  const nowIso = getNowIso();
  const valueTwd =
    holding.market === MARKET.US
      ? quote.price * holding.shares * fxRateToTwd
      : quote.price * holding.shares;

  const snapshotRecord = {
    holdingId: holding.id,
    symbol: holding.symbol,
    market: holding.market,
    holder: normalizeHolderOptionValue(holding.holder) || null,
    price: quote.price,
    currency: quote.currency,
    fxRateToTwd,
    valueTwd,
    capturedAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  };
  await mirrorToCloud(CLOUD_COLLECTION.PRICE_SNAPSHOTS, snapshotRecord);

  if (quote.name && quote.name !== holding.companyName) {
    await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, {
      ...holding,
      companyName: quote.name,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
  }
  await mirrorToCloud(CLOUD_COLLECTION.SYNC_META, {
    key: SYNC_KEY_PRICES,
    lastUpdatedAt: nowIso,
    status: "success",
    errorMessage: "",
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  });

  return {
    updatedAt: nowIso,
  };
};

export const refreshPrices = async ({ market: inputMarket = "ALL" } = {}) => {
  ensureCloudWritable();
  const normalized = String(inputMarket ?? "ALL").toUpperCase();
  const market =
    normalized === "TW" || normalized === "US" || normalized === "ALL"
      ? normalized
      : "ALL";

  const holdings = await getActiveHoldings();
  const targetHoldings =
    market === "ALL"
      ? holdings
      : holdings.filter((item) => item.market === market);

  if (targetHoldings.length === 0) {
    const lastUpdatedAt = await setSyncMeta({ status: "success" });
    return {
      updatedCount: 0,
      targetCount: 0,
      market,
      lastUpdatedAt,
    };
  }

  const usHoldings = targetHoldings.filter((item) => item.market === MARKET.US);

  try {
    let usdTwdRate = 1;
    if (usHoldings.length > 0) {
      const fx = await getUsdTwdRate();
      usdTwdRate = fx.rate;
      await mirrorToCloud(CLOUD_COLLECTION.FX_RATES, {
        pair: FX_PAIR_USD_TWD,
        rate: fx.rate,
        fetchedAt: fx.fetchedAt,
        source: "open.er-api",
        updatedAt: getNowIso(),
        deletedAt: null,
        syncState: SYNC_PENDING,
      });
    }

    const nowIso = getNowIso();
    const snapshots = [];

    for (let i = 0; i < targetHoldings.length; i += 1) {
      if (i > 0) {
        await sleepForRateLimit(1_200);
      }

      const holding = targetHoldings[i];
      const quote = await getHoldingQuote(holding);
      const valueTwd =
        holding.market === MARKET.US
          ? quote.price * holding.shares * usdTwdRate
          : quote.price * holding.shares;

      snapshots.push({
        holdingId: holding.id,
        symbol: holding.symbol,
        market: holding.market,
        holder: normalizeHolderOptionValue(holding.holder) || null,
        price: quote.price,
        currency: quote.currency,
        fxRateToTwd: usdTwdRate,
        valueTwd,
        capturedAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
        syncState: SYNC_PENDING,
      });

      if (quote.name && quote.name !== holding.companyName) {
        await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, {
          ...holding,
          companyName: quote.name,
          updatedAt: nowIso,
          syncState: SYNC_PENDING,
        });
      }
    }

    if (snapshots.length > 0) {
      for (const snapshot of snapshots) {
        await mirrorToCloud(CLOUD_COLLECTION.PRICE_SNAPSHOTS, snapshot);
      }
    }

    await mirrorToCloud(CLOUD_COLLECTION.SYNC_META, {
      key: SYNC_KEY_PRICES,
      lastUpdatedAt: nowIso,
      status: "success",
      errorMessage: "",
      updatedAt: nowIso,
      deletedAt: null,
      syncState: SYNC_PENDING,
    });

    return {
      updatedCount: snapshots.length,
      targetCount: targetHoldings.length,
      market,
      lastUpdatedAt: nowIso,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await setSyncMeta({
      status: "error",
      errorMessage,
    });
    throw new Error(errorMessage);
  }
};

export const upsertCashAccount = async ({
  bankCode,
  bankName,
  accountAlias,
  balanceTwd,
  holder,
}) => {
  ensureCloudWritable();
  const normalizedBankCode =
    typeof bankCode === "string" ? bankCode.trim() : undefined;
  const normalizedBankName = String(bankName ?? "").trim();
  const normalizedAlias = String(accountAlias ?? "").trim();
  const holderOptions = await ensureHolderOptions();
  const normalizedHolder = normalizeConfiguredHolder(holder, holderOptions);
  const parsedBalance = Number(balanceTwd);

  if (!normalizedBankName) {
    throw new Error("Bank name is required");
  }
  if (!normalizedAlias) {
    throw new Error("Account alias is required");
  }
  if (!Number.isFinite(parsedBalance) || parsedBalance < 0) {
    throw new Error("Balance must be a non-negative number");
  }

  const existing = await db.cash_accounts
    .where("[bankName+accountAlias+holder]")
    .equals([normalizedBankName, normalizedAlias, normalizedHolder])
    .first();

  const nowIso = getNowIso();
  if (existing) {
    const nextCash = {
      ...existing,
      bankCode: normalizedBankCode || null,
      bankName: normalizedBankName,
      accountAlias: normalizedAlias,
      holder: normalizedHolder,
      balanceTwd: parsedBalance,
      updatedAt: nowIso,
      deletedAt: null,
      syncState: SYNC_PENDING,
    };
    await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, nextCash);
    await recordCashBalanceSnapshot({
      cashAccount: nextCash,
      balanceTwd: parsedBalance,
      capturedAt: nowIso,
    });
    return {
      id: existing.id,
      created: false,
    };
  }

  const nextCash = {
    bankCode: normalizedBankCode || null,
    bankName: normalizedBankName,
    accountAlias: normalizedAlias,
    holder: normalizedHolder,
    balanceTwd: parsedBalance,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  };
  await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, nextCash);
  const insertedCash = await db.cash_accounts
    .where("[bankName+accountAlias+holder]")
    .equals([normalizedBankName, normalizedAlias, normalizedHolder])
    .first();
  await recordCashBalanceSnapshot({
    cashAccount: insertedCash ?? nextCash,
    balanceTwd: parsedBalance,
    capturedAt: nowIso,
  });

  return {
    id: requireLocalId(insertedCash, "銀行帳戶"),
    created: true,
  };
};

export const updateCashAccountHolder = async ({ id, holder }) => {
  ensureCloudWritable();
  const parsedId = Number(id);
  const holderOptions = await ensureHolderOptions();
  const normalizedHolder = normalizeConfiguredHolder(holder, holderOptions);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Cash account not found");
  }

  const existing = await db.cash_accounts.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Cash account not found");
  }
  if ((existing.holder ?? null) === (normalizedHolder ?? null)) {
    return;
  }

  const conflict = await db.cash_accounts
    .where("[bankName+accountAlias+holder]")
    .equals([existing.bankName, existing.accountAlias, normalizedHolder])
    .and((item) => item.id !== parsedId && !isDeleted(item))
    .first();
  if (conflict) {
    throw new Error("同持有人的該銀行帳戶已存在");
  }

  const nextCashAccount = {
    ...existing,
    holder: normalizedHolder,
    updatedAt: getNowIso(),
    syncState: SYNC_PENDING,
  };
  await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, nextCashAccount);
  await migrateCashAccountCloudKeyIfNeeded({
    previousCashAccount: existing,
    nextCashAccount,
  });
};

export const updateCashAccountBalance = async ({ id, balanceTwd }) => {
  ensureCloudWritable();
  const parsedId = Number(id);
  const parsedBalance = Number(balanceTwd);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Cash account not found");
  }
  if (!Number.isFinite(parsedBalance) || parsedBalance < 0) {
    throw new Error("Balance must be a non-negative number");
  }

  const existing = await db.cash_accounts.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Cash account not found");
  }

  const nowTs = Date.now();
  const beforeIso = new Date(nowTs - 1).toISOString();
  const afterIso = new Date(nowTs).toISOString();

  // Capture "before" value first so baseline fallback can infer delta correctly
  // for legacy accounts that had no historical cash snapshots.
  await recordCashBalanceSnapshot({
    cashAccount: existing,
    balanceTwd: existing.balanceTwd,
    capturedAt: beforeIso,
  });

  const updatedCash = {
    ...existing,
    balanceTwd: parsedBalance,
    updatedAt: afterIso,
    syncState: SYNC_PENDING,
  };
  await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, updatedCash);
  await recordCashBalanceSnapshot({
    cashAccount: updatedCash,
    balanceTwd: parsedBalance,
    capturedAt: afterIso,
  });
};

export const removeCashAccount = async ({ id }) => {
  ensureCloudWritable();
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Cash account not found");
  }

  const existing = await db.cash_accounts.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Cash account not found");
  }

  const nowIso = getNowIso();
  const deletedCash = {
    ...existing,
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  };
  await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, deletedCash);
  await recordCashBalanceSnapshot({
    cashAccount: deletedCash,
    balanceTwd: 0,
    capturedAt: nowIso,
  });
};

export const getCashAccountsView = async () => {
  const holderOptions = await ensureHolderOptions();
  const cashAccounts = await getActiveCashAccounts();
  cashAccounts.sort((a, b) => {
    if (!a?.updatedAt && !b?.updatedAt) return 0;
    if (!a?.updatedAt) return 1;
    if (!b?.updatedAt) return -1;
    return a.updatedAt > b.updatedAt ? -1 : 1;
  });

  let totalCashTwd = 0;
  const rows = cashAccounts.map((item) => {
    const balanceTwd = parseNumericLike(item.balanceTwd, {
      fallback: 0,
      context: "getCashAccountsView.balanceTwd",
    });
    totalCashTwd += balanceTwd;
    return {
      id: item.id,
      bankCode: item.bankCode || undefined,
      bankName: item.bankName,
      accountAlias: item.accountAlias,
      holder: normalizeConfiguredHolder(item.holder, holderOptions),
      holderName:
        normalizeConfiguredHolder(item.holder, holderOptions) || "未設定",
      balanceTwd,
      updatedAt: item.updatedAt,
    };
  });

  return {
    rows,
    totalCashTwd,
  };
};

export const repairNumericFields = async () => {
  ensureCloudWritable();
  const nowIso = getNowIso();
  let updatedRows = 0;

  const holdings = await db.holdings.toArray();
  for (const row of holdings) {
    const nextShares = parseNumericLike(row.shares, {
      fallback: 0,
      context: "repairNumericFields.holdings.shares",
    });
    const nextSortOrder = Math.max(
      1,
      Math.round(
        parseNumericLike(row.sortOrder, {
          fallback: 1,
          context: "repairNumericFields.holdings.sortOrder",
        }),
      ),
    );
    if (row.shares === nextShares && row.sortOrder === nextSortOrder) {
      continue;
    }
    await mirrorToCloud(CLOUD_COLLECTION.HOLDINGS, {
      ...row,
      shares: nextShares,
      sortOrder: nextSortOrder,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
    updatedRows += 1;
  }

  const snapshots = await db.price_snapshots.toArray();
  for (const row of snapshots) {
    const nextPrice = parseNumericLike(row.price, {
      fallback: 0,
      context: "repairNumericFields.price_snapshots.price",
    });
    const nextFxRateToTwd = parseNumericLike(row.fxRateToTwd, {
      fallback: 0,
      context: "repairNumericFields.price_snapshots.fxRateToTwd",
    });
    const nextValueTwd = parseNumericLike(row.valueTwd, {
      fallback: 0,
      context: "repairNumericFields.price_snapshots.valueTwd",
    });
    if (
      row.price === nextPrice &&
      row.fxRateToTwd === nextFxRateToTwd &&
      row.valueTwd === nextValueTwd
    ) {
      continue;
    }
    await mirrorToCloud(CLOUD_COLLECTION.PRICE_SNAPSHOTS, {
      ...row,
      price: nextPrice,
      fxRateToTwd: nextFxRateToTwd,
      valueTwd: nextValueTwd,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
    updatedRows += 1;
  }

  const cashAccounts = await db.cash_accounts.toArray();
  for (const row of cashAccounts) {
    const nextBalanceTwd = parseNumericLike(row.balanceTwd, {
      fallback: 0,
      context: "repairNumericFields.cash_accounts.balanceTwd",
    });
    if (row.balanceTwd === nextBalanceTwd) {
      continue;
    }
    await mirrorToCloud(CLOUD_COLLECTION.CASH_ACCOUNTS, {
      ...row,
      balanceTwd: nextBalanceTwd,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
    updatedRows += 1;
  }

  const cashSnapshots = await db.cash_balance_snapshots.toArray();
  for (const row of cashSnapshots) {
    const nextBalanceTwd = parseNumericLike(row.balanceTwd, {
      fallback: 0,
      context: "repairNumericFields.cash_balance_snapshots.balanceTwd",
    });
    if (row.balanceTwd === nextBalanceTwd) {
      continue;
    }
    await mirrorToCloud(CLOUD_COLLECTION.CASH_BALANCE_SNAPSHOTS, {
      ...row,
      balanceTwd: nextBalanceTwd,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
    updatedRows += 1;
  }

  return { updatedRows };
};

export const getPortfolioView = async () => {
  const allHoldings = await db.holdings.toArray();
  const holdings = allHoldings.filter((item) => !isDeleted(item));
  holdings.sort(sortHoldingsByOrder);
  const allCashAccounts = await db.cash_accounts.toArray();
  const holderOptions = await ensureHolderOptions();
  const tagOptions = await ensureHoldingTagOptions();
  const tagLabelMap = new Map(
    tagOptions.map((item) => [item.value, item.label]),
  );
  const defaultTag = getDefaultHoldingTag(tagOptions);
  const baselineAt = getBaselineAtIso();

  const rows = [];
  let stockTotalTwd = 0;

  for (const holding of holdings) {
    const { latestSnapshot, previousSnapshot } =
      await getLatestTwoSnapshotsByHoldingId(holding.id);
    const latestPrice = parseNumericLike(latestSnapshot?.price, {
      fallback: Number.NaN,
      context: "getPortfolioView.latestSnapshot.price",
    });
    const hasLatestPrice = Number.isFinite(latestPrice);
    const fxRateToTwd =
      holding.market === MARKET.US
        ? parseNumericLike(latestSnapshot?.fxRateToTwd, {
            fallback: 1,
            context: "getPortfolioView.latestSnapshot.fxRateToTwd",
          })
        : 1;
    const latestValueTwd = hasLatestPrice
      ? latestPrice *
        parseNumericLike(holding.shares, {
          fallback: 0,
          context: "getPortfolioView.holding.shares",
        }) *
        fxRateToTwd
      : parseNumericLike(latestSnapshot?.valueTwd, {
          fallback: Number.NaN,
          context: "getPortfolioView.latestSnapshot.valueTwd",
        });
    const prevPrice = parseNumericLike(previousSnapshot?.price, {
      fallback: Number.NaN,
      context: "getPortfolioView.previousSnapshot.price",
    });
    const prevValueTwd = parseNumericLike(previousSnapshot?.valueTwd, {
      fallback: Number.NaN,
      context: "getPortfolioView.previousSnapshot.valueTwd",
    });
    const hasPreviousSnapshot = Boolean(previousSnapshot);
    const priceChange =
      hasLatestPrice && Number.isFinite(prevPrice)
        ? latestPrice - prevPrice
        : undefined;
    const valueChangeTwd =
      Number.isFinite(latestValueTwd) && Number.isFinite(prevValueTwd)
        ? latestValueTwd - prevValueTwd
        : undefined;
    const priceChangePct =
      Number.isFinite(priceChange) &&
      Number.isFinite(prevPrice) &&
      prevPrice !== 0
        ? (priceChange / prevPrice) * 100
        : null;
    const valueChangePct =
      Number.isFinite(valueChangeTwd) &&
      Number.isFinite(prevValueTwd) &&
      prevValueTwd !== 0
        ? (valueChangeTwd / prevValueTwd) * 100
        : null;

    const row = {
      id: holding.id,
      symbol: holding.symbol,
      companyName: holding.companyName,
      market: holding.market,
      holder: normalizeConfiguredHolder(holding.holder, holderOptions),
      holderName:
        normalizeConfiguredHolder(holding.holder, holderOptions) || "未設定",
      assetTag: holding.assetTag || defaultTag,
      assetTagLabel:
        tagLabelMap.get(holding.assetTag || defaultTag) ||
        holding.assetTag ||
        defaultTag,
      shares: parseNumericLike(holding.shares, {
        fallback: 0,
        context: "getPortfolioView.row.shares",
      }),
      latestPrice: hasLatestPrice ? latestPrice : undefined,
      prevPrice,
      priceChange,
      priceChangePct,
      latestValueTwd,
      prevValueTwd,
      valueChangeTwd,
      valueChangePct,
      hasPreviousSnapshot,
      latestCurrency: latestSnapshot?.currency,
      latestCapturedAt: latestSnapshot?.capturedAt,
    };

    if (Number.isFinite(row.latestValueTwd)) {
      stockTotalTwd += row.latestValueTwd;
    }

    rows.push(row);
  }

  let baselineStockTotalTwd = 0;
  for (const holding of allHoldings) {
    if (holding.deletedAt && holding.deletedAt <= baselineAt) {
      continue;
    }
    const baselineSnapshot = await getLatestSnapshotAtOrBefore(
      holding.id,
      baselineAt,
    );
    const baselineValueTwd = parseNumericLike(baselineSnapshot?.valueTwd, {
      fallback: Number.NaN,
      context: "getPortfolioView.baselineSnapshot.valueTwd",
    });
    if (Number.isFinite(baselineValueTwd)) {
      baselineStockTotalTwd += baselineValueTwd;
    }
  }

  let baselineCashTotalTwd = 0;
  for (const cashAccount of allCashAccounts) {
    if (cashAccount.deletedAt && cashAccount.deletedAt <= baselineAt) {
      continue;
    }
    const baselineSnapshot = await getLatestCashBalanceSnapshotAtOrBefore(
      cashAccount.id,
      baselineAt,
    );
    const baselineBalance = parseNumericLike(baselineSnapshot?.balanceTwd, {
      fallback: Number.NaN,
      context: "getPortfolioView.baselineCashSnapshot.balanceTwd",
    });
    if (Number.isFinite(baselineBalance)) {
      baselineCashTotalTwd += baselineBalance;
      continue;
    }

    // Legacy fallback: if there is no snapshot at/before baseline, use the first
    // snapshot after baseline as an approximation of baseline value.
    const firstSnapshotAfterBaseline =
      await getEarliestCashBalanceSnapshotAfter(cashAccount.id, baselineAt);
    const firstBalanceAfterBaseline = parseNumericLike(
      firstSnapshotAfterBaseline?.balanceTwd,
      {
        fallback: Number.NaN,
        context: "getPortfolioView.firstSnapshotAfterBaseline.balanceTwd",
      },
    );
    if (Number.isFinite(firstBalanceAfterBaseline)) {
      baselineCashTotalTwd += firstBalanceAfterBaseline;
      continue;
    }

    // Backward compatibility: older cash accounts may not have balance snapshots yet.
    // If account was already created and not updated after baseline time, treat current
    // balance as the baseline value.
    if (
      cashAccount.createdAt &&
      cashAccount.createdAt <= baselineAt &&
      cashAccount.updatedAt &&
      cashAccount.updatedAt <= baselineAt
    ) {
      const fallbackBalance = parseNumericLike(cashAccount.balanceTwd, {
        fallback: Number.NaN,
        context: "getPortfolioView.cashAccount.balanceTwd",
      });
      if (Number.isFinite(fallbackBalance)) {
        baselineCashTotalTwd += fallbackBalance;
      }
    }
  }

  const syncMeta = await db.sync_meta.get(SYNC_KEY_PRICES);
  const cashView = await getCashAccountsView();
  const totalTwd = stockTotalTwd + cashView.totalCashTwd;
  const baselineTotalTwd = baselineStockTotalTwd + baselineCashTotalTwd;
  const totalChangeTwd = totalTwd - baselineTotalTwd;
  const totalChangePct =
    Number.isFinite(baselineTotalTwd) && baselineTotalTwd !== 0
      ? (totalChangeTwd / baselineTotalTwd) * 100
      : null;

  return {
    rows,
    cashRows: cashView.rows,
    stockTotalTwd,
    totalCashTwd: cashView.totalCashTwd,
    baselineStockTotalTwd,
    baselineCashTotalTwd,
    totalTwd,
    baselineAt,
    baselineTotalTwd,
    totalChangeTwd,
    totalChangePct,
    lastUpdatedAt: syncMeta?.lastUpdatedAt,
    syncStatus: syncMeta?.status,
    syncError: syncMeta?.errorMessage,
    cloudSyncState: syncMeta?.syncState ?? SYNC_SYNCED,
  };
};

export const getTrend = async (range) => {
  const pointCount = TREND_RANGE_DAYS[range] ?? TREND_RANGE_DAYS["24h"];
  const latestCompletedDayEnd = dayjs()
    .tz("Asia/Taipei")
    .subtract(1, "day")
    .endOf("day");

  const cutoffs = [];
  for (let i = pointCount - 1; i >= 0; i -= 1) {
    cutoffs.push(latestCompletedDayEnd.subtract(i, "day"));
  }

  const allHoldings = await db.holdings.toArray();
  const allCashAccounts = await db.cash_accounts.toArray();

  const stockSnapshotsByHolding = new Map();
  for (const holding of allHoldings) {
    const snapshots = await db.price_snapshots
      .where("[holdingId+capturedAt]")
      .between([holding.id, DB_MIN_KEY], [holding.id, DB_MAX_KEY], true, true)
      .toArray();
    stockSnapshotsByHolding.set(holding.id, snapshots);
  }

  const cashSnapshotsByAccount = new Map();
  for (const cashAccount of allCashAccounts) {
    const snapshots = await db.cash_balance_snapshots
      .where("[cashAccountId+capturedAt]")
      .between(
        [cashAccount.id, DB_MIN_KEY],
        [cashAccount.id, DB_MAX_KEY],
        true,
        true,
      )
      .toArray();
    cashSnapshotsByAccount.set(cashAccount.id, snapshots);
  }

  const findLatestAtOrBefore = (snapshots, cutoffIso) => {
    for (let i = snapshots.length - 1; i >= 0; i -= 1) {
      const snapshot = snapshots[i];
      if (snapshot.capturedAt > cutoffIso) {
        continue;
      }
      if (!isDeleted(snapshot)) {
        return snapshot;
      }
    }
    return undefined;
  };

  return cutoffs.map((cutoff) => {
    const cutoffIso = cutoff.utc().toISOString();

    let stockTotalTwd = 0;
    for (const holding of allHoldings) {
      if (holding.deletedAt && holding.deletedAt <= cutoffIso) {
        continue;
      }
      const snapshots = stockSnapshotsByHolding.get(holding.id) || [];
      const snapshot = findLatestAtOrBefore(snapshots, cutoffIso);
      if (typeof snapshot?.valueTwd === "number") {
        stockTotalTwd += snapshot.valueTwd;
      }
    }

    let cashTotalTwd = 0;
    for (const cashAccount of allCashAccounts) {
      if (cashAccount.deletedAt && cashAccount.deletedAt <= cutoffIso) {
        continue;
      }
      const snapshots = cashSnapshotsByAccount.get(cashAccount.id) || [];
      const snapshot = findLatestAtOrBefore(snapshots, cutoffIso);
      if (typeof snapshot?.balanceTwd === "number") {
        cashTotalTwd += snapshot.balanceTwd;
      }
    }

    return {
      ts: cutoffIso,
      totalTwd: stockTotalTwd + cashTotalTwd,
    };
  });
};

const monthRange = (month) => {
  const parsed = dayjs(`${month}-01`);
  const start = parsed.startOf("month");
  const end = parsed.endOf("month");
  return { start, end };
};

const clampDayInMonth = (date, day) => {
  const daysInMonth = date.daysInMonth();
  return Math.min(Math.max(1, day), daysInMonth);
};

const resolveRecurringOccurrenceDate = (entry, monthStart) => {
  if (entry.recurrenceType === RECURRENCE_TYPE.MONTHLY) {
    const day = Number(
      entry.monthlyDay || toDayjsDateOnly(entry.occurredAt).date(),
    );
    const d = clampDayInMonth(monthStart, day);
    return monthStart.date(d);
  }

  if (entry.recurrenceType === RECURRENCE_TYPE.YEARLY) {
    const month = Number(
      entry.yearlyMonth || toDayjsDateOnly(entry.occurredAt).month() + 1,
    );
    const day = Number(
      entry.yearlyDay || toDayjsDateOnly(entry.occurredAt).date(),
    );
    const candidateMonth = monthStart.month() + 1;
    if (candidateMonth !== month) {
      return null;
    }
    const d = clampDayInMonth(monthStart, day);
    return monthStart.date(d);
  }

  return null;
};

const entryIsActiveOnDate = (entry, dateObj) => {
  const start = toDayjsDateOnly(entry.occurredAt);
  if (!start.isValid() || dateObj.isBefore(start, "day")) {
    return false;
  }
  if (entry.recurrenceUntil) {
    const until = toDayjsDateOnly(entry.recurrenceUntil);
    if (until.isValid() && dateObj.isAfter(until, "day")) {
      return false;
    }
  }
  return true;
};

const expandRecurringOccurrencesForMonth = (entries, month) => {
  const { start, end } = monthRange(month);
  const rows = [];

  for (const entry of entries) {
    if (isDeleted(entry)) {
      continue;
    }

    if (entry.entryType !== EXPENSE_ENTRY_TYPE.RECURRING) {
      const occurred = toDayjsDateOnly(entry.occurredAt);
      if (
        occurred.isValid() &&
        !occurred.isBefore(start, "day") &&
        !occurred.isAfter(end, "day")
      ) {
        rows.push({
          ...entry,
          occurrenceDate: occurred.format("YYYY-MM-DD"),
          isRecurringOccurrence: false,
        });
      }
      continue;
    }

    const occurrence = resolveRecurringOccurrenceDate(entry, start.clone());
    if (
      !occurrence ||
      occurrence.isBefore(start, "day") ||
      occurrence.isAfter(end, "day")
    ) {
      continue;
    }
    if (!entryIsActiveOnDate(entry, occurrence)) {
      continue;
    }
    rows.push({
      ...entry,
      occurrenceDate: occurrence.format("YYYY-MM-DD"),
      isRecurringOccurrence: true,
    });
  }

  rows.sort((a, b) => {
    const aOccurrence = a.occurrenceDate || "";
    const bOccurrence = b.occurrenceDate || "";
    if (aOccurrence !== bOccurrence) {
      return bOccurrence.localeCompare(aOccurrence);
    }

    const aCreatedAt = a.createdAt || "";
    const bCreatedAt = b.createdAt || "";
    if (aCreatedAt !== bCreatedAt) {
      return bCreatedAt.localeCompare(aCreatedAt);
    }

    const aUpdatedAt = a.updatedAt || "";
    const bUpdatedAt = b.updatedAt || "";
    if (aUpdatedAt !== bUpdatedAt) {
      return bUpdatedAt.localeCompare(aUpdatedAt);
    }

    const aId = Number(a.id);
    const bId = Number(b.id);
    if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
      return bId - aId;
    }
    return 0;
  });

  return rows;
};

const computeCumulativeExpenseTotal = (
  entries,
  endDateInput = getNowDate(),
) => {
  const endDate = toDayjsDateOnly(endDateInput);
  if (!endDate.isValid()) {
    return 0;
  }

  let total = 0;

  for (const entry of entries) {
    if (isDeleted(entry)) {
      continue;
    }

    const amount = Number(entry.amountTwd) || 0;
    if (amount <= 0) {
      continue;
    }

    if (entry.entryType !== EXPENSE_ENTRY_TYPE.RECURRING) {
      const occurred = toDayjsDateOnly(entry.occurredAt);
      if (occurred.isValid() && !occurred.isAfter(endDate, "day")) {
        total += amount;
      }
      continue;
    }

    const start = toDayjsDateOnly(entry.occurredAt);
    if (!start.isValid() || start.isAfter(endDate, "day")) {
      continue;
    }

    const until = entry.recurrenceUntil
      ? toDayjsDateOnly(entry.recurrenceUntil)
      : endDate;
    const limit =
      until.isValid() && until.isBefore(endDate, "day") ? until : endDate;

    let cursor = start.startOf("month");
    while (!cursor.isAfter(limit, "month")) {
      const occurrence = resolveRecurringOccurrenceDate(entry, cursor.clone());
      if (
        occurrence &&
        !occurrence.isBefore(start, "day") &&
        !occurrence.isAfter(limit, "day") &&
        entryIsActiveOnDate(entry, occurrence)
      ) {
        total += amount;
      }
      cursor = cursor.add(1, "month");
    }
  }

  return total;
};

const computeExpenseBreakdown = (occurrences = []) => {
  let recurringTotal = 0;
  let oneTimeTotal = 0;

  for (const occurrence of occurrences) {
    const amount = Number(occurrence?.amountTwd) || 0;
    if (amount <= 0) continue;
    if (
      occurrence?.entryType === EXPENSE_ENTRY_TYPE.RECURRING ||
      occurrence?.isRecurringOccurrence
    ) {
      recurringTotal += amount;
    } else {
      oneTimeTotal += amount;
    }
  }

  return {
    recurringTotal,
    oneTimeTotal,
    total: recurringTotal + oneTimeTotal,
  };
};

const normalizeExpensePayer = (payer, holderOptions = []) => {
  const normalized = normalizeHolderOptionValue(payer);
  if (!normalized) {
    return null;
  }
  if (normalized === "共同帳戶") {
    return normalized;
  }
  return normalizeConfiguredHolder(normalized, holderOptions);
};

const expandExpenseOccurrencesUntilDate = (
  entries,
  endDateInput = getNowDate(),
) => {
  const endDate = toDayjsDateOnly(endDateInput);
  if (!endDate.isValid()) {
    return [];
  }

  const rows = [];

  for (const entry of entries) {
    if (isDeleted(entry)) continue;
    const amount = Number(entry.amountTwd) || 0;
    if (amount <= 0) continue;

    if (entry.entryType !== EXPENSE_ENTRY_TYPE.RECURRING) {
      const occurred = toDayjsDateOnly(entry.occurredAt);
      if (occurred.isValid() && !occurred.isAfter(endDate, "day")) {
        rows.push({
          id: entry.id,
          amountTwd: amount,
          occurredAt: occurred.format("YYYY-MM-DD"),
          entryType: entry.entryType || EXPENSE_ENTRY_TYPE.ONE_TIME,
          isRecurringOccurrence: false,
          payer: entry.payer ?? null,
          expenseKind: entry.expenseKind ?? null,
          categoryId: entry.categoryId ?? null,
        });
      }
      continue;
    }

    const recurringStart = toDayjsDateOnly(entry.occurredAt);
    if (!recurringStart.isValid() || recurringStart.isAfter(endDate, "day")) {
      continue;
    }
    const until = entry.recurrenceUntil
      ? toDayjsDateOnly(entry.recurrenceUntil)
      : endDate;
    const limit =
      until.isValid() && until.isBefore(endDate, "day") ? until : endDate;
    if (limit.isBefore(recurringStart, "day")) {
      continue;
    }

    let cursor = recurringStart.startOf("month");
    while (!cursor.isAfter(limit, "month")) {
      const occurrence = resolveRecurringOccurrenceDate(entry, cursor.clone());
      if (
        occurrence &&
        !occurrence.isBefore(recurringStart, "day") &&
        !occurrence.isAfter(limit, "day") &&
        entryIsActiveOnDate(entry, occurrence)
      ) {
        rows.push({
          id: entry.id,
          amountTwd: amount,
          occurredAt: occurrence.format("YYYY-MM-DD"),
          entryType: entry.entryType || EXPENSE_ENTRY_TYPE.RECURRING,
          isRecurringOccurrence: true,
          payer: entry.payer ?? null,
          expenseKind: entry.expenseKind ?? null,
          categoryId: entry.categoryId ?? null,
        });
      }
      cursor = cursor.add(1, "month");
    }
  }

  return rows;
};

const buildMonthlyTotalsSeries = (occurrences, endDateInput = getNowDate()) => {
  const end = toDayjsDateOnly(endDateInput);
  const validOccurred = occurrences
    .map((item) => normalizeDateOnly(item.occurredAt))
    .filter(Boolean);
  const firstMonth =
    validOccurred.length > 0
      ? validOccurred.sort()[0].slice(0, 7)
      : end.format("YYYY-MM");
  const endMonth = end.format("YYYY-MM");
  const totals = new Map();
  const recurringTotals = new Map();

  for (const occurrence of occurrences) {
    const month = normalizeDateOnly(occurrence.occurredAt)?.slice(0, 7);
    if (!month) continue;
    const amount = Number(occurrence.amountTwd) || 0;
    totals.set(
      month,
      (totals.get(month) || 0) + amount,
    );
    if (
      occurrence.isRecurringOccurrence ||
      occurrence.entryType === EXPENSE_ENTRY_TYPE.RECURRING
    ) {
      recurringTotals.set(month, (recurringTotals.get(month) || 0) + amount);
    }
  }

  const series = [];
  let cursor = dayjs(`${firstMonth}-01`);
  const limit = dayjs(`${endMonth}-01`);
  while (!cursor.isAfter(limit, "month")) {
    const month = cursor.format("YYYY-MM");
    series.push({
      month,
      totalTwd: Number(totals.get(month) || 0),
      recurringTwd: Number(recurringTotals.get(month) || 0),
    });
    cursor = cursor.add(1, "month");
  }
  return series;
};

const getOccurrencesForMonth = (entries, month) =>
  expandRecurringOccurrencesForMonth(entries, month).map((item) => ({
    id: item.id,
    amountTwd: Number(item.amountTwd) || 0,
    occurredAt: item.occurrenceDate,
    entryType: item.entryType || EXPENSE_ENTRY_TYPE.ONE_TIME,
    isRecurringOccurrence: Boolean(item.isRecurringOccurrence),
    payer: item.payer ?? null,
    expenseKind: item.expenseKind ?? null,
    categoryId: item.categoryId ?? null,
  }));

const buildExpenseAnalytics = ({
  occurrences,
  categoryMap,
  holderOptions = [],
  trendMode = "all",
  month,
  today = getNowDate(),
}) => {
  const kindBucket = {
    家庭: 0,
    個人: 0,
    未指定: 0,
  };
  const holderSet = new Set(holderOptions);
  const payerRankingBucket = new Map(
    holderOptions.map((holder) => [holder, 0]),
  );
  const familyBalanceBucket = new Map(
    holderOptions.map((holder) => [holder, 0]),
  );
  let familyTotal = 0;
  const categoryBucket = new Map();

  for (const occurrence of occurrences) {
    const amount = Number(occurrence.amountTwd) || 0;
    if (amount <= 0) continue;
    const kind =
      occurrence.expenseKind === "家庭" || occurrence.expenseKind === "個人"
        ? occurrence.expenseKind
        : "未指定";
    const payer = normalizeExpensePayer(occurrence.payer, holderOptions);

    kindBucket[kind] += amount;

    if (kind === "個人" && payer && holderSet.has(payer)) {
      payerRankingBucket.set(
        payer,
        (payerRankingBucket.get(payer) || 0) + amount,
      );
    }
    if (kind === "家庭") {
      familyTotal += amount;
      if (payer && holderSet.has(payer)) {
        familyBalanceBucket.set(
          payer,
          (familyBalanceBucket.get(payer) || 0) + amount,
        );
      }
    }

    const categoryName = occurrence.categoryId
      ? categoryMap.get(occurrence.categoryId) || "未分類"
      : "未分類";
    categoryBucket.set(
      categoryName,
      (categoryBucket.get(categoryName) || 0) + amount,
    );
  }

  const monthlyTotalsAllHistory =
    trendMode === "month"
      ? [
          {
            month,
            totalTwd: occurrences.reduce(
              (sum, item) => sum + (Number(item.amountTwd) || 0),
              0,
            ),
            recurringTwd: occurrences.reduce(
              (sum, item) =>
                sum +
                (item.isRecurringOccurrence ||
                item.entryType === EXPENSE_ENTRY_TYPE.RECURRING
                  ? Number(item.amountTwd) || 0
                  : 0),
              0,
            ),
          },
        ]
      : buildMonthlyTotalsSeries(occurrences, today);

  return {
    monthlyTotalsAllHistory,
    kindBreakdown: [
      { key: "家庭", value: kindBucket.家庭 },
      { key: "個人", value: kindBucket.個人 },
      { key: "未指定", value: kindBucket.未指定 },
    ],
    payerRanking: [
      ...holderOptions.map((holder) => ({
        key: `personal:${holder}`,
        label: holder,
        value: payerRankingBucket.get(holder) || 0,
      })),
      {
        key: "family_total",
        label: "家庭",
        value: familyTotal,
      },
    ],
    familyBalance: holderOptions.map((holder) => ({
      key: `family:${holder}`,
      label: holder,
      value: familyBalanceBucket.get(holder) || 0,
    })),
    categoryBreakdown: Array.from(categoryBucket.entries())
      .map(([name, value]) => ({
        key: name,
        name,
        value,
      }))
      .sort((a, b) => b.value - a.value),
  };
};

const getBudgetCycleRange = (budget, refDateInput = getNowDate()) => {
  const start = toDayjsDateOnly(budget.startDate);
  const refDate = toDayjsDateOnly(refDateInput);
  if (
    !start.isValid() ||
    !refDate.isValid() ||
    refDate.isBefore(start, "day")
  ) {
    return null;
  }

  const budgetType = normalizeBudgetType(budget.budgetType);
  const monthsPerCycle = getMonthsPerCycle(budgetType);

  const monthsDiff = refDate.diff(start, "month");
  const cycleIndex = Math.floor(Math.max(0, monthsDiff) / monthsPerCycle);
  const cycleStart = start.add(cycleIndex * monthsPerCycle, "month");
  const cycleEnd = cycleStart.add(monthsPerCycle, "month").subtract(1, "day");

  return {
    cycleStart: cycleStart.format("YYYY-MM-DD"),
    cycleEnd: cycleEnd.format("YYYY-MM-DD"),
    cycleIndex,
    monthsPerCycle,
  };
};

const computeBudgetSpentInRange = ({ budgetId, entries, cycleRange }) => {
  if (!cycleRange) return 0;
  const start = toDayjsDateOnly(cycleRange.cycleStart);
  const end = toDayjsDateOnly(cycleRange.cycleEnd);
  if (!start.isValid() || !end.isValid()) return 0;

  let spentTwd = 0;
  for (const entry of entries) {
    if (isDeleted(entry)) continue;
    if (Number(entry.budgetId) !== Number(budgetId)) continue;

    const amount = Number(entry.amountTwd) || 0;
    if (amount <= 0) continue;

    if (entry.entryType !== EXPENSE_ENTRY_TYPE.RECURRING) {
      const occurred = toDayjsDateOnly(entry.occurredAt);
      if (!occurred.isValid()) continue;
      if (occurred.isBefore(start, "day") || occurred.isAfter(end, "day")) {
        continue;
      }
      spentTwd += amount;
      continue;
    }

    const recurringStart = toDayjsDateOnly(entry.occurredAt);
    if (!recurringStart.isValid()) continue;
    const until = entry.recurrenceUntil
      ? toDayjsDateOnly(entry.recurrenceUntil)
      : end;
    const limit = until.isValid() && until.isBefore(end, "day") ? until : end;
    if (limit.isBefore(start, "day")) continue;

    let cursor = start.startOf("month");
    while (!cursor.isAfter(end, "month")) {
      const occurrence = resolveRecurringOccurrenceDate(entry, cursor.clone());
      if (
        occurrence &&
        !occurrence.isBefore(start, "day") &&
        !occurrence.isAfter(limit, "day") &&
        !occurrence.isBefore(recurringStart, "day") &&
        entryIsActiveOnDate(entry, occurrence)
      ) {
        spentTwd += amount;
      }
      cursor = cursor.add(1, "month");
    }
  }

  return spentTwd;
};

const sumIncomeForCycle = ({
  cycleRange,
  defaultMonthlyIncomeTwd,
  monthOverridesMap,
}) => {
  const start = toDayjsDateOnly(cycleRange?.cycleStart);
  const end = toDayjsDateOnly(cycleRange?.cycleEnd);
  if (!start.isValid() || !end.isValid()) return 0;
  let total = 0;
  let cursor = start.startOf("month");
  while (!cursor.isAfter(end, "month")) {
    const monthKey = cursor.format("YYYY-MM");
    const income = resolveIncomeForMonth({
      month: monthKey,
      defaultMonthlyIncomeTwd,
      monthOverridesMap,
    });
    total += typeof income === "number" ? income : 0;
    cursor = cursor.add(1, "month");
  }
  return total;
};

const getCycleRangeByIndex = ({ startDate, budgetType, cycleIndex }) => {
  const start = toDayjsDateOnly(startDate);
  if (!start.isValid()) return null;
  const monthsPerCycle = getMonthsPerCycle(normalizeBudgetType(budgetType));
  const safeIndex = Math.max(0, Number(cycleIndex) || 0);
  const cycleStart = start.add(safeIndex * monthsPerCycle, "month");
  const cycleEnd = cycleStart.add(monthsPerCycle, "month").subtract(1, "day");
  return {
    cycleStart: cycleStart.format("YYYY-MM-DD"),
    cycleEnd: cycleEnd.format("YYYY-MM-DD"),
    cycleIndex: safeIndex,
    monthsPerCycle,
  };
};

const buildResidentBudgetStats = ({
  budget,
  entries,
  referenceDate,
  carryCutoffDate,
  defaultMonthlyIncomeTwd,
  monthOverridesMap,
}) => {
  const cycleRange = getBudgetCycleRange(budget, referenceDate);
  const residentPercent = Number(budget.residentPercent);
  const startDate = toDayjsDateOnly(budget.startDate);
  const carryCutoff = toDayjsDateOnly(carryCutoffDate);
  const isConfigured =
    Number.isFinite(residentPercent) &&
    residentPercent > 0 &&
    startDate.isValid();

  if (!isConfigured) {
    return {
      cycleStart: cycleRange?.cycleStart ?? null,
      cycleEnd: cycleRange?.cycleEnd ?? null,
      allocatedTwd: 0,
      carryInTwd: 0,
      hasCarryInApplied: false,
      availableTwd: 0,
      spentTwd: 0,
      remainingTwd: 0,
      progressPct: 0,
      isConfigured: false,
      isActive: false,
    };
  }

  if (!cycleRange) {
    return {
      cycleStart: null,
      cycleEnd: null,
      allocatedTwd: 0,
      carryInTwd: 0,
      hasCarryInApplied: false,
      availableTwd: 0,
      spentTwd: 0,
      remainingTwd: 0,
      progressPct: 0,
      isConfigured: true,
      isActive: false,
    };
  }

  let carryInTwd = 0;
  let hasCarryInApplied = false;
  for (let idx = 0; idx < cycleRange.cycleIndex; idx += 1) {
    const currentCycle = getCycleRangeByIndex({
      startDate: budget.startDate,
      budgetType: budget.budgetType,
      cycleIndex: idx,
    });
    const cycleIncome = sumIncomeForCycle({
      cycleRange: currentCycle,
      defaultMonthlyIncomeTwd,
      monthOverridesMap,
    });
    const cycleAllocated = (cycleIncome * residentPercent) / 100;
    const cycleSpent = computeBudgetSpentInRange({
      budgetId: budget.id,
      entries,
      cycleRange: currentCycle,
    });
    const cycleEnd = toDayjsDateOnly(currentCycle?.cycleEnd);
    if (
      carryCutoff.isValid() &&
      cycleEnd.isValid() &&
      cycleEnd.isBefore(carryCutoff, "day")
    ) {
      hasCarryInApplied = true;
      carryInTwd = carryInTwd + cycleAllocated - cycleSpent;
    } else {
      break;
    }
  }

  const targetCycle = getCycleRangeByIndex({
    startDate: budget.startDate,
    budgetType: budget.budgetType,
    cycleIndex: cycleRange.cycleIndex,
  });
  const targetCycleIncome = sumIncomeForCycle({
    cycleRange: targetCycle,
    defaultMonthlyIncomeTwd,
    monthOverridesMap,
  });
  const allocatedTwd = (targetCycleIncome * residentPercent) / 100;
  const spentTwd = computeBudgetSpentInRange({
    budgetId: budget.id,
    entries,
    cycleRange: targetCycle,
  });

  const availableTwd = carryInTwd + allocatedTwd;
  const remainingTwd = availableTwd - spentTwd;
  const progressPct =
    availableTwd !== 0
      ? Math.min(100, Math.max(0, (spentTwd / Math.abs(availableTwd)) * 100))
      : 0;

  return {
    cycleStart: cycleRange.cycleStart,
    cycleEnd: cycleRange.cycleEnd,
    allocatedTwd,
    carryInTwd,
    hasCarryInApplied,
    availableTwd,
    spentTwd,
    remainingTwd,
    progressPct,
    isConfigured: true,
    isActive:
      referenceDate >= cycleRange.cycleStart &&
      referenceDate <= cycleRange.cycleEnd,
  };
};

const buildSpecialBudgetStats = ({ budget, entries, today }) => {
  const startDate = normalizeDateOnly(budget.specialStartDate);
  const endDate = normalizeDateOnly(budget.specialEndDate);
  const specialAmountTwd = Number(budget.specialAmountTwd);
  const isConfigured =
    Boolean(startDate) &&
    Boolean(endDate) &&
    Number.isFinite(specialAmountTwd) &&
    specialAmountTwd > 0 &&
    !dayjs(endDate).isBefore(dayjs(startDate), "day");

  if (!isConfigured) {
    return {
      cycleStart: startDate ?? null,
      cycleEnd: endDate ?? null,
      allocatedTwd: 0,
      carryInTwd: 0,
      availableTwd: 0,
      spentTwd: 0,
      remainingTwd: 0,
      progressPct: 0,
      isConfigured: false,
      isActive: false,
    };
  }

  const cycleRange = {
    cycleStart: startDate,
    cycleEnd: endDate,
  };
  const spentTwd = computeBudgetSpentInRange({
    budgetId: budget.id,
    entries,
    cycleRange,
  });
  const availableTwd = specialAmountTwd;
  const remainingTwd = availableTwd - spentTwd;
  const progressPct =
    availableTwd > 0
      ? Math.min(100, Math.max(0, (spentTwd / availableTwd) * 100))
      : 0;

  return {
    cycleStart: startDate,
    cycleEnd: endDate,
    allocatedTwd: specialAmountTwd,
    carryInTwd: 0,
    availableTwd,
    spentTwd,
    remainingTwd,
    progressPct,
    isConfigured: true,
    isActive: today >= startDate && today <= endDate,
  };
};

export const upsertExpenseCategory = async ({ id, name }) => {
  ensureCloudWritable();
  const normalizedName = String(name || "").trim();
  if (!normalizedName) {
    throw new Error("Category name is required");
  }

  const nowIso = getNowIso();
  const parsedId = Number(id);
  if (Number.isInteger(parsedId) && parsedId > 0) {
    const existing = await db.expense_categories.get(parsedId);
    if (!existing || isDeleted(existing)) {
      throw new Error("Category not found");
    }
    await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_CATEGORIES, {
      ...existing,
      name: normalizedName,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
    return { id: parsedId, created: false };
  }

  const remoteKey = makeRemoteKey("category");
  await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_CATEGORIES, {
    remoteKey,
    name: normalizedName,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  });
  const inserted = await db.expense_categories.where("remoteKey").equals(remoteKey).first();
  return { id: requireLocalId(inserted, "分類"), created: true };
};

export const removeExpenseCategory = async ({ id }) => {
  ensureCloudWritable();
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Category not found");
  }
  const existing = await db.expense_categories.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Category not found");
  }
  const nowIso = getNowIso();
  await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_CATEGORIES, {
    ...existing,
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  });

  const entries = await db.expense_entries
    .where("categoryId")
    .equals(parsedId)
    .toArray();
  for (const entry of entries) {
    const nextEntry = await withExpenseAssociationKeys({
      ...entry,
      categoryId: null,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
    await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, nextEntry);
  }
};

export const upsertBudget = async ({
  id,
  name,
  budgetMode,
  budgetType,
  startDate,
  residentPercent,
  specialAmountTwd,
  specialStartDate,
  specialEndDate,
}) => {
  ensureCloudWritable();
  const normalizedName = String(name || "").trim();
  const normalizedMode = normalizeBudgetMode(budgetMode);
  const normalizedType = normalizeBudgetType(budgetType);
  const normalizedStartDate = normalizeDateOnly(startDate);
  const normalizedResidentPercent = Number(residentPercent);
  const normalizedSpecialAmount = Number(specialAmountTwd);
  const normalizedSpecialStartDate = normalizeDateOnly(specialStartDate);
  const normalizedSpecialEndDate = normalizeDateOnly(specialEndDate);

  if (!normalizedName) throw new Error("Budget name is required");
  if (normalizedMode === BUDGET_MODE.RESIDENT) {
    if (!normalizedStartDate) throw new Error("Budget start date is required");
    if (
      !Number.isFinite(normalizedResidentPercent) ||
      normalizedResidentPercent <= 0
    ) {
      throw new Error("Resident percent must be positive");
    }
  } else if (normalizedMode === BUDGET_MODE.SPECIAL) {
    if (
      !Number.isFinite(normalizedSpecialAmount) ||
      normalizedSpecialAmount <= 0
    ) {
      throw new Error("Special budget amount must be positive");
    }
    if (!normalizedSpecialStartDate || !normalizedSpecialEndDate) {
      throw new Error("Special budget date range is required");
    }
    if (dayjs(normalizedSpecialEndDate).isBefore(dayjs(normalizedSpecialStartDate), "day")) {
      throw new Error("Special budget end date must be after start date");
    }
  } else {
    throw new Error("Invalid budget mode");
  }

  const nowIso = getNowIso();
  const commonPayload = {
    name: normalizedName,
    budgetMode: normalizedMode,
    budgetType: normalizedMode === BUDGET_MODE.RESIDENT ? normalizedType : null,
    startDate:
      normalizedMode === BUDGET_MODE.RESIDENT ? normalizedStartDate : null,
    residentPercent:
      normalizedMode === BUDGET_MODE.RESIDENT
        ? normalizedResidentPercent
        : null,
    specialAmountTwd:
      normalizedMode === BUDGET_MODE.SPECIAL ? normalizedSpecialAmount : null,
    specialStartDate:
      normalizedMode === BUDGET_MODE.SPECIAL ? normalizedSpecialStartDate : null,
    specialEndDate:
      normalizedMode === BUDGET_MODE.SPECIAL ? normalizedSpecialEndDate : null,
    amountTwd:
      normalizedMode === BUDGET_MODE.SPECIAL ? normalizedSpecialAmount : null,
  };
  const parsedId = Number(id);
  if (Number.isInteger(parsedId) && parsedId > 0) {
    const existing = await db.budgets.get(parsedId);
    if (!existing || isDeleted(existing)) throw new Error("Budget not found");
    await mirrorToCloud(CLOUD_COLLECTION.BUDGETS, {
      ...existing,
      ...commonPayload,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
    return { id: parsedId, created: false };
  }

  const remoteKey = makeRemoteKey("budget");
  await mirrorToCloud(CLOUD_COLLECTION.BUDGETS, {
    remoteKey,
    ...commonPayload,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  });
  const inserted = await db.budgets.where("remoteKey").equals(remoteKey).first();
  return { id: requireLocalId(inserted, "預算"), created: true };
};

export const removeBudget = async ({ id }) => {
  ensureCloudWritable();
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Budget not found");
  }
  const existing = await db.budgets.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Budget not found");
  }
  const nowIso = getNowIso();
  await mirrorToCloud(CLOUD_COLLECTION.BUDGETS, {
    ...existing,
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  });
  const entries = await db.expense_entries
    .where("budgetId")
    .equals(parsedId)
    .toArray();
  for (const entry of entries) {
    const nextEntry = await withExpenseAssociationKeys({
      ...entry,
      budgetId: null,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
    await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, nextEntry);
  }
};

export const upsertExpenseEntry = async (input) => {
  ensureCloudWritable();
  const nowIso = getNowIso();
  const name = String(input?.name || "").trim();
  const holderOptions = await ensureHolderOptions();
  const payerRaw = String(input?.payer || "").trim();
  const normalizedPayerRaw = payerRaw === "共同" ? "共同帳戶" : payerRaw;
  const payer =
    normalizedPayerRaw === "共同帳戶"
      ? "共同帳戶"
      : normalizeConfiguredHolder(normalizedPayerRaw, holderOptions);
  const expenseKindRaw = String(input?.expenseKind || "").trim();
  const expenseKind = EXPENSE_KIND_OPTIONS.includes(expenseKindRaw)
    ? expenseKindRaw
    : null;
  const amountTwd = Number(input?.amountTwd);
  const occurredAt = normalizeDateOnly(input?.occurredAt) || getNowDate();
  const entryType = String(
    input?.entryType || EXPENSE_ENTRY_TYPE.ONE_TIME,
  ).toUpperCase();
  const recurrenceType = input?.recurrenceType
    ? String(input.recurrenceType).toUpperCase()
    : null;
  const monthlyDay = input?.monthlyDay ? Number(input.monthlyDay) : null;
  const yearlyMonth = input?.yearlyMonth ? Number(input.yearlyMonth) : null;
  const yearlyDay = input?.yearlyDay ? Number(input.yearlyDay) : null;
  const categoryId = input?.categoryId ? Number(input.categoryId) : null;
  const budgetId = input?.budgetId ? Number(input.budgetId) : null;

  if (!name) throw new Error("Expense name is required");
  if (!Number.isFinite(amountTwd) || amountTwd <= 0)
    throw new Error("Expense amount must be positive");
  if (!occurredAt) throw new Error("Expense date is required");
  if (
    ![EXPENSE_ENTRY_TYPE.ONE_TIME, EXPENSE_ENTRY_TYPE.RECURRING].includes(
      entryType,
    )
  ) {
    throw new Error("Invalid expense type");
  }
  if (entryType === EXPENSE_ENTRY_TYPE.RECURRING) {
    if (
      ![RECURRENCE_TYPE.MONTHLY, RECURRENCE_TYPE.YEARLY].includes(
        recurrenceType,
      )
    ) {
      throw new Error("Invalid recurrence type");
    }
    if (
      recurrenceType === RECURRENCE_TYPE.MONTHLY &&
      (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 31)
    ) {
      throw new Error("Monthly day must be between 1 and 31");
    }
    if (recurrenceType === RECURRENCE_TYPE.YEARLY) {
      if (
        !Number.isInteger(yearlyMonth) ||
        yearlyMonth < 1 ||
        yearlyMonth > 12
      ) {
        throw new Error("Yearly month must be between 1 and 12");
      }
      if (!Number.isInteger(yearlyDay) || yearlyDay < 1 || yearlyDay > 31) {
        throw new Error("Yearly day must be between 1 and 31");
      }
    }
  }

  const parsedId = Number(input?.id);
  if (Number.isInteger(parsedId) && parsedId > 0) {
    const existing = await db.expense_entries.get(parsedId);
    if (!existing || isDeleted(existing)) {
      throw new Error("Expense not found");
    }

    const today = getNowDate();
    const editingRecurringFutureOnly =
      existing.entryType === EXPENSE_ENTRY_TYPE.RECURRING &&
      existing.recurrenceUntil == null &&
      toDayjsDateOnly(existing.occurredAt).isBefore(
        toDayjsDateOnly(today),
        "day",
      ) &&
      entryType === EXPENSE_ENTRY_TYPE.RECURRING;

    if (editingRecurringFutureOnly) {
      const until = dayjs(today).subtract(1, "day").format("YYYY-MM-DD");
      const closed = await withExpenseAssociationKeys({
        ...existing,
        recurrenceUntil: until,
        updatedAt: nowIso,
        syncState: SYNC_PENDING,
      });
      await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, closed);

      const remoteKey = makeRemoteKey("expense");
      const nextEntry = await withExpenseAssociationKeys({
        remoteKey,
        name,
        payer,
        expenseKind,
        amountTwd,
        occurredAt: today,
        entryType,
        recurrenceType: recurrenceType ?? null,
        monthlyDay:
          recurrenceType === RECURRENCE_TYPE.MONTHLY ? monthlyDay : null,
        yearlyMonth:
          recurrenceType === RECURRENCE_TYPE.YEARLY ? yearlyMonth : null,
        yearlyDay: recurrenceType === RECURRENCE_TYPE.YEARLY ? yearlyDay : null,
        recurrenceUntil: null,
        categoryId: Number.isInteger(categoryId) ? categoryId : null,
        budgetId: Number.isInteger(budgetId) ? budgetId : null,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
        syncState: SYNC_PENDING,
      });
      await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, nextEntry);
      const inserted = await db.expense_entries.where("remoteKey").equals(remoteKey).first();
      return { id: requireLocalId(inserted, "支出"), created: true };
    }

    const updated = await withExpenseAssociationKeys({
      ...existing,
      name,
      payer,
      expenseKind,
      amountTwd,
      occurredAt,
      entryType,
      recurrenceType:
        entryType === EXPENSE_ENTRY_TYPE.RECURRING ? recurrenceType : null,
      monthlyDay:
        entryType === EXPENSE_ENTRY_TYPE.RECURRING &&
        recurrenceType === RECURRENCE_TYPE.MONTHLY
          ? monthlyDay
          : null,
      yearlyMonth:
        entryType === EXPENSE_ENTRY_TYPE.RECURRING &&
        recurrenceType === RECURRENCE_TYPE.YEARLY
          ? yearlyMonth
          : null,
      yearlyDay:
        entryType === EXPENSE_ENTRY_TYPE.RECURRING &&
        recurrenceType === RECURRENCE_TYPE.YEARLY
          ? yearlyDay
          : null,
      categoryId: Number.isInteger(categoryId) ? categoryId : null,
      budgetId: Number.isInteger(budgetId) ? budgetId : null,
      updatedAt: nowIso,
      syncState: SYNC_PENDING,
    });
    await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, updated);
    return { id: parsedId, created: false };
  }

  const remoteKey = makeRemoteKey("expense");
  const nextEntry = await withExpenseAssociationKeys({
    remoteKey,
    name,
    payer,
    expenseKind,
    amountTwd,
    occurredAt,
    entryType,
    recurrenceType:
      entryType === EXPENSE_ENTRY_TYPE.RECURRING ? recurrenceType : null,
    monthlyDay:
      entryType === EXPENSE_ENTRY_TYPE.RECURRING &&
      recurrenceType === RECURRENCE_TYPE.MONTHLY
        ? monthlyDay
        : null,
    yearlyMonth:
      entryType === EXPENSE_ENTRY_TYPE.RECURRING &&
      recurrenceType === RECURRENCE_TYPE.YEARLY
        ? yearlyMonth
        : null,
    yearlyDay:
      entryType === EXPENSE_ENTRY_TYPE.RECURRING &&
      recurrenceType === RECURRENCE_TYPE.YEARLY
        ? yearlyDay
        : null,
    recurrenceUntil: null,
    categoryId: Number.isInteger(categoryId) ? categoryId : null,
    budgetId: Number.isInteger(budgetId) ? budgetId : null,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    syncState: SYNC_PENDING,
  });
  await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, nextEntry);
  const inserted = await db.expense_entries.where("remoteKey").equals(remoteKey).first();
  return { id: requireLocalId(inserted, "支出"), created: true };
};

export const removeExpenseEntry = async ({ id }) => {
  ensureCloudWritable();
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Expense not found");
  }
  const existing = await db.expense_entries.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Expense not found");
  }
  const nowIso = getNowIso();
  const deleted = await withExpenseAssociationKeys({
    ...existing,
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  });
  await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, deleted);
};

export const stopRecurringExpense = async ({ id, keepToday }) => {
  ensureCloudWritable();
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Expense not found");
  }

  const existing = await db.expense_entries.get(parsedId);
  if (!existing || isDeleted(existing)) {
    throw new Error("Expense not found");
  }
  if (existing.entryType !== EXPENSE_ENTRY_TYPE.RECURRING) {
    throw new Error("Expense is not recurring");
  }

  const nowIso = getNowIso();
  const today = dayjs(getNowDate());
  const cutoffDate = keepToday ? today : today.subtract(1, "day");
  const recurrenceUntil = cutoffDate.format("YYYY-MM-DD");

  const updated = await withExpenseAssociationKeys({
    ...existing,
    recurrenceUntil,
    updatedAt: nowIso,
    syncState: SYNC_PENDING,
  });
  await mirrorToCloud(CLOUD_COLLECTION.EXPENSE_ENTRIES, updated);
};

export const getExpenseMonthOptions = async () => {
  const entries = (await db.expense_entries.toArray()).filter(
    (item) => !isDeleted(item),
  );
  const nowMonth = dayjs().format("YYYY-MM");
  let firstMonth = null;
  let lastMonth = null;

  for (const entry of entries) {
    const occurred = normalizeDateOnly(entry.occurredAt);
    if (!occurred) continue;
    const monthValue = occurred.slice(0, 7);
    if (!firstMonth || monthValue < firstMonth) {
      firstMonth = monthValue;
    }
    if (!lastMonth || monthValue > lastMonth) {
      lastMonth = monthValue;
    }

    if (
      entry.entryType === EXPENSE_ENTRY_TYPE.RECURRING &&
      entry.recurrenceUntil
    ) {
      const until = normalizeDateOnly(entry.recurrenceUntil);
      if (until) {
        const untilMonth = until.slice(0, 7);
        if (!lastMonth || untilMonth > lastMonth) {
          lastMonth = untilMonth;
        }
      }
    }
  }

  if (!firstMonth) {
    return [nowMonth];
  }

  const options = [];
  let cursor = dayjs(`${firstMonth}-01`);
  const endMonth = lastMonth && lastMonth > nowMonth ? lastMonth : nowMonth;
  const end = dayjs(`${endMonth}-01`);

  while (!cursor.isAfter(end, "month")) {
    options.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }

  return options;
};

export const getExpenseDashboardView = async (input = {}) => {
  const monthOptions = await getExpenseMonthOptions();
  const currentMonth = dayjs().format("YYYY-MM");
  const activeMonth = monthOptions.includes(input.month)
    ? input.month
    : monthOptions.includes(currentMonth)
      ? currentMonth
      : monthOptions[monthOptions.length - 1];
  const entries = (await db.expense_entries.toArray()).filter(
    (item) => !isDeleted(item),
  );
  const categories = (await db.expense_categories.toArray()).filter(
    (item) => !isDeleted(item),
  );
  const budgets = (await db.budgets.toArray()).filter(
    (item) => !isDeleted(item),
  );
  const holderOptions = await ensureHolderOptions();

  const expenseRows = expandRecurringOccurrencesForMonth(
    entries,
    activeMonth,
  ).map((item) => ({
    id: item.id,
    name: item.name,
    payer: item.payer ?? null,
    expenseKind: item.expenseKind ?? null,
    amountTwd: Number(item.amountTwd) || 0,
    occurredAt: item.occurrenceDate,
    originalOccurredAt: item.occurredAt,
    entryType: item.entryType,
    recurrenceType: item.recurrenceType ?? null,
    monthlyDay: item.monthlyDay ?? null,
    yearlyMonth: item.yearlyMonth ?? null,
    yearlyDay: item.yearlyDay ?? null,
    categoryId: item.categoryId ?? null,
    budgetId: item.budgetId ?? null,
    isRecurringOccurrence: Boolean(item.isRecurringOccurrence),
    updatedAt: item.updatedAt,
  }));

  const categoryMap = new Map(categories.map((item) => [item.id, item.name]));
  const budgetMap = new Map(budgets.map((item) => [item.id, item.name]));
  const decoratedExpenseRows = expenseRows.map((row) => ({
    ...row,
    payerName:
      normalizeExpensePayer(row.payer, holderOptions) ||
      (row.payer === "共同" ? "共同帳戶" : row.payer) ||
      "未指定",
    expenseKindName: row.expenseKind ? row.expenseKind : "未指定",
    categoryName: row.categoryId
      ? categoryMap.get(row.categoryId) || "未指定"
      : "未指定",
    budgetName: row.budgetId
      ? budgetMap.get(row.budgetId) || "未指定"
      : "未指定",
  }));
  const monthlyExpenseTotalTwd = decoratedExpenseRows.reduce(
    (sum, row) => sum + (Number(row.amountTwd) || 0),
    0,
  );
  const cumulativeExpenseTotalTwd = computeCumulativeExpenseTotal(
    entries,
    getNowDate(),
  );
  const firstExpenseDate =
    entries
      .map((entry) => normalizeDateOnly(entry.occurredAt))
      .filter(Boolean)
      .sort()[0] || null;
  const incomeSettings = await getIncomeSettings();
  const monthOverridesMap = new Map(
    (incomeSettings.monthOverrides || []).map((item) => [
      item.month,
      Number(item.incomeTwd) || 0,
    ]),
  );
  const incomeForActiveMonthTwd = resolveIncomeForMonth({
    month: activeMonth,
    defaultMonthlyIncomeTwd: incomeSettings.defaultMonthlyIncomeTwd,
    monthOverridesMap,
  });
  const currentYear = dayjs().year();
  const incomeForCurrentYearTwd = Array.from({ length: 12 }).reduce(
    (sum, _, index) => {
      const month = dayjs(`${currentYear}-01-01`)
        .month(index)
        .format("YYYY-MM");
      const monthlyIncome = resolveIncomeForMonth({
        month,
        defaultMonthlyIncomeTwd: incomeSettings.defaultMonthlyIncomeTwd,
        monthOverridesMap,
      });
      return sum + (typeof monthlyIncome === "number" ? monthlyIncome : 0);
    },
    0,
  );
  const monthHasIncome =
    typeof incomeForActiveMonthTwd === "number" && incomeForActiveMonthTwd > 0;
  const yearHasIncome = incomeForCurrentYearTwd > 0;
  const monthBreakdown = computeExpenseBreakdown(expenseRows);

  const today = getNowDate();
  const todayObj = toDayjsDateOnly(today);
  const budgetRefDate = dayjs(`${activeMonth}-01`)
    .endOf("month")
    .format("YYYY-MM-DD");
  const carryCutoffDate = today;
  const budgetRows = budgets.map((budget) => {
    const normalizedMode = normalizeBudgetMode(budget.budgetMode);
    const stats =
      normalizedMode === BUDGET_MODE.SPECIAL
        ? buildSpecialBudgetStats({ budget, entries, today: budgetRefDate })
        : buildResidentBudgetStats({
            budget: {
              ...budget,
              budgetType: normalizeBudgetType(budget.budgetType),
            },
            entries,
            referenceDate: budgetRefDate,
            carryCutoffDate,
            defaultMonthlyIncomeTwd: incomeSettings.defaultMonthlyIncomeTwd,
            monthOverridesMap,
          });
    return {
      id: budget.id,
      name: budget.name,
      budgetMode: normalizedMode,
      budgetType:
        normalizedMode === BUDGET_MODE.RESIDENT
          ? normalizeBudgetType(budget.budgetType)
          : null,
      startDate: budget.startDate ?? null,
      residentPercent:
        Number.isFinite(Number(budget.residentPercent)) &&
        Number(budget.residentPercent) > 0
          ? Number(budget.residentPercent)
          : null,
      specialAmountTwd: Number(budget.specialAmountTwd) || null,
      specialStartDate: normalizeDateOnly(budget.specialStartDate),
      specialEndDate: normalizeDateOnly(budget.specialEndDate),
      cycleStart: stats.cycleStart,
      cycleEnd: stats.cycleEnd,
      amountTwd: Number(budget.amountTwd) || 0,
      allocatedTwd: stats.allocatedTwd,
      carryInTwd: stats.carryInTwd,
      hasCarryInApplied: stats.hasCarryInApplied ?? false,
      availableTwd: stats.availableTwd,
      spentTwd: stats.spentTwd,
      remainingTwd: stats.remainingTwd,
      progressPct: stats.progressPct,
      isConfigured: stats.isConfigured,
      isActive: stats.isActive,
      updatedAt: budget.updatedAt,
    };
  });

  const selectableBudgets = budgetRows.filter((budget) => budget.isConfigured);

  const recurringExpenseRows = entries
    .filter((entry) => {
      if (entry.entryType !== EXPENSE_ENTRY_TYPE.RECURRING) return false;
      const untilDate = normalizeDateOnly(entry.recurrenceUntil);
      if (untilDate && untilDate < today) return false;
      return true;
    })
    .map((entry) => {
      const candidate = todayObj.isValid()
        ? resolveRecurringOccurrenceDate(entry, todayObj.clone().startOf("month"))
        : null;
      const hasOccurrenceToday = Boolean(
        candidate &&
          candidate.isSame(todayObj, "day") &&
          entryIsActiveOnDate(entry, candidate),
      );

      return {
        id: entry.id,
        name: entry.name,
        payer: entry.payer ?? null,
        expenseKind: entry.expenseKind ?? null,
        amountTwd: Number(entry.amountTwd) || 0,
        entryType: entry.entryType ?? EXPENSE_ENTRY_TYPE.RECURRING,
        recurrenceType: entry.recurrenceType ?? null,
        monthlyDay: entry.monthlyDay ?? null,
        yearlyMonth: entry.yearlyMonth ?? null,
        yearlyDay: entry.yearlyDay ?? null,
        recurrenceUntil: entry.recurrenceUntil ?? null,
        occurredAt: entry.occurredAt ?? null,
        categoryId: entry.categoryId ?? null,
        budgetId: entry.budgetId ?? null,
        hasOccurrenceToday,
        updatedAt: entry.updatedAt ?? null,
        createdAt: entry.createdAt ?? null,
      };
    })
    .sort((a, b) => {
      const updatedCompare = (b.updatedAt || "").localeCompare(
        a.updatedAt || "",
      );
      if (updatedCompare !== 0) return updatedCompare;
      const createdCompare = (b.createdAt || "").localeCompare(
        a.createdAt || "",
      );
      if (createdCompare !== 0) return createdCompare;
      return Number(b.id || 0) - Number(a.id || 0);
    });

  const allHistoryOccurrences = expandExpenseOccurrencesUntilDate(
    entries,
    today,
  );
  const monthOccurrences = getOccurrencesForMonth(entries, activeMonth);
  const cumulativeBreakdown = computeExpenseBreakdown(allHistoryOccurrences);
  const expenseIncomeProgress = {
    month: {
      numerator: monthlyExpenseTotalTwd,
      denominator: monthHasIncome ? incomeForActiveMonthTwd : null,
      ratio: monthHasIncome
        ? monthlyExpenseTotalTwd / incomeForActiveMonthTwd
        : null,
      hasIncome: monthHasIncome,
      recurringNumerator: monthBreakdown.recurringTotal,
      oneTimeNumerator: monthBreakdown.oneTimeTotal,
      recurringRatio: monthHasIncome
        ? monthBreakdown.recurringTotal / incomeForActiveMonthTwd
        : null,
      oneTimeRatio: monthHasIncome
        ? monthBreakdown.oneTimeTotal / incomeForActiveMonthTwd
        : null,
    },
    cumulative: {
      numerator: cumulativeExpenseTotalTwd,
      denominator: yearHasIncome ? incomeForCurrentYearTwd : null,
      ratio: yearHasIncome
        ? cumulativeExpenseTotalTwd / incomeForCurrentYearTwd
        : null,
      hasIncome: yearHasIncome,
      recurringNumerator: cumulativeBreakdown.recurringTotal,
      oneTimeNumerator: cumulativeBreakdown.oneTimeTotal,
      recurringRatio: yearHasIncome
        ? cumulativeBreakdown.recurringTotal / incomeForCurrentYearTwd
        : null,
      oneTimeRatio: yearHasIncome
        ? cumulativeBreakdown.oneTimeTotal / incomeForCurrentYearTwd
        : null,
    },
  };
  const expenseAnalyticsAllHistory = buildExpenseAnalytics({
    occurrences: allHistoryOccurrences,
    categoryMap,
    holderOptions,
    trendMode: "all",
    today,
  });
  const expenseAnalyticsByMonth = buildExpenseAnalytics({
    occurrences: monthOccurrences,
    categoryMap,
    holderOptions,
    trendMode: "month",
    month: activeMonth,
    today,
  });

  return {
    monthOptions,
    activeMonth,
    monthlyExpenseTotalTwd,
    cumulativeExpenseTotalTwd,
    firstExpenseDate,
    incomeForActiveMonthTwd: monthHasIncome ? incomeForActiveMonthTwd : null,
    incomeForCurrentYearTwd: yearHasIncome ? incomeForCurrentYearTwd : null,
    expenseIncomeProgress,
    incomeSettings,
    expenseRows: decoratedExpenseRows,
    categoryRows: categories
      .map((item) => ({
        id: item.id,
        name: item.name,
        updatedAt: item.updatedAt,
      }))
      .sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""))
      .reverse(),
    budgetRows: budgetRows
      .sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""))
      .reverse(),
    selectableBudgets: selectableBudgets.map((item) => ({
      id: item.id,
      name: item.name,
    })),
    recurringExpenseRows,
    expenseAnalytics: expenseAnalyticsAllHistory,
    expenseAnalyticsAllHistory,
    expenseAnalyticsByMonth,
  };
};
