export const CATEGORY_COLORS = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#db2777',
  '#7c3aed',
  '#0891b2',
  '#ea580c',
  '#65a30d',
  '#dc2626',
  '#4f46e5',
  '#0d9488',
  '#9333ea',
]

export function nextCategoryColor(existingColors = []) {
  const used = new Set(existingColors.filter(Boolean))
  return (
    CATEGORY_COLORS.find((color) => !used.has(color)) ||
    CATEGORY_COLORS[used.size % CATEGORY_COLORS.length]
  )
}
