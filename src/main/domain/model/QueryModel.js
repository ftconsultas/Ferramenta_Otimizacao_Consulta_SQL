/**
 * QueryModel
 * Representação padronizada de uma consulta SQL após o parsing.
 */
class QueryModel {
    constructor() {
        this.type = null;         // SELECT, INSERT, UPDATE, DELETE
        this.columns = [];        // Colunas projetadas (SELECT)
        this.tables = [];         // Tabelas envolvidas
        this.joins = [];          // Detalhes dos joins
        this.where = null;        // AST da cláusula WHERE
        this.groupBy = null;      // AST da cláusula GROUP BY
        this.orderBy = null;      // AST da cláusula ORDER BY
        this.limit = null;        // AST da cláusula LIMIT
        this.setOp = null;        // UNION, UNION ALL, etc.
        this.rawSql = '';         // SQL original
    }
}

module.exports = QueryModel;
