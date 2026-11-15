# Ferramenta educacional para otimização de consultas SQL

Aplicação desktop educacional desenvolvida em Electron, Node.js e JavaScript para apoiar estudantes e desenvolvedores iniciantes na análise estática de consultas SQL (via Árvore de Sintaxe Abstrata - AST) e na interpretação visual e comparativa de planos de execução reais (`EXPLAIN ANALYZE`) no MySQL 8.0/8.4.

---

## Pré-requisitos de Ambiente

- **[Node.js](https://nodejs.org/)** (versão 20 LTS ou superior) e `npm` (necessários apenas para execução a partir do código-fonte).
- **[MySQL Server](https://dev.mysql.com/downloads/mysql/)** (versão 8.0.18+ ou 8.4 LTS) em execução local (`localhost`), necessário exclusivamente para o **Modo Detalhado** (`EXPLAIN ANALYZE`). O **Modo Simples** funciona de forma totalmente *offline*.

---

## Como Executar

### 1. Via Pacotes Executáveis (Sem precisar instalar o Node.js)

Baixe o pacote correspondente ao seu sistema operacional na [página de Releases](https://github.com/ftconsultas/Ferramenta_Otimizacao_Consulta_SQL/releases/tag/v1.0.0):
- **Windows (10/11 x64):** `Ferramenta_educacional_para_otimizacao_de_consultas_SQL-Windows-x64.zip`
- **Linux (x86_64):** `Ferramenta_educacional_para_otimizacao_de_consultas_SQL-Linux-x86_64.AppImage`, `.deb` ou `.tar.gz`
- **macOS (12+ x64):** `Ferramenta_educacional_para_otimizacao_de_consultas_SQL-macOS-x64.zip`

### 2. Via Código-Fonte

```bash
# 1. Clonar o repositório
git clone https://github.com/ftconsultas/Ferramenta_Otimizacao_Consulta_SQL.git
cd Ferramenta_Otimizacao_Consulta_SQL

# 2. Instalar as dependências
npm install

# 3. Iniciar a aplicação
npm start
```

---

## Configurando o MySQL Local para o Modo Detalhado

1. Certifique-se de que o serviço do MySQL Server está ativo na máquina local (porta padrão `3306`) e possui um banco de dados criado.
2. Na interface da ferramenta, acesse a aba **Configurações** no menu lateral.
3. Preencha os dados da sua conexão local (`Host`: `localhost`, `Porta`: `3306`, `Usuário`, `Senha` e nome do `Banco de Dados`).
4. Clique em **Testar Conexão** e, após a confirmação, clique em **Salvar Configurações**.
5. Acesse a aba **Plano de Execução (Modo Detalhado)**, insira sua consulta SQL e clique em **Analisar Plano Real**.

---

## Executando os Testes Automatizados

Para executar as 12 suítes e 197 testes automatizados (Jest + `jsdom`) com relatório de cobertura:

```bash
npm test
```
