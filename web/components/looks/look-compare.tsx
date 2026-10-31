"use client";

/** /p/[id]/compare — "我该选哪个造型？" (Issue #4).
 *  Personalized complete-look directions → save two as A and B → draw both on the same photo next to the original →
 *  see exactly what differs and what was generated vs simulated vs not drawn → pick one → optional decision card.
 *  Everything is local: SavedLooks live in this browser (lib/state/choices), pixels stay in memory. */
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { NotReady, Page, PageHeader } from "@/components/passport/ui";
import { DecisionShare } from "@/components/share/decision-share";
import { Button } from "@/components/ui/button";
import { backendFor, type Passport } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import type { FaceGeometry } from "@/lib/tint";
import { usePassport } from "@/lib/state/passport-store";
import { useChoices, type SavedLook } from "@/lib/state/choices";
import { cn } from "@/lib/utils";
import { diffLooks } from "./diff";
import { DirectionPicker, type Slot } from "./direction-picker";
import { buildDirections, savedDirection, type Direction } from "./directions";
import { LookPane } from "./look-pane";
import { lookSwatches } from "./names";
import { useLookRender } from "./use-look-render";

export function LookCompare() {
  const { id, passport, data } = usePassport();
  if (!passport || !data) return <NotReady />;
  return <Loaded id={id} passport={passport} data={data} />;
}

function Loaded({ id, passport, data }: { id: string; passport: Passport; data: NonNullable<ReturnType<typeof usePassport>["data"]> }) {
  const params = useSearchParams();
  const { choices, saveLook, choosePreferred } = useChoices(id);
  const looks = choices.looks;
  const [slots, setSlots] = React.useState<Record<Slot, string | null>>({ a: params.get("a"), b: params.get("b") });
  const [geometry, setGeometry] = React.useState<FaceGeometry | null | undefined>(undefined);
  const [ttlExpired, setTtlExpired] = React.useState(false);
  const expired = Boolean(data.media.expired) || ttlExpired;
  React.useEffect(() => {
    setTtlExpired(false);
    if (!data.media.expires_at) return;
    const remaining = Date.parse(data.media.expires_at) - Date.now();
    if (remaining <= 0) { setTtlExpired(true); return; }
    const timer = window.setTimeout(() => setTtlExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [id, data.media.expires_at]);
  React.useEffect(() => {
    if (expired) return;
    let live = true;
    backendFor(id).geometry(id).then((g) => live && setGeometry(g)).catch(() => live && setGeometry(null));
    return () => { live = false; };
  }, [id, expired]);

  // A and B: what the URL / the person chose if it still exists, otherwise the two newest saved looks
  const byId = (lookId: string | null) => looks.find((l) => l.id === lookId) ?? null;
  const pickedA = byId(slots.a), pickedB = byId(slots.b);
  const lookA: SavedLook | null = pickedA ?? (slots.a === null ? looks.find((l) => l.id !== pickedB?.id) ?? null : null);
  const lookB: SavedLook | null = pickedB ?? (slots.b === null ? looks.find((l) => l.id !== lookA?.id) ?? null : null);
  const setSlot = (slot: Slot, lookId: string | null) => {
    setSlots((s) => {
      const next = { ...s, [slot]: lookId };
      try {
        const url = new URL(window.location.href);
        for (const k of ["a", "b"] as const) next[k] ? url.searchParams.set(k, next[k]!) : url.searchParams.delete(k);
        window.history.replaceState(null, "", url);
      } catch { /* the address bar is a convenience */ }
      return next;
    });
  };

  const directions = React.useMemo(() => buildDirections(passport), [passport]);
  const ra = useLookRender({ id, passport, data, expired, geometry, look: lookA });
  const rb = useLookRender({ id, passport, data, expired, geometry, look: lookB });

  const pick = (d: Direction, slot: Slot) => {
    const lookId = savedDirection(looks, d)?.id ?? saveLook(d.look);
    setSlot(slot, lookId);
    toast.success(`已把「${d.title}」放进 ${slot.toUpperCase()}`);
  };
  const diff = lookA && lookB ? diffLooks(passport, lookA, lookB) : null;
  const preferred = choices.preferred && [lookA?.id, lookB?.id].includes(choices.preferred.lookId) ? choices.preferred.lookId : null;
  const front = expired ? null : data.media.front;

  return (
    <Page wide>
      <PageHeader kicker="完整造型 · 比较与选择" title="我该选哪一个造型？"
        sub="先挑两个完整造型，把它们和原图画在同一张脸上并排看，弄清差别，再做选择，需要时发给朋友帮你看看。" />
      {expired && (
        <p role="note" className="mb-5 rounded-[4px] bg-amber-soft px-4 py-3 text-[13px] leading-6 text-amber">
          照片已按隐私规则在 24 小时后删除，所以下面不再显示画面，只能比较造型的设置。重新上传一张正脸照片后即可恢复。
        </p>
      )}

      <DirectionPicker passport={passport} directions={directions} looks={looks} slots={{ a: lookA?.id ?? null, b: lookB?.id ?? null }} onPick={pick} />

      <section aria-labelledby="compare" className="mt-12 border-t border-rule pt-8 sm:mt-16">
        <h2 id="compare" className="font-serif text-[26px] font-medium">并排比较</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["a", "b"] as const).map((slot) => (
            <label key={slot} className="flex items-center gap-2 text-[13px]">
              <span className="w-12 shrink-0 font-medium">造型 {slot.toUpperCase()}</span>
              <select aria-label={`选择造型 ${slot.toUpperCase()}`} data-testid={`select-${slot}`} value={(slot === "a" ? lookA : lookB)?.id ?? ""}
                onChange={(e) => setSlot(slot, e.target.value || null)}
                className="min-h-11 min-w-0 flex-1 rounded-[4px] border border-rule-strong bg-paper-raised px-3 text-[13px]">
                <option value="">{looks.length ? "请选择" : "还没有保存的造型"}</option>
                {looks.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          ))}
        </div>

        {looks.length < 2 && (
          <p className="mt-4 rounded-[4px] bg-paper-sunk px-4 py-3 text-[13px] leading-6 text-ink-soft" data-testid="need-two">
            需要两个造型才能比较。用上面的方向各放进 A 和 B，或在<Link href={`/p/${id}/studio`} className="text-accent underline underline-offset-4">形象实验室</Link>自己调出造型并保存。
          </p>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <LookPane slot="原图" title="现在的样子" front={front} expired={expired} />
          <LookPane slot="A" title={lookA?.name ?? "还没选 A"} render={lookA ? ra : undefined} front={front} expired={expired} notes={lookA ? ra.notes : undefined}
            swatches={lookA ? lookSwatches(passport, lookA) : undefined} selected={preferred === lookA?.id && Boolean(lookA)} />
          <LookPane slot="B" title={lookB?.name ?? "还没选 B"} render={lookB ? rb : undefined} front={front} expired={expired} notes={lookB ? rb.notes : undefined}
            swatches={lookB ? lookSwatches(passport, lookB) : undefined} selected={preferred === lookB?.id && Boolean(lookB)} />
        </div>
        <p className="mt-2 text-[12px] leading-5 text-muted">
          “AI 生成”只指发型：由 AI 近似模拟，需要先在实验室生成。发色、妆容、眼镜和近脸色都是在你的浏览器里计算的“本地模拟”，不是真实效果。标明“未画出”的项目没有出现在图上。
        </p>
      </section>

      {lookA && lookB && diff && (
        <>
          <section aria-labelledby="diff" className="mt-12 border-t border-rule pt-8 sm:mt-16">
            <h2 id="diff" className="font-serif text-[26px] font-medium">差别在哪里</h2>
            <p className="mt-1 text-[13px] leading-6 text-ink-soft" data-testid="diff-summary">{diff.summary}</p>
            <div className="mt-3 overflow-x-auto rounded-[4px] border border-rule bg-paper-raised">
              <table className="w-full text-left text-[13px]" data-testid="diff-table">
                <caption className="sr-only">造型 A 与造型 B 逐项对比</caption>
                <thead><tr className="border-b border-rule text-[12px] text-muted"><th className="px-3 py-2 font-normal">项目</th><th className="px-3 py-2 font-normal">A</th><th className="px-3 py-2 font-normal">B</th></tr></thead>
                <tbody>
                  {diff.rows.map((r) => (
                    <tr key={r.key} data-differs={r.differs ? "yes" : "no"} className={cn("border-b border-rule last:border-0", r.differs ? "bg-accent-soft/50" : "text-muted")}>
                      <th scope="row" className="px-3 py-2 font-medium">{r.label}{r.generated && <span className="ml-1 text-[11px] font-normal text-muted">AI</span>}</th>
                      <td className="px-3 py-2">{r.a}</td><td className="px-3 py-2">{r.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="choose" className="mt-12 border-t border-rule pt-8 sm:mt-16">
            <h2 id="choose" className="font-serif text-[26px] font-medium">我的选择</h2>
            <p className="mt-1 text-[13px] leading-6 text-ink-soft">没有标准答案：选更符合你想要的印象、也做得到的那个。选择只保存在这台设备上。</p>
            <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="选择造型">
              {([[lookA, "A"], [lookB, "B"]] as const).map(([l, tag]) => (
                <Button key={tag} variant={preferred === l.id ? "accent" : "outline"} aria-pressed={preferred === l.id} data-testid={`choose-${tag}`}
                  onClick={() => choosePreferred(preferred === l.id ? null : l.id)}>
                  {preferred === l.id ? `已选 ${tag}` : `我选 ${tag}`}
                </Button>
              ))}
              <Link href={`/p/${id}/studio`} className="ml-1 text-[13px] text-accent underline-offset-4 hover:underline">去实验室微调 →</Link>
              <Link href={`/p/${id}/plan`} className="text-[13px] text-accent underline-offset-4 hover:underline">放进行动方案 →</Link>
            </div>
            {preferred && <p className="mt-2 text-[13px] text-ink-soft" data-testid="chosen">已记录：你更倾向「{(preferred === lookA.id ? lookA : lookB).name}」。</p>}
          </section>

          <DecisionShare passportId={id} passport={passport}
            a={{ look: lookA, notes: ra.notes, snapshot: ra.snapshot }} b={{ look: lookB, notes: rb.notes, snapshot: rb.snapshot }} />
        </>
      )}
    </Page>
  );
}
