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

const compareTemplates = (a, b) =>
  (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) ||
  String(a.createdAt || "").localeCompare(String(b.createdAt || ""));

// New sort orders (1..n, following `orderedIds`) for only the templates whose
// value actually changes, so a drag writes as few docs as possible. Live
// templates the list didn't include (e.g. just added on another device) go
// after it, so no two end up sharing a sort order.
export const planTemplateReorder = (templates, orderedIds) => {
  const live = (templates || []).filter(isLive);
  const byId = new Map(live.map((item) => [item.id, item]));
  const listed = (orderedIds || []).filter((id) => byId.has(id));
  const listedIds = new Set(listed);
  const unlisted = live
    .filter((item) => !listedIds.has(item.id))
    .sort(compareTemplates)
    .map((item) => item.id);
  return [...listed, ...unlisted]
    .map((id, index) => ({ id, sortOrder: index + 1 }))
    .filter(({ id, sortOrder }) => Number(byId.get(id).sortOrder) !== sortOrder);
};

// Display rows: ordered, with category / budget remote keys resolved to the
// local ids the forms use (null when the link no longer exists; such fields
// are listed in `missingLinks`).
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
    .map((item) => {
      const categoryId = categoryIds.get(item.categoryRemoteKey) ?? null;
      const budgetId = budgetIds.get(item.budgetRemoteKey) ?? null;
      return {
        id: item.id,
        name: item.name,
        amountTwd: item.amountTwd ?? null,
        categoryId,
        budgetId,
        payer: item.payer ?? null,
        expenseKind: item.expenseKind ?? null,
        sortOrder: Number(item.sortOrder) || 0,
        missingLinks: [
          item.categoryRemoteKey && categoryId === null ? "categoryId" : null,
          item.budgetRemoteKey && budgetId === null ? "budgetId" : null,
        ].filter(Boolean),
      };
    });
};

const TEMPLATE_FORM_FIELDS = [
  "categoryId",
  "payer",
  "expenseKind",
  "budgetId",
  "amountTwd",
];

const hasTemplateValue = (field, value) =>
  field === "amountTwd"
    ? Number(value) > 0
    : value !== null && value !== undefined && value !== "";

// Applying a template chip to the full expense form. Fields the template sets
// are filled; fields the *previous* chip filled (and the user hasn't touched
// since) go back to what they were before any chip, so switching chips
// doesn't mix two templates. `state` is passed back in on the next chip.
export const applyTemplateToFormValues = (current, template, previous = null) => {
  const updates = { name: template.name };
  const applied = {};
  const before = {};
  TEMPLATE_FORM_FIELDS.forEach((field) => {
    const untouchedSincePrevious =
      Boolean(previous) &&
      field in previous.applied &&
      current[field] === previous.applied[field];
    const original = untouchedSincePrevious
      ? previous.before[field]
      : current[field];
    if (hasTemplateValue(field, template[field])) {
      updates[field] = template[field];
      applied[field] = template[field];
      before[field] = original;
    } else if (untouchedSincePrevious) {
      updates[field] = original;
    }
  });
  return { updates, state: { applied, before } };
};
