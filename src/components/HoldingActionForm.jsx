import { useState } from "react";
import { Alert, Button, Form, InputNumber, Select, Typography } from "antd";
import { formatPrice } from "../utils/formatters";
import {
  applyBuy,
  applySell,
  getAverageCost,
  getHoldingCurrency,
} from "../utils/holdingShares";

const { Text } = Typography;

const formatShares = (value) =>
  Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 4 });

const isPositive = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const isNonNegative = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

// Buy / sell / calibrate / edit one holding, opened from the stock detail
// sheet. The submit button lives in the surrounding sheet or modal
// (form={formId}); previews use the same maths as portfolioService.
function HoldingActionForm({
  formId,
  mode,
  holding: liveHolding,
  holderOptions = [],
  holdingTagOptions = [],
  popupContainer,
  disabled = false,
  onSubmit,
  onCalibrateInstead,
}) {
  const [form] = Form.useForm();
  // The holding as it was when the form opened: after a save the list
  // reloads while the form is still closing, and previews must not jump.
  const [holding] = useState(liveHolding);
  const watchedShares = Form.useWatch("shares", form);
  const watchedPrice = Form.useWatch("price", form);
  const currency = getHoldingCurrency(holding);
  const isUs = holding.market === "US";
  const averageCost = getAverageCost(holding);
  const heldShares = Number(holding.shares);

  const handleFinish = (values) => {
    if (mode === "buy") {
      onSubmit?.({ shares: values.shares, price: values.price });
    } else if (mode === "sell") {
      onSubmit?.({ shares: values.shares });
    } else if (mode === "calibrate") {
      onSubmit?.({ shares: values.shares, averageCost: values.averageCost ?? null });
    } else {
      onSubmit?.({ assetTag: values.assetTag, holder: values.holder });
    }
  };

  let preview = null;
  if (mode === "buy" && isPositive(watchedShares) && isNonNegative(watchedPrice)) {
    const next = applyBuy(holding, { shares: watchedShares, price: watchedPrice });
    const nextAverage = getAverageCost(next);
    preview = `買進後 ${formatShares(next.shares)} 股${
      nextAverage === null ? "" : ` · 均價 ${formatPrice(nextAverage, currency)}`
    }`;
  } else if (mode === "sell" && isPositive(watchedShares) && watchedShares < heldShares) {
    preview = `賣出後 ${formatShares(applySell(holding, watchedShares).shares)} 股`;
  }
  const sellsAll = mode === "sell" && watchedShares === heldShares;

  let initialValues = {};
  if (mode === "calibrate") {
    initialValues = {
      shares: holding.shares,
      averageCost: averageCost === null ? null : Math.round(averageCost * 10000) / 10000,
    };
  } else if (mode === "edit") {
    initialValues = {
      assetTag: holding.assetTag || "STOCK",
      holder: holding.holder ?? undefined,
    };
  }

  return (
    <Form
      id={formId}
      form={form}
      layout="vertical"
      disabled={disabled}
      autoComplete="off"
      initialValues={initialValues}
      onFinish={handleFinish}
    >
      {mode === "calibrate" && (
        <Text type="secondary" className="holding-action-note">
          用於修正錯誤、股票分割或配股，不算買賣。
        </Text>
      )}

      {mode === "buy" && averageCost === null && (
        <Alert
          type="info"
          showIcon
          className="holding-action-note"
          title="這檔還沒設定成本，買進後仍需校正成本才能看到損益"
          action={
            <Button type="link" size="small" onClick={onCalibrateInstead}>
              先校正成本
            </Button>
          }
        />
      )}

      {mode === "edit" ? (
        <>
          <Form.Item
            label="持股分類"
            name="assetTag"
            rules={[{ required: true, message: "請選擇分類" }]}
          >
            <Select options={holdingTagOptions} getPopupContainer={popupContainer} />
          </Form.Item>
          <Form.Item
            label="持有人"
            name="holder"
            rules={[{ required: true, message: "請選擇持有人" }]}
          >
            <Select
              options={holderOptions}
              getPopupContainer={popupContainer}
              placeholder="請選擇持有人"
            />
          </Form.Item>
        </>
      ) : (
        <Form.Item
          label="股數"
          name="shares"
          extra={
            mode === "sell" ? (
              <span className="holding-action-extra">
                {`目前 ${formatShares(heldShares)} 股`}
                <Button
                  type="link"
                  size="small"
                  onClick={() => form.setFieldsValue({ shares: heldShares })}
                >
                  全部
                </Button>
              </span>
            ) : undefined
          }
          rules={[
            { required: true, message: "請輸入股數" },
            ...(mode === "sell"
              ? [
                  {
                    validator: (_, value) =>
                      typeof value === "number" && value > heldShares
                        ? Promise.reject(new Error("賣出股數不可超過持有股數"))
                        : Promise.resolve(),
                  },
                ]
              : []),
          ]}
        >
          <InputNumber
            min={isUs ? 0.0001 : 1}
            step={1}
            precision={isUs ? 4 : 0}
            inputMode={isUs ? "decimal" : "numeric"}
            style={{ width: "100%" }}
          />
        </Form.Item>
      )}

      {mode === "buy" && (
        <Form.Item
          label={`每股價格（${currency}）`}
          name="price"
          rules={[{ required: true, message: "請輸入價格" }]}
        >
          <InputNumber min={0} step={0.01} inputMode="decimal" style={{ width: "100%" }} />
        </Form.Item>
      )}

      {mode === "calibrate" && (
        <Form.Item
          label={`平均成本（${currency}）`}
          name="averageCost"
          extra="留空表示未設定成本"
        >
          <InputNumber min={0} step={0.01} inputMode="decimal" style={{ width: "100%" }} />
        </Form.Item>
      )}

      {sellsAll && (
        <Alert
          type="warning"
          showIcon
          className="holding-action-note"
          title="賣出全部會移除這筆持股"
        />
      )}
      {preview && <Text type="secondary">{preview}</Text>}
    </Form>
  );
}

export default HoldingActionForm;
