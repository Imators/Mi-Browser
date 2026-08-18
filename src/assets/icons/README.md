# App icon

Drop a single `icon.png` here (1024×1024 recommended, square, transparent background)
and it's picked up automatically, everywhere:

- **Dev/unpackaged** (`npm start`): sets the dock/taskbar icon at runtime
  (`src/main/window-manager.js`).
- **Packaged builds** (`npm run build` / `build:mac` / `build:win` / `build:linux`):
  electron-builder reads it from the `"icon"` field in `package.json` and
  auto-generates the platform-specific `.icns` (macOS) and `.ico` (Windows)
  formats from it -- no need to produce those manually.

Nothing needs to change in code. Until the file exists, the app just falls back
to Electron's default icon.
