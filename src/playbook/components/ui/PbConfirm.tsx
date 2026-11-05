// Playbook's confirm dialog: the shared ConfirmModal's props and behaviour
// (use it with `useConfirm()` from src/components/ui/ConfirmModal.tsx) in the
// V2 sheet (PbModal: dialog role, Tab trap, inert page, device Back = cancel,
// Escape through PlaybookApp's closeTopLayer). Focus starts on the SAFE
// button for a destructive question, so a stray Enter never deletes anything.
// Phone: stacked full-width buttons, confirm on top, 16px above Cancel.
import type { ComponentProps } from 'react';
import type ConfirmModal from '../../../components/ui/ConfirmModal';
import PbModal from '../product/PbModal';
import { useIsPhone } from '../../hooks/useIsPhone';
import { pbBody } from '../../pbTheme';
import PbButton from './PbButton';

type Props = ComponentProps<typeof ConfirmModal>;

export default function PbConfirm({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel }: Props) {
  const phone = useIsPhone();
  const confirm = <PbButton kind={danger ? 'danger' : 'primary'} block={phone} autoFocus={!danger} onClick={onConfirm}>{confirmLabel}</PbButton>;
  const cancel = <PbButton block={phone} autoFocus={danger} onClick={onCancel}>{cancelLabel}</PbButton>;
  return (
    <PbModal open={open} title={title} onClose={onCancel} width={440}
      footer={phone
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{confirm}{cancel}</div>
        : <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, flexWrap: 'wrap' }}>{cancel}{confirm}</div>}>
      {message ? <p style={{ ...pbBody, fontSize: 14, color: 'inherit', margin: 0, overflowWrap: 'anywhere' }}>{message}</p> : null}
    </PbModal>
  );
}
