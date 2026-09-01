# ADR 0001 — Domínio compartilhado, composições de runtime separadas

- Status: aceito e aplicado até a Fase 6
- Data: 2026-08-29
- Requisitos: QFD-NFR-008, SPEC-QFD-001-R12
- Tasks: QFD-T008, QFD-T016, QFD-T017

## Decisão

QA Flow mantém uma base React/domínio compartilhada e cria entrypoints de build distintos. A build web continua entrando por `src/main.tsx`; o modo Vite `desktop` troca apenas o entrypoint para `src/main.desktop.tsx` e grava em `dist-desktop`.

O desktop não importa a store web. Os ports definitivos isolam o runtime sem detecção espalhada de `window.__TAURI__`; a composição desktop usa o adapter Tauri/SQLite.

## Consequências

- A build web mantém a persistência existente.
- O desktop não usa storage do WebView.
- O bundle desktop pode ser auditado por busca estática desde o primeiro marco.
- Todas as entidades estruturadas, preferências e evidências estão duráveis desde a Fase 5; na Fase 6, backup, importação e `.qaflow` passaram a usar o mesmo `TransferPort` nas duas composições, com implementações específicas por runtime.
