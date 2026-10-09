// Icon grid in the category form (antd Form control: value / onChange).
// value null means "pick from the name": the icon the name maps to shows as
// selected, and choosing an icon stores it. 改回依名稱 clears the choice.
import { Button } from "antd";
import { CATEGORY_ICON_OPTIONS, getCategoryIconKey } from "../utils/categoryIcons";
import { CATEGORY_ICON_COMPONENTS } from "./categoryIconComponents";

export default function CategoryIconPicker({ value = null, onChange, name = "", disabled = false }) {
  const byName = getCategoryIconKey(name);
  const selected = value ?? (byName === "none" ? "other" : byName);
  return (
    <div className="category-icon-picker">
      <div className="category-icon-picker-grid" role="group" aria-label="分類圖示">
        {CATEGORY_ICON_OPTIONS.map(({ key, label }) => {
          const Icon = CATEGORY_ICON_COMPONENTS[key];
          const checked = key === selected;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={checked}
              aria-label={label}
              title={label}
              disabled={disabled}
              className={`category-icon-option${checked ? " category-icon-option--selected" : ""}`}
              onClick={() => onChange?.(key)}
            >
              <Icon />
            </button>
          );
        })}
      </div>
      <div className="category-icon-picker-hint">
        {value ? (
          <Button type="link" size="small" disabled={disabled} onClick={() => onChange?.(null)}>
            改回依名稱自動選擇
          </Button>
        ) : (
          <span>依名稱自動選擇，點圖示可自訂</span>
        )}
      </div>
    </div>
  );
}
