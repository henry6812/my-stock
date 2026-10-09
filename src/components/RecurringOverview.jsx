import { useState } from "react";
import { Button, Empty, Tag, Typography } from "antd";
import HoverTooltip from "./HoverTooltip";
import {
  EditPencil,
  NavArrowDown,
  Plus,
  Prohibition,
} from "iconoir-react";
import dayjs from "dayjs";
import { formatDate, formatTwd } from "../utils/formatters";
import { formatRecurringScheduleText } from "../utils/portfolioView";
import Collapsible from "./Collapsible";
import SwipeActions from "./SwipeActions";

const { Text } = Typography;

// 定期支出總覽: the active recurring rules, soonest charge first (the service
// sorts them), with a monthly-equivalent total. Rows past the first few fold
// away behind a centred 看全部 / 收合 toggle.

const COLLAPSED_COUNT = 4;

// `withPrefix` adds 下次; on mobile the line sits under the amount and the
// date alone reads clearly.
const describeNextCharge = (nextDate, today, { withPrefix = true } = {}) => {
  if (!nextDate) return null;
  const days = dayjs(nextDate).diff(dayjs(today), "day");
  if (days <= 0) return "今天扣款";
  const label = `${withPrefix ? "下次 " : ""}${dayjs(nextDate).format("M/D")}`;
  if (days === 1) return `${label}（明天）`;
  return `${label}（${days} 天後）`;
};

// The row's content, wrapped in SwipeActions on mobile.
function RowShell({ swipeable, disabled, actions, children }) {
  const row = <div className="recurring-overview-row">{children}</div>;
  if (!swipeable) return row;
  return (
    <SwipeActions actions={actions} disabled={disabled}>
      {row}
    </SwipeActions>
  );
}

function RecurringOverview({
  rows = [],
  summary = { count: 0, monthlyEquivalentTwd: 0 },
  categoryNames = new Map(),
  today,
  onEdit,
  onStop,
  onCreate,
  stoppingById = {},
  disabled = false,
  // Mobile: edit / stop move behind a left swipe instead of inline buttons.
  swipeable = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = rows.length - COLLAPSED_COUNT;

  const renderItem = (item) => {
    const isYearly = item.recurrenceType === "YEARLY";
    const meta = [
      categoryNames.get(item.categoryId),
      formatRecurringScheduleText(item),
    ]
      .filter(Boolean)
      .join(" · ");
    const nextCharge = describeNextCharge(item.nextOccurrenceDate, today, {
      withPrefix: !swipeable,
    });
    const nextChargeLine = nextCharge && (
      <Text
        className={`recurring-overview-next${
          nextCharge === "今天扣款" ? " is-today" : ""
        }`}
      >
        {nextCharge}
      </Text>
    );
    return (
      <li key={item.id} className="recurring-overview-item">
        <RowShell
          swipeable={swipeable}
          disabled={disabled || Boolean(stoppingById[item.id])}
          actions={[
            {
              key: "edit",
              label: `編輯 ${item.name}`,
              text: "編輯",
              icon: <EditPencil />,
              onClick: () => onEdit?.(item),
            },
            {
              key: "stop",
              label: `停止 ${item.name}`,
              text: "停止",
              icon: <Prohibition />,
              tone: "warn",
              onClick: () => onStop?.(item),
            },
          ]}
        >
        <div className="recurring-overview-main">
          <div className="recurring-overview-name">
            <span>{item.name}</span>
            {item.startsInFuture && (
              <Tag variant="filled" className="recurring-overview-tag">
                {dayjs(item.occurredAt).format("M/D")} 起
              </Tag>
            )}
            {item.recurrenceUntil && (
              <Tag variant="filled" className="recurring-overview-tag">
                至 {formatDate(item.recurrenceUntil)}
              </Tag>
            )}
          </div>
          <Text type="secondary" className="recurring-overview-meta">
            {meta}
          </Text>
          {!swipeable && nextChargeLine}
        </div>
        <div className="recurring-overview-side">
          <div className="recurring-overview-amount">
            {formatTwd(Number(item.amountTwd) || 0)}
            <span className="recurring-overview-cadence">
              /{isYearly ? "年" : "月"}
            </span>
          </div>
          {/* Mobile: the next charge sits right under the amount. */}
          {swipeable && nextChargeLine}
          {isYearly && (
            <Text type="secondary" className="recurring-overview-meta">
              約 {formatTwd(item.monthlyEquivalentTwd)}/月
            </Text>
          )}
          {!swipeable && (
          <div className="recurring-overview-actions">
            <Button
              type="text"
              size="small"
              icon={<EditPencil />}
              aria-label={`編輯 ${item.name}`}
              disabled={disabled}
              onClick={() => onEdit?.(item)}
            />
            <HoverTooltip title="停止（已發生的紀錄會保留）">
              <Button
                type="text"
                size="small"
                icon={<Prohibition />}
                aria-label={`停止 ${item.name}`}
                loading={Boolean(stoppingById[item.id])}
                disabled={disabled}
                onClick={() => onStop?.(item)}
              />
            </HoverTooltip>
          </div>
          )}
        </div>
        </RowShell>
      </li>
    );
  };

  const createButton = (
    <HoverTooltip title="新增定期支出">
      <Button
        type="text"
        size="small"
        className="title-add-btn"
        icon={<Plus />}
        aria-label="新增定期支出"
        disabled={disabled}
        onClick={onCreate}
      />
    </HoverTooltip>
  );

  return (
    <section className="recurring-overview">
      <div className="recurring-overview-head">
        <Text strong className="recurring-overview-title">
          定期支出
        </Text>
        {rows.length > 0 && createButton}
        {rows.length > 0 && (
          <Text type="secondary" className="recurring-overview-summary">
            共 {summary.count} 筆 · 每月約 {formatTwd(summary.monthlyEquivalentTwd)}
          </Text>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="目前沒有定期支出（例如房租、訂閱）"
        >
          <Button icon={<Plus />} disabled={disabled} onClick={onCreate}>
            新增定期支出
          </Button>
        </Empty>
      ) : (
        <>
          <div className="recurring-overview-list">
            <ul className="recurring-overview-items">
              {rows.slice(0, COLLAPSED_COUNT).map(renderItem)}
            </ul>
            <Collapsible open={expanded}>
              <ul className="recurring-overview-items recurring-overview-items--more">
                {rows.slice(COLLAPSED_COUNT).map(renderItem)}
              </ul>
            </Collapsible>
          </div>
          {hiddenCount > 0 && (
            <Button
              type="text"
              size="small"
              className="recurring-overview-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "收合" : `看全部 ${rows.length} 筆`}
              <NavArrowDown className="recurring-overview-toggle-icon" aria-hidden />
            </Button>
          )}
        </>
      )}
    </section>
  );
}

export default RecurringOverview;
