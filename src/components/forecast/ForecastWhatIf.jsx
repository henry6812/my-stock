import { Button, Slider } from "antd";
import { formatTwd } from "../../utils/formatters";
import { getWhatIfAmountRange } from "../../utils/forecast";

const formatDelta = (value) => {
  if (!value) return "不變";
  return value > 0 ? `+${formatTwd(value)}` : `−${formatTwd(Math.abs(value))}`;
};

const formatPercent = (ratio) => `${Math.round(ratio * 1000) / 10}%`;

function Knob({ label, value, children }) {
  return (
    <div className="forecast-knob">
      <div className="forecast-knob-head">
        <span>{label}</span>
        <span className="forecast-knob-value">{value}</span>
      </div>
      {children}
    </div>
  );
}

// The four 如果… knobs. Amounts move by ± around the base; the ratio and the
// stock return are set outright. Nothing here is saved.
function ForecastWhatIf({ assumptions, knobs, onChange, onReset, diffText }) {
  const expenseRange = getWhatIfAmountRange(assumptions.monthlyExpenseTwd);
  const incomeRange = getWhatIfAmountRange(assumptions.monthlyIncomeTwd);
  const investRatio = knobs.investRatio ?? assumptions.investRatio;
  const stockReturn = knobs.stockReturn ?? assumptions.stockReturn;
  const set = (patch) => onChange({ ...knobs, ...patch });

  return (
    <div className="forecast-whatif">
      <Knob label="每月支出" value={formatDelta(knobs.expenseDeltaTwd)}>
        <Slider
          min={-expenseRange}
          max={expenseRange}
          step={1000}
          value={knobs.expenseDeltaTwd}
          onChange={(value) => set({ expenseDeltaTwd: value })}
          tooltip={{ open: false }}
          ariaLabelForHandle="每月支出增減"
        />
      </Knob>
      <Knob label="每月收入" value={formatDelta(knobs.incomeDeltaTwd)}>
        <Slider
          min={-incomeRange}
          max={incomeRange}
          step={1000}
          value={knobs.incomeDeltaTwd}
          onChange={(value) => set({ incomeDeltaTwd: value })}
          tooltip={{ open: false }}
          ariaLabelForHandle="每月收入增減"
        />
      </Knob>
      <Knob label="新存款投資比例" value={`${Math.round(investRatio * 100)}%`}>
        <Slider
          min={0}
          max={100}
          step={5}
          value={Math.round(investRatio * 100)}
          onChange={(value) => set({ investRatio: value / 100 })}
          tooltip={{ open: false }}
          ariaLabelForHandle="新存款投資比例"
        />
      </Knob>
      <Knob label="股票年報酬" value={formatPercent(stockReturn)}>
        <Slider
          min={-5}
          max={15}
          step={0.5}
          value={Math.round(stockReturn * 1000) / 10}
          onChange={(value) => set({ stockReturn: value / 100 })}
          tooltip={{ open: false }}
          ariaLabelForHandle="股票年報酬"
        />
      </Knob>
      {diffText && (
        <div className="forecast-whatif-diff">
          <span>{diffText}</span>
          <Button type="link" size="small" onClick={onReset}>
            重設
          </Button>
        </div>
      )}
    </div>
  );
}

export default ForecastWhatIf;
