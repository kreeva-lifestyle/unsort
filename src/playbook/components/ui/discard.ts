// The one "Discard changes?" question (mobile.md §6, copy-and-a11y.md §B3):
// a sheet with typing in it, or a product page with edited Facts, asks this
// before ×, Escape, device Back or a nav tap drops the typing. Name the thing
// in the title ("Discard this product?", "Discard changes to this listing?").
import type { ConfirmOptions } from '../../../components/ui/ConfirmModal';

export const DISCARD_TITLE = 'Discard changes?';

export const discardAsk = (title: string = DISCARD_TITLE): ConfirmOptions => ({
  title, message: 'What you typed here will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', danger: true,
});
