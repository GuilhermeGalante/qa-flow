# ADR 0003 — IPC Tauri estreito e com menor privilégio

- Status: aceito; commands fundamentais aplicados em M3
- Data: 2026-08-29
- Requisitos: QFD-NFR-005, SPEC-QFD-001-R12
- Task: QFD-T008

## Decisão

O WebView nunca recebe raw SQL, shell ou acesso genérico ao filesystem. Commands próprios representam operações de negócio e aceitam DTOs tipados, limitados e validados no Rust.

A capability da janela `main` continua sem plugins amplos. Os commands próprios registrados em M3 expõem somente inicialização, commit allowlisted, integridade, informações do runtime e preferências locais.

## Consequências

- Uma eventual XSS não herda automaticamente poderes nativos amplos.
- Paths internos permanecem no backend.
- Plugins de shell, SQL e filesystem genérico ficam ausentes.
- A CSP restringe a janela a assets locais e ao transporte IPC do Tauri.
