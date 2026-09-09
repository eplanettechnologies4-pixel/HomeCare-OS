"""
WSGI config for HomeCare OS project.
"""
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
application = get_wsgi_application()
