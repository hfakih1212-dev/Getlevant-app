# Deploy Edge Function

Deploy the Supabase Edge Function named in $ARGUMENTS to the remote project.

```
npx supabase functions deploy $ARGUMENTS --project-ref fhsnjdwciwzpkzwvcbrl
```

If the function name is `send-otp-email`, add `--no-verify-jwt` (it's called by the auth hook, not via JWT).

Report the deployment result and any errors.
