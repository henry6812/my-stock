import { useCallback, useEffect, useRef, useState } from "react";

// Mobile list row whose actions (編輯 / 刪除 …) sit behind the content and are
// revealed by swiping left. Only one row is open at a time; tapping anywhere
// closes it. A plain tap on a closed row passes through to its content.

const ACTION_WIDTH = 72;
const DIRECTION_LOCK_PX = 8;

// The close() of the row that is currently open, so opening another row (in
// any list) closes it first.
let closeOpenRow = null;

function SwipeActions({ actions = [], disabled = false, className = "", children }) {
  const enabled = !disabled && actions.length > 0;
  const maxReveal = actions.length * ACTION_WIDTH;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  // Set when a gesture ended as a swipe, so the click that follows it isn't
  // taken as a tap on the content.
  const swallowClickRef = useRef(false);
  const isOpen = !dragging && offset !== 0;

  const close = useCallback(() => setOffset(0), []);

  useEffect(() => {
    if (!isOpen) return undefined;
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      if (closeOpenRow === close) closeOpenRow = null;
    };
  }, [close, isOpen]);

  const handlePointerDown = (event) => {
    // A new gesture: a touch swipe isn't always followed by a click, so the
    // flag from the last swipe must not swallow this tap.
    swallowClickRef.current = false;
    if (!enabled) return;
    gestureRef.current = {
      x: event.clientX,
      y: event.clientY,
      start: offset,
      mode: null,
    };
  };

  const handlePointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.mode) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) {
        return;
      }
      gesture.mode = Math.abs(dx) > Math.abs(dy) ? "swipe" : "scroll";
      if (gesture.mode === "swipe") {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
      }
    }
    if (gesture.mode !== "swipe") return;
    setOffset(Math.max(-maxReveal, Math.min(0, gesture.start + dx)));
  };

  const handlePointerEnd = () => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture?.mode !== "swipe") return;
    swallowClickRef.current = true;
    setDragging(false);
    setOffset((current) => (current < -maxReveal / 2 ? -maxReveal : 0));
  };

  const handleClickCapture = (event) => {
    if (swallowClickRef.current) {
      swallowClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (offset !== 0) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div
      ref={rootRef}
      className={`swipe-actions ${className}`.trim()}
      data-open={isOpen ? "true" : "false"}
    >
      {enabled && (
        <div
          className="swipe-actions-buttons"
          // Hidden while fully closed: with fractional row heights their
          // colour otherwise bleeds along the row's top / bottom edge.
          style={{ width: maxReveal, visibility: offset === 0 ? "hidden" : "visible" }}
        >
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={`swipe-action${action.danger ? " swipe-action--danger" : ""}${
                action.tone ? ` swipe-action--${action.tone}` : ""
              }`}
              style={{ width: ACTION_WIDTH }}
              aria-label={action.label}
              disabled={action.disabled}
              tabIndex={isOpen ? 0 : -1}
              onClick={() => {
                close();
                action.onClick?.();
              }}
            >
              {action.icon}
              <span className="swipe-action-text">
                {action.text ?? action.label}
              </span>
            </button>
          ))}
        </div>
      )}
      <div
        className="swipe-actions-content"
        style={{
          transform: offset ? `translateX(${offset}px)` : undefined,
          transition: dragging ? "none" : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>
    </div>
  );
}

export default SwipeActions;
