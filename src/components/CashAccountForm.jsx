import { AutoComplete, Form, Input, InputNumber, Select } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

function CashAccountForm({
  onSubmit,
  bankOptions,
  loadingBankOptions,
  popupContainer,
  formId,
  disableAutofill = false,
}) {
  const [form] = Form.useForm();
  const [bankKeyword, setBankKeyword] = useState("");
  const [isBankFocused, setIsBankFocused] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const blurCloseTimerRef = useRef(null);
  const bankNameValue = Form.useWatch("bankName", form);

  useEffect(() => {
    const next = typeof bankNameValue === "string" ? bankNameValue : "";
    setBankKeyword(next);
  }, [bankNameValue]);

  useEffect(
    () => () => {
      if (blurCloseTimerRef.current) {
        clearTimeout(blurCloseTimerRef.current);
      }
    },
    [],
  );

  const bankOptionsDisplay = useMemo(() => {
    const normalized = bankKeyword.trim().toUpperCase();
    const allOptions = bankOptions.map((item) => ({
      value: item.bankName,
      label: item.bankCode ? `${item.bankName} (${item.bankCode})` : item.bankName,
    }));

    if (!normalized && allOptions.length > 0) {
      return allOptions;
    }

    const filtered = allOptions.filter(
      (option) =>
        option.value.toUpperCase().includes(normalized) ||
        String(option.label).toUpperCase().includes(normalized),
    );

    if (filtered.length > 0) {
      return filtered;
    }

    return [
      {
        value: "__hint__",
        label: loadingBankOptions
          ? "讀取銀行名單中..."
          : "目前無可用銀行名單，可直接輸入",
        disabled: true,
      },
    ];
  }, [bankKeyword, bankOptions, loadingBankOptions]);

  const isBankDropdownOpen = isBankFocused && manualOpen;

  const handleFinish = async (values) => {
    const shouldReset = await onSubmit(values);
    if (shouldReset !== false) {
      form.resetFields(["bankName", "accountAlias", "holder", "balanceTwd"]);
    }
  };

  return (
    <Form
      id={formId}
      name={disableAutofill ? "cash_mobile_form" : "cash_form"}
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      initialValues={{ balanceTwd: 0 }}
      style={{ width: "100%" }}
      autoComplete={disableAutofill ? "off" : undefined}
      data-lpignore={disableAutofill ? "true" : undefined}
    >
      <Form.Item
        label="銀行名稱"
        name="bankName"
        rules={[{ required: true, message: "請輸入銀行名稱" }]}
      >
        <AutoComplete
          className="cash-bank-autocomplete"
          style={{ width: "100%" }}
          getPopupContainer={popupContainer}
          value={bankKeyword}
          open={isBankDropdownOpen}
          options={bankOptionsDisplay}
          filterOption={false}
          onChange={(value) => {
            setBankKeyword(value);
            form.setFieldValue("bankName", value);
            setManualOpen(true);
          }}
          onSelect={(value) => {
            if (value === "__hint__") {
              return;
            }
            setBankKeyword(value);
            form.setFieldValue("bankName", value);
            setManualOpen(false);
            setIsBankFocused(false);
          }}
          onFocus={() => {
            if (blurCloseTimerRef.current) {
              clearTimeout(blurCloseTimerRef.current);
            }
            setIsBankFocused(true);
            setManualOpen(true);
          }}
          onBlur={() => {
            blurCloseTimerRef.current = setTimeout(() => {
              setIsBankFocused(false);
              setManualOpen(false);
            }, 120);
          }}
          placeholder={loadingBankOptions ? "讀取銀行名單中..." : "請輸入或選擇銀行名稱"}
          autoComplete={disableAutofill ? "new-password" : undefined}
          autoCorrect={disableAutofill ? "off" : undefined}
          autoCapitalize={disableAutofill ? "none" : undefined}
          spellCheck={disableAutofill ? false : undefined}
          data-lpignore={disableAutofill ? "true" : undefined}
        />
      </Form.Item>

      <Form.Item
        label="帳戶別名"
        name="accountAlias"
        rules={[{ required: true, message: "請輸入帳戶別名" }]}
      >
        <Input
          placeholder="例如：薪轉帳戶、緊急預備金"
          autoComplete={disableAutofill ? "new-password" : undefined}
          autoCorrect={disableAutofill ? "off" : undefined}
          autoCapitalize={disableAutofill ? "none" : undefined}
          spellCheck={disableAutofill ? false : undefined}
          data-lpignore={disableAutofill ? "true" : undefined}
        />
      </Form.Item>

      <Form.Item label="持有人" name="holder">
        <Select
          allowClear
          options={[
            { label: "Po", value: "Po" },
            { label: "Wei", value: "Wei" },
          ]}
          placeholder="未設定"
          getPopupContainer={popupContainer}
        />
      </Form.Item>

      <Form.Item
        label="現金餘額 (TWD)"
        name="balanceTwd"
        rules={[{ required: true, message: "請輸入餘額" }]}
      >
        <InputNumber min={0} step={1000} precision={0} style={{ width: "100%" }} />
      </Form.Item>
    </Form>
  );
}

export default CashAccountForm;
