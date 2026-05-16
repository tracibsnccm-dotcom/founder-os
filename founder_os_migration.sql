-- ═══════════════════════════════════════════════════════════════
-- Founder OS — Supabase Migration
-- Run this in your Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS founder_os_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  item_type   text        NOT NULL,
  entity_key  text,
  title       text,
  body        text,
  status      text,
  category    text,
  due_date    date,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT item_type_check CHECK (item_type IN (
    'brain_dump','parking_lot','triage',
    'priority','blocker','milestone',
    'decision','sop_status','kpi'
  ))
);

-- Unique index for singleton items (SOPs, KPIs, priorities, blockers, milestone)
-- NULL entity_key rows (capture items) are excluded — NULLs are always distinct
CREATE UNIQUE INDEX IF NOT EXISTS founder_os_singleton_idx
  ON founder_os_items (item_type, entity_key)
  WHERE entity_key IS NOT NULL;

-- Updated_at auto-trigger
CREATE OR REPLACE FUNCTION _founder_os_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS founder_os_items_updated_at ON founder_os_items;
CREATE TRIGGER founder_os_items_updated_at
  BEFORE UPDATE ON founder_os_items
  FOR EACH ROW EXECUTE FUNCTION _founder_os_set_updated_at();

-- Row Level Security — open policy for now (add auth later)
ALTER TABLE founder_os_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "founder_os_allow_all" ON founder_os_items;
CREATE POLICY "founder_os_allow_all"
  ON founder_os_items FOR ALL
  USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- DONE. Next steps:
-- 1. Copy your Project URL and anon key from Supabase dashboard
-- 2. Paste them into Founder_OS.html where marked SUPA_URL / SUPA_KEY
-- ═══════════════════════════════════════════════════════════════
