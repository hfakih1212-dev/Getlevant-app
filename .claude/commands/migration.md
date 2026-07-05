# New Supabase Migration

Create a new migration file in `supabase/migrations/` with a timestamp prefix (format: `YYYYMMDDHHmmss`) and a descriptive snake_case name based on $ARGUMENTS.

Then:
1. Write the SQL — use `IF NOT EXISTS` / `IF EXISTS` guards, follow existing style
2. Apply it to the remote project: `npx supabase db push --project-ref fhsnjdwciwzpkzwvcbrl`
3. Verify it ran cleanly (no errors)
4. Report what objects were created/modified
