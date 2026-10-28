# Simulation model

The engine lives in `packages/sim-engine` and has no I/O. Everything below is implemented there and covered by tests in `packages/sim-engine/test`.

## The city

`generateCity()` builds Madar deterministically from a seed: a 7 × 6 arterial grid with jitter, removed segments (superblocks), two diagonals, a curved corniche, six regional gateways, five districts, 28 signalised junctions, 96 buildings and eight demand zones. It is entirely fictional and uses a local planar coordinate system in metres.

## Road network

A **directed graph**. Each link has length, lanes, speed limit, saturation flow (veh/h/lane), class and optional curved geometry. Validation rejects unknown endpoints, self-loops, duplicate ids, non-positive values and links shorter than the straight line between their ends (the last guarantees the A* heuristic is admissible).

Indices are dense integers internally; adjacency lists are sorted by id so iteration order is fixed.

## Path finding

`RoadGraph.aStar()` with a binary heap whose ties break deterministically. The heuristic is `euclidean distance / fastest speed in the network`, admissible because every cost function used is ≥ free-flow time. `dijkstra()` is the same search with a zero heuristic; tests check both return identical costs on 200 random OD pairs and that A* expands fewer nodes.

## Traffic model (mesoscopic link–queue)

Time advances in fixed 1-second steps:

1. **Schedule** — closures and incidents start or end. An incident removes a fraction of capacity and lowers speed; severity 1 closes the link.
2. **Demand** — trips arrive by a Poisson process. The total rate is `base demand × multiplier × hourly profile(t)`; the origin–destination pair is drawn from a **doubly-weighted gravity model** `T_ij ∝ P_i · A_j · exp(−d_ij / 3500 m)`. Each vehicle gets a route by A* on *current* link costs.
3. **Movement** — vehicles on a link travel at a density-dependent speed (Greenshields: `v = v_f · (1 − k/k_jam)`, floored at 8 %) until they reach the back of the queue.
4. **Discharge** — each node serves its incoming queues: at a signal only during effective green (green − 2 s start-up lost time + yellow) at the saturation flow; at a priority junction at 55 % of saturation (gap-acceptance proxy); gateways are unlimited sinks. Capacity during red cannot be banked. A vehicle only moves on if the next link has storage space (`lanes × length / 7.5 m`) — otherwise the queue is blocked: **spillback**.
5. **Re-routing** — before leaving a junction, a vehicle whose remaining route contains a closed link re-plans (forced). If it contains a severe incident it re-plans once per junction and switches only if the new route is ≥ 15 % faster.
6. **Departures** — vehicles waiting at an origin enter when the first link has space (entries per step ≤ lanes).

**Link cost** for routing = running time at current speed + queue length ÷ effective discharge rate, never below free-flow time.

### Metrics

Direct outputs: trips generated/completed/stranded, vehicles still in the network, travel time (mean, p95), waiting time (queued or < 1 m/s), delay vs. the free-flow time of the path actually driven, stops, throughput, vehicle-km, max queue, mean network speed, re-routes; per link: entered/exited, mean travel time and speed, mean/max queue, utilisation (exits ÷ stop-line capacity) and congestion (`1 − t_free / t_actual`); per junction: throughput, mean delay, max queue; a sample every `sampleInterval` seconds; an event log.

Estimates (labelled as such): fuel, EV electricity, CO₂ and idling from vehicle-km and idle time with fixed fleet assumptions (85 % combustion at 8 L/100 km, 0.7 L/h idling, 2.31 kg CO₂/L; EVs at 0.18 kWh/km).

Invariants tested: conservation (generated = completed + stranded + remaining), link occupancy never exceeds storage, discharge never exceeds saturation flow, travel time ≥ free-flow time, closed links admit no vehicles.

## Signals and Webster optimisation

Fixed-time plans with phases (approaches served, green, yellow, all-red) and an offset. `websterTiming()` implements Webster (1958): `C₀ = (1.5 L + 5) / (1 − Y)`, `g_i = (y_i / Y)(C₀ − L)`, using arrival flows observed in a completed run, clamped to 40–150 s cycles and ≥ 7 s greens, with `C_max` when `Y ≥ 0.9`. Tests check proportionality, the oversaturated case and that Webster timings reduce delay on the city.

## Determinism

- All randomness comes from `Rng` (sfc32 seeded through splitmix32); `Math.random` is never used. Sub-systems draw from forked streams.
- Loops iterate in index order; junction service rotates its starting approach by a counter, not randomly.
- The DB loader sorts everything by code in JavaScript (byte order) so results never depend on database collation.
- `inputFingerprint` hashes engine version, city id/version and the full parameter set; `fingerprint` hashes summary, samples and link results (64-bit FNV-1a over a key-sorted serialisation with floats normalised to 12 significant digits).

Tests assert identical fingerprints for identical inputs, different fingerprints for different seeds, and independence from the chunk size used to advance the clock. The API test suite re-runs a scenario and checks the stored result fingerprints match.

## Building energy model

Hourly, one synthetic hot day: `E(h) = A · EUI/8760 · shape(h) · [(1 − c) + c · cooling(h)]`, with use-specific EUIs, normalised daily shapes, a cooling share and a degree-hour cooling index against the setpoint. Levers: setpoint change, lighting savings, occupancy. All coefficients are documented illustrative assumptions (`ENERGY_ASSUMPTIONS`) and outputs are presented as estimates.

## Simplifications

No lane changing or turning movements inside junctions, all approaches in a phase are served together, one vehicle class, no pedestrians/transit, uniform driver behaviour, demand from a static gravity model, no calibration against observed counts. These keep the model explainable and fast (an hour of peak traffic with ~23,000 trips simulates in about two seconds).
