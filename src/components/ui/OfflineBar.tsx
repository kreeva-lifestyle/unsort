import { useState, useEffect } from 'react';

export default function OfflineBar() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [show, setShow] = useState(!navigator.onLine);

  useEffect(() => {
    const goOff = () => { setOffline(true); setShow(true); };
    const goOn = () => {
      setOffline(false);
      setTimeout(() => setShow(false), 2000);
    };
    window.addEventListener('offline', goOff);
    window.addEventListener('online', goOn);
    return () => { window.removeEventListener('offline', goOff); window.removeEventListener('online', goOn); };
  }, []);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
      background: offline ? '#EF4444' : '#22C55E',
      color: '#fff', textAlign: 'center',
      fontSize: 11, fontWeight: 600, padding: '6px 0',
      transition: 'all .3s ease',
      transform: show ? 'translateY(0)' : 'translateY(-100%)',
    }}>
      {offline ? 'No internet connection' : 'Back online'}
    </div>
  );
}
