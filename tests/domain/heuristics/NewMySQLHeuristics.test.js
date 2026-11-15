const SQLParser = require('../../../src/main/domain/parser/SQLParser');
const RowConstructorRule = require('../../../src/main/domain/heuristics/RowConstructorRule');
const OrderByFunctionRule = require('../../../src/main/domain/heuristics/OrderByFunctionRule');
const DistinctOrderByRule = require('../../../src/main/domain/heuristics/DistinctOrderByRule');
const NondeterministicWhereRule = require('../../../src/main/domain/heuristics/NondeterministicWhereRule');
const MixedOrderDirectionRule = require('../../../src/main/domain/heuristics/MixedOrderDirectionRule');
const ImplicitJoinRule = require('../../../src/main/domain/heuristics/ImplicitJoinRule');
const HavingWithoutGroupByRule = require('../../../src/main/domain/heuristics/HavingWithoutGroupByRule');
const OuterJoinToInnerJoinRule = require('../../../src/main/domain/heuristics/OuterJoinToInnerJoinRule');

describe('Análise de Novas Regras Heurísticas MySQL 8.4 (TCC)', () => {
    let parser;

    beforeAll(() => {
        parser = new SQLParser();
    });

    const evaluate = (rule, sql) => {
        const queryModel = parser.parse(sql);
        return rule.check(queryModel);
    };

    describe('1. RowConstructorRule (RULE_013)', () => {
        const rule = new RowConstructorRule();

        it('Deveria detectar tuplas de comparação no WHERE como (a, b) > (1, 2)', () => {
            const sql = 'SELECT * FROM clientes WHERE (idade, pontos) > (18, 100)';
            const result = evaluate(rule, sql);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_013');
        });

        it('Não deveria detectar comparações escalares simples', () => {
            const sql = 'SELECT * FROM clientes WHERE idade > 18 AND pontos > 100';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });

        it('Não deveria gerar falso positivo em listas escalares IN (val1, val2)', () => {
            const sql = "SELECT id FROM clientes WHERE status IN ('ATIVO', 'PENDENTE')";
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });

        it('Não deveria disparar para igualdade de tuplas (a, b) = (1, 2), pois o MySQL 8.4 já simplifica igualdade nativamente', () => {
            const sql = 'SELECT n_nationkey, n_name FROM nation WHERE (n_nationkey, n_regionkey) = (1, 1)';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });
    });

    describe('2. OrderByFunctionRule (RULE_014)', () => {
        const rule = new OrderByFunctionRule();

        it('Deveria detectar funções aplicadas em colunas no ORDER BY', () => {
            const sql = 'SELECT * FROM pedidos ORDER BY ABS(valor)';
            const result = evaluate(rule, sql);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_014');
        });

        it('Não deveria detectar ordenação por colunas diretas', () => {
            const sql = 'SELECT * FROM pedidos ORDER BY valor DESC';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });

        it('Não deveria gerar falso positivo para ORDER BY RAND() (tratado exclusivamente pela RULE_010)', () => {
            const sql = 'SELECT id FROM produtos ORDER BY RAND()';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });
    });

    describe('3. DistinctOrderByRule (RULE_015)', () => {
        const rule = new DistinctOrderByRule();

        it('Deveria detectar DISTINCT com ORDER BY em coluna ausente no SELECT', () => {
            const sql = 'SELECT DISTINCT nome FROM clientes ORDER BY data_cadastro';
            const result = evaluate(rule, sql);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_015');
        });

        it('Não deveria detectar se a coluna ordenada faz parte da seleção DISTINCT', () => {
            const sql = 'SELECT DISTINCT nome, data_cadastro FROM clientes ORDER BY data_cadastro';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });
    });

    describe('4. NondeterministicWhereRule (RULE_016)', () => {
        const rule = new NondeterministicWhereRule();

        it('Deveria detectar RAND() ou UUID() na cláusula WHERE', () => {
            const sql = 'SELECT * FROM produtos WHERE id = FLOOR(1 + RAND() * 50)';
            const result = evaluate(rule, sql);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_016');
        });

        it('Não deveria detectar comparações com constantes determinísticas', () => {
            const sql = 'SELECT * FROM produtos WHERE id = 10';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });
    });

    describe('5. MixedOrderDirectionRule (RULE_009)', () => {
        const rule = new MixedOrderDirectionRule();

        it('Deveria detectar mistura de ASC e DESC em ORDER BY composto', () => {
            const sql = 'SELECT * FROM relatorios ORDER BY categoria ASC, data DESC';
            const result = evaluate(rule, sql);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_009');
        });

        it('Não deveria detectar se todas as colunas possuem a mesma direção', () => {
            const sql = 'SELECT * FROM relatorios ORDER BY categoria ASC, data ASC';
            const result = evaluate(rule, sql);
            expect(result).toBeNull();
        });
    });

    describe('6. ImplicitJoinRule e Prevenção de Produto Cartesiano (RULE_002)', () => {
        const rule = new ImplicitJoinRule();

        it('Deveria detectar Produto Cartesiano em tabelas separadas por vírgula sem condição de junção', () => {
            const sql = 'SELECT * FROM clientes c, pedidos p WHERE c.id = 1 AND p.id = 2';
            const queryModel = parser.parse(sql);
            expect(ImplicitJoinRule.hasCartesianProduct(queryModel)).toBe(true);
            const result = rule.check(queryModel);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_002');
            expect(result.message).toContain('Produto Cartesiano');
        });

        it('Deveria detectar Produto Cartesiano em self-join por vírgula (mesma tabela)', () => {
            const sql = 'SELECT f1.id, f2.id FROM funcionarios f1, funcionarios f2';
            const queryModel = parser.parse(sql);
            expect(ImplicitJoinRule.hasCartesianProduct(queryModel)).toBe(true);
            const result = rule.check(queryModel);
            expect(result).not.toBeNull();
            expect(result.ruleId).toBe('RULE_002');
        });

        it('Deveria detectar CROSS JOIN ou JOIN explícito com tautologia ON 1=1 como Produto Cartesiano', () => {
            const sqlCross = 'SELECT * FROM clientes CROSS JOIN pedidos';
            expect(ImplicitJoinRule.hasCartesianProduct(parser.parse(sqlCross))).toBe(true);
            expect(evaluate(rule, sqlCross)).not.toBeNull();

            const sqlTautology = 'SELECT * FROM clientes c INNER JOIN pedidos p ON 1 = 1';
            expect(ImplicitJoinRule.hasCartesianProduct(parser.parse(sqlTautology))).toBe(true);
            expect(evaluate(rule, sqlTautology)).not.toBeNull();
        });

        it('Não deveria gerar falso positivo de JOIN implícito em consultas UNION / UNION ALL', () => {
            const sql = 'SELECT id FROM clientes UNION ALL SELECT id FROM fornecedores';
            const queryModel = parser.parse(sql);
            expect(ImplicitJoinRule.hasCartesianProduct(queryModel)).toBe(false);
            expect(rule.check(queryModel)).toBeNull();
        });
    });

    describe('7. Casos de Borda Semânticos (RULE_007, RULE_008 e ANSI SUBSTRING)', () => {
        it('Não deveria disparar HavingWithoutGroupByRule quando HAVING filtra função de agregação', () => {
            const rule = new HavingWithoutGroupByRule();
            const sql = 'SELECT COUNT(*) FROM pedidos HAVING COUNT(*) > 5';
            expect(evaluate(rule, sql)).toBeNull();
        });

        it('Não deveria disparar OuterJoinToInnerJoinRule quando WHERE preserva NULL via OR IS NULL', () => {
            const rule = new OuterJoinToInnerJoinRule();
            const sql = "SELECT c.id FROM clientes c LEFT JOIN pedidos p ON c.id = p.cliente_id WHERE p.id IS NULL OR p.status = 'ATIVO'";
            expect(evaluate(rule, sql)).toBeNull();
        });

        it('Deveria suportar sintaxe ANSI SQL SUBSTRING(col FROM pos FOR len)', () => {
            const sql = "SELECT SUBSTRING(c_phone FROM 1 FOR 2) AS cntrycode FROM customer WHERE c_acctbal > 0 LIMIT 10";
            const queryModel = parser.parse(sql);
            expect(queryModel.type).toBe('SELECT');
        });
    });
});
