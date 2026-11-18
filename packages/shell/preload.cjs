/**
 * Electron preload：只给网页暴露两个只读能力。
 *
 * 用 CommonJS（.cjs）：沙箱里的 preload 不支持 ESM。
 * 不暴露任何 Node API —— 页面拿不到 fs / child_process / ipcRenderer 本体。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('corpusShell', {
    /** 当前版本号、是否开发态、平台 */
    getAppInfo: () => ipcRenderer.invoke('corpus:app-info'),
    /** 查 GitHub Releases：{ status: 'update' | 'latest' | 'error', current, latest?, url?, notes?, error? } */
    checkUpdate: () => ipcRenderer.invoke('corpus:check-update'),
});
