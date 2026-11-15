# Documentação de Arquitetura

Este documento descreve a arquitetura técnica do projeto, que tem separação de responsabilidades para garantir escalabilidade e manutenibilidade.

## 1. Visão Geral (Camadas)

O projeto é dividido em quatro camadas principais, separando a interface do usuário da lógica de negócio e da infraestrutura.

### Renderer (Front-End) - `src/renderer/`
Responsável pela interface gráfica desenvolvida em HTML/CSS/JS.
- **Responsabilidade**: Coletar SQL do usuário, exibir resultados de análise, renderizar diagramas e prover feedback visual.
- **Restrição**: Nunca acessa o banco de dados ou arquivos diretamente. Comunica-se exclusivamente via **IPC (Inter-Process Communication)**.

### Application Layer - `src/main/application/`
Atua como orquestradora dos casos de uso (UC01 a UC07).
- **Responsabilidade**: Coordenar o fluxo entre o parsing, a execução da heurística e a geração de sugestões.
- **Restrição**: Não contém lógica de negócio SQL pesada, apenas coordenação.

### Infrastructure Layer - `src/main/infrastructure/`
Lida com as tecnologias externas.
- **Portabilidade**: Utiliza uma interface `IDatabaseDriver` para permitir que o sistema se conecte ao MySQL de forma transparente.

---

## 2. Funcionamento do Motor de Análise

O motor de análise é agnóstico a banco de dados. Ele opera em um fluxo de pipeline onde os dados brutos de cada motor são normalizados.

### Abstração de Planos de Execução
Como cada SGBD possui formatos de `EXPLAIN` diferentes, o sistema utiliza **Plan Analyzers** específicos:

1.  **MySQLPlanAnalyzer**: Converte o JSON do MySQL (cláusulas como `nested_loop`, `table_scan`) para o nosso `ExecutionPlanModel`.

Isso permite que as **regras de otimização** sejam escritas uma única vez, olhando apenas para o modelo unificado.

### Fluxo de Processamento (Pipeline)

1.  **Entrada (Raw SQL)**: O SQL bruto chega via IPC ao Main Process.
2.  **Parsing (SQL to AST)**: O módulo `parser/` converte o SQL em uma Árvore de Sintaxe Abstrata (usando `node-sql-parser`).
3.  **Normalização (AST to QueryModel)**: O sistema converte a AST técnica em um `QueryModel` simplificado e padronizado, facilitando a aplicação de regras.
4.  **Análise Estática (Heuristic Engine)**:
    - O `RuleEngine` percorre todas as regras carregadas em `domain/heuristics/`.
    - Cada regra avalia o `QueryModel` sem precisar de conexão com o banco.
5.  **Análise Dinâmica (Plan Analyzer)** - *Sprint 3+:*
    - Se houver conexão ativa, o sistema dispara um `EXPLAIN FORMAT=JSON` no MySQL.
    - O resultado é mapeado para um `ExecutionPlanModel`.
    - Regras específicas de plano (Ex: *Full Table Scan*) são aplicadas.
6.  **Agregação (Suggestion Engine)**: Compila os `RuleResult` de ambas as análises, remove duplicatas e gera sugestões ordenadas por impacto.
7.  **Saída (Suggestions)**: O resultado final é enviado de volta ao Renderer.

## 3. Comunicação (IPC)

A comunicação entre o processo principal e a renderização é centralizada em `src/main/ipc/`.
- Os handlers são separados por domínio.
- O arquivo `handlers.js` gerencia as chamadas assíncronas, garantindo que o `main.js` permaneça focado na configuração do ciclo de vida do Electron.

---

## 4. Estrutura de Pastas

```text
src/
 ├── main/
 │    ├── application/          # Orquestradores de casos de uso
 │    ├── domain/               # Lógica de negócio (Parser, Heurísticas, Models)
 │    ├── infrastructure/       # Drivers (MySQL) e Persistência
 │    └── ipc/                  # Handlers de comunicação
 ├── renderer/
 │    ├── components/           # Componentes UI reutilizáveis
 │    ├── pages/                # Telas (Home, Análise, Diagrama)
 │    └── styles/               # CSS e Temas
```
