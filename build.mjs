import fs from 'node:fs';

const configPath = './config.local.mjs';
const sourcePath = './src/syncthing-folder-paths.js';
const outputPath = './dist/syncthing-folder-paths.user.js';

if (!fs.existsSync(configPath)) {
    throw new Error('Copy config.local.example.mjs to config.local.mjs and fill it in.');
}

const config = fs.readFileSync(configPath, 'utf8');

function readValue(name) {
    const match = config.match(new RegExp(
        `export\\s+const\\s+${name}\\s*=\\s*(['"])(.*?)\\1\\s*;?`
    ));
    if (!match) throw new Error(`Missing ${name} in config.local.mjs`);
    return match[2];
}

const ORIGIN_URL = readValue('ORIGIN_URL');
const ORIGIN_API_KEY = readValue('ORIGIN_API_KEY');

if (!ORIGIN_API_KEY || ORIGIN_API_KEY === 'YOUR_NUKETOP_API_KEY') {
    throw new Error('Set your actual ORIGIN_API_KEY in config.local.mjs');
}

const host = new URL(ORIGIN_URL).hostname;
let source = fs.readFileSync(sourcePath, 'utf8');

const replacements = {
    '__ORIGIN_URL__': JSON.stringify(ORIGIN_URL),
    '__ORIGIN_API_KEY__': JSON.stringify(ORIGIN_API_KEY),
    '__ORIGIN_HOST__': host
};

for (const [token, value] of Object.entries(replacements)) {
    if (!source.includes(token)) throw new Error(`Missing placeholder: ${token}`);
    source = source.replaceAll(token, value);
}

fs.mkdirSync('./dist', { recursive: true });
fs.writeFileSync(outputPath, source, 'utf8');
console.log(`Built: ${outputPath}`);
