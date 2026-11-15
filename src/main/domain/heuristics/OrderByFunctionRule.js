const { HeuristicRule, RuleResult } = require('./HeuristicRule');

/**
 * OrderByFunctionRule
 * Alerta sobre a aplicação de funções/expressões em colunas no ORDER BY, desativando a ordenação via índice.
 * 
 * Referência Teórica (TCC):
 * - MySQL 8.4 Reference Manual, Section 10.2.1.16 "ORDER BY Optimization" - Use of filesort to Satisfy ORDER BY.
 *   Aplicar funções em colunas no ORDER BY (ex: ORDER BY ABS(col) ou -col) impede a ordenação direta via índice B-Tree,
 *   obrigando o motor a executar a fase de Filesort O(N log N).
 *   https://dev.mysql.com/doc/refman/8.4/en/order-by-optimization.html
 */
class OrderByFunctionRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_014',
            'Funções / Expressões na Cláusula ORDER BY',
            'Identifica o uso de funções manipuladoras (ex: ABS(), LOWER(), RAND()) ou operações em colunas na ordenação, o que desativa a ordenação direta por índice B-Tree.',
            'HIGH',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - ORDER BY Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/order-by-optimization.html'
                }
            ]
        );
    }

    check(queryModel) {
        if (!queryModel.orderBy || !Array.isArray(queryModel.orderBy)) return null;

        let functionFound = false;
        let functionNames = [];

        queryModel.orderBy.forEach(item => {
            if (item.expr) {
                if (item.expr.type === 'function') {
                    const funcName = item.expr.name && item.expr.name.name && item.expr.name.name[0]
                        ? String(item.expr.name.name[0].value || item.expr.name.name[0])
                        : (typeof item.expr.name === 'string' ? item.expr.name : 'função');
                    // Ignora RAND/RANDOM pois já são tratados especificamente pela OrderByRandRule (RULE_010)
                    if (!['RAND', 'RANDOM'].includes(funcName.toUpperCase())) {
                        functionFound = true;
                        functionNames.push(funcName);
                    }
                } else if (item.expr.type === 'cast') {
                    functionFound = true;
                    functionNames.push('CAST');
                } else if (item.expr.type === 'unary_expr' || item.expr.type === 'binary_expr') {
                    functionFound = true;
                    functionNames.push('expressão matemática');
                }
            }
        });

        if (functionFound) {
            return new RuleResult(
                this,
                `Uso de funções ou expressões (${functionNames.join(', ')}) detectado na cláusula ORDER BY.`,
                'Evitar aplicar funções ou expressões sobre colunas no ORDER BY pode melhorar o desempenho ao permitir ordenação direta por índice B-Tree sem etapa de Filesort. Exemplo: Em vez de "ORDER BY ABS(coluna)" ou "ORDER BY LOWER(coluna)", considere ordenar diretamente pela coluna indexada "ORDER BY coluna" ou criar um índice funcional determinístico.',
                ["ORDER\\s+BY", ...functionNames.map(f => f.toUpperCase())]
            );
        }

        return null;
    }
}

module.exports = OrderByFunctionRule;
