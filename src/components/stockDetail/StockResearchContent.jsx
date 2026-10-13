import { useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Skeleton, Typography } from "antd";
import { NavArrowRight } from "iconoir-react";
import useStockFundamentals from "../../hooks/useStockFundamentals";
import useValuationSettings from "../../hooks/useValuationSettings";
import { formatDateTime } from "../../utils/formatters";
import { formatYi } from "../../utils/incomeAssumptionForm";
import { latestMonthRevenue, parseQuarterKey } from "../../utils/incomeModel";
import { buildRiverData } from "../../utils/peRiver";
import { buildValuationModel, formatQuarter } from "../../utils/valuation";
import EpsTrendChart from "./EpsTrendChart";
import PeHistoryChart from "./PeHistoryChart";
import PeRiverChart from "./PeRiverChart";
import ValuationAssumptions from "./ValuationAssumptions";
import ValuationCard from "./ValuationCard";

const { Text } = Typography;

const SOURCE_LABELS = { TW: "TWSE / 公開資訊觀測站", US: "Finnhub" };

const describeYoy = (yoy) =>
  Number.isFinite(yoy) ? `YoY ${yoy >= 0 ? "▲" : "▼"}${Math.abs(yoy * 100).toFixed(1)}%` : null;

// The latest monthly revenue under the valuation card: opens 估價假設 at
// the quarter it belongs to (expanded) when that quarter is projected.
function MonthlyRevenueRow({ latest, projectedKeys, onOpen }) {
  const yoy = describeYoy(latest.yoy);
  const projected = projectedKeys.includes(latest.quarterKey);
  const text = [`${Number(latest.month.slice(5))} 月營收 ${formatYi(latest.revenue)}`, yoy].filter(Boolean).join("・");
  return (
    <button
      type="button"
      className="monthly-revenue-entry"
      aria-label={projected ? `${text}，查看 ${formatQuarter(parseQuarterKey(latest.quarterKey))} 推估` : `${text}，查看推估`}
      onClick={() => onOpen(projected ? `quarters:${latest.quarterKey}` : "model")}
    >
      <span className="monthly-revenue-entry-text">
        <span>{`${Number(latest.month.slice(5))} 月營收 ${formatYi(latest.revenue)}`}</span>
        {yoy && (
          <span className={`monthly-revenue-entry-yoy monthly-revenue-entry-yoy--${latest.yoy >= 0 ? "up" : "down"}`}>
            {yoy}
          </span>
        )}
      </span>
      <NavArrowRight aria-hidden />
    </button>
  );
}

// One stock's research: EPS × P/E valuation, latest monthly revenue, the
// P/E river (or history), EPS trend and the data source. Knows nothing of
// holdings — the holding sheet and the watchlist sheet both use it.
function StockResearchContent({
  market,
  symbol,
  name,
  latestPrice,
  currency,
  isStock,
  isMobile,
  disabled,
  basis,
  onBasisChange,
}) {
  const fundamentals = useStockFundamentals(market, symbol);
  const { settings, save } = useValuationSettings(market, symbol);
  // null when closed; otherwise the 估價假設 section to open at.
  const [assumptionsFocus, setAssumptionsFocus] = useState(null);

  const todayIso = dayjs().format("YYYY-MM-DD");
  const data = fundamentals.status === "ready" ? fundamentals.data : null;
  const buildModel = (nextSettings) =>
    buildValuationModel({ fundamentals: data, settings: nextSettings, price: latestPrice, basis, todayIso });
  const model = data ? buildModel(settings) : null;
  const latestRevenue = data?.company ? latestMonthRevenue(data.company.monthlyRevenue) : null;

  if (fundamentals.status === "loading" || fundamentals.status === "idle") {
    return (
      <div className="stock-detail-section">
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  } else if (fundamentals.status === "error") {
    return (
      <div className="stock-detail-section">
        <Alert
          type="error"
          showIcon
          title={fundamentals.error?.message || "載入失敗"}
          action={<Button size="small" onClick={fundamentals.reload}>重試</Button>}
        />
      </div>
    );
  } else if (fundamentals.status === "unsupported") {
    return (
      <div className="stock-detail-section">
        <Text type="secondary">目前僅支援上市股票，查無這檔的 EPS 資料</Text>
      </div>
    );
  } else {
    return (
      <>
        {isStock && (
          <>
            <ValuationCard
              model={model}
              basis={basis}
              onBasisChange={onBasisChange}
              onOpenAssumptions={setAssumptionsFocus}
              market={market}
              currency={currency}
            />
            {latestRevenue && (
              <MonthlyRevenueRow
                latest={latestRevenue}
                projectedKeys={model.income?.status === "ok" ? model.income.quarters.map((quarter) => quarter.key) : []}
                onOpen={setAssumptionsFocus}
              />
            )}
            <ValuationAssumptions
              open={assumptionsFocus !== null}
              focus={assumptionsFocus}
              isMobile={isMobile}
              title={`調整估價假設 · ${name || symbol}`}
              onClose={() => setAssumptionsFocus(null)}
              model={model}
              buildModel={buildModel}
              market={market}
              settings={settings}
              disabled={disabled}
              onSave={save}
            />
          </>
        )}
        {isStock &&
          (data.company ? (
            <PeRiverChart
              river={buildRiverData({
                monthly: data.company.monthly,
                singles: data.singles,
                projected: model.income?.status === "ok" ? model.income.quarters : [],
                bands: model.bands,
                price: latestPrice,
                todayIso,
              })}
            />
          ) : (
            <PeHistoryChart peSeries={data.peSeries} bands={model.bands} />
          ))}
        <EpsTrendChart
          fundamentals={data}
          projected={isStock && model.income?.status === "ok" ? model.income.quarters : []}
        />
        <Text type="secondary" className="stock-detail-source">
          {`資料來源：${SOURCE_LABELS[market]} · 更新於 ${formatDateTime(data.updatedAt)}`}
        </Text>
      </>
    );
  }
}

export default StockResearchContent;
