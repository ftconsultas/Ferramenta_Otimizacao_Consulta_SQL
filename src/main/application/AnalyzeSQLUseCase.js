const SQLParser = require('../domain/parser/SQLParser');
const RuleEngine = require('../domain/heuristics/RuleEngine');
const SelectStarRule = require('../domain/heuristics/SelectStarRule');
const LimitRowsRule = require('../domain/heuristics/LimitRowsRule');
const WhereFunctionsRule = require('../domain/heuristics/WhereFunctionsRule');
const LikeWildcardRule = require('../domain/heuristics/LikeWildcardRule');
const UnionAllRule = require('../domain/heuristics/UnionAllRule');
const ExistsInsteadOfInRule = require('../domain/heuristics/ExistsInsteadOfInRule');
const ImplicitJoinRule = require('../domain/heuristics/ImplicitJoinRule');
const OrderByRandRule = require('../domain/heuristics/OrderByRandRule');
const HavingWithoutGroupByRule = require('../domain/heuristics/HavingWithoutGroupByRule');
const CorrelatedSubquerySelectRule = require('../domain/heuristics/CorrelatedSubquerySelectRule');
const CountColumnVersusStarRule = require('../domain/heuristics/CountColumnVersusStarRule');
const OuterJoinToInnerJoinRule = require('../domain/heuristics/OuterJoinToInnerJoinRule');
const RowConstructorRule = require('../domain/heuristics/RowConstructorRule');
const OrderByFunctionRule = require('../domain/heuristics/OrderByFunctionRule');
const DistinctOrderByRule = require('../domain/heuristics/DistinctOrderByRule');
const NondeterministicWhereRule = require('../domain/heuristics/NondeterministicWhereRule');
const MixedOrderDirectionRule = require('../domain/heuristics/MixedOrderDirectionRule');
const FriendlyErrorParser = require('../domain/error/FriendlyErrorParser');

/**
 * AnalyzeSQLUseCase
 * Caso de uso para realizar a análise estática (RF01).
 */
class AnalyzeSQLUseCase {
    constructor() {
        this.parser = new SQLParser();
        this.ruleEngine = new RuleEngine();

        // Registrar regras ativas
        this.ruleEngine.addRule(new SelectStarRule());
        this.ruleEngine.addRule(new LimitRowsRule());
        this.ruleEngine.addRule(new WhereFunctionsRule());
        this.ruleEngine.addRule(new LikeWildcardRule());
        this.ruleEngine.addRule(new UnionAllRule());
        this.ruleEngine.addRule(new ExistsInsteadOfInRule());
        this.ruleEngine.addRule(new ImplicitJoinRule());
        this.ruleEngine.addRule(new OrderByRandRule());
        this.ruleEngine.addRule(new HavingWithoutGroupByRule());
        this.ruleEngine.addRule(new CorrelatedSubquerySelectRule());
        this.ruleEngine.addRule(new CountColumnVersusStarRule());
        this.ruleEngine.addRule(new OuterJoinToInnerJoinRule());
        this.ruleEngine.addRule(new RowConstructorRule());
        this.ruleEngine.addRule(new OrderByFunctionRule());
        this.ruleEngine.addRule(new DistinctOrderByRule());
        this.ruleEngine.addRule(new NondeterministicWhereRule());
        this.ruleEngine.addRule(new MixedOrderDirectionRule());
    }


    /**
     * Executa a anlise da consulta SQL.
     * @param {string} sql 
     * @returns {Object} Resultado da anlise com status e sugestes.
     */
    execute(sql) {
        try {
            const queryModel = this.parser.parse(sql);
            const results = this.ruleEngine.runAll(queryModel);

            return {
                status: 'success',
                results: results.map(r => ({
                    ruleId: r.ruleId,
                    title: r.title,
                    message: r.message,
                    suggestion: r.suggestion,
                    severity: r.severity,
                    targetTokens: r.targetTokens,
                    references: r.references
                }))
            };
        } catch (error) {
            const friendly = FriendlyErrorParser.parse(error);
            return {
                status: 'error',
                message: friendly.message,
                error: friendly
            };
        }
    }
}

module.exports = new AnalyzeSQLUseCase();
