'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
class Store {
  constructor(directory, encryption) { this.directory = directory; this.encryption = encryption; fs.mkdirSync(directory, { recursive: true }); }
  read(name, fallback) { try { return JSON.parse(fs.readFileSync(path.join(this.directory, name + '.json'), 'utf8')); } catch { return fallback; } }
  write(name, data) {
    const target = path.join(this.directory, name + '.json');
    fs.writeFileSync(target + '.tmp', JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(target + '.tmp', target);
  }
  projectKey(project, provider) { return 'project-' + crypto.createHash('sha256').update(path.resolve(project).toLowerCase() + ':' + provider).digest('hex').slice(0, 24); }
  history(project, provider) { return this.read(this.projectKey(project, provider), { messages: [], threadId: null }); }
  saveHistory(project, provider, data) { this.write(this.projectKey(project, provider), data); }
  key(provider, value) {
    if (!this.encryption.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable. API keys cannot be stored safely.');
    const secrets = this.read('credentials', {});
    if (value !== undefined) { secrets[provider] = this.encryption.encryptString(value).toString('base64'); this.write('credentials', secrets); }
    return secrets[provider] ? this.encryption.decryptString(Buffer.from(secrets[provider], 'base64')) : '';
  }
}
module.exports = { Store };
