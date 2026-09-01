# ADR 0003 — IPC Tauri estreito e com menor privilégio

- Status: aceito; commands estruturados aplicados até a Fase 6
- Data: 2026-08-29
- Requisitos: QFD-NFR-005, SPEC-QFD-001-R12
- Task: QFD-T008

## Decisão

O WebView nunca recebe raw SQL, shell ou acesso genérico ao filesystem. Commands próprios representam operações de negócio e aceitam DTOs tipados, limitados e validados no Rust.

A capability da janela `main` continua sem plugins amplos. Os commands próprios registrados expõem inicialização, commit estruturado allowlisted, evidências, integridade, arquivos gerados, backup/importação, repositório, informações do runtime e preferências locais. O plugin de diálogo é chamado somente pelo backend Rust; o WebView não recebe paths. Prévias de importação usam tokens opacos de curta duração e não transportam o bundle pelo IPC.

## Consequências

- Uma eventual XSS não herda automaticamente poderes nativos amplos.
- Paths internos permanecem no backend.
- Plugins de shell, SQL e filesystem genérico ficam ausentes.
- A CSP restringe a janela a assets locais e ao transporte IPC do Tauri.
