'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'adminApi',
  Object.freeze({
    state: () => ipcRenderer.invoke('admin:state'),
    submit: (pin, action) => ipcRenderer.invoke('admin:submit', String(pin ?? ''), String(action ?? '')),
    cancel: () => ipcRenderer.invoke('admin:cancel'),
  }),
);
