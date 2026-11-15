const SQLParser = require('../../../src/main/domain/parser/SQLParser');
const ImplicitJoinRule = require('../../../src/main/domain/heuristics/ImplicitJoinRule');
const OrderByRandRule = require('../../../src/main/domain/heuristics/OrderByRandRule');
const HavingWithoutGroupByRule = require('../../../src/main/domain/heuristics/HavingWithoutGroupByRule');
const CorrelatedSubquerySelectRule = require('../../../src/main/domain/heuristics/CorrelatedSubquerySelectRule');
const CountColumnVersusStarRule = require('../../../src/main/domain/heuristics/CountColumnVersusStarRule');
const OuterJoinToInnerJoinRule = require('../../../src/main/domain/heuristics/OuterJoinToInnerJoinRule');

// Testes Unitários de Caixa Branca
describe('Análise Estática de Heurísticas (TCC)', () => {
    let parser;
    const unbIndexesUrl = 'https://sae.unb.br/cae/conteudo/unbfga/lbd/banco2_indices.html';

    beforeAll(() => {
        parser = new SQLParser();
    });

    // Função utilitária
    const evaluate = (rule, sql) => {
        const queryModel = parser.parse(sql);
        return rule.check(queryModel);
    };

    describe('1. ImplicitJoinRule', () => {
        const rule = new ImplicitJoinRule();

        it('Deveria detectar SELECT com múltiplas tabelas separadas por vírgula no FROM', () => {
            const sql = 'SELECT * FROM clientes, pedidos WHERE clientes.id = pedidos.cliente_id';
            const result = evaluate(rule, sql);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_002');
        });

        it('Não deveria detectar junções com sintaxe ANSI (INNER JOIN)', () => {
            const sql = 'SELECT * FROM clientes INNER JOIN pedidos ON clientes.id = pedidos.cliente_id';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });
    });

    describe('2. OrderByRandRule', () => {
        const rule = new OrderByRandRule();

        it('Deve detectar ordenação usando RAND() polarizando Filesort', () => {
            let sql = 'SELECT * FROM produtos ORDER BY RAND() LIMIT 10';
            let result = evaluate(rule, sql);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_010');

            // RAND() ou RANDOM()
            sql = 'SELECT * FROM produtos ORDER BY ranDom()';
            result = evaluate(rule, sql);
            expect(result).not.toBeNull();
        });

        it('Não deve detectar ordenação convencional', () => {
            const sql = 'SELECT * FROM produtos ORDER BY id DESC';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });
    });

    describe('3. HavingWithoutGroupByRule', () => {
        const rule = new HavingWithoutGroupByRule();

        it('Deveria detectar cláusula HAVING isolada na raiz da consulta agindo sobre memoria post-scan', () => {
            const sql = 'SELECT * FROM faturas HAVING valor > 500';
            const result = evaluate(rule, sql);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_008');
        });

        it('Não deveria detectar se há GROUP BY acompanhante regulamentar', () => {
            const sql = 'SELECT cliente_id, sum(valor) FROM faturas GROUP BY cliente_id HAVING sum(valor) > 500';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });
    });

    describe('4. CorrelatedSubquerySelectRule', () => {
        const rule = new CorrelatedSubquerySelectRule();

        it('Deveria identificar subqueries diretas dentro da lista de colunas instanciada como "expr"', () => {
            const sql = 'SELECT name, (SELECT count(id) FROM orders WHERE orders.client_id = clients.id) as tot FROM clients';
            const result = evaluate(rule, sql);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_011');
        });

        it('Não deveria alertar subconsultas feitas no FROM (Tabelas Derivadas)', () => {
            const sql = 'SELECT sub.nome FROM (SELECT nome FROM clientes) as sub';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });
    });

    describe('5. CountColumnVersusStarRule', () => {
        const rule = new CountColumnVersusStarRule();

        it('Deveria alertar sobre uso de COUNT com arg campo ao inves de wildcard de index', () => {
            const sql = 'SELECT COUNT(id_compras) as tot FROM compras';
            const result = evaluate(rule, sql);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_006');
        });

        it('Não alerta se uso otimizado COUNT(*)', () => {
            const sql = 'SELECT COUNT(*) as tot FROM compras';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });
    });

    describe('6. OuterJoinToInnerJoinRule (MS Research)', () => {
        const rule = new OuterJoinToInnerJoinRule();

        it('Alarme quando uma tabela acoplada via LEFT JOIN for testada imperativamente falhando a semântica de NULL no WHERE', () => {
            const sql = "SELECT * FROM orders o LEFT JOIN clients c ON o.client_id = c.id WHERE c.status = 'ACTIVE'";
            const result = evaluate(rule, sql);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_007');
        });

        it('Não soa alarme para queries cujas checagens do LEFT JOIN não transbordam para o WHERE hard-mode', () => {
            // A verificação não fere o lado da exclusão na "c"
            const sql = "SELECT * FROM orders o LEFT JOIN clients c ON o.client_id = c.id WHERE o.status = 'DELIVERED'";
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });

        it('Não deve soar alarme (Falso Positivo) se a query aplica um LEFT JOIN legí­timo de "Busca de Inexistentes" (IS NULL)', () => {
            const sql = "SELECT * FROM orders o LEFT JOIN clients c ON o.client_id = c.id WHERE c.id IS NULL";
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });

        it('Não deve soar alarme (Falso Positivo) se é um INNER JOIN nativo desde o princi­pio', () => {
            const sql = "SELECT * FROM orders o INNER JOIN clients c ON o.client_id = c.id WHERE c.status = 'BLOQUEADO'";
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });
    });

    describe('7. Referencias educacionais da UnB', () => {
        it('deve apresentar a referencia de indices da UnB em sugestoes relacionadas a indice', () => {
            const rule = new CountColumnVersusStarRule();
            const result = evaluate(rule, 'SELECT COUNT(id_compras) as tot FROM compras');

            expect(result).not.toBeNull();
            expect(result.references).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        title: 'UnB/FGA LBD - Indice',
                        url: unbIndexesUrl
                    })
                ])
            );
        });
    });
});
