import { useRef } from "react";
import { Checkbox, DatePicker, Form, Input, InputNumber, Segmented } from "antd";
import dayjs from "dayjs";
import CategoryIconPicker from "./CategoryIconPicker";
import { GOAL_ICON_COMPONENTS } from "./goalIconComponents";
import { formatTwd } from "../utils/formatters";
import {
  GOAL_ICON_OPTIONS,
  GOAL_KIND,
  ONGOING_MONTHS_DEFAULT,
  ONGOING_MONTHS_MAX,
  ONGOING_MONTHS_MIN,
  getGoalIconKey,
} from "../utils/savingsGoals";

// Add / edit one savings goal. Owns its antd Form; the parent submits it
// through `formId` (sheet footer or modal OK) and remounts it per open.
// Links the parent no longer lists (a deleted account) are kept on save
// unless 已刪除的帳戶 is unticked.

const KIND_OPTIONS = [
  { label: "有期限", value: GOAL_KIND.DEADLINE },
  { label: "無期限", value: GOAL_KIND.OPEN },
  { label: "常態", value: GOAL_KIND.ONGOING },
];

export default function SavingsGoalForm({
  formId,
  onSubmit,
  initialValues = null,
  accountOptions = [],
  averageMonthlyExpenseTwd = null,
  today,
  popupContainer,
  disabled = false,
}) {
  const [form] = Form.useForm();
  const submittingRef = useRef(false);
  const name = Form.useWatch("name", form) ?? "";
  const kind = Form.useWatch("kind", form) ?? initialValues?.kind ?? GOAL_KIND.DEADLINE;
  const months = Form.useWatch("targetMonths", form);
  const previousDeadline = initialValues?.deadline ?? null;
  const listedKeys = new Set(accountOptions.map((item) => item.key));
  const unlistedKeys = (initialValues?.cashAccountKeys ?? []).filter(
    (key) => !listedKeys.has(key),
  );

  const handleFinish = async (values) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await onSubmit({
        name: values.name,
        icon: values.icon ?? null,
        kind: values.kind,
        targetTwd: values.kind === GOAL_KIND.ONGOING ? null : values.targetTwd,
        targetMonths: values.kind === GOAL_KIND.ONGOING ? values.targetMonths : null,
        deadline:
          values.kind === GOAL_KIND.DEADLINE && values.deadline
            ? values.deadline.format("YYYY-MM-DD")
            : null,
        cashAccountKeys: [
          ...(values.cashAccountKeys ?? []),
          ...(values.keepUnlistedKeys ? unlistedKeys : []),
        ],
      });
    } finally {
      submittingRef.current = false;
    }
  };

  const ongoingPreview =
    averageMonthlyExpenseTwd === null
      ? "還沒有完整月份的支出資料，暫時無法計算"
      : `≈ ${formatTwd(averageMonthlyExpenseTwd * (Number(months) || 0))}（平均月支出 ${formatTwd(averageMonthlyExpenseTwd)}）`;

  return (
    <Form
      id={formId}
      form={form}
      name="savings_goal_form"
      layout="vertical"
      disabled={disabled}
      autoComplete="off"
      initialValues={{
        name: initialValues?.name ?? "",
        icon: initialValues?.icon ?? null,
        kind: initialValues?.kind ?? GOAL_KIND.DEADLINE,
        targetTwd: initialValues?.kind === GOAL_KIND.ONGOING ? undefined : (initialValues?.targetTwd ?? undefined),
        targetMonths: initialValues?.targetMonths ?? ONGOING_MONTHS_DEFAULT,
        deadline: initialValues?.deadline ? dayjs(initialValues.deadline) : undefined,
        cashAccountKeys: (initialValues?.cashAccountKeys ?? []).filter((key) => listedKeys.has(key)),
        keepUnlistedKeys: true,
      }}
      onFinish={handleFinish}
    >
      <Form.Item
        label="名稱"
        name="name"
        rules={[{ required: true, whitespace: true, message: "請輸入名稱" }]}
      >
        <Input />
      </Form.Item>
      <Form.Item label="圖示" name="icon">
        <CategoryIconPicker
          name={name}
          options={GOAL_ICON_OPTIONS}
          components={GOAL_ICON_COMPONENTS}
          resolveByName={getGoalIconKey}
          groupLabel="目標圖示"
          disabled={disabled}
        />
      </Form.Item>
      <Form.Item label="類型" name="kind">
        <Segmented block options={KIND_OPTIONS} />
      </Form.Item>
      {kind !== GOAL_KIND.ONGOING && (
        <Form.Item
          label="目標金額"
          name="targetTwd"
          rules={[{ required: true, message: "請輸入目標金額" }]}
        >
          <InputNumber
            min={1}
            precision={0}
            inputMode="numeric"
            prefix="$"
            style={{ width: "100%" }}
          />
        </Form.Item>
      )}
      {kind === GOAL_KIND.DEADLINE && (
        <Form.Item
          label="到期日"
          name="deadline"
          rules={[
            { required: true, message: "請選擇到期日" },
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve();
                const date = value.format("YYYY-MM-DD");
                return date === previousDeadline || date > today
                  ? Promise.resolve()
                  : Promise.reject(new Error("到期日須晚於今天"));
              },
            },
          ]}
        >
          <DatePicker
            style={{ width: "100%" }}
            inputReadOnly
            getPopupContainer={popupContainer}
          />
        </Form.Item>
      )}
      {kind === GOAL_KIND.ONGOING && (
        <Form.Item
          label="幾個月的支出"
          name="targetMonths"
          extra={ongoingPreview}
          rules={[{ required: true, message: "請輸入月數" }]}
        >
          <InputNumber
            min={ONGOING_MONTHS_MIN}
            max={ONGOING_MONTHS_MAX}
            precision={0}
            inputMode="numeric"
            suffix="個月"
            style={{ width: "100%" }}
          />
        </Form.Item>
      )}
      <Form.Item
        label="計入的銀行帳戶"
        name="cashAccountKeys"
        extra={accountOptions.length === 0 ? "還沒有銀行帳戶，可先儲存再到資產頁新增" : undefined}
      >
        <Checkbox.Group className="savings-goal-account-options">
          {accountOptions.map((account) => (
            <Checkbox key={account.key} value={account.key}>
              <span className="savings-goal-account-option">
                <span>{`${account.bankName}・${account.accountAlias}`}</span>
                <span className="savings-goal-card-meta">
                  {`${account.holder ?? "未設定"}・${formatTwd(account.balanceTwd)}`}
                </span>
              </span>
            </Checkbox>
          ))}
        </Checkbox.Group>
      </Form.Item>
      {unlistedKeys.length > 0 && (
        <Form.Item
          name="keepUnlistedKeys"
          valuePropName="checked"
          extra="同銀行、同別名、同持有人的帳戶重新建立後會自動接回；取消勾選就移除這些連結"
        >
          <Checkbox>{`已刪除的帳戶（${unlistedKeys.length}）`}</Checkbox>
        </Form.Item>
      )}
    </Form>
  );
}
