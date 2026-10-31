import Link from "next/link";
import s from "@/components/profile/information.module.css";

export const metadata = { title: "穿搭检测" };

/** Increment 3 (C1). */
export default function CheckPage() {
  return (
    <div className={s.page}>
      <header className={s.header}><span className="text-[12px] text-muted">即将上线</span><h1>穿搭检测</h1></header>
      <div className={s.coming}>
        <p>拍一张今天的穿搭，得到一个最值得的调整。只分析衣物颜色、廓形与构图，照片处理完即删，不评价身材。</p>
        <section className={s.status}><h2>先找到自己的风格方向</h2><p>穿搭检测正在准备中。你可以先建立形象护照，查看现有的色彩与穿搭建议。</p><Link href="/start" className={s.action}>先做一份形象护照</Link></section>
      </div>
    </div>
  );
}
