import type { PassportResponse } from '@/lib/api';

export type PortraitRole = 'front' | 'noglasses' | 'glasses';
export type PortraitChoice = 'front' | 'glasses';

/** Resolve pixels before geometry or hair targets. A daily portrait can never be a new-frame overlay base. */
export function portraitSource(media: Pick<PassportResponse['media'], 'front' | 'photos' | 'expired'>,
  choice: PortraitChoice, tryingFrames: boolean, frontEyewear: boolean) {
  let role: PortraitRole = choice === 'glasses' && !tryingFrames ? 'glasses' : 'front';
  let notice: string | null = null;
  if (tryingFrames) {
    if (frontEyewear && media.photos?.noglasses) role = 'noglasses';
    if (choice === 'glasses') notice = '试戴新镜框已切换到无眼镜来源，避免与日常镜框重叠。';
  }
  let url = role === 'front' ? media.front : media.photos?.[role] ?? null;
  if (!url && role === 'glasses') {
    role = 'front'; url = media.front;
    notice = '日常眼镜参考照未上传、已失效或不可用，当前使用分析正脸照。';
  }
  const framesAllowed = role === 'noglasses' || (role === 'front' && !frontEyewear);
  if (tryingFrames && !framesAllowed) notice = '没有可用的无眼镜照片，已暂停新镜框叠加，避免镜框重叠。';
  return { role, url: media.expired ? null : url, framesAllowed, notice };
}
