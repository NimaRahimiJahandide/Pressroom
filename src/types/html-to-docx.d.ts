/**
 * Minimal type declaration for the `html-to-docx` package.
 *
 * The package ships without its own TypeScript types; this declaration
 * covers the default export we use in BlogEditor's dynamic import:
 *
 *   const htmlToDocx = (await import('html-to-docx')).default;
 *   const blob: Blob = await htmlToDocx(htmlString, header?, options?);
 *
 * If the package later ships its own types, this file can be removed.
 */

declare module 'html-to-docx' {
  export interface HtmlToDocxOptions {
    table?: {
      row?: {
        cantSplit?: boolean;
      };
    };
    [key: string]: unknown;
  }

  /**
   * Convert an HTML string to a .docx Blob.
   *
   * @param html   Full HTML document string (including `<!DOCTYPE html>`).
   * @param header Optional header/footer XML string.
   * @param options Document-level options (table row splitting, etc.).
   */
  export default function htmlToDocx(
    html: string,
    header?: string | null,
    options?: HtmlToDocxOptions,
  ): Promise<Blob>;
}
