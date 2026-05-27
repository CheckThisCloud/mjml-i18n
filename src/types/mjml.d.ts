declare module 'mjml-core' {
  export class HeadComponent {}
  export function registerComponent(component: unknown): void;
}

declare module 'mjml' {
  const mjml: (
    src: string,
    opts?: { preprocessors?: ((xml: string) => string)[] },
  ) => Promise<{ html: string; errors?: unknown[] }>;
  export default mjml;
}
