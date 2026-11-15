/**
 * HeuristicRule
 * Classe base para todas as regras de análise estática.
 *
 * Convenção de documentação:
 * - Cada subclasse deve declarar, no JSDoc da classe, a referência teórica
 *   ou documentação oficial que embasa a heurística aplicada.
 * - Fontes preferenciais: documentação do SGBD, SQL standard e livros/artigos
 *   de tuning reconhecidos.
 */
class HeuristicRule {
    constructor(id, title, description, severity, references = []) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.severity = severity; // 'LOW', 'MEDIUM', 'HIGH'
        this.references = references;
    }

    /**
     * Verifica se a regra se aplica ao modelo da consulta.
     * @param {QueryModel} queryModel 
     * @returns {RuleResult | null}
     */
    check(queryModel) {
        throw new Error("O método check() deve ser implementado.");
    }
}

class RuleResult {
    constructor(rule, message, suggestion, targetTokens = []) {
        this.ruleId = rule.id;
        this.title = rule.title;
        this.message = message;
        this.suggestion = suggestion;
        this.severity = rule.severity;
        this.targetTokens = targetTokens;
        this.references = rule.references;
    }
}

module.exports = { HeuristicRule, RuleResult };
