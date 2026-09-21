from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('patients', '0004_alter_reportphoto_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='patient',
            name='portal_user',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='patient_profile',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Portal Login User',
            ),
        ),
    ]
