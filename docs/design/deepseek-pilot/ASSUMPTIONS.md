# 假设、范围边界与不可得证据

BeautyAI V3 · DeepSeek Pilot 交付物 3/3
配套：`T1_COPY.md`、`T2_ASSET_MATRIX.md`
状态：定稿。原 A1 已依据 `V3_MASTER_BRIEF.md` §3 解决，不再需要产品澄清。

---

## A. 已确认，不再是假设

### A1（已解决）模块编号对应 §3 首页 12 模块叙事

`V3_MASTER_BRIEF.md` §3 模块表逐行可查，三个编号与名称完全对应，无需另行确认：

| 编号 | 幕 | 模块 | 首版 / 负责人 |
|---|---|---|---|
| 05 | Understanding | Aesthetic Assessment — How should scores and ranking be understood? | M3 UI contract, learned-vs-geometry separation and truthful unavailable states |
| 09 | Personalization | Action Plan — What do I do next? | M3；GPT/Codex；**DeepSeek copy trial** |
| 12 | Delivery | Confidence & CTA — Can I trust it and start? | M3 clear method/privacy/FAQ, supported promises |

**推论（已写入交付物）**：T1 文案的服务对象是**首页叙事模块**，不是三个独立产品路由。`§3` 对 05 的职责表述「learned-vs-geometry separation」即为本次修订的结构依据；09 是 §7 指定的 DeepSeek 试点任务；12 的职责明确限定为「supported promises」。

### A2（已确认）评分口径分层

`§5` 与 `§2` 明确三层并须分离：几何协调（geometric harmony）、学习型吸引力（learned attractiveness）、模型匹配队列分位（model-matched cohort CDF）。§5 进一步规定：不得把现有几何分或竞品直方图映射为学习型分数；生产分数/排名在授权、QC、模型或队列证据缺失时必须 fail-closed。T1 模块 05 已按此三层重写。

### A3（已确认）术语来源唯一

`web/lib/copy/zh.ts` 为既有中文文案的唯一来源；`SAFETY_TERMS_PROPOSAL.md` 定义禁用词与两处逐字例外。T1 全部用词映射自该文件，未新造同义词。

---

## B. 仍成立的假设（不影响结论，但请知悉）

| # | 假设 | 风险 |
|---|---|---|
| B1 | 单模块采用「眉标 + 主标题 + 正文 + CTA + 状态集」的版式组织 | §3 要求每段有独立叙事职责，但未规定内部结构；若设计侧另有版式规范，部件可重排，文案本身不变 |
| B2 | 六人 → 模块的放置映射（如 P003→03、P004→03/07）由 `V3_ASSET_PLAN.md` §2「Role in eventual V3」+ 各模块图片需求推断 | 资产计划只给人物角色，未给模块编号；映射可能需设计侧微调 |
| B3 | 价格不落字，由 `config/pricing.yaml` 注入 | `zh.ts › paywall.priceSuffix` 只提供后缀；`SAFETY_TERMS_PROPOSAL.md` 明确不内置第二份价格 |
| B4 | 正文为书面编辑体，不用感叹号与网络语 | 由 `hero.tsx`、`profile.tsx` 现有中文语感推定 |

---

## C. 范围边界：本次明确未做

| # | 未做事项 | 说明 |
|---|---|---|
| C1 | **未做视觉图像质量检查** | T2 是元数据与源代码审计。未打开任何 WebP 像素内容，未评估构图、眼位承托、裁切安全区、五官瑕疵、皮肤质感。相关结论须由视觉评审另行出具 |
| C2 | **未运行应用，未截图** | 全部结论来自源码、fixture、git tree 与文件头。无法评价真实渲染下的换行、行高、对比度、移动端折叠；T1 的「≤2 行」为按字数估算，非实测 |
| C3 | **未核对朝向声明的画面一致性** | `facing` 为 `portraits.ts` 元数据声明，本次未与图像画面比对 |
| C4 | **未取得原始授权文件** | `provenance.json` 声明素材由产品负责人批准并记录 SHA-256，但支撑该批准的许可文本不在仓库内；无法独立验证商用范围与期限 |
| C5 | **未做竞品/参考站截图比对** | `docs/design/reference/` 已有捕获，本次未逐张查阅；视觉相似度评审不在范围 |
| C6 | **未提交 T3** | §7 所述 T3（How It Works 小组件）不在本次任务范围 |

---

## D. 不可得证据（仓库无法证明的项）

| # | 缺口 | 为何不可得 |
|---|---|---|
| D1 | **本地是否已存在 P0-A/P0-B/P0-C 候选资产** | 母版存于 git-ignored 的 `data/demo-assets`；`V3_ASSET_PLAN.md` §4 规定「no image bytes pushed to Git before approvals」。仓库只能证明「未提交、无验收记录」，不能证明「未生成」。T2 §4 已按此区分 |
| D2 | **P002 正/侧是否同一人** | `identityPairVerified:false`；发布尺寸不同只能说明裁切不同，既不能证明同一人，也不能反证 |
| D3 | **镜框权利、SKU、尺寸数据** | 仅知「权利未建立」的结论，缺具体权利方与规格材料 |
| D4 | **对照样本规模、时间窗口、构成** | `referenceRank` 仅述「公开的自愿扫描样本、近似值」；故文案刻意不写任何数字 |
| D5 | **学习型评分的可用时点** | 依赖 #13（模型权利与推断）、#33（匹配队列）、#34（界面集成）。本次不推测，文案亦不写任何时间承诺 |

---

## E. 隔离与提交声明

- 从 `main` 新建隔离分支 `docs/deepseek-v3-t1-t2`，仅新增三份 Markdown 至 `docs/design/deepseek-pilot/`。
- **未修改**：生产代码、`web/lib/assets/portraits.ts`、任何图片资产、`V3_MASTER_BRIEF.md` 与 `V3_ASSET_PLAN.md` 等既有 V3 母文档。
- **未新增**：几何注册、路由、依赖、schema、feature flag。
- 以 documentation-only PR 提交，**不合并**。
- 未移动、未重命名、未重新登记任何既有资产。
