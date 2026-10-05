import { useState } from "react";
import { Tooltip } from "antd";

const canHover = () => {
  try {
    return window.matchMedia("(hover: hover)").matches;
  } catch {
    return true;
  }
};

// A hover-only Tooltip for wrapping tappable controls. On touch devices iOS
// Safari sends mouseenter on the first tap; if that reveals new content (the
// tooltip pops in), it treats the tap as a hover and swallows the click, so
// the button needs a second tap. Touch devices therefore get no tooltip.
export default function HoverTooltip({ children, ...tooltipProps }) {
  const [isHoverCapable] = useState(canHover);
  if (!isHoverCapable) {
    return children;
  }
  return <Tooltip {...tooltipProps}>{children}</Tooltip>;
}
