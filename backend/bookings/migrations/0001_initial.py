import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Booking",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "service_type",
                    models.CharField(
                        choices=[
                            ("short_service", "Short Service"),
                            ("medicine_delivery", "Medicine Delivery"),
                            ("long_term", "Long-Term Care"),
                            ("long_term_admission", "Long-Term Admission"),
                        ],
                        max_length=30,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("assigned", "Assigned"),
                            ("en_route", "En Route"),
                            ("in_progress", "In Progress"),
                            ("completed", "Completed"),
                            ("cancelled", "Cancelled"),
                            ("late", "Late"),
                            ("no_show", "No Show"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                (
                    "payment_status",
                    models.CharField(
                        choices=[
                            ("advance", "Advance Paid"),
                            ("pending", "Payment Pending"),
                            ("partial", "Partial Payment"),
                            ("waived", "Waived"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("scheduled_time", models.DateTimeField()),
                ("actual_start_time", models.DateTimeField(blank=True, null=True)),
                ("actual_end_time", models.DateTimeField(blank=True, null=True)),
                ("address", models.TextField()),
                (
                    "latitude",
                    models.DecimalField(
                        blank=True, decimal_places=6, max_digits=9, null=True
                    ),
                ),
                (
                    "longitude",
                    models.DecimalField(
                        blank=True, decimal_places=6, max_digits=9, null=True
                    ),
                ),
                ("notes", models.TextField(blank=True)),
                (
                    "prescription_attachment",
                    models.FileField(blank=True, null=True, upload_to="prescriptions/"),
                ),
                (
                    "amount",
                    models.DecimalField(decimal_places=2, default=0, max_digits=10),
                ),
                (
                    "amount_paid",
                    models.DecimalField(decimal_places=2, default=0, max_digits=10),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-scheduled_time"],
            },
        ),
    ]
