import { Drawer } from "antd";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// 研究 tab's sheets: a bottom sheet on mobile, a right-hand drawer on
// desktop (like StockSheetShell), with an optional fixed footer.
function ResearchSheet({ open, isMobile, title, onClose, footer = null, children }) {
  useBodyScrollLock(Boolean(open) && isMobile);
  return (
    <Drawer
      placement={isMobile ? "bottom" : "right"}
      size={isMobile ? "90vh" : 520}
      title={title}
      open={open}
      onClose={onClose}
      footer={footer}
      destroyOnHidden
      className={isMobile ? "form-bottom-sheet research-sheet" : "research-sheet"}
    >
      {children}
    </Drawer>
  );
}

export default ResearchSheet;
