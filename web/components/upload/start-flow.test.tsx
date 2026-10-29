import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { httpBackend, type CreateInput, type PhotoQC } from "@/lib/api";
import { StartFlow } from "./start-flow";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("topic=face"),
}));

const verdict = (role: string, status: PhotoQC["status"], issues: string[] = [], messages: string[] = []): PhotoQC =>
  ({ photo_id: role, status, issues, messages, face_count: 1, yaw: null, mode: "real" });

afterEach(() => vi.restoreAllMocks());

describe("StartFlow (V3B multi-photo upload)", () => {
  it("front is required, a rejected optional side photo shows its own guidance and is not sent", async () => {
    vi.spyOn(httpBackend, "event").mockResolvedValue();
    const qc = vi.spyOn(httpBackend, "qc").mockImplementation(async (role) =>
      role === "profile90" ? verdict(role, "reject", ["wrong_angle_for_role"], ["这张更像 45° 半侧面。侧脸照需要接近 90°。"])
        : verdict(role, "ok"));
    let sent: CreateInput | null = null;
    vi.spyOn(httpBackend, "create").mockImplementation(async (input) => { sent = input; return { id: "ap_0123456789ab" }; });
    render(<StartFlow />);
    for (const cb of screen.getAllByRole("checkbox")) fireEvent.click(cb);
    fireEvent.click(screen.getByRole("button", { name: /继续|同意/ }));

    // two prominent role slots; the more section is collapsed
    expect(document.querySelector('[data-slot="front"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="profile90"]')).toBeTruthy();
    expect(screen.getByText("仅上传正脸照也可以开始，其他照片均为选填。")).toBeTruthy();
    expect(document.querySelector('[data-slot="smile"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /更多补充照片/ }));
    expect(document.querySelector('[data-slot="smile"]')).toBeTruthy();

    const file = (n: string) => new File([new Uint8Array([0xff, 0xd8, 0xff])], n, { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("选择照片 · 正脸照"), { target: { files: [file("f.jpg")] } });
      fireEvent.change(screen.getByLabelText("选择照片 · 侧脸照"), { target: { files: [file("s.jpg")] } });
    });
    await waitFor(() => expect(document.querySelector('[data-slot="profile90"] [data-qc="reject"]')).toBeTruthy(), { timeout: 3000 });
    expect(qc).toHaveBeenCalledWith("front", expect.anything());
    expect(qc).toHaveBeenCalledWith("profile90", expect.anything());
    expect(document.querySelector('[data-slot="profile90"]')!.textContent).toContain("45° 半侧面");
    expect(document.querySelector('[data-slot="profile90"]')!.textContent).toContain("不影响用正脸照开始");

    fireEvent.click(screen.getByTestId("eyewear"));
    expect(document.querySelector('[data-slot="glasses"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="noglasses"]')).toBeNull();
    expect(screen.getByRole("button", { name: "以受限模式开始" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /女性化/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /开始/ })); });
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.front).toBeInstanceOf(Blob);
    expect(sent!.extra?.profile90).toBeUndefined();                             // rejected optional photo not sent
    expect(sent!.photoMeta?.front?.eyewear).toBe(true);
    // navigation follows create() and the thumbnail read (FileReader), so it lands a task or two later
    await waitFor(() => expect(push).toHaveBeenCalledWith("/p/ap_0123456789ab/report"));
  });
});

it("requires replacing a rejected front before creating a job", async () => {
  vi.spyOn(httpBackend, "event").mockResolvedValue();
  vi.spyOn(httpBackend, "qc").mockResolvedValue(verdict("front", "reject", ["blurry"], ["照片模糊，请重拍。"]));
  const create = vi.spyOn(httpBackend, "create");
  render(<StartFlow />);
  for (const cb of screen.getAllByRole("checkbox")) fireEvent.click(cb);
  fireEvent.click(screen.getByRole("button", { name: /继续|同意/ }));
  await act(async () => fireEvent.change(screen.getByLabelText("选择照片 · 正脸照"), {
    target: { files: [new File(["synthetic"], "front.jpg", { type: "image/jpeg" })] },
  }));
  await waitFor(() => expect(document.querySelector('[data-slot="front"] [data-qc="reject"]')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /女性化/ }));
  const submit = screen.getByRole("button", { name: "请更换正脸照片" }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.click(submit);
  expect(create).not.toHaveBeenCalled();
});


it("submits a glasses-free front and optional daily reference independently", async () => {
  vi.spyOn(httpBackend, "event").mockResolvedValue();
  vi.spyOn(httpBackend, "qc").mockImplementation(async (role) => verdict(role, "ok"));
  const create = vi.spyOn(httpBackend, "create").mockResolvedValue({ id: "ap_abcdef123456" });
  render(<StartFlow />);
  for (const cb of screen.getAllByRole("checkbox")) fireEvent.click(cb);
  fireEvent.click(screen.getByRole("button", { name: /继续|同意/ }));
  expect(screen.getByText(/头发保持日常自然状态/)).toBeTruthy();
  const file = new File(["safe synthetic"], "test.jpg", { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(screen.getByLabelText("选择照片 · 正脸照"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("选择照片 · 日常眼镜参考照"), { target: { files: [file] } });
  });
  await waitFor(() => expect(document.querySelector('[data-slot="glasses"] [data-qc="ok"]')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /女性化/ }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /开始/ })); });
  await waitFor(() => expect(create).toHaveBeenCalled());
  expect(create.mock.calls[0][0].extra?.glasses).toBeInstanceOf(Blob);
  expect(create.mock.calls[0][0].photoMeta?.front?.eyewear).toBe(false);
});
