/**
 * FriendlyErrorParser
 * Responsável por padronizar e traduzir erros técnicos (MySQL, Parser, Conexão)
 * em mensagens pedagógicas e compreensíveis para estudantes (Atende ao RF11).
 */
class FriendlyErrorParser {
    /**
     * Normaliza qualquer erro em um objeto padronizado com orientações didáticas.
     * @param {Error|Object|string} error 
     * @returns {Object} { type, title, message, suggestion, detail }
     */
    static parse(error) {
        if (!error) {
            return {
                type: 'UNKNOWN_ERROR',
                title: 'Erro Inesperado',
                message: 'Ocorreu uma falha não identificada.',
                suggestion: 'Tente novamente ou verifique os logs do sistema.',
                detail: ''
            };
        }

        const rawMessage = typeof error === 'string' ? error : (error.message || String(error));
        const code = error.code || '';
        const errno = error.errno || 0;
        const sqlState = error.sqlState || '';

        // 1. Falhas de Conexão e Rede
        if (code === 'ECONNREFUSED' || rawMessage.includes('ECONNREFUSED')) {
            return {
                type: 'CONNECTION_REFUSED',
                title: 'Servidor MySQL Inacessível',
                message: 'Não foi possível conectar ao MySQL. O serviço parece estar desligado ou a porta informada está incorreta.',
                suggestion: 'Verifique se o seu contêiner Docker ou serviço local do MySQL está ativo (ex: `docker-compose up -d db` ou `systemctl status mysql`).',
                detail: `Código: ${code || 'ECONNREFUSED'} | Mensagem: ${rawMessage}`
            };
        }

        if (code === 'ENOTFOUND' || rawMessage.includes('ENOTFOUND')) {
            return {
                type: 'HOST_NOT_FOUND',
                title: 'Host do Banco Não Encontrado',
                message: 'O endereço de host informado não pôde ser resolvido na rede.',
                suggestion: 'Verifique se o host está correto nas Configurações (ex: "localhost" ou "127.0.0.1").',
                detail: rawMessage
            };
        }

        if (code === 'ETIMEDOUT' || rawMessage.includes('ETIMEDOUT')) {
            return {
                type: 'CONNECTION_TIMEOUT',
                title: 'Tempo de Conexão Esgotado',
                message: 'A tentativa de comunicação com o servidor MySQL excedeu o tempo limite.',
                suggestion: 'Verifique se o firewall não está bloqueando a porta ou se a rede está instável.',
                detail: rawMessage
            };
        }

        // 2. Erros de Autenticação e Permissão (MySQL 1045)
        if (code === 'ER_ACCESS_DENIED_ERROR' || errno === 1045 || rawMessage.includes('Access denied for user')) {
            return {
                type: 'AUTH_FAILED',
                title: 'Acesso Negado (Usuário ou Senha Incorretos)',
                message: 'O servidor MySQL recusou as credenciais de autenticação informadas.',
                suggestion: 'Abra a tela de Configurações e revise o usuário e a senha cadastrados.',
                detail: rawMessage
            };
        }

        // 3. Banco de Dados Inexistente (MySQL 1049)
        if (code === 'ER_BAD_DB_ERROR' || errno === 1049 || rawMessage.includes('Unknown database')) {
            const dbMatch = rawMessage.match(/Unknown database '([^']+)'/i);
            const dbName = dbMatch ? dbMatch[1] : 'informado';
            return {
                type: 'DATABASE_NOT_FOUND',
                title: 'Banco de Dados Não Encontrado',
                message: `O banco de dados "${dbName}" não existe no servidor MySQL conectado.`,
                suggestion: 'Verifique o nome do banco de dados na tela de Configurações ou crie a base antes de executar.',
                detail: rawMessage
            };
        }

        // 4. Tabela Inexistente (MySQL 1146)
        if (code === 'ER_NO_SUCH_TABLE' || errno === 1146 || rawMessage.includes("doesn't exist")) {
            const tableMatch = rawMessage.match(/Table '([^']+)' doesn't exist/i);
            const tableName = tableMatch ? tableMatch[1] : 'indicada no SQL';
            return {
                type: 'TABLE_NOT_FOUND',
                title: 'Tabela Não Encontrada',
                message: `A tabela "${tableName}" não foi encontrada no banco de dados.`,
                suggestion: 'Confira a ortografia do nome da tabela na sua consulta SQL ou verifique se as tabelas já foram criadas e populadas no banco.',
                detail: rawMessage
            };
        }

        // 5. Coluna Inexistente (MySQL 1054)
        if (code === 'ER_BAD_FIELD_ERROR' || errno === 1054 || rawMessage.includes('Unknown column')) {
            const colMatch = rawMessage.match(/Unknown column '([^']+)' in '([^']+)'/i) || rawMessage.match(/Unknown column '([^']+)'/i);
            const colName = colMatch ? colMatch[1] : 'indicada';
            const context = colMatch && colMatch[2] ? ` na cláusula ${colMatch[2]}` : '';
            return {
                type: 'COLUMN_NOT_FOUND',
                title: 'Coluna Desconhecida',
                message: `A coluna "${colName}" não existe na estrutura das tabelas consultadas${context}.`,
                suggestion: 'Verifique se o nome do campo ou alias da tabela está escrito corretamente no SELECT, WHERE ou JOIN.',
                detail: rawMessage
            };
        }

        // 6. Erro de Sintaxe SQL (MySQL 1064 ou SQLParser)
        if (
            code === 'ER_PARSE_ERROR' ||
            errno === 1064 ||
            rawMessage.includes('You have an error in your SQL syntax') ||
            rawMessage.includes('Erro de sintaxe SQL') ||
            rawMessage.includes('syntax error')
        ) {
            let syntaxHint = '';
            const nearMatch = rawMessage.match(/near '([^']+)' at line (\d+)/i);
            if (nearMatch) {
                syntaxHint = ` Próximo a "${nearMatch[1]}" (linha ${nearMatch[2]}).`;
            }

            return {
                type: 'SYNTAX_ERROR',
                title: 'Erro de Sintaxe SQL',
                message: `A estrutura da consulta SQL contém falhas de escrita ou palavras-chave fora de ordem.${syntaxHint}`,
                suggestion: 'Revise vírgulas faltantes, parênteses não fechados ou cláusulas fora da ordem padrão (SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT).',
                detail: rawMessage
            };
        }

        // 7. Ausência de Credenciais Configurações
        if (rawMessage.includes('Nenhuma credencial configurada') || rawMessage.includes('Driver não conectado')) {
            return {
                type: 'CONFIG_MISSING',
                title: 'Conexão Não Configurada',
                message: 'Nenhuma conexão ativa com o MySQL foi encontrada para gerar o plano real.',
                suggestion: 'Acesse a aba "Configurações", preencha os dados do seu MySQL e teste a conexão.',
                detail: rawMessage
            };
        }

        // Fallback genérico amigável
        return {
            type: 'GENERIC_DATABASE_ERROR',
            title: 'Erro na Execução da Consulta',
            message: rawMessage,
            suggestion: 'Verifique se a consulta é válida e se os dados e tabelas informados estão disponíveis.',
            detail: `Code: ${code || 'N/A'} | SqlState: ${sqlState || 'N/A'}`
        };
    }
}

module.exports = FriendlyErrorParser;
