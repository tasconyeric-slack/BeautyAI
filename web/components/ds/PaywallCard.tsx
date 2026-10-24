"use client";

import "./tokens.css";

export interface PaywallCardProps { title: string; bullets: string[]; onUnlock: () => void }

export function PaywallCard({ title, bullets, onUnlock }: PaywallCardProps) {
  return <section className="ap-paywall ap-ds">
    <p className="ap-eyebrow">继续探索 · 完整护照</p>
    <h3>{title}</h3>
    <ul>{bullets.map((bullet, index) => <li key={index}><span aria-hidden="true">↗</span>{bullet}</li>)}</ul>
    <button className="ap-button" type="button" onClick={onUnlock}>解锁完整护照<span aria-hidden="true">↗</span></button>
  </section>;
}
