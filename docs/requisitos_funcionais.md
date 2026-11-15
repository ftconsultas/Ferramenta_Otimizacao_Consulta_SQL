| ID   | Nome                              | Descrição | Prioridade | UC Origem |
|------|----------------------------------|----------|------------|----------|
| RF01 | Análise SQL sem Conexão | O sistema deve permitir a inserção e análise de consultas SQL baseado em heurísticas e boas práticas sem necessidade de conexão com banco de dados. | Alta | UC01 |
| RF02 | Identificação de Más Práticas | O sistema deve identificar padrões de escrita que violam boas práticas (ex: SELECT *, falta de índices). | Alta | UC01 |
| RF03 | Configuração de Conexão Local | O sistema deve permitir a configuração e salvamento local de credenciais (host, porta, usuário, senha, DB) para o MySQL. | Média | UC05 |
| RF04 | Teste de Conexão SGBD | O sistema deve validar as credenciais informadas através de um teste de conexão antes de salvar. | Média | UC05 |
| RF05 | Análise com Plano de Execução | O sistema deve obter e processar o plano de execução real do MySQL para identificar gargalos de desempenho e custos. | Alta | UC02 |
| RF06 | Apresentação de Sugestões | O sistema deve apresentar as sugestões de otimização em interface gráfica organizada em lista, com identificação visual por nível de prioridade e descrição. | Alta | UC03 |
| RF07 | Recurso Educacional | O sistema deve fornecer explicações sobre os motivos técnicos de cada sugestão e seu impacto no desempenho. | Alta | UC04 |
| RF08 | Evolução do Plano de Execução | O sistema deve permitir a visualização comparativa (lado a lado) entre o plano de execução atual e plano de execução anterior. | Média | UC06 |
| RF09 | Destaque de Métricas de Custo | O sistema deve destacar campos críticos no plano de execução, como custo total e linhas estimadas. | Média | UC06 |
| RF10 | Geração de Diagrama Visual | O sistema deve converter a estrutura lógica do plano de execução em um diagrama visual. | Alta | UC07 |
| RF11 | Tratamento de Erros SQL/Conexão | O sistema deve capturar e exibir mensagens amigáveis para falhas de conexão, erros sintáticos de SQL e tabelas inexistentes. | Alta | UC01, UC02 |