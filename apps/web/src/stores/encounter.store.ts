import { create } from 'zustand';

type EncounterState = {
  activeEncounterId: string | null;
  activePatientId: string | null;
  setActiveEncounter: (patientId: string | null, encounterId: string | null) => void;
  clearActiveEncounter: () => void;
};

export const useEncounterStore = create<EncounterState>((set) => ({
  activeEncounterId: null,
  activePatientId: null,
  setActiveEncounter: (patientId, encounterId) =>
    set({ activePatientId: patientId, activeEncounterId: encounterId }),
  clearActiveEncounter: () => set({ activePatientId: null, activeEncounterId: null }),
}));
