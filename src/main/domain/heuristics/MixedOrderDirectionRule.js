const { HeuristicRule, RuleResult } = require('./HeuristicRule');

/**
 * MixedOrderDirectionRule
 * Alerta sobre a mistura de ordenação ASC e DESC em ORDER BY composto.
 * 
 * Referência Teórica (TCC):
 * - MySQL 8.4 Reference Manual, Section 10.2.1.16 "ORDER BY Optimization" / Section 10.3.13 "Descending Indexes".
 *   Em ORDER BY composto com direções mistas (ex: ORDER BY a ASC, b DESC), o MySQL só consegue aproveitar um índice B-Tree
 *   se ele tiver sido explicitamente criado com direções correspondentes (Descending Index). Caso contrário, força Filesort.
 *   https://dev.mysql.com/doc/refman/8.4/en/order-by-optimization.html
 */
class MixedOrderDirectionRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_009',
            'Mistura de Direções (ASC/DESC) no ORDER BY Composto',
            'Identifica ordenações compostas com direções alternadas (ASC e DESC), o que exige índices descendentes dedicados para evitar a etapa de Filesort.',
            'MEDIUM',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - ORDER BY Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/order-by-optimization.html'
                },
                {
                    title: 'MySQL 8.4 Reference Manual - Descending Indexes',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/descending-indexes.html'
                }
            ]
        );
    }

    check(queryModel) {
        if (!queryModel.orderBy || !Array.isArray(queryModel.orderBy) || queryModel.orderBy.length < 2) {
            return null;
        }

        const directions = queryModel.orderBy.map(item => item.type ? item.type.toUpperCase() : 'ASC');
        const hasAsc = directions.includes('ASC');
        const hasDesc = directions.includes('DESC');

        if (hasAsc && hasDesc) {
            return new RuleResult(
                this,
                `Uso de direções mistas (${directions.join(', ')}) detectado na cláusula ORDER BY composto.`,
                'Padronizar a direção das colunas no ORDER BY composto ou criar um índice descendente compatível (MySQL 8.0+) pode melhorar o desempenho ao evitar uma etapa extra de Filesort. Exemplo: Em vez de "ORDER BY col1 ASC, col2 DESC", considere "ORDER BY col1 ASC, col2 ASC" (se atender à regra de negócio) ou declare um índice "INDEX(col1 ASC, col2 DESC)".',
                ["ORDER\\s+BY", "ASC", "DESC"]
            );
        }

        return null;
    }
}

module.exports = MixedOrderDirectionRule;
