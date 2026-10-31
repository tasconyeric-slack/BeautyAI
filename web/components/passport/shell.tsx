"use client";

import { ArrowRight, IdCard, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { backendFor } from "@/lib/api";
import { privacy, settings } from "@/lib/copy/zh";
import { PassportProvider, usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";
import { currentStep, PRODUCT_AREAS, journeyHref, nextStep } from "./journey";
import { ErrorState } from "./states";
import { Sheet } from "./sheet";

export function PassportShell({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <PassportProvider id={id}>
      <Inner>{children}</Inner>
    </PassportProvider>
  );
}

function Inner({ children }: { children: React.ReactNode }) {
  const { deletedAt, error, data, refresh } = usePassport();
  const [sheet, setSheet] = React.useState(false);
  const closeSheet = React.useCallback(() => setSheet(false), []);
  if (deletedAt) return <Deleted at={deletedAt} />;
  // A 404 is not proof of intentional deletion: ephemeral storage may have
  // disappeared after a backend restart. Preserve any already-loaded report.
  // Nothing loaded and the request keeps failing: say so and offer a retry, instead of a page that stays blank.
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  return (
    <>
      {error?.status === 404 && data && (
        <p role="alert" className="mx-auto max-w-5xl px-4 py-3 text-[13px] text-[#A33B28] sm:px-6">
          服务端暂时找不到这份报告。下方保留当前页面已经加载的内容；请尽快导出文字报告，刷新后可能无法恢复。
          <button type="button" onClick={() => void refresh()} className="ml-2 underline underline-offset-2">重试连接</button>
        </p>
      )}
      <DemoBanner />
      <JourneyBar />
      {children}
      <JourneyNext />
      <div className="no-print mx-auto mt-10 flex max-w-5xl justify-center px-4">
        <button type="button" onClick={() => setSheet(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rule px-4 py-2 text-[13px] text-muted hover:text-ink">
          <Settings className="size-4" />{settings.title} · 删除数据
        </button>
      </div>
      <ChangeNote />
      <BottomNav />
      {sheet && <SettingsSheet onClose={closeSheet} />}
    </>
  );
}

/** Desktop and mobile share the same two product destinations. */
export function JourneyBar() {
  const { id, data } = usePassport();
  const path = usePathname() ?? "";
  const here = PRODUCT_AREAS.find(a => a.match.test(path))?.key;
  if (!here || data?.status !== "full_ready") return null;
  return (
    <nav aria-label="浏览路径" data-testid="journey-bar" data-journey-bar className="no-print sticky top-[49px] z-30 hidden h-11 border-b border-rule bg-paper/95 backdrop-blur md:block">
      <ol className="mx-auto flex h-full max-w-5xl items-center gap-0.5 px-6">
        {PRODUCT_AREAS.map((s) => {
          const active = s.key === here;
          return (
            <li key={s.key} className="flex items-center gap-0.5">
              <Link href={`/p/${id}${s.sub}`} aria-current={active ? "page" : undefined} title={s.blurb}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors",
                  active ? "bg-accent-soft font-medium text-accent" : "text-ink-soft hover:bg-paper-sunk hover:text-ink")}>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Below evidence, advice and plan: the next step and why it follows. The overview and the report write their own. */
export function JourneyNext() {
  const { id, data } = usePassport();
  const next = nextStep(currentStep(usePathname()));
  if (!next || data?.status !== "full_ready") return null;
  return (
    <section aria-labelledby="journey-next" data-testid="journey-next" className="no-print mx-auto mt-10 max-w-5xl px-4 sm:px-6">
      <div className="flex flex-col gap-3 rounded-[16px] border border-rule bg-paper-raised p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="journey-next" className="text-[11px] tracking-[0.18em] text-muted">下一步</h2>
          <p className="mt-1 text-[14px] leading-6 text-ink-soft">{next.lead}</p>
        </div>
        <Link href={journeyHref(id, next.step.key)}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[14px] font-medium text-[var(--ap-on-primary)] hover:opacity-90">
          {next.step.label}<ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

/** Never present mock output as a genuine analysis: fixture data, or a live API answering with mock providers. */
export function isMockPassport(kind: "http" | "fixture", passport: { meta: { analysis_model: string }; previews: { image_model: string | null }[] } | null) {
  if (kind === "fixture") return true;
  if (!passport) return false;
  return passport.meta.analysis_model.startsWith("fake") || passport.previews.some((p) => (p.image_model ?? "").startsWith("fake"));
}

function DemoBanner() {
  const { id, passport } = usePassport();
  const kind = backendFor(id).kind;
  if (!isMockPassport(kind, passport)) return null;
  return (
    <p role="note" className="bg-amber-soft px-4 py-1.5 text-center text-[12px] text-amber">
      {kind === "fixture" ? "演示档案：内容来自虚构样例，用来体验完整流程。" : "演示模式：分析与试看来自模拟服务，不是对你照片的真实分析。"}
    </p>
  );
}

function ChangeNote() {
  const { changeNote, busy } = usePassport();
  const [shown, setShown] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!changeNote) return;
    setShown(changeNote);
    const t = setTimeout(() => setShown(null), 4200);
    return () => clearTimeout(t);
  }, [changeNote]);
  if (!shown && !busy) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-0 bottom-[68px] z-40 mx-auto w-fit max-w-[92vw] rounded-full bg-ink px-4 py-2 text-[13px] text-paper shadow-lg ap-rise">
      {busy && !shown ? "正在调整建议顺序" : shown}
    </div>
  );
}

/** Shared desktop/mobile destinations; each detail route has exactly one parent. */
export const NAV_AREAS = PRODUCT_AREAS.map(area => ({ ...area, icon: area.key === "report" ? IdCard : Sparkles }));

export function BottomNav() {
  const { id } = usePassport();
  const path = usePathname() ?? "";
  const base = `/p/${id}`;
  return (
    <nav aria-label="护照导航" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-2">
        {NAV_AREAS.map(({ key, sub, label, icon: Icon, match }) => {
          const active = match.test(path);
          return (
            <li key={key}>
              <Link href={`${base}${sub}`} aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-accent" : "text-muted")}>
                <Icon className="size-5" strokeWidth={1.6} />{label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { id, remove } = usePassport();
  const [confirm, setConfirm] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "deleting" | "failed">("idle");
  const doDelete = async () => {
    setState("deleting");
    try {
      await remove();
    } catch {
      setState("failed");
    }
  };
  return (
    <Sheet open onClose={onClose} title={settings.title}>
        <ul className="space-y-2 text-[13px] leading-6 text-ink-soft">
          {privacy.facts.map((f) => <li key={f}>· {f}</li>)}
          <li>· {privacy.unsavedPassport}</li>
        </ul>
        <div className="mt-4 flex flex-col gap-2 text-[14px]">
          <Link href={`/p/${id}/more`} className="rounded-[10px] border border-rule px-4 py-3 hover:bg-paper-sunk" onClick={onClose}>
            {settings.changePresentation}与补充信息
          </Link>
          <Link href="/check" className="rounded-[10px] border border-rule px-4 py-3 hover:bg-paper-sunk" onClick={onClose}>穿搭检测（即将提供）</Link>
          <Link href="/about" className="rounded-[10px] border border-rule px-4 py-3 hover:bg-paper-sunk" onClick={onClose}>{settings.privacy}</Link>
        </div>
        <div className="mt-6 border-t border-rule pt-4">
          {!confirm ? (
            <Button variant="outline" className="w-full border-[#b4442f] text-[#b4442f]" onClick={() => setConfirm(true)}>
              {settings.deleteAction}
            </Button>
          ) : (
            <div className="rounded-[12px] bg-paper-sunk p-4">
              <p className="text-[13px] leading-6">{settings.deleteConfirm}</p>
              <div className="mt-3 flex gap-2">
                <Button className="flex-1 bg-[#b4442f] text-white hover:bg-[#9c3a28]" disabled={state === "deleting"} onClick={doDelete}>
                  {state === "deleting" ? settings.deleting : settings.deleteConfirmAction}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setConfirm(false)}>{settings.deleteCancel}</Button>
              </div>
              {state === "failed" && <p className="mt-2 text-[12px] text-[#b4442f]">{settings.deleteFailed}</p>}
            </div>
          )}
        </div>
    </Sheet>
  );
}

function Deleted({ at }: { at: string }) {
  const when = new Date(at);
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="font-serif text-[22px] font-semibold">{settings.deleted}</p>
      <p className="mt-3 text-[13px] text-muted">
        {settings.deletedAt}：<time dateTime={at} className="tnum">{Number.isNaN(when.getTime()) ? at : when.toLocaleString("zh-CN")}</time>
      </p>
      <p className="mt-2 text-[13px] text-muted">照片、试看图、面部标注数据、反馈与报告都已删除，分享链接已失效。</p>
      <Link href="/" className="mt-6 inline-block text-accent underline-offset-4 hover:underline">{settings.returnHome}</Link>
    </div>
  );
}
