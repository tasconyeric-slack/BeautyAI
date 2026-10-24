"use client";

/** /s/[token] — read-only shared passport (A10). Never shows a photo: the card renders as illustration or palette art
 *  only, and nothing from `media` / previews is read. Deleted or unknown tokens show "分享链接已失效". */
import Link from "next/link";
import * as React from "react";
import { ProfileCard } from "@/components/cards";
import { Scaled } from "@/components/passport/scaled";
import { colorGroups, cover, profileCardProps, triptych } from "@/lib/adapters";
import { backendFor, type Passport } from "@/lib/api";
import { share as copy } from "@/lib/copy/zh";
import { Segmented } from "./controls";

export const EXPIRED_TEXT = "分享链接已失效";

export type SharedLoader = (token: string) => Promise<{ passport: Passport; created_at: string }>;

/** Fixture tokens look like "fx-<passport id>" and are served in-browser; everything else goes to the API. */
export const defaultSharedLoader: SharedLoader = (token) =>
  backendFor(token.startsWith("fx-") ? `fx_${token}` : null).shared(token);

export function SharedView({ token, load = defaultSharedLoader }: { token: string; load?: SharedLoader }) {
  const [state, setState] = React.useState<{ p: Passport; created: string } | "loading" | "gone">("loading");
  const [mode, setMode] = React.useState<"avatar" | "palette">("avatar");
  const [ref, setRef] = React.useState("share");
  React.useEffect(() => {
    let alive = true;
    const r = new URLSearchParams(window.location.search).get("ref");
    if (r) setRef(r.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 32) || "share");
    load(token).then((x) => alive && setState({ p: x.passport, created: x.created_at }), () => alive && setState("gone"));
    return () => {
      alive = false;
    };
  }, [token, load]);

  const cta = `/start?ref=${encodeURIComponent(ref)}`;

  if (state === "gone") {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="font-serif text-[22px] font-semibold">{EXPIRED_TEXT}</p>
        <p className="mt-2 text-[13px] leading-6 text-muted">分享者可能已删除这份护照，或链接已过期。</p>
        <Link href={cta} className="mt-6 inline-block rounded-full bg-accent px-6 py-3 text-[15px] text-[var(--ap-on-primary)]">也做一份我的形象护照</Link>
      </main>
    );
  }
  if (state === "loading") return <main className="mx-auto max-w-md px-4 py-20 text-center text-[13px] text-muted">正在打开分享的形象档案</main>;

  const p = state.p;
  const t = triptych(p);
  const c = cover(p);
  const favor = colorGroups(p)[0].colors.slice(0, 6);
  const card = profileCardProps(p, { mode, shortLink: copy.attribution });
  return (
    <main className="mx-auto max-w-md px-4 pb-12 pt-6">
      <p className="mb-1 text-[11px] tracking-[0.18em] text-muted">只读分享 · 不含照片</p>
      <h1 className="font-serif text-[24px] font-semibold leading-snug">一份形象档案</h1>
      <p className="mt-2 text-[14px] leading-7 text-ink-soft">{c.oneLiner}</p>

      <div className="mt-4 flex justify-center">
        <Segmented label="卡片视觉" value={mode} onChange={setMode}
          options={[{ value: "avatar", label: copy.modes.avatar }, { value: "palette", label: copy.modes.palette }]} />
      </div>
      <Scaled className="mt-3 overflow-hidden rounded-[14px] border border-rule shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)]">
        <ProfileCard {...card} />
      </Scaled>

      <dl className="mt-6 divide-y divide-rule rounded-[14px] border border-rule bg-paper-raised px-4 text-[14px]">
        {[{ k: "脸型", v: t.face.value }, { k: "色彩", v: t.color.value }, { k: "风格", v: t.style.value }].map((x) => (
          <div key={x.k} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-muted">{x.k}</dt><dd className="text-right">{x.v}</dd>
          </div>
        ))}
      </dl>
      {favor.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[12px] text-muted">近脸色</p>
          <ul className="grid grid-cols-6 gap-1.5">
            {favor.map((s) => (
              <li key={s.hex + s.name_zh} title={s.name_zh}>
                <span className="block h-9 rounded-[6px] border border-black/5" style={{ background: s.hex }} />
                <span className="mt-1 block truncate text-center text-[10px] text-muted">{s.name_zh}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 rounded-[12px] bg-paper-sunk px-3.5 py-2.5 text-[13px] leading-6">
        <span className="text-muted">先从这里开始：</span>{c.bestDirection}
      </p>

      <Link href={cta} className="mt-7 block rounded-full bg-accent px-6 py-3 text-center text-[15px] text-[var(--ap-on-primary)]">也做一份我的形象护照</Link>
      <p className="mt-3 text-center text-[12px] leading-5 text-muted">内容由 AI 生成，仅供造型参考 · 只需一张正脸自拍</p>
    </main>
  );
}
