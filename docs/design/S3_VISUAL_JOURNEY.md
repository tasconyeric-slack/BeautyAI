# S3 页面视觉与交互交付

2026-10-28；附件 NEXT_S3_TASKS.md（ENG-03 / DS-04 / AS-02）。根据用户最新要求，优先实际页面视觉重构与动态交互，不扩建边角失败分支。报告 R2 视觉方向保持冻结。

## 工作基线与实现

- PR #51 已由用户人工合并；已核实 merge commit `821c6b3`，原 head `8bddecc` 的 CI / Codex Review 通过且无未解决发现。本分支从最新 origin/main 开始。
- 上传页：桌面双栏同意页、大标题、纸色面板、合格/清晰/角度/光线/遮挡的可点击示意指引；手机自然堆叠。原有浏览器裁切、QC、照片协议继续复用。
- Studio：预览保持可见，控件分为发型与发色、妆容与配色、眼镜、我的造型；Radix Tabs 复用已有 MIT 依赖，支持方向键。选项跨分区保留，切换有短淡入；按住看原图、撤销、重置、生成、保存继续使用已有实现。
- 行动页：沿 R2 字体、纸色、墨绿与线框统一层级；Studio 保存的发型进入报告/计划，保存组合通过原有本地 id 完整恢复。
- 七区报告不重做；首页其他内容已有独立 PR #44，避免覆盖其所有权。S4 全首页与 S5 广泛动效/发布候选不在本轮扩展；本轮只交付必要交互过渡和 reduced-motion。

## DS-04 桌面 / 手机状态补稿

本表与实际实现共同构成补稿；不需要 Claude Design 从头设计。桌面：上传约 1080px，Studio 双栏（照片 / 分区控件），行动页阅读单栏。手机：上传指引缩为插画 + 短文，照片槽纵向；Studio 照片吸顶、四个分区随控件显示；行动页卡片纵排。按钮至少 44px，明显焦点；减少动态效果时取消转场。R2 token 参照 `web/components/report/full-report.module.css`，页面作用域见 `web/components/journey/journey.module.css`。

| 状态 | 真实触发条件 | 用户短文案 | 主动作 / 去向 | 不可用原因 |
|---|---|---|---|---|
| 同意 | processing / age 未同时勾选 | 先了解照片用途与保留时间 | 同意后选择照片，原 /start | 未同时同意不可继续 |
| 缺正脸 | slots.front 为空 | 一张正脸就可以开始 | 选择照片 → 原文件选择器/裁切编辑器 | 缺唯一必需照片，不能创建任务 |
| QC 中 | slot.checking | 正在检查照片 | 等待；可更换照片 | checking 时不能提交 |
| QC 警告 | PhotoQC.status=warn | 优先用服务端 messages[0] | 可更换/重裁；可带限制继续 | 不把 warn 当 reject |
| QC 拒绝 | PhotoQC.status=reject | 使用真实重拍建议 | 更换该槽照片 / 重裁检查 | 正脸 reject 不创建任务；选填 reject 不阻止正脸路径 |
| 读取任务 | loading 且没有响应 | 正在读取报告… | 等待读取 | 尚不知道任务状态，不宣称分析中 |
| 分析等待 | scanning / quick_ready，具体 stage 与 partial 数据 | 正在建立档案 / 识别关键区域 / 整理比例 / 生成建议 | 相同 id 的 /report；自动轮询 | 只有 full_ready 才展示完整报告；无假百分比或倒计时 |
| 分析失败 | analysis_failed | 这次分析已中断，重新选择照片后创建一次新分析 | 重新开始分析 → /start | 服务端没有独立 retry API；不能把 GET refresh 伪装为重跑 |
| 缺侧脸 | 侧面指标 needs_photo / view 缺失 | 当前正脸结果仍可参考 | 既有 /p/id/more 补充入口 | 不编造侧面测量 |
| Studio 无结果 | 所选 target 没有成功 preview | 发型尚未生成，照片上仍是现在的发型 | 生成这个造型 → 既有 previews 接口 | 免费用户走原 unlock；过期不能生成 |
| Studio 生成中 | 匹配 kind / target_id 的 pending，或此 target 的请求已发出 | 正在生成这个发型，可以先调颜色 | 保留其它本地操作 | 不重复提交同一生成；切其它方向不冒用 pending |
| Studio 失败 | 匹配 preview.failed / fallback | 这次没有生成成功 | 重试生成 → 相同接口 | 保留原图和本地选项，不伪装成成功图 |
| Studio 成功 | preview.succeeded 且图像解码/叠加成功 | AI 发型模拟已叠加 | 按住看原图 / 保存这个造型 | 不用 succeeded 字段代替图像实际可用 |
| Studio 坏图 | succeeded 但 hairState=error | 生成结果载入失败，仍是原来的发型 | 重新载入结果 → 重读图像 | 不因载入故障自动花费一次生成 |
| 保存与恢复 | 本地 choices.looks / hair / plan | 已保存，可以在行动方案里找到 | 我的造型 / 行动方案；用 look id 恢复参数 | 保存的是选项，不是生成完成的证明 |
| 媒体到期 | media.expired 或 expires_at 已过 | 照片已过期，请重新上传 | 重新上传 → /start | 图像/几何不可使用；已保存文本与选项可保留 |
| 公开样例 | isSampleId(id) | 这是公开样例，只能浏览 | 返回示例报告 / 开始自己的分析 | 不实例化 Studio/计划写入控件 |

## AS-02 教学素材与来源

`web/public/guides/qc/` 包含 7 张原创 SVG 示意，来源为本仓库脚本 `scripts/build_qc_teaching.py`；没有个人照片、没有新模型调用。manifest 逐张记录标签、用途、来源、SHA256 与通过记录。合格示意不绑定虚构 issue；`occluded_eyes` 仅教学，当前不作为独立门禁。低像素也可能使用 blurry 标签，不把裁切放大写成提高分辨率。

规则对应已核对 `config/qc.yaml` 与 `qc.py`。这是教学素材的规则/视觉核对，不是 CV 识别准确率或真实照片 QC 通过记录。

AS-01 同基图 safe/easy：素材目录只提供来源、测量照片与展示照，没有已批准且与生产方向对应的一对结果；本轮未新增生成或替换发型图。保留现有原图和真实任务状态。Figma 整理留待后续，不阻塞页面实现。

## 技术选择

1. 复用现有 React / Next / Radix Tabs（MIT）与既有 Canvas 图层，修改面板组织与页面样式；不用新的编辑器或状态框架。官方参考：[Radix Tabs](https://www.radix-ui.com/primitives/docs/components/tabs)。
2. QC 教学用原创可维护 SVG，对应标签明确、没有照片隐私或生成调用成本；照片写实教学需要后续独立素材验收。
3. 浏览器验证用已安装的 Playwright；fake/fixture 与真实服务分列。官方参考：[Playwright 网络验证](https://playwright.dev/docs/network)。

## 当前运行证据

运行日志与截图保存在本聊天的 `visualizations/2026/10/28/01a183e4-a2cc-72a0-9f2d-9fde24748d16/s3/`，不提交照片/运行数据。

- `npm run typecheck`、`NEXT_PUBLIC_USE_FIXTURE=1 npm run build` 通过。
- `npm test`：53 个 Vitest 文件 / 388 项，以及 60 项模块测试全部通过。
- `python -m ruff check src tests scripts` 通过（Windows 使用 Python 3.12 等价运行 make lint；未改 src/schema/config，无需重跑 Python 功能测试）。
- 生产构建上完成 1440×1000 / 390×844 两条正向旅程：文件选择 → 裁切确认 → fixture QC → 同 id 分析等待 → R2 → 切换省心方向 → 保存 → Studio 四分区 → 保存造型 → 行动主卡 → 完成勾选 → 刷新 → 恢复组合 → 原 fake checkout → fixture 生成结果 → 公开只读样例。无浏览器 pageerror。注意：这是交互验证，不是实际 CV / 模型验证。
- `desktop/mobile-{consent,upload,studio-hair,studio-colors,plan}.png` 为实际页面；`qc-teaching.png` 为素材视觉核对。来源、身份/构图问题未通过的发型图没有被替换。

| 范围 | 覆盖证据 | 层级 / 限制 |
|---|---|---|
| 桌面与手机成功旅程 | `web/scripts/s3-journey.mjs`，`journey.json` | 真实浏览器、现有 fixture 状态后端；没有实际 provider |
| QC 重拍 | `start-flow.test.tsx`，`photo-slot.test.tsx` | 组件接口与重裁流程；没有真实照片 QC 认证 |
| 分析失败恢复 | `reveal.test.tsx`，report `page.test.tsx` | 明确重新开始，不冒称刷新会重跑 |
| 缺侧脸 | 现有 full-report-s2 / report / measurement 测试 | 使用既有 needs_photo 与补充入口，不制造侧脸数据 |
| 预览失败 / 坏图 | `studio/journey.test.tsx`，既有报告测试 | 组件数据状态，保留原图与重载入口 |
| 媒体过期 | `studio/journey.test.tsx`，既有 full-report-s2 测试 | 合成状态/时间验证；真实服务保留策略未改 |

整分支自查已完成，远端 Codex Code Review 留作独立复核；没有委派子代理，符合仓库所有权约束。

## 保留的外部门槛

- PR #49 的持久化/稳定性由原负责人处理，本任务不覆盖其文件或宣称解决。
- 本地 data/ 没有可用测试照片，未发现已配置的项目 .env；真实 CV/生产模型全流程未验证。本轮以无需密钥的 fixture 验证交互；不宣称是真实生成成功。
- 未主动部署。涉及媒体可用状态及用户方案一致性，PR 保留 manual-review，CI 与 Codex 必须针对当前 head，最终人工 Squash and merge。
