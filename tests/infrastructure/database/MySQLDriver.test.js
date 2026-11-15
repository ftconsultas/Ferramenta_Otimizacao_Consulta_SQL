const MySQLDriver = require('../../../src/main/infrastructure/database/MySQLDriver');
const mysql = require('mysql2/promise');

jest.mock('mysql2/promise');

describe('MySQLDriver', () => {
    let driver;
    const mockConfig = {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'test_db'
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        driver = new MySQLDriver();
    });

    it('deve conectar com sucesso ao MySQL', async () => {
        const mockConnection = {
            end: jest.fn().mockResolvedValue(),
            ping: jest.fn().mockResolvedValue()
        };
        mysql.createConnection.mockResolvedValue(mockConnection);

        const result = await driver.connect(mockConfig);

        expect(result).toBe(true);
        expect(mysql.createConnection).toHaveBeenCalledWith({
            host: mockConfig.host,
            port: mockConfig.port,
            user: mockConfig.user,
            password: mockConfig.password,
            database: mockConfig.database
        });
        expect(driver.connection).toBe(mockConnection);
    });

    it('deve lançar erro se a conexão falhar', async () => {
        mysql.createConnection.mockRejectedValue(new Error('Connection failed'));

        await expect(driver.connect(mockConfig)).rejects.toThrow('Falha ao conectar ao MySQL: Connection failed');
    });

    it('deve executar o ping com sucesso', async () => {
        const mockConnection = {
            ping: jest.fn().mockResolvedValue()
        };
        driver.connection = mockConnection;

        const result = await driver.ping();

        expect(result).toBe(true);
        expect(mockConnection.ping).toHaveBeenCalled();
    });

    it('deve lançar erro se o ping falhar', async () => {
        const mockConnection = {
            ping: jest.fn().mockRejectedValue(new Error('Server down'))
        };
        driver.connection = mockConnection;

        await expect(driver.ping()).rejects.toThrow('Servidor MySQL não responde: Server down');
    });

    it('deve desconectar com sucesso', async () => {
        const mockConnection = {
            end: jest.fn().mockResolvedValue()
        };
        driver.connection = mockConnection;

        await driver.disconnect();

        expect(mockConnection.end).toHaveBeenCalled();
        expect(driver.connection).toBeNull();
    });
});
