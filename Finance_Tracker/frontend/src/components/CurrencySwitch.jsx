import { CURRENCIES, useCurrency } from '../CurrencyContext'

export default function CurrencySwitch() {
  const { currency, setCurrency } = useCurrency()
  const codes = Object.keys(CURRENCIES)
  const activeIndex = Math.max(0, codes.indexOf(currency))

  return (
    <div
      className="currency-switch"
      role="group"
      aria-label="Display currency"
      style={{ '--active-index': activeIndex, '--count': codes.length }}
    >
      {codes.map((code) => (
        <button
          key={code}
          type="button"
          className={currency === code ? 'active' : ''}
          aria-pressed={currency === code}
          onClick={() => setCurrency(code)}
        >
          {CURRENCIES[code].label}
        </button>
      ))}
    </div>
  )
}
