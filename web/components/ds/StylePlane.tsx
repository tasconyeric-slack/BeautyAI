"use client";

import { useId } from "react";
import "./tokens.css";

export interface StylePoint { x: number; y: number }
export interface StylePlaneProps {
  prototypes: { key: string; name: string; x: number; y: number }[];
  me: StylePoint & { r: number };
  preference?: StylePoint;
  target?: StylePoint;
  between?: [string, string];
}

// Same units as rules.yaml: visual_weight [1,5], angular_rounded [-2,2].
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const px = (x: number) => 48 + (clamp(finite(x, 3), 1, 5) - 1) * 76;
const py = (y: number) => 34 + (2 - clamp(finite(y, 0), -2, 2)) * 64;

export function StylePlane({ prototypes, me, preference, target, between }: StylePlaneProps) {
  const id = useId().replace(/:/g, "");
  return <figure className="ap-plane ap-ds">
    <svg viewBox="0 0 400 344" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>你的风格平面</title>
      <desc id={`${id}-desc`}>横轴从量感小到量感大，纵轴从直线感到曲线感。实心点是你的特征，圆圈表示可能的范围。{preference ? "空心圆表示你喜欢的方向。" : ""}{target ? "菱形表示你想去的方向。" : ""}</desc>
      <defs>
        <clipPath id={`${id}-clip`}><rect x="48" y="34" width="304" height="256" /></clipPath>
        <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker>
      </defs>
      <rect className="ap-plane__field" x="48" y="34" width="304" height="256" />
      <path className="ap-plane__grid" d="M48 98H352 M48 162H352 M48 226H352 M124 34V290 M200 34V290 M276 34V290" />
      <path className="ap-plane__axes" d="M48 162H352 M200 34V290" />
      <text className="ap-plane__axis" x="200" y="19" textAnchor="middle">曲线感</text>
      <text className="ap-plane__axis" x="200" y="311" textAnchor="middle">直线感</text>
      <text className="ap-plane__axis" x="48" y="332">量感小</text>
      <text className="ap-plane__axis" x="352" y="332" textAnchor="end">量感大</text>
      <g clipPath={`url(#${id}-clip)`}>
        <ellipse className="ap-plane__uncertainty" cx={px(me.x)} cy={py(me.y)} rx={clamp(finite(me.r, 0), 0, 4) * 76} ry={clamp(finite(me.r, 0), 0, 4) * 64} />
        {target && <line className="ap-plane__transition" x1={px(me.x)} y1={py(me.y)} x2={px(target.x)} y2={py(target.y)} markerEnd={`url(#${id}-arrow)`} />}
      </g>
      {prototypes.map((point) => <g key={point.key} className="ap-plane__prototype"><circle cx={px(point.x)} cy={py(point.y)} r="2" /><text x={px(point.x)} y={py(point.y) - 11} textAnchor="middle">{point.name}</text></g>)}
      {preference && <circle className="ap-plane__preference" cx={px(preference.x)} cy={py(preference.y)} r="7"><title>你喜欢</title></circle>}
      {target && <path className="ap-plane__target" d={`M${px(target.x)} ${py(target.y) - 8}l8 8-8 8-8-8z`}><title>你想去</title></path>}
      <circle className="ap-plane__me" cx={px(me.x)} cy={py(me.y)} r="6"><title>你的特征</title></circle>
    </svg>
    <figcaption>
      <ul className="ap-plane__legend"><li><i className="ap-key ap-key--me" />你的特征</li>{preference && <li><i className="ap-key ap-key--preference" />你喜欢</li>}{target && <li><i className="ap-key ap-key--target" />你想去</li>}</ul>
      {between && <p className="ap-plane__between">介于{between[0]}与{between[1]}之间</p>}
    </figcaption>
  </figure>;
}
