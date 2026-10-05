import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "antd";
import HoverTooltip from "./HoverTooltip";

const mockHoverCapability = (canHover) => {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query === "(hover: hover)" ? canHover : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

const hoverAndWait = async (element) => {
  vi.useFakeTimers();
  fireEvent.mouseEnter(element);
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  vi.useRealTimers();
};

describe("HoverTooltip", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows the tooltip on hover on devices that can hover", async () => {
    mockHoverCapability(true);
    render(
      <HoverTooltip title="新增預算">
        <Button aria-label="add">+</Button>
      </HoverTooltip>,
    );

    await hoverAndWait(screen.getByRole("button", { name: "add" }));
    expect(screen.getByText("新增預算")).toBeInTheDocument();
  });

  // iOS treats a tap whose mouseenter reveals new content as a hover only and
  // swallows the click, so touch devices must get no hover tooltip at all.
  it("adds no hover content on touch devices, so one tap is one click", async () => {
    mockHoverCapability(false);
    const onClick = vi.fn();
    render(
      <HoverTooltip title="新增預算">
        <Button aria-label="add" onClick={onClick}>
          +
        </Button>
      </HoverTooltip>,
    );
    const button = screen.getByRole("button", { name: "add" });

    await hoverAndWait(button);
    expect(screen.queryByText("新增預算")).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
