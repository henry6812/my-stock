import { Download } from "iconoir-react";
import SectionTitle from "./SectionTitle";

// 資料匯出 on a phone: one row per file, in the same hairline frame as the
// other settings lists. A row with nothing to export is disabled.
//
// items: [{ key, label, hint, disabled, onExport }]
function MobileDataExport({ items = [] }) {
  return (
    <section className="mobile-list-section mobile-list-section--export">
      <div className="mobile-list-header">
        <span className="mobile-list-title">
          <SectionTitle icon={Download}>資料匯出</SectionTitle>
        </span>
      </div>
      <div className="account-panel">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className="settings-action-row"
            disabled={item.disabled}
            onClick={item.onExport}
          >
            <span className="device-setting-text">
              <span className="device-setting-label">{item.label}</span>
              <span className="device-setting-hint">{item.hint}</span>
            </span>
            <Download className="settings-action-icon" />
          </button>
        ))}
      </div>
    </section>
  );
}

export default MobileDataExport;
