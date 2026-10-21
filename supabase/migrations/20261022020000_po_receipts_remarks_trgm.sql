-- PO search: a trigram index on receipt remarks.
--
-- Why: search_po_ids (20261022010000) also matches purchase_order_receipts.remarks
-- with ilike '%…%', because every challan booked before the challan_no column
-- existed was typed into Remarks. Without this index each PO search scans every
-- receipt; remarks only grow. Partial (most receipts have no remarks).
create index if not exists idx_po_receipts_remarks_trgm on public.purchase_order_receipts using gin (remarks gin_trgm_ops) where remarks is not null;
