import mermaid from 'mermaid';

export async function init(el, slide, state) {
  let index=0;
  const aside=el.parentElement.querySelector('.diagram-detail');
  const show = () => {
    const step=slide.diagram.steps[index];
    aside.querySelector('.step-count').textContent=`${String(index+1).padStart(2,'0')} / ${String(slide.diagram.steps.length).padStart(2,'0')}`;
    aside.querySelector('h3').textContent=step.title;
    aside.querySelector('.step-description').textContent=step.detail;
    el.querySelectorAll('.node').forEach(n=>n.classList.toggle('active-node',n.id.startsWith(`flowchart-${step.node}-`)));
  };
  const render=async()=>{
    const t=state.theme.colors;
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',fontFamily:state.font.family,deterministicIds:true,deterministicIDSeed:slide.id,flowchart:{htmlLabels:false,curve:'linear',useMaxWidth:true},themeVariables:{primaryColor:t.surface,primaryTextColor:t.foreground,primaryBorderColor:t.accent,lineColor:t.muted,secondaryColor:t.background,tertiaryColor:t.surface,fontSize:'22px'}});
    const {svg}=await mermaid.render(`mermaid-${slide.id}`,slide.diagram.code);
    el.innerHTML=svg;
    el.querySelector('svg').setAttribute('aria-label',slide.title);
    for (const node of el.querySelectorAll('.node')) {
      const i=slide.diagram.steps.findIndex(s=>node.id.startsWith(`flowchart-${s.node}-`));
      if(i>=0){node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label',slide.diagram.steps[i].title);node.onclick=()=>{index=i;show();};node.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();index=i;show();}};}
    }
    show();
  };
  aside.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{index=(index+Number(b.dataset.step)+slide.diagram.steps.length)%slide.diagram.steps.length;show();});
  await render();
  return {update:render,freeze:()=>{index=0;show();el.classList.add('frozen');},restore:()=>el.classList.remove('frozen')};
}
