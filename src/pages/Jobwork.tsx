// Jobwork — work given to outside jobworkers (its own module, below
// Purchase Orders). The page owns only the frame; the list, job pages and
// sheets live in components/jobwork/.
import { useNotifications } from '../hooks/useNotifications';
import Jobwork from '../components/jobwork/Jobwork';

export default function JobworkPage() {
  const { addToast } = useNotifications();
  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <Jobwork addToast={addToast} />
    </div>
  );
}
