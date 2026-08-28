# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O usuário principal é o profissional de QA, atuando individualmente ou em uma equipe. A mesma pessoa pode criar e manter casos, montar planos, executar testes manuais, registrar resultados e evidências e gerar relatórios.

O produto é open source e pode ser baixado ou clonado do GitHub por qualquer profissional, equipe ou empresa que queira criar, organizar, guardar e executar testes manuais sem depender de um serviço proprietário.

## Product Purpose

QA Flow é um gerenciador genérico de testes manuais local-first. Ele transforma casos reutilizáveis em planos versionados, tentativas rastreáveis e relatórios reproduzíveis.

O produto existe para permitir que profissionais e equipes de QA organizem sua fila de trabalho, mantenham definições reutilizáveis, executem tentativas com contexto e evidências e preservem o significado histórico de cada resultado. O fluxo principal deve ser compreensível sem documentação externa: organizar demandas, criar ou importar casos, montar um plano, iniciar uma tentativa, registrar resultados e gerar um relatório.

## Positioning

QA Flow combina operação local/offline, portabilidade e rastreabilidade em um único modelo de produto. Ele deve funcionar tanto para uma pessoa no navegador quanto para uma equipe que versiona artefatos em Git, sem criar duas experiências ou duas regras de domínio diferentes.

Seu mecanismo distintivo é separar casos, planos e tentativas. Cada tentativa recebe um identificador próprio e conserva um snapshot imutável das revisões utilizadas, impedindo que alterações futuras modifiquem retroativamente resultados e relatórios históricos.

## Operating Context

- Uso individual diretamente no navegador, inclusive offline.
- Adoção por equipes ou empresas a partir do repositório open source no GitHub.
- Workspace mantido no navegador ou em estrutura JSON local e versionável, quando o adaptador estiver disponível.
- Colaboração por Git para casos, planos e outros artefatos determinísticos.
- Importação e exportação de dados para backup, portabilidade e migração.
- Execuções manuais com contexto de ambiente, build, plataforma, dispositivo, navegador e responsável.
- Registro de resultado observado, bloqueios, evidências e descobertas exploratórias.
- Geração de relatórios a partir da tentativa histórica, nunca do estado mutável do plano.

## Capabilities and Constraints

- O produto é local-first e deve funcionar sem servidor obrigatório.
- Demandas de QA podem ser organizadas em um quadro de colunas livres, reordenadas manualmente e vinculadas a casos, planos, execuções ou relatórios.
- Indicadores do quadro usam o significado configurado para cada coluna, não seu nome visível, e incluem conclusões da semana corrente.
- Nenhum dado deve sair do dispositivo sem ação explícita do usuário e destino visível.
- O modelo separa casos reutilizáveis, planos por referência e tentativas com snapshot imutável.
- Edições criam revisões; tentativas e relatórios históricos não podem mudar silenciosamente.
- O armazenamento deve ser portável por backup JSON e, quando aplicável, por arquivos versionáveis em Git.
- A aplicação deve preservar o uso individual simples e o uso em equipe sem exigir duas experiências distintas.
- O produto deve permanecer genérico: conteúdo, regras e integrações específicas de uma empresa não fazem parte do núcleo público.
- Automação e integrações externas são complementares; a execução manual continua funcional sem elas.
- Decisões ainda marcadas como pendentes em `specs/qa-flow-v2/05-decisoes-para-revisao.md` não devem ser tratadas como compromissos confirmados sem nova aprovação.

## Brand Commitments

- Nome do produto: QA Flow.
- Distribuição open source pelo GitHub.
- Posicionamento genérico para profissionais e equipes de QA; a identidade e a comunicação não devem pressupor uma empresa, processo ou ferramenta corporativa específica.

## Evidence on Hand

- `README.md`: descrição da implementação atual, modelo mental, persistência, migração e desenvolvimento.
- `specs/qa-flow-v2/01-especificacao-produto.md`: visão, personas, jornada, requisitos e métricas pretendidas.
- `specs/qa-flow-v2/02-arquitetura-dados.md`: contratos, snapshots, armazenamento e invariantes de integridade.
- `specs/qa-flow-v2/03-especificacao-ux.md`: fluxos, estados, responsividade e acessibilidade esperados.
- `src/`: implementação web existente dos fluxos principais.
- Não há depoimentos, clientes, benchmarks comerciais ou provas externas confirmadas; trabalhos futuros não devem inventá-los.

## Product Principles

1. **Histórico confiável:** uma alteração futura nunca redefine silenciosamente o que aconteceu em uma tentativa anterior.
2. **Propriedade e portabilidade:** os dados pertencem ao usuário e podem ser guardados, exportados e versionados sem servidor obrigatório.
3. **Um produto para uso individual e em equipe:** o mesmo modelo mental deve servir ao navegador local e à colaboração por Git.
4. **Clareza operacional:** o QA deve sempre entender o estado atual, o próximo passo e o que ainda falta para concluir o trabalho.
5. **Complexidade sob demanda:** recursos avançados devem estar disponíveis sem tornar o primeiro uso ou a execução básica desnecessariamente complexos.

## Accessibility & Inclusion

- Meta WCAG 2.2 AA para os fluxos principais.
- Todas as ações críticas devem funcionar por teclado e possuir nome acessível.
- Status e significado não podem depender somente de cor ou ícone.
- Foco, progresso, erros e persistência devem ser previsíveis e anunciados adequadamente.
- Navegação e execução devem funcionar sem rolagem horizontal em 390 px; edições complexas podem ser organizadas em etapas em telas menores.
