import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { postgres } from 'https://deno.land/x/postgresjs/mod.js';

Deno.serve(async (req) => {
  try {
    const connectionString = Deno.env.get('DATABASE_URL')!;

    // Criar conexão PostgreSQL
    const sql = postgres(connectionString);

    // Executar migração
    await sql`
      ALTER TABLE salon_config
      ADD COLUMN IF NOT EXISTS min_notice_minutes integer;
    `;

    await sql`
      UPDATE salon_config
      SET min_notice_minutes = COALESCE(min_notice_hours, 2) * 60
      WHERE min_notice_minutes IS NULL;
    `;

    await sql`
      ALTER TABLE salon_config
      ALTER COLUMN min_notice_minutes SET DEFAULT 0;
    `;

    await sql.end();

    return new Response(
      JSON.stringify({ success: true, message: 'Migração executada com sucesso!' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
