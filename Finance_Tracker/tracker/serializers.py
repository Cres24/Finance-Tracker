from rest_framework import serializers
from .models import Category, Income, Expense


class CategorySerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "bucket"]


class IncomeSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = Income
        fields = ["id", "source", "amount", "date_received", "is_recurring", "notes"]


class ExpenseSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    category = serializers.CharField()  # Accepts MongoDB ObjectId string from React

    class Meta:
        model = Expense
        fields = [
            "id",
            "category",
            "amount",
            "merchant",
            "payment_mode",
            "habit_tag",
            "spent_at",
            "notes",
        ]

    def validate_category(self, value):
        user = self.context["request"].user
        try:
            return Category.objects.get(id=value, user=user)
        except Category.DoesNotExist:
            raise serializers.ValidationError("Invalid category selected.")