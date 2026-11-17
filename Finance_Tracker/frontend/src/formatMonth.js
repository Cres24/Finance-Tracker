// Formats a backend "YYYY-MM" string for display.
export function monthLabel(value, long = false) {
  if (!value) return ''
  const [year, month] = value.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  // Recharts passes extra args (index, payload) to formatters, so only an
  // explicit boolean should switch to the long form.
  const useLong = long === true
  return date.toLocaleDateString(undefined, {
    month: useLong ? 'long' : 'short',
    year: useLong ? 'numeric' : '2-digit',
  })
}

export const longMonthLabel = (value) => monthLabel(value, true)
