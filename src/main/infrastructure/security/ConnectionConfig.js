function validText(value, maxLength, allowEmpty = false) {
    return typeof value === 'string' && value.length <= maxLength && !value.includes('\0') &&
        (allowEmpty || value.trim().length > 0);
}

function validateEndpoint(config) {
    if (typeof config.host !== 'string' || !['localhost', '127.0.0.1', '::1'].includes(config.host.toLowerCase())) {
        throw new Error('Segurança: Apenas conexões com localhost/127.0.0.1 são permitidas.');
    }
    if (config.sgbd !== 'mysql') throw new Error('SGBD não suportado.');
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
        throw new Error('Informe uma porta válida entre 1 e 65535.');
    }
}

function validateConnectionConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('Configuração de conexão inválida.');
    }
    validateEndpoint(config);
    for (const field of ['user', 'database']) {
        if (!validText(config[field], 256)) {
            throw new Error('Informe usuário e banco de dados válidos.');
        }
    }
    if (!validText(config.password, 4096, true)) {
        throw new Error('Senha inválida.');
    }
    return {
        sgbd: config.sgbd,
        host: config.host.toLowerCase(),
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database
    };
}

function publicConnectionConfig(config) {
    if (!config) return null;
    const { sgbd, host, port, user, database } = validateConnectionConfig(config);
    return { sgbd, host, port, user, database, hasSavedPassword: true };
}

module.exports = { validateConnectionConfig, publicConnectionConfig };
