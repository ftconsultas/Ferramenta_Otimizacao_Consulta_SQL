const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * SelectStarRule
 * Detecta o uso de 'SELECT *' que pode impactar a performance.
 *
 * Referência:
 * - MySQL 8.4 Reference Manual, "Optimization and Indexes" / "How MySQL Uses Indexes".
 *   A seleção explícita de colunas favorece leituras por índices de cobertura e
 *   reduz I/O, memória e tráfego de rede quando nem todas as colunas são necessárias.
 *   https://dev.mysql.com/doc/refman/8.4/en/mysql-indexes.html
 * - SCHWARTZ, B.; ZAITSEV, P.; TKACHENKO, V. High Performance MySQL. 3. ed.
 *   O'Reilly, 2012. Capítulo "Indexing for High Performance".
 */
class SelectStarRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_001',
            'Uso de SELECT *',
            'O uso de SELECT * recupera todas as colunas da tabela, o que pode causar overhead desnecessário de I/O e rede.',
            'LOW',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - How MySQL Uses Indexes',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/mysql-indexes.html'
                },
                ReferenceCatalog.unbIndexes,
                {
                    title: 'High Performance MySQL, 3rd ed. - Indexing for High Performance'
                }
            ]
        );
    }

    check(queryModel) {
        const hasSelectStar = queryModel.columns.some(col => col === '*' || col.column === '*');

        if (hasSelectStar) {
            return new RuleResult(
                this,
                'Foi detectado o uso de curinga (*) na projeção de colunas.',
                'Especificar apenas as colunas necessárias pode melhorar o desempenho ao reduzir o volume de dados trafegados em memória/rede e favorecer o uso de índices de cobertura (Covering Indexes). Exemplo: Em vez de "SELECT * FROM tabela", prefira "SELECT id, nome, valor FROM tabela".'
            );
        }

        return null;
    }
}

module.exports = SelectStarRule;
