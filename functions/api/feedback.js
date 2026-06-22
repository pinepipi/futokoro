// POST /api/feedback : 匿名フィードバックを Turnstile 検証して Slack へ転送する。
// 本文・IP は保存しない（転送して忘れる）。秘密は Cloudflare 環境変数だけに置く。
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  const message = String(body.message || "").trim().slice(0, 2000);
  const kind = String(body.kind || "その他").slice(0, 20);
  const token = String(body.token || "");
  if (!message) return json({ ok: false, error: "empty" }, 400);
  if (!token) return json({ ok: false, error: "no_token" }, 400);

  // 1) Turnstile 検証（secret は env のみ・コードに書かない）
  const ip = request.headers.get("CF-Connecting-IP") || "";
  let outcome;
  try {
    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET || "",
        response: token,
        remoteip: ip
      })
    });
    outcome = await verify.json();
  } catch {
    return json({ ok: false, error: "verify_failed" }, 502);
  }
  if (!outcome || outcome.success !== true) {
    return json({ ok: false, error: "turnstile" }, 403);
  }

  // 2) Slack Incoming Webhook へ転送（保存しない）
  //    Slack のメンション/リンク記法を無効化して通知荒らしを防ぐ（&<> をエスケープ）
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = `[${esc(kind)}] ${esc(message)}`.slice(0, 3000);
  try {
    const res = await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!res.ok) return json({ ok: false, error: "forward_failed" }, 502);
  } catch {
    return json({ ok: false, error: "forward_failed" }, 502);
  }

  return json({ ok: true });
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
