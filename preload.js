const { contextBridge, ipcRenderer } = require('electron');
const api = {};
for (const method of ['status', 'chooseProject', 'createProject', 'connect', 'enter', 'send', 'stop', 'approve']) {
  api[method] = payload => ipcRenderer.invoke('crew:' + method, payload);
}
api.onEvent = callback => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on('crew:event', listener);
  return () => ipcRenderer.removeListener('crew:event', listener);
};
contextBridge.exposeInMainWorld('crew', api);
