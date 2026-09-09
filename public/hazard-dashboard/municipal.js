/* Tokyo open-data reference overlay. Municipal PDF maps remain the official originals. */
(() => {
  'use strict';
  const cities = {
    toshima: {name:'豊島区', center:{lat:35.7295,lng:139.7109}, edition:'2024年9月版', updated:'2026年4月20日',
      page:'https://www.city.toshima.lg.jp/042/bosai/taisaku/hazard-map/010305.html',
      pdf:'https://www.city.toshima.lg.jp/documents/695/hazardomote.pdf',
      description:'洪水・内水と救援センターを掲載。神田川の青い斜線区域は洪水の浸水深です。区域内の内水は東京都の原図で確認できます。'},
    shinjuku: {name:'新宿区', center:{lat:35.703,lng:139.710}, edition:'2025年8月版', updated:'2026年8月25日',
      page:'https://www.city.shinjuku.lg.jp/anzen/file03_00016.html',
      pdf:'https://www.city.shinjuku.lg.jp/content/000434077.pdf',
      gis:'https://www.sonicweb-asp.jp/shinjuku2/agreement?theme=th_1101',
      description:'表面に洪水・内水と水害時の避難所、裏面に高潮などを掲載。洪水区域内の内水は東京都の原図で確認できます。'}
  };
  const scale = [
    [.1,.5,'#fff6ae','0.1–0.5m'],[.5,1,'#ffe080','0.5–1m'],
    [1,2,'#ffc394','1–2m'],[2,3,'#f89b9c','2–3m'],
    [3,5,'#ed6798','3–5m'],[5,10,'#c73d86','5–10m'],[10,Infinity,'#873a99','10m以上']
  ];
  const color = depth => scale.find(([low,high])=>depth>=low&&depth<high)?.[2] || null;
  function nearest(view, point, radius=8) {
    let best=null, bestDistance=radius*radius;
    const mx=111320*Math.cos(point.lat*Math.PI/180), my=111320;
    for(let offset=0;offset<view.byteLength;offset+=12){
      const lat=view.getUint32(offset,true)/1e7, lng=view.getUint32(offset+4,true)/1e7;
      const dy=(lat-point.lat)*my;
      if(Math.abs(dy)>radius)continue;
      const dx=(lng-point.lng)*mx, d=dx*dx+dy*dy;
      if(d<=bestDistance){bestDistance=d;best={lat,lng,depth:view.getFloat32(offset+8,true),distance:Math.sqrt(d)}}
    }
    return best;
  }
  class Overlay {
    constructor(project){this.project=project;this.status='idle';this.promise=null;this.datasets=[];this.atlas=null}
    async load(){
      if(this.status==='ready')return this;
      if(this.promise)return this.promise;
      this.status='loading';
      this.promise=(async()=>{
        const response=await fetch('./data/manifest.json',{signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw Error('配信情報を取得できません');
        const manifest=await response.json();
        if(manifest.schemaVersion!==1||manifest.sources?.length!==3)throw Error('配信情報の形式を確認できません');
        const datasets=await Promise.all(manifest.sources.map(async source=>{
          const r=await fetch('./data/'+source.file,{signal:AbortSignal.timeout(45000)});
          if(!r.ok)throw Error(source.name+'を取得できません');
          const buffer=await r.arrayBuffer();
          if(buffer.byteLength!==source.count*12)throw Error(source.name+'のデータが不完全です');
          const view=new DataView(buffer);
          for(let i=0;i<buffer.byteLength;i+=12){
            const lat=view.getUint32(i,true)/1e7,lng=view.getUint32(i+4,true)/1e7,d=view.getFloat32(i+8,true);
            if(lat<35.67||lat>35.755||lng<139.665||lng>139.755||!Number.isFinite(d)||d<0)throw Error('不正な数値を検出しました');
          }
          return {...source,view};
        }));
        this.datasets=datasets;this.manifest=manifest;this.createAtlas();this.status='ready';return this;
      })().catch(error=>{this.status='error';this.promise=null;this.datasets=[];this.atlas=null;throw error});
      return this.promise;
    }
    createAtlas(){
      const z=15, nw=this.project(35.7551,139.6649,z),se=this.project(35.6699,139.7551,z);
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(se.x-nw.x);canvas.height=Math.ceil(se.y-nw.y);
      const ctx=canvas.getContext('2d'), points=[];
      for(const {view} of this.datasets)for(let i=0;i<view.byteLength;i+=12){
        const depth=view.getFloat32(i+8,true);
        if(depth>=.1)points.push([view.getUint32(i,true)/1e7,view.getUint32(i+4,true)/1e7,depth]);
      }
      // Draw deeper samples last. This is a visual overview; query results retain each basin separately.
      points.sort((a,b)=>a[2]-b[2]);
      for(const [lat,lng,depth] of points){
        const p=this.project(lat+1/24000,lng-1/16000,z),q=this.project(lat-1/24000,lng+1/16000,z);
        ctx.fillStyle=color(depth);ctx.fillRect(p.x-nw.x,p.y-nw.y,q.x-p.x,q.y-p.y);
      }
      this.atlas={canvas,nw,z};
    }
    draw(ctx,map,opacity){
      if(!this.atlas)return;
      const {canvas,nw,z}=this.atlas, factor=2**(map.zoom-z),center=this.project(map.center.lat,map.center.lng,z);
      ctx.save();ctx.globalAlpha=opacity;ctx.imageSmoothingEnabled=false;
      ctx.drawImage(canvas,(nw.x-center.x)*factor+map.width/2,(nw.y-center.y)*factor+map.height/2,canvas.width*factor,canvas.height*factor);ctx.restore();
    }
    query(point){return this.datasets.map(source=>{const sample=nearest(source.view,point);return sample?{...sample,source:source.name,modelDate:source.modelDate}:null}).filter(Boolean)}
  }
  const api={cities,scale,color,nearest,Overlay};
  if(typeof module!=='undefined')module.exports=api;
  else window.MunicipalHazard=api;
})();
