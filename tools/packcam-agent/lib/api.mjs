// Talks to the packcam edge function with the agent key.
export function makeApi(cfg) {
  async function call(action, body) {
    const r = await fetch(cfg.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-packcam-agent': cfg.agent_key },
      body: JSON.stringify({ action, ...body }),
      signal: AbortSignal.timeout(30_000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || `server ${r.status}`);
    return d;
  }
  return {
    poll: (cursor, status) => call('agent_poll', { cursor, status }),
    report: clips => call('agent_report', { clips }),
  };
}
