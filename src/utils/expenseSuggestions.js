// Suggestions for the "add expense" form, derived from all past entries
// (the dashboard's expenseRows only cover the active month).

const isLive = (entry) => entry && !entry.deletedAt;

const entryTimestamp = (entry) =>
  String(entry.occurredAt || "") + "|" + String(entry.updatedAt || "");

// One suggestion per distinct name, carrying the most recent entry's
// settings so picking it can prefill the rest of the form.
export const buildExpenseNameSuggestions = (entries, { limit = 50 } = {}) => {
  const groups = new Map();
  (entries || []).filter(isLive).forEach((entry) => {
    const name = String(entry.name || "").trim();
    if (!name) return;
    const group = groups.get(name);
    if (!group) {
      groups.set(name, { latest: entry, count: 1 });
      return;
    }
    group.count += 1;
    if (entryTimestamp(entry) > entryTimestamp(group.latest)) {
      group.latest = entry;
    }
  });
  return Array.from(groups.entries())
    .map(([name, { latest, count }]) => ({
      name,
      categoryId: latest.categoryId ?? null,
      payer: latest.payer ?? null,
      expenseKind: latest.expenseKind ?? null,
      budgetId: latest.budgetId ?? null,
      amountTwd: Number(latest.amountTwd) || null,
      count,
      lastUsedAt: entryTimestamp(latest),
    }))
    .sort(
      (a, b) =>
        b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt),
    )
    .slice(0, limit);
};

// Category ids ordered by how often (then how recently) they were used;
// unused categories follow in their original order.
export const rankCategoriesByUsage = (entries, categories) => {
  const usage = new Map();
  (entries || []).filter(isLive).forEach((entry) => {
    if (!entry.categoryId) return;
    const stat = usage.get(entry.categoryId) || { count: 0, last: "" };
    stat.count += 1;
    const ts = entryTimestamp(entry);
    if (ts > stat.last) stat.last = ts;
    usage.set(entry.categoryId, stat);
  });
  return (categories || [])
    .filter(isLive)
    .map((category, index) => ({
      id: category.id,
      index,
      stat: usage.get(category.id),
    }))
    .sort((a, b) => {
      if (a.stat && b.stat) {
        return (
          b.stat.count - a.stat.count ||
          b.stat.last.localeCompare(a.stat.last) ||
          a.index - b.index
        );
      }
      if (a.stat) return -1;
      if (b.stat) return 1;
      return a.index - b.index;
    })
    .map((item) => item.id);
};

// Case-insensitive substring match; prefix matches come first, otherwise the
// incoming (usage) order is kept.
export const filterNameSuggestions = (suggestions, query, { limit = 8 } = {}) => {
  const needle = String(query || "").trim().toLowerCase();
  const list = suggestions || [];
  if (!needle) return list.slice(0, limit);
  const prefix = [];
  const contains = [];
  list.forEach((item) => {
    const position = item.name.toLowerCase().indexOf(needle);
    if (position === 0) prefix.push(item);
    else if (position > 0) contains.push(item);
  });
  return [...prefix, ...contains].slice(0, limit);
};

// Chips for the add-expense form: the categories the user marked as quick
// picks (in usage order); with none marked, the most-used few.
export const pickQuickCategories = (
  categories,
  usageOrder,
  { fallbackLimit = 6 } = {},
) => {
  const byId = new Map((categories || []).map((item) => [item.id, item]));
  const ordered = [
    ...(usageOrder || []).map((id) => byId.get(id)).filter(Boolean),
    ...(categories || []).filter((item) => !(usageOrder || []).includes(item.id)),
  ];
  const pinned = ordered.filter((item) => item.isQuickPick);
  return pinned.length > 0 ? pinned : ordered.slice(0, fallbackLimit);
};

// Drops references to categories / payers / budgets that no longer exist, so
// picking a suggestion never fills in a stale id. Old entries used "共同" for
// what is now the "共同帳戶" payer option.
export const sanitizeSuggestions = (
  suggestions,
  { categoryIds, payers, budgetIds },
) =>
  (suggestions || []).map((item) => {
    const payer = item.payer === "共同" ? "共同帳戶" : item.payer;
    return {
      ...item,
      categoryId: categoryIds.has(item.categoryId) ? item.categoryId : null,
      payer: payers.has(payer) ? payer : null,
      budgetId: budgetIds.has(item.budgetId) ? item.budgetId : null,
    };
  });
