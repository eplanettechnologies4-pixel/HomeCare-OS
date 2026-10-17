from django.core.management.base import BaseCommand
from bookings.models import ServiceCatalogItem
from bookings.catalog_data import CATALOG_SEED_DATA


class Command(BaseCommand):
    help = 'Seeds or updates the Service Catalog items according to the HomeCare OS pricing list.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Delete existing catalog items before seeding',
        )

    def handle(self, *args, **options):
        if options['clear']:
            deleted, _ = ServiceCatalogItem.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared {deleted} existing ServiceCatalogItem records."))

        created_count = 0
        updated_count = 0

        active_keys = set()
        for item in CATALOG_SEED_DATA:
            active_keys.add((item['category'], item['name']))
            obj, created = ServiceCatalogItem.objects.update_or_create(
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
            if created:
                created_count += 1
            else:
                updated_count += 1

        deactivated_count = 0
        for item in ServiceCatalogItem.objects.filter(is_active=True):
            if (item.category, item.name) not in active_keys:
                item.is_active = False
                item.save(update_fields=['is_active'])
                deactivated_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"Successfully seeded service catalog: {created_count} created, {updated_count} updated, {deactivated_count} deactivated. "
            f"Total active items: {ServiceCatalogItem.objects.filter(is_active=True).count()}."
        ))
