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

// vite-plugin-pwa only reloads on its own "controlling" event, which doesn't
// fire when the new worker was found by a later update check (e.g. a long-open
// tab). Reload ourselves once the new worker takes control — or right away if
// it already has.
export const applyPwaUpdate = async () => {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration?.waiting) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => window.location.reload(),
    { once: true },
  );
  await updateSW(true);
};
