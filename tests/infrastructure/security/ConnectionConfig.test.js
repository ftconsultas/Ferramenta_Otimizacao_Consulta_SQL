const { validateConnectionConfig, publicConnectionConfig } = require('../../../src/main/infrastructure/security/ConnectionConfig');
const MySQLDriver = require('../../../src/main/infrastructure/database/MySQLDriver');
const mysql = require('mysql2/promise');
jest.mock('mysql2/promise');

const config = { sgbd: 'mysql', host: 'localhost', port: 3306, user: 'reader', password: '', database: 'tuning_db' };

beforeEach(() => jest.clearAllMocks());

it.each(['localhost', 'LOCALHOST', '127.0.0.1', '::1'])('permits local host %s', host => {
    expect(validateConnectionConfig({ ...config, host }).host).toBe(host.toLowerCase());
});

it.each([
    null, [], {}, { ...config, host: null }, { ...config, host: 'localhost.example.com' },
    { ...config, host: '127.0.0.1.example.com' }, { ...config, host: 'localhost\0' },
    { ...config, host: 'remote.example' }, { ...config, sgbd: 'other' },
    ...[0, -1, 65536, 3306.5, '3306', NaN].map(port => ({ ...config, port })),
    { ...config, user: '' }, { ...config, database: ' ' }, { ...config, user: 'a'.repeat(257) },
    { ...config, database: 'db\0' }, { ...config, password: null }, { ...config, password: 'x'.repeat(4097) },
    { ...config, password: 'abc\0' }
])('rejects malformed or remote configurations (%#)', input => {
    expect(() => validateConnectionConfig(input)).toThrow();
});

it('discards arbitrary driver options and never exposes the password in public metadata', () => {
    const input = { ...config, password: 'private', socketPath: '/application-data/mysql.sock', multipleStatements: true };
    expect(validateConnectionConfig(input)).toEqual({ ...config, password: 'private' });
    expect(publicConnectionConfig(input)).not.toHaveProperty('password');
    expect(publicConnectionConfig(null)).toBeNull();
});

it('blocks remote hosts at the driver boundary independently of IPC', async () => {
    const driver = new MySQLDriver();
    await expect(driver.connect({ ...config, host: 'example.com' })).rejects.toThrow('Apenas conexões');
    expect(mysql.createConnection).not.toHaveBeenCalled();
});
