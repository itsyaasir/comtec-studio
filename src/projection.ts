import { cameraBasis } from "./camera-model";
/** Independent rectilinear views of an equidistant 240° circular camera image. */
export class Lens {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private buffer: WebGLBuffer;
  private observer: ResizeObserver;
  private events = new AbortController();
  private dirty = true;
  private lastTime = -1;
  private lost = false;
  private drag?: { id: number; x: number; y: number };
  yaw = 0;
  roll = 0;
  mode: "perspective" | "panorama" | "round" = "perspective";
  pitch: number;
  fov: number;
  constructor(
    private canvas: HTMLCanvasElement,
    private video: HTMLVideoElement,
    private defaults: {
      pitch: number;
      fov: number;
      yaw?: number;
      roll?: number;
    },
    private changed: (fov: number) => void,
    private failed: (message: string) => void,
  ) {
    this.pitch = defaults.pitch;
    this.roll = defaults.roll ?? 0;
    this.yaw = defaults.yaw ?? 0;
    this.fov = defaults.fov;
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
    });
    if (!gl)
      throw Error(
        "The camera renderer could not start. Restart the application.",
      );
    this.gl = gl;
    this.program = gl.createProgram()!;
    this.texture = gl.createTexture()!;
    this.buffer = gl.createBuffer()!;
    this.setup();
    canvas.addEventListener(
      "webglcontextlost",
      (e) => {
        e.preventDefault();
        this.lost = true;
        failed("Graphics interrupted. Restoring camera views…");
      },
      { signal: this.events.signal },
    );
    canvas.addEventListener(
      "webglcontextrestored",
      () => {
        this.lost = false;
        this.program = gl.createProgram()!;
        this.texture = gl.createTexture()!;
        this.buffer = gl.createBuffer()!;
        try {
          this.setup();
          this.render(true);
          failed("");
        } catch (e) {
          failed(String(e));
        }
      },
      { signal: this.events.signal },
    );
    canvas.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button !== 0) return;
        canvas.focus();
        canvas.setPointerCapture(e.pointerId);
        this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      },
      { signal: this.events.signal },
    );
    canvas.addEventListener(
      "pointermove",
      (e) => {
        if (this.drag?.id !== e.pointerId) return;
        const scale = this.fov / canvas.clientWidth;
        this.yaw -= (e.clientX - this.drag.x) * scale;
        this.pitch += (e.clientY - this.drag.y) * scale;
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        this.update();
      },
      { signal: this.events.signal },
    );
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(
        type,
        () => {
          this.drag = undefined;
        },
        { signal: this.events.signal },
      );
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.fov += Math.sign(e.deltaY) * 3;
        this.update();
      },
      { passive: false, signal: this.events.signal },
    );
    canvas.addEventListener(
      "keydown",
      (e) => {
        const map: Record<string, () => void> = {
          ArrowLeft: () => (this.yaw -= 5),
          ArrowRight: () => (this.yaw += 5),
          ArrowUp: () => (this.pitch += 5),
          ArrowDown: () => (this.pitch -= 5),
          "+": () => (this.fov -= 5),
          "=": () => (this.fov -= 5),
          "-": () => (this.fov += 5),
        };
        if (map[e.key]) {
          e.preventDefault();
          e.stopPropagation();
          map[e.key]();
          this.update();
        }
      },
      { signal: this.events.signal },
    );
    for (const type of ["seeked", "loadeddata", "emptied"])
      video.addEventListener(type, () => this.render(true), {
        signal: this.events.signal,
      });
    this.observer = new ResizeObserver(() => this.render(true));
    this.observer.observe(canvas);
  }
  destroy() {
    this.events.abort();
    this.observer.disconnect();
    this.gl.deleteTexture(this.texture);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
  private setup() {
    const gl = this.gl;
    const sources: [number, string][] = [
      [
        gl.VERTEX_SHADER,
        `attribute vec2 point; varying vec2 plane; void main(){plane=point;gl_Position=vec4(point,0.,1.);}`,
      ],
      [
        gl.FRAGMENT_SHADER,
        `precision highp float; varying vec2 plane; uniform sampler2D source; uniform mat3 basis; uniform float fov; uniform float aspect; uniform int mode;
      void main(){
      if(mode==2){vec2 q=plane*vec2(max(aspect,1.),max(1./aspect,1.));vec2 uv=vec2(.5)+vec2(q.x,-q.y)*.5;gl_FragColor=length(q)>1.?vec4(.04,.045,.05,1.):vec4(texture2D(source,uv).rgb,1.);return;}
      float t=tan(radians(fov)*.5);vec3 d=normalize(vec3(plane.x*t,plane.y*t/aspect,1.));
      if(mode==1){float longitude=plane.x*radians(100.);float latitude=plane.y*radians(48.);d=vec3(sin(longitude)*cos(latitude),sin(latitude),cos(longitude)*cos(latitude));}
      d=basis*d;
      float a=atan(length(d.xy),d.z);float r=a/radians(240.);vec2 n=length(d.xy)>.00001?normalize(d.xy):vec2(0.);
      vec2 uv=vec2(.5)+r*vec2(n.x,-n.y);gl_FragColor=r>.5?vec4(.04,.045,.05,1.):vec4(texture2D(source,uv).rgb,1.);}`,
      ],
    ];
    for (const [type, source] of sources) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(shader) || "Camera shader failed");
      gl.attachShader(this.program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw Error("Camera renderer failed to link");
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const location = gl.getAttribLocation(this.program, "point");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(this.program, "source"), 0);
    gl.clearColor(0.04, 0.045, 0.05, 1);
    this.lastTime = -1;
  }
  update() {
    this.pitch = Math.max(-110, Math.min(110, this.pitch));
    this.yaw = ((((this.yaw + 180) % 360) + 360) % 360) - 180;
    this.fov = Math.max(35, Math.min(130, this.fov));
    this.changed(this.fov);
    this.render(true);
  }
  reset() {
    this.yaw = this.defaults.yaw ?? 0;
    this.roll = this.defaults.roll ?? 0;
    this.pitch = this.defaults.pitch;
    this.fov = this.defaults.fov;
    this.update();
  }
  render(force = false) {
    if (this.lost) return;
    const { gl, canvas, video } = this;
    const ratio = Math.min(devicePixelRatio, 2);
    const w = Math.round(canvas.clientWidth * ratio),
      h = Math.round(canvas.clientHeight * ratio);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this.dirty = true;
    }
    if (force) this.dirty = true;
    if (!this.dirty && video.currentTime === this.lastTime) return;
    gl.viewport(0, 0, w, h);
    if (video.readyState < 2) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    gl.useProgram(this.program);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (this.lastTime !== video.currentTime || force) {
      try {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGB,
          gl.RGB,
          gl.UNSIGNED_BYTE,
          video,
        );
      } catch {
        this.failed(
          "The camera frame could not be rendered. Select the recording to retry.",
        );
        return;
      }
      this.lastTime = video.currentTime;
    }
    gl.uniformMatrix3fv(
      gl.getUniformLocation(this.program, "basis"),
      false,
      cameraBasis(this.pitch, this.yaw, this.roll),
    );
    gl.uniform1f(gl.getUniformLocation(this.program, "fov"), this.fov);
    gl.uniform1i(
      gl.getUniformLocation(this.program, "mode"),
      this.mode === "round" ? 2 : this.mode === "panorama" ? 1 : 0,
    );
    gl.uniform1f(gl.getUniformLocation(this.program, "aspect"), w / h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.dirty = false;
  }
}
