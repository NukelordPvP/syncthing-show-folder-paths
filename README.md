# Syncthing - Show Folder Paths

1. Copy `config.local.example.mjs` to `config.local.mjs`.
2. Set the NukeTop Syncthing URL and API key in `config.local.mjs`.
3. Run `node build.mjs`.
4. Install `dist/syncthing-folder-paths.user.js` in Violentmonkey.

Keep `config.local.mjs` and `dist/` private. The built userscript contains the API key.
If the key was previously committed publicly, revoke it and generate a new key.
