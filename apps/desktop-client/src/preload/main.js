'use strict';

// Sandboxed preload for the main window. The server pages (/admin, /counter, /display) get
// nothing; only the app's own offline page (file://…/offline.html) gets a tiny API. The main
// process re-checks the sender frame on every call.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'file:' && location.pathname.endsWith('/offline.html')) {
  contextBridge.exposeInMainWorld(
    'offlineApi',
    Object.freeze({
      rescan: () => ipcRenderer.invoke('offline:rescan'),
      onStatus: (callback) => {
        if (typeof callback !== 'function') return;
        ipcRenderer.on('offline:status', (_event, text) => callback(String(text)));
      },
    }),
  );
}
