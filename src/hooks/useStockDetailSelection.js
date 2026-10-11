import { useCallback, useMemo, useState } from "react";
import { buildStockDetailHolding } from "../utils/stockDetail";

const NONE = { id: null, action: null };

// The holding open in the stock detail sheet, and the form (buy / sell /
// calibrate / edit) open over it. They move together: opening another
// holding or closing the sheet drops the form, and when the holding goes
// away (removed, moved, logged out — on any device) both reset, so a stale
// form never opens on the next tap and a reused id never reopens the sheet.
export default function useStockDetailSelection(rows) {
  const [selection, setSelection] = useState(NONE);
  const stockDetail = useMemo(
    () => (selection.id === null ? null : buildStockDetailHolding(rows, selection.id)),
    [rows, selection.id],
  );
  if (selection.id !== null && stockDetail === null) {
    setSelection(NONE);
  }

  const openStockDetail = useCallback((id) => setSelection({ id, action: null }), []);
  const closeStockDetail = useCallback(() => setSelection(NONE), []);
  const setHoldingAction = useCallback(
    (action) => setSelection((prev) => ({ ...prev, action })),
    [],
  );

  return {
    stockDetail,
    holdingAction: stockDetail ? selection.action : null,
    openStockDetail,
    closeStockDetail,
    setHoldingAction,
  };
}
