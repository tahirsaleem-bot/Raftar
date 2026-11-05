// The walkthrough script: one entry per screenshot. `tap: false` highlights without pressing.
// `mark: false` shows the screen with no highlight at all.
export type Beat = { shot: string; step: number; title: string; line: string; tap?: boolean; mark?: boolean };

export const STEPS = 7;

export const beats: Beat[] = [
  { step: 1, shot: "signup", title: "Create your account", line: "Sign up with your name, email and a password." },
  { step: 2, shot: "home", title: "Make a group", line: "Tap New group and name it after the trip." },
  { step: 3, shot: "members", title: "Add your friends", line: "Open Members and add each friend's email." },
  { step: 4, shot: "group_full", title: "Add an expense", line: "Whoever paid taps Add expense." },
  { step: 4, shot: "expense_split", title: "Add an expense", line: "Enter the bill, tick who was there — shares work out to the paisa.", tap: false },
  { step: 5, shot: "balances", title: "Who owes whom", line: "Balances shows exactly who owes whom. Tap the bell to remind." },
  { step: 5, shot: "reminder", title: "Who owes whom", line: "Send the reminder on WhatsApp in one tap." },
  { step: 6, shot: "friends", title: "Totals across all trips", line: "Friends shows each friend's total, all trips added up." },
  { step: 7, shot: "friend_settle", title: "Settle up", line: "Paid back? Tap Mark everything as paid." },
];
