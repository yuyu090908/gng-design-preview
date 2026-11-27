// NIGHT AI（Supabase Edge Function）
//
// サイトのブラウザから呼ばれ、Claude API で次の処理を行う。API キーはこの関数の環境変数だけに置き、ブラウザには渡さない。
//   search    … 自然文の検索を「条件」に変換するだけ（店舗名や評価は AI に作らせない。検索そのものは DB の実データで行う）
//   summary   … 口コミの要約（公開中の口コミが 3 件以上のときだけ。結果はキャッシュし、引用した口コミの id を必ず付ける）
//   translate … 投稿の翻訳（原文が変わるまでキャッシュを使い回す）
//   moderate  … 新しい投稿・コメントの審査補助（DB の Webhook から呼ぶ。運営の確認待ちに並べるだけで、自動で非表示にはしない）
//
// 必要な環境変数（Supabase の Edge Function Secrets）
//   ANTHROPIC_API_KEY          Claude API のキー
//   MODERATION_WEBHOOK_SECRET  審査補助の Webhook が送る合言葉（任意の長い文字列）
//   ALLOWED_ORIGINS            呼び出しを許可するサイトの URL（カンマ区切り）
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で設定する
//
// デプロイ：supabase functions deploy night-ai
import Anthropic from "npm:@anthropic-ai/sdk";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { z } from "npm:zod";

const MODEL = "claude-opus-5-5";
const LANGS = ["ja", "en", "th", "ko", "zh-Hans", "zh-Hant"] as const;
const LANG_NAME: Record<string, string> = { ja: "Japanese", en: "English", th: "Thai", ko: "Korean", "zh-Hans": "Simplified Chinese", "zh-Hant": "Traditional Chinese" };

const env = (k: string) => Deno.env.get(k) ?? "";
const SB_URL = env("SUPABASE_URL");
const ANON = env("SUPABASE_ANON_KEY");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
const ORIGINS = env("ALLOWED_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean);
const client = new Anthropic(); // ANTHROPIC_API_KEY を環境変数から読む

class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }

// ---------- Supabase（PostgREST）への呼び出し ----------
async function pg(path: string, init: RequestInit & { as?: string } = {}) {
  const token = init.as ?? SERVICE;
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: token === SERVICE ? SERVICE : ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=minimal", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    const m = text.match(/"message"\s*:\s*"([^"]+)"/);
    throw new HttpError(res.status === 401 ? 401 : 400, m?.[1] ?? `db_${res.status}`);
  }
  return text ? JSON.parse(text) : null;
}
// 利用回数を 1 回分確保する（利用者の JWT のまま呼ぶので、本人ごとの上限が効く）
const take = (kind: string, userJwt: string) => pg("rpc/ai_take", { method: "POST", body: JSON.stringify({ p_kind: kind }), as: userJwt || ANON });
async function logUsage(userId: string | null, kind: string, usage: { input_tokens?: number; output_tokens?: number } | null, cached = false) {
  await pg("ai_usage", { method: "POST", body: JSON.stringify({ user_id: userId, kind, input_tokens: usage?.input_tokens ?? 0, output_tokens: usage?.output_tokens ?? 0, cached }) }).catch(() => {});
}
async function userIdOf(jwt: string): Promise<string | null> {
  if (!jwt) return null;
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } });
  if (!res.ok) return null;
  return (await res.json())?.id ?? null;
}
async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Claude ----------
// 安全のため refusal（安全上の理由で応答しない）を確認してから結果を使う。
async function ask<T extends z.ZodTypeAny>(schema: T, system: string, user: string, effort: "low" | "medium" = "low", maxTokens = 2000) {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort, format: zodOutputFormat(schema) },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], // 固定の指示はキャッシュする
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") throw new HttpError(422, "ai_declined");
  if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new HttpError(502, "ai_incomplete");
  return { data: response.parsed_output as z.infer<T>, usage: response.usage };
}

// ---------- search：自然文 → 検索条件 ----------
const SearchFilters = z.object({
  country: z.string().nullable().describe("ISO 3166-1 alpha-2 country code, or null"),
  city: z.string().nullable().describe("city slug from the list, or null"),
  area: z.string().nullable().describe("area slug from the list, or null"),
  category: z.enum(["bar", "club", "karaoke", "cabaret", "soapland", "delivery", "massage", "restaurant", "other"]).nullable(),
  budget_amount: z.number().nullable(),
  budget_currency: z.string().nullable().describe("ISO 4217 code such as THB, JPY, KRW"),
  beginner: z.boolean(),
  calm: z.boolean(),
  high_rated: z.boolean(),
  recent_reviews: z.boolean(),
  events_today: z.boolean(),
  keywords: z.array(z.string()).describe("other short search words, at most 5"),
  out_of_scope: z.boolean().describe("true if the request asks for anything illegal, involving minors, drugs, or harm"),
});
async function search(q: string, regions: string) {
  const system = `You convert a nightlife search request from a guide website into search filters. You never recommend or name venues yourself; the website searches its own data with your filters.
Use only these city and area slugs (format: country:city[area,area]):
${regions}
If the request asks for anything illegal, involving minors, drugs, or harm to anyone, set out_of_scope to true and leave the other fields empty.`;
  return ask(SearchFilters, system, q.slice(0, 500));
}

// ---------- summary：口コミの要約 ----------
const Summary = z.object({
  good: z.array(z.string()).describe("points reviewers praise, each under 60 characters, at most 4"),
  improve: z.array(z.string()).describe("points reviewers want improved, each under 60 characters, at most 4"),
  price: z.string().describe("what the reviews say about price; empty if they say nothing"),
  trend: z.string().describe("how recent reviews differ from older ones; empty if there is no clear difference"),
  beginner: z.string().describe("whether reviewers describe it as easy for first-time visitors; empty if no review mentions it"),
  cited_ids: z.array(z.string()).describe("ids of the reviews the summary is based on"),
});
async function summarize(target: string, lang: string, userJwt: string, userId: string | null) {
  const [rs] = await pg(`review_summary?target=eq.${encodeURIComponent(target)}&select=review_count,last_review_at`);
  if (!rs || rs.review_count < 3) return { status: "insufficient", review_count: rs?.review_count ?? 0 };
  const [cached] = await pg(`ai_summaries?target=eq.${encodeURIComponent(target)}&lang=eq.${lang}&select=*`);
  if (cached && cached.review_count === rs.review_count && cached.last_review_at === rs.last_review_at) {
    await logUsage(userId, "summary", null, true);
    return { status: "ok", ...cached };
  }
  await take("summary", userJwt);
  const col = /^[0-9a-f-]{36}$/.test(target) ? "venue_id" : "article_path";
  const reviews = await pg(`post_feed?${col}=eq.${encodeURIComponent(target)}&type=eq.review&status=eq.published&select=id,body,ratings,spend_amount,spend_currency,published_at,is_verified&order=published_at.desc&limit=60`);
  const text = reviews.map((r: Record<string, unknown>) => JSON.stringify({ id: r.id, date: String(r.published_at).slice(0, 10), verified: r.is_verified, ratings: r.ratings, spend: r.spend_amount ? `${r.spend_amount} ${r.spend_currency}` : null, text: r.body })).join("\n");
  const system = `You summarize visitor reviews of a nightlife venue for a guide website. Use only what the reviews say; never add facts, prices or opinions that are not in them. If the reviews do not mention something, leave that field empty. Do not describe or rate any person (staff or guests). Write in ${LANG_NAME[lang]}.`;
  const { data, usage } = await ask(Summary, system, `Reviews (one JSON object per line):\n${text}`, "medium", 3000);
  const ids = new Set(reviews.map((r: { id: string }) => r.id));
  data.cited_ids = data.cited_ids.filter((id) => ids.has(id));
  const row = { target, lang, summary: data, review_count: rs.review_count, last_review_at: rs.last_review_at, model: MODEL, generated_at: new Date().toISOString() };
  await pg("ai_summaries?on_conflict=target,lang", { method: "POST", body: JSON.stringify(row), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
  await logUsage(userId, "summary", usage);
  return { status: "ok", ...row };
}

// ---------- translate：投稿の翻訳 ----------
const Translation = z.object({ title: z.string(), body: z.string() });
async function translate(postId: string, lang: string, userJwt: string, userId: string | null) {
  // 利用者の権限で読む（見えない投稿は翻訳しない）
  const [p] = await pg(`post_feed?id=eq.${postId}&select=id,title,body,status`, { as: userJwt || ANON });
  if (!p || p.status !== "published") throw new HttpError(404, "post_not_found");
  const hash = await sha256(`${p.title ?? ""}\n${p.body}`);
  const [cached] = await pg(`post_translations?post_id=eq.${postId}&lang=eq.${lang}&select=title,body,source_hash`);
  if (cached && cached.source_hash === hash) { await logUsage(userId, "translate", null, true); return { title: cached.title, body: cached.body, cached: true }; }
  await take("translate", userJwt);
  const system = `Translate a community post from a nightlife guide website into ${LANG_NAME[lang]}. Keep the meaning, tone, numbers, prices and place names. Do not add, remove or soften content. Return the title (empty if there is none) and the body.`;
  const { data, usage } = await ask(Translation, system, JSON.stringify({ title: p.title ?? "", body: p.body }), "low", 4000);
  await pg("post_translations?on_conflict=post_id,lang", { method: "POST", body: JSON.stringify({ post_id: postId, lang, title: data.title, body: data.body, source_hash: hash, model: MODEL }), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
  await logUsage(userId, "translate", usage);
  return { ...data, cached: false };
}

// ---------- moderate：審査補助（Webhook） ----------
const Moderation = z.object({
  labels: z.array(z.enum(["spam", "advertising", "personal_info", "harassment", "illegal_solicitation", "minors", "drugs", "threat", "fake_review", "non_consensual"])),
  score: z.number().describe("0 to 1: how likely the text breaks the rules"),
  reason: z.string().describe("one short sentence in Japanese"),
});
async function moderate(type: "post" | "comment", id: string) {
  const table = type === "post" ? "community_posts" : "post_comments";
  const [row] = await pg(`${table}?id=eq.${id}&select=${type === "post" ? "title,body" : "body"}`);
  if (!row) return { skipped: true };
  const system = `You help human moderators of a nightlife community for adults (18+). Flag text that may break these rules: no advertising or spam; no information that identifies a private person (names, faces, contacts, social accounts); no harassment, threats or discrimination; no soliciting or arranging illegal services; nothing involving minors; no drugs; no fake reviews; no photos or descriptions shared without consent. Ordinary reviews, prices and opinions about venues are allowed. You only flag; humans decide.`;
  const { data, usage } = await ask(Moderation, system, JSON.stringify(row), "low", 500);
  await logUsage(null, "moderate", usage);
  if (data.score >= 0.6 && data.labels.length) {
    await pg("moderation_flags?on_conflict=target_type,target_id", { method: "POST", body: JSON.stringify({ target_type: type, target_id: id, labels: data.labels, score: Math.min(1, Math.max(0, data.score)), reason: data.reason.slice(0, 500), model: MODEL }), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
  }
  return { flagged: data.score >= 0.6 };
}

// ---------- 入口 ----------
function cors(origin: string | null) {
  const ok = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0] ?? "";
  return { "Access-Control-Allow-Origin": ok, "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
}
Deno.serve(async (req) => {
  const h = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method" }), { status: 405, headers: h });
  try {
    const body = await req.json().catch(() => ({}));
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const userJwt = jwt && jwt !== ANON ? jwt : "";
    const lang = LANGS.includes(body.lang) ? body.lang : "ja";
    let out: unknown;
    if (body.action === "moderate" || req.headers.has("x-webhook-secret")) {
      if (!env("MODERATION_WEBHOOK_SECRET") || req.headers.get("x-webhook-secret") !== env("MODERATION_WEBHOOK_SECRET")) throw new HttpError(401, "forbidden");
      const rec = body.record ?? {};
      out = await moderate(body.table === "post_comments" ? "comment" : "post", String(rec.id ?? ""));
    } else {
      const userId = await userIdOf(userJwt);
      if (body.action === "search") {
        if (typeof body.q !== "string" || !body.q.trim()) throw new HttpError(400, "empty_query");
        await take("search", userJwt);
        const cities = await pg("cities?select=slug,country_code,areas(slug)&order=id");
        const regions = cities.map((c: { slug: string; country_code: string; areas: { slug: string }[] }) => `${c.country_code}:${c.slug}[${c.areas.map((a) => a.slug).join(",")}]`).join("\n");
        const { data, usage } = await search(body.q, regions);
        await logUsage(userId, "search", usage);
        out = { filters: data, model: MODEL };
      } else if (body.action === "summary" && typeof body.target === "string") out = await summarize(body.target.slice(0, 300), lang, userJwt, userId);
      else if (body.action === "translate" && /^[0-9a-f-]{36}$/.test(body.post_id ?? "")) out = await translate(body.post_id, lang, userJwt, userId);
      else throw new HttpError(400, "invalid_action");
    }
    return new Response(JSON.stringify(out), { headers: h });
  } catch (e) {
    if (e instanceof HttpError) return new Response(JSON.stringify({ error: e.code }), { status: e.status, headers: h });
    if (e instanceof Anthropic.RateLimitError) return new Response(JSON.stringify({ error: "ai_busy" }), { status: 429, headers: h });
    if (e instanceof Anthropic.APIError) return new Response(JSON.stringify({ error: "ai_unavailable" }), { status: 502, headers: h });
    console.error(e);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500, headers: h });
  }
});
