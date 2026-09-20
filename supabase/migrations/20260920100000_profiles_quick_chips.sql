-- Dashboard "Quick access" chips (owner's ask): each user pins their own
-- shortcuts to modules and Minis tools. Personal, no admin involved — the
-- app only offers targets the user can already open (canAccessTab /
-- canAccessModule), and re-checks on every render, so a module removed
-- later just drops off the strip.
-- Stored on the profile so it follows the user across devices. profiles
-- has column-level grants (SELECT * is revoked), so the new column needs
-- its own SELECT/UPDATE grant; the existing "Users can update own profile"
-- policy already limits the write to the caller's row and pins role /
-- is_active / module_access.
alter table public.profiles
  add column if not exists quick_chips jsonb not null default '[]'::jsonb;
alter table public.profiles
  add constraint profiles_quick_chips_shape check (jsonb_typeof(quick_chips) = 'array' and jsonb_array_length(quick_chips) <= 12);
grant select (quick_chips), update (quick_chips) on public.profiles to authenticated;
