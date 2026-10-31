import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleReportResponse } from "@/lib/fixture/backend";
import { paywall } from "@/lib/copy/zh";
import UnlockPage from "./page";

const mocks = vi.hoisted(() => ({ health: vi.fn(), track: vi.fn() }));
let store = { id: "fx_unlock", data: sampleReportResponse(), busy: false, unlock: vi.fn() };
vi.mock("@/lib/state/passport-store", () => ({ usePassport: () => store }));
vi.mock("@/lib/api", async original => ({ ...await original<typeof import("@/lib/api")>(),
  backendFor: () => ({ health: mocks.health }), api: { track: mocks.track },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/p/fx_unlock/unlock" }));

beforeEach(() => {
  store = { id: "fx_unlock", data: structuredClone(sampleReportResponse()), busy: false, unlock: vi.fn().mockResolvedValue(undefined) };
  store.data.entitlement.paid = false;
  store.data.entitlement.price_cny = 139;
  mocks.health.mockResolvedValue({ payment_provider: "fake" });
});

describe("ENG-05 entitlement presentation", () => {
  it("shows server pricing, free scope and fake-payment disclosure before checkout", async () => {
    render(<UnlockPage />);
    const buy = await screen.findByRole("button", { name: /¥139/ });
    await waitFor(() => expect(buy.hasAttribute("disabled")).toBe(false));
    expect(screen.getByTestId("free-scope").textContent).toBe(paywall.freeScope);
    expect(screen.getByText(/模拟支付，不会扣款/)).toBeTruthy();
    fireEvent.click(buy);
    await waitFor(() => expect(store.unlock).toHaveBeenCalledWith(undefined));
  });

  it("announces pending confirmation and disables repeated checkout", async () => {
    store.busy = true;
    render(<UnlockPage />);
    expect(await screen.findByRole("status")).toHaveProperty("textContent", paywall.pending);
    expect(screen.getByRole("button", { name: /¥139/ }).hasAttribute("disabled")).toBe(true);
  });

  it("shows payment unavailability while keeping the existing invite action", async () => {
    mocks.health.mockResolvedValue({ payment_provider: "unavailable" });
    render(<UnlockPage />);
    await screen.findByText("支付暂未开放，可以使用邀请码解锁。");
    expect(screen.queryByRole("button", { name: /¥139/ })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: paywall.invitation }), { target: { value: "  TEST  " } });
    fireEvent.click(screen.getByRole("button", { name: paywall.invitation }));
    await waitFor(() => expect(store.unlock).toHaveBeenCalledWith("TEST"));
  });

  it("announces a failed unlock and leaves checkout retryable", async () => {
    store.unlock.mockRejectedValue(new Error("offline"));
    render(<UnlockPage />);
    const buy = await screen.findByRole("button", { name: /¥139/ });
    await waitFor(() => expect(buy.hasAttribute("disabled")).toBe(false));
    fireEvent.click(buy);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", paywall.failed);
    expect(buy.hasAttribute("disabled")).toBe(false);
  });

  it("uses confirmed paid status for report/Studio links and removes checkout", async () => {
    store.data.entitlement.paid = true;
    render(<UnlockPage />);
    expect(screen.getByRole("heading", { name: paywall.unlocked, level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: paywall.readReport }).getAttribute("href")).toBe("/p/fx_unlock/report");
    expect(screen.queryByRole("button", { name: /¥/ })).toBeNull();
    await waitFor(() => expect(mocks.health).toHaveBeenCalled());
  });
});
