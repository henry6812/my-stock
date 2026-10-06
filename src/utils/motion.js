// animejs tweens and rAF loops ignore the CSS prefers-reduced-motion rule, so
// JS-driven animation checks it here. matchMedia can be missing or throw.
export const prefersReducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};
