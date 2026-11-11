const assert=require('node:assert/strict');
(async()=>{
 const d=await import('./dither.mts');
 const colors=[[255,255,255,255],[0,0,0,255],[255,0,0,255],[220,120,100,255],[60,60,60,255],[250,250,250,255],[255,0,0,255],[0,0,0,255],[255,255,255,255]];
 const src=new Uint8ClampedArray(colors.flat());
 const packed=d.packImage(src,9,1,'threeColor');
 const got=d.previewThreeColor(packed,9,1);
 const expected=new Uint8ClampedArray([255,255,255,255,0,0,0,255,255,0,0,255,255,0,0,255,0,0,0,255,255,255,255,255,255,0,0,255,0,0,0,255,255,255,255,255]);
 assert.deepEqual(got,expected);
 console.log('PASS: preview decodes actual planes, including unquantized colors and row padding');
})().catch(e=>{console.error(e);process.exitCode=1});
