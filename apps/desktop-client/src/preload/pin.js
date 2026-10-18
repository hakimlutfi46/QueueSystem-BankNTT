'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'pinApi',
  Object.freeze({
    state: () => ipcRenderer.invoke('pin:state'),
    submit: (pin, action) => ipcRenderer.invoke('pin:submit', String(pin ?? ''), String(action ?? '')),
    cancel: () => ipcRenderer.invoke('pin:cancel'),
  }),
);
