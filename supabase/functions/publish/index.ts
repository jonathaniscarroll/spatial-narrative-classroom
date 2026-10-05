import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data, error } = await sb.rpc("claim_publish");
  if (error) return json({ error: error.message }, 403);
  if (!data) return json({ error: "Published a moment ago. Wait 30 seconds." }, 429);

  const r = await fetch(`https://api.github.com/repos/${Deno.env.get("GITHUB_REPO")}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "spatial-narrative-classroom",
    },
    body: JSON.stringify({ event_type: "publish" }),
  });
  if (r.status !== 204) return json({ error: `GitHub dispatch failed (${r.status})` }, 502);
  return json({ ok: true });
});
