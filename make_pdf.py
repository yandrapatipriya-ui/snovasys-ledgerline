import cv2
from fpdf import FPDF
import os

video_path = "assets/demo-video.mp4"
cap = cv2.VideoCapture(video_path)

scenes = [
    (1, "1. Role Selection Portal", "LedgerLine Banking System landing page displaying role-based authentication options for Account Holder, Administrator, and Auditor."),
    (24, "2. Account Holder Dashboard", "Authenticated customer dashboard displaying unique account number and verified initial balance."),
    (32, "3. Atomic Deposit & Withdrawal Execution", "Executed deposit and withdrawal; running balance and transaction history updated atomically."),
    (92, "4. Idempotent Peer-to-Peer Transfer", "Transferred funds between accounts with immediate debit/credit confirmation."),
    (154, "5. Administrator Compliance & Master Ledger", "Admin portal verifying money conservation, concurrency locks, and loading all master ledger records."),
    (185, "6. Read-Only Auditor Portal & Invariant Check", "Auditor view confirming zero discrepancies across the immutable ledger via the System Integrity Check.")
]

pdf = FPDF()
pdf.set_auto_page_break(auto=True, margin=15)

pdf.add_page()
pdf.set_font("Arial", "B", 16)
pdf.cell(0, 10, "LedgerLine Banking System - Live Demo Screenshots", ln=True, align="C")
pdf.set_font("Arial", "", 10)
pdf.cell(0, 8, "Snovasys Fresher Hiring Challenge 2026 | Live Deployment Verification", ln=True, align="C")
pdf.ln(5)

for idx, (sec, title, desc) in enumerate(scenes):
    cap.set(cv2.CAP_PROP_POS_MSEC, sec * 1000)
    success, frame = cap.read()
    if success:
        img_name = f"frame_{idx+1}.jpg"
        cv2.imwrite(img_name, frame)
        
        if idx > 0 and idx % 2 == 0:
            pdf.add_page()
            
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 8, title, ln=True)
        pdf.set_font("Arial", "", 10)
        pdf.multi_cell(0, 6, desc)
        pdf.ln(2)
        pdf.image(img_name, w=175)
        pdf.ln(8)
        os.remove(img_name)

cap.release()
pdf.output("assets/LedgerLine_Demo_Screenshots.pdf")
print("SUCCESS: LedgerLine_Demo_Screenshots.pdf created inside assets folder!")
