export function format(message: string, params: Record<string, unknown> = {}): string {
    return message.replace(/\{(\w+)\}/g, (whole, key) =>
        key in params ? String(params[key]) : whole,
    );
}
