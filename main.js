'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Store } = require('./store');
const { CodexEngine } = require('./codex-engine');
let window, store, codex, project = '', provider = 'codex', connected = false, models = [], model = '', mode = 'read-only', history = { messages: [] }, busy = false, entered = false, controller, draft = '', stopping = false;
const approvals = new Map();
const page = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href;
function status() { return { project, provider, connected, models, model, mode, scenery: store.scenery(project), messages: history.messages, busy }; }
function emit(event) {
  if (event.type === 'text') draft += event.text;
  if (window && !window.isDestroyed()) window.webContents.send('crew:event', event);
}
function save() { if (project) store.saveHistory(project, provider, history); }
function idle() { if (busy) throw new Error('Stop the current mission before changing projects or connections.'); }
async function engine() {
  if (codex?.child) return codex;
  codex = new CodexEngine();
  codex.on('event', event => {
    if (event.type === 'auth') {
      if (provider !== 'codex') return;
      if (event.error || event.success === false) emit({ type: 'error', message: event.error || 'ChatGPT sign-in did not complete. Try connecting again.' });
      codex.account().then(async account => { connected = account?.type === 'chatgpt'; if (connected) models = await codex.models(); emit({ type: 'status', ...status() }); }).catch(error => emit({ type: 'error', message: error.message }));
    } else emit(event);
  });
  await codex.start(); return codex;
}
function selectProject(target) {
  const real = fs.realpathSync(target);
  if (!fs.statSync(real).isDirectory() || path.parse(real).root === real) throw new Error('Choose a project folder, not a drive root.');
  project = real; entered = false; history = store.history(project, provider);
  store.write('settings', { project, provider });
  return status();
}
async function stop() {
  stopping = true;
  controller?.abort();
  for (const resolve of approvals.values()) resolve(false);
  approvals.clear();
  if (provider === 'codex' && codex) await codex.stop();
  return status();
}
function ask({ title, detail }) {
  if (controller?.signal.aborted) return Promise.resolve(false);
  const id = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  return new Promise(resolve => { approvals.set(id, resolve); emit({ type: 'approval', id, title, detail }); });
}
const handlers = {
  status,
  setScenery(payload = {}) {
    if (payload.project !== project) throw new Error('The selected project changed. Open the scenery picker again.');
    const scenery = store.scenery(project, payload.id);
    return { scenery, project };
  },
  async chooseProject() { idle(); const result = await dialog.showOpenDialog(window, { title: 'Choose a project for your crew', properties: ['openDirectory'] }); return result.canceled ? status() : selectProject(result.filePaths[0]); },
  async createProject() { idle(); const result = await dialog.showSaveDialog(window, { title: 'Create a project folder', defaultPath: path.join(app.getPath('documents'), 'My Crew Project'), buttonLabel: 'Create project' }); if (result.canceled) return status(); if (fs.existsSync(result.filePath)) throw new Error('That path already exists. Use Choose project instead.'); fs.mkdirSync(result.filePath); fs.copyFileSync(path.join(__dirname, 'templates', 'AGENTS.md'), path.join(result.filePath, 'AGENTS.md'), fs.constants.COPYFILE_EXCL); return selectProject(result.filePath); },
  async connect(payload = {}) {
    idle();
    if (!['codex', 'claude', 'gemini'].includes(payload.provider)) throw new Error('Choose a supported provider.');
    provider = payload.provider; connected = false; entered = false; models = [];
    history = project ? store.history(project, provider) : { messages: [] };
    if (provider === 'codex') {
      const client = await engine(); const account = await client.account();
      if (!account) {
        const login = await client.login(); const url = new URL(login.authUrl);
        if (url.protocol !== 'https:' || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname)) throw new Error('Unexpected login destination. Sign in with the official Codex app first.');
        await shell.openExternal(url.href); return { ...status(), authPending: true };
      }
      // API-key Codex accounts are not advertised as a ChatGPT subscription connection.
      if (account.type !== 'chatgpt') throw new Error('Codex currently uses API-key authentication. Sign in with ChatGPT in Codex, then reconnect here.');
      models = await client.models(); connected = true;
    } else {
      const key = String(payload.apiKey || store.key(provider)).trim();
      if (!key || key.length > 2048) throw new Error('Enter a valid API key.');
      models = await require('./api-engine').verify(provider, key);
      store.key(provider, key); connected = true;
    }
    model = models.some(m => m.id === payload.model) ? payload.model : provider === 'codex' && models.some(m => m.id === 'gpt-6-astra') ? 'gpt-6-astra' : provider === 'claude' && models.some(m => m.id === 'claude-opus-4-7') ? 'claude-opus-4-7' : models[0]?.id || '';
    store.write('settings', { project, provider }); return status();
  },
  async enter(payload = {}) {
    idle(); if (!project || !connected) throw new Error('Choose a project and connect a provider first.');
    model = payload.model || model || models[0]?.id;
    if (!models.some(m => m.id === model)) throw new Error('Choose an available model.');
    mode = payload.mode === 'workspace-write' ? 'workspace-write' : 'read-only';
    if (mode === 'workspace-write') {
      const result = await dialog.showMessageBox(window, { type: 'warning', title: 'Allow project work?', message: 'The crew may edit files in this project.', detail: project + '\n\nCodex applies its sandbox and approval policy. Ordinary project edits may not ask separately. API providers ask before each file write. Keep a backup or version-control history. External or destructive actions must still be approved.', buttons: ['Stay read-only', 'Allow project work'], defaultId: 0, cancelId: 0 });
      if (result.response !== 1) mode = 'read-only';
    }
    if (provider === 'codex') {
      const result = await codex.enter({ project, model, mode, threadId: history.threadId });
      history.threadId = result.threadId; save();
    }
    entered = true; return status();
  },
  async send(payload = {}) {
    idle(); if (!entered || !connected) throw new Error('Connect and enter your project first.');
    const text = String(payload.text || '').trim(); if (!text || text.length > 16000) throw new Error('Use a prompt between 1 and 16,000 characters.');
    busy = true; stopping = false; draft = ''; controller = new AbortController();
    history.messages.push({ role: 'user', text }); save();
    emit({ type: 'status', ...status() }); emit({ type: 'activity', role: 'router', status: 'working', text: 'Reading your request' });
    // Return immediately so the renderer can keep Stop and approvals responsive.
    (async () => {
      try {
        const final = provider === 'codex' ? await codex.send(text) : await require('./api-engine').run({ provider, key: store.key(provider), model, project, messages: history.messages, mode, signal: controller.signal, emit, approve: ask });
        if (!draft && final) emit({ type: 'text', text: final });
        if (draft) history.messages.push({ role: 'assistant', text: draft, interrupted: stopping });
        emit({ type: 'done', status: stopping ? 'interrupted' : 'completed' });
      } catch (error) {
        if (draft) history.messages.push({ role: 'assistant', text: draft, interrupted: true });
        emit({ type: 'error', message: stopping ? 'Mission stopped. Any completed edits remain in your project.' : error.message });
        emit({ type: 'done', status: stopping ? 'interrupted' : 'failed' });
      } finally {
        busy = false; controller = null; for (const resolve of approvals.values()) resolve(false); approvals.clear(); save(); emit({ type: 'status', ...status() });
      }
    })();
    return { accepted: true };
  },
  stop,
  async approve(payload = {}) { const id = String(payload.id); if (approvals.has(id)) { const resolve = approvals.get(id); approvals.delete(id); resolve(payload.allow === true); } else codex?.respond(id, payload.allow === true); return { accepted: true }; }
};
app.setName('Saints Crew World');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  app.whenReady().then(async () => {
    store = new Store(app.getPath('userData'), safeStorage);
    const settings = store.read('settings', {});
    provider = ['codex', 'claude', 'gemini'].includes(settings.provider) ? settings.provider : 'codex';
    if (settings.project && fs.existsSync(settings.project)) selectProject(settings.project);
    window = new BrowserWindow({ width: 1500, height: 940, minWidth: 1080, minHeight: 720, icon: path.join(__dirname, 'assets', 'app-icon.ico'), backgroundColor: '#fbf7e9', show: !process.argv.includes('--smoke'), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.setMenu(null);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('crew:' + name, (event, payload) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== page) throw new Error('Untrusted request.');
      return handler(payload);
    });
    window.on('close', event => { if (busy) { event.preventDefault(); dialog.showMessageBox(window, { message: 'A mission is running. Stop it before closing the app.', buttons: ['OK'] }); } });
    await window.loadURL(page);
    if (process.argv.includes('--smoke')) {
      setTimeout(async () => { try { console.log(JSON.stringify(await window.webContents.executeJavaScript('({ ui: window.crewUIDiagnostics?.(), world: window.worldDiagnostics?.() })'))); app.quit(); } catch (error) { console.error(error.message); app.exit(1); } }, 1800);
    } else window.maximize();
  }).catch(error => { dialog.showErrorBox('Crew World could not start', error.message); app.exit(1); });
  app.on('window-all-closed', () => { codex?.close(); app.quit(); });
}
