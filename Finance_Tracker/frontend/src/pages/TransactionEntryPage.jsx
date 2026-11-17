import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from '../api';
import { useCurrency } from "../CurrencyContext";

export default function BudgetPage() {
  const navigate = useNavigate();
  const { currency, toINR } = useCurrency();
  const [choices, setChoices] = useState({
    buckets: [
      { value: "essentials", label: "Essentials" },
      { value: "investment", label: "Investment" },
      { value: "miscellaneous", label: "Miscellaneous" },
    ],
  });
  const [budgetForm, setBudgetForm] = useState({
    bucket: "essentials",
    limit_amount: "",
    month: new Date().toISOString().slice(0, 7), // YYYY-MM
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchChoices = async () => {
      try {
        const res = await api.get('/choices/');
        setChoices(res.data);
      } catch (err) {
        console.error("Failed to load choices:", err);
      }
    };
    fetchChoices();
  }, []);

  const submitBudget = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.post('/budgets/', {
        bucket: budgetForm.bucket,
        limit_amount: toINR(parseFloat(budgetForm.limit_amount)),
        month: `${budgetForm.month}-01`, // Matches Django DateField (first day of month)
      });
      navigate('/');
    } catch (err) {
      const errorData = err.response?.data;
      setError(
        errorData?.detail ||
          (errorData &&
            Object.entries(errorData)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
              .join(" | ")) ||
          err.message ||
          "Request failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard budget-page">
      <header>
        <div>
          <h1>Set Budget</h1>
          <small>Plan a monthly limit for each spending bucket</small>
        </div>
        <div className="header-actions">
          <button type="button" className="logout" onClick={() => navigate('/')}>
            ← Back
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="card budget-card">
        <form onSubmit={submitBudget} className="form-stack">
          <label>
            Category Bucket
            <select
              value={budgetForm.bucket}
              onChange={(e) => setBudgetForm({ ...budgetForm, bucket: e.target.value })}
            >
              {choices.buckets.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <div className="form-row">
            <label>
              Monthly Limit ({currency})
              <input
                type="number"
                step="0.01"
                min="1"
                required
                placeholder="15000.00"
                value={budgetForm.limit_amount}
                onChange={(e) => setBudgetForm({ ...budgetForm, limit_amount: e.target.value })}
              />
            </label>

            <label>
              Month
              <input
                type="month"
                required
                value={budgetForm.month}
                onChange={(e) => setBudgetForm({ ...budgetForm, month: e.target.value })}
              />
            </label>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Set Monthly Budget"}
          </button>
        </form>
      </div>
    </div>
  );
}
