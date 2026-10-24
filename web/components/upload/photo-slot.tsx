"use client";

/** Role-based photo slots (V3B, D35). Each role is selected, framed, QC'd, replaced and removed independently; only
 *  the front photo gates the submission. The original file stays in memory (never uploaded as such) so reopening the
 *  editor always renders from full-quality pixels. */
import { Check, Crop, ImagePlus, Loader2, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import { ApiError, type Backend, type CaptureRecord, type PhotoQC, type PhotoRole } from "@/lib/api";
import { getQcMessage, photos as copy, upload } from "@/lib/copy/zh";
import { captureRecord, defaultFraming, renderFraming, type Framing } from "@/lib/framing";
import { preparePhoto } from "@/lib/photo";
import { cn } from "@/lib/utils";
import { FramingEditor } from "./framing-editor";
import { detectFaceSuggestion } from "./face-suggestion";

export interface SlotState {
  file: File;
  srcUrl: string | null;        // the original, for the editor (null when the browser cannot decode it, e.g. HEIC)
  bitmap: ImageBitmap | null;
  w: number;
  h: number;
  framing: Framing;
  suggestion: Framing | null;
  blob: Blob;                   // exactly what will be uploaded, checked and measured
  url: string | null;           // preview of `blob`
  capture: CaptureRecord | null;
  qc: PhotoQC | null;
  checking: boolean;
  error: string | null;
}

export type Slots = Partial<Record<PhotoRole, SlotState>>;

async function decode(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

/** All slot state + actions. `onReject` fires once per rejected QC verdict (analytics). */
export function usePhotoSlots(backend: Backend, onReject?: (role: PhotoRole) => void) {
  const [slots, setSlots] = React.useState<Slots>({});
  const latest = React.useRef(slots);
  const requests = React.useRef<Partial<Record<PhotoRole, number>>>({});
  latest.current = slots;
  const patch = (role: PhotoRole, p: Partial<SlotState>) => {
    const s = latest.current;
    if (!s[role]) return;
    latest.current = { ...s, [role]: { ...s[role]!, ...p } };
    setSlots(latest.current);
  };

  React.useEffect(() => () => {
    for (const s of Object.values(latest.current)) if (s) release(s);
    latest.current = {};
    for (const role of Object.keys(requests.current) as PhotoRole[]) requests.current[role]!++;
  }, []);

  const check = React.useCallback(async (role: PhotoRole, blob: Blob) => {
    patch(role, { checking: true, qc: null, error: null });
    const t0 = performance.now();
    try {
      const r = await backend.qc(role, blob);
      if (latest.current[role]?.blob !== blob) return;   // replaced meanwhile
      patch(role, { qc: r });
      if (r.status === "reject") onReject?.(role);
    } catch (e) {
      if (latest.current[role]?.blob !== blob) return;
      patch(role, { error: e instanceof ApiError ? (e.body.code === "unreadable_image" ? upload.conversionFailed : e.body.detail) : upload.uploadFailed });
    } finally {
      const left = 250 - (performance.now() - t0);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      if (latest.current[role]?.blob === blob) patch(role, { checking: false });
    }
  }, [backend, onReject]);

  const choose = React.useCallback(async (role: PhotoRole, file: File) => {
    const request = (requests.current[role] ?? 0) + 1;
    requests.current[role] = request;
    const [bitmap, prepared] = await Promise.all([decode(file), preparePhoto(file)]);
    const w = bitmap?.width ?? 0, h = bitmap?.height ?? 0;
    const suggestion = bitmap ? await detectFaceSuggestion(bitmap, role) : null;
    if (requests.current[role] !== request) {
      bitmap?.close();
      if (prepared.url) URL.revokeObjectURL(prepared.url);
      return;
    }
    const old = latest.current[role];
    const state: SlotState = {
      file, bitmap, w, h, srcUrl: bitmap ? URL.createObjectURL(file) : null, framing: defaultFraming(w, h),
      suggestion,
      blob: prepared.blob, url: prepared.url, capture: bitmap ? captureRecord(w, h, defaultFraming(w, h)) : null,
      qc: null, checking: true, error: null,
    };
    latest.current = { ...latest.current, [role]: state };
    setSlots(latest.current);
    if (old) release(old);
    void check(role, prepared.blob);
  }, [check]);

  const reframe = React.useCallback(async (role: PhotoRole, f: Framing) => {
    const s = latest.current[role];
    if (!s || !s.bitmap) return;
    // One renderer for both identity and edited confirmations; always start with native source pixels.
    const blob = await renderFraming(s.bitmap, s.w, s.h, f);
    if (latest.current[role]?.blob !== s.blob) return;
    if (s.url) URL.revokeObjectURL(s.url);
    const next = { ...s, framing: f, blob, url: URL.createObjectURL(blob), capture: captureRecord(s.w, s.h, f) };
    latest.current = { ...latest.current, [role]: next };
    setSlots(latest.current);
    void check(role, blob);
  }, [check]);

  const remove = React.useCallback((role: PhotoRole) => {
    requests.current[role] = (requests.current[role] ?? 0) + 1;
    const s = latest.current[role];
    if (s) release(s);
    const { [role]: _gone, ...rest } = latest.current;
    latest.current = rest;
    setSlots(rest);
  }, []);

  return { slots, choose, reframe, remove };
}

function release(s: SlotState) {
  if (s.url) URL.revokeObjectURL(s.url);
  if (s.srcUrl) URL.revokeObjectURL(s.srcUrl);
  s.bitmap?.close?.();
}

/** Original, program-drawn direction pictograms (not photos). */
export function RolePictogram({ role, className }: { role: PhotoRole; className?: string }) {
  const st = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 48 48" className={cn("size-10", className)} aria-hidden>
      {role === "profile90" || role === "profile45" ? (
        <>
          <path d="M18 8 C30 6 36 14 35 21 L39 27 L35 28 L35 32 C35 35 32 36 28 35 L27 41" {...st} />
          <path d="M18 8 C10 10 8 20 12 28 C14 32 16 36 16 41" {...st} />
          {role === "profile45" && <path d="M33 14 C35 18 35 20 34 21" {...st} opacity={0.5} />}
        </>
      ) : role === "hair" ? (
        <path d="M12 30 C8 14 18 6 24 6 C30 6 40 14 36 30 M14 30 C18 34 30 34 34 30" {...st} />
      ) : (
        <>
          <ellipse cx="24" cy="22" rx="11" ry="14" {...st} />
          <path d="M19 19 h2 M27 19 h2 M24 21 v5 M21 30 q3 2 6 0" {...st} />
          {role === "noglasses" && <path d="M15 19 h4 M29 19 h4" {...st} opacity={0.35} strokeDasharray="1 3" />}
          {role === "smile" && <path d="M20 29 q4 4 8 0" {...st} />}
        </>
      )}
    </svg>
  );
}

function Verdict({ s, role }: { s: SlotState; role: PhotoRole }) {
  if (s.checking) return <p className="flex items-center gap-1.5 text-[12.5px] text-muted"><Loader2 className="size-3.5 animate-spin" />{copy.checking}</p>;
  if (s.error) return <p className="text-[12.5px] text-[#b4442f]">{s.error}</p>;
  const qc = s.qc;
  if (!qc) return null;
  const code = qc.issues[0];
  // the server's message is role-specific (e.g. a 45° photo in the 90° slot); the shared copy is the fallback
  const msg = qc.messages?.[0] ?? (code ? `${getQcMessage(code).reason}${getQcMessage(code).action}` : null);
  return (
    <div className={cn("rounded-[10px] border px-3 py-2 text-[12.5px] leading-5", qc.status === "ok" ? "border-accent/30 bg-accent-soft"
      : qc.status === "warn" ? "border-amber/30 bg-amber-soft" : "border-[#b4442f]/30 bg-[#f6e5e1]")} data-qc={qc.status}>
      <p className="flex items-center gap-1 font-medium">
        {qc.status === "ok" && <Check className="size-3.5 text-accent" />}
        {qc.status === "ok" ? upload.ready.split("，")[0] : qc.status === "warn" ? upload.warning : upload.rejected}
      </p>
      {msg && <p className="mt-0.5">{msg}</p>}
      {qc.status === "reject" && role !== "front" && <p className="mt-0.5 text-muted">{copy.extraNotBlocking}</p>}
    </div>
  );
}

export function PhotoSlot({ role, state, required, prominent, onChoose, onReframe, onRemove, children }: {
  role: PhotoRole; state: SlotState | undefined; required?: boolean; prominent?: boolean;
  onChoose: (f: File) => void; onReframe: (f: Framing) => void | Promise<void>; onRemove: () => void; children?: React.ReactNode;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [editing, setEditing] = React.useState(false);
  const [suggest, setSuggest] = React.useState(false);
  const r = copy.roles[role];
  React.useEffect(() => {
    if (state?.srcUrl) { setSuggest(true); setEditing(true); }
  }, [state?.srcUrl]);
  return (
    <section aria-label={r.title} data-slot={role}
      className={cn("rounded-[16px] border bg-paper-raised p-3", prominent ? "border-rule-strong" : "border-rule")}>
      <input ref={input} type="file" accept="image/*" className="sr-only" aria-label={`${copy.choose} · ${r.title}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onChoose(f); e.target.value = ""; }} />
      <div className="flex items-start gap-3">
        <RolePictogram role={role} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-medium">
            {r.title}
            <span className={cn("text-[12px] font-normal", required ? "text-accent" : "text-muted")}>（{required ? copy.required : copy.optional}）</span>
            <span className="text-[12px] font-normal text-muted">· {r.cue}</span>
          </p>
          <p className="mt-0.5 text-[12.5px] leading-5 text-ink-soft">{r.how}</p>
        </div>
      </div>

      {!state ? (
        <button type="button" onClick={() => input.current?.click()} data-testid={`choose-${role}`}
          className={cn("mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-rule-strong text-ink-soft hover:border-accent hover:text-accent",
            prominent ? "aspect-[4/3] flex-col" : "min-h-12")}>
          <ImagePlus className={prominent ? "size-8" : "size-4"} strokeWidth={1.5} />
          <span className="text-[14px]">{copy.choose}</span>
        </button>
      ) : (
        <div className="mt-3 grid grid-cols-[minmax(0,7.5rem)_1fr] gap-3 sm:grid-cols-[minmax(0,9rem)_1fr]">
          <div className="overflow-hidden rounded-[10px] bg-[var(--ap-stage)]">
            {state.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.url} alt={`${r.title}（将用于分析的画面）`} className="block w-full" data-testid={`preview-${role}`} />
            ) : <div className="flex aspect-[3/4] items-center justify-center text-[12px] text-stage-muted">{r.title}</div>}
          </div>
          <div className="min-w-0 space-y-2">
            <Verdict s={state} role={role} />
            <div className="flex flex-wrap gap-1.5">
              {state.srcUrl ? (
                <button type="button" onClick={() => { setSuggest(false); setEditing(true); }} data-testid={`frame-${role}`}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full border border-rule-strong px-3 text-[12.5px] hover:bg-paper-sunk">
                  <Crop className="size-3.5" />{state.qc && state.qc.status !== "ok" ? "重新裁剪并检查" : copy.frame}
                </button>
              ) : <p className="text-[12px] text-muted">{copy.noEditor}</p>}
              <button type="button" onClick={() => input.current?.click()}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-rule-strong px-3 text-[12.5px] hover:bg-paper-sunk">
                <RotateCcw className="size-3.5" />{copy.replace}
              </button>
              {!required && (
                <button type="button" onClick={onRemove} data-testid={`remove-${role}`}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full border border-rule-strong px-3 text-[12.5px] hover:bg-paper-sunk">
                  <Trash2 className="size-3.5" />{copy.remove}
                </button>
              )}
            </div>
            {children}
          </div>
        </div>
      )}
      {editing && state?.srcUrl && (
        <FramingEditor key={state.srcUrl} role={role} src={state.srcUrl} width={state.w} height={state.h}
          initial={suggest ? state.suggestion ?? state.framing : state.framing} suggestion={state.suggestion}
          onCancel={() => setEditing(false)} onConfirm={async (f) => { await onReframe(f); setEditing(false); }} />
      )}
    </section>
  );
}
