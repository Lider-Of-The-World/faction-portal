WITH approved_assignments AS (
  SELECT DISTINCT ON (assignment.id)
    assignment.id AS assignment_id,
    assignment.assignee_id AS member_id,
    standard.title AS standard_title,
    submission.reviewer_id,
    submission.reviewer_nickname,
    assignment.assigned_by_id,
    issuer.nickname AS assigned_by_nickname
  FROM faction_standard_assignments AS assignment
  INNER JOIN faction_standard_submissions AS submission
    ON submission.assignment_id = assignment.id
   AND submission.status = 'approved'
  INNER JOIN faction_standards AS standard
    ON standard.id = assignment.standard_id
  INNER JOIN faction_members AS issuer
    ON issuer.id = assignment.assigned_by_id
  WHERE assignment.status = 'approved'
  ORDER BY assignment.id, submission.version DESC
), inserted_transactions AS (
  INSERT INTO faction_point_transactions (
    member_id, delta, reason, source, assignment_id, actor_id, actor_nickname, request_key
  )
  SELECT
    member_id,
    5,
    'Историческое начисление: норматив «' || standard_title || '» одобрен до внедрения начисления баллов.',
    'standard_approved',
    assignment_id,
    COALESCE(reviewer_id, assigned_by_id),
    CASE
      WHEN reviewer_id IS NOT NULL THEN COALESCE(NULLIF(reviewer_nickname, ''), assigned_by_nickname)
      ELSE assigned_by_nickname
    END,
    'standard:' || assignment_id::text || ':standard_approved'
  FROM approved_assignments
  ON CONFLICT (request_key) DO NOTHING
  RETURNING member_id, delta
), earned_by_member AS (
  SELECT member_id, SUM(delta) AS delta
  FROM inserted_transactions
  GROUP BY member_id
)
UPDATE faction_members AS member
SET points = member.points + earned_by_member.delta
FROM earned_by_member
WHERE member.id = earned_by_member.member_id;
