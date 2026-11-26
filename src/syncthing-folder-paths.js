// ==UserScript==
// @name         Syncthing - Show Folder Paths
// @namespace    https://violentmonkey.github.io/
// @version      2.0.0
// @description  Show local and NukeTop origin paths for Syncthing folders.
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      __ORIGIN_HOST__
// ==/UserScript==

(() => {
    'use strict';
    if (location.port !== '8384') return;

    const ORIGIN_NAME = 'NukeTop';
    const ORIGIN_URL = __ORIGIN_URL__;
    const ORIGIN_API_KEY = __ORIGIN_API_KEY__;
    const LOCAL_KEY = 'syncthing-folder-paths-local-v2';
    const ORIGIN_KEY = 'syncthing-folder-paths-origin-v2';
    const DELAY = 800;
    const WAIT_LIMIT = 7000;

    let localPaths = readCache(LOCAL_KEY);
    let originPaths = readCache(ORIGIN_KEY);
    let busy = false;
    let scheduled = false;

    function readCache(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    function saveCache(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); }
        catch (e) { console.warn('[Folder Paths] Cache write failed', e); }
    }

    function cards() {
        return [...document.querySelectorAll('[id^="folder-"]')]
            .filter(el => el.querySelector('.panel-heading'));
    }

    function folderId(card) {
        const el = card.querySelector(
            '.panel-heading [data-original-title], .panel-title [data-original-title]'
        );
        return el?.getAttribute('data-original-title')?.trim()
            || card.getAttribute('data-folder-id')
            || card.getAttribute('data-id')
            || '';
    }

    function expanded(card) {
        const el = card.querySelector('.panel-collapse, [class*="collapse"]');
        return !!el && (
            el.classList.contains('in') ||
            el.classList.contains('show') ||
            el.getAttribute('aria-expanded') === 'true'
        );
    }

    function toggle(card) {
        const heading = card.querySelector('.panel-heading');
        if (!heading) return false;
        const control = heading.querySelector(
            '[data-toggle="collapse"], [data-bs-toggle="collapse"], button, a'
        );
        (control || heading).click();
        return true;
    }

    function readPath(card) {
        for (const row of card.querySelectorAll('tr')) {
            const cells = [...row.querySelectorAll('th,td')];
            if (cells.length < 2) continue;
            const label = cells[0].textContent.trim().replace(/:$/, '').toLowerCase();
            if (label === 'folder path' || label === 'path') {
                const path = cells.slice(1).map(x => x.textContent.trim()).filter(Boolean).join(' ');
                if (path) return path;
            }
        }
        for (const label of card.querySelectorAll('dt,label,.control-label')) {
            const name = label.textContent.trim().replace(/:$/, '').toLowerCase();
            if (name === 'folder path' || name === 'path') {
                const value = label.nextElementSibling?.textContent.trim();
                if (value) return value;
            }
        }
        return '';
    }

    function waitPath(card) {
        return new Promise(resolve => {
            const start = Date.now();
            const poll = () => {
                const path = readPath(card);
                if (path || Date.now() - start >= WAIT_LIMIT) return resolve(path);
                setTimeout(poll, 200);
            };
            poll();
        });
    }

    function displayFor(card) {
        const title = card.querySelector('.panel-title');
        if (!title) return null;
        let el = title.querySelector('.syncthing-path-display');
        if (!el) {
            el = document.createElement('div');
            el.className = 'syncthing-path-display';
            title.appendChild(el);
        }
        return el;
    }

    function render(card) {
        const id = folderId(card);
        if (!id) return;
        const box = displayFor(card);
        if (!box) return;
        box.replaceChildren();

        const origin = originPaths[id];
        const local = localPaths[id];

        if (origin) {
            const line = document.createElement('div');
            line.textContent = `Origin (${ORIGIN_NAME}): ${origin}`;
            box.appendChild(line);
        }
        if (local) {
            const line = document.createElement('div');
            line.textContent = `Local: ${local}`;
            box.appendChild(line);
        }
    }

    function renderAll() { cards().forEach(render); }

    function layout() {
        const devices = document.querySelector('#devices');
        const folders = document.querySelector('#folders');
        if (!devices || !folders) return;

        devices.closest('[class*="col-"]')?.classList.add('syncthing-paths-full-width');
        folders.closest('[class*="col-"]')?.classList.add('syncthing-paths-full-width');

        const row = devices.closest('.row');
        if (row && folders.closest('.row') === row) {
            row.classList.add('syncthing-paths-dashboard-row');
        }
    }

    function styles() {
        if (document.getElementById('syncthing-folder-paths-style')) return;
        const style = document.createElement('style');
        style.id = 'syncthing-folder-paths-style';
        style.textContent = `
          .syncthing-paths-dashboard-row{display:flex!important;flex-direction:column!important}
          .syncthing-paths-full-width{width:100%!important;max-width:100%!important;flex:0 0 100%!important}
          .syncthing-path-display{display:block;margin-top:5px;font-size:12px;font-weight:normal;line-height:1.45;white-space:normal;overflow-wrap:anywhere;word-break:break-word;opacity:.85}
          .syncthing-path-display>div{white-space:normal;overflow-wrap:anywhere;word-break:break-word}
          .panel-title{white-space:normal;overflow-wrap:anywhere}
        `;
        document.head.appendChild(style);
    }

    function fetchOrigin() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${ORIGIN_URL.replace(/\/$/, '')}/rest/config/folders`,
                headers: { 'X-API-Key': ORIGIN_API_KEY },
                timeout: 12000,
                onload: response => {
                    if (response.status < 200 || response.status >= 300) {
                        return reject(new Error(`NukeTop API HTTP ${response.status}`));
                    }
                    try {
                        const result = {};
                        for (const folder of JSON.parse(response.responseText)) {
                            if (folder.id && folder.path) result[folder.id] = folder.path;
                        }
                        resolve(result);
                    } catch (e) { reject(e); }
                },
                onerror: () => reject(new Error('NukeTop API connection failed')),
                ontimeout: () => reject(new Error('NukeTop API timed out'))
            });
        });
    }

    async function scan() {
        if (busy) return;
        busy = true;
        try {
            for (const card of cards()) {
                const id = folderId(card);
                if (!id) continue;
                if (localPaths[id]) { render(card); continue; }

                const wasOpen = expanded(card);
                if (!wasOpen) {
                    if (!toggle(card)) continue;
                    await new Promise(r => setTimeout(r, 300));
                }

                const path = await waitPath(card);
                if (path) {
                    localPaths[id] = path;
                    saveCache(LOCAL_KEY, localPaths);
                    render(card);
                }

                if (!wasOpen && expanded(card)) {
                    toggle(card);
                    await new Promise(r => setTimeout(r, 250));
                }
            }
        } finally {
            busy = false;
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            layout();
            renderAll();
            scan();
        }, DELAY);
    }

    async function init() {
        styles();
        layout();
        renderAll();

        try {
            originPaths = await fetchOrigin();
            saveCache(ORIGIN_KEY, originPaths);
        } catch (e) {
            console.warn('[Folder Paths] Origin lookup failed:', e);
        }

        renderAll();
        schedule();

        new MutationObserver(schedule).observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'aria-expanded']
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
