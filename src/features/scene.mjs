import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export async function init(el, slide, state) {
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
    return {};
  }
  el.querySelector('.scene-fallback').hidden=true;el.appendChild(renderer.domElement);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(650,430);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(40,650/430,0.1,100);camera.position.set(7,4,8);
  const group=new THREE.Group();scene.add(group);
  const materials=[];
  const material=(secondary=false)=>{const m=new THREE.MeshStandardMaterial({color:secondary?state.theme.colors.secondary:state.theme.colors.accent,roughness:0.35,metalness:0.15});materials.push([m,secondary]);return m;};
  if(slide.scene.kind==='robot') {
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
  let active=state.printing,paused=state.reduced||state.printing,frozen=false,last=0;
  const render=()=>renderer.render(scene,camera);
  render();
  renderer.setAnimationLoop(t=>{const dt=last?Math.min((t-last)/1000,.05):0;last=t;if(active&&!document.hidden&&!frozen&&!paused){group.rotation.y+=dt*.18;controls.update();render();}});
  const button=document.querySelector(`.scene-toggle[data-for="${slide.id}"]`);
  const updateButton=()=>{button.textContent=paused?'Reanudar giro':'Pausar giro';button.setAttribute('aria-pressed',String(!paused));};updateButton();
  button.onclick=()=>{paused=!paused;updateButton();};
  controls.addEventListener('change',render);
  let snapshot;
  return {
    update:()=>{for(const[m,secondary]of materials)m.color.set(secondary?state.theme.colors.secondary:state.theme.colors.accent);scene.traverse(x=>{if(x.isLine)x.material.color.set(state.theme.colors.muted);});render();},
    onSlide:id=>{active=id===slide.id;},
    freeze:()=>{frozen=true;group.rotation.set(0,0,0);camera.position.set(7,4,8);controls.target.set(0,0,0);controls.update();render();snapshot??=document.createElement('img');snapshot.className='scene-snapshot';snapshot.alt=slide.scene.caption;snapshot.src=renderer.domElement.toDataURL('image/png');if(!snapshot.parentElement)el.appendChild(snapshot);},
    restore:()=>{frozen=false;snapshot?.remove();}
  };
}
