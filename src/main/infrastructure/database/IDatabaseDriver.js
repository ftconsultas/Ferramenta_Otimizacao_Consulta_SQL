/**
 * IDatabaseDriver
 * Interface base para os drivers de banco de dados.
 */
class IDatabaseDriver {
    async connect(config) { throw new Error('Not implemented'); }
    async executeQuery(sql) { throw new Error('Not implemented'); }
    async getExecutionPlan(sql) { throw new Error('Not implemented'); }
    async disconnect() { throw new Error('Not implemented'); }
}

module.exports = IDatabaseDriver;
