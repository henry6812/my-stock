import { useState } from "react";
import { Button, Form, Input, Space, Table } from "antd";
import { Group, Plus } from "iconoir-react";
import HolderAvatar from "./HolderAvatar";
import MobileFormSheetLayout from "./MobileFormSheetLayout";
import MobileSwipeRow from "./MobileSwipeRow";
import SectionTitle from "./SectionTitle";
import { swipeDeleteAction, swipeEditAction } from "./swipeActionItems";

// 持有人 on a phone, like 收入設定: rows to read, a bottom sheet to edit, each
// change saved on its own (no draft list and 儲存 button).
//
// onAdd(name) and onRename(holder, name) resolve to true once saved, which
// closes the sheet. onRemove(holder) is expected to confirm before it saves.
function MobileHolderSettings({
  holders = [],
  disabled = false,
  loading = false,
  onAdd,
  onRename,
  onRemove,
}) {
  // null, { holder: null } to add, or { holder } to rename.
  const [sheet, setSheet] = useState(null);
  const [draftName, setDraftName] = useState("");

  const openSheet = (holder = null) => {
    setDraftName(holder ?? "");
    setSheet({ holder });
  };

  const trimmedName = draftName.trim();
  const isRename = Boolean(sheet?.holder);

  const handleSubmit = async () => {
    const saved = isRename
      ? await onRename?.(sheet.holder, trimmedName)
      : await onAdd?.(trimmedName);
    if (saved) setSheet(null);
  };

  const canRemove = holders.length > 1;

  const renderRow = (_, record) => (
    <MobileSwipeRow
      disabled={disabled}
      actions={[
        swipeEditAction(record.holder, () => openSheet(record.holder), "改名"),
        ...(canRemove
          ? [
              swipeDeleteAction(
                record.holder,
                () => onRemove?.(record.holder),
                "移除",
              ),
            ]
          : []),
      ]}
      onTap={disabled ? undefined : () => openSheet(record.holder)}
      label={`${record.holder}，改名`}
      main={
        <span className="holder-list-name">
          <HolderAvatar holder={record.holder} />
          <span className="holding-main-text">{record.holder}</span>
        </span>
      }
    />
  );

  return (
    <div className="mobile-list-section mobile-list-section--holder">
      <div className="mobile-list-header">
        <Space size={8}>
          <span className="mobile-list-title">
            <SectionTitle icon={Group}>持有人設定</SectionTitle>
          </span>
          <Button
            type="text"
            size="small"
            className="title-add-btn"
            icon={<Plus />}
            aria-label="新增持有人"
            disabled={disabled}
            onClick={() => openSheet()}
          />
        </Space>
      </div>
      <div className="mobile-list-body">
        <Table
          showHeader={false}
          className="mobile-swipe-table"
          rowKey="holder"
          dataSource={holders.map((holder) => ({ holder }))}
          columns={[{ key: "row", render: renderRow }]}
          pagination={false}
        />
      </div>

      <MobileFormSheetLayout
        title={isRename ? "持有人改名" : "新增持有人"}
        open={Boolean(sheet)}
        onClose={() => setSheet(null)}
        loading={loading}
        submitText={isRename ? "儲存" : "新增"}
        submitDisabled={
          disabled || !trimmedName || trimmedName === sheet?.holder
        }
        onSubmit={handleSubmit}
        className="holder-sheet"
      >
        <Form layout="vertical" component="div">
          <Form.Item
            label="名稱"
            extra={
              isRename
                ? "這位持有人的持股、現金帳戶與支出會一起改成新名稱。"
                : "新增後可在持股、現金帳戶與支出選這位持有人。"
            }
          >
            <Input
              aria-label="持有人名稱"
              value={draftName}
              maxLength={20}
              disabled={disabled}
              placeholder="例如：Po"
              onChange={(event) => setDraftName(event.target.value)}
              onPressEnter={() => {
                if (trimmedName) handleSubmit();
              }}
            />
          </Form.Item>
        </Form>
      </MobileFormSheetLayout>
    </div>
  );
}

export default MobileHolderSettings;
