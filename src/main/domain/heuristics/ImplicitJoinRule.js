const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * ImplicitJoinRule
 * Detecta junções implícitas separadas por vírgula na cláusula FROM.
 * 
 * Referência Teórica (TCC):
 * - KARWIN, Bill. SQL Antipatterns. Pragmatic Bookshelf, 2010. Capítulo 17 "Spaghetti Query".
 * - MariaDB Server Documentation, "Comma vs JOIN".
 *   A sintaxe JOIN explícita com ON é preferida à lista de tabelas separada por vírgula
 *   por legibilidade e precedência de operadores.
 *   https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/joins-subqueries/joins/comma-vs-join
 * - O uso do padrão SQL-89 (FROM t1, t2) oculta a intenção de união, aumentando riscos de Produto Cartesiano
 * - Recomenda-se adotar sintaxe SQL-92 (INNER JOIN ... ON).
 */
class ImplicitJoinRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_002',
            'Junção Implícita ou Sem Condição de Relacionamento',
            'Identifica junções de tabelas por vírgula no FROM (SQL-89) ou junções sem condição de relacionamento (Produto Cartesiano N x M).',
            'MEDIUM',
            [
                {
                    title: 'SQL Antipatterns - Cap. 17, Spaghetti Query'
                },
                {
                    title: 'MariaDB Documentation - Comma vs JOIN',
                    url: 'https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/joins-subqueries/joins/comma-vs-join'
                },
                ReferenceCatalog.unbQueryOptimization
            ]
        );
    }

    static hasInterTableColumnComparison(node) {
        if (!node) return false;

        if (node.type === 'binary_expr') {
            const leftIsCol = node.left && node.left.type === 'column_ref';
            const rightIsCol = node.right && node.right.type === 'column_ref';
            if (leftIsCol && rightIsCol) {
                const leftTable = node.left.table || '';
                const rightTable = node.right.table || '';
                if (!leftTable || !rightTable || leftTable !== rightTable || node.left.column !== node.right.column) {
                    return true;
                }
            }
        }

        return Boolean(
            (node.left && ImplicitJoinRule.hasInterTableColumnComparison(node.left)) ||
            (node.right && ImplicitJoinRule.hasInterTableColumnComparison(node.right)) ||
            (node.expr && ImplicitJoinRule.hasInterTableColumnComparison(node.expr))
        );
    }

    static isConditionlessJoin(join) {
        if (!join) return false;
        const typeUpper = String(join.type || '').toUpperCase();
        if (typeUpper.includes('NATURAL')) return false;
        if (Array.isArray(join.using) && join.using.length > 0) return false;
        if (!join.on) return true;
        return !ImplicitJoinRule.hasInterTableColumnComparison(join.on);
    }

    static hasCartesianProduct(queryModel) {
        if (!queryModel) return false;
        const blocks = Array.isArray(queryModel.selectBlocks) && queryModel.selectBlocks.length > 0
            ? queryModel.selectBlocks
            : [{ tables: queryModel.tables || [], joins: queryModel.joins || [], where: queryModel.where || null }];

        for (const block of blocks) {
            const tablesCount = block.tables ? block.tables.length : 0;
            const joins = block.joins || [];
            const joinsCount = joins.length;

            if (tablesCount > 1 && joinsCount < (tablesCount - 1)) {
                if (!ImplicitJoinRule.hasInterTableColumnComparison(block.where)) {
                    return true;
                }
            }

            if (joins.some(j => ImplicitJoinRule.isConditionlessJoin(j)) && !ImplicitJoinRule.hasInterTableColumnComparison(block.where)) {
                return true;
            }
        }

        return false;
    }

    check(queryModel) {
        if (!queryModel) return null;
        const blocks = Array.isArray(queryModel.selectBlocks) && queryModel.selectBlocks.length > 0
            ? queryModel.selectBlocks
            : [{ tables: queryModel.tables || [], joins: queryModel.joins || [], where: queryModel.where || null }];

        for (const block of blocks) {
            const tablesCount = block.tables ? block.tables.length : 0;
            const joins = block.joins || [];
            const joinsCount = joins.length;

            if (tablesCount > 1 && joinsCount < (tablesCount - 1)) {
                const hasJoinInWhere = ImplicitJoinRule.hasInterTableColumnComparison(block.where);
                if (!hasJoinInWhere) {
                    return new RuleResult(
                        this,
                        'Uso de junção implícita (tabelas separadas por vírgula) sem condição de relacionamento entre tabelas detectado — gera Produto Cartesiano (N x M).',
                        'Substituir a vírgula por "INNER JOIN ... ON" especificando a condição de vínculo entre as chaves pode melhorar drasticamente o desempenho e evitar um Produto Cartesiano (N x M), no qual todas as linhas das tabelas são multiplicadas entre si. Exemplo: Utilize "FROM t1 INNER JOIN t2 ON t1.id = t2.t1_id".',
                        ["FROM\\s+(?:[\\w_]+\\s*(?:AS\\s+)?(?:[\\w_]+)?\\s*,\\s*)+[\\w_]+"]
                    );
                }

                return new RuleResult(
                    this,
                    'Uso de junção implícita (tabelas separadas por vírgula no FROM) detectado.',
                    'Substituir a sintaxe antiga (SQL-89) por declarações explícitas de "INNER JOIN ... ON" (SQL-92) pode melhorar a legibilidade, a precedência de avaliação e evitar que a omissão acidental de um filtro no WHERE gere um Produto Cartesiano (N x M). Exemplo: Em vez de "FROM t1, t2 WHERE t1.id = t2.t1_id", prefira "FROM t1 INNER JOIN t2 ON t1.id = t2.t1_id" (sempre mantendo a condição ON).',
                    ["FROM\\s+(?:[\\w_]+\\s*(?:AS\\s+)?(?:[\\w_]+)?\\s*,\\s*)+[\\w_]+"]
                );
            }

            if (joins.some(j => ImplicitJoinRule.isConditionlessJoin(j)) && !ImplicitJoinRule.hasInterTableColumnComparison(block.where)) {
                return new RuleResult(
                    this,
                    'Junção explícita (JOIN / CROSS JOIN) sem condição de relacionamento válida (ON / USING) detectada — gera Produto Cartesiano (N x M).',
                    'Incluir a cláusula de ligação "ON" relacionando as chaves das tabelas pode melhorar drasticamente o desempenho ao evitar um Produto Cartesiano (N x M), que multiplica todas as linhas entre as tabelas. Exemplo: Utilize "FROM t1 INNER JOIN t2 ON t1.id = t2.t1_id".',
                    ["(?:CROSS\\s+JOIN|INNER\\s+JOIN|JOIN)\\s+[\\w_]+"]
                );
            }
        }

        return null;
    }
}

module.exports = ImplicitJoinRule;
