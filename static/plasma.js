/**
 * Plasma Background Component for Vanilla JS + WebGL2 (Port 6999 Sandbox)
 * React Bits Volumetric Raymarched Plasma shader.
 */
(function() {
    window.initPlasma = function() {
        const oldCanvas = document.getElementById('bg-shader-canvas') || document.getElementById('plasma-canvas');
        if (oldCanvas) oldCanvas.remove();

        const container = document.createElement('div');
        container.id = 'plasma-canvas';
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
        uniform vec3 uCustomColor;
        uniform float uUseCustomColor;
        uniform float uSpeed;
        uniform float uDirection;
        uniform float uScale;   
        uniform float uOpacity;
        uniform vec2 uMouse;
        uniform float uMouseInteractive;
        uniform float uQuality;
        uniform float uStepScale;
        out vec4 fragColor;

        void mainImage(out vec4 o, vec2 C) {
          vec2 center = iResolution.xy * 0.5;
          C = (C - center) / uScale + center;
          
          vec2 mouseOffset = (uMouse - center) * 0.0002;
          C += mouseOffset * length(C - center) * step(0.5, uMouseInteractive);
          
          float i, d, z, T = iTime * uSpeed * uDirection;
          vec3 O, p, S;

          for (vec2 r = iResolution.xy, Q; ++i < 60.0; O += o.w/d*o.xyz) {
            p = z*normalize(vec3(C-.5*r,r.y)); 
            p.z -= 4.; 
            S = p;
            d = p.y-T;
            
            p.x += .4*(1.+p.y)*sin(d + p.x*0.1)*cos(.34*d + p.x*0.05); 
            Q = p.xz *= mat2(cos(p.y+vec4(0,11,33,0)-T)); 
            z += d = (abs(sqrt(length(Q*Q)) - .25*(5.+S.y))/3.+8e-4) * uStepScale;
            o = 1.+sin(S.y+p.z*.5+S.z-length(S-p)+vec4(2,1,0,8));
            if (i >= uQuality) break;
          }
          
          o.xyz = tanh(O/1e4);
        }

        bool finite1(float x){ return !(isnan(x) || isinf(x)); }
        vec3 sanitize(vec3 c){
          return vec3(
            finite1(c.r) ? c.r : 0.0,
            finite1(c.g) ? c.g : 0.0,
            finite1(c.b) ? c.b : 0.0
          );
        }

        void main() {
          vec4 o = vec4(0.0);
          mainImage(o, gl_FragCoord.xy);
          vec3 rgb = sanitize(o.rgb);
          
          float intensity = (rgb.r + rgb.g + rgb.b) / 3.0;
          vec3 customColor = intensity * uCustomColor;
          vec3 finalColor = mix(rgb, customColor, step(0.5, uUseCustomColor));
          
          float alpha = length(rgb) * uOpacity;
          fragColor = vec4(finalColor * 0.8, alpha * 0.75);
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
            uCustomColor: gl.getUniformLocation(program, 'uCustomColor'),
            uUseCustomColor: gl.getUniformLocation(program, 'uUseCustomColor'),
            uSpeed: gl.getUniformLocation(program, 'uSpeed'),
            uDirection: gl.getUniformLocation(program, 'uDirection'),
            uScale: gl.getUniformLocation(program, 'uScale'),
            uOpacity: gl.getUniformLocation(program, 'uOpacity'),
            uMouse: gl.getUniformLocation(program, 'uMouse'),
            uMouseInteractive: gl.getUniformLocation(program, 'uMouseInteractive'),
            uQuality: gl.getUniformLocation(program, 'uQuality'),
            uStepScale: gl.getUniformLocation(program, 'uStepScale')
        };

        function resize() {
            canvas.width = Math.floor(window.innerWidth * 0.6);
            canvas.height = Math.floor(window.innerHeight * 0.6);
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
            gl.uniform3f(uniforms.uCustomColor, 1.0, 0.42, 0.21);
            gl.uniform1f(uniforms.uUseCustomColor, 1.0);
            gl.uniform1f(uniforms.uSpeed, 0.3);
            gl.uniform1f(uniforms.uDirection, 1.0);
            gl.uniform1f(uniforms.uScale, 1.1);
            gl.uniform1f(uniforms.uOpacity, 0.8);
            gl.uniform2f(uniforms.uMouse, canvas.width / 2, canvas.height / 2);
            gl.uniform1f(uniforms.uMouseInteractive, 0.0);
            gl.uniform1f(uniforms.uQuality, 40.0);
            gl.uniform1f(uniforms.uStepScale, 1.5);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            requestAnimationFrame(render);
        }
        render();
    };
})();
