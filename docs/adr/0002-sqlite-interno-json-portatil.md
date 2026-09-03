# ADR 0002 — SQLite interno e JSON v2 portátil

- Status: aceito; armazenamento físico v3 e portabilidade aplicados até a Fase 6
- Data: 2026-08-29
- Requisitos: QFD-NFR-001, QFD-NFR-002
- Task: QFD-T008

## Decisão

O backend Rust é o dono da persistência desktop em `app_data_dir`. Dados estruturados usam SQLite e evidências usam arquivos separados. `WorkspaceBundle` JSON v2 continua sendo o contrato público de importação, exportação e interoperabilidade.

`storage_format_version` será independente de `QA_FLOW_SCHEMA_VERSION`, que permanece `2` nesta iniciativa.

## Consequências

- O SQLite não vira formato público de integração.
- Migrations físicas não alteram automaticamente o contrato JSON.
- Evidências podem ser carregadas sob demanda e coordenadas com transações/recovery.
- O schema físico evoluiu de v1 para v3 sem alterar `QA_FLOW_SCHEMA_VERSION`; v3 adiciona apenas metadados e referências de blobs de evidência. O contrato JSON v2 não foi modificado.
- A Fase 6 usa o mesmo bundle JSON v2 para backup, recovery e materialização `.qaflow`; a validação completa ocorre antes de qualquer mutação no workspace real.
