/** Owner-authorized synthetic display results, supplied 2026-10-29.
 * These are appearance examples, not the old published passport's recommendations.
 * Never attach registered measurement geometry to these edited images. */
export const styleCases = [
  { id: "001", label: "人物 001", options: [
    { tier: "safe", label: "稳妥", name: "偏分蓬松中长发" },
    { tier: "easy", label: "省心", name: "耳下短直发" },
  ] },
  { id: "004", label: "人物 004", options: [
    { tier: "safe", label: "稳妥", name: "柔和偏分内扣长发" },
    { tier: "easy", label: "省心", name: "低层次直发中长发" },
    { tier: "bold", label: "突破", name: "锁骨法式波浪" },
  ] },
  { id: "005", label: "人物 005", options: [
    { tier: "easy", label: "省心", name: "短寸渐变" },
    { tier: "bold", label: "突破", name: "短卷纹理烫" },
  ] },
  { id: "006", label: "人物 006", options: [
    { tier: "safe", label: "稳妥", name: "齐肩内扣偏分" },
    { tier: "easy", label: "省心", name: "短层次自然直" },
    { tier: "bold", label: "突破", name: "锁骨法式波浪" },
  ] },
] as const;

export const frameExamples = [
  { id: "round-metal", name: "圆形金属框", detail: "细边与圆弧轮廓" },
  { id: "square-acetate", name: "方形板材框", detail: "清楚的边界与转角" },
  { id: "cat-eye", name: "猫眼框", detail: "外侧上扬的轮廓" },
] as const;
