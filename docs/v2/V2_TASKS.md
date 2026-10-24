# 形象护照 V2 · 开发任务清单

> 依据：`docs/v2/aesthetic-passport-v2.html`（V2 定稿 PRD，同步发布在 https://claude.ai/artifact/UAS4DpvB5H9PfzofNckKA4）。
> 本文件定义“做什么、改哪里、怎样算完成”。可直接复制的执行指令在 `docs/v2/V2_AGENT_PROMPTS.md`。
> PRD 中的功能编号写作 F1–F17，任务编号写作 T/K/A/B/C/D/I。

## 0. 通用约定（所有任务都适用）

- **契约**：唯一的数据模型是 `schema/*.json`，TypeScript 类型由 `make types` 生成到 `web/lib/passport.ts`。不新建第二套模型。
- **无密钥可运行**：`ANALYSIS_PROVIDER=fake`、`IMAGE_EDIT_PROVIDER=fake`、`PAYMENT_PROVIDER=fake`、`SMS_PROVIDER=fake`。所有任务都必须在假实现下通过测试。
- **验收命令**：Python 改动跑 `make test` 与 `make lint`；前端改动跑 `cd web && npm run typecheck && npm test && npm run build`（`npm test` 由 T05 加入 vitest 后可用）。
- **照片**：不提交任何真人照片。测试用程序生成的合成图（色块、几何形状）或 `data/`（git 忽略）里的本地照片。不记录任何照片派生数据到日志或埋点。
- **文件所有权**：见第 6 节。只改自己拥有的文件；需要改共享文件时写进 PR 描述，由 Claude Code 合入。
- **分支**：集成分支 `v2`（T00 时由 Claude Code 从 `main` 创建）。每个任务一个分支 `v2/<任务号>-<短名>`，PR 合入 `v2`。增量发布时 `v2 → main`。
- **组件接口**：组件只接收普通 props，不导入 `web/lib/passport.ts`。passport → props 的映射写在 `web/lib/adapters/`（Claude Code）。
- **文案**：用户可见的中文文案从 `web/lib/copy/`（K7）读取；不得出现“颜值”“打分”“标准脸”“完美”“缺陷”“显胖”“显瘦”“整容”等词（评分预告卡的固定文案例外，见 A5）。
- **“最小验收”是发布门槛**；PRD 中的盲评、专家一致率等是上线后持续跟踪的指标，不阻塞合并。

---

## 1. 共享基础（Claude Code）

### T00 · 不变量与决定记录修订
- **目标**：让仓库规则与定稿一致，后续任务不再与旧不变量冲突。用户不可见。
- **复用**：`CLAUDE.md`、`docs/DECISIONS.md`、`docs/ITERATION_LOG.md`。
- **改动**：
  - `CLAUDE.md`：治理文档改为 `docs/v2/`；不变量 1 补“反馈与偏好只进入 user_context / preference_events，只影响 derived”；不变量 5 改为“生产环境不展示任何颜值分数，直到新的决定记录批准经过验证的评分功能；允许‘即将上线’预告与开发样例占位分；不推断体型；presentation 与身形由用户选择或填写”；不变量 7 补“穿搭检测照片处理完即删；geometry 随正脸 24 小时过期”；命令表加 `PAYMENT_PROVIDER`。
  - `docs/DECISIONS.md`：在 D2、D4、D6、D14、D17 末尾加“由 D2x 修订”；新增 D19–D27（内容见 PRD G1）。
  - `docs/ITERATION_LOG.md`：记一条“V2 契约修订”。
  - 新建分支 `v2`。
- **依赖**：无。
- **最小验收**：`grep -n "No attractiveness score" CLAUDE.md` 只剩修订后的表述；D19–D27 存在；`make test` 绿（无代码变化）。

### T01 · Schema v0.3、样例与生成类型
- **目标**：一次定下 V2 的数据契约，让所有并行任务基于同一套字段开发。
- **复用**：`schema/analysis.schema.json`、`schema/passport.schema.json`、`schema_io.py`（`validate_analysis`、`check_output_contract`、`validate_passport`）、`assemble.py`、`web/scripts/gen-types.mjs`、`examples/*`。
- **改动**：
  - `schema/passport.schema.json`：`schema_version` const `"0.3"`；`user_context` 增加 `hair{texture,density,grow_out_ok}`、`haircut_budget`、`occasions[]`、`current_style_picks[]`、`body{frame: straight|wave|natural|null, height_cm}`、`style_preferences{liked[],disliked[]}`、`target_style`、`topic`、`ref`；`anchors` 增加 `thirds{upper,middle,lower,upper_occluded}`、`eye_fifths`、`iris_px`；`derived` 增加 `style_profile`、`hair_option_checks`、`glasses_size`、`plan`、`outfit_checks`、`feedback_applied`、`derived_version`；`preview` 改为 `previews[]`（沿用旧字段，新增 `target_id`、`kind: hair|glasses|neckline`、`ai_label`）。
  - `schema/analysis.schema.json`：新增 `feature_signature[3]`、`observations[].region`（枚举）、`hair_options[3]`（取代 `named_styles`）、`color_profile.combos[]`、`hair_color_directions[]`、`lip_families[]`、`makeup_direction`、`outfit_direction`、`recommendations[].cost_band|time_to_effect|pairs_with|success_check`。字段细节按 PRD E2。
  - 新增 `schema/quick.schema.json`（快速分析输出：`summary_zh`、`feature_signature[3]`、`observations` 子集）。
  - 新增 `schema/api.schema.json`（API 响应外壳：`status`、`partial{anchors,quick,analysis,previews}`、`passport`、`entitlement{paid,unlock_scope,share_token}`），同样生成 TS 类型。
  - `schema_io.check_output_contract`：签名引用的 observation id 必须存在；`hair_options` 三个 tier 各一；`outfit_direction.items[].garment_id` 在 garments 库存在（库不存在时跳过并告警）。
  - 样例：`examples/sample_analysis.json` + `sample_context.json` 改为虚构女性用户（feminine）；新增 `examples/sample_male_analysis.json` + `sample_male_context.json`；`make sample` 生成两份 passport，复制到 `web/lib/fixtures/sample_passport.json` 与 `sample_passport_male.json`。
  - 新增 `web/lib/fixtures/sample_geometry.json`：一张 600×750 合成画布上的多边形（`lip_outer`、`lip_inner`、`eye_l`、`eye_r`、`cheek_l`、`cheek_r`、`jaw`、`neck`、`brow_l`、`brow_r`），归一化坐标，供 K5 / A6 / B4 使用。
  - `web/lib/fixtures/dev_score_placeholder.json`：`{"placeholder_score": "10/10", "dev_only": true}`，仅开发样例使用。
  - `docs/SCHEMA.md` 更新；`make types`。
- **依赖**：T00。
- **最小验收**：`make sample && make types && make test && make lint` 全绿；两份样例都通过 `validate_passport`；契约测试覆盖每个新增字段的一个正例和一个反例；CI 的 “Fixture is up to date” 步骤通过。

### T02 · 只需正脸的两段式管线与 CV 扩展
- **目标**：上传一张正脸即可生成护照；3 秒内有 CV 结果，约 15 秒有快速结论，完整分析随后到达。
- **复用**：`pipeline.py`、`qc.py`、`cv.py`、`anchors.py`、`face_shape.py`、`color_sample.py`、`analyzer.py`、`providers/fake.py`、`providers/deepseek.py`、`api/jobs.py`、`config/qc.yaml`。
- **改动**：
  - `pipeline.REQUIRED_ROLES = ("front",)`；`api/app.py` 上传校验随之放宽。
  - `qc.py` + `qc.yaml`：新增 `beauty_filter_suspect`（脸颊区域 Laplacian 方差下限，状态为 warn，不拒绝）；所有拒绝 / 警告原因码导出为常量列表 `QC_REASON_CODES`，供 K7 对照。
  - `anchors.py`：计算三庭（含“额头被遮挡”判断）、五眼关系、虹膜水平直径像素；新增 `export_geometry(face, shape) -> dict`，输出上面列出的多边形（归一化坐标）。geometry 写入 run 目录的媒体区，与正脸同寿命，不进入 passport、不进日志。
  - `prompts/analyzer_quick.md`（`analyzer-quick-0.1`，输出 ≤ 1k token，遵守 quick.schema）；`prompts/production_analyzer.md` 升级到 `analyzer-0.3`（新字段、女性优先的发型参数、三方向定义、穿搭与妆容方向、禁止评分措辞）。
  - `analyzer.py`：`run_quick()` 与 `run_analysis()` 两个入口，各自校验 + 一次修复重试，各自写 `calls.jsonl`。
  - `providers/fake.py`：返回 v0.3 的 quick 与 full 结果（从样例文件读取）。
  - `api/jobs.py`：按阶段写 partial 快照（`anchors` → `quick` → `analysis` → `previews`）。
  - `docs/ITERATION_LOG.md` 记录 prompt 版本变化。
- **依赖**：T01。
- **最小验收**：只放 `front.jpg` 时 `make passport` 在假模型下生成合法 v0.3 护照；测试断言 partial 快照的出现顺序；quick 失败时 full 仍可完成；`calls.jsonl` 有两类调用；合成美颜图（对合成人脸样本做双边滤波）检出、原图不检出（有本地人脸时跑，无则跳过，与现有人脸测试一致）。

### T03 · 规则 v0.3
- **目标**：所有“改约束 / 给反馈后立即变化”的能力都在规则层完成，不调用模型。
- **复用**：`rules.py`（`derive`、`style_label`、`rank_recommendations`、`effective_constraint_status`、`hair_references`、`overall_confidence`）、`config/rules.yaml`、`config/hairstyles.json`。
- **改动**：
  - `derive(analysis, anchors, user_context, cfg, preference_events=())`：返回新增字段与 `derived_version`、`feedback_applied`；纯函数、确定性。
  - `style_profile`：`face_only` 与 `overall` 坐标（overall 用 `user_context.body` 的骨架做小幅平移，系数在 rules.yaml）、`primary`、`secondary`、`between`、`preference_overlay{liked,disliked,target}`、`rules_zh`（从 `config/styles.yaml` 读取；文件缺失时为空，不报错）。八型名称对所有表达方向统一，`modern` 显示为“前卫型”（D25），删除按 presentation 换名的表。
  - `apply_feedback(derived, events, cfg)`：不喜欢的目标过滤或降权、喜欢的加权、偏好风格影响穿搭与发型排序；权重放 `rules.yaml: feedback`。
  - `hair_option_checks`：约束过滤（不接受烫染时突破方向不得依赖烫染、不愿留长时不得要求留长）、差异度校验（长度 / 轮廓 / 刘海至少两项不同）、款式库匹配。
  - `glasses_size`：虹膜比例尺（`rules.yaml: glasses.iris_mm = 11.7`）换算总宽、镜片宽、鼻梁区间；虹膜不可靠时只给“与颧骨同宽”。
  - `plan`：按 `effort`、`cost_band`、`time_to_effect` 分为 today / next_haircut / invest，校验 `pairs_with` 引用存在。
  - `outfit_checks`：慎用色不得出现在近脸单品；单品风格与 `style_profile` 一致；`garments.yaml` 缺失时跳过。
  - `safety_terms` 增加“完美”“标准脸”“遮肉”“显瘦”。
- **依赖**：T01（可与 T02 并行）。
- **最小验收**：同一输入两次 `derive` 结果字节一致；加入偏好事件后 `analysis` 与 `style_profile.face_only` 不变；`hair_option_checks` 正反例；`glasses_size` 用固定 anchors 得到预期区间；100 次重排在 CI 机器上 p95 < 500 ms。

### T04 · API v0.3
- **目标**：前端需要的全部接口一次到位（增量 1 与增量 2 的部分）。
- **复用**：`api/app.py`、`api/jobs.py`、`api/store.py`（SQLite）、`api/previews.py`、`api/retention.py`、`api/ratelimit.py`、`api/settings.py`。
- **改动**（接口定义见 PRD E3）：
  - `GET /api/passport/{id}` 返回 `api.schema` 外壳（`partial` + `entitlement`）。
  - `POST /api/passport/{id}/enrich`：新照片或影响模型输入的字段才重跑模型；其余只重排。
  - `POST /api/passport/{id}/feedback`：写 `preference_events`（target_type、target_id、reaction、reason_tags、ts），幂等。
  - `POST /api/passport/{id}/rerank`：合并 user_context 变化与偏好事件，只跑 `rules.derive`。
  - `POST /api/passport/{id}/previews`：`{target_ids[], kind}`；并发 3；免费额度 1（配置），付费额度由 D2 接入。
  - `GET /api/passport/{id}/geometry`：返回 geometry；照片过期后 404。
  - `POST /api/passport/{id}/share`：生成 `share_token`；`GET /api/share/{token}` 返回去照片的只读视图。
  - `DELETE /api/passport/{id}`：删除照片、试看图、geometry、JSON，返回删除时间。
  - `POST /api/events`：白名单事件（`landing_view`、`upload_start`、`qc_fail`、`quick_ready`、`profile_view`、`feedback`、`share_card_export`、`score_teaser_click`、`paywall_view`、`checkout_start`、`paid`），只存事件名、护照 id 哈希、topic、ref、时间。
  - `store.py`：新表 `preference_events`、`events`；`passports` 增加 `share_token`、`paid`（D2 使用）。
  - `retention.py`：未保存护照 7 天后删 JSON（照片仍 24 小时）。
- **依赖**：T02、T03。
- **最小验收**：`tests/test_api.py` 为每个接口至少一个成功与一个失败用例（假模型）；DELETE 后媒体与 JSON 都不可访问；events 拒绝白名单外事件；接口响应通过 `api.schema` 校验。

### T05 · 前端外壳、状态与适配器
- **目标**：新路由与全局状态就位，页面任务可以并行填充各自子页。
- **复用**：`web/lib/api.ts`、`web/lib/report.ts`、`web/lib/labels.ts`、`web/components/report/*`、`web/components/ui/*`、`web/app/analyze/wizard.tsx`、`photo-slot.tsx`。
- **改动**：
  - 路由：`/`、`/t/[topic]`、`/start`、`/p/[id]`（揭晓 + 第一层）、`/p/[id]/{face,color,style,hair,outfit,makeup,glasses,plan,detail,more,share,unlock}`、`/check`（增量 3 占位）、`/about`。`/analyze` 与 `/passport/[id]` 重定向到新路由。每个子页先放占位组件与 `TODO(<任务号>)`。
  - `web/lib/api.ts`：v0.3 客户端（轮询 1 s 起、退避到 3 s）、enrich / feedback / rerank / previews / geometry / share / delete / events。
  - `web/lib/state/passport-store.tsx`：React context，持有 passport、partial、entitlement；乐观更新反馈后调用 rerank；提供 `usePassport()`。
  - `web/lib/adapters/`：passport → K4 / K5 / K6 组件 props 的映射函数，带单元测试。
  - `web/lib/flags.ts`：`NEXT_PUBLIC_FEATURE_SCORE_TEASER`（默认 false）、`NEXT_PUBLIC_USE_FIXTURE`（开发用样例）。
  - `web/package.json`：加入 `vitest`、`@testing-library/react`、`jsdom`、`html-to-image`；`npm test` 脚本；CI web 任务增加 `npm test`。
  - `web/app/globals.css` 引入 K4 的 `tokens.css`（K4 未合入前用临时变量）。
- **依赖**：T01（可与 T02 并行，用样例数据）。
- **最小验收**：`NEXT_PUBLIC_USE_FIXTURE=1` 时所有路由能渲染样例；`typecheck`、`test`、`build` 通过；代码中不再引用 schema 0.2；生产构建中搜索不到 `dev_score_placeholder`（测试）。

---

## 2. 独立智能体任务（立即开始，不依赖代码改动）

### K1 · 八型风格规则库 `config/styles.yaml`
- **目标**：风格页与穿搭推荐有具体、可执行的规则与示例。
- **复用**：`config/rules.yaml: style_labels.prototypes`（只读，键名 sweet / boyish / modern / elegant / classic / natural / romantic / dramatic）。
- **产出**：`config/styles.yaml`、`tests/test_styles_config.py`。结构：
  ```yaml
  version: 1
  styles:
    elegant:
      name_zh: 优雅型
      summary_zh: "…"            # 一句话，描述视觉印象，不评判
      keywords_zh: ["柔和", "精致"]
      rules_zh: {fabric: "", silhouette: "", pattern: "", accessories: "", neckline: "", hair_hint: "", makeup_hint: ""}
      by_presentation:
        feminine: {examples_zh: ["…", "…", "…"], avoid_zh: ["…"]}
        masculine: {examples_zh: [...], avoid_zh: [...]}
        neutral: {examples_zh: [...], avoid_zh: [...]}
      transitions_to:            # 至少覆盖平面上相邻的风格
        classic: {keep_zh: ["…"], add_zh: ["…"]}
  ```
  八个 `name_zh` 必须是：少女型、少年型、优雅型、浪漫型、自然型、古典型、戏剧型、前卫型（modern → 前卫型）。
- **依赖**：无。
- **最小验收**：8 种 × 3 种表达方向全部填写；每种至少 2 个相邻风格的过渡方案；测试校验结构、标签名、禁用词（读取 rules.yaml 的 safety_terms）与无品牌名；`make test`、`make lint` 绿。

### K2 · 单品本体库 `config/garments.yaml`
- **目标**：穿搭推荐引用真实存在、可搜索的单品。
- **产出**：`config/garments.yaml`、`tests/test_garments_config.py`。每条：`id`、`category`（top / bottom / outer / dress / shoes / bag / accessory）、`name_zh`、`silhouette`、`fabric`、`neckline`（可空）、`styles[]`（八型键名）、`frames[]`（straight / wave / natural）、`presentations[]`、`color_slot`（near_face / base / accent）、`occasions[]`（commute / date / formal / casual）、`search_tpl`（如 `"{color} {fabric} {name}"`）。
- **依赖**：无。
- **最小验收**：≥ 150 条；每种风格在 feminine 下 ≥ 15 条、masculine 与 neutral 下各 ≥ 8 条；id 唯一；搜索模板可用任意色名展开；无品牌名；测试通过。

### K3 · 发型库扩充 `config/hairstyles.json`
- **目标**：三方向有足够的结构化候选，尤其是女性长度、刘海、卷度。
- **复用**：现有 25 款（MIT，来自 haircut-vision-advisor）。**不得改名或删除现有键**（`rules.hair_references` 依赖它们）；保留 `_source`。
- **产出**：扩充后的 `config/hairstyles.json`、`tests/test_hairstyles_catalog.py`。新增字段：`aliases_zh[]`、`presentation[]`、`length_band`（女性：chin / collarbone / shoulder / chest；男性沿用 `length`）、`fringe_type`（none / air / curtain / blunt / side）、`curl`（straight / c_curl / french_wave / wool）、`texture_fit[]`、`density_fit[]`、`maintenance_min_per_day`、`trim_weeks`、`price_band_cny`、`needs_perm`、`needs_dye`、`tier_bias[]`（safe / bold / easy）、`barber_script_zh[3]`。
- **依赖**：无。
- **最小验收**：≥ 60 款，其中 feminine ≥ 35；现有 `make test` 仍绿；新测试校验字段与枚举；在 PR 描述中写一行给 Claude Code 更新 `THIRD_PARTY.md`。

### K4 · 设计系统与通用组件 `web/components/ds/`
- **目标**：全站一致的编辑风视觉，页面任务直接拼装。
- **复用**：现有 `web/components/ui/*`（button、card、popover、accordion）、`react-compare-slider`、PRD D4 的色板与字体。
- **产出**：`web/components/ds/tokens.css`（阅读底 / 深色舞台 / 墨青 / 琥珀等 CSS 变量，含暗色）、以下组件与测试、开发预览页 `web/app/dev/components/page.tsx`（仅开发环境可访问）。
  - `Stage`：深色舞台容器。
  - `CompareView({beforeSrc, afterSrc, label, aiLabel})`：按住看原图、拖动对比、按钮切换（无障碍）。
  - `StylePlane({prototypes:[{key,name,x,y}], me:{x,y,r}, preference?:{x,y}, target?:{x,y}, between?:[string,string]})`。
  - `FeedbackChips({value:'like'|'neutral'|'dislike'|null, reasons:string[], onChange})`；“不喜欢”展开原因标签。
  - `ResembleToggle({value:'yes'|'no'|null, onChange})`：“像我 / 不太像”。
  - `SwatchRow / SwatchGrid({colors:[{hex,name_zh}]})`、`ConfidenceNote({level, tip})`、`PaywallCard({title, bullets, onUnlock})`、`ScoreTeaserCard({onNotify})`（只渲染固定文案，不接受任何数字 props）、`ProfileTriptych({face, color, style})`、`RevealSteps({steps:[{label,value}]})`。
- **依赖**：无（T05 合入后切换到其 vitest 配置；之前可在本目录内自带配置）。
- **最小验收**：每个组件一个渲染测试；`ScoreTeaserCard` 渲染结果中不含任何数字（测试）；按钮有可读名称；375 px 宽下预览页无横向滚动。

### K5 · 确定性着色模块 `web/lib/tint/`
- **目标**：数字披布、唇色、腮红、色调在浏览器实时运行，不调用模型，五官形状不变。
- **产出**：`web/lib/tint/{index,geometry,color,mask,drape,lip,blush,tone}.ts` 与测试。接口：
  ```ts
  type Pt = [number, number]; // 0..1 归一化
  interface FaceGeometry { width: number; height: number;
    lip_outer: Pt[]; lip_inner: Pt[]; eye_l: Pt[]; eye_r: Pt[]; brow_l: Pt[]; brow_r: Pt[];
    cheek_l: Pt[]; cheek_r: Pt[]; jaw: Pt[]; neck: Pt[]; }
  drape(src: ImageData, g: FaceGeometry, hex: string): ImageData;
  lipTint(src: ImageData, g: FaceGeometry, hex: string, intensity: number /*0..1*/): ImageData;
  blush(src: ImageData, g: FaceGeometry, hex: string, placement: 'horizontal'|'diagonal'|'apple', intensity: number): ImageData;
  tone(src: ImageData, g: FaceGeometry, hex: string, intensity: number): ImageData; // 极低强度色调，排除眼、眉、唇
  ```
  唇色：唇外轮廓减内轮廓；Lab 空间按浓度移动 a*、b*，L* 只做小幅调整以保留纹理。腮红：脸颊多边形内径向渐变 + 高斯羽化。排除蒙版：内唇（牙齿）、双眼永不改动。所有函数返回新 ImageData，不修改输入（可逆）。
- **依赖**：无。测试用程序生成的合成图与 `web/lib/fixtures/sample_geometry.json`（T01 前可自带同结构的测试数据）。
- **最小验收**：目标区域外像素逐一相等；内唇与眼睛像素逐一相等；同输入同输出；输入对象未被修改；1080×1350 图在 Node 下 `lipTint` < 60 ms（作为性能参考测试）。

### K6 · 分享卡模板 `web/components/cards/`
- **目标**：用户愿意发到小红书的 3:4 编辑风卡片，带 AI 标识与署名。
- **产出**：
  - `ProfileCard({mode:'avatar'|'palette'|'portrait', summary, face, color:{name, swatches}, style:{name, plane}, portraitSrc?, shortLink})`，1080×1440。
  - `StylistCard({styleName, scripts:[3], params, avoid, previewSrc?, hideFace})`、`BeforeAfterCard({beforeSrc, afterSrc, ratio:'3:4'|'9:16'})`。
  - `IllustratedAvatar({hair:{length, fringe, curl, colorHex}, palette, presentation})`：纯 SVG，由参数生成，不读取照片。
  - `exportPng(node, meta) -> Blob`：用 html-to-image 导出，并写入 PNG tEXt 块 `AIGC`（JSON：`Label`、`ContentProducer`、`ProduceID`、`ContentPropagator`），字段名以《人工智能生成合成内容标识办法》配套标准为准，在 PR 中注明出处。
  - 所有卡片固定：左下“AI 生成”标识、产品署名“形象护照”、短链 / 二维码位。
- **依赖**：无（html-to-image 由 T05 加入依赖；之前可在本地安装试用，不提交 package.json）。
- **最小验收**：avatar 与 palette 模式的 DOM 中没有 `<img>` 指向照片（测试）；三种卡片都含 AI 标识与署名文本（快照测试）；导出的 PNG 能读出 `AIGC` 块（测试）；`portrait` 模式在没有 `portraitSrc` 时不可选。

### K7 · 中文文案库 `web/lib/copy/`
- **目标**：所有用户可见文案集中、统一语气、可审查。
- **产出**：`web/lib/copy/zh.ts`（按模块导出常量）、`web/lib/copy/zh.test.ts`、`web/lib/copy/SAFETY_TERMS_PROPOSAL.md`（建议加入 rules.yaml 的禁用词，由 Claude Code 合入）。内容：
  - 同意页（用途、保留时长、删除方式、14 周岁确认）与隐私三条事实。
  - 上传要点四条；每个 QC 原因码的一句原因 + 一句做法（原因码以 `src/aesthetic_passport/qc.py` 与 `config/qc.yaml` 中的为准：no_face、multiple_faces、face_too_small、blurry、underexposed、overexposed、pose_off_axis、wrong_angle_for_role 等，再加 beauty_filter_suspect）。
  - 五个话题入口（face / hair / style / color / outfit）的标题、副标题、示例说明。
  - 落地页四屏文案；表达方向问题；反馈原因标签；调整面板选项；付费墙卡片；评分预告（“即将上线”，无数字）；分享卡说明与小红书文案模板（不用“变美”“逆袭”）。
- **依赖**：无。
- **最小验收**：测试校验每个 QC 原因码都有文案；全部文案不含禁用词（预告卡固定文案在白名单内）；无英文残留（专有名词除外）。

---

## 3. 工作流 A · 核心档案与分享（增量 1）

页面任务的通用规则：只在 `web/app/p/[id]/<子页>/` 与 `web/components/<功能>/` 内工作；数据从 `usePassport()` 取；组件来自 K4 / K5 / K6；文案来自 K7；样例模式下必须可完整演示。

### A1 · 落地页（F1）· 智能体
- **结果**：访客 5 秒内看懂“会得到什么”，一个主按钮“上传一张正脸 · 免费”，下面一行五个话题链接。
- **复用**：现有 `web/app/page.tsx` 结构、K4 组件、K6 `ProfileCard`（案例展示）、K7 文案。
- **文件**：`web/app/page.tsx`、`web/components/landing/**`、`examples/cases/*.json`（由 Claude Code 提供 1 份插画示意案例，授权真人案例在 I1 后补）。
- **最小验收**：375 px 首屏同时可见标题、主按钮和一张案例卡；页脚无“作品”字样；`FEATURE_SCORE_TEASER=true` 时页尾出现预告卡，false 时不渲染；无密钥可用。

### A2 · 上传与同意（F2）· Claude Code
- **结果**：同意 → 选一张照片 → 300 ms 内给出质检结论与一条重拍建议 → 问一个表达方向问题 → 进入揭晓。
- **复用**：`wizard.tsx`、`photo-slot.tsx`（压缩、EXIF 校正）、`POST /api/qc`、`POST /api/passport`。
- **文件**：`web/app/start/**`、`web/components/upload/**`。
- **最小验收**：只用 `<input type="file" accept="image/*">`，代码中无 `getUserMedia`（测试搜索）；每个 QC 原因码映射到 K7 文案；“仍然使用这张”可继续；topic 与 ref 随请求带上；e2e（Playwright，假模型）从 `/start` 走到 `/p/[id]`。

### A3 · 揭晓式进度（F4）· Claude Code
- **结果**：3 秒内照片上出现比例线与 CV 数字，约 15 秒出现“初见”，完整档案到达后平滑切换。
- **复用**：K4 `Stage`、`RevealSteps`；`partial` 快照。
- **文件**：`web/app/p/[id]/page.tsx`（揭晓态）、`web/components/reveal/**`。
- **最小验收**：用假 API 按序注入 anchors → quick → analysis，界面依序出现；刷新后从快照恢复；quick 失败时仍显示 CV 与进度；分析失败时保留已有内容并给出“重试一次”。

### A4 · 形象档案第一层（F5）· Claude Code
- **结果**：一屏看到封面一句话、三张档案卡（脸 / 色彩 / 风格）、“先做这一件”、四类推荐入口，以及“分享档案卡”。
- **复用**：`header.tsx`、`top-five.tsx` 的排序结果、K4 `ProfileTriptych`、`ResembleToggle`、K6 缩略。
- **文件**：`web/app/p/[id]/page.tsx`（完成态）、`web/components/profile/**`。
- **最小验收**：375 px 下封面、三卡与“先做这一件”在两屏内；每张卡有“像我 / 不太像”；照片过期时封面换成插画头像并说明；推荐入口带缩略（无试看时用插画）。

### A5 · 面部美学页（F6）+ 评分预告 · 智能体
- **结果**：三庭五眼与轮廓在照片上标出，每条特点有“所以 →”跳转到推荐。
- **复用**：`how-we-know.tsx` 的维度条、`evidence.tsx`、anchors 新字段、geometry。
- **文件**：`web/app/p/[id]/face/**`、`web/components/face/**`。
- **最小验收**：被刘海遮挡时上庭显示“未测量”；只显示“常见范围”灰带并注明不代表好坏；页面上无任何分数；`FEATURE_SCORE_TEASER` 打开时底部渲染 `ScoreTeaserCard`，点击发送 `score_teaser_click` 事件。

### A6 · 色彩页与数字披布（F7）· 智能体
- **结果**：三组色卡（近脸 / 衣橱底色 / 慎用），点色块即在下巴下方换“布”，按住看原图，两色并排对比。
- **复用**：`color_profile` favor / neutral / avoid、K5 `drape`、K4 `SwatchGrid`、`CompareView`、geometry。
- **文件**：`web/app/p/[id]/color/**`、`web/components/color/**`。
- **最小验收**：切换颜色 < 100 ms（样例图）；照片过期时只显示色卡；置信度低时给出提示与“白纸校准即将提供”；每个颜色可复制搜索词。

### A7 · 风格页四层（F8）· 智能体
- **结果**：平面图上的位置与不确定圈；四层分开显示（你的特征 / 看起来像 / 你喜欢 / 你想去）；风格规则；“我更喜欢另一种”。
- **复用**：K4 `StylePlane`、`FeedbackChips`；K1 规则（经 `derived.style_profile.rules_zh`）。
- **文件**：`web/app/p/[id]/style/**`、`web/components/style/**`。
- **最小验收**：八个标签在三种表达方向下都正确渲染；选择偏好后调用 feedback + rerank，`face_only` 点位不动、偏好点出现、提示一行变化说明；临界时显示“介于 A 与 B 之间”。

### A8 · 渐进补充（F3）· 智能体
- **结果**：看完档案后，用看图选择补充侧脸（选填）、发质、想要的感觉、身形、风格偏好与目标、现实条件。
- **复用**：K4 组件、K7 文案、`photo-slot.tsx`。
- **文件**：`web/app/p/[id]/more/**`、`web/components/enrich/**`。
- **最小验收**：每项可单独提交；只有侧脸照片会触发模型重跑，其余只触发 rerank（以 API 返回为准）；身形页写明“不会分析你的身材照片”；全部可跳过。

### A9 · 基础反馈与调整面板（F16 基础）· Claude Code
- **结果**：档案、风格、发型、穿搭处处可反馈；“调整”面板改预算、打理时间、烫染、场合、风格目标后 1 秒内重排，并显示一行变化说明。
- **复用**：T03 `apply_feedback`、T04 feedback / rerank、K4 `FeedbackChips`。
- **文件**：`web/lib/state/**`（反馈动作）、`web/components/adjust/**`。
- **最小验收**：反馈后 analysis 字节不变（API 测试）；调整后的变化说明来自 `derived.feedback_applied`；未付费用户也能使用；离线时反馈排队重发。

### A10 · 档案卡分享与删除（F17 增量 1）· 智能体
- **结果**：选插画头像 / 色卡艺术 / 本人肖像，生成 3:4 档案卡并保存；可生成只读链接；页面底部随时可删除全部数据。
- **复用**：K6 `ProfileCard`、`exportPng`；T04 share / delete。
- **文件**：`web/app/p/[id]/share/**`、`web/components/share/**`、`web/app/s/[token]/**`（只读分享页）。
- **最小验收**：肖像需每次单独勾选；导出的 PNG 带 AI 标识与 `AIGC` 元数据；分享页不含照片；删除后显示删除时间且再次访问返回“已删除”。

---

## 4. 工作流 B · 造型与试看（B1 在增量 1，其余增量 2）

### B1 · 发型试看引擎 · Claude Code
- **结果**：任意发型方向（及眼镜、领口）都能生成“像本人”的试看；长发与刘海不被截断。
- **复用**：`preview.py`、`masks.py`（`protected_region`、`edit_mask`、`feathered_alpha`、`head_crop_box`）、`providers/image/{qwen,fake}.py`、`api/previews.py`、`prompts/image_edit.md`。
- **改动**：
  - `previews[]` 多目标任务，`kind: hair|glasses|neckline`，并发 3，各自失败各自重试一次。
  - 软保护：核心区（眼、鼻、口外扩 6 px）永远原图；边缘区（脸颊外缘、额角、下颌外缘）允许结果中被分割为头发的像素覆盖。
  - 边界带 Lab 均值 / 方差颜色迁移；`config/qc.yaml: composite_mode: feather | seamless`（seamless 用 `cv2.seamlessClone`，默认关闭）。
  - 质量门：核心区逐像素不变 + 发型区域变化量下限；不达标自动重生一次，再失败标记为 `fallback`（前端显示款式插画）。
  - 输出图左下角叠加“AI 试看”，写入 PNG / JPEG 元数据。
  - 免费额度 1 张（稳妥方向）。
- **依赖**：T02。
- **最小验收**：假模型下三张并行生成；核心区像素逐一相等（测试）；模拟“长发覆盖脸颊”的合成测试中，边缘区头发像素得以保留；元数据可读出；`make test` 绿。

### B2 · 发型页：三方向、比较、发型师卡（F9）· 智能体
- **结果**：稳妥 / 突破 / 省心三张试看 + “现在”，参数与打理成本，喜欢 / 一般 / 不喜欢，比较模式，“就选它”生成发型师卡。
- **复用**：K4 `CompareView`、`FeedbackChips`；K6 `StylistCard`；`hair_options`、`hair_option_checks`、K3 款式库。
- **文件**：`web/app/p/[id]/hair/**`、`web/components/hair/**`。
- **最小验收**：免费用户只见“稳妥”，其余两张显示 `PaywallCard`；试看失败时显示参数插画 + 重试；发型师卡可选遮脸，导出带 AI 标识；男性表达方向显示两侧 / 顶部 / 刘海 / 分线参数。

### B3 · 穿搭推荐与领口试看（F10）· 智能体
- **结果**：3–5 条搭配公式、8–12 件核心单品（附理由与搜索词）、3 个场合方案；近脸单品可在照片上做颜色 / 领口对比。
- **复用**：`outfit_direction`、`outfit_checks`、K2 单品库、K5 `drape`、K4 组件。
- **文件**：`web/app/p/[id]/outfit/**`、`web/components/outfit/**`。
- **最小验收**：免费用户看到前 2 条公式，其余为付费墙；未提供身形时显示“加入身形后更准”；单品反馈触发重排；搜索词一键复制。

### B4 · 妆容方向与试色（F11）· 智能体
- **结果**：唇色 6–8 个、三档浓度，腮红三种位置，色调方向，随时切回原图；男性表达方向显示理容建议。
- **复用**：K5 `lipTint`、`blush`、`tone`；`makeup_direction`、`lip_families`；geometry。
- **文件**：`web/app/p/[id]/makeup/**`、`web/components/makeup/**`。
- **最小验收**：原图切换 < 50 ms；张口或唇部被遮挡（geometry 标记）时不提供唇色；免费用户可试 2 个唇色，其余为付费墙；页面写明“试色基于当前妆面”。

### B5 · 眼镜、理容与改进计划（F13、F14）· 智能体（页面）+ Claude Code（眼镜试戴）
- **结果**：镜框尺寸卡（mm 区间）、2–3 种形状试戴、按场景的理容 / 妆容组合；三栏改进计划可勾选。
- **复用**：`derived.glasses_size`、`derived.plan`、B1 `kind: glasses`、`masks.py` 的 glasses 蒙版。
- **文件**：`web/app/p/[id]/glasses/**`、`web/app/p/[id]/plan/**`、`web/components/{glasses,plan}/**`；Claude Code 在 `prompts/image_edit.md` 增加眼镜段落。
- **最小验收**：虹膜不可靠时不显示 mm；计划项可追溯到建议与观察（数据测试）；勾选状态存本地；空栏不显示。

---

## 5. 工作流 C · 高级互动与持久化（增量 3–4）

### C1 · 穿搭检测（F12）· Claude Code（管线）+ 智能体（页面）
- **结果**：上传全身照，15 秒内得到 1 个最值得的调整和最多 2 个备选；风格贴合用三档文字。
- **复用**：`selfie_multiclass` 分割（`cv.py`）、`color_sample.py` 的 Lab 工具、色卡与风格档案。
- **改动**：`schema/outfit_check.schema.json`、`prompts/outfit_check.md`、`src/aesthetic_passport/outfit_check.py`、`POST /api/outfit-check`、`web/app/check/**`。照片处理完即删。只分析衣物颜色、廓形、上下身分割与画面构成，不计算任何体型量。
- **最小验收**：假模型端到端；身材评价词命中即修复重试，再命中则失败（测试）；处理后照片文件不存在（测试）；需付费权益（合理使用限额在配置中）。

### C2 · 详细分析第三层（F15）· 智能体
- **结果**：标注照片可切换图层（比例线 / 脸型轮廓 / 取色点），点观察条目高亮区域；方法说明折叠区。
- **复用**：`how-we-know.tsx`、`evidence.tsx`、`details.tsx`、`observations[].region`、geometry。
- **文件**：`web/app/p/[id]/detail/**`、`web/components/detail/**`。
- **最小验收**：每条观察要么能高亮、要么标注“整体印象”；照片过期时用示意轮廓；英文 prompt 与 score_breakdown 只在折叠区。

### C3 · 高级反馈与轻账户（F16 高级、保存护照）· Claude Code
- **结果**：“再给我一个方向”、调整历史与撤销、收藏、手机号登录保存护照、偏好跨护照预填。
- **改动**：`POST /api/passport/{id}/more-options`（新模型请求，付费，上限 3 次）、`derived` 版本历史、`users` 与 `favorites` 表、`SMS_PROVIDER=fake` 登录、`web/app/me/**`。
- **最小验收**：撤销恢复上一 `derived_version`；more-options 计入调用日志与额度；登录后护照不再 7 天过期；删除账户级联删除。

### C4 · 白纸校准、剪后回访、9:16 揭晓视频 · Claude Code + 智能体（视频模板）
- **结果**：拍白纸提升色彩置信度；剪后上传照片与选定方向对比；一键生成抖音 9:16 揭晓视频。
- **改动**：`src/aesthetic_passport/calibration.py`（白纸检测 + von Kries，重算 C12，`calibrated: true`）；`POST /api/passport/{id}/checkin`；视频由 K6 同一套视觉的逐帧模板 + 服务端 ffmpeg 合成（默认插画头像版，肖像需勾选）。
- **最小验收**：合成色偏图校准后取色误差下降（测试）；回访照片 24 小时删除；视频带 AI 标识与署名，无肖像勾选时不含照片像素。

---

## 6. 工作流 D · 分发与单次付费

### D1 · 话题入口、归因、埋点与评分预告开关 · 智能体（页面）+ Claude Code（events）
- **结果**：`/t/face|hair|style|color|outfit` 五个入口只换首屏文案与示例，走同一次上传，完成后落到 `/p/[id]/<topic>`；分享卡短链带 `ref`。
- **文件**：`web/app/t/[topic]/**`、`web/components/topic/**`；Claude Code：events 接入与 `ref` 透传。
- **最小验收**：五个入口都能完成上传并落到对应子页（e2e，假模型）；events 中出现 topic 与 ref；评分预告默认关闭。

### D2 · 单次付费与权益（假支付）· Claude Code
- **结果**：免费内容完整可用；付费墙只出现在 PRD F4 列出的位置；“解锁完整护照”后立即可见全部内容。
- **改动**：`src/aesthetic_passport/payments/{base,fake}.py`、`POST /api/checkout`、`POST /api/payments/webhook`（幂等）、`payments` 表、`passports.paid`、服务端按 `entitlement` 裁剪付费字段；邀请码解锁；价格在 `config/pricing.yaml`（单一价格，先 ¥39）；`web/app/p/[id]/unlock/**`。
- **最小验收**：未付费响应中不含付费字段（测试，不靠前端隐藏）；重复 webhook 不重复记账；邀请码可解锁；上传、揭晓、档案卡与分享路径上没有付费拦截（e2e）。

### D3 · 真实支付适配 · Claude Code
- **结果**：微信支付 H5 / 支付宝 H5 真实收款。
- **依赖**：D2；商户号与密钥（届时一次性向 Yeric 列出环境变量名）。
- **最小验收**：沙箱环境下单、回调、退款各一次通过；密钥只来自环境变量。

---

## 7. 发布

### I1 · 关键路径验证与部署（每个增量一次）· Claude Code + Yeric
- **内容**：CI 全绿；用 5–10 组经同意的照片（以女性长发、刘海、卷发为主）在真实模型上跑完 上传 → 揭晓 → 档案 → 反馈 → 试看 → 档案卡 → 删除；记录首次通过率、p50 延迟、单份成本、试看是否截断；安全词 0 命中；结果写入 `docs/ITERATION_LOG.md`。
- **需要 Yeric**：提供经同意的照片放在 `data/`；确认部署（`v2 → main`）。
- **最小验收**：上述路径全部走通；失败项有降级方案（例如试看降级为款式插画）后即可发布，不等待更大规模评测。

---

## 8. 文件所有权速查

| 负责人 | 文件 |
|---|---|
| Claude Code | `CLAUDE.md`、`docs/DECISIONS.md`、`docs/SCHEMA.md`、`docs/ITERATION_LOG.md`、`schema/**`、`examples/**`、`web/lib/fixtures/**`、`web/lib/passport.ts`、`web/lib/api.ts`、`web/lib/state/**`、`web/lib/adapters/**`、`web/lib/flags.ts`、`web/app/layout.tsx`、`web/app/p/[id]/layout.tsx`、`web/app/p/[id]/page.tsx`、`web/app/start/**`、`web/app/globals.css`、`web/package.json`、`src/aesthetic_passport/**`（除智能体新增的独立模块外）、`prompts/**`、`config/{rules,qc,models,pricing}.yaml`、`THIRD_PARTY.md`、`.github/**`、`Makefile` |
| K1 | `config/styles.yaml`、`tests/test_styles_config.py` |
| K2 | `config/garments.yaml`、`tests/test_garments_config.py` |
| K3 | `config/hairstyles.json`、`tests/test_hairstyles_catalog.py` |
| K4 | `web/components/ds/**`、`web/app/dev/**` |
| K5 | `web/lib/tint/**` |
| K6 | `web/components/cards/**` |
| K7 | `web/lib/copy/**` |
| 页面任务 | 各自的 `web/app/p/[id]/<子页>/**`、`web/app/{t,s,check,me}/**` 与 `web/components/<功能>/**` |

## 9. 依赖与开工时间速查

```
立即：T00 → T01；K1 K2 K3 K4 K5 K6 K7
T01 后：T02 ∥ T03 ∥ T05
T02 后：B1
T02 + T03 后：T04
T04 + T05 后：A2 A3 A9 D1；（T05 后即可）A1 A5 A6 A7 A8 A10
A3 后：A4
增量 1 发布（I1）后：B2 B3 B4 B5 D2 C2
增量 2 发布后：C1 C3
增量 3 发布后：C4；商户凭证到位：D3
```
