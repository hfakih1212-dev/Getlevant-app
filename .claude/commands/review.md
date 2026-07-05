# Code Review

Review all uncommitted changes (and any specified files in $ARGUMENTS) for:

1. **Correctness** — logic errors, off-by-one, unhandled edge cases
2. **TypeScript** — missing types, unsafe casts, strict-mode violations
3. **Security** — SQL injection, XSS, exposed secrets, RLS gaps
4. **Performance** — unnecessary re-renders, missing `useCallback`/`useMemo`, N+1 queries
5. **Style** — consistency with CLAUDE.md conventions (colors, `.maybeSingle()`, `useFocusEffect`)

Report findings as a prioritised list: 🔴 must fix, 🟡 should fix, 🟢 nice to have.
Then ask whether to apply any fixes.
