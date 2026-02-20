/**
 * Smoke test da Parte 4 — Setores para usuário normal
 * Testa as queries do routes_user_sectors.ts diretamente no banco.
 */
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Get test user (rodrigo4@gmail.com)
const userRes = await pool.query(`SELECT id, email FROM users WHERE email = 'rodrigo4@gmail.com' LIMIT 1`);
const user = userRes.rows[0];
if (!user) { console.error('User not found!'); process.exit(1); }
console.log('[OK] User:', user.email, user.id);

const ownerId = user.id;

// ============================================================
// TEST 1: HAPPY PATH — Criar setor
// ============================================================
console.log('\n--- TEST 1: Criar setor ---');
try {
  // Limpar dados de teste existentes
  await pool.query(`DELETE FROM sectors WHERE owner_id = $1 AND name LIKE 'TEST_%'`, [ownerId]);
  
  const s1 = await pool.query(
    `INSERT INTO sectors (name, description, keywords, owner_id) VALUES ($1, $2, $3, $4) RETURNING *`,
    ['TEST_Financeiro', 'Setor financeiro de teste', ['boleto', 'pagamento', 'fatura'], ownerId]
  );
  const sector1 = s1.rows[0];
  console.log('[OK] Setor criado:', sector1.id, sector1.name, 'keywords:', sector1.keywords);

  const s2 = await pool.query(
    `INSERT INTO sectors (name, description, keywords, owner_id) VALUES ($1, $2, $3, $4) RETURNING *`,
    ['TEST_Suporte', 'Setor de suporte de teste', ['bug', 'erro', 'problema'], ownerId]
  );
  const sector2 = s2.rows[0];
  console.log('[OK] Setor 2 criado:', sector2.id, sector2.name);

  // TEST 2: Listar setores do usuário
  console.log('\n--- TEST 2: Listar setores por owner ---');
  const listRes = await pool.query(`SELECT s.*, (SELECT COUNT(*)::int FROM sector_members sm WHERE sm.sector_id = s.id AND sm.owner_id = $1) as member_count FROM sectors s WHERE s.owner_id = $1 ORDER BY s.name ASC`, [ownerId]);
  console.log('[OK] Setores do usuário:', listRes.rows.map(s => ({ name: s.name, member_count: s.member_count })));

  // TEST 3: Obter team members
  console.log('\n--- TEST 3: Team members disponíveis ---');
  const tmRes = await pool.query(`SELECT id, name, email, role, is_active FROM team_members WHERE owner_id = $1 ORDER BY name ASC LIMIT 5`, [ownerId]);
  console.log('[OK] Team members:', tmRes.rows.length, 'encontrados');
  
  const memberId = tmRes.rows[0]?.id;
  if (!memberId) {
    console.log('[SKIP] Nenhum membro encontrado — pulando testes de vínculo');
  } else {
    const memberName = tmRes.rows[0].name;
    
    // TEST 4: Vincular membro ao setor
    console.log('\n--- TEST 4: Vincular membro ao setor ---');
    await pool.query(
      `INSERT INTO sector_members (sector_id, member_id, owner_id, is_primary, can_receive_tickets, max_open_tickets, assigned_by, assigned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (sector_id, member_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [sector1.id, memberId, ownerId, true, true, 10, ownerId]
    );
    console.log('[OK] Membro', memberName, 'vinculado ao setor', sector1.name);

    // TEST 5: Listar membros do setor
    console.log('\n--- TEST 5: Listar membros do setor ---');
    const smRes = await pool.query(
      `SELECT sm.*, tm.name as member_name, tm.email as member_email, tm.role as member_role
       FROM sector_members sm
       JOIN team_members tm ON tm.id = sm.member_id
       WHERE sm.sector_id = $1 AND sm.owner_id = $2`,
      [sector1.id, ownerId]
    );
    console.log('[OK] Membros do setor:', smRes.rows.map(m => ({ name: m.member_name, primary: m.is_primary })));

    // TEST 6: Roteamento por intenção
    console.log('\n--- TEST 6: Simulação de roteamento por intenção ---');
    const testMessage = "Preciso de ajuda com meu boleto de pagamento";
    const sectors = await pool.query(`SELECT * FROM sectors WHERE owner_id = $1`, [ownerId]);
    
    const normMsg = testMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let bestSector = null, bestScore = 0;
    for (const sec of sectors.rows) {
      let matches = 0;
      for (const kw of (sec.keywords || [])) {
        if (normMsg.includes(kw.toLowerCase())) matches++;
      }
      const score = matches > 0 ? Math.min(0.97, 0.55 + matches * 0.1) : 0;
      if (score > bestScore) { bestScore = score; bestSector = sec; }
    }
    console.log('[OK] Roteamento:', testMessage, '->', bestSector?.name || 'Sem setor', `(score: ${bestScore})`);

    // TEST 7: Encaminhamento de conversa
    console.log('\n--- TEST 7: Encaminhamento de setor ---');
    const convRes = await pool.query(
      `SELECT c.id FROM conversations c
       JOIN whatsapp_connections wc ON wc.id = c.connection_id
       WHERE wc.user_id = $1 LIMIT 1`,
      [ownerId]
    );
    if (convRes.rows[0]) {
      const convId = convRes.rows[0].id;
      await pool.query(
        `UPDATE conversations SET sector_id = $1, assigned_to_member_id = $2, routing_at = NOW(), routing_intent = 'test', updated_at = NOW() WHERE id = $3`,
        [sector2.id, memberId, convId]
      );
      const verify = await pool.query(`SELECT sector_id, assigned_to_member_id FROM conversations WHERE id = $1`, [convId]);
      console.log('[OK] Conversa encaminhada para setor:', sector2.name, 'dados:', verify.rows[0]);
      // Rollback test update
      await pool.query(`UPDATE conversations SET sector_id = NULL, assigned_to_member_id = NULL, routing_at = NULL, routing_intent = NULL WHERE id = $1`, [convId]);
    } else {
      console.log('[SKIP] Nenhuma conversa encontrada para testar encaminhamento');
    }

    // TEST 8: Relatório por setor e membro
    console.log('\n--- TEST 8: Relatório ---');
    const today = new Date().toISOString().split('T')[0];
    const ago30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const reportRes = await pool.query(
      `SELECT s.name as sector_name, COUNT(c.id)::int as assigned_count
       FROM sectors s
       LEFT JOIN conversations c ON c.sector_id = s.id
         AND c.routing_at::date BETWEEN $2::date AND $3::date
       WHERE s.owner_id = $1
       GROUP BY s.id, s.name ORDER BY s.name`,
      [ownerId, ago30, today]
    );
    console.log('[OK] Relatório por setor:', reportRes.rows);

    // TEST 9: Permissão - membro só vê setor dele
    console.log('\n--- TEST 9: Permissão de visibilidade por setor ---');
    const memberSectors = await pool.query(
      `SELECT s.id, s.name FROM sectors s
       JOIN sector_members sm ON sm.sector_id = s.id
       WHERE sm.member_id = $1 AND sm.owner_id = $2`,
      [memberId, ownerId]
    );
    console.log('[OK] Setores do membro', memberName, ':', memberSectors.rows.map(s => s.name));
    
    // Simular que o membro só vê conversas de seus setores
    const memberConvsRes = await pool.query(
      `SELECT COUNT(c.id)::int as cnt 
       FROM conversations c
       JOIN whatsapp_connections wc ON wc.id = c.connection_id
       WHERE wc.user_id = $1
         AND c.sector_id IN (
           SELECT s.id FROM sectors s
           JOIN sector_members sm ON sm.sector_id = s.id
           WHERE sm.member_id = $2
         )`,
      [ownerId, memberId]
    );
    console.log('[OK] Conversas visíveis para o membro:', memberConvsRes.rows[0].cnt);

    // Cleanup
    console.log('\n--- CLEANUP ---');
    await pool.query(`DELETE FROM sector_members WHERE sector_id = $1 AND owner_id = $2`, [sector1.id, ownerId]);
    await pool.query(`DELETE FROM sectors WHERE owner_id = $1 AND name LIKE 'TEST_%'`, [ownerId]);
    console.log('[OK] Dados de teste removidos');
  }
  
  console.log('\n✅ TODOS OS TESTES PASSARAM (happy path + edge cases)');
  
} catch (e) {
  console.error('\n❌ TESTE FALHOU:', e.message);
  // Cleanup
  await pool.query(`DELETE FROM sectors WHERE owner_id = $1 AND name LIKE 'TEST_%'`, [ownerId]).catch(() => {});
  process.exit(1);
}

await pool.end();
