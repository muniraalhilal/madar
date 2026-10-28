'use client';
import { WsEvents } from '@madar/shared';
import type { Frame } from '@madar/sim-engine';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/components/app/session';
import { api, type Run, type RunStatus } from './api';

export interface LiveState {
  status: RunStatus | null;
  t: number;
  fraction: number;
  vehicles: number;
  completed: number;
  error?: string;
  samples: { t: number; vehiclesInNetwork: number; queuedVehicles: number; windowMeanTravelTime: number | null; meanSpeed: number }[];
  events: { t: number; message: string; eventType: string }[];
  frame: Frame | null;
  congestion: Uint16Array | null;
}

/**
 * Follows a run in real time over the authenticated socket (progress, samples,
 * events, frames). Polls the REST API as a fallback when the socket is down,
 * so the page stays correct across reconnects.
 */
export function useRunLive(runId: string | null, initial?: RunStatus | null) {
  const { socket } = useSession();
  const [s, setS] = useState<LiveState>({ status: initial ?? null, t: 0, fraction: 0, vehicles: 0, completed: 0, samples: [], events: [], frame: null, congestion: null });
  const statusRef = useRef<RunStatus | null>(initial ?? null);

  useEffect(() => {
    setS({ status: initial ?? null, t: 0, fraction: 0, vehicles: 0, completed: 0, samples: [], events: [], frame: null, congestion: null });
    statusRef.current = initial ?? null;
  }, [runId, initial]);

  useEffect(() => {
    if (!runId || !socket) return;
    const sub = () => socket.emit(WsEvents.subscribeRun, { runId });
    sub();
    socket.on('connect', sub);
    const onProgress = (p: { runId: string; t: number; fraction: number; vehiclesInNetwork: number; completedTrips: number }) =>
      p.runId === runId && setS((x) => ({ ...x, t: p.t, fraction: p.fraction, vehicles: p.vehiclesInNetwork, completed: p.completedTrips, status: x.status === 'queued' || !x.status ? 'running' : x.status }));
    const onStatus = (m: { runId: string; status: RunStatus; error?: string }) => {
      if (m.runId !== runId) return;
      statusRef.current = m.status;
      setS((x) => ({ ...x, status: m.status, error: m.error, fraction: m.status === 'completed' ? 1 : x.fraction }));
    };
    const onSample = (m: { runId: string; sample: LiveState['samples'][number] }) => m.runId === runId && setS((x) => ({ ...x, samples: [...x.samples, m.sample] }));
    const onEvent = (m: { runId: string; t: number; message: string; eventType: string }) => m.runId === runId && setS((x) => ({ ...x, events: [...x.events.slice(-60), m] }));
    const onFrame = (m: { runId: string; t: number; count: number; data: ArrayBuffer; congestion?: ArrayBuffer }) => {
      if (m.runId !== runId) return;
      setS((x) => ({ ...x, frame: { t: m.t, count: m.count, data: new Uint32Array(m.data) }, congestion: m.congestion ? new Uint16Array(m.congestion) : x.congestion }));
    };
    socket.on(WsEvents.progress, onProgress);
    socket.on(WsEvents.status, onStatus);
    socket.on(WsEvents.sample, onSample);
    socket.on(WsEvents.simEvent, onEvent);
    socket.on(WsEvents.frame, onFrame);
    return () => {
      socket.emit(WsEvents.unsubscribeRun, { runId });
      socket.off('connect', sub);
      socket.off(WsEvents.progress, onProgress);
      socket.off(WsEvents.status, onStatus);
      socket.off(WsEvents.sample, onSample);
      socket.off(WsEvents.simEvent, onEvent);
      socket.off(WsEvents.frame, onFrame);
    };
  }, [runId, socket]);

  // REST fallback / reconciliation every 3 s while not finished
  useEffect(() => {
    if (!runId) return;
    const id = setInterval(async () => {
      if (statusRef.current && ['completed', 'failed', 'cancelled'].includes(statusRef.current)) return;
      try {
        const r = await api<Run>(`/runs/${runId}`);
        statusRef.current = r.status;
        setS((x) => ({ ...x, status: r.status, fraction: Math.max(x.fraction, r.progress), t: Math.max(x.t, r.simTimeS), error: r.errorMessage ?? undefined }));
      } catch {
        /* transient */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [runId]);
  return s;
}
