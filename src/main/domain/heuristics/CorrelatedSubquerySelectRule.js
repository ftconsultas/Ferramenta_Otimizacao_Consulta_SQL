const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * CorrelatedSubquerySelectRule
 * Acusa "Scallar Subqueries" presentes no SELECT como origem linear do problema de N+1 Queries subjacentes.
 * 
 * Referência Teórica (TCC):
 * - KARWIN, Bill. SQL Antipatterns. Capítulo 16 "Fear of the Unknown".
 * - MySQL 8.4 Reference Manual, "Optimizing Subqueries, Derived Tables,
 *   View References, and Common Table Expressions".
 *   https://dev.mysql.com/doc/refman/8.4/en/subquery-optimization.html
 * - MySQL 8.4 Reference Manual, "Derived Condition Pushdown Optimization".
 *   https://dev.mysql.com/doc/refman/8.4/en/derived-condition-pushdown-optimization.html
 * - Subconsultas atreladas escalares num SELECT demandam chamadas recursivas individuais da engine paralela corrompendo performance vetorial.
 */
class CorrelatedSubquerySelectRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_011',
            'Subquery no SELECT (N+1 oculto)',
            'Identifica uma consulta interna aninhada direto na cláusula de projeção SELECT, forçando execução escalar dependente.',
            'HIGH',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - Subquery Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/subquery-optimization.html'
                },
                {
                    title: 'MySQL 8.4 Reference Manual - Derived Condition Pushdown Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/derived-condition-pushdown-optimization.html'
                },
                ReferenceCatalog.unbQueryOptimization
            ]
        );
    }

    _findCorrelatedSubqueryInWhere(node) {
        if (!node) return false;

        if (node.type === 'binary_expr' && !['IN', 'NOT IN'].includes(String(node.operator || '').toUpperCase())) {
            const subAst = (node.right && node.right.ast) || (node.left && node.left.ast);
            if (subAst && subAst.type === 'select' && subAst.where) {
                const innerTables = new Set();
                if (Array.isArray(subAst.from)) {
                    subAst.from.forEach(f => {
                        if (f.table) innerTables.add(String(f.table).toLowerCase());
                        if (f.as) innerTables.add(String(f.as).toLowerCase());
                    });
                }
                if (this._referencesOuterTable(subAst.where, innerTables)) {
                    return true;
                }
            }
        }

        return Boolean(
            (node.left && this._findCorrelatedSubqueryInWhere(node.left)) ||
            (node.right && this._findCorrelatedSubqueryInWhere(node.right)) ||
            (node.expr && this._findCorrelatedSubqueryInWhere(node.expr))
        );
    }

    _referencesOuterTable(node, innerTables) {
        if (!node) return false;
        if (node.type === 'column_ref' && node.table) {
            if (!innerTables.has(String(node.table).toLowerCase())) {
                return true;
            }
        }
        return Boolean(
            (node.left && this._referencesOuterTable(node.left, innerTables)) ||
            (node.right && this._referencesOuterTable(node.right, innerTables)) ||
            (node.expr && this._referencesOuterTable(node.expr, innerTables))
        );
    }

    check(queryModel) {
        if (!queryModel) return null;

        let hasSubqueryInSelect = false;

        if (Array.isArray(queryModel.columns)) {
            for (const col of queryModel.columns) {
                if (typeof col === 'object' && col !== null) {
                    if (col.expr && col.expr.ast && col.expr.ast.type === 'select') {
                        hasSubqueryInSelect = true;
                        break;
                    }
                }
            }
        }

        const hasCorrelatedInWhere = this._findCorrelatedSubqueryInWhere(queryModel.where);

        if (hasSubqueryInSelect || hasCorrelatedInWhere) {
            return new RuleResult(
                this,
                'Foi detectada uma subconsulta escalar/correlacionada que pode provocar execuções repetidas por linha (comportamento N+1).',
                'Reescrever a subconsulta utilizando um JOIN explícito com GROUP BY na chave primária (ou tabela derivada pré-agregada com JOIN) pode melhorar significativamente o desempenho. Atenção: declare sempre a condição de relacionamento na cláusula ON (ex: "LEFT JOIN t2 ON t2.t1_id = t1.id GROUP BY t1.id") para não gerar um Produto Cartesiano (N x M) nem tabela temporária desnecessária.',
                hasSubqueryInSelect
                    ? ["SELECT\\s+.*\\(SELECT\\s.*\\)\\s*(?:AS\\s+\\w+)?"]
                    : ["\\(\\s*SELECT\\s+.*?\\)"]
            );
        }

        return null;
    }
}

module.exports = CorrelatedSubquerySelectRule;
