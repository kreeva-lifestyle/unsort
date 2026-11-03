// Flow (owner's ask, 2026-11-02): production pipelines on a canvas — the list
// of pipelines, or one pipeline's canvas. Device Back closes the canvas.
import { useState } from 'react';
import FlowList from '../components/flow/FlowList';
import FlowCanvas from '../components/flow/FlowCanvas';
import { useNotifications } from '../hooks/useNotifications';
import { useBackClose } from '../hooks/useBackClose';

export default function Flow({ active }: { active: boolean }) {
  const { addToast } = useNotifications();
  const [openId, setOpenId] = useState<string | null>(null);
  useBackClose(!!openId, () => setOpenId(null));
  if (openId) return <FlowCanvas id={openId} onBack={() => setOpenId(null)} addToast={addToast} />;
  return <FlowList active={active && !openId} onOpen={setOpenId} addToast={addToast} />;
}
