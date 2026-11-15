const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * OuterJoinToInnerJoinRule
 * Alerta sobre a anulação semântica de um OUTER JOIN por Restrições Não-Nulas (Null-Rejecting Predicates) no nível de WHERE.
 * 
 * Referência Teórica (TCC):
 * - MySQL 8.4 Reference Manual, "Outer Join Simplification".
 *   Predicados null-rejected na cláusula WHERE permitem converter LEFT JOIN em INNER JOIN.
 *   https://dev.mysql.com/doc/refman/8.4/en/outer-join-simplification.html
 * - CHAUDHURI, S. et al. "Extensible Query Optimizers in Practice" (Research Paper, Microsoft, 2024).
 * - "Redundancy rule for outer joins". Ao invocar restritivos na cláusula WHERE aplicados à tabela derivada 
 *   do LEFT/RIGHT JOIN, o programador comete uma falha lógica descartando os agregados permissivos opcionais, transformando o JOIN no final da linha em um INNER JOIN custoso.
 */
class OuterJoinToInnerJoinRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_007',
            'Falsa Invocação de Outer Join (Null-Rejecting)',
            'Identifica o uso de um OUTER JOIN com filtros hard-coded na cláusula WHERE que anulam a premissa de dados faltantes, comportando-se como INNER JOIN.',
            'HIGH',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - Outer Join Simplification',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/outer-join-simplification.html'
                },
                ReferenceCatalog.unbQueryOptimization,
                {
                    title: 'Extensible Query Optimizers in Practice - Chaudhuri et al.'
                }
            ]
        );
    }

    check(queryModel) {
        if (!queryModel.joins || queryModel.joins.length === 0 || !queryModel.where) {
            return null;
        }

        // Recupera todas as tabelas sendo associadas por LEFT/RIGHT JOIN (nome e possível alias)
        const outerJoins = queryModel.joins.filter(j => j.type && j.type.toUpperCase().includes('OUTER JOIN') || j.type && j.type.toUpperCase().includes('LEFT JOIN') || j.type && j.type.toUpperCase().includes('RIGHT JOIN'));

        if (outerJoins.length === 0) return null;

        let corruptedTokens = [];

        // Analisamos empiricamente a AST do WHERE
        // Uma varredura de profundidade (DFS) verificando se os operandos testam colunas atreladas as tabelas extraídas do Outer Join
        const searchNullRejectingNode = (node) => {
            if (!node) return;

            // Isenção de Null-Search (Busca de Inexistentes: IS NULL ou operador null-safe <=>)
            if (node.type === 'binary_expr' && node.operator) {
                const opUpper = node.operator.toUpperCase();
                if ((opUpper === 'IS' && node.right && node.right.type === 'null') || opUpper === '<=>') {
                    return;
                }
                // Se for um OR em que um dos lados aceita IS NULL, não há rejeição estrita de nulos
                if (opUpper === 'OR') {
                    const hasIsNullBranch = (branch) => branch && branch.type === 'binary_expr'
                        && String(branch.operator || '').toUpperCase() === 'IS'
                        && branch.right && branch.right.type === 'null';
                    if (hasIsNullBranch(node.left) || hasIsNullBranch(node.right)) {
                        return;
                    }
                }
            }

            if (node.type === 'function' && node.name) {
                const fnName = Array.isArray(node.name.name) && node.name.name[0]
                    ? String(node.name.name[0].value || '').toUpperCase()
                    : String(node.name || '').toUpperCase();
                if (['COALESCE', 'IFNULL', 'ISNULL'].includes(fnName)) {
                    return;
                }
            }

            if (node.type === 'column_ref') {
                const tableNameOrAlias = node.table || node.db;
                if (tableNameOrAlias) {
                    const match = outerJoins.find(j => j.table === tableNameOrAlias || j.as === tableNameOrAlias);
                    if (match) {
                        corruptedTokens.push(`${tableNameOrAlias}\\.${node.column}`);
                    }
                }
            }

            if (node.left) searchNullRejectingNode(node.left);
            if (node.right) searchNullRejectingNode(node.right);
            if (node.expr) searchNullRejectingNode(node.expr);
        };

        searchNullRejectingNode(queryModel.where);

        if (corruptedTokens.length > 0) {
            return new RuleResult(
                this,
                'O uso de "LEFT/RIGHT JOIN" possui um filtro no "WHERE" que rejeita valores NULL da tabela externa, anulando o efeito do Outer Join.',
                'Se registros sem correspondência não são necessários, substituir por "INNER JOIN ... ON" (mantendo a condição de relacionamento no ON para não gerar Produto Cartesiano) pode melhorar a clareza e o planejamento da consulta. Caso deseje preservar os registros nulos, mova a condição da tabela externa para a cláusula "ON". Exemplo: "FROM t1 INNER JOIN t2 ON t1.id = t2.t1_id WHERE t2.status = \'ativo\'".',
                ["LEFT\\s+JOIN", "RIGHT\\s+JOIN", "OUTER\\s+JOIN", ...corruptedTokens]
            );
        }

        return null;
    }
}

module.exports = OuterJoinToInnerJoinRule;
