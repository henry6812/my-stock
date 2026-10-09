import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { Calendar } from "iconoir-react";
import dayjs from "dayjs";
import {
  evaluateExpression,
  hasOperator,
  pressKey,
} from "../utils/amountExpression";
import { filterNameSuggestions } from "../utils/expenseSuggestions";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

// Mobile-only "add one expense" sheet: custom keypad, category grid and the
// user's 常用支出 chips so a typical entry never opens the system keyboard.
// Owns its own state; the parent remounts it (via `key`) on every open.

const NAME_MATCH_LIMIT = 6;
const FLASH_MS = 600;
const DAY_CHIPS = ["今天", "昨天", "前天"];
const KEYPAD_ROWS = [
  [{ key: "7" }, { key: "8" }, { key: "9" }, { key: "backspace", label: "⌫", aria: "刪除" }],
  [{ key: "4" }, { key: "5" }, { key: "6" }, { key: "+", label: "+", aria: "加" }],
  [{ key: "1" }, { key: "2" }, { key: "3" }, { key: "-", label: "−", aria: "減" }],
  [{ key: "clear", label: "C", aria: "清除" }, { key: "0" }, { key: "00" }],
];

// Keeps the name input focused when a chip under it is pressed, so the chip
// list doesn't unmount (on blur) before the click lands.
const keepFocus = (event) => event.preventDefault();

function QuickExpenseSheet({
  open,
  onClose,
  templates = [],
  nameSuggestions = [],
  // Budgets that can currently be picked ({ id, name }).
  budgets = [],
  quickCategories = [],
  allCategories = [],
  // Who paid ({ label, value }); the whole family shares one login, so the
  // remembered default is shown and can be changed here.
  payerOptions = [],
  defaults = {},
  onSubmit,
  onOpenFullForm,
  loading = false,
  disabled = false,
}) {
  const defaultExtras = {
    payer: defaults.payer ?? null,
    expenseKind: defaults.expenseKind ?? null,
    budgetId: null,
  };
  useBodyScrollLock(open);
  const [today] = useState(() => dayjs().startOf("day"));
  const [expr, setExpr] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [name, setName] = useState("");
  // Set while the name was filled from a template / autocomplete pick (not
  // typed), so switching category can clear it.
  const [isNameAutoFilled, setIsNameAutoFilled] = useState(false);
  // The category that pick brought along (null when it had none): switching
  // away from it means "a different expense"; adding one to a category-less
  // pick doesn't.
  const [pickedCategoryId, setPickedCategoryId] = useState(null);
  // The keypad text a fixed-amount template put there, so the next pick can
  // tell it apart from an amount the user typed.
  const [pickedAmountExpr, setPickedAmountExpr] = useState(null);
  const [pickedTemplateId, setPickedTemplateId] = useState(null);
  const [extras, setExtras] = useState(defaultExtras);
  // Set once the user picks a budget themselves, so clearing a template's
  // fields doesn't drop it.
  const [budgetTouched, setBudgetTouched] = useState(false);
  // Same for a hand-picked payer: a template without a payer keeps it.
  const [payerTouched, setPayerTouched] = useState(false);
  const [occurredAt, setOccurredAt] = useState(today);
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isPickingCategory, setIsPickingCategory] = useState(false);
  const [flashTarget, setFlashTarget] = useState(null);
  const submittingRef = useRef(false);
  const nameInputRef = useRef(null);

  // The timer lives in an effect so it's cleared on unmount.
  useEffect(() => {
    if (!flashTarget) return undefined;
    const timer = window.setTimeout(() => setFlashTarget(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashTarget]);

  const categoryNames = useMemo(
    () => new Map(allCategories.map((item) => [item.id, item.name])),
    [allCategories],
  );
  const categoryName = categoryId ? (categoryNames.get(categoryId) ?? "") : "";
  const amount = evaluateExpression(expr);
  const trimmedName = name.trim();
  const isNegativeOrZero = amount !== null && amount <= 0;
  const isBusy = loading || disabled;
  const canSave = amount > 0 && Boolean(categoryId || trimmedName) && !isBusy;
  const nameMatches =
    isNameFocused && trimmedName
      ? filterNameSuggestions(nameSuggestions, trimmedName, {
          limit: NAME_MATCH_LIMIT,
        }).filter((item) => item.name !== trimmedName)
      : [];
  const dayChips = DAY_CHIPS.map((label, daysAgo) => ({
    label,
    day: today.subtract(daysAgo, "day"),
  }));
  const isCustomDate = !dayChips.some(({ day }) => occurredAt.isSame(day, "day"));

  // Shared by template chips and name-autocomplete picks. Only templates
  // carry a fixed amount; a history suggestion's last amount isn't one. A
  // pick without an amount keeps what the user typed, but drops an amount
  // the previous template filled in.
  const applyPick = (item, { amountTwd = null, templateId = null } = {}) => {
    setName(item.name);
    setIsNameAutoFilled(true);
    setPickedTemplateId(templateId);
    setPickedCategoryId(item.categoryId ?? null);
    if (item.categoryId) setCategoryId(item.categoryId);
    // Like the full form: a pick without a (still valid) payer / kind keeps
    // the remembered default instead of clearing it.
    setExtras((current) => ({
      payer: item.payer ?? (payerTouched ? current.payer : defaultExtras.payer),
      expenseKind: item.expenseKind ?? defaultExtras.expenseKind,
      // A template's budget wins; otherwise a hand-picked one stays.
      budgetId: item.budgetId ?? (budgetTouched ? current.budgetId : null),
    }));
    if (item.budgetId) setBudgetTouched(false);
    if (amountTwd > 0) {
      const nextExpr = String(amountTwd);
      setExpr(nextExpr);
      setPickedAmountExpr(nextExpr);
      return;
    }
    if (pickedAmountExpr !== null && expr === pickedAmountExpr) setExpr("");
    setPickedAmountExpr(null);
  };

  const applyTemplate = (template) =>
    applyPick(template, {
      amountTwd: template.amountTwd,
      templateId: template.id,
    });

  // A second tap on the picked budget clears it.
  const selectBudget = (id) => {
    setExtras((current) => ({
      ...current,
      budgetId: current.budgetId === id ? null : id,
    }));
    setBudgetTouched(true);
  };

  const selectPayer = (value) => {
    setExtras((current) => ({ ...current, payer: value }));
    setPayerTouched(true);
  };

  const selectCategory = (id) => {
    if (isNameAutoFilled && pickedCategoryId !== null && id !== pickedCategoryId) {
      setName("");
      setIsNameAutoFilled(false);
      setPickedTemplateId(null);
      setExtras((current) => ({
        ...defaultExtras,
        payer: payerTouched ? current.payer : defaultExtras.payer,
        budgetId: budgetTouched ? current.budgetId : null,
      }));
    }
    setCategoryId(id);
    setIsPickingCategory(false);
  };


  const handleSave = async () => {
    if (isBusy || submittingRef.current) return;
    if (!(amount > 0)) {
      setFlashTarget("amount");
      return;
    }
    if (!categoryId && !trimmedName) {
      setFlashTarget("category");
      return;
    }
    submittingRef.current = true;
    try {
      await onSubmit({
        name: trimmedName || categoryName,
        amountTwd: amount,
        occurredAt: occurredAt.format("YYYY-MM-DD"),
        entryType: "ONE_TIME",
        categoryId: categoryId ?? null,
        ...extras,
      });
      // Stay locked after a success: the sheet is closing, and a stray tap on
      // its sliding-away save key must not write a second entry. The next
      // open remounts the sheet with a fresh ref.
    } catch {
      // The parent reports the error and keeps the sheet open; allow a retry.
      submittingRef.current = false;
    }
  };

  const handleOpenFullForm = () => {
    onOpenFullForm?.({
      name: trimmedName,
      amountTwd: amount > 0 ? amount : undefined,
      occurredAt: occurredAt.format("YYYY-MM-DD"),
      categoryId: categoryId ?? undefined,
      payer: extras.payer ?? undefined,
      expenseKind: extras.expenseKind ?? undefined,
      budgetId: extras.budgetId ?? undefined,
    });
  };

  const chipClass = (active) =>
    `quick-expense-chip${active ? " is-active" : ""}`;

  const renderPicker = () => (
    <div className="quick-expense-picker">
      <button
        type="button"
        className="quick-expense-link"
        onClick={() => setIsPickingCategory(false)}
      >
        ← 返回
      </button>
      <div className="quick-expense-picker-list">
        {allCategories.map((item) => (
          <button
            key={item.id}
            type="button"
            className={chipClass(item.id === categoryId)}
            aria-pressed={item.id === categoryId}
            onClick={() => selectCategory(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );

  const section = (title, content) => (
    <div className="quick-expense-section">
      <div className="quick-expense-section-label">{title}</div>
      {content}
    </div>
  );

  const renderSelectors = () => (
    <>
      {templates.length > 0 &&
        section(
          "常用支出",
          <div className="quick-expense-scroll" role="group" aria-label="常用">
            {templates.map((item) => {
              const meta =
                item.amountTwd > 0
                  ? `$${item.amountTwd.toLocaleString("zh-TW")}`
                  : categoryNames.get(item.categoryId);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={chipClass(pickedTemplateId === item.id)}
                  aria-label={`常用 ${item.name}`}
                  aria-pressed={pickedTemplateId === item.id}
                  onClick={() => applyTemplate(item)}
                >
                  {item.name}
                  {meta && <span className="quick-expense-chip-meta">·{meta}</span>}
                </button>
              );
            })}
          </div>,
        )}
      {section(
        "分類",
        <div
          className={`quick-expense-categories${
            flashTarget === "category" ? " is-flashing" : ""
          }`}
          role="group"
          aria-label="分類"
        >
          {quickCategories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={chipClass(item.id === categoryId)}
              aria-pressed={item.id === categoryId}
              onClick={() => selectCategory(item.id)}
            >
              {item.name}
            </button>
          ))}
          <button
            type="button"
            className="quick-expense-chip"
            onClick={() => setIsPickingCategory(true)}
          >
            更多
          </button>
        </div>,
      )}
      {payerOptions.length > 0 &&
        section(
          "支出人",
          <div className="quick-expense-scroll" role="group" aria-label="支出人">
            {payerOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={chipClass(extras.payer === item.value)}
                aria-pressed={extras.payer === item.value}
                onClick={() => selectPayer(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>,
        )}
      {section(
        "日期",
        <div className="quick-expense-dates" role="group" aria-label="日期">
          {dayChips.map(({ label, day }) => (
            <button
              key={label}
              type="button"
              className={chipClass(occurredAt.isSame(day, "day"))}
              aria-pressed={occurredAt.isSame(day, "day")}
              onClick={() => setOccurredAt(day)}
            >
              {label}
            </button>
          ))}
          <label className={`${chipClass(isCustomDate)} quick-expense-date-chip`}>
            <Calendar aria-hidden />
            {isCustomDate ? occurredAt.format("M/D") : "其他"}
            <input
              type="date"
              aria-label="其他日期"
              className="quick-expense-date-input"
              max={today.format("YYYY-MM-DD")}
              value={occurredAt.format("YYYY-MM-DD")}
              onChange={(event) => {
                if (event.target.value) setOccurredAt(dayjs(event.target.value));
              }}
            />
          </label>
        </div>,
      )}
      {budgets.length > 0 &&
        section(
          "預算",
          <div className="quick-expense-scroll" role="group" aria-label="預算">
            {budgets.map((item) => (
              <button
                key={item.id}
                type="button"
                className={chipClass(extras.budgetId === item.id)}
                aria-pressed={extras.budgetId === item.id}
                onClick={() => selectBudget(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>,
        )}
    </>
  );

  const renderKeypad = () => (
    <div className={`quick-expense-keypad${loading ? " is-saving" : ""}`}>
      {KEYPAD_ROWS.flat().map(({ key, label, aria }) => (
        <button
          key={key}
          type="button"
          className="quick-expense-key"
          aria-label={aria ?? key}
          disabled={isBusy}
          onClick={() => setExpr((prev) => pressKey(prev, key))}
        >
          {label ?? key}
        </button>
      ))}
      <button
        type="button"
        className={`quick-expense-key quick-expense-key--save${
          loading ? " is-loading" : ""
        }`}
        aria-label={loading ? "儲存中" : "存"}
        aria-busy={loading || undefined}
        aria-disabled={!canSave}
        onClick={handleSave}
      >
        {loading ? <LoadingOutlined spin /> : "存"}
      </button>
    </div>
  );

  return (
    <Drawer
      placement="bottom"
      title="新增支出"
      open={open}
      onClose={() => {
        if (!loading) onClose?.();
      }}
      extra={
        <button
          type="button"
          className="quick-expense-link"
          disabled={loading}
          onClick={handleOpenFullForm}
        >
          完整表單
        </button>
      }
      size="90vh"
      closable={!loading}
      maskClosable={!loading}
      destroyOnHidden
      className="form-bottom-sheet quick-expense-sheet"
      styles={{ body: { padding: 0 } }}
    >
      {isPickingCategory ? (
        renderPicker()
      ) : (
        <div className="quick-expense">
          <div className="quick-expense-main">
            <div
              className={`quick-expense-amount${
                flashTarget === "amount" ? " is-flashing" : ""
              }`}
            >
              <span className="quick-expense-category-label">
                {categoryName || "未選分類"}
              </span>
              <output
                aria-label="金額"
                aria-invalid={isNegativeOrZero || undefined}
                className={`quick-expense-amount-value${
                  isNegativeOrZero ? " is-invalid" : ""
                }`}
              >
                ${(amount ?? 0).toLocaleString("zh-TW")}
              </output>
              {/* Always rendered so the layout doesn't jump on the first + / −. */}
              <span
                aria-label={hasOperator(expr) ? "算式" : undefined}
                className="quick-expense-expr"
              >
                {hasOperator(expr) ? expr : " "}
              </span>
            </div>
            <input
              ref={nameInputRef}
              className="quick-expense-name"
              aria-label="名稱"
              placeholder={categoryName ? `名稱（預設：${categoryName}）` : "名稱"}
              value={name}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(event) => {
                setName(event.target.value);
                setIsNameAutoFilled(false);
                setPickedTemplateId(null);
              }}
              onFocus={() => setIsNameFocused(true)}
              onBlur={() => setIsNameFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
            {isNameFocused ? (
              nameMatches.length > 0 && (
                <div className="quick-expense-scroll">
                  {nameMatches.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className="quick-expense-chip"
                      onPointerDown={keepFocus}
                      onMouseDown={keepFocus}
                      onClick={() => {
                        applyPick(item);
                        nameInputRef.current?.blur();
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              )
            ) : (
              renderSelectors()
            )}
          </div>
          {!isNameFocused && renderKeypad()}
        </div>
      )}
    </Drawer>
  );
}

export default QuickExpenseSheet;
