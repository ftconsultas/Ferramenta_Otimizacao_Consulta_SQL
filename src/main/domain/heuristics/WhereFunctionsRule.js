const { HeuristicRule, RuleResult } = require('./HeuristicRule');
const ReferenceCatalog = require('./ReferenceCatalog');

/**
 * WhereFunctionsRule
 * Detecta o uso de funções em colunas na cláusula WHERE, o que impede o uso de índices.
 *
 * Referência:
 * - MySQL 8.4 Reference Manual, "CREATE INDEX Statement" / functional key parts.
 *   Índices comuns são definidos sobre valores de colunas; predicados com expressões
 *   ou funções exigem reescrita do predicado ou índice funcional compatível.
 *   https://dev.mysql.com/doc/refman/8.4/en/create-index.html
 * - MySQL 8.4 Reference Manual, "Optimizer Use of Generated Column Indexes".
 *   https://dev.mysql.com/doc/refman/8.4/en/generated-column-index-optimizations.html
 */
class WhereFunctionsRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_003',
            'Funções na cláusula WHERE',
            'O uso de funções (ex: YEAR(), LOWER(), etc.) em colunas no WHERE impede que o banco de dados utilize índices de forma eficiente.',
            'MEDIUM',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - CREATE INDEX Statement',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/create-index.html'
                },
                {
                    title: 'MySQL 8.4 Reference Manual - Generated Column Index Optimizations',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/generated-column-index-optimizations.html'
                },
                ReferenceCatalog.unbIndexes
            ]
        );
    }

    check(queryModel) {
        if (!queryModel.where) return null;

        const functionsFound = [];
        this._findFunctionsInWhere(queryModel.where, functionsFound);

        if (functionsFound.length > 0) {
            const funcNames = [...new Set(functionsFound)].join(', ');
            return new RuleResult(
                this,
                `Foi detectado o uso de funções aplicadas sobre colunas no WHERE: ${funcNames}.`,
                'Reescrever a condição para comparar a coluna diretamente com valores ou intervalos pode melhorar o desempenho ao permitir que o otimizador utilize índices B-Tree na coluna. Exemplo: Em vez de "WHERE FLOOR(coluna / 100) = 50", prefira "WHERE coluna >= 5000 AND coluna < 5100", ou em vez de "WHERE YEAR(data) = 2024", prefira "WHERE data >= \'2024-01-01\' AND data < \'2025-01-01\'".'
            );
        }

        return null;
    }

    _extractFunctionName(node) {
        if (!node) return '';
        if (node.type === 'cast') return 'CAST';
        if (node.type === 'extract') return 'EXTRACT';
        if (node.name) {
            if (typeof node.name === 'string') return node.name.toUpperCase();
            if (Array.isArray(node.name.name) && node.name.name[0]) {
                return String(node.name.name[0].value || node.name.name[0]).toUpperCase();
            }
        }
        return 'FUNÇÃO';
    }

    _findFunctionsInWhere(node, found) {
        if (!node) return;

        if (node.type === 'function' || node.type === 'cast' || node.type === 'extract') {
            const fnName = this._extractFunctionName(node);
            if (fnName !== 'EXISTS') {
                const targetToCheck = node.type === 'function' ? node.args : (node.expr || node.args);
                const hasColumnArg = this._containsColumn(targetToCheck);
                if (hasColumnArg) {
                    found.push(fnName);
                }
            }
        }

        if (node.ast) this._findFunctionsInWhere(node.ast, found);
        if (node.where) this._findFunctionsInWhere(node.where, found);
        if (node.left) this._findFunctionsInWhere(node.left, found);
        if (node.right) {
            if (Array.isArray(node.right.value)) {
                node.right.value.forEach(v => {
                    if (v && v.ast) this._findFunctionsInWhere(v.ast, found);
                    else this._findFunctionsInWhere(v, found);
                });
            } else {
                this._findFunctionsInWhere(node.right, found);
            }
        }
        if (node.args && node.args.value && Array.isArray(node.args.value)) {
            node.args.value.forEach(v => {
                if (v && v.ast) this._findFunctionsInWhere(v.ast, found);
            });
        }
    }

    _containsColumn(node) {
        if (!node) return false;
        if (node.type === 'column_ref') return true;
        if (Array.isArray(node)) return node.some(item => this._containsColumn(item));
        if (node.value && Array.isArray(node.value)) return node.value.some(item => this._containsColumn(item));
        if (node.left || node.right) return this._containsColumn(node.left) || this._containsColumn(node.right);
        if (node.args) return this._containsColumn(node.args);
        if (node.expr) return this._containsColumn(node.expr);
        return false;
    }
}


module.exports = WhereFunctionsRule;
