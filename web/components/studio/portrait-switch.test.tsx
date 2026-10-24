import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import sample from '@/lib/fixtures/sample_passport.json';
import geometry from '@/lib/fixtures/sample_geometry.json';
import { httpBackend, type Passport, type PassportResponse } from '@/lib/api';
import { usePassport } from '@/lib/state/passport-store';
import type { FaceGeometry } from '@/lib/tint';
import { NO_MAKEUP } from '@/lib/tint/makeup';
import { useStudioCanvas } from './use-studio-canvas';
import { LookStudio } from './look-studio';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => '/p/ap_source_test/studio', useRouter: () => ({ back: vi.fn() }) }));
vi.mock('@/lib/state/passport-store', () => ({ usePassport: vi.fn() }));
vi.mock('./use-studio-canvas', () => ({ useStudioCanvas: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it('can switch from an unfit legacy front to its independently measured glasses-free base', async () => {
  const passport = structuredClone(sample) as unknown as Passport;
  const data = { media: { front: '/front.jpg', photos: { noglasses: '/noglasses.jpg' }, expired: false, expires_at: null },
    partial: { previews: [] }, entitlement: { paid: false } } as unknown as PassportResponse;
  vi.mocked(usePassport).mockReturnValue({ id: 'ap_source_test', passport, data, sendFeedback: vi.fn(), requestPreviews: vi.fn() } as unknown as ReturnType<typeof usePassport>);
  vi.spyOn(httpBackend, 'geometry').mockImplementation(async (_, role) => role === 'noglasses' ? geometry as unknown as FaceGeometry : null);
  vi.mocked(useStudioCanvas).mockImplementation(opts => ({
    canvas: { current: null }, status: 'ready', hairState: 'none', maskState: 'error', approximate: false,
    makeup: NO_MAKEUP, eyewearReason: opts.geometry ? null : '无法定位', eyewearControlsReason: opts.geometry ? null : '无法定位',
  }));
  render(<LookStudio />);
  const round = screen.getByRole('radio', { name: '圆框' }) as HTMLButtonElement;
  expect(round.disabled).toBe(false);
  fireEvent.click(round);
  await waitFor(() => expect(httpBackend.geometry).toHaveBeenCalledWith('ap_source_test', 'noglasses'));
  await waitFor(() => expect(vi.mocked(useStudioCanvas).mock.lastCall?.[0]).toMatchObject({ front: '/noglasses.jpg', source: 'noglasses', geometry }));
  // The first render after source switching cannot inherit the old source's geometry.
  const switched = vi.mocked(useStudioCanvas).mock.calls.map(([opts]) => opts).filter(opts => opts.source === 'noglasses');
  expect(switched[0].geometry).toBeUndefined();
});
