import { Form, Input, Select } from "antd";

export const WATCHLIST_FORM_ID = "watchlist-form";

const marketOptions = [
  { value: "TW", label: "台股 (TW)" },
  { value: "US", label: "美股 (US)" },
];

// 新增觀察: market + symbol only. The service checks the symbol by fetching
// a quote; its error (duplicate, no quote) shows under the symbol.
function WatchlistForm({ formId, disabled, onSubmit }) {
  const [form] = Form.useForm();

  const handleFinish = async (values) => {
    try {
      await onSubmit({ market: values.market, symbol: values.symbol });
      form.resetFields(["symbol"]);
    } catch (error) {
      form.setFields([
        { name: "symbol", errors: [error instanceof Error ? error.message : String(error)] },
      ]);
    }
  };

  return (
    <Form
      id={formId}
      name="watchlist_form"
      form={form}
      layout="vertical"
      initialValues={{ market: "TW" }}
      onFinish={handleFinish}
      autoComplete="off"
    >
      <Form.Item label="市場" name="market" rules={[{ required: true, message: "請選擇市場" }]}>
        <Select disabled={disabled} options={marketOptions} />
      </Form.Item>
      <Form.Item label="股票代號" name="symbol" rules={[{ required: true, whitespace: true, message: "請輸入代號" }]}>
        <Input
          disabled={disabled}
          placeholder="例如 2330 或 AAPL"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Form.Item>
    </Form>
  );
}

export default WatchlistForm;
