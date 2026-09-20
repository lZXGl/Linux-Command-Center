/**
 * Dynamic Background Shader Switcher Engine (Port 6999 Sandbox)
 * Switches seamlessly between Silk, FloatingLines, MoltenMetal, Plasma, PrismaticBurst, LiquidEther, MatrixRain, or Dark Minimal.
 */
(function() {
    window.setBgShader = function(shaderName, isInitial = false) {
        localStorage.setItem('bg_shader', shaderName);

        // Cancel matrix rain if active
        if (window._matrixRainCancel) {
            window._matrixRainCancel();
            window._matrixRainCancel = null;
        }

        // Cancel existing WebGL / requestAnimationFrame loops if needed
        if (window._currentBgCancel) {
            try { window._currentBgCancel(); } catch(e) {}
            window._currentBgCancel = null;
        }

        // Remove any canvas containers
        const canvasIds = [
            'bg-shader-canvas',
            'silk-canvas',
            'floating-lines-canvas',
            'liquid-ether-canvas',
            'matrix-rain-canvas',
            'molten-metal-canvas',
            'plasma-canvas',
            'prismatic-canvas',
            'prismatic-burst-canvas'
        ];
        canvasIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });

        if (shaderName === 'silk' && window.initSilk) {
            window.initSilk();
        } else if (shaderName === 'floating_lines' && window.initFloatingLines) {
            window.initFloatingLines();
        } else if (shaderName === 'molten_metal' && window.initMoltenMetal) {
            window.initMoltenMetal();
        } else if (shaderName === 'plasma' && window.initPlasma) {
            window.initPlasma();
        } else if (shaderName === 'prismatic_burst' && window.initPrismaticBurst) {
            window.initPrismaticBurst();
        } else if (shaderName === 'liquid_ether' && window.initLiquidEther) {
            window.initLiquidEther();
        } else if (shaderName === 'matrix_rain' && window.initMatrixRain) {
            window.initMatrixRain();
        }

        // ONLY show toast if manually switched by user, NOT on initial page refresh!
        if (!isInitial && typeof showToast === 'function') {
            const readableName = shaderName.replace(/_/g, ' ').toUpperCase();
            showToast(`Background Shader set to ${readableName}`, 'info', 2000);
        }
    };

    function initDefaultShader() {
        const savedShader = localStorage.getItem('bg_shader') || 'silk';
        setTimeout(() => {
            window.setBgShader(savedShader, true);
        }, 150);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDefaultShader);
    } else {
        initDefaultShader();
    }
})();
