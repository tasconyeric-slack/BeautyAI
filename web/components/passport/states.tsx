"use client";

import { AlertTriangle } from "lucide-react";
import * as React from "react";
import type { ApiError } from "@/lib/api";

/** Page-level loading, so a slow first response never reads as an empty or broken page. Pure presentation. */
export function LoadingState({ label = "正在读取你的档案…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-testid="passport-loading" className="mx-auto max-w-[1080px] px-6 pt-12">
      <p className="text-[13px] text-muted">{label}</p>
      <div aria-hidden className="mt-5 grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
        <div className="skeleton aspect-[4/5] rounded-[4px]" />
        <div className="space-y-3">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-8 w-4/5 rounded" />
          <div className="skeleton h-8 w-3/5 rounded" />
          <div className="skeleton mt-6 h-24 rounded-[4px]" />
          <div className="skeleton h-24 rounded-[4px]" />
        </div>
      </div>
    </div>
  );
}

/** What went wrong, in words a visitor can act on. The raw error text is never shown (it can carry URLs and ids). */
export function errorCopy(error: Pick<ApiError, "status" | "offline"> | null): { title: string; body: string } {
  if (error?.offline) return { title: "网络不稳定", body: "没能连上服务。你的档案没有丢，网络恢复后重试即可。" };
  if (error && error.status >= 500) return { title: "服务暂时没有响应", body: "这是服务端的问题，不是你的照片的问题。稍等片刻再试一次。" };
  if (error?.status === 404) return { title: "服务器暂时找不到这份报告", body: "这不一定是链接过期或你主动删除了报告。服务重启后可能丢失未持久化的记录；请重试一次，若仍无法打开，请保留原链接以便排查。" };
  return { title: "这份档案暂时打不开", body: "可以重试一次；如果一直这样，回到首页重新开始。" };
}

export function ErrorState({ error, onRetry }: { error: Pick<ApiError, "status" | "offline"> | null; onRetry: () => void | Promise<void> }) {
  const { title, body } = errorCopy(error);
  const [retrying, setRetrying] = React.useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  return (
    <div role="alert" data-testid="passport-error" className="mx-auto max-w-lg px-6 py-20 text-center">
      <AlertTriangle className="mx-auto size-6 text-amber" aria-hidden />
      <p className="mt-3 font-serif text-[20px]">{title}</p>
      <p className="mt-2 text-[13px] leading-6 text-muted">{body}</p>
      <div className="mt-6 flex items-center justify-center gap-5 text-[14px]">
        <button type="button" onClick={retry} disabled={retrying}
          className="inline-flex min-h-11 items-center rounded-full bg-accent px-6 py-2 font-medium text-[var(--ap-on-primary)] disabled:opacity-60">
          {retrying ? "正在重试…" : "重试一次"}
        </button>
        <a href="/" className="text-accent underline-offset-4 hover:underline">回到首页</a>
      </div>
    </div>
  );
}
