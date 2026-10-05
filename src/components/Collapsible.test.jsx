import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import Collapsible from "./Collapsible";

// jsdom has no Element.prototype.animate; install a controllable fake.
const installFakeAnimate = () => {
  const animations = [];
  Element.prototype.animate = vi.fn(function animate(keyframes, options) {
    const animation = {
      keyframes,
      options,
      onfinish: null,
      cancel: vi.fn(),
      finish() {
        this.onfinish?.();
      },
    };
    animations.push(animation);
    return animation;
  });
  return animations;
};

describe("Collapsible", () => {
  afterEach(() => {
    delete Element.prototype.animate;
  });

  it("renders its content only while open", () => {
    const { rerender } = render(
      <Collapsible open={false}>
        <p>row</p>
      </Collapsible>,
    );
    expect(screen.queryByText("row")).not.toBeInTheDocument();

    rerender(
      <Collapsible open>
        <p>row</p>
      </Collapsible>,
    );
    expect(screen.getByText("row")).toBeInTheDocument();

    rerender(
      <Collapsible open={false}>
        <p>row</p>
      </Collapsible>,
    );
    expect(screen.queryByText("row")).not.toBeInTheDocument();
  });

  it("does not animate on first render", () => {
    const animations = installFakeAnimate();
    render(
      <Collapsible open>
        <p>row</p>
      </Collapsible>,
    );
    expect(animations).toHaveLength(0);
  });

  it("animates the height open", () => {
    const animations = installFakeAnimate();
    const { rerender } = render(
      <Collapsible open={false}>
        <p>row</p>
      </Collapsible>,
    );
    rerender(
      <Collapsible open>
        <p>row</p>
      </Collapsible>,
    );

    expect(screen.getByText("row")).toBeInTheDocument();
    expect(animations).toHaveLength(1);
    expect(animations[0].keyframes[0]).toMatchObject({ height: "0px" });
  });

  it("keeps closing content mounted and inert until the animation ends", () => {
    const animations = installFakeAnimate();
    const { rerender } = render(
      <Collapsible open>
        <p>row</p>
      </Collapsible>,
    );
    rerender(
      <Collapsible open={false}>
        <p>row</p>
      </Collapsible>,
    );

    const row = screen.getByText("row");
    expect(row.closest(".collapsible")).toHaveAttribute("inert");
    expect(animations.at(-1).keyframes.at(-1)).toMatchObject({ height: "0px" });
    // Without a forwards fill the body snaps back to full height for a frame
    // between the animation ending and React unmounting it.
    expect(animations.at(-1).options).toMatchObject({ fill: "forwards" });

    act(() => animations.at(-1).finish());
    expect(screen.queryByText("row")).not.toBeInTheDocument();
  });

  it("skips the animation when the user prefers reduced motion", () => {
    const animations = installFakeAnimate();
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const { rerender } = render(
      <Collapsible open>
        <p>row</p>
      </Collapsible>,
    );
    rerender(
      <Collapsible open={false}>
        <p>row</p>
      </Collapsible>,
    );

    expect(animations).toHaveLength(0);
    expect(screen.queryByText("row")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
