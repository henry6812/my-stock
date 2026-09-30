import { registerSW } from "virtual:pwa-register";

// Bridges the service-worker "new version waiting" signal (fired outside
// React) to the UI, which asks the user before reloading so an open form is
// never lost to a silent auto-update.
let needRefresh = false;
const listeners = new Set();

const updateSW = registerSW({
  onNeedRefresh() {
    needRefresh = true;
    listeners.forEach((listener) => listener());
  },
  onOfflineReady() {
    console.log("App is ready for offline usage.");
  },
});

export const onPwaNeedRefresh = (listener) => {
  listeners.add(listener);
  if (needRefresh) {
    listener();
  }
  return () => listeners.delete(listener);
};

export const applyPwaUpdate = () => updateSW(true);
