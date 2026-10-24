# 形象护照 V2 · 并行执行指令

> 每段指令可以原样复制给对应的会话。任务细节以 `docs/v2/V2_TASKS.md` 为准，产品细节以 `docs/v2/aesthetic-passport-v2.html` 为准。
> 仓库：`tasconyeric-slack/BeautyAI-Assessment-System`。集成分支：`v2`。

---

## 1. Claude Code · 共享基础与核心集成

### 1.1 第一个会话：契约与核心（T00–T05，再接 B1）

```text
你在 BeautyAI-Assessment-System 仓库里开发形象护照 V2。先读 docs/v2/V2_TASKS.md 的第 0、1 节和第 8 节，再读 CLAUDE.md。
产品细节查 docs/v2/aesthetic-passport-v2.html 的 C、E、G 节，只读需要的部分。

按顺序完成，不在任务之间停下等待批准：
1. T00：从 main 建立分支 v2 并推送；修订 CLAUDE.md 不变量 1/5/7 与治理文档指向；在 DECISIONS.md 中标注 D2/D4/D6/D14/D17 的修订并新增 D19–D27（内容见 PRD G1）。提交。
2. T01：schema v0.3（passport、analysis、新增 quick 与 api 两个 schema）、女性与男性两份虚构样例、sample_geometry.json、make sample、make types、契约测试、SCHEMA.md。提交。
3. T02 与 T03：只需正脸的两段式管线、CV 新测量与 geometry 导出、美颜检测、analyzer-quick-0.1 与 analyzer-0.3、假模型 v0.3 输出；规则 v0.3（风格四层、apply_feedback、发型校验、眼镜尺寸、计划、穿搭一致性）。styles.yaml 与 garments.yaml 可能还不存在，缺失时跳过对应逻辑，不报错。各自提交。
4. T05：新路由、passport-store、api 客户端、adapters、flags、vitest 与 html-to-image 依赖、CI 加 npm test。提交。
5. T04：API v0.3 全部接口与表。提交。
6. B1：多目标试看、软保护回贴、颜色迁移、质量门、AI 标识、免费额度 1。提交。

规则：
- 每步结束跑 make test、make lint；前端跑 npm run typecheck、npm test、npm run build。保持全绿。
- 全程用假实现（ANALYSIS_PROVIDER=fake、IMAGE_EDIT_PROVIDER=fake），不需要任何密钥。
- 不要修改 config/styles.yaml、config/garments.yaml、config/hairstyles.json、web/components/{ds,cards}/**、web/lib/{tint,copy}/**：这些由并行智能体负责。
- 智能体的 PR 合入 v2 时由你审查、跑 CI、合并；它们需要改共享文件的请求在 PR 描述里，你来改。
- 只在这些情况停下来问：缺凭证、需要真人照片、单次预计超过 $5 的调用、部署、会违反修订后不变量的改动。
完成后用五行以内汇报：已合入的提交、测试状态、哪些智能体 PR 已合并、下一步。
```

### 1.2 第二个会话：工作流 A 集成与增量 1（A2、A3、A4、A9、D1 的 events 部分）

```text
继续形象护照 V2 开发，分支 v2。读 docs/v2/V2_TASKS.md 第 0、3 节与第 6 节 D1。
完成 A2（上传与同意）、A3（揭晓式进度）、A4（形象档案第一层）、A9（基础反馈与调整面板），并接好 D1 的 events 与 ref 透传。
然后合并已完成的智能体 PR（A1、A5、A6、A7、A8、A10、D1 页面、K1–K7），解决集成问题，补 adapters。
最后加一条 Playwright 端到端测试（假模型）：/t/style → /start 上传合成图 → /p/[id] 揭晓 → 档案 → 风格页“我更喜欢另一种” → 重排提示 → 分享页导出档案卡 → 删除。
保持 CI 全绿。完成后按 1.4 的发布步骤准备增量 1，部署前停下来问 Yeric。
```

### 1.3 第三个会话：增量 2（D2、B5 眼镜试戴，合并 B2–B4、B3、B5 页面）

```text
继续形象护照 V2，分支 v2。增量 1 已发布。读 V2_TASKS.md 第 4 节与第 6 节 D2。
完成 D2（假支付、webhook 幂等、passports.paid、服务端按 entitlement 裁剪付费字段、邀请码、config/pricing.yaml 单一价格 ¥39、/p/[id]/unlock），
在 B1 上加 kind=glasses 的试戴与 prompts/image_edit.md 的眼镜段落，
合并 B2、B3、B4、B5 的页面 PR 与 K2、K3 数据，处理付费墙位置（只在 PRD F4 列出的位置）。
端到端测试补充：未付费只见“稳妥”方向 → 解锁 → 三方向与发型师卡可见。保持 CI 全绿。之后按 1.4 发布增量 2。
```

### 1.4 发布与关键路径验证（I1，每个增量一次）

```text
为增量 <N> 执行 I1（docs/v2/V2_TASKS.md 第 7 节）：
1. 确认 v2 上 CI 全绿，make test、make lint、npm run build 通过。
2. 检查 data/ 下是否有 Yeric 提供的 5–10 组经同意的照片；没有就停下来请 Yeric 提供（说明需要正脸，女性长发、刘海、卷发为主）。
3. 用真实模型跑完关键路径，记录首次通过率、p50 延迟、单份成本、试看是否截断、安全词命中，写入 docs/ITERATION_LOG.md。预计花费超过 $5 时先问。
4. 有问题时优先启用降级（试看降级为款式插画、置信度提示），不扩大评测范围。
5. 准备 v2 → main 的 PR，列出本增量内容与 I1 结果，然后停下来请 Yeric 确认部署。
```

---

## 2. 独立智能体 · 可立即开始

每段都可以直接交给一个独立编码智能体。公共要求已写在每段末尾，不需要另外说明。

### K1 · 八型风格规则库

```text
仓库 tasconyeric-slack/BeautyAI-Assessment-System。从 v2 分支（不存在则从 main）建分支 v2/k1-styles。
任务：编写 config/styles.yaml 与 tests/test_styles_config.py，规格见 docs/v2/V2_TASKS.md 的 K1（如该文件尚未合入，以本段为准）。
要点：八个键 sweet/boyish/modern/elegant/classic/natural/romantic/dramatic，对应 少女型/少年型/前卫型(modern)/优雅型/古典型/自然型/浪漫型/戏剧型；
每种风格写 summary_zh、keywords_zh、rules_zh（面料、廓形、图案、配饰、领口、发型提示、妆容提示），按 feminine/masculine/neutral 各给 3 个示例与避免项，
并给出到至少两个相邻风格的过渡方案（保留什么、加入什么）。语气描述视觉印象，不评判容貌，不出现品牌名，不出现 config/rules.yaml 中 safety_terms 的词。
只改这两个文件。跑 make test 与 make lint。提交并向 v2 开 PR，描述里列出风格规则的设计依据。
```

### K2 · 单品本体库

```text
仓库同上。分支 v2/k2-garments。
任务：config/garments.yaml（≥150 条）与 tests/test_garments_config.py，字段见 V2_TASKS.md K2：
id、category、name_zh、silhouette、fabric、neckline、styles[]（八型键名）、frames[]（straight/wave/natural）、presentations[]、color_slot（near_face/base/accent）、occasions[]、search_tpl。
覆盖：每种风格 feminine ≥15 条、masculine 与 neutral 各 ≥8 条。名称用国内电商常用叫法，不出现品牌。
测试校验 id 唯一、枚举合法、覆盖数、search_tpl 能用色名展开。只改这两个文件。make test、make lint 通过后向 v2 开 PR。
```

### K3 · 发型库扩充

```text
仓库同上。分支 v2/k3-hairstyles。
任务：把 config/hairstyles.json 从 25 款扩充到 ≥60 款（feminine ≥35），新增字段见 V2_TASKS.md K3。
绝对不要改名或删除现有条目与字段（src/aesthetic_passport/rules.py 的 hair_references 依赖它们），保留 _source 与 MIT 来源说明。
女性款覆盖 下巴/锁骨/肩下/胸前 四种长度、空气/八字/齐/侧/无 刘海、直/C 卷/法式波浪/羊毛卷；每款三句发型店口语话术（barber_script_zh），价格区间用人民币。
新增 tests/test_hairstyles_catalog.py。make test 必须全绿（含现有规则测试）。在 PR 描述里写一行请 Claude Code 更新 THIRD_PARTY.md。只改这两个文件。
```

### K4 · 设计系统与通用组件

```text
仓库同上，前端在 web/（Next.js 16、React 19、Tailwind 4、TypeScript strict）。分支 v2/k4-design-system。
任务：在 web/components/ds/ 下实现 tokens.css 与组件 Stage、CompareView、StylePlane、FeedbackChips、ResembleToggle、SwatchRow、SwatchGrid、ConfidenceNote、PaywallCard、ScoreTeaserCard、ProfileTriptych、RevealSteps，
props 接口见 docs/v2/V2_TASKS.md K4；视觉方向见 docs/v2/aesthetic-passport-v2.html 的 D4（阅读底雾白、深色中性舞台放人像、墨青为主色、琥珀为强调、思源宋体标题、思源黑体正文、等宽数字）。
组件只接收普通 props，不要导入 web/lib/passport.ts。ScoreTeaserCard 只渲染固定文案“颜值评分 · 即将上线”和“上线时告诉我”按钮，不接受任何数字。
再做一个开发预览页 web/app/dev/components/page.tsx（生产环境返回 404）。
测试：每个组件一个渲染测试；若 web 还没有 vitest，就在 web/components/ds/ 内放本地配置并在 PR 描述中请 Claude Code 合并到 package.json。
只改 web/components/ds/** 与 web/app/dev/**。npm run typecheck 与 npm run build 通过后向 v2 开 PR，附 375 px 与 1280 px 两张预览截图。
```

### K5 · 确定性着色模块

```text
仓库同上。分支 v2/k5-tint。
任务：在 web/lib/tint/ 实现 drape、lipTint、blush、tone 四个纯函数，接口与算法要求见 docs/v2/V2_TASKS.md K5：
输入 ImageData + FaceGeometry（归一化多边形）+ 颜色，返回新的 ImageData，不修改输入；Lab 空间着色保留纹理；腮红径向渐变加高斯羽化；
内唇（牙齿）与双眼永远在排除蒙版内；不调用任何模型或网络。
测试用程序生成的合成图片与多边形（如 web/lib/fixtures/sample_geometry.json 尚未存在，就在测试里自建同结构数据），断言：目标区外像素逐一相等、牙齿与眼睛像素不变、同输入同输出、输入未被修改，并记录 1080×1350 的耗时。
只改 web/lib/tint/**。不提交任何真人照片。typecheck 通过后向 v2 开 PR。
```

### K6 · 分享卡模板

```text
仓库同上。分支 v2/k6-cards。
任务：在 web/components/cards/ 实现 ProfileCard（3:4，1080×1440，avatar/palette/portrait 三种模式）、StylistCard、BeforeAfterCard（3:4 与 9:16）、IllustratedAvatar（纯 SVG，由发型参数、发色、色卡、表达方向生成，绝不读取照片）、exportPng（html-to-image 导出并写入 PNG tEXt 块 AIGC 元数据）。
接口见 docs/v2/V2_TASKS.md K6；视觉是精致的编辑风：大号衬线标题、用户本人色卡、风格平面落点、留白充足，不要灰色剪影。
所有卡片左下固定“AI 生成”标识、产品署名“形象护照”和短链位。AIGC 元数据字段名以《人工智能生成合成内容标识办法》配套国家标准为准，在 PR 中注明出处。
测试：avatar 与 palette 模式没有指向照片的 img；三种卡都含标识与署名；导出的 PNG 能读回 AIGC 块。
只改 web/components/cards/**。若需要 html-to-image 依赖而 package.json 还没有，在 PR 描述中请 Claude Code 添加。向 v2 开 PR，附三种模式的导出样图（用虚构数据）。
```

### K7 · 中文文案库

```text
仓库同上。分支 v2/k7-copy。
任务：在 web/lib/copy/zh.ts 集中编写 V2 全部用户可见文案，清单见 docs/v2/V2_TASKS.md K7：同意页与隐私事实、上传要点、每个质检原因码的原因与做法（原因码以 src/aesthetic_passport/qc.py 和 config/qc.yaml 为准，再加 beauty_filter_suspect）、
五个话题入口（面部美学、脸型与发型、八型风格、个人色彩、穿搭）、落地页四屏、表达方向问题、反馈原因标签、调整面板、付费墙、评分预告（只写“即将上线”，没有数字）、分享卡与小红书文案模板。
语气：专业、温和、具体；女性优先但不排斥男性与中性；不使用“颜值”“打分”“标准脸”“完美”“缺陷”“显胖”“显瘦”“变美”“逆袭”“整容”等词（评分预告固定文案除外，列入白名单）。
另写 web/lib/copy/SAFETY_TERMS_PROPOSAL.md，列出建议加入 rules.yaml 的禁用词。测试 zh.test.ts 校验原因码覆盖与禁用词。只改 web/lib/copy/**。向 v2 开 PR。
```

---

## 3. 独立智能体 · 依赖 T05 的页面任务

T05 合入 `v2` 后即可同时启动。每段的公共部分：

```text
仓库 tasconyeric-slack/BeautyAI-Assessment-System，从 v2 分支建 v2/<任务号>-<短名>。
先读 docs/v2/V2_TASKS.md 第 0 节和你的任务段落，产品细节查 docs/v2/aesthetic-passport-v2.html 对应的 F 编号与 D3 线框。
数据从 web/lib/state 的 usePassport() 取，组件用 web/components/ds 与 web/components/cards，文案用 web/lib/copy，着色用 web/lib/tint。
只改任务中列出的目录；需要新的 adapter、API 字段或共享改动时写在 PR 描述里，由 Claude Code 处理。
在 NEXT_PUBLIC_USE_FIXTURE=1 下必须能完整演示。npm run typecheck、npm test、npm run build 通过后向 v2 开 PR，附 375 px 截图。
```

再附上任务专属的一句话：

| 任务 | 追加指令 |
|---|---|
| A1 | 实现落地页（F1）：`web/app/page.tsx` 与 `web/components/landing/**`；一个主按钮、一行五个话题链接、案例卡、隐私三条事实、受开关控制的评分预告卡。 |
| A5 | 实现面部美学页（F6）：`web/app/p/[id]/face/**`、`web/components/face/**`；三庭五眼与轮廓叠加、特点 → “所以”跳转、常见范围灰带、评分预告卡与 `score_teaser_click` 事件。页面上不得出现任何分数。 |
| A6 | 实现色彩页与数字披布（F7）：`web/app/p/[id]/color/**`、`web/components/color/**`；三组色卡、点色块换布、两色并排、按住看原图、复制搜索词。 |
| A7 | 实现风格页四层（F8）：`web/app/p/[id]/style/**`、`web/components/style/**`；平面图、四层分开显示、风格规则、“我更喜欢另一种”触发 feedback 与 rerank，`face_only` 点不动。 |
| A8 | 实现渐进补充（F3）：`web/app/p/[id]/more/**`、`web/components/enrich/**`；侧脸（选填上传）、发质、想要的感觉、身形自选、风格偏好与目标、现实条件，每项可单独提交与跳过。 |
| A10 | 实现分享与删除（F17 增量 1）：`web/app/p/[id]/share/**`、`web/app/s/[token]/**`、`web/components/share/**`；三种卡片模式、肖像每次单独勾选、导出 PNG、只读链接、删除确认页。 |
| D1 | 实现话题入口：`web/app/t/[topic]/**`、`web/components/topic/**`；五个话题只换首屏文案与示例，带 topic 与 ref 进入 /start。 |
| C2 | （增量 1 发布后）实现详细分析：`web/app/p/[id]/detail/**`、`web/components/detail/**`；图层切换、观察高亮、方法说明折叠区。 |
| B2 | （增量 1 发布后）实现发型页（F9）：`web/app/p/[id]/hair/**`、`web/components/hair/**`；三方向 + 现在、比较模式、反馈、发型师卡、免费只见“稳妥”。 |
| B3 | （增量 1 发布后）实现穿搭推荐（F10）：`web/app/p/[id]/outfit/**`、`web/components/outfit/**`；公式、单品、场合、领口对比、复制搜索词、免费前 2 条公式。 |
| B4 | （增量 1 发布后）实现妆容试色（F11）：`web/app/p/[id]/makeup/**`、`web/components/makeup/**`；唇色三档浓度、腮红三位置、原图切换 < 50 ms、男性理容视图。 |
| B5 | （增量 1 发布后）实现眼镜与计划（F13、F14）：`web/app/p/[id]/{glasses,plan}/**`、`web/components/{glasses,plan}/**`；尺寸卡、形状试戴入口、三栏计划可勾选。 |

---

## 4. 最终集成（每个增量末，由 Claude Code 执行）

```text
1. 按依赖顺序合并该增量的全部 PR 到 v2：先数据与组件（K*），再页面（A*/B*/C*/D*），最后集成改动。每合一个跑一次 CI。
2. 补齐 web/lib/adapters 与路由跳转；删除已无用的 V1 组件引用（保留 how-we-know、evidence 等被复用的部分）。
3. 跑 Playwright 端到端（假模型）覆盖该增量的关键路径；跑 make test、make lint、npm run typecheck、npm test、npm run build。
4. 执行 I1（第 1.4 段）。
5. 开 v2 → main 的 PR，写明本增量功能、已知降级与 I1 数据；停下来请 Yeric 确认部署。
```

---

## 5. 立即构建顺序

1. **现在，Claude Code**：执行 1.1 段。第一个提交是 T00（决定记录与不变量），紧接 T01（schema v0.3）。
2. **现在，同时**：把 K1–K7 七段指令分别交给七个独立智能体。它们不依赖任何代码改动。
3. **T05 合入后**：同时启动 A1、A5、A6、A7、A8、A10、D1 七个页面智能体；Claude Code 继续 T04、B1，然后执行 1.2 段（A2、A3、A4、A9 与集成）。
4. **第一个可部署增量（增量 1，约第 3 周）**：上传正脸 → 揭晓 → 形象档案（面部、色彩与数字披布、风格八型四层）→ 基础反馈即时重排 → 1 张“稳妥”发型试看 → 3:4 档案卡 → 删除；五个话题入口；评分预告默认关闭。门槛：CI 全绿 + I1。
5. **增量 2**：B2–B5、D2、K2、K3 → 发型三方向与发型师卡、穿搭推荐、妆容试色、眼镜与计划、单次付费（假支付 + 邀请码）。执行 1.3 段。
6. **增量 3**：C1 穿搭检测、C2 详细分析、C3 高级反馈与轻账户、C4 的白纸校准。
7. **增量 4**：C4 的揭晓视频与剪后回访、D3 真实支付（需要商户凭证）。
