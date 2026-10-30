# Ridge 17：参数交付与接入方案（2026-10-30）

后续接入见 [Ridge MVP](RIDGE_MVP.md)；以下保留 PR #66 的离线研究验收记录。

## 本次交付

已从 SCUT 官方发布页的 Google Drive 入口下载原始数据到本地忽略目录，使用发布的 3300/2200 划分重新拟合并导出真实系数。用户确认授权；此交付保持离线研究接口，不改变生产评分或部署。

真实文件：`models/aesthetics/geometry-ridge/scut-fbp5500-ridge-17.json`（2972 bytes，git ignored）。
SHA256：`e74489df4953054838dee2d4e9468a6095f5e77e837ae62ff9cc94cea95a4d25`。

统一使用 PR #64 的 `geometry-ridge-artifact-v1`，包含 `features` 顺序、`fit.w/mu/sd/b/alpha/n_train/cv_mae`、原始标签尺度、划分哈希、生成时间、仓库提交和测试结果。附件脚本的另一种格式未采用，避免导出后加载失败。

| 指标 | 原实验 | 本次复现 |
|---|---:|---:|
| 有效训练样本 | 3196 | 3196 |
| 有效测试样本 | 2128 | 2128 |
| alpha | 100 | 100 |
| Spearman | 0.6144 | 0.6144 |
| MAE（原生 1–5） | 0.4197 | 0.4197 |

未调参追逐测试集；使用既有 `ridge_fit` 默认训练内 CV 选择 alpha。序列化前后逐个测试样本预测一致（rtol/atol 1e-12）。这不是新增标注，也不是零训练：确实重新拟合一次以恢复遗失参数。

## 路线选择

1. **复用 NumPy Ridge（采用）**：已有真实基准，17 维推理无需 Torch、GPU 或另一套人脸检测。保留现有算法以便复现；不换成 sklearn，避免算法细节变化。
2. 手工 Geometry V2：无需训练，但没有证据证明更接近真人评价；本次不扩展。
3. DINOv2：保留已有离线基准，不增加本次依赖和内存开销。

参考：[SCUT 官方发布与使用说明](https://github.com/HCIILAB/SCUT-FBP5500-Database-Release)、[Ridge 官方数学接口](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html)。数据作者公开条件为非商业研究；用户确认授权不被本 PR 改写为公开通用商业许可证。

## 关键路径与内存

`ridge_path` 在全新 Python 进程中，使用 FastAPI TestClient 发送真实 multipart 照片上传，执行真实 QC、测量、Ridge 和 fake 文本分析，获取报告并校验完整保存的 Passport。免费 HTTP 视图会裁剪付费数组，不能直接用完整 Passport schema 校验；第一次验收因此失败，修正验收工具后只重测一次。

成功运行：Windows 10 / Python 3.14.7 / MediaPipe 1.2.0 / NumPy 2.5.4。
人脸检测 **1 次**、Ridge **1 次**，Passport 合法；峰值 RSS **273.36 MiB**，约 **4.334 s**。峰值由 10 ms RSS 采样及 Windows peak working set 高水位共同计算，包括应用初始化及完整请求。指标存于忽略目录 `runs/ridge-path-20261030-verified/runtime.json`。成功后通过删除 API 清除该次照片、几何及报告；统计日志不含分数、关键点或照片。

`cv.py` 的 landmarker 与 segmenter 现在各自按需加载。单独 geometry 导出不加载 segmenter；完整报告仍需分割来做肤色、遮挡和测量，因此成功路径中 segmenter 已加载，不能把它说成“完整报告不需要分割”。

这些是本机、单张照片、单进程、fake 分析、进程内 HTTP 的测量，**不是 Render Linux 或真实模型 API 的内存验收，也不含浏览器渲染/付费预览/并发**。约 400 MiB 为初步目标，不是所有输入的上界。

## 执行命令

先安装核心 pipeline/API/dev；内存工具另外需要 `pip install psutil`。不需要完整的 aesthetics Torch 实验依赖。

```bash
python -m experiments.aesthetics.export_scut_ridge17
python -m experiments.aesthetics ridge-predict photo.jpg --artifact models/aesthetics/geometry-ridge/scut-fbp5500-ridge-17.json
python -m experiments.aesthetics.ridge_path --photo photo.jpg --artifact models/aesthetics/geometry-ridge/scut-fbp5500-ridge-17.json --out runs/ridge-check-NEW
```

导出默认严格比对历史样本数/alpha/指标，不通过不写系数。只有显式 `--allow-metric-drift` 才会保存标记为 drift 的研究结果；不能将 drift 说成复现通过。推理拒绝缺失系数、错误特征顺序、非有限数值及无效尺度；质量不足没有假分。

## 下一步生产替换

本次 Ridge 在独立研究验收包装内使用同一个 `PhotoCheck.face`，不修改生产 `aesthetic_score`，不将 SCUT 1–5 冒充原有 0–100 几何分。研究报告将完整 Passport 与独立 Ridge 结果组合在内存中。

后续 #34 切换需要单独的 learned score 契约、版本和决定记录：与 D36 几何解释分开，保留质量限制、模型/特征/权重哈希和原生尺度，缺失模型明确 unavailable。依照仓库契约同步 schema/prompt 版本、样例和类型后，才将报告主分接入 Ridge。此处不改共享 schema/pipeline/web，也不自动部署。

严格十分制须先定义可验证的单调校准；百分位须来自同版本 Ridge 处理的合法参考集，明确自选择样本范围。不能沿用旧几何分的竞品 CDF，也不能宣称总体人口位置。现有报告主分仍为 D36，真正的生产评分替换尚未完成。
