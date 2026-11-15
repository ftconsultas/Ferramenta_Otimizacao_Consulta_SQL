/**
 * PlanRenderer
 * Lógica de visualização de Planos de Execução Didática e Imersiva.
 */
const PlanRenderer = {
    getColorClass(type) {
        const t = type.toLowerCase();
        if (t.includes('table scan')) return 'type-table-scan';
        if (t.includes('index range scan')) return 'type-index-scan';
        if (t.includes('index lookup') || t.includes('index scan')) return 'type-index-lookup';
        if (t.includes('join') || t.includes('loop')) return 'type-join';
        if (t.includes('filter') || t.includes('sort') || t.includes('limit')) return 'type-sort-filter';
        return 'type-other';
    },

    formatTime(ms) {
        if (typeof ms !== 'number' || !Number.isFinite(ms)) return 'N/A';
        if (ms === 0) return '0µs';
        if (ms > 0 && ms < 0.001) return '< 1µs';
        if (ms < 0.01) return `${(ms * 1000).toFixed(1)}µs`;
        if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
        if (ms > 1000) return `${(ms / 1000).toFixed(2)}s`;
        return `${ms.toFixed(3)}ms`;
    },

    highlightSqlDiff(targetSql, referenceSql, isOldPlan = false) {
        if (!referenceSql || targetSql === referenceSql) return window.HtmlSafety.escape(targetSql);

        const targetWords = targetSql.split(/(\s+)/);
        const referenceWords = referenceSql.split(/(\s+)/);

        let result = '';
        for (let i = 0; i < targetWords.length; i++) {
            const word = targetWords[i];
            const escaped = window.HtmlSafety.escape(word);
            if (word.trim() === '') {
                result += escaped;
                continue;
            }
            if (!referenceWords.includes(word)) {
                if (isOldPlan) {
                    result += `<span style="color: #ef4444; font-weight: bold; background-color: rgba(239, 68, 68, 0.15); border-radius: 3px; padding: 0 4px; text-decoration: line-through;">${escaped}</span>`;
                } else {
                    result += `<span style="color: #c084fc; font-weight: bold; background-color: rgba(192, 132, 252, 0.15); border-radius: 3px; padding: 0 4px;">${escaped}</span>`;
                }
            } else {
                result += escaped;
            }
        }
        return result;
    },

    renderNodeDidactic(node, totalPlanTime) {
        const typeStr = String(node.type || '');
        const isConstOrEmpty = typeStr.includes('Const Lookup') || typeStr.includes('Zero Rows') || typeStr.toLowerCase().includes('rows fetched before execution');
        const isBottleneck = !isConstOrEmpty && node.selfTime >= 1.0 && node.selfTime > (totalPlanTime * 0.15);
        const startMs = window.HtmlSafety.number(node.actualTimeStart);
        const endMs = window.HtmlSafety.number(node.actualTimeEnd);
        const startupLatencyPercent = endMs >= 0.5 ? (startMs / endMs) * 100 : 0;
        const indentSize = Math.max(0, Math.min(100, window.HtmlSafety.number(node.indentation))) * 20; // 20px per indentation level

        let insight = '';
        if (node.isStartupHeavy) {
            insight = `<div class="didactic-insight warning">
                <strong>Latência de Inicialização:</strong> Esta etapa demorou para entregar a 1ª linha.
                Isso geralmente acontece quando o MySQL precisa ler muitos dados ou ordenar antes de começar a retornar resultados.
            </div>`;
        } else if (isBottleneck) {
            insight = `<div class="didactic-insight bottleneck">
                O tempo "Delta" (tempo gasto exclusivamente nesta etapa) é alto em relação ao tempo total de execução da consulta.
            </div>`;
        } else if (node.loops > 500) {
            insight = `<div class="didactic-insight">
                <strong>Loop Intensivo:</strong> Esta operação rodou ${window.HtmlSafety.escape(node.loops)} vezes.
                Considere se um índice melhor poderia reduzir o número de vezes que esta etapa é executada.
            </div>`;
        }

        // Adicionar dica de tuning se existir (sem usar cor verde em recomendações/observações)
        if (node.tuningTip) {
            const tipStr = String(node.tuningTip);
            const hasWarningInTip = tipStr.includes('Produto Cartesiano')
                || tipStr.includes('Filtragem Tardia')
                || tipStr.includes('Atenção')
                || tipStr.includes('Desduplicação de UNION');
            const isInfoNote = !hasWarningInTip && (
                isConstOrEmpty
                || tipStr.includes('Materialização em Tabela Temporária')
                || tipStr.includes('Anexação Direta (UNION ALL)')
            );
            const tipStyle = isInfoNote
                ? 'border-left-color: var(--primary); background: rgba(56, 189, 248, 0.1);'
                : 'border-left-color: var(--color-warning); background: rgba(251, 191, 36, 0.1);';
            insight += `<div class="didactic-insight ${isInfoNote ? '' : 'warning'}" style="${tipStyle}">
                ${window.HtmlSafety.emphasis(node.tuningTip)}
            </div>`;
        }

        return `
            <div class="didactic-node ${isBottleneck ? 'bottleneck' : ''}" style="margin-left: ${indentSize}px">
                <div class="didactic-node-header">
                    <div>
                        <div class="didactic-node-type">
                            ${node.indentation > 0 ? '<span style="color: var(--primary); opacity: 0.5; margin-right: 8px;">↳</span>' : ''}
                            ${window.HtmlSafety.escape(node.type)}
                        </div>
                        <div class="didactic-node-table">${window.HtmlSafety.escape(node.table)}</div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        ${node.cost ? `<div class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted);">Custo: ${window.HtmlSafety.escape(node.cost)}</div>` : ''}
                        ${node.loops > 1 ? `<div class="badge badge-loops">${window.HtmlSafety.escape(node.loops)} Loops</div>` : ''}
                    </div>
                </div>

                <div class="didactic-metrics-grid">
                    <div class="didactic-metric" title="Tempo gasto exclusivamente nesta etapa.">
                        <span class="didactic-metric-label">Custo Real da Etapa (Delta)</span>
                        <span class="didactic-metric-value ${isBottleneck ? 'bottleneck' : ''}">${this.formatTime(node.selfTime)}</span>
                    </div>
                    <div class="didactic-metric" title="Tempo total acumulado incluindo sub-etapas e multiplicado pelos loops">
                        <span class="didactic-metric-label">Tempo Total Acumulado</span>
                        <span class="didactic-metric-value">${this.formatTime(node.totalActualTime)}</span>
                    </div>
                    <div class="didactic-metric" title="Quantidade total de linhas processadas nesta etapa">
                        <span class="didactic-metric-label">Linhas Processadas</span>
                        <span class="didactic-metric-value">${window.HtmlSafety.escape(node.actualRows ?? 0)}</span>
                    </div>
                    <div class="didactic-metric">
                        <span class="didactic-metric-label">Velocidade de Reação (1ª Linha)</span>
                        <div class="latency-bar-container" title="Amarelo: Tempo até entregar a 1ª linha / Azul: Tempo total da etapa">
                            <div class="latency-bar-total" style="width: 100%"></div>
                            <div class="latency-bar-startup" style="width: ${Math.max(0, Math.min(100, startupLatencyPercent))}%"></div>
                        </div>
                        <span class="didactic-metric-value ${node.isStartupHeavy ? 'warning' : ''}" style="font-size: 0.75rem; margin-top: 4px;">
                            ${this.formatTime(node.actualTimeStart)}
                        </span>
                    </div>
                </div>
                ${insight}
            </div>
        `;
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    buildComparisonScorecard(prevPlan, currPlan) {
        if (!prevPlan || !currPlan) return '';

        const prevNodes = prevPlan.nodes || [];
        const currNodes = currPlan.nodes || [];
        const currHasCartesian = currNodes.some(n =>
            String(n.type || '').includes('Produto Cartesiano') || String(n.tuningTip || '').includes('Produto Cartesiano')
        );

        const prevTime = prevPlan.totalActualTime || Math.max(...prevNodes.map(n => n.totalActualTime || 0)) || 0;
        const currTime = currPlan.totalActualTime || Math.max(...currNodes.map(n => n.totalActualTime || 0)) || 0;

        let timeDiffHtml = '';
        let timeCardClass = '';
        if (currHasCartesian) {
            timeCardClass = 'highlight-warning';
            timeDiffHtml = `<span class="kpi-badge badge-warning">Alerta: Produto Cartesiano detectado</span>`;
        } else if (prevTime > 0 && currTime > 0) {
            const timeDelta = prevTime - currTime;
            const percentReduction = ((timeDelta / prevTime) * 100);
            if (percentReduction > 0) {
                const speedup = (prevTime / currTime).toFixed(1);
                timeCardClass = 'highlight-win';
                timeDiffHtml = `<span class="kpi-badge badge-success">${percentReduction.toFixed(1)}% mais rápido (${speedup}x)</span>`;
            } else if (percentReduction < -5) {
                timeCardClass = 'highlight-warning';
                timeDiffHtml = `<span class="kpi-badge badge-warning">Aumento de ${Math.abs(percentReduction).toFixed(1)}% no tempo</span>`;
            } else {
                timeDiffHtml = `<span class="kpi-badge badge-neutral">Tempo equivalente (~estável)</span>`;
            }
        }

        const prevCost = typeof prevPlan.totalCost === 'number' ? prevPlan.totalCost : parseFloat(prevPlan.totalCost);
        const currCost = typeof currPlan.totalCost === 'number' ? currPlan.totalCost : parseFloat(currPlan.totalCost);

        let costDiffHtml = '';
        let costCardClass = '';
        if (currHasCartesian) {
            costCardClass = 'highlight-warning';
            costDiffHtml = `<span class="kpi-badge badge-warning">Atenção: Junção sem condição (N x M)</span>`;
        } else if (!isNaN(prevCost) && !isNaN(currCost) && prevCost > 0) {
            const costDelta = prevCost - currCost;
            const costPercent = ((costDelta / prevCost) * 100);
            if (costPercent > 0) {
                costCardClass = 'highlight-win';
                costDiffHtml = `<span class="kpi-badge badge-success">Redução de ${costPercent.toFixed(1)}% no custo</span>`;
            } else if (costPercent < 0) {
                costCardClass = 'highlight-warning';
                costDiffHtml = `<span class="kpi-badge badge-warning">Custo aumentou ${Math.abs(costPercent).toFixed(1)}%</span>`;
            } else {
                costDiffHtml = `<span class="kpi-badge badge-neutral">Custo inalterado</span>`;
            }
        }

        const prevScans = prevNodes.filter(n => (n.type || '').toLowerCase().includes('table scan')).length;
        const currScans = currNodes.filter(n => (n.type || '').toLowerCase().includes('table scan')).length;

        let scanDiffHtml = '';
        let scanCardClass = '';
        if (prevScans > currScans) {
            scanCardClass = 'highlight-win';
            scanDiffHtml = `<span class="kpi-badge badge-success">${prevScans - currScans} Table Scan(s) eliminado(s)</span>`;
        } else if (currScans === 0 && prevScans === 0) {
            scanDiffHtml = `<span class="kpi-badge badge-neutral">Nenhum Table Scan detectado</span>`;
        } else {
            scanDiffHtml = `<span class="kpi-badge badge-warning">${currScans} Table Scan(s) ativo(s)</span>`;
        }

        const prevRows = prevNodes.reduce((acc, n) => acc + (n.actualRows || 0), 0);
        const currRows = currNodes.reduce((acc, n) => acc + (n.actualRows || 0), 0);

        return `
            <div class="comparison-scorecard">
                <div class="comparison-scorecard-header">
                    <h3 class="comparison-scorecard-title">
                        Resumo Comparativo de Otimização
                    </h3>
                    <span style="font-size: 0.8rem; color: var(--text-secondary);">Comparativo Lado a Lado.</span>
                </div>
                <div class="comparison-kpis-grid">
                    <div class="kpi-card ${timeCardClass}">
                        <span class="kpi-label">Tempo Total Real</span>
                        <div class="kpi-values">
                            <span class="kpi-old-value">${this.formatTime(prevTime)}</span>
                            <span>&rarr;</span>
                            <span class="kpi-new-value">${this.formatTime(currTime)}</span>
                        </div>
                        ${timeDiffHtml}
                    </div>

                    <div class="kpi-card ${costCardClass}">
                        <span class="kpi-label">Custo Estimado (MySQL)</span>
                        <div class="kpi-values">
                            <span class="kpi-old-value">${!isNaN(prevCost) ? prevCost : 'N/A'}</span>
                            <span>&rarr;</span>
                            <span class="kpi-new-value">${!isNaN(currCost) ? currCost : 'N/A'}</span>
                        </div>
                        ${costDiffHtml}
                    </div>

                    <div class="kpi-card ${scanCardClass}">
                        <span class="kpi-label">Varreduras de Tabela</span>
                        <div class="kpi-values">
                            <span class="kpi-old-value">${prevScans} scan(s)</span>
                            <span>&rarr;</span>
                            <span class="kpi-new-value">${currScans} scan(s)</span>
                        </div>
                        ${scanDiffHtml}
                    </div>

                    <div class="kpi-card">
                        <span class="kpi-label">Total de Linhas Processadas</span>
                        <div class="kpi-values">
                            <span class="kpi-old-value">${prevRows}</span>
                            <span>&rarr;</span>
                            <span class="kpi-new-value">${currRows}</span>
                        </div>
                        <span class="kpi-badge badge-neutral">${prevRows >= currRows ? `Economia de ${prevRows - currRows} linhas` : `Aumento de ${currRows - prevRows} linhas`}</span>
                    </div>
                </div>
            </div>
        `;
    },

    buildPlanCard(plan, sql, label, compareSql = null, isOldPlan = false, heuristics = []) {
        const nodes = plan.nodes || [];
        if (nodes.length === 0) return '<div class="empty-state">Sem dados de plano disponíveis.</div>';

        // Usa totalActualTime calculado pelo analisador (que soma raízes paralelas como Sub-Consultas no SELECT), com fallback para o maior nó
        const totalTime = plan.totalActualTime || Math.max(...nodes.map(n => n.totalActualTime || 0)) || 0;

        const nodesHtml = nodes.map(node => this.renderNodeDidactic(node, totalTime)).join('');

        let heuristicsBanner = '';
        if (heuristics && heuristics.length > 0) {
            heuristicsBanner = `
                <div class="heuristic-summary-box">
                    <div class="heuristic-summary-header">
                        <strong>Regras Heurísticas AST Detectadas (${window.HtmlSafety.escape(heuristics.length)})</strong>
                    </div>
                    <div class="heuristic-tags-container">
                        ${heuristics.map(h => `
                            <div class="heuristic-chip" title="${window.HtmlSafety.escape(h.suggestion || '')}">
                                <span class="chip-id">${window.HtmlSafety.escape(h.ruleId)}</span>
                                <span class="chip-title">${window.HtmlSafety.escape(h.title)}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="heuristic-summary-footer">
                        Regras estáticas detectadas pelo analisador AST.
                    </div>
                </div>
            `;
        }

        let slotBadge = '';
        if (compareSql !== null) {
            const badgeClass = isOldPlan ? 'badge-before' : 'badge-after';
            const badgeText = isOldPlan ? 'Versão Anterior' : 'Versão Atual';
            slotBadge = `
                <div style="margin-bottom: var(--spacing-sm);">
                    <span class="comparison-slot-badge ${badgeClass}">
                        ${badgeText}
                    </span>
                </div>
            `;
        }

        return `
            <div class="plan-result-card">
                ${slotBadge}
                <div class="plan-label">${window.HtmlSafety.escape(label)}</div>
                ${heuristicsBanner}
                <div class="plan-header">
                    <div>
                        <h3 style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase;">Custo Total Estimado</h3>
                        <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary);">${window.HtmlSafety.escape(plan.totalCost ?? 'N/A')}</div>
                    </div>
                    <div style="text-align: right;">
                        <h3 style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase;">Tempo Real Total (Acumulado)</h3>
                        <div class="badge" style="font-size: 1.2rem; padding: 4px 12px; background-color: var(--primary); color: white;" title="Maior tempo total acumulado na consulta">${this.formatTime(totalTime)}</div>
                    </div>
                </div>

                <details style="margin-bottom: var(--spacing-lg); background: rgba(0,0,0,0.1); border-radius: var(--border-radius-md); border: 1px solid rgba(255,255,255,0.05);">
                    <summary style="padding: 10px; cursor: pointer; font-size: 0.85rem; font-weight: bold; color: var(--text-secondary); user-select: none; outline: none;">
                        Ver Consulta SQL
                    </summary>
                    <div style="padding: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
                        <code class="plan-sql" style="display: block; margin: 0; padding: 0; border: none; background: transparent;">${compareSql ? this.highlightSqlDiff(sql, compareSql, isOldPlan) : window.HtmlSafety.escape(sql)}</code>
                    </div>
                </details>

                <div class="didactic-nodes-container">
                    ${nodesHtml}
                </div>
            </div>
        `;
    },

    displayPlanResults(plan, sql, targetDiv, clearBtn, state, heuristics = []) {
        const hasPrevious = !!state.previousPlan;

        if (hasPrevious) {
            const scorecardHtml = this.buildComparisonScorecard(state.previousPlan, plan);

            targetDiv.innerHTML = `
                ${scorecardHtml}
                <div class="comparison-container">
                    <div class="comparison-slot">
                        ${this.buildPlanCard(state.previousPlan, state.previousSql, 'Plano Anterior', sql, true, state.previousHeuristics || [])}
                    </div>
                    <div class="comparison-divider"></div>
                    <div class="comparison-slot">
                        ${this.buildPlanCard(plan, sql, 'Plano Atual', state.previousSql, false, heuristics)}
                    </div>
                </div>
            `;
            if (clearBtn) {
                clearBtn.style.display = 'inline-flex';
                clearBtn.textContent = 'Limpar Comparação';
            }
        } else {
            targetDiv.innerHTML = `
                <div class="card">
                    ${this.buildPlanCard(plan, sql, 'Plano de Execução Atual', null, false, heuristics)}
                </div>
            `;
            if (clearBtn) {
                clearBtn.style.display = 'inline-flex';
                clearBtn.textContent = 'Limpar Consulta';
            }
        }

        // Armazenar para comparação futura
        state.previousPlan = plan;
        state.previousSql = sql;
        state.previousHeuristics = heuristics;
    }
};

window.PlanRenderer = PlanRenderer;


