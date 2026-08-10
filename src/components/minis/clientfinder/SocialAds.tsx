// Find via Social Ads — Meta Ad Library keyword search: "which brands are
// running ads for <keyword> in <countries>?" Results are BRANDS (pages
// aggregated server-side), not individual ads. The Meta token lives in the
// server vault; admins paste it once in the settings box below.
// Coverage honesty: Meta guarantees ALL commercial ads via API only for
// EU/DSA countries — US/UK/India can come back thin, and the UI says so.
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call } from './api';
import { useAuth } from '../../../hooks/useAuth';
import { exportName, fileDate } from '../../../lib/exportName';

interface Brand { pageId: string; pageName: string; adCount: number; firstSeen: string; lastSeen: string; anyActive: boolean; platforms: string[]; samples: string[]; libraryUrl: string; pageUrl: string }

const COUNTRIES: { c: string; label: string; eu?: boolean }[] = [
  { c: 'GB', label: 'UK' }, { c: 'US', label: 'USA' }, { c: 'IN', label: 'India' },
  { c: 'DE', label: 'Germany', eu: true }, { c: 'FR', label: 'France', eu: true },
  { c: 'NL', label: 'Netherlands', eu: true }, { c: 'IE', label: 'Ireland', eu: true },
  { c: 'IT', label: 'Italy', eu: true }, { c: 'ES', label: 'Spain', eu: true },
  { c: 'CA', label: 'Canada' }, { c: 'AU', label: 'Australia' }, { c: 'AE', label: 'UAE' },
];
const d = (s: string) => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

export default function SocialAds({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const { profile } = useAuth();
  const isAdmin = (profile?.role as string) === 'admin';
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>(['GB', 'US']);
  const [activeOnly, setActiveOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [totalAds, setTotalAds] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => { call({ action: 'ads_status' }).then(({ data }) => setHasToken(!!(data as any)?.hasToken)).catch(() => setHasToken(false)); }, []);

  const saveToken = async () => {
    if (savingToken || !token.trim()) return;
    setSavingToken(true);
    try {
      const { status, data } = await call({ action: 'ads_set_token', token: token.trim() });
      if ((data as any)?.ok) { addToast('Meta token verified and saved', 'success'); setHasToken(true); setToken(''); }
      else addToast(String((data as any)?.details || (data as any)?.error || `Failed (${status})`), 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSavingToken(false);
  };

  const search = async () => {
    if (busy) return;
    if (!q.trim()) { addToast('Type a keyword — e.g. lehenga, salwar kameez', 'error'); return; }
    if (picked.length === 0) { addToast('Pick at least one country', 'error'); return; }
    setBusy(true); setError(''); setBrands(null);
    try {
      const { status, data } = await call({ action: 'ads_search', q: q.trim(), countries: picked, activeOnly });
      const r = data as any;
      if (!r?.ok) {
        if (r?.error === 'no_token') setError(isAdmin ? 'No Meta token yet — paste one in the settings box below.' : 'No Meta token configured — ask an admin to add it here.');
        else setError(String(r?.details || r?.error || `Search failed (${status})`));
      } else {
        setBrands(r.brands || []); setTotalAds(Number(r.totalAds || 0));
        for (const w of (r.warnings || [])) addToast(String(w), 'error');
        if ((r.brands || []).length === 0) setError('No ads matched. If you searched only US/UK/India: Meta’s API guarantees full commercial coverage only for EU countries — try adding Germany/France, or check the same search on facebook.com/ads/library.');
      }
    } catch (e) { setError(friendlyError(e)); }
    setBusy(false);
  };

  const exportXlsx = () => {
    if (!brands?.length) return;
    const rows = brands.map(b => [b.pageName, b.adCount, b.anyActive ? 'Yes' : 'No', d(b.firstSeen), d(b.lastSeen), b.platforms.join(', '), b.samples.join(' | '), b.libraryUrl, b.pageUrl]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['BRAND / PAGE', 'ADS', 'ACTIVE', 'FIRST SEEN', 'LATEST', 'PLATFORMS', 'SAMPLE AD TEXT', 'AD LIBRARY', 'FACEBOOK PAGE'], ...rows]), 'Social Ads');
    XLSX.writeFile(wb, exportName('Social-Ads', [q.trim(), picked.join('-'), fileDate()], 'xlsx'));
  };

  const chip = (on: boolean): React.CSSProperties => ({ ...S.btnGhost, ...S.btnSm, minHeight: 32, border: `1px solid ${on ? 'oklch(0.55 0.22 265 / .5)' : T.bd2}`, background: on ? T.ac3 : 'transparent', color: on ? T.ac2 : T.tx3, fontWeight: on ? 700 : 500 });

  return (
    <div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10, lineHeight: 1.5 }}>
        Search Meta&rsquo;s Ad Library by keyword — every brand actively advertising that product shows up, ranked by how many ads they run. Free API.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') search(); }}
          placeholder="Keyword — lehenga, salwar kameez, saree…" style={{ ...S.fInput, flex: 1, minWidth: 200 }} />
        <button onClick={search} disabled={busy || hasToken === false} style={{ ...S.btnPrimary, minHeight: 36, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy ? 'Searching…' : 'Search Ads'}</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
        {COUNTRIES.map(({ c, label }) => (
          <button key={c} onClick={() => setPicked(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])} style={chip(picked.includes(c))}>{label}</button>
        ))}
        <button onClick={() => setActiveOnly(a => !a)} title="Only ads running right now, or everything the library remembers" style={{ ...chip(activeOnly), marginLeft: 'auto' }}>{activeOnly ? 'Active ads only' : 'All ads (incl. stopped)'}</button>
      </div>
      <div style={{ fontSize: 10, color: T.tx3, marginBottom: 10 }}>
        Meta&rsquo;s API guarantees complete commercial coverage for EU countries; US / UK / India can return fewer non-political ads. Thin results there ≠ nobody advertising.
      </div>

      {error && <div style={{ background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{error}</div>}

      {brands && brands.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, color: T.tx2 }}><b>{brands.length}</b> brand{brands.length === 1 ? '' : 's'} from <b>{totalAds}</b> ads</div>
            <button onClick={exportXlsx} style={{ ...S.btnGhost, ...S.btnSm, color: T.gr, border: '1px solid oklch(0.72 0.19 145 / .2)', background: 'oklch(0.72 0.19 145 / .06)' }}>Export to Excel</button>
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.01)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead><tr>{['Brand / Page', 'Ads', 'Running', 'Latest ad', 'Platforms', ''].map(h => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {brands.map(b => (
                  <tr key={b.pageId}>
                    <td style={{ ...S.tdStyle, maxWidth: 240 }}>
                      <a href={b.pageUrl} target="_blank" rel="noreferrer" style={{ color: T.tx, fontWeight: 600, textDecoration: 'none' }}>{b.pageName}</a>
                      {b.samples[0] && <div style={{ fontSize: 10, color: T.tx3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.samples.join('\n\n')}>{b.samples[0]}</div>}
                    </td>
                    <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 700 }}>{b.adCount}</td>
                    <td style={S.tdStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.anyActive ? '#22C55E' : T.tx3, flexShrink: 0 }} />
                        <span style={{ fontSize: 11 }}>{b.anyActive ? 'Now' : 'Stopped'}</span>
                      </span>
                    </td>
                    <td style={{ ...S.tdStyle, fontSize: 11, whiteSpace: 'nowrap' }}>{d(b.lastSeen)}</td>
                    <td style={{ ...S.tdStyle, fontSize: 10 }}>{b.platforms.join(', ')}</td>
                    <td style={S.tdStyle}><a href={b.libraryUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: T.bl }}>View ads</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {brands && brands.length === 0 && !error && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No brands found for that search.</div>}

      {/* Token settings — admin pastes the Meta token once; stored server-side. */}
      {isAdmin && hasToken !== null && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.sora, color: T.tx, marginBottom: 2 }}>Meta connection</div>
          <div style={{ fontSize: 10.5, color: hasToken ? T.gr : T.yl, marginBottom: 8 }}>{hasToken ? '✓ Token saved — searches are live. Paste a new one anytime to rotate it.' : 'No token yet — paste a Meta access token to switch this finder on (guide in chat).'}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={token} onChange={e => setToken(e.target.value)} placeholder="EAAG… access token" type="password" style={{ ...S.fInput, flex: 1, minWidth: 200, fontFamily: T.mono }} />
            <button onClick={saveToken} disabled={savingToken || !token.trim()} style={{ ...S.btnPrimary, minHeight: 36, pointerEvents: savingToken ? 'none' : 'auto', opacity: savingToken || !token.trim() ? 0.5 : 1 }}>{savingToken ? 'Verifying…' : 'Verify & Save'}</button>
          </div>
        </div>
      )}
      {!isAdmin && hasToken === false && <div style={{ fontSize: 11, color: T.yl, marginTop: 12 }}>No Meta token configured yet — ask an admin to add it in this screen.</div>}
    </div>
  );
}
