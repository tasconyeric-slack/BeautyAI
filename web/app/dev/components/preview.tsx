"use client";

import { useState } from "react";
import { CompareView, StylePlane, FeedbackChips, ResembleToggle, SwatchRow, SwatchGrid, ConfidenceNote, PaywallCard, ScoreTeaserCard, ProfileTriptych, RevealSteps, Stage, type FeedbackValue } from "@/components/ds";
import "./preview.css";

const colors = [
  { hex: "#344B58", name_zh: "雾蓝" }, { hex: "#D9CFBD", name_zh: "燕麦" },
  { hex: "#866B68", name_zh: "烟玫瑰" }, { hex: "#78847B", name_zh: "鼠尾草" },
  { hex: "#434B48", name_zh: "苔绿" }, { hex: "#B49F89", name_zh: "浅驼" },
];
const prototypes = [
  { key: "sweet", name: "少女型", x: 1.8, y: 1.2 }, { key: "boyish", name: "少年型", x: 1.7, y: -1.1 },
  { key: "modern", name: "前卫型", x: 2.5, y: -1.5 }, { key: "elegant", name: "优雅型", x: 3, y: 1.2 },
  { key: "classic", name: "古典型", x: 3, y: 0 }, { key: "natural", name: "自然型", x: 3.1, y: -.9 },
  { key: "romantic", name: "浪漫型", x: 4.2, y: 1.3 }, { key: "dramatic", name: "戏剧型", x: 4.2, y: -1.3 },
];

// Entirely synthetic vector artwork. No real person or photo-derived data.
function portrait(after: boolean) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
    <rect width="600" height="750" fill="#242b2c"/><circle cx="306" cy="310" r="245" fill="#303938"/>
    <path d="M126 750V557c0-49 46-69 95-81h155c63 15 101 39 101 87v187" fill="${after ? "#73837d" : "#516875"}"/>
    <path d="M153 257c0-126 61-182 149-182 103 0 158 71 158 180l-7 249-93 38-149-31-62-16z" fill="#2b211e"/>
    <path d="M255 398v82c0 47 91 47 91 0v-82" fill="#c79578"/><path d="m215 487 85 70 84-70-33-17-51 30-50-30" fill="#d8ad91"/>
    <path d="M199 239c0-93 46-122 102-122 72 0 109 52 109 125v76c0 82-58 139-109 139-54 0-102-61-102-142z" fill="#d8ad91"/>
    <path d="M200 262c-26-14-27 51 0 62M409 262c25-14 26 51 0 62" fill="#c79578"/>
    <path d="M222 263q25-16 48-2M333 262q23-15 45 2" fill="none" stroke="#493329" stroke-width="5" stroke-linecap="round"/>
    <path d="M227 282q19-9 37 0m73 0q18-9 36 0" fill="none" stroke="#3c302b" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="247" cy="283" rx="4" ry="5" fill="#352e2a"/><ellipse cx="353" cy="283" rx="4" ry="5" fill="#352e2a"/>
    <path d="m301 284-9 48 15 3" fill="none" stroke="#b78368" stroke-width="2" stroke-linecap="round"/>
    <path d="M271 366q31 11 61-2-29 31-61 2" fill="#a86d61"/><path d="M273 365q28 4 57-1" stroke="#7e5049" fill="none"/>
    <path d="M240 324q-12 9-18 0m137 0q12 9 18 0" fill="none" stroke="#c3947d" stroke-width="4" stroke-linecap="round"/>
    ${after ? `<path d="M177 331c-18-89-7-172 60-207 39-20 113-36 148 17-67-24-103-7-135 36-22 28-22 75-42 100v139q-44-24-31-85M371 145c91 21 75 169 51 206-11 25-4 46 13 65l-46 19c11-72 1-133-8-179-6-31-10-64-10-111" fill="#30241f"/><path d="M189 278q-17-108 65-143M410 233q-5-61-25-76" stroke="#6b5141" stroke-width="3" fill="none"/>` : `<path d="M182 290c-31-155 31-197 119-197 108 0 152 80 118 208l-26-72c-30-15-54-44-73-73-23 45-60 69-108 81l-10 184-30 56z" fill="#30241f"/><path d="M180 266q-18-122 94-151M416 264q-2 131 11 210" stroke="#654d3e" stroke-width="3" fill="none"/>`}
    <path d="m218 490 82 67 82-67M300 557v193" fill="none" stroke="${after ? "#bac3b3" : "#a7b8bd"}" stroke-width="2"/>
    <circle cx="207" cy="334" r="5" fill="#c5ae79"/><circle cx="400" cy="334" r="5" fill="#c5ae79"/>
    <path d="M55 62h34M55 62v34M545 62h-34M545 62v34M55 688h34M55 688v-34M545 688h-34M545 688v-34" fill="none" stroke="#c7c9be" stroke-width="1" opacity=".5"/>
  </svg>`)}`;
}

export function ComponentGallery() {
  const [feedback, setFeedback] = useState<FeedbackValue>(null);
  const [resemblance, setResemblance] = useState<"yes" | "no" | null>(null);
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  return <div className="ap-preview ap-ds" data-ap-theme={theme}>
    <div className="ap-preview__inner">
      <header className="ap-preview__masthead"><span>AESTHETIC PASSPORT <i>/</i> DESIGN LIBRARY</span><button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "深色阅读" : "浅色阅读"}<span aria-hidden="true">◐</span></button></header>
      <div className="ap-preview__intro"><p className="ap-eyebrow">形象护照 · 组件样本 / V2</p><h1>看见特点，<br />找到自己的方向。</h1><p>从一张照片出发，把观察变成可以尝试的选择。</p></div>
      <section className="ap-preview__hero" aria-labelledby="image-title">
        <div><div className="ap-preview__section-label"><span className="ap-numeral">01 / 影像对照</span><span>合成插画示例</span></div><CompareView beforeSrc={portrait(false)} afterSrc={portrait(true)} label="保留你的特点，尝试新的轮廓" aiLabel="AI 试看" /></div>
        <div className="ap-preview__hero-copy"><p className="ap-eyebrow">你的特点，是起点</p><h2 id="image-title">柔和的线条，<br />也可以很有力量。</h2><p className="ap-preview__body">保留自然的轮廓，用更轻盈的层次与低饱和色彩，让整体表达更接近你喜欢的方向。</p><div className="ap-preview__palette-heading"><h3>让颜色，替你说话</h3><span>近脸色方向</span></div><SwatchRow colors={colors.slice(0, 4)} /><div className="ap-preview__feedback"><p>这个方向，你觉得如何？</p><FeedbackChips value={feedback} reasons={["不适合日常", "打理时间长", "想试另一种感觉"]} onChange={(value, reasons) => { setFeedback(value); setMessage(reasons.length ? `已记下：${reasons.join("、")}` : value ? "已记下你的偏好" : ""); }} /></div><ConfidenceNote level="medium" tip="这是可尝试的方向。实际发型还会受到发质、长度与日常打理方式影响。" /></div>
      </section>
      <section className="ap-preview__section" aria-labelledby="profile-title"><div className="ap-preview__section-head"><div><p className="ap-eyebrow">02 / 形象档案</p><h2 id="profile-title">认识自己，从三个角度开始。</h2></div><p>观察、色彩与风格，各自清晰呈现。</p></div><ProfileTriptych face={<><h3>轮廓清晰，线条柔和</h3><p>用轻盈的层次，延续自然的轮廓节奏。</p></>} color={<><h3>安静的低饱和色</h3><SwatchRow colors={colors.slice(0, 3)} /></>} style={<><h3>优雅与古典之间</h3><p>简洁的廓形，加入一点柔和的细节。</p></>} /></section>
      <section className="ap-preview__section ap-preview__style" aria-labelledby="style-title"><div><p className="ap-eyebrow">03 / 风格坐标</p><h2 id="style-title">你在哪里，<br />你想去哪里。</h2><p className="ap-preview__body">实心点记录你的特征，空心点留给你的偏好。推荐可以随心意调整，观察始终保留。</p><ResembleToggle value={resemblance} onChange={(value) => { setResemblance(value); setMessage(value === "yes" ? "已记下：这个描述像你" : value === "no" ? "已记下：你希望调整描述" : ""); }} /><ConfidenceNote level="low" tip="圆圈是可能的范围。相邻方向之间没有一条绝对的分界线。" /></div><StylePlane prototypes={prototypes} me={{ x: 3.2, y: .6, r: .46 }} preference={{ x: 3.6, y: 1.1 }} target={{ x: 4.05, y: .3 }} between={["优雅型", "古典型"]} /></section>
      <section className="ap-preview__section ap-preview__details" aria-labelledby="reveal-title"><div><p className="ap-eyebrow">04 / 逐步揭晓</p><h2 id="reveal-title">一份护照，慢慢展开。</h2><RevealSteps steps={[{ label: "面部特点", value: "清晰轮廓 · 柔和线条" }, { label: "个人色彩", value: "先从低饱和的近脸色开始" }, { label: "你的尝试计划", value: null }]} /></div><div><p className="ap-eyebrow">衣橱里的色彩伙伴</p><SwatchGrid colors={colors} /><div className="ap-preview__stage-sample"><Stage><p>中性深灰舞台</p><span>让影像与颜色成为主角</span></Stage></div></div></section>
      <section className="ap-preview__section ap-preview__closing" aria-label="更多探索"><PaywallCard title="把方向，带到生活里。" bullets={["探索稳妥、提升与突破的发型方向", "保存一张发型师沟通卡", "把色彩与风格变成日常搭配"]} onUnlock={() => setMessage("预览示例：解锁按钮已响应")} /><div><p className="ap-eyebrow">敬请期待</p><h2>更多认识自己的方式，<br />正在准备中。</h2><ScoreTeaserCard onNotify={() => setMessage("预览示例：已记下通知意向")} /><p className="ap-preview__small">开发组件预览 · 所有内容均为虚构示例</p></div></section>
      <div className="ap-preview__status" role="status" aria-live="polite">{message}</div>
      <footer className="ap-preview__footer"><span>形象护照</span><span>属于你的观察，属于你的选择。</span><span className="ap-numeral">END / V2</span></footer>
    </div>
  </div>;
}
