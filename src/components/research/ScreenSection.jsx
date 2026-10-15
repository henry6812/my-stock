import { Button, Skeleton, Typography } from "antd";
import { Settings } from "iconoir-react";
import ScreenList from "./ScreenList";
import { SCREEN_BASIS_OPTIONS, formatQuotesDate, industrySummary } from "../../utils/stockScreen";

const { Text } = Typography;

export const SCREEN_PREVIEW_ROWS = 5;

const updatedTextOf = ({ quotesFailed, quotesDate }) => {
  if (quotesFailed) return "價格更新失敗，使用月底價";
  return quotesDate ? `${formatQuotesDate(quotesDate)} 收盤` : null;
};

// 研究 tab's 低估候選: listed stocks below 合理價 for the chosen EPS basis,
// a few rows per group; the rest (and flagged stocks) in the full sheet.
function ScreenSection({
  status,
  result,
  basis,
  onBasisChange,
  industries,
  quotesDate,
  quotesFailed,
  onOpen,
  onOpenAll,
  onOpenSettings,
  onOpenIndustries,
}) {
  const updatedText = updatedTextOf({ quotesFailed, quotesDate });

  let body;
  if (status === "missing" || status === "error") {
    body = <p className="screen-message">{status === "missing" ? "篩選資料尚未產生" : "篩選資料載入失敗"}</p>;
  } else if (!result) {
    body = <Skeleton active paragraph={{ rows: 4 }} />;
  } else if (result.counts.listed === 0 && result.counts.flagged === 0) {
    body = (
      <p className="screen-message">
        {`目前沒有低於合理價的股票${industries.length > 0 ? "（已篩選產業）" : ""}`}
      </p>
    );
  } else {
    const footer = [
      `查看全部 ${result.counts.listed} 檔`,
      ...(result.counts.flagged > 0 ? [`另有 ${result.counts.flagged} 檔被標記`] : []),
    ].join(" · ");
    body = (
      <>
        <ScreenList
          groups={[
            {
              key: "below",
              title: "低於便宜價",
              count: `${result.below.length} 檔`,
              rows: result.below.slice(0, SCREEN_PREVIEW_ROWS),
            },
            {
              key: "fairLow",
              title: "合理偏低",
              count: `${result.fairLow.length} 檔`,
              rows: result.fairLow.slice(0, SCREEN_PREVIEW_ROWS),
            },
          ]}
          onOpen={onOpen}
        />
        <div className="price-refresh-footer">
          <button type="button" className="price-refresh-link" onClick={onOpenAll}>
            {footer}
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="mobile-list-section screen-section" aria-label="低估候選">
      <div className="mobile-list-header">
        <span className="mobile-list-title">低估候選</span>
        <span className="watchlist-header-end">
          {updatedText && <Text className="watchlist-updated">{updatedText}</Text>}
          <Button type="text" size="small" icon={<Settings />} aria-label="篩選門檻" onClick={onOpenSettings} />
        </span>
      </div>
      <div className="screen-controls" role="group" aria-label="EPS 基準與產業">
        {SCREEN_BASIS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`screen-chip${basis === option.value ? " is-active" : ""}`}
            aria-pressed={basis === option.value}
            onClick={() => onBasisChange(option.value)}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          className={`screen-chip${industries.length > 0 ? " is-active" : ""}`}
          onClick={onOpenIndustries}
        >
          {industrySummary(industries)}
        </button>
      </div>
      <p className="screen-note">依歷史本益比估價，便宜可能有原因</p>
      <div className="mobile-list-body">{body}</div>
    </section>
  );
}

export default ScreenSection;
