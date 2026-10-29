-- Operational progress is optional; old archives restore with no active progress.
alter table prospecting_runs add column if not exists progress_json text;
