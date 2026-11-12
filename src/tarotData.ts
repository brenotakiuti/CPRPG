export const tarotCardNames = ["The Fool","The Magician","The High Priestess","The Empress","The Emperor","The Hierophant","The Lovers","The Chariot","Strength","The Hermit","Wheel of Fortune","Justice","The Hanged Man","Death","Temperance","The Devil","The Tower","The Star","The Moon","The Sun","Judgement","The World"];
export const tarotMessages = [
  "Fate has chosen a card.",
  "The cards know what you do not.",
  "Your destiny awaits beneath the veil.",
  "Fate has a message for you.",
  "Some truths are better left hidden.",
  "The unknown calls to you.",
  "Destiny has dealt its hand.",
  "Do you dare face what awaits?",
];
export function tarotFromLog(message: string): { index: number; reversed: boolean } | null {
  const match = /^(?:TAROT REVEALED|TAROT CARD): (.+?)(?: \((Upright|Reversed)\))?$/.exec(message);
  if (!match) return null;
  const index = tarotCardNames.indexOf(match[1]);
  return index < 0 ? null : { index, reversed: match[2] === 'Reversed' };
}

export function displayLogMessage(message: string): string {
  const tarot = tarotFromLog(message);
  return tarot ? `TAROT CARD: ${tarotCardNames[tarot.index]}` : message;
}
