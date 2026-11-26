from pathlib import Path
import openpyxl

root = Path(__file__).parent
sheet = openpyxl.load_workbook(root / 'output.xlsx').active
assert sheet['A2'].value == 'Áo & <thun>'
assert sheet['B2'].value == '=SUM(1,2)' and sheet['B2'].data_type == 's'
assert sheet['C2'].value == '00120'
assert sheet['A3'].value == '😀'
sheet = openpyxl.load_workbook(root / 'ui-export.xlsx').active
assert (sheet.max_row, sheet.max_column) == (4, 5)
assert sheet['A1'].value == 'Product title'
assert sheet['A2'].value == 'Áo thun cotton'
assert sheet['C3'].value in ('', None)
print('PASS independent verification of generated and browser-downloaded XLSX files')
