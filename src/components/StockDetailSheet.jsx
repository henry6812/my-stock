import { useState } from "react";
import { Alert, Button, Drawer, Skeleton, Typography } from "antd";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import useStockFundamentals from "../hooks/useStockFundamentals";
import useValuationSettings from "../hooks/useValuationSettings";
import { formatDateTime, formatPrice } from "../utils/formatters";
import { formatSignedPercent } from "../utils/stockDetail";
import { buildValuationModel } from "../utils/valuation";
import EpsTrendChart from "./stockDetail/EpsTrendChart";
import HoldingPosition from "./stockDetail/HoldingPosition";
import PeHistoryChart from "./stockDetail/PeHistoryChart";
import ValuationAssumptions from "./stockDetail/ValuationAssumptions";
import ValuationCard from "./stockDetail/ValuationCard";

const { Text } = Typography;

const SOURCE_LABELS = { TW: "TWSE / 公開資訊觀測站", US: "Finnhub" };

// One holding (one stock, one holder): price, position and cost, buy /
// sell, EPS × P/E valuation, EPS trend and P/E history, then managing the
// holding. Mobile shows a bottom sheet, desktop a right-hand drawer. The
// parent keys this by holding so basis / fold state reset when another opens.
function StockDetailSheet({ open, holding, isMobile, disabled, onClose, onAction }) {
  const active = Boolean(open && holding);
  useBodyScrollLock(active && isMobile);
  const fundamentals = useStockFundamentals(active ? holding.market : null, active ? holding.symbol : null);
  const { settings, save } = useValuationSettings(active ? holding.market : null, active ? holding.symbol : null);
  const [basis, setBasis] = useState("ttm");
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  if (!holding) return null;

  const isStock = (holding.assetTag || "STOCK") === "STOCK";
  const currency = holding.latestCurrency || (holding.market === "US" ? "USD" : "TWD");
  const data = fundamentals.status === "ready" ? fundamentals.data : null;
  const model = data
    ? buildValuationModel({ fundamentals: data, settings, price: holding.latestPrice, basis })
    : null;

  let body;
  if (fundamentals.status === "loading" || fundamentals.status === "idle") {
    body = <Skeleton active paragraph={{ rows: 6 }} />;
  } else if (fundamentals.status === "error") {
    body = (
      <Alert
        type="error"
        showIcon
        title={fundamentals.error?.message || "載入失敗"}
        action={<Button size="small" onClick={fundamentals.reload}>重試</Button>}
      />
    );
  } else if (fundamentals.status === "unsupported") {
    body = <Text type="secondary">目前僅支援上市股票，查無這檔的 EPS 資料</Text>;
  } else {
    body = (
      <>
        {isStock && (
          <>
            <ValuationCard
              model={model}
              basis={basis}
              onBasisChange={setBasis}
              market={holding.market}
              currency={currency}
            />
            <ValuationAssumptions
              key={JSON.stringify(settings)}
              model={model}
              market={holding.market}
              settings={settings}
              disabled={disabled}
              open={assumptionsOpen}
              onToggle={() => setAssumptionsOpen((value) => !value)}
              onSave={save}
            />
          </>
        )}
        <EpsTrendChart fundamentals={data} />
        {isStock && <PeHistoryChart peSeries={data.peSeries} bands={model.bands} />}
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
      <header className="stock-detail-header">
        <span className="stock-detail-price">{formatPrice(holding.latestPrice, currency)}</span>
        {Number.isFinite(holding.priceChangePct) && (
          <span className={holding.priceChangePct >= 0 ? "stock-detail-change--up" : "stock-detail-change--down"}>
            {formatSignedPercent(holding.priceChangePct / 100)}
          </span>
        )}
      </header>
      <HoldingPosition holding={holding} disabled={disabled} onAction={onAction} />
      {body}
      <div className="stock-detail-manage">
        <Button block disabled={disabled} onClick={() => onAction?.("edit")}>
          編輯分類與持有人
        </Button>
        <Button block disabled={disabled} onClick={() => onAction?.("calibrate")}>
          校正股數與成本
        </Button>
        <Button block danger disabled={disabled} onClick={() => onAction?.("remove")}>
          移除持股
        </Button>
      </div>
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
