# QC Tool: Detailed Step-by-Step Operations Guide

This guide provides a granular, chronological breakdown of every action performed in the system.

---

## 🟢 PHASE 1: System & Project Initialization
**Performed by: Super Admin & Upload Supervisor**

### 1.1 Infrastructure Setup (Super Admin)
1.  **Login**: Access the admin portal using master credentials.
2.  **Creation of Project**: 
    *   Navigate to **Project Management**.
    *   Enter **Project Name** and **Project Code** (e.g., "DOC_SCAN_2024").
3.  **Hierarchy Definition**:
    *   Add **Sources** (The main archive or office providing the documents).
    *   Add **Locations** (The physical scan-center where work happens).
4.  **Admin Creation**:
    *   Go to **User Directory**.
    *   Create **Upload Supervisor** and **QC Supervisor** accounts.

### 1.2 Inventory Registration (Upload Supervisor)
1.  **Define Owners**: Enter **Record Owners** (The department or person who owns the files).
2.  **Define Types**: Create **Record Types** (e.g., "Ledger", "Voucher", "Correspondence").
3.  **Inventory Setup**: Add specific **Books/Registers** names into the system.
4.  **Vendor Assignment**:
    *   Navigate to **Vendor Allocation**.
    *   Select a Project/Source/Location/Record Owner combination.
    *   Assign this "Work Hub" to a specific **Vendor**.

---

## 🔵 PHASE 2: Production Planning
**Performed by: Vendor**

1.  **Team Building**: 
    *   Navigate to **Operators**.
    *   Create accounts for individual **Scanning Operators**.
2.  **Resource Distribution**:
    *   Go to **Operator Allocation**.
    *   Take the "Work Hub" received from the Supervisor.
    *   Assign specific operators to that hub. (This enables the operator to see the project on their tablet/PC).

---

## 🟡 PHASE 3: The Digitization Process
**Performed by: Scanning Operator**

1.  **Shift Start**: Login to the **Scanning Station**.
2.  **Job Creation**:
    *   Select **Record Type** and **Book Name**.
    *   The system generates a unique **Batch ID**.
    *   Verify the **Target Page Count** of the physical book.
3.  **Capture & Upload**:
    *   Perform scanning on the physical scanner.
    *   Select the TIFF files on the PC.
    *   Click **Start Upload**.
4.  **Verification**:
    *   Watch the **Sync Badge**.
    *   Wait for "Upload Complete." 
5.  **Submission**:
    *   Mark the batch as **Complete** (for full books) or **Partial** (if scanning is split across shifts).

---

## ⚙️ PHASE 4: Automated Optimization
**Performed by: System (Background)**

1.  **Detection**: Cloud senses new TIFF files in S3.
2.  **Worker Activation**: Serverless Function (DO Function) triggers instantly.
3.  **Conversion**: High-res TIFF is converted to optimized **Web-JPEG**.
4.  **Ready Signal**: Batch status updates to "Ready for QC" in the database.

---

## 🔴 PHASE 5: Quality Audit & Correction
**Performed by: QC Team & Vendor**

### 5.1 QC Allocation (QC Supervisor)
1.  **Scan Monitoring**: See list of "Completed" batches from operators.
2.  **Distribution**: Assign batches to specific **QC Users** for auditing.

### 5.2 The Audit (QC User)
1.  **Launch Viewer**: Open the **QC Workbench**.
2.  **Visual Check**:
    *   Browse every page using keyboard shortcuts.
    *   Check for: Blur, cut corners, missing pages, or wrong rotation.
3.  **Decision**:
    *   Click **Approve** for clean pages.
    *   Click **Reject** if a mistake is found (Add mandatory **Remark**).
    *   Click **Flag** for minor fixes (like 90° rotation).
4.  **Submission**: Finalize the audit.

### 5.3 Correction Loop (Vendor & Operator)
1.  **Alert**: Vendor sees "Rework Needed" in red on their dashboard.
2.  **Re-assignment**: Vendor sends the rejected batch back to the operator.
3.  **Correction**: Operator re-scans only the specific failed pages and uploads them as a **Rework Batch**.

---

## 🏁 PHASE 6: Final Verification & Reporting
**Performed by: QC Supervisor & Admin**

1.  **Verification**: QC Supervisor reviews the "Rejected" items to confirm if the auditor was correct.
2.  **Final Approval**: Once verified, the batch moves to **Verified** status.
3.  **Reporting**: 
    *   **Vendor** downloads the QC Report for billing.
    *   **Admin** checks the **Quality Score** (Accuracy %) to evaluate vendor performance.
    *   **Super Admin** archives the project metrics once the "Goal Completion" hits 100%.
