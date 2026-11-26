/* Minimal OOXML workbook writer; ZIP method 0, all cell values are literal strings. */
(() => {
  const encoder = new TextEncoder();
  const xml = value => String(value ?? '').slice(0, 32767).toWellFormed()
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/_x([0-9a-fA-F]{4})_/g, '_x005F_x$1_')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const column = n => {let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s};
  const crcTable = Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});
  function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
  function zip(files){
    const local=[], central=[];let offset=0;
    const header = length => {const bytes=new Uint8Array(length);return [bytes,new DataView(bytes.buffer)]};
    for(const [name,content] of Object.entries(files)){
      const filename=encoder.encode(name), data=encoder.encode(content), checksum=crc(data);
      const [l,v]=header(30+filename.length);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,33,true);
      v.setUint32(14,checksum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);l.set(filename,30);
      const [c,w]=header(46+filename.length);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(14,33,true);
      w.setUint32(16,checksum,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,filename.length,true);w.setUint32(42,offset,true);c.set(filename,46);
      local.push(l,data);central.push(c);offset+=l.length+data.length;
    }
    const centralSize=central.reduce((n,b)=>n+b.length,0),[end,e]=header(22);
    e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    const result=new Uint8Array(offset+centralSize+22);let p=0;for(const b of [...local,...central,end]){result.set(b,p);p+=b.length}return result;
  }
  function build(headers,rows){
    if(!headers.length)throw new Error('Select at least one column.');
    if(rows.length>5000||headers.length>100)throw new Error('Export limit: 5,000 rows and 100 columns.');
    const sheetRows=[headers,...rows].map((row,r)=>`<row r="${r+1}">${headers.map((_,c)=>`<c r="${column(c)}${r+1}" t="inlineStr"${r===0?' s="1"':''}><is><t xml:space="preserve">${xml(row[c])}</t></is></c>`).join('')}</row>`).join('');
    const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    return zip({
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Extracted data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml':`<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      'xl/worksheets/sheet1.xml':`<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${headers.length}" width="28" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${column(headers.length-1)}${rows.length+1}"/></worksheet>`
    });
  }
  globalThis.HarvestXlsx={build};
})();
