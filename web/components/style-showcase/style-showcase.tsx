"use client";

import { useState } from "react";
import Link from "next/link";
import { RadioGroup } from "radix-ui";
import { HoldButton, useHold } from "@/components/ds/HoldButton";
import { frameExamples, styleCases } from "./catalog";
import s from "./style-showcase.module.css";

/** Isolated reusable presentation; personal Studio/report state is never read or written. */
export function StyleShowcase() {
  const [person, setPerson] = useState(0);
  return <div className={s.root}>
    <header className={s.head}><p>造型示例</p><h1>换个发型，<br />看看不同的自己。</h1><p>先比较，再决定。保留现在的样子，也是一种选择。</p></header>
    <div className={s.people} aria-label="选择示例人物">{styleCases.map((c, i) => <button type="button" key={c.id} aria-pressed={person === i} onClick={() => setPerson(i)}>
      <img src={`/demo/portraits/person-${c.id}-frontal.webp`} alt="" width={64} height={80} loading="lazy" /><span>{c.label}</span>
    </button>)}</div>
    <HairExample key={person} person={person} />
    <FrameExamples />
    <footer className={s.footer}><h2>把选择，放回自己的照片里。</h2><p>从一张正脸开始，查看分析，再进入 Studio 尝试造型。</p><Link href="/start" prefetch={false} className={s.primary}>上传照片，开始分析</Link><Link href="/report/sample?v=p001" prefetch={false}>先读一份示例报告</Link></footer>
  </div>;
}

function HairExample({ person }: { person: number }) {
  const c = styleCases[person];
  const [selected, setSelected] = useState<string>(c.options[0].tier);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const hold = useHold();
  const option = c.options.find(o => o.tier === selected);
  const original = `/demo/portraits/person-${c.id}-frontal.webp`;
  const result = option ? `/style-showcase/p${c.id}-${option.tier}.png` : null;
  const showingOriginal = hold.holding || !result || failed[result] || !loaded[result];
  return <section className={s.hair} aria-label={`${c.label}发型比较`}>
    <figure className={s.figure}>
      <div className={s.portrait}>
        <img src={original} alt={`${c.label}的原有发型`} width={960} height={1200} draggable={false} aria-hidden={!showingOriginal} loading="lazy" />
        {result && !failed[result] && <img key={result} src={result} alt={`${c.label}的${option?.name} AI 造型模拟`} width={960} height={1200} draggable={false} className={s.result} style={{ opacity: showingOriginal ? 0 : 1 }} aria-hidden={showingOriginal} onLoad={() => setLoaded(prev => ({ ...prev, [result]: true }))} onError={() => setFailed(prev => ({ ...prev, [result]: true }))} loading="lazy" />}
        <span className={s.imageLabel}>{result && !loaded[result] && !failed[result] ? "效果图载入中" : showingOriginal ? "原有发型" : "AI 造型模拟"}</span>
      </div>
      <figcaption><span>AI 合成示例人物</span><HoldButton holding={hold.holding} props={hold.props} disabled={!option || Boolean(result && failed[result])} /></figcaption>
    </figure>
    <div className={s.controls}>
      <p className={s.kicker}>{c.label} · 发型探索</p><h2>同一个人，<br />几种风格的可能。</h2>
      <p>选一个方向看看。按住原图按钮，可以随时回看原来的发型。</p>
      <RadioGroup.Root value={selected} onValueChange={setSelected} aria-label="选择发型方案" className={s.options}>
        <RadioGroup.Item value="original" className={s.option}><span>现在</span><strong>保留原有发型</strong><i aria-hidden /></RadioGroup.Item>
        {c.options.map(o => <RadioGroup.Item key={o.tier} value={o.tier} className={s.option}><span>{o.label}</span><strong>{o.name}</strong><i aria-hidden /></RadioGroup.Item>)}
      </RadioGroup.Root>
      <p className={s.selection} aria-live="polite">{result && failed[result] ? "这张效果图暂时未能载入，先看看原有发型。" : option ? `正在查看：${option.name}` : "正在查看：原有发型"}</p>
      <p className={s.note}>AI 造型模拟用于比较外观，不代表实际剪发效果。示例中的方案供浏览；自己的造型方向以个人报告和偏好为准。</p>
      <Link href="/start" prefetch={false} className={s.primary}>找到我的造型方向</Link>
    </div>
  </section>;
}

function FrameExamples() {
  const [selected, setSelected] = useState<string>(frameExamples[0].id);
  const frame = frameExamples.find(f => f.id === selected)!;
  return <section className={s.frames} aria-labelledby="frames-title"><div className={s.frameHead}><h2 id="frames-title">从轮廓开始，<br />找到喜欢的镜框。</h2><p>圆弧、转角或轻微上扬。先看清不同轮廓，再到 Studio 里试试贴合。</p></div>
    <div className={s.frameLayout}><figure className={s.framePlate}><img src={`/style-showcase/${frame.id}.png`} alt={frame.name} width={640} height={320} loading="lazy" /><figcaption aria-live="polite">{frame.name}<span>{frame.detail}</span></figcaption></figure>
    <RadioGroup.Root value={selected} onValueChange={setSelected} aria-label="选择镜框轮廓" className={s.frameOptions}>{frameExamples.map(f => <RadioGroup.Item value={f.id} key={f.id} className={s.frameOption}><img src={`/style-showcase/${f.id}.png`} alt="" width={150} height={75} loading="lazy" /><span>{f.name}</span></RadioGroup.Item>)}</RadioGroup.Root></div>
    <p className={s.note}>这里展示镜框款式；照片上的外观模拟可在个人 Studio 中查看，不用于验配或尺寸测量。</p>
  </section>;
}
