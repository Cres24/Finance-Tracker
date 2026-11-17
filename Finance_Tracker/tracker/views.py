# tracker/views.py
import calendar
import json
import urllib.request
from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import (
    BUCKET_COLORS,
    CATEGORY_COLORS,
    PAYMENT_MODE_COLORS,
    Budget,
    Category,
    Expense,
    Income,
)
from .serializers import (
    BudgetSerializer,
    CategorySerializer,
    ExpenseSerializer,
    IncomeSerializer,
    RegisterSerializer,
)

DEFAULT_CATEGORIES = [
    ("Essentials", "essentials", BUCKET_COLORS["essentials"]),
    ("Investment", "investment", BUCKET_COLORS["investment"]),
    ("Miscellaneous", "miscellaneous", BUCKET_COLORS["miscellaneous"]),
]

EXCHANGE_CACHE_KEY = "inr_npr_exchange_rate"
EXCHANGE_CACHE_TTL = 60 * 60 * 12  # 12 hours for live rates
EXCHANGE_FALLBACK_TTL = 60 * 10  # retry sooner when the API is unreachable
NPR_PER_INR_FALLBACK = Decimal("1.60")
EXCHANGE_API_URL = "https://open.er-api.com/v6/latest/INR"


def _fetch_npr_per_inr():
    request = urllib.request.Request(
        EXCHANGE_API_URL, headers={"User-Agent": "FinanceTracker/1.0"}
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        payload = json.load(response)
    rate = payload.get("rates", {}).get("NPR")
    if rate is None:
        raise ValueError("NPR rate missing from exchange rate response")
    return Decimal(str(rate))


@api_view(["GET"])
@permission_classes([AllowAny])
def exchange_rate(request):
    cached = cache.get(EXCHANGE_CACHE_KEY)
    if cached:
        return Response(cached)

    updated_at = timezone.now().isoformat()
    try:
        rate = _fetch_npr_per_inr()
        source = "live"
    except Exception:
        rate = NPR_PER_INR_FALLBACK
        source = "fallback"

    data = {
        "base": "INR",
        "quote": "NPR",
        "rate": float(rate),
        "source": source,
        "updated_at": updated_at,
    }
    cache.set(
        EXCHANGE_CACHE_KEY,
        data,
        EXCHANGE_CACHE_TTL if source == "live" else EXCHANGE_FALLBACK_TTL,
    )
    return Response(data)


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response(
            {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
            },
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    return Response(
        {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tracker_choices(request):
    return Response(
        {
            "buckets": [{"value": k, "label": v} for k, v in Category.BUCKET_CHOICES],
            "recurrence_units": [
                {"value": k, "label": v} for k, v in Expense.RECURRENCE_UNITS
            ],
            "payment_modes": [
                {"value": k, "label": v} for k, v in Expense.PAYMENT_MODES
            ],
            "category_colors": CATEGORY_COLORS,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    user = request.user
    now = timezone.localtime(timezone.now())

    # Optional ?month=YYYY-MM query param (defaults to current month)
    month_param = request.query_params.get("month")
    if month_param:
        try:
            year_str, month_str = month_param.split("-")
            year, month = int(year_str), int(month_str)
        except ValueError:
            return Response(
                {"detail": "Invalid month format. Use YYYY-MM."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        year, month = now.year, now.month

    month_start = now.date().replace(year=year, month=month, day=1)

    # Fetch user records (aggregated in Python for full django-mongodb-backend compatibility)
    incomes = list(
        Income.objects.filter(user=user, date_received__year=year, date_received__month=month)
    )
    expenses = list(
        Expense.objects.select_related("category").filter(
            user=user, spent_at__year=year, spent_at__month=month
        )
    )
    budgets = list(Budget.objects.filter(user=user, month=month_start))

    total_income = sum((item.amount for item in incomes), Decimal("0.00"))
    total_expense = sum((item.amount for item in expenses), Decimal("0.00"))
    net_savings = total_income - total_expense

    # Income breakdown by source
    income_by_source_map = defaultdict(lambda: Decimal("0.00"))
    for inc in incomes:
        income_by_source_map[inc.source] += inc.amount

    # Expense breakdown by category bucket, payment mode & recurrence
    spend_by_bucket = defaultdict(lambda: Decimal("0.00"))
    spend_by_payment_mode = defaultdict(lambda: Decimal("0.00"))
    merchant_totals = defaultdict(lambda: Decimal("0.00"))

    for exp in expenses:
        spend_by_bucket[exp.category.bucket] += exp.amount
        spend_by_payment_mode[exp.payment_mode] += exp.amount
        if exp.merchant:
            merchant_totals[exp.merchant] += exp.amount

    recurring_expenses = [exp for exp in expenses if exp.is_recurring]
    recurring_total = sum((exp.amount for exp in recurring_expenses), Decimal("0.00"))
    one_time_total = total_expense - recurring_total

    # Budget vs. actual per bucket
    budget_map = {b.bucket: b.limit_amount for b in budgets}
    budget_comparison = []
    for bucket_key, bucket_label in Category.BUCKET_CHOICES:
        limit_val = budget_map.get(bucket_key, Decimal("0.00"))
        spent_val = spend_by_bucket.get(bucket_key, Decimal("0.00"))
        budget_comparison.append(
            {
                "bucket": bucket_key,
                "label": bucket_label,
                "budget_limit": float(limit_val),
                "spent": float(spent_val),
                "remaining": float(limit_val - spent_val),
            }
        )

    top_merchants = sorted(
        [{"merchant": m, "total": float(amt)} for m, amt in merchant_totals.items()],
        key=lambda x: x["total"],
        reverse=True,
    )[:5]

    recent_expenses = ExpenseSerializer(
        sorted(expenses, key=lambda e: e.spent_at, reverse=True)[:10],
        many=True,
        context={"request": request},
    ).data

    recurring_expense_list = ExpenseSerializer(
        sorted(recurring_expenses, key=lambda e: e.spent_at, reverse=True)[:10],
        many=True,
        context={"request": request},
    ).data

    return Response(
        {
            "month": f"{year:04d}-{month:02d}",
            "summary": {
                "total_income": float(total_income),
                "total_expense": float(total_expense),
                "net_savings": float(net_savings),
                "recurring_total": float(recurring_total),
                "one_time_total": float(one_time_total),
                "recurring_count": len(recurring_expenses),
            },
            "budget_comparison": budget_comparison,
            "recurring_expenses": recurring_expense_list,
            "income_by_source": [
                {"source": src, "total": float(amt)}
                for src, amt in income_by_source_map.items()
            ],
            "payment_mode_breakdown": [
                {"payment_mode": mode, "total": float(amt)}
                for mode, amt in spend_by_payment_mode.items()
            ],
            "top_merchants": top_merchants,
            "recent_expenses": recent_expenses,
        }
    )


def _shift_month(year, month, delta):
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analytics(request):
    user = request.user
    now = timezone.localtime(timezone.now())

    month_param = request.query_params.get("month")
    if month_param:
        try:
            year_str, month_str = month_param.split("-")
            year, month = int(year_str), int(month_str)
            if not 1 <= month <= 12:
                raise ValueError
        except ValueError:
            return Response(
                {"detail": "Invalid month format. Use YYYY-MM."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        year, month = now.year, now.month

    try:
        trend_months = int(request.query_params.get("trend_months", 6))
    except (TypeError, ValueError):
        trend_months = 6
    trend_months = max(3, min(trend_months, 12))

    month_start = date(year, month, 1)

    # Aggregate in Python for full django-mongodb-backend compatibility
    incomes = list(
        Income.objects.filter(
            user=user, date_received__year=year, date_received__month=month
        )
    )
    expenses = list(
        Expense.objects.select_related("category").filter(
            user=user, spent_at__year=year, spent_at__month=month
        )
    )
    budgets = list(Budget.objects.filter(user=user, month=month_start))

    total_income = sum((item.amount for item in incomes), Decimal("0.00"))
    total_expense = sum((item.amount for item in expenses), Decimal("0.00"))
    net_savings = total_income - total_expense
    savings_rate = (
        float(net_savings / total_income * 100) if total_income else 0.0
    )

    if year == now.year and month == now.month:
        effective_days = max(now.day, 1)
    else:
        effective_days = calendar.monthrange(year, month)[1]
    average_daily_spend = (
        float(total_expense / effective_days) if total_expense else 0.0
    )

    # Category breakdown
    category_totals = defaultdict(lambda: {"total": Decimal("0.00"), "count": 0})
    category_meta = {}
    for exp in expenses:
        key = str(exp.category_id)
        category_totals[key]["total"] += exp.amount
        category_totals[key]["count"] += 1
        category_meta[key] = exp.category

    category_breakdown = []
    for index, (cat_id, agg) in enumerate(
        sorted(category_totals.items(), key=lambda item: item[1]["total"], reverse=True)
    ):
        cat = category_meta.get(cat_id)
        color = (
            cat.color
            if cat and cat.color
            else CATEGORY_COLORS[index % len(CATEGORY_COLORS)]
        )
        category_breakdown.append(
            {
                "category": cat_id,
                "name": cat.name if cat else "Uncategorized",
                "bucket": cat.bucket if cat else "",
                "color": color,
                "total": float(agg["total"]),
                "percentage": (
                    float(agg["total"] / total_expense * 100) if total_expense else 0.0
                ),
                "count": agg["count"],
            }
        )

    # Bucket breakdown
    spend_by_bucket = defaultdict(lambda: Decimal("0.00"))
    spend_by_payment_mode = defaultdict(lambda: Decimal("0.00"))
    merchant_totals = defaultdict(lambda: {"total": Decimal("0.00"), "count": 0})
    for exp in expenses:
        spend_by_bucket[exp.category.bucket] += exp.amount
        spend_by_payment_mode[exp.payment_mode] += exp.amount
        if exp.merchant:
            merchant_totals[exp.merchant]["total"] += exp.amount
            merchant_totals[exp.merchant]["count"] += 1

    bucket_breakdown = [
        {
            "bucket": key,
            "label": label,
            "total": float(spend_by_bucket.get(key, Decimal("0.00"))),
            "percentage": (
                float(spend_by_bucket.get(key, Decimal("0.00")) / total_expense * 100)
                if total_expense
                else 0.0
            ),
            "color": BUCKET_COLORS.get(key, "#6b7280"),
        }
        for key, label in Category.BUCKET_CHOICES
    ]

    payment_mode_breakdown = [
        {
            "payment_mode": key,
            "label": label,
            "total": float(spend_by_payment_mode.get(key, Decimal("0.00"))),
            "percentage": (
                float(spend_by_payment_mode.get(key, Decimal("0.00")) / total_expense * 100)
                if total_expense
                else 0.0
            ),
            "color": PAYMENT_MODE_COLORS.get(key, "#6b7280"),
        }
        for key, label in Expense.PAYMENT_MODES
    ]

    recurring_expenses = [exp for exp in expenses if exp.is_recurring]
    recurring_total = sum(
        (exp.amount for exp in recurring_expenses), Decimal("0.00")
    )

    # Trend across the selected window, ending at the selected month
    trend = []
    for delta in range(-(trend_months - 1), 1):
        t_year, t_month = _shift_month(year, month, delta)
        t_incomes = Income.objects.filter(
            user=user, date_received__year=t_year, date_received__month=t_month
        )
        t_expenses = Expense.objects.filter(
            user=user, spent_at__year=t_year, spent_at__month=t_month
        )
        t_income = sum((item.amount for item in t_incomes), Decimal("0.00"))
        t_expense = sum((item.amount for item in t_expenses), Decimal("0.00"))
        trend.append(
            {
                "month": f"{t_year:04d}-{t_month:02d}",
                "income": float(t_income),
                "expense": float(t_expense),
                "savings": float(t_income - t_expense),
            }
        )

    top_merchants = [
        {
            "merchant": merchant,
            "total": float(value["total"]),
            "count": value["count"],
        }
        for merchant, value in sorted(
            merchant_totals.items(),
            key=lambda item: item[1]["total"],
            reverse=True,
        )[:5]
    ]

    # Budget vs. actual per bucket
    budget_map = {b.bucket: b.limit_amount for b in budgets}
    budget_comparison = []
    for bucket_key, bucket_label in Category.BUCKET_CHOICES:
        limit_val = budget_map.get(bucket_key, Decimal("0.00"))
        spent_val = spend_by_bucket.get(bucket_key, Decimal("0.00"))
        budget_comparison.append(
            {
                "bucket": bucket_key,
                "label": bucket_label,
                "budget_limit": float(limit_val),
                "spent": float(spent_val),
                "remaining": float(limit_val - spent_val),
                "color": BUCKET_COLORS.get(bucket_key, "#6b7280"),
            }
        )

    income_by_source_map = defaultdict(lambda: Decimal("0.00"))
    for inc in incomes:
        income_by_source_map[inc.source] += inc.amount

    largest_expenses = ExpenseSerializer(
        sorted(expenses, key=lambda e: e.amount, reverse=True)[:10],
        many=True,
        context={"request": request},
    ).data

    return Response(
        {
            "month": f"{year:04d}-{month:02d}",
            "trend_months": trend_months,
            "summary": {
                "total_income": float(total_income),
                "total_expense": float(total_expense),
                "net_savings": float(net_savings),
                "savings_rate": round(savings_rate, 2),
                "recurring_total": float(recurring_total),
                "one_time_total": float(total_expense - recurring_total),
                "recurring_count": len(recurring_expenses),
                "transaction_count": len(expenses),
                "average_daily_spend": round(average_daily_spend, 2),
            },
            "category_breakdown": category_breakdown,
            "bucket_breakdown": bucket_breakdown,
            "payment_mode_breakdown": payment_mode_breakdown,
            "recurring": {
                "total": float(recurring_total),
                "one_time_total": float(total_expense - recurring_total),
                "count": len(recurring_expenses),
            },
            "trend": trend,
            "top_merchants": top_merchants,
            "budget_comparison": budget_comparison,
            "largest_expenses": largest_expenses,
            "income_by_source": sorted(
                [
                    {"source": source, "total": float(amount)}
                    for source, amount in income_by_source_map.items()
                ],
                key=lambda item: item["total"],
                reverse=True,
            ),
        }
    )


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Category.objects.filter(user=self.request.user)
        if not qs.exists():
            for name, bucket, color in DEFAULT_CATEGORIES:
                Category.objects.get_or_create(
                    user=self.request.user,
                    name=name,
                    defaults={"bucket": bucket, "color": color},
                )
            qs = Category.objects.filter(user=self.request.user)
        return qs.order_by("bucket", "name")

    def perform_create(self, serializer):
        color = serializer.validated_data.get("color")
        if not color:
            existing_colors = list(
                Category.objects.filter(user=self.request.user).values_list(
                    "color", flat=True
                )
            )
            color = next(
                (c for c in CATEGORY_COLORS if c not in existing_colors),
                CATEGORY_COLORS[len(existing_colors) % len(CATEGORY_COLORS)],
            )
        serializer.save(user=self.request.user, color=color)


class IncomeViewSet(viewsets.ModelViewSet):
    serializer_class = IncomeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Income.objects.filter(user=self.request.user).order_by("-date_received")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class BudgetViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Budget.objects.filter(user=self.request.user).order_by("-month")

    def perform_create(self, serializer):
        bucket = serializer.validated_data["bucket"]
        month = serializer.validated_data["month"]
        limit_amount = serializer.validated_data["limit_amount"]
        budget, _ = Budget.objects.update_or_create(
            user=self.request.user,
            bucket=bucket,
            month=month,
            defaults={"limit_amount": limit_amount},
        )
        serializer.instance = budget


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Expense.objects.select_related("category")
            .filter(user=self.request.user)
            .order_by("-spent_at")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
from .serializers import (
    BudgetSerializer,
    CategorySerializer,
    ChangePasswordSerializer,
    ExpenseSerializer,
    IncomeSerializer,
    RegisterSerializer,
)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    serializer = ChangePasswordSerializer(
        data=request.data, context={"request": request}
    )
    if serializer.is_valid():
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        return Response(
            {"detail": "Password updated successfully."},
            status=status.HTTP_200_OK,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)