/**
 * Silk Background Component for Vanilla JS + Three.js (Port 6999 Sandbox)
 * Renders a slow, flowing metallic silk wave shader background in muted purple/slate.
 */
(function() {
    window.initSilk = function() {
        const oldCanvas = document.getElementById('bg-shader-canvas') || document.getElementById('silk-canvas');
        if (oldCanvas) oldCanvas.remove();

        const container = document.createElement('div');
        container.id = 'silk-canvas';
        container.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:auto; z-index:-1; overflow:hidden;';
        document.body.prepend(container);

        function hexToNormalizedRGB(hex) {
            hex = hex.replace('#', '');
            return [
                parseInt(hex.slice(0, 2), 16) / 255,
                parseInt(hex.slice(2, 4), 16) / 255,
                parseInt(hex.slice(4, 6), 16) / 255
            ];
        }

        const vertexShader = `
        varying vec2 vUv;
        varying vec3 vPosition;

        void main() {
          vPosition = position;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
        `;

        const fragmentShader = `
        varying vec2 vUv;
        varying vec3 vPosition;

        uniform float uTime;
        uniform vec3  uColor;
        uniform float uSpeed;
        uniform float uScale;
        uniform float uRotation;
        uniform float uNoiseIntensity;

        const float e = 2.71828182845904523536;

        float noise(vec2 texCoord) {
          float G = e;
          vec2  r = (G * sin(G * texCoord));
          return fract(r.x * r.y * (1.0 + texCoord.x));
        }

        vec2 rotateUvs(vec2 uv, float angle) {
          float c = cos(angle);
          float s = sin(angle);
          mat2  rot = mat2(c, -s, s, c);
          return rot * uv;
        }

        void main() {
          float rnd        = noise(gl_FragCoord.xy);
          vec2  uv         = rotateUvs(vUv * uScale, uRotation);
          vec2  tex        = uv * uScale;
          float tOffset    = uSpeed * uTime;

          tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

          float pattern = 0.6 +
                          0.4 * sin(5.0 * (tex.x + tex.y +
                                           cos(3.0 * tex.x + 5.0 * tex.y) +
                                           0.02 * tOffset) +
                                   sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

          vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
          col.a = 1.0;
          gl_FragColor = col;
        }
        `;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        camera.position.z = 1;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        container.appendChild(renderer.domElement);

        const colorHex = '#7B7481';
        const rgb = hexToNormalizedRGB(colorHex);

        const uniforms = {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(rgb[0], rgb[1], rgb[2]) },
            uSpeed: { value: 2.5 },
            uScale: { value: 0.8 },
            uRotation: { value: 0.19 },
            uNoiseIntensity: { value: 1.2 }
        };

        const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader,
            fragmentShader
        });

        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        const setSize = () => {
            const width = container.clientWidth || window.innerWidth;
            const height = container.clientHeight || window.innerHeight;
            renderer.setSize(width, height, false);
        };
        setSize();
        window.addEventListener('resize', setSize);

        const clock = new THREE.Clock();
        const renderLoop = () => {
            const delta = clock.getDelta();
            uniforms.uTime.value += 0.25 * delta;
            renderer.render(scene, camera);
            requestAnimationFrame(renderLoop);
        };
        renderLoop();
    };
})();
