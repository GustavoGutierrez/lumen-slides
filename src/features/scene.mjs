import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PLATE=[640,184],COLUMN=1.62,ROWS=4.5,DEPTH=1.05;
// The plate is drawn on a canvas because three.js has no text: a sprite keeps it facing the camera,
// so the sequence stays readable at every angle of the sway.
function plateTexture(step, index, active, theme, family) {
  const canvas=document.createElement('canvas');canvas.width=PLATE[0];canvas.height=PLATE[1];
  const g=canvas.getContext('2d'),w=PLATE[0]-12,h=PLATE[1]-12;
  g.translate(6,6);g.beginPath();g.roundRect(0,0,w,h,38);
  g.fillStyle=theme.surface;g.globalAlpha=active?1:.9;g.fill();g.globalAlpha=1;
  g.lineWidth=active?12:5;g.strokeStyle=active?theme.accent:theme.muted;g.stroke();
  g.textBaseline='middle';
  const number=String(index+1).padStart(2,'0');
  g.font=`600 56px ${family},sans-serif`;g.fillStyle=theme.accent;g.fillText(number,36,h/2+2);
  const x=36+g.measureText(number).width+26;
  // Long Spanish labels must not spill out of the plate, so the title shrinks until it fits.
  let size=58;do{g.font=`600 ${size}px ${family},sans-serif`;size-=2;}while(size>24&&g.measureText(step.title).width>w-x-30);
  g.fillStyle=active?theme.foreground:theme.muted;g.fillText(step.title,x,h/2+2);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
export async function init(el, slide, state) {
  const steps=slide.scene.steps??null,loop=slide.scene.loop===true;
  const detail=steps?el.parentElement.querySelector('.scene-detail'):null;
  let index=0,paint=()=>{};
  const show=()=>{
    detail.querySelector('.step-count').textContent=`${String(index+1).padStart(2,'0')} / ${String(steps.length).padStart(2,'0')}`;
    detail.querySelector('h3').textContent=steps[index].title;
    detail.querySelector('.step-description').textContent=steps[index].detail;
    paint();
  };
  // The stepper is wired before WebGL so it keeps working when the canvas never appears.
  if(steps){detail.querySelectorAll('[data-scene-step]').forEach(b=>b.onclick=()=>{index=(index+Number(b.dataset.sceneStep)+steps.length)%steps.length;show();});show();}
  const canvas=document.createElement('canvas');
  let renderer;
  try {
    const context=canvas.getContext('webgl2',{antialias:true,alpha:true,preserveDrawingBuffer:true});
    if (!context) throw new Error('WebGL2 is unavailable');
    renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,alpha:true,preserveDrawingBuffer:true});
  } catch {
    el.classList.add('no-webgl');
    state.warnings.push(`${slide.id}: WebGL2 unavailable; accessible fallback shown`);
    const b=document.querySelector(`.scene-toggle[data-for="${slide.id}"]`);b.disabled=true;b.textContent='Vista descriptiva';
    // Nothing can be dragged without a canvas; the stepper wired above still works.
    el.parentElement.querySelector('.interaction-hint').hidden=true;
    return {};
  }
  el.querySelector('.scene-fallback').hidden=true;el.appendChild(renderer.domElement);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(650,430);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(40,650/430,0.1,100);camera.position.set(...(steps?[0,0,9]:[7,4,8]));
  const group=new THREE.Group();scene.add(group);
  const materials=[];
  const material=(secondary=false)=>{const m=new THREE.MeshStandardMaterial({color:secondary?state.theme.colors.secondary:state.theme.colors.accent,roughness:0.35,metalness:0.15});materials.push([m,secondary]);return m;};
  if(steps) {
    // Reading order carries the sequence: the chain descends row by row and alternates side and depth,
    // so no plate hides another and the eye follows 01..n without the caption.
    // The ladder is compressed for a long chain so the first and last plate never leave the frame.
    const row=Math.min(.9,ROWS/(steps.length-1)),at=i=>new THREE.Vector3(i%2?COLUMN:-COLUMN,((steps.length-1)/2-i)*row,i%2?-DEPTH:DEPTH);
    const plates=steps.map((step,i)=>{
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:plateTexture(step,i,i===index,state.theme.colors,state.font.family),transparent:true,depthWrite:false}));
      sprite.scale.set(2.6,2.6*PLATE[1]/PLATE[0],1);sprite.position.copy(at(i));group.add(sprite);return sprite;
    });
    // Every link ends in a cone: direction is what turns a column of labels into an order.
    const links=[];
    for(let i=0;i<steps.length-1;i++) {
      const a=at(i),b=at(i+1),dir=b.clone().sub(a).normalize(),from=a.clone().addScaledVector(dir,1.5),to=b.clone().addScaledVector(dir,-1.5);
      const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
      const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,from.distanceTo(to),12),material(true));
      shaft.position.copy(from.clone().add(to).multiplyScalar(.5));shaft.quaternion.copy(q);group.add(shaft);
      const head=new THREE.Mesh(new THREE.ConeGeometry(.14,.34,16),material(true));head.position.copy(to);head.quaternion.copy(q);group.add(head);
      links.push([shaft,head]);
    }
    if(loop) {
      // The return edge only exists when the deck states the cycle; it sweeps in front so it reads as feedback.
      const a=at(steps.length-1),b=at(0),side=a.x<0?-1:1;
      const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(a.x+side*1.5,a.y,a.z),new THREE.Vector3(side*4.25,0,2.6),new THREE.Vector3(b.x+side*1.5,b.y,b.z));
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,48,.03,10,false),material(true)));
      const end=curve.getPoint(1),dir=end.clone().sub(curve.getPoint(.96)).normalize();
      const head=new THREE.Mesh(new THREE.ConeGeometry(.13,.32,16),material(true));
      head.position.copy(end);head.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);group.add(head);
    }
    paint=()=>{
      plates.forEach((sprite,i)=>{
        sprite.material.map.dispose();sprite.material.map=plateTexture(steps[i],i,i===index,state.theme.colors,state.font.family);
        const scale=i===index?2.85:2.6;sprite.scale.set(scale,scale*PLATE[1]/PLATE[0],1);
      });
      links.forEach(([shaft,head],i)=>{for(const m of [shaft,head])m.material.color.set(i===index?state.theme.colors.accent:state.theme.colors.secondary);});
      render();
    };
  } else if(slide.scene.kind==='robot') {
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.7,.45,32),material(true));base.position.y=-1.8;group.add(base);
    const joints=[[0,-1.4,0],[0,.4,0],[1.5,1.1,0],[2.3,1.1,0]];
    joints.forEach(p=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(.3,24,16),material());mesh.position.set(...p);group.add(mesh);});
    joints.slice(1).forEach((p,i)=>{const a=new THREE.Vector3(...joints[i]),b=new THREE.Vector3(...p);const m=new THREE.Mesh(new THREE.CylinderGeometry(.2,.24,a.distanceTo(b),24),material(true));m.position.copy(a.clone().add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());group.add(m);});
  } else {
    const points=[];
    [3,5,4,2].forEach((count,layer)=>{for(let n=0;n<count;n++){const p=new THREE.Vector3((layer-1.5)*1.65,(n-(count-1)/2)*1.05,0);points.push({layer,p});const mesh=new THREE.Mesh(new THREE.SphereGeometry(.19,20,16),material(layer%2===0));mesh.position.copy(p);group.add(mesh);}});
    for(const a of points)for(const b of points)if(b.layer===a.layer+1){const geometry=new THREE.BufferGeometry().setFromPoints([a.p,b.p]);group.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:state.theme.colors.muted,transparent:true,opacity:.38})));}
  }
  scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(4,8,6);scene.add(light);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=false;controls.minDistance=5;controls.maxDistance=16;
  if(steps){renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label',slide.scene.caption);}
  let active=state.printing,paused=state.reduced||state.printing,frozen=false,last=0,elapsed=0;
  const render=()=>renderer.render(scene,camera);
  render();
  renderer.setAnimationLoop(t=>{const dt=last?Math.min((t-last)/1000,.05):0;last=t;if(active&&!document.hidden&&!frozen&&!paused){
    // A full spin would turn the plates edge-on; the ordered chain only sways.
    if(steps){elapsed+=dt;group.rotation.y=Math.sin(elapsed*.34)*.12;}else group.rotation.y+=dt*.18;
    controls.update();render();}});
  const button=document.querySelector(`.scene-toggle[data-for="${slide.id}"]`);
  const updateButton=()=>{button.textContent=paused?'Reanudar giro':'Pausar giro';button.setAttribute('aria-pressed',String(!paused));};updateButton();
  button.onclick=()=>{paused=!paused;updateButton();};
  controls.addEventListener('change',render);
  if(steps)paint();
  let snapshot;
  return {
    update:()=>{for(const[m,secondary]of materials)m.color.set(secondary?state.theme.colors.secondary:state.theme.colors.accent);scene.traverse(x=>{if(x.isLine)x.material.color.set(state.theme.colors.muted);});if(steps)paint();render();},
    onSlide:id=>{active=id===slide.id;},
    freeze:()=>{frozen=true;group.rotation.set(0,0,0);camera.position.set(...(steps?[0,0,9]:[7,4,8]));controls.target.set(0,0,0);controls.update();if(steps){index=0;show();}render();snapshot??=document.createElement('img');snapshot.className='scene-snapshot';snapshot.alt=slide.scene.caption;snapshot.src=renderer.domElement.toDataURL('image/png');if(!snapshot.parentElement)el.appendChild(snapshot);},
    restore:()=>{frozen=false;snapshot?.remove();}
  };
}
