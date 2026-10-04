import { useRef } from "react";
import { Form, Input, InputNumber, Select } from "antd";

// Add / edit one 常用支出 template. Owns its antd Form; the parent submits it
// through `formId` (sheet footer or modal OK) and remounts it per open.

const KIND_OPTIONS = [
  { label: "家庭", value: "家庭" },
  { label: "個人", value: "個人" },
];

const HISTORY_SELECT_ID = "expense-template-history";
const STALE_HINT = "原本的設定已失效，儲存後會清除";

const hasOption = (options, value) =>
  value !== null &&
  value !== undefined &&
  options.some((item) => item.value === value);

function ExpenseTemplateForm({
  formId,
  onSubmit,
  initialValues = null,
  categoryOptions = [],
  payerOptions = [],
  budgetOptions = [],
  historySuggestions = [],
  // Fields whose saved link no longer resolves (deleted category, removed
  // payer, ended budget); they show empty and are cleared on save.
  staleFields = [],
  popupContainer,
  disabled = false,
}) {
  const [form] = Form.useForm();
  const submittingRef = useRef(false);
  const isNew = !initialValues;
  const staleHint = (field) =>
    staleFields.includes(field) ? STALE_HINT : undefined;

  // A starting point from a past expense. The amount is left out on purpose:
  // the last amount paid isn't necessarily a fixed one.
  const handlePickHistory = (name) => {
    const item = historySuggestions.find((entry) => entry.name === name);
    if (!item) return;
    form.setFieldsValue({
      name: item.name,
      categoryId: hasOption(categoryOptions, item.categoryId)
        ? item.categoryId
        : undefined,
      payer: hasOption(payerOptions, item.payer) ? item.payer : undefined,
      expenseKind: hasOption(KIND_OPTIONS, item.expenseKind)
        ? item.expenseKind
        : undefined,
      budgetId: hasOption(budgetOptions, item.budgetId)
        ? item.budgetId
        : undefined,
    });
  };

  // Enter in a field submits natively, bypassing the parent's loading-locked
  // OK button; without this a double Enter creates two templates.
  const handleFinish = async (values) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await onSubmit({
        name: values.name,
        amountTwd: values.amountTwd ?? null,
        categoryId: values.categoryId ?? null,
        payer: values.payer ?? null,
        expenseKind: values.expenseKind ?? null,
        budgetId: values.budgetId ?? null,
      });
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Form
      id={formId}
      form={form}
      name="expense_template_form"
      layout="vertical"
      disabled={disabled}
      autoComplete="off"
      initialValues={{
        name: initialValues?.name ?? "",
        amountTwd: initialValues?.amountTwd ?? undefined,
        categoryId: initialValues?.categoryId ?? undefined,
        payer: initialValues?.payer ?? undefined,
        expenseKind: initialValues?.expenseKind ?? undefined,
        budgetId: initialValues?.budgetId ?? undefined,
      }}
      onFinish={handleFinish}
    >
      {isNew && historySuggestions.length > 0 && (
        <Form.Item
          label="從歷史帶入"
          htmlFor={HISTORY_SELECT_ID}
          extra="選一筆過去的支出當起點（不含金額）"
        >
          <Select
            id={HISTORY_SELECT_ID}
            showSearch
            allowClear
            value={null}
            placeholder="搜尋過去的支出名稱"
            getPopupContainer={popupContainer}
            options={historySuggestions.map((item) => ({
              label: item.name,
              value: item.name,
            }))}
            onChange={handlePickHistory}
          />
        </Form.Item>
      )}
      <Form.Item
        label="名稱"
        name="name"
        rules={[{ required: true, whitespace: true, message: "請輸入名稱" }]}
      >
        <Input />
      </Form.Item>
      <Form.Item label="固定金額" name="amountTwd" extra="留空表示金額不固定">
        <InputNumber
          min={1}
          precision={0}
          inputMode="numeric"
          prefix="$"
          placeholder="不固定"
          style={{ width: "100%" }}
        />
      </Form.Item>
      <Form.Item label="分類" name="categoryId" extra={staleHint("categoryId")}>
        <Select
          allowClear
          getPopupContainer={popupContainer}
          options={categoryOptions}
        />
      </Form.Item>
      <Form.Item label="支出人" name="payer" extra={staleHint("payer")}>
        <Select
          allowClear
          getPopupContainer={popupContainer}
          options={payerOptions}
        />
      </Form.Item>
      <Form.Item label="家庭 / 個人" name="expenseKind">
        <Select
          allowClear
          getPopupContainer={popupContainer}
          options={KIND_OPTIONS}
        />
      </Form.Item>
      <Form.Item label="預算" name="budgetId" extra={staleHint("budgetId")}>
        <Select
          allowClear
          getPopupContainer={popupContainer}
          options={budgetOptions}
        />
      </Form.Item>
    </Form>
  );
}

export default ExpenseTemplateForm;
