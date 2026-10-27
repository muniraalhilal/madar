/**
 * MADAR relational schema (PostgreSQL 16 + PostGIS 3).
 *
 * Spatial columns use SRID 0: the reference city lives in a local planar
 * coordinate system measured in metres. It is fictional and deliberately not
 * georeferenced to any real place.
 *
 * JSON columns are used only where structure is genuinely open-ended:
 *   - simulation_runs.params_snapshot — the immutable, exact engine input of a run
 *   - simulation_runs.energy_assumptions — documented model assumptions
 *   - audit_logs.metadata, reports.content
 * Everything that is queried, filtered or compared is a typed column.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* ───────────── custom types ───────────── */

const geometry = (kind: 'Point' | 'LineString' | 'Polygon') =>
  customType<{ data: string; driverData: string }>({
    dataType: () => `geometry(${kind},0)`,
    // Writes take WKT; reads return EWKB hex, so queries select ST_AsGeoJSON/ST_X/ST_Y explicitly.
    toDriver: (wkt: string) => sql`ST_GeomFromText(${wkt}, 0)` as unknown as string,
  });
export const pointGeom = geometry('Point');
export const lineGeom = geometry('LineString');
export const polygonGeom = geometry('Polygon');

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/* ───────────── enums ───────────── */

export const userRole = pgEnum('user_role', ['admin', 'planner', 'viewer']);
export const memberRole = pgEnum('member_role', ['owner', 'editor', 'viewer']);
export const nodeKind = pgEnum('node_kind', ['signal', 'priority', 'gateway']);
export const roadClass = pgEnum('road_class', ['ring', 'boulevard', 'arterial', 'collector', 'local', 'corniche']);
export const buildingUse = pgEnum('building_use', ['office', 'residential', 'retail', 'mixed', 'civic', 'hotel']);
export const scenarioKind = pgEnum('scenario_kind', ['baseline', 'variant']);
export const incidentKind = pgEnum('incident_kind', ['collision', 'breakdown', 'roadwork', 'event']);
export const runStatus = pgEnum('run_status', ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled']);
export const eventType = pgEnum('sim_event_type', [
  'closure_started',
  'closure_ended',
  'incident_started',
  'incident_cleared',
  'reroute',
  'trip_stranded',
  'spillback',
]);

/* ───────────── identity & access ───────────── */

export const roles = pgTable('roles', {
  id: userRole('id').primaryKey(),
  description: text('description').notNull(),
  permissions: text('permissions').array().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull().default('planner').references(() => roles.id),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
    check('users_email_format', sql`position('@' in ${t.email}) > 1`),
  ],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the refresh token; the token itself is never stored. */
    refreshTokenHash: text('refresh_token_hash').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBy: uuid('replaced_by'),
  },
  (t) => [uniqueIndex('user_sessions_token_uq').on(t.refreshTokenHash), index('user_sessions_user_idx').on(t.userId)],
);

/* ───────────── city model ───────────── */

export const cities = pgTable('cities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  baseDemandVehPerHour: integer('base_demand_veh_per_hour').notNull(),
  description: text('description').notNull().default(''),
  isSynthetic: boolean('is_synthetic').notNull().default(true),
  createdAt: createdAt(),
});

export const districts = pgTable(
  'districts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: text('city_id').notNull().references(() => cities.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameAr: text('name_ar').notNull(),
    character: text('character').notNull(),
    color: text('color').notNull(),
    boundary: polygonGeom('boundary').notNull(),
  },
  (t) => [uniqueIndex('districts_city_code_uq').on(t.cityId, t.code), index('districts_boundary_gix').using('gist', t.boundary)],
);

export const intersections = pgTable(
  'intersections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: text('city_id').notNull().references(() => cities.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: nodeKind('kind').notNull(),
    districtId: uuid('district_id').references(() => districts.id, { onDelete: 'set null' }),
    geom: pointGeom('geom').notNull(),
  },
  (t) => [uniqueIndex('intersections_city_code_uq').on(t.cityId, t.code), index('intersections_geom_gix').using('gist', t.geom)],
);

export const roads = pgTable(
  'roads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: text('city_id').notNull().references(() => cities.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    fromIntersectionId: uuid('from_intersection_id').notNull().references(() => intersections.id, { onDelete: 'cascade' }),
    toIntersectionId: uuid('to_intersection_id').notNull().references(() => intersections.id, { onDelete: 'cascade' }),
    lengthM: doublePrecision('length_m').notNull(),
    lanes: integer('lanes').notNull(),
    speedLimitMs: doublePrecision('speed_limit_ms').notNull(),
    saturationFlow: integer('saturation_flow').notNull(),
    roadClass: roadClass('road_class').notNull(),
    geom: lineGeom('geom').notNull(),
  },
  (t) => [
    uniqueIndex('roads_city_code_uq').on(t.cityId, t.code),
    index('roads_geom_gix').using('gist', t.geom),
    index('roads_from_idx').on(t.fromIntersectionId),
    index('roads_to_idx').on(t.toIntersectionId),
    check('roads_length_positive', sql`${t.lengthM} > 0`),
    check('roads_lanes_range', sql`${t.lanes} between 1 and 8`),
    check('roads_speed_positive', sql`${t.speedLimitMs} > 0`),
    check('roads_not_loop', sql`${t.fromIntersectionId} <> ${t.toIntersectionId}`),
  ],
);

export const trafficSignals = pgTable(
  'traffic_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    intersectionId: uuid('intersection_id').notNull().references(() => intersections.id, { onDelete: 'cascade' }),
    offsetS: integer('offset_s').notNull().default(0),
  },
  (t) => [uniqueIndex('traffic_signals_intersection_uq').on(t.intersectionId)],
);

export const signalPhases = pgTable(
  'signal_phases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signalId: uuid('signal_id').notNull().references(() => trafficSignals.id, { onDelete: 'cascade' }),
    phaseIndex: integer('phase_index').notNull(),
    name: text('name').notNull(),
    greenS: integer('green_s').notNull(),
    yellowS: integer('yellow_s').notNull(),
    allRedS: integer('all_red_s').notNull(),
    approachRoadIds: uuid('approach_road_ids').array().notNull(),
  },
  (t) => [
    uniqueIndex('signal_phases_order_uq').on(t.signalId, t.phaseIndex),
    check('signal_phases_green', sql`${t.greenS} between 5 and 120`),
    check('signal_phases_yellow', sql`${t.yellowS} between 3 and 6`),
    check('signal_phases_allred', sql`${t.allRedS} between 0 and 5`),
  ],
);

export const buildings = pgTable(
  'buildings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: text('city_id').notNull().references(() => cities.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    districtId: uuid('district_id').notNull().references(() => districts.id, { onDelete: 'cascade' }),
    use: buildingUse('use').notNull(),
    heightM: doublePrecision('height_m').notNull(),
    floors: integer('floors').notNull(),
    floorAreaM2: doublePrecision('floor_area_m2').notNull(),
    footprint: polygonGeom('footprint').notNull(),
  },
  (t) => [
    uniqueIndex('buildings_city_code_uq').on(t.cityId, t.code),
    index('buildings_footprint_gix').using('gist', t.footprint),
    index('buildings_district_idx').on(t.districtId),
    check('buildings_height_positive', sql`${t.heightM} > 0`),
  ],
);

export const demandZones = pgTable(
  'demand_zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: text('city_id').notNull().references(() => cities.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    production: doublePrecision('production').notNull(),
    attraction: doublePrecision('attraction').notNull(),
    intersectionIds: uuid('intersection_ids').array().notNull(),
  },
  (t) => [uniqueIndex('demand_zones_city_code_uq').on(t.cityId, t.code)],
);

/* ───────────── projects & scenarios ───────────── */

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    cityId: text('city_id').notNull().references(() => cities.id),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('projects_owner_idx').on(t.ownerId)],
);

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index('project_members_user_idx').on(t.userId)],
);

export const scenarios = pgTable(
  'scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    kind: scenarioKind('kind').notNull().default('variant'),
    baseScenarioId: uuid('base_scenario_id'),
    isSaved: boolean('is_saved').notNull().default(false),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    index('scenarios_project_idx').on(t.projectId, t.createdAt),
    foreignKey({ columns: [t.baseScenarioId], foreignColumns: [t.id], name: 'scenarios_base_fk' }).onDelete('set null'),
  ],
);

export const scenarioParameters = pgTable(
  'scenario_parameters',
  {
    scenarioId: uuid('scenario_id').primaryKey().references(() => scenarios.id, { onDelete: 'cascade' }),
    durationS: integer('duration_s').notNull().default(3600),
    seed: integer('seed').notNull().default(42),
    demandMultiplier: doublePrecision('demand_multiplier').notNull().default(1),
    startHour: integer('start_hour').notNull().default(7),
    rerouting: boolean('rerouting').notNull().default(true),
    sampleIntervalS: integer('sample_interval_s').notNull().default(60),
    frameIntervalS: integer('frame_interval_s').notNull().default(4),
    energySetpointDelta: doublePrecision('energy_setpoint_delta').notNull().default(0),
    energyLightingSaving: doublePrecision('energy_lighting_saving').notNull().default(0),
    energyOccupancyScale: doublePrecision('energy_occupancy_scale').notNull().default(1),
  },
  (t) => [
    check('scenario_duration_range', sql`${t.durationS} between 60 and 14400`),
    check('scenario_demand_range', sql`${t.demandMultiplier} between 0 and 4`),
    check('scenario_hour_range', sql`${t.startHour} between 0 and 23`),
    check('scenario_seed_nonneg', sql`${t.seed} >= 0`),
  ],
);

export const scenarioSignalOverrides = pgTable(
  'scenario_signal_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scenarioId: uuid('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
    intersectionId: uuid('intersection_id').notNull().references(() => intersections.id),
    offsetS: integer('offset_s'),
    greens: integer('greens').array().notNull(),
  },
  (t) => [uniqueIndex('scenario_signal_overrides_uq').on(t.scenarioId, t.intersectionId)],
);

export const scenarioClosures = pgTable(
  'scenario_closures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scenarioId: uuid('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
    roadId: uuid('road_id').notNull().references(() => roads.id),
    startS: integer('start_s').notNull().default(0),
    endS: integer('end_s'),
    reason: text('reason').notNull().default(''),
  },
  (t) => [
    index('scenario_closures_scenario_idx').on(t.scenarioId),
    check('scenario_closures_window', sql`${t.endS} is null or ${t.endS} > ${t.startS}`),
  ],
);

export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scenarioId: uuid('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
    roadId: uuid('road_id').notNull().references(() => roads.id),
    kind: incidentKind('kind').notNull(),
    severity: real('severity').notNull(),
    startS: integer('start_s').notNull(),
    durationS: integer('duration_s').notNull(),
    description: text('description').notNull().default(''),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('incidents_scenario_idx').on(t.scenarioId),
    check('incidents_severity_range', sql`${t.severity} > 0 and ${t.severity} <= 1`),
    check('incidents_duration_positive', sql`${t.durationS} > 0`),
  ],
);

/* ───────────── simulation runs & results ───────────── */

export const simulationRuns = pgTable(
  'simulation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scenarioId: uuid('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    requestedBy: uuid('requested_by').notNull().references(() => users.id),
    status: runStatus('status').notNull().default('queued'),
    progress: real('progress').notNull().default(0),
    simTimeS: integer('sim_time_s').notNull().default(0),
    /** Simulated seconds per wall-clock second for live viewing; 0 = as fast as possible. */
    pace: integer('pace').notNull().default(0),
    engineVersion: text('engine_version').notNull(),
    cityVersion: text('city_version').notNull(),
    seed: integer('seed').notNull(),
    paramsSnapshot: jsonb('params_snapshot').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    resultFingerprint: text('result_fingerprint'),
    errorMessage: text('error_message'),
    // summary metrics (typed so they can be filtered, sorted, compared in SQL)
    tripsGenerated: integer('trips_generated'),
    tripsCompleted: integer('trips_completed'),
    tripsStranded: integer('trips_stranded'),
    vehiclesRemaining: integer('vehicles_remaining'),
    meanTravelTimeS: doublePrecision('mean_travel_time_s'),
    meanWaitTimeS: doublePrecision('mean_wait_time_s'),
    meanDelayS: doublePrecision('mean_delay_s'),
    p95TravelTimeS: doublePrecision('p95_travel_time_s'),
    meanStops: doublePrecision('mean_stops'),
    throughputPerHour: doublePrecision('throughput_per_hour'),
    vehicleKm: doublePrecision('vehicle_km'),
    maxQueue: integer('max_queue'),
    meanNetworkSpeedMs: doublePrecision('mean_network_speed_ms'),
    reroutes: integer('reroutes'),
    fuelLitresEst: doublePrecision('fuel_litres_est'),
    evKwhEst: doublePrecision('ev_kwh_est'),
    co2KgEst: doublePrecision('co2_kg_est'),
    idleHoursEst: doublePrecision('idle_hours_est'),
    energyAssumptions: jsonb('energy_assumptions'),
    wallTimeMs: integer('wall_time_ms'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('simulation_runs_scenario_idx').on(t.scenarioId, t.queuedAt),
    index('simulation_runs_project_status_idx').on(t.projectId, t.status),
    index('simulation_runs_input_fp_idx').on(t.inputFingerprint),
    check('simulation_runs_progress_range', sql`${t.progress} between 0 and 1`),
  ],
);

export const simulationMetrics = pgTable(
  'simulation_metrics',
  {
    runId: uuid('run_id').notNull().references(() => simulationRuns.id, { onDelete: 'cascade' }),
    tS: integer('t_s').notNull(),
    vehiclesInNetwork: integer('vehicles_in_network').notNull(),
    queuedVehicles: integer('queued_vehicles').notNull(),
    completedTrips: integer('completed_trips').notNull(),
    meanSpeedMs: doublePrecision('mean_speed_ms').notNull(),
    windowMeanTravelTimeS: doublePrecision('window_mean_travel_time_s'),
    throughputPerHour: doublePrecision('throughput_per_hour').notNull(),
    pendingDepartures: integer('pending_departures').notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.tS] })],
);

export const simulationLinkResults = pgTable(
  'simulation_link_results',
  {
    runId: uuid('run_id').notNull().references(() => simulationRuns.id, { onDelete: 'cascade' }),
    roadId: uuid('road_id').notNull().references(() => roads.id),
    entered: integer('entered').notNull(),
    exited: integer('exited').notNull(),
    meanTravelTimeS: doublePrecision('mean_travel_time_s'),
    meanSpeedMs: doublePrecision('mean_speed_ms'),
    maxQueue: integer('max_queue').notNull(),
    meanQueue: doublePrecision('mean_queue').notNull(),
    utilization: doublePrecision('utilization').notNull(),
    congestion: doublePrecision('congestion').notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.roadId] })],
);

export const simulationIntersectionResults = pgTable(
  'simulation_intersection_results',
  {
    runId: uuid('run_id').notNull().references(() => simulationRuns.id, { onDelete: 'cascade' }),
    intersectionId: uuid('intersection_id').notNull().references(() => intersections.id),
    throughput: integer('throughput').notNull(),
    meanDelayS: doublePrecision('mean_delay_s').notNull(),
    maxQueue: integer('max_queue').notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.intersectionId] })],
);

export const simulationEvents = pgTable(
  'simulation_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: uuid('run_id').notNull().references(() => simulationRuns.id, { onDelete: 'cascade' }),
    tS: integer('t_s').notNull(),
    type: eventType('type').notNull(),
    roadId: uuid('road_id').references(() => roads.id),
    intersectionId: uuid('intersection_id').references(() => intersections.id),
    message: text('message').notNull(),
  },
  (t) => [index('simulation_events_run_idx').on(t.runId, t.tS)],
);

export const simulationPlaybacks = pgTable('simulation_playbacks', {
  runId: uuid('run_id').primaryKey().references(() => simulationRuns.id, { onDelete: 'cascade' }),
  frameIntervalS: integer('frame_interval_s').notNull(),
  frameCount: integer('frame_count').notNull(),
  /** gzip of the binary codec in @madar/sim-engine (encodeFrames). */
  data: bytea('data').notNull(),
  rawBytes: integer('raw_bytes').notNull(),
  createdAt: createdAt(),
});

/* ───────────── reporting, audit, notifications ───────────── */

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    baselineRunId: uuid('baseline_run_id').notNull().references(() => simulationRuns.id, { onDelete: 'cascade' }),
    variantRunId: uuid('variant_run_id').references(() => simulationRuns.id, { onDelete: 'cascade' }),
    notes: text('notes').notNull().default(''),
    /** Frozen comparison snapshot so a report never changes after it is generated. */
    content: jsonb('content').notNull(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('reports_project_idx').on(t.projectId, t.createdAt)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata').notNull().default({}),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_actor_idx').on(t.actorId, t.createdAt), index('audit_logs_entity_idx').on(t.entityType, t.entityId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);
