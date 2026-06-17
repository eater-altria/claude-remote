import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * Callback the session supplies: stage the file at `path` for download and push
 * a file card to the app. Returns the display name + size, or throws if the path
 * is unreadable / not a regular file.
 */
export type SendFileFn = (path: string, description?: string) => { name: string; size: number };

/**
 * Callback the session supplies: stage an image at `path` and push an inline
 * image to the app. Returns the display name + size, or throws if the path is
 * unreadable or not an image file.
 */
export type SendImageFn = (path: string, caption?: string) => { name: string; size: number };

/**
 * Builds the in-process MCP server exposing `send_file` (deliver a downloadable
 * file) and `send_image` (show an image inline in the chat). Both stage bytes
 * the app fetches over the authenticated REST endpoint.
 */
export function buildFilesServer(sendFile: SendFileFn, sendImage: SendImageFn) {
  return createSdkMcpServer({
    name: 'files',
    version: '1.0.0',
    tools: [
      tool(
        'send_file',
        "Deliver a file to the user's device. Use this whenever the user asks you to send, share, " +
          'or give them a file (a document, log, archive, build artifact, etc.). The user sees a ' +
          'download card and saves the file to their phone. Provide the path to an existing file. ' +
          'For an image you want the user to SEE in the chat, use send_image instead.',
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
      tool(
        'send_image',
        'Show an image inline in the chat so the user sees it directly in the conversation (NOT as a ' +
          'file to download). Use this for screenshots, charts, diagrams, photos, or generated images you ' +
          'want the user to look at. Provide the path to an image file (png, jpg, jpeg, gif, webp, etc.).',
        {
          path: z.string().describe('Absolute path (or path relative to the working directory) of the image to show.'),
          caption: z.string().optional().describe('Optional caption shown beneath the image.'),
        },
        async (args) => {
          try {
            const { name, size } = sendImage(args.path, args.caption);
            return {
              content: [{ type: 'text', text: `Displayed "${name}" (${size} bytes) inline in the user's chat.` }],
            };
          } catch (e) {
            return {
              content: [{ type: 'text', text: `Could not display the image: ${(e as Error).message}` }],
            };
          }
        },
      ),
    ],
  });
}
