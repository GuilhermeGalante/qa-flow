# 🚀 QA Flow - Test Management System

Um Sistema de Gestão de Testes (TMS) moderno, rápido e seguro, focado em alta produtividade para analistas de Qualidade (QA). O QA Flow permite a criação de planos de testes, execução de cenários com rastreabilidade detalhada, gestão de status e exportação profissional de relatórios em PDF.

## 🏗️ Arquitetura e Segurança (Local-First)

Este projeto foi construído sob o paradigma **Local-First Architecture**. Isso significa que a aplicação funciona inteiramente no navegador do usuário, sem a necessidade de um servidor back-end ou banco de dados em nuvem.

* **Zero Latência:** Como não há requisições de rede (API), a interface responde instantaneamente.
* **Privacidade e Segurança:** Os dados não trafegam na internet. Isso mitiga riscos comuns do OWASP Top 10 (como Broken Access Control ou vazamento de dados).
* **IndexedDB:** Utilizamos o banco de dados nativo do navegador para armazenamento assíncrono e persistente. Ele suporta o armazenamento de imagens em alta qualidade (Base64) sem estourar os limites de cota tradicionais do `localStorage`.

## ✨ Funcionalidades Implementadas

* **Dashboard de Planos de Teste:** Visão geral e gerencial de todos os testes criados, com barra de progresso de execução.
* **Test Runner (Execução Avançada):**
  * Passos (Steps) independentes com status visuais (`Passed`, `Failed`, `Untested`, `Paused`).
  * Inserção de Comentários e Evidências (imagens) por passo.
  * Lógica de *Toggle* (clique duplo para reverter status).
  * Design limpo com *Progressive Disclosure* (campos ocultos até serem requisitados).
* **Exportação Profissional (PDF):**
  * **Relatório Executivo:** Documento gerencial focado em estatísticas, taxa de aprovação e status geral (ideal para POs e Gerentes).
  * **Relatório Técnico (Evidências):** Documento detalhado contendo a rastreabilidade completa (Dado/Quando/Então), comentários de falha e capturas de tela (prints) em alta resolução (ideal para Desenvolvedores).
* **Gestão de Relatórios:** Histórico de relatórios gerados com funcionalidade de exclusão e barra de progresso de aprovação.

## 🛠️ Tecnologias Utilizadas

* **Front-end:** React, TypeScript.
* **Estilização:** Tailwind CSS (Design System com layout flexível e Sidebar).
* **Gerenciamento de Estado:** Zustand.
* **Persistência de Dados:** `idb-keyval` e middleware `persist` (Zustand + IndexedDB).
* **Geração de PDF:** `@react-pdf/renderer`.

## ⚠️ Atenção Usuários: Cuidados Importantes

Como o QA Flow utiliza uma arquitetura Local-First, os seus dados ficam salvos **exclusivamente no disco rígido do computador e navegador que você está usando**. 

Para evitar perda de dados, siga estas diretrizes rigorosamente:

1. **Não limpe os dados do navegador:** Evite usar softwares de limpeza profunda (como CCleaner) ou limpar os dados de site/cookies do seu navegador para esta URL. Isso **apagará** todo o seu banco de dados local (IndexedDB).
2. **Abas Anônimas (Incognito):** O sistema funciona em abas anônimas, porém, **assim que a janela for fechada, todos os testes e relatórios serão perdidos para sempre**. Use apenas abas normais para trabalho contínuo.
3. **Migração de Máquina:** Os testes criados no "Computador A" não aparecerão no "Computador B".
4. **Desempenho com Imagens:** O sistema suporta imagens em alta qualidade (100% PNG Lossless). No entanto, dezenas de prints pesados (telas 4K) no mesmo Plano de Testes podem tornar a geração do PDF Técnico levemente mais lenta. Mantenha as evidências focadas no necessário.

## 🚀 Como Executar o Projeto Localmente

1. Clone este repositório:
   ```bash
   git clone [https://github.com/GuilhermeGalante/qa-flow.git](https://github.com/GuilhermeGalante/qa-flow.git)
   ```

2. Instale as dependências:
   ```bash
   npm install
   # ou
   yarn install
   ```

3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   # ou
   yarn dev
   ```

4. Acesse `http://localhost:5173` (ou a porta indicada) no seu navegador.