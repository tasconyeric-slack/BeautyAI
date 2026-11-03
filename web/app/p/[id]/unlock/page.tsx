"use client";

import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Card, Page, PageHeader } from "@/components/passport/ui";
import { EntitlementTable } from "@/components/report/full-report";
import { Button } from "@/components/ui/button";
import { ApiError, api, backendFor, type Health } from "@/lib/api";
import { paywall } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import s from "@/components/journey/journey.module.css";

/** Single purchase (D27). PAYMENT_PROVIDER=fake settles at once; invite codes unlock without payment. */
export default function UnlockPage() {
  const { id, data, unlock, busy } = usePassport();
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [health, setHealth] = React.useState<Health | null>(null);
  React.useEffect(() => { api.track("paywall_view", { passport_id: id }); }, [id]);
  React.useEffect(() => { backendFor(id).health().then(setHealth, () => setHealth(null)); }, [id]);
  const payMode = health?.payment_provider ?? "unknown";
  const paid = data?.entitlement.paid;
  React.useEffect(() => {
    if (paid && !data?.passport && data?.status !== "analysis_failed" && data?.status !== "qc_failed" && data?.status !== "deleted") {
      router.replace(`/p/${id}/report`);
    }
  }, [paid, data?.passport, data?.status, id, router]);
  const go = async (invite?: string) => {
    setErr(null);
    api.track("checkout_start", { passport_id: id });
    try {
      await unlock(invite);
    } catch (e) {
      setErr(e instanceof ApiError ? (e.body.code === "bad_invite" ? paywall.invitationInvalid : e.body.detail) : paywall.failed);
    }
  };
  return (
    <div className={s.surface}><Page wide><div className={s.unlock}>
      <PageHeader kicker="完整护照" title={paid ? paywall.unlocked : paywall.title} />
      <div className={s.unlockGrid}>
      <div className={s.unlockDetails}>
      <Card className={s.unlockBenefits}>
        <ul className="space-y-2 text-[14px] leading-7">
          {paywall.bullets.map((b) => <li key={b} className="flex gap-2"><Check className="mt-1.5 size-4 shrink-0 text-accent" />{b}</li>)}
        </ul>
        <p className="mt-4 text-[12px] leading-5 text-muted" data-testid="free-scope">{paywall.freeScope}</p>
      </Card>
      <EntitlementTable className="mt-4" />
      </div>
      <aside className={s.unlockAction} aria-label={paywall.onUnlock}>
      <p className={s.unlockStatus}>{paid ? paywall.fullStatus : paywall.freeStatus}</p>
      {paid ? (
        <div className={s.unlockLinks}>
          {!data?.passport && <p role="status" className="text-[13px] leading-6">{data?.status === "analysis_failed" ? "完整 AI 分析暂未完成，请点击下方重试。" : "付款已确认，正在生成完整个性化报告。完成前不会开放 Studio 与 PDF。"}</p>}
          {!data?.passport && data?.status === "analysis_failed" && <Button type="button" variant="outline" disabled={busy} onClick={() => go()}>{busy ? "重试中…" : "重试生成完整报告"}</Button>}
          <Link href={`/p/${id}/report`} className="rounded-full bg-accent px-5 py-2.5 text-[14px] text-[var(--ap-on-primary)]">{data?.passport ? paywall.readReport : "查看分析进度"}</Link>
          {data?.passport && <Link href={`/p/${id}/studio`} className="rounded-full border border-rule-strong px-5 py-2.5 text-[14px]">去 Studio 生成发型试看</Link>}
        </div>
      ) : (
        <>
          {payMode === "unavailable" ? (
            <p className="mt-6 bg-paper-sunk p-4 text-[14px] leading-7">{paywall.paymentUnavailable}</p>
          ) : (
            <>
              <Button variant="accent" size="lg" className="mt-6 w-full" disabled={busy || !data || payMode === "unknown"} onClick={() => go()}>
                {busy ? <Loader2 className="animate-spin" /> : null}¥{data?.entitlement.price_cny ?? 139} {paywall.priceSuffix}
              </Button>
              <p className="mt-2 text-center text-[12px] text-muted">
                {paywall.noSubscription}{payMode === "fake" ? "（演示环境：模拟支付，不会扣款）" : ""}
              </p>
              {payMode === "unknown" && <p role="status" className="mt-3 text-[13px] text-muted">{paywall.paymentChecking}</p>}
            </>
          )}
          <p className="mt-4 text-center text-[13px]">
            <Link href="/report/sample" className="text-accent underline-offset-4 hover:underline" data-testid="paywall-sample-report">{paywall.sampleReport} →</Link>
          </p>
          <form className={s.unlockInvite} onSubmit={(e) => { e.preventDefault(); if (code.trim()) go(code.trim()); }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={paywall.invitationPlaceholder} aria-label={paywall.invitation}
              className="min-w-0 rounded-full border border-rule-strong bg-paper-raised px-4 text-[14px]" />
            <Button type="submit" variant="outline" disabled={busy || !code.trim()}>{paywall.invitation}</Button>
          </form>
          {busy && <p role="status" className="mt-3 text-[13px] text-muted">{paywall.pending}</p>}
          {err && <p role="alert" className={s.unlockError}>{err}</p>}
        </>
      )}
      </aside>
      </div>
    </div></Page></div>
  );
}
