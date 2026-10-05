import { afterEach, describe, expect, it, vi } from "vitest";
import { getMainTabDirection, runDirectionalTransition } from "./viewTransition";

describe("getMainTabDirection", () => {
  it("goes forward to a later tab and back to an earlier one", () => {
    expect(getMainTabDirection("asset", "expense")).toBe("forward");
    expect(getMainTabDirection("asset", "settings")).toBe("forward");
    expect(getMainTabDirection("settings", "expense")).toBe("back");
  });

  it("returns null for the same tab or an unknown tab", () => {
    expect(getMainTabDirection("asset", "asset")).toBeNull();
    expect(getMainTabDirection("asset", "nope")).toBeNull();
  });
});

describe("runDirectionalTransition", () => {
  afterEach(() => {
    delete document.startViewTransition;
    delete document.documentElement.dataset.tabDirection;
  });

  it("applies the update directly when the API is missing", () => {
    const update = vi.fn();
    runDirectionalTransition("forward", update);
    expect(update).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.tabDirection).toBeUndefined();
  });

  it("tags the direction during the transition and clears it afterwards", async () => {
    let finish;
    const finished = new Promise((resolve) => {
      finish = resolve;
    });
    document.startViewTransition = vi.fn((update) => {
      update();
      return { finished };
    });
    const update = vi.fn();

    runDirectionalTransition("back", update);
    expect(update).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.tabDirection).toBe("back");

    finish();
    await finished;
    await Promise.resolve();
    expect(document.documentElement.dataset.tabDirection).toBeUndefined();
  });
});
