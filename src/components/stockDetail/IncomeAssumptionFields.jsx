import { useState } from "react";
import { Button, InputNumber } from "antd";
import { NavArrowDown, NavArrowRight } from "iconoir-react";
import { FIELD_META, formatAssumption, formatShares, fromInput, toInput } from "../../utils/incomeAssumptionForm";

const MAIN_FIELDS = ["revenueYoy", "grossMargin", "opexRatio", "nonOperating", "taxRate"];

// Applies to every projected quarter unless a quarter overrides it. Blank =
// the automatic value, shown as the placeholder.
function IncomeAssumptionFields({ income, values, stored, disabled, onChange, onReset }) {
  const [advanced, setAdvanced] = useState(false);

  const field = (name) => {
    const meta = FIELD_META[name];
    const label = `${meta.label}（${meta.unit}）`;
    return (
      <label key={name} className="valuation-assumption-field">
        <span className="valuation-assumption-label">{label}</span>
        <InputNumber
          aria-label={label}
          inputMode={meta.signed ? undefined : "decimal"}
          step={meta.kind === "percent" ? 0.5 : 1}
          value={toInput(name, values[name])}
          placeholder={`自動 ${formatAssumption(name, income.auto[name])}`}
          disabled={disabled}
          onChange={(value) => onChange(name, fromInput(name, value ?? null))}
        />
        {stored[name] !== null && (
          <Button
            type="link"
            size="small"
            className="valuation-assumption-reset"
            disabled={disabled}
            aria-label={`重設${meta.label}`}
            onClick={() => onReset(name)}
          >
            改回預設
          </Button>
        )}
      </label>
    );
  };

  return (
    <section className="valuation-assumptions-group">
      <h4 className="valuation-assumptions-title">全部季度的假設</h4>
      <div className="valuation-assumption-grid">{MAIN_FIELDS.map(field)}</div>
      <button
        type="button"
        className="income-advanced-toggle"
        aria-expanded={advanced}
        onClick={() => setAdvanced((value) => !value)}
      >
        {advanced ? <NavArrowDown aria-hidden /> : <NavArrowRight aria-hidden />}
        進階
      </button>
      {advanced && (
        <div className="income-advanced">
          <div className="valuation-assumption-grid">{field("nciRatio")}</div>
          <div className="income-ledger-row">
            <span className="income-ledger-label">股數</span>
            <span>{formatShares(income.shares)}</span>
          </div>
          <div className="income-ledger-row">
            <span className="income-ledger-label">營收校正</span>
            <span>{`× ${income.calibration.toFixed(2)}`}</span>
          </div>
          <span className="valuation-assumptions-hint">
            股數＝最新累計母公司淨利 ÷ 累計 EPS；營收校正＝近四季季報營收 ÷ 月營收合計（差距 3% 內視為 1）
          </span>
        </div>
      )}
    </section>
  );
}

export default IncomeAssumptionFields;
