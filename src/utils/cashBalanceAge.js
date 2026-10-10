import dayjs from "dayjs";

// A bank balance is typed in by hand, so after a month it's likely out of
// date. The timestamp is when the balance was last saved (see
// getCashAccountsView's balanceUpdatedAt), not any edit to the account.

const toValidDayjs = (value) => {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
};

export const isCashBalanceStale = (balanceUpdatedAt, now = new Date()) => {
  const updated = toValidDayjs(balanceUpdatedAt);
  if (!updated) return false;
  return updated.isBefore(dayjs(now).subtract(1, "month"));
};

export const getStaleBalanceLabel = (balanceUpdatedAt, now = new Date()) => {
  const updated = toValidDayjs(balanceUpdatedAt);
  if (!updated) return "";
  return `${dayjs(now).diff(updated, "day")} 天沒更新餘額`;
};
