import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { getQcMessage, zh } from "./zh";

function repositoryRoot(): string {
  let directory = resolve(process.cwd());
  while (!existsSync(join(directory, "config/qc.yaml"))) {
    const parent = dirname(directory);
    assert.notEqual(parent, directory, "Run from inside the repository");
    directory = parent;
  }
  return directory;
}

function strings(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => strings(child, path ? `${path}.${key}` : key));
}

const root = repositoryRoot();

test("every configured QC reason and emitted issue has actionable Chinese copy", () => {
  const yaml = readFileSync(join(root, "config/qc.yaml"), "utf8").replace(/\r\n/g, "\n");
  const messages = yaml.split("retake_messages_zh:\n")[1].split(/^\S/m)[0];
  const configured = [...messages.matchAll(/^  ([a-z_]+):/gm)].map((match) => match[1]);
  const source = readFileSync(join(root, "src/aesthetic_passport/qc.py"), "utf8");
  const emitted = [...source.matchAll(/issues\.append\("([a-z_]+)"\)/g)].map((match) => match[1]);
  for (const code of new Set([...configured, ...emitted, "beauty_filter_suspect"])) {
    const message = zh.qc.reasons[code as keyof typeof zh.qc.reasons];
    assert.ok(message, `Missing QC reason: ${code}`);
    assert.match(message.reason, /[\p{Script=Han}]/u);
    assert.match(message.action, /[\p{Script=Han}]/u);
    assert.notEqual(message.reason, message.action);
  }
  assert.match(zh.qc.reasons.beauty_filter_suspect.action, /继续/);
  assert.ok(zh.qc.unknown.reason && zh.qc.unknown.action);
});

test("privacy copy states the V2 retention, deletion and separate consent facts", () => {
  assert.equal(zh.consent.processingConfirmation, "同意处理我的人脸照片");
  assert.equal(zh.consent.ageConfirmation, "已满 14 周岁");
  assert.equal(zh.privacy.facts.length, 3);
  assert.match(zh.consent.purpose, /发型.*妆容.*穿搭/);
  assert.match(zh.consent.retention, /24 小时/);
  assert.match(zh.consent.retention, /日常眼镜参考照/);
  assert.match(zh.consent.retention, /其余照片.*结束后.*删除/);
  assert.match(zh.consent.deleteInstruction, /删除我的照片与报告/);
  assert.match(zh.privacy.unsavedPassport, /7 天/);
  assert.match(zh.privacy.noTraining, /不用于训练/);
  assert.match(zh.share.portraitConsent, /本次/);
  assert.match(zh.share.readOnlyLink, /不含照片/);
});

test("unknown and inherited QC keys receive the safe fallback", () => {
  assert.equal(getQcMessage("blurry"), zh.qc.reasons.blurry);
  assert.equal(getQcMessage("new_server_reason"), zh.qc.unknown);
  assert.equal(getQcMessage("__proto__"), zh.qc.unknown);
  assert.equal(getQcMessage("toString"), zh.qc.unknown);
});

test("five topics, four landing screens and four upload tips are ready for UI use", () => {
  assert.deepEqual(Object.keys(zh.topics).sort(), ["color", "face", "hair", "outfit", "style"]);
  for (const topic of Object.values(zh.topics)) {
    assert.ok(topic.title && topic.subtitle && topic.example);
  }
  assert.equal(zh.landing.screens.length, 4);
  assert.equal(zh.upload.tips.length, 4);
  assert.equal(zh.presentation.options.feminine.label, "女性化");
  assert.equal(zh.presentation.options.masculine.label, "男性化");
  assert.equal(zh.presentation.options.neutral.label, "中性");
  assert.ok(zh.reveal.failed && zh.guidance.photoExpired && zh.feedback.applied);
  assert.ok(zh.settings.deleteConfirm && zh.paywall.onUnlock);
  assert.match(zh.share.xiaohongshu.body, /\{风格\}.*\{色彩\}/s);
});

test("all shipped strings use Chinese without untranslated UI words", () => {
  for (const [path, value] of strings(zh)) {
    assert.ok(value.trim(), `${path} is empty`);
    assert.match(value, /[\p{Script=Han}]/u, `${path} has no Chinese`);
    assert.doesNotMatch(value.replace(/AI|PNG|PDF|Studio/g, ""), /[A-Za-z]/, `${path} contains untranslated text`);
  }
});

test("safety terms are blocked except required consent text; the score copy never says attractiveness or rank", () => {
  const rules = readFileSync(join(root, "config/rules.yaml"), "utf8").replace(/\r\n/g, "\n");
  const safetySection = rules.split("safety_terms:\n")[1].split(/^\S/m)[0];
  const configured = [...safetySection.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const terms = new Set([...configured, "完美", "标准脸", "遮肉", "显瘦", "变美", "逆袭"]);
  const exceptions: Record<string, string> = {
    "consent.ageConfirmation": "已满 14 周岁",
  };
  for (const [path, value] of strings(zh)) {
    if (Object.hasOwn(exceptions, path)) {
      assert.equal(value, exceptions[path]);
      continue;
    }
    for (const term of terms) {
      assert.ok(!value.toLowerCase().includes(term.toLowerCase()), `${path} contains forbidden term ${term}`);
    }
  }
  assert.equal(zh.aestheticScore.title, "AI 面部美学参考分");
  for (const [, value] of strings(zh.aestheticScore)) assert.doesNotMatch(value, /颜值|排名第|前\s*\d+%|全人类|人口/u);
  assert.match(zh.aestheticScore.notRank, /不代表全人群/);
});
