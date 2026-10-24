import Link from "next/link";

export const metadata = { title: "穿搭检测" };

/** Increment 3 (C1). */
export default function CheckPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-[12px] tracking-[0.18em] text-muted">即将上线</p>
      <h1 className="mt-2 font-serif text-[24px] font-semibold">穿搭检测</h1>
      <p className="mt-3 text-[14px] leading-7 text-ink-soft">拍一张今天的穿搭，得到一个最值得的调整。只分析衣物颜色、廓形与构图，照片处理完即删，不评价身材。</p>
      <Link href="/start" className="mt-6 inline-block text-accent underline-offset-4 hover:underline">先做一份形象护照</Link>
    </div>
  );
}
