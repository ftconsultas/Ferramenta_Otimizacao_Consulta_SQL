const { HeuristicRule, RuleResult } = require('./HeuristicRule');

/**
 * RowConstructorRule
 * Alerta sobre a perda de eficiência na busca por índice ao utilizar expressões de Row Constructor.
 * 
 * Referência Teórica (TCC):
 * - MySQL 8.4 Reference Manual, Section 10.2.1.22 "Row Constructor Expression Optimization".
 *   O uso de (c2, c3) > (1, 1) em filtros WHERE limita a profundidade de uso do índice composto.
 *   Reescrever para c2 > 1 OR (c2 = 1 AND c3 > 1) permite a utilização completa do índice (key_len maior).
 *   https://dev.mysql.com/doc/refman/8.4/en/row-constructor-expression-simplification.html
 */
class RowConstructorRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_013',
            'Uso de Row Constructor em Comparações de Filtro',
            'Identifica o uso de expressões do tipo (col1, col2) > (val1, val2) em filtros WHERE, o que limita a otimização de busca por faixas em índices compostos.',
            'MEDIUM',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - Row Constructor Expression Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/row-constructor-expression-simplification.html'
                }
            ]
        );
    }

    check(queryModel) {
        if (!queryModel.where) return null;

        let foundRowConstructor = false;
        let matchedTokens = [];

        const searchRowConstructor = (node) => {
            if (!node) return;

            // No node-sql-parser, tuplas de construtores de linha (Row Constructors) têm 'expr_list' com >1 elemento no lado esquerdo
            // ex: (col1, col2) > (val1, val2). Evita falso positivo em "coluna IN (1, 2, 3)" onde apenas o lado direito é expr_list.
            if (node.type === 'binary_expr') {
                const inequalityOps = ['>', '<', '>=', '<=', '<>', '!='];
                const isInequality = inequalityOps.includes(String(node.operator || '').trim());
                const isLeftTuple = node.left && node.left.type === 'expr_list' && Array.isArray(node.left.value) && node.left.value.length > 1;
                const isRightTuple = node.right && node.right.type === 'expr_list' && Array.isArray(node.right.value) && node.right.value.length > 1;

                if (isInequality && isLeftTuple && isRightTuple) {
                    foundRowConstructor = true;
                    matchedTokens.push("\\(.*?\\)\\s*(?:>=|<=|<>|!=|>|<)");
                }
            }

            if (node.ast) searchRowConstructor(node.ast);
            if (node.where) searchRowConstructor(node.where);

            if (node.left) searchRowConstructor(node.left);
            if (node.right) {
                if (Array.isArray(node.right.value)) {
                    node.right.value.forEach(v => {
                        if (v.ast) searchRowConstructor(v.ast);
                    });
                } else {
                    searchRowConstructor(node.right);
                }
            }
            if (node.expr) searchRowConstructor(node.expr);
        };

        searchRowConstructor(queryModel.where);

        if (foundRowConstructor) {
            return new RuleResult(
                this,
                'Uso de tupla (Row Constructor) detectado na cláusula WHERE.',
                'Reescrever comparações de desigualdade em tuplas com operadores escalares explícitos pode melhorar o aproveitamento de índices compostos no MySQL. Exemplo: Em vez de "WHERE (col1, col2) > (1, 10)", considere "WHERE col1 > 1 OR (col1 = 1 AND col2 > 10)".',
                matchedTokens.length > 0 ? matchedTokens : ["\\("]
            );
        }

        return null;
    }
}

module.exports = RowConstructorRule;
