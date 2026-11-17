# tracker/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views
from .views import BudgetViewSet, CategoryViewSet, ExpenseViewSet, IncomeViewSet

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"incomes", IncomeViewSet, basename="income")
router.register(r"budgets", BudgetViewSet, basename="budget")
router.register(r"expenses", ExpenseViewSet, basename="expense")

urlpatterns = [
    path("register/", views.register, name="register"),
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", views.me, name="me"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("analytics/", views.analytics, name="analytics"),
    path("exchange-rate/", views.exchange_rate, name="exchange-rate"),
    path("choices/", views.tracker_choices, name="tracker-choices"),
    path("", include(router.urls)),
    path("auth/change-password/", views.change_password, name="change_password"),
]