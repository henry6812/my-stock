// Expense-tab summary card: label → big number → pill → tower → month bars,
// centred. 月份 mode uses the subtractive SavingsTower; 累計 mode the
// monthly-surplus SavingsGrowthTower. Tapping a part of either tower swaps
// the number and pill for that part; anything else resets.
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
const percent = (part, whole) => `${((part / whole) * 100).toFixed(1)}%`;
const digits = (value) => Math.round(Math.abs(value)).toLocaleString("en-US");
const money = (value) => `${value < 0 ? "−" : ""}$${digits(value)}`;

const describeMonth = ({ activeMonth, monthProgress, upcomingTwd, selected }) => {
  const income = monthProgress?.hasIncome ? Number(monthProgress.denominator) || 0 : 0;
  const recurring = Number(monthProgress?.recurringNumerator) || 0;
  const oneTime = Number(monthProgress?.oneTimeNumerator) || 0;
  const layout = getTowerLayout({
    incomeTwd: income,
    recurringTwd: recurring,
    oneTimeTwd: oneTime,
    upcomingTwd,
  });

  if (layout.hasIncome && selected === "recurring") {
    return { label: "定期", amount: recurring, chip: { text: `佔收入 ${percent(recurring, income)}` } };
  }
  if (layout.hasIncome && selected === "oneTime") {
    return { label: "單筆", amount: oneTime, chip: { text: `佔收入 ${percent(oneTime, income)}` } };
  }
  if (layout.hasIncome && selected === "pending") {
    return { label: "待扣", amount: layout.pendingTwd, chip: { text: "本月尚未扣款・未計入" } };
  }
  if (layout.hasIncome && selected === "saved") {
    const left = layout.savedTwd - layout.pendingTwd;
    return { label: "存下", amount: left, chip: { text: `扣除待扣後・佔收入 ${percent(left, income)}` } };
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
  return { label: monthName(activeMonth), amount: spent, chip };
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
      label: `${monthName(picked.month)}${picked.isCurrent ? "・進行中" : ""}`,
      amount: surplus,
      chip,
    };
  }
  const first = summaries[0]?.month;
  const label = first ? `累計存下・${first.replace("-", "/")} 起` : "累計存下";
  return {
    label,
    amount: growth.totalSavedTwd,
    chip: { text: `期間支出 ${money(growth.totalSpentTwd)}` },
  };
};

export default function ExpenseSummaryCard({
  mode,
  activeMonth,
  monthlySummaries = [],
  monthProgress,
  upcomingTwd = 0,
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
  const text = cumulative
    ? describeCumulative({ summaries: monthlySummaries, growth, selected })
    : describeMonth({ activeMonth, monthProgress, upcomingTwd, selected });

  return (
    <section className="expense-card" aria-label="支出摘要">
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
            upcomingTwd={upcomingTwd}
            hasIncome={Boolean(monthProgress?.hasIncome)}
            playKey={playKey}
            selectedKind={selected}
            onSelectKind={select}
            onSetupIncome={onSetupIncome}
          />
        )}
      </div>
      <ExpenseMonthBars
        summaries={monthlySummaries}
        mode={mode}
        activeMonth={activeMonth}
        highlightMonth={cumulative ? selected : null}
        onSelectMonth={onSelectMonth}
        onToggleCumulative={onToggleMode}
      />
    </section>
  );
}
