# UNSORT - Project Context for Claude Code

## Project Overview
**Name:** Unsort
**URL:** https://unsort.aryadesigns.co.in
**Purpose:** Track damaged and unsorted products with component-level tracking for Arya Designs
**GitHub:** https://github.com/kreeva-lifestyle/unsort

---

## Tech Stack
- **Frontend:** React 18 + TypeScript + Vite
- **Backend/Database:** Supabase (PostgreSQL)
- **Hosting:** GitHub Pages
- **Auth:** Supabase Auth (email/password)

---

## Supabase Configuration
```
Project URL: https://ulphprdnswznfztawbvg.supabase.co
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGhwcmRuc3d6bmZ6dGF3YnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjE4NzYsImV4cCI6MjA4OTkzNzg3Nn0.RRNY3KQhYnkJzSfh-GRoTCgdhDQNhE7kJJrpTq2n_K0
Region: South Asia (Mumbai)
```

---

## Database Schema

> **⚠️ This section is historical and may be outdated.**
> The authoritative schema lives in DATABASE-SCHEMA.md and is derived from the live Supabase instance.
> TypeScript types in src/types/database.ts match DATABASE-SCHEMA.md, not this section.

### Tables
1. **profiles** - User profiles (linked to auth.users)
   - id, email, full_name, role, is_active, created_at, updated_at

2. **products** - Product catalog
   - id, sku, name, description, category, total_components, is_active, created_by, created_at, updated_at

3. **components** - Components that make up products
   - id, product_id, component_code, name, description, is_critical, created_at

4. **inventory_items** - Individual inventory items (damaged/unsorted products)
   - id, product_id, serial_number, batch_number, status, location, notes, reported_by, created_at, updated_at
   - Status: unsorted, damaged, complete, repaired, disposed

5. **item_components** - Component status for each inventory item
   - id, inventory_item_id, component_id, status, notes, checked_by, checked_at, created_at
   - Status: missing, present, damaged

6. **activity_logs** - Audit trail
   - id, user_id, action, entity_type, entity_id, description, metadata, created_at

7. **notifications** - User notifications
   - id, user_id, title, message, type, is_read, metadata, created_at

8. **damage_reports** - Detailed damage reports
   - id, report_number (DMG-YYYYMMDD-XXXX), inventory_item_id, damage_type, damage_description, cause, estimated_loss, images, status, reported_by, resolved_by, resolved_at, created_at, updated_at
   - Status: open, investigating, resolved, closed

### Views
- **dashboard_summary** - Aggregated stats for dashboard

### Key Functions/Triggers
- **handle_new_user()** - First user = admin, rest = viewer
- **update_product_component_count()** - Auto-updates component count
- **check_pair_completion()** - Auto-marks item complete when all components present + notifies admins
- **create_item_components()** - Auto-creates component records on inventory item insert
- **generate_report_number()** - Creates DMG-YYYYMMDD-XXXX format
- **log_activity()** - Audit logging

### Realtime Enabled
- inventory_items, item_components, notifications, activity_logs, damage_reports

---

## User Roles & Permissions

| Role     | Products | Inventory | Components | Reports | Users |
|----------|----------|-----------|------------|---------|-------|
| Admin    | Full     | Full      | Full       | Full    | Full  |
| Manager  | Full     | Full      | Full       | Full    | View  |
| Operator | View     | Full      | Update     | Create  | —     |
| Viewer   | View     | View      | View       | View    | —     |

---

## App Features
1. **Dashboard** - 6 stat cards (products, inventory, damaged, unsorted, complete, reports)
2. **Inventory Management** - Add/edit items, filter by status
3. **Component Tracking** - Mark components as missing/present/damaged per item
4. **Auto-completion** - When all components marked "present", item auto-completes + notification sent
5. **Product Catalog** - Manage products with SKU and components
6. **Damage Reports** - Create reports with estimated loss in ₹
7. **Activity Log** - Full audit trail
8. **User Management** - Admin can manage roles, grant/revoke access
9. **Real-time Sync** - All changes sync across devices instantly
10. **Notifications** - Bell icon with unread count, pair completion alerts

---

## File Structure
```
unsort/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   └── App.tsx (all components in single file)
└── .github/
    └── workflows/
        └── deploy.yml
```

---

## Current Status
- ✅ Supabase database fully configured
- ✅ All SQL schema executed (tables, functions, triggers, RLS, realtime)
- ✅ App code complete (single-file App.tsx)
- ✅ GitHub repo created
- ✅ GitHub Pages deployment working
- ✅ Custom domain connected: unsort.aryadesigns.co.in
- ⏳ Waiting for DNS propagation / testing

---

## Branding
- **App Name:** Unsort
- **Colors:** Purple/violet theme (#8b5cf6, #7c3aed, #4c1d95)
- **Logo:** 📦 emoji in gradient box
- **Footer:** "Powered by Arya Designs"

---

## To Clone & Run Locally
```bash
git clone https://github.com/kreeva-lifestyle/unsort.git
cd unsort
npm install
npm run dev
```

---

## Common Commands
```bash
# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Notes
- First user to sign up becomes Admin automatically
- Supabase RLS (Row Level Security) is enabled on all tables
- The app uses Supabase Realtime for live updates
- All styling is inline (no CSS files)
