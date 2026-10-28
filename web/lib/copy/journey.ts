/** Recovery copy shared by the S3 journey; no simulated progress or completion promises. */
export const journey = {
  replaceFront: "请更换正脸照片",
  restartAnalysis: "重新开始分析",
  failedAnalysis: "这次分析已中断。重新选择照片后，可以创建一次新的分析。",
  generating: "正在生成这个发型，可以先调颜色",
  loadingResult: "正在载入生成结果",
  brokenResult: "生成结果载入失败，照片上仍是原来的发型。",
  reloadResult: "重新载入结果",
  reupload: "重新上传照片",
  savedSettings: "已保存造型选项；尚未生成的发型仍需生成后查看效果。",
  sampleReadOnly: "这是公开样例，只能浏览。上传自己的照片后可以试造型和保存方案。",
} as const;
