import { describe, expect, it } from 'vitest';
import { hairTargetId } from './compose';
import { portraitSource } from './portrait-source';

const media = { front: '/front.jpg', photos: { glasses: '/glasses.jpg', noglasses: '/noglasses.jpg' }, expired: false };
describe('Studio portrait sources', () => {
  it('uses opted-in daily glasses for hair but a glasses-free base for new frames', () => {
    expect(portraitSource(media, 'glasses', false, false)).toMatchObject({ role: 'glasses', url: '/glasses.jpg', framesAllowed: false });
    expect(portraitSource(media, 'glasses', true, false)).toMatchObject({ role: 'front', url: '/front.jpg', framesAllowed: true });
  });
  it('uses the legacy noglasses image for frames and never overlays existing frames', () => {
    expect(portraitSource(media, 'glasses', true, true)).toMatchObject({ role: 'noglasses', url: '/noglasses.jpg', framesAllowed: true });
    expect(portraitSource({ ...media, photos: {} }, 'front', true, true).framesAllowed).toBe(false);
  });
  it('explains missing daily portraits and clears sources after expiry', () => {
    expect(portraitSource({ ...media, photos: {} }, 'glasses', false, false)).toMatchObject({ role: 'front', url: '/front.jpg' });
    expect(portraitSource({ ...media, photos: {} }, 'glasses', false, false).notice).toBeTruthy();
    expect(portraitSource({ ...media, expired: true }, 'glasses', false, false).url).toBeNull();
  });
});

it('keeps old hair targets compatible and separates new source-specific crops', () => {
  expect(hairTargetId('bold', null)).toBe('bold');
  expect(hairTargetId('bold', null, 'glasses')).toBe('bold_srcglasses');
  expect(hairTargetId('bold', null, 'noglasses')).toBe('bold_srcnoglasses');
  expect(hairTargetId(null, null, 'glasses')).toBeNull();
});
