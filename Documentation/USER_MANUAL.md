# FamilyaConnect QC Tool - End-to-End User Manual

Welcome to the **FamilyaConnect Quality Control (QC) Tool**. This manual is designed to guide you through the system based on your specific role. Whether you are managing the system, scanning books, or performing quality checks, this guide will help you navigate the platform efficiently.

---

## 📑 Table of Contents
1.  [General Navigation](#general-navigation)
2.  [Role: Super Admin](#role-super-admin)
3.  [Role: Upload Manager (Supervisor)](#role-upload-manager-supervisor)
4.  [Role: Vendor](#role-vendor)
5.  [Role: Scanning Operator](#role-scanning-operator)
6.  [Role: QC Manager (Supervisor)](#role-qc-manager-supervisor)
7.  [Role: QC User](#role-qc-user)
8.  [Common Features & Tips](#common-features-tips)

---

## 🧭 General Navigation
After logging in, you will see a **Sidebar** on the left.
-   **Dashboard**: A quick overview of your current tasks and statistics.
-   **Top Bar**: Shows your profile, notifications (Bell icon), and logout options.
-   **Active Modules**: The sidebar will change based on your role to show only what you need.

---

## 🔄 The Batch Lifecycle (End-to-End Workflow)
Understanding how a "Batch" moves through the system is key to using the tool effectively:

1.  **Allocation**: The **Upload Manager** assigns work to a **Vendor**, who then assigns it to a **Scanning Operator**.
2.  **Creation**: The **Operator** creates a Batch ID for a specific book.
3.  **Upload**: The **Operator** uploads images. Once finished, the batch status becomes "QC Pending".
4.  **Assignment**: The **QC Manager** assigns the "QC Pending" batch to a **QC User**.
5.  **Inspection**: The **QC User** reviews every image.
    -   If **All Approved**: The batch goes to the **QC Manager** for final verification.
    -   If **Any Rejected**: The batch is marked for "Rework".
6.  **Resolution**: 
    -   **Approved**: The batch is archived as "Accepted".
    -   **Rejected**: The **Vendor** gets a notification to re-upload the faulty images.
7.  **Closure**: Once re-uploaded images are approved, the batch is finally "Accepted".

---

## 🛡️ Role: Super Admin
*The Super Admin is the system architect responsible for initial setup and high-level oversight.*

### 1. Master Data Management
Before any work starts, you must set up the project hierarchy:
-   **Projects**: Create the main project (e.g., "State Archive Digitization").
-   **Sources**: Create sources under a project (e.g., "Central Library").
-   **Locations**: Specify physical locations (e.g., "Floor 1, Shelf A").
-   **Record Owners**: Identify who owns the records (e.g., "Department of Revenue").
-   **Record Types**: Define what is being scanned (e.g., "Marriage Register").

### 2. User Management
-   Go to **User Management** to create accounts for Upload Managers, QC Managers, and Vendors.
-   You can activate or deactivate users as needed.

### 3. Oversight
-   **Audit Logs**: Monitor every action taken in the system for security and accountability.
-   **Monitoring**: View global **Upload History** and **QC History**.

---

## 👔 Role: Upload Manager (Supervisor)
*The bridge between project masters and vendors.*

### 1. Vendor Management
-   Create and manage **Vendors** (companies responsible for scanning).

### 2. Vendor Allocation
-   This is a critical step. Use **Vendor Allocation** to assign a specific Project/Source/Location to a Vendor. Without this, the Vendor cannot assign work to their operators.

### 3. Monitoring & Cleanup
-   **Audit Console**: Preview images uploaded by operators to ensure they meet basic standards before they go to QC.
-   **Accepted Batches**: View batches that have passed the entire QC process.

---

## 🏢 Role: Vendor
*Manages the scanning team and their daily workload.*

### 1. Operator Management
-   Create accounts for your **Scanning Operators**. 

### 2. Operator Allocation
-   Assign the Project/Source/Location (allocated to you by the Upload Manager) to your specific **Scanning Operators**. 

### 3. Progress Tracking
-   Monitor **Upload History** to see how many images your team is uploading daily.
-   Check **QC History** to see rejection rates.

### 4. Re-upload Queue
-   When a batch is rejected by QC, it appears in your **Re-upload Queue**. You must manage the reallocation of these batches for correction.

---

## 📸 Role: Scanning Operator
*The frontline user responsible for scanning and uploading images.*

### 1. Starting a New Batch
1.  Click **Create Batch**.
2.  Select the **Project**, **Source**, **Location**, and **Record Owner** (these are assigned to you by your Vendor).
3.  Enter the **Book Name** (or Register Name). The system will check if this book was already scanned to prevent duplicates.
4.  Enter the **Total Images** in the physical book.
5.  Click **Create Batch & Continue**.

### 2. Uploading Images
-   Drag and drop images or click to select them.
-   **Pro-Tip**: The system automatically converts images to a web-friendly format. 
-   **Note**: If an upload fails (e.g., internet drop), the system has an **Auto-Retry** mechanism. Do not close the tab until everything shows "Success".

### 3. Re-uploads
-   If your batch is rejected, go to **Re-upload Batches**.
-   You will see the specific reason for rejection (e.g., "Page 5 is blurry").
-   Replace the faulty images and submit again.

---

## 👩‍💼 Role: QC Manager (Supervisor)
*Ensures quality standards are met by managing the QC User team.*

### 1. QC User Management
-   Create and manage accounts for **QC Users**.

### 2. Batch Allocation
-   When an operator finishes uploading, the batch appears in your **Batch Allocation** screen.
-   Assign the batch to a specific **QC User**. You can see their current workload to ensure fair distribution.

### 3. QC Review
-   After a QC User finishes their check, if there are rejections, you can perform a **final review** in the **QC Review Queue** before sending it back to the Vendor.
-   You have the power to "Overrule" a QC User's rejection if you find it acceptable.

---

## 🔍 Role: QC User
*The quality gatekeeper who inspects every image.*

### 1. Performing Quality Check
1.  Go to **My Tasks**.
2.  Open an assigned batch.
3.  Review images one by one or in a grid view.
4.  For each image:
    -   Click **Accept** if the image is clear and correctly oriented.
    -   Click **Reject** if there are issues (Blurry, Cut-off, Wrong Orientation).
    -   **Important**: If you reject, provide a clear **Remark** so the operator knows what to fix.

### 2. Completing the Task
-   Once all images are checked, click **Complete Task**. This sends the report to your Supervisor for final verification.

---

## 💡 Common Features & Tips

-   **Dashboard Charts**: Use the charts to track your performance over the week.
-   **Search & Filters**: Every list (Users, History, Batches) has a search bar. Use it to find specific Batch IDs or Book Names quickly.
-   **Notifications**: The Bell icon at the top will alert you when:
    -   A new batch is allocated to you.
    -   A batch you uploaded has been approved/rejected.
    -   A QC task is completed.
-   **Device Support**: The tool is optimized for desktops and tablets used in scanning centers.

---

### 🆘 Troubleshooting
-   **I can't see any Projects**: Ask your Vendor to check your **Operator Allocation**.
-   **Upload is slow**: Check your internet connection. The system supports resume-on-failure, so you can refresh if needed.
-   **Password Forgotten**: Contact your Supervisor or the Super Admin to reset your password.

---

## 📖 Key Terms & Glossary

-   **Hierarchy**: The logical chain of Project → Source → Location → Record Owner → Record Type. This structure ensures every scan is perfectly categorized.
-   **Batch ID**: A unique human-readable code automatically generated for every scanning session (e.g., `MAR-REG-1945-V01-B001`).
-   **Batch UID**: A unique technical identifier (UUID) used for internal tracking.
-   **Rework / Re-upload**: A process where individual images or entire batches are sent back to the operator for correction due to quality issues.
-   **Accuracy Rating**: A percentage score for operators based on how many of their images pass QC without rejection.
-   **Sequence**: The order in which images were scanned. Maintaining correct sequence is vital for digital record integrity.

---

## ❓ Frequently Asked Questions (FAQ)

**Q: I made a mistake in the Book Name, can I change it?**
A: Once a batch is created, the Book Name is locked. If it's a major error, contact your Supervisor to cancel the batch and start a new one.

**Q: Can multiple operators work on the same book?**
A: Yes, if "Partial Upload" is enabled. One operator can upload pages 1-100, and another can upload 101-200 under a different Batch ID but the same Book Name.

**Q: How do I know why my image was rejected?**
A: In the "Re-upload" screen, hover over or click on the rejected image. The QC User's **Remark** will be visible there.

**Q: The upload tracker shows 100% but the status is still "Uploading".**
A: Do not close the window. The system is finalizing the cloud storage and generating preview thumbnails. Wait for the "Success" notification.

---
*© 2026 FamilyaConnect.com - Version 1.0 - Empowering Digital Archives*
