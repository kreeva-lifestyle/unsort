// "Products already on this website" (Tags section, last tile): the button "Send tags and fields again" (owner,
// 20 Nov 2026: "Corrected tags and fields: these are not sent again by themselves"). They now follow a product by
// themselves whenever its category, tags or facts change; this button is for what that cannot see: this website's
// tag rules were changed, or someone edited products in Shopify. One tap counts the products first (nothing changes
// yet), a question says the number and what happens, then the server sends each one's product type, tags and custom
// fields again as Playbook has them now (pb-products factsSite.ts): no title, description, price, size or photo,
// and no AI. Safe to repeat. The twin of Pricing's "Update prices on Shopify": a secondary button (the page's
// gradient is Save changes), dimmed with the reason while the form holds unsaved changes, because the server reads
// the SAVED tag rules. A website that is switched off is refused by the server, in its own sentence.
import { useState } from 'react';
import { useConfirm } from '../../../../components/ui/ConfirmModal';
import { friendlyError } from '../../../../lib/friendlyError';
import type { AddToast } from '../../PbToasts';
import { resendWebsite, resentMessage } from '../../../data/websites';
import { pbMeta } from '../../../pbTheme';
import { PbButton, PbConfirm } from '../../ui';
import { Section } from '../ui';

/** `fields`: this website sends custom fields (Store profile). `send` is swapped for a fake by the screenshot harness. */
export default function ResendTile({ siteId, name, fields, dirty, addToast, send = resendWebsite }: {
  siteId: string; name: string; fields: boolean; dirty: boolean; addToast: AddToast; send?: typeof resendWebsite;
}) {
  const [busy, setBusy] = useState<'' | 'Checking…' | 'Sending…'>('');
  const { ask, modalProps } = useConfirm();
  const run = async () => {
    setBusy('Checking…');
    try {
      const d = await send(siteId, true);
      const none = () => addToast(`No product of ${name} is on Shopify yet, so there is nothing to send again`, 'info');
      // A website that is switched off gets no question: the send below is refused by the server, which says why.
      if (d.active !== false) {
        if (!d.listings) { none(); return; }
        const many = `${d.listings.toLocaleString('en-IN')} product${d.listings === 1 ? '' : 's'}`;
        if (!await ask({
          title: `Send tags and fields again to ${many} on ${name}?`,
          message: `On Shopify, each product’s ${fields ? 'product type, tags and custom fields' : 'product type and tags'} are set to what Playbook has now${fields ? '' : ' (custom fields are switched off for this website in Store profile)'}. `
            + 'Tags added in Shopify itself stay. Titles, descriptions, prices, sizes and photos are not touched, and the AI is not used. '
            + 'It takes about a minute or two per hundred products and carries on if you leave this page. It is safe to repeat.',
          confirmLabel: 'Send again',
        })) return;
        setBusy('Sending…');
      }
      const r = await send(siteId);
      if (r.listings) addToast(resentMessage(r.listings, r.paused), r.paused ? 'info' : 'success'); else none();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };
  return (
    <Section title="Products already on this website"
      hint="Tags and fields follow a product by themselves when its category, tags or facts change. Use this after you change this website’s tag rules, or after someone edited products in Shopify.">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <PbButton icon="refresh" onClick={() => void run()} busy={!!busy} busyLabel={busy} dim={dirty} aria-describedby={dirty ? 'pbt-resend-why' : undefined}>Send tags and fields again</PbButton>
        {dirty && <span id="pbt-resend-why" style={pbMeta}>Save your changes first.</span>}
      </div>
      <PbConfirm {...modalProps} />
    </Section>
  );
}
