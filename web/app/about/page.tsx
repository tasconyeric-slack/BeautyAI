import { consent, privacy } from "@/lib/copy/zh";

export const metadata = { title: "照片与数据说明" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-serif text-[26px] font-semibold">{privacy.title}</h1>
      <ul className="mt-5 space-y-3 text-[14px] leading-7">
        <li>{consent.purpose}</li>
        <li>{consent.retention}</li>
        <li>{privacy.unsavedPassport}</li>
        <li>{consent.deleteInstruction}</li>
        <li>{privacy.noTraining}</li>
        <li>{privacy.shareDefault}</li>
      </ul>
      <h2 className="mt-10 font-serif text-[20px] font-semibold">我们怎样得出结论</h2>
      <p className="mt-3 text-[14px] leading-7 text-ink-soft">
        比例与取色由关键点模型在你的正脸照片上测量；面部特点与建议由一个分析模型给出，并且必须引用具体观察；排序、校验、镜框尺寸和计划由固定的规则计算。
        你的反馈只改变推荐的顺序，不改写观察本身。所有 AI 试看图都带有“AI 试看”标识。
      </p>
      <p className="mt-3 text-[13px] text-muted">本产品只描述特点、给出造型建议，不评判长相，不提供医美或皮肤科建议，不推断年龄、民族、健康或体型。</p>
    </div>
  );
}
