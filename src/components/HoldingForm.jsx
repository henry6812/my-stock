import { Alert, Form, Input, InputNumber, Radio, Select } from "antd";
import {
  HOLDING_SHARES_MODE,
  findExistingHolding,
  resolveNextShares,
} from "../utils/holdingShares";

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
  disabled = false,
  holderOptions = [],
  existingHoldings = [],
  holdingTagOptions = [
    { value: "STOCK", label: "個股" },
    { value: "ETF", label: "ETF" },
    { value: "BOND", label: "債券" },
  ],
}) {
  const [form] = Form.useForm();
  const isVerticalLayout = layout === "vertical";
  const watchedMarket = Form.useWatch("market", form);
  const watchedSymbol = Form.useWatch("symbol", form);
  const watchedHolder = Form.useWatch("holder", form);
  const watchedShares = Form.useWatch("shares", form);
  const watchedSharesMode = Form.useWatch("sharesMode", form);
  const existingHolding = findExistingHolding(existingHoldings, {
    symbol: watchedSymbol,
    market: watchedMarket,
    holder: watchedHolder,
  });
  const inputShares = Number(watchedShares);
  const previewShares =
    existingHolding && Number.isFinite(inputShares) && inputShares > 0
      ? resolveNextShares({
          existingShares: existingHolding.shares,
          inputShares,
          mode: watchedSharesMode,
        })
      : null;

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
      initialValues={{
        market: "TW",
        assetTag: "STOCK",
        sharesMode: HOLDING_SHARES_MODE.ADD,
      }}
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
          disabled={disabled}
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
          disabled={disabled}
          options={holdingTagOptions}
          style={isVerticalLayout ? { width: "100%" } : { width: 140 }}
          getPopupContainer={popupContainer}
        />
      </Form.Item>
      <Form.Item
        label="持有人"
        name="holder"
        rules={[{ required: true, message: "請選擇持有人" }]}
      >
        <Select
          disabled={disabled}
          options={holderOptions}
          style={isVerticalLayout ? { width: "100%" } : { width: 120 }}
          getPopupContainer={popupContainer}
          placeholder="請選擇持有人"
        />
      </Form.Item>
      <Form.Item
        label="股票代號"
        name="symbol"
        rules={[{ required: true, message: "請輸入代號" }]}
      >
        <Input
          disabled={disabled}
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
          disabled={disabled}
          // TW shares are whole numbers; US brokers allow fractional shares.
          min={watchedMarket === "US" ? 0.0001 : 1}
          step={1}
          precision={watchedMarket === "US" ? 4 : 0}
          inputMode={watchedMarket === "US" ? "decimal" : "numeric"}
          style={isVerticalLayout ? { width: "100%" } : { width: 140 }}
        />
      </Form.Item>
      {existingHolding ? (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={`${watchedHolder} 已持有 ${Number(existingHolding.shares).toLocaleString("zh-TW")} 股`}
            description={
              previewShares !== null
                ? `儲存後將變為 ${previewShares.toLocaleString("zh-TW")} 股`
                : undefined
            }
          />
          <Form.Item label="股數處理方式" name="sharesMode">
            <Radio.Group disabled={disabled}>
              <Radio value={HOLDING_SHARES_MODE.ADD}>加總到現有股數</Radio>
              <Radio value={HOLDING_SHARES_MODE.REPLACE}>覆蓋為輸入的股數</Radio>
            </Radio.Group>
          </Form.Item>
        </>
      ) : null}
    </Form>
  );
}

export default HoldingForm;
