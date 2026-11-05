// Playbook's on/off switch: the shared Toggle (44px hit area, role="switch")
// with the V2 track colours — PB.live when on, the control fill when off.
// The focus ring comes from the Playbook CSS block ([role=switch]:focus-visible).
import type { ComponentProps } from 'react';
import Toggle from '../../../components/ui/Toggle';
import { PB } from '../../pbTheme';

const COLORS = { on: PB.live, off: PB.ctlBd };

export default function PbSwitch(props: Omit<ComponentProps<typeof Toggle>, 'colors'>) {
  return <Toggle {...props} colors={COLORS} />;
}
