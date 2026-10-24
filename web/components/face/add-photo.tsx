"use client";

/** Add a measurement photo after the report exists (V3B, D35): same slot, framing editor and QC as the upload page,
 *  then enrich → the server re-measures with the kept front photo. A failed check never touches the front report. */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { PhotoSlot, usePhotoSlots } from "@/components/upload/photo-slot";
import { ApiError, backendFor, type ExtraRole } from "@/lib/api";
import { usePassport } from "@/lib/state/passport-store";

export function AddPhotoPanel({ role, onDone }: { role: ExtraRole; onDone: () => void }) {
  const { id, enrich } = usePassport();
  const { slots, choose, reframe, remove } = usePhotoSlots(backendFor(id));
  const st = slots[role];
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const ok = st?.qc && st.qc.status !== "reject" && !st.checking;
  const submit = async () => {
    if (!st) return;
    setPending(true);
    setMsg(null);
    try {
      await enrich({}, { [role]: st.blob }, st.capture ? { [role]: { capture: st.capture } } : undefined);
      setMsg("已提交，正在用这张照片重新测量，完成后工作台会自动更新。");
      setTimeout(onDone, 2500);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.body.detail : "提交失败，请稍后再试。");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="mt-4 rounded-[16px] border border-accent/30 bg-accent-soft/40 p-3" data-testid="add-photo">
      <PhotoSlot role={role} state={st} prominent onChoose={(f) => choose(role, f)} onReframe={(f) => reframe(role, f)}
        onRemove={() => remove(role)} />
      <div className="mt-3 flex items-center gap-2">
        <Button variant="accent" disabled={!ok || pending} onClick={submit}>用这张补充测量</Button>
        <Button variant="outline" onClick={onDone}>取消</Button>
        {msg && <p className="text-[12.5px] text-ink-soft" role="status">{msg}</p>}
      </div>
    </div>
  );
}
