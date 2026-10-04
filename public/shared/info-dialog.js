/* Native dialog: accessible focus handling, Escape, outside-click, home and close. */
(() => {
  const cfg = document.currentScript?.dataset;
  if (!cfg) return;
  const init = () => {
    const dialog=document.createElement('dialog');
    dialog.id='cost-info-dialog';
    dialog.style.cssText='max-width:min(620px,90vw);max-height:85vh;padding:24px;border:1px solid #cbd5e1;border-radius:16px;color:#0f172a;background:#fff';
    const title=document.createElement('h2');title.id='cost-info-title';title.style.cssText='font-size:20px;font-weight:bold;margin-bottom:14px';
    const body=document.createElement('div');body.style.cssText='white-space:pre-wrap;line-height:1.8;margin-bottom:16px';
    const home=document.createElement('a');home.href='/';home.textContent='ホームへ戻る';home.style.marginRight='20px';
    const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.onclick=()=>dialog.close();
    dialog.setAttribute('aria-labelledby',title.id);dialog.append(title,body,home,close);document.body.append(dialog);
    dialog.addEventListener('click', e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    let previous;
    dialog.addEventListener('close',()=>{document.body.style.overflow=previous;});
    const open=(kind)=>{
      title.textContent=kind==='manual'?'使い方':'リリースノート';
      body.textContent=kind==='manual'?[cfg.manual,window.COST_USAGE].filter(Boolean).join('\n\n'):
        (window.COST_RELEASE_NOTES || [{version:cfg.version,date:'2026-10-05',changes:[cfg.changes]}]).map(n=>`${n.version||n.ver||n.v}（${n.date}）\n${(n.changes || n.items || n.ja || []).join('\n')}`).join('\n\n');
      if(kind==='manual' && cfg.manualLink){const a=document.createElement('a');a.href=cfg.manualLink;a.textContent='詳しい取扱説明書';body.append(document.createElement('br'),a);}
      previous=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();
    };
    const attached=new WeakSet();
    const attach=()=>{for(const [selector,kind] of [[cfg.nameTarget,'manual'],[cfg.versionTarget,'release']]){
      for(const el of document.querySelectorAll(selector)) {if(attached.has(el))continue;attached.add(el);
      el.setAttribute('role','button');el.setAttribute('tabindex','0');
      // Capture intercepts old handlers, retaining existing markup and navigation elsewhere.
      el.addEventListener('click',e=>{if(kind==='manual' && e.target.closest(cfg.versionTarget))return;e.preventDefault();e.stopImmediatePropagation();open(kind);},true);
      el.addEventListener('keydown',e=>{if(kind==='manual' && e.target.closest(cfg.versionTarget))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();open(kind);}});
      }
    }};
    attach();
    new MutationObserver(attach).observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
