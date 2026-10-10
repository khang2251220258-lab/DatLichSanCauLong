import { useEffect, useId, useRef } from 'react';

const focusable = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AccessibleModal({ title, description, busy=false, onClose, className='', backdropClass='', children }) {
  const titleId=useId(),descriptionId=useId(),dialog=useRef(null),returnFocus=useRef(typeof document==='undefined'?null:document.activeElement);
  useEffect(()=>{
    const root=dialog.current,focusTarget=returnFocus.current,first=root?.querySelector('[autofocus]')||root?.querySelector(focusable);
    first?.focus();
    const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=previousOverflow;focusTarget?.focus?.();};
  },[]);
  function keyDown(event){
    if(event.key==='Escape'&&!busy){event.preventDefault();onClose();return;}
    if(event.key!=='Tab')return;
    const items=[...dialog.current.querySelectorAll(focusable)];
    if(!items.length){event.preventDefault();dialog.current.focus();return;}
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  return <div className={backdropClass} role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <section ref={dialog} className={className} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description?descriptionId:undefined} tabIndex={-1} onKeyDown={keyDown}>
      <h2 id={titleId}>{title}</h2>{description&&<p id={descriptionId}>{description}</p>}{children}
    </section>
  </div>;
}
