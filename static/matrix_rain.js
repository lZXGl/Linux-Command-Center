/**
 * Matrix Rain Background Component for Vanilla JS (Port 6999 Sandbox)
 * Renders glowing digital code rain.
 */
(function() {
    window.initMatrixRain = function() {
        const oldCanvas = document.getElementById('bg-shader-canvas');
        if (oldCanvas) oldCanvas.remove();

        const canvas = document.createElement('canvas');
        canvas.id = 'bg-shader-canvas';
        canvas.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:none; z-index:-1; overflow:hidden; opacity:0.85;';
        document.body.prepend(canvas);

        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*آبتثجحخدذرزسشصضطظعغفقكلمنهوي';
        const fontSize = 14;
        let columns = Math.floor(width / fontSize);
        let drops = Array(columns).fill(1);

        const resize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            columns = Math.floor(width / fontSize);
            drops = Array(columns).fill(1);
        };
        window.addEventListener('resize', resize);

        let animationFrame;
        const draw = () => {
            ctx.fillStyle = 'rgba(3, 7, 18, 0.1)';
            ctx.fillRect(0, 0, width, height);

            ctx.fillStyle = '#00f2fe';
            ctx.font = fontSize + 'px monospace';

            for (let i = 0; i < drops.length; i++) {
                const text = chars[Math.floor(Math.random() * chars.length)];
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                if (drops[i] * fontSize > height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
            animationFrame = requestAnimationFrame(draw);
        };
        draw();

        window._matrixRainCancel = () => {
            cancelAnimationFrame(animationFrame);
            window.removeEventListener('resize', resize);
        };
    };
})();
