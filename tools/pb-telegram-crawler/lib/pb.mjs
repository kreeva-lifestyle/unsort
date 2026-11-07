// Talks to the Playbook pb-telegram function with the crawler key.
//   config()        → { group_chat_id, group_title, channels: [...] }
//   progress(body)  → stores version, error and per-channel cursors
export function makePb({ url, key, fetchImpl = fetch, timeoutMs = 20_000 }) {
  async function call(action, body = {}) {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-crawler-key': key },
        body: JSON.stringify({ action, ...body }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const err = new Error(`Playbook could not be reached (${action}): ${e.message}`);
      err.pbNetwork = true;
      throw err;
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* not JSON: shown below */ }
    if (!res.ok) {
      const why = (data && (data.error || data.message)) || text.slice(0, 200) || res.statusText;
      const err = new Error(res.status === 401 || res.status === 403
        ? `Playbook refused the crawler key (${res.status}) — create a new key in Playbook Settings → Telegram and update PB_CRAWLER_KEY`
        : `Playbook ${action} failed (${res.status}): ${why}`);
      err.status = res.status;
      throw err;
    }
    return data || {};
  }
  return {
    config: () => call('crawler_config'),
    progress: body => call('crawler_progress', body),
  };
}
