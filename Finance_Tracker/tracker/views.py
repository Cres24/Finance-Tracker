# tracker/views.py
import json
import urllib.request
from collections import defaultdict
from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Budget, Category, Expense, Income
from .serializers import (
    BudgetSerializer,
    CategorySerializer,
    ExpenseSerializer,
    IncomeSerializer,
    RegisterSerializer,
)

DEFAULT_CATEGORIES = [
    ("Essentials", "essentials"),
    ("Investment", "investment"),
    ("Miscellaneous", "miscellaneous"),
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


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Category.objects.filter(user=self.request.user)
        if not qs.exists():
            for name, bucket in DEFAULT_CATEGORIES:
                Category.objects.get_or_create(
                    user=self.request.user, name=name, defaults={"bucket": bucket}
                )
            qs = Category.objects.filter(user=self.request.user)
        return qs.order_by("bucket", "name")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


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