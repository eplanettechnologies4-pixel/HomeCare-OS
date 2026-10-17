from django.db import migrations
from bookings.catalog_data import CATALOG_SEED_DATA


def seed_catalog(apps, schema_editor):
    ServiceCatalogItem = apps.get_model('bookings', 'ServiceCatalogItem')
    for item in CATALOG_SEED_DATA:
        ServiceCatalogItem.objects.update_or_create(
            category=item['category'],
            name=item['name'],
            defaults={
                'caption': item.get('caption', ''),
                'price_min': item.get('price_min'),
                'price_max': item.get('price_max'),
                'price_text': item.get('price_text', ''),
                'sort_order': item.get('sort_order', 0),
                'is_active': True,
            }
        )


def unseed_catalog(apps, schema_editor):
    ServiceCatalogItem = apps.get_model('bookings', 'ServiceCatalogItem')
    for item in CATALOG_SEED_DATA:
        ServiceCatalogItem.objects.filter(category=item['category'], name=item['name']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0005_servicecatalogitem_booking_estimated_price_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_catalog, unseed_catalog),
    ]
