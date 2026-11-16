import { useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:8000/api";

export default function TransactionEntryPage({ onTransactionAdded }) {
  const [activeTab, setActiveTab] = useState("expense"); // "expense" | "income" | "budget" | "category"
  const [categories, setCategories] = useState([]);
  const [choices, setChoices] = useState({
    buckets: [
      { value: "essentials", label: "Essentials" },
      { value: "investment", label: "Investment" },
      { value: "miscellaneous", label: "Miscellaneous" },
    ],
    habit_tags: [
      { value: "planned", label: "Planned" },
      { value: "recurring", label: "Recurring / Subscription" },
      { value: "impulse", label: "Impulse / Unplanned" },
    ],
    payment_modes: [
      { value: "upi", label: "UPI" },
      { value: "card", label: "Card" },
      { value: "cash", label: "Cash" },
      { value: "netbanking", label: "Net Banking" },
    ],
  });

  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

  // Expense form state
  const [expenseForm, setExpenseForm] = useState({
    category: "",
    amount: "",
    merchant: "",
    payment_mode: "upi",
    habit_tag: "planned",
    spent_at: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
    notes: "",
  });

  // Income form state
  const [incomeForm, setIncomeForm] = useState({
    source: "",
    amount: "",
    date_received: new Date().toISOString().slice(0, 10),
    is_recurring: false,
    notes: "",
  });

  // Budget form state
  const [budgetForm, setBudgetForm] = useState({
    bucket: "essentials",
    limit_amount: "",
    month: new Date().toISOString().slice(0, 7), // YYYY-MM (converted to YYYY-MM-01 on submit)
  });

  // New Category form state
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    bucket: "essentials",
  });

  const getAuthHeaders = () => {
    const token = localStorage.getItem("access");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  // Load user's categories and backend dropdown choices on mount
  const fetchInitialData = async () => {
    try {
      const [catRes, choicesRes] = await Promise.all([
        fetch(`${API_BASE}/categories/`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/choices/`, { headers: getAuthHeaders() }),
      ]);

      if (catRes.ok) {
        const catData = await catRes.json();
        const list = Array.isArray(catData) ? catData : catData.results || [];
        setCategories(list);
        if (list.length > 0 && !expenseForm.category) {
          setExpenseForm((prev) => ({ ...prev, category: String(list[0].id) }));
        }
      }

      if (choicesRes.ok) {
        const choicesData = await choicesRes.json();
        setChoices(choicesData);
      }
    } catch (err) {
      console.error("Failed to load categories/choices:", err);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleApiSubmit = async (endpoint, payload, onSuccessReset) => {
    setLoading(true);
    setStatus({ type: "", message: "" });

    try {
      const response = await fetch(`${API_BASE}/${endpoint}/`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorDetail =
          data.detail ||
          Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join(" | ") ||
          "Request failed";
        throw new Error(errorDetail);
      }

      setStatus({ type: "success", message: "Saved successfully to MongoDB!" });
      onSuccessReset(data);
      if (onTransactionAdded) onTransactionAdded(data);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const submitExpense = (e) => {
    e.preventDefault();
    handleApiSubmit(
      "expenses",
      {
        ...expenseForm,
        amount: parseFloat(expenseForm.amount),
        spent_at: new Date(expenseForm.spent_at).toISOString(),
      },
      () =>
        setExpenseForm((prev) => ({
          ...prev,
          amount: "",
          merchant: "",
          notes: "",
        }))
    );
  };

  const submitIncome = (e) => {
    e.preventDefault();
    handleApiSubmit(
      "incomes",
      {
        ...incomeForm,
        amount: parseFloat(incomeForm.amount),
      },
      () =>
        setIncomeForm((prev) => ({
          ...prev,
          source: "",
          amount: "",
          is_recurring: false,
          notes: "",
        }))
    );
  };

  const submitBudget = (e) => {
    e.preventDefault();
    handleApiSubmit(
      "budgets",
      {
        bucket: budgetForm.bucket,
        limit_amount: parseFloat(budgetForm.limit_amount),
        month: `${budgetForm.month}-01`, // Matches Django DateField (first day of month)
      },
      () =>
        setBudgetForm((prev) => ({
          ...prev,
          limit_amount: "",
        }))
    );
  };

  const submitCategory = (e) => {
    e.preventDefault();
    handleApiSubmit("categories", categoryForm, (newCat) => {
      setCategories((prev) => [...prev, newCat]);
      setExpenseForm((prev) => ({ ...prev, category: String(newCat.id) }));
      setCategoryForm({ name: "", bucket: "essentials" });
    });
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Record Financial Activity</h2>

      {/* Tab Switcher */}
      <div style={styles.tabRow}>
        {[
          { id: "expense", label: "Log Expense" },
          { id: "income", label: "Add Income" },
          { id: "budget", label: "Set Budget" },
          { id: "category", label: "+ Category" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setStatus({ type: "", message: "" });
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === tab.id ? styles.tabBtnActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feedback Banner */}
      {status.message && (
        <div
          style={{
            ...styles.banner,
            backgroundColor: status.type === "success" ? "#dcfce7" : "#fee2e2",
            color: status.type === "success" ? "#166534" : "#991b1b",
          }}
        >
          {status.message}
        </div>
      )}

      {/* 1. EXPENSE FORM */}
      {activeTab === "expense" && (
        <form onSubmit={submitExpense} style={styles.form}>
          <label style={styles.label}>
            Category
            <select
              required
              value={expenseForm.category}
              onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
              style={styles.input}
            >
              <option value="" disabled>
                {categories.length === 0 ? "Create a category first (+ Category tab)" : "Select category"}
              </option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.bucket})
                </option>
              ))}
            </select>
          </label>

          <div style={styles.row}>
            <label style={styles.label}>
              Amount (₹)
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              Spending Habit
              <select
                value={expenseForm.habit_tag}
                onChange={(e) => setExpenseForm({ ...expenseForm, habit_tag: e.target.value })}
                style={styles.input}
              >
                {choices.habit_tags.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={styles.row}>
            <label style={styles.label}>
              Payment Mode
              <select
                value={expenseForm.payment_mode}
                onChange={(e) => setExpenseForm({ ...expenseForm, payment_mode: e.target.value })}
                style={styles.input}
              >
                {choices.payment_modes.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Merchant / Vendor
              <input
                type="text"
                placeholder="e.g., BigBasket, Swiggy, Zerodha"
                value={expenseForm.merchant}
                onChange={(e) => setExpenseForm({ ...expenseForm, merchant: e.target.value })}
                style={styles.input}
              />
            </label>
          </div>

          <label style={styles.label}>
            Date & Time
            <input
              type="datetime-local"
              required
              value={expenseForm.spent_at}
              onChange={(e) => setExpenseForm({ ...expenseForm, spent_at: e.target.value })}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Notes
            <textarea
              rows="2"
              placeholder="Optional description..."
              value={expenseForm.notes}
              onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
              style={styles.input}
            />
          </label>

          <button type="submit" disabled={loading || categories.length === 0} style={styles.submitBtn}>
            {loading ? "Saving..." : "Save Expense"}
          </button>
        </form>
      )}

      {/* 2. INCOME FORM */}
      {activeTab === "income" && (
        <form onSubmit={submitIncome} style={styles.form}>
          <label style={styles.label}>
            Income Source
            <input
              type="text"
              required
              placeholder="e.g., Salary, Freelance, Dividends"
              value={incomeForm.source}
              onChange={(e) => setIncomeForm({ ...incomeForm, source: e.target.value })}
              style={styles.input}
            />
          </label>

          <div style={styles.row}>
            <label style={styles.label}>
              Amount (₹)
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={incomeForm.amount}
                onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              Date Received
              <input
                type="date"
                required
                value={incomeForm.date_received}
                onChange={(e) => setIncomeForm({ ...incomeForm, date_received: e.target.value })}
                style={styles.input}
              />
            </label>
          </div>

          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={incomeForm.is_recurring}
              onChange={(e) => setIncomeForm({ ...incomeForm, is_recurring: e.target.checked })}
            />
            Recurring monthly income
          </label>

          <label style={styles.label}>
            Notes
            <textarea
              rows="2"
              placeholder="Optional notes..."
              value={incomeForm.notes}
              onChange={(e) => setIncomeForm({ ...incomeForm, notes: e.target.value })}
              style={styles.input}
            />
          </label>

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? "Saving..." : "Save Income"}
          </button>
        </form>
      )}

      {/* 3. BUDGET FORM */}
      {activeTab === "budget" && (
        <form onSubmit={submitBudget} style={styles.form}>
          <label style={styles.label}>
            Category Bucket
            <select
              value={budgetForm.bucket}
              onChange={(e) => setBudgetForm({ ...budgetForm, bucket: e.target.value })}
              style={styles.input}
            >
              {choices.buckets.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <div style={styles.row}>
            <label style={styles.label}>
              Monthly Limit (₹)
              <input
                type="number"
                step="0.01"
                min="1"
                required
                placeholder="15000.00"
                value={budgetForm.limit_amount}
                onChange={(e) => setBudgetForm({ ...budgetForm, limit_amount: e.target.value })}
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              Month
              <input
                type="month"
                required
                value={budgetForm.month}
                onChange={(e) => setBudgetForm({ ...budgetForm, month: e.target.value })}
                style={styles.input}
              />
            </label>
          </div>

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? "Saving..." : "Set Monthly Budget"}
          </button>
        </form>
      )}

      {/* 4. NEW CATEGORY FORM */}
      {activeTab === "category" && (
        <form onSubmit={submitCategory} style={styles.form}>
          <label style={styles.label}>
            Category Name
            <input
              type="text"
              required
              placeholder="e.g., Rent, Mutual Fund SIP, Movies"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Bucket Type
            <select
              value={categoryForm.bucket}
              onChange={(e) => setCategoryForm({ ...categoryForm, bucket: e.target.value })}
              style={styles.input}
            >
              {choices.buckets.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? "Saving..." : "Create Category"}
          </button>
        </form>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "560px",
    margin: "2rem auto",
    padding: "1.75rem",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  heading: {
    margin: "0 0 1.25rem",
    fontSize: "1.4rem",
    color: "#0f172a",
  },
  tabRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "1.25rem",
    borderBottom: "1px solid #e2e8f0",
    paddingBottom: "0.75rem",
    flexWrap: "wrap",
  },
  tabBtn: {
    padding: "0.5rem 0.9rem",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    backgroundColor: "#f8fafc",
    color: "#334155",
    cursor: "pointer",
    fontWeight: 500,
  },
  tabBtnActive: {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    borderColor: "#2563eb",
  },
  banner: {
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    marginBottom: "1rem",
    fontSize: "0.9rem",
    fontWeight: 500,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.85rem",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    fontSize: "0.88rem",
    fontWeight: 600,
    color: "#334155",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.9rem",
    color: "#334155",
    cursor: "pointer",
  },
  input: {
    padding: "0.6rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "0.95rem",
    outline: "none",
  },
  submitBtn: {
    marginTop: "0.5rem",
    padding: "0.75rem",
    border: "none",
    borderRadius: "8px",
    backgroundColor: "#16a34a",
    color: "#ffffff",
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
  },
};