import { useEffect } from "react";

// Marks the sticky group headings inside `ref` that are currently stuck
// (data-stuck="true"), and gives each the distance from its group to the
// screen edges (--bleed-left / --bleed-right) so CSS can stretch it to the
// full screen width. A heading is stuck once it has slid down from the top
// of its own group (inside the group's top border, the divider between
// groups). Writes straight to the DOM: no re-render per scroll.

const HEADING_SELECTOR = ".expense-day-heading";

export const measureStuckHeadings = (container, viewportWidth) => {
  container.querySelectorAll(HEADING_SELECTOR).forEach((heading) => {
    const group = heading.parentElement;
    if (!group) return;
    const groupRect = group.getBoundingClientRect();
    const restingTop = groupRect.top + (group.clientTop || 0);
    const stuck = heading.getBoundingClientRect().top - restingTop > 0.5;
    if (stuck) {
      heading.dataset.stuck = "true";
      heading.style.setProperty("--bleed-left", `${Math.max(0, groupRect.left)}px`);
      heading.style.setProperty(
        "--bleed-right",
        `${Math.max(0, viewportWidth - groupRect.right)}px`,
      );
    } else if (heading.dataset.stuck) {
      delete heading.dataset.stuck;
      heading.style.removeProperty("--bleed-left");
      heading.style.removeProperty("--bleed-right");
    }
  });
};

export default function useStuckHeadings(ref, enabled = true) {
  useEffect(() => {
    const container = ref.current;
    if (!enabled || !container) return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      measureStuckHeadings(container, document.documentElement.clientWidth);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref, enabled]);
}
