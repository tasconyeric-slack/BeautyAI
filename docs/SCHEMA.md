# Schema 说明 v0.8

两份文件，一个原则：**生产分析模型只写 `analysis`；CV、确定性回归与规则分别由流水线组装。**

v0.8（D42）新增两个可选、可为 null 的顶层字段，仍接受 v0.3–v0.7 存储报告：

- `learned_attractiveness`：现有 PhotoCheck 几何特征的 Ridge 预测；原生 `raw_score` 为 1–5，`display_score` 为明确版本化的 `1 + (raw_score - 1) * 9/4`，不赋予 PSL 等级含义。包含完整模型身份、SHA256、QC、授权状态、不可用原因及推理耗时。不可用时两种分数都为 null。
- `learned_reference_rank`：复用 #33 的 ECDF 与 #62 tiers，独立于 D37 `reference_percentiles`。只有同模型、同预处理、同尺度和获授权参考集才输出数字；包含样本版本、单位、规模、近似分位与区间。SCUT 研究集的单位是照片，`n_unique_subjects=null`；生产模式拒绝该研究集。

两者不进入或修改 `analysis`、不替代 D36 `aesthetic_score`，也不影响偏好重排。生产分析提示词升至 `analyzer-0.3.1`，analysis schema 不变。

| 块 | 谁产生 | 文件 / 代码 |
|---|---|---|
| `user_context` | 用户填写 | 前端表单 |
| `input_quality` | CV 质检 | `qc.py` |
| `anchors`（含 `face_shape_heuristic`） | CV 测量 | `anchors.py` · `face_shape.py` |
| `color_measurements` | CV 颜色取样（输入信号，D15） | `color_sample.py` |
| `analysis` | 生产模型 | `analysis.schema.json` |
| `derived` | 规则层 | `rules.py` + `config/rules.yaml` + `config/hairstyles.json` |
| `preview` | 图像编辑 | `preview.py` |
| `meta` | 管线 | `pipeline.py` |

## v0.2 新增字段与对应的报告区块

每个字段都必须有页面在用（简报 §5）。

| 字段 | 层 | 报告区块 |
|---|---|---|
| `analysis.profile_summary` | 模型 | §1 护照头卡（一句话、方向） |
| `analysis.hair_direction` | 模型 | §5 发型（保留 / 改变 / 避免、目标参数、理发师话术） |
| `analysis.glasses_direction` | 模型 | §7 眼镜与修饰 |
| `analysis.photo_direction` | 模型 | §8 照片呈现 |
| `analysis.color_profile.chroma / neutral_families / seasonal_leaning` | 模型 | §6 色彩 |
| `anchors.face_shape_heuristic` | CV | §9 视觉档案（与模型判断并排）；规则 C11 |
| `color_measurements` | CV | §6 测量取样色块、§9 取样表；规则 C12 |
| `derived.display_labels.color.temperature_confidence / chroma_confidence` | 规则 | §6 四个色彩轴的置信度（封顶之后） |
| `derived.display_labels.seasonal_leaning` | 规则 | §6 季型倾向（门控，不通过时为 null） |
| `derived.hair_references` | 规则 | §5 参考款式（款式库匹配，含 mm 参数） |

照片角色改为 `front`、`profile45`（必填）、`smile`、`hair`（选填）（D14）；`desired_impression` 新增 `youthful`、`professional`。

## analysis 的内部逻辑：观察 → 推断 → 建议

1. `observations`：10–20 条原子化、中性、可见的事实，编号 `o1…`，标注出自哪张照片、是优势、问题还是中性。
2. 推断各块（`face_structure`、`feature_characteristics`、`color_profile`、`style_dimensions`、`works`、`doesnt_work`）都必须用 `evidence` 引用观察编号。
3. `recommendations`：6–8 条候选，至少 3 个类别。每条必须包含：

| 字段 | 含义 |
|---|---|
| `action` | 具体动作，不是形容词 |
| `why` | 为什么，引用观察 |
| `how_to` | 1–4 步明天就能做的操作，例如对理发师说的原话、购物搜索词 |
| `evidence` | 观察编号 |
| `expected_effect` | 预期效果 |
| `avoid` | 该避开什么 |
| `impact` / `effort` | 1–5，刻度定义见生产 Prompt |
| `confidence` | 0–1 |
| `constraint_check` | 与用户约束的关系：符合 / 需确认 / 违反 |
| `visual_edit_spec` | 可预览时给出编辑区域、英文目标描述、需保持不变的部分；否则为 null |

## 连续维度

| 维度 | 刻度 | 含义 |
|---|---|---|
| `visual_weight` | 1–5 | 量感 |
| `angular_rounded` | −2 直 … +2 曲 | 曲直 |
| `compact_elongated` | −2 紧凑 … +2 修长 | 纵向比例印象 |
| `soft_sharp` | −2 柔 … +2 锐 | 轮廓清晰度 |
| `youthful_mature` | −2 … +2 | 由比例带来的成熟印象，不是年龄 |

风格标签 = 在（量感，曲直）平面上离哪个原型最近，原型坐标在 `config/rules.yaml`。

## derived 的计算

- 排序分 = 影响力/5 × 置信度 × 难度系数 × 目标加成 × 需确认折扣。违反约束或引用了不存在的观察的建议直接剔除；每个类别最多 2 条；取前 5。
- 每条建议的分数拆解（`score_breakdown`）都保存下来，前端可以展示「为什么排第一」。
- 一致性标记 C1–C12 的含义见 `rules.py` 顶部注释。C11：测量启发式的首选脸型不在模型前两名；C12：模型冷暖与测量的脸颊 b* 相反，或颜色取样可靠性低，冷暖与饱和度置信度封顶 0.4。
- 季型倾向只在冷暖与饱和度置信度（封顶后）都 ≥ `seasonal_min_conf` 且没有 C12 时展示，措辞为「色彩方向参考：偏向某季型」。
- 参考款式：纹理兼容且两侧处理与建议一致的款式才参与打分（脸型 + 长度 + 刘海 + 顶部高度 + 打理时间），只展示与最佳匹配分数接近的 1–2 个。

## 版本规则

- 改 Schema：同时升级 `schema_version`、Prompt 版本，更新 `examples/` 和测试，在 `DECISIONS.md` 记一条。
- 只改规则阈值：升级 `config/rules.yaml` 的 `rules_version`，重跑样例和评测，在 `ITERATION_LOG.md` 记一行。
- DeepSeek 用 JSON 模式，不接受 Schema 参数：完整 Schema 写进系统提示词（见 `schema_io.analysis_schema_for_prompt`）；本地校验始终用完整版。
- Schema 表达不了的输出契约（建议 6–8 条、至少 3 个类别、编号不重复）由 `schema_io.check_output_contract` 检查，失败与 Schema 错误一样触发一次重试。

## v0.4（V3A，2026-10-23，D34）

| 层 | 新字段 | 说明 |
|---|---|---|
| CV | `measurement_profile` | 正脸测量档案：`metrics[]` 每项含 `value`（相对值，不测量时为 null）、`unit`、`decimals`（显示精度）、`availability`（measured / not_measured / needs_photo）、`missing_reason`、`confidence`、`tier`（free / full）、`overlay`（点名与线段，不含坐标）；另有 `pose`、`flags`（张嘴、闭眼、上庭遮挡、发际线、侧脸照）、`coverage`、`groups`、`pillars`、`missing_reasons_zh`。定义见 `config/face_metrics.yaml` |
| 规则 | `derived.measurement_insights` | `items[]`：看到的（`seen_zh`）→ 意味着（`means_zh`）→ 所以建议（`advice[]`，含页面与排序最高的同类建议 `rec_id`），`band` = low / typical / high（相对常见范围），`highlight` 标出首屏三条；`pillars[]`：四个维度的已测项数与文字摘要。配置在 `config/rules.yaml measurement_insights` |
| 媒体 | `geometry.json → points` | 所有命名关键点与辅助点（归一化坐标），供叠图；随正脸照 24 小时删除，不进护照 |

免费视图（`api/entitlement.free_view`）只保留 `tier: free` 的测量，并把 `measurement_profile.full` 写入 `entitlement.locked`。

## v0.3.1（V2.1，2026-10-23）

- `input_quality.photos[].issues` 增加 `beauty_filter_suspect`（质检早已产生，此前缺失导致组装失败）。`schema_version` 接受 `"0.3"` 与 `"0.3.1"`，新护照写 `"0.3.1"`。
- API 外壳 `partial.previews[]` 增加可选 `crop_box`（归一化 `[x0, y0, x1, y1]`，生成图在原图上的位置，供形象实验室叠加）；`target_id` 可为 `<tier>_hc<i>` 或 `current_hc<i>`。

## v0.3（V2，2026-10-22）

契约文件：`schema/analysis.schema.json`（analyzer-0.3）、`schema/passport.schema.json`（`schema_version: "0.3"`）、
新增 `schema/quick.schema.json`（analyzer-quick-0.1 首见结果）与 `schema/api.schema.json`（API 响应外壳）。
TypeScript 类型 `Passport`、`QuickAnalysis`、`PassportResponse` 均由 `make types` 生成到 `web/lib/passport.ts`。

| 层 | 新字段 | 说明 |
|---|---|---|
| 模型 | `observations[].region`（必填枚举） | 照片高亮位置；`overall` = 整体印象 |
| 模型 | `feature_signature[3]` | 封面三条特点：title、observation_ids、region、styling_implication |
| 模型 | `hair_options[3]`（safe / bold / easy 各一，取代 `hair_direction.named_styles`） | 参数、打理成本、requires（perm/dye/grow_out/straighten）、三句发型师话术、编辑规格 |
| 模型 | `color_profile.combos[]`、`hair_color_directions[]`、`lip_families[]` | 色彩应用、发色方向、唇色族（妆容试色） |
| 模型 | `makeup_direction`（mode: makeup / grooming）、`outfit_direction`（formulas、items 引用 garments.yaml、occasions） | 妆容 / 理容、穿搭 |
| 模型 | `recommendations[].cost_band / time_to_effect / pairs_with / success_check` | 计划 |
| CV | `anchors.thirds`、`eye_fifths`、`iris_px`、`cheekbone_px`、`intercanthal_px`（可选） | 三庭五眼、眼镜尺寸比例尺 |
| 用户 | `user_context.hair / haircut_budget / occasions / current_style_picks / body / style_preferences / target_style / topic / ref` | 全部有默认值（`assemble.complete_user_context`）；身形只来自用户输入 |
| 规则 | `derived.style_profile / hair_option_checks / glasses_size / plan / outfit_checks / feedback_applied / derived_version` | 风格四层、三方向校验、镜框 mm、三段计划、穿搭校验、反馈说明 |
| 图像 | `previews[]`（取代 `preview`）：新增 `target_id`、`kind`（hair / glasses / neckline）、`ai_label`；状态新增 `fallback` | 多目标试看 |

输出契约（`check_output_contract`）新增：签名引用的观察必须存在；hair_options 三个 tier 各一且编辑区域为 hair；
`pairs_with` 只能引用其他存在的建议；`outfit_direction.items[].garment_id` 必须在 `config/garments.yaml`（文件不存在时跳过）。
排除原因新增 `user_hidden`（用户以“不像我 / 预算不合适”等理由不喜欢）；`score_breakdown.feedback_factor` 记录反馈权重。

## v0.5（V3B，D35）

| 层 | 字段 | 说明 |
|---|---|---|
| CV | `input_quality.photos[].photo_id` += `profile90`、`noglasses`；`issues` += `eyewear_detected`、`profile_unclear` | 真侧脸与无眼镜正脸，各自独立质检 |
| CV | `measurement_profile.views[]` | 每张测量照片：角色、状态（measured / not_provided / unavailable）、原因、已测 / 总数、`capture`（用户确认的裁剪、旋转、尺寸） |
| CV | `measurement_profile.metrics[].source_photo / notes / locked` | 数值来自哪张照片；`eyewear` 注记；免费版锁定（数值与叠图已删除） |
| CV | `measurement_profile.catalog` | 176 项候选池的分类计数 |
| 规则 | `derived.measurement_insights.assessments[]` | 每个已测数值的区间定位：band、标签、参考范围、参考条位置、依据（literature / mesh / illustrative） |
| 媒体 | `geometry.json.views.{profile90,noglasses,smile}` | 各照片自己的归一化测量点；侧脸另有 `silhouette` 轮廓；与正脸照同寿命 |
| API | `media.photos.{role}` | 工作台用到的测量照片地址，24 小时后为 null |

## v0.6（AI 面部美学参考分，D36）

| 层 | 字段 | 说明 |
|---|---|---|
| 打分 | `aesthetic_score.overall_score` | 0–100，一位小数。只有四项都测到时才有值，否则为 null |
| 打分 | `aesthetic_score.component_scores.{symmetry,thirds,fifths,golden_ratio}` | 各项 0–100 或 null。权重 35 / 25 / 25 / 15（`weights`） |
| 打分 | `aesthetic_score.status / confidence / quality_flags` | full / limited / unavailable；可信度只有 full 时为 high；flags 说明原因（姿态、张嘴、闭眼、眼镜、额头遮挡、无关键点） |
| 打分 | `aesthetic_score.components[]` | 每项的名称、说明、权重、分数与 `measured`（三庭占比、以眼宽为单位的五段、长宽比、镜像残差与五个特征分） |
| 打分 | `aesthetic_score.tier / strengths[≤2] / improvement` | 档位（公开阈值、中性文字）；相对突出的两项；最低一项的调整方向（发型、眉妆、拍照） |
| 打分 | `aesthetic_score.scoring_version / provenance` | `aes-geo-1.0`；来源是正脸关键点，去倾斜坐标系 |

#41 的稳定接口是 `scoring.score_summary()`，包含 `overall_score`、`component_scores`、`scoring_version`、`quality_flags` 与 `status`。

## v0.7（参考人群位置与比例对照，D37）

| 层 | 字段 | 说明 |
|---|---|---|
| 规则 | `reference_percentiles.rank` | `status` ok / unavailable。ok 时有 `percentile_estimate`（低于该分的参考扫描占比）、`top_percent_estimate`、`precision`（interpolated / lower_tail_bound / upper_tail_bound）、`label_zh`、`note_zh` 和 `cohort`（N、日期、来源，`population_representative: false`）；unavailable 时有 `reason`（no_score / partial_score / out_of_range / score_scale_unverified）和 `reason_zh` |
| 规则 | `reference_percentiles.ratios.rails[]` | 12 项公开比例。ok 时有 `value`、`percentile_estimate`、`band`（只表示大小位置）和公开的 p5–p95；没有展示的项写明 `reason`（含 `definition_unverified`）。`higher_is_better` 恒为 null |
| 规则 | `reference_percentiles.engine_version / reference_distribution_version / provenance` | `percentiles-0.1`；数据版本；输入是 `aesthetic_score` 和正脸关键点 |

