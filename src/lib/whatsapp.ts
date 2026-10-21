// WhatsApp chat links for the app's "send on WhatsApp" buttons (Purchase
// Orders first; the Cash Challan / Cash Book copies stay as they are by owner
// decision). Render the link as a real <a href target="_blank">: a tapped
// anchor is the one way that reliably opens WhatsApp from the installed app —
// location.href used to throw people out of it (see CashBook).

/** 91 + 10 digits for wa.me, or null when it is not a usable mobile. A
 *  country code is dropped only when it IS one (12 digits starting 91, or a
 *  leading 0 trunk prefix) — a 10-digit number that starts with 91 is real. */
export function waPhone(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? '91' + d : null;
}

/** A chat with the text typed in; with no usable phone WhatsApp asks which chat. */
export const waLink = (text: string, phone?: string | null): string =>
  `https://wa.me/${waPhone(phone) ?? ''}?text=${encodeURIComponent(text)}`;
