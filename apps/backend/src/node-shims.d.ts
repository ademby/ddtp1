declare module 'node:http' {
  export interface IncomingMessage extends AsyncIterable<unknown> { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; }
  export interface ServerResponse { writeHead(status: number, headers?: Record<string, string>): void; end(body?: string): void; }
  export function createServer(handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>): { listen(port: number, callback?: () => void): void };
}
declare const process: { env: Record<string, string | undefined> };
