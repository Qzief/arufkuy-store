/**
 * Theme Engine - Holiday Themes with Particle Effects
 * Automatically loads and applies themes based on dates or manual selection
 */

class ThemeEngine {
    constructor(firebaseDb) {
        this.db = firebaseDb;
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.animationFrame = null;
        this.activeTheme = null;
        this.maxParticles = 80;
    }

    async init() {
        await this.loadActiveTheme();
        if (this.activeTheme && this.activeTheme.particle !== 'none') {
            this.setupCanvas();
            this.createParticles();
            this.animate();
        }
        if (this.activeTheme) {
            this.applyColorTheme();
        }
    }

    async loadActiveTheme() {
        try {
            // Check theme mode
            const { getDoc, doc, collection, getDocs, query, where } = await import(
                "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
            );

            const settingsDoc = await getDoc(doc(this.db, "settings", "themeConfig"));
            const autoMode = settingsDoc.exists() ? settingsDoc.data().autoMode : true;

            if (autoMode) {
                // Auto mode: find theme matching current date
                const now = new Date();
                const themesSnapshot = await getDocs(collection(this.db, "themes"));

                themesSnapshot.forEach((themeDoc) => {
                    const data = themeDoc.data();
                    const start = data.startDate?.toDate();
                    const end = data.endDate?.toDate();

                    if (start && end && now >= start && now <= end) {
                        this.activeTheme = { id: themeDoc.id, ...data };
                    }
                });
            } else {
                // Manual mode: get manually activated theme
                const themesSnapshot = await getDocs(
                    query(collection(this.db, "themes"), where("isActive", "==", true))
                );

                if (!themesSnapshot.empty) {
                    const themeDoc = themesSnapshot.docs[0];
                    this.activeTheme = { id: themeDoc.id, ...themeDoc.data() };
                }
            }
        } catch (err) {
            console.error("Error loading theme:", err);
        }
    }

    setupCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'theme-particles';
        this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    `;
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createParticles() {
        const particleType = this.activeTheme.particle;

        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push(this.createParticle(particleType));
        }
    }

    createParticle(type) {
        const particle = {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height - this.canvas.height,
            speed: Math.random() * 2 + 0.5,
            size: Math.random() * 3 + 2,
            opacity: Math.random() * 0.5 + 0.3,
            type
        };

        switch (type) {
            case 'snow':
                particle.drift = Math.random() * 2 - 1;
                break;
            case 'stars':
                particle.twinkle = Math.random() * Math.PI;
                particle.speed = Math.random() * 1 + 0.2;
                break;
            case 'hearts':
                particle.size = Math.random() * 5 + 3;
                particle.drift = Math.random() * 1.5 - 0.75;
                break;
            case 'leaves':
                particle.rotation = Math.random() * Math.PI * 2;
                particle.rotationSpeed = Math.random() * 0.05 - 0.025;
                particle.drift = Math.random() * 3 - 1.5;
                break;
            case 'lanterns':
                particle.size = Math.random() * 6 + 4;
                particle.speed = Math.random() * 0.8 + 0.2;
                particle.drift = Math.random() * 0.5 - 0.25;
                break;
        }

        return particle;
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.particles.forEach((particle, index) => {
            this.updateParticle(particle);
            this.drawParticle(particle);

            // Reset particle if it goes off screen
            if (particle.y > this.canvas.height + 10) {
                this.particles[index] = this.createParticle(particle.type);
            }
        });

        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    updateParticle(particle) {
        particle.y += particle.speed;

        switch (particle.type) {
            case 'snow':
                particle.x += particle.drift;
                break;
            case 'stars':
                particle.twinkle += 0.05;
                particle.opacity = 0.3 + Math.abs(Math.sin(particle.twinkle)) * 0.5;
                break;
            case 'hearts':
            case 'leaves':
            case 'lanterns':
                particle.x += particle.drift;
                if (particle.rotation !== undefined) {
                    particle.rotation += particle.rotationSpeed;
                }
                break;
        }
    }

    drawParticle(particle) {
        this.ctx.save();
        this.ctx.globalAlpha = particle.opacity;
        this.ctx.translate(particle.x, particle.y);

        if (particle.rotation) {
            this.ctx.rotate(particle.rotation);
        }

        const primaryColor = this.activeTheme.primaryColor || '#fff';
        const secondaryColor = this.activeTheme.secondaryColor || '#fff';

        switch (particle.type) {
            case 'snow':
                this.ctx.beginPath();
                this.ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fill();
                break;

            case 'stars':
                this.drawStar(0, 0, particle.size, '#ffd700');
                break;

            case 'hearts':
                this.drawHeart(0, 0, particle.size, '#ff69b4');
                break;

            case 'leaves':
                this.drawLeaf(0, 0, particle.size, '#8B4513');
                break;

            case 'lanterns':
                this.drawLantern(0, 0, particle.size, primaryColor);
                break;
        }

        this.ctx.restore();
    }

    drawStar(x, y, size, color) {
        const spikes = 5;
        const outerRadius = size;
        const innerRadius = size / 2;

        this.ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI) / spikes - Math.PI / 2;
            const px = x + Math.cos(angle) * radius;
            const py = y + Math.sin(angle) * radius;
            i === 0 ? this.ctx.moveTo(px, py) : this.ctx.lineTo(px, py);
        }
        this.ctx.closePath();
        this.ctx.fillStyle = color;
        this.ctx.fill();
    }

    drawHeart(x, y, size, color) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + size / 4);
        this.ctx.bezierCurveTo(x, y, x - size / 2, y - size / 2, x - size, y);
        this.ctx.bezierCurveTo(x - size * 1.5, y + size / 2, x, y + size * 1.5, x, y + size * 2);
        this.ctx.bezierCurveTo(x, y + size * 1.5, x + size * 1.5, y + size / 2, x + size, y);
        this.ctx.bezierCurveTo(x + size / 2, y - size / 2, x, y, x, y + size / 4);
        this.ctx.fillStyle = color;
        this.ctx.fill();
    }

    drawLeaf(x, y, size, color) {
        this.ctx.beginPath();
        this.ctx.ellipse(x, y, size, size * 1.5, 0, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
    }

    drawLantern(x, y, size, color) {
        // Lantern body
        this.ctx.beginPath();
        this.ctx.rect(x - size / 2, y - size, size, size * 1.5);
        this.ctx.fillStyle = color;
        this.ctx.fill();

        // Lantern glow
        const gradient = this.ctx.createRadialGradient(x, y, size / 4, x, y, size);
        gradient.addColorStop(0, color + '80');
        gradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.fill();
    }

    applyColorTheme() {
        const primaryColor = this.activeTheme.primaryColor;
        const secondaryColor = this.activeTheme.secondaryColor;

        if (primaryColor && secondaryColor) {
            document.documentElement.style.setProperty('--theme-primary', primaryColor);
            document.documentElement.style.setProperty('--theme-secondary', secondaryColor);
        }
    }

    destroy() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        if (this.canvas) {
            this.canvas.remove();
        }
        this.particles = [];
    }
}

// Export for use
window.ThemeEngine = ThemeEngine;
