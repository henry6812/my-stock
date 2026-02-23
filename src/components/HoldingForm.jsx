import { Form, Input, InputNumber, Select } from "antd";

const marketOptions = [
  { value: "TW", label: "台股 (TW)" },
  { value: "US", label: "美股 (US)" },
];

function HoldingForm({
  onSubmit,
  layout = "inline",
  formId,
  popupContainer,
  disableAutofill = false,
  holdingTagOptions = [
    { value: "STOCK", label: "個股" },
    { value: "ETF", label: "ETF" },
    { value: "BOND", label: "債券" },
  ],
}) {
  const [form] = Form.useForm();
  const isVerticalLayout = layout === "vertical";

  const handleFinish = async (values) => {
    const shouldReset = await onSubmit(values);
    if (shouldReset !== false) {
      form.resetFields(["symbol", "shares"]);
    }
  };

  return (
    <Form
      id={formId}
      name={disableAutofill ? "holding_mobile_form" : "holding_form"}
      form={form}
      layout={layout}
      initialValues={{ market: "TW", assetTag: "STOCK" }}
      onFinish={handleFinish}
      style={{ width: "100%" }}
      autoComplete={disableAutofill ? "off" : undefined}
      data-lpignore={disableAutofill ? "true" : undefined}
    >
      <Form.Item
        label="市場"
        name="market"
        rules={[{ required: true, message: "請選擇市場" }]}
      >
        <Select
          options={marketOptions}
          style={isVerticalLayout ? { width: "100%" } : { width: 140 }}
          getPopupContainer={popupContainer}
        />
      </Form.Item>
      <Form.Item
        label="持股分類"
        name="assetTag"
        rules={[{ required: true, message: "請選擇分類" }]}
      >
        <Select
          options={holdingTagOptions}
          style={isVerticalLayout ? { width: "100%" } : { width: 140 }}
          getPopupContainer={popupContainer}
        />
      </Form.Item>
      <Form.Item
        label="股票代號"
        name="symbol"
        rules={[{ required: true, message: "請輸入代號" }]}
      >
        <Input
          placeholder="例如 2330 或 AAPL"
          style={isVerticalLayout ? { width: "100%" } : { width: 180 }}
          autoComplete={disableAutofill ? "new-password" : undefined}
          autoCorrect={disableAutofill ? "off" : undefined}
          autoCapitalize={disableAutofill ? "none" : undefined}
          spellCheck={disableAutofill ? false : undefined}
          data-lpignore={disableAutofill ? "true" : undefined}
        />
      </Form.Item>
      <Form.Item
        label="股數"
        name="shares"
        rules={[{ required: true, message: "請輸入股數" }]}
      >
        <InputNumber
          min={0.0001}
          step={1}
          precision={4}
          style={isVerticalLayout ? { width: "100%" } : { width: 140 }}
        />
      </Form.Item>
    </Form>
  );
}

export default HoldingForm;
