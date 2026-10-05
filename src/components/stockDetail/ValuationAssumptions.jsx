import { useState } from "react";
import { Alert, Button, InputNumber, Tag, Typography } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import Collapsible from "../Collapsible";

const { Text } = Typography;

const PE_FIELDS = [
  { field: "peCheap", band: "cheap", label: "便宜本益比" },
  { field: "peFair", band: "fair", label: "合理本益比" },
  { field: "peExpensive", band: "expensive", label: "昂貴本益比" },
];

const GROWTH_WARNING_THRESHOLD = 0.5;

const toDraft = (settings) => ({
  peCheap: settings.peCheap,
  peFair: settings.peFair,
  peExpensive: settings.peExpensive,
  growthPercent: Number.isFinite(settings.growthRate) ? Math.round(settings.growthRate * 1000) / 10 : null,
  forwardEps: settings.forwardEps,
});

const draftToSettings = (draft) => ({
  peCheap: draft.peCheap,
  peFair: draft.peFair,
  peExpensive: draft.peExpensive,
  growthRate: Number.isFinite(draft.growthPercent) ? draft.growthPercent / 100 : null,
  forwardEps: draft.forwardEps,
});

// Parent remounts this (key = settings) after a save or a synced change, so
// the draft always starts from the stored values.
function ValuationAssumptions({ model, market, settings, disabled, open, onToggle, onSave }) {
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const nextSettings = draftToSettings(draft);
  const patch = Object.fromEntries(
    Object.entries(nextSettings).filter(([field, value]) => (value ?? null) !== (settings[field] ?? null)),
  );
  const hasChanges = Object.keys(patch).length > 0;

  const runSave = async (values) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const setField = (field) => (value) => setDraft((previous) => ({ ...previous, [field]: value ?? null }));

  const overrideTag = (field, label) =>
    settings[field] !== null && (
      <span className="valuation-assumption-override">
        <Tag color="processing">已覆寫</Tag>
        <Button
          type="link"
          size="small"
          disabled={disabled || saving}
          aria-label={`重設${label}`}
          onClick={() => runSave({ [field]: null })}
        >
          重設
        </Button>
      </span>
    );

  const growthRate = model.forward?.growthRate;
  const showGrowthWarning =
    market === "TW" && Number.isFinite(growthRate) && Math.abs(growthRate) > GROWTH_WARNING_THRESHOLD;

  return (
    <section className="stock-detail-section valuation-assumptions" aria-label="估價假設">
      <button type="button" className="valuation-assumptions-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? <DownOutlined /> : <RightOutlined />}
        <span>估價假設</span>
      </button>
      <Collapsible open={open}>
        <div className="valuation-assumptions-body">
          <div className="valuation-assumptions-formulas">
            <Text type="secondary">近四季 TTM</Text>
            <Text>{model.ttm?.formula ?? "資料不足"}</Text>
            <Text type="secondary">{market === "US" ? "未來四季預估" : "今年預估"}</Text>
            <Text>{model.forward?.formula ?? "無預估資料"}</Text>
          </div>

          <Text type="secondary" className="valuation-assumptions-hint">
            {model.autoBands
              ? `預設：近 ${model.autoBands.sampleSize} 期本益比的 P25 / P50 / P75`
              : "歷史本益比資料不足，請自行填入"}
          </Text>

          {PE_FIELDS.map(({ field, band, label }) => (
            <div key={field} className="valuation-assumption-row">
              <span>{label}</span>
              <InputNumber
                aria-label={label}
                min={0}
                step={0.5}
                value={draft[field]}
                placeholder={model.autoBands?.[band] != null ? String(model.autoBands[band]) : "未設定"}
                disabled={disabled || saving}
                onChange={setField(field)}
              />
              {overrideTag(field, label)}
            </div>
          ))}

          {market === "TW" && (
            <div className="valuation-assumption-row">
              <span>成長率 (%)</span>
              <InputNumber
                aria-label="成長率 (%)"
                step={1}
                value={draft.growthPercent}
                placeholder={
                  Number.isFinite(model.forward?.autoGrowthRate)
                    ? (model.forward.autoGrowthRate * 100).toFixed(1)
                    : "0"
                }
                disabled={disabled || saving}
                onChange={setField("growthPercent")}
              />
              {overrideTag("growthRate", "成長率")}
            </div>
          )}

          <div className="valuation-assumption-row">
            <span>預估 EPS</span>
            <InputNumber
              aria-label="預估 EPS"
              step={0.1}
              value={draft.forwardEps}
              placeholder="自動"
              disabled={disabled || saving}
              onChange={setField("forwardEps")}
            />
            {overrideTag("forwardEps", "預估 EPS")}
          </div>

          {showGrowthWarning && <Alert type="warning" showIcon title="成長率異常，建議覆寫" />}
          {error && <Text type="danger">{error}</Text>}

          {disabled ? (
            <Text type="secondary">登入後可調整估價假設</Text>
          ) : (
            <Button type="primary" disabled={!hasChanges} loading={saving} onClick={() => runSave(patch)}>
              儲存
            </Button>
          )}
        </div>
      </Collapsible>
    </section>
  );
}

export default ValuationAssumptions;
