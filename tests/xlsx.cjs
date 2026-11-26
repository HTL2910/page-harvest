const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const file=path.join(__dirname,'../xlsx.js');
if(fs.existsSync(file)) require(file);
assert.equal(typeof globalThis.HarvestXlsx,'object','XLSX export engine must exist');
const bytes=HarvestXlsx.build(['Name','Literal','Code'],[['Áo & <thun>','=SUM(1,2)','00120'],['😀','https://example.com','']]);
assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
fs.writeFileSync(path.join(__dirname,'output.xlsx'),bytes);
console.log('PASS ZIP workbook generated');
