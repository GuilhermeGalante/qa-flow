# QA Flow Desktop — Fase 7 (maturidade operacional)

A Fase 3 ligou a composição desktop ao backend Rust, a Fase 4 completou a persistência estruturada, a Fase 5 adicionou blobs de evidência e arquivos gerados nativos, a Fase 6 fechou portabilidade e recuperação e a Fase 7 adiciona retenção, atualização e distribuição verificável. O frontend continua compartilhando domínio e application services com a versão web, mas não importa IndexedDB, Web Storage do shell nem adapters de filesystem do navegador.

## Decisões do marco

- Bundle identifier: `dev.qaflow.app`.
- Publisher: `Guilherme Galante`.
- Produto e executável: `QA Flow` / `qa-flow`.
- Alvo inicial: Windows 10/11 x64.
- Instalador configurado para o usuário atual, sem privilégio administrativo.
- Builds locais usam `downloadBootstrapper`. O pipeline de release gera um instalador online e outro com `offlineInstaller` incorporado.
- Runtime desktop: Tauri 2 com store sem middleware web e adapter IPC para SQLite.
- Runtime web: a mesma store compartilhada, com IndexedDB, migração v1 e transferências encapsulados em adapters web.
- Contrato IPC: DTOs camelCase, erros serializáveis/redigidos e commands Rust allowlisted para inicialização, commit, integridade, transferências, runtime e preferências.
- Commit-first: coleções globais mudam somente depois da confirmação do port e commits concorrentes são serializados.
- Persistência estruturada: casos e planos preservam revisões; runs preservam snapshots e transições; relatórios, demandas e colunas sobrevivem à reinicialização.
- Preferências locais: ficam em `app_preferences`, separadas do JSON portátil e sem Web Storage.
- Evidências: imagens PNG, JPEG, WebP ou GIF de até 10 MiB ficam em `workspace/evidence`; o SQLite guarda metadados, tamanho e hash do blob.
- Arquivos gerados: PDF, JSON e CSV usam um command allowlisted e diálogo nativo; paths não atravessam o IPC.
- Backup integral: o JSON v2 inclui entidades, configurações e evidências Base64, com validação estrutural, relacional, de tamanho, assinatura e checksum antes da prévia.
- Importação: a prévia é mantida no backend por até 15 minutos; o WebView recebe apenas token, nome seguro e contagens. Merge e replace usam CAS e uma transação SQLite.
- Recuperação: antes de aplicar backup ou pull, o estado confirmado é exportado para `recovery/`. Blobs novos são desfeitos se a transação falhar; órfãos são removidos após sucesso.
- Repositório: `.qaflow/workspace.json` é publicado por último e referencia arquivos com hash de conteúdo, preservando um manifesto anterior válido durante escrita parcial.
- Retenção: por padrão, `recovery/` mantém até 20 cópias por 90 dias. Quantidade e idade são preferências locais configuráveis; a cópia válida mais recente é sempre preservada.
- Updater: consulta um endpoint HTTPS no backend Rust, compara a versão e valida a assinatura minisign antes da instalação. Builds sem `QA_FLOW_UPDATER_PUBLIC_KEY` exibem o recurso como desabilitado.
- Distribuição: o workflow exige certificado Windows, chave privada do updater e chave pública via GitHub Secrets; produz instaladores online/offline, `latest.json`, assinaturas e checksums.
- Smoke de instalador: o CI instala, inicia, reinstala e desinstala o pacote, verificando também que dados locais permanecem após reinstalação e desinstalação.

P-003/P-004/P-005/P-006 estão implementadas. A ativação de assinatura e updater em uma release depende somente do provisionamento dos secrets descritos em [`DISTRIBUTION.md`](DISTRIBUTION.md).

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

## Layout e garantias atuais

Os paths são resolvidos pelas APIs do Tauri, sem diretório absoluto no código. O layout de dados contém:

- `workspace/qaflow.sqlite3` e seus arquivos WAL/SHM;
- `workspace/evidence/`, com blobs de nome determinístico e sem extensão executável;
- `recovery/` e `transfer-staging/`, reservados para os fluxos de recuperação/importação;
- `runtime.json`, somente com versões e identificador do bundle;
- `workspace.lock`, que impede duas instâncias de gravarem o mesmo workspace;
- `qaflow.log` em `app_log_dir`, contendo apenas campos operacionais allowlisted.

O schema físico v3 usa `foreign_keys=ON`, WAL, `synchronous=FULL`, timeout de lock e `trusted_schema=OFF`. As migrations v1 → v2 → v3 são transacionais e preservam dados existentes. `storageRevision` impede sobrescritas concorrentes; revisões anteriores de casos e planos não são destruídas; runs concluídos ou abortados são imutáveis. Inclusão de evidência grava e sincroniza um temporário, publica o blob e só então confirma SQLite; falha remove o arquivo publicado. Leitura e integridade verificam tamanho e SHA-256. Na abertura, `quick_check` é executado. Banco corrompido ou incompatível produz erro de recuperação e nunca é substituído por um workspace vazio.

## Perfil inicial de metadados da Fase 4

O harness manual cria 10.000 casos, 1.000 planos, 5.000 runs, 100.000 resultados embutidos e 5.000 relatórios. Em 2026-08-31, no ambiente Windows de desenvolvimento e já com o schema físico v3, o perfil debug mediu `650 ms` para reconstruir o snapshot e `0,94 ms` no p95 de 30 commits de metadados, abaixo dos limites iniciais de 2,5 s e 300 ms.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml metadata_profile -- --ignored --nocapture
```

## Portabilidade e recuperação

Todas as entidades estruturadas, preferências e evidências estão duráveis. PDFs, JSON e CSV gerados podem ser salvos por diálogo nativo. Backup, importação, `.qaflow`, limpeza de blobs órfãos e recovery estão habilitados no desktop.

O JSON portátil permanece no schema público v2. A Fase 6 não altera `QA_FLOW_SCHEMA_VERSION`, não exige migração dos dados persistidos e não expõe paths absolutos ao React.

## Distribuição alpha pelo GitHub

`npm run build:desktop` continua gerando um instalador local de desenvolvimento. O workflow `desktop-alpha-release.yml` repete todos os gates em Windows, exige as credenciais de assinatura, gera instaladores online/offline, assinatura do updater, `latest.json` e `SHA256SUMS.txt`, executa o smoke de instalação e cria uma GitHub Release em draft quando uma tag `v*` é enviada.

O disparo manual exige uma tag existente. Por padrão, ele apenas cria/atualiza o draft; `publish_alpha=true` publica explicitamente como prerelease e `publish_stable=true` publica no canal estável consumido pelo updater. Os dois modos são mutuamente exclusivos. Sem todos os secrets obrigatórios o job falha antes de gerar artefatos, evitando uma release parcialmente assinada.
