const { RuleResult } = require('./HeuristicRule');

/**
 * RuleEngine
 * Orquestra a execução das regras heurísticas sobre um QueryModel.
 */
class RuleEngine {
    constructor() {
        this.rules = [];
    }

    /**
     * Adiciona uma nova regra ao motor.
     * @param {HeuristicRule} rule 
     */
    addRule(rule) {
        this.rules.push(rule);
    }

    /**
     * Executa todas as regras registradas.
     * @param {QueryModel} queryModel 
     * @returns {RuleResult[]} List de resultados encontrados.
     */
    runAll(queryModel) {
        const results = [];
        for (const rule of this.rules) {
            const result = rule.check(queryModel);
            if (result) {
                results.push(result);
            }
        }
        return results;
    }
}

module.exports = RuleEngine;
