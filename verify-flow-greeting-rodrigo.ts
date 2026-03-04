import 'dotenv/config';
import pg from 'pg';
import { FlowBuilder } from './server/FlowBuilder';

const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const res = await client.query(
      `select a.prompt
       from users u
       join ai_agent_config a on a.user_id = u.id
       where lower(u.email) = lower($1)
       limit 1`,
      ['rodrigo4@gmail.com']
    );

    const prompt = res.rows[0]?.prompt || '';
    const builder = new FlowBuilder(undefined, process.env.MISTRAL_API_KEY);
    const flow = await builder.buildFromPrompt(prompt);

    const initial = flow.states[flow.initialState];
    const greetingTransitions = (initial?.transitions || []).filter(t => t.intent === 'GREETING');

    console.log('flow.type:', flow.type);
    console.log('initialState:', flow.initialState);
    console.log('greetingTransitions:', greetingTransitions.map(t => t.action));
    console.log('has GREET_CUSTOM action:', !!flow.actions.GREET_CUSTOM);
    console.log('GREET_CUSTOM template preview:', (flow.actions.GREET_CUSTOM?.template || '').slice(0, 180));

    const anyGreetingAction = Object.entries(flow.actions)
      .filter(([k, v]) => /greet|sauda|welcome/i.test(k) || /greet|sauda|welcome/i.test(v.name || ''))
      .map(([k, v]) => ({ key: k, tmpl: (v.template || '').slice(0, 120) }));

    console.log('greeting actions count:', anyGreetingAction.length);
    console.log('greeting actions sample:', anyGreetingAction.slice(0, 5));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('erro:', e.message);
  process.exit(1);
});
