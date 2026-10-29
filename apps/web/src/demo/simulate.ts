/**
 * One simulation run, exactly as the server worker executes it: chunked
 * advance, pause/resume/cancel between chunks, optional pacing for live
 * viewing, throttled live frames, then the complete result and the encoded
 * playback. Runs inside the demo's Web Worker (engine.worker.ts).
 */
import { TrafficSimulation, encodeFrames, generateCity, type Frame, type ScenarioParams } from '@madar/sim-engine';

const CHUNK_S = 20;
const FAST_CHUNK_S = 120;
const FRAME_MIN_INTERVAL_MS = 160;

export type Control = 'run' | 'pause' | 'cancel';
export type Post = (message: unknown, transfer?: Transferable[]) => void;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runSimulation(runId: string, params: ScenarioParams, pace: number, post: Post, control: () => Control): Promise<void> {
  const started = performance.now();
  const city = generateCity();
  const sim = new TrafficSimulation(city, params);
  const frames: Frame[] = [];
  let latest: Frame | null = null;
  let lastFrameSent = 0;
  sim.setHooks({
    onFrame: (f) => {
      frames.push(f);
      latest = f;
    },
    onSample: (sample) => post({ type: 'sample', sample: { ...sample } }),
    onEvent: (ev) => {
      if (ev.type !== 'spillback') post({ type: 'event', t: ev.t, eventType: ev.type, message: ev.message, ...(ev.linkId ? { roadCode: ev.linkId } : {}) });
    },
  });
  post({ type: 'status', status: 'running', runId });

  while (!sim.done) {
    if (control() === 'cancel') return post({ type: 'cancelled' });
    if (control() === 'pause') {
      post({ type: 'status', status: 'paused' });
      while (control() === 'pause') await sleep(150);
      if (control() === 'cancel') return post({ type: 'cancelled' });
      post({ type: 'status', status: 'running' });
    }
    const chunkStart = performance.now();
    const step = pace > 0 ? Math.max(1, Math.min(CHUNK_S, Math.round(pace / 5))) : FAST_CHUNK_S;
    sim.advance(Math.min(params.duration, sim.t + step));
    post({ type: 'progress', ...sim.progress() });

    const now = performance.now();
    const f = latest as Frame | null;
    if (f && now - lastFrameSent >= FRAME_MIN_INTERVAL_MS) {
      lastFrameSent = now;
      const data = f.data.slice();
      const congestion = sim.linkState().slice();
      post({ type: 'frame', t: f.t, count: f.count, data: data.buffer, congestion: congestion.buffer }, [data.buffer, congestion.buffer]);
    }
    if (pace > 0) {
      const target = (step / pace) * 1000;
      const elapsed = performance.now() - chunkStart;
      if (target > elapsed) await sleep(target - elapsed);
    } else {
      await sleep(0); // let control messages in
    }
  }

  const result = sim.result();
  const playback = frames.length ? encodeFrames(frames, city.links.length) : null;
  post(
    {
      type: 'done',
      result: {
        summary: result.summary,
        samples: result.samples,
        links: result.links,
        intersections: result.intersections,
        events: result.events.slice(0, 2000),
        fingerprint: result.fingerprint,
        inputFingerprint: result.inputFingerprint,
      },
      playback,
      frameCount: frames.length,
      wallTimeMs: Math.round(performance.now() - started),
    },
    playback ? [playback.buffer] : [],
  );
}
