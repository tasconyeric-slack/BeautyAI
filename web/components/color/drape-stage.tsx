"use client";

import * as React from "react";
import { HoldButton, Stage, useHold } from "@/components/ds";
import { guidance } from "@/lib/copy/zh";
import { cn } from "@/lib/utils";
import type { Chip } from "./helpers";
import { GROUP_USE } from "./helpers";
import type { DrapeStatus } from "./use-drape";

type Paint = (canvas: HTMLCanvasElement | null, hex: string | null) => void;

export interface DrapeStageProps {
  status: DrapeStatus;
  paint: Paint;
  /** One colour (single view) or two (side by side). */
  shown: (Chip | null)[];
  /** Which side the next swatch tap fills in compare mode. */
  activeSlot?: number;
  onSlot?: (slot: number) => void;
}

/** The photo with a solid digital cloth under the chin; one "按住看原图" control shows the original (D31). */
export function DrapeStage({ status, paint, shown, activeSlot = 0, onSlot }: DrapeStageProps) {
  const hold = useHold();
  const showOriginal = hold.holding;
  const pair = shown.length > 1;

  if (status !== "ready") {
    return (
      <Stage className="flex aspect-[4/5] w-full items-center justify-center rounded-[14px] p-6 text-center" aria-busy={status === "loading"}>
        <p className="text-[13px] leading-6 text-stage-muted">{status === "loading" ? "正在本地准备数字披布…" : stageNote(status)}</p>
      </Stage>
    );
  }
  return (
    <div>
      <Stage className="overflow-hidden rounded-[14px]">
        <div className={cn("grid", pair ? "grid-cols-2 gap-px" : "grid-cols-1")}>
          {shown.map((chip, i) => (
            <DrapeCanvas key={pair ? `pair-${i}` : "single"} paint={paint} hex={showOriginal ? null : chip?.hex ?? null}
              chip={chip} showOriginal={showOriginal} active={pair && activeSlot === i}
              onPick={pair && onSlot ? () => onSlot(i) : undefined} side={pair ? (i === 0 ? "左" : "右") : null} />
          ))}
        </div>
      </Stage>
      <div className="mt-3 flex justify-center">
        <HoldButton holding={hold.holding} props={hold.props} />
      </div>
    </div>
  );
}

function DrapeCanvas({ paint, hex, chip, showOriginal, active, onPick, side }: {
  paint: Paint; hex: string | null; chip: Chip | null; showOriginal: boolean; active: boolean; onPick?: () => void; side: string | null;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  // Layout effect: the new colour is on the canvas in the same frame as the tap.
  React.useLayoutEffect(() => { paint(ref.current, hex); }, [paint, hex]);
  const caption = showOriginal ? "原图" : chip ? `${chip.label} · ${GROUP_USE[chip.group].role}` : "原图";
  return (
    <div className={cn("relative", side ? "aspect-[3/4]" : "aspect-[4/3]", active && "outline outline-2 -outline-offset-2 outline-white/80")}>
      {/* Cropped to chin + cloth (the part that changes), so the face and the colour are both in view on a phone. */}
      <canvas ref={ref} data-testid="drape-canvas" className={cn("block size-full object-cover", side ? "object-[50%_100%]" : "object-[50%_90%]")}
        aria-label={`数字披布${side ? `（${side}）` : ""}：${caption}（本地计算，不上传）`} role="img" />
      {onPick ? (
        <button type="button" onClick={onPick} aria-pressed={active}
          className="absolute inset-x-2 bottom-2 truncate rounded-full bg-black/60 px-2.5 py-1 text-left text-[12px] text-white">
          {side} · {caption}
        </button>
      ) : (
        <span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-full bg-black/60 px-2.5 py-1 text-[12px] text-white">{caption}</span>
      )}
    </div>
  );
}

export function stageNote(status: DrapeStatus): string {
  if (status === "expired") return guidance.photoExpired;
  if (status === "no_geometry") return "这张照片没有可用的下颌与颈部测量，暂时无法做数字披布，先看下方色卡。";
  return "照片暂时无法读取，先看下方色卡。";
}
