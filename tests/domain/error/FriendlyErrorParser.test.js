const FriendlyErrorParser = require('../../../src/main/domain/error/FriendlyErrorParser');

describe('FriendlyErrorParser (RF11 - Tratamento de Erros Amigável)', () => {
    test('deve tratar erro de tabela inexistente (ER_NO_SUCH_TABLE / 1146)', () => {
        const error = {
            code: 'ER_NO_SUCH_TABLE',
            errno: 1146,
            message: "Table 'tpch.empresas' doesn't exist"
        };
        const parsed = FriendlyErrorParser.parse(error);

        expect(parsed.type).toBe('TABLE_NOT_FOUND');
        expect(parsed.title).toBe('Tabela Não Encontrada');
        expect(parsed.message).toContain('empresas');
        expect(parsed.suggestion).toBeDefined();
    });

    test('deve tratar erro de coluna desconhecida (ER_BAD_FIELD_ERROR / 1054)', () => {
        const error = {
            code: 'ER_BAD_FIELD_ERROR',
            errno: 1054,
            message: "Unknown column 'salario_total' in 'field list'"
        };
        const parsed = FriendlyErrorParser.parse(error);

        expect(parsed.type).toBe('COLUMN_NOT_FOUND');
        expect(parsed.title).toBe('Coluna Desconhecida');
        expect(parsed.message).toContain('salario_total');
    });

    test('deve tratar erro de sintaxe SQL (ER_PARSE_ERROR / 1064)', () => {
        const error = {
            code: 'ER_PARSE_ERROR',
            errno: 1064,
            message: "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near 'FROM' at line 1"
        };
        const parsed = FriendlyErrorParser.parse(error);

        expect(parsed.type).toBe('SYNTAX_ERROR');
        expect(parsed.title).toBe('Erro de Sintaxe SQL');
        expect(parsed.message).toContain('FROM');
    });

    test('deve tratar erro de conexão recusada (ECONNREFUSED)', () => {
        const error = {
            code: 'ECONNREFUSED',
            message: 'connect ECONNREFUSED 127.0.0.1:3306'
        };
        const parsed = FriendlyErrorParser.parse(error);

        expect(parsed.type).toBe('CONNECTION_REFUSED');
        expect(parsed.title).toBe('Servidor MySQL Inacessível');
        expect(parsed.suggestion).toContain('Docker');
    });

    test('deve tratar erro de autenticação / senha incorreta (ER_ACCESS_DENIED_ERROR / 1045)', () => {
        const error = {
            code: 'ER_ACCESS_DENIED_ERROR',
            errno: 1045,
            message: "Access denied for user 'root'@'localhost' (using password: YES)"
        };
        const parsed = FriendlyErrorParser.parse(error);

        expect(parsed.type).toBe('AUTH_FAILED');
        expect(parsed.title).toContain('Acesso Negado');
    });

    test('deve tratar erro de banco de dados desconhecido (ER_BAD_DB_ERROR / 1049)', () => {
        const error = {
            code: 'ER_BAD_DB_ERROR',
            errno: 1049,
            message: "Unknown database 'inexistente'"
        };
        const parsed = FriendlyErrorParser.parse(error);

        expect(parsed.type).toBe('DATABASE_NOT_FOUND');
        expect(parsed.message).toContain('inexistente');
    });

    test('deve tratar erro genérico ou string simples', () => {
        const parsed = FriendlyErrorParser.parse('Falha aleatória inesperada');
        expect(parsed.type).toBe('GENERIC_DATABASE_ERROR');
        expect(parsed.message).toBe('Falha aleatória inesperada');
    });

    test('deve tratar erro nulo com fallback seguro', () => {
        const parsed = FriendlyErrorParser.parse(null);
        expect(parsed.type).toBe('UNKNOWN_ERROR');
    });
});
