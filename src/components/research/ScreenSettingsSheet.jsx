import { useState } from "react";
import { Button, Input, Switch } from "antd";
import ResearchSheet from "./ResearchSheet";
import {
  DEFAULT_SCREEN_SETTINGS,
  FLAG_DEFINITIONS,
  SCREEN_FLAG_KEYS,
  normalizeScreenSettings,
} from "../../utils/stockScreen";

// Stored ↔ shown: ratios as %, 成交金額 in 萬.
const UNIT_SCALE = { percent: 100, wan: 1 / 10_000, count: 1, times: 1 };
const SUFFIX_BY_KEY = {
  max: "%",
  maxDeviation: "%",
  minTradeValue: "萬",
  minProfitQuarters: "季",
  maxGrowth: "倍",
  minSamples: "個月",
};
const toDisplay = (value, unit) => String(Math.round(value * UNIT_SCALE[unit] * 100) / 100);
// Blank → NaN, which normalizeScreenSettings replaces with the default.
const fromDisplay = (text, unit) => (String(text).trim() === "" ? NaN : Number(text) / UNIT_SCALE[unit]);

const toDraft = (settings) =>
  Object.fromEntries(
    SCREEN_FLAG_KEYS.map((key) => {
      const field = FLAG_DEFINITIONS[key].field;
      const flag = settings.flags[key];
      return [key, { enabled: flag.enabled, text: field ? toDisplay(flag[field.key], field.unit) : null }];
    }),
  );

// 低估候選 thresholds: one row per flag (switch + optional number).
function ScreenSettingsSheet({ open, isMobile, settings, disabled, saving, onClose, onSave }) {
  const [draft, setDraft] = useState(() => toDraft(settings));
  const update = (key, patch) => setDraft((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  const save = () => {
    const flags = Object.fromEntries(
      SCREEN_FLAG_KEYS.map((key) => {
        const field = FLAG_DEFINITIONS[key].field;
        const next = { enabled: draft[key].enabled };
        if (field) next[field.key] = fromDisplay(draft[key].text, field.unit);
        return [key, next];
      }),
    );
    onSave(normalizeScreenSettings({ ...settings, flags }));
  };

  const footer = (
    <div className="screen-settings-footer">
      <Button disabled={disabled || saving} onClick={() => setDraft(toDraft(DEFAULT_SCREEN_SETTINGS))}>
        恢復預設
      </Button>
      <Button type="primary" loading={saving} disabled={disabled} onClick={save}>
        儲存
      </Button>
    </div>
  );

  return (
    <ResearchSheet open={open} isMobile={isMobile} title="篩選門檻" onClose={onClose} footer={footer}>
      {disabled && <p className="screen-message">登入後可修改</p>}
      <div className="screen-settings">
        {SCREEN_FLAG_KEYS.map((key) => {
          const definition = FLAG_DEFINITIONS[key];
          const field = definition.field;
          const inputId = `screen-flag-${key}`;
          return (
            <div key={key} className="screen-settings-row">
              <div className="screen-settings-head">
                <div>
                  <div className="screen-settings-label">{definition.label}</div>
                  <div className="screen-settings-description">{definition.description}</div>
                </div>
                <Switch
                  aria-label={definition.label}
                  checked={draft[key].enabled}
                  disabled={disabled}
                  onChange={(enabled) => update(key, { enabled })}
                />
              </div>
              {field && (
                <label className="screen-settings-field" htmlFor={inputId}>
                  <span>{field.label}</span>
                  <Input
                    id={inputId}
                    aria-label={field.label}
                    inputMode="decimal"
                    value={draft[key].text}
                    suffix={SUFFIX_BY_KEY[field.key]}
                    disabled={disabled || !draft[key].enabled}
                    onChange={(event) => update(key, { text: event.target.value })}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </ResearchSheet>
  );
}

export default ScreenSettingsSheet;
