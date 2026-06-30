# Agent Instructions

## Basics

- Never hallucinate.
- Never guess.
- Before writing new code, grep for existing implementations.
- Do not explain everything you do. Get to work, get it done, test everything, then commit.

## Quality

Self-assess before declaring done. Do not stop until you get to a rating of 8/10.

## Commit Message Rules

- **Format**: `type: short summary` (imperative mood, lowercase after colon, no period)
- **Types**: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`
- **Subject line**: <=72 chars; describe *what changed*, not *how*
- **Body** (optional): blank line after subject, then bullet points explaining *why* or noting side effects
- **No filler**: avoid "update", "change", "tweak", "various fixes" — be specific
- Always commit

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Release discipline

- Do not ship iOS work by stopping at `expo export`, `eas build`, or local tests.
- Always submit iOS release builds to TestFlight with `npm run release:ios:testflight`.
- Bump the visible app version before a user-testable build when behavior changes.
- Keep the Settings screen showing the installed version and native build number so testers can identify the exact build.
