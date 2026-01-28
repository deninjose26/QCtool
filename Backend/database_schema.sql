-- ============================================
-- QC Portal Database Schema
-- Generated from models.py
-- PostgreSQL Database
-- ============================================

-- Create schema (optional - adjust as needed)
CREATE SCHEMA IF NOT EXISTS qc_portal;
SET search_path TO qc_portal;

-- ============================================
-- ENUM TYPES
-- ============================================

-- User Role Enum
CREATE TYPE user_role AS ENUM (
    'SuperAdmin',
    'QC_Supervisor',
    'QC_User',
    'Upload_Supervisor',
    'Vendor',
    'Scanning_Operator'
);

-- Upload Status Enum
CREATE TYPE upload_status AS ENUM (
    'Pending',
    'In_Progress',
    'Completed',
    'Failed'
);

-- Conversion Status Enum
CREATE TYPE conversion_status AS ENUM (
    'Tiff_Received',
    'Jpeg_Converting',
    'Jpeg_Converted',
    'QC_Moved',
    'Failed'
);

-- File Type Enum
CREATE TYPE file_type AS ENUM (
    'TIFF',
    'JPEG',
    'PNG'
);

-- QC Batch Status Enum
CREATE TYPE qc_batch_status AS ENUM (
    'Allocated',
    'QC_Pending',
    'QC_In_Progress',
    'Completed',
    'Verified',
    'Verified_With_Rejection'
);

-- QC Status Enum
CREATE TYPE qc_status AS ENUM (
    'Pending',
    'Approved',
    'Rejected',
    'Flagged'
);

-- Notification Type Enum
CREATE TYPE notification_type AS ENUM (
    'batch_uploaded',
    'qc_assigned',
    'batch_rejected',
    'conversion_complete'
);

-- ============================================
-- TABLES
-- ============================================

-- Users Table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    user_role user_role NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(user_id),
    created_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    profile_picture_path VARCHAR(500),
    email_notifications_enabled BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);

-- Projects Table
CREATE TABLE projects (
    project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_code VARCHAR(100) UNIQUE NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_projects_code ON projects(project_code);

-- Source Table
CREATE TABLE source (
    source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id),
    source_code VARCHAR(100) NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_source_project ON source(project_id);

-- Location Table
CREATE TABLE location (
    location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id),
    source_id UUID NOT NULL REFERENCES source(source_id),
    location_code VARCHAR(100) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_location_project ON location(project_id);
CREATE INDEX idx_location_source ON location(source_id);

-- Record Owners Table
CREATE TABLE record_owners (
    record_owner_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id),
    source_id UUID NOT NULL REFERENCES source(source_id),
    location_id UUID NOT NULL REFERENCES location(location_id),
    record_owner_code VARCHAR(100) NOT NULL,
    record_owner_name VARCHAR(255) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_record_owners_location ON record_owners(location_id);

-- Record Name Table
CREATE TABLE record_name (
    record_name_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id),
    record_code VARCHAR(100) UNIQUE NOT NULL,
    record_name VARCHAR(255) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_record_name_code ON record_name(record_code);

-- Record Type Table
CREATE TABLE record_type (
    record_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_type_code VARCHAR(100) NOT NULL,
    record_type_name VARCHAR(255) NOT NULL,
    source_id UUID NOT NULL REFERENCES source(source_id),
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_record_type_source ON record_type(source_id);

-- Vendor Allocation Table
CREATE TABLE vendor_allocation (
    vendor_allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id),
    source_id UUID NOT NULL REFERENCES source(source_id),
    location_id UUID NOT NULL REFERENCES location(location_id),
    record_owner_id UUID NOT NULL REFERENCES record_owners(record_owner_id),
    allocated_to_vendor UUID NOT NULL REFERENCES users(user_id),
    allocated_by_supervisor UUID NOT NULL REFERENCES users(user_id),
    is_active BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_vendor_allocation_vendor ON vendor_allocation(allocated_to_vendor);
CREATE INDEX idx_vendor_allocation_active ON vendor_allocation(is_active);

-- Scanning Operator Allocation Table
CREATE TABLE scanning_operator_allocation (
    scanning_operator_allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_allocation_id UUID NOT NULL REFERENCES vendor_allocation(vendor_allocation_id),
    allocated_to_operator UUID NOT NULL REFERENCES users(user_id),
    is_active BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_operator_allocation_operator ON scanning_operator_allocation(allocated_to_operator);
CREATE INDEX idx_operator_allocation_active ON scanning_operator_allocation(is_active);

-- Batch Table
CREATE TABLE batch (
    batch_uid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id VARCHAR(255) UNIQUE NOT NULL,
    scanning_operator_allocation_id UUID NOT NULL REFERENCES scanning_operator_allocation(scanning_operator_allocation_id),
    source_id UUID NOT NULL REFERENCES source(source_id),
    location_id UUID NOT NULL REFERENCES location(location_id),
    record_owner_id UUID NOT NULL REFERENCES record_owners(record_owner_id),
    record_name_id UUID NOT NULL REFERENCES record_name(record_name_id),
    record_type_id UUID NOT NULL REFERENCES record_type(record_type_id),
    total_count INTEGER NOT NULL,
    upload_count INTEGER DEFAULT 0,
    is_complete BOOLEAN DEFAULT FALSE,
    is_partial BOOLEAN DEFAULT FALSE,
    is_reupload BOOLEAN DEFAULT FALSE,
    vendor_approved BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC'),
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_batch_id ON batch(batch_id);
CREATE INDEX idx_batch_operator ON batch(scanning_operator_allocation_id);

-- Upload Table
CREATE TABLE upload (
    upload_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_uid UUID NOT NULL REFERENCES batch(batch_uid),
    completed_count INTEGER DEFAULT 0,
    s3_folder_path VARCHAR(500) NOT NULL,
    upload_status upload_status DEFAULT 'Pending',
    uploaded_by UUID NOT NULL REFERENCES users(user_id),
    upload_start_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    upload_end_date TIMESTAMP WITHOUT TIME ZONE,
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_upload_batch ON upload(batch_uid);
CREATE INDEX idx_upload_status ON upload(upload_status);

-- Image Table
CREATE TABLE image (
    image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES upload(upload_id),
    batch_uid UUID NOT NULL REFERENCES batch(batch_uid),
    image_name VARCHAR(255) NOT NULL,
    original_s3_path VARCHAR(500) NOT NULL,
    qc_s3_path VARCHAR(500),
    original_file_type file_type NOT NULL,
    converted_file_type file_type,
    conversion_status conversion_status DEFAULT 'Tiff_Received',
    file_size_bytes BIGINT,
    upload_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_image_upload ON image(upload_id);
CREATE INDEX idx_image_batch ON image(batch_uid);
CREATE INDEX idx_image_conversion_status ON image(conversion_status);

-- QC Allocation Table
CREATE TABLE qc_allocation (
    qc_allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_uid UUID NOT NULL REFERENCES batch(batch_uid),
    allocated_to_qc_user UUID NOT NULL REFERENCES users(user_id),
    allocated_by_supervisor UUID NOT NULL REFERENCES users(user_id),
    allocation_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
    qc_batch_status qc_batch_status DEFAULT 'Allocated',
    qc_completed_date TIMESTAMP WITHOUT TIME ZONE
);

CREATE INDEX idx_qc_allocation_batch ON qc_allocation(batch_uid);
CREATE INDEX idx_qc_allocation_user ON qc_allocation(allocated_to_qc_user);
CREATE INDEX idx_qc_allocation_status ON qc_allocation(qc_batch_status);

-- QC Table
CREATE TABLE qc (
    qc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qc_allocation_id UUID NOT NULL REFERENCES qc_allocation(qc_allocation_id),
    image_id UUID NOT NULL REFERENCES image(image_id),
    qc_status qc_status DEFAULT 'Pending',
    orientation_error BOOLEAN DEFAULT FALSE,
    remarks TEXT,
    qc_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_qc_allocation ON qc(qc_allocation_id);
CREATE INDEX idx_qc_image ON qc(image_id);
CREATE INDEX idx_qc_status ON qc(qc_status);

-- Notifications Table
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    link VARCHAR(500),
    is_read BOOLEAN DEFAULT FALSE,
    created_date TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes')
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_date DESC);

-- ============================================
-- COMMENTS (Optional - for documentation)
-- ============================================

COMMENT ON TABLE users IS 'User accounts with role-based access control';
COMMENT ON TABLE projects IS 'Top-level project hierarchy';
COMMENT ON TABLE source IS 'Data sources within projects';
COMMENT ON TABLE location IS 'Physical locations for records';
COMMENT ON TABLE record_owners IS 'Owners of record collections';
COMMENT ON TABLE record_name IS 'Individual record/book names';
COMMENT ON TABLE record_type IS 'Types of records (e.g., Marriage Register, Birth Register)';
COMMENT ON TABLE vendor_allocation IS 'Vendor assignments to project hierarchies';
COMMENT ON TABLE scanning_operator_allocation IS 'Operator assignments under vendors';
COMMENT ON TABLE batch IS 'Upload batches created by operators';
COMMENT ON TABLE upload IS 'Upload sessions for batches';
COMMENT ON TABLE image IS 'Individual scanned images';
COMMENT ON TABLE qc_allocation IS 'QC task assignments';
COMMENT ON TABLE qc IS 'Quality control records for images';
COMMENT ON TABLE notifications IS 'User notifications for workflow events';

-- ============================================
-- INITIAL DATA (Optional)
-- ============================================

-- Create default SuperAdmin user
-- Password: 'admin123' (hashed with bcrypt)
-- IMPORTANT: Change this password immediately after first login!
INSERT INTO users (user_id, name, username, email, password_hash, user_role, is_active)
VALUES (
    gen_random_uuid(),
    'System Administrator',
    'admin',
    'admin@qcportal.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIxIvicQNe', -- 'admin123'
    'SuperAdmin',
    TRUE
);

-- ============================================
-- GRANT PERMISSIONS (Adjust as needed)
-- ============================================

-- Grant all privileges to your application user
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA qc_portal TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA qc_portal TO your_app_user;
-- GRANT USAGE ON SCHEMA qc_portal TO your_app_user;

-- ============================================
-- END OF SCHEMA
-- ============================================
