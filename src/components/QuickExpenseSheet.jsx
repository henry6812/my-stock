import { useMemo, useRef, useState } from "react";
import { Drawer } from "antd";
import dayjs from "dayjs";
import {
  evaluateExpression,
  hasOperator,
  pressKey,
} from "../utils/amountExpression";
import { filterNameSuggestions } from "../utils/expenseSuggestions";

// Mobile-only "add one expense" sheet: custom keypad, category grid and
// frequent-expense chips so a typical entry never opens the system keyboard.
// Owns its own state; the parent remounts it (via `key`) on every open.

const SUGGESTION_LIMIT = 8;
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
  suggestions = [],
  quickCategories = [],
  allCategories = [],
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
  const [today] = useState(() => dayjs().startOf("day"));
  const [expr, setExpr] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [name, setName] = useState("");
  const [suggestionName, setSuggestionName] = useState(null);
  const [extras, setExtras] = useState(defaultExtras);
  const [occurredAt, setOccurredAt] = useState(today);
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isPickingCategory, setIsPickingCategory] = useState(false);
  const [flashTarget, setFlashTarget] = useState(null);
  const submittingRef = useRef(false);
  const flashTimerRef = useRef(null);
  const nameInputRef = useRef(null);

  const categoryNames = useMemo(
    () => new Map(allCategories.map((item) => [item.id, item.name])),
    [allCategories],
  );
  const categoryName = categoryId ? (categoryNames.get(categoryId) ?? "") : "";
  const amount = evaluateExpression(expr);
  const trimmedName = name.trim();
  const isBusy = loading || disabled;
  const canSave = amount > 0 && Boolean(categoryId || trimmedName) && !isBusy;
  const nameMatches =
    isNameFocused && trimmedName
      ? filterNameSuggestions(suggestions, trimmedName, {
          limit: NAME_MATCH_LIMIT,
        }).filter((item) => item.name !== trimmedName)
      : [];
  const dayChips = DAY_CHIPS.map((label, daysAgo) => ({
    label,
    day: today.subtract(daysAgo, "day"),
  }));
  const isCustomDate = !dayChips.some(({ day }) => occurredAt.isSame(day, "day"));

  const applySuggestion = (item) => {
    setName(item.name);
    setSuggestionName(item.name);
    if (item.categoryId) setCategoryId(item.categoryId);
    setExtras({
      payer: item.payer ?? null,
      expenseKind: item.expenseKind ?? null,
      budgetId: item.budgetId ?? null,
    });
    setExpr("");
  };

  const selectCategory = (id) => {
    if (suggestionName !== null && id !== categoryId) {
      setName("");
      setSuggestionName(null);
      setExtras(defaultExtras);
    }
    setCategoryId(id);
    setIsPickingCategory(false);
  };

  const flash = (target) => {
    window.clearTimeout(flashTimerRef.current);
    setFlashTarget(target);
    flashTimerRef.current = window.setTimeout(() => setFlashTarget(null), FLASH_MS);
  };

  const handleSave = async () => {
    if (isBusy || submittingRef.current) return;
    if (!(amount > 0)) {
      flash("amount");
      return;
    }
    if (!categoryId && !trimmedName) {
      flash("category");
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

  const renderSelectors = () => (
    <>
      {suggestions.length > 0 && (
        <div className="quick-expense-row" role="group" aria-label="常用">
          <span className="quick-expense-row-label">常用</span>
          <div className="quick-expense-scroll">
            {suggestions.slice(0, SUGGESTION_LIMIT).map((item) => {
              const meta = categoryNames.get(item.categoryId);
              return (
                <button
                  key={item.name}
                  type="button"
                  className={chipClass(suggestionName === item.name)}
                  aria-label={`常用 ${item.name}`}
                  aria-pressed={suggestionName === item.name}
                  onClick={() => applySuggestion(item)}
                >
                  {item.name}
                  {meta && <span className="quick-expense-chip-meta">·{meta}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
      </div>
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
          📅 {isCustomDate ? occurredAt.format("M/D") : "其他"}
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
      </div>
    </>
  );

  const renderKeypad = () => (
    <div className="quick-expense-keypad">
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
        className="quick-expense-key quick-expense-key--save"
        aria-label="存"
        aria-disabled={!canSave}
        onClick={handleSave}
      >
        {loading ? "…" : "存"}
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
              <output aria-label="金額" className="quick-expense-amount-value">
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
                setSuggestionName(null);
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
                        applySuggestion(item);
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
