// Zip senza compressione, senza dipendenze.
const T=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=T[(c^b[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function makeZip(files){
  const parts=[],cd=[];let off=0;const d=new Date();
  const tm=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF,dt=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  for(const f of files){
    const name=Buffer.from(f.path,'utf8'),data=Buffer.isBuffer(f.data)?f.data:Buffer.from(f.data),c=crc32(data);
    const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0x0800,6);lh.writeUInt16LE(tm,10);lh.writeUInt16LE(dt,12);lh.writeUInt32LE(c,14);lh.writeUInt32LE(data.length,18);lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(name.length,26);
    parts.push(lh,name,data);
    const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x0800,8);ch.writeUInt16LE(tm,12);ch.writeUInt16LE(dt,14);ch.writeUInt32LE(c,16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(data.length,24);ch.writeUInt16LE(name.length,28);ch.writeUInt32LE(off,42);
    cd.push(ch,name);off+=30+name.length+data.length;
  }
  const cdSize=cd.reduce((s,x)=>s+x.length,0),e=Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(files.length,8);e.writeUInt16LE(files.length,10);e.writeUInt32LE(cdSize,12);e.writeUInt32LE(off,16);
  return Buffer.concat([...parts,...cd,e]);
}
module.exports={makeZip};
