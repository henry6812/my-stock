// Icon grid in a form (antd Form control: value / onChange). Category icons by
// default; savings goals pass their own options / components / name rule.
// value null means "pick from the name": the icon the name maps to shows as
// selected, and choosing an icon stores it. 改回依名稱 clears the choice.
import { Button } from "antd";
import { CATEGORY_ICON_OPTIONS, getCategoryIconKey } from "../utils/categoryIcons";
import { CATEGORY_ICON_COMPONENTS } from "./categoryIconComponents";

const categoryIconByName = (name) => {
  const key = getCategoryIconKey(name);
  return key === "none" ? "other" : key;
};

export default function CategoryIconPicker({
  value = null,
  onChange,
  name = "",
  disabled = false,
  options = CATEGORY_ICON_OPTIONS,
  components = CATEGORY_ICON_COMPONENTS,
  resolveByName = categoryIconByName,
  groupLabel = "分類圖示",
}) {
  const selected = value ?? resolveByName(name);
  return (
    <div className="category-icon-picker">
      <div className="category-icon-picker-grid" role="group" aria-label={groupLabel}>
        {options.map(({ key, label }) => {
          const Icon = components[key];
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
