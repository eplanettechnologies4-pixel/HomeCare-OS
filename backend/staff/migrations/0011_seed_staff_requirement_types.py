# Generated data migration to seed StaffRequirementType
from django.db import migrations

# PROVISIONAL - needs HR sign-off
REQUIREMENT_TYPES_DATA = [
    # ── TRAINEE GATE (trainee_to_probation) ───────────────────────────────────
    {
        'code': 'id_card_or_bform',
        'label': 'ID card or B-Form',
        'kind': 'document',
        'gate': 'trainee_to_probation',
        'required_count': 1,
        'sort_order': 1,
        'requires_expiry': False,
    },
    {
        'code': 'qualifications',
        'label': 'Qualifications',
        'kind': 'document',
        'gate': 'trainee_to_probation',
        'required_count': 1,
        'sort_order': 2,
        'requires_expiry': False,
    },
    {
        'code': 'diploma_degree',
        'label': 'Diploma/Degree',
        'kind': 'document',
        'gate': 'trainee_to_probation',
        'required_count': 1,
        'sort_order': 3,
        'requires_expiry': False,
    },
    {
        'code': 'passport_photo',
        'label': 'Passport-size photograph',
        'kind': 'document',
        'gate': 'trainee_to_probation',
        'required_count': 1,
        'sort_order': 4,
        'requires_expiry': False,
    },
    {
        'code': 'guardian_id',
        'label': 'Guardian ID',
        'kind': 'document',
        'gate': 'trainee_to_probation',
        'required_count': 2,  # circled '2' on handwritten client sheet; configurable
        'sort_order': 5,
        'requires_expiry': False,
    },
    {
        'code': 'police_verification',
        'label': 'Police verification',
        'kind': 'document',
        'gate': 'trainee_to_probation',
        'required_count': 1,
        'sort_order': 6,
        'requires_expiry': True,
    },
    {
        'code': 'blood_tests',
        'label': 'Blood tests',
        'kind': 'document',
        'gate': 'trainee_to_probation',
        'required_count': 1,
        'sort_order': 7,
        'requires_expiry': True,
    },
    {
        'code': 'contract_employment',
        'label': 'Contract of employment',
        'kind': 'document',
        'gate': 'trainee_to_probation',
        'required_count': 1,
        'sort_order': 8,
        'requires_expiry': True,
    },
    {
        'code': 'experience_letter',
        'label': 'Experience letter',
        'kind': 'document',
        'gate': 'trainee_to_probation',
        'required_count': 1,
        'sort_order': 9,
        'requires_expiry': False,
    },

    # ── PROBATION GATE (probation_to_active) ──────────────────────────────────
    {
        'code': 'training_completion',
        'label': 'Training completion',
        'kind': 'assessment',
        'gate': 'probation_to_active',
        'required_count': 1,
        'sort_order': 10,
        'requires_expiry': False,
    },
    {
        'code': 'exam_clearance',
        'label': 'Exam clearance',
        'kind': 'assessment',
        'gate': 'probation_to_active',
        'required_count': 1,
        'sort_order': 11,
        'requires_expiry': False,
    },
    {
        'code': 'competency_check',
        'label': 'Competency check',  # Client note: "Confidence check" mapped to Competency check constant
        'kind': 'assessment',
        'gate': 'probation_to_active',
        'required_count': 1,
        'sort_order': 12,
        'requires_expiry': False,
    },

    # ── ACTIVE GATE / FEEDBACK (collected during probation) ───────────────────
    {
        'code': 'feedback_management',
        'label': 'Feedback from management',
        'kind': 'feedback',
        'gate': 'probation_to_active',
        'required_count': 1,
        'sort_order': 13,
        'requires_expiry': False,
    },
    {
        'code': 'feedback_family',
        'label': 'Feedback from patient family',
        'kind': 'feedback',
        'gate': 'probation_to_active',
        'required_count': 1,
        'sort_order': 14,
        'requires_expiry': False,
    },
]


def seed_requirement_types(apps, schema_editor):
    StaffRequirementType = apps.get_model('staff', 'StaffRequirementType')
    for item in REQUIREMENT_TYPES_DATA:
        StaffRequirementType.objects.update_or_create(
            code=item['code'],
            defaults={
                'label': item['label'],
                'kind': item['kind'],
                'gate': item['gate'],
                'required_count': item['required_count'],
                'sort_order': item['sort_order'],
                'is_active': True,
                'requires_expiry': item['requires_expiry'],
            }
        )


def unseed_requirement_types(apps, schema_editor):
    StaffRequirementType = apps.get_model('staff', 'StaffRequirementType')
    codes = [item['code'] for item in REQUIREMENT_TYPES_DATA]
    StaffRequirementType.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('staff', '0010_staffrequirementtype_staffmember_active_since_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_requirement_types, unseed_requirement_types),
    ]

