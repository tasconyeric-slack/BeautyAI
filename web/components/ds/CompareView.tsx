"use client";

import { useId } from "react";
import { HoldButton, useHold } from "./HoldButton";
import { Stage } from "./Stage";
import "./tokens.css";

export interface CompareViewProps {
  beforeSrc: string;
  afterSrc: string;
  label: string;
  aiLabel: string;
}

/** The generated image by default; one "按住看原图" control shows the original while held (D31). */
export function CompareView({ beforeSrc, afterSrc, label, aiLabel }: CompareViewProps) {
  const { holding, props } = useHold();
  const labelId = useId();
  return (
    <figure className="ap-compare ap-ds" aria-labelledby={labelId}>
      <Stage>
        <div className="ap-compare__image">
          {/* Media may be private or short-lived; no remote image optimization/cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={beforeSrc} alt={`${label} · 原图`} aria-hidden={!holding} draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ap-compare__after" src={afterSrc} alt={`${label} · ${aiLabel}`} aria-hidden={holding} draggable={false}
            style={{ opacity: holding ? 0 : 1 }} />
          {holding ? <span className="ap-compare__original">原图</span> : <span className="ap-compare__ai">{aiLabel}</span>}
        </div>
      </Stage>
      <figcaption className="ap-compare__caption" id={labelId}>{label}</figcaption>
      <HoldButton holding={holding} props={props} />
    </figure>
  );
}
