# Ridge 参数导出与单次关键路径方案

目标：生成真实 17 维 Ridge 系数，验证上传 → 现有 CV → Ridge → 报告，记录进程峰值 RSS。

选择：复用 PR #64 的 NumPy artifact 与已有 ridge_fit。相比重写规则评分，保留已测回归方法；相比 DINOv2，不增加大型推理依赖。参考 https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html 。保留现有拟合算法以复现实验，不更换 sklearn 实现。

1. 官方 SCUT 数据仅下载到忽略目录，完整 3300/2200 原始划分，训练选 alpha，测试只验收。导出 mu/sd/w/b/features/alpha、版本和哈希。附件导出格式与 PR #64 不兼容，统一用 PR #64 格式。
2. cv.py 将 landmarker、segmenter 分别按需加载；测试缺少分割文件仍可做人脸检测，反向亦然，且重复调用仅加载一次。
3. 独立离线验收工具通过真实 API multipart 上传，fake 文本分析/支付，真实 QC 和 CV。在 pipeline._score 的测试包装内消费同一 front.face，不调用第二套检测。Ridge 是单独研究结果，不伪装为 D36，生产 Passport 契约不改。
4. 新进程运行一次，采样和系统高水位记录内存（MiB），包括初始化及上传至报告；约 400 MiB 为目标。Windows 本机结果不能直接证明 Linux Render 达标。报告只含聚合运行指标，不输出人脸特征和分数到日志。
5. pytest 全量与 ruff；PR 说明复用 #64 并保留其来源。数据、真实系数、报告不提交。

生产切换后续：单独版本化 learned score，明确 SCUT 1–5；需新契约及决定记录。严格十分制必须独立校准；同版本同模型参考分布具备前不展示百分位。用户确认已有授权，本次无部署操作。
