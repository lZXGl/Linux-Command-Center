/**
 * PrismaticBurst Background Component for Vanilla JS + WebGL2 (Port 6999 Sandbox)
 * React Bits PrismaticBurst 3D Ray Burst shader.
 */
(function() {
    window.initPrismaticBurst = function() {
        const oldCanvas = document.getElementById('bg-shader-canvas') || document.getElementById('prismatic-canvas');
        if (oldCanvas) oldCanvas.remove();

        const container = document.createElement('div');
        container.id = 'prismatic-canvas';
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
        precision highp int;

        out vec4 fragColor;
        uniform vec2  uResolution;
        uniform float uTime;
        uniform float uIntensity;
        uniform float uSpeed;
        uniform int   uAnimType;
        uniform float uDistort;

        float hash21(vec2 p){
            p = floor(p);
            float f = 52.9829189 * fract(dot(p, vec2(0.065, 0.005)));
            return fract(f);
        }

        mat2 rot30(){ return mat2(0.8, -0.5, 0.5, 0.8); }

        float layeredNoise(vec2 fragPx){
            vec2 p = mod(fragPx + vec2(uTime * 30.0, -uTime * 21.0), 1024.0);
            vec2 q = rot30() * p;
            float n = 0.0;
            n += 0.40 * hash21(q);
            n += 0.25 * hash21(q * 2.0 + 17.0);
            n += 0.20 * hash21(q * 4.0 + 47.0);
            return n;
        }

        vec3 rayDir(vec2 frag, vec2 res, float dist){
            float focal = res.y * max(dist, 1e-3);
            return normalize(vec3(2.0 * frag - res, focal));
        }

        mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c); }
        mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c); }
        mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,-s,0.0, s,c,0.0, 0.0,0.0,1.0); }

        void main(){
            vec2 frag = gl_FragCoord.xy;
            float t = uTime * uSpeed;
            vec3 dir = rayDir(frag, uResolution, 1.0);
            float marchT = 0.0;
            vec3 col = vec3(0.0);
            float n = layeredNoise(frag);

            vec3 ang = vec3(t * 0.31, t * 0.21, t * 0.17);
            mat3 rot3dMat = rotZ(ang.z) * rotY(ang.y) * rotX(ang.x);

            for (int i = 0; i < 32; ++i) {
                vec3 P = marchT * dir;
                P.z -= 2.0;
                float rad = length(P);
                vec3 Pl = rot3dMat * P * (10.0 / max(rad, 1e-6));

                float stepLen = min(rad - 0.3, n * 0.08) + 0.12;

                float rayPattern = smoothstep(
                    0.5, 0.7,
                    sin(Pl.x + cos(Pl.y) * cos(Pl.z)) *
                    sin(Pl.z + sin(Pl.y) * cos(Pl.x + t))
                );

                vec3 spectral = 0.5 + 0.5 * vec3(
                    cos(marchT * 3.0 + 0.0),
                    cos(marchT * 3.0 + 1.0),
                    cos(marchT * 3.0 + 2.0)
                );
                vec3 base = (0.05 / (0.4 + stepLen)) * smoothstep(5.0, 0.0, rad) * spectral;

                col += base * rayPattern;
                marchT += stepLen;
            }

            col *= uIntensity * 0.4;
            fragColor = vec4(clamp(col, 0.0, 1.0), 0.75);
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
            uResolution: gl.getUniformLocation(program, 'uResolution'),
            uTime: gl.getUniformLocation(program, 'uTime'),
            uIntensity: gl.getUniformLocation(program, 'uIntensity'),
            uSpeed: gl.getUniformLocation(program, 'uSpeed'),
            uAnimType: gl.getUniformLocation(program, 'uAnimType'),
            uDistort: gl.getUniformLocation(program, 'uDistort')
        };

        function resize() {
            canvas.width = Math.floor(window.innerWidth * 0.7);
            canvas.height = Math.floor(window.innerHeight * 0.7);
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

            gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
            gl.uniform1f(uniforms.uTime, t);
            gl.uniform1f(uniforms.uIntensity, 1.8);
            gl.uniform1f(uniforms.uSpeed, 0.4);
            gl.uniform1i(uniforms.uAnimType, 1);
            gl.uniform1f(uniforms.uDistort, 1.0);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            requestAnimationFrame(render);
        }
        render();
    };
})();
