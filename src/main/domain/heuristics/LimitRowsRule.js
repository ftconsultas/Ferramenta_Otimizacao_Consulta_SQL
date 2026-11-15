const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * LimitRowsRule
 * Detecta a ausência de uma cláusula LIMIT que pode resultar em excesso de dados trafegados.
 *
 * Referência:
 * - MySQL 8.4 Reference Manual, "LIMIT Query Optimization".
 *   Quando apenas uma quantidade limitada de linhas é necessária, LIMIT evita
 *   buscar todo o resultado e descartar linhas excedentes na aplicação.
 *   https://dev.mysql.com/doc/refman/8.4/en/limit-optimization.html
 */
class LimitRowsRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_017',
            'Ausência de LIMIT',
            'A consulta não possui uma cláusula LIMIT. Buscar muitos registros pode tornar a consulta lenta e consumir recursos excessivos.',
            'LOW',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - LIMIT Query Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/limit-optimization.html'
                },
                ReferenceCatalog.unbQueryOptimization
            ]
        );
    }

    check(queryModel) {
        const hasLimitInRawSql = queryModel.rawSql && /\blimit\s+\d+/i.test(queryModel.rawSql);

        const isGlobalAggregation = !queryModel.groupBy
            && Array.isArray(queryModel.columns)
            && queryModel.columns.length > 0
            && queryModel.columns.every(col => col && col.expr && col.expr.type === 'aggr_func');

        if (queryModel.type === 'SELECT' && !queryModel.limit && !hasLimitInRawSql && !isGlobalAggregation) {
            return new RuleResult(
                this,
                'A consulta SELECT não limita o número de linhas retornadas.',
                'Adicionar a cláusula LIMIT quando apenas uma amostra ou página de registros for necessária pode melhorar o tempo de resposta e reduzir o consumo de memória e rede. Exemplo: Adicione "LIMIT 100" ao final da consulta.'
            );
        }

        return null;
    }
}

module.exports = LimitRowsRule;
