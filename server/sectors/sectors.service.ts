import { pool } from "../db";

type SectorRow = {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  auto_assign_agent_id: string | null;
  auto_assign_agent_email?: string | null;
};

async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const result = await pool.query(text, params);
  return (result.rows[0] as T) || null;
}

function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  for (const keyword of keywords) {
    const normalized = normalizeText(keyword);
    if (normalized) {
      seen.add(normalized);
    }
  }
  return Array.from(seen);
}

export async function listSectors(): Promise<SectorRow[]> {
  return query(
    `SELECT s.*, a.email as auto_assign_agent_email
     FROM sectors s
     LEFT JOIN admins a ON a.id::text = s.auto_assign_agent_id::text
     ORDER BY s.name ASC`
  );
}

export async function getSectorById(id: string): Promise<SectorRow | null> {
  return queryOne(
    `SELECT s.*, a.email as auto_assign_agent_email
     FROM sectors s
     LEFT JOIN admins a ON a.id::text = s.auto_assign_agent_id::text
     WHERE s.id = $1`,
    [id]
  );
}

export async function createSector(input: {
  name: string;
  description?: string | null;
  keywords?: string[];
  autoAssignAgentId?: string | null;
}): Promise<SectorRow> {
  const keywords = normalizeKeywords(input.keywords || []);
  const result = await queryOne<SectorRow>(
    `INSERT INTO sectors (name, description, keywords, auto_assign_agent_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      input.name.trim(),
      input.description?.trim() || null,
      keywords,
      input.autoAssignAgentId || null,
    ]
  );
  if (!result) throw new Error("Falha ao criar setor.");
  return result;
}

export async function updateSector(id: string, payload: any): Promise<SectorRow> {
  const allowed = ["name", "description", "keywords", "autoAssignAgentId"];
  const updates: string[] = [];
  const values: any[] = [id];
  let idx = 2;

  for (const key of allowed) {
    if (payload[key] !== undefined) {
      const col = key === "autoAssignAgentId" ? "auto_assign_agent_id" : key;
      if (key === "keywords") {
        updates.push(`${col} = $${idx}`);
        values.push(normalizeKeywords(payload[key] || []));
      } else if (key === "name") {
        updates.push(`${col} = $${idx}`);
        values.push(String(payload[key]).trim());
      } else {
        updates.push(`${col} = $${idx}`);
        values.push(payload[key]);
      }
      idx++;
    }
  }

  if (updates.length === 0) throw new Error("Nenhum campo para atualizar.");

  const result = await queryOne<SectorRow>(
    `UPDATE sectors SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
    values
  );
  if (!result) throw new Error("Setor nao encontrado.");
  return result;
}

export async function deleteSector(id: string): Promise<void> {
  await query(`DELETE FROM sectors WHERE id = $1`, [id]);
}

export async function listAdminAgents(): Promise<Array<{ id: string; email: string; role: string }>> {
  return query(
    `SELECT id, email, role
     FROM admins
     ORDER BY email ASC`
  );
}
