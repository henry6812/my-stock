import { Button, Typography } from "antd";
import dayjs from "dayjs";
import { GraphUp, Refresh, Trash } from "iconoir-react";
import CollapsibleGroups from "../CollapsibleGroups";
import EmptyState from "../EmptyState";
import MobileSwipeRow from "../MobileSwipeRow";
import { swipeDeleteAction } from "../swipeActionItems";
import { formatPrice } from "../../utils/formatters";
import { formatSignedPercent } from "../../utils/stockDetail";

const { Text } = Typography;

const MARKET_TITLES = { TW: "台股", US: "美股" };

const changeClass = (value) =>
  value >= 0 ? "stock-detail-change--up" : "stock-detail-change--down";

// 研究 tab's first section: watched stocks by market, newest added last.
// A row opens the stock's sheet; mobile swipes to delete, desktop has a
// trailing delete button.
function WatchlistSection({
  view,
  isMobile,
  disabled,
  refreshing,
  refreshFailed,
  onRefresh,
  onOpen,
  onRemove,
}) {
  const groups = view.groups.map((group) => ({
    key: group.market,
    title: MARKET_TITLES[group.market],
    total: `${group.rows.length} 檔`,
    rows: group.rows,
  }));

  const updatedText = refreshFailed
    ? "更新失敗"
    : view.lastUpdatedAt
      ? `更新於 ${dayjs(view.lastUpdatedAt).format("MM/DD HH:mm")}`
      : null;

  const renderRow = (row) => (
    <MobileSwipeRow
      key={row.id}
      disabled={disabled}
      onTap={() => onOpen(row.id)}
      label={`${row.name} ${row.symbol}，查看個股`}
      actions={isMobile ? [swipeDeleteAction(row.name, () => onRemove(row))] : []}
      main={
        <div className="watchlist-row-main">
          <span className="watchlist-row-name">{row.name}</span>
          <span className="watchlist-row-symbol">{row.symbol}</span>
        </div>
      }
      side={
        <div className="watchlist-row-side">
          <div className="watchlist-row-price">
            <div className="watchlist-row-price-main">
              {row.latestPrice === null ? "—" : formatPrice(row.latestPrice, row.currency)}
            </div>
            {Number.isFinite(row.changePct) && (
              <div className={`watchlist-row-change ${changeClass(row.changePct)}`}>
                {formatSignedPercent(row.changePct)}
              </div>
            )}
          </div>
          {!isMobile && (
            <Button
              type="text"
              size="small"
              icon={<Trash />}
              aria-label={`刪除 ${row.name}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(row);
              }}
            />
          )}
        </div>
      }
    />
  );

  return (
    <section className="mobile-list-section watchlist-section" aria-label="觀察清單">
      <div className="mobile-list-header">
        <span className="mobile-list-title">觀察清單</span>
        <span className="watchlist-header-end">
          {updatedText && <Text className="watchlist-updated">{updatedText}</Text>}
          <Button
            type="text"
            size="small"
            icon={<Refresh />}
            aria-label="更新觀察清單報價"
            loading={refreshing}
            disabled={disabled || refreshing || view.rows.length === 0}
            onClick={onRefresh}
          />
        </span>
      </div>
      <div className="mobile-list-body">
        <CollapsibleGroups
          className="watchlist-groups"
          groups={groups}
          defaultExpanded
          storageKey="my-stock:watchlist-groups-open"
          renderRow={renderRow}
          empty={<EmptyState icon={GraphUp} description="還沒有觀察的股票" />}
        />
      </div>
    </section>
  );
}

export default WatchlistSection;
