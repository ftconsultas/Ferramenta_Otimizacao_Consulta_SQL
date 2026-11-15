/**
 * ExecutionPlanModel
 * Representação padronizada do plano de execução de uma consulta.
 */
class ExecutionPlanModel {
    constructor() {
        this.nodes = [];       // Lista de operações (nós)
        this.totalCost = null; // Custo total da consulta
        this.totalRows = null; // Estimativa total de linhas
        this.raw = null;       // Saída bruta do SGBD (JSON)
    }
}

class PlanNode {
    constructor(id, type, table, cost, rows) {
        this.id = id;
        this.type = type;      // Limit, Filter, Table scan, etc.
        this.table = table;
        this.cost = cost;      // Custo estimado
        this.rows = rows;      // Linhas estimadas
        
        // Dados Reais (EXPLAIN ANALYZE)
        this.actualTimeStart = null; // X em X..Y
        this.actualTimeEnd = null;   // Y em X..Y
        this.totalActualTime = null; // Y * loops
        this.selfTime = null;        // totalActualTime - sum(children totalActualTime)
        this.actualRows = null;      // Linhas passadas fisicamente
        this.loops = null;           // Quantidade de iterações do laco
        
        this.isStartupHeavy = false; // Se X é muito alto em relação a Y
        this.tuningTip = null;       // Dica específica de otimização
        
        this.children = [];    // Nós dependentes
        this.parent = null;    // Referência ao pai
        this.details = {};     // Informações adicionais
    }
}

module.exports = { ExecutionPlanModel, PlanNode };
