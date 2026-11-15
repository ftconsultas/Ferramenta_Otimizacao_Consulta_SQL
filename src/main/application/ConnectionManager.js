const MySQLDriver = require('../infrastructure/database/MySQLDriver');

/**
 * ConnectionManager
 * Singleton para gerenciar a instância ativa do driver de banco de dados.
 */
class ConnectionManager {
    constructor() {
        this.activeDriver = null;
        this.activeSgbd = null;
    }

    /**
     * @param {string} sgbd 'mysql'
     * @returns {IDatabaseDriver}
     */
    getDriver(sgbd) {
        if (this.activeSgbd === sgbd && this.activeDriver) {
            return this.activeDriver;
        }

        if (sgbd === 'mysql') {
            this.activeDriver = new MySQLDriver();
        } else {
            throw new Error('SGBD não suportado.');
        }

        this.activeSgbd = sgbd;
        return this.activeDriver;
    }

    getActiveDriver() {
        if (!this.activeDriver) throw new Error('Nenhuma conexão ativa configurada.');
        return this.activeDriver;
    }
}

module.exports = new ConnectionManager();
