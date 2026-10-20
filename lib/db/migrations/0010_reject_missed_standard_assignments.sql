-- Correct only system-generated missed submissions whose two-point deduction is already recorded.
WITH missed_assignments AS (
  SELECT
    assignment.id AS assignment_id,
    submission.id AS submission_id
  FROM faction_standard_assignments AS assignment
  INNER JOIN faction_standard_submissions AS submission
    ON submission.assignment_id = assignment.id
  WHERE assignment.status = 'pending_review'
    AND assignment.cycle_closed_at IS NOT NULL
    AND submission.status = 'pending_review'
    AND submission.comment LIKE 'Период норматива завершён автоматически %Сдача не отправлена; скриншотов нет.'
    AND NOT EXISTS (
      SELECT 1
      FROM faction_standard_submission_files AS submission_file
      WHERE submission_file.submission_id = submission.id
    )
    AND EXISTS (
      SELECT 1
      FROM faction_point_transactions AS point_transaction
      WHERE point_transaction.assignment_id = assignment.id
        AND point_transaction.delta = -2
        AND point_transaction.source = 'standard_not_submitted'
    )
), updated_submissions AS (
  UPDATE faction_standard_submissions AS submission
  SET
    status = 'rejected',
    decision_reason = COALESCE(
      NULLIF(submission.decision_reason, ''),
      'Автоматический отказ: сдача не отправлена в установленный срок.'
    )
  FROM missed_assignments
  WHERE submission.id = missed_assignments.submission_id
  RETURNING missed_assignments.assignment_id
)
UPDATE faction_standard_assignments AS assignment
SET status = 'rejected'
FROM updated_submissions
WHERE assignment.id = updated_submissions.assignment_id
  AND assignment.status = 'pending_review';
