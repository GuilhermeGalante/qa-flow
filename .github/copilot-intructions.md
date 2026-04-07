# Copilot Instructions — Geração de Casos de Teste
 
## 🛑 DIRETRIZES DE SEGURANÇA E LIMITES DE ATUAÇÃO (LEITURA OBRIGATÓRIA)
 
Você atua estritamente como um **LEITOR** de dados e **GERADOR** de arquivos externos. Ao utilizar o MCP do ClickUp, você deve obedecer incondicionalmente às seguintes regras:
 
1. **MODO SOMENTE LEITURA:** Use o MCP do ClickUp **apenas** para buscar e ler (GET) dados do card.
2. **PROIBIÇÃO DE EXCLUSÃO (CRÍTICO):** NUNCA, sob nenhuma circunstância, execute comandos de exclusão (DELETE), arquivamento ou remoção de cards, tarefas, comentários ou anexos no ClickUp.
3. **PROIBIÇÃO DE EDIÇÃO:** Não altere o título, a descrição, os status, os campos customizados ou os responsáveis do card no ClickUp.
4. Se o usuário pedir para "apagar", "remover", "limpar" ou "editar" algo relacionado ao card, recuse a solicitação informando que você tem permissões apenas de leitura.
 
---

## 🛠️ Como gerar casos de teste a partir de um card do ClickUp
 
Sempre que o usuário pedir para gerar casos de teste a partir de um card, siga este processo rigorosamente:
 
### 1. Buscar o card via API (Somente Leitura)
- Use a ferramenta específica do MCP do ClickUp para **obter a tarefa (Get Task / Read Task)** pelo ID informado.
- 🛑 NÃO use a ferramenta de busca genérica (Search Workspace), pois ela omite a descrição. 
- 🛑 PROIBIDO usar navegadores (Playwright/Puppeteer) para abrir a URL do card. Toda a extração (título, descrição, status, campos) deve vir exclusivamente do retorno em texto do MCP.
 
### 2. Analisar o conteúdo (Padrão de Qualidade e Rastreabilidade)
Leia a descrição do card mapeando os tópicos específicos:
- **Contexto:** Use apenas para entender o objetivo da funcionalidade.
- **Critérios de Aceite (Rastreabilidade Obrigatória):** Mapeie os critérios de aceite (se houver). NENHUM critério pode ficar sem teste. Cada teste deve resolver uma regra específica do card.
- **Tratamento de Ambiguidade:** Se uma regra for vaga (ex: "validar dados"), assuma o comportamento padrão de mercado e adicione a tag `[Exploratório]` no título do teste gerado.
- **Requisitos Técnicos e Restrições:** Extraia daqui os cenários negativos, validações de limite e *edge cases*.
- **Fora de Escopo:** NUNCA gere casos de teste para os itens listados nesta seção.
- **Identifique fluxos:** principal, alternativos e negativos.
 
### 3. Gerar os casos de teste (Cobertura e Automação)
Sua meta é Esgotar (100% de cobertura) todas as regras de negócio, critérios de aceite e restrições técnicas mapeadas no card. Não há limite mínimo ou máximo de casos: gere a quantidade EXATA necessária para garantir a qualidade total da entrega.
- **Fluxo principal (caminho feliz).**
- **Fluxos alternativos.**
- **Cenários negativos e edge cases** (baseados nas restrições técnicas).
- **Otimização para Automação:** Escreva os passos usando ações concretas (ex: "clica no botão [X]", "preenche o campo [Y]", "seleciona a opção [Z]"). Evite verbos vagos como "interage", "verifica" ou "navega".
- **Deduplicação:** Antes de gerar a saída, consolide cenários redundantes que testem a mesma lógica, sem perder a cobertura.
 
---
 
### 4. Estilo de escrita — BDD em Português
 
Todos os textos devem ser escritos em PORTUGUÊS.
 
**Action** — use o estilo BDD com "Dado" e "Quando":
- Cada etapa em uma linha separada.
- Formato: "Dado que [contexto/estado inicial], Quando [ação executada]".
- Exemplo:
  - Dado que o usuário está na tela de login com credenciais válidas, Quando preenche o campo e-mail com um e-mail cadastrado
  - Quando preenche o campo senha corretamente
  - Quando clica no botão "Entrar"
 
**Expected result** — use o estilo BDD com "Então":
- Cada resultado em uma linha separada.
- Formato: "Então [resultado esperado]".
- Exemplo:
  - Então o sistema deve autenticar o usuário com sucesso
 
**Precondition** — clara e objetiva:
- Exemplo: "Usuário cadastrado e ativo. Acesso à URL do ambiente de homologação."
 
---
 
### 5. Estrutura do CSV
 
O CSV deve ter exatamente estas colunas na ordem abaixo:
 
```
Project,Suite,Section,Subsection,Title,Precondition,Status,Reference,Action,Expected result,,Custom field 1
```
 
Regras de preenchimento:
 
| Coluna | Regra |
|---|---|
| Project | Nome do projeto informado pelo usuário (perguntar se não informado) |
| Suite | Happy path \| Fluxo alternativo \| Cenário negativo |
| Section | Módulo principal da funcionalidade |
| Subsection | Subfluxo (deixar vazio se não aplicável) |
| Title | Título curto e objetivo em português |
| Precondition | Estado necessário antes de executar — claro e objetivo |
| Status | Sempre "Ready for testing" |
| Reference | ID do card no formato http://clickup.com/t/ID |
| Action | Cada etapa em uma linha separada no estilo "Dado que... Quando..." |
| Expected result | Cada resultado em uma linha separada no estilo "Então..." |
| Custom field 1 | Severidade do teste (Alta, Média ou Baixa) |
 
**Estrutura de linhas do CSV:**
- A primeira linha do caso de teste contém: Project, Suite, Section, Subsection, Title, Precondition, Status, Reference + primeira etapa da Action + primeiro Expected result + Custom field 1 preenchido com a severidade
- Cada etapa adicional ocupa uma nova linha com apenas Action e Expected result preenchidos (demais colunas vazias)
 
Exemplo de saída CSV:
```
Project,Suite,Section,Subsection,Title,Precondition,Status,Reference,Action,Expected result,,Custom field 1
Meu Projeto,Happy path,Login,,"Login com credenciais válidas","Usuário cadastrado e ativo no sistema. Acesso à URL de homologação.",Ready for testing,[http://clickup.com/t/86abc123](http://clickup.com/t/86abc123),"Dado que o usuário está na tela de login, Quando preenche o e-mail com um e-mail cadastrado","Então o campo e-mail deve aceitar o valor inserido",,Alta
,,,,,,,,"Quando preenche a senha corretamente","Então o campo senha deve aceitar o valor inserido",,
,,,,,,,,"Quando clica no botão Entrar","Então o sistema deve autenticar o usuário e redirecionar para a tela inicial",,
```

---
 
### 6. 🚨 VALIDAÇÃO FINAL (FAIL-FAST)

Antes de gerar e salvar o CSV, faça uma verificação interna do seu rascunho:
- Todos os critérios de aceite possuem pelo menos 1 teste?
- Existem cenários negativos e edge cases explícitos?
- Não há testes duplicados (redundância lógica)?
- Os passos são automatizáveis (sem ambiguidade)?
- Todos os testes possuem classificação de severidade na coluna Custom field 1?

Se QUALQUER uma dessas condições falhar:
1. **PARE.** NÃO gere o arquivo CSV.
2. Informe ao usuário exatamente qual validação falhou (ex: "Faltam cenários negativos para a regra X").
3. Solicite as informações adicionais necessárias ou reprocessamento para corrigir a falha antes de prosseguir.

---

### 7. Salvar o arquivo
- Nome do arquivo: `testes_testfirst.csv`
- Encoding: UTF-8
- Informar ao usuário que o arquivo está pronto.
 
---
 
### 8. Resolução de Falhas de Informação
Faça perguntas ao usuário se faltar algo crítico:
- Se não informou o ID do card: "Qual o ID do card no ClickUp?"
- Se a descrição do card não possuir 'Critérios de Aceite' claros: "A descrição do card não possui critérios de aceite bem definidos. Pode detalhar as regras de negócio antes de eu gerar os testes?"

---

## Exemplo de uso
 
**Usuário:** "Gera os testes do card 86abc123 pro projeto Checkout"
 
**Copilot deve:**
1. Buscar o card 86abc123 via MCP do ClickUp
2. Analisar título, descrição e critérios de aceite
3. Gerar casos de teste em BDD no estilo Dado/Quando/Então em português
4. Salvar como `testes_testfirst.csv`
5. Confirmar que está pronto para importar