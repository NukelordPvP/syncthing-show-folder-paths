
 // ==UserScript==
 // @name         Syncthing - Show Folder Paths
 // @namespace    https://violentmonkey.github.io/
 // @version      1.7
 // @description  Capture loaded folder paths and keep them visible
 // @match        http://*/*
 // @match        https://*/*
 // @run-at       document-idle
 // @grant        none
 // ==/UserScript==

 (() => {
     'use strict';

     const STORAGE_KEY = 'syncthing-captured-folder-paths';

     let savedPaths = {};

     try {
         savedPaths = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
     } catch (error) {
         savedPaths = {};
     }

     // Prevent simultaneous automatic scans.
     let scanRunning = false;
     let scanStarted = false;

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
             display: inline !important;
             white-space: normal !important;
             overflow: visible !important;
             text-overflow: unset !important;
             overflow-wrap: anywhere !important;
             word-break: break-word !important;
         }
     `;

     document.head.appendChild(style);

     // ----------------------------------------
     // Storage
     // ----------------------------------------

     function savePaths() {
         try {
             localStorage.setItem(
                 STORAGE_KEY,
                 JSON.stringify(savedPaths)
             );
         } catch (error) {
             console.warn(
                 '[Syncthing Folder Paths] Could not save paths:',
                 error
             );
         }
     }

     function storePath(folderId, path) {
         if (!folderId || !path) {
             return;
         }

         if (savedPaths[folderId] === path) {
             return;
         }

         savedPaths[folderId] = path;
         savePaths();

         console.info(
             '[Syncthing Folder Paths] Captured:',
             folderId,
             path
         );
     }

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
     // Display cached paths
     // ----------------------------------------

     function showSavedPath(panel, folderId) {
         const path = savedPaths[folderId];

         if (!path) {
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

             pathElement.style.marginLeft = '8px';
             pathElement.style.fontWeight = 'normal';
             pathElement.style.opacity = '0.8';

             heading.appendChild(pathElement);
         }

         const displayText = ' — ' + path;

         // Avoid triggering the MutationObserver unnecessarily.
         if (pathElement.textContent !== displayText) {
             pathElement.textContent = displayText;
         }

         pathElement.title = 'Captured folder path';
     }

     function processFolders() {
         const panels = getFolderPanels();

         for (const panel of panels) {
             const folderId = getFolderId(panel);

             if (!folderId) {
                 continue;
             }

             const path = getFolderPath(panel);

             if (path) {
                 storePath(folderId, path);
             }

             showSavedPath(panel, folderId);
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

         const collapse = controls.collapse;

         return (
             collapse.classList.contains('in') ||
             collapse.classList.contains('show') ||
             collapse.getAttribute('aria-expanded') === 'true'
         );
     }

     function clickFolder(controls) {
         if (!controls) {
             return;
         }

         controls.trigger.click();
     }

     function wait(ms) {
         return new Promise(resolve => setTimeout(resolve, ms));
     }

     // Wait for Syncthing to lazy-load the folder details.
     async function waitForFolderPath(panel, folderId, timeout = 12000) {
         const start = Date.now();

         while (Date.now() - start < timeout) {
             const path = getFolderPath(panel);

             if (path) {
                 storePath(folderId, path);
                 showSavedPath(panel, folderId);
                 return true;
             }

             await wait(250);
         }

         return false;
     }

     // ----------------------------------------
     // Automatically capture uncached folders
     // ----------------------------------------

     async function autoCaptureFolders() {
         if (scanRunning || scanStarted) {
             return;
         }

         scanRunning = true;
         scanStarted = true;

         console.info(
             '[Syncthing Folder Paths] Starting uncached folder scan.'
         );

         try {
             const panels = Array.from(getFolderPanels());

             for (const panel of panels) {
                 const folderId = getFolderId(panel);

                 if (!folderId) {
                     continue;
                 }

                 // Cached folders are left completely alone.
                 if (savedPaths[folderId]) {
                     showSavedPath(panel, folderId);
                     continue;
                 }

                 // If the path is already loaded, capture it directly.
                 const existingPath = getFolderPath(panel);

                 if (existingPath) {
                     storePath(folderId, existingPath);
                     showSavedPath(panel, folderId);
                     continue;
                 }

                 const controls = getFolderControls(panel);

                 if (!controls) {
                     console.warn(
                         '[Syncthing Folder Paths] Could not find folder controls:',
                         folderId
                     );
                     continue;
                 }

                 const wasAlreadyExpanded = isFolderExpanded(controls);

                 // Expand only if this script needs to load the path.
                 if (!wasAlreadyExpanded) {
                     clickFolder(controls);

                     // Give Angular and Bootstrap time to react.
                     await wait(350);
                 }

                 await waitForFolderPath(panel, folderId);

                 // Only close folders that this script opened.
                 if (!wasAlreadyExpanded && isFolderExpanded(controls)) {
                     clickFolder(controls);
                     await wait(350);
                 }

                 // Small pause between folders to avoid stressing the UI.
                 await wait(250);
             }

             console.info(
                 '[Syncthing Folder Paths] Uncached folder scan finished.'
             );
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

     let updateScheduled = false;

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

     // Start the one-time scan after Syncthing has rendered the dashboard.
     setTimeout(() => {
         autoCaptureFolders();
     }, 2000);

     console.info('[Syncthing Folder Paths] Userscript loaded.');
 })();
