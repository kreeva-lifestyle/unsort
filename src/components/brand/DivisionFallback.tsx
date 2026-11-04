// When Playbook cannot load (offline after a deploy) or crashes while
// rendering, the user must never be stuck there: the division is remembered,
// so a plain Reload would land on the same broken screen. This offers the way
// back to DailyWork as well as Reload. Shared (loaded eagerly) on purpose.
import { Component, type ReactNode } from 'react';
import { T, S } from '../../lib/theme';
import { setDivision } from '../../lib/division';
import { logError } from '../../lib/errorLogger';
import { PlaybookMark } from './DivisionLogos';

export function PlaybookUnavailable() {
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.rXl, padding: '28px 28px 24px', textAlign: 'center', maxWidth: 380 }}>
        <div style={{ display: 'inline-block', marginBottom: 12 }}><PlaybookMark size={44} decorative /></div>
        <p style={{ color: T.tx, fontSize: 14, fontWeight: 600, fontFamily: T.sora, margin: '0 0 6px' }}>Playbook couldn't open</p>
        <p style={{ color: T.tx3, fontSize: 12, margin: '0 0 18px', lineHeight: 1.5 }}>Check your internet connection and reload, or go back to DailyWork.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setDivision('dailywork')} style={{ ...S.btnPrimary, minHeight: 44 }}>Back to DailyWork</button>
          <button type="button" onClick={() => window.location.reload()} style={{ ...S.btnGhost, minHeight: 44 }}>Reload</button>
        </div>
      </div>
    </div>
  );
}

export class PlaybookBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    logError(error, 'boundary', { componentStack: info.componentStack || undefined });
  }
  render() { return this.state.failed ? <PlaybookUnavailable /> : this.props.children; }
}
