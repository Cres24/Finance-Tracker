from collections import defaultdict
from datetime import date, datetime, time
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Budget, Category, Expense, Income


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "email", "password"]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response({"detail": "Account created"}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response({"username": request.user.username, "email": request.user.email})


def _month_bounds(today):
    start = today.replace(day=1)
    if start.month == 12:
        end = date(start.year + 1, 1, 1)
    else:
        end = date(start.year, start.month + 1, 1)
    return start, end


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    user = request.user
    today = timezone.localdate()
    start, end = _month_bounds(today)
    start_dt = timezone.make_aware(datetime.combine(start, time.min))
    end_dt = timezone.make_aware(datetime.combine(end, time.min))

    incomes = list(
        Income.objects.filter(
            user=user, date_received__gte=start, date_received__lt=end
        )
    )
    expenses = list(
        Expense.objects.filter(
            user=user, spent_at__gte=start_dt, spent_at__lt=end_dt
        ).order_by("-spent_at")
    )
    categories = {c.pk: c for c in Category.objects.filter(user=user)}
    budgets_qs = Budget.objects.filter(user=user, month__gte=start, month__lt=end)
    budgets = {b.bucket: b.limit_amount for b in budgets_qs}

    total_income = sum((i.amount for i in incomes), Decimal("0"))
    total_expenses = sum((e.amount for e in expenses), Decimal("0"))

    spent_by_bucket = defaultdict(lambda: Decimal("0"))
    spent_by_habit = defaultdict(lambda: Decimal("0"))
    for e in expenses:
        cat = categories.get(e.category_id)
        if cat:
            spent_by_bucket[cat.bucket] += e.amount
        spent_by_habit[e.habit_tag] += e.amount

    buckets = [
        {
            "bucket": key,
            "label": label,
            "spent": float(spent_by_bucket[key]),
            "limit": float(budgets[key]) if key in budgets else None,
        }
        for key, label in Category.BUCKET_CHOICES
    ]
    habits = [
        {"tag": key, "label": label, "spent": float(spent_by_habit[key])}
        for key, label in Expense.HABIT_TAGS
    ]
    recent = [
        {
            "id": str(e.pk),
            "description": e.merchant
            or (categories[e.category_id].name if e.category_id in categories else "Expense"),
            "category": categories[e.category_id].name if e.category_id in categories else "",
            "amount": float(e.amount),
            "date": timezone.localtime(e.spent_at).strftime("%d %b"),
            "payment_mode": e.get_payment_mode_display(),
        }
        for e in expenses[:8]
    ]

    return Response(
        {
            "month": start.strftime("%B %Y"),
            "income": float(total_income),
            "expenses": float(total_expenses),
            "balance": float(total_income - total_expenses),
            "buckets": buckets,
            "habits": habits,
            "recent": recent,
        }
    )

