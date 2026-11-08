// A textarea that grows with what is typed (mobile.md §8: no fixed height, so
// no half-cut last line). `single` keeps it one logical line, like an <input>
// that wraps: Enter submits the form and pasted line breaks become spaces.
import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string; onChange: (v: string) => void; single?: boolean;
};

export default function GrowArea({ value, onChange, single, style, onKeyDown, rows, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`; // + the 1px borders (box-sizing: border-box)
  }, [value]);
  return (
    <textarea ref={ref} value={value} rows={rows ?? (single ? 1 : 3)}
      onChange={e => onChange(single ? e.target.value.replace(/[\r\n]+/g, ' ') : e.target.value)}
      onKeyDown={e => {
        if (single && e.key === 'Enter') { e.preventDefault(); e.currentTarget.form?.requestSubmit(); return; }
        onKeyDown?.(e);
      }}
      // Single line: padding centres the first line at the control height (48 touch / 40 fine), as an input.
      style={{ ...style, ...(single ? { padding: 'calc((var(--pb-ctl-h) - 1.5em - 2px) / 2) 14px', overflowWrap: 'anywhere' } : null), resize: 'none', overflow: 'hidden' }}
      {...rest} />
  );
}
