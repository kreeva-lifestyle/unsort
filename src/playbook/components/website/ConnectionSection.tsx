// Connection: name (part of the draft), store domain + credentials (write-only
// — sent to save_credentials, admin/manager only, never read back), Test
// connection and the Active switch (refused until the store has connected once).
// A new domain is never written from here: it goes with fresh credentials to
// save_credentials, which switches the site off, deletes the old store's
// secrets and re-queues its listings for the new store.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import Toggle from '../../../components/ui/Toggle';
import ConfirmModal, { useConfirm } from '../../../components/ui/ConfirmModal';
import type { AddToast } from '../PbToasts';
import type { PbAuthMode, PbWebsite } from '../../types';
import { cleanDomain, domainProblem, getWebsite, saveCredentials, sendMatchingProducts, sentMessage, setWebsiteActive, testConnection, type ConnectionResult } from '../../data/websites';
import { shortDate } from '../product/status';
import { Field, Grid2, Section, Seg, input44 } from './ui';
import type { Draft, SetDraft } from './WebsiteEditor';

const secretInput = { ...input44, fontFamily: T.mono };
const busy = (on: boolean) => ({ minHeight: 44, pointerEvents: on ? 'none' as const : 'auto' as const, opacity: on ? 0.5 : 1 });

export default function ConnectionSection({ site, draft, set, onSaved, addToast }: {
  site: PbWebsite; draft: Draft; set: SetDraft; onSaved: (w: PbWebsite) => void; addToast: AddToast;
}) {
  const [domain, setDomain] = useState(site.shop_domain);
  const [mode, setMode] = useState<PbAuthMode>(site.auth_mode);
  const [token, setToken] = useState('');
  const [cid, setCid] = useState('');
  const [csec, setCsec] = useState('');
  const [doing, setDoing] = useState<'' | 'save' | 'test' | 'active'>('');
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [err, setErr] = useState('');
  const { ask, modalProps } = useConfirm();
  const newDomain = cleanDomain(domain);
  const moving = newDomain !== site.shop_domain;

  const run = async (kind: 'save' | 'test') => {
    if (kind === 'test' && moving) { setErr('A new store domain needs its own credentials — fill them in and tap "Save credentials".'); return; }
    if (kind === 'save') {
      const bad = domainProblem(newDomain);
      if (bad) { setErr(bad); return; }
      // A new store keeps nothing of the old one, so the saved credentials cannot be reused.
      const keep = !moving && site.auth_mode === mode;
      if (mode === 'token' && !token.trim() && !keep) { setErr('Paste the Admin API access token (it starts with shpat_).'); return; }
      if (mode === 'client_credentials' && !keep && (!cid.trim() || !csec.trim())) { setErr('Enter both the client ID and the client secret.'); return; }
      if (moving && !(await ask({
        title: 'Move this website to another store?', confirmLabel: 'Move store', danger: true,
        message: `${site.name} will point at ${newDomain}. It is switched off, the saved credentials of ${site.shop_domain} are deleted, and every product listed on the old store is queued to be sent again as a new product to the new store. Products already on ${site.shop_domain} stay there.`,
      }))) return;
    }
    setDoing(kind); setErr(''); setResult(null);
    let ok = false;
    try {
      const creds = mode === 'token' ? { auth_mode: mode, access_token: token.trim() } : { auth_mode: mode, client_id: cid.trim(), client_secret: csec.trim() };
      const r = kind === 'save' ? await saveCredentials(site.id, moving ? { ...creds, shop_domain: newDomain } : creds) : await testConnection(site.id);
      ok = true; setResult(r); setToken(''); setCid(''); setCsec('');
      addToast(kind === 'save' ? `Credentials saved — connected to ${r.shop_name}` : `Connected to ${r.shop_name}`, 'success');
    } catch (e) {
      const m = friendlyError(e); setErr(m); addToast(m, 'error');
    } finally {
      setDoing('');
      // The edge function records the domain / connected_at / shop_name / last_error — read them back either way.
      try {
        const w = await getWebsite(site.id); onSaved(w);
        if (ok) setDomain(w.shop_domain);
        if (ok && moving && w.shop_domain !== newDomain) addToast('The store domain was not changed — try again, or ask an admin.', 'error');
      } catch (e) { addToast(friendlyError(e), 'error'); }
    }
  };

  const toggleActive = async () => {
    const next = !site.active;
    if (next && !site.connected_at) { setErr('Connect this store first — save the credentials and pass "Test connection".'); return; }
    setDoing('active'); setErr('');
    try {
      onSaved(await setWebsiteActive(site.id, next));
      if (!next) { addToast(`${site.name} is off — nothing new is sent`, 'success'); return; }
      // Routing runs per product, so the products already in the directory are sent from here.
      try { addToast(`${site.name} is on. ${sentMessage(site.name, await sendMatchingProducts(site.id))}`, 'success'); }
      catch (e2) { addToast(`${site.name} is on, but sending the products already in the directory failed: ${friendlyError(e2)} — use "Send matching products now" under Routing`, 'error'); }
    } catch (e) { const m = friendlyError(e); setErr(m); addToast(m, 'error'); } finally { setDoing(''); }
  };

  // Stock tracking also needs write_inventory — checked here too, so "all permissions are there" is never wrong.
  const missing = [...(result?.missing_scopes ?? [])];
  if (result?.scopes && draft.track_inventory && !result.scopes.includes('write_inventory') && !missing.includes('write_inventory')) missing.push('write_inventory');
  return (
    <>
      <Section title="Store">
        <Grid2>
          <Field label="Name" htmlFor="pbc-name">
            <input id="pbc-name" value={draft.name} onChange={e => set({ name: e.target.value })} maxLength={80} style={input44} />
          </Field>
        </Grid2>
      </Section>

      <Section title="Store & credentials" hint="Stored on the server only. They are never shown again — leave a box empty to keep what is saved.">
        <Field label="How the app signs in">
          <Seg label="Sign-in type" value={mode} onChange={setMode} options={[
            { id: 'client_credentials', label: 'Client ID + secret', hint: 'Dev Dashboard app (new apps, 2026+)' },
            { id: 'token', label: 'Access token', hint: 'Older custom app (shpat_…)' },
          ]} />
        </Field>
        <form onSubmit={e => { e.preventDefault(); void run('save'); }} autoComplete="off">
          <Field label="Store domain" htmlFor="pbc-domain" hint={moving ? 'A new store: enter its credentials too. Saving switches the site off and re-sends its products there.' : undefined}>
            <input id="pbc-domain" value={domain} onChange={e => setDomain(e.target.value)} maxLength={120} placeholder="my-store.myshopify.com"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ ...input44, fontFamily: T.mono }} />
          </Field>
          {mode === 'token' ? (
            <Field label="Admin API access token" htmlFor="pbc-tok" hint={!moving && site.auth_mode === 'token' && site.connected_at ? 'A token is saved. Paste a new one only to replace it.' : undefined}>
              <input id="pbc-tok" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="shpat_…" autoComplete="new-password" maxLength={500} style={secretInput} />
            </Field>
          ) : (
            <Grid2>
              <Field label="Client ID" htmlFor="pbc-cid">
                <input id="pbc-cid" value={cid} onChange={e => setCid(e.target.value)} autoComplete="off" spellCheck={false} maxLength={500}
                  placeholder={!moving && site.auth_mode === 'client_credentials' && site.connected_at ? 'Saved — type to replace' : ''} style={secretInput} />
              </Field>
              <Field label="Client secret" htmlFor="pbc-csec">
                <input id="pbc-csec" type="password" value={csec} onChange={e => setCsec(e.target.value)} autoComplete="new-password" maxLength={500}
                  placeholder={!moving && site.auth_mode === 'client_credentials' && site.connected_at ? 'Saved — type to replace' : ''} style={secretInput} />
              </Field>
            </Grid2>
          )}
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12, lineHeight: 1.5 }}>
            The app needs these permissions: write_products, read_products, write_publications, read_publications{draft.track_inventory ? ', write_inventory' : ''}. Only an admin or manager can save credentials.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" style={{ ...S.btnPrimary, ...busy(doing !== '') }}>{doing === 'save' ? 'Saving…' : 'Save credentials'}</button>
            <button type="button" onClick={() => void run('test')} disabled={moving} title={moving ? 'Save the credentials for the new store first' : undefined}
              style={{ ...S.btnGhost, ...busy(doing !== '' || moving) }}>{doing === 'test' ? 'Testing…' : 'Test connection'}</button>
          </div>
        </form>
        {result && (
          <div style={{ ...(missing.length ? S.warningBox : S.successBox), marginTop: 12, lineHeight: 1.5 }}>
            Connected to <strong>{result.shop_name}</strong>.
            {missing.length ? <> Missing permissions: <span style={{ fontFamily: T.mono }}>{missing.join(', ')}</span> — add them to the app in Shopify, reinstall it, then test again.</> : ' All needed permissions are there.'}
          </div>
        )}
        {site.last_error && !result && <div style={{ ...S.errorBox, marginTop: 12 }}>Last problem: {site.last_error}</div>}
        {site.connected_at && <div style={{ fontSize: 11, color: T.tx3, marginTop: 10 }}>Last connected {shortDate(site.connected_at)}{site.shop_name ? ` · ${site.shop_name}` : ''}</div>}
      </Section>

      <Section title="Active" hint="Off = nothing new is sent to this store (products already there stay). It can only be switched on after a successful connection."
        right={<span style={{ ...busy(doing === 'active'), display: 'inline-flex', alignItems: 'center' }}><Toggle on={site.active} onToggle={() => void toggleActive()} label={`${site.name} active`} /></span>}>
        <div style={{ fontSize: 12, color: site.active ? T.gr : T.tx3 }}>{site.active ? 'On — new and re-checked products that match are sent automatically.' : site.connected_at ? 'Off.' : 'Off — connect the store first.'}</div>
      </Section>
      {err && <div style={{ ...S.errorBox, marginBottom: 14 }}>{err}</div>}
      <ConfirmModal {...modalProps} />
    </>
  );
}
