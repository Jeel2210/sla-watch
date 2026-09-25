-- Store everything packages/core computes, so read endpoints never re-apply business rules (ADR-007).
-- Safe to run more than once.

alter table uploads
  add column if not exists agents        text[] not null default '{}',
  add column if not exists regions       text[] not null default '{}',
  add column if not exists interval_hits int,   -- gaps equal to the detected interval (null: stored before 002)
  add column if not exists total_gaps    int;   -- all gaps looked at when detecting the interval

alter table service_stats
  add column if not exists expected             int,      -- check slots in the upload
  add column if not exists met                  boolean,  -- availability >= SLA target; null = no valid checks
  add column if not exists allowed_downtime_min numeric,
  add column if not exists times_allowance      numeric,  -- downtime ÷ allowed
  add column if not exists coverage             numeric;  -- present ÷ expected × 100

-- Uploads stored before 002: the same values core's serviceStats() gives (SLA target 99.9%).
update service_stats s set
  expected             = u.expected_checks / u.services,
  met                  = case when s.availability is null then null else s.availability >= 99.9 end,
  allowed_downtime_min = (u.expected_checks / u.services) * u.interval_min * 0.001,
  times_allowance      = s.downtime_min / ((u.expected_checks / u.services) * u.interval_min * 0.001),
  coverage             = 100.0 * s.present / (u.expected_checks / u.services)
from uploads u
where u.id = s.upload_id and s.expected is null;

update uploads u set
  agents  = coalesce((select array_agg(distinct a order by a) from checks c, unnest(c.agents) a where c.upload_id = u.id), '{}'),
  regions = coalesce((select array_agg(distinct c.region order by c.region) from checks c where c.upload_id = u.id and c.region is not null), '{}')
where u.agents = '{}';

-- Dashboard reads: incidents in time order, services worst first.
create index if not exists incidents_by_time on incidents (upload_id, start_ts, service_id);
create index if not exists service_stats_worst on service_stats (upload_id, (coalesce(availability, 101)), service_id);
