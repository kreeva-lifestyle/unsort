// Dashboard: what is wrong right now, said above the numbers (pre-launch
// check, 2026-11-13, D8: "nobody is told when something breaks"). Each is a
// tinted banner like the paused one (DashStates), with one button to the
// place that fixes it. Shown only while it is true:
//   stalled   work is waiting, automation is on, and the worker has not run
//             for 10 minutes (it runs every minute while there is work);
//   limit     today's AI limit is used up: writing waits for tomorrow or a
//             higher limit (vendor posts are still read);
//   store     a website whose last contact with Shopify failed (a rejected
//             key, a missing permission, a frozen store);
//   noted     published listings that carry a note (a photo Shopify could
//             not process, a field it refused…), with the list one tap away;
//   telegram  the bot is out of the admin group or cannot read it, or
//             forwarded posts never arrived (pre-launch fix D20: these were
//             silent, and whole nights of vendor posts were lost).
// Where a message is sent when nobody is looking at this page (Telegram,
// phone) is the owner's decision and is not built here.
import type { ReactNode } from 'react';
import { PB, pbBody } from '../../pbTheme';
import { istRelative } from '../../format';
import { Dot, rupees } from '../product/status';
import { PbButton, PbTile } from '../ui';
import { count, stalled, waitingWork, type DashData, type DashGo } from './dashShared';

function Banner({ id, tone, title, children, button, onOpen }: { id: string; tone: 'review' | 'failed'; title: string; children: ReactNode; button: string; onOpen: () => void }) {
  return (
    <PbTile variant={tone} as="section" span={12} aria-labelledby={id}
      style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 'var(--pb-pad-tile)' }}>
      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 id={id} style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
          <Dot color={tone === 'failed' ? PB.failed : PB.review} label={title} style={{ fontSize: 13, color: PB.tx, fontWeight: 600, whiteSpace: 'normal' }} />
        </h2>
        <p style={{ ...pbBody, margin: 0, color: PB.tx2, overflowWrap: 'anywhere' }}>{children}</p>
      </div>
      <PbButton onClick={onOpen}>{button}</PbButton>
    </PbTile>
  );
}

export default function DashAlerts({ d, go }: { d: DashData; go: DashGo }) {
  const waiting = waitingWork(d);
  const broken = d.sites.filter(s => s.last_error);
  const over = d.limit > 0 && d.spentToday != null && d.spentToday >= d.limit;
  return (
    <>
      {stalled(d) && (
        <Banner id="pb-dash-stalled" tone="failed" button="Open Settings" onOpen={() => go('settings')}
          title={`Automation last ran ${istRelative(d.lastRun)}, and ${count(waiting)} ${waiting === 1 ? 'item is' : 'items are'} waiting`}>
          It runs every minute while there is work. Open Settings and tap Run now. If nothing moves after that, the scheduler has stopped: tell the developer.
        </Banner>
      )}
      {over && (
        <Banner id="pb-dash-limit" tone="review" button="Open Settings" onOpen={() => go('settings')} title="Today’s AI limit is used up">
          The AI has cost {rupees(d.spentToday ?? 0)} today (limit {rupees(d.limit)}). Nothing more is written until tomorrow, or a higher limit. Vendor posts are still read, and sending to Shopify goes on.
        </Banner>
      )}
      {d.telegram && (
        <Banner id="pb-dash-telegram" tone="failed" button="Open Settings" onOpen={() => go('settings')} title="Telegram: vendor posts are not coming in">
          {d.telegram}
        </Banner>
      )}
      {broken.slice(0, 3).map(s => (
        <Banner key={s.id} id={`pb-dash-store-${s.id}`} tone="failed" button="Open Websites" onOpen={() => go('websites')} title={`${s.name}: connection problem`}>
          {s.last_error}
        </Banner>
      ))}
      {broken.length > 3 && (
        <Banner id="pb-dash-store-more" tone="failed" button="Open Websites" onOpen={() => go('websites')} title={`${count(broken.length - 3)} more ${broken.length - 3 === 1 ? 'website has' : 'websites have'} a connection problem`}>
          Each website’s Connection tab says what Shopify answered.
        </Banner>
      )}
      {d.noted > 0 && (
        <Banner id="pb-dash-noted" tone="review" button="See them" onOpen={() => go('products', { status: 'l:warn' })}
          title={`${count(d.noted)} published ${d.noted === 1 ? 'listing carries' : 'listings carry'} a note`}>
          Published, but something was left out: a photo Shopify could not process, a field the store refused, or no stock yet on a Track-stock website. Each listing says what.
        </Banner>
      )}
    </>
  );
}
