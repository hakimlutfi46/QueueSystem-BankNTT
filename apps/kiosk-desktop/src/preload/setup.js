'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'setupApi',
  Object.freeze({
    init: () => ipcRenderer.invoke('setup:init'),
    scan: () => ipcRenderer.invoke('setup:scan'),
    onFound: (callback) => {
      if (typeof callback !== 'function') return;
      ipcRenderer.on('setup:found', (_event, server) => callback(server));
    },
    check: (server) => ipcRenderer.invoke('setup:check', String(server ?? '')),
    refreshPrinters: () => ipcRenderer.invoke('setup:printers'),
    testPrint: (printerName) => ipcRenderer.invoke('setup:test-print', String(printerName ?? '')),
    submit: (form) =>
      ipcRenderer.invoke('setup:submit', {
        server: String(form?.server ?? ''),
        code: String(form?.code ?? ''),
        printerName: String(form?.printerName ?? ''),
        pin: String(form?.pin ?? ''),
        pinConfirm: String(form?.pinConfirm ?? ''),
      }),
    cancel: () => ipcRenderer.invoke('setup:cancel'),
    openAdmin: (server) => ipcRenderer.invoke('setup:open-admin', String(server ?? '')),
  }),
);
