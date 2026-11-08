// Helper text under "Telegram channel" in the vendor sheet: what typing a
// channel does, and — for the channel already saved — its daily check time
// and when it was last checked (VendorTg's words).
import { normalizeTgChannel } from '../../data/vendors';
import { istRelative } from '../../format';
import { PB, pbNum } from '../../pbTheme';
import type { PbVendor } from '../../types';
import type { VendorFormState } from './VendorForm';
import { dailyWords } from './VendorTg';

export type SavedTg = Pick<PbVendor, 'active' | 'tg_username' | 'tg_title' | 'tg_slot_minute' | 'tg_checked_at'>;

export default function VendorTgHint({ form, saved }: { form: VendorFormState; saved?: SavedTg }) {
  const typed = normalizeTgChannel(form.tg);
  const value = 'value' in typed ? typed.value : null;
  const same = !!saved?.tg_username && value === saved.tg_username;
  return (
    <>
      Optional — e.g. <span style={pbNum}>@kumari_art</span> or a t.me link. Its posts come in as this vendor’s products.
      {same && saved ? (
        <>
          {' '}<span style={{ color: PB.tx }}>{dailyWords(saved).replace(/^./, c => c.toUpperCase())}</span>
          {' · '}{saved.tg_checked_at ? `last checked ${istRelative(saved.tg_checked_at)}` : 'not checked yet'}.
          {saved.tg_title && <> Channel found: <span style={{ color: PB.tx }}>{saved.tg_title}</span>.</>}
        </>
      ) : value ? (
        <> When you save, Playbook gives it its own daily check time. New posts come in at that check; older posts are not copied. If the channel is private, join it from the staff account.</>
      ) : null}
    </>
  );
}
