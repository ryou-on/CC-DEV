// Deterministic rectangle packing, measured using the same font as rendered text.
export const CLOUD_FONT = '"Yu Mincho", "Hiragino Mincho ProN", serif';
export function layoutWords(words, width, height, measure) {
 const placed=[]; const max=words[0]?.count || 1, min=words.at(-1)?.count || 1;
 for(const row of words) {
  let size=max===min ? Math.min(42,width/8) : 15+Math.pow((row.count-min)/(max-min),1.35)*Math.min(108,width*.17);
  let found=null;
  for(let attempt=0;attempt<5 && !found;attempt++,size*=.82) {
   const w=measure(row.word,size)+8,h=size*1.22+4;
   if(w>width-16) continue;
   for(let step=0;step<1800;step++) {
    const angle=step*.35,radius=2.5*Math.sqrt(step)*3;
    const x=width/2+Math.cos(angle)*radius*1.35-w/2,y=height/2+Math.sin(angle)*radius-h/2;
    if(x<8 || y<8 || x+w>width-8 || y+h>height-8) continue;
    if(placed.every(p=>x+w+2<=p.x || p.x+p.width+2<=x || y+h+2<=p.y || p.y+p.height+2<=y)) {found={...row,x,y,width:w,height:h,size};break;}
   }
  }
  if(found) placed.push(found);
 }
 return placed;
}
