// Bridges the sandboxed panel (renderer) to main.js, which talks to Resolve.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('resolveHost', {
  invoke: (name, ...args) => ipcRenderer.invoke('cl:' + name, ...args),
  onProgress: cb => ipcRenderer.on('cl:progress', (_e, p) => cb(p)),
});
