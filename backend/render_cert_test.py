import os, sys, io
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import qrcode
import pypdfium2 as pdfium

PAGE_WIDTH, PAGE_HEIGHT = landscape(A4)

PURPLE_DARK = colors.HexColor('#441337')
PURPLE_MAIN = colors.HexColor('#5B1A4A')
PURPLE_MID  = colors.HexColor('#7A2359')
GOLD_ACCENT = colors.HexColor('#D4A94A')
GRAY_LIGHT  = colors.HexColor('#E5E7EB')
TEXT_DARK   = colors.HexColor('#1F2937')
TEXT_MUTED  = colors.HexColor('#6B7280')

def draw_seal(canvas, x, y, r, title, subtitle):
    canvas.saveState()
    canvas.setStrokeColor(GOLD_ACCENT)
    canvas.setLineWidth(1.6)
    canvas.setFillColor(colors.HexColor('#FCFBF9'))
    canvas.circle(x, y, r, fill=True, stroke=True)
    canvas.setLineWidth(0.7)
    canvas.circle(x, y, r - 3, fill=False, stroke=True)
    canvas.setFillColor(PURPLE_MID)
    canvas.setFont('Helvetica-Bold', 4.5)
    canvas.drawCentredString(x, y + 8, subtitle)
    canvas.setFont('Helvetica-Bold', 8.5)
    canvas.setFillColor(PURPLE_MAIN)
    canvas.drawCentredString(x, y - 2, title)
    canvas.setFont('Helvetica', 5)
    canvas.setFillColor(GOLD_ACCENT)
    canvas.drawCentredString(x, y - 11, "★ REGD. OFFICIAL ★")
    canvas.restoreState()

def draw_background(canvas, doc):
    canvas.saveState()
    w, h = doc.pagesize

    canvas.setFillColor(colors.white)
    canvas.rect(0, 0, w, h, fill=True, stroke=False)

    # Top-Left Corner Geometric Triangles
    canvas.setFillColor(GRAY_LIGHT)
    p1 = canvas.beginPath()
    p1.moveTo(0, h)
    p1.lineTo(240, h)
    p1.lineTo(0, h - 175)
    p1.close()
    canvas.drawPath(p1, fill=True, stroke=False)

    canvas.setFillColor(PURPLE_MAIN)
    p2 = canvas.beginPath()
    p2.moveTo(0, h)
    p2.lineTo(210, h)
    p2.lineTo(0, h - 150)
    p2.close()
    canvas.drawPath(p2, fill=True, stroke=False)

    canvas.setFillColor(PURPLE_DARK)
    p3 = canvas.beginPath()
    p3.moveTo(0, h)
    p3.lineTo(115, h)
    p3.lineTo(0, h - 85)
    p3.close()
    canvas.drawPath(p3, fill=True, stroke=False)

    canvas.setStrokeColor(GOLD_ACCENT)
    canvas.setLineWidth(2.5)
    canvas.line(0, h - 158, 222, h)
    canvas.setLineWidth(1)
    canvas.line(0, h - 165, 232, h)

    # Bottom-Right Corner Geometric Triangles
    canvas.setFillColor(GRAY_LIGHT)
    p4 = canvas.beginPath()
    p4.moveTo(w, 0)
    p4.lineTo(w - 240, 0)
    p4.lineTo(w, 175)
    p4.close()
    canvas.drawPath(p4, fill=True, stroke=False)

    canvas.setFillColor(PURPLE_MAIN)
    p5 = canvas.beginPath()
    p5.moveTo(w, 0)
    p5.lineTo(w - 210, 0)
    p5.lineTo(w, 150)
    p5.close()
    canvas.drawPath(p5, fill=True, stroke=False)

    canvas.setFillColor(PURPLE_DARK)
    p6 = canvas.beginPath()
    p6.moveTo(w, 0)
    p6.lineTo(w - 115, 0)
    p6.lineTo(w, 85)
    p6.close()
    canvas.drawPath(p6, fill=True, stroke=False)

    canvas.setStrokeColor(GOLD_ACCENT)
    canvas.setLineWidth(2.5)
    canvas.line(w - 222, 0, w, 158)
    canvas.setLineWidth(1)
    canvas.line(w - 232, 0, w, 165)

    # Badges
    draw_seal(canvas, w - 85, h - 75, 26, "IHRA", "REGD. WITH")
    draw_seal(canvas, w - 85, 105, 26, "SECP", "REGD. WITH")

    canvas.restoreState()

def build_cert():
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=(PAGE_WIDTH, PAGE_HEIGHT),
        leftMargin=90,
        rightMargin=90,
        topMargin=36,
        bottomMargin=32
    )

    elements = []
    cert_id = "CERT-2026-990505"
    verify_url = f"http://localhost:5173/verify-certificate/{cert_id}"

    qr = qrcode.QRCode(version=1, box_size=3, border=1)
    qr.add_data(verify_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#5B1A4A", back_color="white")
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf)
    qr_buf.seek(0)
    qr_flowable = RLImage(qr_buf, width=44, height=44)

    # 1. Header
    logo_path = r"C:\Users\Administrator\Desktop\health\frontend\public\ehealth-logo.png"
    header_logo = RLImage(logo_path, width=40, height=40)

    header_text = [
        Paragraph('<b>eHealth</b>', ParagraphStyle('BrandWord', fontName='Helvetica-Bold', fontSize=22, leading=24, textColor=GOLD_ACCENT, alignment=TA_CENTER)),
        Spacer(1, 2),
        Paragraph('HOSPITAL AT HOME', ParagraphStyle('BrandSub', fontName='Helvetica-Bold', fontSize=7.5, leading=10, textColor=PURPLE_MID, alignment=TA_CENTER, letterSpacing=2.5)),
    ]

    header_table = Table([[header_logo, header_text]], colWidths=[48, 200], hAlign='CENTER')
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 10))

    # 2. "Certificate" script title
    elements.append(Paragraph(
        "Certificate",
        ParagraphStyle('CertScript', fontName='Times-BoldItalic', fontSize=46, leading=50, textColor=PURPLE_MAIN, alignment=TA_CENTER)
    ))

    # 3. "for" connective
    elements.append(Paragraph(
        "for",
        ParagraphStyle('ForWord', fontName='Helvetica', fontSize=10, leading=14, textColor=TEXT_MUTED, alignment=TA_CENTER)
    ))

    # 4. Achievement / Award Title
    elements.append(Paragraph(
        "EMPLOYEE OF THE MONTH",
        ParagraphStyle('AchieveTitle', fontName='Helvetica-Bold', fontSize=21, leading=26, textColor=GOLD_ACCENT, alignment=TA_CENTER, letterSpacing=2)
    ))
    elements.append(Spacer(1, 6))

    # 5. "This is to certify that"
    elements.append(Paragraph(
        "This is to certify that",
        ParagraphStyle('CertifyLine', fontName='Helvetica', fontSize=11, leading=15, textColor=TEXT_MUTED, alignment=TA_CENTER)
    ))
    elements.append(Spacer(1, 4))

    # 6. Recipient Full Name
    elements.append(Paragraph(
        "<u><b>Abdullah Fouzan</b></u>",
        ParagraphStyle('RecipName', fontName='Times-BoldItalic', fontSize=28, leading=34, textColor=PURPLE_MAIN, alignment=TA_CENTER)
    ))
    elements.append(Spacer(1, 8))

    # 7. Description Paragraph
    elements.append(Paragraph(
        "In recognition of exemplary clinical dedication, compassionate in-home critical care nursing, and steadfast adherence to patient safety protocols throughout the month.",
        ParagraphStyle('DescText', fontName='Helvetica', fontSize=10, leading=15, textColor=TEXT_DARK, alignment=TA_CENTER)
    ))
    elements.append(Spacer(1, 24))

    # 8. Footer Row
    sig_col = [
        Paragraph("<b>Date:</b> 14 September 2026", ParagraphStyle('DateP', fontName='Helvetica', fontSize=9, leading=12, textColor=TEXT_DARK)),
        Spacer(1, 12),
        Paragraph("______________________________________", ParagraphStyle('SigLine', fontName='Helvetica', fontSize=8.5, leading=10, textColor=TEXT_MUTED)),
        Paragraph("<b>Authorized Signatory</b>", ParagraphStyle('SigTitle', fontName='Helvetica-Bold', fontSize=8, leading=11, textColor=PURPLE_MAIN)),
        Paragraph("eHealth Hospital At Home · Islamabad, Pakistan", ParagraphStyle('SigSub', fontName='Helvetica', fontSize=7, leading=9, textColor=TEXT_MUTED)),
    ]

    verify_col = [
        Table([[
            qr_flowable,
            [
                Paragraph("<b>Certificate ID:</b>", ParagraphStyle('QrLbl', fontName='Helvetica', fontSize=7, leading=9, textColor=TEXT_MUTED)),
                Paragraph(f"<b><font color='#5B1A4A'>{cert_id}</font></b>", ParagraphStyle('QrId', fontName='Courier-Bold', fontSize=8.5, leading=11)),
                Paragraph("Scan QR code to verify authenticity", ParagraphStyle('QrSub', fontName='Helvetica', fontSize=6.5, leading=8.5, textColor=TEXT_MUTED)),
                Paragraph("ihra.gov.pk · secp.gov.pk registered", ParagraphStyle('QrSub2', fontName='Helvetica', fontSize=6.5, leading=8.5, textColor=GOLD_ACCENT)),
            ]
        ]], colWidths=[48, 160], hAlign='RIGHT')
    ]

    footer_table = Table([[sig_col, verify_col]], colWidths=[360, 280])
    footer_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(footer_table)

    doc.build(elements, onFirstPage=draw_background)
    return buf.getvalue()

pdf_data = build_cert()
with open(r'c:\Users\Administrator\Desktop\health\backend\media\lms\certificates\CERT-2026-990505.pdf', 'wb') as f:
    f.write(pdf_data)

pdf_doc = pdfium.PdfDocument(pdf_data)
img = pdf_doc[0].render(scale=2.0).to_pil()
out_img = r'C:\Users\Administrator\.gemini\antigravity-ide\brain\8bafbd5e-467e-4329-bba0-b25b879ef134\official_certificate_render.png'
img.save(out_img)
print("Updated rendered image successfully!")
