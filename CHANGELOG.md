# Changelog

Todas as mudanças relevantes do QA Flow. A série `2.x` corresponde à geração QA Flow v2.

Passo de versão: **major** para quebra do contrato de dados ou remoção de capacidade, **minor** para capacidade nova, **patch** para correção e ajuste interno. `QA_FLOW_SCHEMA_VERSION` (`src/domain/types.ts`) é independente desta versão e só muda com migração.

Mantido pelo comando `/release`.

## 2.0.1 — 2026-08-28

<!-- release-baseline: f6c1eb9 -->

### Alterado
- Feedback de salvamento, importação, relatórios, evidências, backups e repositórios passa a usar mensagens contextuais e indicadores de progresso que evitam ações duplicadas.
- Filtros e seletores de casos, planos, execuções e demandas passam a expor opções, contagens e busca contextual sem ocultar o estado atual.
- A execução de tentativas passa a oferecer navegação explícita entre passos, escolha direta de status e progresso ao aplicar resultados pendentes antes do encerramento.
- A interface passa a usar cores semânticas consistentes e um esqueleto do workspace durante a inicialização.

### Corrigido
- Falhas na preparação ou geração de PDFs deixam de ser seguidas por uma mensagem de sucesso e permanecem visíveis para diagnóstico.

### Acessibilidade
- Diálogos, drawers e bottom sheets passam a conter o foco, responder a Escape, bloquear a rolagem de fundo e devolver o foco ao controle de origem.
- Filtros segmentados, seletores e estados de passo passam a aceitar navegação por teclado, com anúncios diferenciados para estado e erro e respeito à redução de movimento.

## 2.0.0 — 2026-08-28

<!-- release-baseline: d60723d -->

Entrada de base: consolida a geração v2 até `d60723d`. As mudanças anteriores a este ponto não foram registradas individualmente; o detalhamento está em `README.md` e no histórico do git.

### Adicionado
- Biblioteca pesquisável de casos com pastas, filtros, tags, prioridade, revisão e arquivamento seguro.
- Importação CSV/JSON com pré-visualização, validação forte e diagnóstico de linhas incompletas.
- Planos compostos por referências de caso, com ordem explícita e aviso de revisão desatualizada.
- Execuções por tentativa com contexto de ambiente, pausa, retomada, conclusão e aborto.
- Evidências múltiplas com metadados e SHA-256, armazenadas fora do estado principal.
- Registros exploratórios independentes dos passos previstos.
- Relatórios e exportações gerados a partir da tentativa histórica.
- Backup completo e restauração com prévia, em modo mesclar ou substituir.
- Adaptador opcional de repositório via File System Access API, com arquivos determinísticos em `.qaflow/`.
- Quadro de demandas com colunas livres, reordenação manual e vínculo a casos, planos, execuções e relatórios.

### Contrato de dados
- `QA_FLOW_SCHEMA_VERSION = 2`: casos, planos e tentativas separados, com snapshot imutável por tentativa.
- Migração idempotente de `qaflow-store` (v1) para `qaflow-v2-store`.

### Interno
- Versão de release passa a existir em `package.json` e `src/version.ts`, exibida no rodapé da sidebar.
