import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

@Injectable()
export class ExcelService {
  /**
   * Generates an Excel file (XLSX) from an array of data objects.
   * @param data Array of objects to be converted to Excel rows.
   * @param sheetName Name of the sheet in the workbook.
   * @returns Buffer containing the Excel file.
   */
  generateExcel(data: any[], sheetName: string = 'Data'): Buffer {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Auto-size columns (basic implementation)
    const ref = worksheet['!ref'];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      const cols: XLSX.ColInfo[] = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxLen = 10;
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
          if (cell && cell.v) {
            const len = cell.v.toString().length;
            if (len > maxLen) maxLen = len;
          }
        }
        cols.push({ wch: maxLen + 2 });
      }
      worksheet['!cols'] = cols;
    }

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
