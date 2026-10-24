"use client";

/** The "帮我选 A 还是 B" share block of the comparison page (Issue #4). Opt-in, account-free:
 *  - default card has no photo; the photo option needs a fresh, specific consent tick that resets after every export,
 *    after a mode switch and whenever the compared pair changes;
 *  - exports a labelled PNG (AIGC metadata, no passport id), and offers the system share sheet where the browser has one;
 *  - the caption has no link: the image is the share, and the passport's read-only page (which shows the face profile) stays out of it. */
import { ClipboardCopy, Download, Loader2, Share2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { exportPng } from "@/components/cards";
import { Scaled } from "@/components/passport/scaled";
import { Button } from "@/components/ui/button";
import { api, type Passport } from "@/lib/api";
import { share as copy } from "@/lib/copy/zh";
import type { LayerNote } from "@/components/looks/diff";
import type { LookLike } from "@/components/looks/names";
import { Segmented, ConsentCheck, useOrigin } from "./controls";
import { canExportDecision, DECISION_CONSENT_LABEL, decisionCaption, decisionContent, decisionExportMeta, decisionPhotos, safeDataImage, type DecisionMode } from "./decision";
import { DecisionCard } from "./decision-card";
import { cardNode, downloadBlob } from "./use-card-export";

export interface DecisionSource { look: LookLike; notes: readonly LayerNote[]; snapshot: () => string | null }

export function DecisionShare({ passportId, passport, a, b }: { passportId: string; passport: Passport; a: DecisionSource; b: DecisionSource }) {
  const origin = useOrigin();
  const [mode, setMode] = React.useState<DecisionMode>("swatches");
  const [consent, setConsent] = React.useState(false);
  const [snaps, setSnaps] = React.useState<{ a: string | null; b: string | null }>({ a: null, b: null });
  const [busy, setBusy] = React.useState(false);
  const [canShare, setCanShare] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  // a new pair, a changed look or a changed rendering is a new export: the earlier tick and snapshots do not carry over
  const pairKey = JSON.stringify([a.look, b.look, a.notes, b.notes]);
  const reset = React.useCallback(() => { setConsent(false); setSnaps({ a: null, b: null }); }, []);
  React.useEffect(reset, [pairKey, reset]);
  const choose = (m: DecisionMode) => { setMode(m); reset(); };
  const tick = (v: boolean) => {
    setConsent(v);
    // photos are read from the canvases only at the moment of consent, and dropped again when it is withdrawn
    setSnaps(v ? { a: safeDataImage(a.snapshot()), b: safeDataImage(b.snapshot()) } : { a: null, b: null });
  };

  const photos = decisionPhotos(mode, consent, snaps);
  const withPhoto = Boolean(photos.a || photos.b);
  const content = decisionContent(passport, a.look, b.look, a.notes, b.notes);
  const photoAvailable = consent && (Boolean(snaps.a) || Boolean(snaps.b));
  const canExport = canExportDecision(mode, consent, photoAvailable);
  const link = origin ? origin.replace(/^https?:\/\//, "") : copy.shortLink;
  const text = decisionCaption(content, withPhoto);

  const run = async (how: "download" | "share") => {
    setBusy(true);
    let ok = false;
    try {
      const node = cardNode(cardRef.current);
      if (!node) throw new Error("card not mounted");
      const blob = await exportPng(node, decisionExportMeta());
      if (how === "share") {
        const file = new File([blob], "aesthetic-passport-help-me-choose.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
        else await navigator.share({ text });
      } else downloadBlob(blob, "aesthetic-passport-help-me-choose.png");
      api.track("share_card_export", { passport_id: passportId });
      ok = true;
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) toast.error(copy.exportFailed); // closing the share sheet is not a failure
    } finally {
      setBusy(false);
      if (ok) toast.success(how === "share" ? "已打开分享，选择要发给的人" : copy.exported);
      reset(); // the tick covers one export only
    }
  };
  const copyText = async () => {
    try { await navigator.clipboard.writeText(text); toast.success("文案已复制"); } catch { toast(text); }
  };

  return (
    <section aria-labelledby="decision-share" data-testid="decision-share" className="mt-10">
      <h2 id="decision-share" className="font-serif text-[20px] font-semibold">发给朋友，帮你选</h2>
      <p className="mt-1 max-w-[40em] text-[13px] leading-6 text-ink-soft">
        生成一张“A 还是 B”的图，发给任何人就能看，对方不需要注册。默认只含两个造型的配色与设置，不含你的照片、测量数据、评分和问卷答案。
      </p>
      <div className="mt-3">
        <Segmented<DecisionMode> label="卡片内容" value={mode} onChange={choose}
          options={[{ value: "swatches", label: "不含照片（默认）" }, { value: "photo", label: "含我的照片" }]} />
      </div>
      <div ref={cardRef} className="mt-4" data-testid="decision-preview" data-photo={withPhoto ? "yes" : "no"}>
        <Scaled className="mx-auto max-w-sm overflow-hidden rounded-[14px] border border-rule shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)]">
          <DecisionCard content={content} photos={photos} shortLink={link} />
        </Scaled>
      </div>
      <div className="mx-auto mt-4 flex max-w-sm flex-col gap-2">
        {mode === "photo" && (
          <>
            <ConsentCheck id="consent-decision" checked={consent} onChange={tick} label={DECISION_CONSENT_LABEL} />
            {consent && !photoAvailable && <p className="text-[12px] leading-5 text-[#b4442f]">这张照片暂时读不出像素（或已过期），不能放进卡片。请改用不含照片的版本。</p>}
          </>
        )}
        <Button variant="accent" size="lg" className="w-full" data-testid="export-decision" disabled={busy || !canExport} onClick={() => run("download")}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}保存“帮我选”图片
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={copyText}><ClipboardCopy />复制配文</Button>
          <Button variant="outline" data-testid="share-decision" disabled={busy || !canExport || !canShare} onClick={() => run("share")}><Share2 />系统分享</Button>
        </div>
        {!canShare && <p className="text-center text-[12px] leading-5 text-muted">这个浏览器没有系统分享：先保存图片，再在聊天里发送。</p>}
      </div>
    </section>
  );
}
