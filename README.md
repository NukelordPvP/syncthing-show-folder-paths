# Syncthing - Show Folder Paths (v1.8 logic)

This package preserves the user's confirmed working v1.8 folder-panel selectors,
folder-ID lookup, path capture/display, automatic capture, dashboard layout,
and NukeTop origin lookup. Only the private NukeTop URL/API key and @connect host
are build-time substitutions.

## Build

1. Copy `config.local.example.mjs` to `config.local.mjs`.
2. Set the NukeTop Syncthing URL and API key in `config.local.mjs`.
3. Run `node build.mjs`.
4. Install `dist/syncthing-folder-paths.user.js` in Violentmonkey.

Keep `config.local.mjs` and `dist/` private. The built userscript includes the API
key. If a real key was ever committed to a public repository, revoke it and create
a new one.
