export interface CampusPlan {
  id: string;
  building: string;
  floor: string;
  label: string;
}

export interface CampusPlace {
  id: string;
  plan: string;
  label: string;
  search: boolean;
}

export type TransferKind = 'stairs' | 'lift' | 'passage';

export interface PlanStep {
  plan: string;
  start: CampusPlace;
  end: CampusPlace;
  next: string | null;
  transfer: TransferKind | null;
}

export type CampusMode = 'standard' | 'lift';
