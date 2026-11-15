## Requisitos Não Funcionais

Nesta seção são apresentados os requisitos não funcionais levantados para o trabalho.

| ID    | Requisito | Critério de Aceitação |
|-------|----------|----------------------|
| RNF01 | Tempo de Resposta da Análise Heurística | A análise simples (UC01) deve ser concluída em menos de 2 segundos para consultas de até 500 caracteres, em hardware com CPU ≥ 2.0 GHz e memória RAM ≥ 8 GB. |
| RNF02 | Renderização de Diagramas | O diagrama visual do plano de execução (UC07) deve ser renderizado integralmente em menos de 2 segundos para planos com até 10 operações (nós), após a coleta correta do plano de execução do SGBD. |
| RNF03 | Armazenamento de Credenciais | Todas as senhas e credenciais armazenadas localmente devem ser protegidas com criptografia AES-256 ou superior, aplicada em armazenamento persistente e memória temporária. |
| RNF04 | Compatibilidade com SGBD | O sistema deve ser compatível com MySQL 8.0 ou superior, utilizando recursos modernos de plano de execução (EXPLAIN em formato JSON). |
| RNF05 | Suporte a Planos de Execução Complexos | O sistema deve processar planos de execução nos formatos JSON ou texto provenientes do MySQL com profundidade de até 10 níveis de subqueries ou joins aninhados. |
| RNF06 | Compatibilidade com Sistemas Operacionais | O sistema deve ser executável nas plataformas Windows 10 (64-bit) ou superior, distribuições Linux com kernel 5.4 ou superior (Ubuntu 20.04 LTS ou equivalente) e macOS 12 (Monterey) ou superior. |