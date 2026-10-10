import { Form, Input, InputNumber, Select } from "antd";
import { formatTwd } from "../utils/formatters";
import { getGoalTargetLabel } from "../utils/savingsGoals";
import GoalIcon from "./GoalIcon";

// Edit a bank account: alias, holder and balance (the bank itself is fixed),
// then the savings goals that count this account. It mirrors the goal detail
// sheet, which lists a goal's accounts.

export default function CashAccountEditForm({
  formId,
  account,
  linkedGoals = [],
  holderOptions = [],
  onSubmit,
  popupContainer,
  disabled = false,
}) {
  const bankText = account.bankCode
    ? `${account.bankName} (${account.bankCode})`
    : account.bankName;

  return (
    <>
      <Form
        id={formId}
        layout="vertical"
        disabled={disabled}
        autoComplete="off"
        initialValues={{
          accountAlias: account.accountAlias,
          holder: account.holder ?? undefined,
          balanceTwd: account.balanceTwd,
        }}
        onFinish={(values) =>
          onSubmit?.({
            accountAlias: String(values.accountAlias ?? "").trim(),
            holder: values.holder ?? null,
            balanceTwd: values.balanceTwd,
          })
        }
      >
        <Form.Item label="銀行">
          <span className="cash-edit-bank">{bankText}</span>
        </Form.Item>
        <Form.Item
          label="帳戶別名"
          name="accountAlias"
          rules={[
            { required: true, whitespace: true, message: "請輸入帳戶別名" },
          ]}
        >
          <Input placeholder="例如：薪轉帳戶、緊急預備金" data-lpignore="true" />
        </Form.Item>
        <Form.Item label="持有人" name="holder">
          <Select
            allowClear
            options={holderOptions}
            placeholder="未設定"
            getPopupContainer={popupContainer}
          />
        </Form.Item>
        <Form.Item
          label="現金餘額 (TWD)"
          name="balanceTwd"
          rules={[{ required: true, message: "請輸入餘額" }]}
        >
          <InputNumber
            inputMode="numeric"
            min={0}
            step={1000}
            precision={0}
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Form>

      <h3 className="savings-goal-detail-subtitle">儲蓄目標</h3>
      {linkedGoals.length === 0 ? (
        <p className="savings-goal-detail-empty">沒有儲蓄目標計入這個帳戶</p>
      ) : (
        <ul className="savings-goal-accounts" aria-label="計入這個帳戶的儲蓄目標">
          {linkedGoals.map((goal) => (
            <li key={goal.id} className="cash-edit-goal">
              <GoalIcon iconKey={goal.iconKey} />
              <span className="cash-edit-goal-text">
                <span className="savings-goal-account-top">
                  <span className="savings-goal-account-name">{goal.name}</span>
                  <span className="savings-goal-account-balance">
                    {formatTwd(goal.currentTwd)}
                  </span>
                </span>
                <span className="savings-goal-card-meta">
                  {goal.isArchived
                    ? `已封存・${getGoalTargetLabel(goal)}`
                    : getGoalTargetLabel(goal)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
