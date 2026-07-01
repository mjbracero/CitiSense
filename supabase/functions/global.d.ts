/// Minimal Deno globals for Supabase Edge Functions in the editor.

declare namespace Deno {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>
  ): void;

  export const env: {
    get(key: string): string | undefined;
  };
}
