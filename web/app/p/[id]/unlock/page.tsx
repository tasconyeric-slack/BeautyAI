"use client";

import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Card, Page, PageHeader } from "@/components/passport/ui";
import { EntitlementTable } from "@/components/report/full-report";
import { Button } from "@/components/ui/button";
import { ApiError, api, backendFor, type Health } from "@/lib/api";
import { paywall } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";

/** Single purchase (D27). PAYMENT_PROVIDER=fake settles at once; invite codes unlock without payment. */
export default function UnlockPage() {
  const { id, data, unlock, busy } = usePassport();
  const [code, setCode] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [health, setHealth] = React.useState<Health | null>(null);
  React.useEffect(() => { api.track("paywall_view", { passport_id: id }); }, [id]);
  React.useEffect(() => { backendFor(id).health().then(setHealth, () => setHealth(null)); }, [id]);
  const payMode = health?.payment_provider ?? "unknown";
  const paid = data?.entitlement.paid;
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
    <Page>
      <PageHeader kicker="完整护照" title={paid ? paywall.unlocked : paywall.title} />
      <Card>
        <ul className="space-y-2 text-[14px] leading-7">
          {paywall.bullets.map((b) => <li key={b} className="flex gap-2"><Check className="mt-1.5 size-4 shrink-0 text-accent" />{b}</li>)}
        </ul>
        <p className="mt-4 text-[12px] leading-5 text-muted" data-testid="free-scope">{paywall.freeScope}</p>
      </Card>
      <EntitlementTable className="mt-4" />
      {paid ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/p/${id}/report`} className="inline-block rounded-full bg-accent px-5 py-2.5 text-[14px] text-[var(--ap-on-primary)]">{paywall.readReport}</Link>
          <Link href={`/p/${id}/studio`} className="inline-block rounded-full border border-rule-strong px-5 py-2.5 text-[14px]">去实验室生成发型试看</Link>
        </div>
      ) : (
        <>
          {payMode === "unavailable" ? (
            <p className="mt-6 rounded-[12px] bg-paper-sunk p-4 text-center text-[14px]">支付暂未开放，可以使用邀请码解锁。</p>
          ) : (
            <>
              <Button variant="accent" size="lg" className="mt-6 w-full" disabled={busy || !data || payMode === "unknown"} onClick={() => go()}>
                {busy ? <Loader2 className="animate-spin" /> : null}¥{data?.entitlement.price_cny ?? 39} {paywall.priceSuffix}
              </Button>
              <p className="mt-2 text-center text-[12px] text-muted">
                {paywall.noSubscription}{payMode === "fake" ? "（演示环境：模拟支付，不会扣款）" : ""}
              </p>
            </>
          )}
          <p className="mt-4 text-center text-[13px]">
            <Link href="/report/sample" className="text-accent underline-offset-4 hover:underline" data-testid="paywall-sample-report">{paywall.sampleReport} →</Link>
          </p>
          <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) go(code.trim()); }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={paywall.invitationPlaceholder} aria-label={paywall.invitation}
              className="h-10 flex-1 rounded-full border border-rule-strong bg-paper-raised px-4 text-[14px]" />
            <Button type="submit" variant="outline" disabled={busy || !code.trim()}>{paywall.invitation}</Button>
          </form>
          {err && <p className="mt-3 text-[13px] text-[#b4442f]">{err}</p>}
        </>
      )}
    </Page>
  );
}
