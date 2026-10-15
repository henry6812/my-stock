import ResearchSheet from "./ResearchSheet";
import { TW_INDUSTRY_CODES, industryName } from "../../utils/twIndustries";

// Multi-select industries for 低估候選; none selected = all. Applies at once.
function ScreenIndustrySheet({ open, isMobile, industries, onClose, onChange }) {
  const selected = new Set(industries);
  const toggle = (code) =>
    onChange(selected.has(code) ? industries.filter((item) => item !== code) : [...industries, code]);
  return (
    <ResearchSheet open={open} isMobile={isMobile} title="產業" onClose={onClose}>
      <div className="screen-industries" role="group" aria-label="產業">
        <button
          type="button"
          className={`screen-chip${industries.length === 0 ? " is-active" : ""}`}
          aria-pressed={industries.length === 0}
          onClick={() => onChange([])}
        >
          全部產業
        </button>
        {TW_INDUSTRY_CODES.map((code) => (
          <button
            key={code}
            type="button"
            className={`screen-chip${selected.has(code) ? " is-active" : ""}`}
            aria-pressed={selected.has(code)}
            onClick={() => toggle(code)}
          >
            {industryName(code)}
          </button>
        ))}
      </div>
    </ResearchSheet>
  );
}

export default ScreenIndustrySheet;
