import { Button, Form, Input, InputNumber, Select, Space } from 'antd'

const marketOptions = [
  { value: 'TW', label: '台股 (TW)' },
  { value: 'US', label: '美股 (US)' },
]

function HoldingForm({
  onSubmit,
  loading,
  submitText = '新增 / 更新持股',
  layout = 'inline',
  holdingTagOptions = [
    { value: 'STOCK', label: '個股' },
    { value: 'ETF', label: 'ETF' },
    { value: 'BOND', label: '債券' },
  ],
}) {
  const [form] = Form.useForm()

  const handleFinish = async (values) => {
    const shouldReset = await onSubmit(values)
    if (shouldReset !== false) {
      form.resetFields(['symbol', 'shares'])
    }
  }

  return (
    <Form
      form={form}
      layout={layout}
      initialValues={{ market: 'TW', assetTag: 'STOCK' }}
      onFinish={handleFinish}
      style={{ width: '100%' }}
    >
      <Form.Item
        label="市場"
        name="market"
        rules={[{ required: true, message: '請選擇市場' }]}
      >
        <Select options={marketOptions} style={{ width: 140 }} />
      </Form.Item>
      <Form.Item
        label="持股分類"
        name="assetTag"
        rules={[{ required: true, message: '請選擇分類' }]}
      >
        <Select options={holdingTagOptions} style={{ width: 140 }} />
      </Form.Item>
      <Form.Item
        label="股票代號"
        name="symbol"
        rules={[{ required: true, message: '請輸入代號' }]}
      >
        <Input placeholder="例如 2330 或 AAPL" style={{ width: 180 }} />
      </Form.Item>
      <Form.Item
        label="股數"
        name="shares"
        rules={[{ required: true, message: '請輸入股數' }]}
      >
        <InputNumber min={0.0001} step={1} precision={4} style={{ width: 140 }} />
      </Form.Item>
      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={loading}>
            {submitText}
          </Button>
        </Space>
      </Form.Item>
    </Form>
  )
}

export default HoldingForm
