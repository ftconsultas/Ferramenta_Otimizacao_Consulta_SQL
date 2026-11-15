const { HeuristicRule, RuleResult } = require('./HeuristicRule');

/**
 * DistinctOrderByRule
 * Alerta sobre a combinação de DISTINCT com ORDER BY em colunas ausentes da projeção SELECT.
 * 
 * Referência Teórica (TCC):
 * - MySQL 8.4 Reference Manual, Section 10.2.1.18 "DISTINCT Optimization".
 *   O uso de DISTINCT em conjunto com ORDER BY referenciando colunas que não estão na lista de projeção (SELECT)
 *   exige obrigatoriamente a criação de uma Tabela Temporária para a desduplicação antes da ordenação.
 *   https://dev.mysql.com/doc/refman/8.4/en/distinct-optimization.html
 */
class DistinctOrderByRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_015',
            'DISTINCT com ORDER BY em Coluna Não Projetada',
            'Identifica o uso de DISTINCT ordenando por colunas que não foram incluídas na projeção SELECT, forçando a criação de tabela temporária.',
            'HIGH',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - DISTINCT Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/distinct-optimization.html'
                }
            ]
        );
    }

    check(queryModel) {
        if (!queryModel.orderBy || !Array.isArray(queryModel.orderBy) || !queryModel.rawSql) return null;

        const isDistinct = /\bSELECT\s+DISTINCT\b/i.test(queryModel.rawSql);
        if (!isDistinct) return null;

        // Se SELECT *, não há colunas ausentes
        if (queryModel.columns.includes('*')) return null;

        const projectedColumns = queryModel.columns.map(c => typeof c === 'string' ? c.toLowerCase() : '');
        let missingColumns = [];

        queryModel.orderBy.forEach(item => {
            if (item.expr && item.expr.type === 'column_ref') {
                const colName = item.expr.column ? item.expr.column.toLowerCase() : '';
                if (colName && !projectedColumns.includes(colName)) {
                    missingColumns.push(colName);
                }
            }
        });

        if (missingColumns.length > 0) {
            return new RuleResult(
                this,
                `Uso de DISTINCT combinando ordenação por coluna(s) não selecionada(s): ${missingColumns.join(', ')}.`,
                'Ao utilizar DISTINCT com ORDER BY, incluir a coluna de ordenação na projeção SELECT (quando compatível com o resultado esperado) pode melhorar o desempenho ao evitar a criação de tabela temporária extra para desduplicação. Exemplo: Em vez de "SELECT DISTINCT nome FROM t ORDER BY data", considere "SELECT DISTINCT nome, data FROM t ORDER BY data".',
                ["DISTINCT", "ORDER\\s+BY", ...missingColumns]
            );
        }

        return null;
    }
}

module.exports = DistinctOrderByRule;
