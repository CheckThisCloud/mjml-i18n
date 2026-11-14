const ENTITIES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/**
 * Escape the characters that let text become markup: a tag (`<`, `>`), an entity (`&`),
 * or an attribute break-out (`"`, `'`). Markers resolve inside element text and inside
 * attribute values alike, so all five are escaped everywhere.
 */
export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

/**
 * Escape every string reachable from `value` and return a copy, so a list or an object
 * read from vars (and handed on, e.g. as i18n params) carries no raw markup either.
 * Numbers, booleans and null pass through unchanged.
 */
export function escapeDeep(value: unknown): unknown {
    if (typeof value === 'string') {
        return escapeHtml(value);
    }
    if (Array.isArray(value)) {
        return value.map(escapeDeep);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, inner]) => [key, escapeDeep(inner)]),
        );
    }
    return value;
}
