const ConnectionManager = require('./ConnectionManager');
const CredentialManager = require('../infrastructure/security/CredentialManager');
const MySQLExecutionPlanAnalyzer = require('../domain/executionPlan/MySQLExecutionPlanAnalyzer');
const AnalyzeSQLUseCase = require('./AnalyzeSQLUseCase');
const FriendlyErrorParser = require('../domain/error/FriendlyErrorParser');

/**
 * AnalyzeExecutionPlanUseCase
 * Obtém o plano de execução real do banco (EXPLAIN ANALYZE) e o processa para o modelo do sistema,
 * integrando também as sugestões de reescrita estática de código (AST).
 */
class AnalyzeExecutionPlanUseCase {
    constructor() {
        this.mysqlAnalyzer = new MySQLExecutionPlanAnalyzer();
    }

    async execute(sql, sgbd) {
        let driver = null;
        try {
            // 1. Análise Estática Heurística (AST)
            const staticAnalysis = AnalyzeSQLUseCase.execute(sql);
            const heuristics = staticAnalysis.status === 'success' ? staticAnalysis.results : [];

            // 2. Credenciais para EXPLAIN ANALYZE
            const config = await CredentialManager.load();
            if (!config) {
                throw new Error('Nenhuma credencial configurada. Conecte-se pelas Configurações primeiro.');
            }

            driver = ConnectionManager.getDriver(sgbd);
            
            // 3. Conecta para buscar o plano EXPLAIN ANALYZE
            await driver.connect(config);
            const rawPlan = await driver.getExecutionPlan(sql);

            // 4. Parse do plano dinâmico
            let planModel;
            if (sgbd === 'mysql') {
                planModel = this.mysqlAnalyzer.analyze(rawPlan, sql);
            } else {
                throw new Error('SGBD não suportado para análise de plano.');
            }

            const filteredHeuristics = this.filterHeuristicsByPlan(heuristics, planModel);

            return {
                status: 'success',
                heuristics: filteredHeuristics,
                plan: planModel
            };
        } catch (error) {
            const friendly = FriendlyErrorParser.parse(error);
            return {
                status: 'error',
                message: friendly.message,
                error: friendly
            };
        }

 finally {
            if (driver) {
                try {
                    await driver.disconnect();
                } catch (e) {
                    console.error('Error disconnecting driver during plan analysis:', e);
                }
            }
        }
    }

    /**
     * Filtra alertas estáticos que se tornam falsos positivos diante das métricas reais do plano (OLTP / Point Lookups).
     */
    filterHeuristicsByPlan(heuristics, planModel) {
        if (!Array.isArray(heuristics) || !planModel || !Array.isArray(planModel.nodes) || planModel.nodes.length === 0) {
            return heuristics;
        }

        const nodes = planModel.nodes;
        const root = planModel.root || nodes[0];
        const hasTableScan = nodes.some(n => String(n.type || '').includes('Varredura Completa'));
        const hasCartesianOrImplicitJoin = heuristics.some(h => h.ruleId === 'RULE_002')
            || nodes.some(n => String(n.type || '').includes('Produto Cartesiano') || String(n.tuningTip || '').includes('Produto Cartesiano'));

        if (hasCartesianOrImplicitJoin) {
            return heuristics;
        }

        const isSingleRowResult = !hasTableScan
            && (root.actualRows !== null && root.actualRows <= 1)
            && (root.rows === null || root.rows <= 1)
            && nodes.every(n => (n.actualRows === null || n.actualRows <= 1));

        if (!isSingleRowResult) {
            return heuristics;
        }

        return heuristics.filter(h => h.ruleId !== 'RULE_017');
    }
}

module.exports = new AnalyzeExecutionPlanUseCase();
