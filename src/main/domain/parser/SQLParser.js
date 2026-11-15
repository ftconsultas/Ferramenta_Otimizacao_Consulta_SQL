const { Parser } = require('node-sql-parser');
const QueryModel = require('../model/QueryModel');

/**
 * SQLParser
 * Encapsula a lógica de conversão de SQL bruto para QueryModel usando node-sql-parser.
 */
class SQLParser {
    constructor() {
        this.parser = new Parser();
    }

    /**
     * Converte SQL em um QueryModel.
     * @param {string} sql 
     * @returns {QueryModel}
     */
    parse(sql) {
        try {
            const normalizedSql = String(sql).replace(
                /\b(SUBSTRING|SUBSTR)\s*\(\s*([^,)]+?)\s+FROM\s+([^,)]+?)(?:\s+FOR\s+([^,)]+?))?\s*\)/gi,
                (_, fn, strExpr, posExpr, lenExpr) => lenExpr !== undefined
                    ? `${fn}(${strExpr}, ${posExpr}, ${lenExpr})`
                    : `${fn}(${strExpr}, ${posExpr})`
            );

            const ast = this.parser.astify(normalizedSql);
            const queryModel = new QueryModel();
            queryModel.rawSql = sql;

            const query = Array.isArray(ast) ? ast[0] : ast;

            if (query && query.type === 'select') {
                queryModel.type = 'SELECT';

                let current = query;
                const allColumns = [];
                const primaryTables = [];
                const primaryJoins = [];
                const selectBlocks = [];
                let isPrimaryBlock = true;

                while (current) {
                    const blockTables = [];
                    const blockJoins = [];
                    const blockFromEntries = [];

                    // Mapeia colunas
                    if (current.columns === '*') {
                        allColumns.push('*');
                    } else if (Array.isArray(current.columns)) {
                        current.columns.forEach(c => {
                            if (c.expr && c.expr.column) {
                                allColumns.push(c.expr.column);
                                if (c.as) allColumns.push(c.as);
                            } else if (c.column) {
                                allColumns.push(c.column);
                                if (c.as) allColumns.push(c.as);
                            } else {
                                allColumns.push(c);
                                if (c && c.as) allColumns.push(c.as);
                            }
                        });
                    }

                    // Mapeia tabelas e joins por bloco SELECT (sem fundir ramos de UNION na mesma cláusula FROM)
                    if (Array.isArray(current.from)) {
                        current.from.forEach((f, idx) => {
                            const tableName = f.table || (f.expr ? (f.as || `__derived_${idx}`) : null);
                            if (tableName) {
                                blockTables.push(tableName);
                                if (isPrimaryBlock) primaryTables.push(tableName);
                            }
                            blockFromEntries.push({
                                table: tableName,
                                as: f.as || null,
                                join: f.join || null,
                                on: f.on || null,
                                using: f.using || null,
                                isDerived: Boolean(!f.table && f.expr)
                            });
                            if (f.join) {
                                const joinObj = {
                                    type: f.join,
                                    table: tableName,
                                    as: f.as,
                                    on: f.on,
                                    using: f.using || null
                                };
                                blockJoins.push(joinObj);
                                if (isPrimaryBlock) primaryJoins.push(joinObj);
                            }
                        });
                    }

                    selectBlocks.push({
                        tables: blockTables,
                        joins: blockJoins,
                        fromEntries: blockFromEntries,
                        where: current.where || null,
                        groupBy: current.groupby || null,
                        having: current.having || null,
                        orderBy: current.orderby || null
                    });

                    if (current.limit) {
                        queryModel.limit = current.limit;
                    }

                    if (current.set_op) {
                        queryModel.setOp = current.set_op;
                    }

                    isPrimaryBlock = false;
                    current = current._next;
                }

                queryModel.columns = [...new Set(allColumns)];
                queryModel.tables = primaryTables;
                queryModel.joins = primaryJoins;
                queryModel.selectBlocks = selectBlocks;
                queryModel.where = query.where;
                queryModel.groupBy = query.groupby;
                queryModel.having = query.having;
                queryModel.orderBy = query.orderby;

                // Checagem de segurança (fallback) para LIMIT no SQL original em instrução composta
                if (!queryModel.limit && /\blimit\s+\d+/i.test(sql)) {
                    queryModel.limit = { hasLimit: true };
                }

                // Checagem de segurança (fallback) para UNION/set_op
                if (!queryModel.setOp && /\bunion\s+all\b/i.test(sql)) {
                    queryModel.setOp = 'union all';
                } else if (!queryModel.setOp && /\bunion\b/i.test(sql)) {
                    queryModel.setOp = 'union';
                }
            }

            return queryModel;
        } catch (error) {
            console.error('Erro ao fazer parse do SQL:', error);
            throw new Error('Erro de sintaxe SQL ou formato não suportado.');
        }
    }
}

module.exports = SQLParser;
