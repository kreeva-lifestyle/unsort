// The Minis tools that are just the back arrow + one component: Minis.tsx wraps each in the same page
// shell. Split out of Minis.tsx (grandfathered over the size limit) when Stitch Calculator was added
// (2026-11-15), so a new simple tool is one line here, not a line there.
import type { ReactNode } from 'react';
import type { MiniView } from './miniRegistry';
import { AddressPrinter, ReturnLabels, DropboxLinkGenerator, ForwardDropbox, OtpInbox, ProductCosting, DropboxUploader, ClientFinder, VendorStudio, SizeSummariser, Attendance, StitchCalculator } from './miniLazy';

type AddToast = (m: string, t?: string) => void;

/** `attendance`: whether this user may open Attendance (its own module permission on top of Minis). */
export function simpleMinis(addToast: AddToast, goHome: () => void, attendance: boolean): Partial<Record<MiniView, ReactNode>> {
  return {
    address: <AddressPrinter addToast={addToast} />, return_labels: <ReturnLabels addToast={addToast} />,
    dropbox_links: <DropboxLinkGenerator addToast={addToast} />, forward_dropbox: <ForwardDropbox addToast={addToast} onBack={goHome} />,
    otp: <OtpInbox addToast={addToast} />, costing: <ProductCosting addToast={addToast} />, dropbox_upload: <DropboxUploader addToast={addToast} />,
    client_finder: <ClientFinder addToast={addToast} />, ratecard: <VendorStudio addToast={addToast} />, size_summariser: <SizeSummariser addToast={addToast} />,
    stitch: <StitchCalculator />,
    ...(attendance ? { attendance: <Attendance /> } : {}),
  };
}
