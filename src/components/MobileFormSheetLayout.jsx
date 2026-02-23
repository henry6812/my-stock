import { Button, Drawer } from "antd";

function MobileFormSheetLayout({
  title,
  open,
  onClose,
  loading = false,
  submitText = "儲存",
  onSubmit,
  submitFormId,
  children,
  className = "",
}) {
  return (
    <Drawer
      placement="bottom"
      title={title}
      open={open}
      onClose={() => {
        if (!loading) {
          onClose?.();
        }
      }}
      size="90vh"
      closable={!loading}
      maskClosable={!loading}
      keyboard={!loading}
      destroyOnHidden
      className={`form-bottom-sheet sheet-layout ${className}`.trim()}
      styles={{ body: { padding: 0 } }}
    >
      <div className="sheet-content">{children}</div>
      <div className="sheet-footer">
        <Button
          type="primary"
          block
          className="sheet-submit-btn"
          loading={loading}
          onClick={submitFormId ? undefined : onSubmit}
          htmlType={submitFormId ? "submit" : "button"}
          form={submitFormId}
        >
          {submitText}
        </Button>
      </div>
    </Drawer>
  );
}

export default MobileFormSheetLayout;
