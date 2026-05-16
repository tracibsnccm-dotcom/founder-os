// Supabase Edge Function: notion-sync
// Founder OS → Supabase → Notion one-way sync

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const SYNCABLE_TYPES = [
  "decision",
  "priority",
  "blocker",
  "monthly_review",
  "quarterly_focus",
];

const VALID_ENTITIES = [
  "RCMS",
  "NAE",
  "NurseBridge",
  "CASE Clarity",
  "W4TWP",
  "Shared",
];

const DECISION_CATS = [
  "Product",
  "Marketing",
  "Operations",
  "Sales",
  "Financial",
  "Technology",
  "Strategy",
];

const PRIORITY_CATS = [
  "Marketing",
  "Operations",
  "Sales",
  "Content",
  "Product",
  "Strategy",
];

const BLOCKER_CATS = [
  "Marketing",
  "Operations",
  "Sales",
  "Content",
  "Product",
  "Technology",
  "Strategy",
];

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

function truncateText(value: unknown, max = 1800): string {
  const text = String(value || "");
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

function richText(value: unknown) {
  return [{ text: { content: truncateText(value) } }];
}

function mapStatus(s: string): string {
  const v = (s || "").toLowerCase();
  if (["complete", "completed", "done", "decided"].includes(v)) return "Done";
  if (["active", "in progress", "in_progress", "review", "blocked", "revisiting"].includes(v)) return "In progress";
  return "Not started";
}

function mapEntity(e: string): string {
  return VALID_ENTITIES.includes(e) ? e : "Shared";
}

function mapCategory(cat: string, type: string): string {
  if (type === "decision" || type === "quarterly_focus") return DECISION_CATS.includes(cat) ? cat : "Strategy";
  if (type === "blocker") return BLOCKER_CATS.includes(cat) ? cat : "Operations";
  return PRIORITY_CATS.includes(cat) ? cat : "Operations";
}

function mapQuarter(q: string): string {
  return QUARTERS.includes(q) ? q : "Q2";
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notionRequest(method: string, path: string, body?: object) {
  const key = Deno.env.get("NOTION_API_KEY");
  if (!key) throw new Error("NOTION_API_KEY not set");
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${NOTION_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    lastError = `Notion API ${res.status}: ${JSON.stringify(data)}`;
    if (res.status === 429 || res.status >= 500) { await sleep(500 * attempt); continue; }
    break;
  }
  throw new Error(lastError);
}

function getDatabaseId(type: string): string {
  const map: Record<string, string> = {
    decision:        Deno.env.get("NOTION_CEO_DECISION_DATABASE_ID") || "",
    priority:        Deno.env.get("NOTION_WEEKLY_PRIORITIES_DATABASE_ID") || "",
    blocker:         Deno.env.get("NOTION_BLOCKERS_DATABASE_ID") || "",
    monthly_review:  Deno.env.get("NOTION_MONTHLY_REVIEW_DATABASE_ID") || "",
    quarterly_focus: Deno.env.get("NOTION_QUARTERLY_FOCUS_DATABASE_ID") || "",
  };
  const id = map[type];
  if (!id) throw new Error(`No Notion database ID configured for type: ${type}`);
  return id;
}

function buildProperties(item: Record<string, unknown>, type: string): object {
  const meta = (item.metadata as Record<string, unknown>) || {};
  const entity = mapEntity(String(meta.entity || item.entity_key || "Shared"));

  switch (type) {
    case "decision": return {
      "Decision Title": { title: [{ text: { content: truncateText(item.title || "Untitled Decision", 200) } }] },
      "Business Entity": { select: { name: entity } },
      "Category": { select: { name: mapCategory(String(item.category || "Strategy"), "decision") } },
      "Status": { status: { name: mapStatus(String(item.status || "")) } },
      "Decision Rationale": { rich_text: richText(item.body) },
      "Expected Outcome": { rich_text: richText(meta.expected_outcome) },
      "Notes": { rich_text: richText(meta.notes) },
      "Decision Date": { date: { start: String(item.due_date || (item.created_at ? String(item.created_at).slice(0,10) : new Date().toISOString().slice(0,10))) } },
      ...(meta.revisit_date ? { "Revisit Date": { date: { start: String(meta.revisit_date) } } } : {}),
    };

    case "priority": return {
      "Priority": { title: [{ text: { content: truncateText(item.title || "Untitled Priority", 200) } }] },
      "Week Start": { date: { start: String(meta.week_start || new Date().toISOString().slice(0, 10)) } },
      "Business Entity": { select: { name: entity } },
      "Category": { select: { name: mapCategory(String(item.category || "Operations"), "priority") } },
      "Status": { status: { name: mapStatus(String(item.status || "")) } },
      "Owner": { rich_text: richText(meta.owner) },
      "Notes": { rich_text: richText(item.body) },
    };

    case "blocker": return {
      "Blocker": { title: [{ text: { content: truncateText(item.title || "Untitled Blocker", 200) } }] },
      "Date Identified": { date: { start: String(item.due_date || meta.date_identified || new Date().toISOString().slice(0, 10)) } },
      "Business Entity": { select: { name: entity } },
      "Severity": { select: { name: ["Low","Medium","High","Critical"].includes(String(meta.severity)) ? String(meta.severity) : "Medium" } },
      "Impact Area": { select: { name: mapCategory(String(item.category || "Operations"), "blocker") } },
      "Resolution Owner": { rich_text: richText(meta.owner) },
      "Status": { status: { name: mapStatus(String(item.status || "")) } },
      "Resolution Notes": { rich_text: richText(item.body || meta.resolution_notes) },
    };

    case "monthly_review": return {
      "Review Month": { title: [{ text: { content: truncateText(item.title || "Monthly Review", 200) } }] },
      "Business Entity": { select: { name: entity } },
      "Status": { status: { name: mapStatus(String(item.status || "")) } },
      "Campaign Notes": { rich_text: richText(meta.campaign_notes) },
      "Lead Hygiene Notes": { rich_text: richText(meta.lead_hygiene_notes) },
      "Pipeline Notes": { rich_text: richText(meta.pipeline_notes) },
      "Content Notes": { rich_text: richText(meta.content_notes) },
      "Financial Notes": { rich_text: richText(meta.financial_notes) },
      "Operational Notes": { rich_text: richText(item.body || meta.operational_notes) },
      "Key Decisions": { rich_text: richText(meta.key_decisions) },
      "Next Month Priorities": { rich_text: richText(meta.next_month_priorities) },
    };

    case "quarterly_focus": return {
      "Strategic Focus": { title: [{ text: { content: truncateText(item.title || "Quarterly Focus", 200) } }] },
      "Quarter": { select: { name: mapQuarter(String(meta.quarter || "Q2")) } },
      "Business Entity": { select: { name: entity } },
      "Category": { select: { name: mapCategory(String(item.category || "Strategy"), "quarterly_focus") } },
      "Success Metric": { rich_text: richText(meta.success_metric) },
      "Status": { status: { name: mapStatus(String(item.status || "")) } },
      "Notes": { rich_text: richText(item.body || meta.notes) },
    };

    default: throw new Error(`Unknown item type: ${type}`);
  }
}

async function syncItem(item: Record<string, unknown>, sb: ReturnType<typeof createClient>): Promise<{ success: boolean; notionPageId?: string; error?: string }> {
  const type = String(item.item_type);
  if (!SYNCABLE_TYPES.includes(type)) {
    await sb.from("founder_os_items").update({ notion_sync_status: "skipped" }).eq("id", item.id);
    return { success: true };
  }
  const properties = buildProperties(item, type);
  const dbId = getDatabaseId(type);
  let notionPageId = item.notion_page_id as string | null;
  if (notionPageId) {
    await notionRequest("PATCH", `/pages/${notionPageId}`, { properties });
  } else {
    const notionResponse = await notionRequest("POST", "/pages", { parent: { database_id: dbId }, properties });
    notionPageId = notionResponse.id;
  }
  await sb.from("founder_os_items").update({
    notion_page_id: notionPageId,
    notion_sync_status: "synced",
    notion_last_synced_at: new Date().toISOString(),
    notion_sync_error: null,
  }).eq("id", item.id);
  return { success: true, notionPageId: notionPageId! };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const body = await req.json().catch(() => ({}));
  const { item_id } = body as { item_id?: string };

  try {
    if (item_id) {
      const { data: item, error } = await sb.from("founder_os_items").select("*").eq("id", item_id).single();
      if (error || !item) return Response.json({ success: false, error: "Item not found" }, { status: 404, headers: corsHeaders() });
      const result = await syncItem(item, sb);
      return Response.json(result, { headers: corsHeaders() });
    }

    const { data: items, error } = await sb
      .from("founder_os_items")
      .select("*")
      .in("item_type", SYNCABLE_TYPES)
      .in("notion_sync_status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) throw error;
    if (!items?.length) return Response.json({ success: true, synced: 0, failed: 0, message: "Nothing to sync" }, { headers: corsHeaders() });

    const results = await Promise.allSettled(items.map((item) => syncItem(item, sb)));
    let synced = 0, failed = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value.success) {
        synced++;
      } else {
        failed++;
        const errMsg = r.status === "rejected" ? String(r.reason) : String((r.value as { error?: string }).error);
        await sb.from("founder_os_items").update({ notion_sync_status: "failed", notion_sync_error: truncateText(errMsg, 500) }).eq("id", items[i].id);
      }
    }
    return Response.json({ success: true, synced, failed }, { headers: corsHeaders() });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("notion-sync error:", errMsg);
    if (item_id) await sb.from("founder_os_items").update({ notion_sync_status: "failed", notion_sync_error: truncateText(errMsg, 500) }).eq("id", item_id);
    return Response.json({ success: false, error: errMsg }, { status: 500, headers: corsHeaders() });
  }
});
