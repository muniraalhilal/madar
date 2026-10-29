/// <reference lib="webworker" />
/**
 * The demo's simulation worker: the same TrafficSimulation the server worker
 * runs, executed off the main thread in the visitor's browser.
 */
import type { ScenarioParams } from '@madar/sim-engine';
import { runSimulation, type Control } from './simulate';

type In = { type: 'start'; runId: string; params: ScenarioParams; pace: number } | { type: 'control'; action: 'pause' | 'resume' | 'cancel' };

const post = (m: unknown, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);
let control: Control = 'run';

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.type === 'control') {
    control = m.action === 'pause' ? 'pause' : m.action === 'resume' ? 'run' : 'cancel';
    return;
  }
  void runSimulation(m.runId, m.params, m.pace, post, () => control).catch((err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
};
