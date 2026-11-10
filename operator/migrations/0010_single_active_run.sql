-- At most one queued/running prospecting or discovery run per workspace.
-- Migrations run before the server serves requests, so no request can own a
-- run here: any queued/running row is an orphan from an interrupted process.
update prospecting_runs
set status = 'failed', terminal_reason = 'Interrupted; not resumed', finished_at = now()
where status in ('queued', 'running');
update discovery_runs
set status = 'failed', terminal_reason = 'Interrupted; not resumed', finished_at = now()
where status in ('queued', 'running');
create unique index if not exists prospecting_runs_one_active_idx
  on prospecting_runs (user_id) where status in ('queued', 'running');
create unique index if not exists discovery_runs_one_active_idx
  on discovery_runs (user_id) where status in ('queued', 'running');
