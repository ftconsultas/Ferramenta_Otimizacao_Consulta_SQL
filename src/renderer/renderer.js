const app = {
    state: {
        selectedSgbd: 'mysql',
        isConnected: false,
        activeSgbdName: '',
        activePage: null,
        pageCache: {},
        previousPlan: null,
        previousSql: null,
        heuristicActiveTab: 'original',
        optimizedHeuristicSql: ''
    },

    elements: {},

    async init() {
        try {
            this.setupElements();
            if (!this.elements.viewContainer) {
                console.error('[APP] CRITICAL: view-container not found in DOM.');
                alert('Erro Crítico: view-container não encontrado.');
                return;
            }

            this.setupNavigation();
            this.setupSidebarToggle();
            this.restoreSidebarState();

            // Carregamento Seguro de Credenciais (RF03/RNF03)
            await this.loadStoredConfig();

            console.log('[APP] Basic setup complete. Navigating to initial page...');
            await this.navigateTo('heuristic-analyzer');
        } catch (err) {
            console.error('[APP] Initialization Error:', err);
            this.showVisualError(`Erro na Inicialização: ${err.message}`);
        }
    },

    setupElements() {
        this.elements = {
            pageTitle: document.getElementById('page-title'),
            viewContainer: document.getElementById('view-container'),
            navLinks: document.querySelectorAll('.nav-links li'),
            sidebar: document.getElementById('sidebar'),
            sidebarToggle: document.getElementById('sidebar-toggle')
        };
        console.log('[APP] Elements found:', Object.keys(this.elements).filter(k => this.elements[k]));
    },

    showVisualError(msg) {
        console.error('[APP] Showing visual error:', msg);
        if (this.elements.viewContainer) {
            this.elements.viewContainer.innerHTML = `
                <div style="background: #2a1a1a; border: 1px solid #ff4444; color: #ff6666; padding: 20px; border-radius: 8px; margin: 20px;">
                    <h3 style="margin-top:0"> Erro de Carregamento</h3>
                    <p>${this.escapeHtml(msg)}</p>
                    <button type="button" data-action="reload-app" style="background:#ff4444; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer">Tentar Recarregar</button>
                    <p style="font-size: 0.8rem; margin-top: 15px; color: #aaa;">Abra o console do desenvolvedor (F12) para detalhes técnicos.</p>
                </div>
            `;

            const reloadBtn = this.elements.viewContainer.querySelector('button[data-action="reload-app"]');
            if (reloadBtn) {
                reloadBtn.addEventListener('click', () => {
                    console.log('[APP] Recarretgando o app a pedido do usuário após erro.');
                    location.reload();
                });
            }
        } else {
            alert('Erro: ' + msg);
        }
    },

    setupSidebarToggle() {
        if (!this.elements.sidebarToggle) return;
        this.elements.sidebarToggle.addEventListener('click', () => {
            const isCollapsed = this.elements.sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebar-collapsed', isCollapsed);
        });
    },

    restoreSidebarState() {
        const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
        if (isCollapsed && this.elements.sidebar) {
            this.elements.sidebar.classList.add('collapsed');
        }
    },

    setupNavigation() {
        this.elements.navLinks.forEach(link => {
            link.addEventListener('click', () => {
                const targetPage = link.getAttribute('data-page');
                console.log(`[APP] Navigation click: ${targetPage}`);
                this.navigateTo(targetPage);
            });
        });
    },

    async navigateTo(pageId) {
        console.log(`[APP] Navigating to: ${pageId}`);
        if (!['heuristic-analyzer', 'execution-plan', 'settings', 'history'].includes(pageId)) {
            this.showVisualError('Página não encontrada.');
            return;
        }
        if (this.state.activePage === pageId) return;

        this.elements.navLinks.forEach(l => l.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-links li[data-page="${pageId}"]`);
        if (activeLink) activeLink.classList.add('active');

        if (this.elements.viewContainer) {
            this.elements.viewContainer.innerHTML = '<p style="padding:20px; color:#888;">Carregando...</p>';
        }

        try {
            console.log(`[APP] Calling window.api.loadTemplate for: ${pageId}`);
            if (!window.api || !window.api.loadTemplate) {
                throw new Error('IPC API (loadTemplate) not found. Check preload.js.');
            }

            const html = await window.api.loadTemplate(pageId);
            console.log(`[APP] Template received. Length: ${html.length}`);

            if (this.elements.viewContainer) {
                this.elements.viewContainer.innerHTML = html;

                // Força a visibilidade se usar a classe .view
                const viewEl = this.elements.viewContainer.querySelector('.view');
                if (viewEl) viewEl.classList.add('active');

                this.state.activePage = pageId;
                this.initPageLogic(pageId);
                this.updateTitle(pageId);
                console.log(`[APP] Page ${pageId} successfully rendered and activated.`);
            }
        } catch (error) {
            console.error(`[APP] Navigation failure for ${pageId}:`, error);
            this.showVisualError(error.message);
        }
    },

    async getPageHtml(pageId) {
        return await window.api.loadTemplate(pageId);
    },

    updateTitle(pageId) {
        if (!this.elements.pageTitle) return;
        const titles = {
            'heuristic-analyzer': 'Analisador Heurístico (Modo Simples)',
            'execution-plan': 'Análise de Plano Real (Modo Detalhado)',
            'settings': 'Configurações de Conexão'
        };
        this.elements.pageTitle.textContent = titles[pageId] || 'SQL Optimizer';
    },

    initPageLogic(pageId) {
        console.log(`[APP] Initializing logic for: ${pageId}`);
        switch (pageId) {
            case 'heuristic-analyzer': this.initHeuristicAnalyzer(); break;
            case 'execution-plan': this.initExecutionPlan(); break;
            case 'settings': this.initSettings(); break;
        }
    },

    initHeuristicAnalyzer() {
        const analyzeBtn = document.getElementById('analyze-btn');
        const formatBtn = document.getElementById('format-sql-btn');
        const clearHeuristicBtn = document.getElementById('clear-heuristic-btn');
        const copyBtns = document.querySelectorAll('.copy-query-btn');
        const sqlInput = document.getElementById('sql-input');
        const optimizedSqlInput = document.getElementById('optimized-sql-input');
        const resultsDiv = document.getElementById('results');
        const bd = document.getElementById('sql-backdrop');
        const optimizedBd = document.getElementById('optimized-sql-backdrop');
        if (!analyzeBtn || !sqlInput) return;

        const syncBackdrop = (input, backdrop) => {
            if (backdrop && input) backdrop.innerHTML = this.syntaxHighlightSql(input.value);
        };
        const syncScroll = (input, backdrop) => {
            if (backdrop && input) {
                backdrop.scrollTop = input.scrollTop;
                backdrop.scrollLeft = input.scrollLeft;
            }
        };
        const wireEditor = (input, backdrop) => {
            if (!input) return;
            input.addEventListener('input', () => syncBackdrop(input, backdrop));
            input.addEventListener('scroll', () => syncScroll(input, backdrop));
            syncBackdrop(input, backdrop);
        };
        wireEditor(sqlInput, bd);
        wireEditor(optimizedSqlInput, optimizedBd);

        this.setupHeuristicTabs();

        if (clearHeuristicBtn) {
            clearHeuristicBtn.addEventListener('click', () => {
                sqlInput.value = '';
                syncBackdrop(sqlInput, bd);
                if (optimizedSqlInput) {
                    optimizedSqlInput.value = '';
                    syncBackdrop(optimizedSqlInput, optimizedBd);
                }
                this.state.optimizedHeuristicSql = '';
                if (resultsDiv) resultsDiv.innerHTML = '';
                this.updateOptimizedTabState();
                this.setHeuristicActiveTab('original');
                sqlInput.focus();
            });
        }

        if (formatBtn) {
            formatBtn.addEventListener('click', () => {
                const editor = this.getActiveHeuristicEditor();
                if (!editor.input) return;
                editor.input.value = this.formatSqlForMysql(editor.input.value);
                syncBackdrop(editor.input, editor.backdrop);
                editor.input.focus();
            });
        }

        copyBtns.forEach(copyBtn => {
            copyBtn.addEventListener('click', async () => {
                const editor = this.getActiveHeuristicEditor();
                const sql = editor.input ? editor.input.value : '';
                if (!sql.trim()) {
                    this.showHeuristicApplyFeedback(resultsDiv, 'Não há consulta para copiar.', 'info');
                    return;
                }

                try {
                    await this.copyTextToClipboard(sql);
                    this.showHeuristicApplyFeedback(resultsDiv, 'Consulta copiada para a área de transferência.');
                } catch (error) {
                    console.error('[CLIPBOARD] Erro ao copiar consulta:', error);
                    this.showHeuristicApplyFeedback(resultsDiv, 'Não foi possível copiar a consulta.', 'error');
                }
            });
        });

        analyzeBtn.addEventListener('click', async () => {
            const editor = this.getActiveHeuristicEditor();
            const sql = editor.input ? editor.input.value.trim() : '';
            if (!sql) return;
            analyzeBtn.disabled = true;
            analyzeBtn.textContent = 'Analisando...';
            resultsDiv.innerHTML = '';
            try {
                const response = await window.api.analyzeSqlSimple(sql);
                if (response.status === 'success') {
                    this.displayHeuristicResults(response.results, resultsDiv);
                } else {
                    resultsDiv.innerHTML = this.renderFriendlyError(response);
                    this.bindFriendlyErrorActions(resultsDiv);
                }
            } catch (error) {
                console.error('[ANALYZER] Erro de comunicação:', error);
                resultsDiv.innerHTML = this.renderFriendlyError(error, 'Erro de comunicação com o processo principal.');
                this.bindFriendlyErrorActions(resultsDiv);
            } finally {
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = 'Analisar Consulta';
            }
        });
    },

    setupHeuristicTabs() {
        const tabs = document.querySelectorAll('[data-query-tab]');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.disabled) return;
                this.setHeuristicActiveTab(tab.dataset.queryTab);
            });
        });
        this.setHeuristicActiveTab(this.state.heuristicActiveTab || 'original');
        this.updateOptimizedTabState();
    },

    setHeuristicActiveTab(tabName) {
        const safeTab = tabName === 'optimized' ? 'optimized' : 'original';
        const optimizedInput = document.getElementById('optimized-sql-input');
        if (safeTab === 'optimized' && !optimizedInput?.value.trim()) return;

        this.state.heuristicActiveTab = safeTab;
        document.querySelectorAll('[data-query-tab]').forEach(tab => {
            const isActive = tab.dataset.queryTab === safeTab;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', String(isActive));
        });
        document.querySelectorAll('[data-query-panel]').forEach(panel => {
            const isActive = panel.dataset.queryPanel === safeTab;
            panel.classList.toggle('active', isActive);
            panel.hidden = !isActive;
        });

        const editor = this.getActiveHeuristicEditor();
        if (editor.input && editor.backdrop) {
            editor.backdrop.innerHTML = this.syntaxHighlightSql(editor.input.value);
            editor.input.focus();
        }
    },

    getActiveHeuristicEditor() {
        if (this.state.heuristicActiveTab === 'optimized') {
            return {
                input: document.getElementById('optimized-sql-input'),
                backdrop: document.getElementById('optimized-sql-backdrop'),
                inputId: 'optimized-sql-input',
                backdropId: 'optimized-sql-backdrop'
            };
        }
        return {
            input: document.getElementById('sql-input'),
            backdrop: document.getElementById('sql-backdrop'),
            inputId: 'sql-input',
            backdropId: 'sql-backdrop'
        };
    },

    getHeuristicSourceSql() {
        const editor = this.getActiveHeuristicEditor();
        return editor.input ? editor.input.value : '';
    },

    updateOptimizedTabState() {
        const optimizedTab = document.getElementById('optimized-query-tab');
        const optimizedInput = document.getElementById('optimized-sql-input');
        const hasOptimizedSql = Boolean(optimizedInput?.value.trim());
        if (optimizedTab) optimizedTab.disabled = !hasOptimizedSql;
        if (!hasOptimizedSql && this.state.heuristicActiveTab === 'optimized') {
            this.setHeuristicActiveTab('original');
        }
    },

    initExecutionPlan() {
        const noConnView = document.getElementById('no-connection-plan');
        const activeView = document.getElementById('active-plan-view');
        const goToSettingsBtn = document.getElementById('go-to-settings-btn');
        if (!noConnView) return;

        if (this.state.isConnected) {
            noConnView.style.display = 'none';
            activeView.style.display = 'block';
            this.setupActivePlanLogic();
        } else {
            noConnView.style.display = 'flex';
            activeView.style.display = 'none';
            const sgbdOptions = noConnView.querySelectorAll('.sgbd-option');
            sgbdOptions.forEach(opt => {
                const sgbd = opt.getAttribute('data-sgbd');
                opt.classList.toggle('active', sgbd === this.state.selectedSgbd);
                opt.addEventListener('click', () => {
                    this.state.selectedSgbd = sgbd;
                    sgbdOptions.forEach(o => o.classList.toggle('active', o.getAttribute('data-sgbd') === sgbd));
                });
            });
            goToSettingsBtn.addEventListener('click', () => this.navigateTo('settings'));
        }
    },

    setupActivePlanLogic() {
        const sqlInput = document.getElementById('sql-input-plan');
        const planBackdrop = document.getElementById('plan-backdrop');
        const formatPlanBtn = document.getElementById('format-sql-plan-btn');
        const analyzeBtn = document.getElementById('analyze-plan-btn');
        const resultsDiv = document.getElementById('plan-results');
        const clearBtn = document.getElementById('clear-comparison-btn');
        const debugBtn = document.getElementById('debug-plan-btn');

        const syncPlanBackdrop = () => {
            if (planBackdrop && sqlInput) {
                planBackdrop.innerHTML = this.syntaxHighlightSql(sqlInput.value);
            }
        };

        if (sqlInput && planBackdrop) {
            sqlInput.addEventListener('input', syncPlanBackdrop);
            sqlInput.addEventListener('scroll', () => {
                planBackdrop.scrollTop = sqlInput.scrollTop;
                planBackdrop.scrollLeft = sqlInput.scrollLeft;
            });
            syncPlanBackdrop();
        }

        if (formatPlanBtn && sqlInput) {
            formatPlanBtn.addEventListener('click', () => {
                sqlInput.value = this.formatSqlForMysql(sqlInput.value);
                syncPlanBackdrop();
                sqlInput.focus();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.state.previousPlan = null;
                this.state.previousSql = null;
                this.state.previousHeuristics = null;
                resultsDiv.innerHTML = '';
                clearBtn.textContent = 'Limpar Consulta';
                if (debugBtn) debugBtn.style.display = 'none';
                const pCard = document.getElementById('plan-input-card');
                if (pCard) pCard.classList.remove('collapsed');
                if (sqlInput) {
                    sqlInput.value = '';
                    syncPlanBackdrop();
                    sqlInput.focus();
                }
            });
        }

        if (debugBtn) {
            debugBtn.addEventListener('click', () => {
                const plan = this.state.previousPlan;
                if (plan && plan.raw) {
                    alert('ÁRVORE DE EXECUÇÃO EXPLAIN ANALYZE:\n\n' + plan.raw);
                }
            });
        }

        analyzeBtn.addEventListener('click', async () => {
            const sql = sqlInput.value.trim();
            if (!sql) return;
            this.setBtnLoading(analyzeBtn, true, 'Processando...');
            try {
                const response = await window.api.analyzeExecutionPlan(sql, this.state.activeConfig.sgbd);
                if (response.status === 'success') {
                    window.PlanRenderer.displayPlanResults(response.plan, sql, resultsDiv, clearBtn, this.state, response.heuristics);

                    // Auto colapsa a caixa para focar no fluxo do funnel HTML longo
                    const pCard = document.getElementById('plan-input-card');
                    if (pCard) pCard.classList.add('collapsed');

                    // Mostra botao de debug visual
                    if (debugBtn) debugBtn.style.display = 'inline-block';
                } else {
                    resultsDiv.innerHTML = this.renderFriendlyError(response);
                    this.bindFriendlyErrorActions(resultsDiv);
                }
            } catch (error) {
                resultsDiv.innerHTML = this.renderFriendlyError(error);
                this.bindFriendlyErrorActions(resultsDiv);
            } finally {
                this.setBtnLoading(analyzeBtn, false, 'Analisar Plano Real');
            }

        });

        // Feature: Colapsar a caixa de SQL após analisar para ganhar espaço na tela
        const toggleBtn = document.getElementById('toggle-sql-btn');
        const planCard = document.getElementById('plan-input-card');
        if (toggleBtn && planCard) {
            toggleBtn.addEventListener('click', () => {
                planCard.classList.toggle('collapsed');
                if (planCard.classList.contains('collapsed')) {
                    toggleBtn.title = "Mostrar SQL";
                } else {
                    toggleBtn.title = "Ocultar SQL";
                }
            });
        }
    },

    initSettings() {
        const form = document.getElementById('db-config-form');
        const testBtn = document.getElementById('test-connection-btn');
        const sgbdBtns = document.querySelectorAll('.sgbd-btn');
        const portInput = document.getElementById('db-port');
        if (!form) return;

        sgbdBtns.forEach(btn => {
            const sgbd = btn.getAttribute('data-sgbd');
            btn.classList.toggle('active', sgbd === this.state.selectedSgbd);
            btn.addEventListener('click', () => {
                this.state.selectedSgbd = sgbd;
                sgbdBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-sgbd') === sgbd));
                if (portInput) portInput.value = sgbd === 'mysql' ? '3306' : '5432';
            });
        });

        // Pre-preencher se já tiver config no estado
        if (this.state.activeConfig) {
            const c = this.state.activeConfig;
            document.getElementById('db-port').value = c.port;
            document.getElementById('db-user').value = c.user;
            document.getElementById('db-host').value = c.host;
            document.getElementById('db-name').value = c.database;
            console.log('[SETTINGS] Form pre-populated with activeConfig.');
        }

        const passwordInput = document.getElementById('db-pass');
        const useSavedPassword = document.getElementById('use-saved-password');
        const refreshSavedPassword = () => {
            const available = Boolean(this.state.activeConfig?.hasSavedPassword);
            document.getElementById('saved-password-option').hidden = !available;
            useSavedPassword.checked = available;
            passwordInput.value = '';
            passwordInput.disabled = available;
        };
        refreshSavedPassword();
        useSavedPassword.addEventListener('change', () => {
            passwordInput.disabled = useSavedPassword.checked;
            passwordInput.value = '';
        });

        testBtn.addEventListener('click', async () => {
            const config = this.getFormData();
            this.setBtnLoading(testBtn, true, 'Testando...');
            this.showConnectionFeedback('info', 'Tentando conexão...');
            try {
                const response = await window.api.testConnection(config);
                this.showConnectionFeedback(response.status, response.message);
            } catch {
                this.showConnectionFeedback('error', 'Não foi possível testar a conexão.');
            } finally {
                this.setBtnLoading(testBtn, false, 'Testar Conexão');
            }
        });

        const saveBtn = document.getElementById('save-config-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const config = this.getFormData();
                this.setBtnLoading(saveBtn, true, 'Salvando...');
                try {
                    await window.api.saveDbConfig(config);
                    const stored = await this.loadStoredConfig();
                    if (!stored) throw new Error('Falha ao recuperar a configuração salva.');
                    refreshSavedPassword();
                    this.showConnectionFeedback('success', 'Configurações salvas e criptografadas!');
                } catch (err) {
                    console.error('[SETTINGS] Falha ao salvar:', err);
                    this.showConnectionFeedback('error', 'Falha ao salvar configurações.');
                } finally {
                    this.setBtnLoading(saveBtn, false, 'Salvar Configurações');
                }
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const config = this.getFormData();
            const submitBtn = document.getElementById('connect-db-btn');
            this.setBtnLoading(submitBtn, true, 'Conectando...');
            this.showConnectionFeedback('info', 'Estabelecendo conexão...');

            try {
                await window.api.saveDbConfig(config);
                const stored = await this.loadStoredConfig();
                if (!stored) throw new Error('Falha ao recuperar a configuração salva.');
                refreshSavedPassword();
                this.showConnectionFeedback('success', 'Conectado com sucesso!');
                this.state.isConnected = true;
                this.state.activeSgbdName = config.sgbd.toUpperCase();
                setTimeout(() => this.navigateTo('execution-plan'), 1000);
            } catch {
                this.state.isConnected = false;
                this.showConnectionFeedback('error', 'Não foi possível conectar e salvar as configurações.');
            } finally {
                this.setBtnLoading(submitBtn, false, 'Conectar ao Banco');
            }
        });
    },

    getFormData() {
        return {
            sgbd: this.state.selectedSgbd,
            host: document.getElementById('db-host').value,
            port: parseInt(document.getElementById('db-port').value),
            user: document.getElementById('db-user').value,
            password: document.getElementById('db-pass').value,
            useSavedPassword: document.getElementById('use-saved-password').checked,
            database: document.getElementById('db-name').value
        };
    },

    async loadStoredConfig() {
        try {
            console.log('[STORAGE] Tentando carregar config segura...');
            const config = await window.api.getDbConfig();
            if (config) {
                console.log('[STORAGE] Config segura carregada com sucesso.');
                this.state.activeConfig = config;
                this.state.selectedSgbd = config.sgbd;
            }
            return config;
        } catch (error) {
            console.warn('[STORAGE] Sem configurações prévias ou erro na descriptografia:', error);
            this.state.activeConfig = null;
            return null;
        }
    },

    setBtnLoading(btn, isLoading, text) {
        if (!btn) return;
        btn.disabled = isLoading;
        if (isLoading) {
            btn.dataset.orig = btn.textContent;
            btn.textContent = text;
        } else {
            btn.textContent = btn.dataset.orig || text;
        }
    },

    showConnectionFeedback(status, message) {
        const feedback = document.getElementById('connection-feedback');
        if (!feedback) return;

        feedback.style.display = 'block';

        let feedbackClass = '';
        if (status === 'success') feedbackClass = 'success-msg';
        else if (status === 'error') feedbackClass = 'error-msg';
        feedback.className = feedbackClass;

        if (status === 'info') {
            feedback.style.background = 'rgba(56, 189, 248, 0.1)';
            feedback.style.color = 'var(--primary)';
            feedback.style.borderColor = 'var(--primary)';
        } else {
            feedback.style.background = '';
            feedback.style.color = '';
            feedback.style.borderColor = '';
        }

        feedback.innerHTML = this.escapeHtml(message);

    },

    displayHeuristicResults(results, container) {
        if (!container) return;
        const activeEditor = this.getActiveHeuristicEditor();
        const currentSql = activeEditor.input ? activeEditor.input.value : '';

        if (results.length === 0) {
            container.innerHTML = '<div class="success-msg">Nenhuma má prática estática detectada pelo analisador.</div>';
            return;
        }
        const div = document.createElement('div');
        div.className = 'suggestions-container';
        const hasAutomaticFix = results.some(res => this.getSqlFix(res, currentSql));
        div.innerHTML = results.map((res, index) => {
            const tokens = this.getHighlightTokensForResult(res);
            const fix = this.getSqlFix(res, currentSql);
            const references = this.renderRuleReferences(res.references || []);
            const manualNote = (res.title || '').includes('SELECT *')
                ? 'Correção manual: escolha as colunas desejadas na consulta otimizada.'
                : 'Ajuste manual recomendado: reescreva o trecho destacado conforme a estrutura das suas tabelas.';
            return `
            <div class="suggestion-item severity-${this.getSeverityClass(res.severity)}" data-result-index="${index}" data-tokens="${this.escapeHtml(JSON.stringify(tokens))}">
                <h4>${this.escapeHtml(res.title)}</h4>
                <p class="suggestion-message">${this.escapeHtml(res.message)}</p>
                <div class="suggestion-text">Sugestão Pedagógica: ${this.escapeHtml(res.suggestion)}</div>
                ${references}
                <div class="suggestion-actions">
                    ${fix ? '<button type="button" class="btn-secondary apply-suggestion-btn">Enviar para aba otimizada</button>' : `<span class="suggestion-note">${this.escapeHtml(manualNote)}</span>`}
                </div>
            </div>
        `;
        }).join('');
        if (hasAutomaticFix) {
            div.insertAdjacentHTML('afterbegin', `
                <div class="suggestions-toolbar">
                    <button type="button" class="btn-primary" id="apply-all-suggestions-btn">Aplicar tuning</button>
                </div>
            `);
        }
        container.appendChild(div);


        div.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                div.querySelectorAll('.suggestion-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                this.highlightSql(item.dataset.tokens, activeEditor.backdropId, activeEditor.inputId);
            });
        });

        const applyAllBtn = div.querySelector('#apply-all-suggestions-btn');
        if (applyAllBtn) {
            applyAllBtn.addEventListener('click', () => {
                this.applyAllSqlSuggestions(results);
            });
        }

        div.querySelectorAll('.apply-suggestion-btn').forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();
                const item = event.target.closest('.suggestion-item');
                const result = results[Number(item.dataset.resultIndex)];
                this.applySqlSuggestion(result, currentSql);
            });
        });
    },


    highlightSql(tokensStr, bdId, inputId) {
        const bd = document.getElementById(bdId);
        const input = document.getElementById(inputId);
        if (!bd || !input) return;

        let tokens = [];
        try {
            tokens = JSON.parse(tokensStr);
        } catch (e) {
            console.debug('[HIGHLIGHT] Erro ao parsear tokens:', e);
        }

        const text = input.value;
        if (tokens.length === 0) {
            bd.innerHTML = this.syntaxHighlightSql(text);
            return;
        }

        bd.innerHTML = this.syntaxHighlightSql(text, tokens);

        // Auto Scroll-into-view
        const marks = bd.querySelectorAll('.sql-highlight');
        if (marks.length > 0) {
            const firstMark = marks[0];
            const targetPos = firstMark.offsetTop - (input.clientHeight / 2) + (firstMark.clientHeight / 2);
            input.scrollTo({ top: targetPos, behavior: 'smooth' });
            bd.scrollTo({ top: targetPos, behavior: 'smooth' });
        } else {
            bd.scrollTop = input.scrollTop;
        }
    },

    clearHighlight(bdId, inputId) {
        const bd = document.getElementById(bdId);
        const input = document.getElementById(inputId);
        if (!bd || !input) return;
        bd.innerHTML = this.syntaxHighlightSql(input.value);
        bd.scrollTop = input.scrollTop;
    },

    syntaxHighlightSql(sqlText, highlightTokens = []) {
        let segments = [{ text: String(sqlText ?? ''), className: null }];
        const mark = (pattern, classify) => {
            segments = segments.flatMap(segment => {
                if (segment.className) return [segment];
                const parts = [];
                let cursor = 0;
                for (const match of segment.text.matchAll(pattern)) {
                    if (!match[0]) continue;
                    parts.push({ text: segment.text.slice(cursor, match.index), className: null });
                    parts.push({ text: match[0], className: classify(match, segment.text) });
                    cursor = match.index + match[0].length;
                }
                parts.push({ text: segment.text.slice(cursor), className: null });
                return parts;
            });
        };

        for (const token of Array.isArray(highlightTokens) ? highlightTokens : []) {
            if (typeof token !== 'string') continue;
            try {
                // Patterns originate in the heuristic rules; matched SQL is always escaped below.
                // eslint-disable-next-line security/detect-non-literal-regexp
                mark(new RegExp(token, 'ig'), () => 'sql-highlight');
            } catch {
                continue;
            }
        }

        mark(/'[^']*'|"[^"]*"/g, () => 'sql-string');
        mark(/\b\d+\b/g, () => 'sql-number');
        const keywords = this.getMysqlKeywords();
        mark(/\b[a-z_][\w$]*\b/gi, (match, text) => {
            if (keywords.has(match[0].toUpperCase())) return 'sql-keyword';
            const nextChar = text.slice(match.index + match[0].length).trimStart().charAt(0);
            if (nextChar === '(') return 'sql-function';
            if (nextChar === '.') return 'sql-identifier';
            return null;
        });

        return segments.map(({ text, className }) => {
            const escaped = this.escapeHtml(text);
            return className ? `<span class="${className}">${escaped}</span>` : escaped;
        }).join('');
    },

    getHighlightTokensForResult(result) {
        const title = result.title || '';
        const tokens = result.targetTokens || [];

        if (tokens.length > 0) return tokens;
        if (title.includes('SELECT *')) return ['SELECT\\s+\\*', '\\*'];
        if (title.includes('Ausência de LIMIT')) return ['SELECT'];

        return [];
    },

    getSqlFix(result, sqlText) {
        const title = result.title || '';
        if (title.includes('Ausência de LIMIT') && !/\bLIMIT\b/i.test(sqlText)) {
            return this.addLimitClause(sqlText);
        }

        return null;
    },

    applySqlSuggestion(result, sourceSql = null) {
        const baseSql = sourceSql ?? this.getHeuristicSourceSql();
        const optimizedSqlInput = document.getElementById('optimized-sql-input');
        const resultsDiv = document.getElementById('results');
        if (!optimizedSqlInput) return;

        const fixedSql = this.getSqlFix(result, baseSql);
        if (!fixedSql) return;

        this.setOptimizedHeuristicSql(fixedSql);
        this.showHeuristicApplyFeedback(resultsDiv, 'Melhoria enviada para a aba otimizada. A consulta original foi preservada.');
    },

    applyAllSqlSuggestions(results) {
        let optimizedSql = this.getHeuristicSourceSql();
        for (const result of results) {
            const fixedSql = this.getSqlFix(result, optimizedSql);
            if (fixedSql) optimizedSql = fixedSql;
        }
        this.setOptimizedHeuristicSql(optimizedSql);
        const resultsDiv = document.getElementById('results');
        this.showHeuristicApplyFeedback(resultsDiv, 'Sugestões de tuning aplicadas na aba otimizada. A consulta original foi preservada.');
    },

    showHeuristicApplyFeedback(container, message, type = 'success') {
        if (!container) return;

        let feedback = container.querySelector('[data-heuristic-apply-feedback]');
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.dataset.heuristicApplyFeedback = 'true';
            container.prepend(feedback);
        }
        feedback.className = `${type === 'error' ? 'error-msg' : 'success-msg'} heuristic-apply-feedback`;
        feedback.textContent = message;
    },

    async copyTextToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (!copied) {
            throw new Error('document.execCommand copy failed');
        }
    },

    setOptimizedHeuristicSql(sqlText) {
        const optimizedSqlInput = document.getElementById('optimized-sql-input');
        const optimizedBd = document.getElementById('optimized-sql-backdrop');
        if (!optimizedSqlInput) return;

        optimizedSqlInput.value = sqlText;
        this.state.optimizedHeuristicSql = sqlText;
        if (optimizedBd) optimizedBd.innerHTML = this.syntaxHighlightSql(sqlText);
        this.updateOptimizedTabState();
        this.setHeuristicActiveTab('optimized');
    },

    addLimitClause(sqlText) {
        const trimmed = sqlText.trim();
        if (!trimmed) return sqlText;
        if (trimmed.endsWith(';')) {
            return `${trimmed.slice(0, -1)} LIMIT 100;`;
        }
        return `${trimmed} LIMIT 100`;
    },

    formatSqlForMysql(sqlText) {
        const mysqlKeywords = this.getMysqlKeywords();
        const literals = [];
        const maskedSql = String(sqlText ?? '').replace(/'(?:''|\\'|[^'])*'|"(?:""|\\"|[^"])*"/g, match => {
            const idx = literals.length;
            literals.push(match);
            return `__SQL_LIT_${idx}__`;
        });

        let formatted = maskedSql
            .replace(/\s+/g, ' ')
            .replace(/\b[a-z_][\w$]*\b/gi, match => {
                if (match.startsWith('__SQL_LIT_')) return match;
                const upper = match.toUpperCase();
                return mysqlKeywords.has(upper) ? upper : match;
            })
            .trim();

        const mainClauses = ['FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'UNION'];
        const joins = ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'JOIN'];

        for (const clause of mainClauses) {
            formatted = formatted.split(` ${clause}`).join(`\n${clause}`);
        }

        for (const join of joins) {
            formatted = formatted.split(` ${join}`).join(`\n${join}`);
        }

        formatted = formatted.split(' AND ').join('\n    AND ');
        formatted = formatted.split(' OR ').join('\n    OR ');

        return formatted.replace(/__SQL_LIT_(\d+)__/g, (_, idx) => literals[Number(idx)] ?? _);
    },

    renderRuleReferences(references) {
        if (!references.length) return '';

        const items = references.map(ref => {
            const title = this.escapeHtml(ref.title || 'Referência');
            if (ref.url) {
                const url = window.HtmlSafety.httpUrl(ref.url);
                if (!url) return `<li>${title}</li>`;
                return `<li><a href="${this.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${title}</a></li>`;
            }
            return `<li>${title}</li>`;
        }).join('');

        return `
            <details class="rule-references">
                <summary>Base teórica</summary>
                <ul>${items}</ul>
            </details>
        `;
    },

    getMysqlKeywords() {
        return new Set([
            'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER',
            'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'EXISTS', 'GROUP', 'BY',
            'HAVING', 'ORDER', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'AS',
            'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
            'LIKE', 'BETWEEN', 'INSERT', 'INTO', 'UPDATE', 'DELETE', 'CREATE', 'ALTER',
            'DROP', 'TABLE', 'VALUES', 'SET'
        ]);
    },

    renderFriendlyError(errorObj, fallbackMessage = 'Ocorreu um erro durante o processamento.') {
        const error = errorObj && typeof errorObj === 'object' ? (errorObj.error || errorObj) : null;
        const title = (error && error.title) || 'Atenção ao Executar Consulta';
        const message = (error && error.message) || (typeof errorObj === 'string' ? errorObj : fallbackMessage);
        const suggestion = error && error.suggestion ? error.suggestion : null;
        let detail = null;
        if (error && error.detail) {
            detail = error.detail;
        } else if (errorObj && errorObj.message && errorObj.message !== message) {
            detail = errorObj.message;
        }
        const type = (error && error.type) || '';

        const isConnectionError = type === 'CONNECTION_REFUSED' || type === 'HOST_NOT_FOUND' || type === 'AUTH_FAILED' || type === 'CONFIG_MISSING';

        return `
            <div class="friendly-error-card" role="alert">
                <div class="friendly-error-header">
                    <div class="friendly-error-icon" aria-hidden="true">!</div>
                    <div class="friendly-error-title-group">
                        <h4 class="friendly-error-title">${this.escapeHtml(title)}</h4>
                        <p class="friendly-error-message">${this.escapeHtml(message)}</p>
                    </div>
                </div>

                ${suggestion ? `
                    <div class="friendly-error-suggestion">
                        <span class="suggestion-badge">Como Resolver</span>
                        <p class="suggestion-text">${this.escapeHtml(suggestion)}</p>
                    </div>
                ` : ''}

                ${isConnectionError ? `
                    <div class="friendly-error-actions">
                        <button type="button" class="btn-secondary btn-sm" data-action="go-to-settings">
                            Ir para Configurações de Conexão
                        </button>
                    </div>
                ` : ''}

                ${detail ? `
                    <details class="friendly-error-details">
                        <summary>Ver detalhe técnico do MySQL / Sistema</summary>
                        <pre><code>${this.escapeHtml(detail)}</code></pre>
                    </details>
                ` : ''}
            </div>
        `;
    },

    bindFriendlyErrorActions(container) {
        if (!container) return;
        const btn = container.querySelector('button[data-action="go-to-settings"]');
        if (btn) {
            btn.addEventListener('click', () => this.navigateTo('settings'));
        }
    },

    getSeverityClass(severity) {
        const value = typeof severity === 'string' ? severity.toLowerCase() : '';
        return ['low', 'medium', 'high'].includes(value) ? value : 'low';
    },

    escapeHtml(value) {
        if (window.HtmlSafety && typeof window.HtmlSafety.escape === 'function') {
            return window.HtmlSafety.escape(value);
        }
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

};

window.app = app;
document.addEventListener('DOMContentLoaded', () => {
    console.log('[DOM] Content Loaded. Starting app...');
    app.init();
});
