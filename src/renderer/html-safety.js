const HtmlSafety = Object.freeze({
    escape(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    httpUrl(value) {
        if (typeof value !== 'string' || Array.from(value).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null;
        try {
            const url = new URL(value);
            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
            return url.href;
        } catch {
            return null;
        }
    },

    number(value, fallback = 0) {
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    },

    emphasis(value) {
        return this.escape(value)
            .replace(/&lt;strong&gt;/g, '<strong>')
            .replace(/&lt;\/strong&gt;/g, '</strong>')
            .replace(/&lt;br\/&gt;/g, '<br/>');
    }
});

window.HtmlSafety = HtmlSafety;
