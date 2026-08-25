-- WHY: the po_dummy_backup_20260811_* tables were the safety net taken before
-- purging the Purchase Order module's dummy data on 2026-08-11 (3 POs, 3
-- items, 6 receipts). The owner confirmed on 2026-08-25 that the live PO
-- data is correct (13 real POs / 17 items built since the purge), so the
-- net is no longer needed. Applied via MCP as drop_po_dummy_backups.
drop table if exists public.po_dummy_backup_20260811_receipts;
drop table if exists public.po_dummy_backup_20260811_items;
drop table if exists public.po_dummy_backup_20260811_pos;
