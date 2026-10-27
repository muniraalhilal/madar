CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."building_use" AS ENUM('office', 'residential', 'retail', 'mixed', 'civic', 'hotel');--> statement-breakpoint
CREATE TYPE "public"."sim_event_type" AS ENUM('closure_started', 'closure_ended', 'incident_started', 'incident_cleared', 'reroute', 'trip_stranded', 'spillback');--> statement-breakpoint
CREATE TYPE "public"."incident_kind" AS ENUM('collision', 'breakdown', 'roadwork', 'event');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."node_kind" AS ENUM('signal', 'priority', 'gateway');--> statement-breakpoint
CREATE TYPE "public"."road_class" AS ENUM('ring', 'boulevard', 'arterial', 'collector', 'local', 'corniche');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'paused', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scenario_kind" AS ENUM('baseline', 'variant');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'planner', 'viewer');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"district_id" uuid NOT NULL,
	"use" "building_use" NOT NULL,
	"height_m" double precision NOT NULL,
	"floors" integer NOT NULL,
	"floor_area_m2" double precision NOT NULL,
	"footprint" geometry(Polygon,0) NOT NULL,
	CONSTRAINT "buildings_height_positive" CHECK ("buildings"."height_m" > 0)
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"base_demand_veh_per_hour" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"production" double precision NOT NULL,
	"attraction" double precision NOT NULL,
	"intersection_ids" uuid[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"character" text NOT NULL,
	"color" text NOT NULL,
	"boundary" geometry(Polygon,0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"road_id" uuid NOT NULL,
	"kind" "incident_kind" NOT NULL,
	"severity" real NOT NULL,
	"start_s" integer NOT NULL,
	"duration_s" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_severity_range" CHECK ("incidents"."severity" > 0 and "incidents"."severity" <= 1),
	CONSTRAINT "incidents_duration_positive" CHECK ("incidents"."duration_s" > 0)
);
--> statement-breakpoint
CREATE TABLE "intersections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "node_kind" NOT NULL,
	"district_id" uuid,
	"geom" geometry(Point,0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"city_id" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"baseline_run_id" uuid NOT NULL,
	"variant_run_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"from_intersection_id" uuid NOT NULL,
	"to_intersection_id" uuid NOT NULL,
	"length_m" double precision NOT NULL,
	"lanes" integer NOT NULL,
	"speed_limit_ms" double precision NOT NULL,
	"saturation_flow" integer NOT NULL,
	"road_class" "road_class" NOT NULL,
	"geom" geometry(LineString,0) NOT NULL,
	CONSTRAINT "roads_length_positive" CHECK ("roads"."length_m" > 0),
	CONSTRAINT "roads_lanes_range" CHECK ("roads"."lanes" between 1 and 8),
	CONSTRAINT "roads_speed_positive" CHECK ("roads"."speed_limit_ms" > 0),
	CONSTRAINT "roads_not_loop" CHECK ("roads"."from_intersection_id" <> "roads"."to_intersection_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" "user_role" PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"permissions" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"road_id" uuid NOT NULL,
	"start_s" integer DEFAULT 0 NOT NULL,
	"end_s" integer,
	"reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "scenario_closures_window" CHECK ("scenario_closures"."end_s" is null or "scenario_closures"."end_s" > "scenario_closures"."start_s")
);
--> statement-breakpoint
CREATE TABLE "scenario_parameters" (
	"scenario_id" uuid PRIMARY KEY NOT NULL,
	"duration_s" integer DEFAULT 3600 NOT NULL,
	"seed" integer DEFAULT 42 NOT NULL,
	"demand_multiplier" double precision DEFAULT 1 NOT NULL,
	"start_hour" integer DEFAULT 7 NOT NULL,
	"rerouting" boolean DEFAULT true NOT NULL,
	"sample_interval_s" integer DEFAULT 60 NOT NULL,
	"frame_interval_s" integer DEFAULT 4 NOT NULL,
	"energy_setpoint_delta" double precision DEFAULT 0 NOT NULL,
	"energy_lighting_saving" double precision DEFAULT 0 NOT NULL,
	"energy_occupancy_scale" double precision DEFAULT 1 NOT NULL,
	CONSTRAINT "scenario_duration_range" CHECK ("scenario_parameters"."duration_s" between 60 and 14400),
	CONSTRAINT "scenario_demand_range" CHECK ("scenario_parameters"."demand_multiplier" between 0 and 4),
	CONSTRAINT "scenario_hour_range" CHECK ("scenario_parameters"."start_hour" between 0 and 23),
	CONSTRAINT "scenario_seed_nonneg" CHECK ("scenario_parameters"."seed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "scenario_signal_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"intersection_id" uuid NOT NULL,
	"offset_s" integer,
	"greens" integer[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "scenario_kind" DEFAULT 'variant' NOT NULL,
	"base_scenario_id" uuid,
	"is_saved" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "signal_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"phase_index" integer NOT NULL,
	"name" text NOT NULL,
	"green_s" integer NOT NULL,
	"yellow_s" integer NOT NULL,
	"all_red_s" integer NOT NULL,
	"approach_road_ids" uuid[] NOT NULL,
	CONSTRAINT "signal_phases_green" CHECK ("signal_phases"."green_s" between 5 and 120),
	CONSTRAINT "signal_phases_yellow" CHECK ("signal_phases"."yellow_s" between 3 and 6),
	CONSTRAINT "signal_phases_allred" CHECK ("signal_phases"."all_red_s" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "simulation_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"t_s" integer NOT NULL,
	"type" "sim_event_type" NOT NULL,
	"road_id" uuid,
	"intersection_id" uuid,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_intersection_results" (
	"run_id" uuid NOT NULL,
	"intersection_id" uuid NOT NULL,
	"throughput" integer NOT NULL,
	"mean_delay_s" double precision NOT NULL,
	"max_queue" integer NOT NULL,
	CONSTRAINT "simulation_intersection_results_run_id_intersection_id_pk" PRIMARY KEY("run_id","intersection_id")
);
--> statement-breakpoint
CREATE TABLE "simulation_link_results" (
	"run_id" uuid NOT NULL,
	"road_id" uuid NOT NULL,
	"entered" integer NOT NULL,
	"exited" integer NOT NULL,
	"mean_travel_time_s" double precision,
	"mean_speed_ms" double precision,
	"max_queue" integer NOT NULL,
	"mean_queue" double precision NOT NULL,
	"utilization" double precision NOT NULL,
	"congestion" double precision NOT NULL,
	CONSTRAINT "simulation_link_results_run_id_road_id_pk" PRIMARY KEY("run_id","road_id")
);
--> statement-breakpoint
CREATE TABLE "simulation_metrics" (
	"run_id" uuid NOT NULL,
	"t_s" integer NOT NULL,
	"vehicles_in_network" integer NOT NULL,
	"queued_vehicles" integer NOT NULL,
	"completed_trips" integer NOT NULL,
	"mean_speed_ms" double precision NOT NULL,
	"window_mean_travel_time_s" double precision,
	"throughput_per_hour" double precision NOT NULL,
	"pending_departures" integer NOT NULL,
	CONSTRAINT "simulation_metrics_run_id_t_s_pk" PRIMARY KEY("run_id","t_s")
);
--> statement-breakpoint
CREATE TABLE "simulation_playbacks" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"frame_interval_s" integer NOT NULL,
	"frame_count" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"raw_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"sim_time_s" integer DEFAULT 0 NOT NULL,
	"pace" integer DEFAULT 0 NOT NULL,
	"engine_version" text NOT NULL,
	"city_version" text NOT NULL,
	"seed" integer NOT NULL,
	"params_snapshot" jsonb NOT NULL,
	"input_fingerprint" text NOT NULL,
	"result_fingerprint" text,
	"error_message" text,
	"trips_generated" integer,
	"trips_completed" integer,
	"trips_stranded" integer,
	"vehicles_remaining" integer,
	"mean_travel_time_s" double precision,
	"mean_wait_time_s" double precision,
	"mean_delay_s" double precision,
	"p95_travel_time_s" double precision,
	"mean_stops" double precision,
	"throughput_per_hour" double precision,
	"vehicle_km" double precision,
	"max_queue" integer,
	"mean_network_speed_ms" double precision,
	"reroutes" integer,
	"fuel_litres_est" double precision,
	"ev_kwh_est" double precision,
	"co2_kg_est" double precision,
	"idle_hours_est" double precision,
	"energy_assumptions" jsonb,
	"wall_time_ms" integer,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "simulation_runs_progress_range" CHECK ("simulation_runs"."progress" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "traffic_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intersection_id" uuid NOT NULL,
	"offset_s" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'planner' NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_format" CHECK (position('@' in "users"."email") > 1)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_zones" ADD CONSTRAINT "demand_zones_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_road_id_roads_id_fk" FOREIGN KEY ("road_id") REFERENCES "public"."roads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intersections" ADD CONSTRAINT "intersections_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intersections" ADD CONSTRAINT "intersections_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_baseline_run_id_simulation_runs_id_fk" FOREIGN KEY ("baseline_run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_variant_run_id_simulation_runs_id_fk" FOREIGN KEY ("variant_run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roads" ADD CONSTRAINT "roads_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roads" ADD CONSTRAINT "roads_from_intersection_id_intersections_id_fk" FOREIGN KEY ("from_intersection_id") REFERENCES "public"."intersections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roads" ADD CONSTRAINT "roads_to_intersection_id_intersections_id_fk" FOREIGN KEY ("to_intersection_id") REFERENCES "public"."intersections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_closures" ADD CONSTRAINT "scenario_closures_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_closures" ADD CONSTRAINT "scenario_closures_road_id_roads_id_fk" FOREIGN KEY ("road_id") REFERENCES "public"."roads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_parameters" ADD CONSTRAINT "scenario_parameters_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_signal_overrides" ADD CONSTRAINT "scenario_signal_overrides_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_signal_overrides" ADD CONSTRAINT "scenario_signal_overrides_intersection_id_intersections_id_fk" FOREIGN KEY ("intersection_id") REFERENCES "public"."intersections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_base_fk" FOREIGN KEY ("base_scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_phases" ADD CONSTRAINT "signal_phases_signal_id_traffic_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."traffic_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_events" ADD CONSTRAINT "simulation_events_run_id_simulation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_events" ADD CONSTRAINT "simulation_events_road_id_roads_id_fk" FOREIGN KEY ("road_id") REFERENCES "public"."roads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_events" ADD CONSTRAINT "simulation_events_intersection_id_intersections_id_fk" FOREIGN KEY ("intersection_id") REFERENCES "public"."intersections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_intersection_results" ADD CONSTRAINT "simulation_intersection_results_run_id_simulation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_intersection_results" ADD CONSTRAINT "simulation_intersection_results_intersection_id_intersections_id_fk" FOREIGN KEY ("intersection_id") REFERENCES "public"."intersections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_link_results" ADD CONSTRAINT "simulation_link_results_run_id_simulation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_link_results" ADD CONSTRAINT "simulation_link_results_road_id_roads_id_fk" FOREIGN KEY ("road_id") REFERENCES "public"."roads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_metrics" ADD CONSTRAINT "simulation_metrics_run_id_simulation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_playbacks" ADD CONSTRAINT "simulation_playbacks_run_id_simulation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_signals" ADD CONSTRAINT "traffic_signals_intersection_id_intersections_id_fk" FOREIGN KEY ("intersection_id") REFERENCES "public"."intersections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_roles_id_fk" FOREIGN KEY ("role") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "buildings_city_code_uq" ON "buildings" USING btree ("city_id","code");--> statement-breakpoint
CREATE INDEX "buildings_footprint_gix" ON "buildings" USING gist ("footprint");--> statement-breakpoint
CREATE INDEX "buildings_district_idx" ON "buildings" USING btree ("district_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demand_zones_city_code_uq" ON "demand_zones" USING btree ("city_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "districts_city_code_uq" ON "districts" USING btree ("city_id","code");--> statement-breakpoint
CREATE INDEX "districts_boundary_gix" ON "districts" USING gist ("boundary");--> statement-breakpoint
CREATE INDEX "incidents_scenario_idx" ON "incidents" USING btree ("scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intersections_city_code_uq" ON "intersections" USING btree ("city_id","code");--> statement-breakpoint
CREATE INDEX "intersections_geom_gix" ON "intersections" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "reports_project_idx" ON "reports" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "roads_city_code_uq" ON "roads" USING btree ("city_id","code");--> statement-breakpoint
CREATE INDEX "roads_geom_gix" ON "roads" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "roads_from_idx" ON "roads" USING btree ("from_intersection_id");--> statement-breakpoint
CREATE INDEX "roads_to_idx" ON "roads" USING btree ("to_intersection_id");--> statement-breakpoint
CREATE INDEX "scenario_closures_scenario_idx" ON "scenario_closures" USING btree ("scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_signal_overrides_uq" ON "scenario_signal_overrides" USING btree ("scenario_id","intersection_id");--> statement-breakpoint
CREATE INDEX "scenarios_project_idx" ON "scenarios" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "signal_phases_order_uq" ON "signal_phases" USING btree ("signal_id","phase_index");--> statement-breakpoint
CREATE INDEX "simulation_events_run_idx" ON "simulation_events" USING btree ("run_id","t_s");--> statement-breakpoint
CREATE INDEX "simulation_runs_scenario_idx" ON "simulation_runs" USING btree ("scenario_id","queued_at");--> statement-breakpoint
CREATE INDEX "simulation_runs_project_status_idx" ON "simulation_runs" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "simulation_runs_input_fp_idx" ON "simulation_runs" USING btree ("input_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "traffic_signals_intersection_uq" ON "traffic_signals" USING btree ("intersection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_uq" ON "user_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));