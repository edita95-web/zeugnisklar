// ZeugnisKlar – Cloudflare Worker
// Serves the static site from /public and two API routes:
//   POST /api/check-key  -> is this license key valid, how many checks are left?
//   POST /api/analyze    -> analyse an Arbeitszeugnis (text, PDF or image)
//
// Nothing the user uploads is stored. The document only lives in memory for the
// duration of the request and is sent to the Claude API for the analysis.

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, OUTPUT_SCHEMA, LANGUAGES } from "./prompt.js";
import { MOCK_REPORT } from "./mock.js";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB after base64 decode
const MAX_TEXT_CHARS = 30000;
const ALLOWED_MEDIA = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/check-key" && request.method === "POST") {
      return handleCheckKey(request, env);
    }
    if (url.pathname === "/api/analyze" && request.method === "POST") {
      return handleAnalyze(request, env, ctx);
    }
    if (url.pathname === "/api/config") {
      return json({
        checkoutSingle: env.CHECKOUT_URL_SINGLE || "",
        checkoutFamily: env.CHECKOUT_URL_FAMILY || "",
        paymentsEnabled: paymentsEnabled(env),
      });
    }
    return env.ASSETS.fetch(request);
  },
};

// ---------- helpers ----------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function paymentsEnabled(env) {
  return (env.PAYMENTS || "polar") !== "off";
}

function polarBase(env) {
  return env.POLAR_SANDBOX === "true" ? "https://sandbox-api.polar.sh" : "https://api.polar.sh";
}

// Polar license key check. incrementUsage = 0 just checks, 1 uses up one check.
// Docs: https://polar.sh/docs/api-reference/customer-portal/license-keys/validate
async function polarValidate(env, key, incrementUsage) {
  const res = await fetch(`${polarBase(env)}/v1/customer-portal/license-keys/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key,
      organization_id: env.POLAR_ORGANIZATION_ID,
      increment_usage: incrementUsage,
    }),
  });
  if (res.status === 404) return { ok: false, reason: "invalid" };
  if (res.status === 400) return { ok: false, reason: "used_up" };
  if (!res.ok) return { ok: false, reason: "error" };
  const data = await res.json();
  const limit = data.limit_usage;
  const remaining = limit == null ? null : Math.max(0, limit - (data.usage || 0));
  return { ok: true, remaining };
}

async function checkLicense(env, key) {
  if (!paymentsEnabled(env)) return { ok: true, remaining: null };
  if (!key || typeof key !== "string" || key.length > 200) return { ok: false, reason: "invalid" };
  if (!env.POLAR_ORGANIZATION_ID) return { ok: false, reason: "not_configured" };
  const r = await polarValidate(env, key.trim(), 0);
  if (r.ok && r.remaining === 0) return { ok: false, reason: "used_up" };
  return r;
}

async function handleCheckKey(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  return json(await checkLicense(env, body.key));
}

// ---------- analysis ----------

async function handleAnalyze(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const lang = LANGUAGES[body.lang] ? body.lang : "de";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const file = body.file && typeof body.file === "object" ? body.file : null;

  if (!text && !file) return json({ error: "empty" }, 400);
  if (text.length > MAX_TEXT_CHARS) return json({ error: "too_long" }, 400);
  if (file) {
    if (!ALLOWED_MEDIA.has(file.type) || typeof file.data !== "string") {
      return json({ error: "file_type" }, 400);
    }
    if (file.data.length * 0.75 > MAX_FILE_BYTES) return json({ error: "file_size" }, 400);
  }

  const license = await checkLicense(env, body.key);
  if (!license.ok) return json({ error: "license", reason: license.reason }, 402);

  // The analysis can take a minute. We stream whitespace every few seconds so no
  // proxy closes the idle connection; JSON.parse ignores leading whitespace.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const keepAlive = setInterval(() => writer.write(enc.encode(" ")).catch(() => {}), 5000);

  const work = (async () => {
    let payload;
    try {
      const report = env.MOCK_AI === "true" ? MOCK_REPORT : await runClaude(env, { lang, text, file });
      if (paymentsEnabled(env) && report.is_arbeitszeugnis) {
        // Use up one check only after a successful analysis.
        await polarValidate(env, body.key.trim(), 1).catch(() => {});
      }
      payload = { report };
    } catch (err) {
      console.error("analyze failed", err && err.status, err && err.message);
      payload = { error: err && err.code ? err.code : "ai_error" };
    } finally {
      clearInterval(keepAlive);
    }
    await writer.write(enc.encode(JSON.stringify(payload)));
    await writer.close();
  })();

  // Keep the worker alive until the work is done.
  if (ctx && ctx.waitUntil) ctx.waitUntil(work);

  return new Response(readable, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function runClaude(env, { lang, text, file }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const content = [];
  if (file) {
    if (file.type === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: file.data },
      });
    } else {
      content.push({ type: "image", source: { type: "base64", media_type: file.type, data: file.data } });
    }
  }
  const zeugnisText = text ? `\n\n<arbeitszeugnis>\n${text}\n</arbeitszeugnis>` : "";
  content.push({
    type: "text",
    text: `ZIELSPRACHE: ${LANGUAGES[lang]}\n\nBitte analysiere dieses Arbeitszeugnis.${zeugnisText}`,
  });

  const params = {
    model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: env.ANTHROPIC_EFFORT || "medium",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: "user", content }],
  };

  let message;
  if (env.FALLBACKS !== "off") {
    // If the main model declines, the API re-runs the request on a fallback model.
    const stream = client.beta.messages.stream({
      ...params,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    message = await stream.finalMessage();
  } else {
    message = await client.messages.stream(params).finalMessage();
  }

  if (message.stop_reason === "refusal") {
    const e = new Error("refusal");
    e.code = "refusal";
    throw e;
  }
  if (message.stop_reason === "max_tokens") {
    const e = new Error("max_tokens");
    e.code = "ai_error";
    throw e;
  }
  const textBlock = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(textBlock);
  } catch {
    const e = new Error("bad_json");
    e.code = "ai_error";
    throw e;
  }
}
