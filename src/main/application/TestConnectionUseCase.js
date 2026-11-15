const ConnectionManager = require('./ConnectionManager');
const FriendlyErrorParser = require('../domain/error/FriendlyErrorParser');
const { validateConnectionConfig } = require('../infrastructure/security/ConnectionConfig');

/**
 * TestConnectionUseCase
 * Valida se as credenciais fornecidas são válidas para o SGBD selecionado.
 */
class TestConnectionUseCase {
    async execute(config) {
        let driver;
        try {
            const validated = validateConnectionConfig(config);
            driver = ConnectionManager.getDriver(validated.sgbd);
            await driver.connect(validated);
            await driver.ping(); // Verifica se o servidor responde de fato

            return {
                status: 'success',
                message: 'Conexão realizada com sucesso!'
            };
        } catch (error) {
            const friendly = FriendlyErrorParser.parse(error);
            return {
                status: 'error',
                message: friendly.message,
                error: friendly
            };
        } finally {
            if (driver) {
                try {
                    await driver.disconnect();
                } catch {
                    console.error('Falha ao encerrar o teste de conexão.');
                }
            }
        }
    }
}

module.exports = new TestConnectionUseCase();
