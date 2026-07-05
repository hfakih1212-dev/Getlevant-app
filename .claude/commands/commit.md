# Smart Commit

Run `git status` and `git diff` to see all changes, then draft a conventional commit message that accurately describes what changed and why. Stage the relevant files by name (never `git add -A`), create the commit, and confirm it succeeded.

Always append:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Never commit `.claude/settings.local.json` or `.env`.
