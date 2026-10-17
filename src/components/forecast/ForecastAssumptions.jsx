import { useState } from "react";
import { Button, Form, InputNumber, Modal, Table, Typography } from "antd";
import MobileFormSheetLayout from "../MobileFormSheetLayout";
import MobileSwipeRow from "../MobileSwipeRow";
import { formatTwd } from "../../utils/formatters";
import { FORECAST_LIMITS } from "../../utils/forecast";

const { Text } = Typography;

const formatPercent = (ratio) => `${Math.round(ratio * 1000) / 10}%`;

const describeExpenseAuto = (auto) =>
  auto.expenseMonthsUsed >= 12
    ? "過去 12 個月平均"
    : `依 ${auto.expenseMonthsUsed} 個月資料平均`;

const describeHoldingsReturn = (start) => {
  if (start.holdingsReturn === null) return "名目報酬，App 會扣掉通膨";
  const unset = start.unsetCostCount
    ? `（${start.unsetCostCount} 檔未設定成本）`
    : "";
  return `目前持股累計報酬 ${formatPercent(start.holdingsReturn)}${unset}`;
};

// kind: amount (TWD), ratio / rate (stored as a fraction, edited in %).
// hasAuto rows can be overridden and put back; the others always hold a value.
const buildRows = ({ auto, start }) => [
  {
    key: "monthlyIncomeTwd",
    label: "每月收入",
    kind: "amount",
    hasAuto: true,
    autoText: () => "收入設定的每月收入",
    autoValue: auto.monthlyIncomeTwd,
  },
  {
    key: "monthlyExpenseTwd",
    label: "每月支出",
    kind: "amount",
    hasAuto: true,
    autoText: () =>
      auto.monthlyExpenseTwd === null ? "還沒有完整月份的支出" : describeExpenseAuto(auto),
    autoValue: auto.monthlyExpenseTwd,
  },
  {
    key: "investRatio",
    label: "新存款投資比例",
    kind: "ratio",
    hasAuto: true,
    autoText: () => "目前股票占比",
    autoValue: auto.investRatio,
  },
  { key: "stockReturn", label: "股票年報酬", kind: "rate", hint: describeHoldingsReturn(start) },
  { key: "cashReturn", label: "現金年利率", kind: "rate", hint: "名目利率，App 會扣掉通膨" },
  { key: "inflation", label: "通膨率", kind: "rate", hint: "收入與支出假設跟著通膨成長" },
  { key: "withdrawalRate", label: "提領率", kind: "rate", hint: "財務自由門檻 = 年支出 ÷ 提領率" },
];

const formatValue = (row, value) => {
  if (value === null || value === undefined) return "未設定";
  return row.kind === "amount" ? formatTwd(value) : formatPercent(value);
};

const describeSource = (row, assumptions) => {
  if (!row.hasAuto) return row.hint;
  if (assumptions.sources[row.key] === "auto") return row.autoText();
  if (row.autoValue === null || row.autoValue === undefined) return "自訂";
  return `自訂 · ${row.autoText()}為 ${formatValue(row, row.autoValue)}`;
};

// 假設: one ledger row per assumption (value + where it comes from); tap a
// row to edit it in a sheet (mobile) or modal (desktop). onSave(patch)
// resolves true once saved, which closes the editor.
function ForecastAssumptions({ assumptions, auto, start, disabled = false, isMobile, onSave }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const rows = buildRows({ auto, start });

  const open = (row) => {
    const value = assumptions[row.key];
    setDraft(
      value === null || value === undefined
        ? null
        : row.kind === "amount"
          ? value
          : Math.round(value * 1000) / 10,
    );
    setEditing(row);
  };

  const save = async (patch) => {
    setSaving(true);
    try {
      if (await onSave(patch)) setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    if (!editing) return;
    const value =
      draft === null ? null : editing.kind === "amount" ? draft : draft / 100;
    save({ [editing.key]: value });
  };

  const renderRow = (_, row) => {
    const valueText = formatValue(row, assumptions[row.key]);
    return (
      <MobileSwipeRow
        actions={[]}
        onTap={disabled ? undefined : () => open(row)}
        label={`${row.label} ${valueText}，編輯`}
        main={
          <span className="income-row-main">
            <span className="holding-main-text">{row.label}</span>
            <Text type="secondary" className="income-row-meta">
              {describeSource(row, assumptions)}
            </Text>
          </span>
        }
        side={valueText}
      />
    );
  };

  const limit = editing && FORECAST_LIMITS[editing.key];
  const field = editing && (
    <Form layout="vertical" component="div">
      <Form.Item
        label={editing.kind === "amount" ? `${editing.label} (TWD)` : `${editing.label} (%)`}
        extra={editing.hasAuto ? editing.autoText() : editing.hint}
      >
        <InputNumber
          aria-label={editing.label}
          inputMode="decimal"
          style={{ width: "100%" }}
          min={editing.kind === "amount" ? 0 : limit.min * 100}
          max={editing.kind === "amount" ? undefined : limit.max * 100}
          step={editing.kind === "amount" ? 1000 : 0.5}
          precision={editing.kind === "amount" ? 0 : 1}
          value={draft ?? undefined}
          onChange={(value) => setDraft(typeof value === "number" ? value : null)}
        />
      </Form.Item>
      {editing.hasAuto && assumptions.sources[editing.key] === "custom" && (
        <Button block onClick={() => save({ [editing.key]: null })} disabled={saving}>
          改回自動
        </Button>
      )}
    </Form>
  );

  return (
    <div className="forecast-assumptions">
      <Table
        showHeader={false}
        className="mobile-swipe-table"
        rowKey="key"
        dataSource={rows}
        columns={[{ key: "row", render: renderRow }]}
        pagination={false}
      />
      {isMobile ? (
        <MobileFormSheetLayout
          title={editing?.label}
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          loading={saving}
          submitDisabled={disabled}
          onSubmit={submit}
        >
          {field}
        </MobileFormSheetLayout>
      ) : (
        <Modal
          title={editing?.label}
          open={Boolean(editing)}
          onCancel={() => {
            if (!saving) setEditing(null);
          }}
          onOk={submit}
          confirmLoading={saving}
          okText="儲存"
          okButtonProps={{ disabled }}
          destroyOnHidden
        >
          {field}
        </Modal>
      )}
    </div>
  );
}

export default ForecastAssumptions;
