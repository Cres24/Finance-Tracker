import { createContext, useContext, useMemo, useState } from 'react'

export const CURRENCIES = {
  INR: { code: 'INR', label: 'INR', locale: 'en-IN' },
  NPR: { code: 'NPR', label: 'NPR', locale: 'en-IN' },
}

const CurrencyContext = createContext(null)
export const useCurrency = () => useContext(CurrencyContext)

const STORAGE_KEY = 'currency'

function readStoredCurrency() {
  const stored = localStorage.getItem(STORAGE_KEY)
  return CURRENCIES[stored] ? stored : 'INR'
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(readStoredCurrency)

  const setCurrency = (next) => {
    if (!CURRENCIES[next]) return
    localStorage.setItem(STORAGE_KEY, next)
    setCurrencyState(next)
  }

  const formatMoney = useMemo(() => {
    const { code, locale } = CURRENCIES[currency]
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    })
    return (amount) => formatter.format(Number(amount) || 0)
  }, [currency])

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatMoney }}>
      {children}
    </CurrencyContext.Provider>
  )
}
