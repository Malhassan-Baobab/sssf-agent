/**
 * Simple REPL to talk to the orchestrator locally.
 * Usage: npx tsx orchestrator/cli.ts   (then type messages; Ctrl-C to exit)
 * Or one-shot: npx tsx orchestrator/cli.ts "ما هو الحد الأدنى للمعاش؟"
 */
import 'dotenv/config';
import * as readline from 'node:readline';
import { Orchestrator } from './agent.js';

async function main() {
  const agent = new Orchestrator();
  const oneShot = process.argv.slice(2).join(' ').trim();

  if (oneShot) {
    const turn = await agent.send(oneShot);
    if (turn.toolCalls.length) {
      console.log('\x1b[90m[tools: ' + turn.toolCalls.map((t) => t.name).join(', ') + ']\x1b[0m');
    }
    console.log(turn.reply);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('SSSF agent (pilot). Type a question in Arabic or English. Ctrl-C to exit.\n');
  const ask = () =>
    rl.question('\x1b[36myou> \x1b[0m', async (line) => {
      if (!line.trim()) return ask();
      try {
        const turn = await agent.send(line);
        if (turn.toolCalls.length) {
          console.log('\x1b[90m[tools: ' + turn.toolCalls.map((t) => t.name).join(', ') + ']\x1b[0m');
        }
        console.log('\x1b[33magent>\x1b[0m ' + turn.reply + '\n');
      } catch (e) {
        console.error('error:', (e as Error).message);
      }
      ask();
    });
  ask();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
