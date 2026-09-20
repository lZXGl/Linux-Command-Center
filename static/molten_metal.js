/**
 * MoltenMetal Background Component for Vanilla JS + WebGL2 (Port 6999 Sandbox)
 * React Bits MoltenMetal shader.
 */
(function() {
    window.initMoltenMetal = function() {
        const oldCanvas = document.getElementById('bg-shader-canvas') || document.getElementById('molten-metal-canvas');
        if (oldCanvas) oldCanvas.remove();

        const container = document.createElement('div');
        container.id = 'molten-metal-canvas';
        container.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:none; z-index:-1; overflow:hidden;';
        document.body.prepend(container);

        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:100%; height:100%; display:block;';
        container.appendChild(canvas);

        const gl = canvas.getContext('webgl2', { alpha: true, antialias: false });
        if (!gl) return;

        const vsSource = `#version 300 es
        in vec2 position;
        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }`;

        const fsSource = `#version 300 es
        precision highp float;
        uniform vec2 iResolution;
        uniform float iTime;
        uniform float uSpeed;
        uniform float uScale;
        uniform float uDetail;
        uniform float uGlow;
        uniform float uCoreSize;
        uniform float uSwirl;
        uniform float uFold;
        uniform float uBlackPoint;
        uniform float uBrightness;
        uniform float uColorMode;
        uniform float uGrain;
        uniform float uGrainIntensity;
        uniform float uOpacity;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        out vec4 fragColor;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          float time = iTime * uSpeed;
          vec2 p = uScale * ((gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y) - 0.5;

          vec2 i = p;
          float c = 0.0;
          float r = length(p + vec2(sin(time), sin(time * 0.3 + 5.0)) * 0.5);
          float d = length(p);
          float rot = d + time + p.x * uSwirl;

          float cosRot = cos(rot);
          mat2 warp = mat2(cos(rot - sin(time / 5.0)), sin(rot), -sin(cosRot - time), cosRot) * uFold;
          float glowCore = uGlow * uCoreSize;

          for (float n = 0.0; n < 8.0; n++) {
            if (n >= uDetail) break;
            p *= warp;
            float t = r - time / (n + 3.0);
            i -= p + vec2(cos(t - i.x - r) + sin(t + i.y), sin(t - i.y) + cos(t + i.x) + r);
            c += glowCore / length(vec2(sin(i.x + t), cos(i.y + t)));
          }

          c /= 6.0;
          float intensity = max(c - uBlackPoint, 0.0) * uBrightness;
          float g = clamp(intensity, 0.0, 1.0);

          float mid = 0.5;
          vec3 col = mix(uColor1, uColor2, smoothstep(0.0, mid, g));
          col = mix(col, uColor3, smoothstep(mid, 1.0, g));

          float a = g;
          if (uGrain > 0.5) {
            float gr = hash(gl_FragCoord.xy + iTime);
            a += (gr - 0.5) * uGrainIntensity;
          }
          a = clamp(a, 0.0, 1.0) * uOpacity;
          fragColor = vec4(col * a, a);
        }`;

        function createShader(gl, type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            return shader;
        }

        const program = gl.createProgram();
        gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vsSource));
        gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fsSource));
        gl.linkProgram(program);

        const positionLoc = gl.getAttribLocation(program, 'position');
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

        const uniforms = {
            iResolution: gl.getUniformLocation(program, 'iResolution'),
            iTime: gl.getUniformLocation(program, 'iTime'),
            uSpeed: gl.getUniformLocation(program, 'uSpeed'),
            uScale: gl.getUniformLocation(program, 'uScale'),
            uDetail: gl.getUniformLocation(program, 'uDetail'),
            uGlow: gl.getUniformLocation(program, 'uGlow'),
            uCoreSize: gl.getUniformLocation(program, 'uCoreSize'),
            uSwirl: gl.getUniformLocation(program, 'uSwirl'),
            uFold: gl.getUniformLocation(program, 'uFold'),
            uBlackPoint: gl.getUniformLocation(program, 'uBlackPoint'),
            uBrightness: gl.getUniformLocation(program, 'uBrightness'),
            uColorMode: gl.getUniformLocation(program, 'uColorMode'),
            uGrain: gl.getUniformLocation(program, 'uGrain'),
            uGrainIntensity: gl.getUniformLocation(program, 'uGrainIntensity'),
            uOpacity: gl.getUniformLocation(program, 'uOpacity'),
            uColor1: gl.getUniformLocation(program, 'uColor1'),
            uColor2: gl.getUniformLocation(program, 'uColor2'),
            uColor3: gl.getUniformLocation(program, 'uColor3')
        };

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
        resize();
        window.addEventListener('resize', resize);

        const startTime = performance.now();

        function render() {
            const t = (performance.now() - startTime) * 0.001;
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

            gl.uniform2f(uniforms.iResolution, canvas.width, canvas.height);
            gl.uniform1f(uniforms.iTime, t);
            gl.uniform1f(uniforms.uSpeed, 0.35);
            gl.uniform1f(uniforms.uScale, 4.0);
            gl.uniform1f(uniforms.uDetail, 3.0);
            gl.uniform1f(uniforms.uGlow, 1.6);
            gl.uniform1f(uniforms.uCoreSize, 0.1);
            gl.uniform1f(uniforms.uSwirl, 1.0);
            gl.uniform1f(uniforms.uFold, -0.2);
            gl.uniform1f(uniforms.uBlackPoint, 0.05);
            gl.uniform1f(uniforms.uBrightness, 1.3);
            gl.uniform1f(uniforms.uColorMode, 0.0);
            gl.uniform1f(uniforms.uGrain, 1.0);
            gl.uniform1f(uniforms.uGrainIntensity, 0.05);
            gl.uniform1f(uniforms.uOpacity, 1.0);
            gl.uniform3f(uniforms.uColor1, 0.32, 0.15, 1.0);
            gl.uniform3f(uniforms.uColor2, 1.0, 0.62, 0.98);
            gl.uniform3f(uniforms.uColor3, 1.0, 1.0, 1.0);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            requestAnimationFrame(render);
        }
        render();
    };
})();
