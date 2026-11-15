const IPlanAnalyzer = require('./IPlanAnalyzer');
const { ExecutionPlanModel, PlanNode } = require('../model/ExecutionPlanModel');
const SQLParser = require('../parser/SQLParser');
const ImplicitJoinRule = require('../heuristics/ImplicitJoinRule');

/**
 * MySQLExecutionPlanAnalyzer
 * Analisador especializado para a string pura do EXPLAIN ANALYZE do MySQL (Formato Árvore).
 */
class MySQLExecutionPlanAnalyzer extends IPlanAnalyzer {
    analyze(rawOutput, originalSql = "") {
        const model = new ExecutionPlanModel();
        model.raw = rawOutput;

        if (typeof rawOutput !== 'string') {
            return model;
        }

        let hasCartesianInSql = false;
        if (originalSql && typeof originalSql === 'string' && originalSql.trim() !== '') {
            try {
                const parser = new SQLParser();
                const queryModel = parser.parse(originalSql);
                if (queryModel && queryModel.type === 'SELECT') {
                    hasCartesianInSql = ImplicitJoinRule.hasCartesianProduct(queryModel);
                }
            } catch {
                // Em caso de falha no parser estático, segue com a análise da árvore do EXPLAIN
            }
        }

        const lines = rawOutput.split('\n').filter(line => line.trim() !== '');

        // Stack para manter o controle da profundidade da árvore
        const stack = [];
        let rootNode = null;
        let allNodes = [];
        const fromTables = originalSql
            ? Array.from(originalSql.matchAll(/\bfrom\s+([`"\w.]+)/gi), m => m[1].replace(/[`"]/g, ''))
            : [];
        let constLookupIndex = 0;

        for (const line of lines) {
            const matchPrefix = line.match(/^(\s*)(?:->\s+)?(.*)/);
            if (!matchPrefix) continue;

            const indentation = matchPrefix[1].length;
            const coreText = matchPrefix[2];

            let operationText = coreText;
            let cost = null, estRows = null, actualTimeStart = null, actualTimeEnd = null, actualRows = null, loops = null, filtered = null;

            const metricsStartMatch = coreText.match(/\s+\((?:cost|actual time)=/);
            const splitIndex = metricsStartMatch ? metricsStartMatch.index : -1;

            if (splitIndex !== -1) {
                operationText = coreText.substring(0, splitIndex).trim();
                const metricsPart = coreText.substring(splitIndex).trim();

                const costMatch = metricsPart.match(/\(cost=([\d.eE+-]+)(?:\.\.[\d.eE+-]+)?\s+rows=([\d.eE+-]+)\)/);
                const timeMatch = metricsPart.match(/\(actual time=([\d.eE+-]+)\.\.([\d.eE+-]+)\s+rows=([\d.eE+-]+)\s+loops=([\d.eE+-]+)\)/);
                const filteredMatch = metricsPart.match(/filtered=([\d.eE+-]+)/);

                if (costMatch) {
                    cost = parseFloat(costMatch[1]);
                    estRows = Math.round(parseFloat(costMatch[2]));
                }
                if (timeMatch) {
                    actualTimeStart = parseFloat(timeMatch[1]);
                    actualTimeEnd = parseFloat(timeMatch[2]);
                    actualRows = Math.round(parseFloat(timeMatch[3]));
                    loops = Math.round(parseFloat(timeMatch[4]));
                }
                if (filteredMatch) {
                    filtered = parseFloat(filteredMatch[1]);
                }
            }

            let targetTable = '-';
            let formattedType = operationText;

            const opLower = operationText.toLowerCase();

            if (opLower.includes('table scan on ')) {
                targetTable = operationText.split(/table scan on /i)[1].trim();
                formattedType = targetTable.startsWith('<')
                    ? 'Leitura de Tabela Temporária'
                    : 'Varredura Completa (Table Scan)';
            } else if (opLower.includes('index range scan on ')) {
                targetTable = operationText.split(/index range scan on /i)[1].trim();
                formattedType = 'Busca em Faixa de Índice (Index Range Scan)';
            } else if (opLower.includes('index lookup on ')) {
                targetTable = operationText.split(/index lookup on /i)[1].trim();
                formattedType = 'Busca por Índice (Index Lookup)';
            } else if (opLower.includes('covering index scan on ')) {
                targetTable = operationText.split(/covering index scan on /i)[1].trim();
                formattedType = 'Varredura de Índice Cobertura';
            } else if (opLower.includes('index scan on ')) {
                targetTable = operationText.split(/index scan on /i)[1].trim();
                formattedType = 'Varredura de Índice';
            } else if (opLower.startsWith('filter:')) {
                const condition = operationText.substring(7).trim();
                formattedType = 'Filtro (Filter)';
                targetTable = condition;
            } else if (opLower.startsWith('limit table size:')) {
                formattedType = 'Limite na Tabela Temporária';
                targetTable = operationText.substring(17).trim();
            } else if (opLower.startsWith('limit:')) {
                formattedType = 'Limite (Limit)';
                targetTable = operationText.substring(6).trim();
            } else if (opLower.startsWith('append')) {
                formattedType = 'Anexação Direta (Append / UNION ALL)';
                targetTable = 'UNION ALL';
            } else if (opLower.startsWith('sort:')) {
                formattedType = 'Ordenação (Sort)';
                targetTable = operationText.substring(5).trim();
            } else if (opLower.includes('nested loop')) {
                formattedType = 'Nested Loop Join';
                targetTable = operationText.replace(/->\s+/g, '').replace(/nested loop\s*(inner join|left join|join)?/i, '').trim() || 'Múltiplas Tabelas';
            } else if (opLower.includes('hash join')) {
                formattedType = 'Hash Join';
                targetTable = operationText.replace(/->\s+/g, '').replace(/hash join/i, '').trim() || 'Múltiplas Tabelas';
            } else if (opLower.startsWith('aggregate:')) {
                formattedType = 'Agregação (Aggregate)';
                targetTable = operationText.substring(10).trim();
            } else if (opLower === 'hash') {
                formattedType = 'Construção Hash';
                targetTable = 'Memória';
            } else if (opLower.includes('grouping operation')) {
                formattedType = 'Agrupamento (Group By)';
                targetTable = operationText.replace(/->\s+/g, '').replace(/grouping operation/i, '').trim() || '-';
            } else if (opLower.startsWith('window aggregate')) {
                formattedType = 'Agregação de Janela';
                targetTable = 'Window';
            } else if (opLower.includes('rows fetched before execution')) {
                if (hasCartesianInSql) {
                    formattedType = 'Busca Constante com Alerta de Produto Cartesiano';
                } else {
                    formattedType = 'Busca Constante por Índice Único/PK (Const Lookup)';
                }
                targetTable = fromTables[constLookupIndex] || fromTables[0] || 'Índice Primário/Único';
                constLookupIndex++;
            } else if (opLower.startsWith('zero rows')) {
                formattedType = 'Retorno Vazio Antecipado (Zero Rows)';
                targetTable = operationText;
            }

            let tuningTip = null;
            if (opLower.includes('rows fetched before execution')) {
                if (hasCartesianInSql) {
                    tuningTip = "<strong>Atenção — Produto Cartesiano Detectado (N x M)</strong>: Embora o MySQL tenha resolvido a leitura por chave constante com custo zero nesta execução, a consulta combina múltiplas tabelas sem condição de relacionamento (ON / WHERE) entre elas. Em tabelas com mais registros ou filtros não únicos, isso gera um Produto Cartesiano. Explicite o JOIN com a cláusula ON correspondente pode melhorar a corretude e a escalabilidade da consulta.";
                } else {
                    tuningTip = "<strong>Busca Constante Otimizada (Const/PK Lookup)</strong>: O MySQL localizou o registro único diretamente pelo índice primário/único antes mesmo da fase de execução.";
                }
            } else if (opLower.startsWith('zero rows')) {
                if (hasCartesianInSql) {
                    tuningTip = "<strong>Atenção — Produto Cartesiano na Consulta (N x M)</strong>: O otimizador encerrou a execução antecipadamente porque uma das tabelas ou filtros retornou zero linhas, mas a estrutura da consulta possui múltiplas tabelas sem condição de relacionamento (ON / WHERE). Adicionar a condição de junção pode melhorar a segurança e evitar um Produto Cartesiano quando houver dados.";
                } else {
                    tuningTip = "<strong>Retorno Vazio Antecipado</strong>: O otimizador do MySQL detectou durante o planejamento que nenhuma linha satisfaz a condição e encerrou a consulta instantaneamente.";
                }
            } else if (opLower.startsWith('select #')) {
                const subqueryMatch = operationText.match(/select\s+#(\d+)\s+\((.*)\)/i);
                if (subqueryMatch) {
                    const subqueryNum = subqueryMatch[1];
                    const subqueryInfo = subqueryMatch[2];
                    formattedType = `Sub-Consulta #${subqueryNum}`;
                    targetTable = subqueryInfo;

                    if (subqueryInfo.toLowerCase().includes('dependent')) {
                        tuningTip = "<strong>Sub-consulta dependente (Correlacionada)</strong> detectada. Segundo a Seção 10.2.1.21 do MySQL 8.4 Reference Manual, isto pode forçar a execução repetida para cada linha da consulta externa. Reescrever para permitir a Materialização ou utilizar um JOIN explícito com cláusula ON pode melhorar o desempenho.";
                    }
                } else {
                    formattedType = 'Sub-Consulta';
                    targetTable = 'Subquery';
                }
            } else if (opLower.startsWith('append')) {
                tuningTip = "<strong>Anexação Direta (UNION ALL)</strong> (Seção 10.2.1.24 do MySQL 8.4 Reference Manual): O MySQL anexou os resultados diretamente sem criar tabela temporária nem executar etapa extra de desduplicação.";
            } else if (opLower.includes('union materialize') || opLower.includes('materialize with deduplication')) {
                formattedType = 'Materialização e Desduplicação de UNION';
                targetTable = '<union temporary>';
                tuningTip = "<strong>Desduplicação de UNION (Tabela Temporária)</strong> (Seção 10.2.1.24 do MySQL 8.4 Reference Manual): O operador UNION (sem ALL) exigiu a criação de uma tabela temporária interna para eliminar linhas duplicadas. Quando a remoção de duplicatas não for necessária, substituir por UNION ALL pode melhorar o desempenho ao evitar esta etapa.";
            } else if (opLower.includes('materialize')) {
                const isCTE = opLower.includes('cte');
                const nameMatch = operationText.match(/materialize\s+(?:cte\s+)?([\w<>]+)/i);
                const name = nameMatch && !['with', 'union'].includes(nameMatch[1].toLowerCase())
                    ? nameMatch[1]
                    : (isCTE ? 'CTE' : 'Subquery');

                formattedType = isCTE ? 'Materialização de CTE' : 'Materialização de Sub-consulta';
                targetTable = name;
                tuningTip = "<strong>Materialização em Tabela Temporária</strong> (Seção 10.2.1.21 do MySQL 8.4 Reference Manual): O MySQL gerou uma tabela temporária interna para armazenar o resultado intermediário desta etapa.";
            } else if (opLower.includes('using filesort') || opLower.startsWith('sort:')) {
                tuningTip = "<strong>Filesort Detectado</strong> (Seção 10.2.1.16 do MySQL 8.4 Reference Manual): O MySQL realizou uma etapa extra de ordenação em memória ou disco. Se a consulta for frequente, avaliar a criação de um índice B-Tree compatível com as colunas do ORDER BY pode melhorar o desempenho.";
            } else if (opLower.includes('inner hash join (no condition)') || opLower.includes('hash join (no condition)') || (opLower.includes('nested loop') && hasCartesianInSql)) {
                tuningTip = "<strong>Produto Cartesiano (Junção Sem Condição)</strong> (Seção 10.2.1.4 do MySQL 8.4 Reference Manual): A junção está multiplicando as linhas das tabelas envolvidas (N x M) sem condição de relacionamento. Verifique se faltou uma cláusula de junção (ON / WHERE) ligando as chaves das tabelas — corrigir isso pode melhorar drasticamente o desempenho e evitar resultados incorretos.";
            } else if (formattedType.includes('Varredura Completa') && actualRows && actualRows > 50) {
                tuningTip = `<strong>Varredura Completa (Table Scan)</strong> (Seção 10.2.1.23 do MySQL 8.4 Reference Manual): O MySQL leu ${actualRows} linhas sequencialmente sem utilizar índice. Avaliar a criação de um índice B-Tree nas colunas de filtro ou junção pode melhorar o desempenho.`;
            }

            // Alerta de Condition Filtering (baixa filtragem)
            if (filtered !== null && filtered < 25 && actualRows && actualRows > 50) {
                const wastedRows = Math.round(actualRows * (1 - (filtered / 100)));
                const filterTip = `<strong>Filtragem Tardia (Condition Filtering)</strong> (Seção 10.2.1.13 do MySQL 8.4 Reference Manual): Apenas ${filtered.toFixed(1)}% das linhas lidas satisfizeram os filtros neste nó (aproximadamente ${wastedRows} linhas descartadas após leitura). Incluir as colunas filtradas em um índice composto pode melhorar a seletividade.`;
                tuningTip = tuningTip ? `${tuningTip}<br/>${filterTip}` : filterTip;
            }

            const node = new PlanNode(
                Math.random().toString(36).substr(2, 9),
                formattedType,
                targetTable,
                cost,
                estRows
            );

            node.tuningTip = tuningTip;
            node.filtered = filtered;
            node.actualTimeStart = actualTimeStart;
            node.actualTimeEnd = actualTimeEnd;
            node.actualRows = actualRows;
            node.loops = loops;
            node.indentation = indentation;


            // Cálculo de Tempo Total (Multiplicação por Loops)
            if (actualTimeEnd !== null && loops !== null) {
                node.totalActualTime = actualTimeEnd * loops;
            }

            // Lógica para montar a árvore baseada na indentação
            while (stack.length > 0 && stack[stack.length - 1].indentation >= indentation) {
                stack.pop();
            }

            if (stack.length > 0) {
                stack[stack.length - 1].children.push(node);
                node.parent = stack[stack.length - 1];
            } else {
                rootNode = node;
            }

            stack.push(node);
            allNodes.push(node);
        }

        // Segundo passo: Calcular Deltas e analisar gargalos em todas as raízes do plano
        const rootNodes = allNodes.filter(n => n.parent === null);
        rootNodes.forEach(n => this.calculateMetricsRecursively(n));

        // Se o SQL possui Produto Cartesiano mas nenhum nó recebeu alerta explícito (ex: uma tabela const combinada com scan em outra sem ON/WHERE)
        if (hasCartesianInSql && rootNode && !allNodes.some(n => String(n.tuningTip || '').includes('Produto Cartesiano'))) {
            const cartesianWarning = "<strong>Atenção — Produto Cartesiano Detectado na Consulta (N x M)</strong>: A consulta referencia múltiplas tabelas sem condição de relacionamento (ON / WHERE) entre elas. Mesmo que uma das tabelas tenha sido resolvida como constante ou possua poucas linhas, a ausência de critério de junção caracteriza um Produto Cartesiano. Explicitar o JOIN com cláusula ON pode melhorar a corretude e o desempenho.";
            rootNode.tuningTip = rootNode.tuningTip ? `${ cartesianWarning }<br/>${ rootNode.tuningTip }` : cartesianWarning;
        }

        model.nodes = allNodes;
        model.root = rootNode;
        if (rootNode) {
            const getSubtreeEffectiveCost = (n) => {
                if (!n) return 0;
                const ownEffectiveCost = (n.cost || 0) * (n.loops && n.loops > 1 ? n.loops : 1);
                const childrenMaxCost = n.children && n.children.length > 0
                    ? Math.max(...n.children.map(c => getSubtreeEffectiveCost(c)))
                    : 0;
                return Math.max(ownEffectiveCost, childrenMaxCost);
            };
            const rootsCostSum = rootNodes.reduce((sum, n) => sum + getSubtreeEffectiveCost(n), 0);
            const rawMaxCost = Math.max(rootNode.cost || 0, ...allNodes.map(n => n.cost || 0));
            model.totalCost = Number(Math.max(rootsCostSum, rawMaxCost).toFixed(2));
            model.totalActualTime = Math.max(
                rootNodes.reduce((sum, n) => sum + (n.totalActualTime || 0), 0),
                ...allNodes.map(n => n.totalActualTime || 0)
            );
        }

        return model;
    }

    calculateMetricsRecursively(node) {
        if (!node) return 0;

        // Delta Time: Tempo próprio = Tempo Total - Soma do Tempo dos Filhos
        // Propaga o tempo acumulado dos filhos mesmo quando um nó intermediário (ex: "Select #2") não possui métricas próprias
        let childrenTotalTime = 0;
        let maxChildStartTime = 0;
        for (const child of node.children) {
            const childEffectiveTime = this.calculateMetricsRecursively(child);
            childrenTotalTime += childEffectiveTime;
            if (child.actualTimeStart !== null && child.actualTimeStart > maxChildStartTime) {
                maxChildStartTime = child.actualTimeStart;
            }
        }

        if (node.totalActualTime !== null) {
            node.selfTime = Math.max(0, node.totalActualTime - childrenTotalTime);
        } else {
            node.selfTime = 0;
            if (node.children.length > 0) {
                node.totalActualTime = childrenTotalTime;
                if (node.actualTimeStart === null) node.actualTimeStart = maxChildStartTime;
                if (node.actualTimeEnd === null) node.actualTimeEnd = childrenTotalTime;
                if (node.actualRows === null) {
                    node.actualRows = node.children.reduce((sum, c) => sum + (c.actualRows || 0), 0);
                }
            }
        }

        // Startup Latency (Time to First Row):
        // Evita marcar nós puramente de repasse (como Limit com selfTime ~ 0) se a latência inicial veio inteiramente do filho bloqueante (Sort/Aggregate)
        const ownStartupTime = node.children.length > 0 && node.selfTime < 0.5
            ? Math.max(0, (node.actualTimeStart || 0) - maxChildStartTime)
            : (node.actualTimeStart || 0);

        node.isStartupHeavy = node.actualTimeStart > (node.actualTimeEnd * 0.5)
            && node.actualTimeStart > 1
            && ownStartupTime > 1;

        return node.totalActualTime !== null ? node.totalActualTime : childrenTotalTime;
    }
}

module.exports = MySQLExecutionPlanAnalyzer;
