import { useState } from "react";
import { Button, DatePicker, Form, InputNumber, Space, Table, Typography } from "antd";
import { Coins, Plus } from "iconoir-react";
import dayjs from "dayjs";
import MobileFormSheetLayout from "./MobileFormSheetLayout";
import MobileSwipeRow from "./MobileSwipeRow";
import SectionTitle from "./SectionTitle";
import { swipeDeleteAction, swipeEditAction } from "./swipeActionItems";
import { formatTwd } from "../utils/formatters";

const { Text } = Typography;

// 收入設定 on a phone: rows to read, a bottom sheet to edit — no inline
// fields or table. The first row is the monthly income every month falls back
// to; below it, the months that have their own (newest first).
//
// onSaveDefault(value | null) and onSaveOverride({ month, incomeTwd })
// resolve to true once saved, which closes the sheet. onRemoveOverride(month)
// is expected to confirm before it deletes.
function MobileIncomeSettings({
  defaultMonthlyIncomeTwd = null,
  overrides = [],
  disabled = false,
  loading = false,
  onSaveDefault,
  onSaveOverride,
  onRemoveOverride,
  getPopupContainer,
}) {
  // null, { kind: "default" } or { kind: "override", month } (month is set
  // when editing a month that already has its own income).
  const [sheet, setSheet] = useState(null);
  const [draftMonth, setDraftMonth] = useState(() => dayjs());
  const [draftAmount, setDraftAmount] = useState(null);

  const openDefault = () => {
    setDraftAmount(defaultMonthlyIncomeTwd);
    setSheet({ kind: "default" });
  };

  const openOverride = (override = null) => {
    setDraftMonth(override ? dayjs(override.month) : dayjs());
    setDraftAmount(override?.incomeTwd ?? null);
    setSheet({ kind: "override", month: override?.month ?? null });
  };

  const handleSubmit = async () => {
    const saved =
      sheet?.kind === "default"
        ? await onSaveDefault?.(draftAmount ?? null)
        : await onSaveOverride?.({
            month: draftMonth.format("YYYY-MM"),
            incomeTwd: draftAmount,
          });
    if (saved) setSheet(null);
  };

  const isDefault = sheet?.kind === "default";
  const defaultText =
    defaultMonthlyIncomeTwd == null ? "未設定" : formatTwd(defaultMonthlyIncomeTwd);

  const rows = [
    { key: "default" },
    ...[...overrides]
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((item) => ({ ...item, key: item.month })),
  ];

  const renderRow = (_, record) => {
    if (record.key === "default") {
      return (
        <MobileSwipeRow
          actions={[]}
          onTap={openDefault}
          label={`每月收入 ${defaultText}，編輯`}
          main={
            <span className="income-row-main">
              <span className="holding-main-text">每月收入</span>
              <Text type="secondary" className="income-row-meta">
                沒有另外設定的月份都用這個
              </Text>
            </span>
          }
          side={
            defaultMonthlyIncomeTwd == null ? (
              <Text type="secondary">未設定</Text>
            ) : (
              defaultText
            )
          }
        />
      );
    }
    const monthLabel = dayjs(record.month).format("YYYY 年 M 月");
    return (
      <MobileSwipeRow
        disabled={disabled}
        actions={[
          swipeEditAction(monthLabel, () => openOverride(record)),
          swipeDeleteAction(monthLabel, () => onRemoveOverride?.(record.month)),
        ]}
        onTap={() => openOverride(record)}
        label={`${monthLabel}收入 ${formatTwd(record.incomeTwd)}，編輯`}
        main={
          <span className="income-row-main">
            <span className="holding-main-text">{monthLabel}</span>
            <Text type="secondary" className="income-row-meta">
              只用在這個月
            </Text>
          </span>
        }
        side={formatTwd(record.incomeTwd)}
      />
    );
  };

  return (
    <div
      className="mobile-list-section mobile-list-section--income"
      id="income-settings"
    >
      <div className="mobile-list-header">
        <Space size={8}>
          <span className="mobile-list-title">
            <SectionTitle icon={Coins}>收入設定</SectionTitle>
          </span>
          <Button
            type="text"
            size="small"
            className="title-add-btn"
            icon={<Plus />}
            aria-label="新增月份收入"
            disabled={disabled}
            onClick={() => openOverride()}
          />
        </Space>
      </div>
      <div className="mobile-list-body">
        <Table
          showHeader={false}
          className="mobile-swipe-table"
          rowKey="key"
          dataSource={rows}
          columns={[{ key: "row", render: renderRow }]}
          pagination={false}
        />
      </div>

      <MobileFormSheetLayout
        title={
          isDefault ? "每月收入" : sheet?.month ? "編輯月份收入" : "新增月份收入"
        }
        open={Boolean(sheet)}
        onClose={() => setSheet(null)}
        loading={loading}
        submitDisabled={disabled}
        onSubmit={handleSubmit}
        className="income-sheet"
      >
        <Form layout="vertical" component="div">
          {sheet?.kind === "override" && (
            <Form.Item label="月份">
              <DatePicker
                picker="month"
                inputReadOnly
                allowClear={false}
                style={{ width: "100%" }}
                value={draftMonth}
                // An existing month is edited in place; pick another month
                // by adding it.
                disabled={disabled || Boolean(sheet.month)}
                onChange={(value) => setDraftMonth(value || dayjs())}
                getPopupContainer={getPopupContainer}
              />
            </Form.Item>
          )}
          <Form.Item
            label="收入 (TWD)"
            extra={
              isDefault
                ? "沒有另外設定的月份都用這個金額；留空代表未設定。"
                : "只用在這個月，取代每月收入。"
            }
          >
            <InputNumber
              inputMode="numeric"
              aria-label="收入金額"
              min={isDefault ? 0 : 1}
              step={1000}
              precision={0}
              style={{ width: "100%" }}
              disabled={disabled}
              value={draftAmount ?? undefined}
              placeholder={isDefault ? "未設定" : "收入金額"}
              onChange={(value) =>
                setDraftAmount(typeof value === "number" ? value : null)
              }
            />
          </Form.Item>
        </Form>
      </MobileFormSheetLayout>
    </div>
  );
}

export default MobileIncomeSettings;
