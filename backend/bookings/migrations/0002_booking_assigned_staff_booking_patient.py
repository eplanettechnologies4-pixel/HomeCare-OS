import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0001_initial"),
        ("patients", "0001_initial"),
        ("staff", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="booking",
            name="assigned_staff",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="bookings",
                to="staff.staffmember",
            ),
        ),
        migrations.AddField(
            model_name="booking",
            name="patient",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="bookings",
                to="patients.patient",
            ),
        ),
    ]
