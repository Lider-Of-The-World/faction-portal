-- One-time correction for the existing leader account.
-- A row is returned only when the exact misspelled leader is found and the
-- corrected nickname is not already assigned to another account.
BEGIN;

WITH renamed AS (
  UPDATE public.faction_members AS member
  SET
    nickname = 'Winston_Goodman',
    nickname_normalized = 'winston_goodman'
  WHERE member.role = 'leader'
    AND member.nickname = 'Winston_Goodmam'
    AND member.nickname_normalized = 'winston_goodmam'
    AND NOT EXISTS (
      SELECT 1
      FROM public.faction_members AS existing
      WHERE existing.nickname_normalized = 'winston_goodman'
    )
  RETURNING member.id, member.nickname
),
audit_event AS (
  INSERT INTO public.faction_audit_logs (
    actor_id,
    actor_nickname,
    category,
    action,
    entity_type,
    entity_id,
    entity_label,
    target_member_id,
    target_member_nickname,
    details
  )
  SELECT
    renamed.id,
    'Winston_Goodmam',
    'accounts',
    'account.nickname_corrected',
    'member',
    renamed.id::text,
    'Исправлено имя аккаунта лидера',
    renamed.id,
    'Winston_Goodmam',
    jsonb_build_object(
      'before', jsonb_build_object('nickname', 'Winston_Goodmam'),
      'after', jsonb_build_object('nickname', 'Winston_Goodman'),
      'source', 'manual_supabase_correction'
    )
  FROM renamed
  RETURNING id
)
SELECT renamed.id, renamed.nickname, audit_event.id AS audit_event_id
FROM renamed
CROSS JOIN audit_event;

COMMIT;
