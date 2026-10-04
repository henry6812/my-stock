import { useEffect } from "react";

// Keeps the page behind a mobile sheet from scrolling. iOS Safari ignores
// overflow:hidden on <body> for touch scrolling (antd's own lock), so the body
// is pinned with position:fixed at the current offset and the scroll position
// is restored on release. Sheets can stack (an edit form over the budget
// detail): the first lock pins, the last release restores.

const LOCKED_PROPS = ["position", "top", "left", "right", "width", "overflow"];

let lockCount = 0;
let saved = null;

const lock = () => {
  lockCount += 1;
  if (lockCount > 1) return;
  const { body } = document;
  saved = {
    scrollY: window.scrollY,
    style: Object.fromEntries(LOCKED_PROPS.map((prop) => [prop, body.style[prop]])),
  };
  Object.assign(body.style, {
    position: "fixed",
    top: `-${saved.scrollY}px`,
    left: "0",
    right: "0",
    width: "100%",
    overflow: "hidden",
  });
};

const unlock = () => {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0 || !saved) return;
  Object.assign(document.body.style, saved.style);
  window.scrollTo(0, saved.scrollY);
  saved = null;
};

export default function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    lock();
    return unlock;
  }, [active]);
}
