# Changelog

Todas as mudanças relevantes do QA Flow. A série `2.x` corresponde à geração QA Flow v2.

Passo de versão: **major** para quebra do contrato de dados ou remoção de capacidade, **minor** para capacidade nova, **patch** para correção e ajuste interno. `QA_FLOW_SCHEMA_VERSION` (`src/domain/types.ts`) é independente desta versão e só muda com migração.

Mantido pelo comando `/release`.

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
