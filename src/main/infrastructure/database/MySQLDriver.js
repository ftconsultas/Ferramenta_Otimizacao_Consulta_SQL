const mysql = require('mysql2/promise');
const IDatabaseDriver = require('./IDatabaseDriver');
const { validateConnectionConfig } = require('../security/ConnectionConfig');

/**
 * MySQLDriver
 * Implementação do driver para MySQL.
 */
class MySQLDriver extends IDatabaseDriver {
    constructor() {
        super();
        this.connection = null;
    }

    async connect(config) {
        const validated = validateConnectionConfig({ ...config, sgbd: 'mysql' });
        try {
            this.connection = await mysql.createConnection({
                host: validated.host,
                port: validated.port,
                user: validated.user,
                password: validated.password,
                database: validated.database
            });
            return true;
        } catch (error) {
            console.error('MySQL Connection Error:', error);
            error.message = `Falha ao conectar ao MySQL: ${error.message}`;
            throw error;
        }
    }

    async executeQuery(sql) {
        if (!this.connection) throw new Error('Driver não conectado.');
        const [rows] = await this.connection.execute(sql);
        return rows;
    }

    async getExecutionPlan(sql) {
        if (!this.connection) throw new Error('Driver não conectado.');
        // EXPLAIN ANALYZE coleta métricas de execução reais do MySQL
        const [rows] = await this.connection.execute(`EXPLAIN ANALYZE ${sql}`);
        return rows[0]['EXPLAIN'];
    }

    async ping() {
        if (!this.connection) throw new Error('Driver não conectado.');
        try {
            await this.connection.ping();
            return true;
        } catch (error) {
            throw new Error(`Servidor MySQL não responde: ${error.message}`);
        }
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            this.connection = null;
        }
    }
}

module.exports = MySQLDriver;
