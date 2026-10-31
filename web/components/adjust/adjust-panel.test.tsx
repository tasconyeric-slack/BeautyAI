import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adjustments } from "@/lib/copy/zh";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { AdjustPanel } from "./adjust-panel";

const adjust = vi.hoisted(() => vi.fn());
const passport = sampleReportResponse("female").passport;
vi.mock("@/lib/state/passport-store", () => ({
  usePassport: () => ({ passport, adjust, busy: false }),
}));
beforeEach(() => { adjust.mockReset().mockResolvedValue(undefined); });

describe("adjustment sheet", () => {
  it("contains focus, closes on Escape and discards unapplied choices on reopening", async () => {
    render(<AdjustPanel />);
    const opener = screen.getByRole("button", { name: "调整" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: adjustments.title });
    const close = within(dialog).getByRole("button", { name: "关闭" });
    const apply = within(dialog).getByRole("button", { name: adjustments.apply });
    await waitFor(() => expect(document.activeElement).toBe(close));
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(apply);
    fireEvent.keyDown(apply, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    const currentMinutes = sampleReportResponse("female").passport!.user_context.constraints.daily_minutes;
    const otherMinutes = currentMinutes === 5 ? 30 : 5;
    fireEvent.click(within(dialog).getByRole("button", { name: `${otherMinutes} 分钟` }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(adjust).not.toHaveBeenCalled();
    fireEvent.click(opener);
    expect(screen.getByRole("button", { name: `${currentMinutes} 分钟` }).getAttribute("aria-pressed")).toBe("true");
  });

  it("applies the selected preferences once and closes", async () => {
    render(<AdjustPanel />);
    const opener = screen.getByRole("button", { name: "调整" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "30 分钟" }));
    fireEvent.click(screen.getByRole("button", { name: adjustments.apply }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(adjust).toHaveBeenCalledTimes(1);
    expect(adjust.mock.calls[0][0].constraints.daily_minutes).toBe(30);
    expect(document.activeElement).toBe(opener);
  });
});
