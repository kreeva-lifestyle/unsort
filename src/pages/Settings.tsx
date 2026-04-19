// Settings page — tab router for admin sub-pages
import { useState } from 'react';
import { T } from '../lib/theme';
import CategoriesSettings from '../components/settings/Categories';
import LocationsSettings from '../components/settings/Locations';
import UsersSettings from '../components/settings/Users';
import BrandsSettings from '../components/settings/Brands';
import PackStationSettings from '../components/settings/PackStation';

export default function Settings({ profile, addToast }: { profile: any; addToast: (msg: string, type?: string) => void }) {
  const [tab, setTab] = useState('categories');
  const isAdmin = profile?.role === 'admin';
  if (!isAdmin) return <div style={{ padding: 40, textAlign: 'center', color: '#4A5568', fontSize: 12 }}>Admin access required</div>;
  const tabs = [{ id: 'categories', label: 'Categories' }, { id: 'locations', label: 'Locations' }];
  if (isAdmin) tabs.push({ id: 'users', label: 'Users' });
  tabs.push({ id: 'brands', label: 'Brands' });
  tabs.push({ id: 'packtime', label: 'PackStation' });
  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 2, width: 'fit-content', border: `1px solid ${T.bd}`, flexWrap: 'wrap' }}>
        {tabs.map(t => <div key={t.id} onClick={() => setTab(t.id)} style={{ padding: '5px 14px', borderRadius: 4, fontSize: 10, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', background: tab === t.id ? `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)` : 'transparent', color: tab === t.id ? '#fff' : T.tx3, transition: 'all .15s' }}>{t.label}</div>)}
      </div>
      {tab === 'categories' && <CategoriesSettings addToast={addToast} profile={profile} />}
      {tab === 'locations' && <LocationsSettings addToast={addToast} canEdit={!!isAdmin} />}
      {tab === 'users' && <UsersSettings addToast={addToast} profile={profile} />}
      {tab === 'brands' && <BrandsSettings addToast={addToast} />}
      {tab === 'packtime' && <PackStationSettings addToast={addToast} />}
    </div>
  );
}
