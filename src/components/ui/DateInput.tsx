// Reusable date / time / month field — the single responsive implementation
// every date picker in the app uses. It centralizes:
//   • the `S.fDate` recipe (theme.tsx),
//   • the iOS-WebKit normalization (appearance:none + min/max-width) that lives
//     globally in index.css so native controls never overflow or render the grey
//     segmented spinner, and
//   • one-tap picker opening — tapping anywhere calls showPicker() so the user
//     gets the calendar immediately instead of editing day/month/year segments.
// Per-call layout (e.g. `width:'100%'`, `opacity`) is passed via `style` and
// merged over the recipe. All native <input> props pass straight through.
import { forwardRef } from 'react';
import { S } from '../../lib/theme';

type DateInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  type?: 'date' | 'time' | 'datetime-local' | 'month' | 'week';
};

const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { type = 'date', style, onClick, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      style={{ ...S.fDate, ...style }}
      onClick={(e) => {
        // One tap → native picker. Guarded: throws if unsupported (older
        // Safari) or already open; the field still opens its own picker then.
        try {
          (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
        } catch { /* fall back to the browser's default tap-to-open */ }
        onClick?.(e);
      }}
      {...rest}
    />
  );
});

export default DateInput;
