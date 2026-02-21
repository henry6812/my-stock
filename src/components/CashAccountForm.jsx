import { AutoComplete, Button, Form, Input, InputNumber, Space } from 'antd'

function CashAccountForm({
  onSubmit,
  loading,
  bankOptions,
  loadingBankOptions,
  submitText = '新增銀行帳戶',
}) {
  const [form] = Form.useForm()

  const handleFinish = async (values) => {
    const shouldReset = await onSubmit(values)
    if (shouldReset !== false) {
      form.resetFields(['bankName', 'accountAlias', 'balanceTwd'])
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      initialValues={{ balanceTwd: 0 }}
      style={{ width: '100%' }}
    >
      <Form.Item
        label="銀行名稱"
        name="bankName"
        rules={[{ required: true, message: '請輸入銀行名稱' }]}
      >
        <AutoComplete
          options={bankOptions.map((item) => ({
            value: item.bankName,
            label: item.bankCode ? `${item.bankName} (${item.bankCode})` : item.bankName,
          }))}
          placeholder={loadingBankOptions ? '讀取銀行名單中...' : '請輸入或選擇銀行名稱'}
          filterOption={(inputValue, option) => (
            option?.value?.toUpperCase().includes(inputValue.toUpperCase())
            || String(option?.label ?? '').toUpperCase().includes(inputValue.toUpperCase())
          )}
        />
      </Form.Item>

      <Form.Item
        label="帳戶別名"
        name="accountAlias"
        rules={[{ required: true, message: '請輸入帳戶別名' }]}
      >
        <Input placeholder="例如：薪轉帳戶、緊急預備金" />
      </Form.Item>

      <Form.Item
        label="現金餘額 (TWD)"
        name="balanceTwd"
        rules={[{ required: true, message: '請輸入餘額' }]}
      >
        <InputNumber min={0} step={1000} precision={0} style={{ width: '100%' }} />
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

export default CashAccountForm
