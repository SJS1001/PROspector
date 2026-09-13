-- One run may expose only one live capability. A consumed partial submission
-- can deliberately open a successor capability, but only after trusted
-- ingestion records its retryable terminal event.
UPDATE `runner_assignments`
SET `status` = 'expired', `updated_at` = unixepoch() * 1000, `revision` = `revision` + 1
WHERE `status` = 'issued' AND `expires_at` <= unixepoch() * 1000;
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_assignment_active_run_unique`
ON `runner_assignments` (`workspace_id`, `run_id`)
WHERE `status` = 'issued';
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_submission_complete_run_unique`
ON `runner_submissions` (`workspace_id`, `run_id`)
WHERE `status` = 'received' AND json_extract(`submission_json`, '$.status') = 'complete';
--> statement-breakpoint
DROP TRIGGER `runner_assignment_scope_insert`;
--> statement-breakpoint
CREATE TRIGGER `runner_assignment_scope_insert`
BEFORE INSERT ON `runner_assignments`
WHEN EXISTS (
  SELECT 1 FROM `runner_assignments` active_assignment
  WHERE active_assignment.workspace_id = NEW.workspace_id
    AND active_assignment.run_id = NEW.run_id
    AND active_assignment.status = 'issued'
) OR NOT EXISTS (
  SELECT 1 FROM `prospecting_runs` r
  JOIN `typed_configurations` c ON c.id = r.configuration_id AND c.workspace_id = r.workspace_id
  WHERE r.id = NEW.run_id AND r.workspace_id = NEW.workspace_id
    AND r.profile_id = NEW.profile_id AND r.configuration_id = NEW.configuration_id AND r.configuration_digest = NEW.configuration_digest
    AND c.owner_type = 'profile' AND c.owner_id = r.profile_id AND c.kind = 'profile_effective'
    AND (
      (
        c.active = 1 AND r.execution_state IN ('queued', 'assigned', 'running')
        AND NOT EXISTS (
          SELECT 1 FROM `runner_submissions` existing_submission
          WHERE existing_submission.workspace_id = r.workspace_id
            AND existing_submission.run_id = r.id
            AND existing_submission.status = 'received'
        )
      )
      OR (
        r.execution_state = 'submitted'
        AND NOT EXISTS (
          SELECT 1 FROM `runner_submissions` complete_submission
          WHERE complete_submission.workspace_id = r.workspace_id
            AND complete_submission.run_id = r.id
            AND complete_submission.status = 'received'
            AND json_extract(complete_submission.submission_json, '$.status') = 'complete'
        )
        AND EXISTS (
          SELECT 1 FROM `runner_submissions` partial_submission
          JOIN `runner_assignments` prior ON prior.id = partial_submission.assignment_id
            AND prior.workspace_id = partial_submission.workspace_id AND prior.run_id = partial_submission.run_id
          JOIN `prospecting_run_events` terminal ON terminal.workspace_id = partial_submission.workspace_id
            AND terminal.run_id = partial_submission.run_id AND terminal.event_type = 'failed'
            AND json_extract(terminal.event_json, '$.schema') = 'prospecting-ingestion-ledger/v1'
            AND json_extract(terminal.event_json, '$.stage') = 'terminal'
            AND json_extract(terminal.event_json, '$.submissionId') = partial_submission.id
            AND json_extract(terminal.event_json, '$.submissionDigest') = partial_submission.submission_digest
            AND json_extract(terminal.event_json, '$.terminalReason') = 'partial_submission_retryable'
            AND json_extract(terminal.event_json, '$.retryable') = 1
          WHERE partial_submission.run_id = r.id AND partial_submission.workspace_id = r.workspace_id
            AND partial_submission.configuration_id = r.configuration_id
            AND partial_submission.status = 'received'
            AND json_extract(partial_submission.submission_json, '$.status') = 'partial'
            AND prior.status = 'consumed'
        )
      )
    )
)
BEGIN SELECT RAISE(ABORT, 'runner assignment requires exact exclusive run binding'); END;
--> statement-breakpoint
DROP TRIGGER `runner_submission_scope_insert`;
--> statement-breakpoint
CREATE TRIGGER `runner_submission_scope_insert`
BEFORE INSERT ON `runner_submissions`
WHEN NOT EXISTS (
  SELECT 1 FROM `runner_assignments` a JOIN `prospecting_runs` r ON r.id = a.run_id
  WHERE a.id = NEW.assignment_id AND a.workspace_id = NEW.workspace_id AND a.run_id = NEW.run_id
    AND a.configuration_id = NEW.configuration_id AND a.status = 'issued'
    AND r.workspace_id = NEW.workspace_id AND r.execution_state IN ('assigned', 'running')
    AND NOT EXISTS (
      SELECT 1 FROM `runner_submissions` complete_submission
      WHERE complete_submission.workspace_id = NEW.workspace_id
        AND complete_submission.run_id = NEW.run_id
        AND complete_submission.status = 'received'
        AND json_extract(complete_submission.submission_json, '$.status') = 'complete'
    )
    AND NOT EXISTS (
      SELECT 1 FROM `runner_submissions` prior_submission
      WHERE prior_submission.workspace_id = NEW.workspace_id
        AND prior_submission.run_id = NEW.run_id
        AND prior_submission.status = 'received'
        AND NOT (
          json_extract(prior_submission.submission_json, '$.status') = 'partial'
          AND EXISTS (
            SELECT 1 FROM `prospecting_run_events` terminal
            WHERE terminal.workspace_id = prior_submission.workspace_id
              AND terminal.run_id = prior_submission.run_id
              AND terminal.event_type = 'failed'
              AND json_extract(terminal.event_json, '$.schema') = 'prospecting-ingestion-ledger/v1'
              AND json_extract(terminal.event_json, '$.stage') = 'terminal'
              AND json_extract(terminal.event_json, '$.submissionId') = prior_submission.id
              AND json_extract(terminal.event_json, '$.submissionDigest') = prior_submission.submission_digest
              AND json_extract(terminal.event_json, '$.terminalReason') = 'partial_submission_retryable'
              AND json_extract(terminal.event_json, '$.retryable') = 1
          )
        )
    )
)
BEGIN SELECT RAISE(ABORT, 'runner submission requires one exclusive issued assignment binding'); END;
