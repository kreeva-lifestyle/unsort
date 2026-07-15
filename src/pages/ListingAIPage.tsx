// Listing AI page — thin wrapper so the module owns a main sidebar tab.
// The API key is managed in Settings → Listing AI, not here.
import { useNotifications } from '../hooks/useNotifications';
import ListingAI from '../components/listingai/ListingAI';

export default function ListingAIPage() {
  const { addToast } = useNotifications();
  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <ListingAI addToast={addToast} />
    </div>
  );
}
