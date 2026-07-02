const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  deleteAccount: (email) => ipcRenderer.invoke('delete-account', email),
  startGoogleLogin: () => ipcRenderer.invoke('start-google-login'),
  addAccountManual: (data) => ipcRenderer.invoke('add-account-manual', data),
  autoImportAccounts: () => ipcRenderer.invoke('auto-import-accounts'),
  fetchQuota: (refreshToken) => ipcRenderer.invoke('fetch-quota', refreshToken),
  onAccountsUpdated: (callback) => {
    const subscription = (event, accounts) => callback(accounts);
    ipcRenderer.on('accounts-updated', subscription);
    return () => ipcRenderer.removeListener('accounts-updated', subscription);
  }
});
