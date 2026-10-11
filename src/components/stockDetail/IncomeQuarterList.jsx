import { useState } from "react";
import { InputNumber } from "antd";
import { NavArrowDown, NavArrowRight } from "iconoir-react";
import {
  FIELD_META,
  formatAssumption,
  formatShares,
  formatYi,
  fromInput,
  toInput,
} from "../../utils/incomeAssumptionForm";
import { formatEps, formatQuarter } from "../../utils/valuation";

const STATEMENT_STEPS = [
  { field: "grossMargin", result: "毛利", value: (q) => q.grossProfit },
  { field: "opexRatio", result: "營業利益", value: (q) => q.operatingIncome },
  { field: "nonOperating", result: "稅前", value: (q) => q.pretaxIncome },
  { field: "taxRate", result: "稅後", value: (q) => q.netIncome },
];

const firstMonth = (quarter) => (quarter - 1) * 3 + 1;

const monthsNote = ({ quarter, reportedMonths }) => {
  if (reportedMonths === 3) return "營收已全部公布";
  if (reportedMonths === 0) return null;
  const from = firstMonth(quarter);
  return reportedMonths === 1 ? `${from} 月已公布` : `${from}–${from + 1} 月已公布`;
};

const revenueNote = ({ quarter, reportedMonths }) => {
  const from = firstMonth(quarter);
  if (reportedMonths === 3) return `（${from}–${from + 2} 月實際）`;
  if (reportedMonths === 0) return "（推估）";
  return `（${from}${reportedMonths === 2 ? `–${from + 1}` : ""} 月實際，其餘推估）`;
};

function QuarterStatement({ quarter, overrides, shares, disabled, onChange }) {
  const input = (field) => {
    const meta = FIELD_META[field];
    return (
      <InputNumber
        aria-label={`${formatQuarter(quarter)} ${meta.label}（${meta.unit}）`}
        inputMode={meta.signed ? undefined : "decimal"}
        step={meta.kind === "percent" ? 0.5 : 1}
        value={toInput(field, overrides[field] ?? null)}
        placeholder={formatAssumption(field, quarter.assumptions[field].value)}
        disabled={disabled}
        onChange={(value) => onChange(field, fromInput(field, value ?? null))}
      />
    );
  };
  return (
    <div className="income-statement">
      <div className="income-statement-row">
        <span>營收</span>
        <span className="income-statement-result">{`${formatYi(quarter.revenue)} ${revenueNote(quarter)}`}</span>
      </div>
      {quarter.reportedMonths < 3 && (
        <div className="income-statement-row income-statement-row--input">
          <span>{`${FIELD_META.revenueYoy.label} %`}</span>
          {input("revenueYoy")}
          <span />
        </div>
      )}
      {STATEMENT_STEPS.map(({ field, result, value }) => (
        <div key={field} className="income-statement-row income-statement-row--input">
          <span>{FIELD_META[field].label}</span>
          {input(field)}
          <span className="income-statement-result">{`→ ${result} ${formatYi(value(quarter))}`}</span>
        </div>
      ))}
      <div className="income-statement-total">
        {`母公司淨利 ${formatYi(quarter.parentNetIncome)} ÷ 股數 ${formatShares(shares)} = EPS ${formatEps(quarter.eps)}`}
      </div>
    </div>
  );
}

const yearTotal = (income, year) => {
  if (year === income.thisYear.year) return { label: "今年", eps: income.thisYear.eps };
  if (year === income.nextYear.year) return { label: "明年", eps: income.nextYear.eps };
  return null;
};

// Grouped by year like the other lists; tapping a quarter shows its small
// income statement and overrides just that quarter. One open at a time.
function IncomeQuarterList({ income, overrides, disabled, onChange }) {
  const [openKey, setOpenKey] = useState(null);
  const years = [...new Set(income.quarters.map((quarter) => quarter.year))];
  return (
    <section className="valuation-assumptions-group" aria-label="逐季推估">
      <h4 className="valuation-assumptions-title">逐季推估</h4>
      {income.calibration !== 1 && (
        <span className="valuation-assumptions-hint">{`營收已依季報口徑校正 ×${income.calibration.toFixed(2)}`}</span>
      )}
      <div className="income-quarter-list">
        {years.map((year) => {
          const total = yearTotal(income, year);
          return (
            <div key={year} className="income-quarter-group">
              <div className="income-quarter-group-heading">
                <span>{year}</span>
                {total && Number.isFinite(total.eps) && <span>{`${total.label} ${formatEps(total.eps)}`}</span>}
              </div>
              {income.quarters
                .filter((quarter) => quarter.year === year)
                .map((quarter) => {
                  const open = openKey === quarter.key;
                  const note = monthsNote(quarter);
                  return (
                    <div key={quarter.key} className="income-quarter">
                      <button
                        type="button"
                        className="income-quarter-row"
                        aria-expanded={open}
                        aria-label={`${formatQuarter(quarter)} 推估 EPS ${formatEps(quarter.eps)}`}
                        onClick={() => setOpenKey(open ? null : quarter.key)}
                      >
                        <span className="income-quarter-name">{`Q${quarter.quarter}`}</span>
                        <span className="income-quarter-meta">
                          {note && <span>{note}</span>}
                          {quarter.overridden && <span className="income-quarter-tag">已覆寫</span>}
                        </span>
                        <span className="income-quarter-eps">{formatEps(quarter.eps)}</span>
                        {open ? <NavArrowDown aria-hidden /> : <NavArrowRight aria-hidden />}
                      </button>
                      {open && (
                        <QuarterStatement
                          quarter={quarter}
                          overrides={overrides[quarter.key] ?? {}}
                          shares={income.shares}
                          disabled={disabled}
                          onChange={(field, value) => onChange(quarter.key, field, value)}
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default IncomeQuarterList;
