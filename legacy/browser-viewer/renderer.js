// Equidistant circular-fisheye projection, calibrated to these COMTEC recordings.
// Views change only the display; recorded pixels and original files are never edited.
const vertexSource = `
attribute vec2 position;
varying vec2 screen;
void main() {
  screen = position;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentSource = `
precision highp float;
varying vec2 screen;
uniform sampler2D frame;
uniform vec2 tangent;
uniform vec2 rotation;
void main() {
  vec3 ray = normalize(vec3(screen.x * tangent.x, screen.y * tangent.y, 1.0));
  float cp = cos(rotation.y), sp = sin(rotation.y);
  ray = vec3(ray.x, cp * ray.y + sp * ray.z, -sp * ray.y + cp * ray.z);
  float cy = cos(rotation.x), sy = sin(rotation.x);
  ray = vec3(cy * ray.x + sy * ray.z, ray.y, -sy * ray.x + cy * ray.z);
  float planar = length(ray.xy);
  float angle = atan(planar, ray.z);
  // A 240-degree lens spans the full image diameter, not its radius.
  float radius = angle / 4.18879020479;
  vec2 direction = planar > 0.00001 ? ray.xy / planar : vec2(0.0);
  vec2 uv = vec2(0.5) + radius * vec2(direction.x, -direction.y);
  if (radius > 0.5 || any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    gl_FragColor = vec4(0.055, 0.064, 0.067, 1.0);
  } else {
    gl_FragColor = vec4(texture2D(frame, uv).rgb, 1.0);
  }
}`;

const radians = Math.PI / 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class FisheyeView {
  constructor(canvas, video, { yaw = 0, pitch = 70, fov = 100, onChange = () => {} } = {}) {
    this.canvas = canvas;
    this.video = video;
    this.onChange = onChange;
    this.view = { yaw, pitch, fov };
    this.events = new AbortController();
    this.lost = false;
    this.destroyed = false;
    this.frameKey = null;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false });
    if (!this.gl) throw new Error('Interactive views require WebGL. Enable browser graphics acceleration or use another browser.');
    this.initialize();
    canvas.tabIndex = 0;
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    const options = { signal: this.events.signal };
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.lost = true;
      canvas.dispatchEvent(new CustomEvent('viewerror', { bubbles: true, detail: 'Graphics interrupted. Waiting for the browser to restore the camera view.' }));
    }, options);
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      try {
        this.initialize();
        this.draw();
        canvas.dispatchEvent(new CustomEvent('viewrestored', { bubbles: true }));
      } catch (error) {
        canvas.dispatchEvent(new CustomEvent('viewerror', { bubbles: true, detail: error.message }));
      }
    }, options);
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.pointer) return;
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.style.cursor = 'grabbing';
    }, options);
    canvas.addEventListener('pointermove', event => {
      if (this.pointer?.id !== event.pointerId) return;
      const scale = this.view.fov / Math.max(canvas.clientWidth, 1);
      this.setView({ yaw: this.view.yaw - (event.clientX - this.pointer.x) * scale,
        pitch: this.view.pitch + (event.clientY - this.pointer.y) * scale });
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
    }, options);
    const release = event => {
      if (this.pointer?.id !== event.pointerId) return;
      this.pointer = null;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerup', release, options);
    canvas.addEventListener('pointercancel', release, options);
    canvas.addEventListener('lostpointercapture', release, options);
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
      this.setView({ fov: this.view.fov + clamp(delta * 0.06, -12, 12) });
    }, { ...options, passive: false });
    canvas.addEventListener('keydown', event => {
      const step = event.shiftKey ? 12 : 4;
      const updates = {
        ArrowLeft: { yaw: this.view.yaw - step }, ArrowRight: { yaw: this.view.yaw + step },
        ArrowUp: { pitch: this.view.pitch + step }, ArrowDown: { pitch: this.view.pitch - step },
        '+': { fov: this.view.fov - 5 }, '=': { fov: this.view.fov - 5 }, '-': { fov: this.view.fov + 5 },
      };
      if (!updates[event.key]) return;
      event.preventDefault();
      event.stopPropagation();
      this.setView(updates[event.key]);
    }, options);
    // These also refresh a paused frame after seeking or selecting another recording.
    for (const event of ['loadeddata', 'seeked', 'emptied']) {
      video.addEventListener(event, () => { this.frameKey = null; this.draw(); }, options);
    }
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
  }

  initialize() {
    const gl = this.gl;
    const shaders = [];
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Camera shader could not compile: ${gl.getShaderInfoLog(shader)}`);
      }
      this.program = gl.createProgram();
      shaders.forEach(shader => gl.attachShader(this.program, shader));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(`Camera renderer could not start: ${gl.getProgramInfoLog(this.program)}`);
    } finally {
      shaders.forEach(shader => gl.deleteShader(shader));
    }
    gl.useProgram(this.program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.uniform1i(gl.getUniformLocation(this.program, 'frame'), 0);
    this.tangentUniform = gl.getUniformLocation(this.program, 'tangent');
    this.rotationUniform = gl.getUniformLocation(this.program, 'rotation');
    this.frameKey = null;
    gl.clearColor(0.055, 0.064, 0.067, 1);
  }

  setView(update) {
    for (const [key, value] of Object.entries(update)) {
      if (!Number.isFinite(value)) continue;
      if (key === 'yaw') this.view.yaw = ((value + 180) % 360 + 360) % 360 - 180;
      if (key === 'pitch') this.view.pitch = clamp(value, -110, 110);
      if (key === 'fov') this.view.fov = clamp(value, 35, 130);
    }
    this.dirty = true;
    this.draw();
    this.onChange(this.getView());
  }

  getView() { return { ...this.view }; }

  draw() {
    if (this.destroyed || this.lost) return;
    const { gl, canvas, video } = this;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2, 1920 / box.width);
    const width = Math.max(1, Math.round(box.width * ratio));
    const height = Math.max(1, Math.round(box.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      this.dirty = true;
    }
    gl.viewport(0, 0, width, height);
    if (video.readyState < 2 || !video.videoWidth) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    const decoded = video.getVideoPlaybackQuality?.().totalVideoFrames;
    const key = decoded ?? video.currentTime;
    if (this.frameKey === key && !this.dirty) return;
    gl.useProgram(this.program);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (this.frameKey !== key) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      this.frameKey = key;
    }
    const tanHorizontal = Math.tan(this.view.fov * radians / 2);
    gl.uniform2f(this.tangentUniform, tanHorizontal, tanHorizontal / (width / height));
    gl.uniform2f(this.rotationUniform, this.view.yaw * radians, this.view.pitch * radians);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.dirty = false;
  }

  destroy() {
    this.destroyed = true;
    this.events.abort();
    this.resizeObserver.disconnect();
    this.gl.deleteTexture(this.texture);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}
