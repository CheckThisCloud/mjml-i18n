/**
 * Turns a template into a tree of text, markers and blocks.
 *
 * Every `{{ … }}` marker is one of:
 *   - a block statement: `for <alias> in <path>`, `endfor`, `if <path>`, `else`, `endif`
 *   - an expression (`i18n(…)`, `get(…)`), evaluated later or left verbatim
 *
 * A misplaced or unclosed statement never throws: it becomes an error node whose
 * message is printed where the statement stood, so the mistake is visible in the
 * rendered output.
 */

export type Node =
    | { kind: 'text'; text: string }
    | { kind: 'expression'; marker: string; source: string }
    | { kind: 'error'; message: string }
    | { kind: 'if'; path: string; then: Node[]; otherwise: Node[] }
    | { kind: 'for'; alias: string; path: string; body: Node[] };

type OpenBlock = {
    node: Extract<Node, { kind: 'if' | 'for' }>;
    statement: string;
    parent: Node[];
    branch: Node[];
    hasElse: boolean;
};

// Same marker shape as before blocks existed: single-line, non-greedy.
const MARKER = /{{(.+?)}}/g;
const IF = /^if\s+(\S+)$/;
// The alias is a plain identifier: it becomes the first segment of get() paths.
const FOR = /^for\s+([A-Za-z_$][\w$]*)\s+in\s+(\S+)$/;

export function parseTemplate(xml: string): Node[] {
    const root: Node[] = [];
    const stack: OpenBlock[] = [];
    const current = (): Node[] => stack.length > 0 ? stack[stack.length - 1].branch : root;

    let last = 0;
    for (const match of xml.matchAll(MARKER)) {
        const index = match.index ?? 0;
        if (index > last) {
            current().push({ kind: 'text', text: xml.slice(last, index) });
        }
        last = index + match[0].length;

        const source = match[1].trim();
        const top = stack[stack.length - 1];

        const forMatch = FOR.exec(source);
        if (forMatch) {
            const node: OpenBlock['node'] = { kind: 'for', alias: forMatch[1], path: forMatch[2], body: [] };
            const parent = current();
            parent.push(node);
            stack.push({ node, statement: source, parent, branch: node.body, hasElse: false });
            continue;
        }

        if (source === 'endfor') {
            if (top && top.node.kind === 'for') {
                stack.pop();
            } else {
                current().push({ kind: 'error', message: 'Unexpected endfor' });
            }
            continue;
        }

        const ifMatch = IF.exec(source);
        if (ifMatch) {
            const node: OpenBlock['node'] = { kind: 'if', path: ifMatch[1], then: [], otherwise: [] };
            const parent = current();
            parent.push(node);
            stack.push({ node, statement: source, parent, branch: node.then, hasElse: false });
            continue;
        }

        if (source === 'else') {
            if (top && top.node.kind === 'if' && !top.hasElse) {
                top.branch = top.node.otherwise;
                top.hasElse = true;
            } else {
                current().push({ kind: 'error', message: 'Unexpected else' });
            }
            continue;
        }

        if (source === 'endif') {
            if (top && top.node.kind === 'if') {
                stack.pop();
            } else {
                current().push({ kind: 'error', message: 'Unexpected endif' });
            }
            continue;
        }

        current().push({ kind: 'expression', marker: match[0], source });
    }

    if (last < xml.length) {
        current().push({ kind: 'text', text: xml.slice(last) });
    }

    // Innermost first: an unclosed block is always the last node of its parent, so it is
    // swapped in place for its error followed by its own content, rendered unconditionally.
    while (stack.length > 0) {
        const open = stack.pop() as OpenBlock;
        const content = open.node.kind === 'for'
            ? open.node.body
            : [...open.node.then, ...open.node.otherwise];
        open.parent.splice(
            open.parent.length - 1,
            1,
            { kind: 'error', message: 'Unclosed block: ' + open.statement },
            ...content,
        );
    }

    return root;
}
