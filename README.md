# Saint's Crew World

> A local pixel-world desktop app that turns real AI-assisted project work into a visible, understandable workspace.

Saint's Crew World connects one selected local project to Codex, Claude, or Gemini and visualizes real reading, planning, editing, approval, and testing activity. It is built for developers and communities who want an approachable project assistant without pretending that work happened when it did not.

![License](https://img.shields.io/badge/license-MIT-4f6b45)
![Platform](https://img.shields.io/badge/platform-Windows-0078d4)
![Status](https://img.shields.io/badge/status-community%20release-cb7a35)

## Why it is different

- One focused AI session, shown as a living pixel town.
- Real provider-backed work and evidence-driven activity updates.
- Read-only exploration by default, with guarded project editing.
- Codex / ChatGPT, Claude API, and Gemini API support.
- Local project isolation, encrypted API-key storage, approval prompts, and stop controls.

This is a community project, not an official OpenAI, Anthropic, or Google product.

A standalone, local Windows app: choose a project, connect an AI provider, and talk to it while a pixel town visualizes actual work. It is independent of the Discord bot dashboard. This is a community app, not an official OpenAI, Anthropic, or Google product.

## Start

Open **Saints Crew World.exe** from the complete App folder, or use the desktop shortcut. Keep its supporting files together. A portable executable is also provided when packaging succeeds.

1. Choose an existing project folder or create a new one with the included Graph Engineering Crew AGENTS.md template. Existing projects are never overwritten.
2. Connect **Codex / ChatGPT**, **Claude API**, or **Gemini API**.
3. Choose a model and Read only or Project work, then enter the world.
4. Type directly into the conversation. Use Stop to interrupt. Review approval prompts carefully.

Codex requires the official Codex desktop app or CLI installed separately. Sign-in opens the official browser flow and uses eligible ChatGPT access and account limits. This is a separate conversation, not a mirror of an existing ChatGPT chat. Claude and Gemini require API keys and their own quotas/billing; chat subscriptions are not substituted for API access. Keys are encrypted with Windows credential protection and never sent to the renderer after entry. Connect verifies available models, not unlimited quota or successful generation.

## What is live?

Characters represent workflow roles, not eight permanently running independent models. Actual file reads, edits, commands, and planning events send residents to their workplaces. Idle walks are visibly labeled ambient. A finished turn is not proof that tests passed or deployment happened: read the evidence in the conversation.

Codex offers its real project tools, sandbox, and approval flow. Project work permits ordinary in-project edits; not every edit needs a separate popup. Keep backups or version control. Managed Codex policies may restrict available permissions. Unsupported permission/tool requests fail closed. Structured questions are redirected back to conversational replies.

Claude/Gemini can inspect directories, read UTF-8 files, and create/replace files after explicit approval. They do not run shell commands, tests, or deployments in this release. Files are limited to 64 KiB, context and tool loops are bounded, protected credential paths and symlinks are refused, and existing files must be read before replacement. Replacements create backups under the Windows temporary folder (`crew-world-backup-*`); tool results report their exact paths. Stop does not undo already-completed edits. Gemini responses arrive per API response, not token-by-token.

The selected project's AGENTS.md is used by the runner. For API providers, the root file is included and the model is instructed to read nested instructions before edits. This is not an enforcement mechanism or a guarantee of model correctness.

## Privacy and project reuse

The app can select any local project; no copy into that project is necessary. Settings, conversations and encrypted API keys are in `%APPDATA%/Saints Crew World` (Electron's user-data directory). Conversation text is stored locally in plain text, so do not paste secrets. Selected files and prompts are transmitted to the selected provider for processing. Codex manages its own sign-in and session storage separately. No bot tokens, `.env` files, or existing project data are bundled.

Reconnect on launch. Conversation history is isolated by project and provider. Codex resumes its own saved session. API providers resend the visible conversation, not a durable tool transcript; they must re-read files for current facts.

## Develop / build

Install Node.js, then run `npm ci`, `npm test`, and `npm start` from this source folder. `npm run build` produces the Windows portable package; `npm run build:folder` produces a complete application folder. A compatible Windows build environment is required. Runtime license notices must stay with redistributed packages.

Code is MIT; Kenney artwork is CC0. Source is included for reuse; nothing has been publicly published.

## Verification

See STATE.md for the exact tests and account-dependent limitations recorded for this build. Offline integration tests use a stub transport and do not claim successful live model work.

Provider integration references: https://learn.chatgpt.com/docs/app-server · https://github.com/anthropics/anthropic-sdk-typescript · https://ai.google.dev/api/generate-content
