-- ═══════════════════════════════════════════════════════════════
-- Founder OS — Notion Sync Migration
-- Run this in Supabase SQL Editor AFTER the base migration
-- ═══════════════════════════════════════════════════════════════

-- Add sync tracking columns to existing table
ALTER TABLE founder_os_items
  ADD COLUMN IF NOT EXISTS notion_page_id       text,
  ADD COLUMN IF NOT EXISTS notion_sync_status   text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notion_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS notion_sync_error    text;

-- Index for fast lookup of unsynced records
CREATE INDEX IF NOT EXISTS founder_os_sync_status_idx
  ON founder_os_items (notion_sync_status)
  WHERE notion_sync_status IN ('pending', 'failed');

-- Index for Notion page ID lookups (duplicate prevention)
CREATE INDEX IF NOT EXISTS founder_os_notion_page_idx
  ON founder_os_items (notion_page_id)
  WHERE notion_page_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- DONE. Next: deploy the Supabase Edge Function below.
-- ═══════════════════════════════════════════════════════════════
