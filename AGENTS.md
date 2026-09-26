# task-app

Repo-wide context is in the root `CLAUDE.md`. This file covers what's specific to the app.

## Expo moves fast — read the versioned docs

This app is on **Expo SDK 54** (54.0.36 installed, `package.json` pins `~54.0.0`) with
**React Native 0.81.5** and the New Architecture enabled.

Read the docs for that exact version before writing code:
**https://docs.expo.dev/versions/v54.0.0/**

Generic or blog-sourced Expo answers are frequently a version or two stale, and the API surface
changes enough between SDKs that a plausible answer is often simply wrong here.

## The two authorities

- **`src/theme/palette.ts`** for colour and **`src/theme/index.ts`** for everything else (type,
  space, radius, depth). If a value isn't in one of them, it isn't in the design.

  Colour is read through `useTheme()`, and a component's stylesheet is built by
  `useThemedStyles(makeStyles)` — `StyleSheet.create` freezes whatever it's handed, so a
  module-scope stylesheet can't change with the theme. There is no static colour export: if you
  find yourself wanting one, that's the compiler telling you the value would be stuck in light
  mode. See the root `CLAUDE.md` for the two deliberate exceptions.
- **`designdocs/`** for layout and visual target. `rn-handoff 2/theme.ts` generates the theme
  file above.

## Before you finish

```bash
npx tsc --noEmit    # must be silent
```

Typecheck catches nothing about layout, caching or notifications. When a change is visual, look
at it rendered.

See the root `CLAUDE.md` for the platform rendering traps (gradient aspect distortion, Android
inset shadows under gradients, `setInterval` suspending) — all three have bitten this app.
