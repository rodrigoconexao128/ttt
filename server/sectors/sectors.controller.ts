import { Request, Response } from "express";
import * as service from "./sectors.service";

// Convert snake_case DB rows to camelCase for frontend
function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelizeObj(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(camelizeObj);
  if (typeof obj !== "object") return obj;
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toCamel(key)] =
      value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
        ? camelizeObj(value)
        : Array.isArray(value)
          ? value.map(camelizeObj)
          : value;
  }
  return result;
}

const asyncHandler = (fn: Function) => (req: Request, res: Response, next: Function) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const listSectors = asyncHandler(async (_req: Request, res: Response) => {
  const sectors = await service.listSectors();
  res.json({ items: camelizeObj(sectors) });
});

export const getSectorById = asyncHandler(async (req: Request, res: Response) => {
  const sector = await service.getSectorById(req.params.id);
  if (!sector) return res.status(404).json({ message: "Setor nao encontrado." });
  res.json({ sector: camelizeObj(sector) });
});

export const createSector = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, keywords, autoAssignAgentId } = req.body || {};
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ message: "Nome deve ter pelo menos 2 caracteres." });
  }

  const normalizedKeywords = Array.isArray(keywords)
    ? keywords
    : typeof keywords === "string"
      ? keywords.split(",")
      : [];

  const sector = await service.createSector({
    name,
    description,
    keywords: normalizedKeywords,
    autoAssignAgentId: autoAssignAgentId || null,
  });

  res.status(201).json({ sector: camelizeObj(sector) });
});

export const updateSector = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, keywords, autoAssignAgentId } = req.body || {};

  if (name !== undefined && String(name).trim().length < 2) {
    return res.status(400).json({ message: "Nome deve ter pelo menos 2 caracteres." });
  }

  const normalizedKeywords = Array.isArray(keywords)
    ? keywords
    : typeof keywords === "string"
      ? keywords.split(",")
      : undefined;

  const sector = await service.updateSector(req.params.id, {
    name,
    description,
    keywords: normalizedKeywords,
    autoAssignAgentId,
  });

  res.json({ sector: camelizeObj(sector) });
});

export const deleteSector = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteSector(req.params.id);
  res.status(204).send();
});

export const listAdminAgents = asyncHandler(async (_req: Request, res: Response) => {
  const agents = await service.listAdminAgents();
  res.json({ items: camelizeObj(agents) });
});
