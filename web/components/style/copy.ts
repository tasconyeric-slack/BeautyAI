/** Style-page strings not yet in web/lib/copy/zh.ts (`style`). Proposed for K7 under `style.*`; move there when merged. */
export const styleLocal = {
  kicker: "风格方向",
  disclaimer: "风格八型是形象行业描述视觉印象的惯例叫法，不是诊断结果，也不评价长相。",
  layers: {
    features: { n: "①", title: "你的特征", kicker: "观察到的" },
    looks: { n: "②", title: "看起来像", kicker: "据此推断" },
    likes: { n: "③", title: "你喜欢", kicker: "你的偏好" },
    wants: { n: "④", title: "你想去", kicker: "你的目标" },
  },
  featuresHint: "来自照片的观察，编号可在“详细分析”里对照。",
  noEvidence: "这一项的依据较少，先作方向参考。",
  between: (a: string, b: string) => `介于${a}与${b}之间`,
  near: (a: string, b: string) => `主方向是${a}，相邻的是${b}`,
  circle: "圆圈是可能的范围：圈越大，照片里能确认的依据越少。",
  lowConfidence: "依据有限，这里只给大致区域，不给具体类型。补充一张光线均匀的正脸照会更准。",
  overall: (frame: string, words: string[]) =>
    words.length
      ? `加入你自选的身形（${frame}）后，整体方向${words.join("、")}；面部落点不变。`
      : `加入你自选的身形（${frame}）后，整体方向与面部落点基本一致。`,
  overallMissing: "想看整体方向？在“补充一点”里自选身形即可，不会分析身材照片。",
  overallLink: "去补充",
  likesEmpty: "还没有选。下面可以选你喜欢的风格，推荐会向它倾斜，观察到的特征不变。",
  dislikedPrefix: "暂不考虑：",
  wantsEmpty: "还没有选。想尝试别的方向时，在下面选“我想去”。",
  transition: (from: string, to: string, words: string[]) =>
    words.length ? `从${from}走向${to}：${words.join("、")}。先替换一件现有单品试试。` : `${to}和你现在的方向很接近，先从配饰开始调整。`,
  picker: {
    modes: { like: "我喜欢", target: "我想去", dislike: "暂不考虑" },
    hint: { like: "点选你喜欢的风格，可多选；再点一次取消。", target: "选一个想去的方向，平面图上会出现过渡箭头。", dislike: "点选暂时不想尝试的风格。" },
    looks: "看起来像",
    lastChange: "刚刚的调整",
  },
  rulesTitle: "你的风格规则",
  rulesSub: (name: string) => `按${name}整理，每一行都可以直接用在下一次买衣服或搭配上。`,
  toOutfit: "看按这个方向的穿搭",
} as const;
