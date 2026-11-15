const MySQLExecutionPlanAnalyzer = require('../../../src/main/domain/executionPlan/MySQLExecutionPlanAnalyzer');

describe('MySQLExecutionPlanAnalyzer', () => {
    let analyzer;

    beforeEach(() => {
        analyzer = new MySQLExecutionPlanAnalyzer();
    });

    it('should successfully parse normal explain analyze formats (no scientific notation)', () => {
        const raw = `-> Single-row index lookup on c using PRIMARY (c_custkey=o.o_custkey)  (cost=0.65 rows=1) (actual time=0.004..0.005 rows=1 loops=3)`;
        const result = analyzer.analyze(raw);

        expect(result.nodes).toHaveLength(1);
        const node = result.nodes[0];
        expect(node.cost).toBe(0.65);
        expect(node.rows).toBe(1);
        expect(node.actualTimeStart).toBe(0.004);
        expect(node.actualTimeEnd).toBe(0.005);
        expect(node.actualRows).toBe(1);
        expect(node.loops).toBe(3);
        expect(node.totalActualTime).toBe(0.005 * 3);
    });

    it('should successfully parse scientific notation formats (cost, rows, actual rows, loops)', () => {
        const raw = `-> Nested loop inner join  (cost=2.11e+6 rows=2.41e+6) (actual time=2042..23439 rows=3.56e+6 loops=1)
    -> Filter: (o.o_totalprice > (select #2))  (cost=299962 rows=2.41e+6) (actual time=2042..5318 rows=3.56e+6 loops=1)
        -> Table scan on o  (cost=299962 rows=7.24e+6) (actual time=2.46..2305 rows=7.5e+6 loops=1)
        -> Select #2 (subquery in condition; run only once)
            -> Aggregate: avg(orders.o_totalprice)  (cost=1.51e+6 rows=1) (actual time=2039..2039 rows=1 loops=1)
                -> Table scan on orders  (cost=782874 rows=7.24e+6) (actual time=1.33..1459 rows=7.5e+6 loops=1)
    -> Single-row index lookup on c using PRIMARY (c_custkey=o.o_custkey)  (cost=0.65 rows=1) (actual time=0.00493..0.00495 rows=1 loops=3.56e+6)`;

        const result = analyzer.analyze(raw);

        expect(result.nodes.length).toBeGreaterThan(0);
        
        // Find Nested Loop Inner Join
        const nestedLoop = result.nodes.find(n => n.type === 'Nested Loop Join');
        expect(nestedLoop).toBeDefined();
        expect(nestedLoop.cost).toBe(2110000);
        expect(nestedLoop.rows).toBe(2410000);
        expect(nestedLoop.actualTimeStart).toBe(2042);
        expect(nestedLoop.actualTimeEnd).toBe(23439);
        expect(nestedLoop.actualRows).toBe(3560000);
        expect(nestedLoop.loops).toBe(1);

        // Find Table Scan on o
        const tableScanO = result.nodes.find(n => n.table === 'o');
        expect(tableScanO).toBeDefined();
        expect(tableScanO.cost).toBe(299962);
        expect(tableScanO.rows).toBe(7240000);
        expect(tableScanO.actualTimeStart).toBe(2.46);
        expect(tableScanO.actualTimeEnd).toBe(2305);
        expect(tableScanO.actualRows).toBe(7500000);
        expect(tableScanO.loops).toBe(1);

        // Find Primary Key Index Lookup on c
        const indexLookupC = result.nodes.find(n => n.type === 'Busca por Índice (Index Lookup)');
        expect(indexLookupC).toBeDefined();
        expect(indexLookupC.cost).toBe(0.65);
        expect(indexLookupC.rows).toBe(1);
        expect(indexLookupC.actualTimeStart).toBe(0.00493);
        expect(indexLookupC.actualTimeEnd).toBe(0.00495);
        expect(indexLookupC.actualRows).toBe(1);
        expect(indexLookupC.loops).toBe(3560000);
    });

    it('should recognize Rows fetched before execution (Const/PK lookup) and extract target table from SQL', () => {
        const raw = `-> Rows fetched before execution  (cost=0..0 rows=1) (actual time=0.0001..0.0001 rows=1 loops=1)`;
        const sql = `SELECT c_custkey, c_name FROM customer WHERE c_custkey = 1;`;
        const result = analyzer.analyze(raw, sql);

        expect(result.nodes).toHaveLength(1);
        const node = result.nodes[0];
        expect(node.type).toBe('Busca Constante por Índice Único/PK (Const Lookup)');
        expect(node.table).toBe('customer');
        expect(node.actualRows).toBe(1);
        expect(node.isStartupHeavy).toBe(false);
        expect(node.tuningTip).toContain('Busca Constante Otimizada');
    });

    it('should NEVER praise a cost=0 Const Lookup when the SQL contains a Cartesian Product (N x M)', () => {
        const raw = `-> Rows fetched before execution  (cost=0..0 rows=1) (actual time=0.0001..0.0001 rows=1 loops=1)`;
        const sql = `SELECT * FROM customer c, orders o WHERE c.c_custkey = 1 AND o.o_orderkey = 2;`;
        const result = analyzer.analyze(raw, sql);

        expect(result.nodes).toHaveLength(1);
        const node = result.nodes[0];
        expect(node.type).toBe('Busca Constante com Alerta de Produto Cartesiano');
        expect(node.tuningTip).toContain('Produto Cartesiano');
        expect(node.tuningTip).not.toContain('Busca Constante Otimizada');
    });

    it('should warn about Cartesian Product even when EXPLAIN ANALYZE reports Zero rows', () => {
        const raw = `-> Zero rows (no matching row in const table)  (cost=0..0 rows=0) (actual time=0.0001..0.0001 rows=0 loops=1)`;
        const sql = `SELECT * FROM customer c, orders o WHERE c.c_custkey = -1;`;
        const result = analyzer.analyze(raw, sql);

        expect(result.nodes).toHaveLength(1);
        const node = result.nodes[0];
        expect(node.tuningTip).toContain('Produto Cartesiano');
    });

    it('should warn about Cartesian Product when one table is folded as const and the other is scanned without join condition', () => {
        const raw = `-> Table scan on o  (cost=1.25 rows=10) (actual time=0.01..0.05 rows=10 loops=1)`;
        const sql = `SELECT * FROM customer c, orders o WHERE c.c_custkey = 1;`;
        const result = analyzer.analyze(raw, sql);

        expect(result.root.tuningTip).toContain('Produto Cartesiano');
    });
});
