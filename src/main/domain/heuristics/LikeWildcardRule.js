const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * LikeWildcardRule
 * Detecta o uso de curingas (%) no início de padrões LIKE.
 *
 * Referência:
 * - PostgreSQL Documentation, "Index Types".
 *   Índices B-tree podem ser considerados para LIKE quando o padrão é constante
 *   e ancorado no início da string; padrões iniciados por curinga impedem essa busca.
 *   https://www.postgresql.org/docs/current/indexes-types.html
 * - SCHWARTZ, B.; ZAITSEV, P.; TKACHENKO, V. High Performance MySQL. 3. ed.
 *   O'Reilly, 2012. Capítulo "Indexing for High Performance".
 */
class LikeWildcardRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_004',
            'Curinga no início do LIKE',
            'O uso de "%" no início de uma string no LIKE (ex: "%termo") impede o uso de índices, causando um scan completo na tabela.',
            'MEDIUM',
            [
                {
                    title: 'PostgreSQL Documentation - Index Types',
                    url: 'https://www.postgresql.org/docs/current/indexes-types.html'
                },
                ReferenceCatalog.unbIndexes,
                {
                    title: 'High Performance MySQL, 3rd ed. - Indexing for High Performance'
                }
            ]
        );
    }

    check(queryModel) {
        if (!queryModel.where) return null;

        const wildcardsFound = [];
        this._findLikeWildcards(queryModel.where, wildcardsFound);

        if (wildcardsFound.length > 0) {
            return new RuleResult(
                this,
                'Foi detectado o uso de curinga (%) no início de um padrão LIKE.',
                'Evitar padrões iniciados por "%" quando a busca permitir ancoragem por prefixo pode melhorar o desempenho ao possibilitar o uso de índices B-Tree. Exemplo: Em vez de "WHERE nome LIKE \'%termo%\'", considere "WHERE nome LIKE \'termo%\'" (se aplicável à regra de negócio) ou avalie o uso de índice Full-Text.'
            );
        }

        return null;
    }

    _findLikeWildcards(node, found) {
        if (!node) return;

        if (node.type === 'binary_expr' && (node.operator === 'LIKE' || node.operator === 'NOT LIKE')) {
            const right = node.right;
            if (right && (right.type === 'string' || right.type === 'single_quote_string' || right.type === 'double_quote_string')) {
                if (typeof right.value === 'string' && right.value.startsWith('%')) {
                    found.push(node);
                }
            }
        }

        if (node.ast) this._findLikeWildcards(node.ast, found);
        if (node.where) this._findLikeWildcards(node.where, found);
        if (node.left) this._findLikeWildcards(node.left, found);
        if (node.right) {
            if (Array.isArray(node.right.value)) {
                node.right.value.forEach(v => {
                    if (v && v.ast) this._findLikeWildcards(v.ast, found);
                    else this._findLikeWildcards(v, found);
                });
            } else {
                this._findLikeWildcards(node.right, found);
            }
        }
        if (node.args && Array.isArray(node.args.value)) {
            node.args.value.forEach(v => {
                if (v && v.ast) this._findLikeWildcards(v.ast, found);
                else this._findLikeWildcards(v, found);
            });
        }
    }
}

module.exports = LikeWildcardRule;
