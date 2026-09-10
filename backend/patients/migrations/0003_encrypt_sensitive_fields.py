# Generated migration: 0003_encrypt_sensitive_fields.py
#
# This migration:
#   1. Alters the 7 sensitive Patient columns to the Fernet-encrypted field types
#      (patients.encryption.EncryptedTextField — column type becomes TEXT to
#      accommodate the longer ciphertext).
#   2. Runs a RunPython data migration that reads every existing row's plaintext
#      value, re-writes it through the model (triggering encryption), and saves it.
#
# Prerequisites before running:
#   • FIELD_ENCRYPTION_KEY must be set in the environment / .env
#   • Run inside a maintenance window for live databases
#   • Take a full pg_dump backup first
#
# Run: python manage.py migrate patients 0003
#
# NOTE: Originally used django_cryptography.fields.encrypt() — replaced with
# patients.encryption.EncryptedTextField for Django 6 compatibility.

from django.db import migrations
import patients.encryption


def encrypt_existing_rows(apps, schema_editor):
    """
    Forward migration: read existing plaintext values via the Patient model
    (which now has encrypted field descriptors) and save them back.
    The encryption mixin will encrypt transparently on .save().
    """
    # Use the real model so the encrypted field descriptors are active.
    from patients.models import Patient  # noqa: PLC0415

    for patient in Patient.objects.all().iterator(chunk_size=100):
        patient.save(update_fields=[
            'phone',
            'emergency_contact_phone',
            'address',
            'primary_diagnosis',
            'secondary_diagnoses',
            'allergies',
            'blood_type',
        ])


def decrypt_existing_rows(apps, schema_editor):
    """
    Reverse migration: decrypt each row by reading the encrypted value and
    saving it back as plaintext via raw SQL (since the field descriptor will
    be gone after reversing the schema change).

    NOTE: This is best-effort; running the reverse migration after data has
    been re-encrypted will fail if the encryption key has been rotated.
    """
    from patients.models import Patient  # noqa: PLC0415
    from django.db import connection

    for patient in Patient.objects.all().iterator(chunk_size=100):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE patients_patient SET
                    phone                   = %s,
                    emergency_contact_phone = %s,
                    address                 = %s,
                    primary_diagnosis       = %s,
                    secondary_diagnoses     = %s,
                    allergies               = %s,
                    blood_type              = %s
                WHERE id = %s
                """,
                [
                    patient.phone,
                    patient.emergency_contact_phone,
                    patient.address,
                    patient.primary_diagnosis,
                    patient.secondary_diagnoses,
                    patient.allergies,
                    patient.blood_type,
                    patient.pk,
                ]
            )


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0002_initial'),
    ]

    operations = [
        # ── Step 1: Alter column types to encrypted TextField ─────────────────
        migrations.AlterField(
            model_name='patient',
            name='phone',
            field=patients.encryption.EncryptedTextField(blank=True),
        ),
        migrations.AlterField(
            model_name='patient',
            name='emergency_contact_phone',
            field=patients.encryption.EncryptedTextField(blank=True),
        ),
        migrations.AlterField(
            model_name='patient',
            name='address',
            field=patients.encryption.EncryptedTextField(),
        ),
        migrations.AlterField(
            model_name='patient',
            name='primary_diagnosis',
            field=patients.encryption.EncryptedTextField(),
        ),
        migrations.AlterField(
            model_name='patient',
            name='secondary_diagnoses',
            field=patients.encryption.EncryptedTextField(blank=True),
        ),
        migrations.AlterField(
            model_name='patient',
            name='allergies',
            field=patients.encryption.EncryptedTextField(blank=True),
        ),
        migrations.AlterField(
            model_name='patient',
            name='blood_type',
            field=patients.encryption.EncryptedTextField(blank=True),
        ),

        # ── Step 2: Re-encrypt existing rows ──────────────────────────────────
        migrations.RunPython(
            encrypt_existing_rows,
            reverse_code=decrypt_existing_rows,
        ),
    ]
