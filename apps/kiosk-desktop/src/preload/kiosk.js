'use strict';

// Sandboxed preload: only `electron`'s renderer modules are available here, so
// this file must stay self-contained. It exposes exactly one object.
const { contextBridge, ipcRenderer } = require('electron');

const versionArg = process.argv.find((arg) => arg.startsWith('--kiosk-app-version='));
const version = versionArg ? versionArg.slice('--kiosk-app-version='.length) : '0.0.0';

contextBridge.exposeInMainWorld(
  'kioskApp',
  Object.freeze({
    version,
    printerStatus: () => ipcRenderer.invoke('kiosk:printer-status'),
    printTicket: (ticketId) => ipcRenderer.invoke('kiosk:print-ticket', String(ticketId)),
  }),
);
