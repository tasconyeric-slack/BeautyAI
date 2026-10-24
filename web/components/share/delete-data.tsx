"use client";

/** "删除我的照片与报告" on the share page: confirm step, then usePassport().remove(); shows the deletion time. */
import { Trash2 } from "lucide-react";
import * as React from "react";
import { Section } from "@/components/passport/ui";
import { Button } from "@/components/ui/button";
import { settings } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN", { hour12: false });
};

export function DeleteData() {
  const { data, remove } = usePassport();
  const [step, setStep] = React.useState<"idle" | "confirm" | "deleting" | "failed">("idle");
  const [deletedAt, setDeletedAt] = React.useState<string | null>(null);
  const rawExpiry = data?.media.expired ? null : data?.media.expires_at ?? null;
  // Only show a real, future expiry (demo passports carry a placeholder timestamp).
  const expires = rawExpiry && Date.parse(rawExpiry) > Date.now() ? rawExpiry : null;
  const photoGone = Boolean(data?.media.expired || !data?.media.front);

  const doDelete = async () => {
    setStep("deleting");
    try {
      setDeletedAt(await remove());
    } catch {
      setStep("failed");
    }
  };

  return (
    <Section title={settings.title} kicker="数据控制">
      <div className="rounded-[14px] border border-rule bg-paper-raised p-4 text-[13px] leading-6">
        {deletedAt ? (
          <div role="status">
            <p className="font-medium">{settings.deleted}</p>
            <p className="text-muted">{settings.deletedAt}：<time dateTime={deletedAt} className="tnum">{fmt(deletedAt)}</time></p>
          </div>
        ) : (
          <>
            <p className="text-ink-soft">
              {photoGone ? "照片已按承诺删除。"
                : expires ? <>正脸照片与试看图将在 <time dateTime={expires} className="tnum">{fmt(expires)}</time> 自动删除。</>
                  : "正脸照片与试看图最多保留 24 小时，到期自动删除。"}
              导出的卡片保存在你的设备上；只读链接不含照片。
            </p>
            {step === "idle" ? (
              <Button variant="outline" className="mt-3 w-full border-[#b4442f] text-[#b4442f]" onClick={() => setStep("confirm")}>
                <Trash2 />{settings.deleteAction}
              </Button>
            ) : (
              <div className="mt-3 rounded-[12px] bg-paper-sunk p-3.5" role="alertdialog" aria-label={settings.deleteAction}>
                <p>{settings.deleteConfirm}</p>
                <div className="mt-3 flex gap-2">
                  <Button className="flex-1 bg-[#b4442f] text-white hover:bg-[#9c3a28]" disabled={step === "deleting"} onClick={doDelete}>
                    {step === "deleting" ? settings.deleting : settings.deleteConfirmAction}
                  </Button>
                  <Button variant="outline" className="flex-1" disabled={step === "deleting"} onClick={() => setStep("idle")}>{settings.deleteCancel}</Button>
                </div>
                {step === "failed" && <p className="mt-2 text-[12px] text-[#b4442f]">{settings.deleteFailed}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
