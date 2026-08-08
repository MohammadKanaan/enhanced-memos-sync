export function appHasDailyNotesPluginLoaded(): boolean {
  return true;
}

export function getAllDailyNotes(): Record<string, { path: string }> {
  return {};
}

export function getDateFromFile(): null {
  return null;
}

export function getDailyNote(): undefined {
  return undefined;
}

export async function createDailyNote(): Promise<{ path: string }> {
  throw new Error("Daily Notes mock is not configured.");
}
