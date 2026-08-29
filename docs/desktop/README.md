# QA Flow Desktop — marco M3

O marco M3 liga a composição desktop ao backend Rust e introduz o armazenamento SQLite físico. O frontend continua compartilhando domínio e application services com a versão web, mas não importa IndexedDB, Web Storage nem adapters de filesystem do navegador.

## Decisões do marco

- Bundle identifier: `dev.qaflow.app`.
- Publisher: `Guilherme Galante`.
- Produto e executável: `QA Flow` / `qa-flow`.
- Alvo inicial: Windows 10/11 x64.
- Instalador configurado para o usuário atual, sem privilégio administrativo.
- WebView2 usa `downloadBootstrapper` apenas como padrão técnico do protótipo. A combinação final de instaladores online/offline permanece pendente para a distribuição pública.
- Runtime desktop: Tauri 2 com store sem middleware web e adapter IPC para SQLite.
- Runtime web: a mesma store compartilhada, com IndexedDB, migração v1 e transferências encapsulados em adapters web.
- Contrato IPC: DTOs camelCase, erros serializáveis/redigidos e commands Rust allowlisted para inicialização, commit, integridade, runtime e preferências.
- Commit-first: coleções globais mudam somente depois da confirmação do port e commits concorrentes são serializados.
- Persistência M3: configurações do workspace e casos, incluindo todas as revisões históricas, sobrevivem ao fechamento e à reinicialização.
- Preferências locais: continuam separadas do JSON portátil e não usam Web Storage; a persistência física delas pertence à Fase 4.
- Evidências: os binários nunca ficam dentro do SQLite; o diretório reservado é `workspace/evidence`, com implementação na Fase 5.

P-003/P-004 (assinatura e updater), a decisão pública de P-005 (artefato offline) e P-006 (retenção) não bloqueiam M3 e permanecem abertas.

## Toolchain fixada

- Node.js `24.14.1` (`.nvmrc`).
- npm `11.x`, com lockfile.
- Rust `1.98.0`, alvo `x86_64-pc-windows-msvc`, com `rustfmt` e `clippy` (`rust-toolchain.toml`).
- Tauri CLI `2.11.4`, com lockfile npm.
- Crates Tauri declaradas em `src-tauri/Cargo.toml`; `Cargo.lock` é gerado pelo primeiro gate Rust e deve ser versionado.

## Pré-requisitos no Windows

1. Node/npm nas versões acima.
2. Rustup com a toolchain definida no repositório.
3. Visual Studio Build Tools com “Desktop development with C++”.
4. Microsoft Edge WebView2 Runtime.

Diagnóstico read-only:

```powershell
npm run doctor:desktop
```

O modo estrito, usado pelo gate, retorna erro quando um pré-requisito falta:

```powershell
npm run doctor:desktop -- --strict
```

## Comandos

```powershell
npm run dev:desktop
npm run build:desktop:no-bundle
npm run check
npm run check:desktop
```

`npm run check:desktop:frontend` também prova que `dist-desktop` não contém IndexedDB, Web Storage do shell, chaves de storage v2 nem o adapter de repositório web.

## Layout e garantias do M3

Os paths são resolvidos pelas APIs do Tauri, sem diretório absoluto no código. O layout de dados contém:

- `workspace/qaflow.sqlite3` e seus arquivos WAL/SHM;
- `workspace/evidence/`, reservado para a Fase 5;
- `recovery/` e `transfer-staging/`, reservados para os fluxos de recuperação/importação;
- `runtime.json`, somente com versões e identificador do bundle;
- `workspace.lock`, que impede duas instâncias de gravarem o mesmo workspace;
- `qaflow.log` em `app_log_dir`, contendo apenas campos operacionais allowlisted.

O schema físico v1 usa `foreign_keys=ON`, WAL, `synchronous=FULL`, timeout de lock e `trusted_schema=OFF`. Migrations e commits são transacionais; `storageRevision` impede sobrescritas concorrentes, e revisões anteriores de casos não são destruídas. Na abertura, `quick_check` é executado. Banco corrompido ou incompatível produz erro de recuperação e nunca é substituído por um workspace vazio.

## Limite operacional do M3

Somente casos e configurações do workspace estão duráveis neste lote. A tentativa de persistir planos, execuções, relatórios ou demandas recebe erro tipado até a Fase 4. Preferências locais ainda valem apenas para o processo atual. Diálogos de backup/repositório e evidências permanecem desabilitados até as fases de arquivos nativos e importação/recovery.

## Distribuição alpha pelo GitHub

`npm run build:desktop` gera o instalador NSIS em `src-tauri/target/release/bundle/nsis`. O workflow `desktop-alpha-release.yml` repete todos os gates em Windows, gera o instalador e `SHA256SUMS.txt` e cria uma GitHub Release em draft quando uma tag `v*` é enviada.

O disparo manual exige uma tag existente. Por padrão, ele apenas cria/atualiza o draft; `publish_alpha=true` publica explicitamente como prerelease. A release é identificada como alpha não assinada e não deve receber dados únicos ou importantes. Assinatura Windows e updater permanecem bloqueados pelas decisões P-003/P-004.
