import fs from 'node:fs';
import { ORIGIN_URL, ORIGIN_API_KEY } from './config.local.mjs';

const sourcePath = './src/syncthing-folder-paths.js';
const outputPath = './dist/syncthing-folder-paths.user.js';

if (!ORIGIN_URL || !ORIGIN_API_KEY ||
    ORIGIN_API_KEY === 'PASTE_NUKETOP_API_KEY_HERE') {
    throw new Error('Configure ORIGIN_URL and ORIGIN_API_KEY in config.local.mjs');
}

const host = new URL(ORIGIN_URL).hostname;
let source = fs.readFileSync(sourcePath, 'utf8');

const replacements = {
    '__ORIGIN_URL__': JSON.stringify(ORIGIN_URL),
    '__ORIGIN_API_KEY__': JSON.stringify(ORIGIN_API_KEY),
    '__ORIGIN_HOST__': host
};

for (const [placeholder, replacement] of Object.entries(replacements)) {
    if (!source.includes(placeholder)) {
        throw new Error('Missing placeholder in source: ' + placeholder);
    }
    source = source.replaceAll(placeholder, replacement);
}

fs.mkdirSync('./dist', { recursive: true });
fs.writeFileSync(outputPath, source, 'utf8');
console.log('Built userscript:', outputPath);
