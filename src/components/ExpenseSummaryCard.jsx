// Expense-tab summary card: label → big number → pill → tower → month bars,
// centred. 月份 mode uses the subtractive SavingsTower; 累計 mode the
// monthly-surplus SavingsGrowthTower. Tapping a part of either tower swaps
// the number and pill for that part; anything else resets. The label always
// reads 「時間・指標」 so it says both which period and which figure.
import { useMemo, useState } from "react";
import SavingsTower from "./SavingsTower";
import SavingsGrowthTower from "./SavingsGrowthTower";
import ExpenseMonthBars from "./ExpenseMonthBars";
import { getTowerLayout } from "../utils/savingsTower";
import {
  getGrowthTowerLayout,
  getMonthSurplus,
} from "../utils/savingsGrowthTower";

const monthName = (month) => {
  const [year, mon] = String(month ?? "").split("-");
  return year && mon ? `${year} 年 ${Number(mon)} 月` : "--";
};
// 「時間・指標」: the period changes when you switch month, the figure when
// you tap a part of the tower.
const heading = (period, figure) => `${period}・${figure}`;
const percent = (part, whole) => `${((part / whole) * 100).toFixed(1)}%`;
const digits = (value) => Math.round(Math.abs(value)).toLocaleString("en-US");
const money = (value) => `${value < 0 ? "−" : ""}$${digits(value)}`;

// For a finished month, how its savings compare with the month before:
// 「比 9 月多存 $2,150」. Skipped for the month in progress (a partial month
// against a full one would always look worse) and when either month has no
// income to save from.
const compareWithPrevious = (summaries, month) => {
  const index = summaries.findIndex((summary) => summary.month === month);
  const current = summaries[index];
  const previous = summaries[index - 1];
  if (!current || !previous || current.isCurrent) return null;
  if (!(Number(current.incomeTwd) > 0) || !(Number(previous.incomeTwd) > 0)) {
    return null;
  }
  const diff = getMonthSurplus(current) - getMonthSurplus(previous);
  const previousMonth = Number(previous.month.split("-")[1]);
  if (Math.round(diff) === 0) return `和 ${previousMonth} 月存得一樣多`;
  return diff > 0
    ? `比 ${previousMonth} 月多存 ${money(diff)}`
    : `比 ${previousMonth} 月少存 ${money(-diff)}`;
};

const describeMonth = ({ activeMonth, monthProgress, selected, comparison }) => {
  const income = monthProgress?.hasIncome ? Number(monthProgress.denominator) || 0 : 0;
  const recurring = Number(monthProgress?.recurringNumerator) || 0;
  const oneTime = Number(monthProgress?.oneTimeNumerator) || 0;
  const layout = getTowerLayout({
    incomeTwd: income,
    recurringTwd: recurring,
    oneTimeTwd: oneTime,
  });

  const period = monthName(activeMonth);
  if (layout.hasIncome && selected === "recurring") {
    return { label: heading(period, "定期支出"), amount: recurring, chip: { text: `佔收入 ${percent(recurring, income)}` } };
  }
  if (layout.hasIncome && selected === "oneTime") {
    return { label: heading(period, "單筆支出"), amount: oneTime, chip: { text: `佔收入 ${percent(oneTime, income)}` } };
  }
  if (layout.hasIncome && selected === "saved") {
    return { label: heading(period, "存下"), amount: layout.savedTwd, chip: { text: `佔收入 ${percent(layout.savedTwd, income)}` } };
  }

  const spent = Number(monthProgress?.numerator) || 0;
  let chip;
  if (!layout.hasIncome) {
    chip = { text: "設定收入", action: true };
  } else if (layout.overspendTwd > 0) {
    chip = { text: `超支 ${money(layout.overspendTwd)}`, over: true };
  } else {
    chip = { text: `存下 ${percent(layout.savedTwd, income)}` };
  }
  if (comparison && !chip.action) {
    chip = { ...chip, text: `${chip.text}・${comparison}` };
  }
  return { label: heading(period, "總支出"), amount: spent, chip };
};

// The tower's parts as buttons under it: a legend for its tints, and the
// keyboard / screen-reader way to pick a part (the SVG itself is hidden from
// assistive tech). Only parts that exist this month are listed.
const towerParts = (monthProgress) => {
  if (!monthProgress?.hasIncome) return [];
  const layout = getTowerLayout({
    incomeTwd: Number(monthProgress.denominator) || 0,
    recurringTwd: Number(monthProgress.recurringNumerator) || 0,
    oneTimeTwd: Number(monthProgress.oneTimeNumerator) || 0,
  });
  if (!layout.hasIncome) return [];
  return [
    { kind: "saved", label: "存下", amount: layout.savedTwd },
    { kind: "recurring", label: "定期", amount: Number(monthProgress.recurringNumerator) || 0 },
    { kind: "oneTime", label: "單筆", amount: Number(monthProgress.oneTimeNumerator) || 0 },
  ].filter((part) => part.amount > 0);
};

const describeCumulative = ({ summaries, growth, selected }) => {
  const picked = selected ? summaries.find((s) => s.month === selected) : null;
  if (picked) {
    const surplus = getMonthSurplus(picked);
    // Only months with a layer can be tapped, so surplus > 0 and income > 0
    // here; the guard keeps a stale selection from dividing by zero.
    const chip =
      surplus > 0 && Number(picked.incomeTwd) > 0
        ? { text: `存下該月收入 ${percent(surplus, picked.incomeTwd)}` }
        : { text: `超支・支出 ${money(picked.expenseTwd)}`, over: true };
    return {
      label: heading(monthName(picked.month), picked.isCurrent ? "存下（進行中）" : "存下"),
      amount: surplus,
      chip,
    };
  }
  const first = summaries[0]?.month;
  const withSince = (figure) =>
    first ? heading(`${first.replace("-", "/")} 起`, figure) : figure;
  // Without any income there is nothing saved to show — "saved" would just
  // be minus the spending — so show the spending and ask for income instead.
  if (!growth.hasIncome) {
    return {
      label: withSince("累計支出"),
      amount: growth.totalSpentTwd,
      chip: { text: "設定收入", action: true },
    };
  }
  return {
    label: withSince("累計存下"),
    amount: growth.totalSavedTwd,
    chip: { text: `期間支出 ${money(growth.totalSpentTwd)}` },
  };
};

export default function ExpenseSummaryCard({
  mode,
  activeMonth,
  monthlySummaries = [],
  monthOptions = [],
  monthProgress,
  playKey,
  onSelectMonth,
  onToggleMode,
  onSetupIncome,
}) {
  const cumulative = mode === "cumulative";
  // A tapped part / month belongs to one view; switching month, mode or
  // replaying the tower drops it without a state reset effect.
  const viewKey = `${mode}|${activeMonth}|${playKey}`;
  const [selection, setSelection] = useState({ viewKey, value: null });
  const selected = selection.viewKey === viewKey ? selection.value : null;
  const select = (value) =>
    setSelection({ viewKey, value: value === selected ? null : value });

  const growth = useMemo(
    () => getGrowthTowerLayout(monthlySummaries),
    [monthlySummaries],
  );
  // Months the app can show but that have no summary yet (scheduled charges
  // in the months ahead) — offered as empty bars so they stay reachable.
  const lastSummaryMonth = monthlySummaries[monthlySummaries.length - 1]?.month;
  const futureMonths = useMemo(
    () =>
      lastSummaryMonth
        ? monthOptions.filter((month) => month > lastSummaryMonth)
        : [],
    [monthOptions, lastSummaryMonth],
  );
  const text = cumulative
    ? describeCumulative({ summaries: monthlySummaries, growth, selected })
    : describeMonth({
        activeMonth,
        monthProgress,
        selected,
        comparison: compareWithPrevious(monthlySummaries, activeMonth),
      });

  return (
    // Tapping anywhere off a tower part goes back to the overview; the parts
    // stop propagation, so their own taps don't reach here.
    <section className="expense-card" aria-label="支出摘要" onClick={() => select(null)}>
      <div key={`${viewKey}|${selected ?? ""}`} className="expense-card-swap">
        <div className="expense-card-label">{text.label}</div>
        <div className="expense-card-num">
          <span className="expense-card-cur">{text.amount < 0 ? "−$" : "$"}</span>
          {digits(text.amount)}
        </div>
        {text.chip.action ? (
          <button type="button" className="expense-card-chip" onClick={onSetupIncome}>
            {text.chip.text}
          </button>
        ) : (
          <span className={`expense-card-chip${text.chip.over ? " expense-card-chip--over" : ""}`}>
            {text.chip.text}
          </span>
        )}

      </div>
      <div className="expense-card-tower">
        {cumulative ? (
          <SavingsGrowthTower
            summaries={monthlySummaries}
            playKey={playKey}
            selectedMonth={selected}
            onSelectMonth={select}
            onSetupIncome={onSetupIncome}
          />
        ) : (
          <SavingsTower
            incomeTwd={monthProgress?.denominator}
            recurringTwd={monthProgress?.recurringNumerator}
            oneTimeTwd={monthProgress?.oneTimeNumerator}
            hasIncome={Boolean(monthProgress?.hasIncome)}
            playKey={playKey}
            selectedKind={selected}
            onSelectKind={select}
            onSetupIncome={onSetupIncome}
          />
        )}
      </div>
      {!cumulative && (
        <TowerLegend
          parts={towerParts(monthProgress)}
          selected={selected}
          onSelect={select}
        />
      )}
      <ExpenseMonthBars
        summaries={monthlySummaries}
        futureMonths={futureMonths}
        mode={mode}
        activeMonth={activeMonth}
        highlightMonth={cumulative ? selected : null}
        onSelectMonth={onSelectMonth}
        onToggleCumulative={onToggleMode}
      />
    </section>
  );
}

function TowerLegend({ parts, selected, onSelect }) {
  if (parts.length === 0) return null;
  return (
    <div className="expense-card-legend" role="group" aria-label="收入去向">
      {parts.map((part) => (
        <button
          key={part.kind}
          type="button"
          className={`expense-card-legend-item${selected === part.kind ? " is-on" : ""}`}
          aria-pressed={selected === part.kind}
          aria-label={`${part.label} ${money(part.amount)}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(part.kind);
          }}
        >
          <span
            className={`expense-card-swatch expense-card-swatch--${part.kind}`}
            aria-hidden="true"
          />
          {part.label}
        </button>
      ))}
    </div>
  );
}
