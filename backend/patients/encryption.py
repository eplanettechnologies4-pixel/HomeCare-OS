"""
Custom field-level Fernet encryption for Django 6+.

Drop-in replacement for django_cryptography.fields.encrypt().
Reads FIELD_ENCRYPTION_KEY from Django settings (set via .env / decouple).

Usage:
    from patients.encryption import encrypt
    phone = encrypt(models.CharField(max_length=20, blank=True))
"""
import base64
from django.conf import settings
from django.db import models
from cryptography.fernet import Fernet, InvalidToken


def _get_fernet():
    key = getattr(settings, 'FIELD_ENCRYPTION_KEY', None)
    if not key:
        raise ValueError("FIELD_ENCRYPTION_KEY is not set in settings.")
    if isinstance(key, str):
        key = key.encode()
    return Fernet(key)


class EncryptedFieldMixin:
    """
    Mixin that transparently encrypts on save and decrypts on load.
    Values are stored as base64-encoded Fernet tokens.
    Encrypted columns are always TextField in the database regardless of
    the original field type.
    """

    def from_db_value(self, value, expression, connection):
        if value is None or value == '':
            return value
        try:
            return _get_fernet().decrypt(value.encode()).decode()
        except (InvalidToken, Exception):
            # Return raw value if decryption fails (e.g. migration with unencrypted data)
            return value

    def get_prep_value(self, value):
        if value is None or value == '':
            return value
        if isinstance(value, str):
            return _get_fernet().encrypt(value.encode()).decode()
        return value

    def get_db_prep_save(self, value, connection):
        return self.get_prep_value(value)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        # Store as TextField in DB
        return name, path, args, kwargs


class EncryptedCharField(EncryptedFieldMixin, models.TextField):
    """Encrypted CharField — stored as TextField in the database."""
    pass


class EncryptedTextField(EncryptedFieldMixin, models.TextField):
    """Encrypted TextField — stored as TextField in the database."""
    pass


def encrypt(field):
    """
    Wrap a CharField or TextField with transparent Fernet encryption.
    Mirrors the django_cryptography.fields.encrypt() API.

    Example:
        phone = encrypt(models.CharField(max_length=20, blank=True))
    """
    # Capture kwargs from the original field
    kwargs = {
        'blank': field.blank,
        'null': field.null,
        'default': field.default if field.has_default() else models.fields.NOT_PROVIDED,
        'verbose_name': field.verbose_name,
        'help_text': field.help_text,
        'db_column': field.db_column,
        'db_index': field.db_index,
    }
    # Remove NOT_PROVIDED so we don't accidentally pass it
    if kwargs['default'] is models.fields.NOT_PROVIDED:
        del kwargs['default']
    if not kwargs['verbose_name']:
        del kwargs['verbose_name']
    if not kwargs['help_text']:
        del kwargs['help_text']
    if kwargs['db_column'] is None:
        del kwargs['db_column']

    return EncryptedTextField(**kwargs)
