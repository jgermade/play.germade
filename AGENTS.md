
## Architecture

Check [STACK.md](STACK.md)

## Project Managment

Initial specifications in: [_INITIAL_SECS_.md](./SESSIONS/_INITIAL_SECS_.md)

Sessions and specifications live in [SESSIONS/](./SESSIONS/). Convention:

- Name format: `YYYY-MM-DD_HHhMM.<summary>.session.md` where `<summary>` is a kebab-case slug of the topic.
- Files can be **extended** (appended to the end) but existing content must never be deleted or modified. The extensions should include the date and time of the extension, as well as the summary of the new content added.
- For a new topic with no relation to previous ones: create a new file.
- When current session is completed, add "Completed" at the end of the session file.
- Also, When session is completed, update `README.md` with the project specifications (in -# Project Specs- section) and a todo list (in -# Todos- section).

## Critical Rules

### Session-first workflow
**Never make changes without first documenting them in a session file.** This is non-negotiable. Before implementing any feature, refactoring code, or adding dependencies:

1. Create or extend the appropriate session file in `SESSIONS/`
2. Document the planned changes in detail
3. Wait for user approval before proceeding

### Session lifecycle
- A session's status must remain **In Progress** until the user says **"capitular"**
- Only after capitulating may you:
  - Change the session status to "Completed"
  - Update `README.md`

When the user says **"capitular"**:

1. Complete current session
2. Ask user to start a new session.
3. Unless user require to capitulate explicitly, never create a new session file. Instead attach proposal to the current session file and ask the user to review and approve it.
