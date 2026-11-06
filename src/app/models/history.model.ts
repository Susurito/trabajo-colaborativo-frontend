export interface CategorySummary {
  category: string;
  count: number;
}

export interface LocationIncidentItem {
  id: number;
  folio: string;
  title: string;
  createdAt: string;
  status: string;
  category: string;
  assignedTechName?: string;
  diagnosisSummary?: string;
}

export interface LocationHistoryResponse {
  locationId: number;
  locationName: string;
  totalIncidents: number;
  categoriesSummary: CategorySummary[];
  timeline: LocationIncidentItem[];
}
