# TypeScript Check

Run `npx tsc --noEmit 2>&1` and report:
- Total error count
- Each error with file path, line number, and a plain-English explanation
- Group errors by file

If there are no errors, confirm the project type-checks cleanly.
After reporting, fix any errors unless the user says otherwise.
