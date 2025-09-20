#!/usr/bin/env python3
"""
Create a test PDF file for upload testing
"""

from fpdf import FPDF
import os

def create_test_pdf():
    """Create a simple test PDF"""
    
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    
    # Add some test content
    pdf.cell(200, 10, txt="VoiceBot Test PDF Document", ln=True, align='C')
    pdf.ln(10)
    
    content = """
    This is a test PDF document for the VoiceBot RAG system.
    
    Key Features:
    - Real-time voice processing
    - Document search capabilities
    - API orchestration
    
    Test Information:
    The system should be able to extract this text and index it properly.
    Users can then ask questions about this content.
    
    Sample Data:
    - Company Revenue: $1,234,567
    - Growth Rate: 25%
    - Employee Count: 150
    """
    
    for line in content.split('\n'):
        pdf.cell(0, 10, txt=line.strip(), ln=True)
    
    # Save the PDF
    pdf_file = "test_document.pdf"
    pdf.output(pdf_file)
    
    print(f"✅ Created test PDF: {pdf_file}")
    print(f"   File size: {os.path.getsize(pdf_file)} bytes")
    
    return pdf_file

if __name__ == "__main__":
    # Check if fpdf2 is installed
    try:
        create_test_pdf()
    except ImportError:
        print("❌ fpdf2 not installed. Install it with: pip install fpdf2")
        print("   Creating a simple text file instead...")
        
        # Create a text file as fallback
        with open("test_document.txt", "w") as f:
            f.write("""
VoiceBot Test Document

This is a test document for the VoiceBot RAG system.

Key Features:
- Real-time voice processing
- Document search capabilities
- API orchestration

Test Information:
The system should be able to extract this text and index it properly.
Users can then ask questions about this content.

Sample Data:
- Company Revenue: $1,234,567
- Growth Rate: 25%
- Employee Count: 150
""")
        print("✅ Created test_document.txt instead")