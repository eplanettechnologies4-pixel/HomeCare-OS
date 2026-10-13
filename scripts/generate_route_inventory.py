import os
import sys
import django

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.urls import get_resolver
from rest_framework.schemas.generators import BaseSchemaGenerator
import drf_spectacular.generators

def generate_route_inventory():
    generator = drf_spectacular.generators.SchemaGenerator()
    schema = generator.get_schema(request=None, public=True)
    paths = schema.get('paths', {})

    rows = []
    for path, methods in sorted(paths.items()):
        for method, op in sorted(methods.items()):
            if method.lower() not in ('get', 'post', 'put', 'patch', 'delete'):
                continue
            summary = op.get('summary', '') or op.get('description', '')
            tags = ", ".join(op.get('tags', []))
            # Determine security / auth
            security = op.get('security', [])
            auth_str = "IsAuthenticated" if security else "AllowAny"
            rows.append((method.upper(), path, auth_str, tags or 'General'))

    print(f"Total Routes Discovered: {len(rows)}")
    with open('scripts/route_inventory.md', 'w', encoding='utf-8') as f:
        f.write("# HomeCare OS Backend Route Inventory\n\n")
        f.write("| Method | Path | Permission Class / Auth | Tag / Scope |\n")
        f.write("| :--- | :--- | :--- | :--- |\n")
        for m, p, a, t in rows:
            f.write(f"| `{m}` | `{p}` | {a} | {t} |\n")

    print("Wrote scripts/route_inventory.md")

if __name__ == '__main__':
    generate_route_inventory()
