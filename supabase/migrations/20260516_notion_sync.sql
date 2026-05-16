-- ═══════════════════════════════════════════════════════════════
-- Founder OS — Notion Sync Migration
-- Run this in: Supabase → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Add sync tracking columns
ALTER TABLE founder_os_items
  ADD COLUMN IF NOT EXISTS notion_page_id        text,
  ADD COLUMN IF NOT EXISTS notion_sync_status    text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notion_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS notion_sync_error     text;

-- Step 2: Indexes for efficient sync queries
CREATE INDEX IF NOT EXISTS founder_os_sync_status_idx
  ON founder_os_items (notion_sync_status)
  WHERE notion_sync_status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS founder_os_notion_page_idx
  ON founder_os_items (notion_page_id)
  WHERE notion_page_id IS NOT NULL;

-- Step 3: Back-fill existing rows so they don't flood sync on first run
-- (brain_dump / parking_lot / triage / milestone / kpi / sop_status stay 'skipped')
UPDATE founder_os_items
SET notion_sync_status = 'skipped'
WHERE item_type IN ('brain_dump','parking_lot','triage','milestone','kpi','sop_status');

-- ═══════════════════════════════════════════════════════════════
-- VERIFY: Run this after to confirm columns exist
-- SELECT id, item_type, notion_sync_status FROM founder_os_items LIMIT 5;
-- ═══════════════════════════════════════════════════════════════
