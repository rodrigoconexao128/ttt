/**
 * Tipos TypeScript para Setores e Roteamento
 */

export interface Sector {
  id: string;
  name: string;
  description: string;
  members: string[]; // IDs dos membros
  activeMemberCount: number;
}

export interface SectorMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  skillTags: string[];
  availability: boolean;
}

export interface RouteResult {
  success: boolean;
  reason: string;
  sector?: Sector;
  member?: SectorMember;
  message: string;
  matchedKeywords?: string[];
  routingDetails?: {
    memberId: string;
    memberName: string;
    memberEmail: string;
    skillTags: string[];
  };
  fallback?: boolean;
}

export interface ReportData {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  totalAttendances: number;
  sectorStats: Record<string, any>;
  overallSatisfaction: string;
  recommendations: string[];
}
