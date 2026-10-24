"use client";

import { IllustratedAvatar } from "@/components/cards";
import { Stage } from "@/components/ds";
import { avatarProps } from "@/lib/adapters";
import { guidance } from "@/lib/copy/zh";
import { usePassport } from "@/lib/state/passport-store";
import { cn } from "@/lib/utils";

/** The user's front photo on the dark stage; after the 24 h TTL an illustrated avatar drawn from parameters. */
export function Portrait({ className, children }: { className?: string; children?: React.ReactNode }) {
  const { data, passport } = usePassport();
  const src = data?.media.expired ? null : data?.media.front ?? null;
  return (
    <Stage className={cn("relative overflow-hidden rounded-[14px]", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="你的正脸照片" className="block aspect-[4/5] w-full object-cover" />
      ) : passport ? (
        <div className="aspect-[4/5] w-full bg-[var(--ap-stage)] p-6">
          <IllustratedAvatar {...avatarProps(passport)} label="插画头像（照片已删除）" />
        </div>
      ) : (
        <div className="aspect-[4/5] w-full animate-pulse bg-[var(--ap-stage)]" />
      )}
      {children}
      {data?.media.expired && <p className="absolute inset-x-0 bottom-0 bg-black/45 px-3 py-2 text-[12px] text-white/90">{guidance.photoExpired}</p>}
    </Stage>
  );
}
