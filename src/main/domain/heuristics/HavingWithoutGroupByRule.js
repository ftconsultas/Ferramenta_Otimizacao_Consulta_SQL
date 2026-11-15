const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * HavingWithoutGroupByRule
 * Detecta presença da cláusula HAVING validando se na mesma consulta não há presença de GROUP BY.
 * 
 * Referência Teórica (TCC):
 * - ELMASRI, R., NAVATHE, S. B. Sistemas de Banco de Dados. 7. ed. Pearson Education, 2018.
 * - SCHWARTZ et al. "High Performance MySQL" (Fases de execução da consulta).
 * - MySQL 8.4 Reference Manual, "SELECT Statement" e "GROUP BY Optimization".
 *   HAVING é aplicado a resultados agrupados; filtros não agregados tendem a ser
 *   mais seletivos quando expressos no WHERE.
 *   https://dev.mysql.com/doc/refman/8.4/en/select.html
 *   https://dev.mysql.com/doc/refman/8.4/en/group-by-optimization.html
 * - Cláusulas row-level individuais aplicadas no HAVING impedem "Index Pushdown". Filtros que não usam agregação devem ficar no WHERE.
 */
class HavingWithoutGroupByRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_008',
            'HAVING sem existência de GROUP BY',
            'Cláusula HAVING utilizada isoladamente processa filtros pós-resultados sem chance de alavancar B-Tree Indexes.',
            'MEDIUM',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - SELECT Statement',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/select.html'
                },
                {
                    title: 'MySQL 8.4 Reference Manual - GROUP BY Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/group-by-optimization.html'
                },
                ReferenceCatalog.unbIndexes,
                ReferenceCatalog.unbQueryOptimization
            ]
        );
    }

    _containsAggregate(node) {
        if (!node) return false;
        if (node.type === 'aggr_func') return true;
        return Boolean(
            (node.left && this._containsAggregate(node.left)) ||
            (node.right && this._containsAggregate(node.right)) ||
            (node.expr && this._containsAggregate(node.expr))
        );
    }

    check(queryModel) {
        if (queryModel.having && !queryModel.groupBy && !this._containsAggregate(queryModel.having)) {
            return new RuleResult(
                this,
                'Cláusula HAVING sem função de agregação foi detectada em uma consulta que não utiliza GROUP BY.',
                'Mover condições escalares (que não dependem de agregação) do HAVING para a cláusula WHERE pode melhorar o desempenho, pois permite filtrar linhas antecipadamente com apoio de índices B-Tree. Exemplo: Em vez de "HAVING valor > 100" sem GROUP BY, prefira "WHERE valor > 100".',
                ["HAVING\\s+.*?(?:ORDER|LIMIT|$)"]
            );
        }

        return null;
    }
}

module.exports = HavingWithoutGroupByRule;
