const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * OrderByRandRule
 * Detecta a ordenação aleatória massiva na cláusula ORDER BY RAND().
 * 
 * Referência Teórica (TCC):
 * - SCHWARTZ, B., ZAITSEV, P., TKACHENKO, V. "High Performance MySQL". 3. ed. O'Reilly Media, 2012.
 * - MySQL 8.4 Reference Manual, Seção 10.2.1.16 "ORDER BY Optimization".
 *   https://dev.mysql.com/doc/refman/8.4/en/order-by-optimization.html
 * - MySQL 8.4 Reference Manual, "Function Call Optimization".
 *   Funções não determinísticas, como RAND(), podem ser avaliadas linha a linha.
 *   https://dev.mysql.com/doc/refman/8.4/en/function-optimization.html
 * - Invocar RAND() para ordenação causa um grave filesort no disco para indexar chaves efêmeras aleatórias.
 */
class OrderByRandRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_010',
            'Filtragem com ORDER BY RAND()',
            'O uso de ORDER BY RAND() pode degradar a performance ao avaliar valores aleatórios por linha e exigir ordenação completa (Filesort).',
            'HIGH',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - ORDER BY Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/order-by-optimization.html'
                },
                {
                    title: 'MySQL 8.4 Reference Manual - Function Call Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/function-optimization.html'
                },
                ReferenceCatalog.unbQueryOptimization
            ]
        );
    }

    check(queryModel) {
        if (!queryModel.orderBy) return null;

        const orbs = Array.isArray(queryModel.orderBy) ? queryModel.orderBy : [queryModel.orderBy];
        
        let hasRandom = false;

        for (const item of orbs) {
            // Analisa a AST para localizar o call nativo da function RAND ou RANDOM da subarvore 'expr'
            if (item && item.expr && item.expr.type === 'function') {
                let funcNameObj = item.expr.name;
                let fnNameStr = '';
                
                if (funcNameObj && Array.isArray(funcNameObj.name)) {
                    fnNameStr = funcNameObj.name[0].value || funcNameObj.name[0];
                } else {
                    fnNameStr = funcNameObj;
                }

                if (typeof fnNameStr === 'string') {
                    if (['RAND', 'RANDOM'].includes(fnNameStr.toUpperCase())) {
                        hasRandom = true;
                        break;
                    }
                }
            }
        }

        if (hasRandom) {
            return new RuleResult(
                this,
                'Detectada cláusula ORDER BY RAND(), que pode causar alto custo de ordenação em tabelas volumosas.',
                'Evitar ordenar diretamente por RAND() em tabelas grandes pode melhorar substancialmente o desempenho. Considere sortear o identificador na aplicação ou via faixa indexada. Exemplo: Calcule um ID aleatório e consulte "WHERE id >= id_sorteado ORDER BY id LIMIT 1", evitando a etapa de Filesort em toda a tabela.',
                ["ORDER\\s+BY\\s+RAND(?:OM)?\\s*\\(\\s*\\)"]
            );
        }

        return null;
    }
}

module.exports = OrderByRandRule;
