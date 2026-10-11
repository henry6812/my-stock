import { Typography } from "antd";
import { UNAVAILABLE_REASONS } from "../../utils/incomeModel";
import IncomeAssumptionFields from "./IncomeAssumptionFields";
import IncomeModelSummary from "./IncomeModelSummary";

const { Text } = Typography;

// The TW income model inside 估價假設: result, assumptions for every
// quarter, then each quarter on its own.
function IncomeModelSections({ income, draft, settings, disabled, onGlobalChange, onGlobalReset }) {
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
      <IncomeAssumptionFields
        income={income}
        values={draft.model.global}
        stored={settings.model.global}
        disabled={disabled}
        onChange={onGlobalChange}
        onReset={onGlobalReset}
      />
    </>
  );
}

export default IncomeModelSections;
