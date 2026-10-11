import { Typography } from "antd";
import { compareSnapshots, UNAVAILABLE_REASONS } from "../../utils/incomeModel";
import EstimateHistory from "./EstimateHistory";
import IncomeAssumptionFields from "./IncomeAssumptionFields";
import IncomeModelSummary from "./IncomeModelSummary";
import IncomeQuarterList from "./IncomeQuarterList";

const { Text } = Typography;

// The TW income model inside 估價假設: result, assumptions for every
// quarter, then each quarter on its own.
function IncomeModelSections({
  income,
  draft,
  settings,
  disabled,
  openQuarter,
  onGlobalChange,
  onGlobalReset,
  onQuarterChange,
}) {
  if (income.status !== "ok") {
    return (
      <section className="valuation-assumptions-group">
        <Text type="secondary">{UNAVAILABLE_REASONS[income.reason]}</Text>
      </section>
    );
  }
  return (
    <>
      <IncomeModelSummary income={income} />
      <EstimateHistory comparisons={compareSnapshots(settings.snapshots, income.reported)} />
      <IncomeAssumptionFields
        income={income}
        values={draft.model.global}
        stored={settings.model.global}
        disabled={disabled}
        onChange={onGlobalChange}
        onReset={onGlobalReset}
      />
      <IncomeQuarterList
        income={income}
        overrides={draft.model.quarters}
        disabled={disabled}
        initialOpenKey={openQuarter}
        onChange={onQuarterChange}
      />
    </>
  );
}

export default IncomeModelSections;
