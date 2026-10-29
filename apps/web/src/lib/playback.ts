'use client';
import { decodeFrames, type Frame } from '@madar/sim-engine';
import { useEffect, useState } from 'react';
import { demoPlayback } from '@/demo/backend';
import { DEMO } from '@/demo/mode';

/** Downloads a run's binary playback (gzip-encoded on the wire) and decodes it. */
export function usePlayback(runId: string | null) {
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setFrames(null);
    setError(null);
    if (!runId) return;
    let cancelled = false;
    if (DEMO) {
      demoPlayback(runId)
        .then((f) => !cancelled && setFrames(f))
        .catch((e: Error) => !cancelled && setError(e.message));
      return () => {
        cancelled = true;
      };
    }
    fetch(`/api/runs/${runId}/playback`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'No playback recorded for this run' : `Playback failed (${r.status})`);
        const buf = new Uint8Array(await r.arrayBuffer());
        if (!cancelled) setFrames(decodeFrames(buf).frames);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [runId]);
  return { frames, error };
}
