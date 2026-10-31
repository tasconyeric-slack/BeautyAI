import { consent, privacy } from "@/lib/copy/zh";
import s from "@/components/profile/information.module.css";

export const metadata = { title: "照片与数据说明" };

export default function AboutPage() {
  return (
    <div className={s.page}>
      <header className={s.header}><span className="text-[12px] text-muted">关于形象护照</span><h1>{privacy.title}</h1></header>
      <ul className={s.facts}>
        <li>{consent.purpose}</li>
        <li>{consent.retention}</li>
        <li>{privacy.unsavedPassport}</li>
        <li>{consent.deleteInstruction}</li>
        <li>{privacy.noTraining}</li>
        <li>{privacy.shareDefault}</li>
      </ul>
      <section className={s.reading}><h2>我们怎样得出结论</h2>
      <p className="mt-3 text-[14px] leading-7 text-ink-soft">
        比例与取色由关键点模型在你的正脸照片上测量；面部特点与建议由一个分析模型给出，并且必须引用具体观察；排序、校验、镜框尺寸和计划由固定的规则计算。
        你的反馈只改变推荐的顺序，不改写观察本身。所有 AI 试看图都带有“AI 试看”标识。
      </p>
      <p className="mt-3 text-[13px] text-muted">本产品提供面部测量、颜值评分与造型建议，不提供医美或皮肤科建议，不推断年龄、民族、健康或体型。</p>
      <details id="data-sources" className="mt-8 scroll-mt-24 text-[13px] leading-7 text-muted">
        <summary className="cursor-pointer">数据来源与许可</summary>
        <p>比例分布数据来源于 <a className="underline" href="https://thefacereport.com/guides/facial-measurement-norms">The Face Report</a>，
          采用 <a className="underline" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> 许可；关键点定义经适配。
          完整署名和使用范围见 <a className="underline" href="https://github.com/tasconyeric-slack/BeautyAI/blob/main/THIRD_PARTY.md">第三方来源清单</a>。</p>
      </details>
      </section>
    </div>
  );
}
