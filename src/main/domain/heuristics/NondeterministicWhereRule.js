const { HeuristicRule, RuleResult } = require('./HeuristicRule');

/**
 * NondeterministicWhereRule
 * Alerta sobre a chamada de funções não-determinísticas (RAND, UUID, etc.) na cláusula WHERE.
 * 
 * Referência Teórica (TCC):
 * - MySQL 8.4 Reference Manual, Section 10.2.1.20 "Function Call Optimization".
 *   Funções não-determinísticas (ex: RAND(), UUID()) são re-avaliadas para CADA linha da tabela.
 *   Isso impede que o otimizador trate a expressão como constante e invalida a busca por índice,
 *   forçando uma Varredura Completa de Tabela (Full Table Scan).
 *   https://dev.mysql.com/doc/refman/8.4/en/function-call-optimization.html
 */
class NondeterministicWhereRule extends HeuristicRule {
    constructor() {
        super(
            'RULE_016',
            'Funções Não-Determinísticas no Filtro WHERE',
            'Identifica o uso de funções cujo retorno altera a cada invocação (ex: RAND(), UUID()) em filtros WHERE, forçando a re-avaliação por linha e varredura completa da tabela.',
            'HIGH',
            [
                {
                    title: 'MySQL 8.4 Reference Manual - Function Call Optimization',
                    url: 'https://dev.mysql.com/doc/refman/8.4/en/function-call-optimization.html'
                }
            ]
        );
    }

    check(queryModel) {
        if (!queryModel.where) return null;

        const nondeterministicFuncs = ['RAND', 'UUID', 'UUID_TO_BIN', 'SYSDATE'];
        let foundFuncs = [];

        const searchNondeterministic = (node) => {
            if (!node) return;

            if (node.type === 'function') {
                const funcName = node.name && node.name.name && node.name.name[0] ? node.name.name[0].value.toUpperCase() : '';
                if (nondeterministicFuncs.includes(funcName)) {
                    foundFuncs.push(funcName);
                }
            }

            if (node.ast) searchNondeterministic(node.ast);
            if (node.where) searchNondeterministic(node.where);
            if (node.left) searchNondeterministic(node.left);
            if (node.right) {
                if (Array.isArray(node.right.value)) {
                    node.right.value.forEach(v => {
                        if (v.ast) searchNondeterministic(v.ast);
                        else searchNondeterministic(v);
                    });
                } else {
                    searchNondeterministic(node.right);
                }
            }
            if (node.expr) searchNondeterministic(node.expr);
            if (node.args) {
                if (node.args.type === 'expr_list' && Array.isArray(node.args.value)) {
                    node.args.value.forEach(arg => searchNondeterministic(arg));
                } else {
                    searchNondeterministic(node.args);
                }
            }
        };


        searchNondeterministic(queryModel.where);

        if (foundFuncs.length > 0) {
            const uniqueFuncs = [...new Set(foundFuncs)];
            return new RuleResult(
                this,
                `Uso de função(ões) não-determinística(s) (${uniqueFuncs.join(', ')}) detectado na cláusula WHERE.`,
                'Evitar funções não-determinísticas (como RAND(), UUID() ou SYSDATE()) diretamente no WHERE pode melhorar o desempenho, pois elas impedem o otimizador de avaliar a expressão como constante e inviabilizam buscas por índice. Exemplo: Calcule o valor previamente na aplicação ou em variável de sessão ("SET @val = RAND(); SELECT ... WHERE coluna > @val;").',
                uniqueFuncs
            );
        }

        return null;
    }
}

module.exports = NondeterministicWhereRule;
