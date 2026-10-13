import { Drawer, Typography } from "antd";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

const { Text } = Typography;

// The stock detail frame shared by holdings and watched stocks: a bottom
// sheet on mobile, a right-hand drawer on desktop, titled name + symbol.
function StockSheetShell({ open, isMobile, name, symbol, onClose, children }) {
  useBodyScrollLock(Boolean(open) && isMobile);

  const title = (
    <div className="stock-detail-title">
      <span>{name || symbol}</span>
      <Text type="secondary">{symbol}</Text>
    </div>
  );

  return isMobile ? (
    <Drawer
      placement="bottom"
      title={title}
      open={open}
      onClose={onClose}
      size="90vh"
      destroyOnHidden
      className="form-bottom-sheet stock-detail-sheet"
    >
      {children}
    </Drawer>
  ) : (
    <Drawer
      placement="right"
      title={title}
      open={open}
      onClose={onClose}
      size={520}
      destroyOnHidden
      className="stock-detail-sheet"
    >
      {children}
    </Drawer>
  );
}

export default StockSheetShell;
