import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HoldButton, useHold } from "../ds/HoldButton";

function CompareControl() {
  const hold = useHold();
  return <HoldButton {...hold} />;
}

afterEach(() => vi.restoreAllMocks());

describe("shared original comparison", () => {
  it("ends a keyboard hold when the page is hidden, and does not resume on return", () => {
    render(<CompareControl />);
    const button = screen.getByRole("button", { name: "按住看原图" });
    fireEvent.keyDown(button, { key: " " });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(button.getAttribute("aria-pressed")).toBe("false");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.keyDown(button, { key: "Enter" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyUp(button, { key: "Enter" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps a hold during a visible-page event and releases on Escape", () => {
    render(<CompareControl />);
    const button = screen.getByRole("button");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent(document, new Event("visibilitychange"));
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(button, { key: "Escape" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
});
