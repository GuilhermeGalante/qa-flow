# QA Flow v2

QA Flow é um gerenciador local-first para casos, planos e execuções de testes manuais. A versão 2 separa a definição reutilizável do teste de cada tentativa executada, preservando o histórico mesmo quando o catálogo evolui.

## O que mudou na v2

- Biblioteca pesquisável de casos com pastas recolhidas por padrão, filtros, tags, prioridade, revisão e arquivamento seguro.
- Importação CSV/JSON com pré-visualização, validação forte e diagnóstico de linhas incompletas.
- Planos compostos por referências de caso, com ordem explícita e aviso quando uma revisão fica desatualizada.
- Execuções por tentativa com contexto de ambiente, snapshot imutável, pausa, retomada, conclusão e aborto.
- Status de passo consistentes: `not_run`, `passed`, `failed`, `blocked` e `skipped`.
- Resultado obtido obrigatório para falha e bloqueio.
- Evidências múltiplas armazenadas separadamente do estado principal, com metadados e SHA-256.
- Registros exploratórios independentes dos passos previstos.
- Relatórios e exportações gerados a partir da tentativa histórica, não do plano mutável.
- Backup completo, restauração com prévia e modos de mesclagem ou substituição.
- Adaptador opcional de repositório usando a File System Access API, com arquivos determinísticos em `.qaflow/`.
- Migração idempotente do armazenamento `qaflow-store` da v1 para `qaflow-v2-store`.

## Modelo mental

```text
Caso revisionado ──referência──> Plano revisionado
        │                              │
        └──────── snapshot ────────────┴──> Tentativa imutável ──> Relatórios
                                                  │
                                                  ├── resultados por passo
                                                  ├── evidências
                                                  └── registros exploratórios
```

Editar um caso cria uma nova revisão. Planos existentes continuam apontando para a revisão anterior até que alguém revise e atualize as referências. Uma tentativa só inicia quando todas as referências estão atuais; depois disso seu snapshot nunca deriva novamente do catálogo.

## Persistência

No modo navegador, o adapter web persiste o snapshot confirmado no IndexedDB. As imagens são gravadas em chaves separadas (`qaflow-v2:evidence:*`) para evitar reserializar todo o workspace a cada alteração.

No modo repositório, selecione uma pasta nas configurações e grave a estrutura:

```text
.qaflow/
├── workspace.json
├── cases/       # um JSON por caso e revisão
├── plans/       # um JSON por plano e revisão
├── runs/        # tentativas imutáveis
├── reports/     # registros de relatório
├── demands/     # colunas e demandas
└── evidence/    # binários separados
```

O manifesto `workspace.json` é escrito por último e referencia os arquivos determinísticos. O acesso à pasta depende da File System Access API disponível em navegadores Chromium; o backup JSON funciona nos demais navegadores.

## Migração da v1

Na primeira abertura, se a v2 estiver vazia, a aplicação procura o estado `qaflow-store` da versão anterior. A migração:

1. deduplica casos equivalentes reutilizados em planos;
2. converte planos embutidos para referências;
3. transforma resultados existentes em tentativas com snapshot;
4. separa evidências Base64 em chaves próprias;
5. registra um relatório de migração nas configurações.

O estado antigo não é apagado nem sobrescrito.

## Desenvolvimento

Requer Node.js 24 ou mais recente para executar os testes TypeScript nativos.

```bash
npm install
npm run dev
```

Validação completa:

```bash
npm run check
```

## Desktop — Fase 7 (maturidade operacional)

A composição Windows isolada liga o frontend ao backend Rust por IPC estreito. Casos, planos, runs, relatórios, demandas, colunas, configurações, preferências e metadados de evidências são persistidos em SQLite dentro de `app_data_dir`, com histórico de revisões, snapshots imutáveis, transações atômicas, lock exclusivo, CAS global e abertura segura diante de corrupção. Imagens de evidência ficam em blobs separados e arquivos gerados usam diálogo nativo allowlisted.

Além da portabilidade da Fase 6, o desktop possui retenção configurável de recovery, updater nativo com validação criptográfica e pipeline para instaladores Windows online/offline assinados. Builds locais sem chave pública continuam funcionais, mas mostram o updater como desabilitado; nenhum segredo é mantido no repositório.

Pré-requisitos e decisões: [`docs/desktop/README.md`](docs/desktop/README.md).

```powershell
npm run doctor:desktop
npm run dev:desktop
npm run check:desktop
```

Comandos individuais:

- `npm run lint` — ESLint.
- `npm test` — testes do domínio, importação, migração e integridade dos schemas.
- `npm run build` — TypeScript e build de produção.

Os contratos JSON Schema Draft 2020-12 ficam em [`schemas/`](schemas/). As decisões e o plano que originaram esta implementação ficam em [`specs/qa-flow-v2/`](specs/qa-flow-v2/).

## Cuidados com dados locais

- Exporte backups regularmente, especialmente antes de limpar dados do navegador.
- Não use janela anônima para trabalho permanente.
- Substituir um workspace durante a importação troca o estado atual após confirmação; o desktop grava antes uma cópia integral em `recovery/`. Mesclar preserva e atualiza entidades pelo ID.
- No desktop, a retenção padrão mantém até 20 cópias por 90 dias e nunca remove a cópia válida mais recente; os limites podem ser alterados nas configurações.
- Arquivar casos e planos preserva referências, snapshots, tentativas e relatórios.
