"use client";

import * as React from "react";

/** Shows a fixed-size card (e.g. 1080×1440) scaled to the container width. The inner node keeps its real size,
 * so `exportPng` can render it at full resolution (pass the [data-card] element inside). */
export function Scaled({ width = 1080, height = 1440, children, className }: {
  width?: number; height?: number; children: React.ReactNode; className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.3);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className={className} style={{ height: height * scale, overflow: "hidden", position: "relative" }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", left: 0, top: 0 }}>
        {children}
      </div>
    </div>
  );
}
