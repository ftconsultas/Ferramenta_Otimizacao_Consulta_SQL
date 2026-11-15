/** @jest-environment jsdom */

require('../../src/renderer/html-safety');
require('../../src/renderer/plan-renderer');
const listener = jest.spyOn(document, 'addEventListener').mockImplementation(() => {});
require('../../src/renderer/renderer');
listener.mockRestore();

const payload = `'"><img src=x onerror="window.compromised=true"><svg onload="window.compromised=true"></svg><script>alert(1)</script>&`;

function expectInert(container) {
    expect(container.querySelector('img, svg, script, iframe, object, embed, style, base')).toBeNull();
    for (const element of container.querySelectorAll('*')) {
        for (const attribute of element.attributes) {
            expect(attribute.name).not.toMatch(/^on/i);
        }
    }
}

function planNode(overrides = {}) {
    return {
        type: 'Filtro', table: 'pedidos', indentation: 0, cost: 1,
        actualTimeStart: 1, actualTimeEnd: 2, actualRows: 10, loops: 1,
        totalActualTime: 2, selfTime: 1, ...overrides
    };
}

beforeEach(() => {
    document.body.innerHTML = '<div id="results"></div><div id="connection-feedback"></div>';
    window.app.state.heuristicActiveTab = 'original';
    window.app.elements.viewContainer = document.getElementById('results');
});

describe('HTML output encoding', () => {
    it.each([null, undefined, 0, false, payload, '&lt;script&gt;'])('renders %p as text', value => {
        const container = document.createElement('div');
        container.innerHTML = `<div data-value="${window.HtmlSafety.escape(value)}">${window.HtmlSafety.escape(value)}</div>`;
        expect(container.firstElementChild.textContent).toBe(String(value ?? ''));
        expect(container.firstElementChild.dataset.value).toBe(String(value ?? ''));
        expectInert(container);
    });

    it('shows initialization errors without creating HTML from the message', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            window.app.showVisualError(payload);
            const container = document.getElementById('results');
            expect(container.querySelector('p').textContent).toBe(payload);
            expectInert(container);
        } finally {
            errorSpy.mockRestore();
        }
    });

    it.each(['info', 'success', 'error'])('renders %s connection feedback as text', status => {
        window.app.showConnectionFeedback(status, payload);
        const feedback = document.getElementById('connection-feedback');
        expect(feedback.textContent).toContain(payload);
        expectInert(feedback);
    });

    it('encodes suggestion text and token attributes and constrains severity classes', () => {
        const result = {
            title: payload, message: payload, suggestion: payload,
            severity: `HIGH" onclick="alert(1)`, targetTokens: [payload], references: []
        };
        const container = document.getElementById('results');
        window.app.displayHeuristicResults([result], container);
        const suggestion = container.querySelector('.suggestion-item');
        expect(suggestion.className).toBe('suggestion-item severity-low');
        expect(suggestion.querySelector('h4').textContent).toBe(payload);
        expect(suggestion.querySelector('p').textContent).toBe(payload);
        expect(suggestion.querySelector('.suggestion-text').textContent).toContain(payload);
        expect(JSON.parse(suggestion.dataset.tokens)).toEqual([payload]);
        expectInert(container);
    });
});

describe('SQL highlighting', () => {
    it.each([[], ['SELECT'], ['.*'], ['['], [payload]].map(tokens => [tokens]))('keeps SQL literal with tokens %p', tokens => {
        const sql = `SELECT '${payload}' AS exemplo, 1.2 FROM pedidos WHERE id < 10; @@SQLTOKENX@@`;
        const container = document.createElement('div');
        container.innerHTML = window.app.syntaxHighlightSql(sql, tokens);
        expect(container.textContent).toBe(sql);
        expectInert(container);
    });

    it('preserves keywords, strings, numbers and diagnostic highlighting', () => {
        const container = document.createElement('div');
        container.innerHTML = window.app.syntaxHighlightSql("select 'texto', 42 FROM pedidos", ['FROM']);
        expect(container.querySelector('.sql-keyword').textContent).toBe('select');
        expect(container.querySelector('.sql-string').textContent).toBe("'texto'");
        expect(container.querySelector('.sql-number').textContent).toBe('42');
        expect(container.querySelector('.sql-highlight').textContent).toBe('FROM');
    });
});

describe('execution plan rendering', () => {
    it.each([null, 'SELECT 1', payload])('encodes SQL, metrics and labels when comparing with %p', reference => {
        const node = planNode({ type: payload, table: payload, cost: payload, actualRows: payload, loops: payload });
        const container = document.createElement('div');
        container.innerHTML = window.PlanRenderer.buildPlanCard({ nodes: [node], totalCost: payload }, payload, payload, reference);
        expect(container.querySelector('.plan-sql').textContent).toBe(payload);
        expect(container.querySelector('.plan-label').textContent).toBe(payload);
        expect(container.querySelector('.didactic-node-type').textContent).toContain(payload);
        expect(container.querySelector('.didactic-node-table').textContent).toBe(payload);
        expectInert(container);
    });

    it.each([true, false])('encodes changed SQL tokens (old plan: %p)', old => {
        const container = document.createElement('div');
        container.innerHTML = window.PlanRenderer.highlightSqlDiff(payload, 'SELECT 1', old);
        expect(container.textContent).toBe(payload);
        expectInert(container);
    });

    it('preserves only attribute-free strong emphasis in tuning tips', () => {
        const node = planNode({ tuningTip: `<strong>Índice</strong><strong onclick="alert(1)">x</strong>${payload}` });
        const container = document.createElement('div');
        container.innerHTML = window.PlanRenderer.renderNodeDidactic(node, 10);
        expect(container.querySelector('strong').textContent).toBe('Índice');
        expect(container.querySelector('strong[onclick]')).toBeNull();
        expect(container.textContent).toContain(payload);
        expectInert(container);
    });

    it('constrains dynamic CSS values to finite numeric ranges', () => {
        const container = document.createElement('div');
        container.innerHTML = window.PlanRenderer.renderNodeDidactic(planNode({
            indentation: `0px; background:url(javascript:alert(1))`, actualTimeStart: Infinity, actualTimeEnd: 0
        }), 10);
        expect(container.querySelector('.didactic-node').style.marginLeft).toBe('0px');
        expect(container.querySelector('.latency-bar-startup').style.width).toBe('0%');
        expect(window.PlanRenderer.formatTime(payload)).toBe('N/A');
        expectInert(container);
    });

    it('keeps both plans inert in the comparison view', () => {
        const target = document.getElementById('results');
        const state = { previousPlan: { nodes: [planNode()], totalCost: 1 }, previousSql: payload };
        window.PlanRenderer.displayPlanResults({ nodes: [planNode({ type: payload })] }, payload, target, null, state);
        expect(target.querySelectorAll('.plan-sql')).toHaveLength(2);
        expectInert(target);
    });
});

describe('reference links', () => {
    it.each([
        'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd',
        '//example.com', 'https://user:password@example.com', 'https://example.com/\n',
        'java\tscript:alert(1)', 'https://example.com/" onclick="alert(1)', ''
    ])('does not create a link for %p', url => {
        const container = document.createElement('div');
        container.innerHTML = window.app.renderRuleReferences([{ title: payload, url }]);
        expect(container.querySelector('a')).toBeNull();
        expect(container.querySelector('li').textContent).toBe(payload);
        expectInert(container);
    });

    it.each(['https://example.com/path?a=1&b=2', 'http://example.com/'])('preserves safe reference %p', url => {
        const container = document.createElement('div');
        container.innerHTML = window.app.renderRuleReferences([{ title: payload, url }]);
        const anchor = container.querySelector('a');
        expect(anchor.href).toBe(url);
        expect(anchor.textContent).toBe(payload);
        expect(anchor.rel).toBe('noopener noreferrer');
        expectInert(container);
    });
});

describe('analysis error responses', () => {
    const fs = require('fs');
    const path = require('path');

    async function flushHandlers() {
        for (let index = 0; index < 5; index++) await Promise.resolve();
    }

    it('encodes errors received from heuristic analysis through IPC', async () => {
        document.body.innerHTML = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/pages/heuristic-analyzer.html'), 'utf8');
        window.api = { analyzeSqlSimple: jest.fn().mockResolvedValue({ status: 'error', message: payload }) };
        window.app.initHeuristicAnalyzer();
        document.getElementById('sql-input').value = 'SELECT 1';
        document.getElementById('analyze-btn').click();
        await flushHandlers();
        const container = document.getElementById('results');
        expect(container.textContent).toContain(payload);
        expectInert(container);
    });

    it.each(['response', 'rejection'])('encodes execution plan errors from an IPC %s', async source => {
        document.body.innerHTML = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/pages/execution-plan.html'), 'utf8');
        window.api = { analyzeExecutionPlan: jest.fn() };
        if (source === 'response') window.api.analyzeExecutionPlan.mockResolvedValue({ status: 'error', message: payload });
        else window.api.analyzeExecutionPlan.mockRejectedValue(new Error(payload));
        window.app.state.activeConfig = { sgbd: 'mysql' };
        window.app.setupActivePlanLogic();
        document.getElementById('sql-input-plan').value = 'SELECT 1';
        document.getElementById('analyze-plan-btn').click();
        await flushHandlers();
        const container = document.getElementById('plan-results');
        expect(container.textContent).toContain(payload);
        expectInert(container);
        expect(document.getElementById('analyze-plan-btn').disabled).toBe(false);
    });
});
