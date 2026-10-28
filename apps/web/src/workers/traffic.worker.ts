/// <reference lib="webworker" />
// Runs the real MADAR engine in the browser for the landing page. Same code,
// same city, same seed semantics as the server-side worker.
import { TrafficSimulation, generateCity } from '@madar/sim-engine';

const city = generateCity();
let sim: TrafficSimulation | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let seed = 42;

function fresh() {
  sim = new TrafficSimulation(city, { seed, duration: 3600, frameInterval: 1, maxFrameVehicles: 3000, sampleInterval: 60, startHour: 7 });
  // Warm up 12 simulated minutes so the network is already busy when shown.
  sim.advance(720);
  sim.setHooks({
    onFrame: (f) => {
      const progress = sim!.progress();
      const data = f.data;
      (self as DedicatedWorkerGlobalScope).postMessage(
        { type: 'frame', t: f.t, count: f.count, data, vehicles: progress.vehiclesInNetwork, completed: progress.completedTrips, seed },
        [data.buffer],
      );
    },
  });
}

self.onmessage = (e: MessageEvent<{ type: 'start' | 'stop'; speed?: number }>) => {
  if (e.data.type === 'start') {
    if (!sim) fresh();
    if (timer) clearInterval(timer);
    const step = e.data.speed ?? 1;
    timer = setInterval(() => {
      if (!sim) return;
      if (sim.done) {
        seed++;
        fresh();
      }
      sim.advance(sim.t + step);
    }, 50);
  } else if (timer) {
    clearInterval(timer);
    timer = null;
  }
};
