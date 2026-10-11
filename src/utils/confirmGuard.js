// Wraps a confirm-dialog opener so that while one dialog is open, further
// requests are ignored: a quick double tap on 賣出 or 移除 must not stack
// two dialogs for the same action. Returns whether a dialog was opened.
export const guardConfirm = (open) => {
  let pending = false;
  return (options) => {
    if (pending) return false;
    pending = true;
    const release = () => {
      pending = false;
    };
    open({
      ...options,
      onOk: async () => {
        try {
          return await options.onOk?.();
        } finally {
          release();
        }
      },
      onCancel: () => {
        release();
        options.onCancel?.();
      },
    });
    return true;
  };
};
