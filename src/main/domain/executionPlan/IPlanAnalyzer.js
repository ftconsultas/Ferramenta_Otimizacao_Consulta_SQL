/**
 * IPlanAnalyzer
 * Interface para conversores de saída bruta de EXPLAIN para ExecutionPlanModel.
 */
class IPlanAnalyzer {
    /**
     * @param {any} rawOutput
     * @returns {ExecutionPlanModel}
     */
    analyze(rawOutput) {
        throw new Error('Not implemented');
    }

    /**
     * Mapeia operações específicas do banco para tipos genéricos do sistema.
     * @param {string} dbOperation 
     * @returns {string} FULL_SCAN, INDEX_SCAN, etc.
     */
    mapOperationType(dbOperation) {
        throw new Error('Not implemented');
    }
}

module.exports = IPlanAnalyzer;
