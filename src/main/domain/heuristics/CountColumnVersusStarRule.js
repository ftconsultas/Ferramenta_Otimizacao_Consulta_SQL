const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * CountColumnVersusStarRule
 * Alerta sobre a invocação da func de agrupamento 'COUNT(nome_coluna)', esclarecendo a performática de COUNT(*).
 * 
 * Referência Teórica (TCC):
 * - SCHWARTZ, B., ZAITSEV, P., TKACHENKO, V. "High Performance MySQL". 3. ed. O'Reilly Media, 2012. (Seção: "Optimizing COUNT() Queries").
 * - MySQL 8.4 Reference Manual, "Aggregate Functions".
 *   COUNT(*) conta linhas; COUNT(expr) conta apenas linhas em que expr não é NULL,
 *   o que muda a semântica e pode exigir avaliação da expressão/coluna.
 *   https://dev.mysql.com/doc/refman/8.4/en/aggregate-functions.html
 * - Engines como InnoDB se otimizam para index tree block size usando o curinga natural (*) ao contrário do que se prega. Contar campo obriga a validação restritiva em cada celula extraída ("IS NOT NULL").
 */
class CountColumnVersusStarRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_006',
            'Uso de COUNT(coluna) para Total Count',
            'Alerta sobre contagens que usam nomes sintéticos em vez do curinga generalizado COUNT(*), forçando "Null-checks" do Engine.',
            'LOW',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - Aggregate Functions',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/aggregate-functions.html'
                },
                ReferenceCatalog.unbIndexes,
                {
                    title: 'High Performance MySQL, 3rd ed. - Optimizing COUNT() Queries'
                }
            ]
        );
    }

    check(queryModel) {
        if (!queryModel.columns) return null;

        // Se a consulta principal possui LEFT JOIN ou RIGHT JOIN, COUNT(coluna_da_tabela_externa) é necessário
        // para não contar linhas NULL como 1; portanto não deve ser sinalizado como má prática.
        const hasOuterJoinInMainBlock = Array.isArray(queryModel.joins) && queryModel.joins.some(j => {
            const t = String(j.type || '').toUpperCase();
            return t.includes('LEFT') || t.includes('RIGHT') || t.includes('OUTER');
        });
        if (hasOuterJoinInMainBlock) return null;

        let detectedCountField = false;

        for (const col of queryModel.columns) {
            if (typeof col === 'object' && col !== null) {
                if (col.expr && col.expr.type === 'aggr_func' && col.expr.name === 'COUNT') {
                    const funcArg = col.expr.args;
                    const isDistinct = funcArg && String(funcArg.distinct || '').toUpperCase() === 'DISTINCT';
                    if (!isDistinct && funcArg && funcArg.expr && funcArg.expr.type === 'column_ref') {
                        detectedCountField = true;
                        break;
                    }
                }
            }
        }

        if (!detectedCountField && queryModel.rawSql && /\bCOUNT\s*\(\s*(?!\*|\bDISTINCT\b)[a-zA-Z_][\w.]*\s*\)/i.test(queryModel.rawSql)) {
            detectedCountField = true;
        }

        if (detectedCountField) {
            return new RuleResult(
                this,
                'Função de agregação COUNT foi invocada referenciando uma coluna específica (ex: COUNT(coluna)).',
                'Se o objetivo for apenas contar o total de linhas (ou se a coluna for NOT NULL), utilizar COUNT(*) em vez de COUNT(coluna) pode melhorar o desempenho por evitar a checagem de nulidade (IS NOT NULL) linha a linha. Atenção: mantenha COUNT(coluna) apenas se desejar ignorar valores NULL na contagem. Exemplo: "SELECT COUNT(*) FROM tabela".',
                ["COUNT\\s*\\(\\s*[\\w\\.]+\\s*\\)"]
            );
        }

        return null;
    }
}

module.exports = CountColumnVersusStarRule;
