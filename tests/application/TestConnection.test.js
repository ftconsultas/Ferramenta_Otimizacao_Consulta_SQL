const TestConnectionUseCase = require('../../src/main/application/TestConnectionUseCase');
const ConnectionManager = require('../../src/main/application/ConnectionManager');

jest.mock('../../src/main/application/ConnectionManager');

describe('TestConnectionUseCase', () => {
    // COnfigurações Mockadas
    const mockConfig = {
        sgbd: 'mysql',
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'test_db'
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('deve validar com sucesso conexões locais', async () => {
        const mockDriver = {
            connect: jest.fn().mockResolvedValue(true),
            ping: jest.fn().mockResolvedValue(true),
            disconnect: jest.fn().mockResolvedValue(true)
        };
        ConnectionManager.getDriver.mockReturnValue(mockDriver);

        const result = await TestConnectionUseCase.execute(mockConfig);

        expect(result.status).toBe('success');
        expect(result.message).toBe('Conexão realizada com sucesso!');
        expect(mockDriver.connect).toHaveBeenCalledWith(mockConfig);
        expect(mockDriver.ping).toHaveBeenCalled();
        expect(mockDriver.disconnect).toHaveBeenCalled();
    });

    it('deve bloquear conexões para hosts não permitidos', async () => {
        const externalConfig = { ...mockConfig, host: '192.168.1.100' };

        const result = await TestConnectionUseCase.execute(externalConfig);

        expect(result.status).toBe('error');
        expect(result.message).toContain('Apenas conexões com localhost/127.0.0.1 são permitidas');
        expect(ConnectionManager.getDriver).not.toHaveBeenCalled();
    });

    it('deve retornar erro se o driver falhar na conexão', async () => {
        const mockDriver = {
            connect: jest.fn().mockRejectedValue(new Error('Auth failed')),
            ping: jest.fn(),
            disconnect: jest.fn()
        };
        ConnectionManager.getDriver.mockReturnValue(mockDriver);

        const result = await TestConnectionUseCase.execute(mockConfig);

        expect(result.status).toBe('error');
        expect(result.message).toBe('Auth failed');
    });

    it('deve retornar erro se o ping falhar após a conexão', async () => {
        const mockDriver = {
            connect: jest.fn().mockResolvedValue(true),
            ping: jest.fn().mockRejectedValue(new Error('Ping timeout')),
            disconnect: jest.fn().mockResolvedValue(true)
        };
        ConnectionManager.getDriver.mockReturnValue(mockDriver);

        const result = await TestConnectionUseCase.execute(mockConfig);

        expect(result.status).toBe('error');
        expect(result.message).toBe('Ping timeout');
    });
});
