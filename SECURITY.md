# Security

vitest-expo is a test-time dependency: it runs on developer machines and in CI,
never in a shipped app. Its risk surface is the code it executes during a test
run — the project's own config, the packages it loads, and the migrate command's
file writes.

## Reporting a vulnerability

Report privately through GitHub's [security advisory
form](https://github.com/swey/vitest-expo/security/advisories/new), or by email
to sw@nion-digital.com. Please do not open a public issue for a vulnerability.

Expect an acknowledgement within a week. Fixes go out as a patch release of the
supported major, with the advisory published once the fix is available.

## Supported versions

The current major (matching the current Expo SDK) receives fixes. Older majors
are updated only for issues that also affect the current one.
