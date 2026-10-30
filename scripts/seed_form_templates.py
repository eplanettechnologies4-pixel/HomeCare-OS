import os
import sys
import django

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.contrib.auth.models import User
from forms_builder.models import FormTemplate, FormField

def seed_templates():
    admin = User.objects.filter(is_superuser=True).first() or User.objects.first()

    default_paper_config = {
        'logo_url': '/ehealth-logo.png',
        'org_name': 'eHealth Hospital At Home',
        'tagline': 'Digital Hospital & Home Clinical Care Network',
        'address': 'Plot 14-B, Medical Enclave, Sector G-8, Islamabad, Pakistan',
        'phone': '+92 (51) 111-343-258',
        'email': 'clinical@homecareos.com',
        'website': 'www.ehealth.com.pk',
        'registration_info': 'SECP Reg # 0192834 | IHRA Licensed Healthcare Provider # IHRA-2024-089',
        'header_style': 'modern',
        'primary_color': '#5B1A4A',
        'accent_color': '#D4A94A',
        'show_patient_box': True,
        'show_signature_block': True,
        'show_stamp_seal': True,
        'watermark_text': 'OFFICIAL CLINICAL RECORD',
        'footer_note': 'CONFIDENTIAL CLINICAL DOCUMENT — Protected Health Information under EHR Regulations. eHealth Hospital At Home.',
    }

    templates_data = [
        {
            'title': 'Clinical Intake & Comprehensive Medical History',
            'description': 'Mandatory onboarding clinical evaluation for hospital-at-home admission and nursing supervision.',
            'audience': 'patient',
            'paper_config': {
                **default_paper_config,
                'form_code': 'FORM-INTAKE-2026-V1',
            },
            'fields': [
                {'label': 'Chief Complaint / Primary Concern', 'key': 'chief_complaint', 'type': 'textarea', 'width': '12', 'required': True, 'help_text': 'Describe current symptoms and reason for homecare admission'},
                {'label': 'Symptom Onset Date', 'key': 'onset_date', 'type': 'date', 'width': '6', 'required': True},
                {'label': 'Severity / Pain Level (1 to 5)', 'key': 'pain_level', 'type': 'rating', 'width': '6', 'required': True},
                {'label': 'Known Drug Allergies', 'key': 'allergies', 'type': 'text', 'width': '6', 'required': True, 'help_text': 'e.g. Penicillin, Sulfa, None'},
                {'label': 'Blood Group', 'key': 'blood_group', 'type': 'select', 'width': '6', 'options': ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'], 'required': False},
                {'label': 'Chronic Conditions', 'key': 'chronic_conditions', 'type': 'checkbox', 'width': '12', 'options': ['Hypertension', 'Type 2 Diabetes', 'COPD / Asthma', 'Chronic Kidney Disease', 'Heart Failure', 'None']},
                {'label': 'Current Daily Medications & Dosages', 'key': 'current_meds', 'type': 'textarea', 'width': '12', 'required': False, 'help_text': 'List prescription medications currently active'},
                {'label': 'Mobility & Fall Risk Assessment', 'key': 'fall_risk', 'type': 'radio', 'width': '6', 'options': ['Independent', 'Assistance Required', 'Bedridden / High Risk'], 'required': True},
                {'label': 'Emergency Contact Person & Phone', 'key': 'emergency_contact', 'type': 'text', 'width': '6', 'required': True},
                {'label': 'Patient / Guardian Digital Signature', 'key': 'patient_signature', 'type': 'signature', 'width': '12', 'required': True},
            ]
        },
        {
            'title': 'Home Nursing Daily Visit & Vitals Evaluation',
            'description': 'Daily bedside clinical verification, medication administration check, and nursing progress report.',
            'audience': 'staff',
            'paper_config': {
                **default_paper_config,
                'form_code': 'FORM-NURSE-DAILY-2026',
                'header_style': 'classic',
            },
            'fields': [
                {'label': 'Visit Date & Shift', 'key': 'visit_shift', 'type': 'select', 'width': '6', 'options': ['Morning Shift (08:00 - 16:00)', 'Evening Shift (16:00 - 00:00)', 'Night Shift (00:00 - 08:00)'], 'required': True},
                {'label': 'Blood Pressure (mmHg)', 'key': 'blood_pressure', 'type': 'text', 'width': '6', 'required': True, 'help_text': 'Systolic / Diastolic e.g. 120/80'},
                {'label': 'Pulse / Heart Rate (BPM)', 'key': 'heart_rate', 'type': 'number', 'width': '4', 'required': True},
                {'label': 'Oxygen Saturation SpO2 (%)', 'key': 'spo2', 'type': 'number', 'width': '4', 'required': True},
                {'label': 'Body Temperature (°F)', 'key': 'temp_f', 'type': 'number', 'width': '4', 'required': True},
                {'label': 'Blood Glucose (mg/dL)', 'key': 'blood_sugar', 'type': 'number', 'width': '6', 'required': False},
                {'label': 'IV Infusion / Wound Dressing Performed', 'key': 'procedures_done', 'type': 'checkbox', 'width': '6', 'options': ['IV Cannulation', 'Wound Debridement & Dressing', 'Catheter Care', 'Nebulization', 'None']},
                {'label': 'Clinical Observations & Care Plan Notes', 'key': 'nurse_notes', 'type': 'textarea', 'width': '12', 'required': True},
                {'label': 'Attending Registered Nurse Signature', 'key': 'nurse_signature', 'type': 'signature', 'width': '12', 'required': True},
            ]
        },
        {
            'title': 'Informed Patient Consent & PHI Release Authorization',
            'description': 'Official legal consent for home-based medical care, telehealth telemetry, and medical data governance.',
            'audience': 'family',
            'paper_config': {
                **default_paper_config,
                'form_code': 'FORM-LEGAL-CONSENT-03',
                'header_style': 'modern',
            },
            'fields': [
                {'label': 'Patient Full Name', 'key': 'patient_legal_name', 'type': 'text', 'width': '6', 'required': True},
                {'label': 'National ID / CNIC Number', 'key': 'cnic_number', 'type': 'text', 'width': '6', 'required': True},
                {'label': 'Relationship to Patient', 'key': 'relationship', 'type': 'select', 'width': '6', 'options': ['Self', 'Spouse', 'Child / Next of Kin', 'Legal Guardian'], 'required': True},
                {'label': 'Consent to Home Clinical Monitoring', 'key': 'consent_telemetry', 'type': 'radio', 'width': '6', 'options': ['I Agree & Authorize', 'I Decline'], 'required': True},
                {'label': 'Consent to Electronic Medical Record Sharing with Consulting Physicians', 'key': 'consent_ehr', 'type': 'radio', 'width': '12', 'options': ['Authorized Full Access', 'Limited to Primary Clinician'], 'required': True},
                {'label': 'Special Requests / Care Directives', 'key': 'directives', 'type': 'textarea', 'width': '12', 'required': False},
                {'label': 'Signature of Patient or Authorized Representative', 'key': 'legal_signature', 'type': 'signature', 'width': '12', 'required': True},
            ]
        }
    ]

    for data in templates_data:
        fields = data.pop('fields')
        tmpl, created = FormTemplate.objects.get_or_create(
            title=data['title'],
            defaults={**data, 'created_by': admin}
        )
        if created or tmpl.fields.count() == 0:
            tmpl.paper_config = data.get('paper_config', default_paper_config)
            tmpl.save()
            for idx, f in enumerate(fields):
                FormField.objects.create(
                    template=tmpl,
                    label=f['label'],
                    key=f['key'],
                    type=f['type'],
                    required=f.get('required', False),
                    options=f.get('options', []),
                    width=f.get('width', '12'),
                    help_text=f.get('help_text', ''),
                    order=idx,
                )
            print(f"Created template: {tmpl.title} with {len(fields)} fields")
        else:
            print(f"Template already exists: {tmpl.title}")

if __name__ == '__main__':
    seed_templates()
