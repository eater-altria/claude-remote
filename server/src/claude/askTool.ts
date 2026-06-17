import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Question, QuestionAnswer } from '../protocol.js';

/**
 * Callback the session supplies: present these questions to the app and resolve
 * with the user's answers (one selection list per question).
 */
export type AskUserFn = (questions: Question[]) => Promise<QuestionAnswer>;

const optionSchema = z.object({
  label: z.string().describe('Short choice text shown on the option card (1-5 words).'),
  description: z.string().optional().describe('Explanation of what choosing this option means.'),
  preview: z.string().optional().describe('Optional code/mockup preview shown when focused.'),
});

const questionSchema = z.object({
  header: z.string().describe('Very short chip label, max ~12 chars (e.g. "Library", "Approach").'),
  question: z.string().describe('The full question, ending with a question mark.'),
  multiSelect: z.boolean().optional().describe('Allow choosing more than one option.'),
  options: z.array(optionSchema).min(2).max(4).describe('2-4 mutually exclusive options.'),
});

/**
 * Builds the in-process MCP server exposing `ask_user`. The model calls this to
 * ask the user multiple-choice clarification questions; the app renders option
 * cards and the chosen labels are returned as the tool result.
 */
export function buildAskServer(askUser: AskUserFn) {
  return createSdkMcpServer({
    name: 'ask',
    version: '1.0.0',
    tools: [
      tool(
        'ask_user',
        'Ask the user one or more multiple-choice clarification questions and wait for their answer. ' +
          'Use this whenever you need the user to make a decision before proceeding. ' +
          'The user sees interactive option cards in their app.',
        {
          questions: z.array(questionSchema).min(1).max(4).describe('1-4 questions to ask.'),
        },
        async (args) => {
          const questions: Question[] = (args.questions ?? []).map((q) => ({
            header: q.header,
            question: q.question,
            multiSelect: q.multiSelect ?? false,
            options: (q.options ?? []).map((o) => ({
              label: o.label,
              description: o.description,
              preview: o.preview,
            })),
          }));

          const answer = await askUser(questions);

          // Render the answer back to the model as readable text.
          const lines: string[] = [];
          questions.forEach((q, i) => {
            const picked = answer.selections[i] ?? [];
            lines.push(`Q: ${q.question}`);
            lines.push(`A: ${picked.length ? picked.join(', ') : '(no selection)'}`);
          });
          return { content: [{ type: 'text', text: lines.join('\n') }] };
        },
      ),
    ],
  });
}
