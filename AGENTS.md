# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Release discipline

- Do not ship iOS work by stopping at `expo export`, `eas build`, or local tests.
- Always submit iOS release builds to TestFlight with `npm run release:ios:testflight`.
- Bump the visible app version before a user-testable build when behavior changes.
- Keep the Settings screen showing the installed version and native build number so testers can identify the exact build.
