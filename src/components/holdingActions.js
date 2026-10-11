// Titles and submit labels for HoldingActionForm's modes, shared with the
// sheet / modal that wraps it.
export const HOLDING_ACTION_TITLES = {
  buy: "買進",
  sell: "賣出",
  calibrate: "校正股數與成本",
  edit: "編輯分類與持有人",
};

// Form title naming what it acts on, e.g. 「買進 · 瑞鼎（Po）」: the detail
// sheet is hidden while the form is open.
export const getHoldingActionTitle = (action, holding) => {
  if (!action) return "";
  const name = holding?.companyName || holding?.symbol || "";
  const holder = holding?.holderName ? `（${holding.holderName}）` : "";
  return `${HOLDING_ACTION_TITLES[action]} · ${name}${holder}`;
};

export const HOLDING_ACTION_SUBMIT_TEXT = {
  buy: "買進",
  sell: "賣出",
  calibrate: "儲存",
  edit: "儲存",
};
