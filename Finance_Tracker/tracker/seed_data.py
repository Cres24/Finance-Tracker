from django.contrib.auth import get_user_model
from django.utils import timezone
from tracker.models import Category, Expense

User = get_user_model()
user = User.objects.first()  # Grabs your first registered user

# Ensure categories exist
essentials, _ = Category.objects.get_or_create(user=user, name="Groceries", bucket="essentials")
investment, _ = Category.objects.get_or_create(user=user, name="Mutual Fund SIP", bucket="investment")
misc, _ = Category.objects.get_or_create(user=user, name="Dining & Snacks", bucket="miscellaneous")

# Create one expense for each spending habit
Expense.objects.create(
    user=user,
    category=essentials,
    amount=2400.00,
    merchant="BigBasket",
    payment_mode="upi",
    habit_tag="planned",
    spent_at=timezone.now(),
    notes="Weekly household groceries",
)

Expense.objects.create(
    user=user,
    category=investment,
    amount=5000.00,
    merchant="Zerodha Coin",
    payment_mode="netbanking",
    habit_tag="recurring",
    spent_at=timezone.now(),
    notes="Monthly index fund SIP",
)

Expense.objects.create(
    user=user,
    category=misc,
    amount=650.00,
    merchant="Swiggy",
    payment_mode="upi",
    habit_tag="impulse",
    spent_at=timezone.now(),
    notes="Late night dessert order",
)

print("Inserted 3 habit expenses into MongoDB!")
exit()