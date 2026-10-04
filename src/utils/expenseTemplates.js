// User-managed "常用支出" templates: pure helpers shared by the service layer
// (validation, ordering) and the dashboard view (display rows).

const isLive = (template) => template && !template.deletedAt;

const toNullableText = (value) => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

export const normalizeTemplateInput = (input = {}) => {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Template name is required");
  const amount = Math.round(Number(input.amountTwd));
  return {
    name,
    amountTwd:
      input.amountTwd !== "" && Number.isFinite(amount) && amount > 0
        ? amount
        : null,
    payer: toNullableText(input.payer),
    expenseKind: toNullableText(input.expenseKind),
  };
};

export const getNextTemplateSortOrder = (templates) =>
  (templates || [])
    .filter(isLive)
    .reduce((max, item) => Math.max(max, Number(item.sortOrder) || 0), 0) + 1;

// New sort orders (1..n, following `orderedIds`) for only the templates whose
// value actually changes, so a drag writes as few docs as possible.
export const planTemplateReorder = (templates, orderedIds) => {
  const byId = new Map((templates || []).map((item) => [item.id, item]));
  return (orderedIds || [])
    .filter((id) => byId.has(id))
    .map((id, index) => ({ id, sortOrder: index + 1 }))
    .filter(({ id, sortOrder }) => Number(byId.get(id).sortOrder) !== sortOrder);
};

const compareTemplates = (a, b) =>
  (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) ||
  String(a.createdAt || "").localeCompare(String(b.createdAt || ""));

// Display rows: ordered, with category / budget remote keys resolved to the
// local ids the forms use (null when the link no longer exists).
export const buildTemplateRows = (templates, { categories, budgets }) => {
  const categoryIds = new Map(
    (categories || []).map((item) => [item.remoteKey, item.id]),
  );
  const budgetIds = new Map(
    (budgets || []).map((item) => [item.remoteKey, item.id]),
  );
  return (templates || [])
    .filter(isLive)
    .sort(compareTemplates)
    .map((item) => ({
      id: item.id,
      name: item.name,
      amountTwd: item.amountTwd ?? null,
      categoryId: categoryIds.get(item.categoryRemoteKey) ?? null,
      budgetId: budgetIds.get(item.budgetRemoteKey) ?? null,
      payer: item.payer ?? null,
      expenseKind: item.expenseKind ?? null,
      sortOrder: Number(item.sortOrder) || 0,
    }));
};
