"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { PaywallCard } from "@/components/ds";
import { api } from "@/lib/api";
import { paywall } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";
import styles from "./passport.module.css";

export function PageHeader({ kicker, title, sub, back = true }: { kicker?: string; title: string; sub?: string; back?: boolean }) {
  const { id } = usePassport();
  const path = usePathname() ?? "";
  // Report details return to their parent report; recommendation details retain their local index.
  const top = /\/(report|studio)$/.test(path);
  const toStudio = /\/compare$/.test(path);
  const toAdvice = /\/(hair|makeup|outfit|glasses)$/.test(path);
  return (
    <header className={styles.header}>
      {back && !top && (
        <Link href={toStudio ? `/p/${id}/studio` : toAdvice ? `/p/${id}/advice` : `/p/${id}/report`} className={styles.back}>
          <ArrowLeft className="size-3.5" /> {toStudio ? "返回 Studio" : toAdvice ? "返回报告建议" : "返回报告"}
        </Link>
      )}
      {kicker && <p className={styles.kicker}>{kicker}</p>}
      <h1 className="font-serif text-[26px] font-semibold leading-snug sm:text-[30px]">{title}</h1>
      {sub && <p className="mt-2 max-w-[34em] text-[14px] leading-7 text-ink-soft">{sub}</p>}
    </header>
  );
}

export function Section({ title, kicker, children, className, action }: {
  title?: string; kicker?: string; children: React.ReactNode; className?: string; action?: React.ReactNode;
}) {
  return (
    <section className={cn(styles.section, className)}>
      {(title || kicker) && (
        <div className={styles.sectionHeading}>
          <div>
            {kicker && <p className={styles.kicker}>{kicker}</p>}
            {title && <h2 className="font-serif text-[19px] font-semibold">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(styles.card, className)}>{children}</div>;
}

export function Page({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={cn(styles.page, wide && styles.wide)}>{children}</div>;
}

/** Shown on sub-pages while the full passport is still being generated. */
export function NotReady() {
  const { id, data } = usePassport();
  return (
    <Page>
      <div className={cn(styles.card, "mt-12 text-center")}>
        <p className="font-serif text-[18px]">{data?.status === "analysis_failed" ? "分析暂时中断" : "完整报告还在生成"}</p>
        <p className="mt-2 text-[13px] text-muted">返回报告查看分析进度。</p>
        <Link href={`/p/${id}/report`} className="mt-4 inline-block text-[14px] text-accent underline-offset-4 hover:underline">返回报告</Link>
      </div>
    </Page>
  );
}

/** A paid part the server removed from this response (entitlement.locked). */
export function Locked({ what, bullets }: { what: string; bullets?: string[] }) {
  const { id, data } = usePassport();
  const seen = React.useRef(false);
  React.useEffect(() => {
    if (!seen.current) {
      seen.current = true;
      api.track("paywall_view", { passport_id: id });
    }
  }, [id]);
  if (data?.entitlement.paid) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] text-muted"><Lock className="size-3.5" />{what}包含在完整护照中</p>
      <PaywallCard title={`${paywall.title} · ¥${data?.entitlement.price_cny ?? 39}`} bullets={bullets ?? [...paywall.bullets]}
        onUnlock={() => { window.location.href = `/p/${id}/unlock`; }} />
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" | "amber" }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px]",
      tone === "accent" && "bg-accent-soft text-accent", tone === "amber" && "bg-amber-soft text-amber",
      tone === "muted" && "bg-paper-sunk text-ink-soft")}>{children}</span>
  );
}
