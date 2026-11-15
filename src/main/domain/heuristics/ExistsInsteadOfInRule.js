const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * ExistsInsteadOfInRule
 * Sugere o uso de EXISTS em vez de IN para subconsultas, especialmente com grandes volumes de dados.
 *
 * Referência:
 * - MySQL 8.4 Reference Manual, "Optimizing Subqueries, Derived Tables,
 *   View References, and Common Table Expressions".
 *   O otimizador possui estratégias específicas para predicados IN/EXISTS,
 *   incluindo semijoin, antijoin, materialização e estratégia EXISTS.
 *   https://dev.mysql.com/doc/refman/8.4/en/subquery-optimization.html
 * - KARWIN, Bill. SQL Antipatterns. Pragmatic Bookshelf, 2010.
 */
class ExistsInsteadOfInRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_012',
            'Uso de IN com subconsulta',
            'O operador IN com subconsulta pode ser menos eficiente que o EXISTS, pois o banco pode processar toda a lista antes da comparação.',
            'LOW',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - Subquery Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/subquery-optimization.html'
                },
                ReferenceCatalog.unbQueryOptimization,
                {
                    title: 'SQL Antipatterns - Bill Karwin'
                }
            ]
        );
    }

    check(queryModel) {
        if (!queryModel.where) return null;

        const subqueriesInFound = [];
        this._findSubqueriesIn(queryModel.where, subqueriesInFound);

        if (subqueriesInFound.length > 0) {
            return new RuleResult(
                this,
                'Foi detectado o uso de operador IN / NOT IN com uma subconsulta.',
                'Avaliar o uso de EXISTS / NOT EXISTS (ou INNER JOIN com condição ON explícita) em vez de IN com subconsulta pode melhorar o desempenho em cenários onde o otimizador não aplica Semijoin automaticamente, além de evitar armadilhas com valores NULL no NOT IN. Exemplo: Em vez de "WHERE id IN (SELECT t1_id FROM t2)", considere "WHERE EXISTS (SELECT 1 FROM t2 WHERE t2.t1_id = t1.id)" (sempre correlacionando as chaves para evitar retorno indevido).'
            );
        }

        return null;
    }

    _findSubqueriesIn(node, found) {
        if (!node) return;

        if (node.type === 'binary_expr' && ['IN', 'NOT IN'].includes(String(node.operator || '').toUpperCase())) {
            const right = node.right;
            if (right && right.type === 'expr_list' && Array.isArray(right.value) && right.value.some(v => v && v.ast)) {
                found.push(node);
            }
        }

        if (node.ast) this._findSubqueriesIn(node.ast, found);
        if (node.where) this._findSubqueriesIn(node.where, found);
        if (node.left) this._findSubqueriesIn(node.left, found);
        if (node.right) {
            if (Array.isArray(node.right.value)) {
                node.right.value.forEach(v => {
                    if (v && v.ast) this._findSubqueriesIn(v.ast, found);
                });
            } else if (node.right.type === 'binary_expr') {
                this._findSubqueriesIn(node.right, found);
            }
        }
    }
}

module.exports = ExistsInsteadOfInRule;
