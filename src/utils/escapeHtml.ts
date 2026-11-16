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

/** An object literal (or a prototype-less dictionary) — data to walk, not a value with its own string form. */
function isPlainObject(value: object): boolean {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Escape every string reachable from `value` and return a copy, so a list or an object
 * read from vars (and handed on, e.g. as i18n params) carries no raw markup either.
 * Numbers, booleans and null pass through unchanged.
 *
 * Only arrays and plain objects are walked. Any other object (a Date, a URL, a class
 * instance) is a value with its own string form: it is printed through String() and
 * that text is escaped. Walking it would keep only its own enumerable fields, which
 * for a Date is none — it would print as "[object Object]".
 */
export function escapeDeep(value: unknown): unknown {
    if (typeof value === 'string') {
        return escapeHtml(value);
    }
    if (Array.isArray(value)) {
        return value.map(escapeDeep);
    }
    if (value !== null && typeof value === 'object') {
        if (!isPlainObject(value)) {
            return escapeHtml(String(value));
        }
        return Object.fromEntries(
            Object.entries(value).map(([key, inner]) => [key, escapeDeep(inner)]),
        );
    }
    return value;
}
