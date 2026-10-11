import { useState } from "react";
import { Button, Drawer, InputNumber, Modal, Typography } from "antd";
import { VALUATION_SETTING_FIELDS, formatEps } from "../../utils/valuation";

const { Text } = Typography;

const PE_FIELDS = [
  { field: "peCheap", band: "cheap", label: "便宜本益比", short: "便宜" },
  { field: "peFair", band: "fair", label: "合理本益比", short: "合理" },
  { field: "peExpensive", band: "expensive", label: "昂貴本益比", short: "昂貴" },
];

const toDraft = (settings) => Object.fromEntries(VALUATION_SETTING_FIELDS.map((field) => [field, settings[field]]));

// Remounted (key = settings) after a save or a synced change, so the draft
// always starts from the stored values.
function AssumptionsForm({ model, market, settings, disabled, onSave, onSaved }) {
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const patch = Object.fromEntries(
    Object.entries(draft).filter(([field, value]) => (value ?? null) !== (settings[field] ?? null)),
  );
  const hasChanges = Object.keys(patch).length > 0;

  const runSave = async (values, { close = false } = {}) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(values, null);
      if (close) onSaved?.();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const setField = (field) => (value) => setDraft((previous) => ({ ...previous, [field]: value ?? null }));

  // An overridden field offers to go back to the automatic value.
  const resetLink = (field, label) =>
    settings[field] !== null && (
      <Button
        type="link"
        size="small"
        className="valuation-assumption-reset"
        disabled={disabled || saving}
        aria-label={`重設${label}`}
        onClick={() => runSave({ [field]: null })}
      >
        改回預設
      </Button>
    );

  const field = ({ key, settingKey = key, label, short, input }) => (
    <label key={key} className="valuation-assumption-field">
      <span className="valuation-assumption-label">{short}</span>
      {input}
      {resetLink(settingKey, label)}
    </label>
  );

  const forwardKey = market === "US" ? "forward" : "thisYear";
  const forward = model.byBasis?.[forwardKey];

  return (
    <>
      <div className="sheet-content valuation-assumptions-body">
        <div className="valuation-assumptions-group">
          <h4 className="valuation-assumptions-title">EPS</h4>
          <div className="valuation-eps">
            <div className="valuation-eps-line">
              <span className="valuation-eps-label">近四季</span>
              <span>{Number.isFinite(model.ttm?.eps) ? formatEps(model.ttm.eps) : "資料不足"}</span>
            </div>
            {model.ttm?.formula && <span className="valuation-eps-formula">{model.ttm.formula}</span>}
          </div>
          <div className="valuation-eps">
            <div className="valuation-eps-line">
              <span className="valuation-eps-label">{market === "US" ? "未來四季預估" : "今年預估"}</span>
              <span>{Number.isFinite(forward?.eps) ? formatEps(forward.eps) : forward?.reason ?? "無預估資料"}</span>
            </div>
            {forward?.formula && <span className="valuation-eps-formula">{forward.formula}</span>}
          </div>
        </div>

        <div className="valuation-assumptions-group">
          <h4 className="valuation-assumptions-title">本益比</h4>
          <div className="valuation-assumption-grid valuation-assumption-grid--3">
            {PE_FIELDS.map(({ field: key, band, label, short }) =>
              field({
                key,
                label,
                short,
                input: (
                  <InputNumber
                    inputMode="decimal"
                    aria-label={label}
                    min={0}
                    step={0.5}
                    value={draft[key]}
                    placeholder={model.autoBands?.[band] != null ? String(model.autoBands[band]) : "未設定"}
                    disabled={disabled || saving}
                    onChange={setField(key)}
                  />
                ),
              }),
            )}
          </div>
          <span className="valuation-assumptions-hint">
            {model.autoBands
              ? `空白時使用過去 ${model.autoBands.sampleSize} 期本益比的低、中、高位置`
              : "歷史本益比資料不足，請自行填入"}
          </span>
        </div>

        <div className="valuation-assumptions-group">
          <h4 className="valuation-assumptions-title">{market === "US" ? "未來四季預估" : "今年預估"}</h4>
          <div className="valuation-assumption-grid">
            {field({
              key: "forwardEps",
              label: "預估 EPS",
              short: "預估 EPS",
              input: (
                <InputNumber
                  aria-label="預估 EPS"
                  step={0.1}
                  value={draft.forwardEps}
                  placeholder="自動"
                  disabled={disabled || saving}
                  onChange={setField("forwardEps")}
                />
              ),
            })}
          </div>
        </div>

        {error && <Text type="danger">{error}</Text>}
      </div>
      <div className="sheet-footer valuation-assumptions-footer">
        {disabled ? (
          <Text type="secondary">登入後可調整估價假設</Text>
        ) : (
          <Button
            type="primary"
            block
            className="sheet-submit-btn"
            disabled={!hasChanges}
            loading={saving}
            onClick={() => runSave(patch, { close: true })}
          >
            儲存
          </Button>
        )}
      </div>
    </>
  );
}

// 估價假設 in its own sheet over the stock detail sheet (a modal on desktop),
// with 儲存 fixed full width at the bottom so it stays reachable with the
// keyboard up. Saving closes it; 改回預設 applies at once and stays.
function ValuationAssumptions({ open, isMobile, title, onClose, settings, ...formProps }) {
  const form = (
    <AssumptionsForm
      key={JSON.stringify(settings)}
      settings={settings}
      onSaved={onClose}
      {...formProps}
    />
  );
  return isMobile ? (
    <Drawer
      placement="bottom"
      title={title}
      open={open}
      onClose={onClose}
      size="90vh"
      destroyOnHidden
      className="form-bottom-sheet sheet-layout valuation-assumptions-sheet"
      styles={{ body: { padding: 0 } }}
    >
      {form}
    </Drawer>
  ) : (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      className="valuation-assumptions-modal"
    >
      {form}
    </Modal>
  );
}

export default ValuationAssumptions;
