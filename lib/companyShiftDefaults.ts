export type DefaultCompanyShift = {
  id: string;
  name: string;
  type: string;
  start: string;
  end: string;
  graceMins: number;
  earlyWindowMins: number;
  minWorkBeforeOutMins: number;
  active: boolean;
};

export const DEFAULT_COMPANY_SHIFTS: DefaultCompanyShift[] = [
  {
    id: "default-general",
    name: "General",
    type: "Day",
    start: "09:00",
    end: "18:00",
    graceMins: 10,
    earlyWindowMins: 15,
    minWorkBeforeOutMins: 60,
    active: true,
  },
  {
    id: "default-morning",
    name: "Morning",
    type: "Early",
    start: "06:00",
    end: "15:00",
    graceMins: 10,
    earlyWindowMins: 15,
    minWorkBeforeOutMins: 60,
    active: true,
  },
  {
    id: "default-evening",
    name: "Evening",
    type: "Late",
    start: "14:00",
    end: "22:00",
    graceMins: 10,
    earlyWindowMins: 15,
    minWorkBeforeOutMins: 60,
    active: true,
  },
];
