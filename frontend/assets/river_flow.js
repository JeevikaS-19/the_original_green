// Water scene for the landing page. Visual indicator only, not a measurement.
// Call OGWater.update({currentTotal, withPlanTotal, unit}) or dispatch og:reduction.
// A null, missing or zero current total shows "Waiting for data", never zero.
var PHOTO = "assets/river/photo.jpg", MAPS = "assets/river/river_maps.png", FLOW = "assets/river/river_flow.png";
(function(){
var VS="attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
var FS="precision highp float;uniform sampler2D uP,uM,uF;uniform vec2 R,uCrop;uniform float uFy,uPh,uFlow,uD;"+
"float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}"+
"float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}"+
"float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}"+
"void main(){vec2 uv=gl_FragCoord.xy/R;vec2 iu=vec2(.5+(uv.x-.5)*uCrop.x,uFy+(uv.y-.5)*uCrop.y);"+
"vec3 ph=texture2D(uP,iu).rgb;vec3 mp=texture2D(uM,iu).rgb;vec2 f=(texture2D(uF,iu).rg-.5)*2.;f.y=-f.y;"+
"float rec=uD*.8;float wv=mp.r*smoothstep(rec-.1,rec+.08,mp.g);"+          // water recedes from the edges as D rises
"float t1=fract(uPh),t2=fract(uPh+.5);vec2 b=iu*vec2(14.,21.);"+
"float nz=mix(fbm(b-f*t1*2.2),fbm(b-f*t2*2.2),abs(2.*t1-1.));"+           // noise advected along the flow map
"float still=1.-uFlow;float l=dot(ph,vec3(.3,.59,.11));"+
"vec3 bed=vec3(.50,.44,.34)*(.55+.6*l);float ex=clamp(mp.r-wv,0.,1.);"+  // exposed wet bed
"vec3 col=mix(ph,bed,ex*.8);"+
"vec3 wc=mix(ph,vec3(.20,.30,.30)*(.7+.6*l),still*.55);"+                   // calmer, darker when still
"wc=mix(wc,vec3(.55,.62,.66),still*.12*(.5+.5*nz));"+
"wc+=vec3(.9,.95,1.)*smoothstep(.5,.78,nz)*(.12+.88*uFlow)*.5;"+           // moving whitewater
"col=mix(col,wc,wv);gl_FragColor=vec4(col,1.);}";
var cv=document.getElementById("river-c"),fb=document.getElementById("river-fb"),w=document.getElementById("river-w"),cap=document.getElementById("river-cap"),st=document.getElementById("river-st");
var visible=true;
var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches,BASE=.6,D=.5,Dt=.5,ph=0,last=performance.now(),IA=310/461,FOCUS=.62,ready=false,gl,U={};
function fail(){fb.src=PHOTO;fb.style.display="block";cv.style.display="none"}
function flowAmt(d){var t=Math.min(1,Math.max(0,(d-.12)/.6));return 1-t*t*(3-2*t)}   // 1 flowing, 0 stopped
function init(){
 gl=cv.getContext("webgl");if(!gl)return fail();
 function sh(t,s){var o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return gl.getShaderParameter(o,gl.COMPILE_STATUS)?o:null}
 var v=sh(gl.VERTEX_SHADER,VS),f=sh(gl.FRAGMENT_SHADER,FS);if(!v||!f)return fail();
 var p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.useProgram(p);
 var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
 var a=gl.getAttribLocation(p,"a");gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
 ["uP","uM","uF","R","uCrop","uFy","uPh","uFlow","uD"].forEach(function(n){U[n]=gl.getUniformLocation(p,n)});
 var srcs=[PHOTO,MAPS,FLOW],left=3;
 srcs.forEach(function(s,i){var im=new Image();im.onload=function(){
  gl.activeTexture(gl.TEXTURE0+i);var t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,im);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.uniform1i([U.uP,U.uM,U.uF][i],i);if(--left===0){ready=true;if(reduce)render();else requestAnimationFrame(frame)}};
  im.onerror=fail;im.src=s});
}
function render(){
 var r=Math.min(devicePixelRatio||1,2),W=Math.round(cv.clientWidth*r),H=Math.round(cv.clientHeight*r);
 if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H}gl.viewport(0,0,W,H);
 var ca=W/H,sx=ca>IA?1:ca/IA,sy=ca>IA?IA/ca:1,fy=Math.min(1-sy/2,Math.max(sy/2,1-FOCUS));
 gl.uniform2f(U.R,W,H);gl.uniform2f(U.uCrop,sx,sy);gl.uniform1f(U.uFy,fy);
 gl.uniform1f(U.uPh,ph);gl.uniform1f(U.uFlow,flowAmt(D));gl.uniform1f(U.uD,D);
 gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}
function frame(n){if(!visible){last=n;requestAnimationFrame(frame);return}var dt=Math.min(.1,(n-last)/1000);last=n;D+=(Dt-D)*.03;     // consumption eases in slowly
 ph+=dt*.4*flowAmt(D);                                                      // phase advances less as flow slows
 label();render();requestAnimationFrame(frame)}
function label(){var f=flowAmt(D);st.textContent=f<.04?"Not flowing.":f<.6?"Flow slowing.":"Flowing."}
function update(o){
 var c=o&&o.currentTotal!=null?Number(o.currentTotal):NaN,p=o&&o.withPlanTotal!=null?Number(o.withPlanTotal):NaN;
 if(!(c>0)){w.classList.add("nodata");st.textContent="";cap.textContent="Waiting for data. Missing data is not shown as zero.";return}
 if(!(p>=0))p=c;var ratio=Math.min(1.25,p/c),u=(o.unit||"t")+"";
 Dt=BASE*ratio;w.classList.remove("nodata");
 var plan=p===c?"No plan applied yet.":"With plan "+p.toFixed(1)+" "+u+".";
 cap.textContent="Current "+c.toFixed(1)+" "+u+". "+plan+" Visual indicator, not a measurement.";
 if(reduce&&ready){D=Dt;label();render()}
}
window.OGWater={update:update};
if("IntersectionObserver" in window){new IntersectionObserver(function(es){visible=es[0].isIntersecting}).observe(cv)}
window.addEventListener("og:reduction",function(e){update(e.detail)});
update(null);init();
if(location.search.indexOf("demo")<0){update({currentTotal:264,unit:"t"})}
if(location.search.indexOf("demo")>-1){var t0=performance.now();
 setInterval(function(){var k=(1-Math.cos((performance.now()-t0)/1000*2*Math.PI/30))/2;
  update({currentTotal:264,withPlanTotal:264*(1.2-1.15*k),unit:"t (demo)"})},200)}
})();

// Scroll: the scene comes into focus as its section moves through the viewport.
(function () {
  var sec = document.getElementById("before-after");
  if (!sec) return;
  var reducedNow = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function focus() {
    if (reducedNow) { sec.style.setProperty("--f", "1"); return; }
    var r = sec.getBoundingClientRect(), vh = window.innerHeight || 1;
    var p = (vh - r.top) / (vh * 0.9);
    sec.style.setProperty("--f", Math.max(0, Math.min(1, p)).toFixed(3));
  }
  window.addEventListener("scroll", focus, { passive: true });
  window.addEventListener("resize", focus);
  focus();
})();
