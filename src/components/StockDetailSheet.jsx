import { useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Drawer, Skeleton, Typography } from "antd";
import { NavArrowRight } from "iconoir-react";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import useStockFundamentals from "../hooks/useStockFundamentals";
import useValuationSettings from "../hooks/useValuationSettings";
import { formatDateTime } from "../utils/formatters";
import { formatYi } from "../utils/incomeAssumptionForm";
import { latestMonthRevenue, parseQuarterKey } from "../utils/incomeModel";
import { buildRiverData } from "../utils/peRiver";
import { buildValuationModel, formatQuarter } from "../utils/valuation";
import EpsTrendChart from "./stockDetail/EpsTrendChart";
import HoldingPosition from "./stockDetail/HoldingPosition";
import PeHistoryChart from "./stockDetail/PeHistoryChart";
import PeRiverChart from "./stockDetail/PeRiverChart";
import ValuationAssumptions from "./stockDetail/ValuationAssumptions";
import ValuationCard from "./stockDetail/ValuationCard";

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

// One holding (one stock, one holder): its market value, position and
// cost, buy / sell, EPS × P/E valuation, EPS trend and P/E history, then
// managing the holding. Mobile shows a bottom sheet, desktop a right-hand drawer. The
// parent keys this by holding so basis / fold state reset when another opens.
function StockDetailSheet({ open, holding, isMobile, disabled, onClose, onAction }) {
  const active = Boolean(open && holding);
  useBodyScrollLock(active && isMobile);
  const fundamentals = useStockFundamentals(active ? holding.market : null, active ? holding.symbol : null);
  const { settings, save } = useValuationSettings(active ? holding.market : null, active ? holding.symbol : null);
  const [basis, setBasis] = useState("ttm");
  // null when closed; otherwise the 估價假設 section to open at.
  const [assumptionsFocus, setAssumptionsFocus] = useState(null);

  const todayIso = dayjs().format("YYYY-MM-DD");

  if (!holding) return null;

  const isStock = (holding.assetTag || "STOCK") === "STOCK";
  const currency = holding.latestCurrency || (holding.market === "US" ? "USD" : "TWD");
  const data = fundamentals.status === "ready" ? fundamentals.data : null;
  const buildModel = (nextSettings) =>
    buildValuationModel({ fundamentals: data, settings: nextSettings, price: holding.latestPrice, basis, todayIso });
  const model = data ? buildModel(settings) : null;
  const latestRevenue = data?.company ? latestMonthRevenue(data.company.monthlyRevenue) : null;

  let body;
  if (fundamentals.status === "loading" || fundamentals.status === "idle") {
    body = (
      <div className="stock-detail-section">
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  } else if (fundamentals.status === "error") {
    body = (
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
    body = (
      <div className="stock-detail-section">
        <Text type="secondary">目前僅支援上市股票，查無這檔的 EPS 資料</Text>
      </div>
    );
  } else {
    body = (
      <>
        {isStock && (
          <>
            <ValuationCard
              model={model}
              basis={basis}
              onBasisChange={setBasis}
              onOpenAssumptions={setAssumptionsFocus}
              market={holding.market}
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
              title={`調整估價假設 · ${holding.companyName || holding.symbol}`}
              onClose={() => setAssumptionsFocus(null)}
              model={model}
              buildModel={buildModel}
              market={holding.market}
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
                price: holding.latestPrice,
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
          {`資料來源：${SOURCE_LABELS[holding.market]} · 更新於 ${formatDateTime(data.updatedAt)}`}
        </Text>
      </>
    );
  }

  const title = (
    <div className="stock-detail-title">
      <span>{holding.companyName || holding.symbol}</span>
      <Text type="secondary">{holding.symbol}</Text>
    </div>
  );

  const content = (
    <>
      <HoldingPosition holding={holding} disabled={disabled} onAction={onAction} />
      {body}
      {/* Rarely used, so a quiet list rather than buttons. */}
      <section className="stock-detail-section" aria-label="管理這筆持股">
        <h3 className="stock-detail-heading">管理這筆持股</h3>
        <div className="stock-detail-manage">
          <button
            type="button"
            className="stock-detail-manage-row"
            disabled={disabled}
            onClick={() => onAction?.("edit")}
          >
            <span>編輯分類與持有人</span>
            <NavArrowRight aria-hidden />
          </button>
          <button
            type="button"
            className="stock-detail-manage-row"
            disabled={disabled}
            onClick={() => onAction?.("calibrate")}
          >
            <span>校正股數與成本</span>
            <NavArrowRight aria-hidden />
          </button>
          <button
            type="button"
            className="stock-detail-manage-row stock-detail-manage-row--danger"
            disabled={disabled}
            onClick={() => onAction?.("remove")}
          >
            <span>移除持股</span>
          </button>
        </div>
      </section>
    </>
  );

  return isMobile ? (
    <Drawer
      placement="bottom"
      title={title}
      open={open}
      onClose={onClose}
      size="90vh"
      destroyOnHidden
      className="form-bottom-sheet stock-detail-sheet"
    >
      {content}
    </Drawer>
  ) : (
    <Drawer
      placement="right"
      title={title}
      open={open}
      onClose={onClose}
      size={520}
      destroyOnHidden
      className="stock-detail-sheet"
    >
      {content}
    </Drawer>
  );
}

export default StockDetailSheet;
