export function formatQuietBoardLabel(itemCount: number): string {
  return `Board · ${itemCount} ${itemCount === 1 ? "card" : "cards"} updated`;
}
