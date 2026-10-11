import { useState } from "react";
import { Alert, Button, Drawer, InputNumber, Modal, Typography } from "antd";
import { diffSettings, setGlobalValue, setQuarterValue, snapshotOf } from "../../utils/incomeAssumptionForm";
import { formatEps } from "../../utils/valuation";
import IncomeModelSections from "./IncomeModelSections";

const { Text } = Typography;

const PE_FIELDS = [
  { field: "peCheap", band: "cheap", label: "便宜本益比", short: "便宜" },
  { field: "peFair", band: "fair", label: "合理本益比", short: "合理" },
  { field: "peExpensive", band: "expensive", label: "昂貴本益比", short: "昂貴" },
];

function UsEpsGroup({ model }) {
  const forward = model.byBasis?.forward;
  return (
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
          <span className="valuation-eps-label">未來四季預估</span>
          <span>{Number.isFinite(forward?.eps) ? formatEps(forward.eps) : "無預估資料"}</span>
        </div>
        {forward?.formula && <span className="valuation-eps-formula">{forward.formula}</span>}
      </div>
    </div>
  );
}

// Remounted (key = settings) after a save or a synced change, so the draft
// always starts from the stored values. The TW estimate is rebuilt from the
// draft on every change, so the figures move as you type.
function AssumptionsForm({ model, buildModel, market, settings, disabled, onSave, onSaved }) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const patch = diffSettings(settings, draft);
  const hasChanges = Object.keys(patch).length > 0;
  const live = hasChanges ? buildModel(draft) : model;
  const income = market === "TW" ? live.income : null;
  const next = income?.status === "ok" ? income.nextQuarter : null;
  const needsSnapshot = Boolean(next) && !settings.snapshots[next.key];
  const locked = disabled || saving;

  const runSave = async (values, snapshot, { close = false } = {}) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(values, snapshot);
      if (close) onSaved?.();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const setRoot = (field) => (value) => setDraft((previous) => ({ ...previous, [field]: value ?? null }));

  const rootField = ({ field, label, short, input }) => (
    <label key={field} className="valuation-assumption-field">
      <span className="valuation-assumption-label">{short}</span>
      {input}
      {settings[field] !== null && (
        <Button
          type="link"
          size="small"
          className="valuation-assumption-reset"
          disabled={locked}
          aria-label={`重設${label}`}
          onClick={() => runSave({ [field]: null }, null)}
        >
          改回預設
        </Button>
      )}
    </label>
  );

  return (
    <>
      <div className="sheet-content valuation-assumptions-body">
        {market === "TW" && Number.isFinite(draft.forwardEps) && (
          <Alert type="info" showIcon title="已使用自訂 EPS，模型結果僅供參考" />
        )}
        {market === "TW" ? (
          <IncomeModelSections
            income={income}
            draft={draft}
            settings={settings}
            disabled={locked}
            onGlobalChange={(field, value) => setDraft((previous) => setGlobalValue(previous, field, value))}
            onGlobalReset={(field) => runSave({ model: { global: { [field]: null } } }, null)}
            onQuarterChange={(key, field, value) => setDraft((previous) => setQuarterValue(previous, key, field, value))}
          />
        ) : (
          <UsEpsGroup model={live} />
        )}

        <div className="valuation-assumptions-group">
          <h4 className="valuation-assumptions-title">本益比</h4>
          <div className="valuation-assumption-grid valuation-assumption-grid--3">
            {PE_FIELDS.map(({ field, band, label, short }) =>
              rootField({
                field,
                label,
                short,
                input: (
                  <InputNumber
                    inputMode="decimal"
                    aria-label={label}
                    min={0}
                    step={0.5}
                    value={draft[field]}
                    placeholder={live.autoBands?.[band] != null ? String(live.autoBands[band]) : "未設定"}
                    disabled={locked}
                    onChange={setRoot(field)}
                  />
                ),
              }),
            )}
          </div>
          <span className="valuation-assumptions-hint">
            {live.autoBands
              ? `空白時使用過去 ${live.autoBands.sampleSize} 期本益比的低、中、高位置`
              : "歷史本益比資料不足，請自行填入"}
          </span>
        </div>

        <div className="valuation-assumptions-group">
          <h4 className="valuation-assumptions-title">{market === "US" ? "未來四季預估" : "直接指定 EPS"}</h4>
          <div className="valuation-assumption-grid">
            {rootField({
              field: "forwardEps",
              label: "預估 EPS",
              short: "預估 EPS",
              input: (
                <InputNumber
                  aria-label="預估 EPS"
                  step={0.1}
                  value={draft.forwardEps}
                  placeholder="自動"
                  disabled={locked}
                  onChange={setRoot("forwardEps")}
                />
              ),
            })}
          </div>
          {market === "TW" && (
            <span className="valuation-assumptions-hint">模型不適用時使用；填入後今年與明年估價改用這個數字</span>
          )}
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
            disabled={!hasChanges && !needsSnapshot}
            loading={saving}
            onClick={() => runSave(patch, next ? snapshotOf(next) : null, { close: true })}
          >
            {!hasChanges && needsSnapshot ? "記下這次預估" : "儲存"}
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
    <AssumptionsForm key={JSON.stringify(settings)} settings={settings} onSaved={onClose} {...formProps} />
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
