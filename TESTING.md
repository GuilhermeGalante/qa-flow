# Guia geral de execução de testes

Este documento é o ponto de entrada operacional para executar e escolher os testes do QA Flow. A estratégia do projeto é **integration-first**: usamos a camada mais baixa que ainda atravesse todas as fronteiras relevantes ao risco.

## Estado atual das suítes

| Camada | O que comprova | Comando | Estado |
| --- | --- | --- | --- |
| Unitária TypeScript | Regras e invariantes isoladas | `npm run test:unit` | Implementado |
| Contrato TypeScript | Comportamento comum de ports, DTOs e IPC | `npm run test:contract` | Implementado |
| Integração TypeScript | Store, serviços, adapters e persistência web | `npm run test:integration` | Implementado |
| Schemas JSON | Compatibilidade dos documentos portáteis | Incluído em `npm test` | Implementado |
| Integração desktop Rust | Serviços, SQLite, blobs, recovery e restart | `npm run test:desktop` | Implementado |
| UI no localhost | Interface React compartilhada | `npm run test:ui` | Planejado; script ainda não existe |
| E2E do binário Tauri | WebView, IPC e executável real | `npm run test:desktop:e2e` | Planejado; script ainda não existe |

Não use os dois comandos marcados como planejados até os respectivos runners serem adicionados ao `package.json`.

## Pré-requisitos

Para as suítes TypeScript:

- Node.js `>=24 <25`;
- npm `>=11 <12`;
- dependências instaladas com `npm ci`.

Confira as versões:

```powershell
node --version
npm.cmd --version
```

Para os testes e gates desktop também são necessários Rust 1.98, Cargo, MSVC Build Tools com o workload de C++ e Microsoft Edge WebView2. O diagnóstico automatizado é:

```powershell
npm.cmd run doctor:desktop -- --strict
```

Os exemplos deste documento usam `npm.cmd`, que evita o bloqueio do wrapper PowerShell nesta máquina. Em CMD, Git Bash, CI ou PowerShell sem essa restrição, `npm` e `npm.cmd` são equivalentes.

## Execução por camada

### Testes unitários

```powershell
npm.cmd run test:unit
```

Use para regras puras, validação, migração, transformação de dados e coordenação isolada. Eles não devem acessar browser, IndexedDB, filesystem real, SQLite ou rede.

Arquivos novos ficam próximos da unidade e usam o padrão `src/**/<nome>.test.ts`.

### Testes de contrato

```powershell
npm.cmd run test:contract
```

Use quando duas implementações precisam obedecer ao mesmo comportamento ou quando é necessário proteger DTOs, serialização IPC e envelopes de fronteira.

Arquivos novos usam o padrão `tests/contracts/<nome>.contract.test.ts`.

O verificador de schemas JSON é uma checagem de contrato complementar. Para executá-lo isoladamente:

```powershell
node scripts/verify-schemas.mjs
```

### Testes de integração TypeScript

```powershell
npm.cmd run test:integration
```

Esta é a camada padrão do QA Flow. Use para fluxos que atravessam store, `QaApplicationServices`, `CommitCoordinator`, ports, adapters ou persistência web reinicializável.

Arquivos novos usam o padrão `tests/integration/<nome>.integration.test.ts`.

### Todas as suítes TypeScript

Somente unitários, contratos e integrações, sem schemas:

```powershell
npm.cmd run test:node
```

As três suítes TypeScript mais a validação dos schemas:

```powershell
npm.cmd test
```

### Testes de integração desktop

```powershell
npm.cmd run test:desktop
```

Esse comando executa `cargo test` no backend Tauri. Ele cobre código Rust e integrações com SQLite, blobs e recovery usando diretórios temporários; não automatiza cliques na interface do aplicativo.

Para executar apenas um teste Rust pelo nome:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml nome_do_teste
```

Testes marcados como ignorados por dependerem de um perfil manual são executados explicitamente assim:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml nome_do_teste -- --ignored --nocapture
```

## Gates

### Gate rápido obrigatório

```powershell
npm.cmd run check
```

Executa, nesta ordem:

1. lint;
2. unitários, contratos e integrações TypeScript;
3. verificação dos schemas;
4. build web.

Esse é o comando recomendado antes de todo commit.

### Gate desktop

```powershell
npm.cmd run check:desktop
```

Executa build do frontend desktop, diagnóstico estrito do ambiente, verificações de distribuição, `cargo fmt`, `cargo clippy`, testes Cargo e build Tauri sem bundle.

Use quando a alteração afetar Rust, IPC, configuração Tauri, persistência desktop, blobs, filesystem ou distribuição.

### Validação mais ampla disponível hoje

Não existe um script único que agregue os dois gates. Para validar todo o código web/TypeScript e desktop/Rust:

```powershell
npm.cmd run check
if ($LASTEXITCODE -eq 0) { npm.cmd run check:desktop }
```

Se o primeiro gate falhar, corrija a falha antes de iniciar o gate desktop.

## Executar um teste TypeScript específico

O runner do projeto usa o `node:test` do Node 24. Para executar somente um arquivo:

```powershell
node --test tests/integration/applicationWorkflow.integration.test.ts
```

Para filtrar pelo nome do caso dentro de um arquivo:

```powershell
node --test --test-name-pattern="texto do cenário" tests/integration/applicationWorkflow.integration.test.ts
```

Depois do teste focado ficar verde, execute a suíte da camada e o gate aplicável. Um arquivo isolado passando não substitui `npm.cmd run check`.

## Como o runner classifica os testes

`scripts/run-node-tests.mjs` descobre arquivos terminados em `.test.ts` dentro de `src/` e `tests/`, ordena os caminhos e aplica estas regras:

1. `*.contract.test.ts` pertence à suíte de contrato;
2. `*.integration.test.ts` pertence à suíte de integração;
3. os demais `*.test.ts` pertencem à suíte unitária.

Existem duas compatibilidades para nomes anteriores à separação: `tauriAdapters.test.ts` é classificado como contrato e `qaApplicationServices.test.ts` como integração.

O runner não procura testes dentro de `node_modules` e não depende da expansão de globs do shell, preservando o mesmo comportamento no Windows e no CI.

## UI e E2E

### Playwright no localhost

O Playwright será usado somente para a interface React compartilhada em `http://127.0.0.1:5173`. O servidor que servirá de base para essa suíte pode ser iniciado com:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Neste momento, Playwright não está instalado nem existe `playwright.config.ts` ou script `test:ui`. Portanto, iniciar o servidor permite validação manual, mas **não executa uma suíte automatizada**.

Quando implementada, essa suíte ficará em `e2e/playwright/`, com contexto novo por teste, locators semânticos, assertions web-first e artefatos de falha em `tmp/playwright/`. Ela comprovará a composição web, não IPC, SQLite ou comportamento do executável Tauri.

### E2E do aplicativo Tauri

O E2E do binário real está planejado com WebdriverIO e `@wdio/tauri-service`. Ainda não existe script `test:desktop:e2e`, configuração do driver ou build exclusivo de automação.

Quando implementado, ele ficará em `e2e/desktop/` e cobrirá inicialmente apenas:

1. inicialização do aplicativo;
2. jornada principal;
3. persistência após fechar e reabrir.

Essa suíte deverá usar identificador e diretório de dados exclusivos. Ela nunca pode abrir o perfil normal `dev.qaflow.app`, e nenhuma capability de automação pode entrar no bundle de produção.

Playwright Electron não deve ser usado: o QA Flow é Tauri, não Electron.

## Rotina para cada implementação

Execute do teste mais barato para o gate mais amplo:

1. rode o arquivo diretamente enquanto desenvolve;
2. rode `test:unit`, `test:contract` ou `test:integration`, conforme a camada;
3. rode `npm.cmd run check` antes do commit;
4. rode `npm.cmd run check:desktop` quando o runtime nativo for afetado;
5. quando disponíveis, rode Playwright apenas para mudanças de UI e E2E desktop apenas para jornadas que realmente dependam do executável.

Roteamento rápido:

| Alteração | Validação mínima durante o desenvolvimento | Gate antes do commit |
| --- | --- | --- |
| Regra pura ou validação | `test:unit` | `check` |
| Port, DTO, IPC TypeScript ou schema | `test:contract` e/ou verificador de schemas | `check` |
| Store, serviço, adapter ou persistência web | `test:integration` | `check` |
| Rust, SQLite, blob, recovery ou restart | teste Cargo focado e `test:desktop` | `check` + `check:desktop` |
| Interface React | teste da lógica afetada; futuramente `test:ui` | `check`; futuramente UI |
| Binário, WebView ou jornada IPC real | integrações TypeScript/Rust; futuramente `test:desktop:e2e` | `check` + `check:desktop`; futuramente E2E |

Um hook de `pre-commit` ou job de pull request pode executar `npm run check` automaticamente. O gate desktop deve ficar em um job Windows separado por ser mais demorado e depender da toolchain nativa. O E2E desktop só deve virar bloqueante depois de demonstrar estabilidade.

## Diagnóstico de falhas

- Se `npm` for bloqueado pelo PowerShell, use `npm.cmd`.
- Se o runner disser que não encontrou testes, confira o sufixo do arquivo e a categoria solicitada.
- Se apenas um teste passa, mas a suíte falha, investigue dependência de ordem, estado global ou fixture compartilhada.
- Não use `sleep`, retry, `test.skip`, `test.fixme` ou assertions mais fracas para esconder flakiness.
- Falhas no `doctor:desktop -- --strict` indicam pré-requisito nativo ausente; resolva o ambiente antes de interpretar como regressão do produto.
- Nenhum teste pode usar dados do workspace ou perfil desktop normal do usuário.

## Referências

- [Visão geral e desenvolvimento](./README.md)
- [Ambiente desktop](./docs/desktop/README.md)
