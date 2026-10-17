"""
Data migration: Re-seed catalogue from updated catalog_data.py and deactivate
items that are no longer present in CATALOG_SEED_DATA.
"""
from django.db import migrations


def reseed_catalog(apps, schema_editor):
    ServiceCatalogItem = apps.get_model('bookings', 'ServiceCatalogItem')

    from bookings.catalog_data import CATALOG_SEED_DATA

    # Collect the (category, name) pairs that the new seed contains
    active_keys = set()
    for item in CATALOG_SEED_DATA:
        active_keys.add((item['category'], item['name']))
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

    # Deactivate (never delete) items no longer in the seed data
    for item in ServiceCatalogItem.objects.filter(is_active=True):
        if (item.category, item.name) not in active_keys:
            item.is_active = False
            item.save(update_fields=['is_active'])


def reverse_reseed(apps, schema_editor):
    # Re-activate everything that was deactivated and let the next migration
    # or management command reconcile.  We do NOT delete anything.
    ServiceCatalogItem = apps.get_model('bookings', 'ServiceCatalogItem')
    ServiceCatalogItem.objects.filter(is_active=False).update(is_active=True)


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0006_seed_service_catalog'),
    ]

    operations = [
        migrations.RunPython(reseed_catalog, reverse_reseed),
    ]
