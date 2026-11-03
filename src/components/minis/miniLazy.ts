// Every Minis tool as its own lazy chunk, fetched the first time it is tapped.
// Split out of Minis.tsx (grandfathered over the size limit). Opening the tab
// used to download and parse every tool (plus the Excel library) before the
// tile grid could paint — about 940 KB on the owner's phone.
import { retryImport } from '../../lib/retryImport';

export const AddressPrinter = retryImport(() => import('./AddressPrinter'));
export const CbazaarImport = retryImport(() => import('./CbazaarImport'));
export const OdetteImport = retryImport(() => import('./OdetteImport'));
export const OdetteCoverageCheck = retryImport(() => import('./OdetteCoverageCheck'));
export const IndyaImport = retryImport(() => import('./indya/IndyaImport'));
export const MasterLinkCheck = retryImport(() => import('./LinkCheck'));
export const Trackly = retryImport(() => import('./Trackly'));
export const ReturnLabels = retryImport(() => import('./ReturnLabels'));
export const VendorStudio = retryImport(() => import('./vendorstudio/VendorStudio'));
export const MasterAssistant = retryImport(() => import('../listingai/assistant/MasterAssistant'));
export const DropboxLinkGenerator = retryImport(() => import('./dropboxlinks/DropboxLinkGenerator'));
export const ForwardDropbox = retryImport(() => import('./forward/ForwardDropbox'));
export const ClientFinder = retryImport(() => import('./clientfinder/ClientFinder'));
export const DropboxUploader = retryImport(() => import('./uploader/DropboxUploader'));
export const ProductCosting = retryImport(() => import('./costing/ProductCosting'));
export const PriceProjector = retryImport(() => import('./pricing/PriceProjector'));
export const OtpInbox = retryImport(() => import('./OtpInbox'));
export const SizeSummariser = retryImport(() => import('./sizesummariser/SizeSummariser'));
export const Attendance = retryImport(() => import('../../pages/Attendance'));
