// Turns thrown errors into zh-TW text that is safe to show in a toast.
// Services and providers throw English/dev-facing messages (and Firebase
// throws its own); showing those raw is confusing, so map the known ones and
// fall back to the caller's context-specific zh-TW text for the rest.

const FIREBASE_CODE_MESSAGES = {
  "permission-denied": "沒有權限存取雲端資料，請重新登入後再試",
  unauthenticated: "登入已失效，請重新登入",
  unavailable: "雲端服務暫時無法連線，請確認網路後再試",
  "deadline-exceeded": "雲端連線逾時，請稍後再試",
  "resource-exhausted": "雲端用量已達上限，請稍後再試",
  "auth/popup-closed-by-user": "登入視窗已關閉，未完成登入",
  "auth/cancelled-popup-request": "登入已取消",
  "auth/popup-blocked": "瀏覽器封鎖了登入視窗，請允許彈出視窗後再試",
  "auth/network-request-failed": "網路連線失敗，請確認網路後再試",
  "auth/too-many-requests": "嘗試次數過多，請稍後再試",
  "auth/user-disabled": "此帳號已被停用",
  "auth/unauthorized-domain": "此網域未被授權登入，請聯絡管理者",
};

// [pattern, zh-TW message]. Order matters: first match wins.
const MESSAGE_RULES = [
  [/Missing or insufficient permissions/i, FIREBASE_CODE_MESSAGES["permission-denied"]],
  [/Failed to fetch|NetworkError|Load failed|network/i, "網路連線失敗，請確認網路後再試"],
  [/timeout|timed out/i, "連線逾時，請稍後再試"],
  [/VITE_FINNHUB_API_KEY|invalid API key|Finnhub API error: 40[13]/i, "美股報價服務設定有誤，暫時無法取得報價"],
  [/Missing Firebase config|Firebase auth is unavailable|Firestore is unavailable/i, "雲端服務未設定或無法使用"],
  [/No active sync user/i, "請先登入"],
  [/No (Taiwan |TPEX )?quote found for symbol:?\s*(.*)/i, (m) =>
    m[2] && !/invalid/i.test(m[2]) ? `找不到代號 ${m[2]} 的報價，請確認代號與市場` : "找不到此代號的報價，請確認代號與市場"],
  [/(TWSE|TPEX|FX|Bank directory).*API error|MI_INDEX/i, "報價來源暫時無法使用，請稍後再試"],
  [/USD\/TWD rate/i, "無法取得美元匯率，請稍後再試"],
  [/Stock symbol is required/i, "請輸入股票代號"],
  [/Shares must be a positive number/i, "股數必須大於 0"],
  [/Balance must be a non-negative number/i, "餘額不可為負數"],
  [/Income must be a positive number/i, "收入必須大於 0"],
  [/Bank name is required/i, "請輸入銀行名稱"],
  [/Account alias is required/i, "請輸入帳戶別名"],
  [/Category name is required/i, "請輸入類別名稱"],
  [/Budget name is required/i, "請輸入預算名稱"],
  [/Budget start date is required/i, "請選擇預算起始日"],
  [/Resident percent must be positive/i, "收入占比必須大於 0"],
  [/Special budget amount must be positive/i, "預算金額必須大於 0"],
  [/Special budget date range is required/i, "請選擇預算期間"],
  [/end date must be after start date/i, "結束日不可早於起始日"],
  [/Expense name is required/i, "請輸入支出名稱"],
  [/Expense amount must be positive/i, "支出金額必須大於 0"],
  [/Expense date is required/i, "請選擇支出日期"],
  [/Monthly day must be between/i, "每月日期須介於 1–31"],
  [/Yearly month must be between/i, "月份須介於 1–12"],
  [/Yearly day must be between/i, "日期須介於 1–31"],
  [/orderedIds/i, "排序資料已變動，請重新整理後再試"],
  [/(Holding|Cash account|Category|Budget|Expense) not found/i, "找不到這筆資料，可能已在其他裝置被刪除，請重新整理"],
];

const hasCjk = (text) => /[㐀-鿿]/.test(text);

export const toUserMessage = (error, fallback = "發生錯誤，請稍後再試") => {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code && FIREBASE_CODE_MESSAGES[code]) {
    return FIREBASE_CODE_MESSAGES[code];
  }

  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error || typeof error?.message === "string"
        ? error.message
        : "";
  if (!raw) {
    return fallback;
  }

  for (const [pattern, replacement] of MESSAGE_RULES) {
    const match = raw.match(pattern);
    if (match) {
      return typeof replacement === "function" ? replacement(match) : replacement;
    }
  }

  // Service code already throws zh-TW for user-facing validation; keep those.
  if (hasCjk(raw)) {
    return raw;
  }

  console.warn("[toUserMessage] unmapped error:", error);
  return fallback;
};
