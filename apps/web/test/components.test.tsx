import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { congestionColor } from '@/components/landing/CityMap';
import { Connected } from '@/components/landing/Connected';
import { fmt, StatusBadge } from '@/components/app/ui';
import { api, ApiError } from '@/lib/api';

afterEach(cleanup);

describe('congestion colour ramp', () => {
  it('runs from mint (free) to warm (congested) and clamps', () => {
    expect(congestionColor(0)).toBe('rgba(124,217,199,1)');
    expect(congestionColor(1)).toBe('rgba(255,120,120,1)');
    expect(congestionColor(5)).toBe(congestionColor(1));
  });
});

describe('formatters', () => {
  it('formats durations, percentages and clock times', () => {
    expect(fmt.s(45)).toBe('45 s');
    expect(fmt.s(300)).toBe('5.0 min');
    expect(fmt.pct(-16.94)).toBe('-16.9 %');
    expect(fmt.pct(3)).toBe('+3.0 %');
    expect(fmt.clock(7, 3599)).toBe('07:59');
    expect(fmt.s(null)).toBe('—');
  });
});

describe('StatusBadge', () => {
  it('labels every run state in text, not colour alone', () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText('Failed')).toBeTruthy();
  });
});

describe('Connected section', () => {
  it('switches layers with accessible tabs', () => {
    render(<Connected />);
    const harmony = screen.getByRole('tab', { name: /harmony/i });
    expect(harmony.getAttribute('aria-selected')).toBe('false');
    fireEvent.click(harmony);
    expect(harmony.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/Five districts/)).toBeTruthy();
  });
});

describe('api client', () => {
  it('sends the CSRF header and surfaces validation issues', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Validation failed', issues: [{ path: 'email', message: 'Invalid email' }] }), { status: 400, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/auth/login', { method: 'POST', json: {} })).rejects.toMatchObject({ status: 400, issues: [{ path: 'email', message: 'Invalid email' }] });
    const headers = fetchMock.mock.calls[0]![1].headers as Headers;
    expect(headers.get('X-Requested-With')).toBe('madar');
    expect(new ApiError(500, 'x')).toBeInstanceOf(Error);
    vi.unstubAllGlobals();
  });
});
