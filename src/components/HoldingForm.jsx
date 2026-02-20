import { Button, Form, Input, InputNumber, Select, Space } from 'antd'

const marketOptions = [
  { value: 'TW', label: '台股 (TW)' },
  { value: 'US', label: '美股 (US)' },
]

function HoldingForm({ onSubmit, loading }) {
  const [form] = Form.useForm()

  const handleFinish = async (values) => {
    await onSubmit(values)
    form.resetFields(['symbol', 'shares'])
  }

  return (
    <Form
      form={form}
      layout="inline"
      initialValues={{ market: 'TW' }}
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
            新增 / 更新持股
          </Button>
        </Space>
      </Form.Item>
    </Form>
  )
}

export default HoldingForm
