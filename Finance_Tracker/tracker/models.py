# tracker/models.py
from django.conf import settings
from django.db import models


class Category(models.Model):
    BUCKET_CHOICES = [
        ("essentials", "Essentials"),
        ("investment", "Investment"),
        ("miscellaneous", "Miscellaneous"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)  # e.g., "Groceries", "SIP", "Dining Out"
    bucket = models.CharField(max_length=20, choices=BUCKET_CHOICES)

    class Meta:
        unique_together = ("user", "name", "bucket")

    def __str__(self):
        return f"{self.name} ({self.get_bucket_display()})"


class Income(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    source = models.CharField(max_length=100)  # e.g., "Salary", "Freelance", "Dividends"
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date_received = models.DateField()
    is_recurring = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.source} - {self.amount}"


class Budget(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    bucket = models.CharField(max_length=20, choices=Category.BUCKET_CHOICES)
    limit_amount = models.DecimalField(max_digits=12, decimal_places=2)
    month = models.DateField(help_text="First day of the budget month, e.g., 2026-11-01")

    class Meta:
        unique_together = ("user", "bucket", "month")

    def __str__(self):
        return f"{self.get_bucket_display()} Budget ({self.month:%Y-%m}): {self.limit_amount}"


class Expense(models.Model):
    PAYMENT_MODES = [
        ("cash", "Cash"),
        ("card", "Card"),
        ("netbanking", "Net Banking"),
        ("online", "Online Payment"),
    ]
    RECURRENCE_UNITS = [
        ("day", "Day"),
        ("month", "Month"),
        ("year", "Year"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="expenses")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    merchant = models.CharField(max_length=120, blank=True)  # Helps spot frequent vendors
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODES, default="online")
    is_recurring = models.BooleanField(default=False)
    recurrence_interval = models.PositiveSmallIntegerField(default=1)
    recurrence_unit = models.CharField(
        max_length=10, choices=RECURRENCE_UNITS, default="month"
    )
    spent_at = models.DateTimeField()
    notes = models.TextField(blank=True)

    @property
    def recurrence_summary(self):
        if not self.is_recurring:
            return ""
        interval = self.recurrence_interval or 1
        unit = self.recurrence_unit or "month"
        unit_label = dict(self.RECURRENCE_UNITS).get(unit, unit).lower()
        if interval != 1:
            unit_label = f"{unit_label}s"
        return f"Every {interval} {unit_label}"

    def __str__(self):
        return f"{self.category.name}: {self.amount} on {self.spent_at:%Y-%m-%d}"