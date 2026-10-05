// Main tabs in their on-screen order; moving to a later tab slides content in
// from the right, moving to an earlier one slides it in from the left.
export const MAIN_TAB_ORDER = ["asset", "expense", "settings"];

export const getMainTabDirection = (fromTab, toTab) => {
  const fromIndex = MAIN_TAB_ORDER.indexOf(fromTab);
  const toIndex = MAIN_TAB_ORDER.indexOf(toTab);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return null;
  }
  return toIndex > fromIndex ? "forward" : "back";
};

// Runs `update` inside a View Transition when the browser supports it, tagging
// <html data-tab-direction> so App.css can pick the slide direction. Browsers
// without the API (or a hidden tab) just apply the update instantly.
export const runDirectionalTransition = (direction, update) => {
  const root = document.documentElement;
  if (
    !direction ||
    typeof document.startViewTransition !== "function" ||
    document.visibilityState === "hidden"
  ) {
    update();
    return;
  }

  root.dataset.tabDirection = direction;
  const transition = document.startViewTransition(update);
  transition.finished.finally(() => {
    // A newer transition may have retagged the root; only clear our own tag.
    if (root.dataset.tabDirection === direction) {
      delete root.dataset.tabDirection;
    }
  });
};
