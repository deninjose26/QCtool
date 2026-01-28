import * as XLSX from 'xlsx';

/**
 * Utility to export an array of objects to Excel (.xlsx)
 * @param data Array of objects to export
 * @param fileName Desired file name without extension
 * @param headers Optional mapping of keys to header labels
 */
export const exportToExcel = (
    data: any[],
    fileName: string,
    headers?: Record<string, string>
) => {
    // If headers are provided, transform the data keys
    const formattedData = data.map(item => {
        if (!headers) return item;

        const newItem: any = {};
        Object.keys(headers).forEach(key => {
            newItem[headers[key]] = item[key];
        });
        return newItem;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

    // Create an ISO date string for the filename
    const timestamp = new Date().toISOString().split('T')[0];
    const fullFileName = `${fileName}_${timestamp}.xlsx`;

    XLSX.writeFile(workbook, fullFileName);
};
