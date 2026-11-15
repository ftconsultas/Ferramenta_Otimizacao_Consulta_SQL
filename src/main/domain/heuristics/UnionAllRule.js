const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * UnionAllRule
 * Sugere o uso de UNION ALL em vez de UNION para evitar o overhead de remoção de duplicatas.
 *
 * Referência:
 * - MySQL 8.4 Reference Manual, "UNION Clause".
 *   UNION DISTINCT é o comportamento padrão de UNION e remove duplicatas; UNION ALL
 *   preserva todas as linhas e evita o custo dessa deduplicação quando ela é desnecessária.
 *   https://dev.mysql.com/doc/refman/8.4/en/union.html
 * - MySQL 8.4 Reference Manual, "DISTINCT Optimization".
 *   DISTINCT pode exigir ordenação ou tabela temporária, especialmente combinado com ORDER BY.
 *   https://dev.mysql.com/doc/refman/8.4/en/distinct-optimization.html
 */
class UnionAllRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_005',
            'Uso de UNION',
            'O operador UNION remove duplicatas, o que exige uma operação de ordenação/hash adicional custosa.',
            'LOW',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - UNION Clause',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/union.html'
                },
                {
                    title: 'MySQL 8.4 Reference Manual - DISTINCT Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/distinct-optimization.html'
                },
                ReferenceCatalog.unbQueryOptimization
            ]
        );
    }

    check(queryModel) {
        if (queryModel.setOp && ['union', 'union distinct'].includes(queryModel.setOp.toLowerCase())) {
            return new RuleResult(
                this,
                'Foi detectado o uso de UNION (com remoção implícita de duplicatas).',
                'Utilizar UNION ALL em vez de UNION quando a remoção de linhas duplicadas não for necessária pode melhorar o desempenho ao evitar a criação de tabela temporária e etapa de desduplicação. Exemplo: Em vez de "SELECT id FROM t1 UNION SELECT id FROM t2", considere "SELECT id FROM t1 UNION ALL SELECT id FROM t2".'
            );
        }

        return null;
    }
}

module.exports = UnionAllRule;
