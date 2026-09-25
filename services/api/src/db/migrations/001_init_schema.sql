-- Create uploads table
create table uploads (
  id              uuid primary key default gen_random_uuid(),
  file_name       text not null,
  file_sha256     text not null unique,
  uploaded_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  range_start     timestamptz not null,
  range_end       timestamptz not null,
  interval_min    int not null,
  services        int not null,
  rows_total      int not null,
  rows_stored     int not null,
  rows_merged     int not null,
  rows_fixed      int not null,
  rows_rejected   int not null,
  expected_checks int not null,
  issues          jsonb not null
);

-- Create checks table
create table checks (
  upload_id     uuid not null references uploads(id) on delete cascade,
  service_id    text not null,
  slot_ts       timestamptz not null,
  status_code   int  not null,
  is_valid      boolean not null,
  is_failed     boolean not null,
  latency_ms    int,
  agents        text[] not null,
  region        text,
  quality_flags text[] not null,
  primary key (upload_id, service_id, slot_ts)
);
create index checks_time   on checks (upload_id, slot_ts);
create index checks_failed on checks (upload_id, slot_ts) where is_failed;

-- Create rejected_rows table
create table rejected_rows (
  upload_id uuid references uploads(id) on delete cascade,
  line_no int,
  raw text,
  reason text
);

-- Create services table
create table services (
  upload_id uuid not null references uploads(id) on delete cascade,
  service_id text not null,
  service_name text not null,
  primary key (upload_id, service_id)
);

-- Create service_stats table
create table service_stats (
  upload_id uuid not null references uploads(id) on delete cascade,
  service_id text not null,
  valid int,
  failed int,
  present int,
  availability numeric,
  downtime_min int,
  p50_ms int,
  p95_ms int,
  incidents int,
  longest_incident_min int,
  primary key (upload_id, service_id)
);

-- Create hourly_failures table
create table hourly_failures (
  upload_id uuid not null references uploads(id) on delete cascade,
  service_id text not null,
  hour_ts timestamptz not null,
  checks int,
  failed int,
  primary key (upload_id, service_id, hour_ts)
);

-- Create incidents table
create table incidents (
  upload_id uuid not null references uploads(id) on delete cascade,
  service_id text not null,
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  failed int,
  median_latency_ms int,
  normal_latency_ms int
);
