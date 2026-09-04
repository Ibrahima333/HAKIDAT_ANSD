/**
 * Gestion des messages Chat IA sélectionnés pour inclusion dans le rapport PDF.
 * Persistance dans localStorage — clé unique par session.
 */

export interface ChatExportMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
}

const KEY = "askdata_chat_export";

export function getChatExport(): ChatExportMessage[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function toggleChatMessage(msg: ChatExportMessage): ChatExportMessage[] {
  const current = getChatExport();
  const exists = current.find(m => m.id === msg.id);
  const next = exists
    ? current.filter(m => m.id !== msg.id)        // décocher → retirer
    : [...current, msg];                           // cocher → ajouter (ordre d'ajout)
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function isChatMessageSelected(id: string): boolean {
  return getChatExport().some(m => m.id === id);
}

export function clearChatExport(): void {
  localStorage.removeItem(KEY);
}

export function getChatExportCount(): number {
  return getChatExport().length;
}
