import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * Callback the session supplies: stage the file at `path` for download and push
 * a file card to the app. Returns the display name + size, or throws if the path
 * is unreadable / not a regular file.
 */
export type SendFileFn = (path: string, description?: string) => { name: string; size: number };

/**
 * Builds the in-process MCP server exposing `send_file`. The model calls this to
 * deliver a file from the working directory to the user's phone; the app shows a
 * download card and fetches the bytes over the authenticated REST endpoint.
 */
export function buildFilesServer(sendFile: SendFileFn) {
  return createSdkMcpServer({
    name: 'files',
    version: '1.0.0',
    tools: [
      tool(
        'send_file',
        "Deliver a file to the user's device. Use this whenever the user asks you to send, share, " +
          'or give them a file (a document, image, log, archive, build artifact, etc.). The user sees a ' +
          'download card in their app and saves the file to their phone. Provide the path to an existing file.',
        {
          path: z.string().describe('Absolute path (or path relative to the working directory) of the file to send.'),
          description: z
            .string()
            .optional()
            .describe('Optional short note shown on the download card, e.g. what the file is.'),
        },
        async (args) => {
          try {
            const { name, size } = sendFile(args.path, args.description);
            return {
              content: [
                {
                  type: 'text',
                  text: `Sent "${name}" (${size} bytes) to the user's device. A download card is now showing in their app.`,
                },
              ],
            };
          } catch (e) {
            return {
              content: [{ type: 'text', text: `Could not send the file: ${(e as Error).message}` }],
            };
          }
        },
      ),
    ],
  });
}
