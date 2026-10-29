import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./copy-button";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function clipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
}

describe("copy feedback lifetime", () => {
  it("cancels delayed feedback when leaving the report", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard(writeText);
    const { unmount } = render(<CopyButton text="当前剪发话术" />);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(writeText).toHaveBeenCalledWith("当前剪发话术");
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start delayed feedback if clipboard permission resolves after leaving", async () => {
    let finish!: () => void;
    clipboard(() => new Promise<void>(resolve => { finish = resolve; }));
    const { unmount } = render(<CopyButton text="当前剪发话术" />);
    fireEvent.click(screen.getByRole("button"));
    unmount();
    await act(async () => { finish(); });
    expect(vi.getTimerCount()).toBe(0);
  });
});
