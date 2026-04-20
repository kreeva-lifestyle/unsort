// Settings page — tab router for personal + admin sub-pages.
// "My Profile" is visible to every authenticated user so operators /
// cashiers can set their own Cash PIN (required for handover confirmation).
// Categories / Locations / Brands: manager+. Users / PackStation: admin.
import { useState } from 'react';
import { T } from '../lib/theme';
import MyProfileSettings from '../components/settings/MyProfile';
import CategoriesSettings from '../components/settings/Categories';
import LocationsSettings from '../components/settings/Locations';
import UsersSettings from '../components/settings/Users';
import BrandsSettings from '../components/settings/Brands';
import PackStationSettings from '../components/settings/PackStation';

export default function Settings({ profile, addToast }: { profile: any; addToast: (msg: string, type?: string) => void }) {
  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const canManage = isAdmin || isManager;
  const tabs = [{ id: 'myprofile', label: 'My Profile' }];
  if (canManage) tabs.push({ id: 'categories', label: 'Categories' }, { id: 'locations', label: 'Locations' }, { id: 'brands', label: 'Brands' });
  if (isAdmin) tabs.push({ id: 'users', label: 'Users' }, { id: 'packtime', label: 'PackStation' });
  const [tab, setTab] = useState('myprofile');
  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div className="settings-tabs" style={{ display: 'flex', gap: 3, marginBottom: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 2, width: 'fit-content', border: `1px solid ${T.bd}`, flexWrap: 'wrap', maxWidth: '100%', overflowX: 'auto' }}>
        {tabs.map(t => <div key={t.id} onClick={() => setTab(t.id)} style={{ padding: '6px 14px', borderRadius: 4, fontSize: 11, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', background: tab === t.id ? `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)` : 'transparent', color: tab === t.id ? '#fff' : T.tx3, transition: 'all .15s', whiteSpace: 'nowrap' }}>{t.label}</div>)}
      </div>
      {tab === 'myprofile' && <MyProfileSettings addToast={addToast} profile={profile} />}
      {tab === 'categories' && canManage && <CategoriesSettings addToast={addToast} profile={profile} />}
      {tab === 'locations' && canManage && <LocationsSettings addToast={addToast} canEdit={canManage} />}
      {tab === 'users' && isAdmin && <UsersSettings addToast={addToast} profile={profile} />}
      {tab === 'brands' && canManage && <BrandsSettings addToast={addToast} />}
      {tab === 'packtime' && isAdmin && <PackStationSettings addToast={addToast} />}
    </div>
  );
}
