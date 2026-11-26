
// ==UserScript==
// @name         Syncthing - Show Folder Paths
// @namespace    https://violentmonkey.github.io/
// @version      1.8
// @description  Capture local paths and show NukeTop origin paths
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      __ORIGIN_HOST__
// ==/UserScript==

(() => {
    'use strict';

    // ----------------------------------------
    // NukeTop API configuration
    // ----------------------------------------

    const ORIGIN_NAME = 'NukeTop';

    // Replace with NukeTop's LAN or WireGuard address.
    const ORIGIN_URL = __ORIGIN_URL__;

    // Paste NukeTop's Syncthing GUI API key here.
    // Keep this userscript private.
    const ORIGIN_API_KEY = __ORIGIN_API_KEY__;

    const LOCAL_STORAGE_KEY = 'syncthing-captured-folder-paths';
    const ORIGIN_STORAGE_KEY = 'syncthing-origin-folder-paths';

    let savedPaths = {};
    let originPaths = {};

    try {
        savedPaths = JSON.parse(
            localStorage.getItem(LOCAL_STORAGE_KEY) || '{}'
        );
    } catch (error) {
        savedPaths = {};
    }

    try {
        originPaths = JSON.parse(
            localStorage.getItem(ORIGIN_STORAGE_KEY) || '{}'
        );
    } catch (error) {
        originPaths = {};
    }

    let scanRunning = false;
    let scanStarted = false;
    let updateScheduled = false;

    // ----------------------------------------
    // Storage
    // ----------------------------------------

    function saveLocalPaths() {
        try {
            localStorage.setItem(
                LOCAL_STORAGE_KEY,
                JSON.stringify(savedPaths)
            );
        } catch (error) {
            console.warn(
                '[Syncthing Paths] Could not save local paths:',
                error
            );
        }
    }

    function saveOriginPaths() {
        try {
            localStorage.setItem(
                ORIGIN_STORAGE_KEY,
                JSON.stringify(originPaths)
            );
        } catch (error) {
            console.warn(
                '[Syncthing Paths] Could not save origin paths:',
                error
            );
        }
    }

    function storeLocalPath(folderId, path) {
        if (!folderId || !path) {
            return;
        }

        if (savedPaths[folderId] === path) {
            return;
        }

        savedPaths[folderId] = path;
        saveLocalPaths();

        console.info(
            '[Syncthing Paths] Local path captured:',
            folderId,
            path
        );
    }

    // ----------------------------------------
    // Styling
    // ----------------------------------------

    const style = document.createElement('style');

    style.textContent = `
        #folders .panel-heading,
        [id^="folders-"] .panel-heading {
            height: auto !important;
            min-height: 40px;
            white-space: normal !important;
            overflow: visible !important;
        }

        #folders .panel-title-text,
        [id^="folders-"] .panel-title-text {
            display: block !important;
            height: auto !important;
            max-height: none !important;
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: unset !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
            line-height: 1.5 !important;
        }

        .syncthing-captured-path {
            display: block !important;
            margin-left: 8px;
            font-weight: normal;
            opacity: 0.85;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
        }
    `;

    document.head.appendChild(style);

    // ----------------------------------------
    // Folder identification
    // ----------------------------------------

    function getFolderId(panel) {
        const tooltip = panel.querySelector(
            '.panel-heading [data-original-title]'
        );

        if (!tooltip) {
            return null;
        }

        const id = tooltip.getAttribute('data-original-title');

        return id && id.trim() ? id.trim() : null;
    }

    function getFolderPath(panel) {
        const rows = panel.querySelectorAll(
            '.panel-body tr, .panel-collapse tr'
        );

        for (const row of rows) {
            const heading = row.querySelector('th, td');

            if (!heading) {
                continue;
            }

            if (
                heading.textContent.trim().toLowerCase() !==
                'folder path'
            ) {
                continue;
            }

            const cells = row.querySelectorAll('td');

            if (cells.length > 0) {
                const path = cells[cells.length - 1]
                    .textContent
                    .trim();

                if (path) {
                    return path;
                }
            }
        }

        return null;
    }

    function getFolderPanels() {
        return document.querySelectorAll(
            '#folders .panel, [id^="folders-"] .panel'
        );
    }

    // ----------------------------------------
    // Display local and origin paths
    // ----------------------------------------

    function showPaths(panel, folderId) {
        const localPath = savedPaths[folderId];
        const originPath = originPaths[folderId];

        if (!localPath && !originPath) {
            return;
        }

        const heading = panel.querySelector('.panel-title-text');

        if (!heading) {
            return;
        }

        let pathElement = heading.querySelector(
            '.syncthing-captured-path'
        );

        if (!pathElement) {
            pathElement = document.createElement('span');
            pathElement.className = 'syncthing-captured-path';
            heading.appendChild(pathElement);
        }

        const parts = [];

        if (localPath) {
            parts.push('Local: ' + localPath);
        }

        if (originPath) {
            parts.push(
                'Origin (' + ORIGIN_NAME + '): ' + originPath
            );
        }

        const displayText = parts.join(' | ');

        if (pathElement.textContent !== displayText) {
            pathElement.textContent = displayText;
        }

        pathElement.title = 'Local and origin folder paths';
    }

    function processFolders() {
        for (const panel of getFolderPanels()) {
            const folderId = getFolderId(panel);

            if (!folderId) {
                continue;
            }

            const path = getFolderPath(panel);

            if (path) {
                storeLocalPath(folderId, path);
            }

            showPaths(panel, folderId);
        }
    }

    // ----------------------------------------
    // NukeTop API lookup
    // ----------------------------------------

    function fetchOriginFolders() {
        return new Promise((resolve, reject) => {
            if (
                !ORIGIN_API_KEY ||
                ORIGIN_API_KEY === 'PASTE_NUKETOP_API_KEY_HERE'
            ) {
                reject(new Error('NukeTop API key has not been configured.'));
                return;
            }

            const url =
                ORIGIN_URL.replace(/\/+$/, '') +
                '/rest/config/folders';

            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: {
                    'X-API-Key': ORIGIN_API_KEY
                },
                timeout: 15000,

                onload(response) {
                    if (
                        response.status < 200 ||
                        response.status >= 300
                    ) {
                        reject(
                            new Error(
                                'NukeTop API returned HTTP ' +
                                response.status
                            )
                        );
                        return;
                    }

                    try {
                        const folders = JSON.parse(response.responseText);

                        if (!Array.isArray(folders)) {
                            reject(
                                new Error(
                                    'Unexpected folder configuration response.'
                                )
                            );
                            return;
                        }

                        resolve(folders);
                    } catch (error) {
                        reject(error);
                    }
                },

                onerror() {
                    reject(
                        new Error(
                            'Could not connect to NukeTop Syncthing API.'
                        )
                    );
                },

                ontimeout() {
                    reject(
                        new Error(
                            'NukeTop Syncthing API request timed out.'
                        )
                    );
                }
            });
        });
    }

    async function refreshOriginPaths() {
        try {
            const folders = await fetchOriginFolders();

            let changed = false;

            for (const folder of folders) {
                if (!folder.id || !folder.path) {
                    continue;
                }

                if (originPaths[folder.id] !== folder.path) {
                    originPaths[folder.id] = folder.path;
                    changed = true;
                }
            }

            if (changed) {
                saveOriginPaths();
            }

            processFolders();

            console.info(
                '[Syncthing Paths] Origin paths refreshed from ' +
                ORIGIN_NAME + '.'
            );
        } catch (error) {
            console.warn(
                '[Syncthing Paths] Origin lookup failed:',
                error.message
            );

            // Previously cached origin paths remain displayed.
            processFolders();
        }
    }

    // ----------------------------------------
    // Expand / collapse helpers
    // ----------------------------------------

    function getFolderControls(panel) {
        const collapse = panel.querySelector('.panel-collapse');
        const heading = panel.querySelector('.panel-heading');

        if (!collapse || !heading) {
            return null;
        }

        const trigger = heading.querySelector(
            '[data-toggle="collapse"], ' +
            '[data-bs-toggle="collapse"], ' +
            'a, button, [role="button"]'
        ) || heading;

        return {
            collapse,
            trigger
        };
    }

    function isFolderExpanded(controls) {
        if (!controls) {
            return false;
        }

        const ariaExpanded = controls.trigger.getAttribute(
            'aria-expanded'
        );

        if (ariaExpanded === 'true') {
            return true;
        }

        if (ariaExpanded === 'false') {
            return false;
        }

        return (
            controls.collapse.classList.contains('in') ||
            controls.collapse.classList.contains('show')
        );
    }

    function clickFolder(controls) {
        if (controls) {
            controls.trigger.click();
        }
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitForFolderPath(
        panel,
        folderId,
        timeout = 12000
    ) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const path = getFolderPath(panel);

            if (path) {
                storeLocalPath(folderId, path);
                showPaths(panel, folderId);
                return true;
            }

            await wait(250);
        }

        return false;
    }

    // ----------------------------------------
    // Automatic capture of uncached folders
    // ----------------------------------------

    async function autoCaptureFolders() {
        if (scanRunning || scanStarted) {
            return;
        }

        scanRunning = true;
        scanStarted = true;

        try {
            const panels = Array.from(getFolderPanels());

            for (const panel of panels) {
                const folderId = getFolderId(panel);

                if (!folderId) {
                    continue;
                }

                // Cached folders are not expanded.
                if (savedPaths[folderId]) {
                    showPaths(panel, folderId);
                    continue;
                }

                const existingPath = getFolderPath(panel);

                if (existingPath) {
                    storeLocalPath(folderId, existingPath);
                    showPaths(panel, folderId);
                    continue;
                }

                const controls = getFolderControls(panel);

                if (!controls) {
                    continue;
                }

                const wasAlreadyExpanded =
                    isFolderExpanded(controls);

                if (!wasAlreadyExpanded) {
                    clickFolder(controls);
                    await wait(400);
                }

                await waitForFolderPath(panel, folderId);

                // Only collapse folders opened by this script.
                if (
                    !wasAlreadyExpanded &&
                    isFolderExpanded(controls)
                ) {
                    clickFolder(controls);
                    await wait(400);
                }

                await wait(250);
            }
        } finally {
            scanRunning = false;
        }
    }

    // ----------------------------------------
    // Dashboard layout
    // ----------------------------------------

    function arrangeDashboard() {
        const devices = document.querySelector(
            '[aria-label="Devices"]'
        );

        const folders = document.querySelector(
            '[aria-label="Folders"]'
        );

        if (!devices || !folders) {
            return;
        }

        let common = devices.parentElement;

        while (common && !common.contains(folders)) {
            common = common.parentElement;
        }

        if (!common) {
            return;
        }

        let devicesBranch = devices;

        while (
            devicesBranch.parentElement &&
            devicesBranch.parentElement !== common
        ) {
            devicesBranch = devicesBranch.parentElement;
        }

        let foldersBranch = folders;

        while (
            foldersBranch.parentElement &&
            foldersBranch.parentElement !== common
        ) {
            foldersBranch = foldersBranch.parentElement;
        }

        if (devicesBranch === foldersBranch) {
            return;
        }

        common.style.display = 'flex';
        common.style.flexDirection = 'column';
        common.style.alignItems = 'stretch';

        devicesBranch.style.order = '0';
        devicesBranch.style.width = '100%';
        devicesBranch.style.maxWidth = '100%';
        devicesBranch.style.flex = '0 0 100%';

        foldersBranch.style.order = '1';
        foldersBranch.style.width = '100%';
        foldersBranch.style.maxWidth = '100%';
        foldersBranch.style.flex = '0 0 100%';
    }

    // ----------------------------------------
    // Mutation observer
    // ----------------------------------------

    function scheduleUpdate() {
        if (updateScheduled) {
            return;
        }

        updateScheduled = true;

        setTimeout(() => {
            updateScheduled = false;
            processFolders();
            arrangeDashboard();
        }, 150);
    }

    const observer = new MutationObserver(scheduleUpdate);

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // ----------------------------------------
    // Manual folder clicks
    // ----------------------------------------

    document.addEventListener(
        'click',
        () => {
            setTimeout(processFolders, 300);
            setTimeout(processFolders, 900);
            setTimeout(processFolders, 1600);
        },
        true
    );

    // ----------------------------------------
    // Startup
    // ----------------------------------------

    processFolders();
    arrangeDashboard();

    setTimeout(() => {
        refreshOriginPaths();
        autoCaptureFolders();
    }, 2000);

    console.info('[Syncthing Folder Paths] Userscript loaded.');
})();
