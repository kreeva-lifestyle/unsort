# Project rules for Unsort
- Modular structure — DO NOT put new code in App.tsx
- New components: src/components/[feature]/
- New pages: src/pages/
- Types: src/types/database.ts
- Theme constants: src/lib/theme.ts
- Supabase client: src/lib/supabase.ts
- Read only the specific file you need — never read all of App.tsx
- Keep every file under 200 lines
- Schema reference: UNSORT-CLAUDE-CODE-CONTEXT.md (read this instead of App.tsx for DB info)
