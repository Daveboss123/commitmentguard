/**
 * Brand tokens. The product name, tagline and visual direction live in one
 * replaceable place so a reskin does not touch product logic.
 */
export const brand = {
  name: "CommitmentGuard",
  shortName: "CG",
  tagline: "Understand the consequence before you consent.",
  description:
    "A commitment consequence engine and consent layer for AI assistants that act on a household's behalf.",
  note: "SERV Hackathon 02 build · synthetic household data",
} as const;

export const demoLabels = {
  household: "Demo household",
  provider: "Demo provider",
  illustrative: "Illustrative terms",
  simulated: "Simulated checkout — no real payment is made",
  demoAuth: "Demo sign-in",
} as const;
