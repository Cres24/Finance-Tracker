import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from './api'

export const CURRENCIES = {
  INR: { code: 'INR', label: 'INR', locale: 'en-IN' },
  NPR: { code: 'NPR', label: 'NPR', locale: 'en-IN' },
}

const CurrencyContext = createContext(null)
export const useCurrency = () => useContext(CurrencyContext)

const STORAGE_KEY = 'currency'
const RATE_STORAGE_KEY = 'inr_npr_rate'
const FALLBACK_NPR_PER_INR = 1.6
const RATE_MAX_AGE_MS = 12 * 60 * 60 * 1000

function readStoredCurrency() {
  const stored = localStorage.getItem(STORAGE_KEY)
  return CURRENCIES[stored] ? stored : 'INR'
}

function readStoredRate() {
  try {
    const raw = localStorage.getItem(RATE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.rate || !parsed?.savedAt) return null
    if (Date.now() - parsed.savedAt > RATE_MAX_AGE_MS) return null
    return Number(parsed.rate)
  } catch {
    return null
  }
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(readStoredCurrency)
  const [nprPerInr, setNprPerInr] = useState(() => readStoredRate() || FALLBACK_NPR_PER_INR)
  const [rateMeta, setRateMeta] = useState({ source: 'fallback', updated_at: null })

  useEffect(() => {
    let ignore = false

    api
      .get('/exchange-rate/')
      .then(({ data }) => {
        if (ignore || !data?.rate) return
        const rate = Number(data.rate) || FALLBACK_NPR_PER_INR
        setNprPerInr(rate)
        setRateMeta({ source: data.source, updated_at: data.updated_at })
        localStorage.setItem(
          RATE_STORAGE_KEY,
          JSON.stringify({ rate, savedAt: Date.now() }),
        )
      })
      .catch(() => {
        // Keep the cached or fallback rate when the endpoint is unavailable.
      })

    return () => {
      ignore = true
    }
  }, [])

  const setCurrency = (next) => {
    if (!CURRENCIES[next]) return
    localStorage.setItem(STORAGE_KEY, next)
    setCurrencyState(next)
  }

  const convert = useCallback(
    (amount, from = 'INR', to = currency) => {
      const value = Number(amount) || 0
      if (from === to) return value
      if (from === 'INR' && to === 'NPR') return value * nprPerInr
      if (from === 'NPR' && to === 'INR') return value / nprPerInr
      return value
    },
    [currency, nprPerInr],
  )

  const toINR = useCallback(
    (amount) => convert(amount, currency, 'INR'),
    [convert, currency],
  )

  const fromINR = useCallback(
    (amount) => convert(amount, 'INR', currency),
    [convert, currency],
  )

  const formatMoney = useMemo(() => {
    const { code, locale } = CURRENCIES[currency]
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    })
    return (amount) => formatter.format(fromINR(amount))
  }, [currency, fromINR])

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        formatMoney,
        convert,
        toINR,
        fromINR,
        nprPerInr,
        rateMeta,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}
