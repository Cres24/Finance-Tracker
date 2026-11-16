from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Budget, Category, Expense, Income

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
        )


class CategorySerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    bucket_display = serializers.CharField(source="get_bucket_display", read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "bucket", "bucket_display"]


class IncomeSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = Income
        fields = ["id", "source", "amount", "date_received", "is_recurring", "notes"]


class BudgetSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    bucket_display = serializers.CharField(source="get_bucket_display", read_only=True)

    class Meta:
        model = Budget
        fields = ["id", "bucket", "bucket_display", "limit_amount", "month"]


class ExpenseSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_bucket = serializers.CharField(source="category.bucket", read_only=True)
    habit_tag_display = serializers.CharField(source="get_habit_tag_display", read_only=True)
    payment_mode_display = serializers.CharField(source="get_payment_mode_display", read_only=True)

    class Meta:
        model = Expense
        fields = [
            "id",
            "category",
            "category_name",
            "category_bucket",
            "amount",
            "merchant",
            "payment_mode",
            "payment_mode_display",
            "habit_tag",
            "habit_tag_display",
            "spent_at",
            "notes",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and hasattr(request, "user") and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(user=request.user)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Ensure MongoDB ObjectId serializes cleanly as a string
        if data.get("category") is not None:
            data["category"] = str(data["category"])
        return data