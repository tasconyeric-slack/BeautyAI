"use client";
import s from "./share.module.css";

/** /p/[id]/share — 档案卡分享 (A10 · F17 increment 1, PRD B8 / wireframe 12).
 *
 *  - 3:4 profile card in three visuals: 插画头像 (default) · 色卡艺术 · 本人肖像. Portrait needs the photo to still exist
 *    and a fresh consent tick for every export; the tick resets after each export.
 *  - Every PNG carries the visible "AI 生成" mark (in the card frame) and the AIGC tEXt metadata (exportPng).
 *  - Read-only link (no photo), Xiaohongshu caption, stylist card (face hidden by default), before/after card when a
 *    hair preview succeeded, and the "delete my photos and report" control.
 */
import { Check, ClipboardCopy, Download, ImageOff, Link2, Loader2, UserRound } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { IllustratedAvatar, ProfileCard, isProfileModeAvailable, type ProfileMode } from "@/components/cards";
import { Scaled } from "@/components/passport/scaled";
import { NotReady, Page, PageHeader, Section } from "@/components/passport/ui";
import { Button } from "@/components/ui/button";
import { avatarProps, colorGroups, profileCardProps } from "@/lib/adapters";
import { share as copy } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";
import { buildCaption } from "./caption";
import { ConsentCheck, printedLink, useOrigin, withRef } from "./controls";
import { DeleteData } from "./delete-data";
import { BeforeAfterShare, StylistShare } from "./extra-cards";
import { useCardExport } from "./use-card-export";

const MODES: ProfileMode[] = ["avatar", "palette", "portrait"];

/** The photo the portrait card may use, or null when it is gone (expired, deleted or never stored). */
export function portraitSource(media: { front: string | null; expired: boolean } | undefined | null): string | null {
  if (!media || media.expired || !media.front?.trim()) return null;
  return media.front;
}

export function ShareStudio() {
  const { id, passport, data, share } = usePassport();
  const origin = useOrigin();
  const [mode, setMode] = React.useState<ProfileMode>("avatar");
  const [consent, setConsent] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [linkBusy, setLinkBusy] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const exporter = useCardExport(id);

  const token = data?.entitlement.share_token ?? null;
  const url = shareUrl ?? (token && origin ? `${origin}/s/${token}` : null);

  /** Creates (or reuses) the read-only link; flushes it into the DOM so a card exported next prints it. */
  const ensureLink = React.useCallback(async (): Promise<string | null> => {
    if (url) return url;
    try {
      const r = await share();
      const next = /^https?:\/\//.test(r.url) ? r.url : `${window.location.origin}${r.url}`;
      flushSync(() => setShareUrl(next));
      return next;
    } catch {
      return null;
    }
  }, [share, url]);

  if (!passport || !data) return <NotReady />;

  const portraitSrc = portraitSource(data.media);
  const portraitOk = isProfileModeAvailable("portrait", portraitSrc ?? undefined);
  const activeMode: ProfileMode = mode === "portrait" && !portraitOk ? "avatar" : mode;
  const cardLink = url ? printedLink(url, "card") : (origin ? origin.replace(/^https?:\/\//, "") : copy.shortLink);
  const props = profileCardProps(passport, { mode: activeMode, shortLink: cardLink, portraitSrc });
  const needsConsent = activeMode === "portrait";
  const caption = buildCaption({ ...captionInput(passport, props.style.name), link: url ? withRef(url, "xhs") : null });

  const choose = (m: ProfileMode) => {
    setMode(m);
    setConsent(false);
  };

  const doExport = () => exporter.run({
    kind: `profile-${activeMode}`,
    container: cardRef.current,
    filename: `aesthetic-passport-card-${activeMode}.png`, // ASCII: some browsers drop non-ASCII download names
    prepare: async () => {
      await ensureLink();
    },
    after: () => setConsent(false), // portrait consent covers one export only
  });

  const copyText = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ok);
    } catch {
      toast(text);
    }
  };

  const copyLink = async () => {
    setLinkBusy(true);
    const u = await ensureLink();
    setLinkBusy(false);
    if (!u) return toast.error("暂时无法生成链接，请稍后重试");
    await copyText(u, copy.linkCopied);
  };

  const copyCaption = async () => {
    const u = await ensureLink();
    const text = u ? buildCaption({ ...captionInput(passport, props.style.name), link: withRef(u, "xhs") }).text : caption.text;
    await copyText(text, "文案已复制，保存图片后打开小红书粘贴");
  };

  return (
    <Page>
      <PageHeader kicker="分享" title={copy.title} sub="3:4 竖版，和小红书笔记首图比例一致。卡片只有档案、色卡与风格方向，不含任何评分。" />

      <div role="radiogroup" aria-label="卡片视觉" className={s.modeControls + " grid grid-cols-3 gap-3"}>
        {MODES.map((m) => {
          const disabled = m === "portrait" && !portraitOk;
          const selected = activeMode === m;
          return (
            <button key={m} type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => choose(m)}
              data-mode={m}
              className={cn("flex flex-col items-center gap-1.5 rounded-[4px] border px-2 pb-2.5 pt-2 text-[13px] transition-colors",
                selected ? "border-accent bg-accent-soft text-ink" : "border-rule bg-paper-raised text-ink-soft hover:border-rule-strong",
                disabled && "cursor-not-allowed opacity-45 hover:border-rule")}>
              <ModeThumb mode={m} passport={passport} disabled={disabled} />
              <span className="flex items-center gap-1">{selected && <Check className="size-3.5 text-accent" />}{copy.modes[m]}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[12px] leading-5 text-muted" aria-live="polite">
        {activeMode === "avatar" ? copy.avatarHint : activeMode === "palette" ? copy.paletteHint : "肖像只用于这一次导出，不会出现在只读链接里。"}
        {!portraitOk && <span className="mt-0.5 flex items-center gap-1"><ImageOff className="size-3.5" />{copy.portraitUnavailable}</span>}
      </p>

      <div ref={cardRef} className="mt-4">
        <Scaled className="mx-auto max-w-sm overflow-hidden rounded-[4px] border border-rule shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)]">
          <ProfileCard {...props} />
        </Scaled>
      </div>

      <div className="mx-auto mt-4 flex max-w-sm flex-col gap-2">
        {needsConsent && <ConsentCheck id="consent-profile" checked={consent} onChange={setConsent} label={copy.portraitConsent} />}
        <Button variant="accent" size="lg" className="w-full" data-testid="export-profile"
          disabled={exporter.busy !== null || (needsConsent && !consent)} onClick={doExport}>
          {exporter.busy?.startsWith("profile") ? <Loader2 className="animate-spin" /> : <Download />}
          {exporter.busy?.startsWith("profile") ? copy.exporting : copy.exportPng}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={copyCaption}><ClipboardCopy />发小红书</Button>
          <Button variant="outline" onClick={copyLink} disabled={linkBusy}>{linkBusy ? <Loader2 className="animate-spin" /> : <Link2 />}复制只读链接</Button>
        </div>
        <p className="text-center text-[12px] leading-5 text-muted">小红书：先保存图片，再打开 App 选择这张图，粘贴复制好的文案。</p>
      </div>

      <Section title="只读链接" kicker="不含照片">
        <div className="rounded-[4px] border border-rule bg-paper-raised p-4 text-[13px] leading-6">
          <p>{copy.readOnlyLink}打开的人只能看到文字档案、色卡与风格方向，看不到照片、试看图和面部标注；删除护照后链接立即失效。</p>
          {url ? (
            <div className="mt-3 flex items-center gap-2 rounded-[4px] bg-paper-sunk px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]" data-testid="share-url">{url}</span>
              <button type="button" className="shrink-0 text-[12px] text-accent" onClick={() => copyText(url, copy.linkCopied)}>复制</button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="mt-3" onClick={copyLink} disabled={linkBusy}><Link2 />生成只读链接</Button>
          )}
        </div>
      </Section>

      <Section title="小红书文案" kicker="可直接复制"
        action={<button type="button" onClick={copyCaption} className="inline-flex items-center gap-1 text-[13px] text-accent"><ClipboardCopy className="size-3.5" />复制</button>}>
        <div className="rounded-[4px] border border-rule bg-paper-raised p-4 text-[13px] leading-6" data-testid="caption">
          <p className="font-medium">{caption.title}</p>
          <p className="mt-2 whitespace-pre-line text-ink-soft">{caption.body}</p>
          <p className="mt-2 text-accent">{caption.tags}</p>
        </div>
      </Section>

      <Section title="两个造型拿不定主意？" kicker="帮我选">
        <Link href={`/p/${id}/compare`} className="text-[14px] text-accent underline-offset-4 hover:underline">并排比较两个造型，生成“A 还是 B”的图发给朋友 →</Link>
        <p className="mt-1 text-[12px] leading-5 text-muted">默认的图不含照片和测量数据；要放照片需要你单独同意。</p>
      </Section>

      <StylistShare exporter={exporter} cardLink={cardLink} ensureLink={ensureLink} />
      <BeforeAfterShare exporter={exporter} cardLink={cardLink} ensureLink={ensureLink} />

      <DeleteData />
    </Page>
  );
}

function captionInput(passport: NonNullable<ReturnType<typeof usePassport>["passport"]>, styleName: string) {
  return {
    styleName,
    colorNames: passport.analysis.color_profile.favor_families.map((f) => f.name),
    action: passport.analysis.profile_summary.best_direction,
  };
}

function ModeThumb({ mode, passport, disabled }: { mode: ProfileMode; passport: NonNullable<ReturnType<typeof usePassport>["passport"]>; disabled: boolean }) {
  const box = "flex h-14 w-12 items-center justify-center overflow-hidden rounded-[8px]";
  if (mode === "avatar") {
    return <span className={cn(box, "bg-[#E5E5DF]")} aria-hidden><IllustratedAvatar {...avatarProps(passport)} label="插画头像示意" /></span>;
  }
  if (mode === "palette") {
    const colors = colorGroups(passport)[0].colors.slice(0, 4);
    return (
      <span className={cn(box, "flex-col items-stretch")} aria-hidden>
        {colors.map((c) => <span key={c.hex + c.name_zh} className="flex-1" style={{ background: c.hex }} />)}
      </span>
    );
  }
  return (
    <span className={cn(box, "bg-[var(--ap-stage,#141618)] text-white/80")} aria-hidden>
      {disabled ? <ImageOff className="size-5" /> : <UserRound className="size-6" />}
    </span>
  );
}
