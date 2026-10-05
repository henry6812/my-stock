import { useLayoutEffect, useRef, useState } from "react";

// Folding body for the mobile lists (holding / cash groups, expense days).
// Opening mounts the content and grows it from 0 to its natural height;
// closing shrinks it to 0 and only then unmounts it, keeping it inert in the
// meantime. Without the Web Animations API, or with reduced motion, it just
// shows / hides.

const DURATION_MS = 220;
const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const canAnimate = () => {
  if (typeof Element === "undefined" || typeof Element.prototype.animate !== "function") {
    return false;
  }
  try {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
};

function Collapsible({ open, children }) {
  const [rendered, setRendered] = useState(open);
  const bodyRef = useRef(null);
  const lastOpenRef = useRef(open);
  // Height the body had when an in-flight animation was interrupted, so the
  // reverse animation starts from there instead of jumping.
  const interruptedHeightRef = useRef(null);

  if (open && !rendered) {
    setRendered(true);
  }
  if (!open && rendered && !canAnimate()) {
    setRendered(false);
  }

  useLayoutEffect(() => {
    if (lastOpenRef.current === open) return undefined;
    lastOpenRef.current = open;
    const body = bodyRef.current;
    if (!body || !canAnimate()) return undefined;

    const fullHeight = `${body.scrollHeight}px`;
    const fromHeight =
      interruptedHeightRef.current ?? (open ? "0px" : fullHeight);
    interruptedHeightRef.current = null;
    const keyframes = open
      ? [
          { height: fromHeight, opacity: 0 },
          { height: fullHeight, opacity: 1 },
        ]
      : [
          { height: fromHeight, opacity: 1 },
          { height: "0px", opacity: 0 },
        ];

    body.style.overflow = "hidden";
    // Closing holds its last frame (height 0, clipped): unmounting waits for a
    // React render, and without the fill the body would snap back to full
    // height for a frame in between.
    const animation = body.animate(keyframes, {
      duration: DURATION_MS,
      easing: EASING,
      fill: open ? "none" : "forwards",
    });
    let settled = false;
    animation.onfinish = () => {
      settled = true;
      if (open) {
        body.style.overflow = "";
      } else {
        setRendered(false);
      }
    };

    return () => {
      if (settled) return;
      interruptedHeightRef.current = `${body.getBoundingClientRect().height}px`;
      animation.cancel();
      body.style.overflow = "";
    };
  }, [open]);

  if (!rendered) return null;
  return (
    <div
      ref={bodyRef}
      className="collapsible"
      inert={!open || undefined}
      aria-hidden={!open || undefined}
    >
      {children}
    </div>
  );
}

export default Collapsible;
