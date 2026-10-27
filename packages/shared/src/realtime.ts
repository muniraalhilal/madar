/**
 * WebSocket contract (Socket.IO). Two traffic classes:
 *   - high-frequency, lossy: `run:frame` (binary vehicle positions, volatile emit)
 *   - low-frequency, reliable: progress, samples, events, status, notifications
 * Clients join `run:<id>` rooms only after the server checks project membership.
 */
export const WS_NAMESPACE = '/live';

export const WsEvents = {
  subscribeRun: 'run:subscribe',
  unsubscribeRun: 'run:unsubscribe',
  progress: 'run:progress',
  frame: 'run:frame',
  sample: 'run:sample',
  simEvent: 'run:event',
  status: 'run:status',
  notification: 'notification',
} as const;

/** Redis pub/sub channel the worker publishes on; the API relays to sockets. */
export const runChannel = (runId: string) => `madar:run:${runId}`;
export const RUN_CONTROL_KEY = (runId: string) => `madar:run:${runId}:control`;
export const SIMULATION_QUEUE = 'simulation';

export type RunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface RunProgressMessage {
  runId: string;
  t: number;
  duration: number;
  fraction: number;
  vehiclesInNetwork: number;
  completedTrips: number;
}

export interface RunStatusMessage {
  runId: string;
  status: RunStatus;
  error?: string;
}

/** Binary frame payload: header [t (f32), count (u32)] then count × (u32 id, u32 link, u32 posDm, u32 flags). */
export interface RunFrameMessage {
  runId: string;
  t: number;
  count: number;
  /** Base64 when relayed through Redis; ArrayBuffer on the socket. */
  data: ArrayBuffer | string;
  /** Per-link congestion ×1000 (Uint16) for heat overlays. */
  congestion?: ArrayBuffer | string;
}

export type WorkerMessage =
  | { type: 'progress'; payload: RunProgressMessage }
  | { type: 'status'; payload: RunStatusMessage }
  | { type: 'frame'; payload: RunFrameMessage }
  | { type: 'sample'; payload: { runId: string; sample: Record<string, number | null> } }
  | { type: 'event'; payload: { runId: string; t: number; eventType: string; message: string; roadCode?: string } };
