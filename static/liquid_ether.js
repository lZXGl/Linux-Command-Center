/**
 * LiquidEther Background Component for Vanilla JS + Three.js (Port 6999 Sandbox)
 * Renders glowing fluid dynamics simulation.
 */
(function() {
    window.initLiquidEther = function() {
        const oldCanvas = document.getElementById('bg-shader-canvas') || document.getElementById('liquid-ether-canvas');
        if (oldCanvas) oldCanvas.remove();

        const container = document.createElement('div');
        container.id = 'liquid-ether-canvas';
        container.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:auto; z-index:-1; overflow:hidden;';
        document.body.prepend(container);

        const vertexShader = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
        `;

        const fragmentShader = `
        uniform float iTime;
        uniform vec2 iResolution;
        uniform vec2 iMouse;
        varying vec2 vUv;

        void main() {
          vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
          vec2 mouse = (iMouse - 0.5 * iResolution.xy) / iResolution.y;
          
          float d = length(uv - mouse);
          float force = smoothstep(0.4, 0.0, d);

          float t = iTime * 0.5;
          vec3 col1 = vec3(0.32, 0.15, 1.0); // Neon Violet
          vec3 col2 = vec3(1.0, 0.62, 0.98); // Neon Pink
          vec3 col3 = vec3(0.0, 0.95, 0.99); // Neon Cyan

          float wave1 = sin(uv.x * 4.0 + t + force * 2.0) * cos(uv.y * 4.0 + t);
          float wave2 = cos(uv.x * 6.0 - t) * sin(uv.y * 6.0 + t + force);

          vec3 finalColor = mix(col1, col2, wave1 * 0.5 + 0.5);
          finalColor = mix(finalColor, col3, wave2 * 0.5 + 0.5);

          finalColor += vec3(force * 0.3);
          gl_FragColor = vec4(finalColor * 0.7, 1.0);
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

        const uniforms = {
            iTime: { value: 0 },
            iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            iMouse: { value: new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2) }
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
            uniforms.iResolution.value.set(width, height);
        };
        setSize();
        window.addEventListener('resize', setSize);

        window.addEventListener('mousemove', (e) => {
            uniforms.iMouse.value.set(e.clientX, window.innerHeight - e.clientY);
        });

        const clock = new THREE.Clock();
        const renderLoop = () => {
            uniforms.iTime.value = clock.getElapsedTime();
            renderer.render(scene, camera);
            requestAnimationFrame(renderLoop);
        };
        renderLoop();
    };
})();
