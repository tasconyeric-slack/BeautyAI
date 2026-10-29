# 迭代日志

每次改 Prompt、规则或 Schema 并影响输出时记一行。复盘长文从这里取材。

| 日期 | 改动 | 原因 | 前 → 后（指标） |
|---|---|---|---|
| 2026-09-29 | Schema v0.1、rules 0.1.0、analyzer-0.1、judge-0.1、preview-0.1 初版 | W1 核心产物 | — |
| 2026-09-29 | `visual_edit_spec.target_description` 上限 240 → 360 字符 | 样例中一条可用的发型描述即超过 240，校验器拦截 | 样例通过校验 |
| 2026-09-29 | 生产模型改为 DeepSeek `deepseek-flash`（JSON 模式）；analyzer-0.1 的 SYSTEM 末尾追加完整 Schema；新增输出契约检查并纳入重试 | D10、D12：JSON 模式不保证符合 Schema | — （尚无真实运行） |
| 2026-10-22 | S0：`MVP_BRIEF.md` 取代 PLAN 流程（D13–D18）；DeepSeek 价格填入峰时价（0.006 / 0.30 / 1.20 美元每百万 token）；新增 `thinking: disabled` 配置 | 简报 §3 已核实官方文档 | 成本可估算（此前为 null） |
| 2026-10-22 | S2：analyzer（一次修复重试、calls.jsonl）、pipeline CLI、`scripts/ab_thinking.py`、`scripts/summarize_runs.py`（首次通过率、p50/p90、成本、安全词检查、稳定性）；安全词表放入 `config/rules.yaml → safety_terms` | 简报 §6.4、§9 | 假模型：1/1 首次通过、安全词 0 命中。**真实指标待补**：需要 `DEEPSEEK_API_KEY` 与 `data/` 下的照片集（思考模式 A/B 同样待跑） |
| 2026-10-22 | S3：MediaPipe 质检（警告 / 拒绝两级阈值）、锚点、脸型启发式（MIT 移植，权重入 `rules.yaml`）；关键点编号经叠图核对：额宽用 54/284（颞部最宽处），启发式额宽用 103/332（原作校准所用） | 简报 §6.1、§6.2 | 合成坏图 7 类全部按正确原因拒绝；两张正脸测试照通过（warn：脸偏小 / 高光）；端口与原公式逐项一致；单张质检约 30 ms |
| 2026-10-22 | S4：Schema v0.2、analyzer-0.2、rules 0.2.0（C11、C12、季型门控、参考款式）；颜色取样（脸颊 / 眉 / 虹膜 / 唇 / 头发中位数 Lab）经叠图核对；眉色取最暗 30%（50% 时混入皮肤，明度偏高） | 简报 §5、§6.3、§6.5 | 样例：C11 触发（测量偏椭圆、模型长方 / 长脸）；季型因冷暖置信度 0.45 < 0.5 不展示；参考款式由「渐变短平头 + 法式短碎」修正为「凯撒短刘海」（去除与“两侧不推”矛盾的款式） |
| 2026-10-22 | S5：效果图管线（蒙版、受保护区域、Qwen 适配器、回贴、异步任务、上限 3 张、失败降级）；Prompt preview-0.2；滑块改用头部 4:5 裁切对比图 | 简报 §6.6；接口无蒙版参数 | 受保护区域编码前逐像素相同（假模型改动全部像素）、JPEG 后平均差 < 1；强制失败时报告照常显示、文字降级；眼镜 / 胡须 / 服装蒙版经叠图核对后修正（眼镜原先整条被保护、服装原先包含手部） |
| 2026-10-22 | S6：`max_output_tokens` 8000 → 12000；`ANALYSIS_PROVIDER` 代码默认改为 `auto`；重拍提示按「先拒绝原因、后警告」排序；补上 `httpx` 依赖 | v0.2 输出约 6.7k token，8000 有截断风险；容器冒烟测试发现无密钥部署会报错、缺依赖 | 容器内：无密钥 → 演示模式，完整生成护照与效果图，0 次报错 |
| 2026-10-22 | V2 契约修订（T00）：治理文档改为 `docs/v2/`；不变量 1/5/7 修订；D2/D4/D6/D14/D17 标注修订，新增 D19–D27 | V2 定稿 PRD G1 | 无代码变化 |
| 2026-10-22 | T01 + T03：Schema v0.3（新增 quick / api schema）、规则 0.3.0（风格四层与统一八型名称、反馈重排、三方向校验、眼镜 mm、计划、穿搭校验；safety_terms 增加 完美 / 标准脸 / 遮肉 / 显瘦 / 变美 / 逆袭）；女性样例为默认演示，男性样例保留 | V2 PRD E2、D25、D26 | 女性样例：优雅型 / 古典型之间，三方向全部可用，镜框 130–138 mm；男性样例：不愿留长 → 突破方向被排除；100 次重排 p95 远低于 500 ms |
| 2026-10-22 | T02：只需正脸；analyzer-quick-0.1（≤1.2k token，只用正脸）+ analyzer-0.3；partial 快照 anchors → quick → analysis；beauty_filter_suspect（脸颊 Laplacian 方差，warn）；geometry 导出 | D20、D21 | 假模型：两类调用都写入 calls.jsonl；quick 失败时完整分析照常完成（测试） |
| 2026-10-22 | B1：试看引擎 v2（软保护、Lab 颜色迁移、质量门 + 一次重生 → fallback、AI 标识与 AIGC 元数据）；质量门 min_hair_change 6.0 → 3.0 | “稳妥”方向本身变化就小，6.0 在合成插画上与假编辑临界；3.0 只拦“几乎没变” | 合成人像：核心区逐像素相同、边缘区头发保留；真实照片阈值待 I1 |
| 2026-10-22 | I1（假模型）：关键路径浏览器脚本 `web/e2e/critical-path.mjs` | 增量 1 发布门槛之一 | 375 px，全程 11.4 s 通过；真实模型与经同意照片的 I1：**待补** |
| 2026-10-23 | V2.1 质检（D28）：脸的大小改为“相对占比 + 有效分辨率”（短边 < 120 px 或占比 < 16% 才警告，< 80 px 拒绝）；清晰度改为在眼 / 眉 / 唇上测边缘宽度，脸部只缩小到 ≤ 256 px、从不放大，并单独看水平方向（抓手抖）；美颜检测改为同一尺度的脸颊梯度中位数，阈值保守；前端只显示一条最重要的提示，已是 JPEG 的小图不再二次压缩 | 证件照式正脸被误判“脸太小 / 模糊”：绝对 280 px 阈值 + 放大到 512 px 后的 Laplacian 方差 | 公有领域肖像 7 张 × 7 种好图变体（证件照尺寸、JPEG q60、磨皮、轻微柔化）：旧版 49/49 被警告或拒绝 → 新版 0 次误报尺寸 / 模糊；43 张退化图（高斯、运动模糊、4× 放大、过小）新版捕获 42 张 |
| 2026-10-23 | Prompt preview-0.3（D30）：发型目标可带发色 `<tier>_hc<i>` / `current_hc<i>`，发色以固定句式追加到编辑描述；仍是一次从原图出发的编辑；响应增加 `crop_box`；免费不再自动生成试看（D33），付费上限 6 → 12 | 形象实验室需要“发型 + 发色”组合，且不能在生成图上二次生成 | 假模型：组合试看成功、裁切框落在 [0,1]；真实模型效果待补 |
| 2026-10-23 | Schema v0.3.1：`issues` 枚举补 `beauty_filter_suspect`；接受 0.3 与 0.3.1 | e2e（真实 CV）发现：被判“可能开美颜”的照片会让护照组装校验失败 → 整次分析报错 | 回归测试：所有逐照片质检原因码都在 schema 枚举内 |
| 2026-10-23 | V3A 面部测量（D34）：46 项正脸测量注册表 + 5 项侧脸占位；规则 0.4.0 新增 `measurement_insights`（17 项带常见范围与建议文案）；Schema v0.4；面部页四层（结构画像 / 四维度 / 测量工作台 / 证据 → 建议），点选即在照片上画出该项的点线 | 面部页只有 5 个比值、看不到测量过程、无法从测量走到建议 | 合成平均人脸：41–46 / 46 项可测，结果逐字节可复现；扣除头部倾斜后角度与比例不变（滚转 8° 前后差 < 0.02）；真实 MediaPipe 跑插画像：几何忠实处与真值一致（下颌宽 0.80 / 0.80、下巴收拢角 122° / 123°），插画上分割不到头发与皮肤 → 对应项按原因为空。假模型 e2e 3 / 3 通过。真实照片校准：**待补** |
| 2026-10-23 | AI 面部美学参考分（D36，Issue #31）：`scoring/` + `config/scoring.yaml`（aes-geo-1.0），按 35/25/25/15 在正脸关键点上计算；Schema v0.6 新增 `aesthetic_score`；档案页和首页加分数主卡，移除“即将上线”预告 | 产品负责人把分数定为核心功能；竞品已公开公式 | 平均人脸网格：三庭 18/41/41、对称 100；公开三庭样例 73 / 70 → 72.2 / 69.8；样例护照 87（女）/ 90（男，合成）；真实测试肖像 4 项均已测，笑容判为 limited |
| 2026-10-24 | 试看配准与五官检查（Issue #56）：合成前用生成图的刚性关键点（眼角、鼻、嘴、下巴、颧骨）做相似变换，把生成的头对回原脸；生成图无脸 / 多张脸 / 位移缩放旋转超限 / 对齐后残差超限（脸被改形）→ `MisalignedEdit`；生成图的眼、鼻、嘴和可见眉毛同原图一样受保护；最终合成图须只有一张脸且眼 / 眉 / 鼻 / 嘴位置与原图一致，否则不算成功；质量门失败的重试换种子（固定种子会复现同样的漂移）；Prompt preview-0.5：要求保持头部位置与大小，负面词加入双眼 / 双眉 / 脸部移位；阈值在 `preview_masks.registration` | 真实用户反馈：生成发型后整张脸上移、眉毛 / 耳朵 / 眼睛出现重影。原因：模型输出与原图几何未对齐，而头发融合带和羽化边缘放进了带着移位五官的生成像素；变化量门槛只量“改了多少”，不量“对不对得上” | 确定性回归夹具（头整体上移 40 px + 换刘海）：修复前双眉、叠耳 → 修复后各一份、位置不变，发型与无漂移结果的头发 IoU > 0.97。公有领域真实肖像 + 真实 MediaPipe + 模拟漂移（上移 30 px）：合成图五官偏移 7.8 px → 1.4 px（无漂移基线 1.3 px），无漂移时不误拒；下半脸拉伸 20% 被拒。**真实 Qwen 输出的验收：待补**（需要 `DASHSCOPE_API_KEY` 与经同意的照片） |

## MVP 验收（简报 §9，2026-10-22）

在 CI 等价环境下（无密钥：假分析模型、假图像模型；CV 全部真实运行）测得。带 **待补** 的项需要 `DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY` 与 `data/` 下的真实照片集。

| 项 | 结果 |
|---|---|
| 质检 | 合成坏图 7 类（模糊、过暗、过曝、缩小、两张脸、旋转、无人脸）全部按正确原因拒绝；正脸照放进 45° 槽位被拒；两张正脸测试照均未被拒（warn：脸偏小 / 高光）。真实用户照片集：**待补** |
| Schema | 假模型 100% 首次通过；所有护照在组装前后各校验一次，未校验的护照无法进入界面。真实首次通过率（目标 ≥ 4/5）：**待补** |
| 稳定性 | `scripts/summarize_runs.py --pair` 已就绪（前 3 条类别重合 ≥ 2）；**待补** |
| 一致性 | 参考款式不能与发型方向矛盾（硬过滤）；样例中发现并修正两处矛盾（渐变款 vs「两侧不推」、精灵短发 vs 男性化用语） |
| 安全 | 安全词检查（颜值、医美、敏感推断、贬义词）对样例 0 命中；界面文案只在否定句里出现「颜值 / 医美 / 诊断」 |
| 效果图 | 头发区域变化可见；受保护脸部区域编码前逐像素相同、JPEG 后平均差 < 1；强制接口失败时报告照常显示、降级为文字并可重试。真实 Qwen 效果与「像本人」人工检查：**待补** |
| 工程 | 质检约 30 ms / 张；容器镜像 1.36 GB。估算成本：分析 ≈ $0.012 / 次（提示词 ≈ 6.9k token + 图片 ≤ 4k，输出 ≈ 6.7k，按峰时价），含一次重试 ≤ $0.024；效果图 ≈ $0.03；合计 ≈ $0.055 / 份 < $0.10 目标。p50 延迟：**待补** |

### Launch guards (owner review on PR #25)
- `APP_ENV=production` turns off fake analysis, fake image edit, fake payment and stub QC. A missing key now fails loudly instead of quietly falling back to fixtures. `ALLOW_MOCK_PROVIDERS=1` is the only override, for a labelled demo.
- `/api/health` reports `environment` and `demo`. The web app shows a demo banner on any passport built by a fake model (`meta.analysis_model` / preview `image_model` starting with `fake`).
- Unlock page: the simulated-payment note appears only when `payment_provider=fake`. When it is `unavailable`, the page shows "支付暂未开放" and the invite code only.
- Photo expiry is enforced on read (`retention.media_expired`): media, geometry, enrich and preview endpoints treat `now ≥ media_expires_at` as deleted even before the retention job runs. A preview job that starts after expiry falls back without calling the image provider.

### V3B face workbench (Issue #30, D35, schema 0.5, rules 0.5.0)
- Measurement registry `face-metrics-0.2`: 117 definitions (100 front, 13 true-profile, 4 smile); every one of the 176 catalog candidates classified. Analysis prompt and schema unchanged (new photo roles never reach the model).
- Rules: `measurement_bands` → `derived.measurement_insights.assessments` for every measured value; new insight copy for E-line upper lip, facial convexity and chin projection.
- QC: `profile90` checked by angle (nose on the outline) → resolution → outline; `eyewear_detected` warn-only hint on front / noglasses.
- Real-photo check (authorized test set in `data/`, not committed): two front photos measured 100 / 96 of 100 front items; the two side photos were rejected for the right reasons (128 px profile → too low resolution; 35° photo → not a true profile). A cropped, zoomed and rotated front upload kept every overlay on the computed landmarks.

### Reference percentiles (Issue #41, D37, schema 0.7)
- New rules-layer field `reference_percentiles`. It places `aesthetic_score` in the published 15,429-scan cohort (piecewise-linear through published anchors) and adds 12 published ratio rails. Analysis prompt, schema and rules version unchanged.
- The `aes-geo-1.0` rank stays `score_scale_unverified` until a consented real-score sample is checked with `scripts/calibrate_score_scale.py`. Only `midface_length` and `lower_face_length` are shown, because their definition equals the cross-checked thirds cuts.
- Real-CV check (MediaPipe's Apache test portrait, API → `/p/[id]`): score 76.9 was `limited` (smile), so no rank was given; midface fell below p5 and lower face sat near p90, consistent with the low thirds component. `cv.json` no longer carries the score's status or flags.

### Personal interventions — Issue #34 first slice
- A small original browser-side catalog selects new candidates for 柔和亲近 / 利落精致 / 鲜明表达 from the passport's actual observation IDs, hair options and palette. It never rewrites analysis, geometry or scores and makes no model calls.
- Each ranked card includes its reason/mechanism, an actionable primary and lighter alternative, estimated cost/time, upkeep, reversibility, limits, a success check and an existing Studio action. Budget/time, no-perm/no-dye/no-grow-out preferences, grooming-only mode, uniform dress codes and excluded hair options constrain selection. Unparsed additional written restrictions get an explicit no-new-candidates fallback to existing report advice. Explicitly hidden report categories stay hidden; a cost-excluded report action does not suppress a new free alternative.
- Goals/limits use the existing deletion-managed `ap_plan:<id>` key; saved/done flags reuse `ap_choices:<id>` and include the concrete Studio selection, so unlocking a different palette does not transfer completion to a different action. Both contain only choices, no observations or media. Original recommendations/feedback and saved Studio Looks remain available.
- This implements the latest implementation handoff, not all umbrella acceptance: coherent generated complete Looks, full makeup Look round-trip/export, matched-photo rechecks and broader catalog coverage remain follow-up work. No face-atlas, backend/schema, scoring or automation/deployment changes.
- References: https://www.qoves.com/ (public evidence → personalized action → progress journey); https://github.com/CacheControl/json-rules-engine (ISC, active 2026-02). Chose small typed synchronous functions over a general rule-engine dependency; no external source or assets copied.
- Verification: decision and component key-path tests cover different goals, constraints, evidence absence, grooming-only mode and saved progress/Studio URL; full web suite, TypeScript and fixture production build run for this PR.

### Facial feature atlas (Issue #32, D39)
- New view only: twelve regions on the face page built from the existing passport. Schema, prompt and rules version unchanged; no passport output changes.
- `config/face_atlas.yaml`: region membership for all 117 metrics, the benchmark coverage matrix, 11 cross-region relations, and band-keyed styling cues used only after the rules layer's own advice.
- Checked on both fixture passports: every region with measurements or a facial observation shows at least one trait and one linked implication; "耳与颈" in the male sample has only a clothing note, so it stays "不做猜测".

### Outfit boards, compare and starter capsule — Issue #23
- `/p/[id]/outfit` gains 2–3 complete-outfit boards, an A/B compare, an "I'll wear this" checklist (copy / system share, plain text, no link) and a starter capsule with an owned / need-to-find toggle and a budget level. Browser-only, pure functions over the existing passport (`web/lib/outfit`, `web/components/outfit`); no model call, schema, prompt, scoring or backend change.
- Provenance is shown per piece: **report** (named in `outfit_direction.occasions[].look` or a formula, matched to `config/garments.yaml`), **fill** (an advised item added for an empty required slot, marked optional, never a disliked garment) and **generic** (no honest catalog match, so an unpainted optional slot). Colours come only from the passport's colour families and item colours. Free view has no occasions, so boards come from its two formulas; fewer than two buildable boards shows an explicit fallback.
- The capsule uses only catalog-matched pieces and ranks first buys by reuse across boards; budget changes how many are called "first buys" (3/5/8), not prices. The catalog reaches the browser as `web/lib/generated/garments.json`, exported by `make types` and checked in `tests/test_garments_config.py`.
- State: `ap_outfit:<id>` (chosen board, A/B pair, owned keys, budget, dressing ticks), cleared with the passport on delete. If storage is blocked the page says choices last for this tab only.
- Verified: `npx vitest run` (271 → 306 tests, 35 new), `web/e2e/outfit.mjs` on the fixture at 375px and 1280px (compare, choose, copy, refresh persistence, no horizontal overflow). References: none needed beyond the existing plan/looks patterns.

## 2026-10-24 — Issue #19: natural-hair analysis / everyday eyewear reference
- Upload guidance now asks for glasses-free, natural everyday hair and hands away; existing fringe-related missing measurements remain unchanged. QC copy explains restricted mode rather than encouraging glasses as the analysis default.
- Optional API-only `glasses` reference shares photo TTL/delete and stays out of CV measurement/model analysis. Studio chooses the base explicitly, pauses incompatible layers and uses source-qualified hair preview/mask targets; legacy `noglasses` is supported.
- No prompt, schema, scoring, provider or payment change; synthetic functional validation does not claim live provider image quality.

## 2026-10-25 — Issue #1: live Qwen hairstyle previews on the approved synthetic portraits
- First genuine `qwen-image-2.0` runs through the existing provider, registration and compositor (Claude Code Cloud; egress-proxy credential, no auth code change; production still needs the real `DASHSCOPE_API_KEY`). 34 generations, ≈ USD 1.0. Evidence and limits: `docs/demos/issue-1-live-hair-previews.md`; reproduce with `scripts/live_hair_preview.py`.
- Registration gate calibrated on live output: Qwen returns the head 9–15.5 % smaller; 3 of 4 first generations were rejected. `max_scale_dev` 0.12 → 0.20 and cheek-contour landmarks 234/454 leave `REGISTRATION_POINTS` (hair over the cheek edge made the face look "reshaped"). 30 of 30 later generations passed on the first attempt.
- Compositor (`config/qc.yaml → preview_masks`, all fixes seen in real output, each with a regression test and a control): Lab lighting offset no longer applied to revealed wall; original ears/neck kept and generated skin not pasted over wall (`keep_original_ears_neck`); thin original flyaways removed (`stray_strands`); shadowed skin beside removed hair joins the mask (`shadow_halo`); brow guard protects the brow's own pixels and treats dark pixels connected to generated hair as strands (`protected_brows`). Compositing ≈ 1 s → ≈ 2 s per preview.
- Prompt `preview-0.5` → `preview-0.6`: hair block states length as a hard limit and asks for a groomed finish (drops "ends fall around the neck and shoulders", "irregular fine strands… restrained flyaways"). On the `easy` (chin-length) target hair ended +0.38/+0.41/+0.43 cheek widths below the chin with v0.5 and +0.33/+0.35/+0.32 with v0.6 (3 seeds each; original +0.31): tidier, still not a chin bob. `safe` unchanged in length, tidier.
- Two things tried and reverted: tone-matching revealed skin to the shadowed original (darker band), and a strand rule symmetric in original/generated (imported the model's strands).
- Not claimed: real consented photos, a second seed per final run, a 7:3 part (centred in every sample), a crown free of clumped curls (seed-dependent), the faint strip above the brow inside the protected zone.

### Issue #1 follow-up — target constraints (`preview-0.7`)
- Reproduced the documented chin-length and 7:3 misses on approved synthetic Person-001, using the existing Qwen job/composite path. Add only matching `chin-length`, `7:3` and `no fringe` prompt blocks; keep original descriptions and identity gates. A broad conditional candidate was discarded.
- Two-seed before/after evidence: `docs/demos/issue-1-style-adherence.md`. One seed improves length/part visibly; the second still misses exact length/part, and the crown remains overstyled. No reliable style or genuine-photo acceptance claim. Twelve paid images, USD 0.36 estimated; actual billing unavailable.
- Acceptance script no longer recursively deletes CLI-selected output paths; every run uses a new directory confined beneath `runs/live-hair-preview`. No provider/auth/model runtime or homepage changes.
| 2026-10-29 | preview-0.8 + Qwen Image 3.0 Pro：对 root lift / inward 添加正向日常造型约束；沿用原注册/合成与身份门。单批次并发 1 扩展为跨请求共用；复用 #49 重启恢复，禁用 SQLite 共享 statement cache | #54：真实出图发现 2.0 把发根撑起画成卷束，追加负面词无稳定改善；3.0 Pro 同源 P001 头顶与发尾更自然；存储并发复现见 docs/ops/preview-stability.md | API fake 回归 + 有限真实调用，私有结果在任务包，不提交照片；P002/P005/P004逐例状态见本轮说明 |
