// "Find via Google" — a downloadable Python tool, not an in-app search.
//
// Scraping Google Maps needs a real browser (Playwright) driven from a real
// machine; it cannot run inside this web app or an edge function. So this
// panel is honest about the shape of the feature: it hands over the tool,
// explains how to run it, and says what comes out the other end.
import type { CSSProperties } from 'react';
import { T, S } from '../../../lib/theme';

// Served from public/tools/ — vite base is '/' (vite.config.ts:21).
const SCRIPT_URL = '/tools/boutique_leads.py';

const CITIES = ['Leicester UK', 'Southall London UK', 'Edison NJ USA', 'Artesia CA USA', 'Brampton Canada', 'Dubai UAE'];
const TERMS = ['indian clothing boutique', 'lehenga shop', 'desi fashion store', 'asian bridal wear', 'saree shop'];

const STEPS: [string, string][] = [
  ['Install Python 3', 'from python.org (tick "Add to PATH" on Windows)'],
  ['pip install playwright xlsxwriter', 'installs the two libraries the tool needs'],
  ['playwright install chromium', 'downloads the browser it drives (one time)'],
  ['python boutique_leads.py', 'runs all 6 cities — or --cities "Leicester UK" for one'],
];

const code: CSSProperties = {
  fontFamily: T.mono, fontSize: 11, color: T.tx,
  background: T.s2, border: `1px solid ${T.bd}`, borderRadius: 6, padding: '2px 6px',
};

export default function GoogleLeads() {
  return (
    <div>
      <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.6, marginBottom: 12 }}>
        Finds Indian ethnic wear boutiques abroad &mdash; potential wholesale clients &mdash; by
        searching Google Maps city by city, then visiting each boutique&rsquo;s own website for
        an email and Instagram handle. It runs as a small Python tool on your computer,
        because driving a real browser is something a web page cannot do.
      </div>

      <a
        href={SCRIPT_URL}
        download="boutique_leads.py"
        style={{ ...S.btnPrimary, display: 'inline-flex', alignItems: 'center', minHeight: 44, textDecoration: 'none' }}
      >
        Download boutique_leads.py
      </a>

      <div style={{ marginTop: 14 }}>
        <div style={S.fLabel}>How to run it</div>
        <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {STEPS.map(([cmd, why], i) => (
            <li key={i} style={{ fontSize: 11, color: T.tx2, lineHeight: 2 }}>
              <span style={code}>{cmd}</span>
              <span style={{ color: T.tx3 }}> &mdash; {why}</span>
            </li>
          ))}
        </ol>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={S.fLabel}>What it searches</div>
        <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.7, marginTop: 6 }}>
          Every combination of {TERMS.length} search terms across {CITIES.length} cities with big
          South Asian communities:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {CITIES.map(c => (
            <span key={c} style={{ ...code, color: T.ac2 }}>{c}</span>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {TERMS.map(t => (
            <span key={t} style={code}>{t}</span>
          ))}
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 8, lineHeight: 1.6 }}>
          Both lists live in a CONFIG block at the top of the file &mdash; open it in any text
          editor to add cities or terms. No other part needs touching.
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={S.fLabel}>What you get</div>
        <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.8, marginTop: 6 }}>
          One Excel file, <span style={code}>boutique_leads.xlsx</span>, with three sheets:
          <br />&bull; <b style={{ color: T.tx }}>Leads</b> &mdash; name, phone, email, Instagram, website,
          rating, reviews, address and a Maps link per boutique, deduplicated, with a
          Priority column (High = rated 4.0+, 20+ reviews, has a website).
          <br />&bull; <b style={{ color: T.tx }}>Summary</b> &mdash; lead counts per city and per search term.
          <br />&bull; <b style={{ color: T.tx }}>Failed</b> &mdash; websites that could not be reached, so
          nothing disappears silently.
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 8, lineHeight: 1.6 }}>
          Progress is saved after every city, so a stopped run continues with
          <span style={{ ...code, marginLeft: 4 }}>--resume</span> instead of starting over.
          A full 6-city run takes roughly 1&ndash;2 hours &mdash; the tool deliberately pauses
          2&ndash;5 seconds between actions to behave like a person browsing.
        </div>
      </div>

      {/* Same amber treatment as the folder-picker box: a caveat, not an error. */}
      <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 10, color: T.yl, lineHeight: 1.6, marginTop: 14 }}>
        Honest note: Google&rsquo;s terms don&rsquo;t permit automated access to Maps, so use this
        for your own business research and keep the built-in delays. Google may throttle it
        or change their page layout, which would need a small update to the tool. Emails are
        only collected from what boutiques publish on their own websites.
      </div>
    </div>
  );
}
